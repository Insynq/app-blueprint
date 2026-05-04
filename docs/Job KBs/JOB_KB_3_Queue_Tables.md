# JOB_KB_3 — Postgres Queue Tables: Beyond Outbox

**Stack-portable concept. Postgres + pgmq implementation.**

---

## Pattern

The outbox (JOB_KB_1) is one shape of queue: tightly coupled to a business transaction, side-effect oriented, one row per commit. This KB covers the general-purpose Postgres queue pattern — work units that exist independently of any business transaction. A user clicks "export" and the export job goes straight into the queue; there is no parent transaction to anchor ordering to. That shape is also where you need priority queuing (urgent jobs ahead of normal ones), fan-out to multiple independent consumer groups, or dedup enforcement (no duplicate export jobs for the same user in-flight).

Two implementations: **pgmq** (a Postgres extension — first-class Supabase module since 2024) and a **custom queue table** you build and maintain yourself. Prefer pgmq for new projects unless you need features it lacks — priority columns, per-consumer fan-out tracking, or deep schema integration with your business tables. The maintenance cost of rolling your own claim logic is non-trivial, and the MVCC/vacuum failure mode (see Gotchas) is a real production risk with hand-rolled queues.

---

## When to use / when to skip

**Use a general-purpose queue (vs. outbox) when:**
- The job is not transactionally coupled to a business-data write — e.g., a user triggers an export, a cron fires a report, an API handler enqueues a notification
- You need priority ordering within a queue — outbox has no priority concept
- You need fan-out: one event must produce work for multiple independent consumer groups
- You need dedup: protect against double-submit clicks, cron overlaps, or retry storms
- Workers need to claim and retry jobs independently of the triggering HTTP request

**Use pgmq vs. custom table when:**
- **pgmq:** standard work units with no priority requirements, want less to maintain, need built-in visibility timeouts (auto-reclaim without a reaper), or want the `pgmq.metrics_all()` health API out of the box
- **custom table:** priority queuing within a single queue, complex fan-out with per-consumer state tracking, dedup logic beyond what a dedup key covers, or you need first-class columns like `tenant_id` or `worker_id` in the queue schema itself

**Skip Postgres queues entirely when:**
- Sustained throughput exceeds ~1,000–1,800 jobs/second — Postgres MVCC overhead and MultiXact SLRU contention become the bottleneck above this ceiling
- Sub-100ms end-to-end latency is required — Postgres polling granularity is seconds, not milliseconds; see JOB_KB_4 for managed alternatives
- You need event replay or per-consumer position tracking (Kafka semantics) — Postgres does not maintain a durable log offset per consumer
- Pure broadcast / pub-sub — one-to-many broadcast is not a queue; use Supabase Realtime or `LISTEN/NOTIFY`

---

## Anti-patterns

**Polling without `SKIP LOCKED`**
```sql
-- WRONG: second worker blocks waiting for the first worker's lock
SELECT * FROM jobs WHERE status = 'pending' LIMIT 1 FOR UPDATE;
```
Without `SKIP LOCKED`, all workers queue behind the first lock. Under any concurrency this serializes throughput and cascades into lock-wait timeouts. Postgres docs explicitly call `SKIP LOCKED` the correct pattern for "multiple consumers accessing a queue-like table."

**Missing `available_at` column**
Without it you cannot schedule delayed jobs, implement exponential backoff retries, or use `pgmq.send(..., delay)`. Every reschedule on failure becomes either an immediate retry storm or a `DELETE + re-INSERT` anti-pattern.

**Missing `claim_expires` (or relying on VT without a reaper)**
If a worker crashes mid-job, the row stays `status = 'claimed'` forever without a `claim_expires` column and a reaper process. Custom tables need an explicit reaper. pgmq handles this via visibility timeout — messages become re-visible automatically — which is one reason to prefer it.

**Tight polling from Edge Functions**
Polling every 100ms = up to 864,000 invocations/day. Use `pgmq.read_with_poll()` (blocks inside Postgres up to N seconds waiting for a message) or increase your pg_cron interval and batch-process on each wakeup. See JOB_KB_2 for pg_cron scheduling patterns.

