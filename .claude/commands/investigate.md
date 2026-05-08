---
description: Deep codebase investigation — trace data flows, find all usages, identify root causes
arguments:
  - name: issue
    description: Description of the issue or feature area to investigate
    required: true
  - name: component
    description: Specific component, hook, function, or file to start from (optional)
    required: false
---

# Investigation Subagent

**IMPORTANT: This command spawns a subagent to protect main context.**

## Action Required

Spawn a Task with `subagent_type: Explore` using the prompt below.

---

## Subagent Prompt

```
# Codebase Investigation

Investigate: **$ARGUMENTS** (the full argument string — issue description, optionally with focus area)

## CRITICAL INSTRUCTIONS

Be extremely thorough. Do NOT stop at the first potential issue. Follow ALL paths.

## Investigation Protocol

### 1. Read Project Context First

Read `CLAUDE.md` to understand the project's patterns, conventions, and constraints before diving into code.

Also read `docs/LESSONS.md` if it exists. Before diving into the investigation, check whether the symptom matches any known gotcha category. If it does, note the match — recurrence debugging wastes time that a known fix prevents.

### 2. Trace the Full Data Flow

Start at the entry point (UI, API endpoint, event handler) and follow through each layer:

```
Entry → Handler → Service/Hook → Data Access → Storage
```

For each step, identify:
- What data is passed?
- What transformations occur?
- Where could data be lost or modified incorrectly?

### 3. Find All Usages

Search for ALL places the function/component/API is called:
- Use Grep to find all occurrences
- Check for duplicate implementations (same logic in multiple places)
- Look for dead code that looks correct but isn't connected (not routed, not imported)
- Multiple components/modules that do similar things with different callbacks

### 4. Verify Routing/Wiring

Confirm which code is actually executing at the relevant path:
- Which component renders at this route?
- Which handler processes this event?
- Which module is actually being imported?

**This is critical** — the code you're reading might not be the code that's running.

### 5. Trace All Parent/Consumer Relationships

For EACH component, hook, or function involved:
- **Components:** Find every parent that renders it
- **Functions/hooks:** Find every caller
- **APIs/services:** Find every client that calls them
- **Shared state (DB, store, context):** Find ALL code that reads or writes that state

### 6. Check for Reusable Patterns

Before recommending new code:
- Search for existing utilities that solve a similar problem
- Search for components with similar UI patterns
- Search for services/hooks with similar data access patterns
- Flag anything that already exists and could be extended vs. creating something new

## Output Format (Required)

```markdown
## Investigation: [Issue Description]

### Data Flow Trace
[Entry Point] → [Handler] → [Service] → [Data Access]

### All Usages Found
| Location | File:Line | Notes |
|----------|-----------|-------|
| Usage 1  | file.ts:123 | Primary path |
| Usage 2  | other.ts:456 | Also calls this |

### Parent/Consumer Map
| Code | Consumers | File:Line |
|------|-----------|-----------|
| MyComponent | PageA, PageB | pageA.tsx:45, pageB.tsx:123 |

### Routing/Wiring Verification
- Active code path: [what is actually running]
- Dead code identified: [if any]

### Reusable Patterns Found
| Existing Code | Location | Could Solve |
|--------------|----------|-------------|
| [utility name] | file.ts:line | [what problem] |

### Root Cause / Gap
**File:** `path/to/file.ts:line`
**Issue:** [Specific description]

### Recommended Fix/Approach
[Specific change needed — file and line if known]
```

## Red Flags to Report

| Symptom | Likely Cause |
|---------|-------------|
| Expected logs don't appear | Wrong code path — find the actual file being run |
| Fix doesn't take effect | Code you edited isn't the code being executed |
| Multiple similar components | Check which one is actually mounted at the relevant route |
| Code looks correct but behavior is wrong | May be dead code — verify imports and routing |
```

---

## After Subagent Returns

1. Root cause identified → run `/plan` for implementation planning
2. Need more context → ask user or run again with narrower focus
