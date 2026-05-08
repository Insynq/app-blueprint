# Phase: framework-distribution

**Status:** smoking (Phase 9 — awaiting user smoke actions + outstanding user actions to enable smokes)
**Started:** 2026-05-07
**Audit applied:** 2026-05-07

## Scope

Build the framework distribution system — installer, `/adopt` command, `/update-framework` command, and the supporting canonical-repo infrastructure (manifest, versioning, public README) — so this framework can be adopted into existing repos with confidence and updated cleanly over time.

V1 covers single-app projects on a fresh-clone or existing-repo basis. Out of scope for V1 (see Non-blocking decisions section): monorepo support, lessons-DB / shared-lesson sharing, auto-update webhooks, public test-installation repo, uninstall path, version-drift detection across multiple projects, re-adopt idempotency, command-rename UX polish, signed package distribution.

## Resolved decisions (2026-05-07)

1. **Framework name:** `app-blueprint`
2. **Distribution mechanism:** npx-only from day one. Package: `@insynq/app-blueprint`. Install command: `npx @insynq/app-blueprint init`.
3. **Initial version tag:** v0.1.0
4. **Canonical repo URL:** `github.com/Insynq/app-blueprint` — repo rename from `claude-app-blueprint` → `app-blueprint` required before V1 ships externally. **User action required** (only the user can rename a GitHub repo). Worker 1 plans as if rename has happened.

## Security assumptions (V1)

- npm account `@insynq` is secure (signed packages deferred to V2)
- canonical GitHub repo `Insynq/app-blueprint` is not compromised at install/update time
- user networks are not actively hostile (no MITM verification)
- canonical repo is **public** (private-repo support deferred to V2)
- users verify the canonical URL matches what they expect before running install

These assumptions get explicit callouts in the public README so adopters know what they're trusting.

## Brainstorm findings

(Compressed from the conversational brainstorm — full version in conversation history. Updated with audit recommendations.)

### Installer

