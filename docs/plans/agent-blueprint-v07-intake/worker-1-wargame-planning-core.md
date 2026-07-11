# Worker 1 — Wargame planning core (Section A + F1.2 + B1.2)

**Phase:** agent-blueprint-v07-intake
**Status:** done
**Spec:** `docs/agent-blueprint-v07-intake-spec.md` (LOCKED 2026-07-10) — Sections A, F1.2, B1.2. The spec's edit blocks are the authoritative change text; this doc scopes and sequences them.

## Task

Land the falsifiable-plan cluster: `/plan` gains Expected Observations & Failure Signals (A1.1), Abort conditions (A2.1), and `[EDIT]`/`[RUN]`/`[DECIDE]` closure-owner tags (A3.1); the MAW worker-doc skeleton gains the twin Expected-observations + Abort-conditions sections (A1.2) and the blind-executability Lifecycle mirror (B1.2); `/implement` gains the consuming-side wiring — extraction bullet (A4.1), per-step observation-confirmation rule (A4.2), Step 6 report line (A4.3) — plus the G-20 disjoint-file-ownership batch invariant (F1.2).

## Files involved

- `.claude/commands/plan.md` — A1.1 (insert §Expected Observations between steps :119 and Testing Checklist), A2.1 (insert §Abort conditions between Rollback :128 and Risks), A3.1 (closure-owner bullet + two rule paragraphs after `**Specific**` :76; retag Step 1/Step 2 example headings :108/:113 as `[EDIT]`/`[RUN]` with a `**Smoke-test ID:**` line on the `[RUN]` example — see spec's author's note in A3.1)
- `.claude/commands/implement.md` — A4.1 (extraction bullet after :62 list), A4.2 (confirmation rule immediately after :174, before post-batch validation), A4.3 (report line under `### Remaining Issues` :236), F1.2 (sibling batch rule after :85)
- `docs/MULTI_AGENT_WORKFLOW.md` — A1.2 (twin blocks between Constraints :263 and Granular audit), B1.2 (blind-executability sentence appended to Lifecycle bullet :285)

## Constraints / non-goals

