# OBS_KB_3 — Audit Logging: Append-Only Compliance Records in Postgres

**Stack-portable concept. Postgres/Supabase implementation. Compliance-retained, PII-deliberate — contrast with OBS_KB_1 (operational logs, PII redacted).**

---

## Pattern

Application-level audit logs are durable, immutable, append-only records of **who did what, when, against which resource** — written into Postgres and retained for compliance auditors, security teams, and legal counsel. They are not operational logs. They are not exception traces. They are the primary evidence a SOC 2 auditor or GDPR regulator reads.

Three properties define them:

1. **Append-only** — no row is ever updated or deleted (enforced by three independent layers)
2. **Compliance-retained** — kept for years, not weeks; dropped only by partition DDL, never by `DELETE`
3. **PII-deliberate** — actor UUIDs and resource IDs are intentionally retained; literal PII strings (email, name) are not stored in audit payloads

Distinct from:
- **OBS_KB_1** (structured operational logs) — audience is on-call engineers; PII must be redacted; ephemeral
- **OBS_KB_2** (Sentry error traces) — exception captures; not compliance artifacts
- **OBS_KB_4** — alerts on audit-write failures; monitors the health of this system

---

## Audit Logs vs. Operational Logs

| Dimension | Audit log | Operational log |
|---|---|---|
| **Audience** | Compliance auditors, legal, security | On-call engineers, SREs |
| **Retention** | Years (see Retention section) | Days to weeks |
| **Mutability** | Immutable — append-only | Ephemeral — rotated, overwritten |
| **PII rule** | UUIDs retained; literal strings (email, name) excluded | Redacted (see OBS_KB_1) |
| **Granularity** | Business-action level ("document.submitted") | System-level ("request 342ms") |
| **Schema** | Structured, queryable, normalized SQL | Semi-structured JSON blobs |
| **Failure mode** | Failed audit write must abort the parent transaction | Dropped lines are acceptable |

Source: OWASP Logging Cheat Sheet distinguishes process/audit logs from security event logs; they have different audiences and must be kept separate. (https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)

---

## When to use / when to skip

**Use when:**
- A user action must be provable after the fact (who did it, when, what the data looked like before/after)
- SOC 2, HIPAA, GDPR Art. 30, or ISO 27001 applies to the app
- An admin accesses another user's data or escalates their own privilege
- A financial, medical, or legal record is created, modified, or deleted

**Skip / simplify when:**
- The action is a read with no side effects and no compliance scope
- You need a user-facing "recent activity" feed — build a separate `user_activity_log` with defined scope; do not reuse the compliance table

---

## Events That Belong Here

From OWASP Logging Vocabulary Cheat Sheet (https://cheatsheetseries.owasp.org/cheatsheets/Logging_Vocabulary_Cheat_Sheet.html):

- **AUTHN** — login success/failure, password change, token lifecycle
- **AUTHZ** — access denial, privilege escalation, admin activity
- **USER** — user created, modified, archived, deleted
- **DATA** — CRUD on confidential records
- **PRIVILEGE** — object permission modifications, role grants/revocations
- **UPLOAD** — compliance document uploaded (see SB_KB_7)
- **SESSION** — session created, submitted, revised (see SB_KB_5 / SB_KB_6)

Authentication-specific events (email change, password reset, account deletion) are detailed in **AUTH_KB_6**. Cross-reference there; do not duplicate the account-lifecycle patterns here.

---

## Anti-patterns

**`payload json` instead of `payload jsonb`**
Supabase's internal `auth.audit_log_entries` table uses `payload json` (not `jsonb`). JSON columns are not GIN-indexable — you cannot run `@>` containment queries on them. Always use `jsonb` for application audit tables. This is the lesson from the internal auth table.

**Exposing audit rows to end users**
Users must not read their own audit trail through RLS. It leaks what the system tracks, reveals audit coverage, and provides no compliance benefit. If subjects need a "recent logins" feed, build a separate purpose-limited table.

**Storing literal PII in audit payloads**
After a user exercises erasure rights, `profiles` is anonymized but `audit_log` rows are immutable. If you stored `email: "user@example.com"` in `metadata`, it lives forever and is permanently de-anonymized. Use UUIDs. After anonymization, `actor_id` (a UUID) resolves to `[deleted]` via the profiles join — the UUID survives, the PII does not. (Established in AUTH_KB_6.)

**Relying only on REVOKE or only on RLS for immutability**
`service_role` bypasses both. The BEFORE trigger is the only layer that catches service_role mutations. All three layers must be installed (see below).

**pg_partman for partition management on Supabase**
pg_partman requires a background worker (`pg_partman_bgw`) in `shared_preload_libraries`. Supabase managed instances do not expose `ALTER SYSTEM`. pg_partman's BGW is not available. Use native declarative partitioning + pg_cron instead.

**pgaudit as a substitute for an application audit table**
pgaudit logs SQL operations into the Postgres log pipeline. On stock Postgres that's a CSV log file on disk; on Supabase the output surfaces in the Logs Explorer (queryable via the dashboard's `postgres_logs` SQL interface, exportable as CSV). Either way it captures the Postgres role that ran the SQL, not the application user, and is not a regular SQL table you can join against. Useful for forensics after a breach, not for compliance evidence about business events. Not a substitute for `audit_log`.

