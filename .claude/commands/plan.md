---
description: Create an implementation plan from investigation findings
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

Task: **$ARGUMENTS.task**
{{#if findings}}
Investigation Findings:
$ARGUMENTS.findings
{{/if}}

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
- **Earned vs. assumed scope-out:** For every "out of scope," "existing behavior preserved," or "verifiable later" assumption, classify it. Earned = "I confirmed X works." Assumed = "I couldn't confirm X — building anyway." Mark every assumed scope-out as a dependency that must be verified before or during implementation. See `docs/LESSONS.md` `[PROCESS-1]`.

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

## Output Format (Required)

```markdown
## Implementation Plan: [Task Name]

### Summary
[1–2 sentences describing what this plan accomplishes]

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

#### Step 1: [Description]
**File:** `path/to/file.ts`
**Change:** [What to change]
**Why:** [Reason for this change]

#### Step 2: [Description]
**File:** `path/to/file.ts`
**Change:** [What to change]
**Why:** [Reason]

[Continue for all steps...]

### Testing Checklist
- [ ] **Happy path** — the primary use case works end-to-end
- [ ] **Error paths** — invalid input, network failure, permission denied each show the right response
- [ ] **Edge case data** — null/undefined values, empty arrays, maximum length strings, zero/negative numbers
- [ ] **Role coverage** — every affected user role sees the correct behavior (and can't access what they shouldn't)
- [ ] **Regression** — existing features in adjacent areas still work (check the most likely breakage points)
- [ ] **Loading and async states** — UI handles pending states without flicker or layout shift

### Rollback Plan
1. [How to undo if something goes wrong]

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
