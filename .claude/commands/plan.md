---
description: Use when investigation or brainstorming is done and you need a concrete, step-by-step implementation plan. Reach for this to turn findings into an actionable spec before /implement.
arguments:
  - name: task
    description: The task or feature to plan implementation for
    required: true
  - name: findings
    description: Summary of investigation findings (optional — uses recent context if not provided)
    required: false
---

# Planning Subagent

## When to use /plan vs. /plan-review
- Use `/plan` **after `/investigate`** — when you have investigation findings and need to turn them into an implementation plan
- Use `/plan-review` **when you have a spec doc** — when someone wrote a design document and you want to audit it for gaps before building
- Quick rule: `/plan` creates a plan from findings; `/plan-review` audits a plan that already exists

**IMPORTANT: This command spawns a subagent to protect main context.**

## Action Required

Spawn a Task with `subagent_type: Plan` using the prompt below.

---

## Subagent Prompt

```
# Implementation Planner

Task: **$ARGUMENTS**

Investigation Findings: if the task brief or recent session context includes investigation findings, use them; otherwise proceed from the codebase.

## Step 0: Read Project Context

Read `CLAUDE.md` FIRST to understand:
- Tech stack and frameworks
- Established patterns and conventions
- Hard constraints (DO NOTs)
- Role/permission model (if applicable)

All recommendations must fit the existing project. Don't introduce patterns that contradict what's established.

## Planning Process

### 1. Understand the Scope
- What exactly needs to change?
- What components/files are involved?
- Are there existing patterns to follow?
- What constraints apply?
- **Earned vs. assumed scope-out:** For every "out of scope," "existing behavior preserved," or "verifiable later" assumption, classify it. Earned = "I confirmed X works." Assumed = "I couldn't confirm X — building anyway." Mark every assumed scope-out as a dependency that must be verified before or during implementation. See `docs/LESSONS.md` `[PROCESS-3]`.
- **Provenance of superseded work:** If this plan replaces or is inspired by prior work — an open or abandoned PR, a stale branch, or an existing implementation already in the codebase (e.g. an item routed here from `/triage`) — link every inspiring artifact and locate where the current code lives *before* proposing the replacement. This is distinct from the reuse search in Step 2: reuse finds code to build on; provenance names and reads the specific artifact this plan supersedes, so you don't re-litigate solved decisions or lose working edge-case handling. Don't design a rewrite in a vacuum when the code it replaces already ships.

### 2. Identify Affected Areas
Search the codebase for:
- Files that need modification
- Existing utilities/functions that can be reused
- Related components that might need updates
- Database/API changes if data shapes change

### 3. Design the Approach
Consider:
- **Minimal change** — smallest change that solves the problem
- **Reuse existing** — follow patterns that are already there
- **Unified model** — one normalized type beats two types plus a translator; flag any proposed adapter as a smell
- **No over-engineering** — don't design for hypothetical future requirements
- **Security** — auth checks, input validation at boundaries, sensitive data handling

### 4. Break Down into Steps

Each step should be:
- **Atomic** — can be completed and verified independently
- **Ordered** — dependencies respected
- **Specific** — exact file and change described
- **Closure-owner tagged** — every step heading carries exactly one inline tag naming who can close it and how (below). This makes it structurally impossible to fool yourself that behavior is validated by editing files.

**Closure-owner tags (required on every step).** Prefix each step heading with one of:
- **`[EDIT]`** — the agent closes this by changing repo files. Done when the diff lands.
- **`[RUN]`** — live validation only the user can perform (a real end-to-end exercise against the running app). **Can NEVER be closed by editing.** Every `[RUN]` step must also be written into `docs/smoke-tests-pending.md` with a stable ID, so the true-closure signal lives on the committed ship-gate ledger, not in this plan.
- **`[DECIDE]`** — a strategy/architecture call not blocking the near-term edits. Maps to the scope-graduation gate (`CLAUDE.md` → verification & safety disciplines): a `[DECIDE]` gating a prod-mutating action must be resolved before that action, not silently carried. **If it is architecturally upstream** — it reshapes downstream work, so deciding it late forces re-architecture — flag it **decide-early** and surface it in `/plan-review` Step 6. A "decide early" label is not a decision.

**Closure-owner classification rule (no loophole).** Any step whose success claim depends on *runtime behavior* — the running app actually doing the thing (a migration taking effect, an email sending, a webhook firing, a role gate actually blocking) — MUST be `[RUN]`. "The diff landed" NEVER closes a behavior claim; only an observed live exercise does. A plan for behavior-changing work with **zero `[RUN]` steps is a red flag** — justify it in one line ("why does nothing here require live validation?") or a behavior step is mis-tagged `[EDIT]`.

## Output Format (Required)

```markdown
## Implementation Plan: [Task Name]

