# Worker 4 — New /stress-test command + audit acceptance tags (F1.1 + E2 + G-15b)

**Phase:** agent-blueprint-v07-intake
**Status:** done
**Spec:** `docs/agent-blueprint-v07-intake-spec.md` (LOCKED 2026-07-10) — F1.1, E2.1, E2.2, plus the audit-recovered G-15 `/ship` note. Runs in **Wave 2**.

## Task

Author the new `.claude/commands/stress-test.md` per F1.1 (D-3 resolved by user: full command now); append the SOFT/HARD enforcement-class tag to `/audit-rls`'s Refutation Ledger (E2.1) and a shorter mirror to `/audit-code`'s (E2.2); add a one-line note to `/ship`'s smoke gate that `docs/smoke-tests-pending.md` must stay git-tracked (G-15b — promised by the spec's E-decisions table, delivered by no edit block; audit Finding 2).

## Files involved

- `.claude/commands/stress-test.md` — NEW (~90 lines). Read `docs/AUTHORING_COMMANDS.md` FIRST (conventions: description = WHEN to use, argument-hint frontmatter, procedure-focused body). Structure per F1.1: Step 1 scope → Step 2 lenses (6-lens table retargeted to app-dev surfaces: canon-consistency vs CLAUDE.md/KBs, evidence-fidelity vs primary sources, regression-structure vs dangling refs/stale imports, completeness vs the spec's items, downstream-redteam vs the careless future reader — plus one more lens of your design; include the G-21 model-mix one-liner) → Step 3 run panel (judges LOCKED to one lens, un-applied verdicts, BLOCKER/MAJOR/MINOR) → Step 4 synthesize-don't-auto-fix ("the panel reports; the PM decides"; "correlated consensus is worthless, but splits are signal") → Step 5 optional fix pass with disjoint file ownership (every file exactly one fixer-owner) → Step 6 same-lens re-verify (FIXED/PARTIALLY_FIXED/NOT_FIXED/REGRESSED + fresh scan for fix-induced breakage). Notes line ties it to `/audit-code`'s Refutation Ledger and `/plan-review`'s lockdown. Provenance line cites the 2026-07-10 v0.7-intake review as the field example. No source `[PROCESS-4]` citations.
- `.claude/commands/audit-rls.md:188` — E2.1 enforcement-class paragraph appended after the Refutation Ledger line (spec text verbatim)
- `.claude/commands/audit-code.md:249` — E2.2 one-line SOFT/HARD acceptance note mirroring E2.1, application-code framing (shorter than the RLS version; wording yours, keep it to 1–2 sentences)
- `.claude/commands/ship.md` — G-15b: one line at the smoke truth-gate (Step 3.5 area) stating the pending-smokes ledger must remain git-tracked (a gitignored ledger runs green locally and never travels; cross-ref the E3.1 assertion in `smoke-tests-pending.md:5`)

## Constraints / non-goals

- Do NOT touch `CLAUDE.md` — Worker 3 owns the Custom Commands → Auditing table row for `/stress-test`.
- Do NOT touch Worker 1/2/3 files (plan.md, implement.md, MAW, plan-review.md, orchestrate.md, LESSONS.md, brainstorm.md, KBs).
- No `Installed…` flag inside command text (operational surface); the calibration caveat belongs in the command's Notes line as plain prose ("first live run is the calibration run") if at all.
- Re-locate anchors by verbatim text; on mismatch, STOP and log a blocker.
- `/stress-test` composes with the existing audit set — it must not claim to replace `/audit-code` or `/plan-review`.

## Granular audit
*(Phase 5, 2026-07-10 — audit only, no target files touched)*

### Anchor verification (all verified against working tree at HEAD + Wave 1)

| Edit | Anchor | Status |
|---|---|---|
| E2.1 | `audit-rls.md:188` — "Each refuter returns, per finding, **CONFIRMED** · **OVERSTATED** · **REFUTED** with a confidence and quoted SQL. Record a **Refutation Ledger** (Table \| Policy \| Refuter verdict \| Confidence \| Quoted SQL) that supersedes the binary checkbox." | **VERIFIED verbatim** at :188. Insertion slot: between :188 and `**Cost escape-hatch (BLOCKER).**` at :190. Spec's change text already leads with a blank line — clean append. |
| E2.2 | `audit-code.md:249` — the Refutation Ledger line ("…Record a **Refutation Ledger** (ID \| Finding \| Refuter verdict \| Confidence \| Refuting/weakening evidence) that supersedes the binary checkbox.") | **VERIFIED verbatim** at :249. Insertion slot: between :249 and `**Cost escape-hatch (BLOCKER).**` at :251. |
| G-15b cross-ref | E3.1 assertion in `smoke-tests-pending.md:5` ("**This file must stay git-tracked.** …") | **VERIFIED — already landed** (Wave 1 / spec-owner). Live cross-ref target for the ship.md line. |
| F1.2 (Worker 1, consistency source) | `implement.md:86` — "**No two parallel steps in a batch share a file** — every file in a parallel batch has exactly one owner. Concurrent implementers writing the same file collide and silently clobber each other; if two steps must touch one file, sequence them…" | **VERIFIED landed** exactly as spec F1.2. Step 5 of stress-test reuses this vocabulary ("exactly one owner", "collide and silently clobber"), adapted to fixer-owners. Both copies stay inline per `docs/LESSONS.md` [PROCESS-2] — separate entry points, cross-context. |
| CLAUDE.md row (Worker 3) | `CLAUDE.md:116` — `\| /stress-test \| Adversarial judge panel — N parallel lens-locked judges stress a large, canonical, or multi-agent change set; verdicts un-applied, PM decides \|` | **VERIFIED landed.** Frontmatter description below reuses its vocabulary (lens-locked, un-applied, large/canonical/multi-agent, PM decides). CLAUDE.md is NOT touched by this worker. |

### Findings (7)

1. **[MAJOR — convention conflict] Spec F1.1 says "argument-hint frontmatter"; the repo convention is `arguments:` blocks.** `docs/AUTHORING_COMMANDS.md` §2 specifies `description` + `arguments: [{name, description, required}]`; zero occurrences of `argument-hint` exist in `.claude/commands/`. "argument-hint" is the *source repo's* (agent-blueprint) frontmatter dialect. Resolve in favor of AUTHORING_COMMANDS — use an `arguments:` block. (Domain-fit translation, same class as dropping `[PROCESS-4]` citations.)
2. **[MINOR — placement] G-15b insertion point chosen:** ship.md Step 3.5, immediately after the intro line `If \`docs/smoke-tests-pending.md\` exists:` and before numbered item 1 — as an unnumbered precondition line (avoids renumbering items 1–8 and reads as a gate on the whole sweep, which it is). Drafted wording in Recommendations.
3. **[MINOR — flag placement] The G-15b line is inside ship.md's fenced subagent prompt** (a consumed-verbatim artifact, [PROCESS-1]): the line is *executed text*, so per the spec's Flag-placement convention it carries **no** inline `Installed…` flag — the flag lives in this plan doc's implementation log + the spec's decisions row. Care needed not to break the outer code fence when editing.
4. **[MINOR — rot avoidance] Cross-ref the ledger assertion by description, not line number.** The plan says "cross-ref the E3.1 assertion in `smoke-tests-pending.md:5`" — in the shipped line, reference "the header assertion in `docs/smoke-tests-pending.md`" as plain text (no `:5`, which rots; no `@`-link per AUTHORING §5).
5. **[MINOR — design decision for PM] Sixth lens choice.** Spec fixes five retargeted lenses (canon-consistency, evidence-fidelity, regression-structure, completeness, downstream-redteam) and leaves the sixth to the worker. Proposed: **enforcement-reality** — "for every MUST/STOP/gate the change claims, what mechanically enforces it (a command step, a script check, a tracked artifact) vs. prose hope?" Rationale: it is the panel-level twin of the E2.1/E2.2 SOFT/HARD tag this same worker installs, and it doesn't overlap `/audit-code`'s elegance/security lenses. Alternative considered: interface-contract (cross-file seams) — rejected as substantially overlapping regression-structure. PM to ratify.
6. **[MINOR — cost bound] The panel is the most expensive command in the audit family** (N parallel judges + optional fixers + same-lens re-verify). Skeleton includes: default N = 6 (one judge per lens), prose scoping via `$ARGUMENTS` to fewer lenses, and Step 4's synthesize-only default so no fix spend happens without explicit PM approval. No BLOCKER here — the description's negative routing ("for a routine single-surface review use /audit-code") is the primary cost control.
7. **[VERIFIED — no conflicts] Command conventions sweep clean:** name `stress-test` is verb-first-ish and doesn't collide with the `audit-*` family (deliberate — it composes with, not extends, that family; CLAUDE.md already tables it under Auditing, which is fine as a table grouping). Body will pass the §2 greps (`$ARGUMENTS\.`, `{{`), fence the judge dispatch prompt per §5, carry the empty-result contract (§5) in the judge prompt, and stay ~100 lines (§6). No `[PROCESS-4]` citations; splits-are-signal stated as plain prose.

### Drafted skeleton — `.claude/commands/stress-test.md` (for PM shape review)

```yaml
---
description: Use when a change set is large, canonical (framework commands, KBs, CLAUDE.md surfaces), or authored by 3+ parallel agents and a single-auditor pass isn't enough scrutiny — convenes N parallel judges, each locked to one adversarial lens, returning un-applied severity-ranked verdicts for the PM to decide. Composes with /audit-code and /plan-review rather than replacing them; for a routine single-surface review use /audit-code.
arguments:
  - name: scope
    description: What to stress — a spec/plan doc path, a diff ref (e.g. main..HEAD), or a file list; may also name a lens subset. Optional — defaults to the current uncommitted change set.
    required: false
---
```

Body outline (~100 lines):
- **H1 + role sentence** — adversarial judge panel over a change set; core stance up front: *"the panel reports; the PM decides."*
- **Step 1 — Scope.** Resolve `$ARGUMENTS` as prose (no template syntax): doc path / diff ref / file list / lens subset; default = uncommitted changes. Enumerate the exact files, and the ground-truth sources judges verify against (the governing spec, CLAUDE.md, relevant KBs).
- **Step 2 — Lenses.** 6-row table: lens | question | app-dev target examples: (1) canon-consistency vs CLAUDE.md/KB canon/established patterns; (2) evidence-fidelity vs primary sources — citations resolve, quotes verbatim, no hardened hedges; (3) regression-structure — dangling refs, stale imports/anchors, renumbered steps, orphaned cross-refs; (4) completeness vs the governing spec's items — no silent scope-drops; (5) downstream-redteam — how will the careless future reader/agent misread this?; (6) enforcement-reality [PM to ratify, Finding 5]. Plus the G-21 one-liner: *"If the harness offers more than one model tier, split the panel across tiers — model diversity is lens diversity."*
- **Step 3 — Run the panel.** Spawn N parallel judges (Explore), each **LOCKED to exactly one lens** — a judge reports only through its lens, never a general review. Fenced dispatch prompt (§5, copy-paste-exact) containing: scope + ground-truth pointers, the single lens, verdict format (**un-applied**; findings severity-ranked **BLOCKER/MAJOR/MINOR** with file:line + quoted evidence; each judge checks itself against spec and ground truth), and the empty-result contract (a clean lens states so and names exactly what it inspected).
- **Step 4 — Synthesize, don't auto-fix.** Merge findings across judges; dedupe by evidence, not wording. *Correlated consensus is worthless, but splits are signal* — route disagreements to the user quoted, never averaged. Present the findings table; the panel reports; the PM decides. No file is modified in this step.
- **Step 5 — Optional fix pass (disjoint file ownership).** Only on explicit PM approval, and only for accepted findings. **Every file has exactly one fixer-owner; concurrent fixers never share a file** — concurrent fixers writing the same file collide and silently clobber each other; if two fixes must touch one file, sequence them. (Same invariant as `/implement`'s batch rule; stated inline here because this is a separate entry point.)
- **Step 6 — Same-lens re-verify.** The SAME lenses re-examine the touched files: per accepted finding, **FIXED / PARTIALLY_FIXED / NOT_FIXED / REGRESSED**, plus a fresh scan for fix-induced breakage in the touched files. NOT_FIXED/REGRESSED loops back to Step 4 synthesis, not to silent re-fixing.
- **Notes.** Composes with `/audit-code` (ship-gating security findings still flow through its Refutation Ledger) and `/plan-review` (lockdown remains the spec gate) — replaces neither. First live run is the calibration run. Provenance: the pattern's field example is the 2026-07-10 agent-blueprint v0.7-intake review, where a lens-locked panel stress-tested the intake spec itself.

## Recommendations

1. **R1 — Frontmatter:** use the `arguments:` block per AUTHORING_COMMANDS §2 (Finding 1); treat spec F1.1's "argument-hint" as source-repo dialect to translate, and note the translation in the implementation log.
2. **R2 — G-15b exact wording** (one line, inserted after ship.md's "If `docs/smoke-tests-pending.md` exists:" intro, before item 1):
   > The ledger must remain **git-tracked** — an untracked or gitignored ledger runs green in one working tree and never travels with the repo, silently voiding this whole gate for every other clone (see the header assertion in `docs/smoke-tests-pending.md`); if `git ls-files` doesn't list it, STOP and track it before shipping.
3. **R3 — Sixth lens:** ratify **enforcement-reality** (or name an alternative) before implementation (Finding 5).
4. **R4 — E2.2 drafted wording** (1–2 sentences, appended after `audit-code.md:249`, application-code framing):
   > **Enforcement-class tag (SOFT vs HARD).** For each security-relevant rule the change relies on, note in the ledger whether it is **HARD** (host/DB-enforced and unbypassable — an RLS policy, a constraint, a signature check) or **SOFT** (enforced only by application behavior — a client-side filter, a "callers always validate" assumption). SOFT binds just as much and warrants more scrutiny; flag any guarantee resting on a SOFT check where a HARD one is available (see `/audit-rls` for the full rubric).
5. **R5 — E2.1:** apply the spec's paragraph **verbatim** at audit-rls.md after :188 (spec mandates verbatim; anchor confirmed).
6. **R6 — Size discipline:** hold stress-test.md near ~100 lines; the only fenced block is the judge dispatch prompt (consumed-verbatim, [PROCESS-1] — don't compress it).
7. **No blockers.** All four anchors verified; both Wave 1 dependencies (implement.md invariant, CLAUDE.md row) landed as expected; E3.1 cross-ref target live.

## PM annotations

**PM annotation (2026-07-10, Phase 6 reconciliation):** All 6 recommendations APPROVED. Specifically:

- **R1 RATIFIED:** `arguments:` block per AUTHORING_COMMANDS §2; log the dialect translation. Correct call — receiving-repo conventions win, same class as the spec's own citation-repointing rule.
- **R2 APPROVED:** G-15b wording and placement as drafted (unnumbered precondition line; description-based cross-ref, no line number; no inline flag inside the fenced prompt — mind the fence).
- **R3 RATIFIED: enforcement-reality is the sixth lens.** It pairs with the SOFT/HARD tag you're installing in the same pass and fills a real gap (prose-hope vs mechanical enforcement) no other lens covers.
- **R4 APPROVED:** E2.2 drafted wording as written, including the `/audit-rls` full-rubric pointer.
- **R5 APPROVED:** E2.1 spec-verbatim after `:188`.
- **R6 APPROVED:** ~100 lines; the judge dispatch prompt is the only fenced block and stays whole ([PROCESS-1]). Include the G-21 model-mix one-liner and the splits-are-signal plain-prose framing in Step 4; provenance line cites the 2026-07-10 v0.7-intake review; a plain "first live run is the calibration run" note may close the file.
- Skeleton shape reviewed and approved as drafted in your Granular audit. Proceed.

## Implementation log
*(Phase 7, 2026-07-11)*

- [x] **F1.1** — `.claude/commands/stress-test.md` created (88 lines). Approved skeleton followed: 6-lens table with **enforcement-reality** as the ratified sixth lens (R3), G-21 model-mix one-liner after the lens table, splits-are-signal as plain prose in Step 4, judge dispatch prompt as the **only** fenced block (kept whole per [PROCESS-1], carries the empty-result contract), Step 5 fixer-owner invariant restated inline ([PROCESS-2] — separate entry point from `/implement`), provenance line citing the 2026-07-10 v0.7-intake review, closing "first live run is the calibration run" note. §2 greps clean (`$ARGUMENTS\.` and `{{` → zero hits).
- [x] **R1 dialect translation logged:** spec F1.1's "argument-hint frontmatter" (source-repo dialect) implemented as an `arguments:` block per AUTHORING_COMMANDS §2, per PM ratification.
- [x] **E2.1** — spec paragraph applied **verbatim** to `audit-rls.md` after the Refutation Ledger line (anchor re-verified verbatim at :188 before editing; inserted before "**Cost escape-hatch (BLOCKER).**").
- [x] **E2.2** — approved R4 wording appended to `audit-code.md` after the Refutation Ledger line (anchor re-verified verbatim at :249 before editing).
- [x] **G-15b** — R2 line inserted in `ship.md` Step 3.5 as an unnumbered precondition, immediately after "If `docs/smoke-tests-pending.md` exists:" and before item 1. Fence integrity verified: `^```" count unchanged at 44 (even) — the line is plain prose inside the outer subagent-prompt fence, no inline flag per Finding 3.
- CLAUDE.md untouched (Worker 3 owns the table row — verified already landed at :116 pre-edit).
- No blockers. All four anchors matched verbatim on re-grep at implementation time.

## Completion notes

- `stress-test.md` came in at 88 lines vs the ~100 target — under budget with nothing dropped; the lens table absorbing the app-dev target examples (rather than per-lens prose sections) is what saved the space.
- The G-15b line sits *inside* ship.md's outer fenced subagent prompt (line 21 opens it), which itself contains nested ```bash blocks — an already-fragile structure. Any future Step 3.5 edits should re-count `^``` ` fences before/after, as done here.
- Flag-placement per spec convention: G-15b carries no inline `Installed…` flag (executed text inside a consumed-verbatim artifact); this log entry + the spec's decisions row are the record.
