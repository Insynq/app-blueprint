# Observability Knowledge Base — Index

**Stack:** Sentry (errors) + Axiom (logs) + Postgres-native audit tables + pg_stat_statements + Trigger.dev / Inngest / Vercel / Supabase native alert channels.

This folder owns telemetry that runs the system: structured operational logs, exception capture, append-only audit trails, performance signals, and the alerts that fire on them. Three different streams, three different retention models, three different audiences — keep them apart on purpose. Authentication-specific events live in `Auth KBs/`. Outbox / queue / DLQ table design lives in `Job KBs/`. RLS performance tuning lives in `Supabase Structure KBs/SB_KB_12`. This folder reads from those, never duplicates them.

These files are for Claude. Principles-only docs fail at implementation time. Every KB has real config, real code, and real gotchas.

---

## File index

| File | Topic | Stack-portable? |
|---|---|---|
| `OBS_KB_1_Structured_Logging.md` | Pino in Node + `next-axiom` Logger in Edge + `console.log(JSON.stringify(...))` in Deno; `request_id` propagation through `proxy.ts` (`NextResponse.next({ request: { headers } })`); PII redaction; Vercel Log Drain → Axiom; Trigger.dev OTLP; level/destination matrix per runtime | ⚠️ Partial — Pino + Axiom portable; Vercel/Supabase Edge specifics stack-locked |
| `OBS_KB_2_Error_Tracking.md` | `@sentry/nextjs` v10.x setup via `instrumentation.ts` + `instrumentation-client.ts`; source maps via `withSentryConfig`; `error.tsx` / `global-error.tsx` with manual `captureException`; `withServerActionInstrumentation`; `onRequestError` for RSCs (≥ 8.28.0 + Next 15); `npm:@sentry/deno` (beta) for Edge Functions; user/org context without PII | 🔒 Stack-locked: Sentry SDK + Next.js App Router |
| `OBS_KB_3_Audit_Logging.md` | Append-only `audit_log` table; three-layer immutability (REVOKE + BEFORE trigger raising on UPDATE/DELETE + RLS INSERT-only); `jsonb` not `json`; native declarative RANGE partitioning + pg_cron (not pg_partman on Supabase); admin-only SELECT; trigger vs explicit DB function vs outbox capture paths | ✅ Portable (Postgres) |
| `OBS_KB_4_Performance_And_Alerts.md` | pg_stat_statements + canonical `pg_stat_activity` / `pg_locks` / cache-hit / index queries; Supavisor connection visibility (Prometheus only, not `pg_stat_activity`); outbox-lag and DLQ alert queries; Trigger.dev dashboard alerts (terminal-only); Inngest `onFailure` + `inngest/function.failed`; pg_cron → Edge Function → Resend custom alert path (Supabase has no native alerts) | ⚠️ Partial — SQL queries portable; channel integrations stack-locked |

---

## Cross-cutting rules that apply everywhere

**Always:**
- Generate a stable `request_id` in `proxy.ts` and propagate it through every log, error, and audit write — operational logs (OBS_KB_1), Sentry breadcrumbs (OBS_KB_2), and the `audit_log.request_id` column (OBS_KB_3) all key on the same value.
- Forward request headers upstream with `NextResponse.next({ request: { headers: requestHeaders } })`. The bare `{ headers }` form sends to the client, not RSCs.
- Emit structured JSON with discrete fields (`{ userId, orderId, action }`), never string-concatenated messages. Logs are queries, not prose.
- Capture errors at the boundary: `error.tsx` / `global-error.tsx` (with explicit `Sentry.captureException` in `useEffect` — Sentry does not auto-capture these), Server Action try/catch, Edge Function top-level handler, `onFailure` in Trigger.dev / Inngest. Never silently swallow inside business logic.
- Re-throw after `captureException` in background-job catch blocks so the platform also marks the run failed and triggers retry/alert paths.
- Pair every `error`-level log with a Sentry capture. Logs provide context; Sentry handles grouping, replay, and alerting.
- Treat audit logs and operational logs as distinct systems: audit rows are immutable, retain PII deliberately, are queried by auditors over years; operational logs are ephemeral, redact PII, are queried by engineers over days.
- Install all three audit immutability layers (REVOKE + trigger + RLS). The BEFORE trigger is the only layer that catches `service_role` — REVOKE and RLS both bypass for owner-equivalent roles.
- Alert only on terminal failure (after all retries exhausted) for Trigger.dev / Inngest. Per-attempt alerts produce fatigue and degrade response quality.
- Treat any DLQ row as a page-worthy alert — zero tolerance, always actionable.
- Verify `pg_stat_statements` is active in your Supabase project before building slow-query workflows; primary docs are contradictory on default enablement.