**Treating Postgres as Redis**
Postgres polling granularity is seconds. If the product requirement is "job starts within 50ms of being enqueued," Postgres is the wrong tool for the hot path. Use Redis pub/sub or Supabase Realtime as the trigger, with Postgres as durable storage only.

**Long transactions held across job processing (Brandur Leach MVCC failure)**
Rows deleted from Postgres are not immediately reclaimed — VACUUM does it later. A long-running transaction prevents VACUUM from reclaiming dead tuples from the queue table, causing index bloat and progressively slower claim queries until the queue degrades under its own weight. Never hold an open transaction while doing external I/O (HTTP calls, email sends, file uploads). Claim the row, commit, then do the work.

**No partial index on the claim scan**
Without `WHERE status = 'pending'` on the claim index, every claim scans millions of completed rows. The partial index keeps the working set small regardless of historical queue depth.

**pgmq dedup assumption**
pgmq has no built-in dedup. If you need it, enforce it in the application layer (check-before-send) or maintain a separate dedup table with a unique constraint. Do not assume the extension handles this.

---

## Generic example

### Custom queue table

```sql
CREATE TABLE public.jobs (
  id              BIGSERIAL PRIMARY KEY,
  queue           TEXT        NOT NULL DEFAULT 'default',
  payload         JSONB       NOT NULL,
  priority        SMALLINT    NOT NULL DEFAULT 0,       -- higher = sooner; 0 = normal
  status          TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','claimed','done','failed','dead')),
  attempts        SMALLINT    NOT NULL DEFAULT 0,
  max_attempts    SMALLINT    NOT NULL DEFAULT 3,
  available_at    TIMESTAMPTZ NOT NULL DEFAULT now(),   -- delayed / backoff scheduling
  claimed_at      TIMESTAMPTZ,
  claim_expires   TIMESTAMPTZ,                          -- reaper reclaims if now() > this AND claimed
  processed_at    TIMESTAMPTZ,
  last_error      TEXT,
  dead_letter_at  TIMESTAMPTZ,
  dedup_key       TEXT,                                 -- caller-provided dedup token
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast claim scan: skip completed rows; order by priority then age
CREATE INDEX idx_jobs_claimable
  ON public.jobs (queue, priority DESC, created_at ASC)
  WHERE status = 'pending' AND available_at <= now();

-- Dedup: blocks duplicate pending jobs only (released when job completes)
CREATE UNIQUE INDEX idx_jobs_dedup
  ON public.jobs (queue, dedup_key)
  WHERE dedup_key IS NOT NULL AND status = 'pending';
```

### Claim SQL (custom table)

```sql
-- Atomically claim one job: CTE locks the row, UPDATE transitions it in the same transaction
WITH claimed AS (
  SELECT id
  FROM public.jobs
  WHERE queue         = 'default'
    AND status        = 'pending'
    AND available_at <= now()
  ORDER BY priority DESC, created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
UPDATE public.jobs j
SET
  status        = 'claimed',
  claimed_at    = now(),
  claim_expires = now() + INTERVAL '5 minutes',  -- set to expected max job duration
  attempts      = attempts + 1
FROM claimed
WHERE j.id = claimed.id
RETURNING j.*;
```

```sql
-- Mark success (separate transaction, after work completes outside Postgres)
UPDATE public.jobs
SET status = 'done', processed_at = now()
WHERE id = $1;

-- Mark failure with exponential backoff reschedule
UPDATE public.jobs
SET
  status         = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'pending' END,
  dead_letter_at = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END,
  available_at   = now() + (INTERVAL '10 seconds' * (2 ^ attempts)),
  last_error     = $2
WHERE id = $1;

-- Reaper: reclaim jobs whose worker died (run via pg_cron, see JOB_KB_2)
UPDATE public.jobs
SET
  status       = 'pending',
  available_at = now() + INTERVAL '30 seconds'
WHERE status        = 'claimed'
  AND claim_expires < now();
```

### Dedup insert

```sql
INSERT INTO public.jobs (queue, payload, dedup_key)
VALUES ('email_worker', '{"user_id": 42, "type": "welcome"}', 'welcome-42')
ON CONFLICT (queue, dedup_key)
  WHERE dedup_key IS NOT NULL AND status = 'pending'
  DO NOTHING;
-- Silent drop on duplicate; no error thrown to caller
```

