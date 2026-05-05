# BILL_KB_1 — Stripe Setup & Schema

**Stack-locked to Stripe Billing + Supabase + Next.js (App Router). Multi-org tenancy model.**

---

## TL;DR

- Stripe's data model is a strict hierarchy: **Product → Price → Customer → Subscription**. Products define what you sell; Prices define how you charge; Customers are billing entities; Subscriptions bind a Customer to a recurring Price.
- In multi-org apps, the Stripe Customer maps to an **org**, not a user. One org → one Stripe Customer. Store the link in a `customers` table keyed by `org_id`. → see SB_KB_1 for the org/membership model this builds on.
- Three Postgres tables own all billing state: `customers` (org ↔ Stripe link), `subscriptions` (lifecycle + plan slug), `stripe_events` (idempotency store + audit log). All carry `org_id`.
- There are three distinct Stripe secrets: `STRIPE_SECRET_KEY` (`sk_*`), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_*`), and `STRIPE_WEBHOOK_SECRET` (`whsec_*`). The publishable key is the only one safe in the browser. The other two are server-only.
- Pin the Stripe API version explicitly in the SDK init — the Node SDK defaults to the version current at SDK release time, enabling silent upgrades on `npm update`. Current version as of 2026-04-22: `2026-04-22.dahlia`.
- Test and live mode data are completely isolated. Products and Prices must be created in both environments. Price IDs differ between environments — use `lookup_key` or environment variables to avoid hardcoding them.
- Webhook handling, RLS policies, portal flows, and trial management are each handled in their own KB. This KB covers foundation only: data model, schema, env vars, and SDK init.

---

## ALWAYS / NEVER

**ALWAYS:**
- Map one Stripe Customer per org, not per user. Store `stripe_customer_id` on the `customers` table keyed by `org_id`.
- Store `metadata: { org_id }` on the Stripe Customer at creation time. This makes webhook reconciliation possible even if your DB state is lost.
- Pin `apiVersion` explicitly in the Stripe SDK init. Update it intentionally — never let `npm update` drift the version silently.
- Keep `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in server-side environment variables only (Vercel Environment Variables, not `.env` files committed to git).
- Use the `NEXT_PUBLIC_` prefix for the publishable key so Next.js makes it available on the client.
- Enable RLS on all billing tables immediately. Defer writing policies (→ BILL_KB_3) but do not defer enabling.
- Use the Stripe event ID (`evt_...`) as the primary key on `stripe_events` for DB-level idempotency.
- Use `lookup_key` on Stripe Prices to decouple your code from price IDs. Price IDs change; lookup keys don't have to.

**NEVER:**
- Never store `stripe_customer_id` on `auth.users` or in JWT claims. The `customers` table is the canonical store.
- Never import `lib/stripe.ts` (the server SDK module) into client components or any file reachable by the client bundle.
- Never use the `NEXT_PUBLIC_` prefix on `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET`.
- Never commit `.env.local` (or any file containing `sk_*` or `whsec_*`) to version control.
- Never hardcode Stripe price IDs in application code. Use `lookup_key` or environment variables.
- Never mix test and live keys in the same environment. Use environment-level variable swapping.
- Never expose `stripe_events` via PostgREST or the Supabase client SDK. It is service-role only.
- Never use the `anon` key in webhook handlers. Use the `service_role` key so RLS does not block writes.

---

## Stripe Data Model

Stripe billing is built on four object types that form a strict hierarchy. Understanding this hierarchy determines how you model billing in your own DB.

```
Product
  └── Price (1 product → many prices: monthly, annual, per-seat, etc.)
        └── Subscription (1 customer → 1+ subscriptions, each tied to a price)
Customer
  └── Subscription (FK: customer.id)
```

### Products

A Product is the thing you sell — a plan tier, a one-time add-on, a seat bundle. It carries no pricing information; that lives on Price objects.

| Field | Type | Notes |
|---|---|---|
| `id` | string | `prod_XXXX` |
| `name` | string | Customer-visible plan name |
| `active` | boolean | `false` = cannot be used for new purchases |
| `default_price` | string\|null | Expandable; canonical price for display |
| `metadata` | object | Attach your internal `plan_slug` here (e.g. `{ plan_slug: 'starter' }`) |
| `livemode` | boolean | Distinguishes test vs live |

