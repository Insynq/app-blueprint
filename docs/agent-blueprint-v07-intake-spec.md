# Agent-blueprint v0.7 intake spec — wargame-planning & falsifiable-execution disciplines, third sister-framework port

> **Status: LOCKED 2026-07-10**

**Source:** agent-blueprint `7ba4397..80bb28e` — releases v0.6.2 ("wargame-planning intake", `657285e`), v0.6.3 ("skill-audit cleanup", `9d95f17` + `aa8db43`), the 2026-07-07 Codex/Claude-Code plugins investigation series (`7167d0f`, `3eae436`, `614ba71`, `ef7513e`, `3910654`), and v0.7.0 ("graduate Kai-RE patterns G1–G14", `80bb28e`), 2026-07-06 through 2026-07-09.

**Method & provenance.** This is the third agent→app port (predecessors: `verification-discipline-adoption-spec.md` → app-blueprint v0.2.0; `agent-blueprint-v06-intake-spec.md` → app-blueprint v0.3.0). Candidate set produced and stress-tested 2026-07-09/10 by a 74-agent mixed-model review orchestrated from app-blueprint: **7 Opus 4.8 gap-finders** (one per change cluster — wargame-v062, skill-audit-v063, plugins-investigations, kai-re-v070-commands, kai-re-v070-kbs-docs, stress-test-command, cross-cutting — each grounded on the raw `7ba4397..80bb28e` diff, not commit messages) → **30 raw candidates** → an Opus dedup/merge editor collapsed **8 true duplicates → 22 findings** → a **3-lens judge panel per finding** (Fable 5 *refuter* trying to kill it at primary source · Opus 4.8 *domain-fit* judge applying the source repo's `[PROCESS-5]` expect-inversion discipline · Opus 4.8 *placement-cost* judge reading the receiving target). Split verdicts were to be escalated, never averaged; **zero panels split on action polarity**. **Loud failure logged:** the monthly-spend limit killed all 9 judges for findings G-20/G-21/G-22 mid-run. Per the refutation discipline those three were **re-derived by hand at primary source** by the orchestrator (quoted text verified in `stress-test.md:49-50`, `:31`, and `_dev/agent-improvement-spec-template.md:121-133`; zero-capture grep-confirmed in app-blueprint) and are flagged **[hand-judged — re-run through a live panel before lockdown]** below.

**Outcome:** 18 of 22 findings are genuine, uncaptured, portable gaps. 4 were killed by the panel as already-captured or wrong-domain (G-16 model-tier executor briefs; G-17 read-only-package rule; G-18 version-bump-ships discipline; G-19 build-script footguns — all documented in **§Rejected** for the record). This spec ports the 18 survivors.

**Conventions.** Decisions are recorded per-section in `Decision | Choice | Reasoning | Date` tables. Every edit block quotes a verbatim anchor that exists in the receiving file **today** (verified against `HEAD` = `2309d81` while authoring). Per the source repo's `[PROCESS-1]`, every ported prose change ships flagged `Installed 2026-07-10, not yet proven in a live run` unless receiving-side field evidence is cited. **Citation-resolution constraint (load-bearing):** the source texts cite `[PROCESS-1]`, `[PROCESS-2]`, `[PROCESS-4]`, `[PROCESS-5]`, `[SKILL-1]`, and `OC_KB_*`. **None of these resolve in app-blueprint** — its `docs/LESSONS.md` is a category-scaffold with no `[PROCESS-N]`/`[SKILL-N]` entries, and it has no `OC_KB` files. Every ported edit block therefore **drops or repoints** such citations to a plain-prose rationale; where the discipline itself is worth capturing as an app-blueprint lesson, this spec adds it to `docs/LESSONS.md` under app-blueprint's own `[PROCESS-N]` numbering (see §D). Item IDs (A1–G1, mapping to the review's G-numbers) are namespaced to THIS spec; predecessor specs' items are always cited with a "v0.2.0" / "v0.3.0" qualifier.

**Flag placement.** KB/doc prose embeds the `Installed … not yet proven` flag inline; operational surfaces (command bodies, output templates, CLAUDE.md bullets) carry it as an edit-block annotation + decisions-row entry, so the flag never pollutes text that agents execute or print.

---

## Theme

The uncaptured releases are dominated by one idea: **make a plan falsifiable and blindly executable before anyone dispatches it.** A plan step should declare what you'd *observe* if it worked, name its *most-likely failure* and counter-move, tag *who can close it and how* (edit vs. live-run vs. decide), and state its *abort conditions* — and the dispatch gate is "could a worker run this end-to-end without asking a single question?" The consuming side (`/implement`) then confirms each step against its observation rather than trusting "the edit landed." Around that core sit four supporting clusters: lockdown-gate sharpening (`[VERIFY…]` ledger, legitimate-fork-trigger exclusion, upstream-forks-block-lock), a new adversarial `/stress-test` judge-panel command, two command-authoring lessons, three safety/enforcement disciplines, one DB-modeling discipline (the sanctioned denormalized-cache shape — directly relevant since app-blueprint apps attach to Supabase), and a user-facing-copy spec convention.

---

## File-touch map — 18 items

| Section | Items | Primary targets |
|---|---|---|
| **A. Wargame planning (falsifiable plan)** | A1 (G-1), A2 (G-2), A3 (G-5), A4 (G-4) | `plan.md`, `MULTI_AGENT_WORKFLOW.md`, `implement.md` |
| **B. Dispatch & lockdown gates** | B1 (G-3), B2 (G-6), B3 (G-8), B4 (G-12) | `orchestrate.md`, `MULTI_AGENT_WORKFLOW.md`, `plan-review.md` |
| **C. DB modeling (attached Supabase DB)** | C1 (G-7) | `SB_KB_00_Index.md`, new `SB_KB_13`, `CLAUDE.md` DO-NOT |
| **D. Command-authoring lessons** | D1 (G-10), D2 (G-11) | `AUTHORING_COMMANDS.md`, `LESSONS.md` |
| **E. Safety / enforcement disciplines** | E1 (G-9), E2 (G-14), E3 (G-15) | `OBS_KB_5_Defensive_Writes.md`, audit acceptance, `CLAUDE.md`, `smoke-tests-pending.md` |
| **F. New command** | F1 (G-13, absorbs G-20 + G-21) | new `.claude/commands/stress-test.md` |
| **G. Spec-authoring convention** | G1 (G-22) | `plan-review.md` §3a, `UI-UX KBs` index |

---

# Section A — Wargame planning (the falsifiable plan)

**What (cluster).** In the source, `/plan` and the MAW worker plan-doc gained four coordinated elements, gated to Complexity ≥ Medium: (1) per-step **Expected Observations & Failure Signals**; (2) an **Abort conditions** section; (3) **`[EDIT]`/`[RUN]`/`[DECIDE]` closure-owner tags** on every step; and `/implement` gained (4) the **consuming-side wiring** that makes 1–3 load-bearing at execution time.

**Domain-fit translation.** app-blueprint's `/plan` Output Format has the identical spine — Implementation Steps ([plan.md:106](.claude/commands/plan.md#L106)) → Testing Checklist (:120) → Rollback Plan (:128) → Risks (:131) → Complexity marker Simple/Medium/Complex (:136). The MAW worker-doc twin has Constraints/non-goals ([MULTI_AGENT_WORKFLOW.md:263](docs/MULTI_AGENT_WORKFLOW.md#L263)) → Granular audit (:267). "Expected observation" maps cleanly to app-dev artifacts: a migration applied, `supabase gen types` regenerated, an RLS query returning the expected rows, a component rendering, a Playwright assertion passing. The `[RUN]` closure tag reinforces app-blueprint's **existing** smoke truth-gate — a `[RUN]` step must be mirrored into `docs/smoke-tests-pending.md`, which is already the single source of truth for manual verification. This is the cluster's strongest fit: it hardens the plan→ship pipeline app-blueprint already has.

### Decisions

| Decision | Choice | Reasoning | Date |
|---|---|---|---|
| Gate for Expected-Obs / Abort | "Complexity ≥ Medium" reusing plan.md's existing Simple/Medium/Complex marker (:136) | The marker already exists; no new taxonomy | 2026-07-10 |
| `[RUN]` tag ↔ smoke ledger | Every `[RUN]` step must carry a smoke-test ID mirrored into `docs/smoke-tests-pending.md` | Reuses app-blueprint's committed ship-gate ledger rather than inventing a parallel one | 2026-07-10 |
| Source `[SKILL-1]`/`[PROCESS-2]` citation | Drop; replace with plain-prose "judgment-based signals, not hard-coded if/then trees" | Those tags don't resolve in app-blueprint's LESSONS.md | 2026-07-10 |
| "Kai-RE"/OpenClaw provenance line in plan.md | Drop the downstream-product name; keep the discipline | Kai-RE is an agent-blueprint artifact; meaningless to app-blueprint users | 2026-07-10 |

### Edit blocks

#### Edit A1.1 — G-1: `plan.md` Expected Observations & Failure Signals

**Anchor (verbatim, exists today at [plan.md:119](.claude/commands/plan.md#L119)):**
```
[Continue for all steps...]

### Testing Checklist
```

**Change:** insert a new subsection between the steps and the Testing Checklist:
```
[Continue for all steps...]

### Expected Observations & Failure Signals (Complexity ≥ Medium)
For each step with a non-obvious failure mode (not mechanically every step), in one or two lines:
- **Expected observation** — exactly what you should see if the step worked: an artifact, output, or state you can point at (a migration applied, `gen types` regenerated, an RLS query returning the expected rows, a component rendering, a Playwright assertion green).
- **Most-likely failure** — the single most probable way it goes wrong, the signal that shows it, and the counter-move.
- **Fork-trigger (only if a real branch exists)** — "if you observe X, take route B": an observable trigger plus BOTH routes designed here, never a bare judgment call left dangling.
Omit for Low-complexity plans (see the Complexity marker below). Keep these as judgment-based signals, NOT hard-coded if/then trees.

### Testing Checklist
```

#### Edit A1.2 — G-1: `MULTI_AGENT_WORKFLOW.md` worker-doc twin

**Anchor (verbatim, exists today at [MULTI_AGENT_WORKFLOW.md:263](docs/MULTI_AGENT_WORKFLOW.md#L263)):**
```
## Constraints / non-goals
- [What NOT to touch]
- [Scope boundaries]

## Granular audit
```

**Change:** insert the twin blocks (Expected observations + Abort conditions, A2 below) between Constraints and Granular audit:
```
## Constraints / non-goals
- [What NOT to touch]
- [Scope boundaries]

## Expected observations & failure signals
(Include only at Complexity ≥ Medium; Low-complexity plans may omit — same gate as `/plan`.)
For each step with a non-obvious failure mode (not mechanically every step):
- **Expected observation** — an artifact, output, or state you can point at.
- **Most-likely failure** — the most probable failure, its signal, and the counter-move.
- **Fork-trigger (only for a real branch)** — "if you observe X, take route B": observable trigger + both routes pre-designed here.
Keep these judgment-based, NOT hard-coded if/then trees.

## Abort conditions
(Include only at Complexity ≥ Medium; Low-complexity plans may omit — same gate as `/plan`.)
- **Blocked — escalate/stop:** inventing a required input, mutating the wrong target, or crossing a real guardrail. Name these; on hit, stop and flag — do NOT improvise.
- **Friction — push through:** named transient obstacles (retries, noisy output, recoverable errors) that are NOT reasons to stop. Name them so the executor doesn't over-stop.

## Granular audit
```

#### Edit A2.1 — G-2: `plan.md` Abort conditions

**Anchor (verbatim, exists today at [plan.md:128](.claude/commands/plan.md#L128)):**
```
### Rollback Plan
1. [How to undo if something goes wrong]

### Risks
```

**Change:** insert Abort conditions between Rollback and Risks:
```
### Rollback Plan
1. [How to undo if something goes wrong]

### Abort conditions (Complexity ≥ Medium; Low-complexity plans may omit)
- **Blocked — escalate/stop:** conditions where continuing would invent a required input (one whose invention changes a persisted or irreversible outcome — a row written, the wrong target mutated), or cross a real guardrail. Name them; on hit, stop and flag — do NOT improvise.
- **Friction — push through:** expected obstacles (transient errors, retries, noisy output) that are NOT reasons to stop. Name them so the executor doesn't over-stop.

### Risks
```

#### Edit A3.1 — G-5: `plan.md` closure-owner tags

**Anchor (verbatim, exists today at [plan.md:74-76](.claude/commands/plan.md#L74) — line refs corrected by plan-review; the Atomic/Ordered/Specific bullets under "### 4. Break Down into Steps", which is :71):**

> *(Author's note for the implementer: read `plan.md:71-77` before applying — the three bullets are `**Atomic**` (:74) / `**Ordered**` (:75) / `**Specific**` (:76); append the closure-owner bullet + the two rule paragraphs immediately after `**Specific**` at :76. Also retag the Step 1 / Step 2 example headings at :108/:113 as `#### Step 1: [EDIT] [Description]` and `#### Step 2: [RUN] [Description]` with a `**Smoke-test ID:**` line on the `[RUN]` example.)*

**Change (append after the `**Specific**` bullet):**
```
- **Closure-owner tagged** — every step heading carries exactly one inline tag naming who can close it and how (below). This makes it structurally impossible to fool yourself that behavior is validated by editing files.

**Closure-owner tags (required on every step).** Prefix each step heading with one of:
- **`[EDIT]`** — the agent closes this by changing repo files. Done when the diff lands.
- **`[RUN]`** — live validation only the user can perform (a real end-to-end exercise against the running app). **Can NEVER be closed by editing.** Every `[RUN]` step must also be written into `docs/smoke-tests-pending.md` with a stable ID, so the true-closure signal lives on the committed ship-gate ledger, not in this plan.
- **`[DECIDE]`** — a strategy/architecture call not blocking the near-term edits. Maps to the scope-graduation gate (`CLAUDE.md` → verification & safety disciplines): a `[DECIDE]` gating a prod-mutating action must be resolved before that action, not silently carried. **If it is architecturally upstream** — it reshapes downstream work, so deciding it late forces re-architecture — flag it **decide-early** and surface it in `/plan-review` Step 6. A "decide early" label is not a decision.

**Closure-owner classification rule (no loophole).** Any step whose success claim depends on *runtime behavior* — the running app actually doing the thing (a migration taking effect, an email sending, a webhook firing, a role gate actually blocking) — MUST be `[RUN]`. "The diff landed" NEVER closes a behavior claim; only an observed live exercise does. A plan for behavior-changing work with **zero `[RUN]` steps is a red flag** — justify it in one line ("why does nothing here require live validation?") or a behavior step is mis-tagged `[EDIT]`.
```

#### Edit A4.1 — G-4: `implement.md` extraction list

**Anchor (verbatim, exists today at [implement.md:62](.claude/commands/implement.md#L62)):**
```
Read the plan file and extract:
```

**Change:** add a bullet to the extraction list:
```
- The plan's **Expected Observations & Failure Signals** and **Abort conditions** sections, when present (Complexity ≥ Medium plans carry them): per step, the observation that confirms it worked, any named fork-triggers, and the conditions that mean stop-and-escalate vs. push-through.
```

#### Edit A4.2 — G-4: `implement.md` executor confirmation

**Anchor (verbatim, confirmed by plan-review at [implement.md:174](.claude/commands/implement.md#L174)):**
```
Wait for ALL parallel agents to complete before moving to the next batch.
```
Land the confirmation rule immediately after this line, before post-batch validation. (app-blueprint's implement.md has no "DETERMINISTIC SCRIPTS" block like the source; the "Conflicting changes" recovery bullet at :263 is the related concurrency note.)

**Change (insert a confirmation rule):**
```
**Confirm each step against its Expected Observation (when the plan carries one).** Before advancing past a step, point at the artifact/output/state the plan named — the edit or agent returning "success" is not the observation. On a named fork-trigger, take the route the plan already designed. On an Abort condition, stop and flag — do NOT improvise past it. Report only work you can cite observed evidence for, never a self-reported "done."
```

#### Edit A4.3 — G-4: `implement.md` Step 6 Summary Report

**Anchor correction (plan-review resolved D-4):** the source's `**No gaps:**` spec-compliance bullet has **no counterpart in app-blueprint's `implement.md`** — there is no post-batch spec-compliance checklist here; grep for `No gaps` returns zero hits. The real post-batch surface is `## Step 6: Summary Report` ([implement.md:207](.claude/commands/implement.md#L207)) with `### Remaining Issues` (:236) and a `### Next Steps` checklist (:239). This edit therefore **adds** an observation-confirmation line to the Step 6 report rather than sharpening nonexistent text.

**Anchor (verbatim, exists today at [implement.md:236](.claude/commands/implement.md#L236)):**
```
### Remaining Issues
```

**Change:** add a report line asserting observation-confirmation as part of the summary (exact placement — under Remaining Issues or as a Step 6 checklist item — resolved at apply time):
```
- **Expected-observation confirmation:** for every implemented step that carried an Expected Observation (Complexity ≥ Medium plans), the report states the observation was confirmed to *hold* — not merely that the step ran. Any step whose observation could not be confirmed is listed here as a remaining issue, not silently passed.
```

---

# Section B — Dispatch & lockdown gates

### Decisions

| Decision | Choice | Reasoning | Date |
|---|---|---|---|
| Blind-executability gate placement | `orchestrate.md:113` worker-doc creation step + MAW Lifecycle bullet (:285) | Both are where the brief is authored pre-dispatch | 2026-07-10 |
| `[VERIFY…]` ledger citation | Drop source's `docs/context-instrumentation-spec.md` example (agent-blueprint file); keep the idiom | That spec doesn't exist here | 2026-07-10 |
| Upstream-fork field case (Kai-RE IP fork) | Drop the named product; keep "a 'decide early' label is not a decision" rule | Kai-RE is an agent-blueprint artifact | 2026-07-10 |

### Edit blocks

#### Edit B1.1 — G-3: `orchestrate.md` blind-executability gate

**Anchor (verbatim, exists today at [orchestrate.md:113](.claude/commands/orchestrate.md#L113)):**
```
1. Create `docs/plans/[phase-slug]/worker-N-[task-slug].md` using the structure from [MULTI_AGENT_WORKFLOW.md → Worker plan docs](../../docs/MULTI_AGENT_WORKFLOW.md#worker-plan-docs). Fill in: Task, Files involved, Constraints / non-goals. Leave the audit / recommendations / PM annotations / implementation log sections as stubs.
```

**Change:** append to that bullet:
```
 **Blind-executability gate (before dispatch):** could the worker run this brief end-to-end without asking a single question? Every anticipated question is a missing decision or a missing fork-trigger — resolve it into the plan now.
```

#### Edit B1.2 — G-3: `MULTI_AGENT_WORKFLOW.md` Lifecycle mirror

**Anchor (verbatim, exists today at [MULTI_AGENT_WORKFLOW.md:285](docs/MULTI_AGENT_WORKFLOW.md#L285)):**
```
- Created by PM in Phase 4 with skeleton + Task / Files / Constraints filled in.
```

**Change:**
```
- Created by PM in Phase 4 with skeleton + Task / Files / Constraints filled in. **Blind-executability gate before dispatch:** could the worker run this doc end-to-end without asking a single question? Every question you can anticipate is a missing decision or fork-trigger — resolve it into the plan now.
```

#### Edit B2.1 — G-6: `plan-review.md` §3a in-spec `[VERIFY…]` ledger

**Anchor (verbatim, exists today at [plan-review.md:82](.claude/commands/plan-review.md#L82)):**
```
See `docs/LESSONS.md` `[PROCESS-1]` for the full incident behind this rule.
```

> *(Author's note: app-blueprint's `docs/LESSONS.md` has no `[PROCESS-1]` entry. This anchor line itself is a **dangling citation already present in the receiving file** — the port should either (a) add a real `[PROCESS-1]` to LESSONS.md, or (b) rewrite this line to plain prose. Flagged as an open decision, §Open decisions D-1.)*

**Cross-ref (plan-review finding).** The `[VERIFY…]` / `[VERIFY BEFORE SHIPPING]` tag idiom already lives across app-blueprint's KB corpus (`docs/Test KBs/*`, `docs/AI KBs/*`, `BILL_KB_2`, `OBS_KB_00_Index.md:128`) — so this vocabulary is *familiar* in the repo; what is genuinely absent is the **in-`/plan-review`-Step-3a ledger discipline** that turns those tags into a lockdown gate. The port should note the tag reuses an existing idiom rather than inventing one.

**Change:** replace/extend with the ledger paragraph (citation-neutral form):
```
**In-spec verification ledger (`[VERIFY…]` tags).** A well-formed spec carries its own verification ledger inline: every host-capability or environment claim it leans on — a Supabase feature is enabled, an env var is set on the target, an extension is installed, an edge function is deployed — is tagged `[VERIFY per env]` / `[VERIFY BEFORE SHIPPING]` at the point of use, and each is resolved against the real project before lockdown. **A resolution must carry its evidence:** rewrite in place as `[RESOLVED: checked <what> on <where>]` (claim held) or `[RESOLVED, corrected: …]` (claim was wrong, here's the truth). A bare `[RESOLVED]` with no how-verified note is unfalsifiable and counts as UNRESOLVED in the Step 6 check. When you see an untagged environment claim, flag it and recommend a `[VERIFY…]` tag; an unresolved `[VERIFY…]` blocks lock.
```

#### Edit B2.2 — G-6: `plan-review.md` Step 6 pattern list

**Anchor (verbatim, confirmed by plan-review at [plan-review.md:157](.claude/commands/plan-review.md#L157), under `### 6a: Scan for unresolved-fork patterns` at :150):**
```
- Phrases like `open decision`, `unresolved`, `to be determined`, `TBD`, `revisit`, `figure out later`
```
add a pattern bullet after it:

**Change:** add a pattern bullet:
```
- `[VERIFY…]` tags — `[VERIFY per env]`, `[VERIFY BEFORE SHIPPING]`, or any `[VERIFY …]` variant (see §3a). An unresolved `[VERIFY…]` is an environment claim the spec hasn't checked against the real project; it blocks lock. It is closed only by rewriting it in place with an evidence-bearing note — `[RESOLVED: checked <what> on <where>]` or `[RESOLVED, corrected: …]`. A **bare `[RESOLVED]` with no how-verified note counts as UNRESOLVED**, and deleting the tag without a resolution note does not close it either.
```

#### Edit B3.1 — G-8: `plan-review.md` execution-time fork-trigger exclusion

**Anchor (verbatim, exists today at [plan-review.md:166](.claude/commands/plan-review.md#L166) — line ref corrected by plan-review, was cited :167):**
```
- The match is inside a "Resolved decisions" or post-release "revisit triggers" section (`"revisit if X happens"`, `"revisit in a later release"`) — those are deliberate future milestones, not unresolved forks within this release's scope.
```

**Change:** add an exclusion bullet after it:
```
- The match is an **execution-time fork-trigger** ("if you observe X, take route B" — a deliberately retained runtime branch), not the design-time fork Step 6 exists to resolve. Such a fork-trigger is legitimate (not UNRESOLVED) **IFF all three hold**: (a) it names an **observable trigger**; (b) **both routes are fully pre-designed** — the plan defers WHICH route runs, never the DESIGN of a route; and (c) the observable is **runtime-evaluable without making the deferred choice**. A branch failing any leg — a bare "maybe A or B", or a named-but-undesigned route B — is still UNRESOLVED. (This ties to the per-step Expected Observations element `/plan` emits at Complexity ≥ Medium, where legitimate fork-triggers originate.)
```

#### Edit B4.1 — G-12: `plan-review.md` upstream-forks-block-lock

**Anchor:** same exclusions block; add both the deferrable-exclusion bullet and the inverse rule after B3.1.

**Change (deferrable exclusion bullet):**
```
- The match is a **genuinely-deferrable open item** parked in the spec's Deferred / Out-of-Scope section under **"Genuinely deferrable"** *and* carrying a recorded why-safe-to-sit rationale (nothing downstream depends on it this release). A properly-justified deferrable is a decision, not an omission — do not false-flag it.
```

**Change (inverse rule — insert immediately before the "A match qualifies as UNRESOLVED only when…" closing line):**
```
**Upstream forks DO block (the inverse rule).** An open design fork classified as **architecturally upstream** — it reshapes downstream work, so delaying it is expensive — is UNRESOLVED whenever it lacks a recorded decision, even if the spec files it under "deferred." Specifically: any open fork that would force a re-architecture if decided late blocks lock regardless of which section it sits in. **A "decide early" label is not a decision** — a fork marked "decide early — it shapes the architecture" yet carried unresolved across releases is exactly the failure this catches. Flag such items as UNRESOLVED and name them in the FAIL list.
```

---

# Section C — DB modeling (the sanctioned denormalized-cache shape)

**What (G-7).** agent-blueprint's new `OC_KB_16_Datastore_Modeling.md` defines the **one sanctioned shape of a second copy of a fact**: a *named denormalized cache over a single canonical source*, permitted only when all three conditions hold — (1) the cache names its owner (the schema doc states which location is canonical, which is the cache); (2) it is co-written with its own row, copied FROM canonical at write time, never independently hand-edited; (3) a canonical change fans out — you owe the sweep, or you declare the cache display-only. If any condition fails, you are back in the banned "same fact in two stores, no canonical source, drifts silently" trap.

**Domain-fit translation.** This is the strongest "DB-focused source pattern fits app-blueprint" item, precisely because app-blueprint apps attach to Supabase. The source's spreadsheet-tab mechanics (round-trip-is-the-cost-unit, hot-fields-on-a-tab, VLOOKUP ban) are agent-datastore-specific and do **not** port. But the *denormalization-vs-single-source-of-truth reconciliation* is a live Postgres concern: a denormalized column (`orders.customer_name` alongside `orders.customer_id`), a cached count, a status mirror. The three conditions translate directly — Postgres analogues are: (1) a schema comment / KB entry declaring the canonical table; (2) the cache written in the same `INSERT`/trigger as its row, sourced from the canonical row (a trigger or generated column, never a client hand-edit); (3) an `AFTER UPDATE` trigger fanning the change out, or an explicit "point-in-time snapshot, display-only" declaration. This lands as a new Supabase Structure KB plus a `CLAUDE.md` DO-NOT.

**Cross-ref (plan-review finding — adjacent existing material to link, not duplicate).** app-blueprint already has two footholds the new `SB_KB_13` should reference rather than restate: `SB_KB_5_Dual_Track_Admin_Session.md:202` demonstrates the *mechanic* (denormalizing a flag via trigger) without the canonical-source discipline, and `BILL_KB_00_Index.md:7` already states the *principle* for one domain ("Stripe is the canonical source of truth… the local DB is a cache"). `SB_KB_13` generalizes that principle into the reusable three-condition rule and should cross-link both as worked examples.

### Decisions

| Decision | Choice | Reasoning | Date |
|---|---|---|---|
| Target for the discipline | New `SB_KB_13_Denormalized_Cache_Discipline.md` + index entry + `SB_KB_00` "Never" bullet | app-blueprint's DB canon lives in the SB_KB set; a focused KB matches the existing granularity | 2026-07-10 |
| Spreadsheet mechanics (round-trips, hot-fields, VLOOKUP) | **Do not port** | Agent-datastore-specific; irrelevant to Postgres | 2026-07-10 |
| CLAUDE.md DO-NOT | Add a one-line hard constraint pointing at SB_KB_13 | app-blueprint's `## DO NOT` is empty scaffold; this is a real hard constraint | 2026-07-10 |

### Edit blocks

#### Edit C1.1 — G-7: new `docs/Supabase Structure KBs/SB_KB_13_Denormalized_Cache_Discipline.md`

**Change (new file — Postgres-translated):**
```
# SB_KB_13 — Denormalized cache discipline (the one sanctioned duplicate)

A denormalized copy of a fact — `orders.customer_name` beside `orders.customer_id`, a cached count, a status mirror — is a facts-diverge-silently trap **unless** it is shaped as a **named cache over a single canonical source.** All three conditions must hold, or it is the banned anti-pattern:

1. **The cache names its owner.** The schema (a column `COMMENT`, this KB, or the migration) states which table is canonical and which column is the cache. There is never ambiguity about which one wins.
2. **Co-written from canonical, never hand-edited.** The cache is populated in the same write that creates its row — a `BEFORE INSERT` trigger, a generated column, or an RPC — sourced FROM the canonical row at that moment. It is never typed in independently and never edited in place by a client. (Per-row co-write guarantees only that *this* row's cache matched canonical *at write time* — nothing about later.)
3. **A canonical change fans out — you owe the sweep.** Editing the canonical record leaves every previously-written cache stale. Handle it one of two honest ways: an `AFTER UPDATE` trigger on the canonical table **rewrites the dependent cache columns**, OR you declare the cache **display-only / point-in-time** in the schema doc (it answers "what was true when this row was written"; the FK-resolved canonical value wins for anything current). You may NOT let it drift silently and then treat it as authoritative.

If any condition fails you are back in the trap: an unowned copy, one a second write path can hand-edit, or one whose canonical source can change with no sweep and no display-only declaration.

**Installed 2026-07-10, not yet proven in a live run** — ported from agent-blueprint `OC_KB_16`, translated from its sheet-tab datastore to Postgres. The RLS/trigger mechanics (AFTER-trigger post-commit, SECURITY DEFINER helpers) follow `SB_KB_00` canon.
```

#### Edit C1.2 — G-7: `SB_KB_00_Index.md` "Never" bullet

**Anchor (verbatim, exists today at [SB_KB_00_Index.md:47](docs/Supabase%20Structure%20KBs/SB_KB_00_Index.md#L47)):**
```
**Never:**
- Run Postgres TCP queries from Next.js middleware (Edge Runtime doesn't support TCP)
```

**Change:** add a bullet to the "Never" list:
```
- Store the same fact in two columns/tables with no declared canonical owner — a denormalized copy is sanctioned only as a named cache written from canonical with a fan-out sweep or a display-only declaration (see `SB_KB_13`)
```

#### Edit C1.3 — G-7: `CLAUDE.md` DO-NOT

**Anchor (verbatim, exists today at [CLAUDE.md:138](CLAUDE.md#L138)):**
```
## DO NOT
[Empty — add hard constraints as they're discovered during development]
```

**Change:**
```
## DO NOT
- Denormalized copies inside the database silently diverge once a separate write path touches one. A second copy of a fact is sanctioned only when shaped as a named cache over a single canonical source — see `docs/Supabase Structure KBs/SB_KB_13_Denormalized_Cache_Discipline.md` for the only allowed form.
[Add additional project-specific hard constraints as they're discovered during development]
```

---

# Section D — Command-authoring lessons

**What.** Two lessons from agent-blueprint's 2026-07-07 skill-audit panel: **[PROCESS-8]** — a consumed-verbatim artifact (seed prompt, worker-prompt template, emit template, executable block) is a *tool*, not prose: compress the teaching body around it, never collapse the artifact itself to a pointer. **[PROCESS-9]** — the *co-load test*: a duplicated rule is deliberate reinforcement only if its copies fire in contexts where the others are absent; if two copies always enter context together, one is bloat → pointer; if they live in independently-loaded contexts (separate command files, fresh-subagent prompts), every copy stays inline.

**Domain-fit translation.** Pure command-authoring discipline — app-blueprint ships 25+ `.claude/commands/` and has `docs/AUTHORING_COMMANDS.md` §6 "Brevity" (the exact surface these sharpen). app-blueprint's commands are full of consumed-verbatim artifacts (the `/implement` parallel-prompt template, `/orchestrate` worker prompts, the seed prompt in MAW) and cross-entry-point duplicated guardrails (the Refutation Pass in audit-code/audit-rls/audit-full). Both lessons apply directly. Because app-blueprint's `LESSONS.md` uses its own `[PROCESS-N]` numbering, these land as **app-blueprint [PROCESS-1] and [PROCESS-2]** (first entries in the Process category) AND as a caveat paragraph in AUTHORING_COMMANDS §6.

### Decisions

| Decision | Choice | Reasoning | Date |
|---|---|---|---|
| Numbering | Assign app-blueprint's own `[PROCESS-1]` (consumed-verbatim artifact) and `[PROCESS-2]` (co-load test) | app-blueprint LESSONS.md is empty of PROCESS entries; don't inherit source's [PROCESS-8/9] numbers | 2026-07-10 |
| AUTHORING §6 | Add a "not everything compresses" caveat paragraph + pointer to the two lessons | §6 currently says "shorter is better" unqualified — these are the exceptions | 2026-07-10 |
| Source incident detail (MAW seed, curl blocks, debug.md) | Keep the *principle*, trim agent-blueprint-specific file examples to app-blueprint equivalents | Examples must resolve locally | 2026-07-10 |

### Edit blocks

#### Edit D1.1 — G-10/G-11: `AUTHORING_COMMANDS.md` §6 caveat

**Anchor (verbatim, exists today at [AUTHORING_COMMANDS.md:150-154](docs/AUTHORING_COMMANDS.md#L150)):**
```
## 6. Brevity

Shorter commands are followed more reliably. Keep the body focused on the procedure; push deep
reference material into a KB and link to it. If a command has grown to cover several distinct jobs,
that's a signal to split it.
```

**Change:** append two caveat paragraphs:
```
**Two things resist compression — know them before you cut:**

- **A consumed-verbatim artifact is a tool, not prose.** Paste-ready seed prompts, worker-prompt templates, structured-output/emit templates, and executable command blocks are *pasted or run verbatim* by a consumer — their apparent redundancy with the explanation around them IS the design (the body teaches *why*; the artifact is the thing that runs). Compress the explanation; leave the artifact whole. Collapsing it to a pointer forces a downstream consumer to reconstruct a contract from prose. (app-blueprint `[PROCESS-1]`.)
- **A duplicated rule passes the co-load test or it's bloat.** A rule appearing in more than one place is deliberate reinforcement only if its copies fire in contexts where the others are absent. If two copies always enter context together (same file, same prompt) → one is bloat, reduce to a pointer. If they live in independently-loaded contexts (separate command files that are distinct entry points, or a fresh-subagent prompt that ships to a context the parent never shares) → keep every copy inline, because a cross-context pointer only fires if the agent follows it. (app-blueprint `[PROCESS-2]` — e.g. the Refutation Pass duplicated across `audit-code` / `audit-rls` / `audit-full` is legitimately inline, each being a standalone entry point.)
```

#### Edit D1.2 — G-10/G-11: `LESSONS.md` [PROCESS-1] and [PROCESS-2]

**Anchor (verbatim, exists today at [LESSONS.md:43](docs/LESSONS.md#L43)):**
```
## Process & Verification Patterns
```

**Change:** add two entries under that heading (following the LESSONS.md `[CATEGORY-N]` entry format at :54):
```
### [PROCESS-1] A consumed-verbatim artifact is a tool, not prose — compress the body around it, never the artifact

**Rule:** When trimming a command/KB for length, split the text into *teaching prose* (compresses freely) and *consumed-verbatim artifacts* — paste-ready seed prompts, worker-prompt templates, emit templates, executable blocks. The artifact's apparent redundancy with nearby explanation is functional: the body teaches why, the artifact is pasted or run. Compress the body; leave the artifact whole. Pointer-izing it forces a consumer to reconstruct a contract from prose.

**Why:** Ported from agent-blueprint's 2026-07-07 skill-audit, where a judge proposed compressing several blocks that *read* as duplicative but were consumed verbatim by fresh-context workers — the redundancy was the design.

**How to apply:** Trigger is proposing to compress or pointer-ize a block during a brevity pass. Ask: is this read by a human/model, or pasted/run verbatim by a consumer? Verbatim-consumed → it's a tool; compress around it, leave it intact. Installed 2026-07-10, not yet proven in a live run.

### [PROCESS-2] The co-load test separates deliberate reinforcement from bloat

**Rule:** A rule appearing in more than one place is deliberate reinforcement only if its copies fire where the others are absent. Co-load test: if two copies always enter context together (same file/prompt) → one is bloat, reduce to a pointer at the canonical copy. If they live in independently-loaded contexts (separate command entry points, fresh-subagent prompts) → keep every copy inline, because a cross-context pointer only fires if followed.

**Why:** Same 2026-07-07 audit. app-blueprint's own Refutation Pass is triple-stated across `audit-code`/`audit-rls`/`audit-full` and stays inline — each is a standalone entry point.

**How to apply:** Trigger is calling a duplicated rule "reinforcement" (keep) or "redundancy" (cut). Run the test: do these copies always load together? Same-context → pointer; cross-context → keep inline. Pairs with [PROCESS-1]. Installed 2026-07-10, not yet proven in a live run.
```

---

# Section E — Safety / enforcement disciplines

**What.** Three disciplines from agent-blueprint's `OC_KB_11_Safety_Primitives.md` and `CLAUDE.md`: **G-9** the *BLOCKED corollary* — never invent a required input (one whose invention changes a persisted/irreversible outcome); classify required-vs-soft, and on an unresolved required input, log the exact gap, stop, escalate. **G-14** *enforcement-class labeling* — tag each safety/access rule SOFT (only the agent's behavior stops a breach) vs HARD (host-enforced gate), and disclose the soft promise and the hard gate together; a SOFT rule demands MORE care because it has no backstop. **G-15** *git-tracked ledger* — a gitignored readiness/smoke ledger runs green locally but never travels to a derived package; it must be committed to be a supervision surface.

**Domain-fit translation.** G-9 maps onto app-blueprint's existing fail-loud-or-closed reference (`OBS_KB_5_Defensive_Writes.md`, already cited in CLAUDE.md's verification layer) — "never invent a required input" is a defensive-write primitive; it also sharpens `/implement`'s Abort-conditions consumption (A4). G-14 maps onto the audit acceptance criteria: app-blueprint's `/audit-rls` and `/audit-code` already run a Refutation Pass; an enforcement-class tag (is this RLS policy HARD/host-enforced, or a SOFT client-side check?) is a natural classification step — and RLS-vs-client-check is *exactly* the SOFT/HARD distinction in a Supabase app. G-15 maps directly onto `docs/smoke-tests-pending.md` (the committed ledger app-blueprint already relies on) — a header assertion that it must stay version-controlled.

### Decisions

| Decision | Choice | Reasoning | Date |
|---|---|---|---|
| G-9 target | `OBS_KB_5_Defensive_Writes.md` (near Primitive 9, fail-loud-or-closed) — the KB CLAUDE.md already references | Keeps the defensive-write canon in one place | 2026-07-10 |
| G-14 target | Add an enforcement-class classification step to `/audit-rls` + `/audit-code` acceptance; RLS-vs-client-check is the archetypal SOFT/HARD split | Audits are where the label earns its keep | 2026-07-10 |
| G-15 target | One-line header assertion in `docs/smoke-tests-pending.md` + a `/ship` smoke-gate note | It's the committed ledger app-blueprint already treats as source of truth | 2026-07-10 |
| G-14 placement confidence | **medium** (placement-cost judge) — confirm in plan-review whether audit acceptance or a cross-cutting KB is the better home | Open decision D-2 | 2026-07-10 |

### Edit blocks

#### Edit E1.1 — G-9: `OBS_KB_5_Defensive_Writes.md` BLOCKED corollary

**Anchor (verbatim, confirmed by plan-review at [OBS_KB_5_Defensive_Writes.md:35](docs/Obs%20KBs/OBS_KB_5_Defensive_Writes.md#L35)):**
```
## Primitive 9 — Fail loud or fail closed; never fail silent-open
```
insert the BLOCKED corollary within/after this section.

**Change (insert near Primitive 9):**
```
**The BLOCKED corollary — never invent a required input.** Not every unverified assumption is safe to proceed under; classify before you act. A **required** input is one whose invention would change a *persisted or irreversible* outcome — the row that gets written, the target that gets mutated, the email that sends. When a required input is unresolved, the task is **BLOCKED**: log the *exact* missing input, stop, and escalate. Inventing it is prohibited — a guessed required input is a silent-open failure. A **soft** assumption is a stateable default you can proceed under and surface for correction. The test: *would inventing this change a persisted or irreversible outcome?* Yes → required → BLOCKED. No → soft → proceed-and-surface. Agents fabricate missing inputs to satisfy an output-format instruction rather than escalate the gap; the fail-loud BLOCKED path is what stops the fabrication. Installed 2026-07-10, not yet proven in a live run.
```

#### Edit E2.1 — G-14: `/audit-rls` enforcement-class step

**Anchor (verbatim, exists today at [audit-rls.md:188](.claude/commands/audit-rls.md#L188), the Refutation Ledger line):**
```
Each refuter returns, per finding, **CONFIRMED** · **OVERSTATED** · **REFUTED** with a confidence and quoted SQL. Record a **Refutation Ledger** (Table | Policy | Refuter verdict | Confidence | Quoted SQL) that supersedes the binary checkbox.
```

**Change:** append an enforcement-class note:
```

**Enforcement-class tag (SOFT vs HARD).** For each access rule the spec or code relies on, label its enforcement: **HARD** = host/DB-enforced and unbypassable (an RLS policy, a `CHECK` constraint, a `SECURITY DEFINER` boundary), or **SOFT** = enforced only by application behavior (a client-side filter, a "the UI never shows this" assumption, a service-role query that trusts its caller). The label classifies *enforcement, not bindingness* — a SOFT rule binds exactly as much, and demands MORE care because nothing but the code stands between it and a breach. Flag any data-isolation guarantee resting on a SOFT check where a HARD one (RLS) is available: a client filter presented as tenant isolation is a promise dressed as a wall.
```

#### Edit E2.2 — G-14: `/audit-code` enforcement-class note

**Anchor (verbatim, exists today at [audit-code.md:249](.claude/commands/audit-code.md#L249), the Refutation Ledger line):** mirror the E2.1 tag (SOFT vs HARD, application-code framing) as a one-line acceptance note. *(Shorter than the RLS version — the RLS command is where the label most earns its keep.)*

#### Edit E3.1 — G-15: `docs/smoke-tests-pending.md` git-tracked assertion

**Anchor (verbatim, exists today at [smoke-tests-pending.md:5](docs/smoke-tests-pending.md#L5)):**
```
This is the single source of truth for outstanding manual verification work. Don't re-list these tests in commits, PR bodies, `CLAUDE.md`, `AGENTS.md`, chat threads, or release notes — link to test IDs instead (e.g., "see `PW-H1` in `docs/smoke-tests-pending.md`").
```

**Change:** append a sentence:
```
 **This file must stay git-tracked.** A gitignored or untracked readiness ledger runs green in your working tree, then silently never travels with the repo — its unchecked `[RUN]` boxes rot while the work lands in commit prose. The ledger is a supervision surface only because it is committed.
```

---

# Section F — New command: `/stress-test`

**What (G-13, absorbing G-20 + G-21).** A new command: N parallel judges, each LOCKED to one adversarial lens, returning **un-applied** verdicts + severity-ranked findings (BLOCKER/MAJOR/MINOR) each judge checks itself against the spec and ground truth — "the panel reports; the PM decides." Optional fix pass with **disjoint file ownership** (G-20: every file has exactly one fixer-owner; concurrent fixers never share a file), then the SAME lenses re-verify (FIXED/PARTIALLY_FIXED/NOT_FIXED/REGRESSED + fresh scan for what the fix broke). **G-21** rides along: if more than one model tier is available, split the panel across tiers — model diversity is lens diversity.

**Domain-fit translation.** app-blueprint has no `/stress-test`; it has single-auditor `/audit-code` (with a Refutation Pass) and spec-gating `/plan-review`. The panel *composes* with both rather than replacing them — use it when a change set is large, canonical (framework/KB surfaces), or multi-agent-authored. The lens table retargets cleanly to app-dev surfaces (canon-consistency vs. CLAUDE.md/KBs, evidence-fidelity vs. primary sources, regression-structure vs. dangling refs/stale imports, completeness vs. the spec's items, downstream-redteam vs. the careless future reader). **This very review** was a stress-test panel — it's the pattern applied to itself. G-20's disjoint-ownership rule is independently valuable even if the command isn't ported wholesale: app-blueprint's `/implement` batches say "no dependencies between files in a batch" ([implement.md:85](.claude/commands/implement.md#L85)) but never "no *shared* files" — the one-owner invariant is a real gap there.

**Placement confidence: medium** (placement-cost judge). This is a whole new command (~90 lines) — the largest single item. Options: (a) port as a full command now; (b) port G-20's disjoint-ownership invariant into `/implement` now and park the full command with a promotion trigger. **Open decision D-3.**

### Decisions

| Decision | Choice | Reasoning | Date |
|---|---|---|---|
| Lens table | Retarget the 6 default lenses to app-dev surfaces; drop agent-runtime examples | The lenses are surface-agnostic; only examples change | 2026-07-10 |
| Relationship to existing audits | Position as composing with `/audit-code` + `/plan-review`, not replacing | Matches source's own framing and app-blueprint's audit set | 2026-07-10 |
| Model-mix (G-21) | Keep as a one-line note in Step 2 (only meaningful when the harness offers >1 tier, as this session did) | Low cost, real value on mixed-model runs | 2026-07-10 |
| G-20 disjoint-ownership | Port into `/implement` regardless of D-3, as a stated concurrency-safety invariant | Independently load-bearing; app-blueprint's batch rules omit it | 2026-07-10 |

### Edit blocks

#### Edit F1.1 — G-13: new `.claude/commands/stress-test.md`

**Change:** new command file, app-dev-retargeted, following `docs/AUTHORING_COMMANDS.md` conventions (description = WHEN to use; argument-hint frontmatter; body focused on procedure). Port the source's 6-lens table, Step 1 scope / Step 2 lenses (+ model-mix note) / Step 3 run-panel / Step 4 synthesize-don't-auto-fix / Step 5 disjoint-ownership fix pass / Step 6 same-lens re-verify structure, with: lens examples retargeted to CLAUDE.md/SB_KB/UI_KB surfaces; a Notes line tying it to `/audit-code`'s Refutation Ledger and `/plan-review`'s lockdown; source `[PROCESS-4]` citation dropped (replaced with plain "correlated consensus is worthless, but splits are signal"); provenance line rewritten to cite *this* 2026-07-10 review as the field example. Add the command to `CLAUDE.md`'s Custom Commands → Auditing table.

#### Edit F1.2 — G-20: `/implement` disjoint-ownership invariant

**Anchor (verbatim, exists today at [implement.md:85](.claude/commands/implement.md#L85)):**
```
- Steps within a batch have NO dependencies on each other
```

**Change:** add a sibling batch rule:
```
- **No two parallel steps in a batch share a file** — every file in a parallel batch has exactly one owner. Concurrent implementers writing the same file collide and silently clobber each other; if two steps must touch one file, sequence them (see "Conflicting changes" recovery below).
```

---

# Section G — Spec-authoring convention: Audience & Voice

**What (G-22) [hand-judged — re-run through a live panel before lockdown].** agent-blueprint's `_dev/agent-improvement-spec-template.md` §4.3 adds a *locked-copy* spec section for user-facing surfaces: a concrete **reading level**, a **forbidden-vocabulary never-say list** (terms that leak machinery — API, schema, JSON, OAuth, "database structure"), and **verbatim user-facing copy with per-phrase rationale** — with an unresolved wording fork blocking lockdown like any other decision.

**Domain-fit translation.** *More* relevant here than in the source: app-blueprint's product **is** the user-facing head — error messages, onboarding flows, billing/consent copy, empty states. The framing shifts from "agent voice" to "product copy" but the discipline is identical: user-facing strings are not decoration to be paraphrased at build time. app-blueprint has no `_dev/` template, so this lands as a **spec-authoring convention** consumed by `/brainstorm` (when it emits a spec touching user-facing copy) and `/plan-review` (an unresolved wording fork blocks lock), cross-referenced from the UI-UX KBs. Grep-confirmed zero capture in app-blueprint (`never-say`, `forbidden vocabulary`, `reading level`, `verbatim copy` → no hits in commands/docs).

### Decisions

| Decision | Choice | Reasoning | Date |
|---|---|---|---|
| Target | A convention paragraph in `plan-review.md` §3a (wording-fork-blocks-lock) + a note in the UI-UX KB index | app-blueprint has no `_dev/` template; §3a is where spec claims get gated | 2026-07-10 |
| Never-say list | Frame as *product-copy machinery leaks* (API/schema/JSON/OAuth/"sync"/"database"), not agent-internal terms | app-blueprint's users see product UI, not agent internals | 2026-07-10 |
| Status | **Hand-judged — panel died to spend limit; re-verify placement + confirm no overlap with existing UI-UX KB copy guidance before lockdown** | Loud-fail discipline | 2026-07-10 |

### Edit blocks

#### Edit G1.1 — G-22: `plan-review.md` §3a wording-fork convention

**Anchor:** the §3a verification-discipline section (near the B2.1 `[VERIFY…]` ledger insert).

**Change (insert a convention paragraph):**
```
**User-facing copy is locked spec content, not decoration.** When a spec touches user-facing surfaces — error messages, onboarding, billing/consent copy, empty states — the exact words ARE the implementation; they are not to be paraphrased at build time. A well-formed spec pins three things and treats them as locked content: (1) a concrete **reading level** (e.g. "8th-grade / plain English"); (2) a **never-say list** — machinery terms that must never surface to users (`API`, `schema`, `JSON`, `OAuth`, `RLS`, `sync`, "database"); (3) **verbatim copy with per-phrase rationale** — the literal strings, each annotated with why that wording. An unresolved wording fork on a user-facing surface blocks lockdown the same as any other unresolved decision (Step 6).
```

#### Edit G1.2 — G-22: UI-UX KB index cross-ref

**Anchor:** `docs/UI-UX KBs/UI_KB_0_Index.md` — add a one-line pointer to the copy-locking convention for specs that define user-facing surfaces.

---

# Open decisions (for `/plan-review` to gate)

| ID | Fork | Options | Recommendation |
|---|---|---|---|
| **D-1** | **TWO** dangling `[PROCESS-1]` citations to app-blueprint's LESSONS.md (which has no such entry) already exist in the repo: `plan-review.md:82` AND `brainstorm.md:230` (the latter surfaced by plan-review; my original D-1 undercounted). D1.2 assigns app-blueprint's `[PROCESS-1]` to the *consumed-verbatim-artifact* lesson — NOT the verify-now incident both those lines reference. | (a) Adopt D1.2's PROCESS-1 and let both :82/:230 point at it — **wrong**, they'd cite the wrong lesson. (b) Rewrite BOTH `:82` and `:230` to plain prose. (c) Author the verify-now incident as a *third* LESSONS entry (`[PROCESS-3]`) and repoint both lines at it. | **(c)** — the verify-now incident is a real, citable discipline worth a LESSONS entry; authoring `[PROCESS-3]` and repointing both dangling lines fixes the pre-existing rot instead of erasing the citations. If scope must stay minimal, fall back to **(b)** for both lines. Either way, **both** `:82` and `:230` must be handled — fixing only `:82` leaves `:230` dangling. |
| **D-2** | G-14 enforcement-class home. | (a) audit acceptance only (E2.1/E2.2). (b) also a cross-cutting KB entry. | **(a)** — the label earns its keep at audit time; a standalone KB is premature. |
| **D-3** | G-13 `/stress-test` — full command now, or park + port only G-20? | (a) Full command now. (b) Port G-20 disjoint-ownership into `/implement` (F1.2) now; park the full command with promotion trigger "when a change set is next authored by ≥3 parallel agents." | **(a)** — the pattern is proven (this review) and composes with the existing audit set; the cost is one new command file. |
| **D-4** | ~~A4.2 / A4.3 anchors unverified~~ **RESOLVED by plan-review anchor audit.** A4.2 confirmed at `implement.md:174`. A4.3's `**No gaps:**` anchor was **dead** (no spec-compliance checklist exists in this file) — A4.3 now repointed to `## Step 6: Summary Report` (:207 / Remaining Issues :236) as an *added* report line, not a sharpen. | — | Closed. A4.3 edit block rewritten. |
| **D-5** | ~~E1.1 (OBS_KB_5 Primitive 9) anchor unopened~~ **RESOLVED.** Confirmed verbatim at `OBS_KB_5_Defensive_Writes.md:35`. | — | Closed. |

---

# Parked (not ported this pass)

| Item | Why parked | Promotion trigger |
|---|---|---|
| G-21 model-tier diversity as a *standalone* edit to triage/audit-code | Rides along inside F1.1 (stress-test Step 2); low value as a standalone one-liner elsewhere | If a mixed-model refutation pass is added to `/audit-code` or `/triage` |

---

# Rejected (killed by the panel — recorded for provenance)

| Item | Verdict | Reason |
|---|---|---|
| **G-16** Model-aware executor briefs by tier role (`OC_KB_05`) | REJECT / ALREADY_CAPTURED (3/3) | Agent-runtime-specific; the generalizable model-selection guidance already lives in app-blueprint's AI KBs |
| **G-17** Read-only-package rule + overridable-vs-locked user-state boundary | ALREADY_CAPTURED (3/3) | app-blueprint solves the same author-push-wipes-user-state family via `/update-framework`'s three-way merge |
| **G-18** Version-bump is the step that ships an update | ALREADY_CAPTURED (3/3) | Enforced as hard workflow steps in app-blueprint's `/ship` — stronger than the source's prose |
| **G-19** Build-script footguns (clobber-on-recopy, fail-loud-not-crash, strip-fences) | ALREADY_CAPTURED (3/3) | Source text is explicitly doc-only-deferred ("a future `/package-plugin` skill is deferred"); no shippable artifact |

---

## Provenance & flags

- Every ported prose change ships flagged `Installed 2026-07-10, not yet proven in a live run` (source repo's `[PROCESS-1]` convention). Operational-surface edits carry the flag as this-spec annotation + decisions-row entry, not inline in executed text.
- This spec was produced by a 74-agent mixed Opus 4.8 + Fable 5 review whose method is recorded in **Method & provenance** above. Raw findings, per-lens verdicts, and the merge log are preserved at `/private/tmp/claude-501/.../tasks/wl8f92kgs.output` and the workflow journal.
- **Loud-fail carried forward:** G-20, G-21, G-22 lost their entire judge panels to the monthly spend limit and were hand-judged by the orchestrator at primary source. G-22 (§G) is additionally flagged for a live-panel re-run before lockdown. This is disclosed rather than laundered into a clean "22/22 judged" claim.
- **Not a deploy authorization.** Per app-blueprint's scope-graduation rule, a LOCKED header on this spec certifies design completeness and dispatch-readiness only — not authority to build or ship. Graduation to build is a separate, explicit user grant.

## `/plan-review` audit record (2026-07-10)

Three read-only Explore investigators (retargeted from the app-code default set, since this spec ports command/doc files): anchor-integrity, capture-recheck + coherence, and the Step 6a lockdown fork-scan.

- **Fork-scan (Step 6a/6b): PASS.** Zero genuinely unresolved forks in spec content (all `or`/`route B`/`revisit` hits are quoted rule-text inside code fences or the recommendation-bearing decision tables). All five open-decision items D-1…D-5 carry recommendations. All seven Decisions tables (A–G) are complete — no empty cells, every Date = 2026-07-10.
- **Anchor-integrity: 23/26 verbatim-clean; 3 corrected.** A4.3's `**No gaps:**` anchor was **dead** (repointed to Step 6 Summary Report). A3.1 (:74-76, was :72-74) and B3.1 (:166, was :167) were cosmetic line-ref drifts, corrected. The three previously-unverified anchors (A4.2 :174, B2.2 :157, E1.1 :35) all resolved clean. New-file targets (SB_KB_13, stress-test.md) confirmed absent and safe to create.
- **Capture-recheck: no false "uncaptured" claims.** All 8 spot-checked disciplines confirmed genuinely absent as the ported discipline. Two adjacency caveats folded in: the `[VERIFY…]` tag idiom already exists repo-wide (B2.1 cross-ref added), and denormalized-cache footholds exist at `SB_KB_5:202` + `BILL_KB_00:7` (C1 cross-ref added). One coherence finding folded in: the dangling `[PROCESS-1]` citation exists in **two** places (`plan-review.md:82` + `brainstorm.md:230`), not one — D-1 updated.

**Verdict: PASS.** No UNRESOLVED or UNVERIFIED items remain. LOCKED header applied. Carried-forward caveats are disclosed, not blocking: G-22 (§G) is hand-judged (its live panel died to the spend limit) and flagged for a live-panel re-run before *implementation* of that item; D-1 and D-3 carry recommendations the implementer should confirm with the user at build time. LOCKED certifies design completeness and dispatch-readiness only — **not** authorization to build or deploy.
