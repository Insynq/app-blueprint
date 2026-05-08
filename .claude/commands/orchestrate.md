---
description: Run the PM phase loop — pivot review → brainstorm → plan + audit → worker dispatch → reconciliation → implementation → verification → smoke → ship
arguments:
  - name: phase
    description: Phase slug (e.g., "auth-rework"). Optional — if omitted, infer from current state or ask the user.
    required: false
---

# PM Phase Loop

You are the **PM context** for this project. Walk through the phase loop below, pausing at user checkpoints. Read [docs/MULTI_AGENT_WORKFLOW.md](../../docs/MULTI_AGENT_WORKFLOW.md) for the full methodology — protocol, communication modes, concurrency rules, worker plan doc structure.

**Output discipline:**
- Speak **layman, decision-oriented** to the user. Translate worker detail to plain English.
- Speak **technical, dense, precise** when drafting worker prompts (fenced code blocks ready to paste).
- Append a **status board** to every reply that follows a worker dispatch or result.

## Step 0: Determine state

Read in parallel:

- `CLAUDE.md` — tech stack, current phase, conventions
- `docs/KB_8_Current_State.md` — active phase tracking
- `docs/SCOPE.md` — V1 scope, out-of-scope
- If `$ARGUMENTS` is set: `docs/plans/$ARGUMENTS/phase-plan.md` (if it exists) and any `docs/plans/$ARGUMENTS/worker-*.md` files
- If `$ARGUMENTS` is empty: scan `docs/plans/` for the most recent in-progress `phase-plan.md` (status not "shipped")

Decide where you are:

| Phase plan state | Worker docs state | You're at |
|---|---|---|
| Doesn't exist | — | Phase 1 (pivot review) |
| Exists, no worker docs yet | — | Phase 4 (initial worker prompts) |
| Worker docs drafted, no audit filled | — | Phase 5 (waiting on workers' granular audit) |
| Worker docs have audits, no PM annotations | — | Phase 6 (PM reconciliation) |
| Worker docs have PM annotations, no implementation log | — | Phase 7 (waiting on workers' implementation) |
| Worker docs have implementation logs | — | Phase 8 (PM verification + integration) |
| Phase 8 done, smokes not added | — | Phase 9 (smoke handoff) |
| Smokes added, not passed | — | Waiting on user smoke results |
| Smokes passed | — | Phase 10 (ship) |

State your read clearly to the user: *"I see we're entering Phase N: [phase name]. Here's what's done and what's next."*

## Step 1: Pivot review (Phase 1)

**Skip if phase-plan.md already exists.**

- Read the prior phase plan (most recent shipped `phase-plan.md` in `docs/plans/`) and `KB_8_Current_State.md`.
- Identify what the prior plan documented as "next phase" or "follow-up work."
- Ask the user, in plain English: *"The prior plan suggested [X] next. Any pivots before we scope?"*

If pivots: align with the documented plan. Propose a consolidated scope that captures both. Get user confirmation before proceeding.

**Output:** consolidated scope statement (1–3 sentences). User confirms or redirects.

## Step 2: Brainstorm (Phase 2)

Once scope is confirmed:

- Invoke `/brainstorm` with the consolidated scope.
- Brainstorm returns findings + open questions.
- Surface questions to the user in layman framing — *"To finalize the plan, you need to decide: [question]. Options: [a/b/c]."*
- Wait for answers before continuing.

## Step 3: Holistic plan + audit (Phase 3)

Construct the holistic plan covering:

- Sequencing — what runs before what
- Collisions — files / subsystems that multiple workers might touch
- Blast radius — what breaks if a worker fails
- Worker shape — how many workers, what each owns, parallel vs sequential

Save to `docs/plans/[phase-slug]/phase-plan.md`. Use this skeleton:

```markdown
# Phase: [phase-slug]

**Status:** drafting | auditing | dispatched | implementing | verifying | smoking | shipped
**Started:** YYYY-MM-DD

## Scope
[Consolidated scope statement from Phase 1]

## Brainstorm findings
[Key findings from Phase 2]

## Sequencing + worker shape
[Numbered worker list with what each owns + parallel/sequential]

## Collisions / blast radius
[Files or subsystems that need integration coordination]

## Audit findings
[Filled in after /audit-code runs]

## Smoke tests added
[Filled in during Phase 9 — list of stable IDs from smoke-tests-pending.md]

## Worker plan docs
[Filled in during Phase 4 — links to docs/plans/[phase-slug]/worker-N-*.md]
```

Run `/audit-code` against the holistic plan. Update phase-plan.md with audit findings.

## Step 4: Initial worker dispatch (Phase 4)

For each worker slice in the plan:

1. Create `docs/plans/[phase-slug]/worker-N-[task-slug].md` using the structure from [MULTI_AGENT_WORKFLOW.md → Worker plan docs](../../docs/MULTI_AGENT_WORKFLOW.md#worker-plan-docs). Fill in: Task, Files involved, Constraints / non-goals. Leave the audit / recommendations / PM annotations / implementation log sections as stubs.

2. Add a link to the worker doc in `phase-plan.md` under "Worker plan docs".

3. **Pick dispatch mode** (see [MULTI_AGENT_WORKFLOW.md → Dispatch modes](../../docs/MULTI_AGENT_WORKFLOW.md#dispatch-modes)). For Phase 5 audits, default to **subagent**. Escalate to separate-window only if: user wants to watch interactively, worker needs full Claude Code tooling, or work is open-ended enough that a single summary won't capture progress.

4. Propose modes to the user in plain English: *"Worker 1 (RLS audit) — subagent. Worker 2 (frontend integration) — subagent. OK or want any in separate windows?"* Wait for approval / override.

5. Dispatch each approved worker:

   **Subagent dispatch (default):** spawn via the Agent tool with `subagent_type: "general-purpose"`. Send subagent calls for parallel workers in a single message. Prompt template:

   ```
   You are Worker N for the PM phase loop.

   Task: [exact task description]
   Plan doc: docs/plans/[phase-slug]/worker-N-[task-slug].md
   Phase: Granular audit (Phase 5)

   Read the plan doc. Perform a granular audit on your slice — file:line specifics, edge cases, integration risks, anything the holistic plan might have missed. Edit the plan doc to fill in the "Granular audit" and "Recommendations" sections.

   Return a brief summary message ("audit complete, see plan doc — N findings, K recommendations, blocker on X") — full detail lives in the plan doc.
   ```

   **Separate-window dispatch (escalation):** output a fenced code block to the user:

   *"Open Worker N tab, paste this prompt:"*

   ```
   You are Worker N for the PM context.

   Task: [exact task description]
   Plan doc: docs/plans/[phase-slug]/worker-N-[task-slug].md
   Phase: Granular audit (Phase 5)

   Read the plan doc. Perform a granular audit on your slice — file:line specifics, edge cases, integration risks. Fill in the "Granular audit" and "Recommendations" sections.

   When done, format your final reply with one of two headers:
   - `Worker N | [task] - Response to PM:` (default — audit done or blocked on a PM decision)
   - `Worker N | [task] - User action required:` (blocked on something only the user can do)

   If the deliverable is a command, script, env var, or text-to-paste, output it as a fenced code block ready to paste — no narration unless I ask.
   ```

After dispatch:

- **Subagent results return automatically** to the PM as the Agent tool returns. Read the plan doc to see the full audit; the subagent's return message is just a summary.
- **Separate-window results** require the user to paste the `Response to PM:` block back.

When **all** workers have reported, proceed to Step 6.

## Step 5: Worker granular audit (Phase 5 — handled by workers)

Subagent workers run automatically; their tool calls don't accumulate in PM context. Separate-window workers wait for user paste-back.

If a worker reports a blocker:
- **Subagent blocker:** PM decides — re-dispatch with a refined prompt, escalate to separate-window, or fix directly.
- **Separate-window blocker:** translate to layman framing for the user, decide together.

Update the status board as workers wrap.

## Step 6: PM reconciliation (Phase 6)

For each worker plan doc:

- Read the Granular audit + Recommendations sections.
- Compare against the holistic audit in `phase-plan.md`.
- Identify gaps: what did the worker see that the holistic plan missed? What did the holistic plan see that the worker didn't?

Then, **edit each worker plan doc directly**: fill the "PM annotations" section with key decisions, reasoning, scope adjustments, integration constraints. Annotations live at the top of the section, prefixed `**PM annotation:**`.

**Pick dispatch mode** for each worker's implementation. Defaults shift by task type:

| Implementation type | Default mode |
|---|---|
| Scoped, plan-doc-driven, low surprise | Subagent |
| Debug-heavy, multi-iteration, user wants to steer | Separate window |
| Needs running dev server / specific MCP servers | Separate window |
| Long-running tasks where subagent might time out | Separate window |

Propose modes to the user: *"Worker 1 implementation — subagent (scoped). Worker 2 — recommend separate window (probably needs debug iteration). OK or want to swap?"*

Dispatch each approved worker:

**Subagent dispatch:** spawn via the Agent tool with `subagent_type: "general-purpose"`:

```
You are Worker N for the PM phase loop. Audit reconciled.

Plan doc: docs/plans/[phase-slug]/worker-N-[task-slug].md
Phase: Implementation (Phase 7)

Read the PM annotations section — those are the final decisions. Implement per the updated plan. As you work, edit the SAME plan doc to:
- Mark off items as done
- Log any blockers in "Implementation log"
- Capture lessons or gotchas in "Completion notes"

Return a brief summary ("implementation complete, see plan doc — files changed: X, Y, Z; blocker on N if any") — full detail lives in the plan doc.
```

**Separate-window dispatch:** output a fenced code block:

*"Audit reconciled. Open Worker N tab, paste this prompt:"*

```
You are Worker N. Audit reconciled.

Plan doc: docs/plans/[phase-slug]/worker-N-[task-slug].md
Phase: Implementation (Phase 7)

Read the PM annotations section — those are the final decisions. Implement per the updated plan. Edit the SAME plan doc as you work — mark items done, log blockers, capture lessons.

When done, format your reply with the standard headers from MULTI_AGENT_WORKFLOW.md.
```

## Step 7: Worker implementation (Phase 7 — handled by workers)

Subagent workers run automatically. Separate-window workers wait for user paste-back.

For implementation blockers, same triage as Phase 5: re-dispatch, escalate to separate-window, or fix directly in PM if small enough.

Update the status board as workers wrap.

## Step 8: PM verification + integration (Phase 8)

Once all workers have reported implementation done:

- Read the Implementation log + Completion notes from each worker doc.
- Verify the integrated result against `phase-plan.md`: gaps, edge cases, integration points.
- For gaps the PM can fill directly (it has full context), do the work in the PM context. Don't spin up another worker for small integration fixes.
- Manage commit hygiene — coalesce related commits, split unrelated ones.
- Update `phase-plan.md` with progress.

If any worker hit a blocker that needs deeper work, dispatch a follow-up worker with a fresh prompt referencing the original plan doc.

## Step 9: Smoke verification + handoff (Phase 9)

Workers couldn't run integration-level smokes (they see only their slice). PM owns this phase. The protocol now dispatches by Lane — see [docs/smoke-tests-pending.md → Lanes](../../docs/smoke-tests-pending.md#lanes) and [docs/MULTI_AGENT_WORKFLOW.md → Verification workers](../../docs/MULTI_AGENT_WORKFLOW.md#verification-workers).

### 9a: Catalog the smokes

For each integration-level smoke this phase needs:

1. Add an entry to `docs/smoke-tests-pending.md` with a stable ID. Tag the **Lane**: `sql` / `wiring` / `visual` / `integration`.
2. For `Lane: wiring`, also fill the **Hypothesized starting point** field (file or component) — required input for the trace-verifier.
3. Save the catalog before dispatching anything.

### 9b: Verify by Lane

Process each smoke according to its Lane:

| Lane | Verification path |
|---|---|
| `sql` | If the framework prescribes pgTAP (or equivalent unit-test pattern) and the smoke is covered by an existing/added unit test, the unit test IS the verification. Don't dispatch a separate runner — flip `Status: Passed` when the unit test passes. If no pgTAP coverage exists, treat as `integration` and hand to user. |
| `wiring` (meets gate) | Dispatch a **trace-verifier subagent** per smoke. Gate: ≥3 files in the data path OR crosses a state-machine / RLS / server-action boundary. Use the verifier prompt template from MULTI_AGENT_WORKFLOW.md. |
| `wiring` (below gate) | PM-inline trace. Single-file leaf check; 1-2 sentence summary is enough. |
| `visual` | Eyeball only. No PM trace, no verifier dispatch. Hand to user. |
| `integration` | Manual run-the-binary verification. Hand to user. |

For trace-verifier dispatches, spawn via Agent tool with `subagent_type: "general-purpose"` and the prompt template. Cap concurrency at 2 verifiers in flight (same as implementation worker concurrency). Save each verifier's report to `docs/plans/[phase-slug]/verifier-N-[smoke-id].md` for the audit trail.

### 9c: Judge each verifier report

For each returned trace report:

1. **Spot-check** 1-2 cited file:line pairs (do this on the first few dispatches per session to calibrate trust).
2. **Decide:**
   - `trace-pass` + clean spot-check → annotate the smoke with `Trace verified: <date> (Verifier <N>)`. **Status stays `Pending`** — trace is never a status flip. Only eyeball pass flips status.
   - `trace-incomplete` → fall back to PM-inline trace if you can carry the verifier's partial work, or hand the smoke to user as eyeball-required.
   - `trace-fail` (wiring bug) → escalate to a fresh implementation worker. The verifier found a real bug.
   - `trace-fail` (wrong lane) → re-tag the smoke `Lane: visual` and hand to user.
   - **Catalog-vs-code contradiction surfaced** → fix the catalog entry first. The smoke is unrunnable as written. Edit the smoke's Setup or Steps, then re-dispatch the verifier (or proceed to handoff if the contradiction was the only issue).

### 9d: Handoff what's left

Output to user as **copy-paste-ready instructions** in a fenced block — only the smokes that need the user's eyeballs or hands. Trace-verified-but-eyeball-pending smokes go in this list with the verifier annotation noted.

```
Run these smoke tests:

1. [Stable ID] (Lane: visual | Lane: integration | Lane: wiring + Trace verified <date>)
   What to do: [steps]
   Expected: [observable]

2. ...
```

### 9e: Loop until clear

**Pause.** User runs smokes, reports results.
- Pass → flip `Status: Passed (<date>)`.
- Fail → triage; may dispatch a follow-up implementation worker, may fix in PM.
- Calibration event (a `Trace verified` smoke later eyeball-fails) → log to `tests/smoke/.calibration-log.md` with date, smoke ID, what trace missed, root cause. After 3-4 such events, revisit the verifier prompt — it's drifting.

Loop until all smokes are either `Passed` or explicitly deferred with user authorization.

## Step 10: Ship (Phase 10)

Once smokes pass and blockers clear:

- Update `docs/KB_8_Current_State.md` with phase progress.
- Update `docs/CHANGELOG.md` (or invoke `/changelog`).
- In `phase-plan.md`, set status to "shipped" and confirm worker plan doc links are present.
- Run `/ship` with user approval.

---

## Status board format

Append to every PM reply that follows a worker dispatch or result:

```
Workers in flight:
- Worker N | [task] — [Phase X — what they're doing]

Workers wrapped:
- Worker N | [task] — [Phase X done, integrated/awaiting]

Queued sidebars:
- [Tangential observation captured mid-task]
```

If no workers are in flight (e.g., between phases), just show wrapped + sidebars.

---

## Hard rules

1. **Never pivot mid-task.** If the user surfaces a tangential observation, catalog it in the status board's sidebars section. Surface the catalog when the active task wraps.
2. **Never paste worker reports verbatim to the user.** Translate to layman, decision-oriented framing.
3. **Never spin up a worker for trivial integration fixes** the PM can do in 2 minutes with full context.
4. **Cap concurrency at ~2 workers** unless you can articulate why a third is genuinely independent.
5. **`/ship` runs from PM only.** Workers implement; the PM commits and pushes.
