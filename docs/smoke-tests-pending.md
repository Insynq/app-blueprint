# Pending Manual Smoke Tests

Tests that shipped code requires before it can be considered verified. Each entry tracks one observable behavior end-to-end. Mark the **Status** when run.

This is the single source of truth for outstanding manual verification work. Don't re-list these tests in commits, PR bodies, `CLAUDE.md`, `AGENTS.md`, chat threads, or release notes — link to test IDs instead (e.g., "see `PW-H1` in `docs/smoke-tests-pending.md`").

> **Status: empty.** This template ships with no pending tests. When you ship a feature that needs manual verification, copy the skeleton from [Section template](#section-template) below and fill it in.

---

## (No pending tests)

When you ship a feature that needs manual verification, add a section here using the [Section template](#section-template) at the bottom of this file.

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
