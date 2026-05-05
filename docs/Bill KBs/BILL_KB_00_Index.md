# Billing Knowledge Base — Index

**Stack:** Stripe (server-only via `stripe` Node SDK) + Supabase Postgres + Next.js App Router (`@supabase/ssr`) + the JOB family's outbox.

This folder owns the Stripe integration end-to-end: products and prices, the customer/subscription schema, webhook ingestion, plan-claim propagation into the JWT, RLS / Server Action / UI gating, and the customer-lifecycle surface (Customer Portal, trials, cancellation, dunning, refunds).

Stripe is the **canonical source of truth** for billing state. The local DB is a cache, reconciled on webhooks. Plan-tier gating reads `app_metadata.plan` from the JWT, populated by the Custom Access Token Hook (cross-ref AUTH_KB_2). Subscriptions belong to the **org**, not the user (cross-ref SB_KB_1's union-membership tenancy).

These files are for Claude. Principles-only docs fail at implementation time. Every KB has real SQL, real TypeScript, and real gotchas.

---

## File index

| File | Topic | Stack-portable? |
|---|---|---|
| `BILL_KB_1_Stripe_Setup_And_Schema.md` | Products / prices / customers / subscriptions; multi-org-aware DB schema; env vars (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`); SDK init; test vs live mode | 🔒 Stack-locked: Stripe-specific schema; multi-org pattern portable |
| `BILL_KB_2_Webhooks_And_State_Sync.md` | App Router webhook route handler with raw-body signature verify; idempotency on `event_id`; outbox dispatch in single tx (cross-ref JOB_KB_1); subscription state machine (8 statuses); event-handling matrix; reconciliation | 🔒 Stack-locked: Stripe + Next.js App Router |
| `BILL_KB_3_Plan_Gating.md` | Plan claim populated by access-token hook (AUTH_KB_2); RLS InitPlan idiom (SB_KB_12); Server Action + UI gating; defense in depth; stale-claim refresh after upgrade | 🔒 Stack-locked: Supabase Custom Access Token Hook + RLS |
| `BILL_KB_4_Customer_Lifecycle.md` | Stripe Customer Portal as default UI; upgrade/downgrade + proration; cancellation (period-end vs immediate); **trials** (deepest section — `trial_will_end`, conversion, extension caveats, no-card patterns); dunning + Smart Retries; refunds; Stripe Tax (one-paragraph note); account-deletion interplay | 🔒 Stack-locked: Stripe + portal + webhook event names |

---

## Cross-cutting rules that apply everywhere

**Always:**
- Verify Stripe webhook signatures with `stripe.webhooks.constructEvent(rawBody, signature, secret)` **before** processing — and use the raw body string from `request.text()`, never re-parsed JSON.
- Deduplicate webhook events by inserting into `stripe_events (event_id PRIMARY KEY)` with `ON CONFLICT DO NOTHING`. Idempotency is a DB constraint, not application logic.
- Treat **Stripe as source of truth**. The local DB is a cache. If they ever diverge, Stripe wins — reconcile, don't paper over.
- Subscriptions belong to `org_id`, never `user_id`. Cross-ref SB_KB_1 — billing follows the union-membership tenancy.
- Populate the `plan` claim via the **Custom Access Token Hook** (cross-ref AUTH_KB_2), writing to `app_metadata.plan`. RLS reads it with the InitPlan idiom: `(select auth.jwt()->'app_metadata'->>'plan')`. Cross-ref SB_KB_12.
- Defense in depth: gate on **all three** layers — RLS (floor), Server Action (catches), UI (UX). Never just one.
- Use Stripe **idempotency keys** on every state-mutating API call. Stripe retries on network failures; without an idempotency key you risk double-charges, double-creations.
- Persist the webhook event row **before** returning 200 — durability requires the row hits disk first. Side-effects happen out-of-band via the outbox worker (cross-ref JOB_KB_1).
- Refresh the user's session (`supabase.auth.refreshSession()`) on the success page after an upgrade — otherwise the JWT carries stale `plan` until the next natural refresh, causing silent gating failures.

**Never:**
- Call Stripe directly from client code. The secret key is server-only — leaking it lets anyone charge cards on your account. Client code uses **only** the publishable key with Stripe.js (Elements, Checkout redirect).
- Trust client-supplied plan claims. `user_metadata` is **client-writable** — any user can run `supabase.auth.updateUser({ data: { plan: 'enterprise' } })`. Always read plan from `app_metadata` (server-writable, set by the hook).
- Respond to a webhook before persisting the event row. Returning 200 means "I have it durably" — drop the row, drop the event, lose the side-effect.
- Store credit-card numbers, full PANs, or CVCs in your database. PCI scope explosion. Stripe holds the card; you hold a token (`pm_...` or `cus_...`).
- Rely on local DB plan state without webhook reconciliation. Drift between Stripe (truth) and DB (cache) causes silent gating failures — paid users locked out, unpaid users with access.
- Use Stripe Pricing Tables / no-code embeds for the template. Inflexible, hard to style, hard to A/B. Use Checkout Sessions or your own UI.
- Hard-delete a Stripe customer immediately on user/org deletion. Refund / chargeback windows extend ~90 days; orphaning the customer breaks reconciliation. Soft-delete locally; let Stripe customer linger.
- Process side-effects **inside** the webhook handler. Slow handlers blow Stripe's response window (Stripe expects ~10s); failed side-effects re-trigger webhook retries instead of using the outbox retry budget. Outbox the work; let the worker do it.
- Use parsed JSON when verifying the signature — `app.use(express.json())` on the webhook route silently breaks the verifier. App Router + `request.text()` avoids this by default; just don't deviate.
- Issue a `cancel_at_period_end: true` and then forget the `customer.subscription.deleted` follow-up handler. The first webhook flips a flag; the second cuts access. Both must be wired.

---

## Dependencies between files

```
BILL_KB_2   ← BILL_KB_1   (webhook handler writes into the schema BILL_KB_1 defines)
BILL_KB_3   ← BILL_KB_2   (the plan column is populated via webhook sync, then read by the hook)
BILL_KB_3   ← BILL_KB_1   (subscriptions table shape determines what the hook can join on)
BILL_KB_4   ← BILL_KB_2   (lifecycle events all flow through the webhook → outbox → worker pipeline)
BILL_KB_4   ← BILL_KB_3   (gating decisions during cancellation grace periods, trial-end states)
```

Cross-folder dependencies:

```
BILL_KB_1   → SB_KB_1     (subscription belongs to org under union-membership tenancy)
BILL_KB_2   → JOB_KB_1    (outbox row dispatch — webhook is the producer, JOB_KB_1 worker consumes)
BILL_KB_2   → SB_KB_6     (idempotency event-table pattern parallels SB_KB_6's transactional-outbox approach)
BILL_KB_2   → OBS_KB_3    (audit logging for billing state changes)
BILL_KB_3   → AUTH_KB_2   (Custom Access Token Hook mechanics — BILL_KB_3 only adds the billing-specific join)
BILL_KB_3   → SB_KB_12    (InitPlan idiom for performant JWT claim reads in RLS)
BILL_KB_3   → SB_KB_1     (multi-org context — `current_org_id` resolves which plan applies)
BILL_KB_4   → AUTH_KB_4   (re-auth before billing changes — AAL2 step-up before cancel, payment-method swap)
BILL_KB_4   → AUTH_KB_6   (account-deletion interplay — soft-delete Stripe customer, retain for refund window)
BILL_KB_4   → SB_KB_10    (transactional email — trial-end reminder via Resend, dispatched through outbox)
```

---

## When to update these files

Update the relevant BILL_KB when:
- Stripe ships an API version that materially changes a documented field path (e.g., the `invoice.parent.subscription_details.subscription` shift flagged in BILL_KB_2)
- Stripe deprecates or replaces a webhook event name (`invoice.payment_succeeded` vs `invoice.paid` is the canonical example)
- Stripe Customer Portal adds or removes configurable features
- Stripe changes Smart Retries defaults or dunning surface
- The `stripe-node` SDK ships a new major (e.g., the `apiVersion` config shape, error class hierarchy)
- Supabase changes the Custom Access Token Hook signature or `getClaims()` API
- A pattern produces an unexpected result in production
- A new gotcha is discovered

Do not update BILL_KBs to reflect project-specific decisions (price IDs, feature-tier maps, copy). Those belong in project KBs (KB_1 Architecture or a dedicated billing project doc). These are stack patterns, not project docs.

---

## What these files do NOT cover

- **Other payment processors** (Paddle, LemonSqueezy, Braintree, Adyen) — different stack; would need a separate folder if adopted
- **Apple / Google in-app purchase** — mobile-store rules, receipt validation, server-to-server notifications — different domain
- **Manual / offline invoicing** (NET-30 enterprise contracts, ACH-only) — Stripe Invoicing covers some of this, but ops workflows are out of scope for the template
- **Affiliate / commission / marketplace splits** — Stripe Connect is a different product surface; out of scope for the template (multi-org billing here is a single Stripe account, not a Connect platform)
- **Metered / usage-based billing** — mentioned only in "when to outgrow this" callouts in BILL_KB_1 / BILL_KB_4. The template is flat-tier (Free / Starter / Pro / Enterprise).
- **Stripe Pricing Tables / no-code embeds** — explicitly rejected (inflexible for a template); see the NEVER list above
- **Stripe Tax deep coverage** — one-paragraph forward-pointer in BILL_KB_4 only. Tax rules are jurisdictional and project-specific; primary docs are the source.
- **PCI compliance audit guidance** — staying in PCI SAQ-A (lowest scope) is a side-effect of using Stripe Elements / Checkout, not a separately documented practice. If you ever take card data through your servers, you've left this template's scope.

---

## VERIFY BEFORE SHIPPING

Several KBs flag items that primary Stripe / Supabase docs didn't fully confirm or that vary by API-version pin. Search each KB for `[VERIFY BEFORE SHIPPING]` and confirm against current docs before relying on these patterns in production. Notable items:

- Stripe API version pin (e.g., `2026-04-22.dahlia`) — verify the current stable version in the Stripe dashboard and `stripe-node` README before locking in (BILL_KB_1)
- `invoice.subscription` field path — moved from top-level to `invoice.parent.subscription_details.subscription` in recent Stripe API versions; verify against your pinned `apiVersion` (BILL_KB_2)
- Subscription reconciliation pagination strategy at >500 active subscriptions (BILL_KB_2)
- Stripe Trial Offer API (preview, version `2026-03-25`) does NOT support trial-length modification post-creation — legacy `trial_end` updates work but should be exercised in test mode first (BILL_KB_4)
- `getClaims()` requires `@supabase/ssr` >= 0.5 — confirm pinned version before deploying (BILL_KB_3)
- JWT TTL dashboard path in the Supabase project console (BILL_KB_3)

These are not blockers — most are version-gated or project-specific. Re-verify when implementing.
