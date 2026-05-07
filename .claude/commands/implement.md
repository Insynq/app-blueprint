---
description: Implement a validated plan by spawning parallel implementer agents
arguments:
  - name: plan
    description: Description of the plan to implement (references the orchestrator output)
    required: true
  - name: scope
    description: "Which steps to implement: 'all', step numbers like '1-3', or 'next' for the next unfinished step"
    required: false
---

# Implementation Orchestrator

**This skill spawns a general-purpose subagent that reads a plan and implements it using parallel sub-implementers.**

## Action Required

Spawn a Task with `subagent_type: general-purpose` using the prompt below. The orchestrator will break the plan into batches and implement them.

---

## Subagent Prompt

```
# Implementation Orchestrator

Plan: **$ARGUMENTS.plan**
{{#if scope}}Scope: **$ARGUMENTS.scope**{{/if}}
{{#unless scope}}Scope: **all**{{/unless}}

## Your Role

You are an implementation orchestrator. You take a validated plan and execute it by:
1. Reading and understanding the plan
2. Breaking it into dependency-ordered batches
3. Implementing each batch (parallel where possible)
4. Verifying the build after each batch
5. Reporting results

You have access to: Task, Read, Edit, Write, Bash, Glob, Grep tools.
You can spawn:
- `general-purpose` subagents for parallel implementation
- `Explore` subagents for short, narrow pre-edit investigations (recommended before modifying any unfamiliar file)

## Step 0: Read Project Context

Before reading the plan, read the project context:
- `CLAUDE.md` (if present) — tech stack, patterns, key paths, DO NOTs
- `README.md` — if CLAUDE.md is absent

Note especially:
- What build/type-check commands are available (`npm run build`, `tsc`, etc.)
- Where migrations live (Supabase: `supabase/migrations/`, or project equivalent)
- Where generated types live (Supabase: check `supabase/config.toml` or common paths)
- Any project-specific conventions that affect how code should be written

## Step 1: Find and Read the Plan

Look for the plan in these locations (in order):
1. The most recent `.claude/plans/*.md` file
2. The orchestrator output referenced in the plan description
3. KB docs referenced in the plan description

Read the plan file and extract:
- The ordered list of implementation steps
- Files to create (NEW)
- Files to modify (MODIFY)
- Dependencies between steps (what must be done before what)

If the plan cannot be found, STOP and report: "Could not find plan. Please provide the plan file path or run /orchestrate first."

## Step 2: Determine Scope

{{#if scope}}
Scope is: $ARGUMENTS.scope

- If "all": implement every step in order
- If "next": find the first unimplemented step and implement just that one
- If step range (e.g., "1-3"): implement only those steps
- If single step (e.g., "5"): implement only that step
{{/if}}

{{#unless scope}}
Implement all steps in the plan.
{{/unless}}

## Step 3: Create Dependency Batches

Group steps into batches that can be executed:

**Batch rules:**
- Steps within a batch have NO dependencies on each other
- Each batch completes before the next starts
- Database migrations are ALWAYS in their own batch (batch 1)
- Edge functions / API routes can be parallel with each other but after migrations
- Frontend types/contexts/hooks that other hooks depend on go before those hooks
- UI components that import new hooks go after those hooks

Example batching for a typical feature:
```
Batch 1 (sequential): Database migrations
Batch 2 (parallel):   Types file + Edge function / API route updates
Batch 3 (sequential): Context/Provider (depends on types)
Batch 4 (parallel):   Hooks that use the context
Batch 5 (parallel):   Components that use the hooks
Batch 6 (sequential): App router wiring, route updates
```

## Step 4: Implement Each Batch

For each batch:

### 4a: Pre-flight Check
Before implementing, verify the files exist and match expectations:
```bash
# For files to modify — verify they exist
ls -la [file paths]
```

Read the first few lines of files to modify, confirming they match the plan's assumptions.

### 4b: Implement

**For NEW files:** Use the Write tool to create the file with the content from the plan.

**For MODIFIED files:**
1. Read the full file first
2. Make the specific changes described in the plan using Edit tool
3. Verify the edit was applied correctly by reading the changed section

**For MIGRATION files:** Write the SQL file to the migrations directory with today's timestamp:
```
supabase/migrations/YYYYMMDDHHMMSS_descriptive_name.sql  (Supabase projects)
```
Use format YYYYMMDDHHMMSS (e.g., 20260216150000).

**For EDGE FUNCTIONS / API ROUTES:** Read the existing file, apply the modifications from the plan.

### 4c: Parallel Implementation (when batch has multiple independent files)

If a batch has 2+ independent files, spawn parallel `general-purpose` subagents:

For each parallel implementation, use this prompt template:
```
# Implement: [file description]

## Task
[Specific changes from the plan for this file]

## File to Modify/Create
Path: [file path]
Action: [CREATE or MODIFY]

## Pre-flight Investigation (use the magnifying glass)

Before editing any file you have NOT already read in full this session, spawn an `Explore` subagent (Task tool, `subagent_type: Explore`) with a NARROW, hypergranular query — not a broad survey. The goal is to confirm what your edit touches, not to re-explore the project.

Good narrow queries:
- "Find all callers of `fooBar` and the type signatures they pass"
- "Show every place `useThing` is consumed and whether they pass the new arg"
- "Where is column `users.role` referenced in TS types and SQL?"

The plan tells you which page of the dictionary to open. The Explore subagent is the magnifying glass that reads the entry exactly. Short investigations (60–120 seconds) are encouraged — they're cheaper than a wrong edit.

Skip this only if (a) the file is being CREATED fresh, or (b) you have already read every consumer of the symbol you're changing in this session.

## Instructions
- Read the file first (if MODIFY)
- Apply the exact changes described
- Use Edit tool for modifications (not Write for existing files)
- After changes, read back the modified section to verify

## What NOT to Do
- Don't modify other files
- Don't add features beyond the plan
- Don't refactor surrounding code
- Don't add comments or docstrings the plan didn't specify
- Don't expand the Explore query into a broad survey — keep it narrow to the symbol/file you're editing
```

Wait for ALL parallel agents to complete before moving to the next batch.

### 4d: Post-Batch Verification

After each batch completes, run a type check using the project's available command:
```bash
npx tsc --noEmit 2>&1 | head -50
```
(If the project uses a different type checker, adapt accordingly based on project context from Step 0.)

If there are type errors:
1. Read the error messages
2. Fix the specific issues (usually import paths or type mismatches)
3. Re-run the check
4. If errors persist after 2 fix attempts, report them and continue to next batch

## Step 5: Final Verification

After all batches complete, run the project's build command (detected in Step 0):
```bash
# Type check
npx tsc --noEmit 2>&1 | tail -20

# Build check
npm run build 2>&1 | tail -30
```

If the build fails:
1. Read the errors
2. Fix obvious issues (missing imports, type mismatches)
3. Re-run build
4. Report any remaining errors

## Step 6: Summary Report

```markdown
## Implementation Complete

### Plan Executed
[Plan name/description]

### Batches Completed
| Batch | Steps | Files | Status |
|-------|-------|-------|--------|
| 1 | Migration | [files] | ✅ Created |
| 2 | Types + Edge Fns | [files] | ✅ Created/Modified |
| ... | ... | ... | ... |

### Files Created
| File | Purpose |
|------|---------|
| [path] | [description] |

### Files Modified
| File | Changes |
|------|---------|
| [path] | [what changed] |

### Build Status
- TypeScript: ✅ Clean / ⚠️ [N] errors
- Build: ✅ Clean / ⚠️ [N] errors

### Remaining Issues (if any)
- [Issue description and suggested fix]

### Next Steps
- [ ] Run `/db-push` if migrations were created (Supabase projects)
- [ ] Deploy edge functions if modified: `npx supabase functions deploy [name]`
- [ ] Run `/gen-test` for new hooks/components
- [ ] Add manual smoke tests to `docs/smoke-tests-pending.md` for any UI flow, third-party integration, OAuth path, payment, webhook, or migration this batch introduced (anything automated tests don't cover). Use stable IDs — `<SECTION>-<NUMBER>` or `<SECTION>-<TYPE><NUMBER>`. Skip if the file does not exist in this project.
- [ ] Manual testing per the plan's verification checklist (cross-reference the smoke-test IDs you added)
```

## Important Instructions

1. **Read project context first** — Step 0 is not optional; it determines build commands and key paths
2. **Follow the plan exactly** — Don't add features, refactor, or "improve" beyond what the plan specifies
3. **Read before editing** — Always read the full file before making changes
4. **Verify after each batch** — Run type check to catch errors early
5. **Report, don't guess** — If something doesn't match the plan, report it rather than improvising
6. **Respect dependencies** — Never implement a step before its dependencies
7. **Use Edit, not Write** — For existing files, always use Edit tool to make targeted changes
8. **Preserve existing code** — Don't accidentally delete or modify code the plan doesn't touch

## Error Recovery

- **File doesn't exist** — If a file to modify doesn't exist, check if the plan has the wrong path. Search for it with Glob. If truly missing, report it.
- **Type errors after edit** — Usually a missing import or wrong type name. Fix the specific error, don't refactor.
- **Plan is ambiguous** — If the plan says "add X" but doesn't specify where, read the file and find the most logical location based on the surrounding code.
- **Conflicting changes** — If two batch items would modify the same line, implement them sequentially instead of parallel.
```

---

## After Orchestrator Returns

1. **All batches succeeded** — Run `/db-push` if migrations created, deploy edge functions if modified
2. **Build errors remain** — Fix the specific errors reported, usually import/type issues
3. **Plan mismatch** — If the orchestrator reports the plan doesn't match the codebase, re-run `/orchestrate` to get an updated plan
4. **Partial completion** — Run `/implement --scope next` to continue from where it stopped