---

## Schema

```sql
-- Partitioned parent table — see Retention section for partition DDL
-- (id, occurred_at) composite PK required because the partition key must appear in the PK
create table audit_log (
  -- Identity
  id            bigserial,
  occurred_at   timestamptz not null default now(),

  -- Actor (who)
  actor_id      uuid references auth.users(id),  -- null for system/cron actors
  actor_type    text not null
                check (actor_type in ('user', 'service', 'system', 'cron')),

  -- Action (what): dot-notation verbs — resource.verb (e.g., 'document.submitted')
  action        text not null,
  status        text not null default 'success'
                check (status in ('success', 'failure', 'denied')),

  -- Resource (against what)
  resource_type text,                            -- e.g., 'document', 'session', 'user'
  resource_id   uuid,                            -- FK-free: target may be deleted at query time

  -- Tenancy
  org_id        uuid references organizations(id),

  -- Network context
  ip_address    inet,                            -- inet, not varchar: enables subnet range queries
  user_agent    text,

  -- State capture (strip PII columns before storing — see PII section)
  before_state  jsonb,                           -- relevant fields before change; null for creates
  after_state   jsonb,                           -- relevant fields after change; null for deletes

  -- Catch-all context
  metadata      jsonb not null default '{}',     -- use jsonb, never json (GIN-indexable)

  -- Tracing (correlate with OBS_KB_1 operational logs)
  request_id    text,

  primary key (id, occurred_at)                  -- composite PK required for range partitioning
) partition by range (occurred_at);
```

**Design decisions:**
- `resource_id` is FK-free. A hard FK would prevent the target resource from being deleted or would cascade-delete audit rows. Audit records must outlive what they document.
- `actor_id` references `auth.users`, not `profiles`. Profiles can be anonymized; the `auth.users` UUID is the stable identity anchor that survives anonymization. (See AUTH_KB_6.)
- `ip_address` uses `inet` type. Enables subnet containment queries (`inet '10.0.0.0/8' >> ip_address`). `varchar` does not.
- `metadata` is `jsonb`. This makes `@>` containment queries possible and enables GIN indexing. Never use `json`.

---

## Three-Layer Immutability Stack

All three layers must be installed. Each catches a different class of actor. Layer 2 (the trigger) is the **only layer that catches `service_role`** — service_role has owner-equivalent privileges (bypasses REVOKE) and has `BYPASSRLS` (bypasses RLS). FORCE ROW LEVEL SECURITY does not override BYPASSRLS.

### Layer 1 — REVOKE UPDATE/DELETE from application roles

Source: https://www.postgresql.org/docs/current/sql-revoke.html and https://www.postgresql.org/docs/current/ddl-priv.html

Blocks the `authenticated` and `anon` roles (normal app traffic). Does not block `service_role` or the table owner.

```sql
REVOKE UPDATE, DELETE ON audit_log FROM authenticated, anon;
REVOKE UPDATE, DELETE ON audit_log FROM PUBLIC;
```

The SB_KB_5 `session_events` table uses this pattern exactly:
```sql
revoke update, delete on session_events from authenticated, anon;
```

Apply the same pattern here and to every partition as partitions are created.

### Layer 2 — BEFORE trigger (the only layer that catches service_role)

Source: https://www.postgresql.org/docs/current/plpgsql-trigger.html and https://www.postgresql.org/docs/current/sql-createtrigger.html

