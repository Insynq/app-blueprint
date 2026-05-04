# TEST_KB_2 — RLS Testing with pgTAP

**Stack-locked to Supabase + pgTAP (`supabase test db`). Covers RLS policy verification only.**

---

## Why pgTAP and Not JS Tests

JavaScript-based tests (Vitest, Jest) hit the Supabase API through PostgREST with a real JWT. They can verify that a logged-in user gets back the right data. They cannot:

- Inject a JWT with arbitrary `org_id`, `aal2`, or `plan` claims without actually completing MFA or provisioning real org memberships.
- Verify that a table is completely unreachable by the `authenticated` role.
- Assert policy metadata — which policies exist, what commands they govern, which roles they apply to.
- Isolate tests in a transaction. JS tests must use unique UUIDs per test case to avoid state leakage; pgTAP wraps every file in `BEGIN`/`ROLLBACK`.

The fatal failure mode for JS-only RLS tests: a test passes because the test user happened to have access, not because the policy was enforced correctly. pgTAP tests run inside Postgres as the actual `authenticated` role with whatever JWT claims you inject — exactly what happens in production. This is the only way to test claim-driven policies without relying on the Auth service.

---

## Always / Never

**Always:**
- Call `SET ROLE authenticated` (or `set local role authenticated`) before every RLS assertion. Without it you run as `postgres` superuser and bypass all policies silently.
- Set **both** `request.jwt.claim.sub` AND `request.jwt.claims`. `auth.uid()` reads the `sub` shortcut GUC; `auth.jwt()` reads the full `claims` JSON. Both must be populated.
- Use `is_empty()` to assert SELECT denial. SELECT with a restrictive policy returns zero rows — it never raises `42501`.
- Use `throws_ok(..., '42501', ...)` to assert INSERT denial.
- Use `is_empty()` with `UPDATE ... RETURNING id` to assert UPDATE denial. A blocked UPDATE returns zero rows; it is not an error.
- Use `is_empty()` with `DELETE ... RETURNING id` to assert DELETE denial on a `restrictive` USING policy. Same behavior as SELECT — rows are filtered out, no exception.
- Reset to `set local role postgres` before metadata assertions (`policies_are`, `policy_cmd_is`). Metadata tables may have their own access rules.
- Use `as restrictive` on AAL2 gating policies. Permissive policies are OR'd together and can be bypassed by any other matching permissive policy.
- Wrap every test file in `BEGIN` / `ROLLBACK`. Insert fixtures freely — all state rolls back at end.
- Name test files with numeric prefixes (`000-`, `001-`) to control execution order (files run alphabetically).
- Use `select plan(N)` with exact assertion count in committed tests. Plan/actual mismatch fails the suite even if all assertions pass.

**Never:**
- Never run RLS assertions as `postgres` without calling `SET ROLE`. The superuser bypasses all policies; the test always passes and tells you nothing.
- Never use `throws_ok()` to assert SELECT denial. SELECT with an RLS policy never throws — it returns an empty result set.
- Never use `lives_ok()` to assert UPDATE or DELETE permission. These complete without error even when they affect zero rows.
- Never call `policy_is_select()` or `policy_is_insert()`. These functions do not exist in pgTAP. Use `policy_cmd_is(..., 'SELECT')` and `policy_cmd_is(..., 'INSERT')`.
- Never rely on `tests.authenticate_as()` from `basejump-supabase_test_helpers` for policies using top-level custom JWT claims (`org_id`, `plan`, `aal`). That helper reads from `raw_app_meta_data`, not hook-injected top-level claims. Use the raw `set_config` pattern instead.
- Never assert specific sequence-generated integer IDs in rolled-back tests. Sequences advance permanently even inside a rolled-back transaction.

---

## Setup

### File Layout

```
supabase/
  tests/
    000-setup-tests-hooks.sql   ← runs first; installs extensions, defines helpers
    001-rls-documents.sql
    002-rls-outbox.sql
    003-rls-audit-log.sql
```

Files execute in alphabetical order. Use numeric prefixes to control sequence.

### Extension Install

Place in `000-setup-tests-hooks.sql` or at the top of each test file:

