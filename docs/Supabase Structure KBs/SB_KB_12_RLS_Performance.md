# SB_KB_12 — RLS Performance Patterns

**Stack-portable concept. Supabase/Postgres implementation. Most specific to Postgres RLS internals.**

---

## Pattern

Row-level security slows queries in three ways: (1) policy predicates evaluated per row instead of once per statement, (2) missing indexes on columns referenced in policy conditions, and (3) joins inside policies that re-trigger RLS on joined tables. Fix (1) with the `(select fn())` InitPlan idiom. Fix (2) with targeted btree/GIN indexes. Fix (3) by routing lookups through `SECURITY DEFINER` helpers that bypass RLS on inner reads.

The Supabase Performance Advisor catches the most common failures automatically. Run it before profiling manually.

---

## When to use / when to skip

This isn't a feature you enable — it's a discipline applied to every table you add RLS to. Apply these patterns from the start on tables with:
- RLS predicates that join to other tables (memberships, org lookups)
- High read frequency (dashboards, list views)
- Many concurrent users

On small tables (< 10K rows) with low traffic, RLS overhead is negligible and these patterns are premature optimization. Measure first.

---

## Anti-patterns

**Naked `auth.uid()` in `USING` clause (most common)**
```sql
-- Wrong: auth.uid() is re-evaluated for every row
create policy "p" on items for select using ( org_id = auth.uid() );

-- Right: (select auth.uid()) is an InitPlan — evaluated once per statement
create policy "p" on items for select using ( org_id = (select auth.uid()) );
```
Supabase advisor flags this as lint `0003_auth_rls_initplan`. The difference can be 10–100× on large tables.

**Same anti-pattern applies to any function call in a policy predicate:**
```sql
-- Wrong: function called per row
using ( org_id = get_user_org() )

-- Right: hoisted to InitPlan
using ( org_id = (select get_user_org()) )
-- Or for set-returning functions:
using ( org_id = any( array(select private.get_my_org_ids()) ) )
```

**Missing index on the column compared in `USING`**
```sql
-- Policy: using (org_id = (select auth.uid()))
-- If there's no index on org_id, every select scans the full table.
create index on items (org_id);  -- btree is correct for equality
```

**btree index on an array column used with `&&` or `@>`**
```sql
-- Wrong: btree on an array column doesn't support containment operators
create index on items (tenant_group_ids);

-- Right: GIN supports &&, @>, <@
create index on items using gin (tenant_group_ids);
```

**Joining the membership table inside the policy predicate (recursion risk)**
```sql
-- Risky: if org_memberships also has RLS, this may recurse or be very slow
create policy "p" on items for select using (
  org_id in (select org_id from org_memberships where user_id = auth.uid())
);

-- Right: route through a SECURITY DEFINER helper that reads memberships without RLS
create policy "p" on items for select using (
  org_id = any( array(select private.get_my_org_ids()) )
);
```

**Multiple overlapping permissive policies for the same (role, command)**
```sql
-- This creates two policies that are OR'd together — Postgres evaluates both predicates for every row
create policy "policy_a" on items for select using (...);
create policy "policy_b" on items for select using (...);

-- Consolidate into one policy with explicit OR
create policy "combined" on items for select using (
  (predicate_a) or (predicate_b)
);
```
Supabase advisor flags this as lint `0006_multiple_permissive_policies`.

**`IMMUTABLE` on a function that reads tables**
```sql
-- Wrong: IMMUTABLE tells Postgres "this function has no side effects and always returns the same value
-- for the same arguments — cache it across transactions"
-- But if the function reads from a table, the value changes when the table changes.
create function get_user_org() returns uuid language sql immutable as ...;

-- Right: STABLE = same result within one transaction; re-evaluated per transaction
create function get_user_org() returns uuid language sql stable as ...;
```

**Running `EXPLAIN ANALYZE` as superuser (bypasses RLS)**
All profiling of RLS-heavy queries must be done as the actual role:
```sql
set role authenticated;
set local request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}';
explain analyze select * from items;
```

**Trusting `user_metadata` in policies**
`user_metadata` is client-writable. Any RLS predicate that reads `auth.jwt()->'user_metadata'` can be bypassed by any user. Use `app_metadata` (server-set only). Supabase advisor flags as lint `0015`.

---

## Generic example

