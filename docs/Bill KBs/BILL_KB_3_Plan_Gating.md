# BILL_KB_3 — Plan Gating: JWT Claims, RLS, Server Actions, and Defense in Depth

**Stack-locked to Supabase Auth (Custom Access Token Hook) + Next.js App Router + Stripe.**

---

## TL;DR

- **The plan claim lives in `app_metadata`, never `user_metadata`.** `app_metadata` in the JWT is injected by the Custom Access Token Hook at every token issuance — it is server-computed and client-unwritable. `user_metadata` is writable by any authenticated user; any policy reading it is trivially spoofable.
- **Multi-org apps carry exactly one plan claim per JWT.** The hook must select a single org context, keyed on `profiles.current_org_id`. Switching orgs requires a `refreshSession()` call to pick up the new org's plan.
- **All RLS plan checks must use the InitPlan form.** Write `(select auth.jwt()->'app_metadata'->>'plan')`, not the bare `auth.jwt()->'app_metadata'->>'plan'`. The subselect hoists JWT decoding to once per statement; without it, Postgres decodes the JWT for every row scanned. Benchmarks show 94.97%–99.993% improvement.
- **Defense in depth is not optional: RLS + Server Action + UI.** RLS is the security floor (enforces even if application layers fail). Server Actions enforce business logic and usage limits that RLS cannot (row counts, quotas). UI gating is UX only — it hides inaccessible features but cannot enforce access control.
- **Stale claims are the primary operational hazard.** The default JWT TTL is 1 hour. When a user upgrades, their JWT still shows the old plan for up to an hour. The canonical fix is to call `supabase.auth.refreshSession()` from a Server Action immediately after the subscription update is confirmed.
- **`getClaims()` requires `@supabase/ssr` >= 0.5.** Projects on older pinned versions may not have the method. Verify before deploying. `[VERIFY BEFORE SHIPPING]`
- **`current_org_id` lives in `profiles.current_org_id`.** This is the template's designated field for the active org context. It is DB-backed (survives logout/re-login) and consistent with the patterns in AUTH_KB_2 and SB_KB_1.

---

## ALWAYS / NEVER

**ALWAYS**
- Read plan from `auth.jwt()->'app_metadata'->>'plan'` — hook-set, server-computed.
- Wrap every JWT function call in a subselect: `(select auth.jwt()->'app_metadata'->>'plan')`.
- Enforce plan in Server Actions via `getClaims()` — never accept plan as a function parameter.
- Pair every RLS SELECT policy with a matching `WITH CHECK` on INSERT/UPDATE.
- Add a btree index on `org_id` for every plan-gated table.
- Call `refreshSession()` after a subscription upgrade so the new plan takes effect immediately.
- Include both USING and WITH CHECK in any policy that guards writes.

**NEVER**
- **NEVER read `user_metadata` for authorization.** Any authenticated user can call `supabase.auth.updateUser({ data: { plan: 'enterprise' } })` from the browser and set arbitrary `user_metadata` fields. An RLS policy reading `auth.jwt()->'user_metadata'->>'plan'` is exploitable with a one-line JS snippet. Supabase Performance Advisor flags this as lint `0015`.
- Never accept plan as a parameter from the client in Server Actions — always read it from the JWT via `getClaims()`.
- Never use `auth.jwt()->'app_metadata'->>'plan'` (bare, without subselect) in policy predicates.
- Never trust a client-supplied `x-plan` or `x-claimed-plan` header for authorization decisions.
- Never call `getSession()` server-side — it trusts the cookie without cryptographic verification. Use `getClaims()`.
- Never mark the hook function `IMMUTABLE` — it reads tables and must be `STABLE`.

---

## Plan-Claim Flow

