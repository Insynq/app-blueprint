# App Blueprint

A Claude Code framework built around a methodology, not scaffolding. Adopt it into a new project (greenfield) or an existing one — same toolkit either way.

> Built and maintained by [Insynq](https://insynqk.com). Source: [github.com/Insynq/app-blueprint](https://github.com/Insynq/app-blueprint).

## Philosophy

The most expensive mistakes in software happen when you build the wrong thing with confidence. This framework enforces a discovery-first workflow that forces clarity before any code is written, then a multi-agent PM/worker phase loop that keeps complexity manageable as the project grows.

**The greenfield sequence:**
```
install → /preflight → /kickoff → /orchestrate (per phase) → /ship
```

**The existing-repo sequence:**
```
install → /preflight → /adopt → /orchestrate (per phase) → /ship
```

Updates ship via `/update-framework` — pull canonical changes with per-file review and assisted merge for any customizations you've made.

## Getting Started

### 1. Install (existing or new project)

From inside the project directory you want to install into:

```bash
npx @insynq/app-blueprint init
```

The installer:

- Refuses to run on a dirty git working tree (so changes are reviewable)
- Asks before overwriting any file you've already authored
- Stages all downloads in `./.framework-install-staging/` and only commits to disk after every file succeeds
- Stamps `.framework-version` at the repo root for `/update-framework` to use later
- Prints clear next steps when done

If your repo isn't a git repo, the installer offers to `git init` for you. Recovery from any install issue is a `git diff` away.

### 2. Open in your editor with an AI agent

Open the folder in VS Code (or your editor of choice). Any of these agents work: Claude Code, Codex, Cursor, Aider, Continue, Cline.

### 3. Run preflight

A one-time, sub-minute setup that records which agent + OS you're on into `CLAUDE.md` so future sessions don't have to re-figure it out, and confirms your project-level commands aren't being shadowed by user-global ones.

- **Claude Code:** type `/preflight`
- **Other agents:** paste *"Read and follow the instructions in `.claude/commands/preflight.md`"*

### 4. Run kickoff *(greenfield)* OR adopt *(existing repo)*

**Greenfield (`/kickoff`):** Discovery session that defines your app concept, scope, and architecture from scratch.

**Existing repo (`/adopt`):** Reads your existing project, drafts proposed populations for project-state KBs (architecture, UI patterns, screen catalog), audits any existing user KBs against current code for stale references, and assists merging an existing CLAUDE.md if you have one. Always shows drafts before writing — never silently overwrites your content.

```bash
# greenfield
/kickoff

# existing repo
/adopt
```

`/adopt` has a `--minimal` flag for users who just want commands installed without the discovery flow.

> **Note for non-Claude-Code agents:** The `.md` files in `.claude/commands/` are instruction documents, not commands you need to install. When the user types `/<name>`, just read the corresponding file and follow its steps inline. Don't copy them anywhere global.

## Multi-Agent Workflow (PM / Worker)

This framework is built around a PM/worker phase loop driven by `/orchestrate`. One PM context window holds the strategic view; workers execute focused slices in their own contexts (subagents, or separate Claude Code sessions for context-heavy work).

The loop walks 10 phases per piece of work: pivot review → brainstorm → holistic plan + audit-code → worker dispatch (granular audit round) → reconciliation → worker dispatch (implementation round) → PM verification + integration → smoke handoff → ship.

Worker plan docs are single living artifacts that PM and worker both write to — no handoff drift. See [`docs/MULTI_AGENT_WORKFLOW.md`](docs/MULTI_AGENT_WORKFLOW.md) for the full methodology.

## Command Library

### Orchestrators
| Command | Purpose |
|---------|---------|
| `/preflight` | One-time per clone — captures agent + OS into CLAUDE.md, verifies commands are project-local |
| `/kickoff` | Discovery session — **greenfield** projects |
| `/adopt` | Discovery session — **existing** repos. Inventories code, drafts KBs, audits existing user KBs, merges CLAUDE.md |
| `/update-framework` | Pull canonical framework updates with per-file review and assisted merge |
| `/orchestrate` | PM phase loop — pivot → brainstorm → plan + audit → workers → reconcile → implement → smoke → ship |
| `/audit-full` | Full security audit (code + database + infrastructure) in parallel |

### Planning & Review
| Command | Purpose |
|---------|---------|
| `/brainstorm` | Deep research + options before committing to an approach |
| `/research` | Deep web research with synthesized report saved to `.research/` |
| `/investigate` | Deep codebase exploration — trace data flows, find all usages |
| `/plan` | Create implementation plan from investigation findings |
| `/plan-review` | Gap analysis on a spec doc before implementing |

### Implementation
| Command | Purpose |
|---------|---------|
| `/implement` | Execute a validated plan (parallel agents + post-batch audit) |
| `/debug` | Diagnose a bug — characterize symptom, investigate, form hypothesis, confirm before fixing |
| `/unify` | Consolidate duplicate/similar components into one normalized type with role/state variants |
| `/ship` | Update KBs, commit, push |
| `/changelog` | Generate or update CHANGELOG.md from git history |

### Auditing
| Command | Purpose |
|---------|---------|
| `/audit-code` | Review code/plans for elegance, reuse, anti-patterns, security |
| `/audit-rls` | Database access control audit (SQL databases with row-level security) |
| `/audit-infra` | Infrastructure security — headers, dependencies, env vars, storage |

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
| `/visualize` | Generate ASCII diagrams (architecture, data flows, UI layouts) |
| `/update-kb` | Update knowledge base documents without committing |

## Updating

When canonical ships a new version, run from your project directory:

```bash
/update-framework
```

The command:

- Fetches canonical at install-version + target-version (immutable GitHub release tarballs, not raw URLs)
- Detects which framework files you've customized (compares local against canonical-at-install-version)
- Presents a four-category review: 🟥 files you customized (decision required), 🟢 unchanged locally (safe to apply), 🟡 new from canonical (consider), 🔵 deprecated (migration notes)
- For customized files, offers per-file: skip (keep yours), overwrite (with backup), or three-way merge via `git merge-file`
- Backs up to `.framework-backup/[file]@[old-version]` before any write
- Refuses downgrades by default; `--allow-downgrade` for legitimate rollback

Pass `--dry-run` to see the four-category report without writing anything. Pass `--target-version=0.2.0` to pin to a specific version.

## Security Assumptions (V1)

The npx installer and `/update-framework` operate under these assumptions, documented so you know what you're trusting:

- The `@insynq` npm scope is secure (signed packages deferred to V2)
- The canonical GitHub repo at `Insynq/app-blueprint` is not compromised at install/update time
- Networks are not actively hostile (no MITM verification — but installer prints SHA256 of the downloaded tarball pre-extraction so you can verify if you choose)
- The canonical repo is **public** in V1 (private-repo support deferred to V2)
- Windows-without-WSL is **not supported** in V1 (`/update-framework` shells out to `tar`); WSL or Mac/Linux only

## What Adopt Produces (Existing Repos)

| File | Auto-derived | User-confirmed | Left as TODO |
|------|------|------|------|
| `CLAUDE.md` | Tech stack, build commands | Project overview, current phase | Roles, preferences (judgment-required) |
| `docs/KB_1_Architecture.md` | Stack, patterns, deployment, env vars | Architecture decisions | Open questions |
| `docs/KB_7_UI_Patterns.md` | Component structure observations | — | Patterns library entries |
| `docs/KB_9_Screen_Catalog.md` | Routes / pages from disk | — | Screen-by-screen detail |
| `docs/APP_CONCEPT.md` | — | — | Always user-authored (kickoff-style mini-session optional) |
| `docs/SCOPE.md` | — | — | Same |
| `docs/KB_8_Current_State.md` | — | — | User-authored |

`/adopt` always shows drafts before writing project content. The auto-populate is just to seed the draft, not to ship final content.

## Knowledge Base Conventions

| File | Contains |
|------|---------|
| `docs/APP_CONCEPT.md` | Problem, users, use cases |
| `docs/SCOPE.md` | V1 scope, out-of-scope, known unknowns |
| `docs/KB_1_Architecture.md` | Architecture decisions, tech stack, data model |
| `docs/KB_7_UI_Patterns.md` | UI patterns, component conventions, design decisions |
| `docs/KB_8_Current_State.md` | Active phase, session notes, changelog |
| `docs/KB_9_Screen_Catalog.md` | Inventory of every screen, modal, dialog |

**Maintenance rules:**
- Completed phases: collapse to 2–3 line summaries. Full history in git.
- KB_8 session notes: only for active blockers. Clear after resolution.
- Changelog: one-liner entries only.
- Always update `CLAUDE.md` phase status when updating KBs.

## What Framework Owns vs. What You Own

The `.framework-manifest.json` at canonical declares this explicitly. Five categories:

- **`framework-managed`** — `.claude/commands/`, stack-reference KB folders (Supabase, UI-UX, Auth, AI, Bill, Form, Job, Obs, Test), `MULTI_AGENT_WORKFLOW.md`, `KB_INDEX.md`. These get refreshed on `/update-framework`.
- **`hybrid`** — `CLAUDE.md`, `KB_1`, `KB_7`, `KB_8`, `KB_9`, `.claude/settings.json`. Framework provides scaffolding; you fill content. `/update-framework` uses three-way merge for these.
- **`project-owned`** — `APP_CONCEPT.md`, `SCOPE.md`, `CHANGELOG.md`, `LESSONS.md`, `smoke-tests-pending.md`, `docs/plans/`, `.claude/memory/MEMORY.md`. Never touched by installer or updater.
- **`installer_generated`** — `.framework-version`. Created by installer.
- **`excluded`** — `README.md`, `LICENSE`, `CONTRIBUTING.md`, `.gitignore`, `.vscode/`, `audits/`. Framework artifacts that don't ship to adopters.

If `/update-framework` finds a file in canonical not in the manifest, it surfaces it for your decision rather than installing silently.

## Autonomy contract

By default, the framework allows the agent to edit files, write code, run installs/builds, and stage commits without prompting. The agent pauses for approval on:

- git commit, push, reset, rebase, checkout, merge, tag
- npm/pnpm publish
- rm -rf
- Supabase migrations and Edge Function deploys (db push, db reset, migration up/down, functions deploy)
- Vercel deploys, env mutations, domain changes, rollbacks
- sudo and any destructive or shared-state operation

Override locally in `.claude/settings.local.json` (gitignored, per-developer) or modify `.claude/settings.json` directly if the change should ship to every adopter on the next `/update-framework` pull.

## Stack Agnosticism

This framework is deliberately stack-agnostic. `/kickoff` and `/adopt` ask (or observe) your tech stack and populate `CLAUDE.md` accordingly. All commands read `CLAUDE.md` for project context rather than making assumptions.

Some commands have stack-specific sections:
- `/audit-rls`, `/gen-migration`, `/db-push` — SQL databases with row-level security (e.g., Supabase, PostgreSQL)
- `/audit-infra` — reads CLAUDE.md to understand your deployment stack

These are labeled clearly and can be skipped when they don't apply.

## Who This Is For

Anyone building software who wants to work systematically with Claude Code. The framework provides the methodology and command library. You bring the idea and tech stack choices.

Especially valuable for:
- Solo builders who want PM/worker rigor without hiring a team
- Existing projects that have grown organically and need methodology imposed gently
- Teams adopting Claude Code who want a shared workflow vocabulary
- Projects that span multiple phases over weeks/months and need cross-session continuity

---

**App Blueprint** is by [Insynq](https://insynqk.com) — operations-focused software design. Found this useful? A star on the [repo](https://github.com/Insynq/app-blueprint) helps others discover it.
