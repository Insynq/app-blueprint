---
description: Full autonomous workflow — investigate → plan → audit → implement
arguments:
  - name: type
    description: Workflow type - "feature" or "debug" (default is feature)
    required: false
  - name: description
    description: Description of the feature to build or issue to debug
    required: true
---

# Orchestrate — Full Autonomous Workflow

**Chains `/investigate` → `/plan` → `/audit-code` → `/implement` autonomously.**

Use this when you want to go from a description to working code without managing each step manually. Best for features or bugs where the approach isn't obvious and you want Claude to do the exploration first.

## When to Use vs. `/implement`

- **`/orchestrate`** — You have a description, not yet a plan. Claude investigates first.
- **`/implement`** — You already have a validated spec doc or plan. Go straight to execution.

## Workflow

### Step 1: Read Context

Read `CLAUDE.md` to understand the project — tech stack, patterns, conventions, DO NOTs.

### Step 2: Investigate

Spawn an `Explore` subagent to investigate the codebase:

```
# Investigation

{{#if type}}Type: **$ARGUMENTS.type**{{/if}}
Task: **$ARGUMENTS.description**

Investigate the codebase thoroughly:

1. **Understand the current state** — what exists that's relevant to this task?
2. **Trace data flows** — follow the data from entry point to storage/display
3. **Find all usages** — search for every place the affected code is called
4. **Check for reusable patterns** — what existing utilities, hooks, or components could apply?
5. **Identify affected files** — what will need to change?

{{#if type == "debug"}}
For debugging: trace the full execution path, check for dead code (components that look correct but aren't routed), find all places the symptom could originate.
{{/if}}

Report:
- Root cause or implementation gap found
- Files that need to change (with paths and line numbers)
- Reusable patterns found
- Risks or constraints to be aware of
```

### Step 3: Verify Data Shapes

After investigation findings are returned, verify all data shapes referenced:
- Read the CREATE TABLE migration for every table mentioned in the findings
- Confirm exact column names (TypeScript types may differ from DB column names)
- Correct any field name mismatches in the findings before passing to the plan step

### Step 4: Plan or Debug

{{#if type == "debug"}}
Pass the verified investigation findings directly to `/debug` as context. **Do NOT run `/plan`** — debugging requires hypothesis testing, not feature planning. The `/debug` command will characterize the symptom, form a hypothesis, and confirm before fixing.

Skip steps 5 and 6 (Audit the Plan, Implement) — `/debug` owns the fix workflow from here.
{{else}}
Based on investigation findings, create an implementation plan:

```markdown
## Implementation Plan: [Task]

### Summary
[1–2 sentences]

### Affected Files
| File | Change Type | Description |

### Implementation Steps
#### Step 1: [Description]
**File:** `path/to/file`
**Change:** [What to change]
**Why:** [Reason]

[Continue for all steps...]

### Testing Checklist
- [ ] [Scenario to test]

### Risks
[Any risks from investigation]
```

Present the plan to the user and then output exactly:

---
**Waiting for approval.** Reply with:
- ✅ **Approved** — to proceed with implementation
- 🔄 **Revise: [feedback]** — to modify the plan before implementing
- ❌ **Cancel** — to stop here

Do not write any code or run any further steps until the user explicitly approves.

---

**STOP. Do not proceed past this point.**
{{/if}}

### Step 5: Audit the Plan

Before implementing, run an `/audit-code` style review on the plan:

- Is this the most elegant solution given what exists in the codebase?
- Are there reuse opportunities the plan misses?
- Are there security implications not addressed?
- Is there over-engineering for what's actually needed?

Report findings. Fix the plan if needed.

### Step 6: Implement

Execute the approved plan using the same process as `/implement`:
- Dependency-ordered batches
- Post-batch type check
- Post-batch audit agent
- Fix all BUGs before next batch

### Step 7: Report

```markdown
## Orchestrate Complete

### What Was Done
[Summary of the feature or fix]

### Investigation Findings
[Key things discovered that shaped the approach]

### Plan Executed
[High-level steps completed]

### Files Changed
| File | Change |

### Build Status
- Type check: ✅ / ⚠️
- Build: ✅ / ⚠️

### Recommended Next Steps
- [ ] Test [specific scenario]
- [ ] Ship with `/ship "message"`
```
