# Template Audit Findings

Multi-agent audit run April 24, 2026. 5 parallel agents reviewed: kickoff command + doc shells, workflow commands, planning commands, audit + generator commands, and shareability/README.

Findings are grouped by theme and priority. Use this as a backlog for improving the template.

---

## Critical — Blocks Shareability

**C1. README "Quick Workflow" is wrong**
`/orchestrate` already runs `/implement` internally. The README shows them as two separate steps (`/orchestrate → /implement → /ship`). Anyone who follows this literally runs implement twice. Fix: `/orchestrate → /ship`.
- File: `README.md`, Recommended Workflows section

**C2. CLAUDE.md pre-kickoff looks broken**
A new user opening CLAUDE.md before running kickoff sees a wall of `[TODO]` markers. The kickoff note is easy to miss. Needs a prominent banner at the top: *"This file is unpopulated until you run `/kickoff`. Do not edit manually before that."*
- File: `CLAUDE.md`

**C3. Command table in CLAUDE.md is incomplete**
The table lists 11 commands but omits `/investigate`, `/plan`, `/update-kb`, `/audit-infra`, `/audit-rls`. A user reading CLAUDE.md won't know half the commands exist.
- File: `CLAUDE.md`, Custom Commands section

**C4. KB numbering creates confusion (gaps 2–6)**
`KB_1`, `KB_7`, `KB_8` with no KB_2–6 makes strangers assume files are missing. Either rename them (`KB_Architecture.md`, `KB_UI_Patterns.md`, `KB_Current_State.md`) or add a note explaining the gaps are reserved slots for project-specific KBs.
- Files: `docs/KB_*.md`, `CLAUDE.md`, `README.md`

**C5. Memory system is unexplained**
`.claude/memory/MEMORY.md` exists with just a comment, and nothing in README or CLAUDE.md explains what the memory system is, why kickoff seeds it, or how future sessions use it.
- Files: `README.md`, `.claude/memory/MEMORY.md`

---

## High — Significant Gaps in Methodology or Functionality

**H1. Kickoff doesn't handle non-UI / API-only projects**
Phase 2 asks about the "happy path" user walkthrough and Phase 4 asks about mobile/PWA — both assume a UI exists. If someone is building an API, CLI tool, or internal service, these questions are wrong. Kickoff needs early detection and branching.
- File: `.claude/commands/kickoff.md`, Phase 2 and Phase 4

**H2. KB_7 (UI Patterns) has no backend equivalent**
API-heavy or full-stack projects have no KB for backend conventions, error handling patterns, caching strategy, queue design, or API contract decisions. KB_7 should either become "Application Patterns" (covering both) or a separate backend patterns KB should exist.
- File: `docs/KB_7_UI_Patterns.md`

**H3. "Orchestrate waits for approval" isn't enforced**
`orchestrate.md` says "Wait for approval before proceeding" after presenting the plan, but there's no mechanism that actually pauses execution. The subagent will present and continue. Needs to be enforced in the subagent prompt.
- File: `.claude/commands/orchestrate.md`, Step 3

**H4. Audit-full's non-SQL replacement guidance is too vague**
When a project doesn't use SQL RLS, `audit-full.md` says "replace with whatever access control mechanism is in use" but gives no specifics. Express middleware, GraphQL permissions, API gateway policies — each needs its own checklist.
- File: `.claude/commands/audit-full.md`, Subagent 2