```
Stripe event (checkout.session.completed / customer.subscription.updated)
  │
  ▼
Next.js Route Handler — webhook (see BILL_KB_2)
  │  Validates Stripe signature
  │  Upserts subscriptions row: status = 'active', plan = 'pro'
  │  Upserts organizations.plan = 'pro'
  ▼
Database: organizations.plan column updated
  │
  ▼
User returns to app → success page invokes refreshSession() Server Action
  │  (or: user signs out and back in — next token issuance picks up the change)
  ▼
Supabase Auth fires the Custom Access Token Hook
  │  Hook queries DB:
  │    SELECT o.plan, om.org_id, om.role
  │    FROM org_members om
  │    JOIN organizations o ON o.id = om.org_id
  │    WHERE om.user_id = (event->>'user_id')::uuid
  │      AND om.org_id = (
  │            SELECT current_org_id FROM profiles
  │            WHERE id = (event->>'user_id')::uuid
  │          )
  │  Hook writes:
  │    claims.app_metadata.plan   = 'pro'
  │    claims.app_metadata.org_id = '<uuid>'
  │    claims.app_metadata.role   = 'member'   -- or 'admin', 'owner'
  ▼
New JWT issued, stored in HTTP-only session cookie
  │
  ▼
Every subsequent request reads:
  (select auth.jwt()->'app_metadata'->>'plan')
  from RLS policies, Server Actions, and UI components
```

