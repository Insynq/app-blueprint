# Multi-Agent Workflow — PM & Worker Context Windows

A pattern for staying in the strategic seat while AI agents do the focused execution.

This is **optional methodology** — pick it up when single-context-window work starts feeling cramped, or when you find yourself losing focus on the active task because side observations keep pulling you away.

---

## The shape

Three roles, one human:

- **PM context window** = strategic lead. One persistent conversation that holds the big-picture goals, reviews the codebase before kicking off work, drafts the exact prompts that start new worker sessions, ingests results from worker sessions, and decides what's next. Critically, it catches sidebar observations and queues them for later instead of pivoting mid-task.

- **Worker context windows** = focused execution. Short-lived conversations that receive a self-contained prompt from the PM, run focused work (often invoking commands like `/implement`, `/debug`, `/orchestrate` to keep their own context lean), and report results in a copy-pasteable form back to the PM.

- **You** = the relay. You copy worker output into the PM, paste PM-drafted prompts into new workers.

---

## When to use this vs. alternatives

| Pattern | Best when |
|---|---|
| Single context window | Simple, linear work. Setup overhead exceeds the work itself. |
| `/orchestrate` | Autonomous batch work — agent decides parallel sub-tasks, you wait for the result. Good for well-scoped feature implementations. |
| **PM/worker** | Complex, multi-step work where you want to stay in the strategic seat. Reviewing code, deciding what each worker tackles next, holding context across many parallel threads. |

PM/worker shines specifically when:

- The work is **exploratory** — you don't know upfront what all the sub-tasks are
- You want to **course-correct between sub-tasks** without re-explaining context every time
- You're **prone to chasing sidebars** — the PM context catches them, workers stay focused on their assigned task
- The codebase is **large enough** that one context window can't hold both strategic and tactical reasoning at once

PM/worker is **not** a replacement for `/orchestrate`, `/implement`, or `/debug`. Workers invoke those commands. The pattern is about how you compose multiple agent sessions, not about replacing what each session does.

---

## Identification protocol

Multiple worker tabs get confusing fast — when the PM says "Worker 2 had an issue with the migration" and your eyes have to scan task-name truncations across five tabs to find the right window, you've added overhead. A small naming convention solves this.

**Worker numbering.** The PM assigns sequential numbers to workers as it dispatches them: Worker 1, Worker 2, Worker 3, and so on. The PM tracks which numbers are active.

**Tab / window naming.** When you open a window for a worker, name it:

```
Worker N | [short task name]
```

Examples: `Worker 1 | Fix RLS on orders`, `Worker 2 | Add Stripe webhook handler`, `Worker 3 | Refactor invoice calc`. The number is for disambiguation; the task name is the human-readable hint.

**Worker prompt header.** Every worker prompt the PM drafts opens with:

> You are Worker N for the PM context. Task: ...

**Worker response headers.** Every worker reply ends in a formatted block. There are two possible headers depending on what the worker needs:

```
Worker N | [task name] - Response to PM:
[the report — work done, or blocked on a PM decision]
```

```
Worker N | [task name] - User action required:
[clear, sequential instructions for the user — run this command, paste this credential, confirm this destructive change]
```

When the user sees `Response to PM:`, they paste the full reply back to the PM. When they see `User action required:`, they act on the instructions first, then report back to the worker. The worker pauses until the user responds — pasting a `User action required:` block to the PM blindly skips a step the user has to do.

This protocol (number, tab name, prompt header, two possible response headers) makes the relay unambiguous. Skip any piece and you'll lose track within an hour.

---

## Communication modes

Each role has two modes that switch based on the audience.

**PM context — two modes:**

- **PM → User** (layman). When talking to the user, translate worker detail into plain English, decision-oriented framing: "Worker 2 finished the migration; Worker 3 is still investigating the webhook bug. The decision you need to make: ship Worker 2's work now or wait for 3?" No file paths or function names unless the user asks.
- **PM → Worker** (technical). When drafting worker prompts, talk like a senior engineer to a senior engineer. Dense, precise, file paths, function signatures, constraints. No softening or "why this matters" — workers don't need it.

**Worker context — two modes:**

- **Worker → PM** (default — technical). The PM is a peer. Reply with full file paths, exact error messages, line numbers, test results verbatim. No bloat ("here's a summary of what I did") — just the facts the PM needs to make the next decision.
- **Worker → User** (only when blocked on user input). Switch to layman, sequential instructions. Use the `User action required:` response header. Provide exact commands as fenced code blocks ready to paste. Wait for the user to confirm before continuing.

**Why two modes:** the audience needs different things. The user is making decisions and shouldn't have to parse stack traces; the PM is making technical synthesis and shouldn't have to translate filler. Same agent, two registers, audience determines which.

---

## Concurrency and the PM status board

**Cap at ~2 workers in flight.** Parallelism only pays when tasks are genuinely independent. For tightly coupled work, the integration cost from three parallel diffs eats the speedup. Default to 1–2 workers; reach for a third only when you can articulate why the tasks can't share a brain.

**The PM appends a status board to every user-facing reply.** The PM is the place that holds state, not your head. Format:

