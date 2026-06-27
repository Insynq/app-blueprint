---
description: Use when you have a spec or plan doc and want to catch gaps, missing decisions, and risks before building. Reach for this after /brainstorm or /plan and before /implement.
arguments:
  - name: spec
    description: Path to the spec document to review (e.g., "docs/my-feature-spec.md")
    required: true
---

# Plan Review

## When to use /plan-review vs. /plan
- Use `/plan-review` **when you have a spec or design doc** — it audits the doc for gaps, missing decisions, and risks
- Use `/plan` **after `/investigate`** — when you have investigation findings and need to structure them into a plan
- Quick rule: `/plan-review` is pre-implementation QA on an existing plan; `/plan` creates the plan

**Pre-implementation gap analysis. Run this BEFORE `/implement` to catch design issues early.**

## Action Required

1. Read the spec thoroughly
2. Spawn **3–5 parallel Explore agents** to investigate all areas the spec touches
3. Synthesize findings into a gap analysis
4. Present grouped findings to the user for decisions

---

## Step 1: Read the Spec

Read `$ARGUMENTS` (the spec doc path) in full. Extract:
- Every file, table, schema, type, component, and service referenced
- Every new entity being created
- Every existing entity being modified
- The implementation order / phases
- Any assumptions about current behavior

Also read `CLAUDE.md` to understand project patterns and constraints.

## Step 2: Launch Parallel Investigations

Spawn 3–5 `Explore` agents (thoroughness: "very thorough") covering:

**Agent 1 — Data layer**: Read every data schema, migration, or data model the spec touches or depends on. Report exact field names, types, constraints, and relationships. Identify what exists vs. what the spec assumes exists.

**CRITICAL — full-table/schema audit requirement:** When the spec extends an existing data model for a new use case, DO NOT just check the parts the spec mentions. For each touched model, audit ALL of the following:
- Every constraint on every field the new use case will write to
- Every access control policy or permission check on the model (SELECT, INSERT, UPDATE, DELETE equivalents)
- Every unique or foreign key constraint that the new use case might violate
- Every trigger, hook, or side effect that might fire on the new write pattern

This is a real failure mode: auditing one constraint while missing others on the same model. Always read the full model definition.

**Agent 2 — Application layer**: Read every service, hook, context, and state management file the spec references. Report query shapes, transform functions, type interfaces. Identify gaps between what the spec expects and what's actually there.

**Agent 3 — UI components**: Read every component the spec touches. Report props, state, event handlers, rendering logic. Identify where new features need to integrate.

**Agent 4 — API/integration layer**: Read every API endpoint, server function, webhook handler, or external integration the spec involves. Report the current contract, validation, error handling.

**Agent 5 (if needed) — End-to-end flows**: Trace flows that the spec modifies from entry to storage. Report the full sequence and identify where the spec's changes intersect with existing behavior.

Each agent should report **exact file paths, line numbers, and code snippets** for everything relevant.

## Step 3: Synthesize Findings

Analyze combined findings against the spec.

### 3a: Verification Discipline (read first — gates the rest)

Scan the spec for every assumption labeled "out of scope," "existing behavior preserved," "verifiable later," "separate concern," "trust the system," or any phrase that defers a check to later. For each one, classify it as **earned** or **assumed**:

- **Earned scope-out** = "I confirmed X works; we can build on top of it." (engineering)
- **Assumed scope-out** = "I couldn't confirm X; let's build on top anyway." (hope wearing engineering's clothes)

Watch for the warning sign: a verification that keeps resisting clean answers. If the spec (or your own thinking) rephrases the same question into progressively softer forms — `"does X fire?"` → `"does X fire somewhere?"` → `"is existing behavior preserved?"` → `"trust the system?"` — that resistance IS the answer. Don't shrink the question until it's tractable; expand the investigation until it can actually be answered.

Two supporting rules:

1. **Treat "I couldn't find X" as a fact about your search, not about reality.** When grep doesn't show something, ask "what kind of thing does grep miss?" — not "this must not exist."
2. **Domain-owner intent is verification-grade data.** If the user has stated "this was working before," that's a load-bearing claim — flip your posture from "probably fine" to "probably broken until I prove otherwise."

For every flagged item: either VERIFY now (and mark as earned in your findings) or list it as a **GAP** or **RISK** that implementation depends on. Pause cost is almost always less than retrofit cost.

See `docs/LESSONS.md` `[PROCESS-1]` for the full incident behind this rule.

### 3b: Missing Pieces
- Does the spec reference fields/types/components that don't exist and aren't in the creation plan?
- Does the spec assume behavior that doesn't match the current implementation?
- Are there files the spec should modify but doesn't mention?
- For every existing model the spec extends: does the plan cover ALL constraints the new use case touches?

### 3c: Event-Driven Side Effects

For every notification, email, webhook, audit log entry, or any other side effect triggered by a state change:
- **Find ALL callsites** that write the triggering state — not just the most visible one
- Common trap: a manual action triggers the side effect, but an automated or programmatic path that writes the same state does not
- Search strategy: grep for every place that writes the triggering status value (client-side mutations, RPC calls, server-side triggers/functions)
- Flag any side effect wired to only one callsite when multiple exist

**Why this matters:** Missing a trigger path means the side effect silently never fires for certain code paths. The happy-path test usually exercises the obvious callsite and misses the rest. This is especially common with order status changes, payment completions, and approval flows — each often has both a manual admin path and an automated completion path.

### 3d: Architectural Gaps
- Does the spec define a data model change without updating all consumers?
- Are there security/auth implications not addressed?
- Are there audit trail or logging requirements not covered?
- Does the spec introduce an adapter/translator between contexts? Flag as anti-pattern — recommend unified type instead.

### 3e: Edge Cases
- What happens with empty data (0 items, null values)?
- What happens at boundaries (single item, maximum values)?
- What happens with concurrent operations (race conditions)?
- What happens when the user refreshes mid-flow?

### 3f: Decision Points
- Where does the spec leave ambiguity that needs a choice?
- Where are there multiple valid approaches and the spec picked one without justification?
- Where might business requirements conflict with the technical approach?

Examples of decision points worth flagging: component library choice for a new UI surface, API contract design for a new endpoint, error handling granularity (silent vs. user-visible), state management approach (local vs. global). These are cases where multiple approaches are valid and the spec should justify the choice — not leave it to implementation time.

### 3g: Dependency Risks
- Which phases have tight dependencies that could cascade failures?
- Which changes are hard to reverse once shipped?
- What's the critical path?

## Step 4: Present Findings

Group related findings into **review items** (A, B, C, ...). For each:
- Brief overview of the issue
- Options that need a decision (if any)
- Recommendation

Categorize each:
- **GAP**: Something the spec doesn't cover but needs to
- **DECISION**: A choice the user needs to make
- **RISK**: Something that could go wrong and how to mitigate
- **SUGGESTION**: An improvement that would make the implementation smoother

Present as a numbered list. Ask the user which to address first or whether to go in order.

## Step 5: Update the Spec

After the user makes decisions on each review item, update the spec doc with:
- **Decisions recorded in the right home** — durable architectural decisions (the kind a future contributor would relitigate) go to `docs/KB_1_Architecture.md` `## Architecture Decisions`; spec-local tactical decisions stay inline in the affected step's `**Why:**` field. Don't split one decision across both.
- New steps added to the implementation order
- Risks documented in a risk register

## Step 6: Lockdown Check

Final gate: verify the spec has no unresolved architectural forks before declaring it implementable. Run **after** Step 5 (so any decisions surfaced during review have been recorded). A spec that passes Step 6 receives a `Status: LOCKED YYYY-MM-DD` header; a spec that fails has unresolved items listed and does not receive the header.

### 6a: Scan for unresolved-fork patterns

Grep the spec for textual signals that a fork was raised but not closed:

- `[TODO decision]`, `TODO`, `[decide]`, `(decide)` — explicit unresolved markers
- ` or ` between architectural alternatives (e.g., "use approach A or B")
- `(a)/(b)/(c)`, `(1)/(2)/(3)` enumerations without a confirmed pick
- Phrases like `open decision`, `unresolved`, `to be determined`, `TBD`, `revisit`, `figure out later`

For each match: confirm there's an adjacent decision (in the decisions table, an inline "decided: X" annotation, or a step's `**Why:**` field) closing the fork. If none, list it as **UNRESOLVED**.

