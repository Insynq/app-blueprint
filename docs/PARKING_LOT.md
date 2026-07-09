# Parking Lot

Running log of observations, open questions, and considerations that don't yet have a home in a spec or active phase. Items here are **not** committed scope — they're candidates to raise during pivot review at the start of the next phase loop, and signals for `/brainstorm` to check for overlap before recommending an approach.

**Lifecycle:**
- New items append to **Open** with date observed (`YYYY-MM-DD`).
- When an item moves into a phase/spec, link it from here and move it to **Adopted into scope**.
- When an item is decided against or rendered moot, move to **Resolved / dropped** with a one-line outcome.
- Items tagged `framework-meta` capture tooling / automation or framework-workflow improvements surfaced during a phase retro (the `/ship` retro sweep routes them here) — process-level signals rather than product scope.
- Keep the file lean — collapse `Resolved / dropped` entries older than two phases into a one-line summary.

Commands that reference this file: `/orchestrate` (Step 1 — pivot review), `/brainstorm` (Phase 1 — overlap check).

---

## Open

### 2026-07-07 — debug.md: no verify-by-attempt bar for a "cannot reproduce" verdict `[framework-meta]`
Ported doctrine from agent-blueprint v0.6 (source repo: `docs/LESSONS.md` [PROCESS-1] Corollary 3 and `docs/OpenClaw KBs/OC_KB_11_Safety_Primitives.md` Primitive 8 blocked-side sharpen): a negative debug verdict is a claim too. `debug.md:63` handles a *missing* artifact by passive honesty only (mark downstream claims UNVERIFIED); nothing forces execute-verifying the candidate repro conditions the investigation surfaced before a ticket is closed "cannot reproduce / works-on-my-machine / not-a-bug", and the After-Subagent branches (`debug.md:268-272`) have no "could not reproduce" terminal branch. A false "cannot reproduce" cascades — it closes the ticket and disables the fix while the bug persists in prod.

- Today: debug.md gates only the POSITIVE claim (Iron Law: no fix without confirmed root cause; three-strikes escape after three failed *fixes*). The negative verdict is ungated.
- Options: (1) extend the line-63 UNVERIFIED clause with a one-sentence cross-ref; (2) add a new After-Subagent branch (~272) holding the rule — execute-verify each candidate repro condition surfaced (role, browser, RLS/tenant context, feature-flag state, data shape), bounded to own search hits, and make the negative evidence-carrying (enumerate conditions attempted + verbatim results).
- Promote when: a downstream debug transcript closes a ticket "cannot reproduce / not-a-bug" without execute-verifying the role/browser/RLS-tenant/feature-flag/data-shape conditions its own investigation surfaced.
- Panel evidence: refuter ADOPT-REVISED (high) — real but narrower than "no bar"; three kill attempts failed. Domain-fit DEFER — no downstream field instance (v0.2.0 spec attests laundering for smoke/ship claims, not a debug cannot-reproduce verdict). Installed 2026-07-07, not yet proven in a live run.

### 2026-07-07 — investigate.md: a "no usages / dead code" finding treated as conclusion, not a claim `[framework-meta]`
Ported doctrine from agent-blueprint v0.6 (source repo: `docs/LESSONS.md` [PROCESS-1] Corollary 3): a negative ("found nothing") needs the same evidence bar as a positive, because a false negative disables the lane and cascades. A "no usages found / dead code" verdict is a claim, not a grep result — a false "unused" cascades straight into a prod break on deletion.

- Today: investigate.md Step 3 says verify imports/routing but does not require attempting the indirect-reference paths a plain grep misses, nor recording the searches run.
- Options: retarget from investigate.md's read-only output to the actual deletion decision point (`/plan` or `/implement`, where a symbol is removed): before asserting a symbol unused, attempt dynamic/string-keyed/registry dispatch, route tables, dynamic `import()`, JSX-via-factory, config-/i18n-key references, RN native-module registration, and record the exact searches + empty results.
- Promote when: a downstream transcript greenlights removal of a symbol asserted "unused" that a dynamic/string-keyed/registry/route-table/config-key reference actually reached.
- Panel evidence: refuter ADOPT-REVISED (medium) — real DELTA = attempt indirect paths + record searches. Domain-fit DEFER (P3) — retarget to the deletion point. Installed 2026-07-07, not yet proven in a live run.

