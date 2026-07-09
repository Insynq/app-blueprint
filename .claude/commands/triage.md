---
description: Use when a pile of stale work has accumulated — open PRs, abandoned branches, half-finished work items — and you need a per-item verdict (ready / needs-work / superseded / rewrite) with an independent second opinion before planning anything new. Sorts a backlog into action buckets with a fail-loud coverage tally, then hands graduated items to /plan. Not a planning tool — use /plan for that.
arguments:
  - name: backlog
    description: The backlog to triage — a list of PRs/branches/items, or a source to discover them from (e.g. "open PRs on origin"). Discovers via git/gh if omitted.
    required: false
---

# Backlog Triage

> **`Installed 2026-07-07, not yet proven in a live run.`** Ported from agent-blueprint's
> `/triage`. The fan-out mechanic has not yet fired in an app-blueprint live run — treat its first
> few runs as calibration. The one exception is the fail-loud coverage tally (Steps 1 + 5): that
> exact dropped-agent discipline is **already field-attested downstream** —
> `docs/verification-discipline-adoption-spec.md` §14 records two schema-forced verify agents that
> died and were logged `UNVERIFIED` rather than silently dropped.

**IMPORTANT: This command orchestrates a fan-out of subagents. The main session enumerates the backlog, dispatches one investigator per item, stress-tests each verdict with an independent judge, and reconciles a fail-loud coverage tally. It reuses the Refutation Ledger mechanic from `/audit-code` — do NOT invent a new panel format.**

## When to use

Reach for `/triage` when a pile of stale work has accumulated — open PRs, abandoned branches, half-finished work items — and you need to know, per item, *what to do with it* before you plan anything new. It answers "which of these is ready, which is superseded, which is a good idea that needs a rewrite" with evidence and an independent second opinion, and it refuses to quietly lose an item along the way. It is a **sorting** tool, not a planning tool: it produces buckets and an order of operations, then hands off to `/plan` for anything that graduates to implementation.

## Action Required

Work through the steps below **in order**. The item enumeration (Step 1) and the coverage tally (Step 5) are the two mechanical musts — everything between them is judgment. Do not skip the tally even if every item looks obviously bucketed.

---

## Step 1: Enumerate the item set — record N

Before dispatching anything, build the **explicit list of items to triage** and record its count **N**. N is the coverage denominator for the rest of the run; it is fixed here and checked against at the end.

- If the user supplied the list, use it verbatim — one item = one row.
- If the user named a source ("open PRs", "stale branches"), discover the set with `git`/`gh` (e.g. `gh pr list --state open`, `git branch -a --sort=-committerdate`, `gh issue list`) and enumerate what you find.
- Write the enumerated list back to the user (or into the output table's first column) so N is visible and auditable. An item that can't be pinned to a concrete artifact (a PR number, a branch name, an issue ID) is still an item — record it with whatever identifier exists; do not drop it for being vague.

**N is now frozen.** Every later step reconciles against it.

## Step 2: Fan out — one investigator per item

Spawn **one investigator subagent per item** (`subagent_type: Explore`). Each investigator inspects only its single item and returns a **bucket verdict with evidence**.

**Default buckets** (rename per backlog — these are a starting vocabulary, not a fixed law; a docs backlog or a research backlog may need different names):

| Bucket | Meaning |
|--------|---------|
| `ready-to-merge` | Sound as-is; merge/adopt with no further work. |
| `good-but-needs-touch-up` | Right direction, bounded fixes needed before it lands. |
| `trumped` | Superseded by other work already merged or in flight — close it. |
| `good-idea-but-rewrite` | Worth doing, but the existing implementation should be redone rather than salvaged. |

Each investigator returns: the item ID, its assigned bucket, and **evidence** — concrete `file:line` references, PR/branch refs, or commit SHAs that justify the bucket. A bucket with no evidence is not a verdict; an investigator that cannot find evidence must say so explicitly (see the empty-result / blind-spot-honesty discipline in `/audit-code`).

**Bucket assignment is judgment, not a lookup.** Do not hardcode criteria into a decision tree — read the item's actual diff/state and reason about it. The investigator's job is to argue a bucket *from evidence*, not to pattern-match a label.

## Step 3: Stress-test each verdict — independent judge pass (Refutation Ledger)

Each investigator verdict is a **self-report**. Before trusting it, run an independent stress-test that reuses the `/audit-code` Refutation Ledger mechanic (see `/audit-code` → "Refutation Pass"). For each item's verdict, spawn **one fresh judge** (`subagent_type: Explore`, a context that never saw the investigator's reasoning), given only the item ID, its assigned bucket, and the investigator's evidence, with the inverted mandate:

> "Verdict: this item is `[bucket]` because [evidence]. Your job is to **KILL** that verdict. Read the primary source yourself — the actual diff, branch, or referenced code — and find the strongest evidence the bucket is wrong: it should sit in a different bucket, the evidence is stale, or the item was already superseded. Quote the contradicting lines. If you cannot refute it after a real search, say so and state what observation *would* have changed the bucket. Default to skepticism."

Each judge returns one of **CONFIRMED** (tried and failed to move it — quote the empty/contrary search) · **OVERSTATED** (real but belongs in a milder/different bucket — cite the narrowing evidence) · **REFUTED** (wrong bucket — cite the corrected bucket and the `file:line` that proves it), with a confidence and quoted evidence.

Record a **Refutation Ledger** (Item | Investigator bucket | Judge verdict | Confidence | Refuting/confirming evidence) exactly as `/audit-code` does. The judge verdict — not the investigator's self-report — is what lands in the output table.

## Step 4: Resolve only contested verdicts — split ⇒ escalate

The orchestrator (main session) resolves **only contested verdicts** — those where the investigator and judge disagree, or where independent judges split. Leave uncontested verdicts as they stand.

- **A split is a positive escalation signal, not noise.** Surface every contested item with **both positions quoted** and route it to the operator/human for the call. Never average two buckets into a third or silently pick one.
- **Unanimity earns nothing.** Agreement between investigator and judge is NOT promoted to "verified" — correlated agents that share a seed error launder a false verdict into false confidence. This is the same "the synthesis is the least-trustworthy layer; verify the primaries" rule the `/audit-code` Refutation Pass rests on (`docs/verification-discipline-adoption-spec.md` §12 `[PROC-4]`). A unanimous verdict is *un-contested*, which is all the ledger claims for it — not *independently confirmed*.

## Step 5: Coverage guard — MANDATORY, fail loud

This is the one non-negotiable mechanic. Reconcile the tally against the frozen **N** from Step 1:

- **N items in → N verdicts out.** Count the verdicts in the ledger. If it does not equal N, the run **fails loud** — do not present a triage table that silently covers fewer items than went in.
- **Any dropped or failed investigator/judge = verdict `UNVERIFIED`** for that item, surfaced **loudly** as its own row in the output table. A subagent that died, timed out, or returned nothing does NOT get omitted — it gets an `UNVERIFIED` row so the gap is visible, never silent. (This exact failure mode is field-attested downstream: `docs/verification-discipline-adoption-spec.md` §14 records two schema-forced verify agents that died and were logged `UNVERIFIED` rather than being silently dropped from the coverage count.)
- The output's count line (Step 6) states the reconciliation explicitly so a coverage drop cannot be laundered into a clean-looking table.

## Step 6: Output — triage table, order of operations, count line

Present:

**1. Triage table** — one row per item (including every `UNVERIFIED` row):

```markdown
| Item | Bucket | Judge verdict | Evidence |
|------|--------|---------------|----------|
| PR #123 | ready-to-merge | CONFIRMED | src/foo.ts:44 — matches convention |
| branch/x | good-idea-but-rewrite | OVERSTATED → good-but-needs-touch-up | api/y.ts:12 — smaller fix than claimed |
| PR #130 | UNVERIFIED | — | investigator dropped; re-run required |
```

**2. Suggested order of operations** — a recommended sequence for acting on the buckets (e.g. land `ready-to-merge` first to shrink the surface, then close `trumped`, then schedule `good-but-needs-touch-up`, then `/plan` the `good-idea-but-rewrite` items). This is advice, not a script — the operator sequences by their own priorities.

**3. Count line** (verbatim, always present): **`N in / N verdicts / K unverified`** — the explicit reconciliation. If `verdicts ≠ N`, this line is where the failure is declared.

---

## Provenance rule — for any plan spawned from triage

Any plan that grows out of a triage bucket (typically a `good-idea-but-rewrite` or `good-but-needs-touch-up` item routed to `/plan`) **MUST link every inspiring PR/branch and describe where the existing implementation lives before proposing the replacement.** A triage-born plan that proposes new work without naming the prior artifact it supersedes and locating that artifact's code is incomplete — the whole point of triage is that these items already have a history. (`/plan` carries the same rule in its scope step.)

## Important rules

- **The tally is the one mechanical must; the buckets are judgment.** Bucket names and criteria are operator-adjustable and evidence-driven — do not freeze them into a decision tree (don't over-embed deterministic logic in a judgment workflow). The coverage reconciliation (Steps 1 and 5) is the single line that must fire exactly, every run.
- **Reuse the Refutation Ledger — do not reinvent it.** Step 3 is the `/audit-code` mechanic applied to bucket verdicts, not a new panel format.
- **Escalate splits; never promote unanimity to "verified."** Unanimity is *un-contested*, not *independently confirmed*.
- **Never silently drop an item.** A dropped subagent becomes a loud `UNVERIFIED` row, never an omission.
