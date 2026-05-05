# BILL_KB_4 — Customer Lifecycle: Portal, Trials, Cancellation, Dunning

**Stack-locked: Stripe Billing + Next.js App Router + Supabase. Lifecycle concepts are portable.**

---

## TL;DR

- **Customer Portal is the default self-service UI** — create a session with `stripe.billingPortal.sessions.create({ customer, return_url })` from a Server Action or Route Handler and redirect immediately. Sessions expire in 5 minutes idle / 1 hour active; never cache the URL.
- **Trial timing is verified**: `customer.subscription.trial_will_end` fires exactly **3 days before** `trial_end` — or immediately on creation if the trial is shorter than 3 days. Handle this event to send a Resend reminder and surface an in-app banner.
- **Cancel at period end is the UX-friendly default** — set `cancel_at_period_end: true`; access continues through the paid period. Immediate cancellation cuts access at once and cannot be undone.
- **Dunning is dashboard-configured** — Smart Retries default to 8 attempts over 2 weeks. Mirror `past_due` / `unpaid` / `canceled` status into your DB on every `customer.subscription.updated` event and gate access accordingly.
- **Never hard-delete a Stripe customer immediately on account deletion** — retain the record for the refund/chargeback window (90–120 days) and schedule delayed deletion via a background job.
- **Re-authenticate before destructive billing operations** — cancellation, downgrade, and payment method removal all warrant a `requireRecentAuth()` gate before touching Stripe.
- **Webhook mechanics and schema live elsewhere** — all event dispatch and idempotency patterns are in `→ BILL_KB_2`; the full DB schema is in `→ BILL_KB_1`.

---

## ALWAYS / NEVER

**ALWAYS**
- Create portal sessions on-demand per request — never store or email the `session.url` directly.
- Sync `subscriptions.status` from webhook events; never derive trial/payment state client-side.
- Set `cancel_at_period_end: true` (not immediate) as the default cancellation path for user-initiated requests.
- Retain the Stripe customer record for the full refund/chargeback window after account deletion.
- Require `requireRecentAuth()` before cancel, downgrade, or payment method removal.
- Handle `customer.subscription.trial_will_end` in your webhook dispatcher — failing to do so means no trial-ending reminder ever fires.
- Write `trial_ending_notification_sent_at` to the DB when the reminder fires so the event is idempotent on replay.

**NEVER**
- Never iframe the Customer Portal — Stripe explicitly blocks this; use a full redirect.
- Never call `stripe.customers.del()` during account deletion — do it only after the retention window, from a scheduled background job.
- Never use the preview Trial Offer API (`Stripe-Version: 2026-03-25.preview`) expecting to extend a trial after creation — that API explicitly does not support post-creation trial modification.
- Never treat `status === 'canceled'` as recoverable — a canceled subscription cannot be reactivated; create a new one.
- Never spam users with your own dunning emails on every retry — let Stripe Smart Retries run; send your email only on status transitions (`past_due`, `unpaid`, `canceled`).
- Never skip ownership verification before billing mutations — confirm the subscription row belongs to the authenticated user before calling the Stripe API.

---

## Customer Portal — the Default Self-Service UI

### When to use / when custom UI is justified

The Customer Portal handles the vast majority of self-service billing needs: plan switching, payment method updates, cancellation, invoice history, billing address, and tax ID. Use it unless:

- You need a custom plan selection experience (pricing page with marketing copy, feature comparison table).
- You need to gate plan options by organization type or entitlement not expressible in the portal configuration.
- You need to collect additional information alongside the upgrade (e.g., team size, use case).

For those cases, use `stripe.subscriptions.update()` directly (see Upgrade / Downgrade below) as an escape hatch. The portal remains the default; custom UI is an exception to document in `KB_1_Architecture.md`.

### Dashboard setup checklist

Before the portal is usable, configure it once in **Settings → Billing → Customer portal**:

- [ ] Enable the portal
- [ ] Subscription cancellation (choose: immediate, or at-period-end only)
- [ ] Subscription plan switching — add each price the customer can switch to (up to 10 per configuration)
- [ ] Payment method updates
- [ ] Invoice history (viewing and PDF download)
- [ ] Billing information / tax ID updates
- [ ] Cancellation deflection (optional: offer coupon, collect reason)
- [ ] Branding: logo, colors, business name
- [ ] Register allowed return URLs

