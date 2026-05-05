# BILL_KB_2 — Stripe Webhooks & Subscription State Sync

**Stack: Next.js 15+ App Router · Supabase Postgres · Stripe**

---

## TL;DR

- **Raw body in App Router is `await request.text()`** — no `bodyParser: false` config needed (that was Pages Router). Pass the raw string to `stripe.webhooks.constructEvent()` without touching it.
- **Return 200 fast.** The webhook handler does exactly two things: verify the signature, then call one SECURITY DEFINER RPC that atomically writes to `stripe_events` (dedup) and `outbox` (dispatch). Then 200. All side effects are async in the worker.
- **Idempotency is `stripe_events` with PK on `stripe_event_id`.** `INSERT ... ON CONFLICT DO NOTHING` + `GET DIAGNOSTICS` gives a clean "is this new or a dupe?" signal in one SQL statement.
- **`outbox.aggregate_id` is `uuid` in JOB_KB_1; Stripe event IDs (`evt_xxx`) are not UUIDs.** Recommendation: generate a surrogate UUID for the outbox row and store the original `stripe_event_id` in the payload. This preserves the JOB_KB_1 schema with zero migration. → See Section 6.
- **Subscriptions have exactly 8 statuses.** Grant access for `trialing` and `active` only. `past_due` is handled with a configurable grace period. `canceled` and `incomplete_expired` are terminal — a new subscription must be created.
- **Stripe wins on drift.** Never trust the DB plan over what Stripe returns. A nightly reconciliation job pulls live Stripe state, diffs it, and writes corrections (and outbox rows for downstream effects) for any divergence found.
- **Stripe retries for up to 3 days** in live mode. A 500 from your handler tells Stripe to retry. A 200 tells Stripe you received and accepted the event — return 200 only when the dedup+outbox transaction succeeds.

---

## ALWAYS / NEVER

**ALWAYS**
- Verify the `stripe-signature` header with `stripe.webhooks.constructEvent()` before touching the payload.
- Pass the raw string body (`await request.text()`) to `constructEvent` — never parse and re-serialize.
- Write dedup + outbox in one DB transaction via a single SECURITY DEFINER RPC.
- Return 200 immediately after the RPC succeeds; process all side effects in the outbox worker (→ JOB_KB_1).
- Return 500 (not 200) on DB errors so Stripe retries.
- Pin a specific Stripe `apiVersion` in your client — field paths change across versions.
- Store `stripe_events` payload as `jsonb` for replay and audit.
- Track `cancel_at_period_end` as a separate column — `status` stays `active` until the period ends.

**NEVER**
- Parse the body with `JSON.parse` before signature verification — this mutates the raw string and breaks HMAC validation.
- Call Stripe's API or send emails from inside the webhook handler.
- Return 200 when the DB write fails — doing so permanently discards the event from Stripe's retry queue.
- Trust the subscription `status` or plan in your DB for high-stakes gating without considering Stripe as the source of truth.
- Skip the signature check in development — use `stripe listen --forward-to localhost:3000/api/stripe/webhook` and a real test webhook secret.
- Mix `invoice.payment_succeeded` and `invoice.paid` as dual provisioning triggers without idempotency — use `invoice.paid` as the canonical trigger; `payment_succeeded` is a subset.

---

## Webhook Architecture

```
Stripe servers
     │
     │  POST /api/stripe/webhook
     │  Header: stripe-signature: t=...,v1=...
     │  Body: raw JSON string
     ▼
┌─────────────────────────────────────────────┐
│  app/api/stripe/webhook/route.ts             │
│                                             │
│  1. await request.text()  ← raw body        │
│  2. constructEvent(raw, sig, secret)         │
│     └─ 400 on failure                       │
│  3. supabaseAdmin.rpc('handle_stripe_       │
│     webhook_event', {...})                  │
│     └─ one Postgres transaction:            │
│        a) INSERT stripe_events              │
│           ON CONFLICT DO NOTHING            │
│        b) if duplicate → return early       │
│        c) INSERT outbox row                 │
│     └─ 500 on DB error                      │
│  4. return 200                              │
└─────────────────────────────────────────────┘
          │
          │  (committed outbox row)
          │
          ▼
┌─────────────────────────────────────────────┐
│  Outbox worker  (→ JOB_KB_1)                │
│                                             │
│  claim_outbox_batch (FOR UPDATE SKIP LOCKED)│
│    └─ COMMIT claim                          │
│    └─ process outside transaction:          │
│       • syncSubscriptionToDb                │
│       • markSubscriptionCanceled            │
│       • handleTrialWillEnd → send email     │
│       • handleCheckoutComplete              │
│       • syncInvoicePaid                     │
│       • syncInvoicePaymentFailed            │
│    └─ mark_outbox_processed / failed        │
└─────────────────────────────────────────────┘
```

