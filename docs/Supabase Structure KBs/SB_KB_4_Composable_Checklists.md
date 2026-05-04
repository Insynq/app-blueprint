# SB_KB_4 — Composable Checklists: Assembling Ordered Lists from Multiple Org Sources

**Stack-portable concept. Postgres implementation.**

---

## Pattern

A user's checklist is the **union** of items owned by all orgs they belong to, plus globally shared items (`org_id IS NULL`). Each source has its own ordering. Items have visibility rules (filter by user attributes) and phase-locking (complete phase N before unlocking phase N+1).

The pattern: single `checklist_items` table with nullable `org_id`, assembled per-user via a `SECURITY DEFINER STABLE` function that unions all visible sources, applies visibility filters in SQL, and sorts on a composite key `(phase, source_priority, sort_order, id)`. Use **fractional indexing (LexoRank)** for `sort_order` so insertions between existing items don't trigger renumber storms.

**Critical design decision on phase-locking across sources:** Every major onboarding/LMS platform treats each source as a parallel track. They do not merge phase numbers across org sources. Merging creates a UX problem: a user can't complete their primary org's Phase 2 because a side-org's Phase 1 item is incomplete — and they have no idea why. The recommendation from production evidence is: **one global track with hard phase-locking + per-org tracks with independent phase gates**.

---

## When to use / when to skip

**Use when:**
- Users belong to multiple orgs and each org contributes checklist items
- Items have visibility rules based on user attributes (role, license type, flags)
- You want a single assembled view rather than multiple separate checklists

**Skip / simplify when:**
- All users see the same checklist — a static ordered list with no org scoping is much simpler
- Each org's checklist is completely independent — separate checklists per org membership, no assembly needed
- You have only one org — treat all items as org-owned and skip the NULL/shared pattern

---

## Anti-patterns

**Snapshotting the assembled list into a per-user table at signup**
Creates drift the moment an admin adds or removes items. Users who signed up before the change see the old list. Compute live (or via materialized view), never snapshot composition.

**Integer `sort_order` shared across orgs**
Two orgs both insert an item with `sort_order = 5`. Now you have two items at position 5 and the ordering is undefined. Use LexoRank strings — each org's sort space is independent and string ordering is globally meaningful.

**Visibility logic in the application layer**
Admins querying "which users will see this item?" can't use the DB. Visibility must be enforced in SQL so RLS, admin dashboards, and the user-facing API all see the same result.

**Modeling phases as a separate table**
Adds joins. Phase numbers are ordinals on items, not entities. A `phase` column on `checklist_items` is sufficient.

**Merging phase-locking across org sources without an explicit contract**
If Phase 1 items from Org A and Phase 1 items from Org B are all required before Phase 2 unlocks for anyone, you've created a hidden cross-org dependency. This breaks when Org B changes its Phase 1 definition. Make the merge explicit and documented, or don't merge.

---

## Generic example

