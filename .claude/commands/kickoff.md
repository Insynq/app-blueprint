---
description: Guided discovery session — defines your app concept, scope, and architecture before any code is written
---

# Kickoff — App Discovery & Foundation Setup

**This is a conversation command.** No code gets written until we've worked through the discovery together. The files produced at the end become the indexed foundation every future Claude session reads.

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

After all 5 phases, present a synthesis for approval, then write the files.

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

1. "Is this a UI application (web app, mobile app, dashboard), or a non-UI project (API, CLI tool, internal service, library)?"

   **Branch based on answer:**

   - **UI application** — continue with questions 2–5 as written below.
   - **Non-UI project** — replace question 3 with: "What is the primary entry point — API endpoint, CLI command, or event trigger? Describe the core operation from input to output." Replace question 4 (mobile/PWA) with: "How will this be deployed and consumed — HTTP API, CLI binary, SDK, scheduled job?" Skip any further questions about screens, navigation, or user journeys. Note for later: non-UI project — KB_7 (UI Patterns) is not applicable.

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

2. "Which of these does your app need? Go through each one:
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

3. "Where will this be hosted? (Vercel, Netlify, AWS, Railway, self-hosted, etc.)"

4. "What CI/CD approach? (GitHub Actions, manual deploy, platform auto-deploy)"

5. "What environment variables will be required at launch? List them now if you know them."

6. "Any external services this app depends on at launch? (auth provider, DB, email, storage, third-party APIs)"

7. "Will anyone else be working on this codebase? If so, what's their experience level?"

**Phase 4 close:** Summarize the stack, required patterns, and deployment setup. Confirm before moving on.

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

Populate this structure with the project's specifics from the discovery session:

```markdown
# Project: [App Name]

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

**Stack reference KBs** (vetted patterns — consult the index, then read only the relevant KB):
- `docs/Supabase Structure KBs/SB_KB_00_Index.md` — consult for any DB schema, RLS, multi-tenant, storage, realtime, or transactional-email work.
- `docs/UI:UX KBs/UI_KB_0_Index.md` — consult for any frontend, component, layout, motion, or accessibility work.
- `docs/Auth KBs/AUTH_KB_00_Index.md` — consult for login methods, custom JWT claims, MFA, session lifecycle, signup provisioning, or account management.
- `docs/Job KBs/JOB_KB_00_Index.md` — consult for outbox processing, scheduled jobs (pg_cron / Vercel Cron), queue tables, or long-running tasks (Trigger.dev / Inngest).
- `docs/Test KBs/TEST_KB_00_Index.md` — consult for test strategy, RLS testing with pgTAP, JS integration tests, component tests with MSW, Playwright E2E, or testing async patterns (Realtime, outbox, scheduled jobs).

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
