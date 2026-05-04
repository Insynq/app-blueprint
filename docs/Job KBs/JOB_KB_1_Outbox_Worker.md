# JOB_KB_1 — Outbox Worker: Claim, Process, Retry, Dead-Letter

**Stack-portable concept. Postgres + Edge Function implementation.**

---

## Pattern

SB_KB_6 owns the producer side: the outbox row is written inside the same DB transaction as the business write, guaranteeing the event exists if and only if the business write commits. This KB owns the worker that drains it.

The worker follows a strict four-step sequence: **claim with `FOR UPDATE SKIP LOCKED`** → **COMMIT the claim transaction** → **process side-effect outside any transaction** → **mark success or bump attempts**. The lease (`processing_until`) is set at claim time so a crashed worker's rows are automatically recoverable — another worker picks them up after the lease expires. Without it, a dead process holds a row in `status = 'processing'` forever.

At-least-once delivery is the guarantee. The receiver must be idempotent; see SB_KB_10 for the canonical Resend `Idempotency-Key` implementation. AUTH_KB_6 (account anonymization) is an example of this entire pattern in production — an anonymization event is written to the outbox and a worker processes the cascade.

Scheduling is driven by pg_cron (see JOB_KB_2). Tasks that exceed the Edge Function wall-clock limit belong in JOB_KB_4.

---

## When to use / when to skip

**Use when:**
- A business write must trigger an external side-effect (email, webhook, Stripe call) that cannot fail silently
- The side-effect must survive process crashes and server restarts
- Multiple workers may run concurrently and must not double-process the same row
- Events for the same aggregate must be delivered in order
- You need a durable audit trail of what was attempted, when, and why it failed

**Skip when:**
- Single-instance worker, low throughput — a simple `SKIP LOCKED` loop without leases may suffice
- The side-effect doesn't need to survive crashes (fire-and-forget logging, non-critical analytics)
- The operation is synchronous and the caller can block: just call it inline and propagate errors to the user

---

## Anti-patterns

1. **Polling without `SKIP LOCKED`.** Without it, `SELECT ... FOR UPDATE` on a contested row blocks until the lock holder finishes. Concurrent workers serialize against each other, defeating horizontal scaling. Use `SKIP LOCKED` for every queue consumer.

2. **Processing inside the claim transaction.** Sending an email or calling Stripe while the claim transaction is open holds the row lock for the entire HTTP round-trip. A 10-second Resend timeout blocks that aggregate's next event for 10 seconds. Always COMMIT the claim, then process outside any transaction.

3. **Missing `processing_until` lease.** If the worker crashes after claiming a row but before marking it processed, the row stays in `status = 'processing'` unless a lease allows reclaim. Set `processing_until = now() + interval '5 minutes'` at claim time — always.

4. **Unbounded exponential backoff.** Without a cap, `30s × 2ⁿ` reaches days and then years. Cap the interval (8 hours in this implementation) and dead-letter after N attempts rather than retrying indefinitely.

5. **Forgetting idempotency keys on the receiver.** At-least-once delivery means the side-effect will occasionally execute twice — on retry after a network drop, or when the success `UPDATE` fails after the call succeeds. Pass `outbox.id` as the idempotency key to every external call (Resend, Stripe, your own webhooks). See SB_KB_10.

6. **Blocking the whole batch on a single slow webhook.** Process rows in a loop with per-row timeouts. One unresponsive endpoint should fail that one row, not hang the entire batch invocation until the Edge Function times out.

7. **Hardcoding the service role key in the cron job SQL.** The key appears in `cron.job_run_details` in plaintext. Store it in Supabase Vault and retrieve it via `vault.decrypted_secrets` at runtime.

8. **Ignoring dead-letter growth.** Dead-letter rows are silent failures. Without an alarm on `count(*) from outbox_dead_letter > 0`, production can silently drop emails and webhooks for weeks. Instrument this metric — it is not optional.

---

## Generic example

### Outbox table schema

This extends the minimal outbox defined in SB_KB_6 with worker-specific columns: `status`, `processing_until`, `next_attempt_at`, and `last_error`.