A BEFORE trigger that raises an exception aborts the entire enclosing transaction — not just the attempted row mutation. `RAISE EXCEPTION` is stronger than `RETURN NULL` for this purpose: it produces an error code that is visible in application error logs and Sentry (OBS_KB_2).

Trigger functions must be `SECURITY DEFINER` with `SET search_path = schema, pg_temp` to prevent schema-injection attacks where a malicious user creates a function in a writable schema that shadows the target.

```sql
create or replace function private.prevent_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- This trigger catches service_role, table owner, and any role that bypasses
  -- REVOKE or RLS. It is the last line of defense for append-only enforcement.
  raise exception
    'Audit log records are immutable. Operation: %, Table: %.%',
    tg_op, tg_table_schema, tg_table_name
    using errcode = 'P0001';
  return null; -- never reached; required by trigger function signature
end;
$$;

create trigger trg_audit_log_immutable
before update or delete on audit_log
for each row
execute function private.prevent_audit_mutation();
```

**Partition behavior:** This trigger is defined on the parent table. Postgres fires parent-table BEFORE triggers for declarative partitioned tables — the trigger applies to all partitions without redefinition. `DROP TABLE audit_log_2024_01` (dropping a child partition) is DDL, not DML — it does not fire the BEFORE trigger. Partition dropping is the correct, trigger-safe way to expire old audit data.

### Layer 3 — RLS INSERT-only, admin-only SELECT

Source: https://www.postgresql.org/docs/current/ddl-rowsecurity.html and https://supabase.com/docs/guides/database/postgres/row-level-security

With RLS enabled and no UPDATE/DELETE policies defined, those operations are denied for all `authenticated` users (default-deny). No policy needed to block UPDATE/DELETE — absence is the policy.

Apply the InitPlan pattern to role-check calls in RLS policies (evaluated once per query, not per row — SB_KB_12 RLS performance):

```sql
alter table audit_log enable row level security;
alter table audit_log force row level security;
-- Note: FORCE RLS applies to the table owner role. It does NOT override BYPASSRLS.
-- service_role has BYPASSRLS. The trigger (Layer 2) is the only protection for service_role.

-- INSERT: authenticated users may insert rows they authored
create policy "audit_log: authenticated inserts own events"
on audit_log for insert
to authenticated
with check (
  actor_id = (select auth.uid())
  and actor_type = 'user'
);

-- SELECT: restricted to security/admin role only — never to the actor themselves
-- Adapt private.is_security_role() to the project's role system
create policy "audit_log: security role can select"
on audit_log for select
to authenticated
using (
  (select private.is_security_role((select auth.uid())))
);

-- No UPDATE policy. No DELETE policy. Default-deny for authenticated.
-- service_role bypasses RLS entirely — controlled by Layer 2 (trigger) only.
```

---

## Who Writes Audit Rows

Three approaches. Choose based on the event's compliance weight and whether business intent matters.

### Approach A — Trigger on the source table (automatic, low intent)

Best for: completeness on high-value tables where a developer forgetting to log is worse than noisy logs. Example: financial amount columns, document status transitions.

```sql
create or replace function private.audit_documents_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into audit_log (
    actor_id, actor_type, action,
    resource_type, resource_id, org_id,
    before_state, after_state, occurred_at
  ) values (
    (select auth.uid()),          -- null for service_role / cron — expected, log it
    case when (select auth.uid()) is null then 'system' else 'user' end,
    case tg_op
      when 'INSERT' then 'document.created'
      when 'UPDATE' then 'document.updated'
      when 'DELETE' then 'document.deleted'
    end,
    'document',
    coalesce(new.id, old.id),
    coalesce(new.org_id, old.org_id),
    -- Strip PII columns before storing snapshot (see PII section)
    case when tg_op in ('UPDATE','DELETE')
      then to_jsonb(old) - 'email' - 'phone' - 'display_name'
      else null end,
    case when tg_op in ('INSERT','UPDATE')
      then to_jsonb(new) - 'email' - 'phone' - 'display_name'
      else null end,
    now()
  );
  return coalesce(new, old);
end;
$$;

create trigger trg_documents_audit
after insert or update or delete on documents
for each row
execute function private.audit_documents_change();
```

Caveats: `auth.uid()` returns null inside triggers invoked by `service_role` or `pg_cron` — set `actor_type = 'system'` in those paths. Full-row JSONB dumps may include PII columns — strip explicitly before inserting.

