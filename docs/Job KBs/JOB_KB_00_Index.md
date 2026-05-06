# Job Knowledge Base — Index

**Stack:** Supabase Postgres + Edge Functions + pg_cron + Vercel Cron, with Trigger.dev / Inngest as the durable-execution escape hatch.

This folder owns asynchronous and scheduled work: outbox processing, queue tables, scheduled jobs, and long-running tasks. SB_KB_6's transactional outbox introduces the producer side; this folder picks up the worker side and generalizes from there. AUTH_KB_6's account anonymization is exactly the kind of work these patterns power.

These files are for Claude. Principles-only docs fail at implementation time. Every KB has real SQL, real worker code, and real gotchas.

---

## File index

| File | Topic | Stack-portable? |
|---|---|---|
| `JOB_KB_1_Outbox_Worker.md` | Worker that processes the SB_KB_6 outbox: `FOR UPDATE SKIP LOCKED` claim, lease, exponential backoff, dead-letter | ✅ Portable (Postgres + any worker runtime) |
| `JOB_KB_2_Scheduled_Jobs.md` | pg_cron vs Vercel Cron decision matrix; scheduled patterns (cleanup, retention, summary refresh, worker triggering) | ⚠️ Partial — pg_cron + Vercel-specific; concepts portable |
| `JOB_KB_3_Queue_Tables.md` | Generalized Postgres queue patterns: priority, fan-out, dedup, work units beyond outbox; pgmq vs custom table | ✅ Portable (Postgres) |
| `JOB_KB_4_Long_Running_Tasks.md` | Trigger.dev v3 vs Inngest as durable-execution escape hatch when Edge Function timeout (~150s) isn't enough | 🔒 Stack-locked: managed platforms |

---

## Local-dev tooling

If you're using Trigger.dev or Inngest (`JOB_KB_4`), running their local dev servers is non-negotiable. The alternative is push-deploy-debug, which makes iteration painful.

- **Trigger.dev CLI** (`npx trigger.dev@latest dev`) — local dev server that mirrors the production runtime. Auto-discovers task definitions in your project; logs show task lifecycle (queued → running → succeeded/failed). Hot-reloads on save.
- **Inngest CLI** (`npx inngest-cli@latest dev`) — same role for the Inngest path. Runs alongside `next dev`; auto-discovers function definitions; the dashboard at `localhost:8288` shows event flow and step-by-step execution traces.

For pg_cron jobs and Postgres queue tables (`JOB_KB_1`–`3`), no extra CLI is needed — work directly in the local Supabase DB via `supabase start` (Docker-backed). Claude can seed queue rows, advance `available_at` timestamps, and exercise worker logic without UI involvement.

---

## Cross-cutting rules that apply everywhere

**Always:**
- Claim work with `SELECT ... FOR UPDATE SKIP LOCKED` — never `SELECT ... LIMIT 1` followed by UPDATE (race condition).
- Process side-effects **outside** the claim transaction. Claim → COMMIT → process → mark done OR bump attempts. Long-running side-effects inside the claim transaction hold the row lock and starve other workers.
- Make every worker idempotent. Receivers see duplicates; design for it. Use stable idempotency keys (e.g., `outbox.id`) and pass them to receivers (Resend `Idempotency-Key`, Stripe idempotency-key, etc.).
- Use exponential backoff with a cap. Recommended: 30s → 2min → 10min → 30min → 2hr → cap. After 5–8 attempts, move to dead-letter.
- Use `available_at` / `claim_expires` columns. Worker dies → another worker picks up after lease expiry. Never trust a worker not to crash.
- Cap batch size to fit Edge Function timeout with a safety margin (~200ms reserve) — running out of time mid-batch leaks claimed rows back into the lease pool.
- Run workers and queue tables under service role. Add RLS policies on outbox / queue tables that deny all to `authenticated` / `anon`.
- Wrap secrets used by pg_cron in Vault — never hardcode service-role keys in `cron.schedule` arguments.