Advanced: multiple portal **configurations** can be created via `stripe.billingPortal.configurations.create()` to give different customer segments different feature sets (e.g., an enterprise configuration that disables self-serve cancellation).

### Server Action: create a portal session

```typescript
// actions/billing.ts
'use server'
import Stripe from 'stripe'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function openBillingPortal() {
  const supabase = await createClient()
  const { data: { claims } } = await supabase.auth.getClaims()
  if (!claims) throw new Error('Unauthorized')

  // Fetch the Stripe customer ID — see BILL_KB_1 for schema
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', claims.sub)   // or org_id for multi-tenant
    .single()

  if (!sub?.stripe_customer_id) throw new Error('No billing account found')

  // POST /v1/billing_portal/sessions
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
    // Optional: lock to a specific configuration
    // configuration: 'bpc_xxx',
    // Optional: deep-link into a specific flow
    // flow_data: { type: 'subscription_cancel', subscription_cancel: { subscription: 'sub_xxx' } },
  })

  // Redirect immediately — session.url is short-lived
  redirect(session.url)
}
```

As a Route Handler (`app/api/billing/portal/route.ts`), swap the Server Action wrapper for a `POST` handler and return `Response.redirect(session.url)`.

### Session expiry — always create on demand

Portal sessions expire after **5 minutes of inactivity** or **1 hour of total use**. This means:

- Never store `session.url` in a database column.
- Never include `session.url` directly in an email link — it will be expired by the time most users click it. Send users to a page in your app that creates a fresh session on click.
- Always call `billingPortal.sessions.create()` at request time, immediately before the redirect.

> **The portal cannot be displayed in an iframe.** Stripe's CSP blocks framing. The session URL must be a full top-level redirect.

---

## Upgrade / Downgrade

### Via Customer Portal (default)

Enable "Subscription plan switching" in the portal dashboard configuration and add the eligible prices. Stripe handles proration automatically. No custom code required beyond the portal session creation above.

### Via API (custom UI — escape hatch)

When a custom plan selection UI is needed, use `stripe.subscriptions.update()`:

```typescript
// Upgrade or downgrade — API path
const updated = await stripe.subscriptions.update(subscriptionId, {
  items: [{
    id: existingSubscriptionItemId,   // the item being replaced
    price: newPriceId,
  }],
  proration_behavior: 'create_prorations',
})
```

**`proration_behavior` enum** (verified from Stripe API reference):

| Value | Behavior |
|---|---|
| `create_prorations` | Creates proration invoice items billed at next cycle. **Default.** |
| `always_invoice` | Immediately creates and finalizes a proration invoice. Customer charged at once. |
| `none` | No proration. New price applies from the next billing cycle only. |

Ownership check: always verify the subscription belongs to the authenticated user before calling this API. Load the `stripe_subscription_id` from your DB filtered by `user_id` / `org_id`.

### Webhook sync after plan changes

`customer.subscription.updated` fires on any subscription change — plan switch, status change, `cancel_at_period_end` toggle, trial-to-active transition. Check `event.data.previous_attributes` to determine what changed, then sync your `subscriptions` table.

`→ see BILL_KB_2` for the full webhook dispatch and idempotency pattern.

---

## Cancellation

### End-of-period cancellation (recommended)

```typescript
// Service continues until current period end; status stays 'active' until then
const subscription = await stripe.subscriptions.update(subscriptionId, {
  cancel_at_period_end: true,
})
// subscription.cancel_at is now set to the period-end timestamp
// subscription.status remains 'active'

// To undo before period end (reactivation):
await stripe.subscriptions.update(subscriptionId, {
  cancel_at_period_end: false,
})
```

**Webhook event sequence for `cancel_at_period_end: true`:**
1. `customer.subscription.updated` — fires immediately. `subscription.cancel_at_period_end === true` and `subscription.cancel_at` holds the end timestamp. Update your DB and show a "your subscription ends on X" banner.
2. `customer.subscription.deleted` — fires when the period actually ends and Stripe executes the cancellation. Update DB to `status = 'canceled'`, gate access off.