### Summary
[1–2 sentences describing what this plan accomplishes]

### Decisions (include ONLY when this plan resolves an architectural fork — omit otherwise)
| Fork | Resolution | Date |
|------|------------|------|
| e.g., REST endpoint vs. server action for submit | Server action — colocated validation, no new endpoint surface | 2026-01-15 |

### Prerequisites
- [ ] Investigation complete (root cause/approach identified)
- [ ] Approach approved

### Data Dependencies (required when code references specific values by name)
| Value Referenced | Source | Verified? |
|-----------------|--------|-----------|
| e.g., enum value 'active' | schema.ts line 24 | Yes |

### Affected Files
| File | Change Type | Description |
|------|-------------|-------------|
| src/hooks/useX.ts | Modify | Add parameter |
| src/components/X.tsx | Modify | Pass new prop |

### Implementation Steps

#### Step 1: [EDIT] [Description]
**File:** `path/to/file.ts`
**Change:** [What to change]
**Why:** [Reason for this change]

#### Step 2: [RUN] [Description]
**File:** `path/to/file.ts`
**Change:** [What to change]
**Why:** [Reason]
**Smoke-test ID:** [<SECTION>-<N> — mirrored into docs/smoke-tests-pending.md]

[Continue for all steps...]

### Expected Observations & Failure Signals (Complexity ≥ Medium)
For each step with a non-obvious failure mode (not mechanically every step), in one or two lines:
- **Expected observation** — exactly what you should see if the step worked: an artifact, output, or state you can point at (a migration applied, `gen types` regenerated, an RLS query returning the expected rows, a component rendering, a Playwright assertion green).
- **Most-likely failure** — the single most probable way it goes wrong, the signal that shows it, and the counter-move.
- **Fork-trigger (only if a real branch exists)** — "if you observe X, take route B": an observable trigger plus BOTH routes designed here, never a bare judgment call left dangling.
Omit for Low-complexity plans (see the Complexity marker below). Keep these as judgment-based signals, NOT hard-coded if/then trees.

### Testing Checklist
- [ ] **Happy path** — the primary use case works end-to-end
- [ ] **Error paths** — invalid input, network failure, permission denied each show the right response
- [ ] **Edge case data** — null/undefined values, empty arrays, maximum length strings, zero/negative numbers
- [ ] **Role coverage** — every affected user role sees the correct behavior (and can't access what they shouldn't)
- [ ] **Regression** — existing features in adjacent areas still work (check the most likely breakage points)
- [ ] **Loading and async states** — UI handles pending states without flicker or layout shift

### Rollback Plan
1. [How to undo if something goes wrong]

### Abort conditions (Complexity ≥ Medium; Low-complexity plans may omit)
- **Blocked — escalate/stop:** conditions where continuing would invent a required input (one whose invention changes a persisted or irreversible outcome — a row written, the wrong target mutated), or cross a real guardrail. Name them; on hit, stop and flag — do NOT improvise.
- **Friction — push through:** expected obstacles (transient errors, retries, noisy output) that are NOT reasons to stop. Name them so the executor doesn't over-stop.

### Risks
| Risk | Likelihood | Mitigation |
|------|------------|------------|
| [Risk] | Low/Med/High | [How to handle] |

### Complexity
[ ] Simple (1–2 files, straightforward)
[ ] Medium (3–5 files, coordination needed)
[ ] Complex (6+ files, architectural changes)
```
```

---

## After Subagent Returns

1. Review the plan with the user
2. If approved → run `/audit-code` to verify the approach is sound
3. If changes needed → refine or ask user for clarification
4. Once approved → `/implement`

## Workflow

```
/investigate → findings
     ↓
/plan → implementation plan
     ↓
/audit-code → verify approach
     ↓
/implement → execute
     ↓
/ship → commit and push
```
