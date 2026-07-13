# KB Index — task-routing across stack-reference KB families

This index sits on top of the ten **stack-reference** KB folders under `docs/`. It exists to answer one question: *"I'm about to build X. Which KB files do I read first, and in what order?"* The folders themselves are exhaustive; this file is a routing layer for tasks that genuinely span multiple families.

Two kinds of KB live in this repo:

- **Project-state KBs** (`KB_1_Architecture.md`, `KB_7_UI_Patterns.md`, `KB_8_Current_State.md`, `KB_9_Screen_Catalog.md`, `LESSONS.md`, `CHANGELOG.md`, `APP_CONCEPT.md`, `SCOPE.md`) — owned by *this* project, evolve as features ship, populated by `/kickoff` and maintained by `/ship` and `/update-kb`.
- **Stack-reference KBs** (the ten folders below) — vetted patterns for the chosen stack (Supabase + Next.js App Router + Vercel + Resend + Stripe + Anthropic + Expo/React Native for the optional mobile companion client). They do not change per project; they are read-mostly. Each folder has a `*_KB_00_Index.md` (or `_0_Index`) with a file table, cross-cutting always/never rules, dependencies between files, and a `VERIFY BEFORE SHIPPING` list.

Folders: `Supabase Structure KBs/` (`SB_KB_*`), `UI-UX KBs/` (`UI_KB_*`), `Auth KBs/` (`AUTH_KB_*`), `Job KBs/` (`JOB_KB_*`), `Test KBs/` (`TEST_KB_*`), `Form KBs/` (`FORM_KB_*`), `Obs KBs/` (`OBS_KB_*`), `Bill KBs/` (`BILL_KB_*`), `AI KBs/` (`AI_KB_*`), `Mobile KBs/` (`MOB_KB_*`).

For per-folder file listings and rules, open the family's `00_Index`. This file does **not** repeat them.

---

## By task

The KB to read **first** is listed first; subsequent files add depth or cross-family glue. Always also skim the relevant family `00_Index` for the always/never list.

| Task | Read in order |
|---|---|
| **Build login + signup with first-org provisioning** | `AUTH_KB_5` → `AUTH_KB_2` → `AUTH_KB_1` → `FORM_KB_2` → `SB_KB_1` → `UI_KB_5` |
| **Add a tenant-scoped table with RLS** | `SB_KB_1` → `SB_KB_12` → `AUTH_KB_2` (claims it reads) → `TEST_KB_2` |
| **Build a multi-step wizard (signup, onboarding, application)** | `FORM_KB_3` → `FORM_KB_1` → `FORM_KB_2` → `AUTH_KB_5` (if account-creating) → `UI_KB_5` |
| **Build a Stripe billing upgrade + plan-tier gating** | `BILL_KB_1` → `BILL_KB_2` → `BILL_KB_3` → `BILL_KB_4` → `AUTH_KB_2` (plan claim) → `JOB_KB_1` (webhook outbox) |
| **Add MFA-gated admin actions (AAL2 step-up)** | `AUTH_KB_3` → `SB_KB_12` (InitPlan + AAL2 RLS) → `OBS_KB_3` (audit the gated action) → `TEST_KB_5` (otplib in Playwright) |
| **Add a long-running background job (anonymization, batch reprocess)** | `JOB_KB_4` → `JOB_KB_1` → `OBS_KB_2` (capture failures) → `OBS_KB_4` (DLQ alerts) |
| **Add a scheduled job (cleanup, retention, reminders)** | `JOB_KB_2` → `JOB_KB_1` (if it processes the outbox) → `SB_KB_10` (if it sends email) → `OBS_KB_4` |
| **Build a real-time progress dashboard** | `SB_KB_9` → `JOB_KB_1` (producer) → `UI_KB_9` → `AI_KB_3` (if the stream is an AI generation) → `TEST_KB_6` |
| **Build a streaming AI chat surface** | `AI_KB_3` → `AI_KB_1` → `AUTH_KB_4` (auth in Route Handler) → `OBS_KB_2` (mid-stream errors) → `OBS_KB_4` (token-cost alerts) |
| **Implement RAG search (pgvector + Voyage)** | `AI_KB_2` → `SB_KB_12` (HNSW + RLS post-scan filter) → `JOB_KB_4` (batch embedding) → `AI_KB_1` (generation half) |
| **Build an agent with tools / MCP** | `AI_KB_4` → `AI_KB_1` → `JOB_KB_4` (long agent runs) → `OBS_KB_2` + `OBS_KB_4` (per-turn cost / failures) |
| **Build a file-upload flow with compliance** | `SB_KB_7` → `FORM_KB_4` (input wiring) → `JOB_KB_1` (async scan dispatch) → `OBS_KB_3` (access audit) |
| **Send a transactional email (magic link, invoice, trial-end)** | `SB_KB_10` → `SB_KB_6` (transactional outbox) → `JOB_KB_1` (worker + idempotency) |
| **Build an admin dashboard (queue health, billing, audit drilldown)** | `UI_KB_8` → `OBS_KB_4` (queries) → `BILL_KB_3` (plan filters) → `OBS_KB_3` (audit reads) → `JOB_KB_1` (DLQ) |
| **Test a feature end-to-end (the whole pyramid)** | `TEST_KB_1` (strategy) → `TEST_KB_2` (RLS) → `TEST_KB_3` (integration) → `TEST_KB_4` (component) → `TEST_KB_5` (E2E) → `TEST_KB_6` (if async) |
| **Port the web app to a native mobile companion** | `MOB_KB_00` → `MOB_KB_2` → `MOB_KB_1` → `MOB_KB_3` → `MOB_KB_4` → `MOB_KB_5` |