```sql
create extension if not exists pgtap with schema extensions;
```

### CLI Commands

```bash
# Start local stack (required before test db)
supabase start

# Create a new test file scaffold
supabase test new <test_name>
# Creates: supabase/tests/<test_name>.sql

# Run all pgTAP tests
supabase test db

# Run a specific file
supabase test db supabase/tests/001-rls-documents.sql

# Run against linked remote project
supabase test db --linked
```

`supabase test db` invokes `pg_prove` in a Docker container against the local Supabase stack. No local Postgres client is required.

### Standard File Structure

```sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(N);  -- exact assertion count; use select no_plan() during development

-- ==================================================
-- Fixture setup — runs as postgres superuser, bypasses RLS
-- ==================================================

-- ... INSERT statements ...

-- ==================================================
-- Assertions
-- ==================================================

-- ... pgTAP assertions ...

select * from finish();

rollback;
```

---

## Core Pattern: Simulating an Authenticated User

This project's Custom Access Token Hook injects `org_id`, `role`, `plan`, and `aal` at the **top level** of the JWT (not nested under `app_metadata`). RLS policies read them as:

```sql
(select auth.jwt() ->> 'org_id')   -- org membership
(select auth.jwt() ->> 'aal')      -- assurance level
(select auth.uid())                -- equivalent to auth.jwt() ->> 'sub'
```

To simulate this in pgTAP, set both GUC namespaces before switching roles:

```sql
-- Set the sub shortcut (auth.uid() reads this)
perform set_config('request.jwt.claim.sub', '<user-uuid>', true);

-- Set the full claims object (auth.jwt() reads this)
perform set_config('request.jwt.claims', json_build_object(
  'sub',    '<user-uuid>',
  'role',   'authenticated',
  'org_id', '<org-uuid>',
  'plan',   'pro',
  'aal',    'aal1'
)::text, true);

-- Switch to the authenticated role
set local role authenticated;
```

The `true` third argument to `set_config` scopes the setting to the current transaction — equivalent to `SET LOCAL`. Within a `BEGIN`/`ROLLBACK` block both forms reset on rollback.

To verify the setup worked before writing assertions:

```sql
select ok(auth.uid() is not null, 'auth.uid() resolves — GUCs are set correctly');
select ok((select auth.jwt() ->> 'org_id') is not null, 'org_id claim is present');
```

---

## Multi-Tenant Fixture Helpers

Define these procedures once in `000-setup-tests-hooks.sql`. Each individual test file can call them after inserting fixture rows.

### Full Claims Shape (this stack)

```json
{
  "sub":        "<user-uuid>",
  "role":       "authenticated",
  "org_id":     "<org-uuid>",
  "plan":       "pro",
  "aal":        "aal1"
}
```

### Fixture Helper Procedures

