> ⚠️ **This file is unpopulated until you run `/preflight` then `/kickoff`.** Do not edit manually — `/preflight` writes the `## Environment` block, then `/kickoff` discovery fills in the rest. If you see `[TODO]` markers, you haven't completed onboarding yet.

# Project: [TODO — run /kickoff to populate this]

> **This file is the project foundation.** Every Claude session reads it at the start.
> Onboarding sequence: `/preflight` (records agent + OS) → `/kickoff` (discovery session populates the project sections).

## Environment
[TODO — run /preflight to populate this. Captures which AI agent, OS, and shell are being used.]

## Overview
[TODO — what this app does and for whom]

## Tech Stack
[TODO — populate during /kickoff]

## Build Commands
- Type check: [e.g., npx tsc --noEmit]
- Dev server: [e.g., npm run dev]
- Build: [e.g., npm run build]

## Roles
[TODO — user types and hierarchy. Skip if single user type.]

## Core Entities
[TODO — main domain concepts the app manages, not table names yet]

## Reference Documents

**Primary workflow** — `docs/MULTI_AGENT_WORKFLOW.md` is the canonical pattern for shipping any non-trivial chunk of work in this project. PM context drives a phase loop (pivot review → brainstorm → plan + audit → worker dispatch → reconciliation → implementation → verification → smoke → ship), workers execute focused slices in their own sessions. Entry point: `/orchestrate`. Read the workflow doc before starting a phase.

**Project state** (populated during development) — see `/docs` folder:
- `APP_CONCEPT.md`: Problem statement, users, use cases, success criteria
- `SCOPE.md`: V1 scope, out-of-scope, known unknowns
- `KB_1_Architecture.md`: Architecture decisions and data model
- `KB_7_UI_Patterns.md`: Application patterns catalog — UI rules, reusable components, hooks, backend patterns, architecture decisions
- `KB_8_Current_State.md`: Current phase and active tracking
- `KB_9_Screen_Catalog.md`: Inventory of every screen, modal, and dialog — check before building new UI surfaces
- `CHANGELOG.md`: Running log of what was shipped and when — maintained by `/ship`
- `LESSONS.md`: Running log of gotchas and hard-won lessons — read before debugging or implementing in unfamiliar areas
- `PARKING_LOT.md`: Open observations / questions / considerations not yet committed to scope. `/orchestrate` reads it during pivot review; `/brainstorm` reads it as an overlap check before recommending an approach. Append-only by humans during work; agents move items to **Adopted into scope** or **Resolved / dropped** as they're acted on.
- `smoke-tests-pending.md`: **Single source of truth** for outstanding manual smoke tests with stable IDs. When asked about ship-readiness or "what's left to verify," point here — do not re-list tests in commits, PRs, or chat. Add new tests when shipping behavior automated coverage misses; collapse passed sections to one-liners after each release.

**Stack reference KBs** (vetted patterns — consult the index, then read only the relevant KB):
- `docs/Supabase Structure KBs/SB_KB_00_Index.md` — consult for any DB schema, RLS, multi-tenant, storage, realtime, or transactional-email work.
- `docs/UI-UX KBs/UI_KB_0_Index.md` — consult for any frontend, component, layout, motion, or accessibility work.
- `docs/Auth KBs/AUTH_KB_00_Index.md` — consult for login methods, custom JWT claims, MFA, session lifecycle, signup provisioning, or account management.
- `docs/Job KBs/JOB_KB_00_Index.md` — consult for outbox processing, scheduled jobs (pg_cron / Vercel Cron), queue tables, or long-running tasks (Trigger.dev / Inngest).
- `docs/Test KBs/TEST_KB_00_Index.md` — consult for test strategy, RLS testing with pgTAP, JS integration tests, component tests with MSW, Playwright E2E, or testing async patterns (Realtime, outbox, scheduled jobs).
- `docs/Form KBs/FORM_KB_00_Index.md` — consult for any form, validation schema, wizard, or input-handling work.
- `docs/Obs KBs/OBS_KB_00_Index.md` — consult for structured logging, error tracking, audit logs, performance monitoring, or alerting.
- `docs/Bill KBs/BILL_KB_00_Index.md` — consult for Stripe integration, subscription webhooks, plan gating, customer portal, trials, or billing lifecycle.
- `docs/AI KBs/AI_KB_00_Index.md` — consult for Claude API integration, prompt caching, RAG with pgvector + Voyage embeddings, streaming UI in Next.js, tool use, MCP servers, agents (Claude Agent SDK), or evals.

> **Note on KB numbering:** KB_1, KB_7, KB_8, KB_9 are template-provided. Numbers 2–6 are reserved for project-specific knowledge bases added during kickoff (architecture decisions, API contracts, data model, etc.). The `SB_KB_*` and `UI_KB_*` files in their own folders are stack-reference patterns and are separate from the project-state KBs.

## Current Phase
[TODO — Phase 1: Not Started]

## Patterns
[Empty — patterns emerge during development. Add here when established so all future sessions inherit them.]
- Spec docs: Live in `/docs/` with `*-spec.md` naming (e.g., `docs/feature-name-spec.md`). Created by `/brainstorm` or `/unify` output, consumed by `/plan-review` and `/implement`.

