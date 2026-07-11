# Phase: agent-blueprint-v07-intake

**Status:** shipped ✅ (2026-07-11, v0.4.0)
**Started:** 2026-07-10
**Spec:** `docs/agent-blueprint-v07-intake-spec.md` (LOCKED 2026-07-10, plan-review PASS at HEAD `2309d81`)

## Scope

Port the 18 surviving findings from the agent-blueprint v0.6.2→v0.7.0 intake review into app-blueprint: wargame-planning falsifiability (Expected Observations, Abort conditions, `[EDIT]`/`[RUN]`/`[DECIDE]` closure tags, `/implement` consumption), dispatch & lockdown gate sharpening (`[VERIFY…]` ledger, fork-trigger exclusion, upstream-forks-block-lock, blind-executability gate), the denormalized-cache DB discipline (new SB_KB_13), two command-authoring lessons (LESSONS `[PROCESS-1]`/`[PROCESS-2]`), three safety disciplines (BLOCKED corollary, SOFT/HARD enforcement tags, git-tracked-ledger assertion), the new `/stress-test` command, and the user-facing-copy spec convention. Framework prose + command files only — no app code, no DB, no deploy surface.

## User decisions (2026-07-10, pivot review)

| Decision | Choice |
|---|---|
| Pivots | None — locked 18-item scope as-is; no parking-lot adoptions |
| D-1 (dangling `[PROCESS-1]` citations at `plan-review.md:82` + `brainstorm.md:230`) | Option (c): author the verify-now incident as app-blueprint `[PROCESS-3]`; repoint BOTH lines at it |
| D-3 (`/stress-test`) | Full command now (F1.1) + G-20 disjoint-ownership into `/implement` (F1.2) |
| G-22 (§G, hand-judged) | Implement as hand-judged — user accepted the orchestrator's primary-source verification; no live-panel re-run |

## Brainstorm findings

Brainstorm + gap analysis already done upstream: the spec is the output of a 74-agent mixed-model review (7 gap-finders → 30 candidates → 22 deduped → 3-lens judge panels → 18 survivors), then a 3-investigator `/plan-review` (anchor-integrity, capture-recheck, fork-scan) that PASSED and applied the LOCKED header. All 26 edit-block anchors verified verbatim against HEAD `2309d81`; new-file targets (SB_KB_13, stress-test.md) confirmed absent. No re-brainstorm needed.

## Sequencing + worker shape

Four workers, disjoint file ownership (per the very G-20 invariant this spec ports). Dispatch in two waves of 2 (concurrency cap).