```sql
-- ================================================================
-- Fixture users (insert once in 000-setup-tests-hooks.sql
-- OR at the top of each test file's BEGIN block)
-- ================================================================

-- Org A users
insert into auth.users (id, email, role, aud)
values
  ('aaaa0001-0000-0000-0000-000000000001', 'admin-a@test.com',   'authenticated', 'authenticated'),
  ('aaaa0002-0000-0000-0000-000000000002', 'member-a@test.com',  'authenticated', 'authenticated');

-- Org B user (outsider from Org A's perspective)
insert into auth.users (id, email, role, aud)
values
  ('bbbb0001-0000-0000-0000-000000000001', 'member-b@test.com', 'authenticated', 'authenticated');

-- Orgs
insert into public.organizations (id, name)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Org A'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Org B');

-- ================================================================
-- Login helpers — call before each assertion block
-- ================================================================

create or replace procedure tests.login_as_org_a_admin()
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', 'aaaa0001-0000-0000-0000-000000000001', true);
  perform set_config('request.jwt.claims', json_build_object(
    'sub',    'aaaa0001-0000-0000-0000-000000000001',
    'role',   'authenticated',
    'org_id', 'aaaaaaaa-0000-0000-0000-000000000001',
    'plan',   'pro',
    'aal',    'aal1'
  )::text, true);
  set local role authenticated;
end;
$$;

create or replace procedure tests.login_as_org_a_member()
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', 'aaaa0002-0000-0000-0000-000000000002', true);
  perform set_config('request.jwt.claims', json_build_object(
    'sub',    'aaaa0002-0000-0000-0000-000000000002',
    'role',   'authenticated',
    'org_id', 'aaaaaaaa-0000-0000-0000-000000000001',
    'plan',   'pro',
    'aal',    'aal1'
  )::text, true);
  set local role authenticated;
end;
$$;

create or replace procedure tests.login_as_outsider()
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', 'bbbb0001-0000-0000-0000-000000000001', true);
  perform set_config('request.jwt.claims', json_build_object(
    'sub',    'bbbb0001-0000-0000-0000-000000000001',
    'role',   'authenticated',
    'org_id', 'bbbbbbbb-0000-0000-0000-000000000001',
    'plan',   'free',
    'aal',    'aal1'
  )::text, true);
  set local role authenticated;
end;
$$;

create or replace procedure tests.login_as_org_a_admin_aal2()
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', 'aaaa0001-0000-0000-0000-000000000001', true);
  perform set_config('request.jwt.claims', json_build_object(
    'sub',    'aaaa0001-0000-0000-0000-000000000001',
    'role',   'authenticated',
    'org_id', 'aaaaaaaa-0000-0000-0000-000000000001',
    'plan',   'pro',
    'aal',    'aal2'
  )::text, true);
  set local role authenticated;
end;
$$;

-- Reset to superuser for mid-test fixture inserts or metadata assertions
create or replace procedure tests.logout()
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role postgres;
end;
$$;
```

`[VERIFY BEFORE SHIPPING]` — The minimum required columns for `auth.users` inserts may vary by Supabase Auth schema version. If inserts fail on missing non-nullable columns, add `created_at`, `email_confirmed_at`, and `encrypted_password` with defaults. Verify against your current local schema before committing fixtures.

---

## AAL2 Gating Tests

### The Policy (from SB_KB_12 + AUTH_KB_3 pattern)

```sql
create policy "Require AAL2 for sensitive deletes"
  on public.sensitive_documents
  as restrictive            -- MUST be restrictive; permissive policies are OR'd and bypassable
  to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');
```

### Critical Behavior: Restrictive USING Filters Rows, Does Not Throw

A `restrictive` policy with a `USING` clause operates the same as a permissive USING clause: rows that don't match are filtered out. An AAL1 user querying or deleting from a table gated by this policy gets zero rows returned — not a `42501` error.

This means:
- **SELECT denial:** `is_empty()` — correct.
- **DELETE denial:** `is_empty()` with `DELETE ... RETURNING id` — correct. The restrictive USING clause prevents the row from being visible for deletion.
- **INSERT denial:** `throws_ok(..., '42501', ...)` — INSERT violations raise an exception because the `WITH CHECK` clause applies to new rows, not existing ones.

```sql
-- AAL1 user — filtered by restrictive policy, sees nothing
call tests.login_as_org_a_admin();  -- sets aal=aal1
select is_empty(
  $$ select * from public.sensitive_documents $$,
  'AAL1 user: restrictive policy filters all rows — is_empty, not throws_ok'
);

-- AAL2 user — passes restrictive gate, sees their org's rows
call tests.login_as_org_a_admin_aal2();
select results_eq(
  $$ select count(*)::int from public.sensitive_documents $$,
  array[3::int],
  'AAL2 user sees 3 org A sensitive documents'
);

-- AAL1 user cannot delete (restrictive USING blocks, returns empty, not an error)
call tests.login_as_org_a_admin();
select is_empty(
  $$ delete from public.sensitive_documents
     where id = 'dddd0001-0000-0000-0000-000000000001'
     returning id $$,
  'AAL1 admin: delete returns zero rows — restrictive policy blocks'
);
```

`[VERIFY BEFORE SHIPPING]` — Postgres RLS USING clauses filter rows silently, so a DELETE blocked by a restrictive USING policy returns zero rows (not `42501`). WITH CHECK is irrelevant to DELETE — it gates INSERT and UPDATE *new-row* validation only. Confirm the zero-rows behavior in your local Supabase stack before relying on `is_empty(...)` over `throws_ok(...)` here.

