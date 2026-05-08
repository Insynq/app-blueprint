# Multi-Agent Workflow — PM & Worker Context Windows

The canonical pattern for shipping phases of work in this project: stay in the strategic seat as PM while AI workers execute focused tasks. `/orchestrate` is the entry point.

---

## The shape

Three roles, one human:

- **PM context window** = strategic lead. One persistent conversation that holds the big-picture goals, reviews the codebase before kicking off work, drafts the exact prompts that start new worker sessions, ingests results, and decides what's next. Catches sidebar observations and queues them for later instead of pivoting mid-task.

- **Worker context windows** = focused execution. Short-lived conversations that receive a self-contained prompt from the PM, work against a dedicated plan doc, and report results in a copy-pasteable form back to the PM.

- **You** = the relay. Copy worker output into the PM, paste PM-drafted prompts into new workers.

**The PM phase loop (`/orchestrate`)** is the canonical workflow. The methodology below — identification protocol, communication modes, concurrency rules, setup seeds — is what the loop runs on top of.

---

## Dispatch modes

PM can dispatch a worker two ways. Both modes use the same worker plan doc — the doc is the durable artifact regardless of where the work runs.

### Subagent dispatch (default)

PM spawns the worker as a subagent via the Agent tool. The subagent runs to completion in its own ephemeral context, reads/writes the plan doc as a normal file, and returns a single summary message. PM reads the plan doc to see the full report.

**Why this is the default:** subagent tool calls do **not** accumulate in PM's window — only the final summary does. So spawning a worker as a subagent is *more* context-efficient than running the work directly in PM, and dramatically more efficient than the relay overhead of separate-window dispatch (where the worker's full reply gets pasted back into PM context).

In practice this means: most of the phase loop can run as a single PM context window, with the user just answering questions and approving handoffs. No window-switching for the user.

### Separate-window dispatch (escalation)

PM drafts a copy-paste-ready prompt; user opens a new Claude Code session, pastes, runs the worker, copies the response back. This is the escalation path, used when one of these is true:

- **User wants to watch / steer interactively** — long debug session where decisions emerge as the worker investigates
- **Worker needs full Claude Code tooling** the subagent can't easily use — specific MCP servers, IDE state inspection, interaction with a running dev server
- **Work is open-ended enough** that "fire and return one summary" doesn't capture progress — multi-iteration test/fix loops where the user wants to see each step
- **Subagent would risk timing out** on the work (very long-running tasks)

### How the PM picks

For each worker, PM proposes a mode before dispatching:

> *"Worker 2 — recommend subagent dispatch (scoped audit, read-only investigation). Worker 3 — recommend separate window (long debug loop expected, you'll want to steer). Approve or override?"*

User approves or overrides. PM proceeds.

**Default heuristics:**

| Phase | Recommended mode | Why |
|---|---|---|
| Phase 5 (granular audit) | Subagent | Read-only investigation, well-scoped, fast |
| Phase 7 (implementation, scoped) | Subagent | Plan doc has the spec, subagent executes |
| Phase 7 (implementation, debug-heavy) | Separate window | User wants to steer iterative diagnosis |
| Phase 7 (implementation needs dev server / MCP) | Separate window | Subagent tooling limits hurt productivity |

---

## When to use this vs. single-window

| Pattern | Best when |
|---|---|
| Single context window | Simple, linear, one-shot work. Setup overhead exceeds the work itself. A bug fix, a one-file refactor, a doc update. |
| **PM/worker phase loop** | Anything that crosses files, touches multiple subsystems, or has a documented phase plan. The default for any non-trivial chunk of work. |

PM/worker shines specifically when:

- Work is **exploratory** — you don't know upfront what all the sub-tasks are
- You want to **course-correct between sub-tasks** without re-explaining context every time
- You're **prone to chasing sidebars** — the PM context catches them, workers stay focused
- The work is **large enough** that one context window can't hold both strategic and tactical reasoning at once

If a single window suffices, use one window. The relay overhead is real — only spend it when the strategic/tactical separation pays off.

---

## The phase loop

`/orchestrate` walks the PM through these phases. Most phases have explicit user checkpoints — the PM stops, surfaces a decision or hands off worker prompts, and waits.

### Phase 1: Phase review + pivot consolidation

