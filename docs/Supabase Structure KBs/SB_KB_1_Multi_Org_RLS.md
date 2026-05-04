# SB_KB_1 — Multi-Org RLS: Union-Membership Tenancy

**Stack-portable concept. Supabase/Postgres implementation.**

---

## Pattern

Most multi-tenant RLS tutorials assume one-org-per-user. This pattern handles the real case: a user belongs to one **primary org** and any number of **additional orgs** via a membership table, and content visibility is the **union** of all those orgs plus globally shared rows (`org_id IS NULL`).

The key engineering decision: centralize "which orgs can this user see?" in a `SECURITY DEFINER STABLE` SQL function in a private schema, then call it from all RLS policies. This breaks the recursive-RLS foot-gun and gives you one place to change access logic.

---

## When to use / when to skip

**Use when:**
- A user's content access set spans multiple orgs simultaneously
- You have a `*_memberships` table that grants access beyond a user's primary record
- You need globally shared content (`org_id IS NULL`) visible to everyone

**Skip when:**
- Every user belongs to exactly one org — a simple `org_id = (select auth.uid_org())` column comparison is sufficient and faster
- You're early-stage and can defer multi-membership complexity until a real use case demands it

---

## Anti-patterns

**Naked `auth.uid()` evaluated per row**
Every call to `auth.uid()` inside a policy `USING` clause re-evaluates per row. Wrap it: `(select auth.uid())`. Postgres hoists it into an InitPlan evaluated once per statement. Supabase advisor flags this as lint `0003_auth_rls_initplan`.

**Self-referential membership policy**
If `org_memberships` has RLS and its `USING` clause queries `org_memberships`, Postgres raises `42P17 infinite recursion detected in policy`. The DEFINER helper breaks this by bypassing RLS on the inner read.

**Helper function in the `public` schema**
PostgREST exposes every function in `public` as an RPC endpoint. An attacker can call `is_member(any_user_id, any_org_id)` if you accept external arguments. Move to a `private` schema, revoke execute from public/anon, and read `auth.uid()` inside the function body — never as a parameter.

**Trusting `user_metadata` in policies**
`user_metadata` is end-user-writable via the Supabase client SDK. Any access decision based on it can be spoofed. Use `app_metadata` (set server-side only) or a DB table. Supabase advisor flags this as lint `0015`.

**`TO PUBLIC` or omitting the role clause**
Runs the predicate for `anon` role on every unauthenticated request. Always specify `TO authenticated`.

**Missing `WITH CHECK` on UPDATE**
A SELECT policy without a matching UPDATE `WITH CHECK` lets users mutate `org_id` to an org they don't belong to, silently moving rows across tenants.

---

## Generic example

```sql
-- Private schema — not exposed via PostgREST
create schema if not exists private;
revoke all on schema private from anon, authenticated;

-- Central helper: returns all org_ids visible to the current user
create or replace function private.get_my_org_ids()
returns setof uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  -- Primary org from the user's own profile row
  select primary_org_id
  from profiles
  where id = (select auth.uid())

  union

  -- Additional orgs from the membership join table
  select org_id
  from org_memberships
  where user_id = (select auth.uid());
$$;

grant execute on function private.get_my_org_ids() to authenticated;

-- -------------------------------------------------------
-- Content table: union of memberships + globally shared
-- -------------------------------------------------------
alter table content_items enable row level security;

create policy "content: read own orgs or shared"
on content_items for select to authenticated
using (
  org_id is null
  or org_id = any ( array(select private.get_my_org_ids()) )
);

create policy "content: write only to own orgs"
on content_items for insert to authenticated
with check (
  org_id is not null
  and org_id = any ( array(select private.get_my_org_ids()) )
);

create policy "content: update only own org rows"
on content_items for update to authenticated
using  ( org_id = any ( array(select private.get_my_org_ids()) ) )
with check ( org_id = any ( array(select private.get_my_org_ids()) ) );

-- -------------------------------------------------------
-- User-scoped table: primary-org isolation via identity
-- -------------------------------------------------------
alter table profiles enable row level security;

create policy "profiles: self only"
on profiles for select to authenticated
using ( id = (select auth.uid()) );

-- -------------------------------------------------------
-- Membership table: simple self-only — never self-join
-- -------------------------------------------------------
alter table org_memberships enable row level security;

create policy "memberships: own rows"
on org_memberships for select to authenticated
using ( user_id = (select auth.uid()) );

-- -------------------------------------------------------
-- Required indexes
-- -------------------------------------------------------
create index on org_memberships (user_id);
create index on org_memberships (org_id);
create index on content_items (org_id);
-- Partial index for globally shared rows
create index on content_items (id) where org_id is null;
```

---

## Trade-offs

| Approach | Speed | Revocation latency | Complexity |
|---|---|---|---|
| DB helper (this pattern) | ~1–5ms per query | Immediate | Low |
| JWT `app_metadata.org_ids` | <1ms (no DB read) | = access token TTL (default 1h) | Medium — requires Custom Access Token Hook |
| Schema-per-tenant | Fastest isolation | Immediate | High — migration cost multiplies |

JWT claims are a valid speed optimization once measured. Don't adopt them preemptively — revocation latency means a user removed from an org retains access until their token expires.

---

## Gotchas

**The `ARRAY(select fn())` wrapper matters.** `org_id = any(private.get_my_org_ids())` and `org_id = any(array(select private.get_my_org_ids()))` look equivalent but aren't. The `ARRAY(select ...)` form forces Postgres to treat the subquery as a scalar InitPlan — evaluated once, result reused for every row. The bare `any(fn())` form may re-invoke the function per row depending on the planner version.

**`STABLE` is not `IMMUTABLE`.** Mark the helper `STABLE` (reads DB, same result within a transaction) not `IMMUTABLE` (no DB reads, result cached across transactions). Marking it `IMMUTABLE` causes the planner to cache stale membership data.

**SSR service-role client leaking into user requests.** If your Next.js Server Component creates a service-role Supabase client (bypasses RLS) but accidentally inherits the user's `Authorization` header, the user's JWT takes precedence and the service-role key is ignored — or vice versa. Always instantiate service-role and user clients separately with no shared header plumbing.

**Test as the actual role.** `EXPLAIN ANALYZE` run as `postgres` bypasses RLS entirely. Test as:
```sql
set role authenticated;
set local request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}';
explain analyze select * from content_items;
```

**Supabase Performance Advisor is free.** Run it in the dashboard before optimizing manually. It catches `0001` (unindexed FKs), `0003` (InitPlan), `0006` (multiple permissive policies), `0011` (mutable search_path in DEFINER functions), `0015` (user_metadata in policies) automatically.
