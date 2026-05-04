# SB_KB_6 — Submit-to-Reveal: Atomic Publish with Idempotency and Audit Trail

**Stack-portable concept. Postgres implementation.**

---

## Pattern

A "publish moment" atomically transitions a draft entity to a visible state, stamps child rows, writes an audit event, and enqueues an outbox notification — all in one transaction. The submit action must be:

1. **Atomic** — state flip + child stamping + audit + outbox happen together or not at all
2. **Idempotent** — submitting twice with the same token produces the same result, not a duplicate
3. **Ordered before side effects** — emails and realtime broadcasts fire only after commit, never before

This is the engineering pattern behind EHR "sign to make visible," DocuSign envelope completion, and any "complete and share" flow.

---

## When to use / when to skip

**Use when:**
- A user or admin has a "publish" or "complete" action that makes content visible to another party
- You need to prove after the fact exactly what was shared and when (audit defense)
- The action can be retried by a flaky client or network

**Skip when:**
- Content is always immediately visible — no publish moment, no pattern needed
- You're building a simple form where submit = write and there's no downstream visibility change

---

## Anti-patterns

**Email before commit**
```ts
// Wrong
await sendEmail(user, 'Your session is ready');
await db.update(session).set({ state: 'submitted' });
```
If the DB write fails after the email sends, the user gets a notification about content they can't see. Always commit first; send via outbox after.

**State guard without `SELECT FOR UPDATE`**
```sql
-- Insufficient: two concurrent submits can both pass this check
if session.state != 'submitted' then update ...
```
Use `SELECT ... FOR UPDATE` to serialize concurrent submit attempts on the same row.

**Idempotency token as a request header only**
Client-generated idempotency keys sent in headers and stored only in Redis TTL caches expire. Store the token durably in the DB row so idempotency survives cache eviction and server restarts.

**`pg_notify` from `BEFORE UPDATE` trigger**
Fires before commit. Subscribers refetch and see stale state. Use `AFTER UPDATE` triggers for any notifications tied to state transitions.

**Flipping child rows visible one-by-one in application code**
```ts
// Wrong — race condition, partial visibility on crash
for (const task of tasks) {
  await db.update(task).set({ published_at: new Date() });
}
```
Use a single SQL `UPDATE ... WHERE session_id = $1` inside the submit transaction.

**Edits after submit destroying audit trail**
If an admin corrects a typo in a note after submit, the subject may not realize the content changed. Track changes via `version` bump + `session_events` log.

---

## Generic example

```sql
-- Submit function: atomic, idempotent, ordered
create or replace function submit_admin_session(
  p_session_id  uuid,
  p_admin_id    uuid,
  p_submit_token uuid  -- UUID generated client-side before the first attempt
)
returns admin_sessions
language plpgsql
security invoker  -- runs as caller; RLS still gates row visibility within the function (no bypass)
as $$
declare
  v_session admin_sessions;
begin
  -- Serialize concurrent submits on the same session row
  select * into v_session
  from admin_sessions
  where id = p_session_id
    and admin_id = p_admin_id
  for update;

  if not found then
    raise exception 'session not found or not owned by caller'
      using errcode = 'P0002';
  end if;

  -- Idempotent: same token + already submitted → return current state unchanged
  if v_session.submit_token = p_submit_token and v_session.state = 'submitted' then
    return v_session;
  end if;

  -- Guard: only valid transitions proceed
  if v_session.state not in ('draft', 'in_progress', 'revised') then
    raise exception 'invalid state transition from %', v_session.state
      using errcode = '22023';
  end if;

  -- 1. Flip parent state
  update admin_sessions
  set
    state        = 'submitted',
    completed_at = now(),
    submit_token = p_submit_token,
    version      = version + 1
  where id = p_session_id
  returning * into v_session;

  -- 2. Stamp children (single UPDATE, not a loop)
  update session_tasks
  set published_at = now()
  where session_id = p_session_id
    and published_at is null;

  -- 3. Write audit event
  insert into session_events (session_id, actor_id, event_type, payload)
  values (
    p_session_id,
    p_admin_id,
    'submitted',
    jsonb_build_object('version', v_session.version, 'token', p_submit_token)
  );

  -- 4. Enqueue outbox notification (processed after commit by a worker)
  insert into outbox (aggregate_id, event_type, payload, created_at)
  values (
    p_session_id,
    'session.submitted',
    jsonb_build_object(
      'session_id',  v_session.id,
      'subject_id',  v_session.subject_id,
      'admin_id',    v_session.admin_id,
      'org_id',      v_session.org_id,
      'version',     v_session.version
    ),
    now()
  );

  return v_session;
end;
$$;

-- Outbox table: consumed by a worker after commit
create table outbox (
  id           bigserial primary key,
  aggregate_id uuid not null,
  event_type   text not null,
  payload      jsonb not null,
  created_at   timestamptz not null default now(),
  processed_at timestamptz,
  attempts     int not null default 0,
  last_error   text
);
create index on outbox (processed_at, created_at) where processed_at is null;
-- Prevent deleting unprocessed events
-- (enforce via policy or application convention)

-- Broadcast trigger: fires AFTER commit via WAL (Supabase Realtime)
-- NOTE: realtime.broadcast_changes() is Supabase-specific. For non-Supabase
-- Postgres, replace with pg_notify() or push to a queue worker.
create or replace function broadcast_session_state_change()
returns trigger
security definer language plpgsql as $$
begin
  perform realtime.broadcast_changes(
    'org:' || new.org_id::text,
    tg_op,
    'session_state_changed',
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

create trigger trg_session_broadcast
after update of state on admin_sessions
for each row
when (old.state is distinct from new.state)
execute function broadcast_session_state_change();
```