- Insert text verbatim from the spec's edit blocks. Do not restyle, do not compress, do not add `Installed…` flags inside command/template text (spec Flag placement rule: operational surfaces carry the flag as spec annotation only).
- Do NOT touch `plan-review.md`, `orchestrate.md` (Worker 2's files), or anything in Worker 3/4's ownership lists (see phase-plan.md).
- Line numbers cited are at HEAD `2309d81` — re-locate each anchor by its verbatim text before editing; if an anchor no longer matches verbatim, STOP and log a blocker (do not improvise placement).
- A4.3's placement latitude ("under Remaining Issues or as a Step 6 checklist item — resolved at apply time") is yours to resolve; record the choice in the implementation log.

## Granular audit

**Audited 2026-07-10 at HEAD `2309d81` (working tree matches for all three owned files). Anchor verification: 7 of 8 anchors verbatim-clean; 1 partial mismatch (A4.3). 10 findings below — 1 soft blocker, 2 cross-worker integration risks, 7 coherence/edge notes.**

### Anchor verification (all re-located by verbatim text, not line number)

| Edit | Cited anchor | Verified at | Verdict |
|---|---|---|---|
| A1.1 | `[Continue for all steps...]` + `### Testing Checklist` | `plan.md:118` + `:120` (spec cited :119 — the blank line between; cosmetic) | CLEAN |
| A2.1 | `### Rollback Plan` … `### Risks` | `plan.md:128-131` | CLEAN |
| A3.1 | `**Atomic**`/`**Ordered**`/`**Specific**` bullets | `plan.md:74/:75/:76`; `### 4. Break Down into Steps` at `:71` | CLEAN |
| A3.1 retag | `#### Step 1: [Description]` / `#### Step 2: [Description]` | `plan.md:108` / `:113` | CLEAN |
| A4.1 | `Read the plan file and extract:` | `implement.md:62` (list body `:63-66`) | CLEAN |
| A4.2 | `Wait for ALL parallel agents to complete before moving to the next batch.` | `implement.md:174` (next heading `### 4d:` at `:176`) | CLEAN |
| A4.3 | `### Remaining Issues` | `implement.md:236` reads `### Remaining Issues (if any)` | **PARTIAL — see F1** |
| B1.2 | `- Created by PM in Phase 4 with skeleton + Task / Files / Constraints filled in.` | `MULTI_AGENT_WORKFLOW.md:285` | CLEAN |
| A1.2 | `## Constraints / non-goals` block … `## Granular audit` | `MULTI_AGENT_WORKFLOW.md:263-267` | CLEAN |
| F1.2 | `- Steps within a batch have NO dependencies on each other` | `implement.md:85` | CLEAN |

### Findings

**F1 (soft blocker — PM sign-off needed). A4.3 anchor is not verbatim.** Spec quotes `### Remaining Issues`; the file has `### Remaining Issues (if any)` at `implement.md:236`. The heading is unique and unambiguous (prefix match, no other candidate), so this is spec-quotation truncation, not target drift — but per this doc's Constraints ("if an anchor no longer matches verbatim, STOP and log a blocker"), logging it rather than silently proceeding. Recommend PM bless: treat `### Remaining Issues (if any)` as the anchor. Note the spec's own plan-review record claims this anchor "confirmed" — it confirmed the section exists, not the exact string.

**F2 (integration risk — cross-worker, D-1 undercount). A THIRD dangling `[PROCESS-1]` citation exists at `plan.md:53`** — `See docs/LESSONS.md [PROCESS-1]` on the earned-vs-assumed scope-out bullet, same verify-now family as `plan-review.md:82` and `brainstorm.md:230`. Spec D-1 lists only those two. Once D1.2 (Worker 3/4 scope) lands `[PROCESS-1]` = consumed-verbatim-artifact lesson, `plan.md:53` will cite the WRONG lesson. Whoever executes D-1 option (c) must also repoint `plan.md:53` → the new `[PROCESS-3]` (or plain prose under option (b)). This line is in MY owned file but OUTSIDE my A-section edit scope — flagging for PM to route (I can carry the one-line repoint in Phase 7 if PM annotates it in).

**F3 (integration risk — cross-worker with Worker 2's B1.1). A1.2 adds two new skeleton sections nobody is assigned to fill.** The inserted `## Expected observations & failure signals` + `## Abort conditions` land between Constraints (PM fills, Phase 4) and Granular audit (worker fills, Phase 5) in the MAW skeleton (`:263-267`), but: (a) the Lifecycle bullet at `:285` (which B1.2 extends) still says PM fills only "Task / Files / Constraints"; (b) `orchestrate.md:113` (Worker 2's B1.1 target) says "Fill in: Task, Files involved, Constraints / non-goals. Leave the audit / recommendations / PM annotations / implementation log sections as stubs" — the new sections are neither in the fill list nor the stub list. B1.2's blind-executability gate only *works* if the PM fills these pre-dispatch (an unanswered "what would I observe?" is exactly an anticipated worker question). Needs a PM ruling + Worker 2 coordination — see Recommendations R2.

**F4 (flag-placement ambiguity on B1.2).** MAW doc prose carries inline `Installed …, not yet proven` flags by precedent (`:30`, `:148`, `:209`, `:215`), and the spec's own Conventions say "KB/doc prose embeds the flag inline" — yet B1.2's verbatim change text omits the flag. A1.2 correctly omits it (inside the consumed-verbatim skeleton template — a flag there would pollute every future worker doc; matches [PROCESS-1]-style artifact discipline). B1.2 is plain Lifecycle prose, so by the spec's own rule it *should* carry the flag. Recommend appending it (R3); deviating from the literal edit block, so PM ratifies.

**F5 (heading-parse check — no consumers break).** Grep for `#### Step` across `.claude/commands/` + `docs/`: only `plan.md:108/:113` (the retag targets) and `update-framework.md:701/711/735` (its own internal steps, unrelated). `implement.md`'s Step 1 extracts "the ordered list of implementation steps" generically and Step 2's scope parsing works on step *numbers* ("1-3", "5"), not heading text — prefixing `[EDIT]`/`[RUN]` into the example headings breaks no parser. `plan-review.md` and `orchestrate.md` don't consume plan.md's Output Format headings. Retag is safe.

**F6 (template-coherence edge on the `[RUN]` example).** Retagged `#### Step 2: [RUN] [Description]` retains `**File:** / **Change:** / **Why:**` placeholders — but per A3.1's own classification rule, a `[RUN]` step closes by live exercise, not by a file change, so `**File:**/**Change:**` on the [RUN] example reads slightly off. The author's note grants latitude only for adding the `**Smoke-test ID:**` line. Minimal-deviation resolution in R4. Also unpinned: exact placeholder text for the Smoke-test ID line — R4 proposes one matching the repo's stable-ID convention (`<SECTION>-<NUMBER>`, per `implement.md:243` and `smoke-tests-pending.md`).

**F7 (gating asymmetry — coherent, note only).** A3.1 closure-owner tags are "required on every step" (ungated), while A1.1/A2.1 are gated Complexity ≥ Medium. Deliberate in the source and coherent here: the `[RUN]`→smoke-ledger mirror must fire even on Simple plans (smoke truth-gate is ungated). No change needed; noting so the implementer doesn't "fix" it.

**F8 (F1.2 vs existing concurrency text — no contradiction, one residual looseness).** The new batch rule ("no two parallel steps share a *file*") is strictly stronger than and consistent with: `implement.md:85` (no dependencies), `:132-134` (parallel = "2+ independent files"), and the `Conflicting changes` recovery at `:263` which the insert cross-references ("see 'Conflicting changes' recovery below" — resolves correctly; recovery section is below Step 3). Residual: `:263` still triggers on "modify the same *line*" — after F1.2, same-*file* collisions should already have been sequenced at batch time, so `:263` becomes the fallback for planning misses. Not a contradiction; optional tightening in R5.

**F9 (A4.2 placement nuance).** Inserting after `:174` lands the confirmation rule at the tail of §4c (Parallel Implementation), but the rule governs *all* step advancement including sequential §4b work. Spec placement is explicit ("immediately after this line, before post-batch validation") — follow it; the rule's own wording ("Before advancing past a step") is batch-mode-agnostic, so no rewrite needed. Note only.

**F10 (A4.3 voice/placement — resolves the spec's apply-time latitude).** The change text is meta-voice ("the report states the observation was confirmed…") — a rule *about* the report. Both spec-offered placements sit inside the fenced Step 6 output template (`:209-245`), meaning the text ships as literal template content either way. Under `### Remaining Issues (if any)` (`:236`) it reads as a template directive and its phrase "is listed here as a remaining issue" resolves correctly; under `### Next Steps` (`:239`) it would sit as a non-checkbox bullet among `- [ ]` items and "listed here" would dangle. Resolution → R1.

### Nested-fence mechanics (all three A-inserts into plan.md)
All plan.md inserts land inside the outer Subagent Prompt fence (` ``` ` at `:29`→`:141`); A1.1/A2.1 additionally inside the inner ` ```markdown ` Output Format fence (`:80`→`:140`). Heading levels in the inserts (`###` for A1.1/A2.1 sections, `####` retags) match the template's existing levels. Edit-tool anchors chosen in this audit are unique within each file — no duplicate-match risk (verified: `### Testing Checklist`, `### Rollback Plan`, `### Remaining Issues (if any)`, the `**Specific**` bullet, and both MAW anchors each occur exactly once).

## Recommendations

**R1 — A4.3 placement (resolves the spec's latitude): insert as the FIRST bullet directly under `### Remaining Issues (if any)` at `implement.md:236`, above the `- [Issue description and suggested fix]` placeholder.** Rationale: (a) the text's "is listed here as a remaining issue" only resolves under that heading; (b) it functions as a template directive telling the report-writer what must appear in this section — the same pattern as the existing long directive bullet under Next Steps at `:243`; (c) the Next Steps alternative mixes a non-checkbox rule into a `- [ ]` checklist and dangles "here." Verbatim spec text, zero rewording. Record in the implementation log per Constraints.

**R2 — F3 (new skeleton sections unowned): PM annotation needed; propose coordinating with Worker 2 so B1.1's `orchestrate.md:113` edit is read as covering them implicitly, and (pending PM approval as a minimal supplement to B1.2) extend the `:285` Lifecycle bullet's fill list to "Task / Files / Constraints (plus Expected observations & Abort conditions at Complexity ≥ Medium)".** If PM declines any deviation from verbatim edit blocks, at minimum record in phase-plan.md that the PM fills the two new sections in Phase 4 — the blind-executability gate depends on it.

**R3 — F4: append ` Installed 2026-07-10, not yet proven in a live run.` to the B1.2 Lifecycle bullet**, per the spec's own flag-placement convention for doc prose and MAW's four existing inline flags. PM to ratify (deviation from the literal edit block). Do NOT flag A1.2 (template content) or any plan.md/implement.md insert (command bodies) — those correctly carry the flag as spec annotation only.

**R4 — F6: on the retagged `[RUN]` example at `plan.md:113`, add the line as `**Smoke-test ID:** [<SECTION>-<N> — mirrored into docs/smoke-tests-pending.md]` immediately after the `**Why:**` line, and leave `**File:**/**Change:**/**Why:**` untouched.** Keeps the deviation at exactly what the author's note authorizes; the placeholder format matches the repo's stable-ID convention (`implement.md:243`). Changing the [RUN] example's File/Change fields is NOT recommended this pass — out of authorized latitude.

**R5 (optional, PM discretion) — F8: tighten `implement.md:263` from "modify the same line" to "modify the same file"** so the recovery bullet matches the new batch invariant's granularity. One-word change, but outside the spec's edit blocks — skip if verbatim-only discipline wins.

**R6 — F2: route the `plan.md:53` dangling `[PROCESS-1]` citation into D-1's resolution** (add it to D-1's list alongside `plan-review.md:82` + `brainstorm.md:230`). One-line repoint; I can carry it in Phase 7 if PM annotates it into my scope, since the file is already mine.

**Proceed verdict:** no hard blockers. F1 needs a one-line PM bless; F3/R2 needs a PM ruling before Phase 7 (it touches Worker 2's surface); everything else is executable as specced.

## PM annotations

**PM annotation (2026-07-10, Phase 6 reconciliation):** All recommendations ruled. Implement per the following — these are final decisions.

- **F1 BLESSED:** treat `### Remaining Issues (if any)` (`implement.md:236`) as the A4.3 anchor. Spec truncation, not drift.
- **R1 APPROVED:** A4.3 lands as the FIRST bullet directly under that heading, above the placeholder. Verbatim spec text.
- **R2/F3 RULED:** the PM fills the two new skeleton sections (Expected observations, Abort conditions) in Phase 4 at Complexity ≥ Medium. Apply the approved supplement: extend the `:285` Lifecycle bullet's fill list to `Task / Files / Constraints (plus Expected observations & Abort conditions at Complexity ≥ Medium)` before appending B1.2's blind-executability sentence. Worker 2's `orchestrate.md:113` fill-list gets the matching supplement (annotated in their doc — not yours to touch).
- **R3 APPROVED:** append the inline `Installed 2026-07-10, not yet proven in a live run.` flag to the B1.2 Lifecycle bullet (MAW doc prose). Do NOT flag A1.2 (template artifact) or any plan.md/implement.md command text.
- **R4 APPROVED:** `**Smoke-test ID:** [<SECTION>-<N> — mirrored into docs/smoke-tests-pending.md]` after the `**Why:**` line on the retagged `[RUN]` example only. Leave File/Change/Why placeholders untouched.
- **R5 APPROVED:** tighten `implement.md:263` "modify the same line" → "modify the same file" so the recovery bullet matches F1.2's granularity. PM-ratified out-of-spec one-word change.
- **R6/F2 APPROVED — added to your scope:** repoint `plan.md:53`'s `[PROCESS-1]` citation → `[PROCESS-3]` (tag-only swap). Worker 3 lands the `[PROCESS-3]` entry this same wave; the pinned title is in phase-plan.md's Cross-worker contract. Same-wave dangling window is accepted — PM commits both together at Phase 8.
- F5, F7, F8 noted as verified-safe / deliberate; no action beyond R5.

## Implementation log

**2026-07-10 — all 11 edits landed. Every anchor re-located by verbatim text before editing; all matched (working tree still at HEAD `2309d81` for my three files at edit time). No blockers.**

- `.claude/commands/plan.md`:
  - A3.1 — closure-owner bullet + two rule paragraphs appended after `**Specific**`. Verbatim spec text.
  - A3.1 retag — Step 1 → `[EDIT]`, Step 2 → `[RUN]`; per R4, added `**Smoke-test ID:** [<SECTION>-<N> — mirrored into docs/smoke-tests-pending.md]` after the `[RUN]` example's `**Why:**` line; File/Change/Why placeholders untouched.
  - A1.1 — Expected Observations & Failure Signals section inserted between `[Continue for all steps...]` and `### Testing Checklist`. Verbatim.
  - A2.1 — Abort conditions inserted between Rollback Plan and Risks. Verbatim.
  - R6 — `:53` citation repointed `[PROCESS-1]` → `[PROCESS-3]` (tag-only swap; accepted same-wave dangling window until Worker 3's LESSONS entry lands).
- `.claude/commands/implement.md`:
  - A4.1 — extraction bullet appended to the Step 1 extraction list (after the Dependencies bullet). Verbatim.
  - A4.2 — confirmation-rule paragraph inserted immediately after "Wait for ALL parallel agents…", before §4d. Verbatim.
  - A4.3 — per F1-bless + R1: landed as the FIRST bullet under `### Remaining Issues (if any)`, above the `- [Issue description…]` placeholder. Verbatim spec text. (Resolves the spec's apply-time placement latitude — recorded per Constraints.)
  - F1.2 — disjoint-file-ownership batch rule added as sibling bullet after "Steps within a batch have NO dependencies on each other". Verbatim.
  - R5 — Error Recovery "Conflicting changes" bullet tightened "same line" → "same file" (PM-ratified one-word change).
- `docs/MULTI_AGENT_WORKFLOW.md`:
  - A1.2 — twin skeleton blocks (Expected observations & failure signals + Abort conditions) inserted between Constraints and Granular audit. Verbatim; no inline flag (template artifact, per R3).
  - B1.2 — Lifecycle bullet: fill list extended per R2 to `Task / Files / Constraints (plus Expected observations & Abort conditions at Complexity ≥ Medium)`, then blind-executability sentence appended verbatim, then R3's inline flag `Installed 2026-07-10, not yet proven in a live run.` appended.

Flag audit: exactly one inline `Installed 2026-07-10` flag across my three files (the B1.2 Lifecycle bullet); zero in command bodies or template text — matches the spec's Flag-placement rule and R3.

## Completion notes

- Untouched-by-me files showing in `git diff` (CLAUDE.md, AUTHORING_COMMANDS.md, SB_KB_00_Index.md) are other workers' concurrent edits — no shared-file collisions with my set.
- Nested-fence mechanics held as audited: A1.1/A2.1/A3.1 all landed inside the Subagent Prompt fence (A1.1/A2.1 inside the inner ```markdown Output Format fence) at the template's existing heading levels; `implement.md` inserts respected the outer prompt fence.
- Cross-worker dependency for PM verification: (1) `plan.md:53` now cites `[PROCESS-3]` — dangling until Worker 3 lands the LESSONS entry this wave (PM commits both together at Phase 8, per R6 ruling). (2) B1.2's extended fill list assumes Worker 2's matching `orchestrate.md:113` supplement lands (per R2 ruling).
- Lesson: the audit-time anchor table made implementation near-mechanical — every anchor still matched verbatim, so zero improvised placements. The one pre-blessed deviation set (R1–R6) was sufficient; no new judgment calls arose.