### Approach B — Explicit DB function call (recommended for business-critical events)

Best for: high-value business events where intent matters ("document.submitted" vs. "row updated"). The SB_KB_6 `submit_admin_session` function demonstrates this pattern: audit write is step 3 inside a single `plpgsql` function with `SELECT ... FOR UPDATE` serialization. The audit write is inside the same transaction as the state change — they commit or roll back together.

```sql
-- Inside a DB function (e.g., submit_document):
-- 3. Write audit event (same transaction as the state change — see SB_KB_6 pattern)
insert into audit_log (actor_id, actor_type, action, resource_type, resource_id, org_id, metadata)
values (
  p_actor_id,
  'user',
  'document.submitted',
  'document',
  p_document_id,
  v_document.org_id,
  jsonb_build_object('version', v_document.version)
);
```

Caveats: developer must remember to include the insert — omissions are silent. Mitigate with code review and the trigger backstop on the source table.

### Approach C — Outbox pattern (async, for fan-out)

Decouples audit writes from the source transaction. Useful when audit records must also fan out to a SIEM, webhook, or external log store. Carries at-least-once delivery semantics — deduplication logic required at the consumer.

**Outbox mechanics are deferred to JOB_KB_1.** Reference that KB for implementation details. The outbox table pattern is established in SB_KB_6.

### Summary

| Approach | Atomicity | Intent capture | PII control | Risk |
|---|---|---|---|---|
| Trigger on source table | Automatic / transactional | Low (row-level) | Requires explicit stripping | Actor null on service_role |
| Explicit DB function (SB_KB_6 pattern) | Manual / transactional | High (business event) | Easy | Omission risk |
| Outbox (JOB_KB_1) | At-least-once async | High | Easy | Infra complexity |

**Default:** Explicit DB function for business-critical events. Trigger as a backstop on tables where completeness outweighs intent precision.

---

## Supabase Auth Integration

### `auth.audit_log_entries` — what it is and why it is not enough