**Never:**
- Log emails, full names, phone numbers, raw request bodies, JWTs, Supabase service-role keys, API keys, or PHI — even at `debug` level. Axiom does not redact on ingest.
- Use `pino.transport(...)` (worker-thread transports) in Vercel Edge Runtime or Supabase Edge Functions. Use `next-axiom`'s `Logger` (fetch-based) in Edge and `console.log(JSON.stringify(...))` in Deno.
- Use `console.log` as the production observability path. Go through a logger; the level metadata and structured shape matter for filtering and retention.
- Use `payload json` for any audit table — not GIN-indexable. The `auth.audit_log_entries` table makes this mistake; do not repeat it. Always `jsonb`.
- Expose audit rows to end users via RLS. Build a separate `user_activity_log` if you need a "recent activity" feed — never reuse the compliance audit table.
- Redact PII in audit logs. Audit logs deliberately retain it; access is controlled by role, not by redaction. (Inverse of the OBS_KB_1 rule.)
- Set `Sentry.setUser({ email })` or `setTag` PII fields without legal sign-off — Sentry tags are indexed and searchable, compounding exposure. Default to `{ id }` only.
- Set `sendDefaultPii: true` (the wizard's default; v10.4.0 fixed this flag actually gating IP-address inference — see OBS_KB_2 PII section) without legal review of IP / header collection.
- Capture the same error in two locations (`error.tsx` and a parent that also catches) — Sentry creates duplicate issues.
- Alert on every error or every failed attempt. Alert fatigue kills response time.
- Trust `event.data.error.cause` in an Inngest `onFailure` after `NonRetriableError` with a cause without first checking your `inngest-js` version — bug filed Jan 2025 (issue #797), fixed March 2025 via PR #2088.
- Rely on Supabase Dashboard Reports as a real-time alert path — they show hourly averages with no alert hooks. Use the Prometheus endpoint, Axiom monitors, or pg_cron + Resend.
- Use `pg_partman` on Supabase managed instances — its background worker requires `shared_preload_libraries` access Supabase does not grant. Use native declarative partitioning + pg_cron.
- Use Vercel runtime logs or Supabase Edge Function logs as the sole long-term log destination — retention is too short (Vercel Hobby: 1hr, Pro: 1d, Pro+ObsPlus: 30d). Drain to Axiom for anything that needs to outlive an incident window.

---

## Dependencies between files

```
OBS_KB_1   ← OBS_KB_2   (Sentry breadcrumbs and `error.digest` cross-correlate against the `request_id` propagation contract OBS_KB_1 owns)
OBS_KB_1   ← OBS_KB_3   (audit_log.request_id reuses the OBS_KB_1 propagation contract)
OBS_KB_2   ← OBS_KB_4   (alert-rule routing references the Sentry capture surface OBS_KB_2 sets up)
OBS_KB_3   ← OBS_KB_4   (alerts on audit-write failure rates use the table OBS_KB_3 defines)
```

Cross-folder dependencies:

```
OBS_KB_1   → AUTH_KB_4    (proxy.ts session lifecycle composes with request_id injection in the same proxy function)
OBS_KB_1   → SB_KB_8      (Vercel hosting + subdomain routing context)
OBS_KB_1   → JOB_KB_4     (Trigger.dev OTLP + Inngest logger config)
OBS_KB_2   → AUTH_KB_4    (withServerActionInstrumentation wraps the Server Action body shown in AUTH_KB_4)
OBS_KB_2   → JOB_KB_4     (captureException + re-throw in Trigger.dev / Inngest tasks)
OBS_KB_3   → SB_KB_5/6    (per-aggregate immutability patterns this KB generalizes to a global audit_log)
OBS_KB_3   → SB_KB_7      (document_access_log is a domain-specific audit table following these layers)
OBS_KB_3   → AUTH_KB_6    (account-lifecycle audit events; UUID-not-PII rule established there)
OBS_KB_3   → JOB_KB_1     (outbox-based audit fan-out — approach C in OBS_KB_3)
OBS_KB_4   → SB_KB_12     (RLS performance tuning — distinct concern, do not duplicate)
OBS_KB_4   → JOB_KB_1     (outbox table design + cron.job_run_details caveat)
OBS_KB_4   → JOB_KB_3     (DLQ table design — alert on rows here)
OBS_KB_4   → JOB_KB_4     (Trigger.dev / Inngest task structure — alert routing only here)
```

---

## When to update these files

Update the relevant OBS_KB when:
- Sentry ships a major Next.js SDK version (the v8 → v10 transition renamed `sentry.client.config.ts` → `instrumentation-client.ts` and changed source-map defaults — assume more)
- Next.js renames or changes the proxy/middleware contract (Next 16 renamed `middleware.ts` → `proxy.ts`)
- `next-axiom` ships a flush-semantics change or new transport
- Vercel changes Function timeouts (the Fluid Compute change in 2026 raised defaults), Log Drain pricing, or Runtime Logs retention
- Supabase changes default-enabled extensions, the connection pooler (shared pgBouncer was migrated to Supavisor by Jan 15 2024; a Dedicated PgBouncer remains for paying customers), Prometheus metric names, or `auth.audit_log_entries` semantics
- Trigger.dev or Inngest ships an alert / `onFailure` API change (Trigger.dev added webhook alerts Feb 2025)
- A pattern produces an unexpected result in production
- A new gotcha is discovered (especially around Edge runtime limits, Supavisor connection visibility, or pg_partman availability)

Do not update OBS_KBs to reflect project-specific decisions. These are stack patterns, not project docs.

---

## What these files do NOT cover

- **Datadog / New Relic / AppDynamics / Honeycomb** — enterprise APM; out of scope for this template's lean observability stack
- **Self-hosted Grafana / Loki / Mimir / Prometheus stack** — viable but operationally heavier than the chosen Vercel + Axiom + Sentry path
- **Full-blown OpenTelemetry tracing** — mentioned as a portable alternative; not the default. The Trigger.dev OTLP → Axiom path in OBS_KB_1 is the only sanctioned tracing surface
- **Real User Monitoring (RUM)** beyond Vercel Analytics for Core Web Vitals — Sentry's Replay / Tracing features are noted but not the primary path
- **Synthetic monitoring / uptime checks** (Pingdom, Better Stack, Checkly, OpenStatus) — different concern; pair with this stack as needed
- **Bot / CAPTCHA / abuse mitigation** — overlaps with AUTH_KB but not addressed here
- **Compliance certification process** (SOC 2 audit fieldwork, HIPAA BAA negotiation, ISO 27001 ISMS scoping) — OBS_KB_3 builds the evidence layer; the audit itself is out of scope
- **Mobile / native crash reporting** (Bugsnag / Crashlytics) — Sentry has mobile SDKs but the Next.js + Edge focus here does not extend to native
- **DB query plan visualizers** (PgHero, pganalyze) — referenced briefly; full configuration out of scope

---

## VERIFY BEFORE SHIPPING

Several KBs flag items that primary docs didn't fully confirm. Search each KB for `[VERIFY BEFORE SHIPPING]` / `verify before publishing` / `verify against current docs` and confirm before relying on these patterns in production. Notable items:

**Logging (OBS_KB_1):**
- Whether Supabase Edge Function Logs Explorer auto-parses `console.log(JSON.stringify(...))` into queryable fields
- `x-request-id` accessibility from Server Actions when set in `proxy.ts`
- `proxy.ts` `event.waitUntil` typing — currently relies on `@ts-expect-error`
- Supabase Edge Function log retention duration

**Errors (OBS_KB_2):**
- Exact `@sentry/nextjs` version that renamed `sentry.client.config.ts` → `instrumentation-client.ts` (the migration guide does not say)
- `sentry.server.config.ts` / `sentry.edge.config.ts` generated contents (Sentry docs do not show them — run the wizard and inspect)
- Whether Supabase Edge Functions currently run Deno ≥ 2.0.0 (required by `npm:@sentry/deno`, still in beta)
- Edge runtime feature limitations (the Sentry Edge feature page returned 404 during research)
- Next.js 16 `unstable_retry` vs older `reset` prop on the `error.tsx` reset function — verify against your Next.js version

**Audit (OBS_KB_3):**
- HIPAA 6-year retention claim — secondary sources only; confirm against 45 CFR §164.312(b) before citing to auditors
- SOC 2 CC7 specific control text — AICPA primary source not accessible; consult your auditor
- ISO 27001:2022 Annex A.8.15/A.8.16/A.8.17 numbering — paywall-protected
- `auth.audit_log_entries` production retention policy — not confirmed; do not depend on it for compliance
- Auth-hook atomicity on audit-write failure — whether a failed audit write inside a Supabase auth hook fails the login itself

**Performance & alerts (OBS_KB_4):**
- pg_stat_statements default-enabled status on Supabase — `supabase inspect db` treats it as always available; the extension page shows manual enablement. Verify on a fresh project.
- Supavisor Prometheus metric names — exact names not documented; see `github.com/supabase/supabase-grafana`
- `pg_stat_statements_reset()` access for non-superusers on Supabase
- Whether Inngest has any native dashboard alert UI (strongly appears code-only — `onFailure` + `inngest/function.failed` system event)
- Axiom monitor availability on the free tier — verify at axiom.co/pricing

These are not blockers — flagged so users verify per-project before relying.
