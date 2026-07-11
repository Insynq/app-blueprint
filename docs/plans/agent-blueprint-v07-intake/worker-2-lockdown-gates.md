# Worker 2 — Lockdown & dispatch gates (Section B + G1.1 + D-1a)

**Phase:** agent-blueprint-v07-intake
**Status:** done
**Spec:** `docs/agent-blueprint-v07-intake-spec.md` (LOCKED 2026-07-10) — Section B, G1.1, D-1a. Spec edit blocks are authoritative text. Runs in **Wave 2**: `docs/LESSONS.md [PROCESS-3]` already exists (Worker 1/3 wave landed first) — verify it does before repointing.

## Task

Land the lockdown/dispatch-gate cluster in `plan-review.md` and `orchestrate.md`: the in-spec `[VERIFY…]` verification ledger (B2.1) + Step 6a pattern bullet (B2.2); the execution-time fork-trigger exclusion (B3.1); the genuinely-deferrable exclusion + upstream-forks-block-lock inverse rule (B4.1); the user-facing-copy locked-spec convention (G1.1); the D-1a repoint of the dangling `[PROCESS-1]` citation at `plan-review.md:82`; and the blind-executability gate appended to `orchestrate.md:113`'s worker-doc-creation bullet (B1.1).

## Files involved

