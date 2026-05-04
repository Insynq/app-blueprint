---
description: Run a complete debugging or feature workflow autonomously
arguments:
  - name: type
    description: Workflow type - "debug" or "feature"
    required: true
  - name: task
    description: Description of the bug to fix or feature to implement
    required: true
---

# Workflow Orchestrator

**This skill spawns a general-purpose subagent that orchestrates the full workflow.**

## Action Required

Spawn a Task with `subagent_type: general-purpose` using the prompt below. The orchestrator will chain multiple subagents and return a final summary with implementation plan.

---

## Subagent Prompt

```
# Workflow Orchestrator

Workflow Type: **$ARGUMENTS.type**
Task: **$ARGUMENTS.task**

## Your Role

You are an orchestrator agent. You will run a complete workflow by spawning specialized subagents, collecting their results, and producing a final actionable output.

You have access to the Task tool and can spawn these subagent types:
- `Explore` - for codebase investigation, validation, and auditing (read-only)
- `Plan` - for creating implementation plans (read-only)

## Step 0: Read Project Context

Before spawning any subagents, read the project context:
- `CLAUDE.md` — primary source of truth for tech stack, patterns, conventions, and current phase
- `README.md` — if CLAUDE.md is absent
- Note the project's framework, auth system, database, and key conventions

Pass this context forward into every subagent prompt below by substituting [PROJECT CONTEXT] with the relevant summary.

## Workflow: Debug

If workflow type is "debug", execute these steps:

### Step 1: Investigation
Spawn an Explore subagent with this prompt:
```
Investigate: [task description]

Project context: [PROJECT CONTEXT]

Be extremely thorough. Trace the full data flow from UI to database.
Find ALL usages of involved functions/components.
Verify routing in the app's router config.
Check for dead code or duplicate implementations.

ADDITIONAL SCOPE (do not skip):
- For any component involved: find ALL parent components that render it.
  Use Grep to search for the component name across the entire src/ directory.
- For any shared state (database counters, profile fields, etc.) involved:
  find ALL code paths that read or write that state. This includes other edge functions,
  hooks, and DB functions.
- For any hook involved: find ALL files that import and use it.
- Check for similar existing patterns that could be reused instead of building new ones.
  Specifically search src/hooks/, src/components/, src/lib/ for related functionality.
- For Supabase projects: For any edge function involved, verify it has an entry in
  `supabase/config.toml`. Missing entries cause 401 at the Supabase gateway before
  function code executes.

Return a structured report with:
- Data flow trace
- All usages found (file:line)
- All parent/consumer components for each involved component
- All code paths for any shared state
- Routing verification
- Root cause (specific file:line)
- Recommended fix
```

### Step 2: Planning
Using the investigation findings, spawn a Plan subagent with this prompt:
```
Create implementation plan for: [task description]

Project context: [PROJECT CONTEXT]

Investigation findings:
[paste findings from step 1]

IMPORTANT: The Plan agent has access to Read, Glob, and Grep tools.
Read the actual files referenced in the investigation findings to understand
the code before creating the plan. Do not rely solely on summaries.

Return a structured plan with:
- Affected files (verified by reading them)
- Step-by-step changes with specific file:line references
- New files needed (if any)
- Database changes needed (if any)
- Testing checklist
- Rollback plan
```

### Step 3: Validate Plan Against Codebase
Spawn an Explore subagent to validate every assumption in the plan:
```
# Plan Validation

You have an implementation plan to validate against the actual codebase.

## Plan to Validate
[paste full plan from Step 2]

## Validation Protocol

For EACH file the plan references, read the actual file and verify:
1. The file exists at the stated path
2. The function/component/hook has the signature the plan describes
3. The line numbers referenced are approximately correct
4. The behavior described matches the actual code