**Post-submit edit pattern (recommended: versioned republish):**
```sql
-- Allow edits after submit: transition submitted → revised → submitted
-- Bump version on each re-submission so subject sees "Updated" indicator
create or replace function revise_admin_session(p_session_id uuid, p_admin_id uuid)
returns admin_sessions language plpgsql as $$
declare v_session admin_sessions;
begin
  select * into v_session from admin_sessions
  where id = p_session_id and admin_id = p_admin_id for update;

  if v_session.state != 'submitted' then
    raise exception 'can only revise a submitted session';
  end if;

  update admin_sessions set state = 'revised'
  where id = p_session_id returning * into v_session;

  insert into session_events (session_id, actor_id, event_type, payload)
  values (p_session_id, p_admin_id, 'revision_started', '{}');

  return v_session;
end;
$$;
-- Re-submission calls submit_admin_session again with a new token
```

---

## Trade-offs

| Post-submit edit approach | Audit fidelity | UX complexity | When to use |
|---|---|---|---|
| **Frozen + addendum** | Highest — original immutable | Addendum UI needed | Compliance/legal requirements |
| **Versioned republish (recommended)** | High — version + events log | "Updated" badge in UI | Default for SaaS |
| **Soft edit with diff** | Medium — diff only | Complex UI | Collaborative editing |
| **Overwrite silently** | None — history lost | Simplest | Never — avoid |

---

## Gotchas

**Client must generate the idempotency token before the first attempt**, not after receiving an error. If the token is generated on retry, it's a different token and idempotency fails.

**`submit_token` must be scoped to the operation.** Using the same token for both `submit_admin_session` and another function on a different aggregate will wrongly short-circuit the idempotency check. Include the aggregate type in the token generation (e.g., `uuid5(namespace, 'session:' || session_id)`).

**Outbox worker must be idempotent.** The outbox pattern guarantees at-least-once delivery. Your Resend email send, Supabase Broadcast call, and webhook dispatch must all handle duplicate delivery gracefully. Use Resend's `Idempotency-Key` header keyed on `outbox.id`.

**Don't emit from `BEFORE UPDATE`.** Postgres WAL-based Realtime reads the committed state. A `BEFORE UPDATE` trigger may emit a notification referencing state that was rolled back. Always use `AFTER UPDATE` or `AFTER INSERT` triggers for notifications.

**Broadcast trigger failure is asymmetric — DB commits, notification doesn't.** `AFTER` triggers run after the row is committed. If `realtime.broadcast_changes()` (or any external call) fails, the state transition is already durable but no event ever fires. Clients must refetch on visibility/focus or on stale-data heuristics — never rely on Realtime alone for correctness. The outbox + worker path (steps 3 and 4 above) is the durable channel; broadcast is an optimization for instant UI updates.

**The partial unique index on `one_active_session_per_subject` (from SB_KB_5) doesn't prevent a second row from being inserted while a transaction is open on the first.** The `SELECT FOR UPDATE` in `submit_admin_session` handles this for the submit path. For session creation, use `INSERT ... ON CONFLICT DO NOTHING` and check the returned row count.
