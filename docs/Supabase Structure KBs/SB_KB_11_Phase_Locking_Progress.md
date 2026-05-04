# SB_KB_11 — Phase-Locking and Computed Progress

**Stack-portable concept. Postgres implementation.**

---

## Pattern

Phase unlock = all required items in the previous phase are complete. Progress percentage = completed required items / total required items. Both are **computed, not stored** — derived on demand from the `checklist_completions` table via a SQL function.

The only time you materialize progress is for org-wide ranked dashboards where computing per-user progress for every user on read is too expensive. For per-user gating (is phase 2 unlocked for me?), live computation is always correct, always current, and fast enough with proper indexes.

Retroactive item additions use an `effective_after` timestamp — existing users see items added as "new requirements" but their completed phases are never retroactively re-locked.

---

## When to use / when to skip

**Use when:**
- Items are phase-locked and users must complete phase N before seeing phase N+1
- Progress is a first-class UI concept (progress bars, percentage complete)
- Admins need to query "which users are in phase 2?" across an org

**Skip / simplify when:**
- All items are always visible (no phase-locking) — just track completions, no phase logic needed
- Progress is binary (complete / not complete) with no percentage — a single count is sufficient
- Only one phase — "are all required items done?" is a simple boolean, no function needed

---

## Anti-patterns

**Storing progress as a column on the user profile**
```sql
-- Don't do this
alter table profiles add column checklist_progress_pct numeric;
alter table profiles add column current_phase smallint;
```
Requires a trigger to update on every completion. Trigger fires N times per batch update. Gets out of sync with the source data. The DB is the single source of truth — compute from it.

**Postgres `GENERATED ALWAYS AS` columns for progress**
Generated columns cannot reference other tables or use subqueries. They can only reference columns in the same row. Cross-row aggregates like progress percentages are impossible as generated columns.

**Subscribing to a materialized view via Realtime (Supabase)**
Supabase Realtime does not support Postgres Changes subscriptions on materialized views. Changes to the MV's base tables don't automatically trigger Realtime events on the view. Use a Broadcast trigger on the base table instead.

**`REFRESH MATERIALIZED VIEW CONCURRENTLY` per completion**
Requires a unique index on the MV. Rebuilds the full result set for each refresh. With 1,000 users completing items throughout the day, this triggers thousands of full rebuilds. Use only for scheduled batch refreshes (e.g., every 5 minutes), not per-row triggers.

**Force-relocking users when a retroactive item is added**
Production tools (Rippling, Workday, BambooHR) never silently re-lock a completed phase when new items are added. Use `effective_after` to grandfather existing users or show a "new requirements" indicator without revoking completion status.

**Phase gating logic only in the application layer**
Admins querying the DB directly, scheduled jobs checking eligibility, and RLS policies all need to agree on whether a phase is locked. Put the gating logic in a SQL function, not only in TypeScript.

---

## Generic example

```sql
-- Assumes checklist_items and checklist_completions from SB_KB_4

-- Core function: compute phase state for one user
create or replace function get_user_phase_state(p_user uuid)
returns table (
  phase           smallint,
  total_required  int,
  completed_req   int,
  progress_pct    numeric(5,2),
  is_unlocked     boolean,
  is_complete     boolean
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with assembled as (
    -- Reuse the assembly function from SB_KB_4
    select phase, required, completed_at
    from get_user_checklist(p_user)
  ),
  per_phase as (
    select
      phase,
      count(*) filter (where required)                                as total_required,
      count(*) filter (where required and completed_at is not null)   as completed_req
    from assembled
    group by phase
  )
  select
    pp.phase,
    pp.total_required::int,
    pp.completed_req::int,
    case
      when pp.total_required = 0 then 100.00
      else round((pp.completed_req::numeric / pp.total_required) * 100, 2)
    end as progress_pct,
    -- Phase is unlocked when ALL previous phases are complete
    not exists (
      select 1 from per_phase prev
      where prev.phase < pp.phase
        and prev.completed_req < prev.total_required
    ) as is_unlocked,
    (pp.completed_req = pp.total_required) as is_complete
  from per_phase pp
  order by pp.phase;
$$;

-- Convenience: is a specific phase unlocked for a user? (used in RLS, gating logic)
create or replace function is_phase_unlocked(p_user uuid, p_phase smallint)
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select is_unlocked from get_user_phase_state(p_user) where phase = p_phase),
    false
  );
$$;

-- Realtime: broadcast progress change after each completion
create or replace function broadcast_completion_change()
returns trigger
security definer language plpgsql as $$
declare v_org_id uuid;
begin
  select primary_org_id into v_org_id
  from profiles
  where id = coalesce(new.user_id, old.user_id);

  perform realtime.broadcast_changes(
    'org:' || v_org_id::text,
    tg_op,
    'completion_changed',
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

create trigger trg_completion_broadcast
after insert or update or delete on checklist_completions
for each row
execute function broadcast_completion_change();

-- Required indexes for performance
create index on checklist_completions (user_id, item_id);
create index on checklist_completions (item_id);
create index on checklist_items (org_id, phase) where required = true;
```