**Never:**
- Send a side-effect inside the original business DB transaction. If the side-effect succeeds and the DB rolls back, you've sent something based on state that doesn't exist.
- Process the side-effect inside the claim transaction. Slow side-effects starve other workers; failed side-effects can't be retried cleanly without losing visibility into the failure.
- Hot-loop on errors. No backoff = burns Edge Function budget for nothing.
- Run business logic directly inside pg_cron job arguments. Orchestrate via `SECURITY DEFINER` procedures or `pg_net.http_post` to an Edge Function — keep cron jobs thin.
- Use `pg_notify` for jobs that need durability. Listeners that are offline miss messages.
- Poll faster than ~5s on Edge Functions. Burns budget for negligible latency improvement.
- Put critical business state **only** in Trigger.dev / Inngest run state. Both are execution platforms, not databases. Persist to Supabase.
- Use the same idempotency key for unrelated operations. Scope the key to the operation type.

---

## Dependencies between files

```
JOB_KB_1   ← JOB_KB_2   (pg_cron drives the outbox worker)
JOB_KB_3   ← JOB_KB_1   (same FOR UPDATE SKIP LOCKED semantics, generalized)
JOB_KB_3   ← JOB_KB_2   (workers triggered by cron)
JOB_KB_4   ← JOB_KB_1   (outbox can dispatch to managed platforms)
JOB_KB_4   ← JOB_KB_3   (alternative when Postgres queue throughput / latency isn't enough)
```

Cross-folder dependencies:

```
JOB_KB_1   → SB_KB_6     (the transactional outbox producer this KB processes)
JOB_KB_1   → SB_KB_10    (Resend Idempotency-Key — the canonical idempotent receiver)
JOB_KB_1   → AUTH_KB_6   (account anonymization is exactly this pattern)
JOB_KB_2   → SB_KB_8     (Vercel hosting context)
JOB_KB_3   → SB_KB_12    (RLS implications of queue tables — service-role-only access)
JOB_KB_4   → AUTH_KB_6   (anonymization is a multi-step workflow Inngest handles cleanly)
```

---

## When to update these files

Update the relevant JOB_KB when:
- pg_cron changes behavior (new functions, new permissions model)
- Vercel changes Cron limits or runtime model (e.g., the Fluid Compute change in 2026 raised Function timeouts to 300s default / 800s max on Pro)
- Trigger.dev or Inngest ships a major version (Trigger.dev v2 → v3 was significant)
- pgmq evolves its API
- A pattern produces an unexpected result in production

Do not update JOB_KBs to reflect project-specific decisions. These are stack patterns, not project docs.

---

## What these files do NOT cover

- **External queue services** (BullMQ + Redis, AWS SQS, RabbitMQ, NATS) — different stack
- **Streaming** (Kafka, Pulsar) — rarely needed in app-blueprint context; different concern
- **Workflow orchestration engines** (Temporal, AWS Step Functions, Hatchet self-hosted) — different problem class
- **ML / data pipelines** (Airflow, Dagster, Prefect) — different domain
- **Monitoring / alerting** (Sentry, Axiom, Better Stack) — moves to a future OBS_KB family
- **Idempotency theory** as standalone — covered inline in JOB_KB_1 and JOB_KB_3

---

## VERIFY BEFORE SHIPPING

Several KBs flag items that primary docs didn't fully confirm. Search each KB for `[VERIFY BEFORE SHIPPING]` and confirm against current docs before relying on these patterns in production. Notable items:

- pg_cron sub-minute interval syntax availability (version-gated)
- Vercel Fluid Compute exact timeout limits across plan tiers
- Trigger.dev v3 + Inngest current pricing (changes often)
- pgmq priority queue best practices in 2026
- Edge Function timeout exact ceiling (was ~150s; verify in your project)

These are not blockers — flagged so users verify per-project before relying.