```sql
CREATE TABLE outbox (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type   text        NOT NULL,                  -- e.g. 'session', 'user'
  aggregate_id     uuid        NOT NULL,                  -- FK-like, not enforced
  event_type       text        NOT NULL,                  -- e.g. 'email.verification_requested'
  payload          jsonb       NOT NULL,
  status           text        NOT NULL DEFAULT 'pending',
    -- ENUM-like: 'pending' | 'processing' | 'processed' | 'failed' | 'dead'
  attempts         int         NOT NULL DEFAULT 0,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  processing_until timestamptz,                           -- lease expiry
  last_error       text,
  processed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Partial index: keeps the working set small as processed rows accumulate
CREATE INDEX idx_outbox_claim
  ON outbox (status, next_attempt_at, aggregate_id)
  WHERE status IN ('pending', 'failed');

-- Dead-letter table: operator-facing, permanently retained
CREATE TABLE outbox_dead_letter (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  outbox_id        uuid        NOT NULL REFERENCES outbox(id),
  aggregate_type   text        NOT NULL,
  aggregate_id     uuid        NOT NULL,
  event_type       text        NOT NULL,
  payload          jsonb       NOT NULL,
  attempts         int         NOT NULL,
  last_error       text,
  dead_lettered_at timestamptz NOT NULL DEFAULT now()
);
```

> Both tables have RLS enabled with DENY ALL for `authenticated` and `anon`. The worker runs with the service role key (bypasses RLS). Inserts from application code flow through a `SECURITY DEFINER` function per SB_KB_6 — they never touch the table directly.

---

### Claim SQL — `FOR UPDATE SKIP LOCKED` with lease

Wrap this in a `SECURITY DEFINER` function (`claim_outbox_batch`) so the Edge Function can call it as an RPC without needing direct table access.

```sql
-- Run inside BEGIN / COMMIT (the RPC wrapper handles this)
WITH claimed AS (
  SELECT id
  FROM outbox
  WHERE status IN ('pending', 'failed')
    AND next_attempt_at <= now()
    -- Per-aggregate FIFO: skip any aggregate with an active in-flight row
    AND aggregate_id NOT IN (
      SELECT aggregate_id
      FROM outbox
      WHERE status = 'processing'
        AND processing_until > now()
    )
  ORDER BY next_attempt_at, id   -- stable secondary sort prevents plan ambiguity
  LIMIT 50
  FOR UPDATE SKIP LOCKED
)
UPDATE outbox
SET
  status           = 'processing',
  processing_until = now() + interval '5 minutes'
FROM claimed
WHERE outbox.id = claimed.id
RETURNING outbox.*;
```

**Why `SKIP LOCKED` is required:** Without it, if Worker A holds a lock on row X, Worker B's `SELECT ... FOR UPDATE` blocks waiting for Worker A to finish. With `SKIP LOCKED`, Worker B immediately moves on to the next unlocked row. This is the canonical mechanism for concurrent queue consumers — PostgreSQL docs call this an "intentionally inconsistent view," which is correct for queue use cases.

**Why a 5-minute lease:** If the worker crashes after the claim transaction commits but before it marks the row processed, the row stays in `status = 'processing'`. The lease ensures another worker picks it up after 5 minutes. Tune this to be comfortably longer than your worst-case per-row processing time.

---

### Failure handling — exponential backoff + dead-letter

```sql
-- Success
UPDATE outbox
SET status       = 'processed',
    processed_at = now(),
    last_error   = null
WHERE id = $1;

-- Failure: increment attempts, schedule next retry, dead-letter at attempt 8
UPDATE outbox
SET status           = CASE
                         WHEN attempts + 1 >= 8 THEN 'dead'
                         ELSE 'failed'
                       END,
    attempts         = attempts + 1,
    last_error       = $2,
    processing_until = null,
    next_attempt_at  = now() + (
      CASE attempts + 1
        WHEN 1 THEN interval '30 seconds'
        WHEN 2 THEN interval '2 minutes'
        WHEN 3 THEN interval '10 minutes'
        WHEN 4 THEN interval '30 minutes'
        WHEN 5 THEN interval '2 hours'
        WHEN 6 THEN interval '4 hours'
        WHEN 7 THEN interval '8 hours'
        ELSE          interval '24 hours'   -- cap; row is 'dead' before reaching this
      END
    )
WHERE id = $1;

-- Move dead row to dead-letter (run in app code or trigger on status = 'dead')
INSERT INTO outbox_dead_letter
  (outbox_id, aggregate_type, aggregate_id, event_type, payload, attempts, last_error)
SELECT id, aggregate_type, aggregate_id, event_type, payload, attempts, last_error
FROM outbox
WHERE id = $1;
```

Retry schedule: 30s → 2m → 10m → 30m → 2h → 4h → 8h. After 8 attempts the row becomes `dead` and is copied to `outbox_dead_letter`. To re-queue from dead-letter, reset `attempts = 0, status = 'pending', next_attempt_at = now()` on the originating outbox row — resetting `attempts` restores the full retry budget.

---

### Edge Function worker skeleton (Deno)

