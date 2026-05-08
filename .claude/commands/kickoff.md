---
description: Guided discovery session — defines your app concept, scope, and architecture before any code is written
---

# Kickoff — App Discovery & Foundation Setup

**This is a conversation command.** No code gets written until we've worked through the discovery together. The files produced at the end become the indexed foundation every future Claude session reads.

**Prerequisite:** `/preflight` should have been run first — it captures which agent and OS the project is being worked on with. Before starting, check whether `CLAUDE.md` has a populated `## Environment` section (real values, not `[TODO]`). If not, tell the user: "Run `/preflight` first, then come back to `/kickoff`." Don't proceed until preflight has run.

**If you want to skip a phase or already have answers ready**, say "skip" or paste your answers directly. Kickoff adapts to what you already know.

**If the idea isn't fully formed yet**, that's okay. We can do a shorter "concept sketch" session: just describe the problem you're trying to solve and the type of person experiencing it. Everything else can come later.

## What Kickoff Produces

| File | Purpose |
|------|---------|
| `docs/APP_CONCEPT.md` | Problem statement, users, use cases, success criteria |
| `docs/SCOPE.md` | V1 boundaries, explicit out-of-scope, known unknowns |
| `CLAUDE.md` | Tech stack, roles, entities, patterns — populated for this project |
| `docs/KB_1_Architecture.md` | Architecture decisions and data model draft |
| `docs/KB_8_Current_State.md` | Phase tracker (starts at Phase 1: not started) |
| `.claude/memory/project_concept.md` | Project concept seed for future sessions |
| `.claude/memory/project_preferences.md` | Working style seed for future sessions |

The template also ships `docs/smoke-tests-pending.md` (empty catalog for tracking outstanding manual smoke tests with stable IDs) and `.github/pull_request_template.md`. You don't need to edit these during kickoff — the catalog is filled in as you ship features that need manual verification.

## Why Discovery Before Code

The most expensive mistakes happen when you build the wrong thing with confidence. This session is designed to:
1. Force clarity on the problem before the solution
2. Establish the big picture before getting into details
3. Define V1 scope explicitly (what's IN and what's explicitly OUT)
4. Create a foundation that every future Claude session reads without needing re-explanation

## Instructions for Claude

Work through the 5 phases below **in order**. Follow these rules:

1. **Ask one question at a time.** Wait for the answer before continuing.
2. **Build on what you've learned.** Don't ask something the user already answered. Reference their earlier answers in follow-ups.
3. **At the end of each phase**, briefly summarize what you've learned. Give the user a chance to correct anything before moving on.
4. **Be a thinking partner, not a form.** Push back gently if answers are vague, solution-focused instead of problem-focused, or if V1 scope seems too large.
5. **Problem-first framing.** The first question is about the problem, not the solution. Redirect if the user jumps to features.
6. **Push back on lazy or evasive answers.** If the user says variants of "I don't care, just do it," "surprise me," "you decide," "whatever you think is best," "just make something cool," or otherwise tries to outsource the thinking — STOP and push back. Don't steamroll past it. Sample script:

   > "I'm happy to make recommendations once we have something to work with, but I need a real signal from you on the problem and the user. Those are choices only you can make. If I just spin up something random, I'll burn through your time and tokens producing work that probably won't fit what you actually want. Even a rough sketch is enough — what's pulling you toward this project? What pain were you noticing when the idea showed up?"

   Don't be apologetic about asking. The whole point of this session is to extract real intent — every downstream command produces lower-quality work without it. Hold the line firmly but warmly: this is care, not gatekeeping.

After all 6 rules and 5 phases, present a synthesis for approval, then write the files.

---

## Step 0 — Deliver the Welcome

Before asking any discovery questions, deliver this welcome to the user. Reproduce it largely verbatim — light tone-matching is fine, but don't paraphrase away the structure or the honesty about the framework's bias. End with the "Ready?" prompt and **wait** for confirmation before starting Phase 1.

