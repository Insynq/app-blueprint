---
description: Implement a validated plan by spawning parallel implementer agents
arguments:
  - name: scope
    description: What to implement - "all", "next", phase name (e.g., "Phase 3"), or step range (e.g., "1-3")
    required: false
---

# Implementation Orchestrator

**IMPORTANT: This command spawns subagents to protect main context.**

## Action Required

Spawn a Task with `subagent_type: general-purpose` using the prompt below.

---

## Subagent Prompt

```
# Implementation Orchestrator

{{#if scope}}Scope: **$ARGUMENTS.scope**{{/if}}
{{#unless scope}}Scope: **all**{{/unless}}

## Your Role

You are an implementation orchestrator. You take a validated plan and execute it by:
1. Reading and understanding the plan + project context
2. Breaking it into dependency-ordered batches
3. **Verifying schemas and data before writing code** (CRITICAL)
4. Implementing each batch (parallel where possible)
5. **Running a post-batch audit after each batch** (CRITICAL — catches bugs before they compound)
6. Fixing audit findings before proceeding to next batch
7. Final build verification
8. Reporting results

You have access to: Agent (general-purpose subagents), Read, Edit, Write, Bash, Glob, Grep tools.

## Step 0: Read Project Context

Read `CLAUDE.md` FIRST. Extract:
- Tech stack and frameworks in use
- Build commands (type check, build, test)
- Project patterns and conventions
- DO NOT list — hard constraints to never violate

Key questions to answer from CLAUDE.md:
- What is the type check command? (run after each batch)
- What is the build command? (run at the end)
- What database/ORM is in use? (informs migration handling)
- What are the established code patterns?

Also read `docs/LESSONS.md` (if it exists). Skim for entries relevant to the areas being implemented — UI components, data queries, integrations, DB schema. Known gotchas in LESSONS.md are cheaper to avoid than to debug after the fact.

## Step 1: Find and Read the Plan

Look for the plan in these locations (in order):
1. `docs/*.md` spec docs referenced in the prompt
2. The most recent `.claude/plans/*.md` file
3. KB docs referenced in the prompt

Read the plan file and extract:
- The ordered list of implementation steps
- Files to create (NEW) and modify (MODIFY)
- Dependencies between steps

If the plan cannot be found, STOP and report: "Could not find plan."

## Step 2: Determine Scope

- If "all": implement every step in order
- If "next": find the first unimplemented step and implement just that one
- If phase name (e.g., "Phase 3"): implement only that phase
- If step range (e.g., "1-3"): implement only those steps

## Step 3: Create Dependency Batches

Group steps into batches:
- Steps within a batch have NO dependencies on each other
- Each batch completes before the next starts
- Database migrations are ALWAYS batch 1 (if applicable)
- Types/interfaces before the code that uses them
- Data access layers before UI components
- UI components before route wiring

## Step 4: Pre-Implementation Verification (CRITICAL — DO NOT SKIP)

**Before writing ANY code, verify your assumptions against the actual codebase.**

### 4a: Schema/Data Verification
For any code that references existing database columns, API shapes, or data structures:
- **Read the source** — the migration, schema file, or type definition
- **List the actual field names** and compare against what you plan to write
- If any mismatch: fix BEFORE writing code

### 4b: Seed/Fixture Data Verification
For any code that references existing data by name or ID:
- **Read the source** — the seed file, fixture, or migration that created it
- **Match EXACTLY** — similar names are wrong names

### 4c: Select/Query + Transform Verification
For any code that fetches data and maps it to a type:
- **Find the transform/mapping function** that converts raw data to the TypeScript/app type
- **Plan to update BOTH** the query AND the transform together
- **Check ALL files** with similar query patterns — they may all need the same update

### 4d: Integration Flow Verification
For any new service layer, API call, or data access:
- **Trace the full call chain**: UI → hook/service → API/DB
- **Verify the calling code actually calls the right abstraction** (not a lower layer that bypasses validation)

## Step 5: Implement Each Batch

For each batch:

### 5a: Pre-flight Check
Verify files exist at expected paths. Read first few lines to confirm they match plan assumptions.

### 5b: Implement

**For NEW files:** Use Write tool.

**For MODIFIED files:**
1. Read the FULL file first
2. Make specific changes using Edit tool
3. Verify the edit was applied correctly

### 5c: Parallel Implementation
If a batch has 2+ independent files, spawn parallel `general-purpose` subagents with this prompt template:

```
# Implement: [file description]

## Task
[Specific changes for this file]

## Pre-Implementation Checks
Before editing, read and verify:
- [Specific things to verify for this file]

## File
Path: [file path]
Action: [CREATE or MODIFY]

## Instructions
- Read the file first (if MODIFY)
- Apply exact changes described
- Use Edit tool for modifications

## What NOT to Do
- Don't modify other files
- Don't add features beyond the plan
- Don't refactor surrounding code
```

### 5d: Post-Batch Type Check
After each batch, run the project's type check command from CLAUDE.md.
Fix type errors before continuing.

If type errors persist after 2 fix attempts:
- **STOP. Do not proceed to the next batch.**
- Report the errors to the user with exact file paths and line numbers
- Ask: "These type errors couldn't be auto-fixed. Do you want to (1) fix them manually and re-run, (2) skip this batch and continue, or (3) abort?"
- Do not continue until the user explicitly chooses an option

### 5e: Post-Batch Audit (CRITICAL — DO NOT SKIP)

After each batch passes the type check, spawn a `general-purpose` audit agent:

```
# Post-Batch Audit

Batch [N] just implemented [description of what was done].

## Files Changed
[List all files created or modified in this batch]

## Your Task

Read EVERY changed file in full. Audit for:

1. **Correctness**: Do queries match actual data shapes? Is the logic correct?
2. **Regressions**: Could these changes break existing behavior? Are all existing code paths still functional?
3. **Edge cases**: Empty arrays, null values, zero quantities, single items, concurrent operations
4. **Type safety**: Are all new optional fields handled safely (null checks, fallbacks)?
5. **Security**: Auth checks in place? Sensitive data not exposed? Input validation at boundaries?
6. **Downstream compatibility**: Will this work with what's being built in the next batch?

Categorize findings as:
- **BUG**: Must fix before proceeding
- **CONCERN**: Should discuss — architectural question or design decision needed
- **NOTE**: Awareness item — no action needed now

Include exact file paths and line numbers for BUGs and CONCERNs.
```

### 5f: Fix Audit Findings
1. **BUGs**: Fix all immediately. Re-run type check after fixes.
2. **CONCERNs that are clear fixes**: Fix them.
3. **CONCERNs that need decisions**: Report to user — these are the only items that should pause implementation.
4. **NOTEs**: Acknowledge and continue.

Only proceed to the next batch after all BUGs are fixed and the type check passes.

## Step 6: Post-Implementation Checks

### 6a: Query + Transform Completeness
For every file where you added fields to a query/select:
- Find the transform/mapping function
- Verify EVERY new field is mapped in the transform
- If any are missing, fix immediately

### 6b: Integration Wiring
For every new API call or service function:
- Find the calling code
- Verify it calls the right layer

### 6c: Full Build
Run the project's build command from CLAUDE.md.

## Step 7: Summary Report

```markdown
## Implementation Complete

### Batches Completed
| Batch | Steps | Files | Audit Result | Status |
|-------|-------|-------|--------------|--------|
| 1 | ... | ... | N BUGs fixed | ✅ |

### Files Created
| File | Purpose |

### Files Modified
| File | Changes |

### Build Status
- Type check: ✅ Clean / ⚠️ [N] errors
- Build: ✅ Clean / ⚠️ [N] errors

### Outstanding Issues (if any)
[Issue and suggested fix]
```

## MANDATORY Rules

1. **NEVER guess field/column names** — read the source first
2. **NEVER add fields to a query without updating the transform**
3. **NEVER skip the post-batch audit**
4. **ALWAYS read CLAUDE.md before starting**
5. **ALWAYS run type check after each batch**
```

---

## After Orchestrator Returns

1. **All batches succeeded + audits clean** → ship when ready
2. **Audit found CONCERNs needing decisions** → resolve with user before shipping
3. **Build errors remain** → fix specific errors reported
4. **Verification failed** → re-read source schemas and fix mismatches