```typescript
// supabase/functions/outbox-worker/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Resend } from 'https://esm.sh/resend@3';

interface OutboxRow {
  id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const resend = new Resend(Deno.env.get('RESEND_API_KEY')!);

Deno.serve(async (_req) => {
  // 1. Claim batch — SECURITY DEFINER RPC handles FOR UPDATE SKIP LOCKED
  const { data: rows, error } = await supabase.rpc('claim_outbox_batch', {
    batch_size: 50,
  });
  if (error) return new Response(JSON.stringify({ error }), { status: 500 });

  const results = { processed: 0, failed: 0 };

  // 2. Process each row independently, outside any transaction
  for (const row of rows ?? []) {
    try {
      await processRowWithTimeout(row, 10_000);
      await supabase.rpc('mark_outbox_processed', { row_id: row.id });
      results.processed++;
    } catch (err) {
      await supabase.rpc('mark_outbox_failed', {
        row_id: row.id,
        error_msg: String(err),
        new_attempts: row.attempts + 1,
      });
      results.failed++;
    }
  }

  return new Response(JSON.stringify(results), {
    headers: { 'Content-Type': 'application/json' },
  });
});

async function processRow(row: OutboxRow, signal?: AbortSignal) {
  switch (row.event_type) {
    case 'email.verification_requested':
      await resend.emails.send({
        from: 'noreply@yourapp.com',
        to: row.payload.email,
        subject: 'Verify your email',
        html: renderEmail(row.payload),
        headers: {
          // Pass outbox row ID as idempotency key — survives retries (see SB_KB_10)
          'Idempotency-Key': row.id,
        },
      });
      break;
    // Add cases for other event_types here
    default:
      throw new Error(`Unknown event_type: ${row.event_type}`);
  }
}

async function processRowWithTimeout(row: OutboxRow, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await processRow(row, controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
```

---

### pg_cron schedule (drives the worker — see JOB_KB_2)

The Supabase dashboard UI imposes a 5,000ms timeout on pg_cron → Edge Function calls. Creating the job via raw SQL with an explicit `timeout_milliseconds` bypasses this UI restriction.

```sql
select cron.schedule(
  'outbox-worker',
  '30 seconds',       -- pg_cron interval syntax — supported on recent Supabase
                       -- Postgres versions. Standard 5-field cron ('* * * * *' for
                       -- every-minute) works on all versions. Six-field cron
                       -- ('*/30 * * * * *') is NOT valid pg_cron — that's Quartz syntax.
                       -- [VERIFY BEFORE SHIPPING] — confirm sub-minute works on your plan
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'project_url'
    ) || '/functions/v1/outbox-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 145000   -- stay under 150s free-tier wall clock limit
  ) as request_id;
  $$
);
```

> Credentials are read from Supabase Vault at runtime. Never embed the service role key as a literal string in the cron job body — it appears in `cron.job_run_details` in plaintext.

---

## Trade-offs

| Concern | Approach | When |
|---|---|---|
| Throughput | Increase `LIMIT` in claim query (up to ~150 on Pro) | Low per-row latency, Pro plan (400s wall clock) |
| Throughput | `Promise.allSettled` with bounded concurrency pool | External calls complete in <1s, want parallel fan-out |
| Ordering | Per-aggregate subquery exclusion in claim SQL | Events for the same entity must process sequentially |
| Ordering | Disable per-aggregate exclusion, no ordering guarantee | Event types are independent; ordering doesn't matter |
| Blast radius | Smaller batch size (25) | Protecting against worst-case timeout on Free tier |
| Long-running tasks | Move to JOB_KB_4 (Trigger.dev or background queue) | Single event processing exceeds 10s |
| Lease duration | Shorter lease (<2 min) | External calls are fast; want faster stale-row recovery |
| Lease duration | Longer lease (15+ min) | Processing involves a slow third-party and false reclaims are costly |
| Dead-letter | Manual re-queue via SQL | Low volume, ops-managed |
| Dead-letter | Admin UI with "Retry" button | Frequent failures, non-technical operators |

---

## Gotchas