- **Distribution:** npx-only (`npx @insynq/app-blueprint init`). No curl path. npm publishing required at canonical.
- **Manifest-first behavior:** scan repo, show user a per-file plan **before** writing anything. Default action per conflict: **skip** (safest); user opts into install-as-sibling or overwrite explicitly. This reverses the prior plan default — silent siblings risk shadowing user files without clear warning.
- **Pre-flight gates:**
  - Working tree clean (refuse otherwise — recovery requires git diff visibility)
  - Is a git repo (offer `git init` if not)
  - Repo writable from current directory (test-write + cleanup; warn + exit if not)
  - **Detect user-global command shadows** in `~/.claude/commands/` — prompt user to disable per the `commands_legacy/` pattern (lesson from Gap #1, 2026-05-07)
  - Detect monorepo — block with explicit choice prompt: "Install per-package, or at root (advanced)?"
- **Network resilience:** all downloads land in `./.framework-install-staging/` first; only move to final location after **all** files succeed. On interrupt, leave staging dir for retry/diagnosis. Document recovery: *"If install fails, delete .framework-install-staging and re-run."*
- **Hard-limited blast radius — explicit list:**
  - **Installer WILL write:** `.claude/commands/*`, `docs/[stack-reference KB folders]/*`, `docs/KB_*.md` (templates only — KB_1, KB_7, KB_8, KB_9), `CLAUDE.md` (sibling/skip behavior if exists), `.framework-version` (root metadata)
  - **Installer NEVER writes:** `src/`, `package.json`, `.env*`, `README.md`, `supabase/`, `.git/`, any other `docs/*.md` not listed above
  - Violations of this list are bugs.
- **CLAUDE.md handling:** install-as-sibling (`CLAUDE.md.framework`) if exists. The assisted merge happens later in `/adopt`. Installer never writes the template directly into existing `CLAUDE.md`.
- **Versioning stamps:** writes `.framework-version` at install with `{ "version": "0.1.0", "installed_at": "2026-05-07T..." }`. Single root metadata file, no per-file SHAs.
- **Post-install message:** clear next-step instructions (run `/preflight`, then `/adopt`). Includes brief explanation of "framework owns X, you own Y" and the user-global shadow remediation if any was deferred.

### `/adopt` command

- **Auto-derives** (no user input): tech stack from `package.json`, build commands from scripts, folder-structure-driven KB_1 / KB_7 / KB_9 drafts.
- **Asks user**: project overview, current phase, scope, preferences. Always shows a draft before writing project content.
- **Existing-KB audit** (real feature for legacy projects): reads each user KB, cross-references symbols/paths against current code (reuse `/investigate`'s codebase-scanning patterns where possible), buckets as Current / Partially Stale / Mostly Stale / Orphaned. Surfaces stale references with file:line. Per-file triage: keep / update / archive / merge.
- **Assisted merge of existing CLAUDE.md** (if user had one): backup original to `CLAUDE.md.pre-adopt-backup` first; then read both versions, draft merged version preserving project content + framework conventions, user reviews + approves. Merge strategy: user's custom content takes priority on conflicts; framework conventions (table of commands, KB references) get inserted into appropriate sections.
- **Edge cases**: monorepo (defer to V2), unconventional doc layouts, very large projects (drill in selectively).
- **`--minimal` flag**: skips the populate-KBs step for users who just want commands installed.

### `/update-framework` command

- **Customization detection (V1 simplified):** track install version in `.framework-version`. On update, fetch canonical at install-version AND target-version. For each file in manifest, compare:
  - Local matches canonical@install-version → not customized; safe to apply target version
  - Local differs from canonical@install-version → customized; surface to user for decision
  - This avoids per-file SHAs while still detecting customizations reliably. Uses git/release tags for version anchoring.
- **Four-category presentation (reframed user-centric):**
  - 🟥 **FILES YOU CUSTOMIZED — CONFLICTS POSSIBLE** (require decision)
  - 🟢 **FILES UNCHANGED LOCALLY — SAFE TO APPLY** (auto-apply, with backup)
  - 🟡 **NEW FROM CANONICAL — CONSIDER** (added by canonical, no conflict)
  - 🔵 **DEPRECATED — MIGRATION NOTES** (removed by canonical, with migration notes)
- **Per-conflict options:** skip (keep local, may diverge), overwrite (with backup to `.framework-backup/`), assisted merge.
- **Concrete merge algorithm (to specify in Worker 4 plan doc):**
  - If diff < 10 lines: draft merge inline, user approves
  - If diff >= 10 lines: offer skip/overwrite/merge per file
  - On approve: backup to `.framework-backup/[file]@[old-version]`, then apply
- **Mechanism:** slash command fetches canonical via WebFetch from GitHub release tarballs (not raw URLs — releases have immutable tags, harder to cache-poison).
- **Frequency / discovery:** pull-only V1 — user runs `/update-framework` when they want. Webhook nudge → V2.
- **Backwards compat:** removed commands stay as deprecation shim for one version. Shim prints warning + auto-redirects to new command (preserves UX, tells user about rename). Migration notes per release in FRAMEWORK_CHANGELOG.

### Cross-cutting (canonical repo prep)

- **`.framework-manifest.json`** at repo root — directory-level for V1, with named exceptions for hybrid files. Example:

  ```json
  {
    "version": "0.1.0",
    "name": "app-blueprint",
    "canonical_url": "github.com/Insynq/app-blueprint",
    "categories": {
      "framework-managed": [".claude/commands/", "docs/Supabase Structure KBs/", "docs/UI-UX KBs/", "..."],
      "hybrid": ["CLAUDE.md", "docs/KB_1_Architecture.md", "docs/KB_7_UI_Patterns.md", "docs/KB_8_Current_State.md", "docs/KB_9_Screen_Catalog.md"],
      "project-owned": ["docs/APP_CONCEPT.md", "docs/SCOPE.md", "docs/CHANGELOG.md", "docs/LESSONS.md", "docs/smoke-tests-pending.md", "docs/plans/"]
    }
  }
  ```

  File-level granularity (per-file SHAs, per-file ownership) is deferred to V2 if users start customizing individual KBs.

- **Public-facing README** in canonical repo — separate from project-state CLAUDE.md. Targets prospective adopters: what the framework is, install command, security assumptions, link to docs. **Owned by PM integration step, not Worker 1.**
- **Versioned releases:** semver tags + GitHub releases at canonical, with per-version changelog. Initial release v0.1.0.
- **`FRAMEWORK_CHANGELOG.md`** at canonical: distinct from project-state CHANGELOG. Lists what changed per framework version. **Owned by PM integration step, not Worker 1.**

## Sequencing + worker shape

Critical-path dependency: only `.framework-manifest.json` is truly blocking. Workers 2 and 3 can start immediately once manifest exists. Worker 4 depends on Workers 2 + 3 being functional enough to dogfood from. PM handles README / changelog / dogfood / KB updates after Worker 4.

### Worker 1 — Manifest foundation (blocking; small scope)

**Owns:** the `.framework-manifest.json` file. That's it.

- Author `.framework-manifest.json` at repo root with directory-level categorization (framework-managed / hybrid / project-owned), framework name, version, canonical URL
- Add explicit file inventory inside `framework-managed` for any single-file exceptions
- Document the manifest format in a brief comment block at top of the file (or in a sibling README within the manifest)

**Blast radius:** if Worker 1 fails, Workers 2 and 3 blocked. But the work itself is small (one file, structured content). Should complete in one short session.

**Recommended dispatch mode:** subagent (scoped, plan-doc-driven).

### Worker 2 — Installer (parallel with Worker 3 after Worker 1)

**Owns:** the npm package `@insynq/app-blueprint` and its `init` command (the installer).

- Package scaffold (package.json, bin script entry point, dependencies)
- Pre-flight gates: clean tree, git repo, monorepo detection, **user-global shadow detection**, repo writability check
- Manifest-first inventory + per-conflict prompts (default skip)
- Conflict resolution: skip / install-as-sibling / overwrite (default: skip)
- Network resilience: staging directory pattern
- Stamp `.framework-version` at root with version + install date
- Emit clear post-install next steps including the ownership explanation

**Blast radius:** failure means installer broken; `/adopt` and `/update-framework` still ship in framework files but require manual file copy to use. Medium.

**Recommended dispatch mode:** separate window (debug-heavy, will need iteration on npm publishing flow + npx invocation testing + dev server interaction).

### Worker 3 — `/adopt` command (parallel with Worker 2 after Worker 1)

**Owns:** the `/adopt` slash command in `.claude/commands/adopt.md` and any helper logic.

- Read project state (package.json, configs, structure, README)
- Auto-populate KB_1 / KB_7 / KB_9 drafts (always show draft before writing)
- Audit existing user KBs against current code — **reuse `/investigate` patterns** for codebase scanning
- Assisted merge for existing CLAUDE.md (backup first, user-content priority on conflicts)
- `--minimal` flag for skip-discovery mode

**Blast radius:** failure means installer works but user adopts manually. Low.

**Recommended dispatch mode:** subagent (scoped, plan-doc-driven, mostly markdown command authoring + clear protocol).

### Worker 4 — `/update-framework` command (after Workers 2 + 3 functional)

**Owns:** the `/update-framework` slash command in `.claude/commands/update-framework.md`.

- WebFetch canonical files via GitHub release tarballs (not raw URLs)
- Compare local against canonical@install-version + canonical@target-version
- Four-category diff presentation (user-centric framing)
- Per-file resolution: skip / overwrite (with backup) / assisted merge
- **Concrete merge algorithm specification** (Worker 4 audit task — see brainstorm findings)
- Update `.framework-version` after success
- Handle removed files (deprecation messaging + migration notes from FRAMEWORK_CHANGELOG)

**Definition of "Workers 2 + 3 functional enough to dogfood from":** commands install without error, run without crashing, produce reasonable output (even if some edge cases not handled). Does not require full feature completion.

**Blast radius:** failure means installer + adopt still work; updates done manually via git pull from canonical. Low.

**Recommended dispatch mode:** subagent for initial draft; may need separate-window iteration during dogfood.

### PM integration step (after Worker 4)

PM does directly (full context, no need for worker overhead):

- Author public-facing `README.md` for prospective adopters at canonical-repo root
- Author `FRAMEWORK_CHANGELOG.md` with v0.1.0 entry
- Update `CLAUDE.md` template's Custom Commands table to reference `/adopt` and `/update-framework`
- Update `MULTI_AGENT_WORKFLOW.md` if any installation nuances need documenting (likely a brief "First time? Run /adopt instead of /kickoff" note)
- Update memory entries if discoveries during dogfood warrant it
- **Dogfood install** into one of the user's two existing projects (the one with the catalog of unsure-if-useful KBs is the better test — exercises the existing-KB audit feature). Document gaps. If >3 findings, loop back to relevant worker with targeted fix before declaring V1 ready.
- Tag v0.1.0 release at canonical, draft GitHub release notes

## Collisions / blast radius

**Files multiple workers might touch (require coordination):**

- `CLAUDE.md` (template at canonical):
  - **Worker 1 doesn't touch the template.** No structural changes from Worker 1.
  - **Worker 3 READS** existing CLAUDE.md for the assisted-merge feature. Worker 3 does **not** modify the canonical template — it reads to merge into the user's local copy.
  - **PM integration step WRITES** to the canonical CLAUDE.md template (adds command references).
  - No collision: Workers don't write the template; only PM does.

- `docs/MULTI_AGENT_WORKFLOW.md`:
  - **PM integration step WRITES** any installation nuances.
  - Workers don't touch this file.
  - No collision.

- `.framework-manifest.json`: Worker 1 owns. Workers 2/3/4 read but never write. Clear ownership.

- `FRAMEWORK_CHANGELOG.md`: PM integration step creates. No worker collision.

**No collisions:**

- `.claude/commands/adopt.md` — Worker 3 only.
- `.claude/commands/update-framework.md` — Worker 4 only.
- `package.json` (npm package, at npm publish location) — Worker 2 only.
- `bin/init.js` (or equivalent) — Worker 2 only.

**External (non-codebase) blast radius:**

- Installer + `/update-framework` will fetch from canonical at runtime. If canonical repo URL changes, both break. Worker 1 must lock the canonical URL into `.framework-manifest.json`.
- npm package name `@insynq/app-blueprint` reservation is required before Worker 2 publishes. **User action.**

## Audit findings

Audit run 2026-05-07 against initial draft. Verdict: NEEDS CHANGES (now applied — see this revision).

**Critical issues addressed in this revision:**

1. **CLAUDE.md collision** — clarified above. PM owns canonical template; Worker 3 only reads existing user CLAUDE.md for merge.
2. **Manifest simplified** — directory-level for V1, with named hybrid file exceptions. Per-file granularity deferred to V2.
3. **Worker 1 scope reduced** — manifest only is blocking. README + FRAMEWORK_CHANGELOG moved to PM integration step.
4. **SHA approach replaced** — version-based detection (canonical@install-version vs current vs canonical@target-version) instead of per-file SHAs.

**Other audit recommendations applied:**

- Default conflict resolution changed: skip (not install-as-sibling) — silent siblings would shadow user files without clear warning.
- Network resilience: staging directory pattern for installer.
- Security assumptions section added (above).
- User-centric reframing of `/update-framework` four categories.
- Explicit blast radius enumeration (writes-WILL / writes-NEVER list).
- Explicit definition of "functional enough to dogfood" added to Worker 4.
- Reuse `/investigate` patterns called out for Worker 3.
- Concrete merge algorithm sketch added (full spec for Worker 4 plan doc).

**Audit recommendations deferred to worker plan docs (Phase 4):**

- Worker 4 plan doc must specify exact merge algorithm thresholds and conflict-resolution UX.
- Worker 2 plan doc must specify network-resilience implementation (staging dir cleanup, retry logic).

**Audit recommendations deferred to V2 (added to Non-blocking decisions below):**

- Uninstall / rollback path
- Version drift across multiple projects
- Re-adopt idempotency on already-adopted projects
- Renamed-command UX polish beyond shim+warning
- Signed npm packages (Sigstore / GPG)
- Private-repo support
- File-level manifest granularity

## Phase 8 verification + integration log (2026-05-07)

- ✅ All 4 worker implementations complete; both new commands (`/adopt`, `/update-framework`) appear in available-skills list — confirmed loadable
- ✅ `/.framework-manifest.json` validated (5 categories, 30 entries, JSON-parseable)
- ✅ npm package validated (`npm pack` produces 20.9KB tarball, `npm audit` 0 vulns, `node bin/init.js --help` exits 0)
- ✅ `CLAUDE.md` Custom Commands table updated with `/adopt` and `/update-framework` rows
- ✅ `/preflight` and `/kickoff` updated to reference 25 commands (was 23)
- ✅ Handlebars `{{#if}}` bug fixed in `audit-code.md`, `implement.md`, `investigate.md` (3 of 11 instances; remaining 8 sidebar'd)
- ✅ Public-facing `README.md` rewritten — install via npx, dual greenfield/existing paths, security assumptions documented, `/adopt` and `/update-framework` documented, framework-vs-project ownership table added

**Worker 3 ambiguities resolution (deferred / accepted as-is):**
1. `/adopt` file length 1166 lines vs 400-600 estimate — **accepted as-is**. Length is driven by spec density (verbatim derivation table, subagent prompt, action wording). PM may compress in V2 if maintenance friction emerges.
2. Step 4d optional kickoff-mini-session for APP_CONCEPT/SCOPE — **kept**. Lower friction for users who don't want to run two commands.
3. Re-invocation recovery (delete backup + audit log markers) — **kept**. V1 doesn't support re-adopt; this is the documented escape hatch.
4. Non-JS stack fallback stops at "Other (non-JS)" + asks user — **kept**. V1 effort cap is reasonable.

**Sidebar follow-up tasks (deferred to post-V1):**

- Fix Handlebars `{{#if}}` bug in 8 remaining commands: `audit-infra.md`, `audit-rls.md`, `audit-full.md`, `db-push.md` (5 instances), `changelog.md` (3 instances), `research.md`, `plan.md`, `ship.md`
- Phase loop ergonomics improvements (Gap #3: "already past 1+2 conversationally" affordance; Gap #4: degenerate first-phase case)
- `/adopt` doc compression pass if maintenance friction emerges

## Smoke tests added (Phase 9)

Added to `docs/smoke-tests-pending.md` with stable IDs `fwd-smoke-1` through `fwd-smoke-8`. See that file for full instructions. The integration smokes can't run until outstanding user actions complete (rename repo, reserve npm scope, publish v0.1.0).

## Worker plan docs

- [Worker 1 — Manifest foundation](worker-1-manifest.md)
- [Worker 2 — Installer (npm package)](worker-2-installer.md)
- [Worker 3 — `/adopt` slash command](worker-3-adopt-command.md)
- [Worker 4 — `/update-framework` slash command](worker-4-update-framework.md)

## Non-blocking decisions (deferred to later phases)

**V2 (next major release):**

- Monorepo support (multi-package install)
- Uninstall / rollback path (`/remove-framework` command)
- Version drift detection across multiple projects (`/check-framework-versions`)
- Re-adopt idempotency (running `/adopt` on already-adopted project asks before re-populating KBs)
- Renamed-command UX polish (interactive deprecation, full migration assistance)
- Signed npm packages (Sigstore or GPG)
- Auto-update webhook nudge (Open Claw pattern)
- Public test-install repo for prospective-adopter trust
- Private-repo support (auth tokens for canonical fetch)
- File-level manifest granularity

**V3 / separate phase:**

- Shared lessons DB (collect + search across users' projects)
- Framework brainstorm-checklist file (referenced in old `/orchestrate` step 4.5; check if it exists, fold in if useful)

## Outstanding user actions (separate from worker work)

- Rename GitHub repo `claude-app-blueprint` → `app-blueprint` before V1 publishes
- Verify / reserve `@insynq` npm scope ownership
- Verify `@insynq/app-blueprint` package name available on npm
- Approve Phase 4 worker dispatch (next checkpoint)

## Sidebars (queued — addressed after this phase)

- Audit-code.md (Gap #6) Handlebars syntax bug — `{{#if}}` doesn't work in Claude Code commands
- Phase 1 protocol needs degenerate case for project's first phase ever (no prior phase plan)
- Phase loop protocol needs "already past 1+2 conversationally" affordance
- Audit project-level commands for similar broken templating syntax
- Default skill resolution prefers user-global over project — installer must address (carried into framework distribution work as Worker 2 pre-flight gate)