---

## Worked Example: 8 Test Cases

### Schema Under Test

```sql
create table public.documents (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null,
  owner_id   uuid not null references auth.users(id),
  content    text not null,
  created_at timestamptz default now()
);

alter table public.documents enable row level security;

create policy "Org members can read documents"
  on public.documents for select to authenticated
  using ((select auth.jwt() ->> 'org_id') = org_id::text);

create policy "Org members can insert documents"
  on public.documents for insert to authenticated
  with check ((select auth.jwt() ->> 'org_id') = org_id::text);

create policy "Owner can update document"
  on public.documents for update to authenticated
  using (
    (select auth.jwt() ->> 'org_id') = org_id::text
    and (select auth.uid()) = owner_id
  )
  with check (
    (select auth.jwt() ->> 'org_id') = org_id::text
    and (select auth.uid()) = owner_id
  );

create policy "Require AAL2 for document delete"
  on public.documents
  as restrictive
  to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');
```

### Test File

```sql
-- supabase/tests/001-rls-documents.sql
begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

-- ==================================================
-- Fixture setup — postgres superuser, bypasses RLS
-- ==================================================

insert into auth.users (id, email, role, aud)
values
  ('aaaa0001-0000-0000-0000-000000000001', 'admin-a@test.com',   'authenticated', 'authenticated'),
  ('aaaa0002-0000-0000-0000-000000000002', 'member-a@test.com',  'authenticated', 'authenticated'),
  ('bbbb0001-0000-0000-0000-000000000001', 'outsider-b@test.com','authenticated', 'authenticated');

insert into public.documents (id, org_id, owner_id, content)
values
  ('dddd0001-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaa0001-0000-0000-0000-000000000001',
   'Doc 1'),
  ('dddd0002-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaa0001-0000-0000-0000-000000000001',
   'Doc 2'),
  ('dddd0003-0000-0000-0000-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'aaaa0001-0000-0000-0000-000000000001',
   'Doc 3');

-- ==================================================
-- Test 1: Org A admin sees all 3 org A documents
-- ==================================================
perform set_config('request.jwt.claim.sub', 'aaaa0001-0000-0000-0000-000000000001', true);
perform set_config('request.jwt.claims', json_build_object(
  'sub',    'aaaa0001-0000-0000-0000-000000000001',
  'role',   'authenticated',
  'org_id', 'aaaaaaaa-0000-0000-0000-000000000001',
  'plan',   'pro',
  'aal',    'aal1'
)::text, true);
set local role authenticated;

select results_eq(
  $$ select count(*)::int from public.documents $$,
  array[3::int],
  'Org A admin (aal1) sees all 3 org A documents'
);

-- ==================================================
-- Test 2: Org A member (different user, same org) sees all 3
-- ==================================================
perform set_config('request.jwt.claim.sub', 'aaaa0002-0000-0000-0000-000000000002', true);
perform set_config('request.jwt.claims', json_build_object(
  'sub',    'aaaa0002-0000-0000-0000-000000000002',
  'role',   'authenticated',
  'org_id', 'aaaaaaaa-0000-0000-0000-000000000001',
  'plan',   'pro',
  'aal',    'aal1'
)::text, true);
-- role is already authenticated; re-set for clarity

select results_eq(
  $$ select count(*)::int from public.documents $$,
  array[3::int],
  'Org A member (aal1) sees all 3 org A documents'
);

-- ==================================================
-- Test 3: Outsider (Org B) sees zero documents
-- ==================================================
perform set_config('request.jwt.claim.sub', 'bbbb0001-0000-0000-0000-000000000001', true);
perform set_config('request.jwt.claims', json_build_object(
  'sub',    'bbbb0001-0000-0000-0000-000000000001',
  'role',   'authenticated',
  'org_id', 'bbbbbbbb-0000-0000-0000-000000000001',
  'plan',   'free',
  'aal',    'aal1'
)::text, true);

select is_empty(
  $$ select * from public.documents $$,
  'Org B outsider sees zero org A documents'
);

-- ==================================================
-- Test 4: AAL1 admin cannot delete (restrictive policy — returns empty, not error)
-- ==================================================
perform set_config('request.jwt.claim.sub', 'aaaa0001-0000-0000-0000-000000000001', true);
perform set_config('request.jwt.claims', json_build_object(
  'sub',    'aaaa0001-0000-0000-0000-000000000001',
  'role',   'authenticated',
  'org_id', 'aaaaaaaa-0000-0000-0000-000000000001',
  'plan',   'pro',
  'aal',    'aal1'
)::text, true);

select is_empty(
  $$ delete from public.documents
     where id = 'dddd0001-0000-0000-0000-000000000001'
     returning id $$,
  'AAL1 admin: restrictive AAL2 policy blocks delete — is_empty not throws_ok'
);

-- ==================================================
-- Test 5: AAL2 admin CAN delete
-- ==================================================
perform set_config('request.jwt.claim.sub', 'aaaa0001-0000-0000-0000-000000000001', true);
perform set_config('request.jwt.claims', json_build_object(
  'sub',    'aaaa0001-0000-0000-0000-000000000001',
  'role',   'authenticated',
  'org_id', 'aaaaaaaa-0000-0000-0000-000000000001',
  'plan',   'pro',
  'aal',    'aal2'
)::text, true);

select results_eq(
  $$ delete from public.documents
     where id = 'dddd0001-0000-0000-0000-000000000001'
     returning id $$,
  $$ values ('dddd0001-0000-0000-0000-000000000001'::uuid) $$,
  'AAL2 admin can delete org A document'
);

-- ==================================================
-- Test 6: Outsider cannot INSERT into org A
-- ==================================================
perform set_config('request.jwt.claim.sub', 'bbbb0001-0000-0000-0000-000000000001', true);
perform set_config('request.jwt.claims', json_build_object(
  'sub',    'bbbb0001-0000-0000-0000-000000000001',
  'role',   'authenticated',
  'org_id', 'bbbbbbbb-0000-0000-0000-000000000001',
  'plan',   'free',
  'aal',    'aal1'
)::text, true);

select throws_ok(
  $$ insert into public.documents (org_id, owner_id, content)
     values (
       'aaaaaaaa-0000-0000-0000-000000000001',
       'bbbb0001-0000-0000-0000-000000000001',
       'Injected content'
     ) $$,
  '42501',
  'new row violates row-level security policy for table "documents"',
  'Outsider cannot INSERT into org A documents — throws 42501'
);

-- ==================================================
-- Test 7: Org A member cannot UPDATE admin-owned document (owner mismatch)
-- ==================================================
perform set_config('request.jwt.claim.sub', 'aaaa0002-0000-0000-0000-000000000002', true);
perform set_config('request.jwt.claims', json_build_object(
  'sub',    'aaaa0002-0000-0000-0000-000000000002',
  'role',   'authenticated',
  'org_id', 'aaaaaaaa-0000-0000-0000-000000000001',
  'plan',   'pro',
  'aal',    'aal1'
)::text, true);

select is_empty(
  $$ update public.documents
     set content = 'hacked'
     where id = 'dddd0002-0000-0000-0000-000000000002'
     returning id $$,
  'Org A member cannot UPDATE a document owned by admin-a — zero rows, not error'
);

-- ==================================================
-- Test 8: Policy metadata — exact policy inventory
-- ==================================================
set local role postgres;  -- metadata queries run as superuser

select policies_are(
  'public',
  'documents',
  array[
    'Org members can read documents',
    'Org members can insert documents',
    'Owner can update document',
    'Require AAL2 for document delete'
  ],
  'documents table has exactly the 4 expected policies'
);

select * from finish();

rollback;
```

