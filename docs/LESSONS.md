# Lessons Log

A running log of gotchas, hard-won lessons, and non-obvious behaviors discovered during development. Add entries here as they accumulate — this becomes more valuable the longer a project runs.

**Format:** Each entry has a short ID for cross-referencing (e.g., `[UI-1]`), the rule itself, a **Why** (the real incident), and a **How to apply** line (when to use it).

Commands that reference this file: `/debug`, `/implement`, `/audit-code`.

---

## UI & Component Patterns

[No entries yet.]

---

## Data & Query Patterns

[No entries yet.]

---

## Integration Patterns

[No entries yet.]

---

## Database & Schema Patterns

[No entries yet.]

---

## Architecture & Design Patterns

[No entries yet.]

---

## Process & Verification Patterns

### [PROCESS-1] A consumed-verbatim artifact is a tool, not prose — compress the body around it, never the artifact

**Rule:** When trimming a command/KB for length, split the text into *teaching prose* (compresses freely) and *consumed-verbatim artifacts* — paste-ready seed prompts, worker-prompt templates, emit templates, executable blocks. The artifact's apparent redundancy with nearby explanation is functional: the body teaches why, the artifact is pasted or run. Compress the body; leave the artifact whole. Pointer-izing it forces a consumer to reconstruct a contract from prose.

**Why:** Ported from agent-blueprint's 2026-07-07 skill-audit, where a judge proposed compressing several blocks that *read* as duplicative but were consumed verbatim by fresh-context workers — the redundancy was the design.

**How to apply:** Trigger is proposing to compress or pointer-ize a block during a brevity pass. Ask: is this read by a human/model, or pasted/run verbatim by a consumer? Verbatim-consumed → it's a tool; compress around it, leave it intact. Installed 2026-07-10, not yet proven in a live run.

### [PROCESS-2] The co-load test separates deliberate reinforcement from bloat

**Rule:** A rule appearing in more than one place is deliberate reinforcement only if its copies fire where the others are absent. Co-load test: if two copies always enter context together (same file/prompt) → one is bloat, reduce to a pointer at the canonical copy. If they live in independently-loaded contexts (separate command entry points, fresh-subagent prompts) → keep every copy inline, because a cross-context pointer only fires if followed.

**Why:** Same 2026-07-07 audit. app-blueprint's own Refutation Pass is triple-stated across `audit-code`/`audit-rls`/`audit-full` and stays inline — each is a standalone entry point.

**How to apply:** Trigger is calling a duplicated rule "reinforcement" (keep) or "redundancy" (cut). Run the test: do these copies always load together? Same-context → pointer; cross-context → keep inline. Pairs with [PROCESS-1]. Installed 2026-07-10, not yet proven in a live run.

### [PROCESS-3] Verify claims against the live artifact at plan-review time, not from memory or prose

**Rule:** Any foundation claim a spec, plan, or brainstorm option leans on — "builds on existing X," "existing behavior preserved," "out of scope because X already handles it" — is verified against the live artifact (the actual code, SQL, policy, migration, or running behavior) before it is presented as solid ground. "I couldn't find evidence it's broken" is not "I confirmed it works": a claim you couldn't verify is marked **assumed** (a GAP or RISK the work depends on), never silently promoted to earned. Warning sign: a verification question that keeps softening ("does X fire?" → "does X fire somewhere?" → "is existing behavior preserved?") — that resistance IS the answer; expand the investigation until the question can actually be answered, don't shrink the question until it's tractable.

**Why:** Two incidents (app-blueprint numbering; unrelated to any source-repo [PROCESS-3]). (1) The canonical receiving-side one, recorded in `docs/smoke-tests-pending.md` (Service-boundary tag): 213/213 unit tests plus a clean typecheck shipped a completely non-functional auth/email flow — every green signal was prose-level evidence; nobody had exercised the live artifact. (2) This entry itself backfills a citation that dangled from the day it shipped: `/plan-review` §3a, `/brainstorm` #13, and `/plan`'s earned-vs-assumed bullet all cited a `docs/LESSONS.md` `[PROCESS-1]` that did not exist — a claim about a document nobody opened, caught only by the 2026-07-10 v0.7-intake anchor audit. The dangling citation is itself an instance of the failure mode the rule describes.

**How to apply:** Trigger is writing or reviewing any earned-vs-assumed scope-out — `/plan-review` Step 3a, `/brainstorm` Important-Instruction 13, or `/plan`'s earned-vs-assumed bullet (all three point here). Open the artifact and confirm (mark the claim earned), or mark it assumed and list it as a dependency that must be verified before or during implementation. Entry installed 2026-07-10 as a backfill of an already-operational discipline; the discipline is field-proven receiving-side (see Why), the entry text itself not yet cited in a live run.

---

## How to Add a New Entry

Copy this template and append to the relevant section:

```markdown
### [CATEGORY-N] Short title

**Rule:** The specific, actionable rule.

**Why:** The real incident that caused this lesson. Be specific — which bug, what failed, what the actual root cause was.

**How to apply:** When exactly does this apply? What's the trigger that should remind you of this lesson?
```

Categories: `UI`, `DATA`, `INT`, `DB`, `ARCH` (architecture/design patterns), `PROCESS` (planning, verification, scoping discipline)