### Verification & safety disciplines (framework-provided)
- **Spec lockdown convention:** a spec doc becomes implementable only once `/plan-review` Step 6 writes a `> **Status: LOCKED YYYY-MM-DD**` header. Drafts without it are exploratory only; `/orchestrate` Phase 6 and `/implement` use the header to decide whether to dispatch.
- **Re-grounding + refutation of security-class audit findings:** every load-bearing security/RLS finding is re-derived against the **live SQL/policy this run** — never accepted on a spec's prose or a stale `file:line` citation — and an independent skeptic agent is spawned per security-class category to try to KILL it before the verdict. A Refutation Ledger supersedes the audit checkbox. Targets: `/audit-code`, `/audit-rls`, `/audit-infra`, `/audit-full`, and `/debug`'s three-strikes escape.
- **Ground-first anchor:** `/debug` quotes the literal primary artifact (error text, failing test, failing RLS query, network response) verbatim before hypothesizing; entry points derive from what the artifact *shows*, not what the description *implies*.
- **Smoke truth-gate:** a never-run / `Pending` / absent smoke in a diff's scope ships as `Unverified at ship: <id>` — never laundered into "Ship Complete" (`/ship` Step 3.5). A bare user "pass" is approval of code quality, not evidence of test execution.
- **Deferred-smoke debt rollup:** `/ship` Step 3.6 surfaces the accumulated deferred prod-smoke count at every phase boundary; no smoke crosses a boundary without a logged per-smoke user grant (kills the self-authorized "authorized posture" ratchet).
- **Service-boundary live-smoke gate:** any change touching auth / email→delivery / webhooks / external-API or payment round-trips needs a `live-required` end-to-end smoke before prod exposure — unit/typecheck/pgTAP green is explicitly **not** sufficient.
- **Fail-loud-or-closed (reference):** the defensive-write rule lives in `docs/Obs KBs/OBS_KB_5_Defensive_Writes.md` (Primitive 0 — close the capability; Primitive 9 — fail loud or fail closed, never `catch → log → continue`). Reference KB, not an audit acceptance gate.

## Preferences
[TODO — populate during /kickoff with working style and communication preferences]

## Custom Commands
All commands live in `.claude/commands/`. On a fresh clone, run `/preflight` then `/kickoff` before anything else. To write or edit a command, follow `docs/AUTHORING_COMMANDS.md` (conventions for descriptions, frontmatter, naming, and discipline commands).

### Orchestrators
| Command | Purpose |
|---------|---------|
| `/preflight` | One-time setup — records agent + OS in CLAUDE.md, verifies commands are project-local. Run on every fresh clone. |
| `/kickoff` | Discovery session for **greenfield** projects — run after `/preflight` on a new repo |
| `/adopt` | Discovery session for **existing** projects — populate KBs from observation, audit existing user KBs, merge CLAUDE.md. Run after installer + `/preflight`. |
| `/update-framework` | Pull canonical framework updates with per-file review and assisted merge for customizations |
| `/orchestrate` | PM phase loop — pivot → brainstorm → plan + audit → workers → reconcile → implement → smoke → ship. See `docs/MULTI_AGENT_WORKFLOW.md`. |
| `/audit-full` | Full security audit (code + DB access + infrastructure) in parallel |

### Planning & Review
| Command | Purpose |
|---------|---------|
| `/brainstorm` | Deep codebase research before committing to an approach |
| `/research` | Deep web research with synthesized report saved to `.research/` |
| `/investigate` | Deep exploration — trace data flow, find all usages |
| `/plan` | Create an implementation plan from investigation findings |
| `/plan-review` | Gap analysis on a spec doc before implementing |

### Implementation
| Command | Purpose |
|---------|---------|
| `/implement` | Execute a validated plan (parallel agents + post-batch audit) |
| `/debug` | Diagnose and fix a bug — root-cause investigation before code changes |
| `/unify` | Find duplicate/similar components and design a unified replacement |
| `/ship` | Update KBs, write changelog entry, commit, push |
| `/changelog` | Generate or update CHANGELOG.md from git history |

### Auditing
| Command | Purpose |
|---------|---------|
| `/audit-code` | Review code/plans for elegance, reuse, anti-patterns, security |
| `/audit-rls` | Scan DB access policies for security gaps (SQL databases) |
| `/audit-infra` | Audit infrastructure — headers, dependencies, environment, CORS |

### Database
| Command | Purpose |
|---------|---------|
| `/gen-migration` | Generate database migrations (SQL databases) |
| `/db-push` | Validate (dry-run + RLS audit), push, and regen types for a migration |

### Generators
| Command | Purpose |
|---------|---------|
| `/gen-test` | Generate tests following project patterns |
| `/gen-component` | Generate UI components |
| `/visualize` | Generate ASCII diagrams |
| `/update-kb` | Update knowledge base documents |

## KB Maintenance
- Completed phases: collapse to 2–3 line summaries. Full history lives in git.
- KB_8 session notes: only for active blockers or cross-session context. Clear after resolution.
- Changelog: one-liner entries only.
- Always update CLAUDE.md phase status when updating other KBs.

## DO NOT
[Empty — add hard constraints as they're discovered during development]