```sql
-- -------------------------------------------------------
-- SECURITY DEFINER helper: central lookup, bypasses RLS
-- -------------------------------------------------------
create or replace function private.get_my_org_ids()
returns setof uuid
language sql stable security definer
set search_path = public, pg_temp  -- lint 0011: mutable search_path in DEFINER
as $$
  select primary_org_id from profiles where id = (select auth.uid())
  union
  select org_id from org_memberships where user_id = (select auth.uid());
$$;

-- -------------------------------------------------------
-- Required indexes for every table with org_id RLS
-- -------------------------------------------------------
-- The columns referenced in your USING clauses must be indexed.
-- These are the minimum set for the patterns in SB_KB_1 through SB_KB_4:

create index on profiles            (id);              -- already PK, but confirm
create index on org_memberships     (user_id);
create index on org_memberships     (org_id);
create index on org_memberships     (user_id, org_id); -- composite for both-direction lookups
create index on content_items       (org_id);
create index on content_items       (id) where org_id is null;  -- partial for globals
create index on checklist_items     (org_id, phase) where required = true;
create index on checklist_completions (user_id, item_id);
create index on admin_sessions      (subject_id, state);
create index on admin_sessions      (admin_id, state);
create index on admin_sessions      (org_id, state);
create index on session_notes       (session_id);
create index on session_tasks       (session_id, assigned_to);

-- -------------------------------------------------------
-- Policy consolidation: one policy per (role, command)
-- -------------------------------------------------------
-- Bad: two separate SELECT policies (both evaluated, OR'd)
drop policy if exists "items: see own org" on content_items;
drop policy if exists "items: see shared"  on content_items;

-- Good: one consolidated policy
create policy "content_items: read"
on content_items for select to authenticated
using (
  org_id is null
  or org_id = any( array(select private.get_my_org_ids()) )
);

-- -------------------------------------------------------
-- RPC escape hatch: when RLS is the bottleneck for aggregates
-- -------------------------------------------------------
-- If an org-wide dashboard query is slow even with proper indexes,
-- move the query to a SECURITY DEFINER RPC that bypasses RLS and
-- does its own explicit authorization check.

create or replace function org_completion_stats(p_org_id uuid)
returns table (user_id uuid, phase smallint, completed_req int, total_req int)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
begin
  -- Explicit auth check (replaces RLS)
  if not exists (
    select 1 from org_memberships
    where user_id = (select auth.uid())
      and org_id = p_org_id
      and role in ('admin', 'owner')
  ) then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  return query
    select
      p.id as user_id,
      phase_data.phase,
      phase_data.completed_req::int,
      phase_data.total_required::int
    from profiles p
    cross join lateral get_user_phase_state(p.id) as phase_data
    where p.primary_org_id = p_org_id;
end;
$$;

revoke all on function org_completion_stats(uuid) from public, anon;
grant execute on function org_completion_stats(uuid) to authenticated;
```

---

## Trade-offs

| Optimization | Benefit | Cost | When |
|---|---|---|---|
| `(select fn())` InitPlan wrap | Eliminates per-row evaluation | None | Always |
| btree index on `org_id` | O(log N) lookup | Write overhead ~5% | Always |
| GIN index on array column | O(1) containment | Slower writes | Array columns with `&&`/`@>` |
| DEFINER helper function | Breaks recursion, centralizes logic | Trusted code path | Multi-table RLS joins |
| Consolidated single policy | One evaluation per row | Slightly less readable | High-frequency tables |
| DEFINER RPC for aggregates | Bypasses RLS entirely | Manual auth check required | Dashboard aggregates |
| JWT claims for org_ids | Eliminates DB read per request | Revocation latency = token TTL | Measured bottleneck only |

---

## Gotchas

**Supabase Performance Advisor is the fastest first step.** Dashboard → Advisors → Performance. It runs all lints automatically and shows query-level slow logs from `pg_stat_statements`. Run it before spending time on manual profiling.

**`EXPLAIN ANALYZE` doesn't show RLS overhead separately.** The RLS predicate is inlined into the query plan. Look for sequential scans on tables you know have RLS — that's the signal that either the index is missing or the predicate is per-row.

**Views without `security_invoker = true` (Postgres 15+) silently bypass RLS.** Default behavior changed in PG15: views run as the view owner (usually a superuser), which bypasses RLS on underlying tables. Add `with (security_invoker = true)` to any view intended to respect the calling user's RLS context.

**DEFINER functions expand your security perimeter.** Every DEFINER function is a bypass gate. Test with pgTAP: assert that the function returns the right rows for user A, no rows from user B's org, and raises an error when called unauthenticated. Treat DEFINER functions as you would service-role usage — log inputs, validate, minimize scope.

**Partial unique index and RLS interact predictably but not obviously.** A partial unique index `where org_id is null` means the constraint only applies to globally shared rows. For org-scoped rows, a separate unique index on `(org_id, slug)` may be needed. Verify that your RLS policies and your uniqueness constraints cover the same row sets.

**Multiple permissive policies evaluate their predicates independently.** If you have two SELECT policies on a table and both predicates use `private.get_my_org_ids()`, the function is called twice per row (once per policy), not once. Consolidate into a single policy to halve the function calls.

**Connection pooling and `STABLE` function caching.** Supabase uses Supavisor in pooling mode. Each web request gets a fresh session, so `STABLE` caching is transaction-scoped (correct behavior). In a persistent server process that reuses connections (e.g., a long-running Edge Function), a `STABLE` function cached at session level may serve stale membership data until the connection is reset. Monitor for this in queue-processing contexts.
