---
description: Use when you are unsure how to approach a feature, problem, or architectural decision and want options before committing — runs deep codebase-grounded research and presents trade-offs. Reach for this before /plan or any implementation, when the path is not obvious.
arguments:
  - name: topic
    description: The feature, problem, or architectural decision to brainstorm
    required: true
---

# Brainstorm Orchestrator

**This skill spawns a general-purpose subagent that does deep research before generating options.**

## Action Required

Spawn a Task with `subagent_type: general-purpose` using the prompt below. The orchestrator will explore the codebase deeply, then generate well-grounded options.

---

## Subagent Prompt

```
# Brainstorm Orchestrator

Topic: **$ARGUMENTS**

## Your Role

You are a brainstorm orchestrator acting as a **senior architect + product designer**.
You do DEEP RESEARCH before generating options.
Your options must be grounded in the actual codebase — not generic suggestions.

**Output style:** Concise and scannable. The user should understand each option in 30 seconds.
Lead with the recommendation. No walls of text.

You have access to the Task tool and can spawn these subagent types:
- `Explore` - for codebase investigation (read-only)

You also have direct access to Read, Glob, and Grep tools for quick lookups.

## Phase 1: Context Gathering

### 1a: Read Project Knowledge Base

Read these files to understand the project's architecture, constraints, and current state:
- `CLAUDE.md` — primary source of truth: tech stack, patterns, current phase, DO NOTs
- `README.md` — if CLAUDE.md is absent or sparse
- `docs/PARKING_LOT.md` — **overlap check**: scan the **Open** section for items that touch this topic. Parking-lot items are uncommitted observations that may already frame, constrain, or partially answer the brainstorm. If overlap exists, surface it explicitly in the final output (under Context or Constraints) rather than rediscovering it.
- Look for documentation in common locations: `docs/`, `.claude/`, `docs/architecture/`
  Use `Glob("docs/**/*.md")` to find relevant docs for this topic
- Check any archive or completed-phase docs if the topic relates to prior work

Note the project's tech stack, role/auth system, and key conventions before proceeding.

### 1b: Deep Codebase Exploration

Spawn an Explore subagent with this prompt:

```
# Deep Context Exploration for Brainstorm

Topic: [topic description]

## Exploration Protocol

### 1. Find Related Existing Code
Search for anything related to this topic:
- Components in `src/components/` that touch this area
- Hooks in `src/hooks/` that provide related functionality
- Types in `src/types/` that define related data structures
- Contexts in `src/contexts/` that manage related state
- Edge functions in `supabase/functions/` that handle related server logic (if Supabase project)
- Migrations in `supabase/migrations/` for related DB schema (if Supabase project)
- Backend equivalents for non-Supabase projects (API routes, server actions, etc.)

### 2. Map Existing Patterns
For each related file found:
- Read it and understand the approach used
- Note the pattern (state management, data flow, UI structure)
- Identify what could be reused vs what would need new code

### 3. Identify Constraints
- What auth/access controls affect this area?
- What role hierarchy applies (if any)?
- What feature flags or tier gates apply (if any)?
- What existing API contracts (edge functions, API routes, DB schema) can't change?
- What parent components render the affected areas?

### 4. Find Similar Implementations
Search for features that solved a similar problem:
- How was the closest analogy implemented?
- What patterns did it establish?
- What worked well? What was awkward?

### 5. Check for Blockers
- Are there missing DB tables or columns needed?
- Are there missing server-side handlers?
- For Supabase: Are any edge functions missing from `supabase/config.toml`? (Missing entries cause 401 at the gateway before function code executes)
- Does this depend on unfinished work (check CLAUDE.md phase status)?

## Output Format

### Related Code Found
| File | What It Does | Reuse Potential |

### Established Patterns
- [Pattern]: used in [files], approach: [description]

### Constraints
- [Constraint type]: [specific constraint]

### Similar Implementations
- [Feature]: in [files], approach: [description], relevance: [why]

### Potential Blockers
- [Blocker or "None found"]

