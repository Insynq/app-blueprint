# SB_KB_3 — Split-Benefit Relationships: Typed Many-to-Many Edges

**Stack-portable concept. Postgres implementation.**

---

## Pattern

Some user-to-user relationships carry multiple distinct benefit types that must be tracked, enforced, and queried independently. A common real-world case: two "sponsors" for one user where one sponsor receives financial credit and another grants org access — same relationship type, different benefit semantics.

The pattern is a **polymorphic many-to-many with a `benefit_type` enum**, one row per `(subject, counterpart, benefit_type)`, enforced with a partial unique index ensuring exactly one active row per benefit type per subject at any time.

This is the right default over JSONB blobs (unindexable, no FK enforcement) and separate per-benefit tables (duplicates FK/RLS infrastructure, O(N) tables as benefit types grow).

---

## When to use / when to skip

**Use when:**
- Two users have a relationship where different benefits flow to different counterparts
- Benefits need to be queried, filtered, or aggregated independently (`where benefit_type = 'financial'`)
- You need effective dating (relationships that start and end)
- RLS needs to filter by benefit type

**Skip when:**
- There is only ever one sponsor/counterpart per subject — a simple `sponsor_id` FK on the profile is sufficient
- Benefits are purely informational (no access implications) — JSONB metadata on a single relationship row is fine
- Benefit types are fixed and you only ever need one of each — put them as nullable FKs directly on the profile row

---

## Anti-patterns

**JSONB `benefits` field as source of truth**
```sql
-- Don't do this
alter table profiles add column sponsor_benefits jsonb;
-- {"financial": "uuid-a", "org_access": "uuid-b"}
```
Can't be indexed with btree. Can't have FK constraints. "Exactly one active financial sponsor" is unenforceable in the DB. RLS filtering requires `jsonb_path` operators that the planner often can't use an index for.

**Two hardcoded FK columns on the subject row**
```sql
-- Don't do this unless benefit types are truly static forever
alter table profiles add column financial_sponsor_id uuid references profiles(id);
alter table profiles add column org_access_sponsor_id uuid references profiles(id);
```
Works today. Breaks when a third benefit type appears, or when you need effective dating, or when you need history.

**Polymorphic `(sponsorable_type, sponsorable_id)` columns**
No FK enforcement possible. Type strings drift. RLS can't join cleanly. GitLab's own development docs explicitly prohibit this pattern.

**Computing financial splits inside RLS**
RLS is for row visibility, not money. Financial calculations in USING clauses slow every query on that table. Move financial logic to application layer or a separate ledger table.