### Priority insert (custom table)

```sql
INSERT INTO public.jobs (queue, payload, priority) VALUES ('default', '{"type": "urgent_export"}', 10);
INSERT INTO public.jobs (queue, payload, priority) VALUES ('default', '{"type": "weekly_digest"}',  0);
-- Claim query orders by priority DESC automatically
```

---

### pgmq (Supabase)

Enable via the Dashboard (Integrations → Postgres Modules → pgmq, requires Postgres 15.6.1.143+) or via migration:

```sql
CREATE EXTENSION IF NOT EXISTS pgmq;
```

```sql
-- Create a queue
SELECT pgmq.create('email_notifications');

-- Send a single message (returns msg_id bigint)
SELECT pgmq.send('email_notifications', '{"to": "user@example.com"}'::jsonb);

-- Send with delay (integer = seconds)
SELECT pgmq.send('email_notifications', '{"to": "user@example.com"}'::jsonb, 60);

-- Send batch
SELECT pgmq.send_batch(
  'email_notifications',
  ARRAY['{"to": "a@example.com"}'::jsonb, '{"to": "b@example.com"}'::jsonb]
);

-- Read up to 5 messages, 30-second visibility timeout
-- Messages become re-visible automatically after 30s if not deleted/archived
SELECT * FROM pgmq.read('email_notifications', 30, 5);

-- Read and immediately delete (fire-and-forget workers)
SELECT * FROM pgmq.pop('email_notifications');

-- Delete after successful processing
SELECT pgmq.delete('email_notifications', 42);             -- single
SELECT pgmq.delete('email_notifications', ARRAY[42, 43]);  -- batch

-- Archive instead of delete (moves to pgmq.a_<queue_name> for audit trail)
SELECT pgmq.archive('email_notifications', 42);

-- Extend visibility timeout if a job is taking longer than expected
SELECT pgmq.set_vt('email_notifications', 42, 120);  -- add 120 more seconds

-- Queue health
SELECT * FROM pgmq.metrics('email_notifications');
-- Returns: queue_name, queue_length, newest_msg_age_sec, oldest_msg_age_sec, total_messages, scrape_time

SELECT * FROM pgmq.metrics_all();  -- all queues at once
```

**pgmq `message_record` columns** (returned by `pgmq.read()`):

| Column | Type | Description |
|---|---|---|
| `msg_id` | BIGINT | Auto-incrementing message ID |
| `read_ct` | INT | How many times this message has been read |
| `enqueued_at` | TIMESTAMPTZ | When the message was sent |
| `last_read_at` | TIMESTAMPTZ | Last time a consumer read it |
| `vt` | TIMESTAMPTZ | When the message becomes visible again |
| `message` | JSONB | The payload |
| `headers` | JSONB | Optional metadata headers |

### pgmq from TypeScript (Supabase Edge Function or server component)

```typescript
// Using service role — queue tables are not accessible to authenticated/anon roles
// See SB_KB_12 for RLS implications
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!   // service role required
)

// Send a message
const { data: msgId } = await supabase.rpc(
  'send',
  {
    queue_name: 'email_notifications',
    message: { to: 'user@example.com', template: 'welcome' },
    sleep_seconds: 0,
  },
  { schema: 'pgmq_public' },
)

// Read messages
const { data: messages } = await supabase.rpc(
  'read',
  {
    queue_name: 'email_notifications',
    sleep_seconds: 5,   // read_with_poll: block up to 5s waiting for a message
    n: 5,               // read up to 5 messages
  },
  { schema: 'pgmq_public' },
)

// Pop (read + delete atomically)
const { data: msg } = await supabase.rpc(
  'pop',
  { queue_name: 'email_notifications' },
  { schema: 'pgmq_public' },
)
```

The functions live in the `pgmq_public` schema, which Supabase exposes via the Data API. From the JS client, pass `{ schema: 'pgmq_public' }` as the third arg to `rpc()`. From inside an Edge Function with service-role access, you can also call `pgmq.send(...)` directly via SQL.

### Edge Function worker (custom table, triggered by pg_cron)

