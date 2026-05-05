# OBS_KB_4 — Performance Signals and Alerts

**Stack-portable concept. Postgres + Supabase + Vercel + Trigger.dev/Inngest + Axiom implementation.**

---

## Pattern

Lean performance monitoring: a small canonical set of Postgres health queries, queue-depth and dead-letter alert queries run on schedule, and durable-execution failure hooks for Trigger.dev/Inngest. Supabase has no built-in performance alerting — alerts require a custom path (pg_cron → Edge Function → Resend) or an external monitor (Axiom). Distinguish alert (pages a human, expects a response) from notification (informational only).

Structured logging → OBS_KB_1. Error capture and Sentry rule details → OBS_KB_2. Audit events → OBS_KB_3. Outbox table design → JOB_KB_1. DLQ design → JOB_KB_3. Task authoring → JOB_KB_4. RLS performance tuning → SB_KB_12.

---

## When to use / when to skip

Apply this from the first week in production. Queue depth and dead-letter alerts are non-negotiable regardless of scale. Skip the Vercel Observability Plus add-on and Axiom paid monitors until you have a measured latency problem — the free-tier signals cover most early-stage needs.

---

## 1. Postgres Health Signals

### 1.1 pg_stat_statements — Setup

**Ambiguity to verify:** The Supabase extension page at `supabase.com/docs/guides/database/extensions/pg_stat_statements` describes a manual enablement flow (Dashboard → Database → Extensions), but the Supabase CLI `inspect db` commands treat the view as always present. Supabase likely pre-loads the extension via `shared_preload_libraries` in their managed Postgres config, meaning `CREATE EXTENSION` adds the queryable view but the module is already active. Verify on a fresh project before assuming slow-query data is available.

If manual enablement is needed:
```sql
create extension pg_stat_statements with schema extensions;
```

**Note:** `pg_stat_statements.track_planning` is off by default. `plans` and `total_plan_time` columns return zero unless you explicitly enable it — it is not a default setting.

**Dashboard path (confirmed):** Supabase Dashboard → Database → Query Performance shows highest total execution time, highest call count, average execution time, and Index Advisor recommendations per query. This is the fastest first stop before running raw SQL.

### 1.2 Top-N Slow Queries

**By cumulative cost** (queries burning the most total DB time — start here):
```sql
-- Source: supabase.com/docs/guides/database/extensions/pg_stat_statements
SELECT
  calls,
  mean_exec_time,
  max_exec_time,
  total_exec_time,
  stddev_exec_time,
  query
FROM pg_stat_statements
WHERE
  calls > 50
  AND mean_exec_time > 2.0
  AND total_exec_time > 60000
ORDER BY total_exec_time DESC
LIMIT 10;
```

**By mean latency** (latency outliers — individual slow calls):
```sql
SELECT query, calls, mean_exec_time, max_exec_time, stddev_exec_time
FROM pg_stat_statements
WHERE calls > 10
ORDER BY mean_exec_time DESC
LIMIT 10;
```

**Per-query cache efficiency** (high `shared_blks_read` = reading from disk):
```sql
-- Source: postgresql.org/docs/current/pgstatstatements.html
SELECT query, calls,
       100.0 * shared_blks_hit /
       nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent,
       shared_blks_read
FROM pg_stat_statements
ORDER BY shared_blks_read DESC
LIMIT 10;
```

**Key columns:**

| Column | Use |
|--------|-----|
| `total_exec_time` | Cumulative load on DB — primary sort for finding expensive queries |
| `mean_exec_time` | Average latency per call |
| `max_exec_time` | Worst-case — alerts should key on p99, not p50 |
| `stddev_exec_time` | High stddev = inconsistent plan (index bloat, statistics staleness) |
| `shared_blks_read` | Disk reads — low hit rate means working set exceeds shared_buffers |
| `queryid` | Stable within minor versions; changes across major Postgres versions |

**Parameter masking:** Constants are replaced with `$1`, `$2`, etc. You cannot recover original literal values. To map a `queryid` back to app code, match on the normalized query shape or log `queryid` at execution time.

**Reset** (use sparingly — wipes all accumulated history):
```sql
-- Reset everything
SELECT pg_stat_statements_reset();

-- Reset only min/max times, preserve call counts
SELECT pg_stat_statements_reset(0, 0, 0, true);
```