---

## By stack layer

When you already know which concern you're touching, skip the task table.

| Concern | Folder(s) |
|---|---|
| Tenancy, RLS, multi-org schema, realtime, storage | `Supabase Structure KBs/` |
| Visual design, components, layout, motion, a11y | `UI-UX KBs/` |
| Login, sessions, JWT claims, MFA, signup, account lifecycle | `Auth KBs/` |
| Forms, validation schemas, wizards, server actions | `Form KBs/` |
| Outbox / queues / scheduled jobs / durable execution | `Job KBs/` |
| Stripe billing, webhooks, plan gating, customer lifecycle | `Bill KBs/` |
| Logging, errors (Sentry), audit trails, performance, alerts | `Obs KBs/` |
| Claude API, prompt caching, RAG, streaming, tools, agents, MCP | `AI KBs/` |
| Test strategy, pgTAP RLS, integration, component, E2E, async | `Test KBs/` |
| Native mobile companion (React Native / Expo), web→mobile ports, device distribution | `Mobile KBs/` |

---

## Cross-family always-true rules

Each rule has a single canonical source — that's where to read the *why* and the implementation. The point of listing them here is to surface the rules that show up in more than one family's `Always` / `Never` list, so they don't get forgotten when you're heads-down in one folder.

- **Server-set claims only.** Never trust `user_metadata` for `org_id`, `role`, `plan`, or any access-control decision — it is client-writable. Populate via the Custom Access Token Hook into `app_metadata`. Source: `AUTH_KB_2`. Echoed by `BILL_KB_3` (plan claim) and `SB_KB_1` (org claim).
- **InitPlan idiom for every JWT read in RLS.** Wrap `auth.uid()` and `auth.jwt() ->> 'x'` in `(select ...)` so the planner caches per-statement instead of per-row. Source: `SB_KB_12`. Required by every `SB_KB_1`-style policy and every `BILL_KB_3` plan check.
- **Authorization at the database, defense in depth above it.** RLS is the floor; Server Actions and UI gates are layered above for UX, not as the trust boundary. Source: `SB_KB_1` + `BILL_KB_3`.
- **Subscriptions belong to the org, not the user.** Billing follows union-membership tenancy. Source: `BILL_KB_1`. Required by `SB_KB_1`-shaped projects.
- **`request_id` in `proxy.ts`, propagated everywhere.** One ID joins operational logs (`OBS_KB_1`), Sentry breadcrumbs (`OBS_KB_2`), and `audit_log.request_id` (`OBS_KB_3`). Use `NextResponse.next({ request: { headers } })` to forward to RSCs. Source: `OBS_KB_1`.
- **Operational logs redact PII; audit logs retain it.** Two systems, two retention models, two audiences. Never reuse the audit table for a "recent activity" feed. Sources: `OBS_KB_1` (redact) + `OBS_KB_3` (retain).
- **Side-effects through the transactional outbox, never inline.** Producer writes the outbox row in the same DB transaction as the business state; worker dispatches after commit with `FOR UPDATE SKIP LOCKED`, exponential backoff, and a stable idempotency key. Sources: `SB_KB_6` (producer) + `JOB_KB_1` (worker). Cross-cuts `SB_KB_10` (email), `BILL_KB_2` (Stripe), `AUTH_KB_6` (anonymize).
- **Idempotency on every external side-effect.** Stripe `Idempotency-Key`, Resend `Idempotency-Key`, dedup-by-`event_id` on webhook ingest. Sources: `JOB_KB_1`, `BILL_KB_2`, `SB_KB_10`.
- **Re-parse Zod on the server.** Client validation is UX. The Server Action is the trust boundary — `safeParse` again. Source: `FORM_KB_1` + `FORM_KB_2`.
- **Server-side AI calls only.** The Anthropic API key never reaches the client. No `NEXT_PUBLIC_*` exposure, no client-side proxy. Source: `AI_KB_1`. Required by `AI_KB_3`, `AI_KB_4`.
- **Cache long system prompts.** Prompt caching is the difference between a sustainable and an unsustainable Claude integration. Per-model thresholds (Opus 4.7 / Haiku 4.5: 4096 tok; Sonnet 4.6: 2048 tok; older: 1024). Source: `AI_KB_1`.
- **Bound agent loops; push long runs off Vercel.** Max-iter cap (default 10), wallclock budget; cross over to Trigger.dev / Inngest before the Function timeout (Hobby 300s / Pro 800s). Sources: `AI_KB_4` + `JOB_KB_4`.
- **Refresh the session after a plan change.** Otherwise the JWT carries stale `plan` until next natural refresh and gating fails silently. Source: `BILL_KB_3`.
- **Re-auth (AAL2) before account-sensitive operations.** Email change, password change, deletion, role escalation, billing-method change. Sources: `AUTH_KB_3` + `AUTH_KB_6` + `BILL_KB_4`.
- **Soft-delete users, never hard-delete `auth.users` directly.** Ban + `deleted_at` + anonymize via the outbox. The Stripe customer also lingers — refund window is ~90 days. Sources: `AUTH_KB_6` + `BILL_KB_4`.
- **Test RLS at the database with pgTAP.** JS-only tests cannot simulate the JWT-driven role context the policies actually run under. Source: `TEST_KB_2`.
- **Node runtime for DB and AI calls in Next.js.** Edge has no TCP (breaks Postgres) and stream-duration caveats. `proxy.ts` is Node-only in Next 16. Sources: `SB_KB_8` + `AI_KB_1` + `AUTH_KB_4`.

---

## When to update this file

- A new task class shows up that genuinely spans 3+ families and isn't already routed → add a row.
- A cross-family rule emerges that a single family's index can't own → add it under "Cross-family always-true rules" with the canonical source.
- A folder is added or removed → update the orientation paragraph and the layer table.

Do **not** mirror per-family rules into this file. The family `00_Index` is the canonical home for its own rules; this index links, it doesn't duplicate.
