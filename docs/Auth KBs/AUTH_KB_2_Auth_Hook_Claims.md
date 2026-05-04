# AUTH_KB_2 — Custom JWT Claims via the Auth Hook

**Stack-locked to Supabase Auth (Custom Access Token Hook). Concept of server-set claims is portable.**

---

## Pattern

SB_KB_1 and SB_KB_12 both tell you to read claims from `auth.jwt()->'app_metadata'` in RLS policies — but neither shows you how those claims get there. This KB closes that loop.

The mechanism: a Postgres function (or HTTPS endpoint) is registered in the Supabase dashboard under Auth → Hooks → Custom Access Token. Supabase Auth calls it on every JWT issuance — every login, session refresh, and token exchange. The function receives the in-progress token as a JSONB event, computes server-truth claims from application tables (`org_id`, `role`, `plan`, etc.), injects them into `app_metadata`, and returns the modified event. The resulting JWT carries those claims for the life of the access token (default: 1 hour).

The hook is the only way to get server-computed facts into the JWT without an admin API call. It is the foundation that makes JWT-based RLS policies correct and safe.

---

## When to use / when to skip

**Use a Custom Access Token Hook when:**
- RLS policies need to read server-set facts about the user (org membership, role, plan tier)
- You want `(select auth.jwt()->'app_metadata'->>'org_id')` in policy predicates instead of a per-query DB lookup (see SB_KB_12 on why the InitPlan form matters)
- The app has roles that can change server-side (promotions, plan upgrades) and you need those changes reflected in the JWT
- AAL2 enforcement is needed — the `aal` claim set by Supabase Auth flows through here and can be read by RLS policies gating sensitive operations (see AUTH_KB_3)
- You need plan-gated feature access enforced at the database layer, not just the UI layer

**Skip when:**
- Single-tenant, single-role app — `auth.uid()` in policies is sufficient
- Claims are only used in application code (not RLS), and you're fine querying the DB directly in Server Actions
- The data changes so frequently that 1-hour claim staleness is unacceptable and you cannot force-refresh reliably

---

## Anti-patterns

**Storing roles in `user_metadata` instead of `app_metadata`**
`user_metadata` is writable by any authenticated user via `supabase.auth.updateUser()`. Any RLS policy reading `auth.jwt()->'user_metadata'` for authorization can be bypassed by a user setting their own role. Always use `app_metadata` for server-set authorization facts. Supabase Performance Advisor flags this as lint `0015`.

**Computing claims client-side**
JWT claims must be set server-side — either via the hook or via the admin API (`supabase.auth.admin.updateUserById`). Deriving roles or org membership from client-readable data without server verification is not authorization; it is a suggestion.

**Forgetting to revoke EXECUTE from public / anon / authenticated**
Without the revoke, any authenticated user can invoke the hook function directly as a SQL query, inspect its logic, or cause unintended side effects. The revoke is not optional.
```sql
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
```

**Forgetting table grants for `supabase_auth_admin`**
If the hook queries `public.org_members` but `supabase_auth_admin` has no SELECT on that table, the hook silently fails and custom claims never appear in the JWT. This is the most common cause of "hook registered, but `app_metadata` is empty." Every table the hook touches needs an explicit grant.

**Not using the InitPlan form in RLS policies**
Writing `auth.jwt()->'app_metadata'->>'org_id'` instead of `(select auth.jwt()->'app_metadata'->>'org_id')` causes Postgres to decode the JWT for every row in a scan rather than once per statement. On large tables this is a severe regression. SB_KB_12 documents the benchmark improvement as up to 99.993%. Always wrap in a subselect.

**Dropping required claims from the return value**
The hook must return the full `event` JSONB including all required claims: `iss`, `aud`, `exp`, `iat`, `sub`, `role`, `aal`, `session_id`, `email`, `phone`, `is_anonymous`. Always start from `event->'claims'` and layer changes on top. Returning a stripped claims object fails token issuance.

**Overriding the `aal` claim**
`aal` is set by Supabase Auth before the hook fires, based on actual MFA session state. The hook receives it in `event->'claims'->>'aal'` and may read it, but must not override it. Overriding `aal` defeats MFA enforcement. AUTH_KB_3 covers how AAL2 policies use the value this hook passes through.

**Marking the hook function `IMMUTABLE`**
`IMMUTABLE` tells Postgres the function always returns the same value for the same arguments — enabling cross-transaction caching. A hook function that queries tables is not immutable; results change when membership data changes. Use `STABLE` (same result within one transaction) or omit volatility (defaults to `VOLATILE`).