For EACH assumption the plan makes, classify as:
- ✅ CONFIRMED — code matches plan's description
- ⚠️ ADJUSTMENT NEEDED — close but details differ (state what's different)
- ❌ WRONG — plan assumes something that isn't true

For EACH modified component, verify:
- ALL parent components that render it (Grep for component name across src/)
- ALL files that import it
- Whether new props need to be threaded through parents

For EACH modified hook, verify:
- ALL files that call this hook
- Whether parameter changes are backward-compatible

For EACH modified or new edge function (Supabase projects), verify:
- ALL frontend code that invokes this function (Grep for the function name)
- Whether request body changes are backward-compatible
- That it has a `[functions.<name>]` entry in `supabase/config.toml` (missing = 401)

## Output Format
### Validated Assumptions
| # | Assumption | Status | Evidence |

### Missing Parent/Consumer Updates
| Modified File | Missing Consumer | What It Needs |

### File Name / Path Corrections
| Plan Says | Actually Is |

### Adjustments Required
[List specific changes needed to make the plan accurate]
```

### Step 4: Audit (with Security Checks)
Spawn an Explore subagent to audit the plan:
```
Audit this implementation plan for the codebase:

[paste plan from step 2]

Validation findings that need to be incorporated:
[paste validation results from step 3]

Check for:
- Reuse opportunities (existing hooks/utilities in src/hooks/, src/lib/, src/components/)
- Pattern violations vs established project conventions
- Anti-patterns
- Over-engineering (abstractions for single use, hypothetical future requirements)

## Security-Specific Checks (REQUIRED)

1. **Auth/Data Bypass** — For any endpoint that accepts status fields or IDs from the client:
   Can a user call the endpoint directly with fabricated data to skip validation?
   What server-side checks prevent this?

2. **Race Conditions on Shared State** — For any counter, flag, or status field modified
   by the plan: Are there OTHER code paths (existing edge functions, hooks, DB triggers)
   that also modify this same field? If so, are all paths atomic?

3. **Webhook/Event Idempotency** — For any webhook or event handler that modifies data:
   What happens if the same event fires twice? Will it double-count, double-charge, or
   corrupt state?

4. **Hardcoded Values vs Config** — Are there values in the plan (limits, fees, thresholds)
   that are hardcoded but should come from a configurable source (DB, env vars, tier config)?
   Check if the same values exist in multiple places that could drift.

5. **Data Exposure** — Do any new columns (especially payment identifiers, tokens, keys)
   get exposed to the frontend via existing select('*') queries?

Return: APPROVED or NEEDS CHANGES with specific, actionable recommendations.
For each recommendation, specify exactly what to change in the plan.
```

### Step 5: Apply Fixes and Compile Final Output
Based on validation (Step 3) and audit (Step 4) results:

1. **Apply validation corrections** to the plan:
   - Fix any wrong file names/paths
   - Add missing parent/consumer updates
   - Correct any wrong assumptions

2. **Apply audit recommendations** to the plan:
   - For each "NEEDS CHANGES" recommendation, make the specific change
   - Update the Files Summary to reflect any new/changed files
   - Update the Implementation Order if dependencies changed
   - Add any new verification checklist items

3. **Compile the final output** with ALL fixes applied:

```markdown
## Workflow Complete: Debug

### Investigation Summary
[Key findings - 3-5 bullet points]

### Root Cause
**File:** [file:line]
**Issue:** [description]

### Implementation Plan (FINAL — validated + audited)
[The corrected plan with all fixes applied]

### Files to Modify/Create
| File | Action | Description |
|------|--------|-------------|

### Validation Results
[Summary: X confirmed, Y adjusted, Z corrected]

### Audit Results
[APPROVED or summary of changes applied]

### Verification Checklist
[Testing steps]

### Ready to Implement
[ ] Yes - proceed with implementation
[ ] No - needs [specific action]
```

IMPORTANT: Do NOT return a plan that says "NEEDS CHANGES" — apply the changes yourself
and return the corrected plan. The user should receive a ready-to-implement plan.

---

## Workflow: Feature

If workflow type is "feature", execute these steps:

### Step 1: Exploration
Spawn an Explore subagent to understand the codebase context:
```
Explore the codebase to understand how to implement: [task description]

Project context: [PROJECT CONTEXT]

Find:
- Related existing components/hooks that could be reused or extended
- Similar patterns already implemented (especially in src/hooks/, src/components/, src/lib/)
- Files that will need modification
- Database tables involved (if any)
- Edge functions or API routes involved (if any)

ADDITIONAL SCOPE (do not skip):
- For any component that will be modified: find ALL parent components that render it.
  Use Grep to search for the component name across the entire src/ directory.
- For any shared state (database counters, profile fields, etc.) that will be modified:
  find ALL code paths that read or write that state. This includes other edge functions,
  hooks, and DB functions.
- For any hook that will be modified: find ALL files that import and use it. Check if
  adding a parameter will break existing callers.
- Check for similar existing patterns that could be reused instead of building new ones.
- For Supabase projects: For any edge function involved, verify it has an entry in
  `supabase/config.toml`. Missing entries cause 401 at the gateway.

Return a context summary for planning, including:
- Existing code that can be reused (with file paths)
- All parent/consumer relationships for components that will change
- All shared state and its read/write code paths
```

### Step 2: Planning
Spawn a Plan subagent:
```
Create implementation plan for: [task description]

Project context: [PROJECT CONTEXT]

Codebase context:
[paste context from step 1]

IMPORTANT: The Plan agent has access to Read, Glob, and Grep tools.
Read the actual files referenced in the exploration findings to understand
the implementation details before creating the plan. Do not rely solely on summaries.

Return a structured plan with:
- Affected files (verified by reading them)
- Step-by-step implementation with specific file:line references
- New files needed (if any)
- Database changes needed (if any)
- Implementation order with dependencies
- Testing checklist
```

### Step 3: Validate Plan Against Codebase
Spawn an Explore subagent to validate every assumption in the plan:
```
# Plan Validation

You have an implementation plan to validate against the actual codebase.

## Plan to Validate
[paste full plan from Step 2]

## Validation Protocol

For EACH file the plan references, read the actual file and verify:
1. The file exists at the stated path
2. The function/component/hook has the signature the plan describes
3. The line numbers referenced are approximately correct
4. The behavior described matches the actual code

For EACH assumption the plan makes, classify as:
- ✅ CONFIRMED — code matches plan's description
- ⚠️ ADJUSTMENT NEEDED — close but details differ (state what's different)
- ❌ WRONG — plan assumes something that isn't true

For EACH modified component, verify:
- ALL parent components that render it (Grep for component name across src/)
- ALL files that import it
- Whether new props need to be threaded through parents

For EACH modified hook, verify:
- ALL files that call this hook
- Whether parameter changes are backward-compatible

For EACH modified or new edge function (Supabase projects), verify:
- ALL frontend code that invokes this function
- Whether request body changes are backward-compatible
- That it has a `[functions.<name>]` entry in `supabase/config.toml` (missing = 401)

## Output Format
### Validated Assumptions
| # | Assumption | Status | Evidence |

### Missing Parent/Consumer Updates
| Modified File | Missing Consumer | What It Needs |

### File Name / Path Corrections
| Plan Says | Actually Is |

### Adjustments Required
[List specific changes needed to make the plan accurate]
```

### Step 4: Audit (with Security Checks)
Spawn an Explore subagent to audit:
```
Audit this implementation plan:

[paste plan from step 2]

Validation findings that need to be incorporated:
[paste validation results from step 3]

Check for:
- Reuse opportunities (existing hooks/utilities)
- Pattern alignment with existing code
- Anti-patterns
- Over-engineering
- Security considerations (RLS if DB changes)

## Security-Specific Checks (REQUIRED)

1. **Auth/Data Bypass** — For any endpoint that accepts status fields or IDs from the client:
   Can a user call the endpoint directly with fabricated data to skip validation?
   What server-side checks prevent this?

2. **Race Conditions on Shared State** — For any counter, flag, or status field modified
   by the plan: Are there OTHER code paths (existing edge functions, hooks, DB triggers)
   that also modify this same field? If so, are all paths atomic?

3. **Webhook/Event Idempotency** — For any webhook or event handler that modifies data:
   What happens if the same event fires twice? Will it double-count, double-charge, or
   corrupt state?

4. **Hardcoded Values vs Config** — Are there values in the plan (limits, fees, thresholds)
   that are hardcoded but should come from a configurable source (DB, env vars, tier config)?
   Check if the same values exist in multiple places that could drift.

5. **Data Exposure** — Do any new columns (especially payment identifiers, tokens, keys)
   get exposed to the frontend via existing select('*') queries?

Return: APPROVED or NEEDS CHANGES with specific, actionable recommendations.
For each recommendation, specify exactly what to change in the plan.
```

### Step 4.5: Explicit Select Audit

For any plan step that adds columns to a database table, spawn an Explore subagent:
```
# Explicit Select Audit

The plan adds these columns to these tables:
[list table + column additions from the plan]

For EACH table, search the entire codebase for:
supabase.from('<table_name>').select(

For each query found:
1. Does it use explicit column lists or select('*')?
2. If explicit: does it need the new column(s) added?
3. Report the file, line number, and whether it needs updating

Return:
### Queries to Update
| File | Line | Table | Current Select | Needs New Columns |
```

Add any missing select updates to the plan.

### Step 5: Apply Fixes and Compile Final Output
Based on validation (Step 3), audit (Step 4), and select audit (Step 4.5) results:

1. **Apply validation corrections** to the plan:
   - Fix any wrong file names/paths
   - Add missing parent/consumer updates
   - Correct any wrong assumptions

2. **Apply audit recommendations** to the plan:
   - For each "NEEDS CHANGES" recommendation, make the specific change
   - Update the Files Summary to reflect any new/changed files
   - Update the Implementation Order if dependencies changed
   - Add any new verification checklist items

3. **Apply select audit findings** to the plan:
   - Add select query updates to the appropriate batch

4. **Compile the final output** with ALL fixes applied:

```markdown
## Workflow Complete: Feature

### Codebase Context
[Key findings about existing patterns and reuse opportunities]

### Implementation Plan (FINAL — validated + audited)
[The corrected plan with all fixes applied]

### Files to Modify/Create
| File | Action | Description |
|------|--------|-------------|
| ... | Modify/Create | ... |

### Database Changes
[If any - otherwise "None"]

### Validation Results
[Summary: X confirmed, Y adjusted, Z corrected]

### Audit Results
[APPROVED or summary of changes applied]

### Verification Checklist
[Testing steps]

### Ready to Implement
[ ] Yes - proceed with implementation
[ ] No - needs [specific action]
```

IMPORTANT: Do NOT return a plan that says "NEEDS CHANGES" — apply the changes yourself
and return the corrected plan. The user should receive a ready-to-implement plan.

---

## Important Instructions

1. **Read project context first** — Step 0 is not optional. Pass that context into every subagent.
2. **Chain the subagents** — wait for each to complete before starting the next
3. **Pass context forward** — each step builds on previous findings
4. **Apply all fixes** — the final plan must incorporate validation corrections AND audit recommendations
5. **Be concise** — your final output should be actionable, not verbose
6. **Flag blockers** — if any step reveals a blocker, stop and report it
7. **Don't implement** — your job is to investigate, plan, validate, audit, and compile — not write code
```

---

## After Orchestrator Returns

The orchestrator will return a complete workflow summary with a validated and audited plan.

1. **If "Ready to Implement: Yes"** → proceed with `/implement`
2. **If "Ready to Implement: No"** → address the specific blocker mentioned
3. The plan should already have all audit fixes applied — no manual fix-up needed