**pg_cron → Edge Function 5,000ms UI timeout.** The Supabase dashboard UI caps the `net.http_post` timeout at 5,000ms for cron-invoked calls. The worker will appear to complete in 5s (the cron job exits) but the Edge Function keeps running. Creating the cron job via raw SQL with `timeout_milliseconds := 145000` bypasses this restriction. This is a UI limit, not a pg_net limit. (Source: Supabase GitHub Discussion #37574)

**`net.http_post` is fire-and-forget from pg_cron's perspective.** The cron job dispatches the HTTP request and records success in `cron.job_run_details` as "request dispatched," not "Edge Function completed successfully." `job_run_details` does not reflect whether the worker processed any rows. Use the worker's own observability metrics to track actual throughput. `[VERIFY BEFORE SHIPPING]` — confirm how your version of Supabase records cron run status.

**Edge Function CPU time is 2s, not 150s wall clock.** The 2s CPU cap excludes time spent waiting on async I/O (DB queries, HTTP calls). An outbox worker is almost entirely I/O-bound, so the CPU limit is not the binding constraint in normal operation. The binding constraint is wall-clock time (150s Free, 400s Pro). (Source: Supabase limits docs, verified 2026-05-04)

**Batch size worst-case math.** 50 rows × 10s per-row timeout = 500s worst case on a serial loop, which exceeds both Free and Pro wall-clock limits. In practice, most calls complete in under 1 second. For safety on Free tier, use 25 rows, or switch to a `Promise.allSettled` pool with concurrency limit of 5. `[VERIFY BEFORE SHIPPING]` — tune for your actual p99 external call latency.

**`FOR UPDATE SKIP LOCKED` and `ORDER BY` interact.** The `ORDER BY` in the claim query sorts candidates before acquiring locks. If many rows share the same `next_attempt_at`, different workers may plan overlapping candidate sets before locks are applied. Using `ORDER BY next_attempt_at, id` (stable secondary sort on UUID) reduces plan overlap. This does not guarantee strict global FIFO across workers — it approximates it.

**MVCC and uncommitted producer transactions.** A producer holding a long transaction (e.g., a bulk import) will have its outbox rows invisible to the worker until commit. This is correct behavior — Brandur Leach's core insight is that MVCC visibility provides "transactionally staged" draining for free. A worker invocation that sees zero rows does not mean the queue is empty; it may mean the producer's transaction has not committed yet.

**Per-aggregate failure blocks the aggregate.** The per-aggregate exclusion subquery means a failed row for `aggregate_id = X` blocks all subsequent rows for X until `next_attempt_at` passes. This is semantically correct (processing `email_verified` after a failed `account_created` is wrong) but has broad blast radius: a Resend outage blocks email delivery for all users whose aggregate has a pending failed row. Monitor `outbox.oldest_pending_age_s` per aggregate to detect this early.

**Lease expiry tuning.** Set the lease to be comfortably longer than your worst-case per-row processing time, including timeout guards. If the lease is shorter than a slow external call, the row gets reclaimed and processed a second time while the first attempt is still running — both workers will eventually try to mark it processed, which is fine (idempotent update), but it wastes work and can cause duplicate external calls if the receiver is not idempotent.

**Sub-minute pg_cron frequency.** `[VERIFY BEFORE SHIPPING]` — Supabase docs state cron supports down to every second, but confirm whether `*/30 * * * * *` (every 30 seconds) works on your plan. The safe baseline is `*/1 * * * *` (every minute), which is standard pg_cron syntax.

**Outbox table growth.** Successfully processed rows accumulate indefinitely. Add a maintenance job to prune them:
```sql
DELETE FROM outbox
WHERE status = 'processed'
  AND processed_at < now() - interval '7 days';
```
This is architectural housekeeping; schedule it separately from the worker (see JOB_KB_2).

---

## Observability hooks

Minimum counters to instrument per worker invocation (full implementation deferred to OBS_KB):

| Metric | How to compute |
|--------|----------------|
| `outbox.claimed` | Count of rows returned by `claim_outbox_batch` |
| `outbox.processed` | Increment on each successful `mark_outbox_processed` |
| `outbox.failed` | Increment on each `mark_outbox_failed` |
| `outbox.dead_lettered` | `count(*) from outbox_dead_letter` — alarm if > 0 |
| `outbox.processing_latency_ms` | `EXTRACT(EPOCH FROM (processed_at - created_at)) * 1000` |
| `outbox.oldest_pending_age_s` | `EXTRACT(EPOCH FROM (now() - min(created_at))) WHERE status IN ('pending', 'failed')` |

An `oldest_pending_age_s > 300` alert (5 minutes) indicates the worker is not running or is consistently failing across the entire queue. An `oldest_pending_age_s` that grows for one `aggregate_id` but not others indicates a per-aggregate failure.

---

## Cross-references

- **SB_KB_6** — outbox producer: writing the row inside the business transaction
- **SB_KB_10** — Resend `Idempotency-Key`: the canonical idempotent receiver this worker calls
- **AUTH_KB_6** — account anonymization: a real production instance of this pattern
- **JOB_KB_2** — pg_cron scheduling: deep-dive on the schedule that drives this worker
- **JOB_KB_4** — long-running tasks: for processing that exceeds Edge Function wall-clock limits