Confirmed from source code (https://raw.githubusercontent.com/supabase/auth/master/migrations/00_init_auth_schema.up.sql):

```sql
-- Internal Supabase Auth table — DO NOT use as your compliance audit table
CREATE TABLE IF NOT EXISTS auth.audit_log_entries (
  instance_id  uuid NULL,        -- deprecated legacy artifact
  id           uuid NOT NULL,
  payload      json NULL,        -- json, not jsonb — NOT GIN-indexable
  created_at   timestamptz NULL,
  ip_address   VARCHAR(64) NOT NULL DEFAULT '',
  CONSTRAINT audit_log_entries_pkey PRIMARY KEY (id)
);
```

The `payload` column is `json`, not `jsonb`. You cannot run `@>` containment queries or build a GIN index on it. There is no `org_id`, no `resource_id`, and no business-level context. It records auth-subsystem events only (sign-in, sign-out, user creation). It is not queryable via PostgREST — requires a service-role client or a `SECURITY DEFINER` function in the `public` schema.

**Your application needs its own `audit_log` table.** The internal table is a Supabase implementation detail; do not depend on its schema, its retention policy, or its queryability in production code.

### Auth hooks for audit capture

Supabase Auth hooks (https://supabase.com/docs/guides/auth/auth-hooks) fire in a service context — `auth.uid()` is not set. Use the `user_id` from the hook payload as `actor_id` and write via a service-role client or `SECURITY DEFINER` DB function.

Available hook events and their audit data:

| Hook | Event | Key audit fields available |
|---|---|---|
| Before User Created | Sign-up | `user_id`, `email`, `phone`, `provider`, `ip_address` |
| Custom Access Token | Every token issuance (login, refresh, MFA) | `user_id`, `session_id`, `aal`, `amr` (auth method + timestamp) |
| Send Email | Email action triggered | `email_action_type` (email_change, recovery, etc.) |

**Patterns for specific auth events (email change, password reset, account deletion) are in AUTH_KB_6** — defer there. OBS_KB_3 owns the table structure and immutability guarantees; AUTH_KB_6 owns the account-lifecycle write patterns.

---

## Retention and Partitioning

### Why partitioning is required

An `audit_log` table at 10,000 rows/day reaches 18M rows over 5 years. The immutability BEFORE trigger blocks `DELETE` — you cannot age out old rows with `DELETE FROM audit_log WHERE occurred_at < ...`. That statement would fire the trigger and abort.

The correct expiry mechanism is `DROP TABLE audit_log_2019_01` — a DDL operation on the child partition. DDL does not fire BEFORE DML triggers on the parent. This is the intended path.

### Native declarative RANGE partitioning (Postgres 11+)

Source: https://www.postgresql.org/docs/current/ddl-partitioning.html

```sql
-- Parent already declared with PARTITION BY RANGE (occurred_at) in the Schema section.
-- Partition key must appear in the primary key — hence (id, occurred_at) composite PK.

-- Create monthly partitions in advance:
create table audit_log_2026_01 partition of audit_log
  for values from ('2026-01-01') to ('2026-02-01');

create table audit_log_2026_02 partition of audit_log
  for values from ('2026-02-01') to ('2026-03-01');
-- Bounds: lower inclusive, upper exclusive. Adjacent partitions share boundary values.

-- Indexes on the parent propagate automatically to all partitions (Postgres 11+):
create index idx_audit_log_actor_time   on audit_log (actor_id, occurred_at desc);
create index idx_audit_log_resource     on audit_log (resource_type, resource_id, occurred_at desc);
create index idx_audit_log_org_time     on audit_log (org_id, occurred_at desc);
create index idx_audit_log_ip_time      on audit_log (ip_address, occurred_at desc);
create index idx_audit_log_action_time  on audit_log (action, occurred_at desc);
create index idx_audit_log_time_brin    on audit_log using brin (occurred_at);
-- BRIN is very small and fast for time-range scans; works because rows are
-- inserted in roughly ascending time order (matches the Supabase blog observation:
-- https://supabase.com/blog/postgres-audit — BRIN "hundreds of times smaller than B-tree")
create index idx_audit_log_metadata     on audit_log using gin (metadata jsonb_path_ops);
-- jsonb_path_ops: smaller and faster for @> containment; does not support key-exists (?)
-- Use jsonb_ops if you need ?/key-existence queries on metadata
```

### Aging out old partitions

```sql
-- Fast DROP (acquires ACCESS EXCLUSIVE on the partition, not the parent):
DROP TABLE audit_log_2019_01;

-- Or detach first (SHARE UPDATE EXCLUSIVE — much less disruptive), then drop:
ALTER TABLE audit_log DETACH PARTITION audit_log_2019_01 CONCURRENTLY;
DROP TABLE audit_log_2019_01;
-- CONCURRENTLY requires Postgres 14+
```

### Automating partition creation with pg_cron

pg_partman requires a background worker (`pg_partman_bgw`) in `shared_preload_libraries`. Supabase managed instances do not allow `ALTER SYSTEM` — **pg_partman's background worker is not available on Supabase**. Use a `pg_cron` job instead (pg_cron is available on Supabase Pro+ plans):

```sql
-- Run on the 25th of each month; creates the following month's partition
select cron.schedule(
  'create-audit-partition',
  '0 0 25 * *',
  $$
  do $$
  declare
    next_month     date := date_trunc('month', now() + interval '1 month');
    partition_name text := 'audit_log_' || to_char(next_month, 'YYYY_MM');
    range_start    text := to_char(next_month, 'YYYY-MM-DD');
    range_end      text := to_char(next_month + interval '1 month', 'YYYY-MM-DD');
  begin
    execute format(
      'create table if not exists %I partition of audit_log
         for values from (%L) to (%L)',
      partition_name, range_start, range_end
    );
  end;
  $$ language plpgsql;
  $$
);
```

### Retention guidance

| Framework | Commonly cited retention | Notes |
|---|---|---|
| GDPR Art. 30 | No fixed period — "as long as processing continues" | Records of processing activities; accountability principle (Art. 5(2)) requires demonstrating compliance |
| HIPAA §164.312(b) | 6 years widely cited for policies and procedures | Whether audit logs themselves fall under this depends on whether the app processes ePHI — **no authoritative HHS primary source confirmed during research (403 errors)** |
| SOC 2 | Typically 1 year of evidence per audit cycle; many orgs retain 3–7 years | **AICPA primary source not verified during research** — consult your auditor |
| ISO 27001:2022 | Per organizational policy; Annex A.8.15 requires logs protected from modification | **ISO primary source not accessible (paywall)** |

When in doubt, retain 7 years. Partition drop makes deletion cheap — the cost of over-retention is storage; the cost of under-retention is a compliance gap.

---

## Querying for Compliance

These are the queries investigators actually run. Index design above is optimized for them.

**All actions by a user in a date range** (relies on `idx_audit_log_actor_time`):
```sql
select occurred_at, action, resource_type, resource_id, ip_address, status
from audit_log
where actor_id = '<user-uuid>'
  and occurred_at >= '2025-01-01'
  and occurred_at <  '2026-01-01'
order by occurred_at desc;
```

**Full history of a specific resource** (relies on `idx_audit_log_resource`):
```sql
select occurred_at, actor_id, actor_type, action, before_state, after_state
from audit_log
where resource_type = 'document'
  and resource_id = '<document-uuid>'
order by occurred_at asc;
```

**All privilege escalations in the last 90 days**:
```sql
select occurred_at, actor_id, action, metadata
from audit_log
where action like 'role.%'
  and occurred_at >= now() - interval '90 days'
order by occurred_at desc;
```

**Failed auth attempts from an IP**:
```sql
select occurred_at, actor_id, action, ip_address, metadata
from audit_log
where ip_address = '198.51.100.42'::inet
  and action like 'auth.%'
  and status = 'failure'
  and occurred_at >= now() - interval '30 days'
order by occurred_at desc;
```

**Metadata JSONB containment search** (relies on `idx_audit_log_metadata` GIN index):
```sql
select occurred_at, actor_id, action, metadata
from audit_log
where metadata @> '{"mfa_used": true}'
  and occurred_at >= now() - interval '7 days';
```

Source for GIN operator classes: https://www.postgresql.org/docs/current/datatype-json.html#DATATYPE-JSONB — `jsonb_path_ops` supports `@>`, `@?`, `@@` only (smaller, faster for containment); `jsonb_ops` also supports `?` key-exists. Choose based on query patterns.

---

## PII Handling

Audit logs deliberately retain UUIDs that link to personal data. This is the **opposite** of OBS_KB_1's redaction rule. The access control layer is the PII safeguard — not redaction.

**Retain:**
- `actor_id` — UUID; resolves to `[deleted]` after anonymization via the profiles join
- `resource_id` — UUID; not itself PII
- `org_id` — UUID
- `ip_address` — may be needed for security investigations (GDPR "legitimate interest" basis)

**Do not store:**
- Email addresses, display names, phone numbers in `metadata` or `before_state`/`after_state` — store the UUID and join at query time
- Passwords, tokens, API keys — never in any log
- Payment card numbers, SSNs, health record contents — log that the action occurred, not the data

When capturing state snapshots via trigger, strip PII columns explicitly:

```sql
-- Inside the trigger function, before inserting before_state / after_state:
to_jsonb(old) - 'email' - 'phone' - 'password_hash' - 'display_name'
```

**GDPR Art. 17 right to erasure:** When a user requests deletion, anonymize `profiles` (display_name → `[deleted]`, remove email). Audit rows that reference the user's UUID continue to resolve correctly — the UUID identifies the event actor for auditors, but the data subject is no longer identifiable. This satisfies erasure in most jurisdictions. Confirm with legal counsel for the specific app jurisdiction. (AUTH_KB_6 documents the full anonymization pattern.)

**Access control requirements:**
- No user-facing SELECT policy on `audit_log` — only the security/admin role reads it (see Layer 3 above)
- Never return audit rows in API responses to end users
- Background jobs processing audit data run as service_role; no user passthrough

---

## pgaudit vs. Application Audit Logs

Source: https://supabase.com/docs/guides/database/extensions/pgaudit

| Dimension | pgaudit | Application `audit_log` table |
|---|---|---|
| **What it captures** | SQL operations (SELECT, INSERT, UPDATE, DELETE, DDL) | Business events ("document.submitted") |
| **Actor** | Postgres role that ran the statement | Application user (`auth.uid()` / hook `user_id`) |
| **Output** | Postgres log pipeline (CSV on stock PG; Logs Explorer / `postgres_logs` on Supabase — queryable via dashboard, not a regular SQL table) | Queryable SQL table; GIN + B-tree indexed |
| **Compliance value** | Low for application-level audits | High — what compliance auditors read |
| **Supabase limitations** | Role-level only; parameter logging disabled; no ALTER SYSTEM | None beyond normal RLS |

pgaudit is appropriate for forensics after a breach ("what SQL was run"). It is not a substitute for an application `audit_log` table and it is not what a SOC 2, HIPAA, or GDPR auditor examines.

---

## Always / Never

**ALWAYS install all three immutability layers.** REVOKE stops `authenticated`; RLS adds default-deny for UPDATE/DELETE; the BEFORE trigger is the only layer that catches `service_role`. Missing any one layer leaves a class of actor uncontrolled.

**ALWAYS use `jsonb`, never `json`.** The lesson from `auth.audit_log_entries`: `payload json` is not GIN-indexable. Containment queries (`@>`) on `json` columns require a full table scan. `metadata jsonb` enables the GIN index.

**ALWAYS write the audit row inside the same transaction as the state change** (DB function approach, SB_KB_6 pattern). An audit row written before the commit ensures the record exists even if the caller crashes or the network drops between steps.

**ALWAYS let audit timestamps default to `now()` at the DB; NEVER insert `occurred_at` (or `executed_at` / `approved_at` / `resolved_at`) from an app-supplied value or a hand-typed literal.** A literal parses fine and silently inverts event ordering across timezones — the DB clock is the single source. (This governs the `audit_log` table; business-table status columns are covered by the `gen-migration` "What to Check For" timestamp rule, which spans all tables. Installed 2026-07-07, not yet proven in a live run in this framework's projects.)

**ALWAYS use UUIDs in audit payloads.** Literal emails and display names survive anonymization and cannot be erased. UUIDs resolve to `[deleted]` after the profiles row is anonymized. (AUTH_KB_6.)

**NEVER expose audit rows to end users.** No RLS SELECT policy for `authenticated` without the security role check. If users need a "recent activity" feed, build a separate, purpose-limited `user_activity_log` table.

**NEVER use pg_partman on Supabase managed instances.** Its background worker requires `shared_preload_libraries` access that Supabase does not provide. Use native declarative partitioning + pg_cron.

**NEVER redact `actor_id` or `resource_id` in audit logs.** These are the fields compliance auditors use. Redaction belongs in OBS_KB_1 (operational logs). Audit logs keep UUIDs by design.

**NEVER depend on `auth.audit_log_entries` for application compliance.** It uses `json` not `jsonb`, exposes no `org_id`, captures only auth-subsystem events, and is an internal Supabase implementation detail not guaranteed for production querying or retention.

---

## Open Questions (carry forward)

The following were flagged during research and not fully resolved. Treat the relevant sections as verified-to-the-degree-possible, not authoritative.

1. **HIPAA 6-year retention** — the "6 years" claim was encountered only in secondary sources; HHS.gov primary source returned 403. Confirm against 45 CFR §164.312(b) before citing to auditors.
2. **SOC 2 CC7 control text** — AICPA primary source was not accessible. Consult your auditor for specific control wording.
3. **ISO 27001:2022 Annex A control numbers** — paywall-protected; A.8.15/A.8.16/A.8.17 cited from secondary knowledge. Verify with institutional ISO access.
4. **`auth.audit_log_entries` production retention policy** — whether Supabase purges this table on a schedule was not confirmed. Do not depend on it for compliance.
5. **`service_role` and `FORCE ROW LEVEL SECURITY`** — confirmed that `BYPASSRLS` overrides FORCE RLS; confirmed that the BEFORE trigger is the only protection. Layer 2 is the backstop.
6. **Auth hook atomicity** — if an audit write inside a Supabase auth hook fails, whether the login itself fails was not definitively confirmed. Do not use hooks as the sole audit path for auth events unless failure behavior is tested.

---

## Cross-references

- **OBS_KB_1** — operational logs; PII redaction rule; request_id format for cross-correlation with `audit_log.request_id`
- **OBS_KB_2** — Sentry error tracking; audit-write failures that raise exceptions surface here
- **OBS_KB_4** — alerts on audit-write failure rates; monitor this system's health
- **SB_KB_5** — `session_events` table: the established per-aggregate immutability pattern this generalizes
- **SB_KB_6** — `submit_admin_session` DB function: the canonical explicit audit write pattern (step 3 inside a single plpgsql transaction)
- **SB_KB_7** — document upload compliance: `document_access_log` is a domain-specific audit table following this pattern
- **AUTH_KB_6** — account-lifecycle audit events (email change, password reset, account deletion); UUID-not-PII rule established there
- **JOB_KB_1** — outbox mechanics for audit fan-out (approach C above)