---

## pgTAP Assertions Reference (RLS-relevant only)

These are the assertions you will actually use. All confirmed from `pgtap.org/documentation.html`.

### Result Assertions

```sql
-- Exact equality, row by row
select results_eq(
  'SELECT col FROM tbl ORDER BY col',
  'SELECT col FROM expected ORDER BY col',
  'description'
);

-- With inline array
select results_eq(
  $$ select count(*)::int from projects $$,
  array[3::int],
  'Org A admin sees 3 projects'
);

-- Empty result — use for SELECT/UPDATE/DELETE denial
select is_empty(
  $$ select * from projects where org_id = 'foreign-org-id' $$,
  'Outsider sees zero rows'
);
```

`isnt_empty()` is a core pgTAP function — no helper library required. Use it to assert that a query returns at least one row.

### Exception Assertions

```sql
-- Assert INSERT or write raises 42501 (RLS violation)
select throws_ok(
  $$ insert into projects (org_id, name)
     values ('foreign-org-id', 'attacker-project') $$,
  '42501',
  'new row violates row-level security policy for table "projects"',
  'Cross-org INSERT raises 42501'
);

-- Assert a write succeeds (positive test)
select lives_ok(
  $$ insert into projects (org_id, name)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'Valid Project') $$,
  'Org A admin can INSERT into own org'
);
```

