# JOB_KB_2 — Scheduled Jobs: pg_cron vs Vercel Cron

**Stack-locked: Supabase pg_cron + Vercel Cron. Concepts portable to other Postgres / hosting combinations.**

---

## Pattern

There are two real schedulers in this stack: **pg_cron** (DB-internal, runs SQL commands or calls Edge Functions via pg_net) and **Vercel Cron** (HTTP GET requests to Next.js routes on a schedule). What Supabase markets as "Edge Function cron" is not a third thing — it is pg_cron issuing a `net.http_post()` call to an Edge Function URL via the pg_net extension. There is no separate Edge Function cron daemon. Call it what it is: pg_cron + pg_net.

The decision is simple: if the work touches the database directly (deletes, updates, view refreshes, queue processing), use pg_cron. If the work lives in your Next.js app layer (external API calls, Stripe syncs, app-level orchestration), use Vercel Cron. When pg_cron needs to trigger application-layer JS/TS code, it calls an Edge Function via pg_net — which means the scheduler is still pg_cron, just with an HTTP hop in the middle.

Cross-references: the outbox worker in **JOB_KB_1** is exactly the kind of Edge Function pg_cron should call every 30 seconds. The generalized queue workers in **JOB_KB_3** are triggered the same way. For scheduled work that exceeds Vercel or Edge Function timeouts, see **JOB_KB_4** (Trigger.dev / Inngest). The outbox pattern itself needs a scheduler — see **SB_KB_6**.

---

## When to use / when to skip

**Use pg_cron when:**
- Work is pure SQL: row cleanup, soft-delete retention, materialized view refresh, session expiry
- You need sub-minute scheduling (down to ~5-second intervals via pg_cron interval syntax)
- Triggering an Edge Function worker via pg_net — pg_cron owns the schedule, Edge Function owns the execution
- You want job run history in the database (`cron.job_run_details`) without external tooling

**Use Vercel Cron when:**
- Work belongs in your Next.js app: external API syncs, third-party webhooks, app-layer orchestration
- You want schedule configuration in `vercel.json` next to your deployment config
- Observability via Vercel dashboard is sufficient
- Pro/Enterprise plan — Hobby is limited to once-per-day jobs with ±59-minute firing precision

**Skip / simplify when:**
- The work is one-off or rare — call it on demand instead of scheduling it
- The work is a direct DB mutation that a trigger or RLS policy could handle inline
- You're on Hobby and need sub-daily precision — pg_cron is a better fit

---

## Anti-patterns

**Business logic directly in the pg_cron command string.** The `command` field should call a `SECURITY DEFINER` stored procedure, not inline a 200-line SQL block. Procedures are versionable in migrations, testable in isolation, and their errors surface cleanly in `cron.job_run_details.return_message`.

**No `CRON_SECRET` on Vercel Cron routes.** Without auth, any caller who knows the URL can invoke your endpoint. Every Vercel Cron route must check `Authorization: Bearer <CRON_SECRET>` before doing any work.

**Assuming Vercel Cron fires in local time.** Vercel Cron is always UTC. `0 9 * * *` fires at 09:00 UTC — which is 04:00 or 01:00 for US-East/West users. Document this explicitly in the route handler with a comment.

**Sub-second scheduling with pg_cron.** The pg_cron background worker has overhead that exceeds execution time below ~1-second intervals. The minimum meaningful interval is roughly 5 seconds. For true high-frequency work, use a queue (JOB_KB_3).

**Letting `cron.job_run_details` grow unbounded.** Records persist indefinitely by default. Schedule a weekly cleanup job from day one or the table will bloat your database.

**Hardcoding service role keys in pg_cron SQL.** Keys in the `command` column are visible in `cron.job` and `cron.job_run_details` to anyone with Postgres access. Store all credentials in Supabase Vault and retrieve them via `vault.decrypted_secrets`.

**Assuming Vercel will retry a failed cron job.** It will not. If you need reliability, maintain a `pending_jobs` table: the cron route processes items and marks them done; the next run catches anything the previous run missed.

---

## Generic example

### 1. Enable pg_cron (already available in Supabase)

pg_cron ships pre-installed in every Supabase project — no `CREATE EXTENSION` step required. The `cron` schema is present immediately. Use the Supabase dashboard (Integrations → Cron) or SQL migrations to manage jobs.

---

### 2. pg_cron job calling a SECURITY DEFINER cleanup procedure