**Wave 1 (parallel):** *(wave order set by audit Finding 1 — the `[PROCESS-3]` author runs BEFORE its citers)*
1. **Worker 1 — Wargame planning core (Section A + F1.2 + B1.2).** Owns `.claude/commands/plan.md`, `.claude/commands/implement.md`, `docs/MULTI_AGENT_WORKFLOW.md`. Edits: A1.1, A2.1, A3.1 (plan.md); A4.1, A4.2, A4.3, F1.2 (implement.md); A1.2, B1.2 (MAW.md).
2. **Worker 3 — KBs, lessons & safety prose (C + D + E1/E3 + G1.2 + D-1b).** Owns new `docs/Supabase Structure KBs/SB_KB_13_Denormalized_Cache_Discipline.md`, `SB_KB_00_Index.md`, `CLAUDE.md` (both edits: C1.3 DO-NOT + F1.1's Auditing-table row), `docs/AUTHORING_COMMANDS.md`, `docs/LESSONS.md` (PROCESS-1, PROCESS-2, PROCESS-3), `.claude/commands/brainstorm.md` (:230 repoint), `docs/Obs KBs/OBS_KB_5_Defensive_Writes.md` (E1.1), `docs/smoke-tests-pending.md` (E3.1), `docs/UI-UX KBs/UI_KB_0_Index.md` (G1.2).

**Wave 2 (parallel, after Wave 1 wraps):**
3. **Worker 2 — Lockdown & dispatch gates (Section B + G1.1 + D-1a).** Owns `.claude/commands/plan-review.md`, `.claude/commands/orchestrate.md`. Edits: B2.1, B2.2, B3.1, B4.1, G1.1 (plan-review.md); B1.1 (orchestrate.md); D-1 repoint of `plan-review.md:82` → `docs/LESSONS.md [PROCESS-3]` (which exists by then — Worker 3 authored it in Wave 1). **Intra-file apply order (audit Finding 3): B2.1 → D-1a (merged citation line) → G1.1, then B2.2 → B3.1 → B4.1-deferrable → B4.1-inverse.**
4. **Worker 4 — New command + audit acceptance (F1.1 + E2 + G-15b).** Owns new `.claude/commands/stress-test.md`, `.claude/commands/audit-rls.md` (E2.1), `.claude/commands/audit-code.md` (E2.2), and `.claude/commands/ship.md` — one-line smoke-gate note that `docs/smoke-tests-pending.md` must stay git-tracked (audit Finding 2: promised by the spec's G-15 decision row, delivered by no edit block). Does NOT touch CLAUDE.md (Worker 3 owns the commands-table row).

**Why waves, not all-4:** concurrency cap; and Wave 2's Worker 3 authors `[PROCESS-3]` which Wave 1's… no — Worker 2 (Wave 1) writes the `plan-review.md:82` citation *text* pointing at `[PROCESS-3]` before that entry exists. This is safe ONLY because the entry's ID and title are pre-pinned here (see Cross-worker contract below); Phase 8 integration verifies the pair resolves.

## Cross-worker contract (pre-pinned to keep waves independent)

- **`[PROCESS-3]` identity (D-1):** title = `### [PROCESS-3] Verify claims against the live artifact at plan-review time, not from memory or prose` — the verify-now incident both dangling citations reference. Worker 3 authors the full Rule/Why/How-to-apply entry under `## Process & Verification Patterns` in LESSONS.md, after PROCESS-1/2. Workers 2 & 3 cite it as `` `docs/LESSONS.md` `[PROCESS-3]` ``. **Pinned final form of the `plan-review.md:82` citation line (audit Finding 3):** after B2.1's ledger paragraph lands, the line reads exactly: `See ``docs/LESSONS.md`` ``[PROCESS-3]`` for the full incident behind this rule.` (only the tag changes: PROCESS-1 → PROCESS-3).
- **CLAUDE.md Auditing-table row (F1.1):** Worker 3 adds `| \`/stress-test\` | N parallel judges, each locked to one adversarial lens — verdicts + severity-ranked findings; optional disjoint-ownership fix pass | ` to the Custom Commands → Auditing table. Worker 4 writes the command file itself; wording of the one-line purpose is Worker 3's to finalize against the table's style.
- **G-22 status:** implement per spec §G verbatim; carry the spec's hand-judged disclosure into the edit annotations (no `Installed…` flag inside executed command text, per spec Flag placement).

## Collisions / blast radius

| Surface | Touched by | Resolution |
|---|---|---|
| `plan-review.md` | W2 only (B2.1, B2.2, B3.1, B4.1, G1.1, D-1a) | Single owner; B3.1 + B4.1 land in the same §6a exclusions block — W2 must apply in spec order (B3.1 bullet, then B4.1 deferrable bullet, then B4.1 inverse rule before the closing line) |
| `implement.md` | W1 only (A4.1-3, F1.2) | Single owner |
| `MULTI_AGENT_WORKFLOW.md` | W1 only (A1.2, B1.2) | Single owner (B1.2 crosses section lines to preserve file ownership) |
| `CLAUDE.md` | W3 only (C1.3 + commands-table row) | Single owner; W4 explicitly barred |
| `LESSONS.md` | W3 only (PROCESS-1/2/3) | Single owner; must land before or with the two repoints it resolves — W2's repoint (Wave 1) precedes it, gap closed at Phase 8 integration check |
| `orchestrate.md` B1.1 | W2 edits the live command file that is *currently steering this very session* | Prose-only append to a worker-doc-creation bullet; zero runtime risk (command text is read at invocation, already loaded) |
| Blast radius overall | Framework/docs only. Worst failure = a command file with a malformed insert that degrades a future session's instructions. No prod, no DB, no user-visible app surface. | Phase 8 diff review + anchor re-verification per file |

## Verification plan (Phase 8/9 preview)

- All edits are `[EDIT]`-closure class except none — no runtime behavior changes, so **no `[RUN]` smokes expected**; per the (incoming) A3.1 rule this zero-`[RUN]` plan is justified: nothing here executes at app runtime; the artifacts ARE the prose.
- Phase 8 checks: (1) every spec anchor still matched verbatim at apply time; (2) `[PROCESS-3]` exists and both repoints resolve; (3) no `Installed…` flag leaked into executed command/template text; (4) `stress-test.md` follows AUTHORING_COMMANDS conventions incl. the §6 caveats this same phase adds; (5) grep for leftover dangling `[PROCESS-1]`-style citations.
- Smoke lane: one `wiring`-lane doc-integrity smoke (cross-reference resolution sweep) PM-inline; `visual` eyeball of the rendered new KB/command optional.

## Audit findings

`/audit-code`-style execution-design audit run 2026-07-10 (subagent, live-verified at HEAD `2309d81`). Verdict: NEEDS CHANGES (minor) — all fixes applied to this plan pre-dispatch:

1. **MAJOR — dangling-citation window (FIXED):** original wave order had W2 citing `[PROCESS-3]` a wave before W3 authored it; an abort between waves would commit a citation to a nonexistent entry. Fixed by swapping waves (Wave 1 = W1+W3, Wave 2 = W2+W4); the pre-pinned contract is now belt-and-suspenders, not load-bearing.
2. **MAJOR — unassigned edit (FIXED):** spec's G-15 decisions row promises a `/ship` smoke-gate note delivered by no edit block. Assigned to Worker 4 (`ship.md`, one line).
3. **MINOR — W2 intra-file ordering (FIXED):** apply order pinned (B2.1 → D-1a → G1.1 → B2.2 → B3.1 → B4.1×2) and final `:82` citation-line text pinned in the cross-worker contract.

Clean: file ownership fully disjoint (verified per-file sweep); all 26 edits + 2 repoints + CLAUDE.md row assigned exactly once; 8 anchors re-verified verbatim at today's HEAD; zero-`[RUN]` justification survived refutation (note: `/stress-test`'s first live invocation is its calibration run, per the repo's `Installed, not yet proven` convention).

## Phase 8 verification record (2026-07-10)

All five planned checks PASSED against the working tree:

1. **Diff risk map:** 99 insertions / 13 deletions across 16 modified files + 2 new (`stress-test.md`, `SB_KB_13`) — matches the 18-item scope; largest deltas (`plan.md` +26, `LESSONS.md` +26) are the expected Section-A and D1.2/PROCESS-3 inserts.
2. **Citation resolution:** zero dangling `[PROCESS-1]` citations remain in `.claude/commands/`; all THREE repoints (`plan-review.md:82`, `brainstorm.md:230`, `plan.md:53` — the third found by Workers 1+3 independently) resolve to `LESSONS.md:59 [PROCESS-3]`, which exists with the pinned title.
3. **Flag leakage:** zero `Installed 2026-07-10` flags in `.claude/commands/` or `CLAUDE.md`; flags present only in the four intended doc-prose surfaces (MAW, LESSONS, OBS_KB_5, SB_KB_13).
4. **stress-test.md conventions:** 88 lines; `arguments:` frontmatter (zero `argument-hint`); exactly one fenced block (the consumed-verbatim judge prompt); already registers as an invocable skill.
5. **Structural eyeball (highest-delta):** plan-review.md §3a (citation line → ledger → copy-locking → §3b) and Step 6a (6 exclusion bullets → inverse-rule paragraph → closing line) read exactly per Worker 2's audited layout; orchestrate.md:113 combined rewrite intact.

## Smoke tests added

**None added to `docs/smoke-tests-pending.md`.** Rationale (per the incoming A3.1 rule's own zero-`[RUN]` justification requirement): every change is prose in command/doc files with no app-runtime surface — nothing here can be exercised against a running app. The `wiring`-lane doc-integrity smoke (cross-reference resolution sweep) was run PM-inline in Phase 8 (check 2) and passed. The true live validation of these disciplines is their first real use, which is why each doc-prose insert carries the `Installed 2026-07-10, not yet proven in a live run` flag — the repo's standing convention for exactly this case. `/stress-test`'s first invocation is its calibration run.

## Worker plan docs

- `docs/plans/agent-blueprint-v07-intake/worker-1-wargame-planning-core.md` (Wave 1)
- `docs/plans/agent-blueprint-v07-intake/worker-3-kbs-lessons-safety.md` (Wave 1)
- `docs/plans/agent-blueprint-v07-intake/worker-2-lockdown-gates.md` (Wave 2)
- `docs/plans/agent-blueprint-v07-intake/worker-4-stress-test-audit-tags.md` (Wave 2)
