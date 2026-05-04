# SB_KB_5 — Dual-Track Workflow: Admin-Guided Session + User Self-Service

**Stack-portable concept. Postgres/Supabase RLS implementation.**

---

## Pattern

Two parallel actors work on the same domain (a checklist, a form, a record) with different visibility rules:

- **User** self-serves asynchronously through their own view
- **Admin** runs a live structured session with their own view; outputs (notes, tasks, observations) are **not visible to the user until the admin explicitly submits**

The pattern: model the admin session as a **first-class entity** with a state machine, make all session children (notes, tasks) FK-linked to the parent session, and gate user visibility entirely through RLS that **joins through the parent session's state**. No visibility flags on child rows — the parent state is the single source of truth.

This is how EHRs handle "sign before visible," performance review tools handle "manager draft → share," and CSM platforms handle "call notes → CRM publish."

---

## When to use / when to skip

**Use when:**
- An admin produces output during or after a session that the user should only see once it's complete
- Output (notes, tasks, observations) belongs to one session and should be published atomically
- You need an audit trail of what was shared and when

**Skip when:**
- Admin output is always immediately visible — just add a `created_by` column and normal RLS
- There's no concept of a "session" — individual notes with per-row visibility are simpler
- The admin and user are the same person (self-review) — no dual-track needed

---

## Anti-patterns

**Mirror table: copying outputs into a user-visible table on submit**
Creates two sources of truth. Edits after submit require syncing both tables. Sync drift is a when-not-if. Don't.

**Boolean visibility flag flipped row-by-row in a loop**
```sql
-- Don't do this
update session_notes set visible_to_subject = true where session_id = $1;
```
Race-prone: a user polling during the loop sees partial state. Fails idempotency. Breaks if the loop crashes halfway. Use a state transition on the parent + RLS join instead.

**Two admins running concurrent sessions for the same subject**
Without a constraint, you get two active state machines, conflicting tasks, and undefined merge behavior. Enforce one active session per subject with a partial unique index.

**Real-time presence during session (showing the admin is actively typing)**
EHR systems deliberately don't show "your doctor is writing a note about you right now." It creates anxiety and prematurely reveals that something is being recorded. Show a soft status ("Your session is being prepared") but not keystroke-level presence.

**Visibility leak via FK existence**
If a user can query `session_tasks where assigned_to = auth.uid()`, and RLS hides the body but not the row count, the existence of a row is a side channel. Ensure RLS on child tables completely hides rows (not just column-masks) when the parent session is in draft state.

---

## Generic example