**Plan claim is correct as of token issuance time.** If a subscription changes while a JWT is valid, the old plan persists until the next token refresh. See [Stale-Claim Problem + Remediation](#stale-claim-problem--remediation).

Hook setup, registration, required grants, and `STABLE` volatility are covered in AUTH_KB_2 — this KB only covers the billing-specific plan/org join layered on top of that foundation.

Webhook DB update mechanics (subscription upsert, org plan column, idempotency) are in BILL_KB_2.
Schema for `subscriptions`, `organizations`, and `org_members` is in BILL_KB_1.

---

## Multi-Org Plan-Claim Design

A JWT is a single document. `app_metadata.plan` holds exactly one value. A user who belongs to `org_A` (Free) and `org_B` (Pro) can only carry one plan claim at a time. The hook must choose.

### Decision: Current-Org Model (adopted for this template)

**`profiles.current_org_id`** is the designated active-org field. The hook reads the plan only for the org stored there.

This field is:
- DB-backed — survives logout/re-login and works across devices
- A single FK to `organizations.id` — simple to query in the hook
- Consistent with the profile-centric model in SB_KB_1 and AUTH_KB_2

```sql
-- Hook query: current-org model (billing additions to AUTH_KB_2 base hook)
SELECT o.plan, om.org_id, om.role
INTO   user_row
FROM   public.org_members om
JOIN   public.organizations o ON o.id = om.org_id
WHERE  om.user_id = (event->>'user_id')::uuid
  AND  om.org_id = (
         SELECT current_org_id
         FROM   public.profiles
         WHERE  id = (event->>'user_id')::uuid
       )
LIMIT 1;
```

**Required table grants** (add to the hook migration alongside AUTH_KB_2 grants):

```sql
grant select on table public.profiles      to supabase_auth_admin;
grant select on table public.organizations to supabase_auth_admin;
grant select on table public.org_members   to supabase_auth_admin;
```

**Org-switching UX implication:** when a user switches their active org (updating `profiles.current_org_id`), the app must call `refreshSession()` to issue a new JWT reflecting the new org's plan. Until that refresh, the JWT still carries the previous org's plan.

### Rejected Alternatives

**Highest-plan-wins** — Aggregate the max plan tier across all org memberships. Rejected because it grants Pro/Enterprise features when the *user* has that plan somewhere, not the *org being accessed*. For B2B apps where feature access is org-scoped, a user on a Free plan in `org_A` should not unlock Pro features in `org_A` because they are also a Pro member of `org_B`. Creates a cross-org privilege escalation path.

**Array of `(org_id, plan)` pairs** — Store all org plans as a JSON array in `app_metadata`. Rejected because RLS policies must then deserialize and search the array for the current org, making every policy predicate substantially more complex. JWT size also grows unboundedly with the number of org memberships. Only viable if RLS must simultaneously gate by per-org plan across all orgs — a requirement this template does not have.

---

## Custom Access Token Hook — Billing Additions

> AUTH_KB_2 covers the complete hook scaffold: function signature, required claims, permissions, registration, volatility, and common gotchas. Read it first. This section shows only the billing-specific additions layered on top.

Add the plan/org join to the `user_row` select, then inject `plan` alongside the existing `org_id` and `role` writes:

```sql
-- -------------------------------------------------------
-- Custom Access Token Hook — billing layer
-- Add to / replace the base hook from AUTH_KB_2
-- -------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable  -- NOT immutable; queries tables
as $$
declare
  claims   jsonb;
  user_row record;
begin
  -- Billing addition: join organizations via current_org_id in profiles.
  -- Falls back gracefully: if current_org_id is null or no matching membership
  -- exists, user_row fields will be null and claims are left at defaults.
  select
    om.org_id,
    om.role,
    o.plan
  into user_row
  from public.org_members om
  join public.organizations o on o.id = om.org_id
  where om.user_id = (event->>'user_id')::uuid
    and om.org_id = (
          select current_org_id
          from   public.profiles
          where  id = (event->>'user_id')::uuid
        )
  limit 1;

  claims := event->'claims';

  -- Ensure app_metadata key exists
  if jsonb_typeof(claims->'app_metadata') is null then
    claims := jsonb_set(claims, '{app_metadata}', '{}');
  end if;

  if user_row.org_id is not null then
    claims := jsonb_set(claims, '{app_metadata,org_id}', to_jsonb(user_row.org_id::text));
    claims := jsonb_set(claims, '{app_metadata,role}',   to_jsonb(user_row.role::text));
    -- Billing addition: write plan claim from organizations table
    claims := jsonb_set(claims, '{app_metadata,plan}',   to_jsonb(user_row.plan::text));
  end if;

  -- Do NOT override the aal claim — it is set by Supabase Auth before the hook fires.
  -- See AUTH_KB_2 and AUTH_KB_3 for MFA/AAL enforcement patterns.

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- Permissions: required grants for billing tables (extend AUTH_KB_2 grants)
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

grant select on table public.org_members   to supabase_auth_admin;
grant select on table public.organizations to supabase_auth_admin;
grant select on table public.profiles      to supabase_auth_admin;
```

**Silent failure symptom:** if `supabase_auth_admin` lacks SELECT on any of these tables, `app_metadata.plan` will be absent from the JWT without any visible error to the user. Check Supabase → Database → Logs → Postgres logs for permission errors from the hook. → see AUTH_KB_2 Gotchas: "Missing table grants cause silent claim omission."

---

## RLS Gating

All policies use the `(select ...)` InitPlan form per SB_KB_12. The `org_id` claim is also InitPlan-wrapped where used. Every example reads from `app_metadata` — never `user_metadata`.

→ For the performance rationale, see SB_KB_12.
→ For org-isolation policy patterns without plan gating, see SB_KB_1.

### Pattern 1 — Paid-plan-only feature table

```sql
-- Feature available on starter, pro, or enterprise; blocked for free tier.
create policy "advanced_analytics: paid plans only"
  on public.advanced_analytics
  for select
  to authenticated
  using (
    (select auth.jwt()->'app_metadata'->>'plan') in ('starter', 'pro', 'enterprise')
  );

create index on public.advanced_analytics (org_id);
```

### Pattern 2 — Plan gate combined with org isolation

Use this when a feature is both plan-restricted and must be scoped to the user's active org. Both conditions must be true; neither is sufficient alone.

```sql
-- Pro/Enterprise feature AND the row must belong to the user's current org.
create policy "ai_feature_usage: pro plan + org isolation"
  on public.ai_feature_usage
  for all
  to authenticated
  using (
    org_id = (select (auth.jwt()->'app_metadata'->>'org_id')::uuid)
    and (select auth.jwt()->'app_metadata'->>'plan') in ('pro', 'enterprise')
  )
  with check (
    org_id = (select (auth.jwt()->'app_metadata'->>'org_id')::uuid)
    and (select auth.jwt()->'app_metadata'->>'plan') in ('pro', 'enterprise')
  );

create index on public.ai_feature_usage (org_id);
```

### Pattern 3 — Tiered SELECT: free sees own rows only; paid sees all org rows

RLS cannot enforce row-count limits directly — use a Server Action for write-time count enforcement (see [Server Action Gating](#server-action-gating)). RLS can enforce what rows are *visible* based on plan tier:

```sql
-- Free: user sees only rows they created.
-- Pro/Enterprise: user sees all rows in their org.
create policy "reports: tiered visibility by plan"
  on public.reports
  for select
  to authenticated
  using (
    case
      when (select auth.jwt()->'app_metadata'->>'plan') in ('pro', 'enterprise')
        then org_id = (select (auth.jwt()->'app_metadata'->>'org_id')::uuid)
      else
        created_by = (select auth.uid())
    end
  );

create index on public.reports (org_id);
create index on public.reports (created_by);
```

### Pattern 4 — Enterprise plan combined with role gate

Some features require both the right plan tier and a specific role within that org. Gate both at the RLS layer so neither condition can be bypassed independently.

```sql
-- Enterprise plan AND the user must be an admin or owner of their org.
create policy "sso_configurations: enterprise admins only"
  on public.sso_configurations
  for all
  to authenticated
  using (
    org_id = (select (auth.jwt()->'app_metadata'->>'org_id')::uuid)
    and (select auth.jwt()->'app_metadata'->>'plan') = 'enterprise'
    and (select auth.jwt()->'app_metadata'->>'role') in ('admin', 'owner')
  )
  with check (
    org_id = (select (auth.jwt()->'app_metadata'->>'org_id')::uuid)
    and (select auth.jwt()->'app_metadata'->>'plan') = 'enterprise'
    and (select auth.jwt()->'app_metadata'->>'role') in ('admin', 'owner')
  );

create index on public.sso_configurations (org_id);
```

---

## Server Action Gating

Server Actions run on the server with full cookie access and can read the current JWT. **Never accept plan as a function parameter from the client** — the client controls what it sends; always derive plan from the JWT.

> `getClaims()` requires `@supabase/ssr` >= 0.5. `[VERIFY BEFORE SHIPPING]` — confirm the installed version before deploying. It validates the JWT signature against the project JWKS (no Auth-server round-trip on asymmetric-key projects; falls back to a network call on older symmetric-key projects).

```typescript
// lib/plan.ts — server-only plan helpers
// 'server-only' import prevents this module from being bundled client-side
import 'server-only'
import { createClient } from '@/lib/supabase/server'

export type PlanTier = 'free' | 'starter' | 'pro' | 'enterprise'

/**
 * Read the plan claim from the current JWT.
 * Never trust a plan passed as a parameter — always call this.
 */
export async function getCurrentPlan(): Promise<PlanTier | null> {
  const supabase = await createClient()
  // getClaims() validates JWT signature against JWKS.
  // It does NOT refresh the token — call refreshSession() explicitly when you need fresh claims.
  const { data: { claims }, error } = await supabase.auth.getClaims()
  if (error || !claims) return null
  return (claims?.app_metadata?.plan as PlanTier) ?? null
}

/**
 * Throw if the current plan is not in the allowed tiers.
 * Call at the top of any plan-gated Server Action.
 */
export async function requirePlan(
  allowed: PlanTier[],
  message = 'This feature requires a paid plan.'
): Promise<void> {
  const plan = await getCurrentPlan()
  if (!plan || !allowed.includes(plan)) {
    throw new Error(message)
  }
}

/**
 * DB-verified plan check for billing-critical operations.
 * Bypasses JWT staleness — reads the live value from organizations.
 * Use only when 1-hour staleness is unacceptable (e.g., enabling a high-cost feature).
 */
export async function getVerifiedPlan(orgId: string): Promise<PlanTier> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organizations')
    .select('plan')
    .eq('id', orgId)
    .single()
  if (error || !data) return 'free'
  return data.plan as PlanTier
}
```

```typescript
// actions/ai-features.ts — plan-gated Server Action
'use server'
// Next.js: "Always authenticate and authorize users before performing sensitive
// server-side operations. Read authentication from cookies or headers rather than
// accepting tokens as function parameters." — Next.js use server directive docs

import { createClient } from '@/lib/supabase/server'
import { requirePlan } from '@/lib/plan'

export async function generateAIReport(input: { prompt: string }) {
  const supabase = await createClient()

  // Step 1: verify authentication
  const { data: { claims }, error } = await supabase.auth.getClaims()
  if (error || !claims) {
    throw new Error('Unauthorized')
  }

  // Step 2: verify plan (reads from JWT — not from input)
  // RLS on the destination table provides a third enforcement layer at insert time.
  await requirePlan(['pro', 'enterprise'], 'AI reports require Pro or Enterprise plan.')

  // Step 3: read org from JWT (not from client input)
  const orgId = claims?.app_metadata?.org_id as string | undefined
  if (!orgId) throw new Error('No org context in session.')

  // Step 4: execute — RLS policy on ai_reports enforces plan + org isolation again
  const { data, error: insertError } = await supabase
    .from('ai_reports')
    .insert({ org_id: orgId, prompt: input.prompt, created_by: claims.sub })
    .select()
    .single()

  if (insertError) throw new Error(insertError.message)
  return data
}
```

```typescript
// actions/projects.ts — enforcing per-plan row count limits at write time
// RLS cannot count rows. This check must live in the Server Action.
'use server'

import { createClient } from '@/lib/supabase/server'
import { getCurrentPlan, type PlanTier } from '@/lib/plan'

const PLAN_LIMITS: Record<PlanTier, number> = {
  free:       3,
  starter:    25,
  pro:        Infinity,
  enterprise: Infinity,
}

export async function createProject(name: string) {
  const supabase = await createClient()

  const { data: { claims }, error } = await supabase.auth.getClaims()
  if (error || !claims) throw new Error('Unauthorized')

  const plan    = ((claims?.app_metadata?.plan as PlanTier) ?? 'free')
  const orgId   = claims?.app_metadata?.org_id as string
  if (!orgId) throw new Error('No org context in session.')

  // Count check — must happen before the insert
  const { count } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)

  const limit = PLAN_LIMITS[plan] ?? 3
  if ((count ?? 0) >= limit) {
    throw new Error(
      `Your ${plan} plan allows up to ${limit} projects. Upgrade to add more.`
    )
  }

  const { data, error: insertError } = await supabase
    .from('projects')
    .insert({ org_id: orgId, name })
    .select()
    .single()

  if (insertError) throw new Error(insertError.message)
  return data
}
```

---

## UI Gating

UI gating is **UX only** — it hides features the user cannot access. It does not enforce security. A determined user can bypass any UI gate by calling the Server Action directly, navigating to the URL, or crafting a fetch request. The Server Action (layer 2) and RLS (layer 3) enforce access regardless of what the UI renders.

### Server Component — preferred; plan resolved before HTML is sent

```typescript
// app/dashboard/ai-features/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { AIFeaturesPanel } from './ai-features-panel'
import { UpgradeBanner } from '@/components/upgrade-banner'

export default async function AIFeaturesPage() {
  const supabase = await createClient()
  const { data: { claims } } = await supabase.auth.getClaims()

  if (!claims) {
    redirect('/login')
  }

  const plan      = (claims?.app_metadata?.plan as string) ?? 'free'
  const isPaidPlan = ['pro', 'enterprise'].includes(plan)

  // Conditional render is server-side — no flicker, no client-side guard required
  if (!isPaidPlan) {
    return (
      <UpgradeBanner
        currentPlan={plan}
        requiredPlan="pro"
        message="AI features are available on Pro and Enterprise plans."
      />
    )
  }

  return (
    <Suspense fallback={<div>Loading AI features…</div>}>
      <AIFeaturesPanel orgId={claims.app_metadata.org_id as string} />
    </Suspense>
  )
}
```

### Client Component — receive plan as a prop from the Server Component parent

Do not read the JWT from a Client Component. Resolve plan in a Server Component or layout and pass it down as a serialized prop.

```typescript
// app/dashboard/layout.tsx — Server Component
import { createClient } from '@/lib/supabase/server'
import { DashboardShell } from '@/components/dashboard-shell'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { claims } } = await supabase.auth.getClaims()

  const plan  = (claims?.app_metadata?.plan as string) ?? 'free'
  const orgId = claims?.app_metadata?.org_id as string | undefined

  return (
    <DashboardShell plan={plan} orgId={orgId}>
      {children}
    </DashboardShell>
  )
}
```

```typescript
// components/dashboard-shell.tsx — Client Component
'use client'

interface DashboardShellProps {
  plan:     string
  orgId?:   string
  children: React.ReactNode
}

export function DashboardShell({ plan, orgId, children }: DashboardShellProps) {
  const isPro        = ['pro', 'enterprise'].includes(plan)
  const isEnterprise = plan === 'enterprise'

  return (
    <div>
      <nav>
        {/* UI gating: conceal navigation items for inaccessible features */}
        {isPro        && <NavItem href="/dashboard/ai">AI Features</NavItem>}
        {isEnterprise && <NavItem href="/dashboard/sso">SSO Config</NavItem>}
      </nav>
      <main>{children}</main>
    </div>
  )
}
```

---

## Defense in Depth

Three independent layers must all fail for a feature gate to be breached. Each layer handles what the others cannot.

```
REQUEST
  │
  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 0 — middleware.ts                                                │
│  Refreshes expired JWT if refresh token is valid.                       │
│  Redirects unauthenticated users to /login.                             │
│  Does NOT enforce plan — that happens in the layers below.              │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ Valid session cookie passes through
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 1 — UI (Server Component or Client Component)                    │
│  Reads plan from JWT claims. Conditionally renders features.            │
│  PURPOSE: UX — hides buttons and pages the user cannot use.            │
│  WEAKNESS: Bypassed by direct URL navigation or a crafted fetch call.  │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ User invokes a Server Action or Route Handler
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 2 — Server Action / Route Handler                                │
│  Reads plan from JWT via getClaims() — never from client input.        │
│  Checks plan tier before any DB operation.                              │
│  Enforces usage limits (row counts, API quota) that RLS cannot.        │
│  PURPOSE: Business-logic enforcement + user-facing error messages.     │
│  WEAKNESS: Developer must add the check. Easy to forget.               │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ DB query executes under the user's JWT context
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  LAYER 3 — RLS (Postgres Row-Level Security)                           │
│  Reads (select auth.jwt()->'app_metadata'->>'plan') once per statement.│
│  Denies reads/writes if the plan claim does not satisfy the policy.    │
│  PURPOSE: Security floor — enforces even if layers 1 and 2 both fail. │
│  WEAKNESS: Stale JWT claim if user upgraded but has not refreshed.     │
└─────────────────────────────────────────────────────────────────────────┘
```

| Layer | What it enforces | What it cannot enforce | Required for security? |
|---|---|---|---|
| UI gate | Hides inaccessible features | Nothing — bypassed by direct calls | No (UX only) |
| Server Action | Business logic; usage limits; error messages | DB-level row isolation | Yes |
| RLS | Data isolation at the row level | Usage counts; soft limits | Yes |

**Why skipping any enforcement layer fails:**
- Skip RLS: a direct PostgREST request or a Server Action that forgets the `requirePlan()` call gives full data access regardless of plan.
- Skip Server Action checks: usage-limit enforcement (row counts, quota) has no layer — RLS cannot count rows.
- Skip UI gating: users see controls for features they cannot use, causing friction and confusing error messages — not a security failure, but a poor experience.

---

## Stale-Claim Problem + Remediation

### The problem

The JWT access token defaults to a 1-hour TTL. When a user upgrades from Free to Pro:

1. Stripe fires `customer.subscription.updated`
2. Webhook handler updates `organizations.plan = 'pro'` in the DB
3. The user's current JWT still says `plan = 'free'` for up to 1 hour
4. RLS policies and Server Action checks read `free` — the user cannot access their new plan's features

The same dynamic applies to **downgrades**: the user's JWT continues showing the old plan until the next refresh. For downgrades, this means old-plan access persists briefly after cancellation — an acceptable window for most apps; confirm with your business requirements.

### Option 1 — Force refresh after plan change (recommended)

Trigger a `refreshSession()` call from a Server Action on the success page the user lands on after upgrading. This re-fires the Custom Access Token Hook, which reads the current DB state and issues a JWT with the updated plan.

```typescript
// actions/post-upgrade.ts
// Called from the upgrade-success page or Stripe redirect handler
'use server'

import { createClient } from '@/lib/supabase/server'

export async function refreshPlanClaim() {
  const supabase = await createClient()

  // refreshSession() exchanges the current refresh token for a new access token,
  // re-firing the Custom Access Token Hook. Source: Supabase auth.refreshSession() docs —
  // "Returns a new session, regardless of expiry status." Requires a valid refresh token.
  const { data, error } = await supabase.auth.refreshSession()
  if (error) {
    // Log but do not throw — the user can still use the app; the JWT will self-correct
    // within the TTL window. Don't block the success page on a refresh failure.
    console.error('Failed to refresh session after plan upgrade:', error.message)
    return null
  }
  return data.session
}
```

**Placement constraint:** `refreshSession()` writes the new JWT to the session cookie. It requires a context with full cookie write access. Call it from a **Server Action or Route Handler** — never from a pure Server Component (which cannot write cookies). → see AUTH_KB_2 Gotchas: "`refreshSession()` scope and placement."

**End-to-end flow:**
1. Stripe fires webhook → webhook Route Handler updates DB
2. User is redirected to `/upgrade/success` (Stripe `success_url`)
3. Success page renders a Server Component that invokes `refreshPlanClaim()` Server Action
4. New JWT with `plan = 'pro'` is written to the cookie
5. User immediately sees Pro features on page load

> **What about users on a different tab or device?** A user mid-session on another tab will not get the refresh automatically. The Realtime-driven approach (Option 4) handles this case. For most apps, the 1-hour self-correction window is acceptable for the multi-tab case.

### Option 2 — DB verification for billing-critical paths

For Server Actions that gate high-cost or irreversible operations, bypass the JWT entirely and read the live plan from `organizations`:

```typescript
// lib/plan.ts — see getVerifiedPlan() in the Server Action Gating section
// Use getCurrentPlan() for normal gating; getVerifiedPlan() only for critical paths.
```

Overhead: one additional DB query per critical action. Acceptable for low-frequency operations (enabling SSO, provisioning seats); too expensive for high-frequency reads.

### Option 3 — Shorten JWT TTL (partial mitigation)

Reduce the access token TTL in Supabase dashboard → Auth → Settings → JWT expiry. A shorter TTL means stale claims self-correct faster.

- Below 5 minutes: not recommended — clock skew, refresh load, and poor UX on slow networks
- 15 minutes: reasonable compromise for plan-sensitive apps
- Default (1 hour): acceptable if Option 1 is implemented for upgrades

`[VERIFY BEFORE SHIPPING]` — Confirm the exact dashboard path for JWT TTL in your project console.

### Option 4 — Realtime-driven refresh (gold standard for UX)

Subscribe to the user's `organizations` row via Supabase Realtime in the browser. When `plan` changes, trigger `supabase.auth.refreshSession()` client-side immediately.

```typescript
// Conceptual — implement when Option 1 is insufficient
supabase
  .channel('org-plan-watch')
  .on('postgres_changes', {
    event:  'UPDATE',
    schema: 'public',
    table:  'organizations',
    filter: `id=eq.${orgId}`,
  }, () => {
    supabase.auth.refreshSession()
  })
  .subscribe()
```

Handles the multi-tab and multi-device case. Adds Realtime subscription management complexity. Defer until the 1-hour staleness window is measured as a real problem.

---

## Pitfalls

### `user_metadata` vs `app_metadata` — the most common security error

> **`user_metadata` is client-writable.** Any authenticated user can call `supabase.auth.updateUser({ data: { plan: 'enterprise' } })` from the browser JS console and set arbitrary fields in `user_metadata`. An RLS policy or Server Action check that reads `auth.jwt()->'user_metadata'->>'plan'` is exploitable with a one-line command.

Supabase Performance Advisor flags this as lint `0015`.

```sql
-- WRONG — exploitable by any authenticated user
create policy "bad_plan_gate" on some_table
  for select using (
    (select auth.jwt()->'user_metadata'->>'plan') = 'enterprise'
  );
```

```sql
-- CORRECT — app_metadata is set by the Custom Access Token Hook (server-side Postgres function)
create policy "correct_plan_gate" on some_table
  for select using (
    (select auth.jwt()->'app_metadata'->>'plan') = 'enterprise'
  );
```

`app_metadata` in the JWT is whatever the hook injects at issuance time — computed from DB tables by a server-side function, never from client-supplied values. → see AUTH_KB_2 Gotchas: "`app_metadata` on the user record vs. `app_metadata` in the JWT."

### Trusting client-supplied plan headers or parameters

```typescript
// WRONG — client controls this value
export async function gatedAction(plan: string, data: unknown) {
  if (plan !== 'pro') throw new Error('Unauthorized')
  // ...
}

// CORRECT — server reads plan from the JWT
export async function gatedAction(data: unknown) {
  await requirePlan(['pro', 'enterprise'])
  // ...
}
```

Never accept `x-plan`, `x-claimed-tier`, or any client-supplied authorization assertion. Always derive plan from `getClaims()` in the Server Action body.

### Forgetting to refresh after webhook (silent gating failure)

The Stripe webhook fires asynchronously on the server. The DB is updated. But if no `refreshSession()` call is triggered, the user's JWT still shows the old plan. **They see the upgrade confirmation but cannot access their new features.** This is one of the most common silent failures in billing implementations.

Mitigation: always trigger `refreshPlanClaim()` from the upgrade-success Server Action. Log the refresh result; alert if it fails consistently.

### JWT TTL too long (slow plan propagation on downgrades)

With the default 1-hour TTL, a cancelled subscription continues granting access for up to 1 hour after the webhook fires and updates the DB. For most SaaS apps this is acceptable. If it is not — e.g., the app provides access to high-value data where 1-hour post-cancellation access is a business problem — reduce the TTL or add DB verification (`getVerifiedPlan()`) on the most sensitive operations.

### Missing `WITH CHECK` on write policies

A `USING` clause without a matching `WITH CHECK` on UPDATE lets users mutate `org_id` to an org they do not belong to, silently moving rows across tenants. All update and insert policies must include `WITH CHECK` with the same conditions as `USING`. → see SB_KB_1 Anti-patterns.

### `getClaims()` does not refresh the token

`getClaims()` validates the JWT signature of the current cookie value. It does not issue a new token or pick up recent DB changes. If you need fresh claims after a permission change, call `refreshSession()` explicitly from a Server Action before calling `getClaims()`. → see AUTH_KB_2 Gotchas: "`getClaims()` does not refresh expired tokens."

---

## When to Outgrow This

The plan-tier model (Free / Starter / Pro / Enterprise) covers most early-stage B2B SaaS requirements. Outgrow it when:

**Feature flags are needed.** Plan tiers are coarse buckets. When you need A/B testing, beta access for select users independent of plan, or gradual rollouts (e.g., a Pro feature available to only 10% of Pro users), add a `feature_flags` table and inject a `flags` claim from the hook alongside `plan`. Start with plan tiers only; add flags when a specific rollout use case emerges.

**Per-feature pricing.** Metered billing (pay-per-use, per-seat, per-API-call) does not map to a plan tier. At that point, feature gating becomes an entitlement query against a usage/quota table, not a string comparison against a JWT claim. The Server Action layer absorbs this complexity well; the RLS layer becomes a quota check via a SECURITY DEFINER function rather than a plan string comparison.

**Real-time entitlement changes.** If plan changes need to take effect within seconds (not minutes), the JWT-claim model's inherent staleness becomes a constraint. Move to Realtime-driven refresh (Option 4 above) or to server-side DB verification (`getVerifiedPlan()`) as the primary check, with JWT claims kept only for fast-path UI gating.

---

## Cross-References

| Topic | KB |
|---|---|
| Hook mechanics — function scaffold, permissions, registration, gotchas | AUTH_KB_2 |
| InitPlan idiom, RLS performance, lint 0015 | SB_KB_12 |
| Multi-org union membership, `private.get_my_org_ids()`, recursive-RLS pitfall | SB_KB_1 |
| Billing schema — `subscriptions`, `organizations.plan`, `stripe_customers` | BILL_KB_1 |
| Webhook handler, plan column sync, subscription state machine | BILL_KB_2 |
| Customer portal, trial logic, cancellation flows | BILL_KB_4 |
| AAL2 / MFA enforcement using the `aal` claim the hook passes through | AUTH_KB_3, AUTH_KB_2 |
| `getClaims()` vs `getSession()` — server-side auth patterns | AUTH_KB_4 |
| Signup trigger that creates initial `org_members` row the hook reads | AUTH_KB_5 |