```
Welcome to app-blueprint — a project template built around a methodology, not scaffolding. It's by Insynq (https://github.com/Insynq/claude-app-blueprint), designed to help you build production applications systematically with AI coding agents.

**The philosophy:** clarity before code. The most expensive software mistakes happen when you build the wrong thing with confidence. Every command in this template enforces a discovery-first workflow — kickoff → brainstorm → plan-review → implement → ship — plus support commands for debugging, security audits, and database work.

**Honest about the bias:** the methodology is universal, but the patterns library skews toward operational web apps and SaaS — auth, RBAC, billing, forms, dashboards, RLS, real-time, that shape of thing. If you're building a game, a library, a CLI tool, or research code, the methodology still applies but several stack-reference KBs and commands (like /audit-rls, /gen-migration) won't be relevant. I'll adapt as we go and skip what doesn't fit.

**What's already on disk:**
- 25 commands in `.claude/commands/` — kickoff, adopt, brainstorm, plan, implement, ship, debug, audits, generators, update-framework
- Stack-reference KBs in `/docs/` covering Supabase, Auth, UI/UX, Forms, Jobs, Tests, Observability, Billing, AI integration
- A persistent memory directory at `.claude/memory/` so context carries across sessions

**What kickoff does next:** a 5-phase guided discovery (~10–15 minutes) capturing the problem, what the app does, V1 scope, tech stack, and working style. I'll write seven foundation files at the end that every future session reads.

**Tip — voice input:** if typing feels slow, click the microphone icon in the VS Code chat panel and just talk. The transcription is surprisingly accurate, you can edit it before sending, and it dramatically speeds up discovery sessions like this one. Especially helpful for the open-ended "describe the problem" questions where typing a paragraph feels like a chore.

One question at a time. If you have answers ready, paste them and we'll skip ahead. Push back if anything feels off — this is a conversation, not a form. And if you find yourself tempted to say "just pick something for me," resist — I'd rather take an extra minute now to get your real input than spin up the wrong thing fast.

Ready? Phase 1 starts with the problem you're trying to solve.
```

After the user confirms (any affirmative — "yes", "go", "ready", or just answering the first Phase 1 question directly), proceed to Phase 1.

---

## Phase 1 — The Problem

**Goal:** Understand what problem this app solves and why it matters.

Ask in sequence (one at a time, wait for each answer):

1. "What problem are you trying to solve? Describe it the way someone experiencing it would — not the solution, just the pain or gap."

2. "Who specifically has this problem? Describe the person in concrete terms — their role, their day-to-day, what they're doing when they hit this friction."

3. "How do they currently deal with it? Other tools, manual workarounds, or nothing at all?"

4. "Why does the current approach fall short?"

5. "Why is now the right time to build this?"

6. "Is this a solo project or a team? (This affects architecture decisions around consistency enforcement and code review practices.)"

**Phase 1 close:** Summarize the problem and user in 2–3 sentences. Confirm with the user before moving on. If the description is vague or still solution-focused, ask one more clarifying question before moving on.

---

## Phase 2 — The App

**Goal:** Understand what the app does at a high level — without diving into feature lists.

Ask in sequence:

1. "What kind of project is this? Pick the closest match — I'll adapt the rest of kickoff to fit:
   - **Operational web app / SaaS** — auth, dashboards, multi-user, billing, the things this template is most opinionated about
   - **Internal tool or admin app** — ops dashboard, workflow tool, often single-tenant
   - **Marketing site / blog** — mostly content, light interactivity
   - **API or library** — programmatic interface, no UI
   - **CLI tool** — terminal application
   - **Game** — web, mobile, or native
   - **Research / data pipeline** — notebooks, ETL, model training
   - **Other** — describe in your own words"

   **Adapt downstream based on the answer:**

   - **Operational web app / SaaS / Internal tool / Marketing site** — these are "UI applications." Continue with questions 2–5 as written below. Phase 4's pattern checklist applies in full.
   - **API / library / CLI tool** — these are "non-UI projects." Replace question 3 with: "What is the primary entry point — API endpoint, CLI command, or event trigger? Describe the core operation from input to output." Replace question 4 (mobile/PWA) with: "How will this be deployed and consumed — HTTP API, CLI binary, SDK, scheduled job?" Skip questions about screens, navigation, or user journeys. Note for later: KB_7 (UI Patterns) is not applicable.
   - **Game** — replace question 3 with: "Walk me through one complete play session — start screen → core loop → end state. What's the moment-to-moment gameplay?" Replace question 4 with: "What platforms are you targeting — web (browser), mobile (iOS/Android), desktop (Windows/Mac/Linux), console?" Note for later: many stack-reference KBs (Auth, Billing, RLS, Forms, Obs as written) won't apply directly. Phase 4's pattern checklist will need to be replaced with game-specific concerns (engine, asset pipeline, save state, multiplayer, monetization model, leaderboards).
   - **Research / data pipeline** — replace question 3 with: "What's the data flow — input source → transformations → output? Describe one end-to-end run." Replace question 4 with: "How is this run — interactive notebook, scheduled job, on-demand script, served as an API?" Note for later: only Obs and Test KBs likely apply; UI/Auth/Billing/Forms KBs do not.
   - **Other** — ask a clarifying follow-up to figure out the closest analog above, then adapt.

