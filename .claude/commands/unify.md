---
description: Identify similar or duplicate components and design a unified replacement
arguments:
  - name: description
    description: Description of the duplication problem (e.g., "5 components all showing order status to different roles")
    required: true
---

# Unify

**For when similar components have accreted. Design the unified replacement before touching any code.**

Built on the core principle: one normalized type + one component beats N nearly-identical components + N translators. Components accrete because each new flow gets a new component — this command audits the damage and designs the consolidation.

**Output:** A spec document for `/implement`. This command produces only the spec — no code.

## Action Required

Spawn a Task with `subagent_type: general-purpose` using the prompt below.

---

## Subagent Prompt

```
# Unify Agent

Problem: **$ARGUMENTS.description**

## Your Role

You are an architect specializing in component consolidation. Your job is to:
1. Find all similar/duplicate components
2. Inventory what they share vs. how they differ
3. Design a unified component with a normalized data type
4. Produce a spec document for `/implement` to execute

Do NOT write any component code. Produce only the spec.

## Step 0: Read Project Context

Read `CLAUDE.md` to understand:
- Tech stack and component library in use
- Role/permission model (role-aware rendering is usually a key dimension)
- Unified model preference — one normalized type beats adapters/translators
- Any hard constraints (DO NOTs)

Read `docs/KB_7_UI_Patterns.md` to understand:
- Established modal/overlay conventions
- Existing catalog entries that may inform the design
- Any architecture decisions relevant to this consolidation

## Step 1: Find All Similar Components

Spawn an `Explore` agent (thoroughness: "very thorough") with this prompt:

```
# Component Discovery

Problem: [description of duplication]

Find every component that overlaps with this description. For each:

1. File path and approximate line count
2. Which role(s) use it (agent, vendor, admin, etc.)
3. Entry point — where is it rendered or triggered from?
4. Data shape it receives (props interface or hook it calls)
5. Actions it exposes (buttons, callbacks, what state it changes)
6. Status/state variations — which render paths exist inside it?
7. Any shared hooks or utilities it uses

Also find:
8. Any types/interfaces that define the data it works with
9. Any notification or side-effect logic that must be preserved
10. Any known bugs or tech debt flagged in comments or TODOs

Report with exact file paths and line numbers for key sections.
```

## Step 2: Build the Component Inventory

From the Explore findings, build a table:

| Component | Role | ~Lines | Entry point | Data shape | Actions |
|-----------|------|--------|-------------|------------|---------|

Then identify:

**Shared across all components:**
- Data fields every component displays
- Visual sections every component renders
- Behavior every component has

**What differs by role:**
- Data fields only some roles see
- Actions only some roles can take
- Sections that are role-gated

**What differs by state/status:**
- Sections that appear only in certain states
- Actions that appear only at certain lifecycle stages

## Step 3: Design the Normalized Data Type

If multiple different data shapes feed into the similar components (common when agent-side and vendor-side components handle the same domain), define a single normalized type:

- Pick the primary/most complete data shape as the canonical one
- Use its field names as the standard (minimizes transform work)
- Add optional fields for data only some sources provide
- Produce a field map table:

| `NormalizedType` field | TS type | Source A transform | Source B transform | Notes |
|------------------------|---------|-------------------|-------------------|-------|

Include transform function signatures:
- `toNormalizedType(sourceA: SourceAType): NormalizedType`
- `toNormalizedTypeFrom[SourceB](sourceB: SourceBType): NormalizedType`

If all components already receive the same data shape, skip the transform design.

## Step 4: Design the Unified Component

### Props Interface
What the unified component accepts:
- Normalized data type (designed in Step 3, or the existing shared type)
- Role indicator (to gate actions and sections)
- Required callbacks (for actions that must delegate to parent context — don't re-implement them)
- Open/close control (if it's a modal)

### Role-Aware Section Map
Table: which sections each role sees

| Section | Role A | Role B | Role C |
|---------|--------|--------|--------|

### State-Aware Section Map
Table: which sections appear in each status/state

| Section | State 1 | State 2 | State 3 |
|---------|---------|---------|---------|

### Tab Structure (if applicable)
How multi-section content is organized.

### Callback Contracts
For any action that triggers side effects (notifications, audit logs, external API calls):
- Identify the existing function that handles it
- The unified component CALLS that function — it does not re-implement the logic
- Document the function signature and which file it lives in

## Step 5: Identify Migration Constraints

For each component being replaced:
1. Is there notification/audit/side-effect logic that must be preserved? Name the function and file.
   (Check: services/, hooks/, API handlers, and utils/ directories. Name the function and its file path.)
2. Is there a known bug the migration should fix? Describe it.
3. What's the safest migration order? (Which component can be replaced first with lowest blast radius?)

## Step 6: Write the Spec Document

Write to `docs/[unified-component-name]-spec.md`:

```markdown
# Unified [ComponentName] — Scope Plan
**Status:** Ready for plan-review

## Problem

| Component | Role | ~Lines | Entry point |
|-----------|------|--------|-------------|

[1-2 sentences on maintenance cost, bug surface, inconsistency caused by the current state]

## Goal

[One paragraph: what the unified component will be — role-aware, status-aware, one normalized type, single source of truth for this domain]

## Normalized Data Type

### `[TypeName]` field map

| Field | TS type | [Source A] transform | [Source B] transform | Notes |
|-------|---------|---------------------|---------------------|-------|

### Transform functions
- `toTypeNameFrom[SourceA](source: SourceAType, context?: ContextType): TypeName`
- `toTypeNameFrom[SourceB](source: SourceBType): TypeName`

## Role-Aware Section Map

| Section | [Role A] | [Role B] | [Role C] |
|---------|----------|----------|----------|

## State-Aware Section Map

| Section | [State 1] | [State 2] | [State 3] |
|---------|-----------|-----------|-----------|

## Migration Constraints

1. [Function/logic that must be preserved — name and file]
2. [Bug to fix during migration]
3. [Recommended migration order and rationale]

## Implementation Phases

### Phase 1 — [First role or safest entry point]
**Files to create:**
- `src/types/[name].ts` — normalized type + transform functions
- `src/components/[path]/[ComponentName].tsx` — unified component
- [any new hooks needed]

**Files to modify:**
- [entry points that will use the new component]

**Files to retire (after Phase 1 verified):**
- [components replaced by this phase]

### Phase 2 — [Second role or entry point]
[Same structure]

## What This Does NOT Change

[Explicit list: what's out of scope, what stays as-is, what's deferred]
```

## Step 7: Report

Summarize:
- N components found, ~X total lines replaced by one unified component
- Key design decisions made (normalized type, tab structure, callback contracts)
- Path to the spec doc
- Recommended next step
```

---

## After Subagent Returns

1. **Review the spec carefully** — especially the normalized type field map and the role/state section maps. These are the decisions that determine implementation quality.
2. **Run `/plan-review docs/[name]-spec.md`** → catch any data gaps or edge cases before implementation
3. **Run `/implement docs/[name]-spec.md`** → execute phase by phase
4. **After shipping: add the unified component to `docs/KB_7_UI_Patterns.md`** → update the catalog so future work references it instead of building something new