```typescript
// Supabase Edge Function — pg_cron trigger setup: see JOB_KB_2
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const { data: jobs } = await supabase.rpc('claim_jobs', {
  p_queue: 'email_worker',
  p_limit: 5,
  p_claim_duration_seconds: 300,
})

for (const job of jobs ?? []) {
  try {
    await processJob(job)
    await supabase
      .from('jobs')
      .update({ status: 'done', processed_at: new Date().toISOString() })
      .eq('id', job.id)
  } catch (err) {
    await supabase.rpc('fail_job', {
      p_id: job.id,
      p_error: (err as Error).message,
    })
  }
}
```

### Priority queue via pgmq (multiple queues workaround)

pgmq has no built-in priority column. The established workaround is separate named queues polled in order:

```sql
SELECT pgmq.create('jobs_high');    -- priority 3
SELECT pgmq.create('jobs_normal');  -- priority 2
SELECT pgmq.create('jobs_low');     -- priority 1
```

Workers poll in priority order and stop at the first hit:

```sql
-- Worker poll logic (pseudocode — implement in application layer or a DB function)
FOR queue_name IN ('jobs_high', 'jobs_normal', 'jobs_low') LOOP
  msgs := pgmq.read(queue_name, 30, 1);
  IF msgs IS NOT NULL THEN RETURN msgs; END IF;
END LOOP;
```

Publishers route to the correct queue at insert time. Simple and explicit; the cost is that publishers must know the priority tiers.

### Fan-out: Option A (separate queues per consumer, recommended)

```sql
-- Publisher writes to all consumer queues atomically
BEGIN;
  INSERT INTO public.jobs (queue, payload) VALUES ('inventory_worker', '{"order_id": 123}');
  INSERT INTO public.jobs (queue, payload) VALUES ('email_worker',     '{"order_id": 123}');
  INSERT INTO public.jobs (queue, payload) VALUES ('analytics_worker', '{"order_id": 123}');
COMMIT;
```

Each consumer group has an independent backlog, retry config, and priority setting. A failure in one queue does not block others.

### Fan-out: Option B (shared table with `consumed_by` tracking)

```sql
CREATE TABLE public.events (
  id           BIGSERIAL PRIMARY KEY,
  payload      JSONB    NOT NULL,
  consumers    TEXT[]   NOT NULL,
  consumed_by  TEXT[]   NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_pending ON public.events (created_at ASC)
  WHERE consumed_by <> consumers;

-- Consumer 'email_worker' claims its next item
WITH claimed AS (
  SELECT id FROM public.events
  WHERE 'email_worker' = ANY(consumers)
    AND NOT ('email_worker' = ANY(consumed_by))
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
UPDATE public.events e
SET consumed_by = array_append(consumed_by, 'email_worker')
FROM claimed WHERE e.id = claimed.id
RETURNING e.*;
```

Use Option A unless the consumer list is dynamic or unknown at publish time. Option B rows linger until all consumers complete, and the `consumed_by <> consumers` index expression may not prune efficiently at scale. `[VERIFY BEFORE SHIPPING]` — test the index with your actual array sizes.

---

## Trade-offs

| Concern | Custom queue table | pgmq |
|---|---|---|
| Priority queuing | Native — `priority` column + index | Workaround — multiple named queues |
| Visibility timeout / reaper | Manual — must write + schedule reaper | Built-in — messages auto-resurface |
| Fan-out (per-consumer state) | Native — query `queue` column | Workaround — one queue per consumer |
| Dedup | Native — partial unique index | Application layer only |
| Metrics / observability | Write your own monitoring query | `pgmq.metrics_all()` out of the box |
| Archive / audit trail | Add `processed_at`, `dead_letter_at` | `pgmq.archive()` → `pgmq.a_<name>` |
| Schema flexibility | Full — add any columns, indexes, FK | Fixed schema, no custom columns |
| RLS integration | Natural — same `public` schema | Requires `pgmq_public` wrapper or service role; see SB_KB_12 |
| Maintenance burden | High — own the claim, reaper, backoff logic | Low — extension manages it |
| Supabase Dashboard UI | None | Queue browser built into Dashboard |

---

## Gotchas