### 2026-07-07 — Autonomy-budget doctrine bounding the unsupervised runway before the prod gate `[framework-meta]`
Ported doctrine from agent-blueprint v0.6 (source repo: `docs/OpenClaw KBs/OC_KB_11_Safety_Primitives.md` §Autonomy budget): how far may an autonomous run go before the human gate. The write-path complement of the scope-graduation *conduct* gate being ported into CLAUDE.md's "Verification & safety disciplines" block (agent-blueprint-v06-intake E1).

- Today: CLAUDE.md carries verification/smoke/defensive-writes disciplines and (via E1) a first-prod-mutation ask-and-wait gate, but no doctrine bounding how much unsupervised runway may precede that gate.
- Options: a reference-only subsection in `docs/MULTI_AGENT_WORKFLOW.md` (NOT OBS_KB_5 — that KB owns the runtime write-error surface). Grant standing multi-step autonomy only when (1) the reachable deploy target cannot touch prod (feature branch / Vercel preview; prod promotion human-gated); (2) an automated gate precedes each irreversible step (CI/typecheck/tests + A3 smoke truth-gate + N2 service-boundary gate, enforced not requested); (3) the permission grant is explicit and enumerated — else turn-by-turn. Point the supervision surface at the committed worker-plan / phase-plan docs.
- Promote when: a downstream `/orchestrate` or `/implement` session needs an explicit runway bound because the reachable deploy target's containment is not obviously preview-only. Coordinate with the E1 conduct-gate landing (once E1 ships, the "complement of the prod-mutation gate" framing resolves).
- Panel evidence: refuter ADOPT-REVISED (medium) — home in MAW.md not OBS_KB_5; drop the CLAUDE.md-gate-complement framing until that gate is ported (E1 ports it). Domain-fit DEFER — no downstream anchor. Installed 2026-07-07, not yet proven in a live run.

### 2026-07-07 — LESSONS.md: effort-disproportion is an architecture signal (measure by diff, not wall-clock) `[framework-meta]`
Ported doctrine from agent-blueprint v0.6 (source repo: `docs/LESSONS.md` [PROCESS-7]). A fix whose blast radius is wildly larger than its request-class implies — many files touched, subsystems crossed (component + hook + query + migration for a one-line ask), a bounded ask sprawling into a large diff — is evidence about the CODEBASE, not just the change.

- Today: `docs/LESSONS.md` ships empty (no `[PROCESS-*]` entries); there is no effort-disproportion lesson and no numbered entry to cross-ref. This gates the two coupled parked items below.
- Options: author a LESSONS `[PROCESS-N]` entry (Rule/Why/How-to-apply) — do not low-ceremony-merge a disproportionate fix; escalate to `/brainstorm` / `/plan-review`. Anchor strictly to diff size / files-touched / subsystems-crossed, never wall-clock (confounded by model speed and rate limits). Fence: prod-mutating surfaces are not disposable-probe targets. Placement-cost alternative: extend `debug.md`'s three-strikes escape to also fire on a single first fix whose diff is wildly disproportionate.
- Promote when: a downstream transcript shows a bounded ask whose fix sprawled across many files/subsystems was low-ceremony merged — author the entry on that real incident, then land the two coupled items below as its consumers.
- Panel evidence: refuter ADOPT-REVISED (high) — real. Domain-fit DEFER — installed-not-proven; LESSONS empty. Installed 2026-07-07, not yet proven in a live run.

### 2026-07-07 — audit-code §4: frame diff sprawl as a codebase signal, not only a smell to trim `[framework-meta]`
Ported cross-ref from agent-blueprint v0.6 (audit-code §4 one-liner). A fix (or diff) disproportionate to its request-class is a codebase signal, not only an over-engineering smell. COUPLED to the LESSONS effort-disproportion entry above.