End-of-period is the default recommendation: it preserves the paid access the user has already paid for, reduces refund requests, and gives users a window to reconsider.

### Immediate cancellation

```typescript
// Cuts access immediately; no automatic refund generated
const subscription = await stripe.subscriptions.cancel(subscriptionId)
// subscription.status === 'canceled'
```

> **Once `status === 'canceled'`, the subscription cannot be reactivated.** You must create a new subscription. Reserve immediate cancellation for admin-initiated actions or regulatory requirements — do not expose it as the primary cancellation path for users.

Additional caveats (verified):
- Open draft invoices have `auto_advance` set to `false` on cancellation — automatic collection pauses.
- Pending metered usage items may still bill unless cleared with `clear_usage` before canceling.

`→ see BILL_KB_2` for the webhook dispatch pattern on `customer.subscription.deleted`.

---

## Trials

This is the most operationally complex part of the billing lifecycle. Read this section in full before implementing trials.

### Two creation paths

**Path 1: `trial_period_days`** (relative — simplest)

```typescript
const subscription = await stripe.subscriptions.create({
  customer: stripeCustomerId,
  items: [{ price: priceId }],
  trial_period_days: 14,
  // subscription.status === 'trialing'
  // subscription.trial_end === Unix timestamp 14 days from now
})
```

**Path 2: `trial_end`** (absolute Unix timestamp)

```typescript
const trialEndTs = Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60

const subscription = await stripe.subscriptions.create({
  customer: stripeCustomerId,
  items: [{ price: priceId }],
  trial_end: trialEndTs,   // or 'now' to end the trial immediately
  // Maximum: 2 years from billing_cycle_anchor
})
```

`trial_end` and `trial_period_days` cannot be combined — `trial_end` takes precedence when both are present. Neither parameter is compatible with the newer Trial Offer API (`Stripe-Version: 2026-03-25.preview`); these are the legacy parameters for the stable API version.

### `trial_settings.end_behavior.missing_payment_method`

Controls the outcome when the trial ends and no payment method is on file:

```typescript
const subscription = await stripe.subscriptions.create({
  customer: stripeCustomerId,
  items: [{ price: priceId }],
  trial_period_days: 14,
  trial_settings: {
    end_behavior: {
      missing_payment_method: 'cancel',  // 'cancel' | 'pause' | 'create_invoice'
    },
  },
})
```

| Value | Behavior when trial ends without a payment method |
|---|---|
| `cancel` | Subscription is immediately canceled. Fires `customer.subscription.deleted`. |
| `pause` | Subscription moves to `paused` status. Fires `customer.subscription.paused`. Resumes when the customer adds a payment method. |
| `create_invoice` | Creates an invoice regardless — gives the customer an additional grace period to pay. |

### `customer.subscription.trial_will_end` — verified timing

> **Verified from Stripe event types docs**: "Occurs three days before a subscription's trial period is scheduled to end, or when a trial is ended immediately."

The event fires exactly **3 days before `trial_end`**. If the trial was set to fewer than 3 days total, the event fires immediately upon subscription creation. This is verified timing — not an approximation.

Handle this event in your webhook dispatcher to:
1. Send a trial-ending reminder email via Resend (`→ see SB_KB_10` for the outbox email pattern).
2. Write `trial_ending_notification_sent_at` to the DB so the event handler is idempotent on replay.
3. Surface an in-app "your trial ends in 3 days" banner (read from the DB column, not the Stripe API).

```typescript
// app/api/webhooks/stripe/route.ts — inside the webhook dispatcher
// (→ see BILL_KB_2 for signature verification and dispatch scaffolding)

case 'customer.subscription.trial_will_end': {
  const subscription = event.data.object as Stripe.Subscription

  // Look up local user — fetch by stripe_customer_id, not user_id
  const { data: profile } = await supabase
    .from('subscriptions')
    .select('user_id, users(email)')
    .eq('stripe_customer_id', subscription.customer as string)
    .single()

  if (profile?.users?.email) {
    // → see SB_KB_10 for the sendOrgEmail / outbox pattern
    await sendTrialEndingEmail({
      toEmail: profile.users.email,
      trialEndDate: new Date(subscription.trial_end! * 1000),
      idempotencyKey: `trial-ending/${subscription.id}/${event.id}`,
    })
  }

  // Idempotency guard: write the sent timestamp so replays are no-ops
  await supabase
    .from('subscriptions')
    .update({
      trial_ending_notification_sent_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscription.id)

  break
}
```