```sql
-- migration: 20240101_purge_deleted_users.sql

-- The procedure owns the logic; pg_cron just calls it
create or replace procedure purge_deleted_users_older_than(retention interval)
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from users
  where deleted_at is not null
    and deleted_at < now() - retention;
end;
$$;

-- Schedule: nightly at 02:00 UTC
select cron.schedule(
  'purge-soft-deleted-users',
  '0 2 * * *',
  $$ call purge_deleted_users_older_than(interval '30 days'); $$
);
```

```sql
-- Session expiry: chunked to avoid long-running transactions
select cron.schedule(
  'expire-sessions',
  '*/5 * * * *',
  $$
    delete from user_sessions
    where id in (
      select id from user_sessions
      where expires_at < now()
      limit 1000
    );
  $$
);
```

---

### 3. pg_cron job calling an Edge Function via pg_net

Store credentials in Vault first (do this once, in a migration or via dashboard):

```sql
-- Run once during setup
select vault.create_secret(
  'https://<project-ref>.supabase.co',
  'project_url'
);
select vault.create_secret(
  '<your-service-role-key>',
  'service_role_key'
);
```

Then schedule the HTTP call. This is the pattern for triggering the outbox worker (JOB_KB_1) and generalized queue workers (JOB_KB_3):

```sql
-- Trigger outbox worker every 30 seconds (recent Supabase Postgres versions interval syntax)
-- [VERIFY BEFORE SHIPPING] confirm your Supabase project is on recent Supabase Postgres versions
select cron.schedule(
  'process-outbox',
  '30 seconds',
  $$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'project_url'
      ) || '/functions/v1/process-outbox',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'service_role_key'
        )
      ),
      body := jsonb_build_object('triggered_at', now())
    );
  $$
);
```

> **Note:** `net.http_post()` is fire-and-forget. The pg_cron job records `succeeded` as soon as the HTTP call is queued — not when the Edge Function completes. Check Edge Function logs separately if the function fails. pg_net stores HTTP responses in `net._http_response` if you need to query them.

---

### 4. Vercel Cron via vercel.json

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/cleanup",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/cron/stripe-resync",
      "schedule": "0 4 * * *"
    }
  ]
}
```

---

### 5. Vercel Cron route handler with CRON_SECRET auth

```ts
// app/api/cron/cleanup/route.ts
import type { NextRequest } from 'next/server';

// All Vercel Cron schedules are UTC. 0 2 * * * = 02:00 UTC every night.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Idempotent work here — Vercel can deliver the same event more than once
  // Use ON CONFLICT DO NOTHING, WHERE NOT EXISTS, or status-guarded updates

  return Response.json({ ok: true, ranAt: new Date().toISOString() });
}
```

Set `CRON_SECRET` in Vercel project settings (Project → Settings → Environment Variables). Use a random string of at least 16 characters. Vercel sends it automatically as `Authorization: Bearer <value>` on every cron invocation.

---

### 6. Common scheduled patterns

```sql
-- Soft-delete retention (purge rows deleted > 30 days ago)
select cron.schedule(
  'purge-soft-deleted-users',
  '0 2 * * *',
  $$ call purge_deleted_users_older_than(interval '30 days'); $$
);

-- Summary table refresh (alternative to materialized view)
select cron.schedule(
  'refresh-daily-summaries',
  '*/15 * * * *',
  $$ call refresh_daily_summary_table(); $$
);

-- Dead-letter alerting — pg_cron calls an Edge Function to send a webhook
select cron.schedule(
  'check-dead-letter-queue',
  '0 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
              || '/functions/v1/send-dlq-alert',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
        )
      ),
      body := (
        select jsonb_build_object(
          'count', count(*),
          'oldest_at', min(created_at)
        )
        from dead_letter_queue
        where created_at < now() - interval '1 hour'
      )
    );
  $$
);