- Today: `audit-code.md` §4 (Over-Engineering Checks) frames sprawl only as a smell to trim.
- Options: append one self-contained line to §4 — "A fix (or diff) disproportionate to its request-class is a codebase signal, not only an over-engineering smell — when a bounded ask sprawls across many files/layers, flag it for design scrutiny (`/brainstorm`, `/plan-review`), not just trimming." Add a `See LESSONS.md [PROCESS-N]` cross-ref ONLY after that entry is authored (avoids a dead cross-ref while LESSONS ships empty).
- Promote when: the LESSONS effort-disproportion entry lands, OR a downstream audit-code run treats sprawl only as a trim-smell and misses the codebase-signal escalation.
- Panel evidence: refuter/placement-cost ADOPT-REVISED — must be self-contained (no dangling cross-ref). Domain-fit DEFER — author the LESSONS entry first. Installed 2026-07-07, not yet proven in a live run.

### 2026-07-07 — MAW Phase 8: check the integrated diff for disproportion to the slice plan `[framework-meta]`
Ported doctrine from agent-blueprint v0.6 (source repo: `docs/LESSONS.md` [PROCESS-7] "how to apply"). app-blueprint's Phase 8 verification gate is a claim/what-verifies-it table — it does not compute a diff-vs-plan proxy today; promotion would add both the `git diff --name-only`-vs-plan computation and the disproportion read. COUPLED to the LESSONS effort-disproportion entry above; weakest of the batch.

- Today: `docs/MULTI_AGENT_WORKFLOW.md` Phase 8's verification gate is a claim/what-verifies-it table; no diff-vs-plan computation exists, and there is no disproportion check.
- Options: one bullet appended after the Phase 8 verification-gate table — when the integrated diff sprawls well beyond what the slice's plan scoped, read it as a codebase-health signal and route to `/brainstorm` / `/plan-review` rather than low-ceremony merging. Do NOT edit the operational gate table itself (agent-blueprint deliberately left its own Phase 8 untouched and only cross-reffed it).
- Promote when: the LESSONS effort-disproportion entry lands AND a downstream Phase-8 integration low-ceremony-merges a diff disproportionate to the slice plan.
- Panel evidence: refuter ADOPT-REVISED (LOW — weakest of batch); source left its own Phase 8 untouched. Domain-fit DEFER. Installed 2026-07-07, not yet proven in a live run.

### 2026-07-07 — Durable docs hold query paths, not copies of live facts `[framework-meta]`
Ported discipline from agent-blueprint v0.6 (source repo: CLAUDE.md `## DO NOT` trap + `docs/OpenClaw KBs/OC_KB_04_Bootstrap_Files.md` anti-pattern). KB docs, CLAUDE.md, and MEMORY hold the durable *rule* and the *query path* (which migration / RLS policy / `.env.example` / config to read), never a copy of the live fact — a duplicated fact parses fine, then diverges silently from the source, and the agent defends the stale copy against the live system.

- Today: no durable framework-provided rule states this. The schema/column-name case is already guarded (generated Supabase types + migrations catch divergence via a type error); the uncovered surface is the *non-type-checked* facts.
- Options: a single bullet on CLAUDE.md's "Verification & safety disciplines (framework-provided)" block, narrowed to the facts that diverge without a type error — RLS policy text, env/config values, feature-flag states, API-contract fields. Fix: store the pointer, read the fact fresh.
- Promote when: a downstream transcript shows the agent defending a stale copied fact (RLS policy text, env value, feature-flag state, or API-contract field duplicated into a KB / CLAUDE.md / MEMORY) against the live source. If promoted, it wants the same CLAUDE.md block Lane E edits.
- Panel evidence: refuter ADOPT-REVISED (medium) — narrow to non-type-checked facts. Domain-fit DEFER. Installed 2026-07-07, not yet proven in a live run.

<!-- Entry template:

### YYYY-MM-DD — Short title
One-paragraph context. What was observed, what's unclear, why it matters.

- Today: [current behavior or state]
- Options: [if any obvious paths are visible]
- Open questions / unknowns: [what needs to be answered before this can be scoped]

-->

---

## Adopted into scope

_(empty — when an Open item is pulled into a phase plan, move it here with a link to the phase plan and the date adopted)_

---

## Resolved / dropped

_(empty — when an Open item is decided against or moot, move it here with a one-line outcome)_