### Trial conversion paths

When the trial ends, Stripe attempts the first charge. There are four outcomes:

**Path A — payment succeeds (converted)**
- Status: `trialing` → `active`
- Events: `invoice.paid` (preferred over `invoice.payment_succeeded` — also fires for out-of-band payments and is the canonical provisioning trigger; `→ see BILL_KB_2`), then `customer.subscription.updated` (status change)
- Action: update `subscriptions.status = 'active'` in DB

**Path B — payment fails (failed conversion)**
- Status: `trialing` → `past_due` (or `incomplete` on first invoice)
- Events: `invoice.payment_failed`, then `customer.subscription.updated`
- Action: update DB status, show "payment failed" UI, trigger dunning flow (see Dunning section)

**Path C — no payment method, `missing_payment_method: 'cancel'`**
- Status: `trialing` → `canceled`
- Event: `customer.subscription.deleted`
- Action: update DB, show upgrade prompt

**Path D — no payment method, `missing_payment_method: 'pause'`**
- Status: `trialing` → `paused`
- Event: `customer.subscription.paused`
- Action: update DB, prompt user to add a payment method to resume

### Trial extension

For **legacy `trial_end` subscriptions** (the stable API, not the preview Trial Offer API), you can extend a trial by updating `trial_end` to a later timestamp:

```typescript
// Extend a trial — legacy API only
// [VERIFY BEFORE SHIPPING] — confirm your API version is the stable (non-preview) version
const subscription = await stripe.subscriptions.update(subscriptionId, {
  trial_end: newTrialEndTimestamp,  // Unix timestamp further in the future
  // Or: trial_end: 'now' to end the trial immediately
})
```

> **The preview Trial Offer API (`Stripe-Version: 2026-03-25.preview`) explicitly does NOT support trial extension after subscription creation.** Stripe's docs state: "You can't modify the trial length after you create the subscription or schedule trial extensions." If your app targets this preview API version, trial extension is unavailable. Verify your Stripe API version header before building any "extend trial" admin feature.

### No-card trials

No-card trials reduce signup friction but increase lifecycle complexity. Use `trial_settings.end_behavior.missing_payment_method: 'pause'` (or `'cancel'`) and do not require card collection at signup:

```typescript
const subscription = await stripe.subscriptions.create({
  customer: stripeCustomerId,
  items: [{ price: priceId }],
  trial_period_days: 14,
  trial_settings: {
    end_behavior: { missing_payment_method: 'pause' },
  },
  // No payment_method on the customer — user can start the trial without a card
})
```

| Approach | Conversion friction | Fraud risk | Recovery complexity |
|---|---|---|---|
| Card required up front | Higher signup friction | Low | Simple — Stripe charges on trial end |
| No card, pause on end | Lower friction | Medium (fake signups) | Must prompt user to add card when paused |
| No card, cancel on end | Lowest friction | Medium | User must re-subscribe; higher drop-off |

**Recommendation for this template:** Default to card required up front (standard Stripe Checkout flow) — simpler lifecycle, lower dunning complexity, no extra webhook states to handle. Offer no-card trials only if conversion data justifies the added complexity. Document the choice in `KB_1_Architecture.md`.

### DB columns for trial state

```sql
-- Relevant trial columns on the subscriptions table — see BILL_KB_1 for full schema
trial_start                       timestamptz,   -- from subscription.trial_start
trial_end                         timestamptz,   -- from subscription.trial_end
trial_ending_notification_sent_at timestamptz,   -- set when trial_will_end webhook fires
status                            text           -- 'trialing' | 'active' | 'past_due'
                                                 -- | 'unpaid' | 'canceled' | 'paused'
                                                 -- | 'incomplete' | 'incomplete_expired'
```

Keep these in sync exclusively from webhook events — never compute trial state client-side from subscription creation time or `created_at` timestamps.