-- Trim cron.job_run_details before it bloats
select cron.schedule(
  'cleanup-job-run-details',
  '0 0 * * 0',  -- Sunday midnight UTC
  $$
    delete from cron.job_run_details
    where end_time < now() - interval '30 days';
  $$
);
```

---

## Trade-offs

| Scheduler | Best for | Min frequency | Max runtime | Observability | Auth model |
|---|---|---|---|---|---|
| **pg_cron (SQL)** | Pure DB work: deletes, updates, vacuums | ~5 seconds (interval syntax, recent Supabase Postgres versions) | 10 min recommended; no hard timeout | `cron.job_run_details` table | Runs as scheduling postgres user |
| **pg_cron + pg_net → Edge Function** | JS/TS workers triggered on a DB schedule | Same as pg_cron | 150s (free) / 400s (paid) Edge Function wall-clock; 2s CPU | pg_cron table + Supabase Function logs | Bearer token from Vault |
| **Vercel Cron** | App-layer HTTP work; 3rd-party syncs | 1/day (Hobby, ±59 min precision) / 1/min (Pro) | 300s default; 800s max on Pro with Fluid Compute | Vercel dashboard + runtime logs | `CRON_SECRET` env var |

---

## Gotchas

**Vercel Cron is always UTC — no exceptions.** There is no project-level timezone setting. An expression that looks like "9 AM" fires at 09:00 UTC. For US East Coast users, that is 4 AM or 5 AM depending on DST. Always comment your cron expressions with the UTC time and any equivalent local time that matters to you.

**Hobby plan scheduling precision is ±59 minutes.** Expressions that fire more than once per day fail at deployment on Hobby with: *"Hobby accounts are limited to daily cron jobs."* Expressions that fire once per day may trigger anywhere within that hour window. Not suitable for time-sensitive jobs — use pg_cron instead.

**pg_cron sub-minute syntax requires recent Supabase Postgres versions.** The `'30 seconds'` interval form does not exist on older versions; it will silently fail or error. `[VERIFY BEFORE SHIPPING]` — confirm your Supabase project Postgres version in the dashboard before using interval syntax. Standard 5-field cron (`*/1 * * * *` for every-minute) works on all versions.

**Fluid Compute changed Vercel Function timeouts in 2026.** Previous documentation cited 10s (Hobby) and 60s (Pro). Current limits (as of 2026-02-27) with Fluid Compute enabled: 300s default, 800s maximum on Pro/Enterprise. **Fluid Compute is the default for new Vercel projects since April 2025** — older projects may need to opt in via Project Settings. `[VERIFY BEFORE SHIPPING]` — verify Fluid Compute is enabled if you're relying on >60s cron job duration on a project created before April 2025.

**pg_net is fire-and-forget from pg_cron's perspective.** When pg_cron calls `net.http_post()`, it records `succeeded` the moment the HTTP call is queued — regardless of whether the Edge Function succeeds or even starts. To debug Edge Function failures: query `net._http_response` for HTTP-level errors, and check Supabase Dashboard → Functions → Logs for execution errors. Do not rely on `cron.job_run_details.status` to confirm Edge Function completion.

**Vercel Cron does not retry failed invocations.** A 500 response is logged, not retried. Design scheduled work defensively: process items from a `pending` state in the database; the next run will pick up items the previous run missed. This makes jobs idempotent by construction.

**Duplicate invocations are possible on both platforms.** Vercel explicitly documents that its event-driven system can deliver the same cron event more than once. pg_cron can queue multiple overlapping invocations if a job runs longer than its interval. Use `ON CONFLICT DO NOTHING`, `WHERE status = 'pending'`, or `UPDATE ... RETURNING` patterns to make operations safe to run twice.

**`cron.job_run_details` grows unbounded by default.** Records never expire unless you delete them. Schedule a cleanup job from day one (see example in the Generic example section above). `cron.log_run` defaults to on; set it to off to disable logging entirely if you don't need it.

**Vercel Cron only fires on production deployments.** It does not run on preview deployments. To test a cron route locally, hit the endpoint directly: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/your-job`. There is no cron schedule simulation in `vercel dev`.

**Vercel does not follow redirects from cron endpoints.** If your cron path returns a 301/302, Vercel treats the redirect response as the final result — no work is done and no error is raised in the cron job history. Ensure cron paths resolve directly to a handler, not through a redirect.

**Rollbacks do not reset cron schedules.** After a Vercel Instant Rollback, the cron jobs listed in `vercel.json` continue running on the schedule from the rolled-back deployment. Manually disable jobs from the Vercel dashboard if needed after a rollback. `[VERIFY BEFORE SHIPPING]`

**pg_cron jobs pause during hot standby / failover.** Jobs do not execute while Postgres is in hot standby mode. They resume automatically on promotion. No manual intervention needed, but be aware that jobs may be skipped during a failover window.

**Key rotation requires updating Vault secrets manually.** If you rotate the Supabase service role key, you must update the Vault secret and any `net.http_post()` calls that reference it. There is no automatic propagation. Audit `cron.job` after any key rotation.
