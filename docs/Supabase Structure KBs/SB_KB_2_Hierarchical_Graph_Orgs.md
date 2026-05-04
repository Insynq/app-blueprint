# SB_KB_2 — Hierarchical + Graph Org Structures in Postgres

**Stack-portable concept. Supabase/Postgres implementation.**

---

## Pattern

Org hierarchies come in two shapes that often coexist:

- **Tree** (`parent_org_id` on the orgs table): formal parent-child structure (corporate → division → office → team)
- **Graph** (`org_associations` join table): informal grants where membership in org A also grants access to orgs B, C, D

The pattern is: store both as adjacency lists, walk them with a **recursive CTE inside a `SECURITY DEFINER STABLE` function**, and call that function from RLS as `org_id = ANY(ARRAY(select private.effective_org_ids()))`. The function handles cycle prevention natively.

This is the right default up to ~100K orgs and depth ~20. Beyond that, measure before switching to a closure table.

---

## When to use / when to skip

**Use when:**
- Orgs have a parent-child hierarchy AND informal cross-org access grants
- You need to auto-compute a user's full access set from their direct memberships + inherited access
- Org structure changes infrequently relative to read frequency

**Skip / simplify when:**
- Pure flat tenancy (all orgs are peers, no parent chain) — SB_KB_1 is sufficient
- You only need the tree, not the graph — drop the `org_associations` table and simplify the CTE
- Orgs change structure frequently and sub-second access recomputation is required — add a Redis cache layer on top

---

## Anti-patterns

**Using `ltree` for a graph**
`ltree` is a Postgres extension for materialized path trees. It's fast for single-parent trees but hard-fails the moment you introduce multiple parents (which `org_associations` creates). Don't reach for it here.

**Recursive CTE inside the `USING` clause directly**
If the CTE joins back to a table that also has RLS, and that table's policy also runs a CTE, you get infinite recursion or stack-depth errors. Always isolate the recursion in a DEFINER function where it bypasses RLS on the inner reads.

**Missing cycle prevention**
A graph with any cycle and no cycle guard produces runaway queries. Use a visited-array or the native Postgres 14+ `CYCLE` clause.

**Missing index on `parent_org_id`**
Every step of the recursive CTE does a lookup by `parent_org_id`. Without a btree index, each step is a seq scan.

**Views without `security_invoker = true` (Postgres 15+)**
Views in Postgres 15+ run as the view owner by default, silently bypassing RLS on the underlying tables. Add `with (security_invoker = true)` to any view that should respect RLS.

**Synchronous closure-table maintenance from app code**
If you do switch to a closure table, maintain it via a Postgres trigger or background job — never from application code. App-level maintenance breaks under concurrent inserts and fails silently on connection loss.

---

## Generic example

```sql
-- Tree: adjacency list on the orgs table
create table organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  parent_org_id uuid references organizations(id) on delete set null,
  created_at    timestamptz default now()
);
create index on organizations (parent_org_id);

-- Graph: informal access grants between orgs
create table org_associations (
  granter_org_id uuid not null references organizations(id) on delete cascade,
  grantee_org_id uuid not null references organizations(id) on delete cascade,
  primary key (granter_org_id, grantee_org_id),
  check (granter_org_id <> grantee_org_id)
);
create index on org_associations (granter_org_id);
create index on org_associations (grantee_org_id);

-- Central function: walks tree UP (or DOWN — pick one direction and stick to it)
-- then follows association graph with cycle prevention
create or replace function private.effective_org_ids(p_user uuid)
returns setof uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  with recursive

  -- Step 1: direct memberships (primary org + membership table)
  base as (
    select primary_org_id as org_id
    from profiles
    where id = p_user

    union

    select org_id
    from org_memberships
    where user_id = p_user
  ),

  -- Step 2: walk UP the parent chain from each base org
  tree as (
    select id as org_id
    from organizations
    where id in (select org_id from base)

    union

    -- Walk to parent
    select o.parent_org_id
    from organizations o
    join tree t on o.id = t.org_id
    where o.parent_org_id is not null
  ),

  -- Step 3: follow association graph with visited-array cycle prevention
  graph as (
    select org_id, array[org_id] as visited
    from tree

    union

    select a.grantee_org_id, g.visited || a.grantee_org_id
    from org_associations a
    join graph g on a.granter_org_id = g.org_id
    where not a.grantee_org_id = any(g.visited)
  )

  select distinct org_id from graph;
$$;

-- Call from RLS — the ARRAY(select ...) form forces InitPlan (evaluated once per statement)
create policy "content: read effective orgs or shared"
on content_items for select to authenticated
using (
  org_id is null
  or org_id = any ( array(select private.effective_org_ids((select auth.uid()))) )
);
```

**Postgres 14+ alternative using native CYCLE clause:**
```sql
-- Cleaner syntax; same semantics as visited-array approach above
with recursive tree(org_id, depth) as (
  select id, 0 from organizations where id = any(base_ids)
  union all
  select o.parent_org_id, t.depth + 1
  from organizations o
  join tree t on o.id = t.org_id
  where o.parent_org_id is not null
) cycle org_id set is_cycle using path
select distinct org_id from tree where not is_cycle;
```

---

## Trade-offs

| Approach | Reads | Writes | Multi-parent | When to choose |
|---|---|---|---|---|
| **Recursive CTE (this pattern)** | 1–10ms for typical orgs | No overhead | ✅ Yes | Default |
| **Closure table** | <1ms | Write amplification: N×D rows per node | ❌ Difficult | Read-heavy, stable tree, depth matters |
| **`ltree`** | Very fast for path queries | Requires path recompute on move | ❌ Single parent only | Pure tree, no graph |
| **Materialized view** | <1ms | Async refresh lag | ✅ Yes | Slow-changing orgs, dashboard aggregates |

**Materialized view gotcha:** `REFRESH MATERIALIZED VIEW CONCURRENTLY` requires a unique index on the view and rebuilds the full result — not incremental. Staleness is acceptable for org-wide analytics but not for per-request access decisions.

---

## Gotchas

**Which direction to walk the tree matters.** Walking UP (child → parent) gives "what does this org inherit from above." Walking DOWN (parent → all children) gives "what can this org see below." For access control, walking UP is usually correct (a user in a child office inherits corporate-level shared content). Pick one, document it, don't mix.

**The function parameter `p_user uuid` vs reading `auth.uid()` inside.** If this function is called from RLS, pass no external user parameter — read `auth.uid()` inside. Accepting `p_user` as a parameter makes it callable by any authenticated user as an RPC, probing other users' org sets. If you need to call it for an arbitrary user (admin use), create a separate DEFINER function in a more restricted schema with its own audit.

**Association graph grows silently.** It's easy to create transitive access by adding one `org_associations` row without realizing the graph walk now reaches 10 previously isolated orgs. Build an admin UI that shows "if I add this association, these orgs become mutually visible." Run `explain analyze` on the CTE after any association change during development.

**Caching trade-off.** The STABLE marker lets Postgres cache the result within a single transaction. For long-lived server processes that build a query plan and reuse it across requests (connection pooling), `STABLE` may serve stale results if org membership changes between requests on the same connection. In Supabase with Supavisor pooling, each request gets a fresh session — STABLE behaves correctly.

**Recursive CTE depth limit.** Postgres defaults to `max_recursion_depth = 1000`. A pathological tree 1001 levels deep hits this. In practice, org trees deeper than 10 levels are a data-modeling problem, not a recursion problem.
