---
description: Deep research into options and trade-offs before committing to an approach
arguments:
  - name: topic
    description: What to brainstorm - a feature, problem, or architectural question
    required: true
---

# Brainstorm

**Research-first thinking before planning. Run this before `/plan` when the approach isn't obvious.**

The goal is to produce grounded options — not generic advice, but options informed by what actually exists in this codebase and what patterns are already established.

## Instructions for Claude

Work through this process, then present a synthesized recommendation.

---

## Step 1: Read Project Context

Read `CLAUDE.md` and the relevant docs in `/docs/`:
- What patterns are already established?
- What tech stack is in use?
- What constraints apply (DO NOTs)?
- What's in scope vs. out of scope?

Also read these catalogs if they exist:
- `docs/KB_7_UI_Patterns.md` — Parts 2 and 3 (Component Catalog, Hook Catalog). Look for existing components or hooks that relate to the topic. The goal is to extend and reuse rather than build parallel.
- `docs/KB_9_Screen_Catalog.md` — Check whether a screen or modal serving a similar purpose already exists. Building on an existing surface is almost always better than creating a new one.

This is essential context. Brainstorm options must fit the existing project, not a generic version of it.

---

## Step 2: Explore the Codebase

Spawn an `Explore` subagent (subagent_type: "Explore", thoroughness: "very thorough") to investigate what's relevant to `$ARGUMENTS.topic`:

```
# Codebase Exploration for Brainstorm

Topic: **$ARGUMENTS.topic**

Explore the codebase to understand:

1. **What already exists** that's relevant — utilities, components, data structures, patterns
2. **How similar problems were solved** elsewhere in the codebase
3. **What the data model looks like** for the affected domain
4. **What constraints exist** — schema constraints, role restrictions, existing UI patterns
5. **What would need to change** across each potential approach

Be thorough. The goal is to give enough grounding that option recommendations are specific to THIS project, not generic.

Report: file paths, relevant code patterns, existing utilities, data shapes, constraints.
```

---

## Step 3: Research (if external context would help)

If the topic involves patterns, libraries, or approaches that benefit from broader context (not just the local codebase), use WebSearch to research:
- How others have solved this class of problem
- Trade-offs of common approaches
- Any known pitfalls

Keep research focused — 2–3 specific searches max.

---

## Step 4: Generate Options

Based on codebase exploration and research, define 2–4 concrete options. For each:

```markdown
### Option [N]: [Name]

**Approach:** [One paragraph describing what this actually looks like in this codebase]

**Fits existing patterns?** [Yes/No/Partially — which patterns does it follow or break?]

**Complexity:** [Low / Medium / High]

**Trade-offs:**
- Pro: [specific to this project]
- Pro: [specific to this project]
- Con: [specific to this project]
- Con: [specific to this project]

**What changes:** [List of files/systems that would be affected]
```

---

## Step 5: Synthesize and Recommend

Lead with the recommendation. Format:

```markdown
## Brainstorm: [Topic]

### Recommendation
**Go with Option [N]: [Name]**

[2–3 sentences on why — what makes this the right fit for this project specifically]

### Options Considered

[Option summaries here]

### Trade-offs to Be Aware Of
[Key tensions or constraints that should inform the decision — especially anything surprising from the codebase exploration]

### Next Step
If you agree with Option [N]:
- Create a spec doc in `/docs/[feature-name]-spec.md` with the full design
- Then run `/plan-review docs/[feature-name]-spec.md` to catch gaps before implementing
- Or go straight to `/plan "[topic]"` for simple, well-understood features
```

---

## Important Rules

1. **Lead with the recommendation** — don't make the user read through all options to find the answer
2. **Be specific to this project** — generic options that ignore the codebase are not useful
3. **Scannable format** — options should be comparable at a glance
4. **Flag unified model opportunities** — if options include an adapter/translator between contexts, flag this as an anti-pattern and recommend a single normalized type instead
5. **Don't design for hypotheticals** — recommend what fits the current scope, not what would be nice in 2 years