**Practical pattern:** Create one Product per plan tier (Starter, Pro, Enterprise). Each Product can have multiple Prices for different intervals (monthly, annual) or currencies.

### Prices

A Price defines how to charge for a Product: amount, currency, and billing cadence. Prices are immutable after creation — you create a new Price rather than editing an existing one.

| Field | Type | Notes |
|---|---|---|
| `id` | string | `price_XXXX` — differs between test and live |
| `product` | string | FK → Product.id |
| `type` | `one_time` \| `recurring` | Recurring requires a subscription |
| `currency` | string | ISO 3-letter, lowercase (e.g. `usd`) |
| `unit_amount` | integer\|null | Cents (or smallest currency unit). Null for tiered. |
| `recurring.interval` | `day` \| `week` \| `month` \| `year` | Billing cadence |
| `recurring.interval_count` | integer | Multiplier (`3` + `month` = quarterly) |
| `recurring.usage_type` | `licensed` \| `metered` | `licensed` = flat seat count |
| `lookup_key` | string\|null | Stable slug you control (e.g. `starter_monthly`) |
| `active` | boolean | `false` = cannot be used for new purchases |
| `livemode` | boolean | |

**Key pattern:** Assign a `lookup_key` (e.g. `starter_monthly`) to each Price. Reference prices by this key in code, not by ID. When you need to update pricing, create a new Price, pass `transfer_lookup_key: true`, and the key migrates to the new Price without code changes.

### Customers

A Customer is Stripe's billing entity — the object to which invoices, payment methods, and subscriptions are attached. In a multi-org app, one Customer represents one org.