2. "What does your app do to address that problem? Give me the one-sentence elevator pitch."

3. *(UI apps)* "Walk me through the happy path — what does a user actually do from start to finish, step by step?"
   *(Non-UI)* "What is the primary entry point — API endpoint, CLI command, or event trigger? Describe the core operation from input to output."

4. "Are there multiple types of users (or consumers) who interact with this differently? If so, who are they and what does each one do?"

5. "What's the single most important thing this app must do to be worth building?"

**Phase 2 close:** Summarize the app and its users. Confirm before moving on.

---

## Phase 3 — V1 Scope

**Goal:** Establish clear, explicit boundaries for the first version. This is the most important phase for preventing scope creep later.

Ask in sequence:

1. "What does 'done' look like for V1? What would make you confident enough to put this in front of real users?"

2. "What's explicitly NOT in V1? I want a deliberate list — not 'maybe later,' but things you've consciously decided to defer."

3. "What are the biggest unknowns right now? Things you haven't figured out yet."

4. "Is there a deadline or external pressure driving V1?"

**Coaching note:** Push back if V1 contains more than 2–3 distinct user workflows. A red flag example: "I want registration, a dashboard, an admin panel, reporting, and integrations" as V1. Ask: "Which ONE workflow is the core problem — the one where, if it worked perfectly, you'd consider V1 a success?" Everything else is V2.

**Phase 3 close:** Summarize what's in scope and what's out. Confirm before moving on.

---

## Phase 4 — Technical Foundation

**Goal:** Establish the tech stack and identify which patterns the app actually needs.

Ask in sequence:

1. "What's your tech stack? Frontend framework, backend/database, hosting, auth provider. If you're not sure yet, I can suggest options based on what you've described."

   **If unsure:** "I can suggest options based on your project type, team size, and hosting preference. Just say 'suggest' and I'll recommend 2–3 options with trade-offs."

2. **For operational web apps / SaaS / internal tools / marketing sites — ask the full pattern checklist:**

   "Which of these does your app need? Go through each one:
   - User authentication and accounts
   - Role-based permissions (different users see and do different things)
   - Payments or subscriptions
   - File uploads or storage
   - Real-time updates (live data, notifications, chat)
   - External API integrations
   - Email or SMS notifications
   - Admin or operations dashboard
   - *(UI apps only)* Mobile-friendly or PWA
   - *(Non-UI apps only)* How will this be deployed and consumed — HTTP API, CLI binary, SDK, scheduled job?"

   **For games — replace with a game-shaped checklist:**

   "Which of these does your game need?
   - Game engine or framework (Unity, Godot, Phaser, custom, etc.)
   - Asset pipeline (sprites, models, audio, fonts)
   - Save state / persistence (local, cloud, both)
   - Multiplayer netcode (real-time, turn-based, asynchronous)
   - Account system (login, friends list, profiles)
   - Monetization (one-time purchase, IAP, ads, subscription, free)
   - Leaderboards or achievements
   - Analytics or telemetry
   - Localization
   - Platform-specific requirements (App Store, Steam, console submission)"

   **For research / data pipelines — replace with:**

   "Which of these does your pipeline need?
   - Data sources and ingest mechanism
   - Storage layer (data lake, warehouse, blob storage, local files)
   - Compute (notebook, scheduled job, cluster, serverless)
   - Model training or inference
   - Output destination (dashboard, API, file export, downstream pipeline)
   - Reproducibility (version pinning, environment lock, data lineage)
   - Monitoring and alerting on data quality"

3. "Where will this be hosted? (Vercel, Netlify, AWS, Railway, self-hosted, etc.)"

4. "What CI/CD approach? (GitHub Actions, manual deploy, platform auto-deploy)"

5. "What environment variables will be required at launch? List them now if you know them."

6. "Any external services this app depends on at launch? (auth provider, DB, email, storage, third-party APIs)"

7. "Will anyone else be working on this codebase? If so, what's their experience level?"

**Phase 4 close:** Summarize the stack, required patterns, and deployment setup. Confirm before moving on.

---

## Local-Dev Tooling Recommendations