```sql
-- Parent session entity: admin-owned, subject-linked
create table admin_sessions (
  id           uuid primary key default gen_random_uuid(),
  subject_id   uuid not null references profiles(id) on delete cascade,
  admin_id     uuid not null references profiles(id),
  org_id       uuid not null references organizations(id),
  state        text not null default 'draft'
               check (state in ('draft', 'in_progress', 'submitted', 'revised')),
  started_at   timestamptz,
  completed_at timestamptz,
  submit_token uuid unique,            -- idempotency key for the submit action
  version      int not null default 1, -- bumped on each submission/revision
  created_at   timestamptz default now()
);

-- Enforce: max one active session per subject at a time
create unique index one_active_session_per_subject
  on admin_sessions (subject_id)
  where state in ('draft', 'in_progress');

create index on admin_sessions (admin_id, state);
create index on admin_sessions (org_id, state);
create index on admin_sessions (subject_id, state);

-- Child: notes (admin-authored, session-scoped)
create table session_notes (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references admin_sessions(id) on delete cascade,
  body       text not null,
  author_id  uuid not null references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Child: tasks assigned to the subject
create table session_tasks (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references admin_sessions(id) on delete cascade,
  title        text not null,
  description  text,
  due_date     date,
  assigned_to  uuid not null references profiles(id),
  published_at timestamptz,   -- set on submit; null = not yet visible to subject
  completed_at timestamptz,
  created_at   timestamptz default now()
);

-- Audit log: immutable event record
create table session_events (
  id          bigserial primary key,
  session_id  uuid not null references admin_sessions(id),
  actor_id    uuid not null references profiles(id),
  event_type  text not null,  -- 'created','started','note_added','task_added','submitted','revised'
  payload     jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);
-- Prevent modification of audit records
revoke update, delete on session_events from authenticated, anon;

-- -------------------------------------------------------
-- RLS
-- -------------------------------------------------------
alter table admin_sessions enable row level security;
alter table session_notes   enable row level security;
alter table session_tasks   enable row level security;

-- Helper: is this session visible to the subject?
create or replace function private.session_visible_to_subject(p_session_id uuid, p_user_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from admin_sessions s
    where s.id = p_session_id
      and s.subject_id = p_user_id
      and s.state in ('submitted', 'revised')
  );
$$;

-- Admin sees all sessions they own
create policy "sessions: admin reads own"
on admin_sessions for select to authenticated
using ( admin_id = (select auth.uid()) );

-- Subject sees sessions addressed to them, only when submitted
create policy "sessions: subject reads submitted"
on admin_sessions for select to authenticated
using (
  subject_id = (select auth.uid())
  and state in ('submitted', 'revised')
);

-- Notes: admin sees notes in their sessions
create policy "notes: admin reads own session"
on session_notes for select to authenticated
using (
  exists (
    select 1 from admin_sessions s
    where s.id = session_notes.session_id
      and s.admin_id = (select auth.uid())
  )
);

-- Notes: subject sees notes only when parent is submitted
create policy "notes: subject reads submitted"
on session_notes for select to authenticated
using (
  (select private.session_visible_to_subject(session_id, (select auth.uid())))
);

-- Tasks: same pattern
create policy "tasks: admin reads own session"
on session_tasks for select to authenticated
using (
  exists (
    select 1 from admin_sessions s
    where s.id = session_tasks.session_id
      and s.admin_id = (select auth.uid())
  )
);

create policy "tasks: subject reads published"
on session_tasks for select to authenticated
using (
  assigned_to = (select auth.uid())
  and published_at is not null
  and (select private.session_visible_to_subject(session_id, (select auth.uid())))
);
```

**State machine transitions** should be enforced in a DB function (see SB_KB_6 for the submit function) not in application code alone.

---

## Trade-offs

| Visibility approach | Single source of truth | Edits after submit | Read performance |
|---|---|---|---|
| **RLS join through parent state (this pattern)** | Yes — parent state | Trivial — change state, update children | Slightly slower — joins parent |
| **Boolean flag per row** | No — flag can drift | Must update N rows | Faster reads |
| **Mirror table** | No — two tables | Nightmare | Fastest |

**Denormalized flag via trigger:** If the children count grows very large (thousands of tasks per session), denormalize a `visible_to_subject boolean` on child rows via an `AFTER UPDATE ON admin_sessions` trigger that sets the flag when state transitions to `submitted`. Faster reads at the cost of N-row write on publish. Only worth it when measured.

---

## Gotchas

**`AFTER UPDATE` trigger for Realtime notifications, never `BEFORE UPDATE`.** Realtime Broadcast reads WAL post-commit. A `BEFORE UPDATE` trigger that emits a notification may fire before the commit lands, causing subscribers to refetch and see stale data.

**Partial unique index on `(subject_id) where state in ('draft','in_progress')` doesn't prevent a second draft from being created while one is being submitted.** Add a `SELECT ... FOR UPDATE` on the session row at the start of any state transition function to serialize concurrent operations. See `submit_admin_session` in SB_KB_6 for the full pattern.

**Admin org scoping.** Decide: can admin A from Org A see sessions created by admin B from Org A? Typically yes (org-level visibility for admins). Add a policy: `org_id = any(array(select private.get_my_org_ids()))` for admins with the `admin` role.

**Revised state.** After submit, if an admin makes corrections, should the subject see a "this was updated" indicator? Track with `version` on the session and expose `version` to the subject. Let the UI show "Updated 2 days after initial delivery" using `completed_at` vs current time.