Creation order (per Stripe's integration guide):
1. Org is provisioned in your DB.
2. Backend calls `stripe.customers.create({ email, name, metadata: { org_id } })`.
3. Store the returned `customer.id` as `stripe_customer_id` in `public.customers`.
4. Pass this customer ID when creating a Checkout Session or subscription.

> **Open:** Eager (at org creation) vs lazy (at first billing intent) customer creation is a project-level decision. Eager creation is simpler to reason about and avoids missing customer records during Checkout. Lazy creation produces fewer orphaned Stripe Customer objects when signups do not convert. Neither approach is wrong — decide and enforce it consistently.

### Subscriptions

A Subscription binds a Customer to a recurring Price and tracks the full billing lifecycle.

**Status enum — all eight values:**

| Status | Meaning | Provision access? |
|---|---|---|
| `trialing` | Free trial active | Yes |
| `active` | Good standing, payment confirmed | Yes |
| `past_due` | Renewal payment failed; retrying | Yes (grace period) |
| `incomplete` | First payment in-flight (<23h) | Conditional |
| `incomplete_expired` | First payment failed; terminal | No |
| `unpaid` | Exhausted retries; terminal | No |
| `canceled` | Canceled (manually or automatically) | No |
| `paused` | Trial ended, no payment method; paused | No |

**Key lifecycle fields:**

| Field | Type | Notes |
|---|---|---|
| `current_period_start` / `current_period_end` | Unix timestamp | Billing window boundaries |
| `cancel_at_period_end` | boolean | Will cancel at next period end if `true` |
| `trial_end` | timestamp\|null | When the trial expires |
| `metadata` | object | Store `org_id` here as a reconciliation backup |

Webhook-driven provisioning (syncing these fields into `public.subscriptions`) → see BILL_KB_2.

---

## Multi-Org Billing Model

In this template, billing is an org-level concern, not a user-level concern:

```
organizations (1)  ──→  customers (1)  ──→  subscriptions (1 active)
     │                  stripe_customer_id     plan, status, period
     │
     └──→ org_memberships (many)
              user_id, org_id, role
```

- **One Stripe Customer per org.** Multiple users may belong to the same org; they share one billing entity.
- **Only users with `billing_admin` (or equivalent) role** should be able to trigger billing operations (Checkout, portal, plan changes). Enforce with RLS policies on `customers` and `subscriptions`. → see BILL_KB_3 for the policies; → see SB_KB_1 for the org/membership model.
- **`plan` slug is stored on `public.subscriptions`.** The Custom Access Token Hook reads this column and injects it into the JWT `app_metadata` so RLS policies can gate features without a per-query join. → see AUTH_KB_2 for the hook; → see BILL_KB_3 for plan-gated RLS policies.
- **Subscription belongs to org, not the user who created it.** If the billing-admin user is removed from the org, the org's subscription is unaffected.

> **Warning:** Do not store `stripe_customer_id` on the user record or in `auth.users.raw_app_meta_data`. A user can belong to multiple orgs; they do not own a Stripe Customer. The `customers` table is the only canonical location for this mapping. → see SB_KB_1.

---

## Database Schema

Full DDL for all three billing tables. Run as a single migration. Depends on `public.organizations` existing with `id uuid PRIMARY KEY`.

```sql
-- ============================================================
-- Migration: billing tables
-- Depends on: public.organizations(id uuid primary key)
-- ============================================================


-- ------------------------------------------------------------
-- 1. customers — links one Stripe Customer to one org (1:1)
-- ------------------------------------------------------------
-- One row per org. Created when the org first enters a billing
-- flow (Checkout session or direct API call).
--
-- "customers" here is the app-level mapping table. It is not
-- auth.users. stripe_customer_id is the bridge to Stripe.
-- ------------------------------------------------------------
create table if not exists public.customers (
  id                  uuid        primary key default gen_random_uuid(),
  org_id              uuid        not null references public.organizations(id) on delete cascade,
  stripe_customer_id  text        not null,
  created_at          timestamptz not null default now(),

  constraint customers_org_id_unique           unique (org_id),
  constraint customers_stripe_customer_id_unique unique (stripe_customer_id)
);

-- Lookup by org (most common: "does this org have a Stripe customer?")
create index on public.customers (org_id);
-- Lookup by Stripe customer ID (used in webhook handlers to resolve org)
create index on public.customers (stripe_customer_id);

alter table public.customers enable row level security;
-- RLS policies → see BILL_KB_3


-- ------------------------------------------------------------
-- 2. subscriptions — tracks current plan state for an org
-- ------------------------------------------------------------
-- One active row per org per Stripe subscription ID.
-- Historical rows are kept; canceled subscriptions get
-- status = 'canceled' rather than being deleted.
--
-- status: mirrors Stripe subscription status exactly. Using text
--   (not an enum) so no migration is needed if Stripe adds a
--   new status value. Validate in application code on write.
--   Allowed: incomplete, incomplete_expired, trialing, active,
--             past_due, canceled, unpaid, paused
--
-- plan: denormalized slug (e.g. 'starter', 'pro') for fast
--   feature-gate checks. Populated from product.metadata.plan_slug
--   or price lookup_key in the webhook handler. Read by the
--   Custom Access Token Hook to inject into JWT app_metadata.
--   → see BILL_KB_2 for sync logic
--   → see AUTH_KB_2 / BILL_KB_3 for the hook and RLS usage
-- ------------------------------------------------------------
create table if not exists public.subscriptions (
  id                      uuid        primary key default gen_random_uuid(),
  org_id                  uuid        not null references public.organizations(id) on delete cascade,
  stripe_subscription_id  text        not null,
  stripe_price_id         text        not null,

  -- Stripe status enum (text, not pg enum — see comment above)
  status                  text        not null,

  -- Billing period boundaries from Stripe (Unix epoch → timestamptz)
  current_period_start    timestamptz,
  current_period_end      timestamptz,

  -- True when subscription will cancel at current_period_end
  cancel_at_period_end    boolean     not null default false,

  -- Denormalized plan slug; drives feature gating.
  -- Keep in sync via webhook handler. → see BILL_KB_2
  plan                    text,

  -- Trial end timestamp; null if no trial
  trial_end               timestamptz,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- One row per Stripe subscription ID (webhook upsert key)
create unique index on public.subscriptions (stripe_subscription_id);

-- Primary lookups
create index on public.subscriptions (org_id);
create index on public.subscriptions (status);

-- Fast query: "what is org X's current active subscription?"
-- Covers the most common application read (feature gating, plan display)
create index on public.subscriptions (org_id)
  where status in ('active', 'trialing', 'past_due');

alter table public.subscriptions enable row level security;
-- RLS policies → see BILL_KB_3

-- Keep updated_at current on every write
create or replace function public.set_updated_at()
returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();


-- ------------------------------------------------------------
-- 3. stripe_events — idempotency store + audit log
-- ------------------------------------------------------------
-- Primary key is the Stripe event ID ('evt_XXXX').
-- INSERT ... ON CONFLICT DO NOTHING is the idempotency
-- mechanism: a duplicate webhook delivery is a silent no-op.
--
-- payload: full raw event JSON from Stripe. Retain it —
--   invaluable for debugging and manual replay.
--
-- processed_at: null = not yet processed; non-null = handler
--   ran successfully. Enables dead-letter queries:
--   SELECT * FROM stripe_events WHERE processed_at IS NULL.
-- ------------------------------------------------------------
create table if not exists public.stripe_events (
  id            text        primary key,  -- Stripe event ID: 'evt_...'
  type          text        not null,
  payload       jsonb       not null,
  processed_at  timestamptz,              -- null = pending; non-null = done
  created_at    timestamptz not null default now()
);

-- Webhook handler routing: filter events by type
create index on public.stripe_events (type);
-- Dead-letter monitoring: find unprocessed events
create index on public.stripe_events (processed_at)
  where processed_at is null;

-- No app-user access. Service-role only.
-- Enabling RLS with no policies denies all authenticated/anon access.
-- The service_role key bypasses RLS entirely — no explicit policy needed.
alter table public.stripe_events enable row level security;
```

**Schema notes:**

- `status` is `text` not a Postgres enum. Avoids a migration if Stripe extends the enum. Validate the value at the application layer when writing.
- `plan` is intentionally denormalized. Keeps feature-gate reads to a single-column lookup without a join. Populate and keep in sync via the webhook handler. → see BILL_KB_2.
- `stripe_events.id` uses `text` primary key (the Stripe event ID) so idempotency is a DB constraint, not application logic.
- `set_updated_at()` may already exist in your project — `create or replace` handles this safely.
- `stripe_events` has no `org_id` column because events are account-level objects in Stripe. The webhook handler resolves the org via `customers.stripe_customer_id` before writing to `subscriptions`.

---

## Environment Variables + Key Separation

Stripe issues three distinct secrets. Each has a different surface and security requirement.

### Key types

| Variable name | Stripe prefix | Surface | Secret? |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_...` / `sk_live_...` | Server-only | Yes — never in client code |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` / `pk_live_...` | Client-safe | No — intentionally public |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Server-only (webhook handler) | Yes — never in client code |

The publishable key cannot perform server-side operations (creating customers, reading balances). Its exposure is safe and intentional. The secret key and webhook secret must never appear in:
- Client bundles (no `NEXT_PUBLIC_STRIPE_SECRET_KEY`)
- `.env` or `.env.local` files committed to version control
- Frontend component files or any import chain reachable by the browser

Store `sk_*` and `whsec_*` in your deployment platform's encrypted environment variables (e.g. Vercel Environment Variables). Stripe shows the live secret key only once — if lost, rotate immediately in the Dashboard.

### `.env.local` pattern

```bash
# .env.local — never committed to git (verify .gitignore excludes it)

# Stripe — TEST keys (used in local development)
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # from: stripe listen --print-secret

# Production keys are set as Vercel Environment Variables, not in files:
# STRIPE_SECRET_KEY=sk_live_...
# NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
# STRIPE_WEBHOOK_SECRET=whsec_...   # from Stripe Dashboard > Webhooks
```

Do not use a single variable with a `NODE_ENV === 'production'` toggle. Use environment-level variable swapping — different values in different Vercel environments (Preview vs Production).

### Where each key is used

**`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`** — client-side only:
- `loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)` in `lib/stripe-client.ts`
- The `<Elements>` provider from `@stripe/react-stripe-js`
- Stripe.js card input components (Elements)

**`STRIPE_SECRET_KEY`** — server-side only:
- Next.js Route Handlers (`app/api/...`)
- Next.js Server Actions
- Supabase Edge Functions (Node.js runtime only — see SDK init note below)

**`STRIPE_WEBHOOK_SECRET`** — webhook handler only:
- `stripe.webhooks.constructEvent(body, signature, secret)` → see BILL_KB_2

---

## Stripe SDK Initialization

The Stripe Node SDK must only be instantiated in server-side code. Create a single module that exports the configured instance.

```typescript
// lib/stripe.ts — server-only module
//
// NEVER import this file in:
//   - Client components (anything with 'use client')
//   - Files imported by the client bundle
//
// Safe in: Route Handlers, Server Actions, Server Components,
//          Supabase Edge Functions (Node.js runtime)

import Stripe from 'stripe'

// Pin the API version explicitly.
// The SDK defaults to the version current at SDK release time —
// 'npm update stripe' silently upgrades the API version.
// Update this string intentionally after reviewing the Stripe changelog.
// Current version as of 2026-04-22: '2026-04-22.dahlia'
// Check: https://docs.stripe.com/api/versioning
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',
  maxNetworkRetries: 2,  // retry idempotent-safe requests on transient network errors
})
```

> **Open:** The `typescript: true` constructor option appeared in older Stripe SDK versions. In current SDKs (v13+), TypeScript support is built-in and this option may be unrecognized or silently ignored. Omitted here for that reason. Verify against your installed SDK version if you see type warnings.

**Usage in a Route Handler:**

```typescript
// app/api/billing/create-customer/route.ts
import { stripe } from '@/lib/stripe'

export async function POST(req: Request) {
  // Get org details from the verified session
  // (validate with supabase.auth.getClaims() — never trust the request body alone)
  const { orgId, orgName, orgEmail } = await getOrgFromSession(req)

  const customer = await stripe.customers.create({
    email: orgEmail,
    name:  orgName,
    metadata: { org_id: orgId },  // backup reconciliation key
  })

  // Insert into public.customers (use service_role client)
  await supabaseAdmin
    .from('customers')
    .insert({ org_id: orgId, stripe_customer_id: customer.id })

  return Response.json({ customerId: customer.id })
}
```

### Notes on the SDK init

**Build-time instantiation warning (stripe-node v17+):** Instantiating the Stripe client at module load time (the pattern above) will throw if `STRIPE_SECRET_KEY` is undefined at build time. Vercel makes environment variables available at build time for Route Handlers and Server Actions — verify your Vercel project has the variable configured in the correct environment. If you see build errors, confirm the variable is present.

**Edge runtime incompatibility:** The `stripe` package is Node.js-only. It will fail in Next.js Edge Runtime (`export const runtime = 'edge'`). Stripe operations require Node.js runtime Route Handlers. Do not set `runtime = 'edge'` on any route that imports `lib/stripe.ts`.

**API version pinning rationale:** Stripe's API versioning is per-account. Each request uses the version in the SDK config unless overridden per-request. Pinning ensures consistent behavior across SDK updates. When you upgrade `stripe` npm package, check the Stripe changelog for the new default version and update the pin after review.

---

## Test Mode vs Live Mode

### Data isolation

Test and live mode data are completely isolated — "API objects in one mode aren't accessible to the other." A `prod_XXXX` created in test mode does not exist in live mode.

Practical consequences:
- Create your Products and Prices in **both** the test and live dashboards (or via API with each respective key set).
- Price IDs differ between environments. Never hardcode them. Use `lookup_key` or environment variables to reference prices.
- Customers, subscriptions, invoices, and webhook events are mode-scoped. A test subscription will never appear in the live dashboard.

### Dashboard settings caveat

> **Warning:** Changing certain settings in the Dashboard while in test mode may also change them in live mode. This applies to payment method configurations and Stripe Tax settings. The default test sandbox shares some global settings with live mode. If you need fully isolated settings (e.g., for a dedicated staging environment), create a separate Stripe account rather than relying on test mode.

### Test card numbers

Use Stripe-provided test card numbers in test mode only:
- `4242 4242 4242 4242` — successful payment, any future expiry, any 3-digit CVC
- Specific card numbers trigger decline, 3DS, and failure scenarios (see Stripe test mode docs)

### Webhook testing in development

Use the Stripe CLI to forward webhook events to your local dev server:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# The CLI prints a local whsec_... signing secret.
# Set it as STRIPE_WEBHOOK_SECRET in .env.local.
# This secret is different from the Dashboard webhook secret.
```

For CI and staging: create a dedicated webhook endpoint in the Stripe test Dashboard. Use that endpoint's signing secret as `STRIPE_WEBHOOK_SECRET` in the CI/staging environment.

Webhook signature verification logic → see BILL_KB_2.

### Test Clocks

Stripe's Test Clocks let you simulate time progression — subscription renewals, trial expirations, and period-end events — without waiting for real time to pass. Attach a `test_clock` to a Customer when creating it in integration tests. Useful for testing the full subscription lifecycle in automated tests. → see BILL_KB_2 for lifecycle event handling.

### Separate accounts vs separate modes

For teams that need fully isolated settings between staging and production: create a separate Stripe account for each environment. Each account has independent test and live modes. This is optional overhead for most projects — document the decision in `KB_1_Architecture.md` if you go this route.

---

## Pitfalls

**1. Price ID drift between test and live.**
Price IDs (`price_XXXX`) are different in test and live mode. If you hardcode them in code or store them in a config file, deployments break when switching modes. Always use `lookup_key` for Price references or store the IDs as environment variables.

**2. Orphaned Stripe Customer objects from abandoned Checkouts.**
If you create a Stripe Customer eagerly at org signup and the user abandons the billing flow, the Customer object exists in Stripe but has no subscription. This is not harmful but inflates the customer list. If you choose lazy creation (Customer created at Checkout initiation), ensure every code path that starts a billing flow creates the Customer and stores the ID before the Checkout Session is created, or the Checkout will be created without a customer association.

**3. Skipping `metadata: { org_id }` on the Stripe Customer.**
If your `customers` table row is lost or a webhook arrives before the row is written, the webhook handler cannot resolve which org the event belongs to. Always set `metadata.org_id` at Customer creation. This is your fallback reconciliation key.

**4. Mixing test and live keys in the same deployment.**
Mixing `sk_test_` with `pk_live_` (or vice versa) causes Stripe API errors. Stripe validates that the keys used in a single request belong to the same mode. Use a consistent environment variable swap — never compose key pairs across modes.

**5. `status` drift between Stripe and your DB.**
The `subscriptions.status` column is only as current as the last webhook that was processed. If webhooks are delayed or dropped, application code may grant or deny access based on stale state. Always handle the `stripe_events.processed_at IS NULL` dead-letter case. → see BILL_KB_2 for webhook processing and retry strategy.

---

## When to Outgrow This

This schema assumes one flat subscription per org with a fixed recurring price. It will need to be extended for: metered or usage-based billing (where `recurring.usage_type = 'metered'` and charges are reported via the Meters API rather than a fixed `unit_amount`); multiple simultaneous subscriptions per org (e.g. a base plan plus add-ons, or per-seat pricing that is independent of the base tier); hybrid pricing that combines a flat base fee with usage-based overages; or per-user seat billing where quantity is tracked separately from plan tier. If any of these patterns apply, design the billing model before writing the schema — the `subscriptions` table shape changes significantly (quantity column, multiple rows per org with different `stripe_price_id` values, a separate `usage_records` table). The current schema is intentionally minimal and correct for the common case: one plan per org, charged on a fixed recurring basis.

---

## Cross-References

- → **BILL_KB_2** — Webhook handler: signature verification, event routing, syncing `subscriptions` table, idempotency via `stripe_events`
- → **BILL_KB_3** — RLS policies on `customers` and `subscriptions`; `plan` claim injection via Custom Access Token Hook; feature gating by plan tier
- → **BILL_KB_4** — Customer portal (self-service plan changes, cancellation); Checkout Session creation and redirect flow; trial setup and trial-end handling
- → **SB_KB_1** — Multi-org tenancy model: `organizations`, `org_memberships`, RLS helper pattern that billing tables depend on
- → **AUTH_KB_2** — Custom Access Token Hook: how the `plan` slug from `subscriptions` gets injected into JWT `app_metadata` for use in RLS policies