- PM reads the prior phase plan (`docs/plans/[prior-phase]/phase-plan.md` if exists), `KB_8_Current_State.md`, and any pivot notes the user has surfaced.
- PM asks the user: *any pivots from the documented plan?*
- If pivots exist, PM aligns them with the documented plan and proposes a consolidated scope. Get user confirmation before moving on.

**Why this phase:** the plan written at the end of the prior phase is rarely still 100% right by the time you start the next one. Surfacing pivots up front avoids mid-execution scope thrash.

### Phase 2: Brainstorm

- Once scope is crisp, PM invokes `/brainstorm` with the consolidated scope.
- Brainstorm returns findings + open questions.
- PM surfaces the questions to the user in layman, decision-oriented framing. Wait for answers before continuing.

### Phase 3: Holistic plan + audit-code

- PM constructs the holistic plan: sequencing, collisions, blast radius, worker shape (how many workers, what each owns, what's parallelizable).
- PM saves the plan to `docs/plans/[phase-slug]/phase-plan.md`.
- PM runs `/audit-code` against the holistic plan.
- PM updates `phase-plan.md` with audit findings.

### Phase 4: Initial worker dispatch (audit round)

For each worker slice:

1. PM creates `docs/plans/[phase-slug]/worker-N-[task-slug].md` with the [worker plan doc structure](#worker-plan-docs) below — task description, files involved, constraints, and stub sections for the worker to fill in.
2. PM picks a [dispatch mode](#dispatch-modes): subagent (default) or separate window (escalation). For the audit round, almost always subagent.
3. PM either:
   - **Subagent dispatch:** spawns the worker via the Agent tool with a prompt that identifies Worker N, points to the plan doc, and asks for granular audit. PM tells the user *"dispatching Worker 2 as subagent for granular audit, will report when done."*
   - **Separate-window dispatch:** drafts a fenced code-block prompt and outputs to user: *"Open Worker N tab, paste this prompt: ..."*

If multiple workers can run in parallel (≤2 cap) and both are subagent-dispatched, PM spawns them in parallel via the Agent tool.

### Phase 5: Worker granular audit

Each worker (subagent or separate-window):

- Reads its plan doc
- Performs a granular audit on its slice (deeper than PM's holistic audit — file:line specifics, edge cases, integration risks)
- Fills the audit + recommendations sections of its plan doc

**Reporting back depends on mode:**

- **Subagent dispatch:** worker returns a single summary message to PM. PM reads the plan doc to see the full audit. No user relay needed.
- **Separate-window dispatch:** worker ends reply with `Worker N | [task] - Response to PM:` header. User pastes the reply to PM.

### Phase 6: PM reconciliation

- PM analyzes all worker audit reports against its holistic audit.
- PM brainstorms gaps — what did the workers see that the holistic view missed? What did the holistic view see that workers can't?
- For each worker plan doc, PM **edits the doc directly** with annotations: key decisions, reasoning, scope adjustments, integration constraints. The annotation lives at the top of the relevant section, prefixed `**PM annotation:**`.
- For each worker, PM picks the implementation [dispatch mode](#dispatch-modes): subagent if the spec is clear and self-contained, separate-window if iterative debugging or live steering is expected.

### Phase 7: Worker implementation

Each worker (subagent or separate-window):

- Reads its updated plan doc (with PM annotations)
- Implements the changes
- Edits the **same plan doc** to mark off completed items, log blockers hit, capture lessons learned

**Reporting back depends on mode:**

- **Subagent dispatch:** worker returns a single summary message to PM. PM reads the plan doc for full implementation log. If the subagent reports a blocker, PM may follow up by re-dispatching, escalating to separate-window, or fixing directly.
- **Separate-window dispatch:** worker ends reply with `Worker N | [task] - Response to PM:` header. User pastes back.

### Phase 8: PM verification + integration

- PM verifies the integrated result against the holistic plan: gaps, edge cases, missed integration points.
- For gaps the PM can fill directly (it has full context), the PM does the work itself rather than spinning up another worker.
- PM manages commit hygiene — coalesces or splits commits as needed.
- PM updates `phase-plan.md` with progress.

### Phase 9: Smoke tests

- PM identifies integration-level smoke tests workers couldn't run (workers see only their slice; integration smokes need the full picture).
- PM adds new smoke tests to `docs/smoke-tests-pending.md` with stable IDs.
- PM hands smoke tests to the user as copy-paste-ready instructions.
- User runs smokes, reports passes/blockers.
- PM addresses blockers (may spin up new workers, or fix directly).

### Phase 10: Ship

Once smokes pass and blockers clear:

- PM updates `KB_8_Current_State.md` with phase progress.
- PM updates `docs/CHANGELOG.md`.
- PM links worker plan docs as references in `phase-plan.md` (so the phase plan becomes a navigable record of how the work actually went).
- PM runs `/ship` with user approval.

---

## Worker plan docs

A worker plan doc is a **single living artifact** — plan, audit, PM annotations, implementation log, and completion record all live in one file. PM and worker both write to it, at different phases.

**Location:** `docs/plans/[phase-slug]/worker-N-[task-slug].md`

**Naming examples:**

```
docs/plans/auth-rework/
├── phase-plan.md
├── worker-1-rls-policies.md
├── worker-2-jwt-claims.md
└── worker-3-session-rotation.md
```

**Structure** (PM creates the skeleton, both fill it in):

```markdown
# Worker N — [Task name]

**Phase:** [phase-slug]
**Status:** drafted | audited | implementing | done

## Task
[One-paragraph description of the slice]

## Files involved
- path/to/file.ts:42 — [what's there, what changes]
- ...

## Constraints / non-goals
- [What NOT to touch]
- [Scope boundaries]

## Granular audit
[Worker fills this in during Phase 5 — file:line specifics, edge cases, integration risks]

## Recommendations
[Worker's recommendations after granular audit — what to do, what to skip, alternative approaches]

## PM annotations
[PM fills this in during Phase 6 — key decisions, reasoning, scope adjustments]

## Implementation log
[Worker fills this in during Phase 7 — what was done, blockers hit, lessons]

## Completion notes
[Worker's final notes — anything the PM should know for verification]
```

**Lifecycle:**

- Created by PM in Phase 4 with skeleton + Task / Files / Constraints filled in.
- Worker fills Granular audit + Recommendations in Phase 5.
- PM fills PM annotations in Phase 6.
- Worker fills Implementation log + Completion notes in Phase 7.
- After ship, the doc stays in `docs/plans/[phase-slug]/` as a historical record. Don't delete — it's the canonical record of how the work actually went.

---

## Verification workers

A **verification worker** is a specialized subagent dispatched by PM to produce a structured verification artifact — most commonly a static code trace of a UI smoke's data path. PM judges the artifact; PM does not produce it. Same dispatch mechanism as implementation workers (`general-purpose` subagent via the Agent tool), but the prompt encodes a contract that mandates file:line citations, structured output, explicit caveats, and an honest verdict including a partial-credit option.

The pattern is pilot-validated for trace verification. It generalizes to other verification work where PM compression would lose load-bearing detail: complex PR review, multi-policy RLS audits, dependency-impact analysis.

### When to dispatch (complexity gate)

PM does not dispatch a verifier for every smoke. Below the gate, PM-inline still wins on cost.

**Dispatch a verifier when** the verification work meets either:

- **≥3 files** in the data path (DB → fetcher → component → render condition → handler is typical for any non-trivial wiring smoke)
- **Crosses a state-machine, RLS, or server-action boundary** — the verification needs to reason across asymmetric concerns

**PM-inline trace when** the smoke is a single-file, single-conditional, leaf-component check. Dispatch tax exceeds the marginal benefit; a 1-sentence inline trace is honestly enough.

### Trace-verifier prompt template

PM dispatches via Agent tool with `subagent_type: "general-purpose"` and this prompt (PM fills the `<...>` placeholders per smoke):

```
You are Trace-Verifier <N> for the PM phase loop. Your job is to verify a UI smoke's data-path wiring through static code trace and produce a structured report. PM uses your report to decide whether to annotate the smoke as `Trace verified`.

You are NOT verifying:
- Visual layout, mobile spacing, contrast, animation, click feel
- Hydration mismatches under specific data shapes
- Copy, discoverability, hover/focus states

If the smoke is fundamentally about any of those, return verdict = trace-fail with reason "wrong lane — eyeball-only smoke."

## Inputs

- Smoke ID:                <SMOKE_ID>
- Lane:                    wiring
- Catalog entry (Setup / Steps / Expected): <paste the relevant block from docs/smoke-tests-pending.md>
- Hypothesized starting point: <PM's best guess: file or component to start tracing from>
- Source commit / spec:    <sha or spec doc>

## Your contract — a trace counts ONLY if all six hold

1. **End-to-end path with file:line citations.** Name every hop. "DB query at <file>:<line> → fetcher at <file>:<line> → component at <file>:<line> → render condition at <file>:<line> → handler at <file>:<line>." If you can't follow the path end-to-end, verdict = trace-incomplete. Do not approximate.

2. **Conditionals named with predicate + element.** For every `if (X) <Y/>`, write the predicate AND the element. Don't say "renders the badge"; say "renders <Badge variant='secondary'> at TasksTab.tsx:88 when row.is_private === true."

3. **Pattern cross-references when applicable.** If new code mirrors an existing eyeball-verified component, name the reference: "mirrors <component> at <path>:<line>." This is force-multiplier evidence — call it out. If it's net-new wiring with no analog, say so.

4. **Per-test caveats, not boilerplate.** List what THIS trace did NOT verify FOR THIS smoke. If your caveats look identical across multiple smokes, you're being lazy — be specific.

5. **Honesty bias.** False negatives ("I'm not sure") cost less than false positives. When in doubt, downgrade to trace-incomplete and tell PM exactly what you couldn't verify.

6. **Catalog-vs-code contradiction check.** If the smoke's Setup or Steps presuppose a state the code's preconditions don't allow (read-only flags, filter clauses, gated routes, role gates, etc.), surface the contradiction in caveats with file:line of the contradicting precondition. The catalog can be wrong; flag it when it is.

## Verdict semantics — choose precisely

- **trace-pass** — Path verified end-to-end, conditionals named, caveats specific, no doubts about wiring correctness, no catalog-vs-code contradictions found.
- **trace-incomplete** — Path is partially traced; you couldn't follow some hop with confidence (dynamic dispatch, prop drilling through 5+ layers, framework magic). Wiring may be correct but YOU couldn't verify it statically. PM falls back to eyeball.
- **trace-fail** — You followed the path and found a wiring bug, OR the smoke is fundamentally eyeball-only and shouldn't be in this lane.

## Output format — return exactly this shape

Verifier <N> | <smoke-id> — Trace report

Path traced:
- <file>:<line> — <what happens here>
- ...

Conditionals verified:
- <file>:<line> — `if (<predicate>) <element>` — verified <branch behavior>
- ...

Pattern cross-references:
- <new>:<line> mirrors <existing>:<line>  (or: "none — net-new wiring")

Caveats — what this trace did NOT verify (specific to this smoke):
- <caveat 1>
- <caveat 2>

Catalog-vs-code contradictions (if any):
- <smoke step / setup line> contradicts <file>:<line> — <one-line explanation>

Verdict: trace-pass | trace-incomplete | trace-fail
Reason (required if not pass): <one line>

Residual eyeball list (what a human still needs to look at):
- <observable 1>
- <observable 2>

## Hard constraints

- Read-only — do not modify any files.
- No dev server, no test runner, no browser. Static trace only.
- No summary phrases ("everything looks correct"). Cite line numbers or you didn't trace.
- No boilerplate caveats. Be specific to this smoke.
```

### PM judgment — what to do with the report

For each verifier report:

1. **Spot-check 1-2 cited file:line pairs** on the first few dispatches per session. Open the file, confirm the line says what the verifier claims. Once calibrated, accept on quality signals (citations specific, caveats per-test, verdict honest).

2. **Decide accept / re-dispatch / escalate:**
   - `trace-pass` with clean spot-check → annotate the smoke `Trace verified: <date> (Verifier <N>)`. Smoke `Status` stays `Pending` — trace is never a status flip; only eyeball pass flips status.
   - `trace-incomplete` → fall back to PM-inline trace or eyeball, depending on what the verifier couldn't follow. Don't re-dispatch the same prompt and hope.
   - `trace-fail` due to wiring bug → escalate to a fresh implementation worker. Trace-fail is a real bug surface.
   - `trace-fail` due to wrong-lane → re-tag the smoke `Lane: visual` and hand to user for eyeball. The verifier did its job by refusing.
   - **Catalog-vs-code contradiction surfaced** → fix the catalog entry (wrong setup, wrong expected) before any other action. The smoke is unrunnable as written.

3. **Calibration discipline:** if a `trace-pass` smoke later fails an eyeball verification, log the event in `tests/smoke/.calibration-log.md` with date, smoke ID, what trace missed, root cause. After 3-4 calibration events, revisit the verifier prompt — it's drifting.

### What this is NOT

- **Not a status flip.** Trace verification annotates a smoke; it never moves `Pending` → `Passed`. The catalog invariant — `Passed` means a human verified the observable — is load-bearing. See [docs/smoke-tests-pending.md](smoke-tests-pending.md) for the lane / annotation conventions.
- **Not for visual smokes.** Layout, contrast, animation, click feel, copy — eyeball-only. Verifier should reject these with `trace-fail / wrong lane`.
- **Not a substitute for pgTAP / unit tests.** If the framework prescribes a unit-test pattern that already covers a smoke's domain (e.g., pgTAP for RLS), don't dispatch a verifier — the unit test is the verification.

---

## Identification protocol

Multiple worker tabs get confusing fast — when the PM says "Worker 2 had an issue with the migration" and your eyes have to scan task-name truncations across five tabs to find the right window, you've added overhead. A small naming convention solves this.

**Worker numbering.** PM assigns sequential numbers as it dispatches workers: Worker 1, Worker 2, Worker 3. PM tracks which numbers are active.

**Tab / window naming.** When you open a window for a worker, name it:

```
Worker N | [short task name]
```

Examples: `Worker 1 | Fix RLS on orders`, `Worker 2 | Add Stripe webhook handler`. The number is for disambiguation; the task name is the human-readable hint.

**Worker prompt header.** Every worker prompt the PM drafts opens with:

> You are Worker N for the PM context. Task: ... Your plan doc is at `docs/plans/[phase]/worker-N-[task].md`.

**Worker response headers.** Every worker reply ends in a formatted block. Two possible headers:

```
Worker N | [task name] - Response to PM:
[the report — work done, or blocked on a PM decision]
```

```
Worker N | [task name] - User action required:
[clear, sequential instructions for the user — run this command, paste this credential, confirm this destructive change]
```

When the user sees `Response to PM:`, they paste the full reply back to the PM. When they see `User action required:`, they act first, then report back to the worker. The worker pauses until the user responds.

---

## Communication modes

**PM context — two modes:**

- **PM → User** (layman). When talking to the user, translate worker detail into plain English, decision-oriented framing: *"Worker 2 finished the migration; Worker 3 is still investigating the webhook bug. The decision you need to make: ship Worker 2's work now or wait for 3?"* No file paths or function names unless the user asks.
- **PM → Worker** (technical). When drafting worker prompts, talk like a senior engineer to a senior engineer. Dense, precise, file paths, function signatures, constraints. No softening or "why this matters" — workers don't need it.

**Worker context — two modes:**

- **Worker → PM** (default — technical). PM is a peer. Reply with full file paths, exact error messages, line numbers, test results verbatim. No bloat ("here's a summary of what I did") — just the facts the PM needs to make the next decision.
- **Worker → User** (only when blocked on user input). Switch to layman, sequential instructions. Use `User action required:` header. Provide exact commands as fenced code blocks ready to paste. Wait for user confirmation before continuing.

---

## Concurrency and the PM status board

**Cap at ~2 workers in flight.** Parallelism only pays when tasks are genuinely independent. For tightly coupled work, integration cost from three parallel diffs eats the speedup. Default to 1–2 workers; reach for a third only when you can articulate why the tasks can't share a brain.

**PM appends a status board to every user-facing reply.** PM holds state, not your head:

```
Workers in flight:
- Worker 2 | Stripe webhook handler — implementing (Phase 7)
- Worker 3 | Invoice migration — blocked on user input (see Worker 3 tab)

Workers wrapped:
- Worker 1 | RLS audit — implementation done, integrated

Queued sidebars (caught mid-task, deferred):
- Fix typo in onboarding email (noted during Worker 1)
- Refactor the order-status enum (noted during Worker 2)
```

Mandatory on every PM reply that follows a worker dispatch or result.

---

## Setting up the PM

Open a new context window in the project root. The simplest seed is just:

> Run `/orchestrate` for [phase name].

`/orchestrate` reads the phase loop and drives the PM through it. If you want to customize behavior, the seed prompt template lives in the appendix below.

Memory entries (`feedback_sidebar_observations.md`, `user_pm_worker_workflow.md`, `user_pm_phase_loop.md`, `feedback_agent_autonomy.md` in `~/.claude/projects/[project]/memory/`) reinforce the PM behavior — they auto-load into every session.

---

## Setting up a worker

> This section covers **separate-window dispatch only**. For subagent dispatch (the default), PM spawns workers via the Agent tool — no manual window setup needed.

Workers are short-lived. PM drafts a self-contained prompt that includes:

- **The Worker N identifier** — opens with `You are Worker N.` so the worker formats its response header correctly
- **The path to its plan doc** — `docs/plans/[phase]/worker-N-[task].md`
- **The exact phase the worker is in** — audit round (Phase 5) or implementation (Phase 7)
- **The two-mode rule** — "Default to technical responses for the PM (full file paths, exact errors, no bloat). Switch to layman/sequential mode only when blocked on user input — use the `User action required:` response header for that case."
- **The copy-paste rule** — "If the deliverable is a command, script, env var, or text-to-paste, output it as a fenced code block ready to paste — no narration unless I ask."
- **The response-header instruction** — "Format your final reply with one of two headers: `Worker N | [task name] - Response to PM:` (default) or `Worker N | [task name] - User action required:` (blocked on something only the user can do)."

Open a new context window, name the tab `Worker N | [short task name]`, paste the PM-drafted prompt, run.

When the worker finishes:

- `Response to PM:` → copy the full reply (header included) back to the PM.
- `User action required:` → act on the instructions first, then report back to the worker. Don't paste this to the PM blindly — there's a step you need to do first.

---

## Practical tips

- **One worker, one task.** Don't pile multiple unrelated tasks on a worker — that defeats the purpose. PM keeps the broader plan; workers stay narrow.
- **PM does the codebase reading for context.** Workers should run with as little context-discovery overhead as possible — let PM front-load context into the prompt and the plan doc. Saves worker tokens for execution.
- **Surface side-channel observations to PM, not workers.** "While we were debugging X, I noticed Y" → tell the PM, let it queue Y for after X. Worker stays focused on X.
- **`/ship` runs from PM only.** Workers can implement; commits and pushes happen from the seat with the full picture.
- **Don't overuse it.** If the work fits in one window, use one window.

---

## When this is overkill

If you find yourself relaying between windows for a single linear task, you've added overhead with no benefit. Collapse back to one window. The pattern earns its keep when:

- You have ≥2 parallel sub-tasks you want to dispatch independently
- You need to review a worker's output before deciding the next step
- You're holding architectural context that doesn't fit in the same window as tactical execution

Below those thresholds, single-window is faster.

---

## Appendix: PM seed prompt (when not using `/orchestrate`)

If for some reason you want to operate as PM without invoking `/orchestrate` (e.g., a phase that doesn't fit the loop), seed the PM with:

> You are my PM context for [project]. Your job: hold the big picture, review the codebase before drafting prompts, draft self-contained prompts for worker contexts, ingest their results, decide what's next.
>
> **Two modes:**
> - When talking to me (the user): plain English, decision-oriented. Translate worker detail into "here's where we are, here's the call you need to make." No file paths or function names unless I ask.
> - When drafting worker prompts: technical, dense, precise. File paths, function signatures, constraints. No softening.
>
> **Worker dispatch protocol:**
> - Assign each new worker the next sequential number (Worker 1, 2, 3, ...). Track which numbers are in flight.
> - Cap concurrency at ~2 in-flight workers unless you can articulate why a third is genuinely independent.
> - Every worker prompt opens with `You are Worker N. Task: ...` and includes the path to its plan doc at `docs/plans/[phase]/worker-N-[task].md`. End every prompt with: "Format your final reply with one of two headers: `Worker N | [task name] - Response to PM:` (default) or `Worker N | [task name] - User action required:` (if you need the user to do something before proceeding). If the deliverable is a command, script, env var, or text-to-paste, output it as a fenced code block ready to paste — no narration unless I ask."
>
> **Status board:** Every reply you send me appends a status board showing current worker state — workers in flight, workers wrapped, queued sidebars.
>
> **Sidebars:** When I make a tangential observation mid-task, catalog it in queued-sidebars — don't pivot. Surface the catalog when the active task wraps.
>
> Your output is either (a) a ready-to-paste worker prompt, or (b) analysis of a worker's result + the next step.