```
Workers in flight:
- Worker 2 | Stripe webhook handler — dispatched, awaiting result
- Worker 3 | Invoice migration — blocked on user input (see Worker 3 tab)

Workers wrapped:
- Worker 1 | RLS audit — result integrated

Queued sidebars (caught mid-task, deferred):
- Fix typo in onboarding email (noted during Worker 1)
- Refactor the order-status enum (noted during Worker 2)
```

The board is mandatory on every PM reply that follows a worker dispatch or result. It's how you keep three context windows + one PM straight without losing track.

**Tradeoff:** PM replies get longer. But the PM is exactly the place you should NOT have to remember anything — the longer board is the right trade.

---

## Setting up the PM

Open a new context window in the project root. Seed it with something like:

> You are my PM context for [project]. Your job: hold the big picture, review the codebase before drafting prompts, draft self-contained prompts for worker contexts, ingest their results, decide what's next.
>
> **Two modes:**
> - When talking to me (the user): plain English, decision-oriented. Translate worker detail into "here's where we are, here's the call you need to make." No file paths or function names unless I ask.
> - When drafting worker prompts: technical, dense, precise. File paths, function signatures, constraints. No softening or "why this matters" — workers don't need it.
>
> **Worker dispatch protocol:**
> - Assign each new worker the next sequential number (Worker 1, 2, 3, ...). Track which numbers are in flight.
> - Cap concurrency at ~2 in-flight workers unless you can articulate why a third is genuinely independent.
> - Every worker prompt you draft **must** open with `You are Worker N. Task: ...` and **must** end with: "Format your final reply with one of two headers: `Worker N | [task name] - Response to PM:` (default) or `Worker N | [task name] - User action required:` (if you need the user to do something before proceeding). If the deliverable is a command, script, env var, or text-to-paste, output it as a fenced code block ready to paste — no narration unless I ask."
>
> **Status board:** Every reply you send me must append a status board showing current worker state — workers in flight, workers wrapped, queued sidebars. I should never have to remember which worker is on what.
>
> **Sidebars:** When I make a tangential observation mid-task ("hey, I also noticed X"), catalog it in the status board's queued-sidebars section — don't pivot to it. Surface the catalog when the active task wraps.
>
> Your output is either (a) a ready-to-paste worker prompt, or (b) an analysis of a worker's result + the next step. Don't write code yourself unless the work is small enough that spinning up a worker is overhead.

Memory entries (`feedback_sidebar_observations.md`, `user_pm_worker_workflow.md`, `feedback_agent_autonomy.md` in `~/.claude/projects/[project]/memory/`) reinforce this — they auto-load into every session in the project, so you don't have to repeat the seed each time once they're in place.

---

## Setting up a worker

Workers are short-lived. The PM should draft a self-contained prompt that includes:

- **The Worker N identifier** — opens with `You are Worker N.` so the worker can format its response header correctly (see *Identification protocol* above)
- **The exact task** — one task per worker; don't pile multiple unrelated things on
- **All required file paths** — workers should run with as little context-discovery overhead as possible
- **Constraints and non-goals** — what NOT to touch, scope boundaries
- **The expected output shape** — e.g., "report a punch list of files changed, in 200 words or less" or "produce the migration SQL for review"
- **The two-mode rule** — "Default to technical responses for the PM (full file paths, exact errors, no bloat). Switch to layman/sequential mode only when blocked on user input — and use the `User action required:` response header for that case." (see *Communication modes* above)
- **The copy-paste rule** — "If the deliverable is a command, script, env var, or text-to-paste, output it as a fenced code block ready to paste — no narration unless I ask."
- **The response-header instruction** — "Format your final reply with one of two headers: `Worker N | [task name] - Response to PM:` (default — work done or blocked on a PM decision) or `Worker N | [task name] - User action required:` (blocked on something only the user can do)."

Open a new context window, **name the tab `Worker N | [short task name]`**, paste the PM-drafted prompt, run. When the worker finishes:

- If the reply has the `Response to PM:` header → copy the full reply (header included) back to the PM.
- If the reply has the `User action required:` header → act on the instructions first, then report back to the worker. Don't paste this to the PM blindly — there's a step you need to do first.

---

## Practical tips

- **One worker, one task.** Don't pile multiple unrelated tasks on a worker — that defeats the purpose. The PM is what keeps the broader plan; workers should be narrow.
- **PM does the codebase reading.** Workers should run with as little context-discovery as possible — let the PM front-load context into the prompt. Saves worker tokens for execution.
- **Surface side-channel observations to the PM, not to workers.** "While we were debugging X, I noticed Y" → tell the PM, let it queue Y for after X. The worker stays focused on X.
- **Use `/ship` from the PM only.** Workers can implement; commits and pushes happen from the seat with the full picture. The PM has the holistic view that makes commit messages accurate.
- **Don't overuse it.** If the work fits in one window, use one window. The relay overhead (copy/paste between windows) is real — only spend it when the strategic/tactical separation is paying off.

---

## When this is overkill

If you find yourself relaying between windows for a single linear task, you've added overhead with no benefit. Collapse back to one window. The pattern earns its keep when:

- You have ≥3 parallel sub-tasks you want to dispatch independently
- You need to review a worker's output before deciding the next step
- You're holding architectural context that doesn't fit in the same window as tactical execution

Below those thresholds, single-window or `/orchestrate` is faster.