Error code `42501` is PostgreSQL's `insufficient_privilege`. Only INSERT (and UPDATE/DELETE with `WITH CHECK`) raises it on RLS violations. SELECT, UPDATE with USING only, and DELETE with USING only return zero rows silently.

### Policy Metadata Assertions

```sql
-- Exact policy inventory on a table
select policies_are(
  'public',
  'projects',
  array[
    'Org members can read projects',
    'Org admins can insert projects',
    'Require AAL2 for project delete'
  ],
  'projects policies match expected inventory'
);

-- Which roles a policy applies to
select policy_roles_are(
  'public',
  'projects',
  'Org members can read projects',
  array['authenticated'],
  'Read policy applies to authenticated role only'
);

-- Which SQL command a policy governs
select policy_cmd_is(
  'public',
  'projects',
  'Org admins can insert projects',
  'INSERT',
  'Insert policy governs INSERT command'
);
```

`policy_cmd_is` accepts: `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `ALL`.

### RLS Enabled Check

```sql
-- Verify RLS is enabled (raw pg_tables query — no helper dependency)
select ok(
  (select rowsecurity from pg_tables
   where schemaname = 'public' and tablename = 'projects'),
  'RLS is enabled on projects'
);
```

---

## Service-Role-Only Tables

Outbox, audit_log, queue, and webhook_events tables must be unreachable by the `authenticated` role. The pattern: enable RLS, create no policies for `authenticated`. No matching policy = zero rows and blocked writes.

```sql
-- Schema
alter table public.outbox enable row level security;
-- No policy created for authenticated or anon

-- Test
call tests.login_as_org_a_admin();

select is_empty(
  $$ select * from public.outbox $$,
  'Authenticated user cannot read outbox (no policy = zero rows)'
);

select throws_ok(
  $$ insert into public.outbox (event_type, payload)
     values ('test_event', '{}') $$,
  '42501',
  'new row violates row-level security policy for table "outbox"',
  'Authenticated user cannot INSERT into outbox'
);

-- Verify no policies exist for authenticated role
set local role postgres;
select is_empty(
  $$ select policyname from pg_policies
     where schemaname = 'public'
       and tablename = 'outbox'
       and roles @> array['authenticated'] $$,
  'outbox has zero policies for authenticated role'
);
```

---

## Running Locally and in CI

### Local

```bash
supabase start
supabase test db
```

Tests run against the local Supabase stack. `supabase start` applies all migrations then seeds. Each `supabase test db` run does not restart the DB — tests roll back and leave the DB clean.

### GitHub Actions

```yaml
name: Database Tests

on:
  push:
  pull_request:
    types: [opened, synchronized, reopened]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Start Supabase stack
        run: supabase start

      - name: Run pgTAP tests
        run: supabase test db
