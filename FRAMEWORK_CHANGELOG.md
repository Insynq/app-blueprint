# Framework Changelog

All notable changes to the **app-blueprint** framework.

Format: based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), structured for parsing by `/update-framework`.
Versioning: [Semantic Versioning](https://semver.org/).

## Parsing contract for `/update-framework`

The `/update-framework` command parses this file to surface migration notes and detect command renames during update operations. Maintainers of this framework MUST keep this format intact:

### Required structure

- Each version entry starts with: `## [X.Y.Z] - YYYY-MM-DD`
- The unreleased section uses: `## [Unreleased]`
- Within a version, subsections use H3 headers: `### Added`, `### Changed`, `### Removed`, `### Renamed`, `### Migration Notes`
- All five subsections are optional within a version; omit if empty (or include with content `N/A` or empty bullets — parser tolerates both)
- Order of subsections within a version: Added, Changed, Removed, Renamed, Migration Notes (parser is order-insensitive but consistency aids readability)
- Versions appear in **descending chronological order** (newest first), with `[Unreleased]` at the top

### `### Renamed` format (parser-critical)

One bullet per rename. Used by `/update-framework` to auto-create deprecation shims:

```
### Renamed
- `/old-command` → `/new-command` (slash command rename — auto-shim created)
- `docs/Old Path/` → `docs/New Path/` (directory rename — auto-detected during diff)
```

Format rules:
- Backticks around old and new names
- Single arrow `→` (Unicode) separating old and new — parser keys on this character
- Optional parenthetical explanation after the arrow
- Slash commands include the leading `/`

### `### Migration Notes` format

Free-form prose, displayed verbatim to users when they encounter the corresponding deprecated files during update. Group by what's changing:

```
### Migration Notes
- **`/old-command` → `/new-command`:** behavior is identical for V1; new name is more accurate. The auto-created shim will redirect for one version, then be removed in vX.Y.
- **`docs/Old Path/` → `docs/New Path/`:** Windows compatibility — colons in paths break `tar` extraction.
```

The parser surfaces these notes when:
- A user has the old file (rename detected via local file matching the canonical@install-version's old name)
- A `### Removed` entry mentions a file the user has locally

### Adopter projects do not have this file

Only the canonical repo (this repo) maintains `FRAMEWORK_CHANGELOG.md`. Adopter projects have their own `docs/CHANGELOG.md` for their project's state. Don't confuse the two.

---

## [Unreleased]

[Changes pending release land here.]

---

## [0.1.4] - 2026-05-08

Autonomy contract: permissions allowlist in `.claude/settings.json` enables set-and-forget autonomy for local file/code work while preserving prompts for irreversible / shared-state operations. Backported from `@insynq/agent-blueprint` v0.1.0 with the ask-list adjusted for Supabase + Vercel ops. Also fixes an adopter-facing bug discovered during the agent-blueprint fork: project-owned templates were shipping app-blueprint's own framework-development internal state to adopters on first install.

### Added

- `.claude/settings.json`: full autonomy contract block with `allow` / `ask` / `deny` arrays.
  - Allow: file edits (`Edit`/`Write`/`Read`/`Glob`/`Grep`/`TodoWrite`/`NotebookEdit`/`WebFetch`/`WebSearch`), common reads (`ls`/`cat`/`head`/`tail`/`grep`/`find`/`wc`), filesystem mutations (`mkdir`/`touch`/`mv`/`cp`), `node`/`npm install`/`npm run`/`npx`/`pnpm install`/`pnpm run`, git read ops (`status`/`diff`/`log`/`branch`/`show`/`remote`/`stash`) plus `git add`, read-only Supabase CLI (`supabase status`/`db diff`/`migration list`/`functions list`), read-only Vercel CLI (`vercel ls`/`inspect`).
  - Ask: `git commit`/`push`/`reset`/`rebase`/`checkout`/`merge`/`tag`, `npm publish`/`pnpm publish`, `rm -rf`, Supabase migrations + Edge Function deploys (`db push`/`db reset`/`migration up`/`migration down`/`functions deploy`), Vercel `deploy`/`--prod`/`env`/`domains`/`rollback`.
  - Deny: `git push --force` / `-f`, `git reset --hard`, `rm -rf /`, `rm -rf ~`, `rm -rf ~/*`, `sudo`.
- `README.md`: new "Autonomy contract" section documenting the contract and the `.claude/settings.local.json` override path.

### Changed

- `README.md`: replaced the prior "Customizing Permissions" section with the new "Autonomy contract" section. The old section recommended `allowedTools` (incorrect key) and stated "By default only npm, npx, and git are pre-approved" — both now stale under the new permissions model.
- `docs/KB_8_Current_State.md`, `docs/CHANGELOG.md`, `docs/LESSONS.md`: reset project-owned templates to clean skeletons. They were shipping app-blueprint's own framework-development internal state (FWD-* smoke IDs, framework-distribution phase notes, Stripe/order-completed/Radix-dialog incident lessons) to adopters on first install.

### Removed

- N/A

### Renamed

- N/A

### Migration Notes

- **Existing adopters:** `.claude/settings.json` is `hybrid`; `/update-framework` will offer a three-way merge. Accepting the canonical version replaces the prior bare allow-list with the full autonomy contract. To preserve a per-developer override (e.g. allowing your specific package manager or DB CLI), use `.claude/settings.local.json` (gitignored) rather than diverging the tracked file.
- **Project-owned template reset (KB_8 / CHANGELOG / LESSONS):** these are `project-owned` in the manifest, so `/update-framework` will **not** overwrite them on existing adopter installs. The reset only affects **new** installs going forward. Existing adopters who inherited the stale content from v0.1.0–v0.1.4-pre.1 should manually clear any remaining FWD-* / framework-distribution / Stripe references from their copies.

---

## [0.1.4-pre.1] - 2026-05-08

**Pre-release for dogfooding only.** Introduces the verification-workers pattern for `/orchestrate` Phase 9: PM dispatches a trace-verifier subagent (with a 6-clause contract prompt) for `wiring`-lane smokes that meet a complexity gate (≥3 files OR cross a state-machine / RLS / server-action boundary). Verifier reports become inspectable artifacts that surface catalog-vs-code contradictions PM-inline compression hides. Pilot data: 3-smoke run found 100% verdict accuracy + 100% citation accuracy + 2/3 catch rate on test-design bugs PM missed inline.

Also adds Lane field (`sql` / `wiring` / `visual` / `integration`) and `Trace verified` annotation field to the smoke-tests catalog template. `Trace verified` is **never** a status flip — annotations let you ship with pending UI smokes and explicit eyeball-deferred bookkeeping; only an actual eyeball pass flips `Status: Pending` → `Passed`.

`/ship` Step 3.5 now surfaces trace-verified-but-eyeball-pending counts with TTL gates (informational 0–14d, warn 15–30d, block >30d).

### Added

- `docs/MULTI_AGENT_WORKFLOW.md`: new "Verification workers" section (~120 lines) — when-to-dispatch complexity gate, full trace-verifier prompt template (6-clause contract including catalog-vs-code contradiction check), PM judgment guide, verdict semantics (trace-pass / trace-incomplete / trace-fail), what-this-is-NOT clarifications.
- `docs/smoke-tests-pending.md`: new "Lanes" section, "Trace verification annotations" section, updated section template to include `Lane` + `Hypothesized starting point` + `Trace verified` fields.

### Changed

- `.claude/commands/orchestrate.md`: Phase 9 rewritten as dispatch-by-Lane protocol (9a catalog → 9b verify → 9c judge → 9d handoff → 9e loop). Trace-verifier dispatched via Agent tool with `subagent_type: general-purpose` and concurrency cap of 2.
- `.claude/commands/implement.md`: Step 6 — when authoring a new smoke, author tags Lane at write-time; for `wiring` lane, author also names a hypothesized starting point.
- `.claude/commands/ship.md`: Step 3.5 — adds trace-verified-pending count surfacing with TTL (informational ≤14d, warn 15–30d, block >30d). Lists trace-deferred IDs in commit body when the diff annotates new ones.

### Removed

- N/A

### Renamed

- N/A

### Migration Notes

- **No-op for projects that don't use `/orchestrate`.** If you implement work directly without the PM phase loop, the new Phase 9 protocol doesn't trigger and your workflow is unchanged.
- **For projects with existing pending smokes:** add a `Lane` field to each existing entry (sql / wiring / visual / integration). Most installer-style smokes (CLI flows, OAuth, webhooks) tag as `integration`. Most UI-component smokes tag as `wiring` if they have data-path observables OR `visual` if they're pure layout/contrast/animation. RLS / data-shape smokes covered by pgTAP (or equivalent) tag as `sql` and rely on the unit-test as their verification — no separate harness.
- **Pilot history:** the SQL-runner pattern was piloted alongside this and rejected for framework adoption (100% confirmatory in a project with pgTAP coverage; duplicate verification mechanisms create busy work). The `sql` lane is preserved in the catalog schema as a hint, but the runner itself is project-local at most. See [project memory: framework adoption needs calibration data].

---

## [0.1.3] - 2026-05-08

Manifest fix. v0.1.2 install hit a blast-radius rejection on `bin/init.js` because the manifest didn't categorize the npm-package internals (`bin/`, `lib/`, `package.json`, `package-lock.json`). The installer correctly refused to write files outside the framework allow-list. v0.1.3 adds those paths to `excluded` so the installer skips them silently during extraction.

### Added

- N/A

### Changed

- `.framework-manifest.json`: added `bin/`, `lib/`, `package.json`, `package-lock.json` to `excluded` category. These exist in canonical (they're the installer's own code, shipped via npm) but must never be installed into adopter repos.

### Removed

- N/A

### Renamed

- N/A

### Migration Notes

- v0.1.2 install attempts on adopter repos failed mid-write with a blast-radius error. The installer's safety net is working as designed — no files were written. Re-run `npx @insynq/app-blueprint init` against v0.1.3 (delete any `.framework-install-staging/` from the failed attempt first).

---

## [0.1.2] - 2026-05-08

First effective release. v0.1.0 was tagged but never published; v0.1.1 published the installer code but the GitHub release tarball was missing the actual framework payload (worker outputs were uncommitted at tag time, and the `docs/UI:UX KBs/` → `docs/UI-UX KBs/` rename hadn't been committed either, so the manifest pointed to a path the tarball didn't have). v0.1.2 ships the full state.

### Added

- All framework-distribution worker outputs:
  - `.claude/commands/adopt.md` (Worker 3)
  - `.claude/commands/update-framework.md` (Worker 4)
  - `bin/init.js`, `lib/*.js`, `package-lock.json` (Worker 2)
  - `.framework-manifest.json` (Worker 1; was in v0.1.1 but pointed at paths that didn't exist in the tarball)
- Phase plan + worker plan docs at `docs/plans/framework-distribution/`
- PM-direct integration: `CLAUDE.md` and `README.md` rewrites, command-table updates, Handlebars `{{#if}}` fixes in `audit-code.md` / `implement.md` / `investigate.md`
- Smoke tests `FWD-1` through `FWD-8` in `docs/smoke-tests-pending.md`

### Changed

- `docs/UI:UX KBs/` renamed to `docs/UI-UX KBs/` (Windows compatibility — colons break `tar` extraction). All 13 KB files moved.
- `/preflight` and `/kickoff` now reference 25 commands (was 23 before `/adopt` and `/update-framework`).

### Removed

- N/A

### Renamed

- `docs/UI:UX KBs/` → `docs/UI-UX KBs/` (directory rename — auto-detectable by `/update-framework` rename-pair coalescing once future versions ship)

### Migration Notes

- v0.1.0 and v0.1.1 are non-functional installs. Anyone who ran `npx @insynq/app-blueprint@0.1.1 init` got a mid-write error from the installer's blast-radius enforcement (which is correct behavior — the installer detected the manifest/tarball mismatch and aborted before damage). Re-run with `@latest` (which is now v0.1.2) on a clean target repo. Delete any leftover `.framework-install-staging/` directory from the failed v0.1.1 attempt.

---

## [0.1.1] - 2026-05-08

Fix to v0.1.0's npm package — bin entry was rejected by npm and stripped during publish, leaving `npx @insynq/app-blueprint init` non-functional. Renamed bin to match the unscoped package name (`app-blueprint`), which is the conventional npm pattern. The user-visible install command is unchanged: `npx @insynq/app-blueprint init` still works because the bin script ignores `init` as an argv pass-through.

### Added

- N/A

### Changed

- `package.json` bin entry renamed from `init` → `app-blueprint`. The user-facing command `npx @insynq/app-blueprint init` is unchanged.

### Removed

- N/A

### Renamed

- N/A

### Migration Notes

- v0.1.0 was tagged at canonical but never successfully published to npm (initial publish attempt failed with E403 / 2FA, and bin-entry warning surfaced). v0.1.1 is the first effective release on npm. Users adopting from v0.1.0 do not exist.

---

## [0.1.0] - 2026-05-07

Initial public release of the app-blueprint framework.

### Added

- **npm installer:** `npx @insynq/app-blueprint init` performs a manifest-first install into an existing repo with full pre-flight gates and per-conflict prompts
- **`/adopt` slash command:** existing-repo onboarding — populates KBs from observation, audits existing user KBs against current code for stale references, and assists CLAUDE.md merge. Sibling to `/kickoff` (which handles greenfield)
- **`/update-framework` slash command:** pulls canonical framework updates with four-category review (FILES YOU CUSTOMIZED / UNCHANGED LOCALLY / NEW / DEPRECATED) and per-file resolution (skip / overwrite / `git merge-file`)
- **`.framework-manifest.json`:** declares 5 file categories — framework-managed, hybrid, project-owned, installer_generated, excluded — used by both installer and update command
- **`.framework-version`:** install-time metadata at adopter repo root — version, install timestamp, tarball SHA256, install method, canonical URL
- **Multi-agent workflow:** PM/worker phase loop driven by `/orchestrate` — pivot review → brainstorm → holistic plan + audit → worker dispatch → reconciliation → implementation → verification → smoke → ship
- **Stack-reference KB folders** (vetted patterns): Supabase, UI-UX, Auth, AI, Bill, Form, Job, Obs, Test
- **Project-state KB scaffolds:** KB_1 (Architecture), KB_7 (UI Patterns), KB_8 (Current State), KB_9 (Screen Catalog)

### Changed

- N/A (initial release)

### Removed

- N/A (initial release)

### Renamed

- N/A (initial release)

### Migration Notes

- N/A (initial release)