**Goal:** Surface high-leverage CLI tools and local-dev dependencies that measurably speed up iteration for the patterns this project will use.

Present this between Phase 4 and Phase 5. Frame it as: "Before we get to working style, here are some tools that will measurably speed up dev for what you're building. These are recommendations, not mandates — install what fits your stack, skip what doesn't."

### Always-recommend (Tier 1 — broadly applicable, low setup cost)

Filter by what the user said in Phase 4 — only present items relevant to their stack.

- **Docker Desktop** — Foundation for local Supabase (`supabase start`) and any service that's easier to run containerized. The killer feature for AI-assisted development: Claude can set up DB state directly (seed users, create test fixtures, simulate edge cases) without you clicking through the UI. Removes the human bottleneck on smoke testing. Recommend the desktop app over CLI-only, especially when juggling multiple projects.
- **Supabase CLI** — Migrations, type generation, edge function deploys, local dev DB. Required for most workflows in this template if Supabase is in the stack.
- **Vercel CLI** — `vercel env pull` syncs prod/preview env vars to `.env.local` (kills env-drift bugs), `vercel dev` mirrors edge runtime locally, `vercel logs` tails prod from the terminal. Recommend if hosting is Vercel.
- **GitHub CLI (`gh`)** — Used by `/ship`, but worth installing for `gh run watch`, `gh pr checks`, `gh pr view --web`. Lets agents act on PRs end-to-end.
- **pnpm** (or bun) — Faster installs, shared package store across projects. Compounds across the multi-repo workflows this template encourages.
- **direnv** — Auto-loads `.env` per directory. Eliminates "wrong env vars active" bugs.

### Conditionally-recommend (Tier 2 — only present if Phase 4 indicated relevance)

