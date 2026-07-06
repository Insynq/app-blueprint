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

## [0.2.1] - 2026-07-05

Fixes a manifest-completeness bug in the v0.2.0 release and adds a `/ship` gate so it can't recur. v0.2.0 added `docs/verification-discipline-adoption-spec.md` (an internal framework-development spec) but never enumerated it in `.framework-manifest.json` — and docs/ root files require explicit enumeration — so `/update-framework` couldn't categorize the file and mishandled the per-file merge for adopters. Surfaced by a downstream adopter's dry-run.

### Fixed

- `.framework-manifest.json`: enumerate `docs/verification-discipline-adoption-spec.md` under `excluded` — an internal spec that never ships to adopters, same treatment as `docs/AUDIT_FINDINGS.md`. The manifest now accounts for all 136 tracked files (verified: zero uncovered).

### Added

- `.claude/commands/ship.md`: **Step 4.5 — manifest completeness gate** (canonical repo only; auto-skips in adopter projects). Before committing a framework ship, it verifies every tracked file is covered by a manifest rule (exact entry or directory rule) and STOPS the ship with the list of uncovered files if not. Prevents the exact class of bug that broke v0.2.0 — a new file, especially a `docs/` root file, that never got manifest-enumerated.

## [0.2.0] - 2026-06-26

Reverse sister-framework adoption: ports agent-blueprint's verification & safety-discipline layer (its v0.4.0–v0.5.1 work) into app-blueprint, reframed for web apps. The change-set was field-validated against 12 real downstream transcripts (9 eXp Onboarding + 3 Kai-App), which **inverted** the original draft's priorities — so the additions are ordered by what the field actually proved. Spec: `docs/verification-discipline-adoption-spec.md` (LOCKED 2026-06-26).

**Provenance discipline applied to this very release.** The proven-core additions (A3 ship truth-gate, A4 provenance) are **field-attested** — 6 + 5 confirmed downstream instances incl. a re-verified prod outage. The adversarial-skeptic and smoke-debt additions (A1, A2, N1, N2) are installed but their *specific mechanisms* have **not yet fired in a live run** — each carries the literal `Installed, not yet proven in a live run.` flag in its own prose. B1 ships as a reference KB only (0 field instances; silent-open is a runtime phenomenon absent from dev transcripts).