**Access caveat to verify:** Postgres requires superuser to call `pg_stat_statements_reset()`. Supabase grants elevated permissions to project owners — confirm whether reset is available without superuser.

---

### 1.2 Long-Running Queries and Idle Transactions (`pg_stat_activity`)

```sql
-- Source: postgresql.org/docs/current/monitoring-stats.html
-- Active queries running longer than 30 seconds
SELECT
  pid,
  usename,
  application_name,
  state,
  query,
  EXTRACT(EPOCH FROM (now() - query_start)) AS runtime_sec,
  wait_event_type,
  wait_event
FROM pg_stat_activity
WHERE state != 'idle'
  AND query_start < now() - interval '30 seconds'
ORDER BY query_start;
```

`wait_event_type = 'Lock'` means the query is blocked by another transaction. `wait_event_type = 'IO'` means it is reading from disk. `state = 'idle in transaction'` is often more dangerous than `state = 'active'` — it holds locks and generates MVCC bloat without doing work.

```sql
-- Idle transactions open longer than 60 seconds
SELECT pid, usename, state,
       EXTRACT(EPOCH FROM (now() - xact_start)) AS txn_age_sec,
       query
FROM pg_stat_activity
WHERE state = 'idle in transaction'
  AND xact_start < now() - interval '60 seconds'
ORDER BY xact_start;
```

**Thresholds:** Any active query > 30 seconds warrants investigation on an OLTP workload. Transactions idle-in-transaction > 60 seconds are almost always a bug.

---

### 1.3 Lock Contention (`pg_locks`)

```sql
-- Source: postgresql.org/docs/current/monitoring-stats.html
-- Blocked queries and the queries blocking them
SELECT
  blocked_activity.pid        AS blocked_pid,
  blocked_activity.query      AS blocked_query,
  blocking_activity.pid       AS blocking_pid,
  blocking_activity.query     AS blocking_query,
  blocked_locks.mode          AS blocked_lock_mode,
  EXTRACT(EPOCH FROM (now() - blocked_activity.query_start)) AS blocked_for_sec
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity
  ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks
  ON  blocking_locks.locktype   IS NOT DISTINCT FROM blocked_locks.locktype
  AND blocking_locks.database   IS NOT DISTINCT FROM blocked_locks.database
  AND blocking_locks.relation   IS NOT DISTINCT FROM blocked_locks.relation
  AND blocking_locks.page       IS NOT DISTINCT FROM blocked_locks.page
  AND blocking_locks.tuple      IS NOT DISTINCT FROM blocked_locks.tuple
  AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
  AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
  AND blocking_locks.classid    IS NOT DISTINCT FROM blocked_locks.classid
  AND blocking_locks.objid      IS NOT DISTINCT FROM blocked_locks.objid
  AND blocking_locks.objsubid   IS NOT DISTINCT FROM blocked_locks.objsubid
  AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity
  ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;
```

Use `wait_event_type = 'Lock'` in `pg_stat_activity` as the lightweight indicator before running the full join above.

---

### 1.4 Connection Pool Saturation (Supavisor)

**Current state (2026):** Supabase uses **Supavisor** as its primary (shared) connection pooler — the shared-pgBouncer migration deadline was January 15, 2024. A Dedicated PgBouncer remains available for paying customers as a co-located pooler. Supavisor is cloud-native (Elixir). Port 5432 is session mode; port 6543 is transaction mode (Supavisor for shared, Dedicated PgBouncer for paid tiers).

Sources: `supabase.com/docs/guides/database/connecting-to-postgres`, `supabase.com/blog/supavisor-postgres-connection-pooler`

**Do not query `pg_stat_activity` for Supavisor connection counts** — it only shows direct connections. Supavisor client connections are reported via the Prometheus metrics endpoint:

```
https://<project-ref>.supabase.co/customer/v1/privileged/metrics
# Auth: Basic service_role:<sb_secret_...>
# Scrape at most once per minute per Supabase guidance
```

The dashboard path: Supabase Dashboard → Observability → Database Connections.

**Metric name to verify:** Exact Prometheus metric names for Supavisor client connection count are not confirmed here — check `github.com/supabase/supabase-grafana` for the Grafana dashboard JSON, which contains the verified metric names.

**Thresholds:** > 80% of plan max → warning; > 95% → critical. Response: switch to transaction-mode pooling (port 6543) or upgrade compute tier.

---

### 1.5 Cache Hit Ratio

