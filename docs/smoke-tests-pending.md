# Pending Manual Smoke Tests

Tests that shipped code requires before it can be considered verified. Each entry tracks one observable behavior end-to-end. Mark the **Status** when run.

This is the single source of truth for outstanding manual verification work. Don't re-list these tests in commits, PR bodies, `CLAUDE.md`, `AGENTS.md`, chat threads, or release notes — link to test IDs instead (e.g., "see `PW-H1` in `docs/smoke-tests-pending.md`").

> **Status: empty.** This template ships with no pending tests. When you ship a feature that needs manual verification, copy the skeleton from [Section template](#section-template) below and fill it in.

---

## Framework Distribution V1

**Source:** [docs/plans/framework-distribution/phase-plan.md](plans/framework-distribution/phase-plan.md), Phase 9. These integration smokes verify the installer + `/adopt` + `/update-framework` end-to-end. They cannot run until outstanding user actions complete (see phase-plan).

**Outstanding user actions blocking smokes:**
- Rename GitHub repo `claude-app-blueprint` → `app-blueprint`
- Reserve `@insynq` npm scope (`npm org create insynq` or first publish auto-creates)
- Publish `@insynq/app-blueprint@0.1.0` to npm
- Tag `v0.1.0` GitHub release at canonical with release tarball

### FWD-1 — Fresh-clone install via npx

| | |
|---|---|
| **Status** | Pending |

**Setup:** A throwaway public repo (or `mkdir test-install && cd test-install && git init && git commit --allow-empty -m "init"`). Working tree clean. No `~/.claude/commands/orchestrate.md` shadow (or accept the prompt during install).

**Steps:**
1. `cd` into the test repo
2. Run `npx @insynq/app-blueprint init`
3. Accept default conflict actions (skip) when prompted

**Expected:**
- Pre-flight gates all pass (clean tree, git repo, writable, no shadows, no monorepo)
- Inventory shown before any writes
- Files dropped into `.claude/commands/`, `docs/[stack-reference KB folders]/`, `docs/KB_*.md`, etc.
- `.framework-version` exists at root with `version: "0.1.0"`, `installed_at`, `tarball_sha256`, `installed_method`, `canonical_url`
- Post-install message lists next steps (`/preflight` then `/adopt`)
- `git status` shows expected file additions; nothing outside the manifest's blast-radius list was touched

---

### FWD-2 — Refuse on dirty tree

| | |
|---|---|
| **Status** | Pending |

**Setup:** A repo with at least one uncommitted change.

**Steps:**
1. Run `npx @insynq/app-blueprint init`

**Expected:**
- Installer exits with clear error message about dirty tree
- No files written
- `--force-dirty` flag bypasses the gate (if implemented per Worker 2 audit)

---

### FWD-3 — Detect user-global shadow

| | |
|---|---|
| **Status** | Pending |

**Setup:** Place a fake `~/.claude/commands/orchestrate.md` (or any command name from the framework set). Clean repo to install into.

**Steps:**
1. Run `npx @insynq/app-blueprint init`

**Expected:**
- Installer surfaces the shadow during pre-flight
- Prompts user with explicit remediation (move to `~/.claude/commands_legacy/`)
- User can choose to remediate now or defer with warning

---

### FWD-4 — Monorepo detection

| | |
|---|---|
| **Status** | Pending |

**Setup:** A repo with `apps/` or `packages/` at root.

**Steps:**
1. Run `npx @insynq/app-blueprint init`

**Expected:**
- Installer detects monorepo, blocks with explicit choice prompt
- User can pick a specific package or "install at root anyway"
- No silent install at root

---

### FWD-5 — `/preflight` after install

| | |
|---|---|
| **Status** | Pending |

**Setup:** Just-installed repo from FWD-1.

**Steps:**
1. Open Claude Code in the repo
2. Run `/preflight`

**Expected:**
- `/preflight` runs the project-local version (not user-global, since installer disabled shadows)
- Writes `## Environment` block to CLAUDE.md
- Reports 25 expected commands, all present

---

### FWD-6 — `/adopt` on a real existing project

| | |
|---|---|
| **Status** | Pending

**Setup:** One of the user's existing projects (preferably the one with the catalog of unsure-if-useful KBs — exercises the existing-KB audit feature). Install framework via npx first (FWD-1 flow), then run `/adopt`.

**Steps:**
1. Run `/adopt` (or `/adopt --minimal` if just want commands installed)
2. Walk through discovery, confirm/edit drafts
3. Run existing-KB audit step
4. Approve CLAUDE.md merge

**Expected:**
- Tech stack auto-derived from package.json (correct)
- Build commands populated from scripts (correct)
- KB_1 / KB_7 / KB_9 drafts shown for review (sensible)
- Existing user KBs bucketed (Current / Partially Stale / Mostly Stale / Orphaned) with file:line references for stale items
- CLAUDE.md merge: backup created at `CLAUDE.md.pre-adopt-backup`, merged version preserves user's project content
- After completion, no orphan files (no leftover `CLAUDE.md.framework`)

---

### FWD-7 — `/update-framework` no-op (already at latest)

| | |
|---|---|
| **Status** | Pending

**Setup:** Just-installed repo from FWD-1 with `.framework-version` at v0.1.0; canonical also at v0.1.0 (latest).

**Steps:**
1. Run `/update-framework`

**Expected:**
- Detects `install-version == target-version` early (no fetch needed for second tarball)
- Exits cleanly with informative message ("already at latest")
- No `.framework-backup/` directory created
- `.framework-version` unchanged

---

### FWD-8 — `/update-framework` with version bump (dogfood when v0.2.0 exists)

| | |
|---|---|
| **Status** | Pending — blocked until v0.2.0 ships

**Setup:** Repo at v0.1.0; canonical has shipped v0.2.0 with at least one file change in each of the four categories (customized-and-changed, unchanged-and-changed, new-from-canonical, deprecated-removed).

**Steps:**
1. Modify one framework-managed file locally (introduces customization)
2. Run `/update-framework`
3. Walk through four-category review
4. For 🟥 customized file: choose three-way merge
5. Approve safe-apply for 🟢 files
6. Approve new file install for 🟡

**Expected:**
- Four categories surface correctly with file lists
- 🟥 merge uses `git merge-file`; conflicts (if any) presented in standard `<<<<<<<` markers
- Backups created at `.framework-backup/[file]@v0.1.0` for everything modified
- `.framework-version` bumps to v0.2.0 with `previous_version: v0.1.0`
- Migration notes from `FRAMEWORK_CHANGELOG.md` displayed for any 🔵 deprecated files
- CRLF / whitespace-only diffs not flagged as customizations

---

## How to use this doc

- **Run a test** → flip its **Status** to `Passed (YYYY-MM-DD)` or `Failed — see issue #N`. Failed tests link out to a tracking issue rather than expanding inline.
- **Collapse passed sections.** When every test in a section is `Passed`, collapse the section to a one-liner (e.g., `Phase 2 — all 5 tests passed 2026-05-15. See git history for detail.`) and let git history hold the body. Do this immediately after a release sweep — don't batch it. Without active collapsing the doc grows monotonically and people stop reading it.
- **Add new tests when shipping new behavior** that automated coverage misses (Stripe test mode, OAuth flows, browser-specific UI bugs, race conditions, third-party webhooks, deploy-pipeline artifacts). Don't grow this doc with retrospective tests of stable features — those belong in unit/integration tests.
- **IDs are immutable** once assigned. If a test is removed, don't reuse the ID.
- **Reference, don't re-list.** Commits and PRs link to test IDs; they never expand the test body.

## ID conventions

- `<SECTION>-<NUMBER>` for simple sections: `P2-1`, `P2-2`, `SB-3`.
- `<SECTION>-<TYPE><NUMBER>` when a section has natural sub-groups (happy path / failure / race / etc.): `PW-H1`, `PW-F2`, `PW-W1`.
- Section codes are short, memorable initials of the feature name. Pick once and don't churn.

## Each test must

- Be runnable from setup → expected without re-reading the spec.
- Have at least one observable in the expected section (UI state, DB row, network call, log line). "Should work" is not an expected.
- Reference a source commit or spec doc so the test stays linked to its origin.

## Each test must NOT

- Cover behavior that's already in unit / integration tests. The catalog is for things automated coverage misses.
- Leak implementation detail that breaks when the code is refactored. Test what the user / API caller observes, not how it's done.

---

## Section template

When adding the first feature, copy the block below into the "(No pending tests)" placeholder above (and delete the placeholder). Replace `<...>` markers with concrete values. Pick a short, memorable section code (e.g., `PW` for Password Reset, `BL` for Billing, `OB` for Onboarding) and use it for all tests in the section.

````markdown
## <Feature or PR name>

**Source:** commit `<sha>`, [<spec-doc>](<path>) or [<PR link>]. <One-line context: why this test set exists.>

### <ID>-<N> — <One-line title>

| | |
|---|---|
| **Status** | Pending |

**Setup:** <What state the system needs to be in. Be specific — fixture data, env, account roles.>

**Steps:**
1. <Concrete user action.>
2. <Concrete user action.>

**Expected:**
- <Observable outcome 1.>
- <Observable outcome 2 — include DB-level checks if applicable.>

---

### <ID>-<N+1> — <Next test title>

[repeat]
````