---

## Generic example

```sql
-- -------------------------------------------------------
-- Hook function: inject org_id, role, plan into app_metadata
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
  -- Read application state for this user.
  -- Uses LIMIT 1 — see Gotchas for multi-org considerations.
  select
    om.org_id,
    om.role,
    o.plan
  into user_row
  from public.org_members om
  join public.organizations o on o.id = om.org_id
  where om.user_id = (event->>'user_id')::uuid
  limit 1;

  claims := event->'claims';

  -- Ensure app_metadata key exists before writing into it
  if jsonb_typeof(claims->'app_metadata') is null then
    claims := jsonb_set(claims, '{app_metadata}', '{}');
  end if;

  -- Inject claims. Only write if we found a row; otherwise leave claims untouched.
  if user_row.org_id is not null then
    claims := jsonb_set(claims, '{app_metadata,org_id}', to_jsonb(user_row.org_id::text));
    claims := jsonb_set(claims, '{app_metadata,role}',   to_jsonb(user_row.role::text));
    claims := jsonb_set(claims, '{app_metadata,plan}',   to_jsonb(user_row.plan::text));
  end if;

  -- aal is already in claims as a required field set by Supabase Auth.
  -- Do NOT override it. Read it here if you need to gate other claims on MFA status.

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- -------------------------------------------------------
-- Permissions — all four lines are required
-- -------------------------------------------------------
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;

-- Repeat for every table the hook reads
grant select on table public.org_members    to supabase_auth_admin;
grant select on table public.organizations  to supabase_auth_admin;
-- Only add the revokes below if the tables are not already gated by RLS for those roles
-- revoke all on table public.org_members   from authenticated, anon, public;
-- revoke all on table public.organizations from authenticated, anon, public;
```

After deploying this migration, register the function in the Supabase dashboard: Auth → Hooks → Custom Access Token Hook → select `public.custom_access_token_hook`.

```sql
-- -------------------------------------------------------
-- RLS policies reading the hook-set claims
-- Always use the (select ...) InitPlan form — see SB_KB_12
-- -------------------------------------------------------

-- Org isolation: documents belong to the user's org
create policy "documents: own org only"
  on public.documents
  for all
  to authenticated
  using (
    org_id = (select (auth.jwt()->'app_metadata'->>'org_id')::uuid)
  );

-- Role check: only admins reach billing settings
create policy "billing_settings: admins only"
  on public.billing_settings
  for all
  to authenticated
  using (
    (select auth.jwt()->'app_metadata'->>'role') = 'admin'
  );

-- Plan-gated feature: pro/enterprise only
create policy "advanced_reports: pro plan only"
  on public.advanced_reports
  for select
  to authenticated
  using (
    (select auth.jwt()->'app_metadata'->>'plan') in ('pro', 'enterprise')
  );

-- AAL2 required for sensitive deletes (AUTH_KB_3 covers MFA setup)
create policy "sensitive_records: require mfa for delete"
  on public.sensitive_records
  for delete
  to authenticated
  using (
    (select auth.jwt()->>'aal') = 'aal2'
  );
```

```typescript
// Force-refresh claims after a server-side role change
// Works in a Route Handler or Server Action with full cookie access.
// Pure Server Components cannot force a refresh — trigger from the client instead.

// app/actions/refresh-claims.ts
'use server'

import { createClient } from '@/utils/supabase/server'

export async function refreshUserClaims() {
  const supabase = await createClient()

  // refreshSession() calls the refresh token endpoint,
  // which re-fires the Custom Access Token Hook and issues a new JWT
  // with current claims from the database.
  const { data, error } = await supabase.auth.refreshSession()
  if (error) throw error
  return data.session
}
```

```typescript
// Read claims safely in server code — validates JWT signature cryptographically.
// Never use getSession() in server code; it trusts the cookie value without verification.

import { createClient } from '@/utils/supabase/server'

export async function getOrgId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { claims } } = await supabase.auth.getClaims()
  return (claims?.app_metadata?.org_id as string) ?? null
}
```

---

## Trade-offs

| Hook implementation | Latency | Debuggability | When to use |
|---|---|---|---|
| Postgres function | Sub-millisecond (in-process, no network hop) | `raise log` statements visible in Supabase logs; testable with `select public.custom_access_token_hook(...)` | Default for all new projects |
| HTTPS endpoint (Edge Function or external) | Round-trip latency, 5ms–50ms+; cold starts apply; 5-second total budget with 3 retries | Standard HTTP logs; easier to unit-test in isolation | When hook needs an external API (billing service, entitlement check) or the team has no PL/pgSQL expertise |