`→ see BILL_KB_1` for the full subscriptions table schema.
`→ see SB_KB_10` for the Resend outbox email integration used in the trial reminder handler.

---

## Dunning (Failed Payments)

### Status lifecycle

```
trialing / active
    ↓  (initial payment fails)
incomplete          ← 23-hour window to resolve
    ↓  (23 hours without resolution)
incomplete_expired  ← terminal

active
    ↓  (renewal payment fails; retries begin)
past_due            ← service still running; retries in progress
    ↓  (all retries exhausted)
unpaid              ← service still running if you allow it; no more retries
    ↓  (dashboard: cancel after X days unpaid)
canceled            ← terminal; new subscription required
```

### Smart Retries configuration

Configure in Stripe Dashboard: **Billing → Revenue recovery → Retries**

- Default: **8 attempts over 2 weeks** (verified from Stripe Smart Retries docs)
- Configurable windows: 1, 2, or 3 weeks; extendable to 1 or 2 months
- AI-driven timing — Stripe optimizes retry windows per card network, geography, and time-of-day signals
- Segment-specific retry policies available via Automations
- Can be switched to 1–3 manual retry rules if preferred

### Application handling

```typescript
// Webhook handlers for dunning events
// (→ see BILL_KB_2 for full dispatch scaffolding)

case 'customer.subscription.updated': {
  const subscription = event.data.object as Stripe.Subscription

  await supabase
    .from('subscriptions')
    .update({ status: subscription.status })
    .eq('stripe_subscription_id', subscription.id)

  if (subscription.status === 'past_due') {
    // Show in-app warning banner; optionally send one "update your card" email
    await notifyPaymentFailed(subscription.customer as string)
  }
  // For 'unpaid': restrict access via RLS (→ see BILL_KB_3)
  break
}

case 'invoice.payment_failed': {
  const invoice = event.data.object as Stripe.Invoice
  // Send your own email only on the first failure — let Smart Retries handle the rest
  if (invoice.attempt_count === 1) {
    await sendPaymentFailedEmail(invoice.customer as string)
  }
  // invoice.next_payment_attempt holds the next retry timestamp
  break
}
```

> **Do not send your own dunning email on every retry.** Stripe Smart Retries fires `invoice.payment_failed` for each attempt. Sending a user 8 emails over 2 weeks is aggressive and increases churn. Send one email on the first failure (`attempt_count === 1`); let Stripe handle the retries silently; send another email only on `past_due` → `unpaid` status transition.

Access gating based on status belongs in RLS policies, not application code. `→ see BILL_KB_3` for the plan-gating pattern.

---

## Refunds

```typescript
// Full refund — omit amount to refund the entire charge
const refund = await stripe.refunds.create({
  charge: chargeId,           // or payment_intent: paymentIntentId
  reason: 'requested_by_customer',  // 'duplicate' | 'fraudulent' | 'requested_by_customer'
})

// Partial refund
const partialRefund = await stripe.refunds.create({
  charge: chargeId,
  amount: 2500,   // $25.00 — amount in smallest currency unit (cents for USD)
})
```

**Key parameters:**
- `charge` or `payment_intent` — mutually exclusive; use whichever you have.
- `amount` — omit for full refund; include (in cents) for partial.
- `reason` — note: `'fraudulent'` adds the card/email to Stripe's block list.
- `metadata` — optional key-value pairs for internal records.

**Webhooks:** `charge.refunded` fires on any refund (full or partial). Also listen to `refund.created` for the detailed refund object data.

Gate refund issuance behind `requireRecentAuth()` when exposed to admin users. `→ see AUTH_KB_6` for the re-auth gate implementation.

---

## Stripe Tax

Stripe Tax automates sales tax, VAT, and GST calculations across supported jurisdictions. Enable it in the Dashboard under **Tax settings**, register your business locations and tax registrations, then set `automatic_tax: { enabled: true }` on subscription create/update calls and on portal session creation — Stripe applies the correct rate automatically based on the customer's billing address. This template does not implement Stripe Tax by default; it is an opt-in addition that requires jurisdiction research, customer address collection, and ongoing registration monitoring as your business expands into new regions. Treat it as a forward-looking integration — see [https://docs.stripe.com/tax](https://docs.stripe.com/tax) for full setup requirements.