**Throughput ceiling: ~1,000–1,800 jobs/second**
Above this rate, Postgres MVCC overhead, MultiXact SLRU contention, and WAL saturation become the bottleneck. Microsoft's Postgres community research documents CPU pegging under high worker concurrency; the practical ceiling on typical Supabase hardware is in this range. The ceiling covers the vast majority of Supabase applications. Above it, see JOB_KB_4 for Trigger.dev, Inngest, and Hatchet.

**MVCC / vacuum failure (Brandur Leach)**
A Postgres queue table is one of the worst MVCC workloads: every claim is an UPDATE (creating a dead tuple), and rapid claim-complete cycles produce dead tuples faster than autovacuum can reclaim them. If a long-running transaction is open anywhere on the database, VACUUM cannot advance past it — dead tuples accumulate, indexes bloat, and claim queries slow progressively. Brandur Leach's production post-mortem ([brandur.org/postgres-queues](https://brandur.org/postgres-queues)) documents this failure mode in detail. Mitigation: never hold a transaction open during external I/O, tune `autovacuum_vacuum_cost_delay` down on queue tables, and monitor `n_dead_tup` on `pg_stat_user_tables`. `[VERIFY BEFORE SHIPPING]` — confirm autovacuum settings are appropriate for your queue table's update rate.

**Backpressure detection**
Postgres queues have no built-in backpressure. Monitor queue depth proactively:

```sql
-- Custom table
SELECT
  queue,
  COUNT(*) FILTER (WHERE status = 'pending')  AS pending,
  COUNT(*) FILTER (WHERE status = 'claimed')  AS inflight,
  COUNT(*) FILTER (WHERE status = 'dead')     AS dead,
  EXTRACT(EPOCH FROM (now() - MIN(available_at)))
    FILTER (WHERE status = 'pending')          AS oldest_pending_age_sec
FROM public.jobs
GROUP BY queue;

-- pgmq
SELECT * FROM pgmq.metrics_all();
```

Suggested alert thresholds: `pending > 1,000` → warning; `pending > 10,000` → critical; `oldest_pending_age_sec > 300` → critical. Response options: scale up workers (more pg_cron calls or Edge Function concurrency), shed low-priority jobs, or rate-limit producers (return 429).

**Fan-out approaches: Option A vs. Option B at scale**
Option A (separate queues per consumer) scales better — each consumer's queue is independent. Option B (`consumed_by` array) creates update contention on shared rows when multiple consumers complete simultaneously, and row cleanup is delayed until the last consumer completes. Prefer Option A. `[VERIFY BEFORE SHIPPING]` — if using Option B, test index performance on the `consumed_by <> consumers` expression with production-scale arrays.

**pgmq priority workaround operational cost**
Multiple queues work but require publishers to make routing decisions at insert time. If priority tiers change (e.g., adding an "urgent" tier), all producers and workers must be updated. Document priority tiers explicitly and keep the list short (3 max before complexity outweighs benefit).

**RLS and queue tables**
Queue tables should be inaccessible to `authenticated` and `anon` roles. Workers run as service role (Edge Functions) or as `SECURITY DEFINER` functions. See SB_KB_12 for the RLS policy pattern. For pgmq: direct `pgmq.*` functions require service role; `pgmq_public` wrappers are the PostgREST-safe surface for client-side access if you intentionally expose enqueueing to authenticated users.

**`claim_expires` interval must exceed your worst-case job duration**
If `claim_expires = now() + 5 minutes` but the job can take 8 minutes, the reaper will reclaim and re-run a still-in-progress job. Set the interval conservatively, and use `pgmq.set_vt()` (or an equivalent UPDATE) to extend the claim if a job detects it will run long.

---

## Cross-references

- **JOB_KB_1** — outbox pattern: the transactionally-coupled shape of queue; same `FOR UPDATE SKIP LOCKED` claim semantics apply
- **JOB_KB_2** — pg_cron scheduling: how workers are triggered on an interval
- **JOB_KB_4** — managed alternatives (Trigger.dev, Inngest, Hatchet): when Postgres queue throughput or latency is insufficient
- **SB_KB_12** — RLS implications of queue tables: service role access, denying `authenticated`/`anon`