### Added
- **`docs/Obs KBs/OBS_KB_5_Defensive_Writes.md`** (reference KB, NOT an audit gate) — Primitive 0 (close the capability: don't expose mass-delete / service-role-bypass; gate rare needs behind a human-confirmed UI) + Primitive 9 (fail loud or fail closed; never `catch → log → continue` silent-open), web-reframed for Server Actions / outbox / webhooks / migrations. Owns the *error surface* of a write; JOB_KB_1 owns the *work-claiming surface* (disambiguated, cross-referenced in both indexes). `Installed, not yet proven in a live run.`
- **Re-grounding + independent Refutation Pass** in `/audit-code`, `/audit-rls`, `/audit-infra`, `/audit-full` — every load-bearing security-class finding (or all-clear) is re-derived against the **live SQL/policy/config this run** (never a stale `file:line` citation), then an independent skeptic agent is spawned **per security-class category** to try to KILL it; a Refutation Ledger supersedes the verdict, with a cost escape-hatch BLOCKER and a blind-spot disclaimer for an empty set. `Installed, not yet proven in a live run.`
- **Independent skeptic at `/debug`'s three-strikes escape hatch** — replaces the debugger's self-asserted "the assumption I think is false" with a fresh agent that names the false premise from the primary artifact. `Installed, not yet proven in a live run.`
- **Ground-first primary-artifact anchor** — mandatory in `/debug` (Step 1: quote the literal error/test/query verbatim before hypothesizing), optional/best-effort in `/investigate`. `Installed, not yet proven in a live run.`
- **N1 — deferred-smoke debt rollup + phase-boundary forcing function** — `smoke-tests-pending.md` gains a standing "Deferred prod smokes" ledger; `/ship` Step 3.6 surfaces the accumulated count at every phase boundary and forbids deferring a smoke past a boundary without a logged per-smoke user grant (kills the self-authorized "authorized posture" ratchet). `Installed, not yet proven in a live run.`
- **N2 — mandatory live-smoke gate for service-boundary flows** — a `live-required` tag for auth / email / webhook / external-API / payment flows; `/ship` Step 3.5 treats it as gating (unit/typecheck/pgTAP green is not sufficient), wired into the workflow Phase 9 lane discipline. `Installed, not yet proven in a live run.`
- **A5 — `/plan-review` Step 6 Lockdown Check** — back-fills the decision-discipline layer app-blueprint never received from its own retro: scans for unresolved forks, verifies each decision is recorded with a cited evidence source, and on pass writes the `> **Status: LOCKED YYYY-MM-DD**` header that `/orchestrate` Phase 6 and `/implement` key on.

### Changed
- **`/ship` Step 3.5** — smoke truth-gate hardened: a never-run / `Pending` / absent in-scope smoke now surfaces as `Unverified at ship: <id>` and may never launder into "Ship Complete"; added a reconciliation rule (defer only with a named follow-up phase or owner+date), a re-confirmation gate (a bare user "pass" ≠ test-execution evidence), and the N2 `live-required` gate. **Field-attested (A3).**
- **`/ship` Step 5** — commit composition gains a provenance discipline: tag carried claims `[verified]`/`[relayed]`, never harden a hedge, never let front-confidence exceed back-caveats, carry any `Unverified at ship` line verbatim. **Field-attested (A4-provenance).**
- **`/brainstorm` Phase 2** — Explore-digest claims carried into options must be provenance-tagged `[verified]`/`[relayed]`; an option's confidence may not exceed the strongest caveat behind it. **Field-attested (A4-provenance).**
- **`docs/MULTI_AGENT_WORKFLOW.md`** — Phase 8 wiring-lane discipline reframed to name the existing trace-verifier ("read it expecting errors in both directions"; don't build a parallel verify-the-synthesis step); Phase 9 gains the N2 service-boundary live-smoke note.
- **`CLAUDE.md` Patterns** — adds a "Verification & safety disciplines (framework-provided)" block naming the lockdown convention, re-grounding+refutation, ground-first anchor, truth-gate, deferred-smoke rollup, service-boundary gate, and fail-loud-or-closed (reference).
- **`docs/Obs KBs/OBS_KB_00_Index.md` · `docs/Job KBs/JOB_KB_00_Index.md`** — OBS_KB_5 added to the file index, dependency graph, and cross-cutting Always rules, with the OBS_KB_5 ↔ JOB_KB_1 error-surface vs. work-claiming-surface disambiguation.
- **`.framework-manifest.json`** — `version` synced from a drifted `0.1.5` to `0.2.0` (it had fallen behind `package.json`).

### Migration Notes
- **`docs/smoke-tests-pending.md` is project-owned (skip on update).** Adopters who already have this file will NOT auto-receive the N1 "Deferred prod smokes" rollup section or the N2 `live-required` tag — merge them manually from the canonical template.
- **`CLAUDE.md` is hybrid (sibling on update).** The new Patterns block arrives as `CLAUDE.md.framework` alongside the adopter's file — merge the discipline pointers in by hand.
- The A1/A2/N1/N2 disciplines ship flagged `Installed, not yet proven in a live run` — the first downstream run that exercises a refutation pass, a three-strikes skeptic, a deferred-smoke rollup, or a `live-required` gate is calibration data; capture how it behaved.

## [0.1.10] - 2026-06-01

Fixes a systemic argument-substitution bug across the command library and documents the convention that prevents it. The runner substitutes only a single flat `$ARGUMENTS` string, but ~15 commands used dotted access (`$ARGUMENTS.topic`) and Handlebars (`{{#if focus}}`, `{{#unless file}}`, `{{depth | default}}`) the runner does not process — so those tokens leaked as literal text into prompts and commits. Most were cosmetic (the agent usually recovered intent), but `changelog.md` was a real functional break: the literal `{{#if since}}$ARGUMENTS.since..HEAD{{/if}}` reached `git log` as a bogus revision arg and errored. Found by a downstream adopter (flagged 6; a full scan surfaced 15).

### Fixed

- **15 command files** had argument-referencing rewritten to the flat-`$ARGUMENTS` convention, behavior preserved:
  - `changelog.md` — **functional break fixed**: the `since` filter now resolves a concrete `<since>..HEAD` ref (or full history) instead of passing literal Handlebars into `git log`.
  - Single-arg display leaks (`$ARGUMENTS.x` → `$ARGUMENTS`): `brainstorm`, `unify`, `debug`, `plan-review`, `gen-test`, `visualize`, `plan`.
  - Optional-arg `{{#if}}` blocks reworded to prose conditionals: `audit-infra`, `audit-rls`, `research` (incl. `{{… | default}}` filters), `audit-full`, `db-push` (`{{#if}}`/`{{#unless}}` file & skip-audit branching).
  - Multi-arg parsing: `update-framework` (target-version + allow-downgrade/dry-run/yes flags, now parsed from the flat string and robust to flag order), `adopt` (`minimal` flag ×6).

### Added

- `docs/AUTHORING_COMMANDS.md` §2 — **"Referencing arguments in the body"**: documents that the runner substitutes only flat `$ARGUMENTS` (no dotted access, no Handlebars), with prose patterns for single / optional / multiple arguments and a "grep for `$ARGUMENTS\.` and `{{` before shipping" check. This missing convention is what let the bug spread to ~15 commands.

## [0.1.9] - 2026-06-01

Folds three `/ship` improvements upstream from a downstream adopter, adapted to the canonical step structure (the adopter's project-local Step 3 doc-layout customization was NOT pulled up).

### Fixed

- `.claude/commands/ship.md`: **`$ARGUMENTS` template mangling (bug).** The skill referenced named/structured args (`$ARGUMENTS.message`, `$ARGUMENTS.phase`) and Handlebars (`{{#if phase}}`), but the Skill harness substitutes only a single flat `$ARGUMENTS` string — so `.message` / `.phase` / `{{…}}` survived as literal text and could leak into commits and output (observed live: a `/ship` invocation whose commit subject ended in a stray `.message`). Every site now uses flat `$ARGUMENTS`, and **Step 5 now instructs the agent to COMPOSE** a clean commit message (≤72-char imperative subject + a distilled body) from the free-text summary rather than paste it verbatim. Instruction #3 and the final-output template updated to match; an explicit "never emit template tokens" rule added.

### Added

- `.claude/commands/ship.md`: **Step 6.5 — gated merge-to-main + branch cleanup.** Runs only when the ship request explicitly says to land/merge ("ship and merge", "land it", "merge to main"); the default (push branch + remind to open a PR) is unchanged. Fast-forwards `main`, merges `--no-ff`, verifies, pushes, then deletes the merged branch locally + remote using safe deletes only (`git branch -d`, never `-D`; tolerates an already-auto-deleted remote branch). Safety rails: stop on any conflict, never force-push, never force-delete. Includes a stacked-branch caution, an "already on main → skip" guard, and a companion note to enable GitHub's "Automatically delete head branches" for the PR-merge path. Ordered **before** the release step so the release tags `main`; the prior release step renumbers 6.5 → 6.6.

### Changed

- `.claude/commands/ship.md`: **model-trailer hygiene.** The hardcoded `Co-Authored-By: Claude Sonnet 4.6` is replaced with a clearly-marked `<MODEL>` placeholder plus an instruction to fill in the model actually executing the ship — preventing the version drift that forced hand-correction downstream (rather than re-hardcoding a version that drifts again).

## [0.1.8] - 2026-06-01

Hardens the v0.1.7 auto-release step after its first live run exposed two environment-fragility bugs. The v0.1.7 release still published, but only because the ship subagent hand-recovered per the step's non-fatal contract — the script as written would fail unattended on common setups.

### Fixed

- `.claude/commands/ship.md` Step 6.5: replaced the `printf '%s' "$VERSION" | grep -q '-'` pre-release test with a shell-native `case "$VERSION" in *-*)` glob — the old form broke where `grep` is aliased to `ugrep` (the bare `-` is mis-parsed as a flag). Replaced the unquoted `$NOTES_FLAG` string (which arg-split into a single invalid `gh` token) with an always-non-empty notes file passed as one quoted `--notes-file` argument. The step now runs end-to-end with no manual recovery, on both `grep` and `ugrep` environments.

## [0.1.7] - 2026-06-01

Closes a release-publishing gap that silently stranded adopter projects. `/update-framework` resolves versions **only** from the GitHub Releases API, but the canonical `/ship` only committed and pushed — it never tagged or published a release. The result: three framework versions (0.1.4 stable, 0.1.5, 0.1.6) were committed and changelogged yet invisible to every adopter until a manual release was cut by hand. This adds an automatic release step to `/ship`, guarded so it runs only in the canonical framework repo and is an inert no-op in every app built on the framework.

### Added

- `.claude/commands/ship.md`: **Step 6.5 — Publish Framework Release** (canonical repo only). A `FRAMEWORK_CHANGELOG.md` + `bin/init.js` presence guard makes the step skip entirely in adopter projects (neither file is ever distributed into an app). When canonical and the shipped `package.json` version has no matching release, it extracts that version's notes from `FRAMEWORK_CHANGELOG.md`, tags the shipped commit, and runs `gh release create` — `--prerelease` (no `--latest`) for versions containing `-`, `--latest` otherwise. Idempotent (skips if the release already exists) and non-fatal (a release failure is reported with a manual fallback command and never rolls back the completed commit/push).

## [0.1.6] - 2026-06-01

Refines the phase-loop and planning rituals after a real multi-wave project arc surfaced friction. Every change is a **fold-in to an existing artifact — no new commands** — a deliberate rejection of an over-broad "add 6 new skills" proposal (`/architect`, `/lockdown`, `/retro`, `/mockup-explore`, a mandated decisions section, pre-seeded LESSONS entries) in favor of small, reversible edits that don't duplicate mechanisms the framework already has. An adoption analysis applied the project's calibrate-first / refuse-duplication rules: 4 fold-ins, 1 deferred pilot (HTML mockup harness — earns a future project trial, not a skill), 2 rejects (`/architect` duplicates the PM role; seeding the project-owned `LESSONS.md` violates its incident-grounded contract).

### Added

- `docs/MULTI_AGENT_WORKFLOW.md`: **Phase 4 lockdown gate** — a 3-item checklist the PM confirms before drafting worker prompts (no unresolved architectural fork open; scope confirmed; UI slices have a visual artifact the user has seen — conditional, not a precondition for backend work). Resolves forks at dispatch time instead of mid-implementation across two workers.
- `docs/MULTI_AGENT_WORKFLOW.md`: **"Scaling the PM across waves"** escape-hatch note — an optional second architecture-only PM window for multi-wave work that overflows one context. A documented release valve, explicitly *not* a prescribed layer and *not* a `/architect` command.
- `.claude/commands/ship.md`: **Step 3.6 Phase Retro Sweep** (fires only when a phase argument is given) — routes retro signals to existing homes: durable lessons → `LESSONS.md`, decisions → `KB_8`/`KB_1`, close-calls → `LESSONS.md` + `tests/smoke/.calibration-log.md`, tooling-to-build → `PARKING_LOT.md` tagged `framework-meta`. No new retro doc.
- `.claude/commands/plan.md`: optional `### Decisions` table (Fork | Resolution | Date) in the plan output format — included only when a plan resolves an architectural fork.
- `docs/KB_1_Architecture.md`: self-documenting `## Architecture Decisions` table (Decision | Choice | Reasoning | Date) with an example row, replacing the bare `[Empty]` placeholder.

### Changed

- `.claude/commands/plan-review.md`: Step 5 now names the decision destination explicitly — durable architectural decisions → `KB_1_Architecture.md` `## Architecture Decisions`; spec-local tactical decisions → the affected step's inline `**Why:**` — replacing the ambiguous "the relevant section."
- `docs/PARKING_LOT.md`: lifecycle note documenting the `framework-meta` tag for tooling / framework-workflow improvements surfaced during phase retros.
- `package.json`: version bumped to `0.1.6`.

## [0.1.5] - 2026-05-29

Adds a project-owned **Parking Lot** doc and wires `/orchestrate` pivot review and `/brainstorm` Phase 1 to read it. Captures observations / open questions / considerations that surface mid-work without committing to scope, then funnels them into pivot review at phase boundaries (adopt / defer / drop) and into brainstorms as an overlap check before recommending an approach. Closes the loop between mid-work observation capture and the scoping rituals — without a parking lot, items either get chased mid-task (violating the "never pivot mid-task" rule) or forgotten.

Also adopts four mechanisms from the obra/superpowers skills ecosystem after a review for fit: (1) all 25 command `description` fields rewritten to **WHEN-to-use** trigger/symptom form rather than workflow summaries — the agent selects a command from its description alone and was observed following workflow-style descriptions instead of reading the body; (2) a new `docs/AUTHORING_COMMANDS.md` capturing command-authoring conventions (previously implicit) plus the description rule; (3) an explicit **verification gate** in `MULTI_AGENT_WORKFLOW.md` Phase 8 ("fresh evidence, not the worker's word") and a seventh trace-verifier contract item ("verify the code, not the report"); (4) a piloted **Iron-Law discipline** treatment on `/debug` (unconditional root-cause rule + rationalization table + 3-strikes escape hatch). The `condition-based-waiting` principle was folded into `TEST_KB_6` rather than added as a new surface.

### Added

- `docs/PARKING_LOT.md`: project-owned skeleton with **Open** / **Adopted into scope** / **Resolved / dropped** sections plus a lifecycle blurb. Manifest entry: `project-owned`, default action `skip` (template ships once on install; framework never overwrites adopter content).
- `CLAUDE.md`: indexes `PARKING_LOT.md` under "Project state" with a note that `/orchestrate` reads it during pivot review and `/brainstorm` reads it as an overlap check.
- `.claude/commands/orchestrate.md`: Step 1 (pivot review) now reads `PARKING_LOT.md` Open items, surfaces them in the user-facing pivot question, and moves adopted/dismissed items to the corresponding sections.
- `.claude/commands/brainstorm.md`: Phase 1a now reads `PARKING_LOT.md` for topic overlap and surfaces overlapping items in the final output (Context / Constraints) rather than rediscovering them.
- `docs/AUTHORING_COMMANDS.md`: new framework-managed doc — conventions for writing/editing commands (the WHEN-not-WHAT description rule, frontmatter, naming, search optimization, body structure, the Iron-Law discipline pattern). Manifest entry: `framework-managed`, default action `overwrite-with-backup`.

### Changed

- `.framework-manifest.json`: added `docs/PARKING_LOT.md` to `categories.project-owned` and `default_action_on_conflict` (`skip`); added `docs/AUTHORING_COMMANDS.md` to `categories.framework-managed`.
- `.claude/commands/*.md` (all 25): rewrote the `description` field to WHEN-to-use trigger/symptom form (leads with the situation that should invoke the command; adds negative routing between easily-confused commands; keyword coverage for search). No body or argument changes.
- `docs/MULTI_AGENT_WORKFLOW.md`: added a **verification gate** callout to Phase 8 (a worker's "done" is a claim, not evidence — PM must run the check this exchange and read the output before calling a slice verified) with a claim/verifies/not-sufficient table; added trace-verifier contract item 7 ("verify the code, not the report" — treat any implementer notes as unverified claims) and bumped the contract header from six to seven.
- `.claude/commands/debug.md`: piloted the Iron-Law discipline pattern — upgraded the soft "core rule" into an unconditional **NO FIX WITHOUT A CONFIRMED ROOT CAUSE** rule with a rationalization-rebuttal table, the letter-vs-spirit line, and a 3-strikes escape hatch (after three failed fixes, stop and question the problem model); wired the escape hatch into the post-return handling. Scoped to `/debug` only pending calibration before any wider rollout.
- `docs/Test KBs/TEST_KB_6_Async_Realtime_Outbox.md`: named the **condition-based waiting** principle at the head of §14 (wait for the actual condition, never a fixed delay) with a don't/do table, unifying the previously-scattered `expect.poll` / `vi.waitFor` / Playwright auto-wait tactics.

### Removed

- N/A

### Renamed

- N/A

### Migration Notes

- **Existing adopters:** `docs/PARKING_LOT.md` is `project-owned` with `skip`, so `/update-framework` will install the template only if you don't already have one. If you've been keeping parking-lot-style notes elsewhere (Notes app, scratch doc, memory entries), migrate them into `docs/PARKING_LOT.md` Open section so `/orchestrate` and `/brainstorm` start picking them up automatically.
- **No-op for projects that don't use `/orchestrate` or `/brainstorm`:** the doc is informational; nothing breaks if you ignore it.

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