```sql
-- Source: supabase.com/docs/guides/database/inspect (cache-hit command)
SELECT
  'index hit rate' AS name,
  (sum(idx_blks_hit)) / nullif(sum(idx_blks_hit + idx_blks_read), 0) * 100 AS ratio
FROM pg_statio_user_indexes
UNION ALL
SELECT
  'table hit rate' AS name,
  sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0) * 100 AS ratio
FROM pg_statio_user_tables;
```

**Threshold:** < 99% on either metric on an OLTP workload indicates the compute plan may be undersized for the working set. OLAP workloads doing full scans legitimately have lower ratios.

CLI equivalent: `supabase inspect db cache-hit` (requires pg_stat_statements active).

---

### 1.6 Unused Indexes and Index Efficiency (`pg_stat_user_indexes`)

```sql
-- Source: postgresql.org/docs/current/monitoring-stats.html
-- Unused indexes (dead weight on writes)
SELECT schemaname, relname, indexrelname, idx_scan, last_idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname = 'public'
ORDER BY relname;
```

Stats reset on server restart — a recently created index will show `idx_scan = 0` even if production hasn't hit it yet. Allow at least 24 hours of production traffic before dropping based on this view.

CLI equivalent: `supabase inspect db unused-indexes`.

---

### 1.7 Table Bloat (`pg_stat_user_tables`)

```sql
-- Source: postgresql.org/docs/current/monitoring-stats.html
SELECT schemaname, relname,
       n_live_tup,
       n_dead_tup,
       CASE WHEN n_live_tup + n_dead_tup > 0
         THEN round(100.0 * n_dead_tup / (n_live_tup + n_dead_tup), 2)
         ELSE 0 END AS dead_ratio,
       last_vacuum, last_autovacuum
FROM pg_stat_user_tables
WHERE n_live_tup > 1000
ORDER BY dead_ratio DESC
LIMIT 10;
```

Queue tables and outbox tables are the highest-risk bloat targets — every claim/status update creates a dead tuple. See JOB_KB_3 on the MVCC/vacuum failure mode.

**Alert signal:** `dead_ratio > 20%` on a high-write table, or `last_autovacuum` older than 1 hour on a write-heavy table, means autovacuum is not keeping up.

CLI equivalents: `supabase inspect db bloat`, `supabase inspect db vacuum-stats`.

---

## 2. Outbox / Queue Depth Alerts

Outbox table design → JOB_KB_1. DLQ table design → JOB_KB_3. This section covers alert-side queries only.

### 2.1 Alert Queries

**Custom outbox (per JOB_KB_1 schema):**
```sql
-- Stuck pending rows — primary depth alert
SELECT count(*) AS stuck_pending
FROM outbox
WHERE status IN ('pending', 'failed')
  AND created_at < now() - interval '5 minutes';

-- Oldest unprocessed row age — lag alert
SELECT
  EXTRACT(EPOCH FROM (now() - min(created_at))) AS oldest_pending_age_sec
FROM outbox
WHERE status IN ('pending', 'failed');
```

**pgmq (per JOB_KB_3):**
```sql
SELECT * FROM pgmq.metrics('queue_name');
-- Returns: queue_length, oldest_msg_age_sec, newest_msg_age_sec, total_messages
SELECT * FROM pgmq.metrics_all();  -- all queues
```

**Custom queue table (per JOB_KB_3):**
```sql
SELECT
  queue,
  COUNT(*) FILTER (WHERE status = 'pending')  AS pending,
  COUNT(*) FILTER (WHERE status = 'claimed')  AS inflight,
  COUNT(*) FILTER (WHERE status = 'dead')     AS dead,
  EXTRACT(EPOCH FROM (now() - MIN(available_at)))
    FILTER (WHERE status = 'pending')         AS oldest_pending_age_sec
FROM public.jobs
GROUP BY queue;
```

### 2.2 Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| `pending` count | > 1,000 | > 10,000 |
| `oldest_pending_age_sec` | > 120s | > 300s |
| `oldest_msg_age_sec` (pgmq) | — | > 300s |

`oldest_pending_age_sec > 300` means the worker is not draining. If this grows for one `aggregate_id` but not others, the failure is per-aggregate — likely a poison-pill message.

---

## 3. Dead-Letter Alarms

DLQ design → JOB_KB_3.

Any row landing in the dead-letter table is actionable — zero tolerance. This is an alert, not a notification.