---

## Account / Org Deletion Interplay

When a user or org is deleted in Supabase (see `→ AUTH_KB_6` for the soft-delete Server Action pattern), the billing lifecycle requires an explicit decision before the Supabase auth row is touched.

### Recommended pattern

```typescript
// Inside the deleteAccount Server Action — run BEFORE soft-deleting the auth user
// (→ see AUTH_KB_6 for the full soft-delete flow this plugs into)

// 1. Look up active subscriptions for this user / org
const { data: activeSubs } = await supabase
  .from('subscriptions')
  .select('stripe_subscription_id, stripe_customer_id')
  .eq('user_id', userId)
  .in('status', ['active', 'trialing', 'past_due'])

// 2. Cancel at period end — preserves paid access, allows refund/chargeback processing
for (const sub of activeSubs ?? []) {
  await stripe.subscriptions.update(sub.stripe_subscription_id, {
    cancel_at_period_end: true,
    metadata: {
      deleted_by: 'account_deletion',
      deleted_at: new Date().toISOString(),
    },
  })
}

// 3. Do NOT delete the Stripe customer object.
//    The customer record is needed for:
//    - Chargeback defense (requires payment history and customer metadata)
//    - Refund processing (requires the original charge linked to the customer)
//    - Invoice PDF export for GDPR data requests or tax records
//    Schedule deletion via a background job after the retention window
//    (→ see JOB_KB for the delayed hard-delete pattern)

// 4. Continue with AUTH_KB_6 soft-delete steps (ban, anonymize profiles, etc.)
```

### Design decisions

| Option | When to use |
|---|---|
| Cancel at period end (recommended) | Default — preserves refund window; keeps paid period active |
| Immediate cancellation | Regulatory / immediate clean-up requirements only |
| Let subscription expire naturally | Only if retention window overlaps with current billing period |

**Retention window:** Stripe customer records should be retained for at least 90 days; card network chargeback windows can extend to 120 days or longer for certain dispute types. Verify the specific window with Stripe support before setting the hard-delete schedule. `→ see JOB_KB` for scheduling the delayed deletion job.

**Webhook re-entry after deletion:** After setting `cancel_at_period_end: true` on account deletion, your webhook handler will receive `customer.subscription.updated` and later `customer.subscription.deleted`. The webhook code must handle the case where the local user is already soft-deleted — always look up by `stripe_customer_id`, never by `user_id` alone. Attempting a `user_id` lookup on a soft-deleted user will return no row and silently drop the event.

`→ see AUTH_KB_6` for the full soft-delete Server Action and audit log pattern.

---

## Re-Auth Before Billing Changes

Sensitive billing operations require fresh authentication before proceeding — a valid session is not sufficient.

```typescript
// actions/billing.ts
'use server'
import { requireRecentAuth } from '@/lib/auth/reauth'
// (→ see AUTH_KB_6 for the requireRecentAuth implementation)
// (→ see AUTH_KB_4 for the session age check and getClaims() pattern)
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function cancelSubscription(subscriptionId: string) {
  const supabase = await createClient()
  const { data: { claims } } = await supabase.auth.getClaims()
  if (!claims) throw new Error('Unauthorized')

  // Re-auth gate: session must be less than 5 minutes old for cancellation
  await requireRecentAuth({ userId: claims.sub, maxAgeSeconds: 300 })

  // Authorization: verify this subscription belongs to the authenticated user
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('stripe_subscription_id')
    .eq('user_id', claims.sub)
    .eq('stripe_subscription_id', subscriptionId)
    .single()

  if (!sub) throw new Error('Subscription not found or access denied')

  await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  })
}
```

**Operations that warrant re-auth** (aligned with `→ AUTH_KB_6`):
- Canceling or downgrading a subscription
- Changing or removing the default payment method
- Changing billing email / address
- Issuing a refund (admin-side)

**Portal redirect consideration:** The Customer Portal is a Stripe-hosted surface — its session is not linked to your app session. Requiring re-auth before redirecting to the portal for destructive flows (cancellation deep-link) is reasonable, while simple portal access (invoice viewing, payment method update) can proceed without it.