> **The webhook handler is not a processing pipeline.** It is a durable intake funnel. The only question it answers is: "Did Stripe genuinely send this event, and did we durably record it?" Everything else is the worker's job.

---

## Route Handler

File: `app/api/stripe/webhook/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Pin to a specific API version — field paths change across versions.
// Verify invoice.subscription path against whichever version you pin.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-01-27.acacia',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// Service-role client — bypasses RLS. Used only in this server-side handler.
// Never expose this client to the browser.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(request: NextRequest) {
  // ── 1. Read raw body ──────────────────────────────────────────────────────
  // App Router uses the Web API Request object. request.text() returns the
  // unmodified raw string. No bodyParser config is needed — unlike Pages Router,
  // App Router does NOT auto-parse the body.
  //
  // CRITICAL: Do not call request.json() here. Any JSON.parse / re-stringify
  // of the body changes whitespace or key ordering and invalidates the HMAC
  // signature. The string passed to constructEvent must be byte-for-byte
  // identical to what Stripe sent.
  const rawBody = await request.text();

  // ── 2. Verify signature ───────────────────────────────────────────────────
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return new NextResponse('Missing stripe-signature header', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    // constructEvent throws StripeSignatureVerificationError on failure.
    // Signature includes a timestamp; events older than 300s are rejected
    // by default. Pass a custom tolerance (seconds) as the 4th arg if needed.
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Stripe webhook signature verification failed: ${message}`);
    // 400 tells Stripe the event was malformed — it will NOT retry.
    return new NextResponse(`Webhook error: ${message}`, { status: 400 });
  }

  // ── 3. Dedup + outbox in one atomic transaction ───────────────────────────
  // The SECURITY DEFINER RPC handle_stripe_webhook_event atomically:
  //   a) INSERTs into stripe_events ON CONFLICT DO NOTHING (idempotency guard)
  //   b) If the event is new, INSERTs an outbox row for async processing
  //   c) Returns { is_duplicate: boolean }
  //
  // Running both writes in one RPC call means we never enqueue without
  // recording, and never record without enqueueing — Postgres transaction
  // guarantees atomicity.
  const { data, error } = await supabaseAdmin.rpc('handle_stripe_webhook_event', {
    p_event_id:   event.id,
    p_event_type: event.type,
    p_livemode:   event.livemode,
    p_payload:    event,           // stored as jsonb for audit / replay
    p_created_at: new Date(event.created * 1000).toISOString(),
  });

  if (error) {
    console.error('Stripe webhook: failed to persist event', {
      event_id:   event.id,
      event_type: event.type,
      error,
    });
    // 500 tells Stripe to retry. Do NOT return 200 here — 200 permanently
    // removes this event from Stripe's retry queue even though we failed
    // to record it.
    return new NextResponse('Internal error', { status: 500 });
  }

  if (data?.is_duplicate) {
    // Already processed — 200 stops Stripe from retrying without logging noise.
    return new NextResponse('Duplicate event, skipped', { status: 200 });
  }

  // ── 4. Return 200 ─────────────────────────────────────────────────────────
  // The outbox row was written in step 3. The worker (→ JOB_KB_1) processes it
  // asynchronously. Do not perform subscription lookups, DB updates, email
  // sends, or Stripe API calls in this handler.
  return new NextResponse('Received', { status: 200 });
}
```

### Supporting SECURITY DEFINER RPC

```sql
-- handle_stripe_webhook_event
-- Called exclusively by the webhook route handler via service role.
-- Runs both writes atomically inside a single transaction.
-- Returns { is_duplicate: boolean }.
CREATE OR REPLACE FUNCTION handle_stripe_webhook_event(
  p_event_id   text,
  p_event_type text,
  p_livemode   boolean,
  p_payload    jsonb,
  p_created_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted   int;
  v_outbox_id  uuid := gen_random_uuid();   -- surrogate UUID for outbox row
BEGIN
  -- Step 1: Attempt to record the event (idempotency guard).
  INSERT INTO stripe_events (id, event_type, livemode, payload, stripe_created_at)
  VALUES (p_event_id, p_event_type, p_livemode, p_payload, p_created_at)
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Step 2: If duplicate, return early without touching the outbox.
  IF v_inserted = 0 THEN
    RETURN jsonb_build_object('is_duplicate', true);
  END IF;

  -- Step 3: Enqueue for async processing.
  -- aggregate_id is a surrogate UUID (outbox schema requires uuid).
  -- The original stripe_event_id travels inside the payload.
  -- → See Section 6 for the aggregate_id reconciliation rationale.
  INSERT INTO outbox (
    id,
    aggregate_type,
    aggregate_id,
    event_type,
    payload
  ) VALUES (
    v_outbox_id,
    'stripe_event',
    v_outbox_id,                -- surrogate; worker looks up stripe_event_id from payload
    p_event_type,
    p_payload                   -- full Stripe Event object; payload->>'id' = p_event_id
  );

  RETURN jsonb_build_object('is_duplicate', false);
END;
$$;

-- Least-privilege: only service role may execute this function.
GRANT EXECUTE ON FUNCTION handle_stripe_webhook_event TO service_role;
REVOKE EXECUTE ON FUNCTION handle_stripe_webhook_event FROM authenticated, anon, public;
```

---

## Idempotency Table

`stripe_events` is the single source of truth for "have we seen this Stripe event?" It is separate from the outbox: the outbox tracks worker processing state; this table tracks Stripe delivery dedup.

```sql
-- One row per Stripe event ID. PK is the Stripe-assigned event ID string.
CREATE TABLE stripe_events (
  id                 text        PRIMARY KEY,   -- e.g. "evt_1NirD82eZvKYlo2CIvbtLWuY"
  event_type         text        NOT NULL,      -- e.g. "customer.subscription.updated"
  livemode           boolean     NOT NULL,
  payload            jsonb       NOT NULL,      -- full Stripe Event object; retained for audit + replay
  stripe_created_at  timestamptz NOT NULL,      -- event.created (Unix → timestamptz)
  received_at        timestamptz NOT NULL DEFAULT now(),
  processed_at       timestamptz               -- set by the outbox worker when fully processed
);

-- Supports reconciliation and replay queries: events of a given type within a time window.
CREATE INDEX idx_stripe_events_type_created
  ON stripe_events (event_type, stripe_created_at DESC);

-- Deny all direct access. The webhook handler uses service role via RPC;
-- the outbox worker uses service role directly. No user-facing queries hit this table.
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
-- No permissive policies — service role bypasses RLS entirely.
```

**Why `ON CONFLICT DO NOTHING` not `DO UPDATE`:** A Stripe retry sends the same `event.id`. DO UPDATE would overwrite the original record and clobber `received_at`. DO NOTHING is the correct semantic — the first delivery wins; subsequent deliveries of the same ID are silently discarded after we confirm `ROW_COUNT = 0`.

**Stripe retry behavior (verified 2026-05-04):**
- Live mode: retries for up to **3 days** with exponential backoff.
- Test mode: retries **3 times** over several hours.
- Manual resend: Dashboard (15-day window) or CLI (30-day window).

---

## Outbox Alignment with JOB_KB_1

### The mismatch

JOB_KB_1 defines `outbox.aggregate_id` as `uuid`. Stripe event IDs (`evt_1Nxxx...`) are variable-length strings, not UUIDs. A cast like `p_event_id::uuid` will fail at runtime with a Postgres cast error.

### Recommendation: surrogate UUID + payload lookup

Generate a surrogate UUID at INSERT time for the outbox row's `aggregate_id`. The original Stripe event ID travels inside `payload->>'id'` (it is already there — the full Stripe Event object is stored in `payload`).

This approach:
- Leaves the JOB_KB_1 outbox schema **unchanged** — no migration required.
- Does not require a separate stripe-specific outbox table.
- Lets the worker locate the corresponding `stripe_events` row via `payload->>'id'` when needed (e.g., to mark `processed_at`).

```sql
-- In handle_stripe_webhook_event (shown above):
v_outbox_id uuid := gen_random_uuid();

INSERT INTO outbox (id, aggregate_type, aggregate_id, event_type, payload)
VALUES (
  v_outbox_id,
  'stripe_event',
  v_outbox_id,      -- surrogate; same value used for id and aggregate_id
  p_event_type,
  p_payload         -- payload->>'id' = stripe event ID for cross-reference
);
```

If you later need to find the outbox row for a given Stripe event ID, add a functional index:

```sql
-- Optional: supports fast lookup by Stripe event ID from the outbox
CREATE INDEX idx_outbox_stripe_event_id
  ON outbox ((payload->>'id'))
  WHERE aggregate_type = 'stripe_event';
```

### Worker routing (extends JOB_KB_1's `processRow`)

```typescript
// Inside the outbox worker's processRow switch — extends JOB_KB_1
// row.event_type is the Stripe event type string stored at outbox INSERT time.
// row.payload is the full Stripe.Event object.

case 'customer.subscription.created':
case 'customer.subscription.updated':
  await syncSubscriptionToDb(
    row.payload as Stripe.CustomerSubscriptionCreatedEvent
    | Stripe.CustomerSubscriptionUpdatedEvent
  );
  break;

case 'customer.subscription.deleted':
  await markSubscriptionCanceled(
    row.payload as Stripe.CustomerSubscriptionDeletedEvent
  );
  break;

case 'customer.subscription.trial_will_end':
  await handleTrialWillEnd(
    row.payload as Stripe.CustomerSubscriptionTrialWillEndEvent
  );
  break;

case 'invoice.paid':
  await syncInvoicePaid(row.payload as Stripe.InvoicePaidEvent);
  break;

case 'invoice.payment_failed':
  await syncInvoicePaymentFailed(
    row.payload as Stripe.InvoicePaymentFailedEvent
  );
  break;

case 'checkout.session.completed':
  await handleCheckoutComplete(
    row.payload as Stripe.CheckoutSessionCompletedEvent
  );
  break;

default:
  // Stripe introduces new event types without warning. Log and mark processed
  // rather than dead-lettering — unknown event types are not retryable errors.
  console.warn(`Unhandled Stripe event type: ${row.event_type}`, {
    outbox_id: row.id,
  });
  break;
```

> Every handler must be idempotent. Use `INSERT ... ON CONFLICT DO UPDATE` or `UPDATE ... WHERE` with deterministic conditions rather than blind INSERTs. The outbox worker guarantees at-least-once delivery. → JOB_KB_1 for full at-least-once semantics and `Idempotency-Key` usage.

---

## Subscription State Machine

All 8 statuses verified against the Stripe API docs (2026-05-04).

| Status | Meaning | Access granted? | DB action |
|---|---|---|---|
| `trialing` | In trial period; subscription is running | **YES** | Set `status = 'trialing'`, `plan = <price_id>` |
| `active` | Paid and current | **YES** | Set `status = 'active'` |
| `past_due` | Payment failed; Smart Retries in progress | Conditional — grace period (see below) | Set `status = 'past_due'`; start dunning flow |
| `incomplete` | First invoice payment failed (`charge_automatically`); 23-hour window to pay | **NO** (or limited) | Set `status = 'incomplete'` |
| `incomplete_expired` | First invoice unpaid after 23 hours **(terminal)** | **NO** | Set `status = 'incomplete_expired'`, clear plan |
| `unpaid` | All Smart Retries exhausted; no further invoices attempted | **NO** | Set `status = 'unpaid'`; treat as canceled for access |
| `canceled` | Subscription ended **(terminal)** | **NO** | Set `status = 'canceled'`, set `plan = 'free'` or `null` |
| `paused` | Trial ended, no payment method, `missing_payment_method` behavior = `pause` | **NO** | Set `status = 'paused'`; prompt user to add payment method |

**Access grant rule:** Grant product access when `status IN ('trialing', 'active')`. Revoke on any other status.

**`past_due` grace period:** Smart Retries may continue for several days. A common pattern is to keep access during the Smart Retry window, show a warning banner immediately, and revoke only if the subscription eventually moves to `unpaid` or `canceled`. The DB `status` column must reflect `past_due` accurately so the application layer can implement this rule. Exact UX is deferred → BILL_KB_4.

**Terminal statuses:** `canceled` and `incomplete_expired`. These cannot be reactivated. A new subscription must be created. Do not attempt to resume them in the worker.

**`cancel_at_period_end` is not a status.** When a user cancels but the subscription runs to the end of the billing period, Stripe sets `cancel_at_period_end = true` but `status` stays `active`. The `customer.subscription.deleted` event fires only when the period ends. Store `cancel_at_period_end` as a separate boolean column so the UI can display "Cancels on [date]" without revoking access prematurely.

### Status transition diagram

```
New charge_automatically subscription:

  ┌─────────────────────────────────────────────────────────────┐
  │                    (first invoice fails)                     │
  │                          ▼                                  │
  │                    [ incomplete ]                           │
  │                          │                                  │
  │             ┌────────────┴────────────┐                     │
  │    23h pay  │                    23h expires                │
  │             ▼                         ▼                     │
  │          active              [ incomplete_expired ]         │
  │                                   (terminal)                │
  └─────────────────────────────────────────────────────────────┘

Ongoing subscription lifecycle:

  [ trialing ] ─────────────────────────────────────────────────►
                    trial ends + payment succeeds                │
                                                                 ▼
  [ paused ] ◄─── trial ends, no payment method ──────────── [ active ]
      │                                                          │
      │ adds payment method                                      │ payment fails
      └─────────────────────────────────────────────────────────►│
                                                                 ▼
                                                           [ past_due ]
                                                                 │
                                                    ┌────────────┴────────────┐
                                             retries succeed          retries exhausted
                                                     │                         │
                                                     ▼                         ▼
                                                 [ active ]               [ unpaid ]
                                                     │
                                              cancel action
                                                     │
                                                     ▼
                                               [ canceled ]
                                               (terminal)
```

---

## Event-Handling Matrix

All event type strings verified against Stripe API docs (2026-05-04).

| Stripe Event | Fires When | DB Tables Touched | Outbox Dispatch? | Notes |
|---|---|---|---|---|
| `customer.subscription.created` | New subscription created (including trial start) | `subscriptions` (upsert), `customers` (ensure row) | YES | Upsert the full subscription object; do not INSERT-only — created and updated share the same handler logic |
| `customer.subscription.updated` | Any field change: plan, status, period, `cancel_at_period_end`, trial dates | `subscriptions` (upsert full row) | YES | Catches renewals, upgrades, downgrades, `cancel_at_period_end` flips. Always write the full object, not just changed fields |
| `customer.subscription.deleted` | Subscription canceled immediately or at period end | `subscriptions` (set `status = 'canceled'`, revoke access) | YES — revoke access, optionally trigger cancellation email | "deleted" is Stripe's term for canceled. This fires when the subscription period ends, not when `cancel_at_period_end` is set |
| `customer.subscription.trial_will_end` | 3 days before trial end (or immediately if trial < 3 days) | `subscriptions` (update `trial_will_end_notified_at`) | YES — trigger conversion/dunning email via outbox | Fire-once from Stripe per trial; use `trial_will_end_notified_at` to prevent duplicate emails on worker retry |
| `customer.subscription.paused` | Subscription transitions to `paused` | `subscriptions` (set `status = 'paused'`) | YES — prompt user to add payment method | |
| `customer.subscription.resumed` | Paused subscription resumes (user added payment method) | `subscriptions` (set `status = 'active'`) | YES | Uncommon; treat like `subscription.updated` |
| `invoice.paid` | Invoice payment succeeds OR marked paid out-of-band | `invoices` (upsert), `subscriptions` (confirm `status = 'active'`) | Conditional — only if provisioning state changed | **Canonical provisioning trigger.** Superset of `payment_succeeded` — includes out-of-band payments. Prefer this over `invoice.payment_succeeded` for all provisioning logic |
| `invoice.payment_succeeded` | Invoice payment attempt succeeds | `invoices` (upsert) | NO — covered by `invoice.paid` | Valid event type but redundant for provisioning. If you subscribe to both, ensure the worker's idempotent upsert handles the duplicate write safely |
| `invoice.payment_failed` | Invoice payment attempt fails | `invoices` (mark failed), `subscriptions` (update `status` if changed) | YES — trigger dunning email | Subscription may move to `past_due` (renewal) or `incomplete` (first invoice). Read `event.data.object.billing_reason` to distinguish |
| `checkout.session.completed` | Checkout Session successfully completed | `customers` (link `stripe_customer_id` to internal user), `subscriptions` (initial upsert if `mode = 'subscription'`) | YES | Key linkage event. Use `metadata.user_id` or `client_reference_id` to associate the Stripe customer with your internal user record. Only process `mode = 'subscription'` for billing |

### `checkout.session.completed` mode handling

```typescript
// Inside handleCheckoutComplete — only process subscription mode
const session = event.data.object as Stripe.CheckoutSession;

if (session.mode !== 'subscription') {
  // mode='payment' or mode='setup' — not a subscription event
  return;
}

// Link stripe_customer_id to internal user
const userId = session.metadata?.user_id ?? session.client_reference_id;
if (!userId) throw new Error('checkout.session.completed missing user_id');

await supabaseAdmin
  .from('customers')
  .upsert({
    user_id:            userId,
    stripe_customer_id: session.customer as string,
    updated_at:         new Date().toISOString(),
  }, { onConflict: 'user_id' });

// Subscription row will be created/confirmed by customer.subscription.created
// arriving in the same batch. Use subscription.id from session if you need
// to pre-create the row here.
```

### Key payload fields

**`customer.subscription.created/updated/deleted`** — `event.data.object` is `Stripe.Subscription`:

```
id                       // sub_xxx
customer                 // cus_xxx
status                   // one of the 8 statuses above
current_period_start     // Unix timestamp
current_period_end       // Unix timestamp
cancel_at_period_end     // boolean
trial_start              // Unix timestamp | null
trial_end                // Unix timestamp | null
items.data[0].price.id   // price_xxx — the subscribed price
default_payment_method   // pm_xxx | null
```

**`invoice.paid` / `invoice.payment_failed`** — `event.data.object` is `Stripe.Invoice`:

```
id                            // in_xxx
customer                      // cus_xxx
subscription                  // sub_xxx | null
  // [VERIFY] In Stripe API 2025-xx+ this field may be at:
  // parent.subscription_details.subscription
  // Confirm against your pinned apiVersion before shipping.
status                        // 'draft' | 'open' | 'paid' | 'uncollectible' | 'void'
paid                          // boolean
amount_paid                   // integer (cents)
billing_reason                // 'subscription_create' | 'subscription_cycle' | 'subscription_update' | ...
hosted_invoice_url            // string | null
```

> **`invoice.subscription` field path:** The `subscription` field on the Invoice object changed position in recent Stripe API versions. In older versions it was a top-level field (`invoice.subscription`). In API versions `2025-xx+` it may be nested at `invoice.parent.subscription_details.subscription`. **[VERIFY BEFORE SHIPPING]** — check against the exact `apiVersion` string you pin in your Stripe client.

---

## Reconciliation Job

### Purpose

Webhooks can be missed if your endpoint has downtime that outlasts Stripe's 3-day retry window, or if events arrive out of order. A nightly reconciliation job pulls Stripe's authoritative state and repairs drift.

**Stripe wins.** If your DB and Stripe ever disagree, Stripe is correct.

```typescript
// supabase/functions/stripe-reconcile/index.ts
// Scheduled via pg_cron → net.http_post (→ JOB_KB_2 for scheduling details)

import Stripe from 'stripe';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2025-01-27.acacia',
});

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (_req) => {
  // 1. Fetch all non-terminal subscriptions from DB
  const { data: dbSubs, error } = await supabaseAdmin
    .from('subscriptions')
    .select('id, stripe_subscription_id, status, plan, current_period_end')
    .not('status', 'in', '("canceled","incomplete_expired")')
    .not('stripe_subscription_id', 'is', null);

  if (error) throw error;

  const results = { checked: 0, drifted: 0, errors: 0 };

  for (const dbSub of dbSubs ?? []) {
    try {
      // 2. Fetch authoritative Stripe state
      // [VERIFY BEFORE SHIPPING] For >500 active subscriptions, switch from
      // per-sub retrieve() calls to stripe.subscriptions.list() with pagination
      // to stay within Stripe's 100 reads/second rate limit.
      const stripeSub = await stripe.subscriptions.retrieve(
        dbSub.stripe_subscription_id,
      );

      // 3. Detect drift — Stripe wins on any discrepancy
      const statusDrifted = stripeSub.status !== dbSub.status;
      const planDrifted   = stripeSub.items.data[0]?.price?.id !== dbSub.plan;

      if (statusDrifted || planDrifted) {
        results.drifted++;
        console.warn('Subscription drift detected', {
          subscription_id:       dbSub.id,
          db_status:             dbSub.status,
          stripe_status:         stripeSub.status,
          db_plan:               dbSub.plan,
          stripe_plan:           stripeSub.items.data[0]?.price?.id,
        });

        // 4. Write corrected state — Stripe is authoritative
        await supabaseAdmin
          .from('subscriptions')
          .update({
            status:               stripeSub.status,
            current_period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
            current_period_end:   new Date(stripeSub.current_period_end   * 1000).toISOString(),
            cancel_at_period_end: stripeSub.cancel_at_period_end,
            updated_at:           new Date().toISOString(),
          })
          .eq('id', dbSub.id);

        // 5. Dispatch an outbox row so downstream effects run
        // (e.g., if status changed active → canceled, access must be revoked)
        await supabaseAdmin
          .from('outbox')
          .insert({
            aggregate_type: 'stripe_reconcile',
            aggregate_id:   dbSub.id,   // internal subscription UUID — valid uuid
            event_type:     'subscription.reconciliation_sync',
            payload: {
              subscription_id:        dbSub.id,
              stripe_subscription_id: dbSub.stripe_subscription_id,
              previous_status:        dbSub.status,
              new_status:             stripeSub.status,
            },
          });
      }

      results.checked++;
    } catch (err) {
      results.errors++;
      console.error('Reconcile error', { subscription_id: dbSub.id, err });
    }
  }

  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

### Schedule (→ JOB_KB_2 for full scheduling guidance)

```sql
-- Nightly at 2:00 AM UTC via pg_cron → net.http_post → Supabase Edge Function
-- Credentials read from Supabase Vault — never embed literals in cron body SQL.
SELECT cron.schedule(
  'stripe-reconcile-nightly',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := (
      SELECT decrypted_secret FROM vault.decrypted_secrets
      WHERE name = 'project_url'
    ) || '/functions/v1/stripe-reconcile',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'service_role_key'
      )
    ),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 300000   -- 5 minutes; tune for subscriber count
  );
  $$
);
```

> For subscriber counts above ~500, replace per-sub `stripe.subscriptions.retrieve()` calls with paginated `stripe.subscriptions.list()` calls to stay within Stripe's 100 reads/second rate limit.

---

## Pitfalls

**Parsing the body before signature verification breaks HMAC.**
`JSON.parse(rawBody)` followed by `JSON.stringify(parsed)` changes whitespace and key ordering. The resulting string does not match the HMAC Stripe computed over the original bytes. Always pass `rawBody` (the string from `request.text()`) directly to `constructEvent`. Never intermediate through a JSON parse/re-serialize cycle.

**Doing side effects in the webhook handler.**
Sending an email, calling the Stripe API, or updating the `subscriptions` table synchronously in the handler means your 200 is delayed by that work. Stripe has a response timeout. Slow handlers cause timeouts, Stripe retries the event, and you process it twice. The handler's only job is dedup + outbox. Side effects belong in the worker.

**Returning 200 on a DB error.**
If the RPC call fails and you return 200, Stripe marks the event as delivered and stops retrying — permanently. Return 500 on DB errors so Stripe retries. The `stripe_events` dedup table protects against double-processing when the retry arrives.

**Trusting the DB plan over Stripe.**
Your DB is a cache of Stripe's state. Network partitions, missed webhooks, or out-of-order delivery can cause drift. Never use `subscriptions.plan` or `subscriptions.status` as the authoritative source for high-stakes operations without considering the reconciliation gap. For the highest-stakes gates, re-verify against Stripe's API directly.

**Dropping events on 500 — Stripe retries for 3 days.**
A 500 from your handler tells Stripe the event was not processed. Stripe retries with exponential backoff for up to 3 days in live mode. If your endpoint comes back up within that window, Stripe will re-deliver. The `stripe_events` dedup table handles these retries — the worker will skip the duplicate outbox insertion if the RPC returns `is_duplicate: true`.

**`Stripe-Signature` timestamp tolerance.**
`constructEvent` rejects events older than 300 seconds (5 minutes) by default. If your server's system clock drifts, or if there is a long-lived request queue, valid signatures may be rejected. Ensure NTP sync. Pass a custom tolerance as the 4th argument if needed: `stripe.webhooks.constructEvent(body, sig, secret, 600)`.

**Forgetting to register events in the Stripe Dashboard.**
Stripe only sends webhook events that are explicitly registered for your endpoint URL. The events in the matrix above must all be added to your endpoint's event subscription list. Test mode and live mode use separate endpoint registrations and separate webhook secrets.

**`cancel_at_period_end` is not a status change.**
Setting `cancel_at_period_end = true` fires a `customer.subscription.updated` event with `status` still `active`. Access should not be revoked at this point — it continues until the period ends and `customer.subscription.deleted` fires. Track `cancel_at_period_end` as its own column; do not infer it from `status`.

---

## When to Outgrow This

This pattern (webhook → dedup → outbox → worker) handles most SaaS billing scenarios well. Consider alternatives when:

- **Subscriber count exceeds ~10,000 active subscriptions.** The nightly reconciliation job iterates all non-terminal subscriptions. At scale, switch to Stripe's [event-based reconciliation](https://docs.stripe.com/billing/subscriptions/webhooks) using the Events API with cursor-based pagination, or use Stripe's Sigma data exports.

- **You need event replay.** The `stripe_events` table retains the full payload for replay, but replaying means reinserting into the outbox manually. For high-volume replay needs (e.g., backfilling a new side-effect), consider a dedicated replay job that reads from `stripe_events WHERE processed_at IS NULL` or re-processes a date range.

- **You need sub-second latency for access provisioning.** The outbox worker runs on a poll interval (→ JOB_KB_2). If your product requires access to be granted within seconds of checkout, evaluate Stripe's [thin client SDK + server-side confirmation](https://docs.stripe.com/payments/checkout) patterns or a direct synchronous write in `checkout.session.completed` in addition to the outbox path.

- **Stripe introduces webhooks V2 / event destinations.** Stripe is building a new event delivery system (Event Destinations, in beta as of 2026). When stable, it may offer at-least-once guarantees at the Stripe side, reducing the need for your own dedup table. Re-evaluate at that point.

---

## Cross-References

- **BILL_KB_1** — schema for `subscriptions`, `customers`, `invoices`, and billing column definitions. All schema details are deferred there; this KB assumes those tables exist.
- **BILL_KB_3** — JWT plan claims, RLS policy gating, and server-side access enforcement using the subscription state this KB syncs.
- **BILL_KB_4** — customer portal UX, trial conversion flows, `past_due` grace period UX, and dunning copy. The `trial_will_end` outbox dispatch from this KB feeds those flows.
- **JOB_KB_1** — outbox worker full implementation: claim SQL, retry/backoff, dead-letter, lease expiry, and idempotency key patterns for external calls.
- **JOB_KB_2** — scheduled jobs: pg_cron setup, Vault-based credential injection, and sub-minute scheduling notes. The reconciliation job schedule above uses these patterns.
- **SB_KB_6** — submit-to-reveal (outbox producer pattern): the conceptual foundation for atomic business-write + outbox INSERT in one transaction, which this KB applies to Stripe webhook intake.
