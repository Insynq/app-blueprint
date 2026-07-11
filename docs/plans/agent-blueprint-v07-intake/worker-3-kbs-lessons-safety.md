# Worker 3 — KBs, lessons & safety prose (C + D + E1/E3 + G1.2 + D-1b)

**Phase:** agent-blueprint-v07-intake
**Status:** done
**Spec:** `docs/agent-blueprint-v07-intake-spec.md` (LOCKED 2026-07-10) — Sections C, D, E1.1, E3.1, G1.2, plus the D-1(c) LESSONS `[PROCESS-3]` authoring and the `brainstorm.md:230` repoint. Spec edit blocks are authoritative text.

## Task

Land the KB/lessons/safety-prose cluster: new `SB_KB_13_Denormalized_Cache_Discipline.md` (C1.1) + `SB_KB_00` Never-bullet (C1.2) + `CLAUDE.md` DO-NOT (C1.3); `AUTHORING_COMMANDS.md` §6 two-caveat paragraph (D1.1); `LESSONS.md` entries `[PROCESS-1]` (consumed-verbatim artifact) and `[PROCESS-2]` (co-load test) per D1.2, **plus** `[PROCESS-3]` (verify-now incident — user-ratified D-1 option c); repoint the dangling citation at `brainstorm.md:230` from `[PROCESS-1]` to `[PROCESS-3]`; OBS_KB_5 BLOCKED corollary (E1.1); `smoke-tests-pending.md` git-tracked assertion (E3.1); UI-UX KB index copy-locking cross-ref (G1.2); and the CLAUDE.md Custom Commands → Auditing table row for `/stress-test` (F1.1's table half — Worker 4 writes the command file itself).

## Files involved

- `docs/Supabase Structure KBs/SB_KB_13_Denormalized_Cache_Discipline.md` — NEW, full text in spec C1.1; add the C1 cross-refs (worked examples: `SB_KB_5_Dual_Track_Admin_Session.md:202` mechanic, `BILL_KB_00_Index.md:7` Stripe-canonical principle)
- `docs/Supabase Structure KBs/SB_KB_00_Index.md:47` — C1.2 Never-bullet (also add SB_KB_13 to the index's KB listing so the file is discoverable)
- `CLAUDE.md:138` — C1.3 DO-NOT bullet; ALSO add the `/stress-test` row to Custom Commands → Auditing table (match the table's one-line purpose style)
- `docs/AUTHORING_COMMANDS.md:150-154` — D1.1 caveat paragraphs appended to §6
- `docs/LESSONS.md:43` — D1.2 `[PROCESS-1]`/`[PROCESS-2]` under `## Process & Verification Patterns`, then author `[PROCESS-3]` with pinned title: `### [PROCESS-3] Verify claims against the live artifact at plan-review time, not from memory or prose`. Read the incident context at `plan-review.md:78-84` and `brainstorm.md:225-232` to write Rule/Why/How-to-apply faithfully (the verify-now discipline both lines invoke). Follow LESSONS.md entry format (:54).
- `.claude/commands/brainstorm.md:230` — repoint `[PROCESS-1]` → `[PROCESS-3]` (tag only; keep the sentence otherwise intact)
- `docs/Obs KBs/OBS_KB_5_Defensive_Writes.md:35` — E1.1 BLOCKED corollary inserted within/after Primitive 9
- `docs/smoke-tests-pending.md:5` — E3.1 append git-tracked assertion sentence
- `docs/UI-UX KBs/UI_KB_0_Index.md` — G1.2 one-line pointer to the copy-locking convention (which lands in `plan-review.md` §3a via Worker 2; cite it as "spec convention gated by `/plan-review` §3a" — do not restate it)

## Constraints / non-goals

- Do NOT touch `plan-review.md` (Worker 2 owns it — including its `:82` repoint; you own only `brainstorm.md:230`).
- Do NOT create or edit `stress-test.md`, `audit-rls.md`, `audit-code.md`, `ship.md` (Worker 4).
- KB/doc prose (SB_KB_13, LESSONS entries, OBS_KB_5) carries the `Installed 2026-07-10, not yet proven in a live run` flag inline per spec; command text and CLAUDE.md bullets do NOT.
- Re-locate every anchor by verbatim text; on mismatch, STOP and log a blocker.
- CLAUDE.md is otherwise unpopulated scaffold — edit ONLY the DO-NOT block and the Auditing table; leave every `[TODO]` untouched.

## Granular audit

**Audited 2026-07-10 (Phase 5). All anchors re-located verbatim at HEAD. 13 findings, 1 cross-worker scope gap requiring PM action. No blocker on my own scope.**

### Anchor verification (all verbatim-clean)

| Edit | Anchor | Status |
|---|---|---|
| C1.1 | `SB_KB_13_Denormalized_Cache_Discipline.md` | Confirmed ABSENT — safe to create |
| C1.2 | `SB_KB_00_Index.md:47-48` — `**Never:**` + Edge-Runtime bullet | Verbatim match |
| C1.3 | `CLAUDE.md:137-138` — `## DO NOT` + `[Empty — add hard constraints…]` | Verbatim match (spec cites :138; heading is :137, placeholder :138 — the two-line anchor block matches exactly) |
| F1.1 table half | `CLAUDE.md:110-115` — `### Auditing` table | Confirmed; row style is single-line pipe rows, e.g. `| \`/audit-code\` | Review code/plans for elegance, reuse, anti-patterns, security |` |
| D1.1 | `AUTHORING_COMMANDS.md:150-154` — §6 Brevity, all 4 lines | Verbatim match |
| D1.2 | `LESSONS.md:43` — `## Process & Verification Patterns` | Verbatim match; entry template confirmed at :53-61 (`### [CATEGORY-N]` / `**Rule:**` / `**Why:**` / `**How to apply:**`); `PROCESS` is a sanctioned category (:63) |
| D-1(c) repoint | `brainstorm.md:230` — Important-Instruction 13, ends `See \`docs/LESSONS.md\` \`[PROCESS-1]\`.` | Verbatim match; tag-only swap feasible |
| E1.1 | `OBS_KB_5_Defensive_Writes.md:35` — `## Primitive 9 — Fail loud or fail closed; never fail silent-open` | Verbatim match; section spans :35-55 (`---` at :57) |
| E3.1 | `smoke-tests-pending.md:5` — single-source-of-truth sentence | Verbatim match |
| G1.2 | `UI_KB_0_Index.md` (no line anchor in spec) | File read in full (58 lines); structure = File Listing table (:9-22), "How to Use This KB" (:26-36), Stack Assumptions (:40-47), Onboarding App Patterns (:51-57) |
| C1 cross-refs | `SB_KB_5_Dual_Track_Admin_Session.md:202` denormalized-flag-via-trigger paragraph; `BILL_KB_00_Index.md:7` "Stripe is the **canonical source of truth**… local DB is a cache" | Both confirmed at cited lines |

### Findings

1. **[CROSS-WORKER SCOPE GAP — PM action required] A THIRD dangling `[PROCESS-1]` citation exists at `plan.md:53`.** Spec D-1 counts two (`plan-review.md:82`, `brainstorm.md:230`), but `.claude/commands/plan.md:53` ("Earned vs. assumed scope-out" bullet) also ends `See \`docs/LESSONS.md\` \`[PROCESS-1]\`.` — same verify-now discipline. This is worse than pre-existing rot: once D1.2 lands, `[PROCESS-1]` will RESOLVE — to the WRONG lesson (consumed-verbatim artifact, not verify-now). `plan.md` is Worker 1's file (Section A). PM must assign the `:53` repoint to Worker 1 or grant me a one-line exception.
2. **LESSONS.md needs two companion edits beyond the :43 insert**, or the file self-contradicts: (a) remove/amend the `> **Status: empty.** No lessons recorded yet…` banner at :11; (b) replace the `[No entries yet.]` placeholder at :45 under the Process heading with the entries.
3. **[PROCESS-3] tag-collision check: clean locally, noisy historically.** No `[PROCESS-N]` entries exist anywhere in `docs/LESSONS.md` or commands. However, the two predecessor intake specs (`verification-discipline-adoption-spec.md:52,213`; `agent-blueprint-v06-intake-spec.md:604-668`) mention a *source-repo* `[PROCESS-3]` (the rejected Workflow-schema lesson) — different lesson, same tag string. Non-blocking (those docs qualify it as the source's), but the new entry's Why should say "app-blueprint numbering" to disambiguate for future greps.
4. **G1.2 overlap check (the hand-judged G-22 caveat): PASS.** Grep across `docs/UI-UX KBs/` for `reading level|never-say|forbidden vocab|verbatim copy|microcopy|voice and tone|user-facing copy` → zero hits. No existing UI-UX copy-locking guidance the pointer would duplicate.
5. **SB_KB_00 index listing:** File-index table (:19-31) ends at the SB_KB_12 row (:31). SB_KB_13 needs a row there with the third column populated — `✅ Portable (Postgres)` fits (the discipline is pure Postgres; triggers/generated columns). No entry needed in the Dependencies graph (:59-70) — SB_KB_13 stands alone; its worked-example links live in the KB body per C1.1.
6. **SB_KB_13-vs-canon consistency check: no contradiction.** SB_KB_00's Always rule "Emit notifications from `AFTER` triggers (post-commit), never `BEFORE`" (:44) concerns notifications; C1.1's condition-2 `BEFORE INSERT` trigger populates a column on the same row — orthogonal, canon-consistent. Condition-3's `AFTER UPDATE` fan-out matches canon. C1.1's closing line ("AFTER-trigger post-commit… follow SB_KB_00 canon") is accurate.
7. **OBS_KB_5 insert point:** Primitive 9 runs intro (:37-41) → "the tell" (:43) → `### Web reframes` table (:45-53) → OBS-index restate paragraph (:55) → `---` (:57). Inserting the BLOCKED corollary **after :55, before the :57 `---`** keeps the tell→reframes flow intact and reads as the primitive's closing corollary. (Spec allows "within/after"; this is the lowest-disruption spot.)
8. **E3.1 forward-reference:** the appended sentence's "unchecked `[RUN]` boxes" references the `[RUN]` closure-tag convention Worker 1 introduces (A3.1). Coherent only once both land — same phase, so non-blocking; flag for reconciliation ordering only.
9. **CLAUDE.md scope confirmed safe:** both my touch-points (:110-115 table, :137-138 DO-NOT) are outside every `[TODO]` scaffold block. The DO-NOT change replaces the placeholder line with the bullet + a re-worded placeholder, per spec C1.3 verbatim.
10. **Flag-placement conformance:** spec texts for C1.1, D1.2 (PROCESS-1/2), and E1.1 already embed `Installed 2026-07-10, not yet proven in a live run` inline — my authored PROCESS-3 must too. C1.2/C1.3 bullets and the Auditing-table row correctly carry NO inline flag (operational surfaces).
11. **D1.1 flag inconsistency (minor, PM to rule):** AUTHORING_COMMANDS.md is doc prose, and the previous port's insert at :136 carries an inline `(Installed 2026-07-07…)` flag — but the spec's D1.1 change text carries none. Spec text is authoritative; I'll apply it verbatim unless PM wants the flag added for precedent-consistency. (Defensible either way: both D1.1 paragraphs cite `[PROCESS-1]`/`[PROCESS-2]`, which carry the flag.)
12. **UI_KB_0 placement:** the pointer naturally sits at the end of "How to Use This KB" (:26-36), appended after the Examples list at :36 — that section is where "when to consult what" guidance lives. One line, citing "spec convention gated by `/plan-review` §3a" per the plan constraint, not restating the convention.
13. **Incident grounding for [PROCESS-3] (verified against live text):** `plan-review.md:70-82` carries the earned-vs-assumed rule, the softening-questions warning sign (:73), the two supporting rules (:77-78), and the dangling citation (:82); `brainstorm.md:230` carries the option-level variant. The receiving-side field incident for the discipline family is already recorded at `smoke-tests-pending.md:62`: "213/213 unit tests + a clean typecheck shipped a completely non-functional auth/email flow." Draft entry below.

### Draft — `[PROCESS-3]` entry (for D-1 option c)

```markdown
### [PROCESS-3] Verify claims against the live artifact at plan-review time, not from memory or prose

**Rule:** Any foundation claim a spec, plan, or brainstorm option leans on — "builds on existing X," "existing behavior preserved," "out of scope because X already handles it" — is verified against the live artifact (the actual code, SQL, policy, migration, or running behavior) before it is presented as solid ground. "I couldn't find evidence it's broken" is not "I confirmed it works": a claim you couldn't verify is marked **assumed** (a GAP or RISK the work depends on), never silently promoted to earned. Warning sign: a verification question that keeps softening ("does X fire?" → "does X fire somewhere?" → "is existing behavior preserved?") — that resistance IS the answer; expand the investigation until the question can actually be answered, don't shrink the question until it's tractable.

**Why:** Two incidents (app-blueprint numbering; unrelated to any source-repo [PROCESS-3]). (1) The canonical receiving-side one, recorded in `docs/smoke-tests-pending.md` (Service-boundary tag): 213/213 unit tests plus a clean typecheck shipped a completely non-functional auth/email flow — every green signal was prose-level evidence; nobody had exercised the live artifact. (2) This entry itself backfills a citation that dangled from the day it shipped: `/plan-review` §3a, `/brainstorm` #13, and `/plan`'s earned-vs-assumed bullet all cited a `docs/LESSONS.md` `[PROCESS-1]` that did not exist — a claim about a document nobody opened, caught only by the 2026-07-10 v0.7-intake anchor audit. The dangling citation is itself an instance of the failure mode the rule describes.

**How to apply:** Trigger is writing or reviewing any earned-vs-assumed scope-out — `/plan-review` Step 3a, `/brainstorm` Important-Instruction 13, or `/plan`'s earned-vs-assumed bullet (all three point here). Open the artifact and confirm (mark the claim earned), or mark it assumed and list it as a dependency that must be verified before or during implementation. Entry installed 2026-07-10 as a backfill of an already-operational discipline; the discipline is field-proven receiving-side (see Why), the entry text itself not yet cited in a live run.
```

(The "all three point here" line assumes Finding 1's `plan.md:53` repoint is assigned and lands; if PM declines it, soften to "plan-review §3a and brainstorm #13 point here.")

## Recommendations

1. **PM: resolve Finding 1 before Phase 7.** Assign the `plan.md:53` `[PROCESS-1]` → `[PROCESS-3]` repoint to Worker 1 (owns plan.md) or authorize me for that one line. Leaving it makes the citation resolve to the wrong lesson once D1.2 lands — strictly worse than today's dangling state.
2. **Approve the two LESSONS.md companion edits** (remove :11 empty-status banner; replace :45 `[No entries yet.]`) as in-scope mechanical necessities of D1.2.
3. **Insert points:** OBS_KB_5 corollary after :55 / before :57 (Finding 7); UI_KB_0 pointer appended to "How to Use This KB" after :36 (Finding 12); SB_KB_13 index row after SB_KB_00_Index.md:31 with `✅ Portable (Postgres)` (Finding 5).
4. **Proposed CLAUDE.md Auditing row** (one-line style match; PM reconcile wording with Worker 4's actual stress-test.md description at Phase 6): `| \`/stress-test\` | Adversarial judge panel — N parallel lens-locked judges stress a large, canonical, or multi-agent change set; verdicts un-applied, PM decides |`
5. **Proposed UI_KB_0 pointer line:** `**User-facing copy in specs:** exact strings on user-facing surfaces (errors, onboarding, billing/consent, empty states) are locked spec content, not build-time decoration — see the copy-locking spec convention gated by \`/plan-review\` §3a (reading level, never-say list, verbatim copy with rationale).`
6. **PM rule on Finding 11** (D1.1 inline flag: spec-verbatim [no flag] vs. :136 precedent [flag]). Default if unaddressed: apply spec text verbatim.
7. **Adopt the [PROCESS-3] draft above** (incident-grounded per plan instruction; conforms to the :54 template; carries the inline flag; disambiguates from source-repo PROCESS-3 per Finding 3).
8. **Reconciliation note:** E3.1's `[RUN]` reference and D1.1's `[PROCESS-1]`/`[PROCESS-2]` citations depend on same-phase edits (Worker 1's A3.1; my own D1.2) — verify both landed at Phase 8 reconciliation.

## PM annotations

**PM annotation (2026-07-10, Phase 6 reconciliation):** All recommendations ruled. Implement per the following — these are final decisions.

- **Finding 1 RESOLVED:** the `plan.md:53` repoint is assigned to Worker 1 (their file; annotated in their doc). Do NOT touch plan.md.
- **Rec 2 APPROVED:** both LESSONS.md companion edits (remove the `:11` empty-status banner, replace the `:45` `[No entries yet.]` placeholder) — mechanical necessities of D1.2.
- **Rec 3 APPROVED:** insert points as recommended — OBS_KB_5 corollary after `:55` before the `:57` `---`; UI_KB_0 pointer appended to "How to Use This KB" after `:36`; SB_KB_13 index row after `SB_KB_00_Index.md:31` with `✅ Portable (Postgres)`.
- **Rec 4 APPROVED:** use your proposed `/stress-test` Auditing-table row wording; PM will reconcile it against Worker 4's actual command description at Phase 8 if they diverge.
- **Rec 5 APPROVED:** use your proposed UI_KB_0 pointer line verbatim.
- **Rec 6 RULED:** apply D1.1 spec text verbatim — NO inline flag. Rationale: both caveat paragraphs cite `[PROCESS-1]`/`[PROCESS-2]`, which carry the flag; double-flagging adds noise. Accepted deviation from the `:136` precedent.
- **Rec 7 APPROVED:** adopt your `[PROCESS-3]` draft as written (incident-grounded, template-conformant, inline flag, "app-blueprint numbering" disambiguation per Finding 3).
- **Rec 8 NOTED:** E3.1's `[RUN]` reference and D1.1's citations depend on same-wave edits — PM verifies both resolved at Phase 8.

## Implementation log

All anchors re-located verbatim before editing — every one matched HEAD; zero blockers.

- [x] C1.1 — created `docs/Supabase Structure KBs/SB_KB_13_Denormalized_Cache_Discipline.md`: spec text verbatim + "Worked examples already in this repo" paragraph cross-linking `SB_KB_5:202` (mechanic) and `BILL_KB_00_Index.md:7` (Stripe-canonical principle), inserted before the installed-flag line.
- [x] C1.2 — `SB_KB_00_Index.md`: Never-bullet appended (spec verbatim) + file-index row after the SB_KB_12 row with `✅ Portable (Postgres)` per Rec 3.
- [x] C1.3 — `CLAUDE.md` DO-NOT block replaced per spec verbatim (bullet + re-worded placeholder). `[TODO]` scaffold untouched.
- [x] F1.1 table half — `CLAUDE.md` Auditing table: `/stress-test` row added with Rec-4 wording verbatim.
- [x] D1.1 — `AUTHORING_COMMANDS.md` §6: both caveat paragraphs appended, spec text verbatim, NO inline flag per Rec 6 ruling.
- [x] D1.2 — `LESSONS.md`: `[PROCESS-1]`/`[PROCESS-2]` (spec verbatim) + `[PROCESS-3]` (approved draft verbatim, "all three point here" wording kept since Finding 1's plan.md repoint was assigned to Worker 1) under `## Process & Verification Patterns`. Companion edits per Rec 2: `:11` empty-status banner removed; `[No entries yet.]` under the Process heading replaced by the entries.
- [x] D-1(c) repoint — `brainstorm.md:230`: tag-only swap `[PROCESS-1]` → `[PROCESS-3]`, sentence otherwise intact.
- [x] E1.1 — `OBS_KB_5_Defensive_Writes.md`: BLOCKED corollary (spec verbatim, inline flag) inserted after the `:55` OBS-index restate paragraph, before the `:57` `---`, per Rec 3.
- [x] E3.1 — `smoke-tests-pending.md:5`: git-tracked assertion appended to the single-source-of-truth paragraph, spec verbatim.
- [x] G1.2 — `UI_KB_0_Index.md`: Rec-5 pointer line verbatim, appended to "How to Use This KB" after the Examples list, per Rec 3/Finding 12.

Not touched (per constraints): `plan.md` (Worker 1), `plan-review.md` (Worker 2), `stress-test.md`/`audit-*`/`ship.md` (Worker 4).

## Completion notes

- **Post-edit grep confirms zero dangling `[PROCESS-1]` citations remain in `.claude/commands/`** — my `brainstorm.md:230` repoint landed, and `plan.md`/`plan-review.md` show as modified in git status (Workers 1/2 evidently landed their repoints), so the Rec-8 reconciliation concern is already half-closed; Phase 8 should still verify Worker 1's A3.1 `[RUN]` tags exist for E3.1's forward reference.
- Flag-placement conformance held exactly as Finding 10 specified: inline `Installed 2026-07-10…` flags in SB_KB_13, all three LESSONS entries, and the OBS_KB_5 corollary; no flags on the SB_KB_00/CLAUDE.md bullets, the Auditing row, or D1.1 (Rec 6).
- Lesson worth keeping: the anchor-audit → PM-annotation → verbatim-relocate pipeline made this a pure mechanical pass — every ambiguity (insert points, wording, flags, the third dangler) had been ruled before Phase 7, so no mid-implementation judgment calls were needed.