```sql
-- Items table: single table, org_id nullable for globally shared items
create table checklist_items (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid references organizations(id) on delete cascade,  -- null = global/shared
  phase           smallint not null default 1,
  sort_order      text not null,        -- LexoRank fractional index string
  title           text not null,
  description     text,
  required        boolean not null default true,
  source_priority smallint not null default 100,  -- lower = appears first on phase+sort ties
  -- Visibility rules: each key is a filterable dimension
  -- Store as separate nullable columns if dimensions are known and few
  -- Use jsonb if dimensions are user-defined or numerous
  visibility_filter jsonb not null default '{}'::jsonb,
  -- Example: {"license_types": ["broker","salesperson"], "flag_mentor_only": true}
  effective_after timestamptz,          -- null = visible to all existing users
  created_at      timestamptz default now()
);

create index on checklist_items (org_id, phase);
create index on checklist_items (id) where org_id is null;            -- fast scan for globals
create index on checklist_items using gin (visibility_filter jsonb_path_ops);

-- Completions: separate table, keyed by (user, item)
create table checklist_completions (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references checklist_items(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  completed_at timestamptz not null default now(),
  completed_by uuid references profiles(id),  -- null = self-completed; set for admin-on-behalf
  unique (item_id, user_id)
);

create index on checklist_completions (user_id, item_id);
create index on checklist_completions (item_id);

-- Assembly function: returns the assembled checklist for a user
create or replace function get_user_checklist(p_user uuid)
returns table (
  item_id      uuid,
  org_id       uuid,
  phase        smallint,
  sort_order   text,
  title        text,
  description  text,
  required     boolean,
  completed_at timestamptz
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with user_orgs as (
    select org_id from org_memberships where user_id = p_user
    union
    select primary_org_id from profiles where id = p_user
  ),
  user_profile as (
    select license_type, is_mentor, created_at as joined_at
    from profiles where id = p_user
  )
  select
    i.id,
    i.org_id,
    i.phase,
    i.sort_order,
    i.title,
    i.description,
    i.required,
    c.completed_at
  from checklist_items i
  cross join user_profile up
  left join checklist_completions c on c.item_id = i.id and c.user_id = p_user
  where
    -- Scope: global or user's orgs
    (i.org_id is null or i.org_id in (select org_id from user_orgs))
    -- Effective date: item created before user joined, or no restriction
    and (i.effective_after is null or up.joined_at >= i.effective_after)
    -- Visibility: license type
    and (
      not (i.visibility_filter ? 'license_types')
      or up.license_type = any (
           select jsonb_array_elements_text(i.visibility_filter -> 'license_types')
         )
    )
    -- Visibility: mentor-only flag
    and (
      not (i.visibility_filter ? 'flag_mentor_only')
      or up.is_mentor = true
    )
  order by i.phase, i.source_priority, i.sort_order, i.id;
$$;

-- Phase state function: computes unlock status per phase
create or replace function get_user_phase_state(p_user uuid)
returns table (
  phase           smallint,
  total_required  int,
  completed_req   int,
  is_unlocked     boolean,
  is_complete     boolean
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with items as (select * from get_user_checklist(p_user)),
  per_phase as (
    select
      phase,
      count(*) filter (where required)                       as total_required,
      count(*) filter (where required and completed_at is not null) as completed_req
    from items
    group by phase
  )
  select
    pp.phase,
    pp.total_required::int,
    pp.completed_req::int,
    -- Unlocked when all previous phases are complete
    not exists (
      select 1 from per_phase prev
      where prev.phase < pp.phase
        and prev.completed_req < prev.total_required
    ) as is_unlocked,
    (pp.completed_req = pp.total_required) as is_complete
  from per_phase pp
  order by pp.phase;
$$;
```

**LexoRank insertion** — generate on the client or a helper function. The key invariant: a new sort_order between items A (`"a"`) and B (`"b"`) must be lexicographically between them. Libraries: `lexorank` (npm), `fractional-indexing` (npm/PyPI).

```ts
// Inserting between two existing items
import { generateKeyBetween } from 'fractional-indexing';
const newOrder = generateKeyBetween('a0', 'a1'); // → "a0V"
```

---

## Trade-offs

| Concern | Live assembly (this pattern) | Materialized per-user snapshot | Per-org separate checklists |
|---|---|---|---|
| Admin adds item | Visible immediately | Requires refresh | Only in that org |
| Read performance | 1–10ms with indexes | <1ms | Fastest |
| Cross-org ordering | Handled by `source_priority` | Snapshot at refresh time | N/A |
| Staleness | None | Minutes (on refresh) | None |
| Schema complexity | Medium | High (refresh triggers) | Low |

---

## Gotchas

**Postgres generated columns cannot aggregate across rows.** Progress percentages (`completed / total`) are cross-row aggregates — they cannot be `GENERATED ALWAYS AS` columns. Compute them in a function or a trigger-maintained summary table (see SB_KB_11).

**`effective_after` grandfathers existing users.** The intent: items added after a user's join date don't retroactively re-lock their completed phases. Implement as: `where i.effective_after is null or p_user.joined_at >= i.effective_after`. New users (joined after the item was added) see it from day one. Existing users don't. This matches how Rippling, BambooHR, and Workday handle retroactive task additions.

**GIN indexes on `visibility_filter` require `jsonb_path_ops` operator class.** Without it, Postgres falls back to seq scan for containment queries. Always: `create index ... using gin (visibility_filter jsonb_path_ops)`.

**`source_priority` is not user-configurable.** It's a compile-time ordering signal owned by the platform (lower = appears before on phase+sort ties). Don't expose it as a per-user preference — that creates O(N users × M items) ordering state.

**Sort order collisions are recoverable but annoying.** If two concurrent inserts generate the same LexoRank key (rare but possible), add a fallback sort on `id` (as the example does) and rebalance sort_order keys during a low-traffic window. The `fractional-indexing` library's collision handling docs cover this.