- **Stripe CLI** *(if billing is in scope)* — `stripe listen` forwards webhook events to localhost with auto-rotated signing secrets; `stripe trigger` fires test events on demand. Pair with test-mode keys. Turns billing dev from painful to fine. Full setup details live in `docs/Bill KBs/BILL_KB_00_Index.md`.
- **Playwright with `npx playwright codegen`** *(if E2E tests are in scope)* — record a user flow in a browser, get a working test out the other end. The codegen makes Playwright cheap enough to use during dev, not just at the end.
- **mkcert + cloudflared (or ngrok)** *(if integrating OAuth callbacks, Twilio, Slack, or any third-party that can't reach localhost)* — local HTTPS + public tunnels. Not needed for Stripe (Stripe CLI handles its own tunneling).
- **pgcli** *(if iterating on ad-hoc SQL during debugging)* — better Postgres REPL than the Studio UI: autocomplete on schemas/columns, syntax highlighting.
- **act** *(if iterating on GitHub Actions workflows)* — runs GitHub Actions locally in Docker. Saves push-CI-fail-fix-push cycles.

### KB-specific tools (Tier 3)

If the user's stack pulls in OBS, JOB, or BILL KB families later, additional CLIs (Sentry CLI, Inngest CLI, Trigger.dev CLI) are surfaced in those KBs' index files. No need to set them up at kickoff time.

### How to present this

After listing the tier 1 items relevant to their stack and any tier 2 items that match their answers, ask: **"Want a one-line `brew install` script for the tier 1 tools that fit your stack? Or are you good to install as you go?"**

If yes, generate a platform-specific install command — `brew install` for macOS (the OS comes from `/preflight`'s populated `## Environment` block in `CLAUDE.md`), `apt`/`dnf` equivalents for Linux, `winget`/`choco` for Windows. Show the script for the user to run; do not execute it for them.

If "good to go" or "skip", just move to Phase 5.

---

## Phase 5 — Working Style

**Goal:** Seed project memory so future Claude sessions don't need to re-establish how to work with this person.

Ask in sequence:

1. "How do you like to work with Claude? Terse and direct? Verbose with context? As a senior engineer? As a product thinking partner?"

2. "Any strong opinions about code, architecture, or approaches you want to avoid?"

3. "How much autonomy should Claude take vs. checking with you? Decide independently when obvious? Always confirm before changes? Something in between? ('Decide and tell me' vs. 'always show options' vs. a mix.)"

4. "When speed and quality conflict, which wins? For example: 'ship fast, refactor later' vs. 'get it right the first time.'"

5. "What should Claude always ask you before doing? For example: 'ask before any schema change', 'ask before deleting anything', 'ask before touching auth.' Or nothing — full autonomy is fine too."

**Phase 5 close:** Summarize preferences. Confirm before writing files.

---

## Synthesis & File Writing

### Step 1: Present a synthesis

Write a 3–4 paragraph summary covering: the problem and user, what the app does (including primary value driver and first target user), V1 scope, tech stack and deployment setup, and working style preferences.

Ask: **"Before I write the files — does this accurately capture what you want to build?"**

Wait for confirmation. Revise if needed before proceeding.

---

### Step 2: Write all files

After confirmation, write every file below.

---

#### `docs/APP_CONCEPT.md`

```markdown
# App Concept: [App Name]

## The Problem
[1–2 paragraphs: what the problem is, who experiences it, why current approaches fall short]

## The Solution
[What this app does — elevator pitch + happy path walkthrough]

## Users

### [User Type 1]
[Role, goals, key actions in the app]

### [User Type 2 — if applicable]
[Role, goals, key actions in the app]

## Primary Value Driver
[The one thing that makes this worth building — the core insight, not a feature list]

## First Target User
[Which user type V1 is optimized for, and why]

## Success Criteria
[What does a successful V1 look like? One measurable outcome that would validate the concept, plus any additional criteria]

## Why Now
[The timing rationale]
```

---

#### `docs/SCOPE.md`

```markdown
# V1 Scope

## In Scope
- [Item]
- [Item]

## Explicitly Out of Scope (V1)
- [Item — with brief reason why it's deferred]
- [Item]

## Known Unknowns
- [Thing that isn't decided yet]
- [Risk or open question]

## Definition of Done
[The specific criteria that signal V1 is ready for real users]

## Deadline / External Driver
[If applicable, otherwise: None identified]
```

---

#### `CLAUDE.md`

**Before writing:** Read the existing `CLAUDE.md`. If it contains an `## Environment` section with real values (populated by `/preflight`), copy those exact lines and place them in the new file directly under `# Project: [App Name]`, above `## Overview`. Do not overwrite or regenerate the Environment block — it belongs to preflight, not kickoff.

Populate the rest of this structure with the project's specifics from the discovery session:

```markdown
# Project: [App Name]

[Preserved `## Environment` block from preflight goes here, if present]

## Overview
[1–2 sentences: what this app does and for whom]

## Tech Stack
- [Frontend framework + key libraries]
- [Backend / database]
- [Auth]
- [Hosting]
- [Other services: payments, email, storage, etc.]

## Build Commands
- Type check: [e.g., npx tsc --noEmit]
- Dev server: [e.g., npm run dev]
- Build: [e.g., npm run build]

## Roles
[List user types and their hierarchy, if role-based permissions apply. Skip if single user type.]

## Core Entities
[List the main concepts the app manages — not table names yet, just domain concepts]
Examples:
- **Orders** — represent a customer purchase request
- **Vendors** — service providers who fulfill orders

## Reference Documents

**Project state** (populated during development) — see `/docs` folder:
- `APP_CONCEPT.md`: Problem statement, users, use cases, success criteria
- `SCOPE.md`: V1 scope, out-of-scope, known unknowns
- `KB_1_Architecture.md`: Architecture decisions and data model
- `KB_7_UI_Patterns.md`: UI patterns and component conventions
- `KB_8_Current_State.md`: Current phase and active tracking
- `smoke-tests-pending.md`: **Single source of truth** for outstanding manual smoke tests with stable IDs. When asked about ship-readiness or "what's left to verify," point here — do not re-list tests in commits, PRs, or chat.
- `MULTI_AGENT_WORKFLOW.md`: Optional methodology — PM + worker context-window pattern for multi-threaded work where the user stays in the strategic seat.

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

**Manual verification:**
- `docs/smoke-tests-pending.md` — single source of truth for outstanding manual smoke tests (stable IDs). When asked about ship-readiness or "what's left to verify," point here; do not re-list tests in commits or PRs.

## Current Phase
Phase 1 — [Name TBD] (Not Started)

## Patterns
[Leave empty — patterns emerge during development and get documented here]

## Preferences
[Populate from Phase 5: response style, autonomy level, things to avoid]

## Custom Commands
All commands live in `.claude/commands/`.

| Command | Purpose |
|---------|---------|
| `/kickoff` | Discovery session — run first on any new project |
| `/brainstorm` | Deep research before committing to an approach |
| `/orchestrate` | Full workflow — investigate → plan → implement |
| `/implement` | Execute a validated plan (parallel agents + post-batch audit) |
| `/plan-review` | Gap analysis on a spec doc before implementing |
| `/ship` | Update KBs, commit, push |
| `/audit-code` | Review code/plans for elegance, reuse, security |
| `/audit-full` | Full security audit (code + DB access + infrastructure) |
| `/gen-test` | Generate tests following project patterns |
| `/gen-migration` | Generate database migrations (SQL databases) |
| `/gen-component` | Generate UI components |
| `/visualize` | Generate ASCII diagrams |

## DO NOT
[Empty — add hard constraints as they're discovered during development]

---
*Built with [Insynq's Framework](https://github.com/Insynq/claude-app-blueprint) — a methodology-first project template for building applications with AI coding agents. Learn more at [insynqk.com](https://insynqk.com).*
```

---

#### `docs/KB_1_Architecture.md`

```markdown
# KB 1 — Architecture

## Overview
[Brief description of the overall architecture]

## Tech Stack
[Full details with versions where known]

## Patterns Needed
[From discovery: auth, payments, real-time, file storage, etc. — what the app actually requires]

## Data Model (Draft)
[High-level entities and their relationships — not a full schema yet, just the concepts and how they relate]

## Deployment & Infrastructure
- Hosting: [answer from Phase 4]
- CI/CD: [answer from Phase 4]
- Required env vars: [list from Phase 4 — add more as discovered during development]
- External dependencies: [list from Phase 4]

## Architecture Decisions
[Any decisions made during kickoff — leave empty if none yet]

## Open Questions
[Unresolved architecture questions to return to]
```

---

#### `docs/KB_8_Current_State.md`

```markdown
# KB 8 — Current State

## Active Phase
Phase 1 — [Name TBD] — NOT STARTED

## Session Notes
[Empty — populated during development for cross-session context. Clear after resolution.]

## Changelog
[Empty — one-liner entries added as phases complete]
```

---

#### `.claude/memory/project_concept.md`

```markdown
---
name: Project Concept
description: Core problem, users, and what this app does — seed for all future sessions
type: project
---

**[App Name]:** [One-sentence elevator pitch]

**Problem:** [One sentence]
**Primary user:** [One sentence — the user type V1 is optimized for, if multiple exist]
**Primary value driver:** [The one thing that makes this worth building — the core insight, not a feature list]
**First target user:** [Which user type to optimize V1 for, and why]
**V1 goal:** [One sentence defining done]
**Success metric for V1:** [One measurable outcome that would validate the concept]
**Why now:** [One sentence on timing]
```

---

#### `.claude/memory/project_preferences.md`

```markdown
---
name: Project Preferences
description: How the user prefers to work and communicate with Claude on this project
type: user
---

[Populate from Phase 5 answers]

**Communication style:** [Terse/verbose, engineer/partner, etc.]
**Autonomy level:** [Independent when obvious / always confirm / mixed — how much Claude decides vs. surfaces options]
**Trade-off preference:** [When speed and quality conflict, which wins? e.g., "ship fast, refactor later" vs. "get it right the first time"]
**Escalation threshold:** [What Claude must always ask before doing — e.g., "ask before any schema change", "ask before deleting anything", "ask before touching auth"]
**Code opinions:** [Any strong preferences about style or approach]
**Things to avoid:** [Specific patterns or behaviors the user doesn't want]
```

---

#### `.claude/memory/MEMORY.md`

Create this file (or append if it exists):

```markdown
# [App Name] — Session Memory

## Project
- [project_concept.md](project_concept.md) — [App Name]: problem, users, V1 goal
- [project_preferences.md](project_preferences.md) — Working style and communication preferences
```

---

### Step 3: Final message to user

After all files are written, send:

```
## Kickoff Complete

Your project foundation is set up:

- `docs/APP_CONCEPT.md` — problem, users, success criteria
- `docs/SCOPE.md` — V1 boundaries and known unknowns
- `CLAUDE.md` — project context for all future sessions
- `docs/KB_1_Architecture.md` — architecture starting point
- `docs/KB_8_Current_State.md` — phase tracker
- `.claude/memory/` — project and preference seeds

Every future Claude session in this project reads these files. Keep them updated as the project evolves — especially `KB_8_Current_State.md` (for active work) and `CLAUDE.md` (when patterns and constraints are discovered).

**Recommended next steps:**
1. Review the files — correct anything that doesn't feel right
2. `/brainstorm "what should Phase 1 focus on?"` to explore your first implementation approach
3. Or go straight to `/plan "Phase 1: [feature]"` if you already know what to build first
```
