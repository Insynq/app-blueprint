# Pending Manual Smoke Tests

Tests that shipped code requires before it can be considered verified. Each entry tracks one observable behavior end-to-end. Mark the **Status** when run.

This is the single source of truth for outstanding manual verification work. Don't re-list these tests in commits, PR bodies, `CLAUDE.md`, `AGENTS.md`, chat threads, or release notes — link to test IDs instead (e.g., "see `PW-H1` in `docs/smoke-tests-pending.md`").

> **Status: empty.** This template ships with no pending tests. When you ship a feature that needs manual verification, copy the skeleton from [Section template](#section-template) below and fill it in.

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

## Lanes

Every test must be tagged with a **Lane** at write-time. Lane drives how the test is verified during `/orchestrate` Phase 9 — see [docs/MULTI_AGENT_WORKFLOW.md → Verification workers](MULTI_AGENT_WORKFLOW.md#verification-workers).

| Lane | What it covers | Verification path |
|---|---|---|
| `sql` | RLS policies, data-shape, trigger fires, constraint enforcement | If framework prescribes pgTAP (or equivalent), the unit test IS the verification — no separate runner. Status flips on the unit test passing. |
| `wiring` | UI component data-path correctness — DB → fetcher → component → render condition → handler | Either PM-inline trace (single-file leaf check) or trace-verifier subagent (≥3 files OR crosses state-machine / RLS / server-action boundary). Verifier annotates `Trace verified`; only eyeball pass flips Status. |
| `visual` | Layout, mobile spacing, color contrast, animation, click feel, copy, discoverability, hover/focus states | Eyeball only. Trace verification is rejected — wrong lane. |
| `integration` | CLI/installer flows, third-party webhooks, OAuth round-trips, deploy-pipeline artifacts, anything that needs to run-the-binary in a real environment | Manual. No auto-pass mechanism. |

**Lane assignment rules:**

- Author tags Lane at write-time. PM does not retroactively re-tag (except `wiring` → `visual` when the verifier returns `trace-fail / wrong lane`).
- For `Lane: wiring`, author also names a **hypothesized starting point** (file or component) so PM has the input the verifier needs.
- A test is one Lane. If a feature has both wiring AND visual concerns, write two tests with separate IDs.

## Each test must

- Be runnable from setup → expected without re-reading the spec.
- Have at least one observable in the expected section (UI state, DB row, network call, log line). "Should work" is not an expected.
- Reference a source commit or spec doc so the test stays linked to its origin.
- Be tagged with a Lane (sql / wiring / visual / integration). For `wiring`, also name a hypothesized starting point.

## Each test must NOT

- Cover behavior that's already in unit / integration tests. The catalog is for things automated coverage misses.
- Leak implementation detail that breaks when the code is refactored. Test what the user / API caller observes, not how it's done.

## Trace verification annotations

A `wiring`-lane test can carry a `Trace verified` annotation from `/orchestrate` Phase 9. This is **never** a status flip — only an annotation that PM reviewed (or a verifier subagent produced) a structured trace report against the test's data path. `Status` stays `Pending` until eyeball pass.

The annotation lives in the per-test table:

```
| **Trace verified** | 2026-05-07 (Verifier 2) — see docs/plans/<phase>/verifier-2-<smoke-id>.md |
```

When `/ship` runs, trace-verified-but-eyeball-pending smokes appear in the summary so the eyeball debt stays visible. Annotations >14 days old warn; >30 days block ship until cleared.

---

## Section template

When adding the first feature, copy the block below into the "(No pending tests)" placeholder above (and delete the placeholder). Replace `<...>` markers with concrete values. Pick a short, memorable section code (e.g., `PW` for Password Reset, `BL` for Billing, `OB` for Onboarding) and use it for all tests in the section.

````markdown
## <Feature or PR name>

**Source:** commit `<sha>`, [<spec-doc>](<path>) or [<PR link>]. <One-line context: why this test set exists.>

### <ID>-<N> — <One-line title>

| | |
|---|---|
| **Status**                    | Pending |
| **Lane**                      | sql \| wiring \| visual \| integration |
| **Hypothesized starting point** | <file or component — REQUIRED for wiring lane, omit otherwise> |
| **Trace verified**            | <date> (<who/which verifier>) — populated during Phase 9 if applicable |

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