```sql
-- Any DLQ row in the last 24 hours should page
SELECT count(*) AS dlq_count
FROM outbox_dead_letter
WHERE dead_lettered_at > now() - interval '24 hours';
```

**Implementation options** (pick one):
1. `AFTER INSERT` trigger on `outbox_dead_letter` that calls `pg_net.http_post()` to a Supabase Edge Function, which sends via Resend.
2. pg_cron job every 5 minutes counting new DLQ rows → Edge Function → Resend if count > 0.
3. Axiom match monitor on structured log events containing `"dead_lettered": true` (→ OBS_KB_1).

---

## 4. Trigger.dev v3 Run Failure Alerting

Sources: `trigger.dev/docs/troubleshooting-alerts`, `trigger.dev/changelog/alert-run-failures` (Aug 2024), `trigger.dev/changelog/alert-webhooks` (Feb 2025), `trigger.dev/docs/tasks/overview`

### 4.1 Built-in Alert Channels

Configure at Dashboard → Alerts → New alert:

| Channel | Events |
|---------|--------|
| Email | Run failure, deployment failure, deployment success |
| Slack | Run failure, deployment failure, deployment success |
| Webhook | `alert.run.failed`, `alert.deployment.failed`, `alert.deployment.success` |

Webhook support added February 13, 2025. Run failure alerting (terminal — after all retries exhausted) added August 21, 2024.

**Key distinction:** Alerts fire only when a run has failed and will not reattempt — not on each failed attempt. This is intentional to prevent alert fatigue from transient errors that self-resolve via retry.

### 4.2 onFailure Hook (Programmatic Path)

```typescript
// Source: trigger.dev/docs/tasks/overview
import { task } from "@trigger.dev/sdk/v3";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const myTask = task({
  id: "my-task",
  retry: { maxAttempts: 3 },
  onFailure: async ({ payload, error, ctx }) => {
    // Fires once, after all retries exhausted
    // ctx.run contains run ID, attempt count, task ID
    await resend.emails.send({
      from: "alerts@yourapp.com",
      to: "oncall@yourcompany.com",
      subject: `Task ${ctx.task.id} failed: run ${ctx.run.id}`,
      text: `Error: ${error.message}\n\nPayload: ${JSON.stringify(payload)}`,
    });
  },
  run: async (payload, { ctx }) => {
    // task body
  },
});
```

**Critical caveat:** `onFailure` does NOT fire for `Crashed`, `System failure`, or `Canceled` statuses. Dashboard alert configuration (Email/Slack/Webhook) is the reliable path for those terminal states — confirmed per dossier research.

**Global hook** (applies to all tasks, register in `trigger.config.ts`):
```typescript
import { configure } from "@trigger.dev/sdk/v3";

configure({
  onFailure: async ({ ctx, error }) => {
    // Forward to your alerting system for all tasks
    console.log("Run failed", ctx.run.id, error.message);
  },
});
```

### 4.3 Webhook Verification

```typescript
import { webhooks } from "@trigger.dev/sdk/v3";

// In your POST handler for the configured webhook URL:
const event = webhooks.constructEvent(
  rawBody,       // raw Buffer/string body
  signature,     // X-Trigger-Signature header
  webhookSecret  // secret shown in dashboard when creating the alert
);
// Throws WebhookError on invalid signature
```

---

## 5. Inngest Run Failure Alerting

Sources: `inngest.com/docs/reference/functions/handling-failures`, `inngest.com/docs/reference/system-events/inngest-function-failed`, `inngest.com/docs/features/inngest-functions/error-retries/failure-handlers`

**Inngest has no native dashboard alert configuration** equivalent to Trigger.dev's Alerts page — this is the current understanding from all docs reviewed, though not explicitly confirmed with a definitive statement. Alerting is code-only via `onFailure` or `inngest/function.failed`.

### 5.1 Per-Function onFailure Handler

```typescript
// Source: inngest.com/docs/reference/functions/handling-failures
import { inngest } from "@/inngest/client";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const myFunction = inngest.createFunction(
  {
    id: "my-function",
    retries: 5,
    onFailure: async ({ error, event, step }) => {
      // Fires after all retries exhausted
      // error: the final JavaScript Error
      // event: the inngest/function.failed system event payload
      await step.run("send-alert", async () => {
        await resend.emails.send({
          from: "alerts@yourapp.com",
          to: "oncall@yourcompany.com",
          subject: `Inngest function failed: ${event.data.function_id}`,
          text: `Run ID: ${event.data.run_id}\nError: ${error.message}`,
        });
      });
    },
  },
  async ({ event, step }) => {
    // function body
  }
);
```