**Business-meaning `DEFAULT` / `COALESCE` on a financial-attribution column**
```sql
-- Don't do this
split_pct  numeric(5,2)  DEFAULT 75,          -- write-side head
-- ...and in a view/RPC:
select COALESCE(split_pct, 75) as split_pct   -- read-side head
```
A `DEFAULT` (or a view `COALESCE`) set to a *business value* silently stamps that rule on every row
whose writer omitted the field — and it **defeats the not-null CHECK in the Generic example below** (`split_pct is not null`
on the financial branch): the omitted write still passes the CHECK because the DEFAULT auto-fills it,
so the guard that looks protective is inert. This is a **two-headed trap** — the write-side `DEFAULT`
and the read-side `COALESCE` each assert the rule independently, so fixing one head leaves the other
live. Fix: defaults and `COALESCE` fallbacks on financial/attribution columns must be **inert**
(`NULL` / `0` / `'unknown'`) so an omission is visible and a real value must be supplied — and audit
both heads together. (One instance of a general rule; see `gen-migration.md` "What to Check For".
Field-attestation is downstream-incident-sourced: a `parsons_split_pct DEFAULT 75` + view
`COALESCE(..., 75)` put ~$97k of mis-credit at risk across 13 settlements before both heads were
dropped. Installed 2026-07-07, not yet proven in a live run in this framework's projects.)

---

## Generic example

```sql
create type relationship_benefit as enum ('financial', 'org_access');
-- Add values with: alter type relationship_benefit add value 'mentorship';

create table subject_relationships (
  id               uuid primary key default gen_random_uuid(),
  subject_id       uuid not null references profiles(id) on delete cascade,
  counterpart_id   uuid not null references profiles(id) on delete cascade,
  benefit_type     relationship_benefit not null,

  -- Benefit-specific metadata — use nullable columns with CHECK constraints
  -- rather than JSONB so each column can have its own FK, index, and constraint
  granted_org_id   uuid references organizations(id),  -- only for org_access
  split_pct        numeric(5,2),                        -- only for financial

  effective_from   date not null default current_date,
  effective_to     date,                                -- null = currently active

  check (subject_id <> counterpart_id),
  check (
    (benefit_type = 'financial'  and split_pct is not null and granted_org_id is null)
    or
    (benefit_type = 'org_access' and granted_org_id is not null and split_pct is null)
  )
);

-- Enforce: exactly one active row per (subject, benefit_type)
create unique index one_active_benefit_per_subject
  on subject_relationships (subject_id, benefit_type)
  where effective_to is null;

-- Support queries like "who are this subject's active org-access counterparts?"
create index on subject_relationships (subject_id, benefit_type, effective_to);
create index on subject_relationships (counterpart_id, benefit_type);

-- RLS: subjects see their own relationships; counterparts see theirs
alter table subject_relationships enable row level security;

create policy "relationships: subject sees own"
on subject_relationships for select to authenticated
using ( subject_id = (select auth.uid()) );

create policy "relationships: counterpart sees own"
on subject_relationships for select to authenticated
using ( counterpart_id = (select auth.uid()) );

-- Admins write via service role; subjects cannot self-assign relationships
```

**Integrating with org access (SB_KB_1/SB_KB_2):**
```sql
-- Extend private.get_my_org_ids() to include org_access relationships
create or replace function private.get_my_org_ids()
returns setof uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select primary_org_id from profiles where id = (select auth.uid())
  union
  select org_id from org_memberships where user_id = (select auth.uid())
  union
  -- Orgs granted via org_access relationships
  select granted_org_id
  from subject_relationships
  where subject_id = (select auth.uid())
    and benefit_type = 'org_access'
    and effective_to is null;
$$;
```

**Effective-date overlap prevention** (optional, stronger than partial unique):
```sql
-- Requires btree_gist extension
create extension if not exists btree_gist;

alter table subject_relationships
  add column effective_range daterange
    generated always as (
      daterange(effective_from, effective_to, '[)')
    ) stored;

create index on subject_relationships using gist (subject_id, benefit_type, effective_range);

-- Exclusion constraint: no two active rows for same (subject, benefit_type) with overlapping dates
alter table subject_relationships
  add constraint no_overlapping_benefit
  exclude using gist (
    subject_id   with =,
    benefit_type with =,
    effective_range with &&
  );
```

---

## Trade-offs

| Criterion | Enum rows (this pattern) | Separate tables per benefit | JSONB blob |
|---|---|---|---|
| Queryability | btree on `(subject_id, benefit_type)` | Naturally typed | GIN; planner often skips |
| RLS filtering | `where benefit_type = 'x'` | Per-table policy | Hard — must extract from JSON |
| FK constraints | Conditional via CHECK | Clean per-type FKs | None possible |
| Schema evolution | `ALTER TYPE ADD VALUE` (irreversible) | New benefit = new table | Schemaless — no migration |
| History / effective dating | Native with `effective_from/to` | Per-table | App-only |
| Audit | One table to query | N tables to UNION | One table but opaque |

**When a new benefit type needs radically different columns** (e.g., a `mentorship` benefit with 8 metadata columns), promote that one benefit to its own table and keep the rest in this table — hybrid is fine. Don't force-fit unrelated shapes into one row.

---

## Gotchas

**Postgres enums can be extended but not safely renamed or removed** without recreating the type and all columns that reference it. If benefit type semantics are likely to churn, use a `benefit_types` lookup table with a FK instead of an enum.

**`ALTER TYPE ADD VALUE` is not transactional** in Postgres versions before 14. Adding an enum value in a migration cannot be rolled back on failure. Wrap in a function that checks if the value already exists before adding.

**The partial unique index covers `effective_to IS NULL` only.** This means historical rows (non-null `effective_to`) are not constrained — you can have multiple closed rows for the same (subject, benefit_type). This is intentional for audit history. If you need to prevent any overlap, use the exclusion constraint approach above.

**Financial splits are NOT access control.** The `split_pct` column drives payouts, reporting, and ledger entries — it should never appear in a RLS `USING` clause. Keep the financial branch of this table queried only from service-role contexts or DEFINER functions with explicit caller authorization checks.
