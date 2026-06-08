---
description: Use when installing the framework into an existing codebase that already has code — onboards it by populating KBs from observation, auditing any existing docs, and merging CLAUDE.md. Run after the installer and /preflight on a brownfield repo; for an empty repo use /kickoff instead.
arguments:
  - name: minimal
    description: Skip the populate-KBs and existing-KB-audit steps; only verify framework files installed and do a lightweight CLAUDE.md merge (Reference Documents + Custom Commands tables).
    required: false
---

# Adopt — Existing-Repo Onboarding

**This is a conversation command.** No destructive change happens until you've approved each draft, audit decision, and merged section. Files only get written after explicit user OK.

`/adopt` is to existing-repo onboarding what `/kickoff` is to greenfield. Run it after the framework installer (`npx @insynq/app-blueprint init`) has dropped framework files into your repo. It reads your existing project state, drafts proposed populations for the project-state KBs, audits any existing user KBs against current code, and assists merging an existing `CLAUDE.md` with the framework template.

**Prerequisites:**
1. The framework installer must have run successfully (`.framework-version` should exist at the project root).
2. Ideally `/preflight` has run (writes the `## Environment` block to CLAUDE.md). If not, this command will prompt you to run it.
3. The repo should not be a monorepo (V1 limitation — see Step 1).

**If `--minimal` was passed:** skip the discovery flow (Step 4 KB drafts and Step 5 existing-KB audit). Still run Steps 1, 2, 3, 6 (lightweight merge), and 7. Reasoning: even minimal users need the framework's Reference Documents and Custom Commands tables in their CLAUDE.md, otherwise other slash commands (`/orchestrate`, `/ship`, etc.) will not know what's available.

---

## Step 0 — Welcome

Before anything else, deliver this welcome message. Reproduce it largely verbatim — light tone-matching is fine, don't paraphrase away the structure or the boundaries.

```
Welcome — /adopt is the existing-repo onboarding command. The framework's
files are installed; this command makes them fit your project. It will:

  1. Verify the install is complete and the project state is sane.
  2. Auto-derive your tech stack and build commands from package.json (and friends).
  3. Draft KB_1_Architecture, KB_7_UI_Patterns, and KB_9_Screen_Catalog from
     your repo structure — you approve before anything is written.
  4. Audit any existing /docs/KB_*.md files you have for staleness against the
     current codebase (file paths, hooks, components, tables).
  5. Merge your existing CLAUDE.md with the framework template, section by
     section, with a three-pane preview at every conflict. Your content wins
     on conflicts; original CLAUDE.md is backed up before any change.

Run with --minimal if you just want the commands installed without the
drafting and auditing flow (a lightweight CLAUDE.md merge still runs so the
other slash commands can find their references).

This is a conversation. I will not write or modify a file without your OK.
```

After delivering the welcome, proceed to Step 1. Don't wait for an explicit "ready?" — Step 1 is read-only verification and starts immediately.

---

## Step 1 — Sanity & Re-invocation Checks

Before anything, verify the repo is in a state that `/adopt` can work with. Each check is a hard gate or a warn-only signal as noted.

### 1a. Re-invocation detection (HARD GATE — exit if matched)

Check whether `/adopt` has already run on this project. Two markers indicate prior adoption:

- `CLAUDE.md.pre-adopt-backup` exists at the project root (proves Step 6's merge ran)
- Any file matching `docs/adopt-audit-*.md` exists (proves Step 5's audit log was written)

If either is present, **exit cleanly** with this message (don't treat as an error — the state is fine):

```
/adopt has already run on this project.

  Detected: <CLAUDE.md.pre-adopt-backup | docs/adopt-audit-YYYY-MM-DD.md>

V1 doesn't support re-running /adopt — re-adopt logic is deferred to V2. The
framework files are already in place and you can use the slash commands
normally.

If you genuinely need to re-run (e.g., framework version bumped and you want
to re-merge), delete BOTH markers:
  - rm CLAUDE.md.pre-adopt-backup
  - rm docs/adopt-audit-*.md

Then re-invoke /adopt. Your current CLAUDE.md is preserved as-is.
```

Stop. Do not proceed.

### 1b. Framework install verification (HARD GATE — exit if incomplete)

Verify the installer ran successfully:

1. `.framework-version` exists at the project root. If missing → exit:

   ```
   Framework not installed. Run `npx @insynq/app-blueprint init` first.
   ```

2. `.claude/commands/` exists and contains the framework commands. Glob `.claude/commands/*.md` and confirm at least 25 `.md` files (23 base + `/adopt` + `/update-framework`). If fewer:

   ```
   Framework files incomplete — found N command(s), expected 25+.
   Re-run `npx @insynq/app-blueprint init` to repair.
   ```

3. `docs/` contains all 9 stack-reference KB folders. Glob `docs/*KBs*` (covers `Supabase Structure KBs`, `Auth KBs`, etc., plus `UI-UX KBs`). Expect 9 folders. If fewer:

   ```
   Framework files incomplete — found N stack-reference KB folder(s), expected 9.
   Re-run `npx @insynq/app-blueprint init` to repair.
   ```

If any check fails, stop. Don't try to repair — that's the installer's job.

### 1c. Monorepo detection (HARD GATE — V1 limitation)

If any of these signals are present, treat the repo as a monorepo and exit with guidance:

- `pnpm-workspace.yaml` exists
- `package.json` has a top-level `"workspaces"` array
- `lerna.json` exists
- `nx.json` exists
- `turbo.json` exists at root

Message:

```
Monorepo detected (signal: <which file matched>).

V1 of /adopt does not support monorepos. The auto-derivation logic assumes
a single package.json at the root.

Workaround for V1:
  1. cd into the package you want to adopt (e.g., apps/web/)
  2. Confirm package.json + the framework files are accessible from there
  3. Re-run /adopt from that working directory

V2 will support monorepos with a --target-package flag.
```

Stop. Do not proceed.

### 1d. Environment block check (warn — non-blocking)

Read `CLAUDE.md`. Check whether it contains a `## Environment` section with populated values (not `[TODO]`). If missing or unpopulated, surface:

```
Note: CLAUDE.md doesn't have a populated ## Environment section yet.
That's normally written by /preflight. Recommended (but not required):
run /preflight in a fresh session before /adopt finishes, or after.
You can continue now and come back to it.
```

Don't block.

### 1e. Dirty git tree (warn — non-blocking)

Run `git status --porcelain`. If it returns non-empty output, surface:

```
Your git working tree has uncommitted changes:

<paste of git status --porcelain output>

/adopt is non-destructive (it only writes new files and creates a backup),
but your eventual `git diff` will show the install + adopt changes mixed
with whatever else is in your working tree. Consider committing or
stashing first, then re-running.

Continue anyway? [y/N]
```

If user says no, exit cleanly. If they say yes, proceed.

If git is unavailable (no `.git` directory or git command fails), skip this check silently and surface a one-line warning: "Note: git not available — backups are the only recovery path if anything goes sideways."

### 1f. Global command shadow re-detection (warn — non-blocking)

Glob `$HOME/.claude/commands/*.md`. For each match whose basename matches a framework command (`audit-code`, `audit-full`, `audit-infra`, `audit-rls`, `brainstorm`, `changelog`, `db-push`, `debug`, `gen-component`, `gen-migration`, `gen-test`, `implement`, `investigate`, `kickoff`, `orchestrate`, `plan`, `plan-review`, `preflight`, `research`, `ship`, `unify`, `update-kb`, `visualize`, `adopt`, `update-framework`), warn:

```
Found user-global command shadow(s) at ~/.claude/commands/:
  - <name>.md
  - <name>.md

These may shadow the project-local framework versions. Recommended:
rename ~/.claude/commands/ to ~/.claude/commands_legacy/ until you
confirm everything works, OR see docs/MULTI_AGENT_WORKFLOW.md for
multi-project hygiene.

Continue anyway? [Y/n]
```

Default to yes (Enter accepts). Don't block.

---

## Step 2 — Confirm Adopt Plan

After sanity checks pass, summarize what's about to happen. Wait for user confirmation before proceeding.

**If `$ARGUMENTS` includes `minimal`, present the minimal version:**

```
/adopt --minimal — discovery skipped

Plan:
  1. Verify framework files (done — Step 1).
  2. Lightweight CLAUDE.md merge:
     - Insert framework's Reference Documents block (the 9 stack-reference KBs)
     - Insert framework's Custom Commands table
     - Preserve everything else in your CLAUDE.md verbatim
     - Backup original to CLAUDE.md.pre-adopt-backup before any change
  3. Final summary.

Skipped:
  - KB_1 / KB_7 / KB_9 drafts (run /adopt without --minimal to populate)
  - Existing-KB audit (run /adopt without --minimal or audit manually)

Proceed? [Y/n]
```

**Otherwise (full mode), present:**

```
/adopt — full discovery flow

Plan:
  1. Sanity checks (done).
  2. Auto-derive tech stack and build commands from package.json + lockfiles.
  3. Draft KB_1_Architecture.md, KB_7_UI_Patterns.md, KB_9_Screen_Catalog.md
     from your folder structure. You approve each draft before it's written.
  4. Audit any existing /docs/KB_*.md files for staleness against the current
     codebase. Per-file triage: keep / update / archive / merge / diff / skip.
  5. Merge your CLAUDE.md with the framework template, section by section.
     Three-pane preview (yours / framework / proposed merge) at each conflict.
  6. Write docs/adopt-audit-YYYY-MM-DD.md as the durable record.

Time estimate: 5–15 minutes depending on how many existing KBs you have.

Proceed? [Y/n]
```

Default to yes (Enter accepts). If the user declines, exit cleanly.

**If declined:** print "OK — no changes made. Re-run /adopt when ready." and stop.

**If `$ARGUMENTS` includes `minimal`, after this confirmation jump directly to Step 6 (CLAUDE.md merge — lightweight branch).** Then Step 7. Skip Steps 3, 4, 5.

---

## Step 3 — Auto-Derive Tech Stack & Build Commands

Goal: produce a draft `## Tech Stack` and `## Build Commands` block from observable signals, never from inference. Cite the source for every line ("from package.json#dependencies.next" etc.) so the user can verify.

This step **does not write any file yet** — it produces a draft to use in Step 4 (KB drafts) and Step 6 (CLAUDE.md merge).

### 3a. Read deterministic signal files

Read only these files (don't whole-tree scan — token budget):

- `package.json` (if present)
- `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`, `package-lock.json` — detect via Glob, infer package manager
- `tailwind.config.ts` / `tailwind.config.js` (presence only)
- `components.json` (shadcn config — presence only)
- `supabase/config.toml` (presence only)
- `.env.example` (read top-to-bottom for env var names; do NOT parse values)
- `next.config.ts` / `next.config.js` / `next.config.mjs` (presence only)
- `vite.config.ts` / `vite.config.js` (presence only)
- `.vercel/project.json`, `netlify.toml`, `fly.toml`, `wrangler.toml`, `railway.json`, `Dockerfile` (presence only)
- `.github/workflows/*.yml` (Glob; if any, list filenames)
- `app/` directory existence, `pages/` directory existence
- `supabase/migrations/*.sql` (Glob; collect filenames only — don't parse SQL)

**Fallback when no `package.json`:** check for `Cargo.toml` (Rust), `pyproject.toml` / `requirements.txt` (Python), `go.mod` (Go), `Gemfile` (Ruby). Mark stack as "Other (non-JS)" and surface what was detected. Skip the auto-derived build commands; ask the user.

### 3b. Map dependencies → stack labels

Walk `package.json#dependencies` AND `package.json#devDependencies` and apply this deterministic table. Use it verbatim — no inference beyond what's listed:

| Dependency signal | Stack label / KB hint |
|---|---|
| `next` | Next.js (App Router if `app/` directory exists, else Pages Router — check disk) |
| `react` (without `next`) | React (Vite if `vite.config.*` exists, CRA if `react-scripts`, else "React + custom") |
| `vue` / `nuxt` | Vue / Nuxt |
| `svelte` / `@sveltejs/kit` | Svelte / SvelteKit |
| `@supabase/supabase-js` or `supabase/config.toml` exists | Supabase (DB, auth, edge functions, storage) |
| `@clerk/nextjs` / `@auth/nextjs` / `next-auth` | Auth provider name |
| `stripe` / `@stripe/stripe-js` | Stripe billing |
| `tailwindcss` | Tailwind CSS |
| `@radix-ui/*` or `components.json` exists | shadcn/ui (radix primitives) |
| `react-hook-form` / `zod` | Forms (RHF + Zod) |
| `@vercel/*` or `.vercel/` directory exists | Vercel hosting |
| `express` / `fastify` / `hono` | Backend framework |
| `drizzle-orm` / `@prisma/client` / `kysely` | ORM |
| `vitest` / `jest` / `playwright` | Test stack |
| `resend` / `@sendgrid/mail` / `postmark` | Email transactional |

For each match, capture the version: read `package.json#dependencies[X]` value verbatim, strip leading `^` or `~`. Surface the version in the draft.

### 3c. Derive build commands (lockfile-aware)

Read `package.json#scripts`. Map known script names → KB fields:

- `scripts.build` → `Build:`
- `scripts.dev` (preferred) or `scripts.start` → `Dev server:`
- `scripts.typecheck` / `scripts.tsc` / `scripts.check` → `Type check:` (fallback to `npx tsc --noEmit` if `typescript` is a dependency but no script matches)
- `scripts.test` → `Test:` (only include if a test stack is present per 3b)
- `scripts.lint` → `Lint:`
- `scripts.format` → `Format:`

**Package manager prefix (lockfile-aware):**

- If `pnpm-lock.yaml` exists → `pnpm <script>`
- Else if `bun.lockb` exists → `bun <script>` (or `bun run <script>` for non-builtins; default to `bun run`)
- Else if `yarn.lock` exists → `yarn <script>`
- Else (default) → `npm run <script>`

### 3d. Build the draft block

Assemble a draft like this (concrete example for a Next.js + Supabase repo):

```markdown
## Tech Stack (auto-derived — please confirm)
- Frontend: Next.js 15.0.0 (App Router) — package.json
- UI library: shadcn/ui via @radix-ui/react-* primitives — components.json + package.json
- Styling: Tailwind CSS 3.4.0 — package.json + tailwind.config.ts
- Backend: Supabase (DB, auth, storage, realtime) — supabase/config.toml + @supabase/supabase-js
- Auth: @supabase/auth-helpers-nextjs — package.json
- Billing: Stripe — package.json
- Hosting: Vercel — .vercel/project.json present
- CI/CD: GitHub Actions — .github/workflows/ci.yml
- Tests: Vitest + Playwright — package.json

## Build Commands (auto-derived — please confirm)
- Type check: `npx tsc --noEmit`
- Dev server: `pnpm dev`
- Build: `pnpm build`
- Test: `pnpm test`
- Lint: `pnpm lint`
```

### 3e. Show draft and get approval

Print the draft and ask:

```
Tech stack & build commands draft (auto-derived from package.json):

<draft block>

Anything wrong, missing, or that you want to add? You can:
  - Confirm as-is: just say "looks good" or hit Enter
  - Edit: paste the corrected version (or describe what to change)
  - Add notes: e.g., "we also use Sentry but it's not in package.json yet"
```

Wait for user input. If they correct anything, update the draft. Hold the approved draft in working memory — it's used by Step 4 (KB drafts) and Step 6 (CLAUDE.md merge).

---

## Step 4 — Draft Project-State KBs

> **If `$ARGUMENTS` includes `minimal`, skip this entire step.** Jump to Step 6.

Goal: write proposed contents for `KB_1_Architecture.md`, `KB_7_UI_Patterns.md`, and `KB_9_Screen_Catalog.md` based on auto-detection from the repo. **Show each draft to the user before writing.** Never write KB content without explicit approval.

`KB_8_Current_State.md` is left as the framework template (it's session-state; nothing to auto-derive).

`APP_CONCEPT.md` and `SCOPE.md` are **never auto-drafted** by `/adopt`. They require user discovery (problem statement, user types, success criteria, V1 scope, out-of-scope). Auto-derivation would produce noise. Mention this at the end of Step 4 and offer to run a kickoff-style mini-session for them.

### 4a. KB_1_Architecture draft

Read existing `docs/KB_1_Architecture.md` to detect whether it's the empty framework template or the user has populated it. If populated (more than the boilerplate `[TODO]` markers — heuristic: file contains substantive content beyond the section headings), surface:

```
docs/KB_1_Architecture.md already has content. Options:
  [d]raft a new version anyway (you'll see both in side-by-side)
  [s]kip — keep your existing KB_1 untouched
  [a]ppend auto-derived content as a new section at the bottom

Choice [s]:
```

Default skip. If [d]raft, build the draft below and show side-by-side. If [a]ppend, add the auto-derived block as a new `## Auto-Derived Findings (added by /adopt)` section.

If `KB_1_Architecture.md` is the framework template (mostly `[TODO]` markers), proceed straight to drafting.

**Draft structure:**

1. **Tech Stack section** — populate from Step 3's approved draft. Include version numbers and citations.

2. **Patterns Needed section** — infer from Step 3a signals:
   - Supabase detected → "Auth, RLS, multi-tenant queries, edge functions"
   - Stripe detected → "Subscription billing, webhooks, customer portal"
   - `next-auth` / Clerk detected → "Authentication"
   - `@vercel/blob` / S3 / GCS / `@supabase/storage-js` detected → "File storage"
   - `pg_cron` migration filenames or `inngest` / `trigger.dev` deps → "Background jobs"
   - `resend` / `@sendgrid/mail` / `postmark` → "Email transactional"

3. **Data Model (Draft)** — if `supabase/migrations/` exists, parse migration filenames for table names (e.g., `20240101_create_users_table.sql` → `users`). List discovered tables. **Do not parse SQL** — that's V2. List filenames as evidence and ask the user to confirm + add relationships. Add a caveat: "Auto-derived from migration filenames. If your project edits the DB via Studio UI, this list is incomplete — please add."

4. **Deployment & Infrastructure** — infer hosting from `.vercel/`, `netlify.toml`, `fly.toml`, `wrangler.toml`, `railway.json`, `Dockerfile`. CI from `.github/workflows/*.yml`. **Required env vars** from `.env.example` (read top-to-bottom, list keys; do not parse values). External deps from Step 3b matches.

5. **Architecture Decisions / Open Questions** — leave empty. These require user judgment, not derivation.

**Concrete sketch — show this to the user as the draft:**

```markdown
# KB 1 — Architecture

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
- File storage (Supabase Storage detected via @supabase/storage-js)
- Subscription billing (Stripe webhooks + customer portal)
- Email transactional (Resend via package.json)

## Data Model (Draft — derived from migration filenames)
Tables found in supabase/migrations/:
- users, organizations, projects, invoices, webhooks_log

> [TODO — confirm relationships and add any tables created via Studio UI.
>  Auto-derivation from filenames misses tables created interactively.]

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

Show the draft and ask:

```
KB_1_Architecture.md draft above. Action:
  [a]ccept — write this draft to docs/KB_1_Architecture.md
  [e]dit — paste corrections or describe what to change
  [s]kip — leave docs/KB_1_Architecture.md untouched (uses framework template)

Choice [a]:
```

If [a], write the file. If [e], iterate until user accepts. If [s], note for the audit log and move on.

### 4b. KB_7_UI_Patterns draft

Detect signals only; **don't fabricate patterns**:

- `tailwind.config.*` exists → seed Part 1 → "Styling Conventions: Tailwind CSS — utility-first, CSS variables for theming"
- `components.json` (shadcn config) exists → seed → "Design System: shadcn/ui (radix-based primitives, copied into src/components/ui/)"
- `src/components/` directory exists → seed file structure note pointing at it
- `react-hook-form` + `zod` → seed Forms section → "react-hook-form + Zod (resolver-based validation)"
- All other Part 1 fields → leave as `[TODO — confirm during /adopt]`

**Do not auto-fill component or hook catalogs.** They populate as `/gen-component` is used.

Read existing `docs/KB_7_UI_Patterns.md`. Same skip / draft / append flow as 4a.

Show the draft (smaller than KB_1 — most fields are `[TODO]`) and ask the same a/e/s question.

If the project type (per Step 3a) is "non-UI" (CLI, API, library, research pipeline), surface:

```
KB_7_UI_Patterns.md doesn't apply to this project type — it's for UI apps.
Skipping.
```

### 4c. KB_9_Screen_Catalog draft

If `app/` (App Router) or `pages/` (Pages Router) exists, walk the route tree. List routes only — no objectives, no roles (those need user input). For App Router, glob `app/**/page.tsx`. For Pages Router, glob `pages/**/*.tsx` (excluding `_app.tsx`, `_document.tsx`, `api/`).

Format each route:

```markdown
### / (home)
- **Route:** `/`
- **File:** `app/page.tsx`
- [TODO — fill in roles, objective, sections, actions]

### /dashboard
- **Route:** `/dashboard`
- **File:** `app/dashboard/page.tsx`
- [TODO ...]
```

If no obvious framework router → leave the file empty with note: "Auto-detection couldn't find a route tree; populate manually."

Same skip / draft / append flow as 4a. Show the draft and ask a/e/s.

If non-UI project, surface "skipping — KB_9 doesn't apply" and move on.

### 4d. APP_CONCEPT.md and SCOPE.md offer

After the auto-drafted KBs are written (or skipped), surface:

```
docs/APP_CONCEPT.md and docs/SCOPE.md require discovery (problem statement,
users, success criteria, V1 scope, out-of-scope). I can't auto-derive
these — they need your input.

Options:
  [k]ickoff — run a kickoff-style mini-session now (~10 min) to populate them
  [l]eave — leave the framework templates with [TODO] markers; fill in later
  [s]kip — same as leave

Choice [l]:
```

Default leave. If [k], guide the user through Phase 1 (problem) and Phase 3 (scope) of `/kickoff` inline — don't run the actual `/kickoff` command, just walk the questions in this command and write the same `docs/APP_CONCEPT.md` and `docs/SCOPE.md` structures kickoff produces. (Reference the kickoff file structure at `kickoff.md` Step 2 if needed.) If [l] or [s], move on.

---

## Step 5 — Audit Existing User KBs

> **If `$ARGUMENTS` includes `minimal`, skip this entire step.** Jump to Step 6.

Goal: surface every `docs/KB_*.md` (and any user-authored docs in `/docs/`) that's not framework-managed, then check whether the symbols/files/hooks/tables it references still exist in the current codebase. Bucket each file by staleness, then ask the user per-file what to do.

### 5a. Discover candidate user KBs

Glob `docs/KB_*.md`. Filter out framework-managed files:

```
Framework-managed (per .framework-manifest.json):
  - docs/KB_1_Architecture.md      (hybrid — adopter content goes here)
  - docs/KB_7_UI_Patterns.md       (hybrid)
  - docs/KB_8_Current_State.md     (hybrid)
  - docs/KB_9_Screen_Catalog.md    (hybrid)
  - docs/KB_INDEX.md               (framework-managed)
```

Everything else matching `docs/KB_*.md` is a "user KB candidate."

**Also broaden to `docs/*.md`** that's not in `.framework-manifest.json` categories (skip `docs/AI KBs/`, `docs/Auth KBs/`, etc. directories — those are framework-managed). Skip `APP_CONCEPT.md`, `SCOPE.md`, `CHANGELOG.md`, `LESSONS.md`, `MULTI_AGENT_WORKFLOW.md`, `smoke-tests-pending.md`. Anything else under `docs/` (root level) is a candidate.

If there are docs in `docs/<other-folder>/` that are NOT in the manifest's framework-managed folders, surface them in a separate "Found these docs/ subfolders I didn't audit — want me to look at any?" prompt at the end (5e).

Show the discovered list:

```
Found N candidate user KBs to audit:
  - docs/KB_2_OldArch.md
  - docs/KB_3_DataModel.md
  - docs/KB_4_API.md
  - docs/KB_5_Auth.md
  - ...

Audit all? [Y/n] (Or pick a subset by number — e.g., "1,3,5".)
```

Default yes. If user picks subset, narrow the list. If empty list (no candidates found), skip to Step 6 with note: "No user-authored KBs detected — nothing to audit."

### 5b. Reference extraction (per file)

For each user KB, extract every "checkable claim" — symbols and references that can be verified against the codebase:

- **File paths** — match regex `(src|supabase|app|pages|components|hooks|lib|tests?|server|api)/[\w/.\-]+\.(ts|tsx|js|jsx|sql|md)`
- **Component names** — `<PascalCase>` in code blocks AND PascalCase strings in headings/lists (filter common words: "TODO", "API", "URL", "DB", "UI", "SQL", "JSON", "HTTP", "REST", "RBAC", "RLS")
- **Hook names** — regex `use[A-Z]\w+`
- **Table names** — regex `from\(['"][\w_]+['"]\)` (Supabase) and bare snake_case identifiers in DB-flavored sections (heuristic: section heading contains "table", "schema", "data model", "migration")
- **Function/symbol names** — `function (\w+)`, `const (\w+) =`, `export (?:default |const |function )(\w+)`
- **API endpoints / route paths** — `/api/[\w/-]+`, `/[\w-]+/[\w-]+`

Capture file:line for each claim so the audit can cite the original.

### 5c. Cross-reference scan via Explore subagent

For each user KB with extracted claims, **spawn a Task with `subagent_type: Explore`** to do the cross-reference scan. This reuses the `/investigate` pattern (read `investigate.md` if you need a refresher on Explore subagent setup).

**Subagent prompt template:**

```
# Codebase Stale-Reference Audit

Audit document: docs/KB_X_OldKB.md

## Task

For each "checkable claim" extracted (passed in the prompt as a list),
verify whether it still exists in the codebase as described.

Claims to verify:
- File path: src/components/UserAvatar.tsx (referenced in KB_X line 47)
- Hook name: useUserSession (referenced in KB_X line 89)
- Table name: legacy_users (referenced in KB_X line 124)
- Component name: UserBadge (referenced in KB_X line 156)
- API endpoint: /api/legacy/auth (referenced in KB_X line 201)
- ...

## Verification protocol

For each claim:

1. **File path:** test if the file exists at that path. If not, search
   for similarly-named files via Glob — report best match (e.g.,
   "src/components/Avatar.tsx" if "UserAvatar.tsx" was renamed).

2. **Hook / function / component name:** Grep for the symbol. If found
   in current code, mark CURRENT. If not found anywhere, mark MISSING.
   If found at a different file path than the KB claims, mark MOVED
   with the new location.

3. **Table name:** Grep `supabase/migrations/*.sql` for `CREATE TABLE`.
   If not found, mark MISSING. (Don't try to read DB live — migrations
   are the source of truth.)

4. **API endpoint:** Grep route definitions (Next.js: `app/**/route.ts`,
   `pages/api/**/*`; Express/Fastify equivalents in lib/server code).

## Output (markdown table per file)

| Claim | Status | Evidence |
|---|---|---|
| src/components/UserAvatar.tsx | MOVED | Found at src/components/profile/Avatar.tsx |
| useUserSession | MISSING | Not found in codebase |
| legacy_users table | MISSING | Not found in supabase/migrations/ |
| UserBadge | CURRENT | Found at src/components/UserBadge.tsx |
| /api/legacy/auth | MISSING | No matching route file |

Read-only. Don't modify files. Return only the table.
```

The Explore subagent runs read-only and returns the markdown table. Integrate the result.

**If a KB has zero checkable claims** (pure prose, no code references), don't dispatch the subagent — just mark the KB's bucket as "Orphaned (no verifiable references)" directly.

### 5d. Bucket each KB

Tally per file:

```
total_claims = number of extracted checkable claims
stale_count  = MISSING + MOVED count   (MOVED counts as stale because the doc is now wrong)
stale_pct    = stale_count / total_claims  (if total > 0)
```

**Bucketing thresholds:**

| Stale percentage | Bucket | Default action |
|---|---|---|
| `stale_pct == 0` | Current | keep |
| `0 < stale_pct <= 30%` | Partially Stale | update |
| `30% < stale_pct <= 70%` | Mostly Stale | update |
| `stale_pct > 70%` OR `total_claims == 0` | Orphaned | archive |

**"Too few claims" caveat:** if `total_claims < 3`, treat as Current with a low-confidence note: "[FILE] has only N checkable claims; treating as Current with low confidence."

### 5e. Per-file triage UX (summary table first, then per-file decisions)

Print the summary table first — give the user the whole picture before any decisions:

```
## Existing KB Audit — N files reviewed

| # | File | Bucket | Stale | Total | Default action |
|---|---|---|---|---|---|
| 1 | KB_2_OldArch.md   | Orphaned        | 12/12 | 12 | archive |
| 2 | KB_3_DataModel.md | Mostly Stale    | 8/11  | 11 | update  |
| 3 | KB_4_API.md       | Partially Stale | 2/15  | 15 | update  |
| 4 | KB_5_Auth.md      | Current         | 0/9   | 9  | keep    |
| 5 | KB_6_Notes.md     | Orphaned        | 0/0   | 0  | archive (no checkable references) |
```

Then prompt per-file in sequence. For each file, print stale references inline (so the user has context) before asking for the action:

```
─── KB_3_DataModel.md (Mostly Stale, 8/11 stale) ───

Stale references:
  Line 47:  src/db/schemas/users.ts        → MISSING (no such file)
  Line 89:  legacy_users table             → MISSING (no migration found)
  Line 124: usePostgrest hook              → MOVED to src/lib/db/usePostgrest.ts
  Line 156: AuthContext                    → MISSING (renamed to SessionProvider?)
  Line 201: /api/users/legacy              → MISSING (no matching route)
  ... 3 more

Current references (still valid):
  Line 12: organizations table → CURRENT
  Line 78: useOrgRoles hook → CURRENT
  Line 99: src/lib/db/index.ts → CURRENT

Action: [k]eep / [u]pdate / [a]rchive / [m]erge / [d]iff / [s]kip [u]:
```

The default in brackets is bucket-driven. Just hitting Enter accepts the default.

**Action mappings:**

- **keep (k)** — no-op. Note in the audit log.
- **update (u)** — emit a TODO list at the top of the file pointing at stale lines. Format:

  ```markdown
  > **/adopt staleness report — YYYY-MM-DD**
  > This KB has stale references against the current codebase. Review and
  > update or archive sections referencing these:
  > - Line 47: src/db/schemas/users.ts → MISSING
  > - Line 89: legacy_users table → MISSING
  > - ...
  > Re-run /adopt on a future framework version to re-audit.

  [original KB content begins here]
  ```

  Insert this block above the existing first line of the file. Don't modify the rest.

  Alternative: if the user prefers, write the staleness report to a sibling file `docs/KB_X.staleness-report.md` and leave the original untouched. Surface this option:

  ```
  Update mode: [t]op-of-file (default) / [s]ibling report file
  ```

- **archive (a)** — move file to `docs/archive/<original-filename>` (create the directory if needed). Prepend this header:

  ```markdown
  > **Archived during /adopt on YYYY-MM-DD.**
  > Content was [Mostly Stale / Orphaned] against the codebase at adoption time.
  > Stale references at archive time:
  > <inline staleness report from 5c>
  >
  > Restored by moving back to docs/ and pruning this header.

  [original KB content begins here]
  ```

- **merge (m)** — propose a target framework KB (KB_1 if architecture-flavored, KB_7 if UI-flavored, etc.). Show side-by-side draft (target framework KB current content + the merge proposal). User approves. **Only enable for files bucketed Current or Partially Stale** — don't merge stale content into framework KBs. If the user picks merge on a Mostly Stale or Orphaned file, refuse with: "This KB is too stale to safely merge. Update or archive first; merge later in a follow-up /adopt run after V2 ships re-adopt support." (Or accept and warn — your call; default is refuse.)

- **diff (d)** — print the staleness table again with surrounding context lines from the KB (5 lines above and below each stale reference). Then re-prompt for action.

- **skip (s)** — defer the decision. Note in the audit log with status "deferred."

After each file, move to the next. Stop when all are processed.

### 5f. Surface untouched docs

If 5a found docs in `docs/<other-folder>/` that aren't framework-managed and weren't in the audit candidate list, surface them:

```
Found additional docs/ files I didn't audit:
  - docs/legacy/old-spec.md
  - docs/internal/onboarding.md
  - docs/process/release-checklist.md

Want me to audit any? [list numbers, or "n" to skip]
```

If user opts in, run 5b–5e on those files.

### 5g. Audit log

Write `docs/adopt-audit-YYYY-MM-DD.md` summarizing all decisions. Use today's actual date. Format:

```markdown
# /adopt audit — YYYY-MM-DD

Generated by `/adopt` on YYYY-MM-DD.

## Summary

- Project: <repo basename>
- Framework version: <read from .framework-version>
- KBs reviewed: N
- KBs kept: N | updated: N | archived: N | merged: N | skipped: N

## Tech stack auto-derived

<paste of approved Step 3 draft>

## KB triage decisions

| File | Bucket | Stale ratio | Action | Result |
|---|---|---|---|---|
| KB_2_OldArch.md   | Orphaned        | 12/12 | archive | Moved to docs/archive/KB_2_OldArch.md |
| KB_3_DataModel.md | Mostly Stale    | 8/11  | update  | TODO list inserted at top |
| KB_4_API.md       | Partially Stale | 2/15  | update  | Sibling staleness report written |
| KB_5_Auth.md      | Current         | 0/9   | keep    | No change |

## Project-state KB drafts written

- docs/KB_1_Architecture.md — written / skipped (kept existing) / appended
- docs/KB_7_UI_Patterns.md  — written / skipped / appended / N/A (non-UI project)
- docs/KB_9_Screen_Catalog.md — written / skipped / appended / N/A

## CLAUDE.md merge

- Backup at: CLAUDE.md.pre-adopt-backup
- Mode: section-by-section (or wrap fallback if applicable)
- Sections refreshed from framework: Reference Documents, Custom Commands, KB Maintenance
- Sections preserved verbatim: Overview, Tech Stack, Build Commands, Roles, Core Entities, Current Phase, Patterns, Preferences, DO NOT
- Sections inserted from framework: <list>

## Notes

<any warnings, deferred decisions, or follow-up items>
```

Write this file at the end of Step 5. It also serves as the re-invocation marker (Step 1a).

---

## Step 6 — Merge CLAUDE.md

Goal: reconcile the user's existing `CLAUDE.md` with the framework template, section by section. Always backup first. Always show drafts before writing. Project content wins on conflicts.

### 6a. Backup

Before any merge work:

1. Read existing `CLAUDE.md` from the project root.
2. Read `CLAUDE.md.framework` (the sibling file the installer wrote — this is the framework template). If `CLAUDE.md.framework` doesn't exist, surface:

   ```
   CLAUDE.md.framework not found. The installer should have written this
   sibling file. Re-run `npx @insynq/app-blueprint init` to repair, or
   skip this step ([s]) and merge manually later.

   Choice: [r]e-install / [s]kip Step 6 / [a]bort:
   ```

   Default `r`. If skip, jump to Step 7 with note in the audit log.

3. Copy `CLAUDE.md` → `CLAUDE.md.pre-adopt-backup`. Confirm to user:

   ```
   Backed up your CLAUDE.md to CLAUDE.md.pre-adopt-backup. Original is safe.
   ```

### 6b. Detect heading overlap (decide normal merge vs. wrap fallback)

Parse both `CLAUDE.md` and `CLAUDE.md.framework` for `## H2` headings.

Framework's expected H2 set:

```
## Environment
## Overview
## Tech Stack
## Build Commands
## Roles
## Core Entities
## Reference Documents
## Current Phase
## Patterns
## Preferences
## Custom Commands
## KB Maintenance
## DO NOT
```

Count overlap with the user's H2 headings. If `user_heading_overlap < 3`, fall back to **wrap mode** (6e). Otherwise, do **section-by-section merge** (6c).

### 6c. Section-by-section merge (default path)

**If `$ARGUMENTS` includes `minimal`, only process the framework-owned sections (Reference Documents, Custom Commands, KB Maintenance). Skip the project-owned section walk.**

For each H2 section in the framework template, in framework order:

#### Framework-owned sections (always refresh from template):

These contain framework infrastructure that updates with each framework version. Always insert/refresh from the framework version:

- `## Reference Documents`
- `## Custom Commands`
- `## KB Maintenance`

For these, the rule is: **take the framework version verbatim** (no three-pane preview needed unless the user has substantive content under that heading that would be lost — in which case show a three-pane).

Detection: if the user's section content is non-empty AND not already a subset of the framework version, show a three-pane preview (6d). Otherwise just refresh silently and add to the "Sections preserved unchanged from framework: …" summary.

#### Project-owned sections (preserve user content; insert from framework only if user lacks the section):

- `## Overview`
- `## Tech Stack` — **cross-check vs. Step 3 derivation; warn if mismatch**
- `## Build Commands` — same cross-check
- `## Roles`
- `## Core Entities`
- `## Current Phase`
- `## Patterns`
- `## Preferences`
- `## DO NOT`

For these, the rule is:

- User has matching H2 with content → **preserve verbatim**, but cross-check (Tech Stack and Build Commands) against Step 3's auto-derived draft. If they disagree (e.g., user wrote "Next.js 14" but `package.json` says 15), surface a warning and ask:

  ```
  ## Tech Stack mismatch:
    Your CLAUDE.md says:        - Frontend: Next.js 14
    Auto-derived (package.json): - Frontend: Next.js 15.0.0

  Action: [k]eep yours / [u]pdate to auto-derived / [m]erge (paste edited version)
  ```

- User has matching H2 but it's empty / `[TODO]` only → insert framework version (with auto-derived content from Step 3 if applicable, e.g., Tech Stack and Build Commands).

- User has no matching H2 → insert framework section with `[TODO]` markers (or auto-derived content if Step 3 produced one).

#### Cross-referenced section (`## Environment`):

Handled by `/preflight`, not `/adopt`. If missing, prompt:

```
Your CLAUDE.md doesn't have a populated ## Environment section. That's
written by /preflight. Recommended: run /preflight in a separate session
after /adopt completes.

For now, I'll insert a [TODO] placeholder block. /preflight will overwrite it.
```

Insert the placeholder:

```markdown
## Environment
[TODO — run /preflight to populate this. Captures which AI agent, OS, and shell are being used.]
```

#### Project-specific sections in user's CLAUDE.md NOT in framework template:

Preserve verbatim. Append to the bottom of the new CLAUDE.md under:

```markdown
## Project-Specific Sections (preserved during /adopt)

[Verbatim copy of user's H2 sections that aren't in the framework template.]
```

Don't try to merge them into framework sections — they're project content.

### 6d. Three-pane preview (per section that needs reconciliation)

For each section where there's an actual conflict (user has content + framework wants to refresh, or framework-owned section needs reconciliation), show:

```
─── Section: ## Reference Documents ───

YOUR VERSION (CLAUDE.md.pre-adopt-backup):
[paste of user's section content]

FRAMEWORK VERSION (CLAUDE.md.framework):
[paste of framework's section content]

PROPOSED MERGE:
[reconciled version — typically: framework version verbatim for framework-owned
 sections; user version preserved for project-owned sections; auto-derived
 inserted into [TODO] slots where applicable]

Action: [a]ccept / [e]dit / [k]eep mine / [f]orce framework / [s]kip section
```

- **accept (a)** — write the proposed merge for this section.
- **edit (e)** — let the user paste a corrected version, then accept that.
- **keep mine (k)** — preserve the user's version verbatim. Note in the audit log; warn if it's a framework-owned section ("Custom Commands table won't reflect /adopt and /update-framework — other slash commands may not know about them.").
- **force framework (f)** — overwrite with the framework version. Warn if it's a project-owned section ("This will replace your custom Overview / Roles / etc. with the framework template.").
- **skip section (s)** — leave the user's version verbatim with no merge. Note in audit log.

For sections with **no conflict** (user has it, framework matches, nothing to do), don't show three-pane — include in a top-of-merge summary:

```
Sections preserved unchanged: ## Patterns, ## DO NOT, ## Preferences
Sections inserted from framework (you didn't have these): ## KB Maintenance
Sections refreshed from framework: ## Reference Documents, ## Custom Commands
Sections needing your decision: ## Overview, ## Tech Stack
```

### 6e. Wrap mode (fallback when user CLAUDE.md is wildly different)

Triggered when user CLAUDE.md has < 3 framework H2 headings. The user's structure is too different to merge section-by-section without losing things.

Behavior:

1. Write the framework template fresh as the new `CLAUDE.md`.
2. Append the user's entire original CLAUDE.md content under a new section:

   ```markdown
   ---

   ## Project-Specific Notes (preserved from previous CLAUDE.md)

   The previous CLAUDE.md didn't follow the framework structure, so its content
   has been preserved verbatim below. You can manually re-integrate sections
   into the framework structure above as needed.

   ---

   [verbatim original CLAUDE.md content]
   ```

3. Surface to user:

   ```
   Your CLAUDE.md doesn't follow the framework structure (only N of the 13
   framework H2 headings overlap). I've used "wrap mode": the framework
   template is now the top of your CLAUDE.md, and your original content is
   preserved verbatim at the bottom under "## Project-Specific Notes".

   Original backup at CLAUDE.md.pre-adopt-backup.

   You can re-integrate sections later by copy-pasting from the bottom into
   the matching framework sections (Overview, Tech Stack, etc.).
   ```

### 6f. Lightweight merge (`--minimal` mode)

If `$ARGUMENTS` includes `minimal`, the merge is minimal:

1. Backup as 6a.
2. Read user's CLAUDE.md and framework template.
3. Insert/refresh ONLY these two sections:
   - `## Reference Documents` — refresh from framework (overwrite user's if exists).
   - `## Custom Commands` — refresh from framework.
4. Preserve everything else verbatim.
5. Skip three-pane preview unless there's a substantive user-authored block under `## Reference Documents` or `## Custom Commands` that would be lost — in which case show a single three-pane and ask.

The result: framework's structural anchors are present so other slash commands work, but no aggressive reconciliation happens.

### 6g. Write merged CLAUDE.md and clean up

After all sections are decided:

1. Assemble the final merged `CLAUDE.md` content.
2. Show the user a final preview:

   ```
   Final CLAUDE.md preview (N lines, K sections):

   <truncated preview — first 50 lines + section headings>

   Write? [Y/n] (or [d]iff against backup)
   ```

3. On confirmation, write `CLAUDE.md`.
4. **Delete `CLAUDE.md.framework`** (the installer's sibling file). It served its purpose; leaving it lingers as confusing artifact. Note in audit log: "Cleaned up CLAUDE.md.framework after merge."
5. Confirm:

   ```
   Wrote CLAUDE.md (N lines).
   Backup at CLAUDE.md.pre-adopt-backup (your original).
   Removed CLAUDE.md.framework (no longer needed).
   ```

---

## Step 7 — Final Summary & Handoff

Print a single summary that names the artifacts created and the recommended next steps.

**If full mode:**

```
/adopt complete.

Files written:
  - CLAUDE.md (merged — backup at CLAUDE.md.pre-adopt-backup)
  - docs/KB_1_Architecture.md (auto-derived draft, approved)
  - docs/KB_7_UI_Patterns.md (skipped — non-UI / signals only / your choice)
  - docs/KB_9_Screen_Catalog.md (auto-derived from app/ routes)
  - docs/adopt-audit-YYYY-MM-DD.md (durable record of all decisions)

KB triage:
  - N kept | N updated | N archived | N merged | N skipped

Cleanup:
  - Removed CLAUDE.md.framework (no longer needed; installer's sibling file)

Recommended next steps:
  1. Review CLAUDE.md and the project-state KBs — correct anything that
     doesn't feel right.
  2. If you skipped APP_CONCEPT.md / SCOPE.md, fill them in when ready
     (kickoff-style discovery, ~10 minutes each).
  3. Run /preflight in a fresh session if you haven't already (writes the
     ## Environment block to CLAUDE.md).
  4. /brainstorm or /plan when you're ready to start your next feature.

Re-running /adopt:
  V1 doesn't support re-running /adopt on an already-adopted project. If
  the framework releases a new version with structural changes, /update-framework
  (separate command) handles that.
```

**If `--minimal` mode:**

```
/adopt --minimal complete.

Verified:
  ✓ .framework-version present (v<version>)
  ✓ .claude/commands/ has N framework commands
  ✓ docs/ has 9 stack-reference KB folders

Updated:
  ✓ CLAUDE.md — inserted Reference Documents + Custom Commands sections
                (your other content preserved; backup at CLAUDE.md.pre-adopt-backup)

Skipped (--minimal):
  - KB_1 / KB_7 / KB_9 drafts (run /adopt without --minimal to populate)
  - Existing-KB audit (run /adopt without --minimal or audit manually)

Cleanup:
  - Removed CLAUDE.md.framework (no longer needed)

Run /preflight if you haven't already (Environment block missing in CLAUDE.md).
```

Then stop. Don't proceed into `/kickoff` or any other command — those are separate user-initiated commands.

---

## Boundaries with the Installer

For reference (don't act on this — it's documentation of the contract):

| Action | Owner |
|---|---|
| Write framework files (`.claude/commands/*`, `docs/[KB folders]/*`) | Installer |
| Write `.framework-version` | Installer |
| Write `CLAUDE.md.framework` (sibling) when user has CLAUDE.md | Installer |
| Detect user-global command shadows (pre-flight) | Installer |
| Write `CLAUDE.md` (the merged version) | `/adopt` |
| Backup `CLAUDE.md` → `CLAUDE.md.pre-adopt-backup` | `/adopt` |
| Re-detect global command shadows (warn-only) | `/adopt` |
| Populate KB_1 / KB_7 / KB_9 with project content | `/adopt` |
| Audit existing user KBs | `/adopt` |
| Verify framework files present (sanity check) | `/adopt` |
| Delete `CLAUDE.md.framework` after merge | `/adopt` |

`.framework-version` is the shared "framework installed?" signal:
- Installer refuses to install if it already exists.
- `/adopt` requires it before running (Step 1b).

`CLAUDE.md.framework` is the boundary handoff:
- Installer writes it as a sibling when user already has `CLAUDE.md`.
- `/adopt` reads it during Step 6 merge, then deletes it after successful merge (Step 6g).

No write collisions.

---

## V1 Limitations (Document for User Awareness)

- **Monorepo support:** not in V1. Detected and refused early (Step 1c).
- **Re-adopt:** not in V1. Detected and refused early (Step 1a). Use `/update-framework` for framework version bumps.
- **Live-DB schema parsing:** Step 4a's data model draft reads migration filenames only. Tables created via Studio UI (no migration file) won't appear. Caveat is surfaced in the draft.
- **Non-JS stacks:** Step 3a falls back to "Other (non-JS)" detection from `Cargo.toml`, `pyproject.toml`, etc. Build commands are left as `[TODO — ask user]`. The framework structure works regardless of stack.
- **Single-language assumption:** Step 3 surfaces only one primary stack. Multi-language repos (Python + JS) get listed but the Tech Stack draft picks one as primary. User can correct.