**Org-wide progress materialized view (for admin dashboards):**
```sql
-- Refresh on a schedule (pg_cron every 5 minutes), not per-completion
create materialized view org_progress_summary as
  select
    p.primary_org_id as org_id,
    p.id             as user_id,
    phase_data.phase,
    phase_data.progress_pct,
    phase_data.is_complete
  from profiles p
  cross join lateral get_user_phase_state(p.id) as phase_data;

-- Required for REFRESH CONCURRENTLY
create unique index on org_progress_summary (org_id, user_id, phase);

-- Schedule refresh (Supabase pg_cron)
select cron.schedule(
  'refresh-org-progress',
  '*/5 * * * *',  -- every 5 minutes
  'refresh materialized view concurrently org_progress_summary'
);
```

**Retroactive item addition (grandfather pattern):**
```sql
-- When adding a new required item, set effective_after to now()
-- Existing users (joined before now()) don't see this item in their assembled checklist
-- New users (joined after now()) see it from day one
insert into checklist_items (org_id, phase, sort_order, title, required, effective_after)
values ($org_id, 1, $sort_order, 'New compliance requirement', true, now());

-- To show a "new requirements" badge to existing users without re-locking:
-- Query items where effective_after > user.joined_at grouped by phase
-- Surface in UI as "Updated requirements" without revoking completion status
```

---

## Trade-offs

| Approach | Per-user read | Write overhead | Staleness | When |
|---|---|---|---|---|
| **Live SQL function (this pattern)** | 1–10ms | None | Zero | Default |
| **Trigger-maintained summary table** | <1ms | 1 UPDATE per completion | Zero | Read-hot dashboards |
| **Materialized view (scheduled refresh)** | <1ms | Full rebuild on schedule | Minutes | Org-wide aggregates |
| **`pg_ivm` incremental MV** | <1ms | Per-row delta | Zero | High write + read volume |

**Trigger-maintained summary table** pattern (when live compute isn't fast enough):
```sql
create table user_phase_cache (
  user_id    uuid not null references profiles(id) on delete cascade,
  phase      smallint not null,
  total_req  int not null default 0,
  done_req   int not null default 0,
  primary key (user_id, phase)
);

create or replace function update_phase_cache() returns trigger language plpgsql as $$
begin
  -- Recompute just the affected user's phase (not all users)
  insert into user_phase_cache (user_id, phase, total_req, done_req)
  select user_id, phase, total_required::int, completed_req::int
  from get_user_phase_state(coalesce(new.user_id, old.user_id))
  on conflict (user_id, phase) do update
    set total_req = excluded.total_req,
        done_req  = excluded.done_req;
  return null;
end;
$$;

create trigger trg_cache_update
after insert or update or delete on checklist_completions
for each row execute function update_phase_cache();
```
This is faster to read but introduces concurrent-insert race conditions when a user completes multiple items simultaneously. Add `FOR UPDATE` or use advisory locks if race conditions matter.

---

## Gotchas

**`is_phase_unlocked` called inside RLS creates the same recursion risk as any function in a policy.** If the function reads `checklist_items` and `checklist_items` has RLS, and that RLS calls back to something that reads user phase state, you get recursion. Use `SECURITY DEFINER` and explicitly `set search_path` to avoid this. Keep phase-gating functions out of RLS `USING` clauses; use them in application-layer gates instead.

**Phase 1 being locked for new users before they've had a chance to complete anything** is a UX issue, not a bug. Phase 1 is always unlocked (no previous phase to block it). Verify `is_unlocked` returns `true` for the minimum phase number.

**A phase with zero required items.** If `total_required = 0`, is the phase "complete"? The example returns `100%` progress and `is_complete = true` — matching the behavior most users expect (no blockers = unlocked). If you want admins to explicitly mark phases complete in this case, add a separate `admin_phase_confirmations` table.

**Org-wide MV refresh blocks read during non-concurrent refresh.** `REFRESH MATERIALIZED VIEW` (without `CONCURRENTLY`) takes an `AccessExclusiveLock` that blocks reads. Always use `CONCURRENTLY` for production, which requires the unique index. Expect 100–500ms refresh time for 10K users.