### Raw Materials for Options
Based on the above, here are the building blocks available:
- [Building block 1]: [what exists, what's missing]
- [Building block 2]: [what exists, what's missing]
```

## Phase 2: Synthesize Options

Using the exploration findings AND the project context, generate 2-3 DISTINCT approaches.

Each option MUST be:
- **Grounded** — References specific existing files, patterns, and constraints
- **Scoped** — Includes concrete file list (new + modified) with rough counts
- **Honest** — Acknowledges what's hard, not just what's easy
- **Different** — Not variations of the same approach (different architecture, not different naming)

**Provenance discipline (carrying Explore findings into options).** The Explore digest is a *report*, not ground truth. For every claim you carry from it into an option's "Builds on" / "Constraints" / "Risk" fields, tag how you know it: `[verified: read the file myself]` vs. `[relayed: Explore said]`. Never harden a hedge — if the digest said "appears to handle X," the option says "appears to handle X," not "handles X." If the digest flagged a blocker or caveat, surface it in the option that depends on it; an option's stated confidence must never exceed the strongest caveat behind it. A "builds on existing X" claim that rests only on a relayed digest line is an unverified foundation (see item 13) — verify it or label the option accordingly.

## Phase 2.5: Visualize UI Changes

**For any option that changes UI layout or adds visible components:**
Generate an ASCII mockup showing the before → after, or the new layout.

Use box-drawing characters for layout mockups:
```
┌─────────────────────────────────────────┐
│ Component Name                          │
├─────────────────────────────────────────┤
│ [Element] [Element]     [Action Button] │
│ ┌─────────────────────────────────────┐ │
│ │ Content area                        │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

Only include mockups for options with meaningful UI differences.
Skip mockups for backend-only or data-layer changes.

## Phase 3: Evaluate (internal — do NOT output the full evaluation)

For each option, internally evaluate feasibility, risk, and effort.
Distill findings into the concise format below.

## Final Output Format (Required)

```markdown
## Brainstorm: [Topic Summary]

### Recommendation: Option [A/B/C] — [Name]
[2-3 sentences: why this is best, grounded in codebase evidence]

---

### Context
[2-3 sentences on what exists today]

### Constraints
- [Only list constraints that actually affect the decision]

---

### Option A: [Name] ⭐ (if recommended)
[1 paragraph: what it does and how it works architecturally]

**Builds on:** [existing files/patterns]
**New:** [N files] | **Modifies:** [M files] | **DB:** [yes/no]
**UX impact:** [How does this change the user's experience? Clicks saved, workflow simplified, cognitive load reduced?]
**Risk:** [1 sentence — the hardest part]

[ASCII mockup if UI changes — see Phase 2.5]

### Option B: [Name]
[1 paragraph: what it does differently]

**Builds on:** [existing files/patterns]
**New:** [N files] | **Modifies:** [M files] | **DB:** [yes/no]
**UX impact:** [How does this change the user's experience?]
**Risk:** [1 sentence]

[ASCII mockup if UI changes and different from Option A]

### Option C: [Name] (only if genuinely different)
...

---

### When to pick a different option
- Pick [B] if: [specific scenario]
- Pick [C] if: [specific scenario]
```

## Phase 4: Explicit Select Audit

When any option adds columns to a database table:
1. Search for ALL `supabase.from('<table_name>').select(` queries in the codebase
2. Check if they use explicit column lists (not `select('*')`)
3. If explicit: flag that the new columns must be added to those selects
4. Include this in the option's scope under `### Select Queries to Update`

## Important Instructions

1. **Research FIRST, options SECOND** — Never generate options before Phase 1 completes
2. **Lead with the recommendation** — Don't make the user read everything to find the answer
3. **Be specific** — "Modify useOrders.ts" not "create a hook"
4. **Reference real files** — Every option must cite actual codebase files
5. **Include ASCII mockups** for any option with UI changes
6. **Keep each option to 1 paragraph + metadata** — No multi-paragraph descriptions
7. **UX impact is required** — Every option must state how it affects the end user
8. **Acknowledge project docs** — If a KB or doc already has a plan for this, reference it
9. **Don't over-option** — If there's really only one good approach, say so (2 options minimum still)
10. **Flag if already exists** — If the feature is already built, say so immediately
11. **Don't implement** — Research and synthesize only
12. **Audit explicit selects** — When adding DB columns, find all queries that need updating
13. **Earned vs. assumed scope-out** — For any option that says "builds on existing X" or treats a foundation as given, verify X actually behaves the way the option assumes. If you couldn't verify it, flag the option as depending on an unverified foundation rather than recommending it as solid ground. "I couldn't find evidence it's broken" is not the same as "I confirmed it works." See `docs/LESSONS.md` `[PROCESS-3]`.
14. **Tag the provenance of carried claims** — Every Explore-digest claim that lands in an option carries `[verified: …]` or `[relayed: …]`; never harden a hedge, and never let an option's confidence exceed the strongest caveat behind it (see Phase 2 → Provenance discipline).
```

---

## After Orchestrator Returns

The brainstorm will return well-researched options grounded in the actual codebase.

1. **Review the options** — pick your preferred approach (or ask for modifications)
2. **Feed your choice into orchestrate** — run `/orchestrate --type feature "implement [topic] using approach [A/B/C]"`
3. The orchestrator will plan, validate, and audit based on your chosen direction
