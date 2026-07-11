---
description: Use when a change set is large, canonical (framework commands, KBs, CLAUDE.md surfaces), or authored by 3+ parallel agents and a single-auditor pass isn't enough scrutiny — convenes N parallel judges, each locked to one adversarial lens, returning un-applied severity-ranked verdicts for the PM to decide. Composes with /audit-code and /plan-review rather than replacing them; for a routine single-surface review use /audit-code.
arguments:
  - name: scope
    description: What to stress — a spec/plan doc path, a diff ref (e.g. main..HEAD), or a file list; may also name a lens subset. Optional — defaults to the current uncommitted change set.
    required: false
---

# Stress Test — Adversarial Judge Panel

Convene N parallel judges over a change set, each locked to one adversarial lens, and return their verdicts **un-applied**. Core stance, up front: **the panel reports; the PM decides.** No judge modifies a file; no finding is auto-fixed.

## Step 1: Scope

Resolve `$ARGUMENTS` as prose: it may name a spec/plan doc path, a diff ref (e.g. `main..HEAD`), a file list, or a lens subset (fewer lenses = fewer judges = lower cost). If `$ARGUMENTS` is empty, default to the current uncommitted change set (`git status` + `git diff`).

Then enumerate, explicitly:
- The **exact files** under stress (list them — judges get this list, not a vague "the recent changes").
- The **ground-truth sources** judges verify against: the governing spec or plan doc, `CLAUDE.md`, and the relevant KBs (`docs/KB_*`, stack-reference KB indexes). Findings are judged against these, not against a judge's taste.

## Step 2: Lenses

Default panel is one judge per lens (N = 6). If `$ARGUMENTS` named a lens subset, run only those.

| Lens | Question | App-dev targets |
|---|---|---|
| **canon-consistency** | Does the change contradict established canon? | `CLAUDE.md` rules, KB patterns, command conventions, `docs/LESSONS.md` entries |
| **evidence-fidelity** | Do its claims survive contact with primary sources? | Citations resolve, quoted text is verbatim, `file:line` anchors are live, no hedges hardened into facts |
| **regression-structure** | What did the change structurally break? | Dangling refs, stale imports/anchors, renumbered steps, orphaned cross-refs, broken fences |
| **completeness** | Is everything the governing spec promised actually present? | Every spec item delivered or explicitly deferred — no silent scope-drops |
| **downstream-redteam** | How will the careless future reader/agent misread this? | Ambiguous instructions, description/body drift, defaults that invite the wrong action |
| **enforcement-reality** | For every MUST/STOP/gate the change claims, what mechanically enforces it? | A command step, a script check, a tracked artifact — vs. prose hope. Pairs with the SOFT/HARD tag in `/audit-code` and `/audit-rls` |

If the harness offers more than one model tier, split the panel across tiers — model diversity is lens diversity.

## Step 3: Run the panel

Spawn the judges in parallel (`Explore` agents — read-only). Each judge is **LOCKED to exactly one lens**: it reports only through that lens, never a general review. Dispatch each with this prompt:

```
You are one judge on an adversarial stress-test panel. You are LOCKED to a single lens — report ONLY findings visible through it. Do not give a general review; do not comment outside your lens.

Lens: [LENS NAME] — [lens question from the table]

Change set under stress (read these files yourself):
[FILE LIST]

Ground truth to verify against (read, don't trust summaries):
[SPEC/PLAN DOC PATH, CLAUDE.md, RELEVANT KBs]

Your verdict is UN-APPLIED — you modify nothing; you report. For each finding:
- Severity: BLOCKER (ships broken / violates canon or spec) | MAJOR (real defect, workaround exists) | MINOR (polish/clarity)
- Location: file:line
- Evidence: quote the offending text verbatim, and quote the ground-truth text it conflicts with
- Check yourself: before reporting, re-read the primary source — does your quote actually say what you claim?

If your lens finds NOTHING, say so explicitly and name exactly what you inspected (files, sections, cross-refs checked) — a silent empty return reads as an incomplete run.
```

## Step 4: Synthesize — don't auto-fix

Merge findings across judges. Dedupe by **evidence, not wording** — two judges quoting the same line through different lenses is one finding with two angles, not two findings.

Correlated consensus is worthless, but splits are signal: when judges disagree about the same evidence, route the disagreement to the user with both positions **quoted, never averaged**. Unanimity earns nothing — judges sharing a seed error agree cheaply.

Present the merged findings table (severity | lens | file:line | evidence | proposed disposition). **No file is modified in this step.** The panel reports; the PM decides which findings are accepted, deferred, or rejected.

## Step 5: Optional fix pass (disjoint file ownership)

Run only on **explicit PM approval**, and only for **accepted** findings.

Partition accepted findings by file. **Every file has exactly one fixer-owner; concurrent fixers never share a file** — concurrent fixers writing the same file collide and silently clobber each other. If two fixes must touch one file, assign both to the same fixer or sequence them. (Same invariant as `/implement`'s parallel-batch rule; restated inline because this is a separate entry point.)

Dispatch fixers in parallel with: the accepted findings for their files, the evidence quotes, and the ground-truth sources. Fixers fix only accepted findings — no opportunistic cleanup.

## Step 6: Same-lens re-verify

Re-run the SAME lenses whose findings were fixed, scoped to the touched files. Each returns, per accepted finding:

**FIXED** · **PARTIALLY_FIXED** · **NOT_FIXED** · **REGRESSED** — plus a fresh scan of the touched files for **fix-induced breakage** (the fix itself can dangle a ref or break a fence).

`NOT_FIXED` / `REGRESSED` loops back to **Step 4 synthesis** — the PM re-decides; never silently re-fix.

## Notes

- Composes with `/audit-code` (ship-gating security findings still flow through its Refutation Ledger) and `/plan-review` (spec lockdown remains the dispatch gate) — replaces neither.
- Provenance: the pattern's field example is the 2026-07-10 agent-blueprint v0.7-intake review, where a lens-locked panel stress-tested the intake spec itself.
- First live run is the calibration run.