`→ see AUTH_KB_4` for the session lifecycle, `getClaims()` pattern, and session age semantics.
`→ see AUTH_KB_6` for the `requireRecentAuth()` helper implementation.

---

## Pitfalls

**Storing or emailing the portal `session.url`.**
Sessions expire after 5 minutes idle. If you include `session.url` in an email or cache it as a link, it will be expired by the time the user clicks. Always send users to a page in your app that creates a fresh portal session on demand.

**Trial extension on the preview Trial Offer API.**
The `Stripe-Version: 2026-03-25.preview` Trial Offer API explicitly blocks post-creation trial modification. If you're targeting the stable API and use legacy `trial_end` parameters, extension is possible via `subscriptions.update({ trial_end: newTs })` — but confirm your API version header first. Building an admin "extend trial" feature without verifying this will produce silent failures or unexpected errors.

**Hard-deleting the Stripe customer on account deletion.**
Calling `stripe.customers.del()` during account deletion removes all payment history, invoice records, and chargeback defense evidence. If a user files a dispute after account deletion, you will be unable to contest it. Retain the customer record for the full refund/chargeback window (90–120 days) and schedule deletion via a background job.

**Missing `trial_will_end` handler.**
If your webhook dispatcher doesn't handle `customer.subscription.trial_will_end`, no trial-ending reminder ever fires — for any trial, on any user. This is a silent failure: the subscription lifecycle proceeds normally, but users get no warning before they're charged. Add the handler and write `trial_ending_notification_sent_at` to the DB so replays are idempotent.

**Webhook re-entry after soft-delete.**
Setting `cancel_at_period_end: true` on account deletion causes Stripe to send `customer.subscription.updated` and later `customer.subscription.deleted`. If your webhook handler does `SELECT ... WHERE user_id = $1` and the user is already soft-deleted, the lookup returns nothing and the event is silently dropped — leaving your DB with stale `status = 'active'`. Always look up by `stripe_customer_id`.

**Sending a dunning email on every retry.**
`invoice.payment_failed` fires for every Smart Retry attempt — up to 8 over 2 weeks. If you send an email on every event, users receive an inbox flood that accelerates churn rather than preventing it. Gate outbound emails on `attempt_count === 1` and status transitions only.

---

## When to Outgrow This

This KB covers the standard lifecycle for a single subscription per user/org. You will need patterns beyond this KB when:

- **Usage-based / metered billing** — requires metered subscription items, usage records (`stripe.subscriptionItems.createUsageRecord()`), and a separate metering pipeline.
- **Multiple active subscriptions per org** — multi-product billing where a single org holds subscriptions to several products concurrently. Requires schema changes (`→ BILL_KB_1`) and multi-subscription portal configurations.
- **Custom dunning logic** — if Smart Retries' AI-driven timing doesn't meet your needs (e.g., specific retry intervals, custom escalation paths), you need to disable Smart Retries and build your own retry scheduler using the Postgres queue pattern (`→ JOB_KB_3`).
- **Stripe Tax serious adoption** — once tax is enabled, address collection, location validation, and jurisdiction registration management become first-class concerns requiring their own implementation surface.
- **Custom subscription schedules** — multi-phase subscriptions (free pilot → paid → enterprise tier) using `stripe.subscriptionSchedules`. The portal does not support schedule-based upgrades.

---

## Cross-References

| KB | Relevant for |
|---|---|
| `BILL_KB_1` | DB schema — products, prices, subscriptions, `trial_start` / `trial_end` columns |
| `BILL_KB_2` | Webhook mechanics — signature verification, event dispatch, idempotency |
| `BILL_KB_3` | Plan-based RLS and feature gating — `past_due` / `unpaid` / `canceled` access control |
| `AUTH_KB_4` | Session lifecycle — `getClaims()`, session age, `requireRecentAuth()` dependency |
| `AUTH_KB_6` | Account management — soft-delete Server Action, re-auth gate implementation |
| `SB_KB_10` | Resend email integration — trial reminder email via outbox pattern |
| `JOB_KB` | Background jobs — scheduling delayed Stripe customer deletion after retention window |