**Exclusions (avoid false positives).** Self-referential specs — ones that *document* the fork patterns Step 6 detects — generate noise. For every grep hit, skip the match if any of the following apply:

- The match sits inside a fenced code block (```` ``` ```` … ```` ``` ````) — that's example syntax or a template skeleton, not a real unresolved item.
- The match sits inside a backtick-delimited inline code span (`` `[TODO decision]` ``) — same reason.
- The match is in a paragraph that describes Step 6 itself, or documents the fork-detection patterns (e.g., a sentence enumerating the patterns to scan for). That's commentary, not content.
- The match is inside a "Resolved decisions" or post-release "revisit triggers" section (`"revisit if X happens"`, `"revisit in a later release"`) — those are deliberate future milestones, not unresolved forks within this release's scope.

A match qualifies as **UNRESOLVED** only when it represents an actual decision *in this spec's content* that has no corresponding closure.

### 6b: Verify decisions are recorded

Every fork the spec resolves must leave a durable record. Verify each resolved decision is captured in one of the project's decision homes (per Step 5):

- A decisions table in the `Decision | Choice | Reasoning | Date` format (preferred for specs that carry many architectural choices).
- An inline `**Why:**` annotation on the affected step (for spec-local tactical decisions).
- A `docs/KB_1_Architecture.md` `## Architecture Decisions` entry (for durable choices a future contributor would relitigate).

Then verify:

- Every fork surfaced in Step 3f Decision Points has a corresponding record.
- Every review item the user resolved in Step 4 (categorized **DECISION**) has a corresponding record.
- For table rows: every row has all four columns filled — no empty `Choice` or `Reasoning` cells. For inline/KB entries: each carries a date stamp and a one-line reasoning.

### 6c: Verify exploration evidence is cited

Each decision should reference the artifact that grounds it. Look for:

- Brainstorm trace citation (`/brainstorm` output, option-comparison evidence)
- Investigation log citation (`/investigate` finding, `file:line` citation)
- Source-of-evidence link (existing KB section, migration, or external doc)

If a decision is recorded without a cited grounding artifact, flag it as **UNVERIFIED** (the decision may still be correct, but the trace is missing — write it in now or the next reviewer can't audit the reasoning).

**Engineering-judgment exception.** Some decisions are pure technical choices — runtime layout, error-handling style, file naming — that have no external "artifact" to cite because the rationale *is* the technical reasoning. For these, the Reasoning column itself must make the technical justification visible. Don't flag a stated technical rationale as UNVERIFIED; flag *missing* rationale.

Distinguishing rule: if the decision could only be answered by reading an external artifact (a KB, a brainstorm trace, a prior incident), require the citation. If the decision is justified by self-contained engineering reasoning, accept the Reasoning column as the citation.

### 6d: Verdict

**On PASS** (no UNRESOLVED items, every decision recorded with a cited evidence source): prepend a `> **Status: LOCKED YYYY-MM-DD**` blockquote header to the spec file (immediately under the H1 title, before any other content). Replace `YYYY-MM-DD` with today's date.

**On FAIL** (one or more UNRESOLVED or UNVERIFIED items): output a numbered list of the unresolved items. Do **not** write the LOCKED header. Tell the user: "Spec failed lockdown check — [N] unresolved items below. Resolve and re-run Step 6."

The LOCKED header is the convention that downstream `/orchestrate` (Phase 6) and `/implement` use to decide whether the spec is dispatch-ready. Drafts without the header are exploratory only.

## Important

1. **Be thorough** — the whole point is to find what's missing BEFORE implementation
2. **Be specific** — cite exact file paths, line numbers, and code snippets
3. **Be practical** — focus on things that would actually break, not theoretical concerns
4. **Group related findings** — 5 grouped items beats 20 individual ones
5. **Lead with recommendations** — don't just list problems, suggest solutions
6. **Don't implement anything** — this is analysis only