```

Each CI run gets a fresh DB (migrations applied from scratch by `supabase start`). Test files are isolated by `BEGIN`/`ROLLBACK`. No test data persists between files.

`[VERIFY BEFORE SHIPPING]` — Confirm that `supabase test db <path>` correctly runs a single file in your CLI version. The single-file invocation is referenced in docs but behavior may vary across CLI releases.

---

## Fixture Lifecycle

Every test file runs inside a single transaction: `BEGIN` at the top, `ROLLBACK` at the end. Practical consequences:

| Item | Behavior |
|---|---|
| INSERTs | Rolled back — no cleanup needed |
| Schema changes (CREATE TABLE in test) | Rolled back |
| `SET LOCAL` role and GUC changes | Rolled back |
| Sequence counters (SERIAL/IDENTITY) | **Not rolled back** — gaps accumulate |
| Triggers | Fire normally; side effects also rolled back |
| AFTER DEFERRED triggers | Never fire (require COMMIT) |
| `pg_notify()` / `pg_net` calls | Fired; cannot be rolled back |

Do not assert specific integer ID values in tests — sequence counters advance even when the INSERT is rolled back.

Deferred constraints (`DEFERRABLE INITIALLY DEFERRED`) are never enforced in test transactions because they only check at COMMIT time. To test them, add `SET CONSTRAINTS ALL IMMEDIATE` before the assertion.

---

## Gotchas

**1. Testing as postgres superuser — the #1 false positive.**
Any assertion run before `SET ROLE authenticated` executes as the postgres superuser, which bypasses all RLS policies. The assertion passes for the wrong reason. Every assertion block must be preceded by `set_config` calls and `set local role authenticated`.

**2. Setting role without claims.**
`SET ROLE authenticated` alone does not populate `auth.jwt()` or `auth.uid()`. A policy like `(select auth.jwt() ->> 'org_id') = org_id::text` evaluates to `NULL = org_id::text`, which is false — all rows are filtered. The test may accidentally pass (zero rows expected, zero rows returned) even though the policy logic was never actually exercised. Always set both `request.jwt.claim.sub` and `request.jwt.claims` before `SET ROLE`.

**3. Using `throws_ok` for SELECT denial.**
SELECT with a failing RLS policy never throws. `throws_ok()` on a SELECT will itself fail because no exception is raised. Use `is_empty()`.

**4. Using `lives_ok` for UPDATE/DELETE permission.**
`UPDATE ... WHERE id = 'some-row-not-visible-to-me'` returns "0 rows updated" — not an error. `lives_ok()` passes. The update was silently blocked, but your test thinks it succeeded. Use `is_empty()` with `RETURNING id` to verify zero rows were affected.

**5. `basejump-supabase_test_helpers` `authenticate_as()` does not set top-level claims.**
This helper sets claims from `auth.users.raw_app_meta_data`. It does not set top-level claims like `org_id` or `aal` that the Custom Access Token Hook injects. Policies using `auth.jwt() ->> 'org_id'` will see NULL. Either use the raw `set_config` pattern (shown in the Core Pattern section) or manually override after calling `authenticate_as()`:

```sql
select tests.authenticate_as('admin-a');
-- Override with correct top-level claims
perform set_config('request.jwt.claims', json_build_object(
  'sub',    tests.get_supabase_uid('admin-a'),
  'role',   'authenticated',
  'org_id', 'aaaaaaaa-0000-0000-0000-000000000001',
  'aal',    'aal1'
)::text, true);
```

**6. `plan()` count drift.**
Add or remove an assertion without updating `select plan(N)` and the suite fails even if all assertions pass. Use `select no_plan()` during development; switch to an exact count before committing. The final count is the number of `select results_eq(...)`, `select is_empty(...)`, etc. calls — each is one test.

**7. Metadata assertions run as authenticated will fail or return wrong results.**
`policies_are`, `policy_cmd_is`, and `policy_roles_are` query `pg_policies`, which is a system catalog view. Call `set local role postgres` before metadata assertions to ensure the catalog is accessible.

---

## What This KB Does NOT Cover

- JavaScript/TypeScript integration tests against the Supabase API (see TEST_KB_3).
- General pgTAP usage beyond RLS testing (schema assertions, function testing).
- How to write or register the Custom Access Token Hook (see AUTH_KB_2).
- How AAL2 / MFA is configured in Supabase Auth (see AUTH_KB_3).
- RLS performance optimization patterns (see SB_KB_12).
- Multi-org membership helper functions (`private.get_my_org_ids()`) — see SB_KB_1.