- `.claude/commands/plan-review.md` — B2.1 (§3a ledger paragraph, replace/extend around :82), D-1a (:82 citation line final form — pinned in phase-plan.md Cross-worker contract: `See `docs/LESSONS.md` `[PROCESS-3]` for the full incident behind this rule.`), G1.1 (copy-locking convention paragraph in §3a near B2.1), B2.2 (Step 6a pattern bullet after :157), B3.1 (exclusion bullet after :166), B4.1 (deferrable-exclusion bullet after B3.1 + inverse-rule paragraph immediately before the "A match qualifies as UNRESOLVED only when…" closing line)
- `.claude/commands/orchestrate.md:113` — B1.1 blind-executability sentence appended to bullet 1. **PM supplement (Phase 6 ruling on Worker 1's F3):** in the same bullet, extend the fill list `Fill in: Task, Files involved, Constraints / non-goals.` → `Fill in: Task, Files involved, Constraints / non-goals (plus Expected observations & Abort conditions at Complexity ≥ Medium — see MULTI_AGENT_WORKFLOW.md worker-doc skeleton).` — the PM owns filling the two new skeleton sections Worker 1's A1.2 adds; the blind-executability gate depends on them being filled pre-dispatch.

## Constraints / non-goals

- **Intra-file apply order (mandatory, audit Finding 3):** B2.1 → D-1a → G1.1 → B2.2 → B3.1 → B4.1-deferrable → B4.1-inverse. Later anchors (G1.1 is positional "near the B2.1 insert") only resolve after earlier inserts land.
- Before D-1a: confirm `docs/LESSONS.md` contains a `### [PROCESS-3]` heading. Absent → STOP, log blocker (wave-order violation), do not repoint to a nonexistent entry.
- Insert spec text verbatim; no `Installed…` flags inside command text (operational surface).
- Do NOT touch `plan.md`, `implement.md`, `MULTI_AGENT_WORKFLOW.md` (Worker 1), LESSONS.md/brainstorm.md/KBs (Worker 3), or stress-test/audit-*/ship (Worker 4).
- Line refs are HEAD `2309d81` pre-Wave-1; Worker 1/3 did not touch your two files, but re-locate all anchors by verbatim text anyway; on mismatch, STOP and log a blocker.

## Granular audit

*Audited 2026-07-10 against the working tree (post-Wave-1). No target-file edits made — audit only.*

### A. Anchor verification (all verbatim at today's tree)

| Edit | Anchor | Status |
|---|---|---|
| B2.1 / D-1a | `plan-review.md:82` — `` See `docs/LESSONS.md` `[PROCESS-1]` for the full incident behind this rule. `` | **Verbatim match, unique in file.** Wave 1 did not touch plan-review.md (confirmed: not in `git status` modified set). |
| B2.2 | `plan-review.md:157` — `` - Phrases like `open decision`, `unresolved`, ... `` | **Verbatim match, unique.** Sits under `### 6a: Scan for unresolved-fork patterns` (:150) as spec states. |
| B3.1 | `plan-review.md:166` — `- The match is inside a "Resolved decisions" or post-release "revisit triggers" section…` | **Verbatim match, unique.** Spec's corrected :166 ref is accurate; it is the 4th (last) bullet of the Step 6a exclusions block (:161–166). |
| B4.1-inverse | `plan-review.md:168` — `A match qualifies as **UNRESOLVED** only when it represents an actual decision *in this spec's content* that has no corresponding closure.` | **Verbatim match, unique.** Closing line sits after a blank line following the exclusions bullets — the inverse-rule paragraph slots cleanly between list and closing line. |
| B1.1 + PM supplement | `orchestrate.md:113` — bullet 1 incl. `Fill in: Task, Files involved, Constraints / non-goals.` | **Verbatim match; `Fill in: Task` occurs exactly once in the file.** No existing "blind"/gate text anywhere in orchestrate.md. |
| G1.1 | Positional — "§3a near the B2.1 insert" | **Resolves only after B2.1 lands** (as the pinned apply order requires). §3a today spans :66–82, ending at the citation line before `### 3b` (:84). See Finding 3 for the concrete landing spot. |

### B. Wave-1 precondition ([PROCESS-3])

`docs/LESSONS.md:59` contains `### [PROCESS-3] Verify claims against the live artifact at plan-review time, not from memory or prose` — **character-exact match to the pinned title** in phase-plan.md's Cross-worker contract. D-1a is unblocked. Bonus confirmation: Worker 3 already repointed `brainstorm.md:230` to `[PROCESS-3]`; a repo-wide grep shows `plan-review.md:82` is now the **only** remaining `[PROCESS-1]` citation in `.claude/commands/` — after D-1a lands, the Phase 8 dangling-citation grep (check 5) will pass with zero hits.

### C. Finding 3 — concrete resolution of B2.1 "replace/extend" vs. the :82 pinned final form

The spec's B2.1 says "replace/extend with the ledger paragraph"; the cross-worker contract pins the :82 line's final form as the same sentence with only the tag changed. These compose only one way — **EXTEND, never replace**:

1. If B2.1 "replaced" line 82, D-1a would have no target and the pinned final form (`` See `docs/LESSONS.md` `[PROCESS-3]` for the full incident behind this rule. ``) would be unachievable. So the citation line **stays**.
2. The citation line grounds the earned/assumed discipline above it (:68–80); the ledger paragraph is a *new adjacent* discipline, not a rewrite of that one.
3. **Resolved placement:** insert the B2.1 ledger paragraph as a new paragraph **after line 82** (end of §3a, before `### 3b` at :84), leaving :82 untouched by B2.1. D-1a then edits :82 in place: `[PROCESS-1]` → `[PROCESS-3]`, nothing else. (Placing the ledger *before* :82 was considered and rejected: it would make "the full incident behind this rule" ambiguously read as covering the ledger too, and it complicates G1.1's "near the B2.1 insert" anchor.)

Final §3a order after my three inserts: existing 3a text (:66–80) → citation line (tag = PROCESS-3) → B2.1 ledger paragraph → G1.1 copy-locking paragraph → `### 3b`.

### D. Apply-order simulation (B2.1 → D-1a → G1.1 → B2.2 → B3.1 → B4.1-def → B4.1-inv)

Walked mentally; every later anchor still resolves after each earlier insert:

- All later anchors are **verbatim-text** anchors, immune to the line-number drift the §3a inserts cause (~+11 lines by the time Step 6 edits apply). B2.2's :157 anchor and B3.1's :166 anchor remain unique strings.
- **G1.1** resolves per Finding 3: immediately after the ledger paragraph, last content in §3a. The spec's G-22 hand-judged caveat ("re-verify placement + confirm no overlap") is discharged for my file: plan-review.md contains **zero** pre-existing user-facing-copy / wording / never-say guidance (grep clean). The UI-UX-KB overlap half of that caveat belongs to Worker 3's G1.2 (UI_KB_0_Index.md, already modified in Wave 1) — out of my scope, flagged for PM in Recommendations.
- **B4.1-deferrable**'s anchor is relative ("after B3.1") — resolves only after B3.1's bullet exists; order is honored. It lands as the 6th exclusions bullet.
- **B4.1-inverse** lands between the (now 6-bullet) exclusions list and the :168 closing line. Structurally coherent: bullets → bold prose paragraph → closing qualifier. The inverse rule references the "Deferred / Out-of-Scope … Genuinely deferrable" concept that only the B4.1-deferrable bullet introduces — they land in the same edit pass, so no dangling reference at any observable state *if applied in one session* (they are; noted as a do-not-split constraint in Recommendations).

### E. Duplication / contradiction check (pre-existing text)

- No `[VERIFY` tag text exists anywhere in plan-review.md today (only prose "VERIFY now" at :80, different concept) — B2.1/B2.2 duplicate nothing.
- B2.1's "counts as UNRESOLVED in the Step 6 check" and B2.2's "blocks lock" are consistent with existing Step 6 vocabulary (UNRESOLVED at :159/:168, UNVERIFIED at :192 is a distinct 6c concept — no collision).
- B3.1's execution-time fork-trigger bullet vs. existing bullet 4 (:166, post-release revisit triggers): **distinct and non-contradictory** — runtime branch within this release vs. deliberate future milestone. Worth keeping B3.1 immediately after :166 (as specced) so the two "legitimate deferral" shapes read as a family.
- B4.1-deferrable vs. existing "Resolved decisions" clause in :166 — distinct (justified deferral ≠ resolved decision); no contradiction.
- orchestrate.md bullet 1's stub-list sentence ("Leave the audit / recommendations / PM annotations / implementation log sections as stubs.") stays correct after the fill-list extension — Expected observations & Abort conditions are PM-**filled**, not stubs; no rewrite needed.

### F. PM supplement (orchestrate.md:113 fill-list extension) — audited as directed

- The supplement's cross-reference resolves: MULTI_AGENT_WORKFLOW.md's worker-doc skeleton **now contains** `## Expected observations & failure signals` (:267) and `## Abort conditions` (:275) — Worker 1's A1.2 landed in Wave 1.
- Consistency with the landed B1.2 mirror (MAW:298): that line already reads `skeleton + Task / Files / Constraints (plus Expected observations & Abort conditions at Complexity ≥ Medium) filled in` + the gate sentence. The PM supplement makes orchestrate.md:113 say the same thing on the command side — **consistent, and required**: without it the blind-executability gate would demand answers the PM never filled in.
- Minor wording delta, non-blocking: the supplement (and MAW:298) say "Expected observations & Abort conditions"; the skeleton heading is "Expected observations & **failure signals**". Same section, abbreviated name; the "see MULTI_AGENT_WORKFLOW.md worker-doc skeleton" pointer disambiguates. Apply the supplement verbatim as pinned (it is a final PM decision); do not "fix" the name.
- Composition of the two same-bullet edits: the fill-list replacement and the appended gate sentence touch **non-overlapping substrings** of bullet 1 — either order works; I will apply as one combined edit for atomicity.
- Wording check: B1.1's gate says "run this **brief**" (orchestrate) vs. MAW's "run this **doc**" — deliberate per-surface wording in the spec's two edit blocks, not drift. Insert verbatim per surface.

### G. Flag-placement compliance

Both my files are **operational surfaces** (command bodies). Per the spec preamble's Flag-placement rule, no `Installed 2026-07-10…` flag goes inline in either file — the flag lives as edit-block annotation + decisions-row only. (MAW:298's inline flag is Worker 1's doc-prose surface — correct there, not a precedent for mine.)

**Findings: 10 · Blockers: 0.** All anchors verbatim-clean; [PROCESS-3] precondition met; the one genuine spec ambiguity (B2.1 replace-vs-extend) resolved with a pinned concrete form.

## Recommendations

1. **Adopt the EXTEND resolution for B2.1 (Finding C)** as binding: :82 citation line untouched by B2.1; ledger paragraph inserted after it; D-1a is a one-token in-place edit `[PROCESS-1]` → `[PROCESS-3]`. Final §3a layout: earned/assumed text → citation line → ledger → G1.1 copy-locking paragraph → `### 3b`.
2. **Apply B4.1-deferrable and B4.1-inverse in the same edit pass** (never split across sessions): the inverse rule cites the "Genuinely deferrable" section concept the deferrable bullet introduces.
3. **Apply the two orchestrate.md:113 sub-edits (fill-list extension + gate append) as one combined bullet rewrite** — non-overlapping substrings, but a single edit removes any intermediate-state anchor risk. Keep the PM supplement text character-exact as pinned in Files involved.
4. **Do not normalize wording deltas**: keep "brief" (orchestrate) vs "doc" (MAW), and "Expected observations & Abort conditions" (supplement) vs "…& failure signals" (skeleton heading) — all pinned/spec-verbatim.
5. **Step 6a exclusions block final shape** (for the PM's integration read): 6 bullets (4 existing + B3.1 + B4.1-deferrable), then the B4.1-inverse bold paragraph, then the existing :168 closing line. Coherent as audited; no restructuring needed.
6. **For PM / Phase 8, not my slice:** (a) the G-22 hand-judged caveat's *UI-KB-overlap* half should be confirmed against Worker 3's landed G1.2 edit in `UI_KB_0_Index.md` — I verified only the plan-review.md half (clean); (b) after my D-1a lands, the repo-wide `[PROCESS-1]`-dangling grep (Phase 8 check 5) should return zero hits in `.claude/commands/` — brainstorm.md:230 is already repointed.
7. **No re-anchoring needed at implementation time beyond re-grep**: all five verbatim anchors are unique strings; a pre-edit `grep -n` per anchor (already my plan-doc constraint) is sufficient protection against drift between now and Phase 7.

## PM annotations

**PM annotation (2026-07-10, Phase 6 reconciliation):** All 7 recommendations APPROVED as binding. Specifically:

- **Rec 1 (EXTEND resolution) ADOPTED:** B2.1 ledger paragraph inserts after the untouched `:82` citation line; D-1a is the one-token tag swap; final §3a layout as you specified.
- **Rec 2 & 3 ADOPTED:** B4.1's two pieces in one pass; orchestrate.md:113's two sub-edits as one combined bullet rewrite, supplement text character-exact.
- **Rec 4 ADOPTED:** no wording normalization — spec/pinned text verbatim.
- **Rec 6 DISCHARGED by PM:** the UI-KB-overlap half of the G-22 caveat was already grep-verified clean by Worker 3's Phase 5 audit (zero copy-locking vocabulary hits across `docs/UI-UX KBs/` — their Finding 4) and their landed G1.2 is a one-line pointer, not guidance that could overlap. The Phase 8 zero-dangling-`[PROCESS-1]` grep is on my checklist.
- Proceed to implementation exactly per your audited plan. No scope changes.

## Implementation log

*Phase 7, 2026-07-11. All 7 edits applied in the pinned order; all anchors re-grepped verbatim before editing; zero blockers.*

1. **Precondition re-verified:** `docs/LESSONS.md:59` `### [PROCESS-3]` present (Wave 1 landed) — D-1a unblocked. Both target files still un-drifted from the audit's state.
2. **B2.1** ✅ — ledger paragraph inserted after the untouched `:82` citation line, before `### 3b` (EXTEND per Rec 1). Now `plan-review.md:84`.
3. **D-1a** ✅ — one-token swap `[PROCESS-1]` → `[PROCESS-3]` at `plan-review.md:82`, nothing else changed on the line.
4. **G1.1** ✅ — copy-locking paragraph inserted after the ledger, last content in §3a. Now `plan-review.md:86`.
5. **B2.2** ✅ — `[VERIFY…]` pattern bullet appended after the phrases bullet in Step 6a. Now `plan-review.md:162`.
6. **B3.1 + B4.1-deferrable + B4.1-inverse** ✅ — applied as one edit pass (Rec 2 honored; B3.1 shares the same anchor region so all three landed atomically). Exclusions block final shape per Rec 5: 6 bullets (`:167–173`) → inverse-rule bold paragraph (`:175`) → existing closing line (`:177`).
7. **orchestrate.md:113** ✅ — one combined bullet rewrite (Rec 3): fill-list extended character-exact per the PM supplement + B1.1 gate sentence appended ("brief" wording kept per Rec 4). No stub-list rewrite needed (audit Finding E confirmed).
8. **No inline `Installed…` flags** in either file (both operational surfaces — Finding G).

**Verification:** repo-wide grep for `[PROCESS-1]` in `.claude/commands/` returns **zero hits** — Phase 8 dangling-citation check (check 5) will pass. `Blind-executability gate` appears exactly once in orchestrate.md. `git diff --stat`: plan-review.md +11/−1 lines, orchestrate.md 1 line rewritten — matches expected footprint exactly.

## Completion notes

- Spec text inserted verbatim throughout; wording deltas ("brief" vs "doc", "Abort conditions" vs "failure signals" heading name) deliberately NOT normalized per Rec 4 / PM annotation.
- Line-number drift behaved exactly as the apply-order simulation predicted (+4 lines by Step 6a); all later anchors were verbatim-unique strings and resolved first try — the re-grep-before-edit discipline cost little and confirmed no drift between audit and implementation.
- Handed to PM for Phase 8: the zero-dangling-`[PROCESS-1]` grep is already green as of this worker's D-1a (confirmed above); nothing else outstanding from this slice.