**H5. Missing commands that are clearly needed**
- `/debug` — standalone command (orchestrate `--type debug` is not discoverable)
- `/deploy` — separate from ship; deploys artifacts, doesn't just push code
- `/test` — runs test suite (currently buried inside implement's build check)
- `/gen-hook` — data fetching hooks are as common as components; no generator exists

**H6. Security audit gaps**
Three areas not covered by any of the three audit commands:
- Supply chain security (package provenance, lockfile integrity, typosquatting)
- Git history secrets (secrets removed from files but still in commit history)
- CSRF protection (not in audit-code's checklist)
- Session management (token expiry, invalidation — not checked anywhere)

**H7. plan vs. plan-review usage is unclear**
When do you use `/plan` (from investigation findings) vs. `/plan-review` (on a spec doc)? The commands don't cross-reference each other. The brainstorm command recommends "run `/plan-review`" but the investigate command says "run `/plan`" — no guidance on how they relate.
- Files: `.claude/commands/plan.md`, `.claude/commands/plan-review.md`, `.claude/commands/brainstorm.md`

**H8. Kickoff produces no infrastructure/deployment shell**
Kickoff produces concept, scope, architecture, and UI pattern docs — but nothing for hosting decisions, CI/CD approach, required environment variables, or deployment process. These are usually decided at kickoff time.
- File: `.claude/commands/kickoff.md`, Synthesis & File Writing section

---

## Medium — Quality and Coverage Improvements

**M1. "Unified model" philosophy is unexplained for strangers**
Both `plan.md` and `audit-code.md` reference "flag adapters as a smell" and "one normalized type beats two plus a translator" with no rationale. Needs one sentence of explanation or a concrete example for someone who hasn't heard this framing before.
- Files: `.claude/commands/plan.md`, `.claude/commands/audit-code.md`

**M2. Kickoff edge cases not handled**
- User doesn't know their tech stack → Phase 4 says "I can suggest options" but gives no guidance on how
- User wants to skip a phase → command says "in order" but doesn't handle pushback
- Solo vs. team project → affects architecture decisions but isn't branched
- Idea isn't ready → no graceful exit if discovery reveals the concept isn't formed enough
- File: `.claude/commands/kickoff.md`

**M3. Diagram types in visualize.md are incomplete**
Missing: state machine (critical for workflow understanding), user journey, deployment diagram. These are commonly needed and the current 5 types don't cover them.
- File: `.claude/commands/visualize.md`

**M4. Brainstorm Explore agent has no thoroughness level specified**
The command spawns an Explore subagent but doesn't specify thoroughness ("quick", "medium", "very thorough"). Default behavior is uncontrolled.
- File: `.claude/commands/brainstorm.md`, Step 2

**M5. Post-batch type check failure is a soft limit**
`implement.md` says "if errors persist after 2 attempts, report them" and continues. For a template meant to enforce discipline, this should block unless the user explicitly approves continuing with errors.
- File: `.claude/commands/implement.md`, Step 5d

**M6. gen-test has no fallback when no existing tests exist**
The command says "find 2–3 existing test examples and follow them exactly" but new projects have no tests yet. Needs a default pattern to fall back on.
- File: `.claude/commands/gen-test.md`

**M7. Kickoff scope pushback coaching is vague**
Phase 3 says "push back if V1 is too large" but gives no threshold. Needs a concrete example: "If they want 5+ workflows in V1, that's a red flag — ask 'Which ONE workflow is the core problem?'"
- File: `.claude/commands/kickoff.md`, Phase 3

**M8. Anti-patterns in audit-code include project-specific entries**
"Modifying immutable records" assumes an audit trail pattern. "Calling lower abstraction layer" assumes payments/auth middleware. These should be separated into universal vs. project-specific sections.
- File: `.claude/commands/audit-code.md`, Anti-Patterns table

**M9. Kickoff memory seeds are sparse**
`project_preferences.md` only covers communication style, autonomy, code opinions, and things to avoid. Missing: how to handle trade-off decisions, performance vs. simplicity preference, what constitutes a blocking escalation.
`project_concept.md` is too terse — captures elevator pitch but not the primary value driver or which user type to target first in V1.
- File: `.claude/commands/kickoff.md`, memory file templates

**M10. gen-migration doesn't address backward compatibility**
No guidance on rollback plans, zero-downtime migration patterns (old + new columns in parallel), or handling long locks on large tables.
- File: `.claude/commands/gen-migration.md`

---

## Low — Polish Items

**L1. Missing public-facing files**
- `LICENSE` — ambiguous licensing without one (suggest MIT)
- `CONTRIBUTING.md` — guidance for improvements and issue reports
- `.env.example` — mentioned in .gitignore but doesn't exist
- A "Next steps after kickoff" section in README

**L2. VS Code extensions include bad picks**
`prisma.prisma` (ORM-specific) and `github.copilot` (conflicts with Claude Code focus, also paid) shouldn't be in a generic starter. Remove both.
- File: `.vscode/extensions.json`

**L3. settings.json has no guidance on customization**
Only npm/npx/git commands are allowed by default. No other package managers (pnpm, yarn, bun, pip, cargo). No explanation that users need to add entries for their stack.
- File: `.claude/settings.json`

**L4. Commit message has hardcoded model version**
`ship.md` hardcodes `Claude Sonnet 4.6` in the Co-Authored-By line. Will be stale. Should read the current model from context or be a placeholder.
- File: `.claude/commands/ship.md`

**L5. plan.md testing checklist is a placeholder**
The testing checklist is `[ ] Test [scenario]` — completely generic. Should have real default test dimensions: happy path, error paths, edge case data (null/empty/max), different user roles, regression in dependent features.
- File: `.claude/commands/plan.md`

**L6. audit-infra.md CORS guidance is incomplete**
Missing checks for: `Access-Control-Allow-Credentials: true` with wildcard origin (critical vulnerability), preflight cache duration, multi-layer CORS consistency.
- File: `.claude/commands/audit-infra.md`

**L7. KB shells lack guidance on "Definition of Done" format**
`SCOPE.md`'s "Definition of Done" section has no hint about what "specific" means. Should include an example format.
- File: `docs/SCOPE.md`

**L8. KB_1 "Open Questions" section format is passive**
Should specify a format: `Q: [question] → Impact: [what this blocks] → By when needed: [phase X]`
- File: `docs/KB_1_Architecture.md`

---

## Suggested Fix Priority

For making the template shareable:

**Immediate (< 1 hour):**
- C1: Fix README Quick Workflow (2 min)
- C3: Fix CLAUDE.md command table (5 min)
- C2: Add kickoff banner to CLAUDE.md (5 min)
- C4: Rename KB files or add numbering explanation (10 min)
- C5: Add memory system explanation to README (10 min)
- L4: Fix hardcoded model version in ship.md (2 min)
- L2: Fix VS Code extensions (2 min)

**Next pass:**
- H1: Kickoff non-UI branching
- H2: KB_7 → Application Patterns (add backend section)
- H3: Enforce orchestrate approval gate
- H5: Add /debug and /deploy commands
- H7: Clarify plan vs. plan-review in both files
- H8: Add infrastructure/deployment shell to kickoff output
- L1: Add LICENSE, CONTRIBUTING.md, .env.example

---

## Additions Audit — April 24, 2026

Second audit pass after adding: `/debug`, `LESSONS.md`, `CHANGELOG.md`, `/changelog`, `KB_7` (full rewrite), `KB_9`, `/unify`, and modifications to `/ship`, `/brainstorm`, `/gen-component`, `/plan-review`, `/implement`, `/audit-code`, `CLAUDE.md`.

---

### Critical — Silent Failures or Broken Workflows

**N1. `/orchestrate --type debug` doesn't chain to `/debug`**
`/orchestrate` claims to support `--type debug` but chains to `/investigate` → `/plan` — the wrong workflow for debugging. Debugging needs hypothesis testing, not feature planning.
- File: `.claude/commands/orchestrate.md`, debug conditional
- Fix: If `type == "debug"`, chain to `/debug` directly and skip plan steps.

**N5. `/orchestrate` skips schema verification that `/implement` requires**
`/implement` Step 4 verifies exact column names from migrations before writing code. `/orchestrate`'s investigation step doesn't, so its findings reference fields that may not exist, producing plans that fail during implementation.
- File: `.claude/commands/orchestrate.md`, Step 2
- Fix: Add Step 2c: "Verify all data shapes referenced in findings by reading the actual migration CREATE TABLE statements."

**N6. CHANGELOG entry format diverges between `/changelog` and `/ship`**
`/changelog` generates entries as `## YYYY-MM-DD — [Phase X.X: ][Title]` (phase optional); `/ship` Step 2.5 always includes `Phase $ARGUMENTS.phase:` when a phase is provided. The two tools produce inconsistently formatted entries in the same file.
- Files: `.claude/commands/changelog.md`, `.claude/commands/ship.md` (Step 2.5)
- Fix: Align the format strings — phase label should be optional in both, using the same conditional syntax.

**N17. `/ship` silently skips CHANGELOG if file doesn't exist, no recovery guidance**
Step 2.5 says "skip this step if CHANGELOG.md doesn't exist" but doesn't tell the user to run `/changelog` first to initialize it. Projects adopting the template mid-stream will silently miss changelog entries forever.
- File: `.claude/commands/ship.md`, Step 2.5
- Fix: Add: "If `docs/CHANGELOG.md` does not exist, run `/changelog` first to initialize it, then re-run `/ship`."

---

### High — Significant Gaps in Methodology

**N2. `/gen-test` and `/gen-migration` don't read LESSONS.md**
Both read CLAUDE.md but skip LESSONS.md, missing known gotchas for their domains (missing full-table constraint audit in migrations, edge case data in tests).
- Files: `.claude/commands/gen-test.md` (Step 1), `.claude/commands/gen-migration.md` (Step 1)
- Fix: Add to Step 1: "Also read `docs/LESSONS.md` — skim for entries relevant to this area."

**N3. `/investigate` doesn't check LESSONS.md for known patterns**
Investigation is the right time to match symptoms to known entries, but LESSONS.md isn't referenced anywhere in the investigate command.
- File: `.claude/commands/investigate.md`, Step 1
- Fix: Add: "Read `docs/LESSONS.md`. Flag if the issue matches any known gotcha category."

**N4. `/brainstorm` Step 1 reads KB_7 but not KB_9**
The command checks the component catalog but not the screen catalog. Brainstorming a feature that already has a screen or modal is a critical miss.
- File: `.claude/commands/brainstorm.md`, Step 1
- Fix: Add KB_9 read to Step 1 alongside KB_7: "Check `docs/KB_9_Screen_Catalog.md` — does a screen or modal serving a similar purpose already exist?"

**N13. Plan-review Section 3f (Event-Driven Side Effects) is placed too late**
3f was added at the end of the checklist, but missed side-effect callsites are one of the most common causes of failed plans. It should be reviewed before architectural gaps.
- File: `.claude/commands/plan-review.md`, Section 3 ordering
- Fix: Move 3f before 3c (Dependency Risks) so it's checked early in the review.

**N14. README not updated with new commands**
`/debug`, `/changelog`, and `/unify` aren't listed in the README command library. New users won't discover them without opening CLAUDE.md.
- File: `README.md`, Command Library section
- Fix: Add these three commands to the appropriate README sections.

**N19. `/ship` doesn't prompt KB_9 updates for newly shipped screens**
`/ship` auto-updates CHANGELOG but doesn't prompt adding new screens to the KB_9 Screen Catalog. KB_9 will fall behind without a trigger.
- File: `.claude/commands/ship.md`
- Fix: Add Step 2.6: "If new screens were built, update `docs/KB_9_Screen_Catalog.md` with entries for each."

**N20. `/plan-review` doesn't verify that KB_7-referenced components actually exist in the catalog**
A plan can reference a component "from KB_7" that isn't in the catalog. The gap surfaces during implementation, not during review.
- File: `.claude/commands/plan-review.md`, Step 3a (Missing Pieces)
- Fix: Add: "For any component the plan expects from KB_7: verify it exists in Part 2 (Component Catalog)."

---

### Medium — Quality and Coverage Improvements

**N7. KB_7 Part 2 has no first-project bootstrapping guidance**
The Component Catalog is empty on a new project. Gen-component says "add an entry here" but there's no note explaining Part 2 populates over time vs. needing prefill.
- File: `docs/KB_7_UI_Patterns.md`, Part 2 header
- Fix: Add: "This catalog populates as components are built via `/gen-component`. It is intentionally empty on new projects."

**N8. `/debug` pause point is ambiguous — unclear whether diagnostic test runs before stopping**
Step 4 forms a hypothesis; Step 5 says STOP. It's unclear whether the diagnostic test should run before the pause or after user confirmation.
- File: `.claude/commands/debug.md`, Steps 4–5
- Fix: Clarify: run the diagnostic test in Step 4, then STOP in Step 5 reporting hypothesis + test result. No code until user confirms.

**N9. LESSONS.md lists `[ARCH-*]` as a category but has no seeded entries**
The file's template includes `ARCH` as a category label, but no architectural gotchas are seeded — leaving the category as a placeholder with no example of what belongs there.
- File: `docs/LESSONS.md`, Categories list
- Fix: Either seed one `[ARCH-1]` entry (e.g., "don't create an abstraction for a single use case") or add a note explaining ARCH entries are rare by design.

**N11. `/debug` DB layer references "full table audit" without showing how**
Step 3 says "audit ALL CHECK constraints" and links to LESSONS.md [DB-1] but doesn't show the concrete steps — SQL to run, migration files to read, or what to look for.
- File: `.claude/commands/debug.md`, Step 3 DB Layer
- Fix: Add: "Read the `CREATE TABLE` migration for every table the failing operation touches. Verify: column types, CHECK constraints, FK constraints, and RLS policies."

**N12. KB_9 has no deprecation format for removed or replaced screens**
The file says "mark deprecated rather than deleting entries" but doesn't specify the format. Old entries will look live.
- File: `docs/KB_9_Screen_Catalog.md`
- Fix: Add: "Deprecated format: `### [Deprecated] Screen Name` — add `- **Status:** Deprecated [date] — replaced by [screen]`."

**N15. CLAUDE.md mentions KB_9 in prose but not in the reference documents table**
KB_9 appears in the running text but not in the formal reference table, so it won't be noticed on a quick scan.
- File: `CLAUDE.md`, Reference Documents section
- Fix: Add KB_9 row to the reference table alongside KB_7, KB_8.

**N16. `/changelog` doesn't validate that commits exist for the requested date range**
If the range produces no results, the command exits silently. The user may commit an empty or incomplete CHANGELOG.
- File: `.claude/commands/changelog.md`, Step 2
- Fix: Add validation: "If git log returns empty, report: 'No commits found — check the date range or omit `--since` to include all commits.'"

**N18. `/unify` spec doc location (`docs/[name]-spec.md`) isn't established as the template convention**
Spec docs could end up in `/docs`, `/.claude/plans/`, or elsewhere inconsistently.
- File: `.claude/commands/unify.md`, Step 6
- Fix: Add a note in CLAUDE.md establishing `docs/*-spec.md` as the pattern for all spec documents.

**N24. KB_7 Part 2 and KB_9 give no guidance for projects with no existing components yet**
Both look like they have a critical gap on day 1. Users may think they need to prefill them before building anything.
- Files: `docs/KB_7_UI_Patterns.md`, `docs/KB_9_Screen_Catalog.md`
- Fix: Add opening note to each: "Populated incrementally as you build. Start empty — do not prefill."

---

### Low — Polish and Clarity

**N10. LESSONS.md doesn't cover client-side state management gotchas**
No entries on race conditions, stale closures, or optimistic update rollback failures — a common class of SPA bug.
- File: `docs/LESSONS.md`
- Fix: Seed a `[UI-3]` entry for stale state / optimistic rollback pattern, or note the category for future addition.

**N21. `/unify` Step 5 says "find the function" without saying where to look**
New users won't know whether to check services, hooks, utils, or API handlers.
- File: `.claude/commands/unify.md`, Step 5
- Fix: Add: "Check services, hooks, API handlers, and utils directories. Name the function and its file."

**N22. `/plan-review` Step 3d (Decision Points) has no example of what counts**
"Where does the spec leave ambiguity" is too vague — unclear what distinguishes an acceptable unknown from a blocking decision point.
- File: `.claude/commands/plan-review.md`, Step 3d
- Fix: Add examples: "component library choice, API contract for a new endpoint, error handling granularity — valid cases where the plan must justify one option."

**N23. `/debug` references the Explore agent without explaining what it is**
A user reading the command standalone won't know Explore is a Claude Code subagent type or how to invoke it.
- File: `.claude/commands/debug.md`, Step 2
- Fix: Add: "(Spawn via the Agent tool with `subagent_type: Explore` and thoroughness: 'very thorough'.)"

**N25. KB_7 Parts 2–5 and KB_9 have no example entries showing expected detail level**
Format templates exist but no populated examples. Users can't tell what level of detail is expected.
- Files: `docs/KB_7_UI_Patterns.md`, `docs/KB_9_Screen_Catalog.md`
- Fix: Add one commented example entry per section marked "Example only — remove or replace when first real entry is added."

---

## Updated Fix Priority (All Findings)

**Immediate:**
- C1, C2, C3, C4, C5 (original)
- L2, L4 (original)
- N6: Align CHANGELOG format between `/changelog` and `/ship`
- N14: Add new commands to README
- N15: Add KB_9 to CLAUDE.md reference table
- N17: Add `/changelog` init guidance to `/ship`

**Next pass:**
- H1, H2 (resolved — KB_7 rewritten), H3, H5 (resolved — `/debug` added), H7, H8
- N1: Wire `/orchestrate --type debug` to `/debug`
- N4: Add KB_9 check to `/brainstorm` Step 1
- N13: Move plan-review 3f earlier
- N19: Add KB_9 update step to `/ship`
- N5: Add schema verification to `/orchestrate` investigation
- N2, N3: Add LESSONS.md reads to `/investigate`, `/gen-test`, `/gen-migration`
- N18: Establish spec doc location convention in CLAUDE.md
- L1, L3, L5, L6, L7, L8 (original)

**Backlog:**
- N7, N8, N9, N10, N11, N12, N16, N20, N21, N22, N23, N24, N25
- H4, H6, M1–M10 (original medium findings)