**Bug history (January 2025, GitHub issue #797 — fixed March 2025 via PR #2088):** When a function threw `NonRetriableError` with a `cause` property, `event.data.error.cause` was not populated in the `onFailure` handler. The fix shipped in `inngest-js` in March 2025; verify your installed version includes it before relying on `cause` propagation in `onFailure`. As a defensive pattern, extract error details before throwing or read from `error.message` instead.

### 5.2 Centralized Failure Handler via `inngest/function.failed`

One function catches all failures across the entire Inngest deployment — the recommended pattern for centralized alerting:

```typescript
// Source: inngest.com/docs/reference/system-events/inngest-function-failed
export const globalFailureHandler = inngest.createFunction(
  { id: "global-failure-handler" },
  { event: "inngest/function.failed" },
  async ({ event, step }) => {
    // event.data contains:
    //   error: { message, name, stack }
    //   event: original triggering event payload
    //   function_id: ID of the failed function
    //   run_id: ID of the failed run
    //   ts: timestamp (ms)

    await step.run("forward-to-sentry", async () => {
      await Sentry.captureException(new Error(event.data.error.message), {
        extra: {
          function_id: event.data.function_id,
          run_id: event.data.run_id,
        },
      });
    });
  }
);
```

The `onFailure` handler at §5.1 and the `inngest/function.failed` handler are complementary: use per-function `onFailure` for task-specific recovery logic, and the system event handler for centralized logging/alerting.

---

## 6. Vercel Runtime Performance

Sources: `vercel.com/docs/functions/configuring-functions/duration`, `vercel.com/changelog/function-start-type-now-available-in-runtime-logs`, `vercel.com/docs/speed-insights`, `vercel.com/docs/notifications`

### 6.1 Function Duration Limits (Fluid Compute)

Fluid Compute is enabled by default. Configure `maxDuration` per route:

```typescript
// app/api/my-route/route.ts
export const maxDuration = 60; // seconds — must be ≤ plan limit
```

| Plan | Default Max | Absolute Max |
|------|-------------|--------------|
| Hobby | 300s | 300s |
| Pro | 300s | 800s |
| Enterprise | 300s | 800s |

Exceeding `maxDuration` causes Vercel to terminate the function; callers receive a 504 error. This appears in Runtime Logs but does NOT trigger a Vercel built-in alert — pipe logs to Axiom and alert on 504 patterns there.

### 6.2 Cold Start Visibility

Runtime Logs → detail panel shows start type per invocation:
- **Hot** — warm instance reused
- **Hot (prewarmed)** — pre-warmed instance
- **Cold (Xms)** — cold start with duration

Fluid Compute routes new requests to existing warm instances first, substantially reducing cold starts. The Observability Plus add-on ($10/month base on Pro) adds p75 latency data by route — needed for systematic latency analysis.

**Log retention** (plan-dependent):

| Plan | Retention |
|------|-----------|
| Hobby | 1 hour |
| Pro | 1 day |
| Pro + Observability Plus | 30 days |
| Enterprise | 3 days |
| Enterprise + Observability Plus | 30 days |

### 6.3 Vercel Built-in Notifications

Vercel notifications (web, email, push) cover:
- **Error Anomalies** — 5xx spike above threshold (built-in, automatic)
- **Usage Anomalies** — function invocation or bandwidth thresholds
- **Deployment Failures** — build fails

Vercel has **no built-in per-function duration or latency alerts**. No native Slack or webhook push. For latency alerting: set up an Axiom log drain and configure Axiom threshold monitors on p95 duration.

### 6.4 Web Vitals (Speed Insights)

Vercel Speed Insights tracks LCP, CLS, FID/INP, FCP, TTFB via Real User Monitoring. Available on all plans. Dashboard: Project → Speed Insights.

Speed Insights is **observational only** — there are no alert hooks. For performance regression alerts on Web Vitals, use Sentry performance monitoring (→ OBS_KB_2) or a Vercel Check integration.

Setup: add `@vercel/speed-insights` to the app. See `vercel.com/docs/speed-insights`.

---

## 7. Supabase Has No Built-in Performance Alerting

**Confirmed finding:** The Supabase Cloud dashboard has no native alert or notification system for performance thresholds (CPU, memory, connections, query latency). The Reports page (hourly averages) and Query Performance dashboard are observational only.

**What Supabase does provide:**
- Dashboard Reports: hourly CPU, memory, connections, disk (no alert hooks)
- Prometheus metrics endpoint: `https://<project-ref>.supabase.co/customer/v1/privileged/metrics` — ~200 metrics, scrape at most once/minute, auth via Basic `service_role:<sb_secret>`. Use with Grafana + Alertmanager, or Axiom.
- Ready-made Grafana dashboard JSON: `github.com/supabase/supabase-grafana`

### 7.1 Canonical Custom Alert Path: pg_cron → Edge Function → Resend

This is the most stack-native approach — no external infrastructure required:

```sql
-- 1. Schedule the check every 5 minutes via pg_cron
-- (pg_cron must be enabled; see JOB_KB_1 for setup)
SELECT cron.schedule(
  'queue-depth-alert',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://<project-ref>.supabase.co/functions/v1/queue-alert',
      headers := '{"Authorization": "Bearer <anon-key>", "Content-Type": "application/json"}',
      body := json_build_object(
        'oldest_pending_age_sec',
        EXTRACT(EPOCH FROM (now() - min(created_at)))::int
      )::text
    )
    FROM outbox
    WHERE status IN ('pending', 'failed');
  $$
);
```

```typescript
// supabase/functions/queue-alert/index.ts
// 2. Edge Function: check threshold and send alert
import { Resend } from "npm:resend";

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);
const THRESHOLD_SEC = 300;
const ONCALL = Deno.env.get("ONCALL_EMAIL")!;

Deno.serve(async (req) => {
  const { oldest_pending_age_sec } = await req.json();

  if (oldest_pending_age_sec !== null && oldest_pending_age_sec > THRESHOLD_SEC) {
    await resend.emails.send({
      from: "alerts@yourapp.com",
      to: ONCALL,
      subject: `[ALERT] Outbox stalled — oldest pending ${oldest_pending_age_sec}s`,
      text: `The outbox worker has not drained the queue for ${oldest_pending_age_sec} seconds. Investigate immediately.`,
    });
  }

  return new Response("ok");
});
```

**Idempotency:** To prevent duplicate alerts during a sustained outage, use a small `alert_sent_at` column on a `_alert_state` table and only send if the last alert was sent > N minutes ago. Alternatively, Resend supports idempotency keys.

### 7.2 Axiom Monitors (Simpler if Budget Allows)

Source: `axiom.co/docs/monitor-data/monitors`, `axiom.co/docs/monitor-data/threshold-monitors`

Axiom supports three monitor types:
- **Threshold monitor** — query result crosses a numeric threshold
- **Anomaly monitor** — result deviates from baseline
- **Match monitor** — any log event matching a filter (use for dead-letter detection)

**Notifier channels:** Slack, Email, PagerDuty, OpsGenie, Discord, Microsoft Teams, Custom Webhook. One channel per notifier; create multiple notifiers for multi-channel delivery.

Threshold monitors trigger on entry AND exit from alert state, and support "Alert on no data" (useful for detecting a stopped worker).

**Free-tier availability: unconfirmed.** The docs reviewed do not specify whether monitors are available on Axiom's free tier or require a paid plan. Verify at `axiom.co/pricing` before planning a free-tier monitoring architecture.

**Axiom APL for outbox lag** (log `oldest_pending_age_sec` from your outbox worker → OBS_KB_1, then query it in Axiom):
```apl
['your-dataset']
| where ['attributes.oldest_pending_age_sec'] > 300
| summarize count() by bin(_time, 5m)
```
Configure a threshold monitor: trigger when count > 0 over the last 5-minute window.

---

## 8. Alert vs Notification Distinction

**Alert:** Pages a human, expects a response within minutes. Should be rare and always actionable. If an alert fires and nobody needs to do anything, it should have been a notification.

**Notification:** Informational — useful context but no immediate response required.

| Situation | Classification | Why |
|-----------|---------------|-----|
| DLQ has new rows | Alert | Always actionable — data was lost or corrupt |
| `oldest_pending_age_sec > 300` | Alert | Worker is broken; messages are not delivering |
| Trigger.dev task failed (all retries) | Alert | Requires code fix or data remediation |
| Cache hit ratio < 99% for > 1 hour | Alert | Compute tier may need upgrade |
| Nightly slow query digest | Notification | Useful for planning, no urgency |
| Deployment success | Notification | Informational only |
| Single failed attempt (retries remain) | Nothing | Let the retry system work |

**Escalation model:**
1. Low severity → Slack message to `#engineering-alerts`
2. Medium severity → Slack + email
3. High severity → PagerDuty or SMS

**Anti-pattern — alert fatigue:** Alerting on every error, every failed attempt, or every p50 threshold causes engineers to tune out alerts entirely. Real outages then go undetected. Trigger.dev addressed this explicitly by alerting on terminal failure (all retries exhausted), not per-attempt failure.

---

## 9. Where Alerts Fire — Channel Summary

| Platform | Built-in Alert Support | Channels | Notes |
|----------|----------------------|----------|-------|
| **Supabase** | None for performance | — | Custom path required: pg_cron → Edge Function → Resend, or Prometheus → Axiom/Grafana |
| **Vercel** | Error anomaly (5xx), usage anomaly, deploy failure | Web, email, push | No per-function latency alerts; no native Slack/webhook |
| **Axiom** | Threshold, anomaly, match monitors | Slack, Email, PagerDuty, OpsGenie, Discord, Teams, Webhook | Free tier availability unconfirmed |
| **Sentry** | Issue, metric, uptime alerts | Email, Slack, Discord, PagerDuty, Teams, Webhook | Rule details → OBS_KB_2 |
| **Trigger.dev** | Run failure, deploy failure, deploy success | Email, Slack, Webhook | Fires on terminal failure only; `onFailure` misses Crashed/System failure |
| **Inngest** | None native | — | Code-only: `onFailure` handler or `inngest/function.failed` system event |
| **Resend** | — | Email | Stack-native fallback for all custom Supabase alerts |

---

## Always / Never

**ALWAYS:**
- Treat any DLQ row as an alert — zero tolerance, always actionable, never a notification.
- Alert on `oldest_pending_age_sec > 300` for the outbox worker — silence here means messages are not delivering.
- Alert on terminal failure (all retries exhausted) for Trigger.dev and Inngest, not on each failed attempt.
- Use Trigger.dev dashboard alert configuration (Email/Slack/Webhook) as the reliable path for `Crashed` and `System failure` runs — `onFailure` does not cover those.
- Monitor cache hit ratio; if it drops below 99% for more than an hour, treat it as a signal the compute plan is undersized.
- Verify pg_stat_statements is active and the view is queryable before building slow-query workflows on top of it — Supabase docs are contradictory on default enablement.
- Scrape the Supabase Prometheus metrics endpoint at most once per minute per Supabase guidance.
- Query `pg_stat_activity` for direct connections only; use the Prometheus endpoint or Supabase dashboard for Supavisor client connection counts.

**NEVER:**
- Alert on every failed attempt — alert only on terminal failure. Retry noise kills on-call response quality.
- Use Supabase Dashboard Reports for real-time alerting — reports show hourly averages with no alert hooks.
- Rely on `event.data.error.cause` in an Inngest `onFailure` handler when the function threw `NonRetriableError` with a `cause` without first verifying your `inngest-js` version (issue #797 filed Jan 2025, fixed March 2025 via PR #2088).
- Alert on p50 latency alone — a slow p50 may mask a devastating p99. Include `max_exec_time` or `stddev_exec_time` in slow-query analysis.
- Treat `cron.job_run_details` showing success as proof an Edge Function completed its logic — it only confirms the HTTP request was dispatched (per JOB_KB_1).
- Drop an index with `idx_scan = 0` without allowing at least 24 hours of representative production traffic — stats reset on server restart.

---

## Cross-References

- `OBS_KB_1_Structured_Logging.md` — log `oldest_pending_age_sec` as a structured field; Axiom monitors key on it
- `OBS_KB_2_Error_Tracking.md` — Sentry alert rule configuration; Web Vitals performance monitoring
- `OBS_KB_3_Audit_Logging.md` — audit events (separate from performance signals)
- `JOB_KB_1` — outbox table design, pg_cron setup, `cron.job_run_details` caveat
- `JOB_KB_3` — DLQ table design, pgmq, MVCC/vacuum failure mode
- `JOB_KB_4` — Trigger.dev and Inngest task authoring
- `SB_KB_12_RLS_Performance.md` — RLS performance tuning, Performance Advisor, `pg_stat_statements` integration with the advisor
