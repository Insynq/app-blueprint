# Worker 3 — `/adopt` slash command

**Phase:** framework-distribution
**Status:** drafted

## Task

Author the `/adopt` slash command at `.claude/commands/adopt.md`. This is the *intelligent* second half of onboarding an existing repo into the framework. Adopters run it after the installer has dropped framework files in. `/adopt` reads their existing project state, drafts proposed populations for project-state KBs, audits any existing user KBs against current code, and assists merging an existing CLAUDE.md.

`/adopt` is to existing-repo onboarding what `/kickoff` is to greenfield onboarding.

## Files involved

- **CREATE:** `/.claude/commands/adopt.md` (the slash command definition)
- **READ for command-file convention:**
  - `.claude/commands/preflight.md` — how the existing onboarding command is structured
  - `.claude/commands/kickoff.md` — the greenfield equivalent of what `/adopt` does for existing repos
  - `.claude/commands/investigate.md` — patterns for codebase scanning (reuse for stale-reference detection)
  - 2-3 other commands to absorb the conventions
- **READ for content:** `docs/plans/framework-distribution/phase-plan.md` (sections: Brainstorm findings → /adopt; Sequencing → Worker 3) for full behavior spec
- **READ for dogfood thinking:** `CLAUDE.md` template, `docs/KB_1_Architecture.md`, `docs/KB_7_UI_Patterns.md`, `docs/KB_8_Current_State.md`, `docs/KB_9_Screen_Catalog.md` — understand what these look like fully populated so `/adopt` can draft them well

## Constraints / non-goals

### `/adopt` behavior

- **Auto-derive vs ask vs leave-blank discipline:**
  - Auto-populate (no user input): tech stack from `package.json`, build commands from `package.json` scripts, KB_1/KB_7/KB_9 drafts from folder structure
  - Ask user: project overview, current phase, scope, preferences
  - Leave as TODO: roles (often genuinely uncertain), preferences (workflow style), anything requiring judgment that isn't observable
- **Always show drafts before writing project content.** Never write KB content without user OK on the draft. The auto-populate is just to seed the draft, not to ship final content.
- **Existing-KB audit feature:**
  - For each user file matching `docs/KB_*.md` not in the framework set: read it, extract referenced symbols/file paths/hooks/component names, cross-reference against current code (use `/investigate`-style scanning), bucket as Current / Partially Stale / Mostly Stale / Orphaned, surface stale references with file:line.
  - **Reuse `/investigate` patterns** for the codebase scanning — don't reinvent.
  - Per-file triage: keep / update / archive / merge into framework KB. Always asks user explicitly per file.
- **Assisted merge of existing CLAUDE.md:**
  - **Always backup first** to `CLAUDE.md.pre-adopt-backup` before any merge work.
  - User's custom content takes priority on conflicts. Framework conventions (Custom Commands table, KB references) get inserted into appropriate sections without overwriting user content.
  - Show side-by-side draft to user; user approves, edits, or rejects.
- **`--minimal` flag:** skips the populate-KBs and audit-existing-KBs steps. For users who just want commands installed without the discovery flow.

### Out of scope

- **Don't modify the canonical `CLAUDE.md` template** (the one that ships with the framework) — Worker 3 only handles the user's local copy via merge.
- **Don't handle monorepo** (V2). If `/adopt` detects a monorepo, surface the limitation and ask the user to specify a single package.
- **Don't handle re-running `/adopt`** on already-adopted projects (V2). For V1, document the limitation in the command.
- **Don't author `/preflight` or `/kickoff` changes** — `/adopt` is a sibling command, not a replacement for those.

## Granular audit

**Status:** audited 2026-05-07. Findings organized by the questions in the dispatch prompt; cross-referenced to Worker 1's manifest schema (R17) and Worker 2's installer plan.

### F1. Command-file structure (frontmatter, args, dispatch mode)

**Frontmatter — verified by reading 4 commands.** Two patterns are in use:

- **`description`-only (orchestrators that run inline in user's session):** `kickoff.md:1-3`, `preflight.md:1-3`, `audit-full.md` (verify), `ship.md` (verify). No `arguments` block. Command body is read top-to-bottom and instructs the agent (sometimes the user) what to do.
- **`description` + `arguments` (commands that take parameters):** `investigate.md:1-10`, `brainstorm.md:1-7`, `gen-component.md:1-10`, `implement.md:1-10`, `update-kb.md:1-10`. Each has named, typed arguments with `required: true|false`.

**For `/adopt`:** use the **`description` + `arguments` pattern** with one optional flag — `minimal`. Concrete frontmatter:

```yaml
---
description: Existing-repo onboarding — populate KBs, audit existing docs, merge CLAUDE.md
arguments:
  - name: minimal
    description: Skip the populate-KBs and existing-KB-audit steps; only confirm framework files installed
    required: false
---
```

**No other args needed for V1.** The phase plan / dispatch prompt hint at supporting `--minimal` only. Reject scope-creep flags like `--target-package` (monorepo, V2), `--skip-merge` (use the merge UI instead), `--force` (refuse to bypass safety gates — there isn't a real use case).

**Dispatch mode — runs inline in user's session, not as subagent or `Skill` invocation.** Verified pattern by reading:

- `kickoff.md` is **inline** — it says "Work through the 5 phases below in order" and runs in the user's session as a guided conversation. No subagent dispatch.
- `preflight.md` is **inline** — same pattern; explicit "Instructions for the Agent" header.
- `investigate.md`, `brainstorm.md`, `implement.md` are **subagent dispatchers** — they spawn `Task` calls with `subagent_type` (`Explore` / `general-purpose`) and have a `## Subagent Prompt` section.

`/adopt` should run **inline like `/kickoff`** — it's a conversational, multi-step, user-approval-heavy flow. The user must see and approve drafts, audit results, and merges. A subagent can't do that interactively. Subagent dispatch is appropriate for read-only investigation phases (Step 3 below uses `Explore` for stale-reference detection); but the orchestrator itself is inline.

**Handlebars syntax — confirmed broken.** Verified at `implement.md:28-29, 74-83` and `investigate.md:28` — all use `{{#if}}` / `{{#unless}}` and per the dispatch prompt these "DO NOT WORK in Claude Code commands." The user's queued sidebar list (phase-plan.md:289) confirms this is a known bug. **`/adopt` must avoid Handlebars entirely.** Concrete: any conditional in the prompt body should be expressed as plain English ("If the user passed `--minimal`, skip steps 3–5") and use `$ARGUMENTS.minimal` literally where the value is read; the agent decides what to do based on a truthy/falsy check.

### F2. Auto-derivation logic (specific scanning, specific signals)

The phase plan says auto-derive: tech stack from `package.json`, build commands from scripts, KB drafts from folder structure. Concrete protocol:

#### F2a. Tech stack derivation

Read `package.json` if it exists. Map dependencies → stack labels using a deterministic table inside the command:

| Dependency signal | Stack label / KB hint |
|---|---|
| `next` | Next.js (App Router if `app/` dir exists, else Pages Router — check disk) |
| `react` (without `next`) | React (Vite if `vite.config.*` exists, CRA if `react-scripts`, else "React + custom") |
| `vue` / `nuxt` | Vue / Nuxt |
| `svelte` / `@sveltejs/kit` | Svelte / SvelteKit |
| `@supabase/supabase-js` or `supabase/config.toml` exists | Supabase (DB, auth, edge functions, storage) |
| `@clerk/nextjs` / `@auth/nextjs` / `next-auth` | Auth provider name |
| `stripe` / `@stripe/stripe-js` | Stripe billing |
| `tailwindcss` | Tailwind CSS |
| `@radix-ui/*` or `shadcn/ui` files | shadcn/ui (radix primitives) |
| `react-hook-form` / `zod` | Forms (RHF + Zod) |
| `@vercel/*` or `.vercel/` dir | Vercel hosting |
| `express` / `fastify` / `hono` | Backend framework |
| `drizzle-orm` / `@prisma/client` / `kysely` | ORM |
| `vitest` / `jest` / `playwright` | Test stack |

Versions: read each entry's `package.json#dependencies[X]` value verbatim (strip `^` / `~`). Surface them in the draft.

**Fallback when no `package.json`:** scan for telltales — `Cargo.toml` (Rust), `pyproject.toml` / `requirements.txt` (Python), `go.mod` (Go), `Gemfile` (Ruby). Mark stack as "Other (non-JS)" and surface what was detected. **Don't try to derive build commands** — surface detection result and ask user.

#### F2b. Build commands

Read `package.json#scripts`. Map known script names → KB fields:

- `scripts.build` → `Build:` (use the script name, e.g., `npm run build`)
- `scripts.dev` / `scripts.start` → `Dev server:` (prefer `dev` if both exist)
- `scripts.typecheck` / `scripts.tsc` / `tsc` → `Type check:` (or fallback `npx tsc --noEmit` if `typescript` is a dep but no script)
- `scripts.test` → `Test:` (only include if test KB applies — see F2a)
- `scripts.lint` → `Lint:`
- `scripts.format` → `Format:`

Use `npm run X` everywhere by default; if `pnpm-lock.yaml` exists, use `pnpm X`; if `bun.lockb`, use `bun X`; if `yarn.lock`, use `yarn X`. Detect lockfile via `Glob`.

#### F2c. KB_1_Architecture.md draft (folder-structure-driven)

Sketch the protocol the command walks through:

1. **Tech Stack section:** populate from F2a, including version numbers. Cite the dependency: `Next.js (15.0.0) — from package.json#dependencies.next`.
2. **Patterns Needed section:** infer from F2a signals.
   - Supabase detected → "Auth, RLS, multi-tenant queries, edge functions"
   - Stripe detected → "Subscription billing, webhooks, customer portal"
   - `next-auth`/Clerk detected → "Authentication"
   - `@vercel/blob` / S3 / GCS detected → "File storage"
   - `pg_cron` migrations or `inngest`/`trigger.dev` deps → "Background jobs"
3. **Data Model (Draft):** if `supabase/migrations/` exists, parse migration filenames for table names (e.g., `20240101_create_users_table.sql` → `users`). List discovered tables. **Do not** parse SQL — that's V2. Just list filenames as evidence and ask the user to confirm + add relationships.
4. **Deployment & Infrastructure:** infer hosting from `.vercel/`, `netlify.toml`, `fly.toml`, `wrangler.toml`, `railway.json`, `Dockerfile`. CI from `.github/workflows/*.yml`. **Required env vars** from `.env.example` (read top-to-bottom, list keys; do not parse values). External deps from F2a.
5. **Architecture Decisions / Open Questions:** **leave empty**. These require user judgment, not derivation.

**Concrete sketch — Next.js + Supabase repo (typical):**

```markdown
# KB 1 — Architecture (DRAFT — generated by /adopt)

## Overview
[TODO — confirm during /adopt]

## Tech Stack
- Frontend: Next.js 15.0.0 (App Router) — package.json
- UI library: shadcn/ui via @radix-ui/react-* primitives — package.json
- Styling: Tailwind CSS 3.4.0 — package.json + tailwind.config.ts
- Backend: Supabase (DB, auth, storage, realtime) — supabase/config.toml
- Auth: @supabase/auth-helpers-nextjs — package.json
- Billing: Stripe — package.json
- Hosting: Vercel — .vercel/ project link present
- CI/CD: GitHub Actions — .github/workflows/ci.yml
- Tests: Vitest + Playwright — package.json

## Patterns Needed (auto-derived)
- Authentication & sessions (Supabase Auth)
- Multi-tenant RLS (Supabase + multi-org schema patterns)
- File storage (Supabase Storage detected via `@supabase/storage-js`)
- Subscription billing (Stripe webhooks + customer portal)
- Email transactional (Resend via package.json)

## Data Model (Draft — derived from migration filenames)
Tables found in supabase/migrations/:
- users, organizations, projects, invoices, webhooks_log
[TODO — confirm relationships and add any tables created via Studio UI]

## Deployment & Infrastructure
- Hosting: Vercel (linked project — .vercel/project.json)
- CI/CD: GitHub Actions — .github/workflows/ci.yml
- Required env vars (from .env.example):
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY
  - SUPABASE_SERVICE_ROLE_KEY
  - STRIPE_SECRET_KEY
  - STRIPE_WEBHOOK_SECRET
  - RESEND_API_KEY
- External dependencies: Supabase, Stripe, Resend, Vercel

## Architecture Decisions
[TODO — leave empty unless user surfaces decisions during /adopt]

## Open Questions
[TODO]
```

#### F2d. KB_7_UI_Patterns.md draft

Detect signals only; don't fabricate patterns:

- `tailwind.config.*` exists → seed Part 1 → "Styling Conventions: Tailwind CSS — utility-first, CSS variables for theming"
- `components.json` (shadcn config) exists → seed → "Design System: shadcn/ui (radix-based primitives, copied into src/components/ui/)"
- `src/components/` directory exists → seed file structure note pointing at it
- `react-hook-form` + `zod` → seed Forms section → "react-hook-form + Zod (resolver-based validation)"
- **All other Part 1 fields:** leave as `[TODO — confirm during /adopt]`. **Do not auto-fill component or hook catalogs.** They populate as `/gen-component` is used.

#### F2e. KB_9_Screen_Catalog.md draft

If `app/` (App Router) or `pages/` (Pages Router) exists, walk the route tree and **list routes only** (no objectives, no roles — those need user input). Format:

```markdown
## Screens (auto-detected routes — [TODO] confirm and fill in details)

### / (home)
- **Route:** `/`
- **File:** `app/page.tsx`
- [TODO — fill in roles, objective, sections, actions]

### /dashboard
- **Route:** `/dashboard`
- **File:** `app/dashboard/page.tsx`
- [TODO ...]
```

If no obvious framework router → leave empty with note: "Auto-detection couldn't find a route tree; populate manually."

#### F2f. CLAUDE.md drafts (project-level fields)

This is the trickiest — **always show drafts before writing**. Auto-fill what's truly observable; mark everything else `[TODO — confirm during /adopt]`:

- `## Tech Stack` — from F2a
- `## Build Commands` — from F2b
- `## Overview` — **never auto-fill**. Read `README.md` if it exists; quote a one-line summary IF it has a clear "what this is" line; otherwise `[TODO]`. Don't paraphrase a long README badly.
- `## Roles` — `[TODO]` (not observable from code reliably).
- `## Core Entities` — `[TODO]` (auto-derive from migrations is risky — table names ≠ entity names).
- `## Current Phase` — `[TODO]` (can't infer from disk).
- `## Patterns` — empty initially.
- `## Preferences` — `[TODO]`.
- `## DO NOT` — empty initially.

#### F2g. APP_CONCEPT.md and SCOPE.md

**Don't draft these.** They require user discovery (problem statement, user types, success criteria, V1 scope, out-of-scope). Auto-derivation would produce noise. `/adopt` should write empty templates (same as kickoff's `[TODO]`-marked scaffolds at `kickoff.md:307-360`) and prompt the user to fill them. Concrete prompt: *"APP_CONCEPT.md and SCOPE.md require discovery. Want to do that now (~10 min, kickoff-style)? Or fill in later?"*

### F3. Existing-KB audit feature (the high-value piece)

This is the highest-leverage feature for legacy adopters. Concrete implementation:

#### F3a. File discovery

```
Glob: docs/KB_*.md
Filter out:
  - KB_1_Architecture.md, KB_7_UI_Patterns.md, KB_8_Current_State.md, KB_9_Screen_Catalog.md (framework-managed templates per Worker 1 R17)
  - KB_INDEX.md (framework-managed per Worker 1 R3)
Remaining = "user KB candidates" — ALL of these get audited.

Also include (broaden detection):
  - docs/*.md NOT in the manifest's `excluded` or `framework-managed` lists
  - Any doc with `KB_` prefix anywhere under docs/
```

Show user the discovered list before doing anything: *"Found N candidate user KBs to audit: <list>. Audit all? [Y/n] (Or pick a subset.)"*

#### F3b. Reference extraction (per file)

For each user KB, extract every "checkable claim":

- **File paths** — match regex `(src|supabase|app|pages|components|hooks|lib|tests?|server|api)/[\w/.\-]+\.(ts|tsx|js|jsx|sql|md)`
- **Component names** — match `<PascalCase>` in code blocks AND PascalCase strings in headings/lists (filter common words)
- **Hook names** — match `use[A-Z]\w+` regex
- **Table names** — match `from\(['"][\w_]+['"]\)` (Supabase) and bare `_users_`, `_projects_` style snake_case identifiers in DB sections
- **Function/symbol names** — match `function (\w+)`, `const (\w+) =`, `export (?:default |const |function )(\w+)`
- **API endpoints / route paths** — match `/api/[\w/-]+`, `/[\w-]+/[\w-]+` patterns

Extract location with file:line so the audit can cite the original claim.

#### F3c. Cross-reference scan (where to reuse `/investigate`)

**Don't reinvent.** Spawn an `Explore` subagent for the cross-reference. The dispatch prompt mirrors `investigate.md:24-122`:

```
# Codebase Stale-Reference Audit

Audit document: docs/KB_X_OldKB.md

## Task
For each "checkable claim" extracted (passed in the prompt as a list), verify whether it still exists in the codebase as described.

Claims to verify:
- File path: src/components/UserAvatar.tsx (referenced in KB_X line 47)
- Hook name: useUserSession (referenced in KB_X line 89)
- Table name: legacy_users (referenced in KB_X line 124)
- ...

## Verification protocol
For each claim:
1. **File path:** test if the file exists at that path. If not, search for similarly-named files via Glob — report best match (`src/components/Avatar.tsx` if `UserAvatar.tsx` was renamed).
2. **Hook/function/component name:** Grep for the symbol. If found in current code, mark CURRENT. If not found anywhere, mark MISSING. If found but at a different file path than the KB claims, mark MOVED with the new location.
3. **Table name:** Grep `supabase/migrations/*.sql` for `CREATE TABLE`. If not found, mark MISSING. (Don't try to read DB live — migrations are the source of truth.)
4. **API endpoint:** Grep route definitions (Next.js: `app/**/route.ts`, `pages/api/**/*`; Express/Fastify equivalents).

## Output (markdown table per file)
| Claim | Status | Evidence |
|---|---|---|
| src/components/UserAvatar.tsx | MOVED | Found at src/components/profile/Avatar.tsx |
| useUserSession | MISSING | Not found in codebase |
| legacy_users table | MISSING | Not found in supabase/migrations/ |
| /api/legacy/auth | MISSING | No matching route file |
```

The Explore subagent runs read-only, returns the markdown table, and `/adopt` integrates the result.

#### F3d. Bucketing logic — concrete thresholds

Tally results per file:

```
total_claims = number of extracted checkable claims
stale_count = MISSING + MOVED count (MOVED counts as stale because the doc is now wrong)

stale_pct = stale_count / total_claims

Bucket:
  Current        — stale_pct == 0 (or total_claims < 3, "too few claims to be confident")
  Partially Stale — 0 < stale_pct <= 30%
  Mostly Stale    — 30% < stale_pct <= 70%
  Orphaned        — stale_pct > 70% OR total_claims == 0 (file has no checkable claims at all — pure prose)
```

The "too few claims" caveat handles short config-style KBs that don't reference code. Surface it explicitly: "[FILE] has only 2 checkable claims; treating as Current with low confidence."

#### F3e. Per-file triage UX — single-screen review, not interactive prompts

A 12-file audit with per-file interactive prompts is exhausting. Use a **summary-then-decisions** pattern (matches Worker 2's installer inventory pattern, F4 below):

```
## Existing KB Audit — 7 files reviewed

| File | Bucket | Stale | Total | Quick action suggestion |
|---|---|---|---|---|
| KB_2_OldArch.md | Orphaned | 12/12 | 12 | Archive |
| KB_3_DataModel.md | Mostly Stale | 8/11 | 11 | Update or archive |
| KB_4_API.md | Partially Stale | 2/15 | 15 | Update (light) |
| KB_5_Auth.md | Current | 0/9 | 9 | Keep |
| ...

For each file, choose: [k]eep / [u]pdate / [a]rchive / [m]erge / [d]iff (show stale references) / [s]kip
```

Then ask **per file in sequence**, after the user has seen the whole picture. UX detail: print the file's stale references inline before each prompt:

```
─── KB_3_DataModel.md (Mostly Stale, 8/11 stale) ───
Stale references:
  Line 47: src/db/schemas/users.ts → MISSING (no such file)
  Line 89: legacy_users table → MISSING (no migration)
  Line 124: usePostgrest hook → MOVED to src/lib/db/usePostgrest.ts
  Line 156: ...

Action: [k]eep / [u]pdate / [a]rchive / [m]erge / [d]iff / [s]kip [a]:
```

Defaults are bucket-driven — `Orphaned` defaults to `[a]rchive`, `Mostly Stale` to `[u]pdate`, `Partially Stale` to `[u]pdate`, `Current` to `[k]eep`. User just hits enter to accept.

**Action mappings:**

- **keep** — no-op
- **update** — emit a TODO list of stale lines into the file at top (or write a sibling `KB_X.staleness-report.md` if user prefers)
- **archive** — move file to `docs/archive/KB_X_OldArch.md` and add a one-liner header `> Archived during /adopt on YYYY-MM-DD — content was [Mostly Stale/Orphaned] against the codebase at adoption time. Original audit: docs/archive/KB_X.audit.md`
- **merge** — propose a target framework KB (KB_1, KB_7, etc.) based on content type, show side-by-side draft, user approves. **High-touch path; only enable if file is Current or Partially Stale** (don't merge stale content).
- **diff** — print the stale-reference table again with surrounding context lines from the KB. Re-prompt action.
- **skip** — defer decision; mark in audit log

#### F3f. Final audit log

Write `docs/adopt-audit-YYYY-MM-DD.md` summarizing decisions. Format:

```markdown
# /adopt audit — 2026-05-07

## KB triage
| File | Bucket | Action | Result |
|---|---|---|---|
| KB_2_OldArch.md | Orphaned | archive | Moved to docs/archive/ |
| KB_3_DataModel.md | Mostly Stale | update | TODO list added at top |

## Tech stack auto-derived
[Excerpt from F2a result]

## CLAUDE.md merge
[Backup path + summary of what was preserved vs. inserted]
```

This file is committed alongside other adopt-time artifacts so the user has a record.

### F4. Assisted CLAUDE.md merge

#### F4a. Backup pattern (confirmed)

`CLAUDE.md.pre-adopt-backup` per the dispatch prompt and phase plan. Concrete:

1. Detect `CLAUDE.md` exists. (Per Worker 2 plan F3, installer wrote framework version to `CLAUDE.md.framework` because original `CLAUDE.md` was preserved.)
2. Copy original `CLAUDE.md` → `CLAUDE.md.pre-adopt-backup` (uses `cp`, atomic on same FS).
3. Read both `CLAUDE.md` (user's) and `CLAUDE.md.framework` (template that installer wrote sibling — see Worker 2 finding F3).
4. Show user: "Backed up your CLAUDE.md to CLAUDE.md.pre-adopt-backup. Original is safe."

#### F4b. Merge strategy — section-by-section walk (not diff-based)

A line-level diff is the wrong tool here. CLAUDE.md is structured by markdown headings, and the framework's structure is rigid (Environment → Overview → Tech Stack → Build Commands → Roles → Core Entities → Reference Documents → Current Phase → Patterns → Preferences → Custom Commands → KB Maintenance → DO NOT). The merge should be a **section-by-section reconciliation** keyed by `## H2` headings:

```
For each H2 section in framework template:
  - User has matching H2? → keep user content; check that user's section doesn't lack required sub-content (e.g., framework's `## Reference Documents` block names the 9 stack-reference KBs; user's version may not — insert any missing references at the bottom of their section, with a marker comment).
  - User has no matching H2? → insert framework section with [TODO] markers (or auto-derived content from F2 if applicable).

For each H2 section in user CLAUDE.md NOT in framework template:
  - Preserve verbatim, append to bottom under "## (Project-specific sections preserved during /adopt)"
```

**Sections that MUST be inserted/refreshed from framework template** (these contain framework infrastructure):

- `## Reference Documents` (the 9 stack-reference KB references — these change with each framework update; merge them in canonically)
- `## Custom Commands` (the command tables — same; framework owns this)
- `## KB Maintenance` (rules section — framework owns)

**Sections that MUST be preserved verbatim from user** (these are project content):

- `## Overview`, `## Tech Stack` (cross-check vs. F2a derivation; warn if mismatch), `## Build Commands` (same), `## Roles`, `## Core Entities`, `## Current Phase`, `## Patterns`, `## Preferences`, `## DO NOT`

**Sections that get cross-referenced:**

- `## Environment` — handled by `/preflight`, not `/adopt`. If missing, prompt user to run `/preflight` separately.

#### F4c. Three-way display before writing

Show user a **three-pane preview** for each section that's getting modified:

```
─── Section: ## Reference Documents ───

YOUR VERSION (CLAUDE.md.pre-adopt-backup):
[N lines of user's content]

FRAMEWORK VERSION (CLAUDE.md.framework):
[N lines of framework content]

PROPOSED MERGE:
[Reconciled version — preserves user's first 2 lines, inserts framework's 9 KB references after]

Action: [a]ccept / [e]dit / [k]eep mine / [f]orce framework / [s]kip section
```

For sections with **no conflict** (user has it, framework matches, nothing to do), don't show the three-pane — just include in a "Sections preserved unchanged: …" summary at the top of the merge UI.

#### F4d. Edge case — user CLAUDE.md has wildly different format

If the user's CLAUDE.md has < 3 of the framework's expected H2 headings (e.g., they wrote a single prose paragraph or use entirely different sections), **don't try to auto-merge**. Detect this case via heading count:

```
framework_headings = ["## Environment", "## Overview", "## Tech Stack", "## Build Commands",
                     "## Roles", "## Core Entities", "## Reference Documents",
                     "## Current Phase", "## Patterns", "## Preferences",
                     "## Custom Commands", "## KB Maintenance", "## DO NOT"]

user_heading_overlap = count(user_h2_headings ∩ framework_headings)

if user_heading_overlap < 3:
  fallback to "wrap" mode
```

**Wrap mode:** write the framework template fresh, but include the user's entire original CLAUDE.md content under a section called `## Project-Specific Notes (preserved from previous CLAUDE.md)` near the end. User can manually integrate later. Surface clearly: *"Your CLAUDE.md doesn't follow the framework structure. I've preserved it under '## Project-Specific Notes' inside the new file. Original backup at CLAUDE.md.pre-adopt-backup. You can manually re-integrate sections as needed."*

This is a **graceful degradation** — never fail; never lose user content.

### F5. `--minimal` flag behavior — exact semantics

The dispatch prompt says: *"skips the populate-KBs and audit-existing-KBs steps. For users who just want commands installed without the discovery flow."*

Concrete behavior:

| Step | Default `/adopt` | `/adopt --minimal` |
|---|---|---|
| Verify framework files installed (presence of `.framework-version`) | ✅ | ✅ |
| Run `/preflight` if Environment block missing | Prompt user | Prompt user |
| F2 auto-derivation drafts (KB_1, KB_7, KB_9) | ✅ | ❌ |
| F3 existing-KB audit | ✅ | ❌ |
| F4 CLAUDE.md merge | ✅ (interactive, section-by-section) | ✅ (lightweight: just install Reference Documents + Custom Commands tables; preserve everything else) |
| Post-adopt summary | ✅ | ✅ |

**Why merge still runs (lightweight):** the framework's Custom Commands and Reference Documents sections need to be in CLAUDE.md or `/orchestrate` and friends won't know what's available. Even the "minimal" user benefits from those references. **The discovery flow stays opt-out, but the structural insert stays opt-in by default.**

The user-facing message in `--minimal` mode:

```
/adopt --minimal — discovery skipped

Verified:
  ✓ .framework-version present (v0.1.0)
  ✓ .claude/commands/ has 23 framework commands
  ✓ docs/ has 9 stack-reference KB folders

Updated:
  ✓ CLAUDE.md — inserted Reference Documents + Custom Commands sections
                 (your other content preserved; backup at CLAUDE.md.pre-adopt-backup)

Skipped (--minimal):
  - KB_1/KB_7/KB_9 drafts (run /adopt without --minimal to populate)
  - Existing-KB audit (run /adopt without --minimal or audit manually)

Run /preflight if you haven't already (Environment block missing in CLAUDE.md).
```

### F6. Edge cases

- **Project too big to read all of:** If `package.json` not present and no other recognizable build manifest, ask user: "Don't recognize this stack — describe it briefly?" Don't try to scan the entire `src/` tree (token budget catastrophe). The auto-derivation in F2 only reads ~10 deterministic files (`package.json`, `tailwind.config.*`, `components.json`, `supabase/config.toml`, `.env.example`, `next.config.*`, framework lock files, route directory listings). Bounded cost.

- **Existing CLAUDE.md but no `package.json`:** likely a non-JS project. F2a falls back to "Other (non-JS)" with surfaced detection (Cargo.toml etc.). Build commands `[TODO — ask user]`. Merge proceeds normally; the framework template's structure works regardless of stack.

- **Project has `docs/` but with totally different structure:** F3 still works because it operates on `docs/KB_*.md` glob and any `docs/*.md` not in the manifest's known-categories. If user has `docs/architecture/foo.md`, it falls outside the audit by default. **Recommendation: also surface a "found these docs/ files I didn't audit — want me to look at any?" prompt** showing untouched files. Lets the user opt files in without forcing a scan.

- **Multi-language repo (Python + JS):** F2a detects both via lockfile + Python markers. Surface both in the draft; let user pick which is primary. Don't try to merge stack labels into one `Tech Stack` line — list each clearly.

- **Adopter has `~/.claude/commands/` shadow:** Worker 2's pre-flight gate handles this; `/adopt` should still **detect and warn** in case the shadow was added between install and adopt. Concrete: at the start of `/adopt`, glob `~/.claude/commands/*.md` (cross-platform: `$HOME/.claude/commands/`); for each match whose basename is in `(audit-code, audit-full, ..., adopt, update-framework)`, warn: "User-global command shadow at ~/.claude/commands/<name>.md may shadow the project version. See docs/MULTI_AGENT_WORKFLOW.md or rename ~/.claude/commands/ to commands_legacy/."

- **Adopter is mid-feature with dirty working tree:** Worker 2's pre-flight rejects install on dirty tree, so by the time `/adopt` runs, tree should be clean. But adopter could dirty it before running adopt. **Recommendation: at start of `/adopt`, run `git status --porcelain` and warn if dirty.** Don't refuse — adopt is non-destructive (writes to new files + creates backup) — but explicit warning means user is aware that their `git diff` will show the install + adopt changes mixed together.

- **No `git` at all:** Worker 2's pre-flight requires git. If somehow `/adopt` runs without git (e.g., user re-ran outside a repo), still proceed but skip the dirty-tree check; print warning that backups are the only recovery path.

### F7. Re-invocation (already-adopted detection)

Per phase-plan.md (Non-blocking decisions, V2 list: "Re-adopt idempotency"), V1 behavior is **detect + warn + exit**. Concrete logic:

```
At start of /adopt:
  1. Check ./.framework-version exists → if not, error "Framework not installed. Run `npx @insynq/app-blueprint init` first."
  2. Check for adopt-completion marker. Two candidates:
     a. docs/adopt-audit-YYYY-MM-DD.md exists (audit log written by F3f)
     b. CLAUDE.md.pre-adopt-backup exists (proves prior adopt ran F4)
  3. If either marker exists → warn:
     "Looks like /adopt has already run on this project (backup at CLAUDE.md.pre-adopt-backup; audit at docs/adopt-audit-2026-05-07.md). Re-running is V2; for V1, exit. To force re-run: delete CLAUDE.md.pre-adopt-backup AND docs/adopt-audit-*.md, then re-invoke."
  4. Exit cleanly with code 0 (not an error — the state is fine).
```

Backup file is the simpler signal. Audit log catches the case where merge was skipped (shouldn't happen but defensive).

The phrasing matters: don't tell users they screwed up by running it twice — tell them V1 doesn't support re-adopt and what to do if they truly need to.

### F8. Collisions with installer (Worker 2)

Boundary clarification — confirmed by reading worker-2-installer.md:

| Action | Owned by Worker 2 (installer) | Owned by Worker 3 (`/adopt`) |
|---|---|---|
| Write framework files (`.claude/commands/*`, `docs/[KB folders]/*`) | ✅ | ❌ |
| Write `.framework-version` | ✅ | ❌ |
| Write `CLAUDE.md.framework` (sibling) when user has CLAUDE.md | ✅ | ❌ (reads it during merge) |
| Write `CLAUDE.md` (the merged version) | ❌ | ✅ |
| Backup `CLAUDE.md` → `CLAUDE.md.pre-adopt-backup` | ❌ | ✅ |
| Detect user-global command shadows | ✅ (pre-flight) | ✅ (re-detect, warn-only) |
| Populate KB_1 / KB_7 / KB_8 / KB_9 with project content | ❌ (writes empty templates) | ✅ |
| Audit existing user KBs (`KB_2`, etc.) | ❌ | ✅ |
| Verify framework files present | ❌ | ✅ (sanity check) |
| Run `/preflight` | ❌ | Prompts user to |

**No write collisions** — installer writes files; `/adopt` writes a different set. Two zones of overlap to coordinate:

1. **`CLAUDE.md.framework`:** installer creates it (sibling). `/adopt` reads it during merge, then deletes it post-merge (cleanup; otherwise it lingers as confusing). Document this handoff in `/adopt`'s post-merge step.
2. **`.framework-version` exists check:** both Worker 2 (refuses install if present — its pre-flight gate F2 in installer plan) AND Worker 3 (requires it before adopting — F7 above). The "framework is installed" signal. Synced — no conflict.

### F9. Anything else (gaps the holistic plan missed)

- **The dogfood test plan in phase-plan.md:178** says PM dogfoods `/adopt` against "the user's two existing projects." `/adopt`'s F3 audit feature is the most valuable thing to dogfood — and the user explicitly mentioned (per memory: "user runs a PM context window... separate worker contexts") that **smoke testing existing-KB audits is exactly the workflow this is designed for**. Recommend adding to smoke test list: "AB-FW-AUDIT-1: Run `/adopt` against project with stale KBs; verify Mostly Stale / Orphaned bucketing matches manual review."

- **The `/preflight` integration is stale:** `preflight.md:48-55` lists "23 commands" hardcoded. Once `/adopt` and `/update-framework` ship, that count is wrong (it should be 25). **Not Worker 3's job** to update preflight, but flag for PM integration step. Add to phase-plan.md PM step list.

- **`/kickoff`'s welcome message at `kickoff.md:60-79`** mentions "23 commands in `.claude/commands/`" — same drift. Same flag for PM.

- **`CLAUDE.md` template's Custom Commands table** at `CLAUDE.md:67-114` — needs `/adopt` and `/update-framework` rows added. Already in phase-plan.md PM integration step (line 174).

- **No `/kickoff`-style welcome message in `/adopt`.** `/kickoff` has the warm "Welcome to app-blueprint" intro. `/adopt` is a different audience — adopters bringing existing projects — but should have a parallel intro that names the adopter pain (legacy KBs, existing CLAUDE.md, big repo) and the value (audit + merge + drafts). One paragraph, not 19 lines like kickoff. Recommended:

  ```
  Welcome — /adopt is the existing-repo onboarding command. The framework's
  files are installed; this command makes them fit your project: it drafts
  KBs from your codebase, audits any existing KBs you have for staleness,
  and merges your CLAUDE.md with the framework template (your content wins
  on conflicts; original backed up before any change).

  Run with --minimal to skip the drafting and auditing if you just want
  the commands installed.
  ```

- **Session-state — what if user kills `/adopt` mid-flow?** Different phases write different files. Risks: half-merged CLAUDE.md, partial audit log, KB drafts written but unconfirmed. **Recommendation:** at each step that writes, the command should announce *"Wrote X" + "Resume point: <step name>"* so user can re-invoke and skip already-done work. This is a manual resume, not auto — V1 doesn't need state-machine recovery, just clarity. **Implementation:** keep a `docs/.adopt-progress.json` with `{ "last_completed_step": "F2-tech-stack", "ts": "..." }`. On re-invoke, surface "Last run completed through F2; continue from F3? [Y/n]". V2 can build a real state machine.

- **Error mode: stack-reference KB folder is missing.** If installer failed silently and one of the 9 KB folders is missing, `/adopt` should detect at the verify-framework-files step (F4 step #2 of `--minimal` output above). Concrete: glob `docs/*KBs*` and `docs/UI-UX KBs`. If count < 9, refuse: "Framework files incomplete. Re-run `npx @insynq/app-blueprint init` to repair."

## Recommendations

Numbered for PM cross-reference. **Bold = blockers for Phase 7. Plain = quality-of-life.**

**R1. Frontmatter is `description` + single optional arg `minimal`.** No subagent dispatch; `/adopt` runs inline like `/kickoff`. **Blocker** (sets file structure for Phase 7).

**R2. NO Handlebars syntax anywhere.** Conditionals expressed as plain English ("If `$ARGUMENTS.minimal` is set, skip steps 3–5"). **Blocker.**

**R3. Implement F2 auto-derivation per the deterministic table** (F2a). Read only ~10 specific files, not whole-tree scans. **Blocker.**

**R4. Always show drafts before writing project content** (F2f). Never write CLAUDE.md project sections without user confirmation. **Blocker.**

**R5. Existing-KB audit reuses `/investigate` patterns** by spawning an `Explore` subagent for the cross-reference scan (F3c). Don't reinvent codebase scanning. **Blocker.**

**R6. Bucketing thresholds: 0 stale = Current; 0–30% = Partially Stale; 30–70% = Mostly Stale; >70% or 0 claims = Orphaned.** Document in command body. **Blocker.**

**R7. KB triage UX is summary-table-then-per-file-prompts**, not interleaved per-file prompts (F3e). Defaults are bucket-driven. **Blocker.**

**R8. Triage actions: keep / update / archive / merge / diff / skip.** Concrete behavior for each per F3e. **Blocker.**

**R9. CLAUDE.md merge is section-by-section**, keyed on H2 headings, NOT line-diff (F4b). Three-pane preview per section that's modified (F4c). **Blocker.**

**R10. Framework-owned sections** (Reference Documents, Custom Commands, KB Maintenance) **always refresh from template**; project-owned sections (Overview, Tech Stack, etc.) preserved verbatim. **Blocker.**

**R11. Wildly-different CLAUDE.md fallback: "wrap mode."** If user's CLAUDE.md has < 3 framework H2 headings, write framework template fresh and append user's original under `## Project-Specific Notes`. Original always backed up. **Blocker.**

**R12. `--minimal` flag does NOT skip CLAUDE.md merge**, only skips F2 drafts and F3 audit. Reasoning in F5. **Blocker.**

**R13. Re-invocation detection: presence of `CLAUDE.md.pre-adopt-backup` OR `docs/adopt-audit-*.md` triggers warn + exit** (F7). Document recovery path (delete both, re-run). **Blocker.**

**R14. Boundary with installer**: `/adopt` reads `CLAUDE.md.framework` during merge, then deletes it post-merge. `/adopt` requires `.framework-version` exists. Document handoff in command body. **Blocker.**

**R15. Add re-detection of user-global command shadows** at start of `/adopt` (F6 edge case). Warn-only, not block. **Quality-of-life.**

**R16. Detect dirty git tree at adopt-start; warn but don't block** (F6). **Quality-of-life.**

**R17. Write `docs/adopt-audit-YYYY-MM-DD.md`** as the durable record of decisions made during adopt (F3f). Acts as both audit trail and re-invocation marker. **Blocker.**

**R18. Cleanup `CLAUDE.md.framework` after merge.** Otherwise it lingers as a confusing artifact. **Blocker.**

**R19. Add a brief welcome message** at top of the adopt flow (F9 final bullet). One paragraph, names the audience. **Quality-of-life — recommended.**

**R20. Add manual resume affordance via `docs/.adopt-progress.json`** (F9). On re-invoke, surface "Continue from last step? [Y/n]". Defer full state-machine to V2. **Quality-of-life.**

**R21. Verify framework files complete** (count of stack-reference KB folders >= 9, count of `.claude/commands/*.md` >= 23 + 2 framework commands = 25) at start. Refuse with "re-run installer" if incomplete. **Blocker.**

**R22. Open issue for PM (not Worker 3): `/preflight` and `/kickoff` reference "23 commands" hardcoded.** Will be 25 after this phase ships. PM integration step should bump these (already on phase-plan.md:174 list). Flag for awareness. **Out of scope; flag to PM.**

**R23. Open issue for PM (not Worker 3): smoke test for `/adopt` audit feature** (F9 first bullet). Recommend `AB-FW-AUDIT-1` smoke ID against the user's existing-KB-rich project. **Out of scope; flag to PM.**

**R24. Tension to flag for PM: F2c data-model auto-derivation from migration filenames is fragile.** It works for projects that use migration files (Supabase, Drizzle, Prisma) but breaks for live-DB-edited projects (Studio UI). Document the limitation; user can correct the draft. Not a blocker — just a limitation to surface in the draft itself. **Quality-of-life.**

**R25. Tension to flag for PM: F4b CLAUDE.md merge cross-checks user's `## Tech Stack` against F2a derivation.** If they disagree (e.g., user wrote "Next.js 14" but `package.json` says 15), surface a warning during merge. Don't auto-overwrite; ask. **Quality-of-life — adds polish.**

**Final structural note for Worker 3 implementation in Phase 7:** The command body is going to be **long** (kickoff is 589 lines; adopt likely similar). Worth budgeting time to keep it readable: use clear `### Step N` headers, explicit "wait for user input" markers, and copy-paste-ready prompt snippets in fenced blocks. The user will read this command if they get confused mid-adopt — clarity matters.

## PM annotations

**Reconciled 2026-05-07.** Audit accepted with the following decisions:

**PM annotation 1 (dispatch mode):** Confirmed — `/adopt` runs **inline** in user's session, not as subagent or skill dispatch. Matches `/kickoff` pattern. The interactive multi-step approve-or-reject UX requires inline. Subagent is appropriate for the `Explore`-type calls within `/adopt` (existing-KB scanning) but NOT for the orchestrator itself.

**PM annotation 2 (frontmatter):** Adopt your F1 frontmatter — `description` + single optional `minimal` arg. Reject scope-creep flags (`--target-package`, `--skip-merge`, `--force` — none have real V1 use cases).

**PM annotation 3 (Handlebars avoidance):** Confirmed banned. Use plain English conditionals throughout. `$ARGUMENTS.minimal` works for argument access (verified across audit-code, brainstorm, ship, update-kb).

**PM annotation 4 (auto-derivation table):** Adopt your F2a dependency-mapping table verbatim. F2b lockfile-aware build commands — agreed. F2c folder-driven KB_1 draft — agreed. **APP_CONCEPT.md and SCOPE.md never auto-drafted** — these require user judgment.

**PM annotation 5 (existing-KB audit thresholds):** Adopt your F3 bucketing — 0% / 0–30% / 30–70% / >70%. Use `Explore` subagent for scanning (reuse `/investigate` patterns). Summary-then-per-file-prompts UX (not interleaved).

**PM annotation 6 (CLAUDE.md merge strategy):** Adopt your F4 section-by-section H2 keying. Three-pane preview (canonical / user / suggested merged). Framework-owned sections (Reference Documents, Custom Commands, KB Maintenance) always refresh from canonical. Wrap-mode fallback if user's CLAUDE.md has < 3 framework headings.

**PM annotation 7 (`--minimal` semantics):** Confirmed — skips F2 drafts and F3 audit, BUT keeps lightweight CLAUDE.md merge (Reference Documents + Custom Commands tables only). Other slash commands won't find their references otherwise.

**PM annotation 8 (re-invocation detection):** Detect via `CLAUDE.md.pre-adopt-backup` OR `docs/adopt-audit-*.md`. Warn + exit cleanly. V1 doesn't handle re-adopt (deferred to V2 per phase plan).

**PM annotation 9 (boundary with installer):** Confirmed clean. Installer drops `CLAUDE.md.framework` sibling. `/adopt` reads it during merge, then **deletes** it after successful merge. `.framework-version` is the shared "installed?" signal. No write collisions.

**PM annotation 10 (UI:UX rename):** Already done by PM 2026-05-07. Your existing-KB audit logic doesn't need special-case for the colon — canonical structure is clean.

**PM annotation 11 (PM follow-up tracked, NOT your responsibility):** `/preflight` and `/kickoff` say "23 commands" — bumps to 25 after `/adopt` and `/update-framework` ship. PM handles in integration step. You DO NOT modify those commands.

**Implementation handoff (Phase 7):** deliverable is `/Users/chrisparsons/Documents/GitHub/app-blueprint/.claude/commands/adopt.md`. Likely 400–600 lines (kickoff is 589). Use clear `### Step N` headers, explicit "wait for user input" markers, copy-paste-ready prompt snippets. When done: edit Implementation log + Completion notes of THIS plan doc, return brief summary.

## Implementation log

**2026-05-07 — Worker 3 Phase 7 implementation.**

Authored `/Users/chrisparsons/Documents/GitHub/app-blueprint/.claude/commands/adopt.md` in one pass. 1166 lines, 8 step headers (Step 0 Welcome through Step 7 Final Summary), inline command (no subagent dispatch — `Explore` is spawned only inside Step 5c for the existing-KB cross-reference scan, mirroring `/investigate`).

Reads taken to ground the implementation:
- `.claude/commands/kickoff.md` — closest analog (inline, multi-step, approve-or-reject UX, 589 lines). Mirrored its welcome → step → final-summary skeleton.
- `.claude/commands/preflight.md` — confirmed the inline conventional structure for short orchestrators.
- `.claude/commands/investigate.md` — confirmed the Explore-subagent pattern for read-only scanning. Step 5c reuses this verbatim with a stale-reference-audit prompt.
- `.framework-manifest.json` — used the framework-managed list to derive the audit filter in Step 5a (KB_1/7/8/9 + KB_INDEX excluded; everything else under `docs/KB_*.md` is a candidate).

Implementation choices made within the audited PM annotations:
- Frontmatter exactly per F1: `description` + single optional `minimal` arg. No scope-creep flags.
- All conditionals are plain English (e.g., "If `$ARGUMENTS.minimal` is set, skip this entire step. Jump to Step 6."). Zero Handlebars syntax.
- F2 derivation table reproduced verbatim in Step 3b. Lockfile-aware build commands in Step 3c (pnpm-lock.yaml → pnpm; bun.lockb → bun; yarn.lock → yarn; default npm).
- F3 existing-KB audit dispatches `Explore` in Step 5c with a concrete prompt template (file paths / hooks / tables / API endpoints). Bucketing thresholds 0% / 0–30% / 30–70% / >70% in Step 5d. Summary-table-then-per-file UX in Step 5e (not interleaved). Default actions are bucket-driven; user just hits Enter to accept.
- F4 CLAUDE.md merge is section-by-section H2-keyed (Step 6c). Three-pane preview in 6d for sections needing reconciliation. Wrap-mode fallback in 6e if user heading overlap < 3.
- F5 `--minimal` semantics: skips Steps 4 and 5 entirely; Step 6 runs in lightweight branch (Step 6f) — only Reference Documents + Custom Commands tables refreshed, everything else preserved verbatim.
- Backup pattern (`CLAUDE.md.pre-adopt-backup`) is Step 6a, BEFORE any merge work.
- Re-invocation detection is Step 1a (`CLAUDE.md.pre-adopt-backup` OR `docs/adopt-audit-*.md` → warn + exit cleanly with recovery path documented).
- Boundary with installer: Step 6a reads `CLAUDE.md.framework`, Step 6g deletes it after successful merge. `.framework-version` is the shared installed-signal (Step 1b verification).
- APP_CONCEPT.md and SCOPE.md are NEVER auto-drafted (PM annotation 4). Step 4d offers an optional inline kickoff-style mini-session, otherwise leaves the templates with `[TODO]`.
- Quality-of-life additions per recommendations: dirty-tree warning (R16, Step 1e), global command shadow re-detection (R15, Step 1f), audit log file (R17, Step 5g), `CLAUDE.md.framework` cleanup (R18, Step 6g), brief welcome message (R19, Step 0), framework-files completeness check (R21, Step 1b), Tech Stack mismatch warning during merge (R25, Step 6c).

Constraints respected:
- Did NOT modify `/preflight` or `/kickoff` — PM owns the 23→25 command-count bump in integration step.
- Did NOT modify the canonical `CLAUDE.md` template — merge logic reads user's local copy + the installer's `CLAUDE.md.framework` sibling only.
- Monorepo refused early in Step 1c (V2). Re-adopt refused in Step 1a (V2). Limitations documented in the V1 Limitations footer.

Length note: came in at 1166 lines, ~2× the kickoff baseline. Driven by the explicit specifications (F2 derivation table verbatim, F3 audit subagent prompt with full verification protocol + output schema, F4 three-pane preview wording for every action variant, action-mapping detail for keep/update/archive/merge/diff/skip, audit log file template). Every section corresponds to a PM annotation or audit recommendation; no padding. Could be compressed by 20–30% if PM wants tighter prose, but I prioritized clarity for the user mid-adopt — they will read this command if confused.

Blockers: none.

Lessons:
- F3's "spawn `Explore` subagent for stale-reference scan" is the right boundary — keeps the orchestrator in the user's session for approvals while offloading the heavy read-only scan. Mirrors `/investigate` exactly.
- Step 6's section-by-section H2 walk needed an explicit framework-owned vs. project-owned classification (6c subsections). Kept the rule simple: framework-owned sections always refresh; project-owned sections preserve verbatim with cross-checks for Tech Stack and Build Commands against Step 3's auto-derivation.
- Wrap mode (6e) is the graceful-degradation path. Deciding "< 3 framework H2 overlap" as the trigger is from the audit (F4d); kept that threshold.
- The audit log (`docs/adopt-audit-YYYY-MM-DD.md`) doubles as the re-invocation marker AND the durable record of decisions — efficient.

## Completion notes

**Implementation complete.** Deliverable: `/Users/chrisparsons/Documents/GitHub/app-blueprint/.claude/commands/adopt.md`.

- 1166 lines, 8 steps (0–7).
- Inline orchestrator command (matches `/kickoff` pattern). Spawns `Explore` subagent only inside Step 5c for the existing-KB cross-reference scan.
- All 25 audit recommendations addressed (R1–R25). Blockers (R1–R14, R17–R18, R21) implemented in line. Quality-of-life items (R15–R16, R19–R20, R24–R25) included where they didn't introduce risk; R20 (`docs/.adopt-progress.json` resume-state) was scoped down to "implicit via re-invocation detection in Step 1a" — full state-machine deferred to V2 per the audit's own caveat.
- PM-flagged out-of-scope items (R22, R23) are NOT in this file (correctly — those are PM's integration step).

**Things for PM verification:**
1. Length is 1166 lines (above the 400–600 estimate). Justified by the spec density — F2 table verbatim, F3 subagent prompt verbatim, F4 three-pane action wording, audit log template — but if you want tighter prose, I can do a 20–30% compression pass without losing semantics. Flag if needed.
2. Step 4d's optional inline kickoff mini-session for APP_CONCEPT/SCOPE references `kickoff.md` Step 2's file structures. I described this as "walk the questions in this command and write the same structures kickoff produces" — i.e., don't actually invoke `/kickoff`. Confirm this matches PM intent (alternative: just say "run `/kickoff` separately when you want to fill these in").
3. Re-invocation recovery path tells the user to delete BOTH `CLAUDE.md.pre-adopt-backup` AND `docs/adopt-audit-*.md`. This matches the audit's F7 wording. Worth a sanity-check from PM — is this actually how a re-adopt user should clean up? (V1 doesn't truly support re-adopt, so the path is theoretical.)
4. Cross-stack handling: Step 3a's non-JS fallback (Cargo.toml, pyproject.toml, etc.) just notes "Other (non-JS)" and asks the user. Doesn't try to derive build commands for those. Confirm this is the right level of effort for V1.

**Ambiguities raised:**
- None blocking. The audit + PM annotations were unusually complete; the implementation could proceed without ambiguity-resolution loops.

**No constraint violations:**
- `/preflight` and `/kickoff` untouched.
- Canonical `CLAUDE.md` template untouched.
- No monorepo handling beyond detect-and-refuse.
- No re-adopt handling beyond detect-and-warn-and-exit.
- Only authored `adopt.md`.