The Postgres function is the correct default. The HTTPS path introduces infrastructure complexity, cold-start risk, and a hard 5-second budget that can block login if the endpoint is slow or unavailable.

---

## Gotchas

**Claim staleness (1-hour default TTL)**
The access token TTL defaults to 1 hour. A user promoted to admin, moved to a new org, or upgraded to a pro plan will continue presenting old claims until their token expires or a refresh is forced. Three mitigations: (1) reduce the TTL via the Supabase dashboard Auth settings — though values below 5 minutes are discouraged due to load and clock skew; (2) call `supabase.auth.refreshSession()` from the client immediately after a server-side change; (3) for critical operations (billing, destructive actions), re-verify the user's role directly from the database in the Server Action instead of trusting the JWT claim alone.

`[VERIFY BEFORE SHIPPING]` — The exact dashboard path for changing the access token TTL could not be confirmed from primary documentation. Locate it in your project before relying on a shortened TTL.

**`refreshSession()` scope and placement**
`refreshSession()` requires the browser's refresh token cookie. It can be called from a Route Handler or a Server Action that has full cookie access. It cannot be called from a pure Server Component. If you need to force a refresh after a server-side change, the cleanest pattern is: server mutates data → returns a flag to the client → client calls a `refreshSession()` wrapper → client reloads the page or re-fetches.

**`getClaims()` does not refresh expired tokens.** It validates the signature of whatever JWT is currently in the cookie against the project JWKS — nothing more. If you need fresh claims after a server-side permission change, call `supabase.auth.refreshSession()` explicitly (Route Handler or Server Action — Server Components can't write cookies). Do not assume `getClaims()` will pick up new claims on its own.

**`aal` is an input to the hook, not an output**
The `aal` value in `event->'claims'->>'aal'` is set by Supabase Auth based on the MFA state of the current session before the hook fires. The hook can read it (e.g., to only inject `org_id` when `aal = 'aal2'`) but must not write it. AUTH_KB_3 covers how to configure AAL2 enforcement policies that consume this claim.

**`app_metadata` on the user record vs. `app_metadata` in the JWT**
These are distinct. `auth.users.raw_app_meta_data` is the stored column, server-writable via `supabase.auth.admin.updateUserById(uid, { app_metadata: {...} })`. The `app_metadata` in the JWT is whatever the hook injects at issuance time. The hook can read `event->'claims'->'app_metadata'` (which Supabase pre-populates from the stored column) OR it can ignore that entirely and compute claims dynamically from application tables. Dynamic computation from tables is generally preferable — it stays synchronized with application state without requiring a separate admin API write on every permission change.

`[VERIFY BEFORE SHIPPING]` — The exact payload shape for `supabase.auth.admin.updateUserById` (`{ app_metadata: { org_id: '...' } }`) was not confirmed from a fetched primary source. Verify the SDK reference before using the admin API path.

**Missing table grants cause silent claim omission**
If `supabase_auth_admin` lacks SELECT on a table the hook queries, the hook does not throw a visible error to the end user — it returns the token without custom claims. The symptom is that `app_metadata` in the JWT is empty or missing keys. Check Supabase logs (Database → Logs → Postgres logs) for permission errors from the hook function. The fix is always adding the missing grants and re-running a migration.

**`LIMIT 1` with multiple org memberships**
The example uses `limit 1`, which returns an arbitrary org for users with multiple memberships. Multi-org apps need a different strategy: either encode an array of permitted org IDs in the claim, or implement an "active org" selection mechanism (a cookie or a session-level claim set at login) and use that to pick the correct membership row in the hook.

AUTH_KB_5 covers the signup trigger that creates the initial `org_members` row this hook reads. Ensure that trigger fires correctly before testing the hook.

**Hook does not fire for service_role requests**
The hook fires when Supabase Auth issues a JWT for a user session. It does not fire when your backend uses the `service_role` key directly. Service-role tokens bypass RLS entirely and are not user JWTs — the hook is irrelevant for that code path.

**HTTPS hook latency budget**
HTTPS hooks have a 5-second total budget covering up to 3 retries with 2-second backoff. A slow or unavailable HTTPS endpoint blocks token issuance for the user. Status codes 429 and 503 are retried; 400 and 403 are not. If using an Edge Function as the hook endpoint, account for cold-start latency. The webhook secret format is `v1,whsec_<base64-secret>` and must be stored in environment variables, never hardcoded.
