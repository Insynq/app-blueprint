# Agent-blueprint v0.6 intake spec — verification & workflow disciplines, second sister-framework port

> **Status: LOCKED 2026-07-07** — certifies design completeness and dispatch-readiness, NOT authorization to apply the edits or deploy; that stays gated at the normal ship checkpoints (`/ship` smoke truth-gate Step 3.5, `/db-push` remote-migration gate).

**Source:** agent-blueprint v0.6.0 ("kai Jul 2–6 harvest intake", commit `54a8259`) and v0.6.1 ("T3 goal-mode video intake", commit `7ba4397`), 2026-07-06/07.

**Method & provenance.** This is the second agent→app port (the first: `verification-discipline-adoption-spec.md`, shipped as v0.2.0). Candidate set produced and stress-tested 2026-07-07 by an 80-agent Opus 4.8 review: 8 gap-finders (one per v0.6 change cluster, grounded on the raw v0.5.1..v0.6.1 diff) → 24 deduped gap candidates → one 3-lens judge panel per gap (refuter / domain-fit per the source repo's `[PROCESS-5]` expect-inversion discipline / placement-cost), split verdicts escalated, never averaged. One judge died to a StructuredOutput retry cap; the shortfall was loud-logged and the maintainer re-ran that lens by hand. The maintainer independently re-verified all four refuter kills and the promoted P1's absence claim at primary source before disposition. Sections were then authored by six Opus lanes with per-lane independent anchor verification (every edit-block anchor grep-verified verbatim-unique against the receiving files; two lanes' verifier-flagged defects fixed at assembly: Lane A, a misdirected intra-file reference; Lane F, unqualified source-repo refs plus one mis-ported Phase-8 fact). The assembled document then passed an independent 3-reviewer Opus panel — apply-integrity (all 25 edit blocks dry-verified: anchors verbatim-unique, multi-block composition on shared files clean, zero dangling refs), fidelity-vs-contract, and coherence — with the latter two panels' findings fixed in place before this revision. A second, independent pre-lockdown review ran 2026-07-07 under a Fable orchestrator (64 Opus agents: 9 anchor dry-apply groups verifying 25/25 blocks PASS/WARN with zero FAILs; 6 lane claim re-grounders; 3 gap hunters; 3-lens judging on 13 deduped findings; 8 session-limit judge deaths loud-logged, every one re-derived by the orchestrator by hand at primary source). It confirmed 2 blocking defects (Lane C's 'auto-runs /db-push' misstatement, contradicted by implement.md:240/:270 and Lane F's own REJECT row; D1.2's unconditional escalate bullet contradicting AI_KB_1:909/:922) and 8 non-blocking defects — all fixed in this revision — and refuted 4 relayed defects at primary source — 3 from the judged set (AUTHORING_COMMANDS §5 label, A-2/BILL_KB_2/TEST_KB_6 timestamp carve-out, A-3 scoping parenthetical) plus 1 anchor-lane WARN (AUDIT_FINDINGS 'L5', which is a finding label at :142, not a line number). The fix revision then passed a mixed lock panel — Opus diff-fidelity + apply-integrity, Fable coherence + lockdown-readiness (4/4 reported, 0 deaths; apply-integrity and lockdown CLEAN) — whose six minor nits were fixed at assembly by the orchestrator (this paragraph's disposition arithmetic, two stale "decisions rows" flag claims at A-2/D3, the D1 "~2 lines" shape descriptor, a nested-backtick seam in the Lane C handoff, F-P7's loose `KB_1:15` citation), with two nits accepted as-is (the quoted 'auto-runs' token in this paragraph is an intentional quotation; D2.2's insertion point is a readability preference, not a defect).

**Inventory:**
- **13 ADOPT items** in five lanes — A: db/migration write-integrity (A1–A2) · B: orchestration/verification (B1–B3) · C: commands incl. the new `/triage` (C1–C4) · D: routing/debug/glossary (D1–D3) · E: CLAUDE.md scope-graduation conduct rule (E1, sole owner of CLAUDE.md edits, integrating C/D one-line handoffs).
- **7 PARKED items** → `docs/PARKING_LOT.md` entries with explicit promotion triggers (per `[PROCESS-5]`: no receiving-side field evidence yet; adopt on the first downstream transcript that shows the failure mode).
- **4 REJECTED imports + 2 deliberate non-ports** — recorded with verified kill reasons in §F's decisions rows.

**Conventions.** Decisions are recorded per-section in `Decision | Choice | Reasoning | Date` tables. Every edit block quotes a verbatim anchor that exists in the receiving file today. Per the source repo's `[PROCESS-1]`, every ported prose change ships flagged `Installed 2026-07-07, not yet proven in a live run` unless receiving-side field evidence is cited. References of the form `[PROCESS-N]` / `OC_KB_*` are **source-repo citations** (agent-blueprint), always marked as such — app-blueprint's `LESSONS.md` ships empty and has no `OC_KB` files; no ported text may depend on them resolving locally. Item IDs (A1–E1, F-P1–F-P7, Edit A-*/B-*/C-*/D-*/E2-*/F-*) are namespaced to THIS spec; the v0.2.0 sister spec's items (its A1–A5, B1, N1, N2) are always cited with a "v0.2.0" or "sister spec" qualifier. Flag placement: KB/doc prose embeds the `Installed … not yet proven` flag inline; operational surfaces (checklists, output templates, CLAUDE.md bullets) carry it as an edit-block annotation + decisions-row entry instead, so the flag never pollutes text that agents execute or print.


**File-touch map — 25 edit blocks across 16 files** (apply-integrity dry-verified 2026-07-07: every anchor verbatim-unique, multi-block files compose cleanly):

| Target file | Blocks |
|---|---|
| `CLAUDE.md` | 4 — E1, E2-C1, E2-C3, E2-D3 |
| `docs/MULTI_AGENT_WORKFLOW.md` | 3 — B1.1, B2.2, B3.1 |
| `.claude/commands/investigate.md` | 2 — C-3, C-4 |
| `docs/AI KBs/AI_KB_1_Anthropic_API_Patterns.md` | 2 — D1.1, D1.2 |
| `.claude/commands/debug.md` | 2 — D2.1, D2.2 |
| `.claude/commands/kickoff.md` | 2 — D3.1, D3.2 |
| `docs/Supabase Structure KBs/SB_KB_3_Split_Benefit_Relationships.md` | 1 — A-1 |
| `.claude/commands/gen-migration.md` | 1 — A-2 (REPLACE) |
| `docs/Obs KBs/OBS_KB_3_Audit_Logging.md` | 1 — A-3 |
| `.claude/commands/orchestrate.md` | 1 — B1.2 |
| `.claude/commands/audit-code.md` | 1 — B2.1 |
| `.claude/commands/plan-review.md` | 1 — C-1 |
| `.claude/commands/plan.md` | 1 — C-2 |
| `docs/AUTHORING_COMMANDS.md` | 1 — C-5 |
| `.claude/commands/triage.md` | 1 — C-6 (NEW FILE) |
| `docs/PARKING_LOT.md` | 1 — F-1 (REPLACE the `## Open` placeholder) |

**Suggested application order** (blocks are file-independent; within a file, apply in spec order — anchors are text-matched, so this is for reviewability, not correctness): (1) KB/doc prose — A-1, A-3, D1.1–D1.2; (2) command files — A-2, B1.2, B2.1, C-1…C-6, D2.1–D2.2, D3.1–D3.2; (3) `MULTI_AGENT_WORKFLOW.md` — B1.1, B2.2, B3.1; (4) `CLAUDE.md` — E1, E2-C1, E2-C3, E2-D3 in section order; (5) `PARKING_LOT.md` — F-1, any time. Single-dispatch-sized; no cross-file ordering constraints.

---


## Lane A — DB write-integrity (A1, A2)

Ports two schema-modeling disciplines from the agent-blueprint v0.6.0 capability KBs (OC_KB_11
Primitive-set anti-patterns and OC_KB_12 audit-trail conventions) into app-blueprint's Supabase
schema-authoring surface. Both source phenomena are **pure Postgres schema/data-integrity
defects** — the "agent" in each incident was merely the actor; the defect lives entirely in SQL
DDL and a view/write, so the cross-framework port carries no runtime-only inversion risk (contrast
the v0.2.0 sister spec's B1 silent-open, which that spec correctly demoted to reference-only for being
runtime-only). app-blueprint **is** the Supabase/Postgres framework, so these are arguably more at
home here than in their source.

---

### A1 — Semantic defaults on financial/attribution columns (P1)

**What.** A column `DEFAULT` — or a view/RPC `COALESCE(...)` fallback — set to a *business-rule
value* instead of an inert one silently stamps that assertion on every row whose writer omitted the
field. It is a **two-headed trap**: the write-side `DEFAULT` and the read-side `COALESCE` each
assert the same business rule and can be introduced or dropped independently, so fixing one head
leaves the other live. Fix: defaults and `COALESCE` fallbacks on attribution/financial columns
must be **inert** (`NULL` / `0` / `'unknown'`) so an omission stays visible and a real value must be
supplied — and both heads must be audited together.

**Why it lands natively here.** `SB_KB_3` already uses `split_pct numeric(5,2)` (SB_KB_3:73) as its
canonical financial-attribution column and declares it with **no DEFAULT** — correct today, but the
Anti-patterns section (SB_KB_3:32–54) enumerates JSONB-blob, hardcoded-FK, polymorphic-columns, and
RLS-money, and never names semantic defaults. The framework independently arrived at the defensive
shape (the CHECK at SB_KB_3:79–83 requires `split_pct is not null` on the financial branch) — which
is field-adjacent evidence the domain exhibits the failure mode, not a projected source priority.

**The load-bearing interaction (why the SB_KB_3 home earns its prose).** A business-meaning DEFAULT
silently **defeats** the SB_KB_3:79–83 not-null CHECK later in the same file: a writer who omits `split_pct` still
passes `split_pct is not null` because the DEFAULT auto-fills it, so the guard that looks protective
is inert. A one-liner cannot carry the "audit both heads together" insight, so a compact anti-pattern
entry in the same file as that CHECK earns its place. app-blueprint's KBs use `COALESCE` today only as inert key/metadata fallbacks in triggers and provisioning paths (e.g. SB_KB_9:86, AUTH_KB_5:259) — no business-value read-side fallback ships in the framework, so the read-side head is a guarded-against risk class here, not a live instance.

**Placement choice (SB_KB_3 over SB_KB_12).** Panel targeted a **split**: a narrow illustrative
anchor in `SB_KB_3` (canonical home for `split_pct` — the exact column class from the incident) plus
a general checklist bullet in `gen-migration.md` that generalizes past split-benefit edges to any
`credit_pct` / `owner_id`-style attribution column. `SB_KB_12` (RLS Performance Patterns — Postgres
RLS internals, InitPlan idiom, indexing) is the wrong axis: this is a schema-design/data-integrity
defect, not an RLS-performance concern, so it belongs nowhere near SB_KB_12. `OBS_KB_5` (Defensive
Writes) is also **not** the home — it owns the *error surface* of a failed write (fail-loud/closed vs
silent-open), a different axis; keeping the semantic-default trap out of OBS_KB_5 is deliberate.

**Not wired as an /audit gate.** Mirror the OBS_KB_5 reference-only precedent: this is a
design/checklist rule, not a runtime gate.

**Evidence (source incident).** agent-blueprint OC_KB_11 new anti-pattern (v06-full-diff.txt): a
`parsons_split_pct DEFAULT 75` plus a view `COALESCE(..., 75)` put ~$97,156 of mis-credit at risk
across 13 settlements; hardening migration `20260625000001` (2026-06-25) dropped both heads and the
ruling session cleared the flags 2026-07-03. Refuter ran three kill paths (already-covered / stale-
evidence / [PROCESS-5] over-port) and all failed — straight ADOPT, native-domain.

**Receiving-side status.** No existing app-blueprint field transcript shows this firing; the
receiving-side CHECK at SB_KB_3:79–83 is house-style corroboration, not a live proof. Ship flagged
`Installed 2026-07-07, field-attestation is downstream-incident-sourced (agent-blueprint), not yet
proven in an app-blueprint live run`.

---

### A2 — Timestamp source: DB `now()`/DEFAULT, never a hand-typed literal (P2)

**What.** Audit and status timestamps (`occurred_at`, and status-change columns like
`executed_at` / `approved_at` / `resolved_at`) must come from `now()` at the DB via a column
`DEFAULT` or trigger — **never** a hand-typed literal or an app-supplied `new Date().toISOString()`
from a seed, migration, backfill, or Server Action. The app/runtime clock (often UTC, and a typed
literal even more so) is not the DB clock; a literal parses fine and silently **inverts event
ordering** relative to rows stamped by `now()`. Let the column DEFAULT be the single source.

**Why it lands here (scoped, not verbatim).** `OBS_KB_3` already makes `now()`/DEFAULT the house
style throughout — `occurred_at timestamptz not null default now()` (OBS_KB_3:100), and the audit
trigger passes `now()` (~:277) — but the Always/Never block (OBS_KB_3:562–578) covers immutability
layers, jsonb, same-transaction writes, and UUIDs, and says **nothing** about timestamp source.
`gen-migration.md:68` says only "Timestamps — include created_at / updated_at where appropriate"
with no source rule — and `gen-migration` is precisely the command that would author a
seed/backfill hardcoding a literal into a `timestamptz` column.

**Scope narrowed per panel refuter (drop the blanket ban).** The source proposal wanted to forbid
app-supplied `new Date().toISOString()` from Server Actions *generally* — but app-blueprint's OWN
canonical patterns use exactly that **legitimately** for single-actor status/processing stamps that
are not ordering-compared against `now()`-defaulted sibling rows: `BILL_KB_2:484`
(`updated_at: new Date().toISOString()`, webhook state sync) and `TEST_KB_6:96`
(`processed_at: new Date().toISOString()`, outbox completion). Adopting the ban verbatim would
contradict established framework patterns. So the port is scoped to **audit/status/event-order
timestamp columns** and drops the general Server-Action prohibition. Leave ordinary
`created_at`/`updated_at DEFAULT now()` alone — already universal, adds no value.

**Two-file split is complementary, not duplicate.** `gen-migration` owns the **structural** fix
(give the column `DEFAULT now()`); `OBS_KB_3` owns the **write-discipline** fix (don't override the
default with a literal). Each gets the minimum: `gen-migration` **extends** the existing Timestamps
bullet (no new subsection); `OBS_KB_3` gets **one** Always/Never bullet (reference doc — mechanism
suffices, incident at most a parenthetical). Drop the "Server Action" framing from the OBS_KB_3
bullet — OBS_KB_3 governs the `audit_log` table; business-table status columns are covered by the
`gen-migration` half, which spans all tables. `OBS_KB_5` is not a home (its scope note restricts it
to the error surface, not timestamp provenance).

**Evidence (source incident).** agent-blueprint OC_KB_12 (v06-full-diff.txt): a kai session on
2026-07-04 UTC (evening of 07-03 local) wrote `executed_at: "2026-07-03T00:00:00Z"` onto flags whose
`first_detected_at` was `2026-07-04T02:13Z`, inverting the true event order. The typed midnight
literal, not the DB clock, produced the inversion.

**Receiving-side status.** House-style-corroborated (OBS_KB_3:100 / :277) but **field-unproven** —
LESSONS.md / verification-discipline-adoption-spec.md / AUDIT_FINDINGS.md grep for
timestamp|clock|now()|new Date|literal returned zero relevant hits. Ship flagged
`Installed 2026-07-07, house-style-corroborated, not yet proven in a live run`.

---

### Decisions

| Decision | Choice | Reasoning | Date |
|---|---|---|---|
| A1 home — which SB_KB carries the semantic-defaults anti-pattern | `SB_KB_3` (illustrative anchor) + `gen-migration.md` (general check); NOT SB_KB_12, NOT OBS_KB_5 | SB_KB_3 is the canonical home for `split_pct` (the exact incident column class) and already contains the not-null CHECK (:79–83) a DEFAULT would defeat; SB_KB_12 is RLS-performance (wrong axis); OBS_KB_5 owns the write *error* surface, not schema defaults. | 2026-07-07 |
| A1 shape | Compact anti-pattern entry (2 bad snippets: `split_pct DEFAULT 75` + `COALESCE(split_pct,75)`) that names the CHECK-defeat interaction + one general gen-migration checklist bullet ("inert defaults") | The "audit both heads together" and "DEFAULT defeats the not-null CHECK" insights can't fit a one-liner; the general bullet covers credit_pct/owner_id the SB_KB_3 anchor alone would miss. | 2026-07-07 |
| A1 not an /audit gate | Reference/checklist rule only | Mirror OBS_KB_5 precedent; it is a design-time rule, not a runtime gate. | 2026-07-07 |
| A2 home | `gen-migration.md` (structural: `DEFAULT now()`) + `OBS_KB_3` Always/Never (write-discipline); NOT OBS_KB_5 | No timestamp-source rule exists in either; OBS_KB_5's own scope note restricts it to write error surfaces, not timestamp provenance. | 2026-07-07 |
| A2 scope | Restrict to audit/status/event-order timestamp columns; DROP the blanket ban on app-supplied `new Date().toISOString()` from Server Actions | The verbatim ban contradicts legitimate framework patterns at BILL_KB_2:484 and TEST_KB_6:96 (single-actor status stamps not ordering-compared against `now()` rows). | 2026-07-07 |
| A2 weight | gen-migration EXTENDS the existing Timestamps bullet (no new subsection); OBS_KB_3 gets ONE Always/Never bullet | Reference docs — mechanism suffices; incident belongs in a parenthetical at most. | 2026-07-07 |

---

### Edit blocks

#### Edit A-1 — A1: SB_KB_3 anti-pattern entry

**Target file:** `/Users/chrisparsons/Documents/GitHub/app-blueprint/docs/Supabase Structure KBs/SB_KB_3_Split_Benefit_Relationships.md`

**Anchor (verbatim, exists today at :53–54):**
```
**Computing financial splits inside RLS**
RLS is for row visibility, not money. Financial calculations in USING clauses slow every query on that table. Move financial logic to application layer or a separate ledger table.
```

**Placement:** INSERT the new block AFTER the anchor's second line ("Move financial logic…") and
BEFORE the blank line preceding the `---` at :56.

**New text:**
```

**Business-meaning `DEFAULT` / `COALESCE` on a financial-attribution column**
```sql
-- Don't do this
split_pct  numeric(5,2)  DEFAULT 75,          -- write-side head
-- ...and in a view/RPC:
select COALESCE(split_pct, 75) as split_pct   -- read-side head
```
A `DEFAULT` (or a view `COALESCE`) set to a *business value* silently stamps that rule on every row
whose writer omitted the field — and it **defeats the not-null CHECK in the Generic example below** (`split_pct is not null`
on the financial branch): the omitted write still passes the CHECK because the DEFAULT auto-fills it,
so the guard that looks protective is inert. This is a **two-headed trap** — the write-side `DEFAULT`
and the read-side `COALESCE` each assert the rule independently, so fixing one head leaves the other
live. Fix: defaults and `COALESCE` fallbacks on financial/attribution columns must be **inert**
(`NULL` / `0` / `'unknown'`) so an omission is visible and a real value must be supplied — and audit
both heads together. (One instance of a general rule; see `gen-migration.md` "What to Check For".
Field-attestation is downstream-incident-sourced: a `parsons_split_pct DEFAULT 75` + view
`COALESCE(..., 75)` put ~$97k of mis-credit at risk across 13 settlements before both heads were
dropped. Installed 2026-07-07, not yet proven in a live run in this framework's projects.)
```

---

#### Edit A-2 — A1 + A2: gen-migration.md "What to Check For"

**Target file:** `/Users/chrisparsons/Documents/GitHub/app-blueprint/.claude/commands/gen-migration.md`

**Anchor (verbatim, exists today at :68 — the last bullet of "What to Check For"):**
```
- **Timestamps** — include `created_at` / `updated_at` where appropriate
```

**Placement:** REPLACE the anchor line with the extended Timestamps bullet (A2) plus a new inert-
defaults bullet (A1).

**New text:**
```
- **Timestamps** — include `created_at` / `updated_at` where appropriate. Audit and status-change timestamp columns (`occurred_at`, `executed_at`, `approved_at`, `resolved_at`, status-change times) must carry `DEFAULT now()` at the DB (or be set by trigger) — never a hand-typed literal or an app-supplied `new Date().toISOString()` from a seed, migration, or backfill. The runtime clock is not the DB clock; a literal parses fine and silently inverts event ordering across timezones. (Ordinary `created_at`/`updated_at DEFAULT now()` is already the house style — this rule targets ordering-sensitive audit/status columns.)
- **Inert defaults on attribution/financial columns** — no business-meaning `DEFAULT` or `COALESCE` fallback on `split_pct`, `credit_pct`, `owner_id`-style attribution columns. An omitted value must be visibly `NULL` (or `0`/`'unknown'`), never silently stamped with a business rule; a real value must be supplied. A business-value `DEFAULT` also defeats a not-null CHECK on the same column by auto-filling omitted writes — audit the write-side `DEFAULT` and any read-side view `COALESCE` together. (See SB_KB_3 Anti-patterns.)
```

**Flag:** `Installed 2026-07-07, not yet proven in a live run` — recorded here as an edit-block annotation, not embedded in the checklist text (operational surface kept clean; see header conventions).

---

#### Edit A-3 — A2: OBS_KB_3 Always/Never bullet

**Target file:** `/Users/chrisparsons/Documents/GitHub/app-blueprint/docs/Obs KBs/OBS_KB_3_Audit_Logging.md`

**Anchor (verbatim, exists today at :568):**
```
**ALWAYS write the audit row inside the same transaction as the state change** (DB function approach, SB_KB_6 pattern). An audit row written before the commit ensures the record exists even if the caller crashes or the network drops between steps.
```

**Placement:** INSERT the new bullet AFTER the anchor bullet (and its following blank line),
BEFORE the "ALWAYS use UUIDs in audit payloads" bullet at :570.

**New text:**
```

**ALWAYS let audit timestamps default to `now()` at the DB; NEVER insert `occurred_at` (or `executed_at` / `approved_at` / `resolved_at`) from an app-supplied value or a hand-typed literal.** A literal parses fine and silently inverts event ordering across timezones — the DB clock is the single source. (This governs the `audit_log` table; business-table status columns are covered by the `gen-migration` "What to Check For" timestamp rule, which spans all tables. Installed 2026-07-07, not yet proven in a live run in this framework's projects.)
```


## Lane B — Orchestration (B1, B2, B3)

Targets: `docs/MULTI_AGENT_WORKFLOW.md`, `.claude/commands/audit-code.md`, `.claude/commands/orchestrate.md`.
All three items are framework-agnostic multi-agent orchestration hygiene — the panel confirmed
none is agent-runtime-only (no cron/MCP/bootstrap/prod-write coupling), and app-blueprint already
runs the identical dispatch machinery (PM phase loop + Refutation Pass + mixed-model dispatch, e.g.
`research.md` spawns a `model: sonnet` subagent under an Opus PM). Per [PROCESS-1], every ported
clause below ships flagged `Installed 2026-07-07, not yet proven in a live run` except where
receiving-side field evidence already exists (called out per item).

---

### B1 — Phase 8 risk-targeted verification (diff-as-risk-map + re-exercise adjacent old behaviors)

**What.** app-blueprint's Phase 8 has a strong *fresh-evidence* gate (worker's-word-vs-run-it-now,
MULTI_AGENT_WORKFLOW.md:166–191) but nothing directs verification *effort* by blast radius, and
nothing re-tests the OLD behaviors adjacent to the change. Every Phase-8 verification hook is scoped
to proving the NEW slice/smoke. Add one Phase-8 directive: after integration, run
`git diff <deployed-baseline>..HEAD --stat`, treat the changed surface as the risk map already
computed as **blast radius** in Phase 3 (MULTI_AGENT_WORKFLOW.md:101, "sequencing, collisions, blast
radius, worker shape") / the Phase-4 lockdown gate, dispatch trace-verifiers / smokes at the
highest-delta, highest-blast-radius files first, and re-exercise the OLD behaviors adjacent to the
change (the regression surface), not only the new feature. Mirror one line into orchestrate.md
Step 8.

**Why.** This is bedrock regression testing and translates to React/RN/Next/Supabase *more* cleanly
than to an agent's skill-space: a `git diff --stat` risk map over shared components, shared query
hooks, and a shared Supabase schema is more actionable than over agent skills. The v0.6 source is a
new Stage-2 bullet in a restructured two-stage Phase 8; app-blueprint's Phase 8 is single-stage, so
there is no analog today — the refuter tried to kill this against SCOPE.md and the Phase-3 blast-radius
line and could not (both are non-load-bearing for Phase-8 verification targeting).

**Two mandated revisions applied** (panel: refuter ADOPT-REVISED, domain-fit ADOPT-REVISED-high):
1. **Citation swap (mandatory).** The source cites `falsification-primitive-spec.md §2`, which does
   NOT exist in app-blueprint. Re-anchored to the **A3 smoke truth-gate** (the proven core of
   `docs/verification-discipline-adoption-spec.md §3`; operationalized in `ship.md` Step 3.5), which
   already carries the "a clean verdict means the check found nothing, not that a skeptic verified it"
   epistemic — the honest-clean claim below is the same discipline.
2. **Soften the agent-harvested autonomy clause.** The source's "verification spend routinely
   exceeding implementation spend is expected and correct" is harvested from fully-autonomous
   multi-worker *agent* phases. Kept only the operational core (diff-as-risk-map + regression-surface
   re-exercise + "a clean verification is an honestly-clean result, not proof of under-testing"),
   dropped the spend-ratio framing.

**Receiving-side evidence (regression half already recognized).** app-blueprint independently wants
this: `SCOPE.md:22` carries "Adjacent features [list them] still work after the change" (a
Definition-of-Done *example*, non-operative), and `docs/AUDIT_FINDINGS.md` L5 flags that
`plan.md`'s testing checklist lacks default dimensions "including regression in dependent features."
So the regression-surface half has receiving-side corroboration; the diff-as-risk-map *targeting*
mechanism is the new, unproven part. Ships flagged `Installed 2026-07-07, not yet proven in a live
run` — the regression-surface half is field-recognized, the targeting directive is not yet fired.

---

### B2 — Split-verdict escalation (Refutation Pass + Phase 6 reconciliation)

**What.** Two targets, one epistemic. (a) audit-code's Refutation Pass has a Mechanical tally that
handles CONFIRMED/OVERSTATED/REFUTED plus empty-set blind-spot honesty, but no clause for two
independent verdicts *disagreeing* on the same finding, and no warning that agreement between
correlated verifiers sharing a seed error is worthless. (b) MAW Phase 6 reconciliation (lines
141–143) has the PM "analyze all worker audit reports" and "brainstorm gaps" but never treats a
worker/verifier split as a distinct escalation signal — a disagreement can be silently averaged into
the reconciled plan. Add: disagreement between independent verifiers is a **positive escalation
trigger** — route the contested finding to the PM/human with both positions quoted; and unanimity
earns nothing (never promote it to "verified clean" — correlated verifiers sharing a seed error
produce worthless consensus).

**Why.** Framework-agnostic multi-agent verification epistemics, and app-blueprint already adopted
the surrounding machinery (the Refutation Pass in v0.2.0, plus the multi-worker MAW). The MAW Phase-6
half is a *live, present-tense* gap: the PM's holistic audit vs. the workers' granular audits are two
independent views that genuinely can disagree today. app-blueprint's own
`verification-discipline-adoption-spec.md:54` names `[PROCESS-4]` as the sibling discipline the
75-agent incident proved but never wired its operational split-escalation clause into audit-code or
MAW — this closes a gap the repo half-acknowledges.

**Revisions applied** (refuter ADOPT-high, domain-fit ADOPT-REVISED-medium):
- **No `[PROCESS-4]` reference** (it does not resolve in app-blueprint). The correlated-seed-error
  rationale is **inlined** in one clause instead of cross-referenced.
- **audit-code: no new multi-refuter mechanism.** The default path runs one refuter per category, so
  a split only arises on re-runs / judge panels / a multi-refuter config. The clause explicitly
  retains the caveat that it does not by itself mandate multi-refuter spend, keeping the audit-code
  half a one-clause epistemic reinforcement (unanimity earns nothing) rather than new machinery. The
  MAW Phase-6 bullet is the load-bearing, cleanly-fitting half.

**Receiving-side evidence: none.** LESSONS.md is empty; app-blueprint's own corpus showed no
synthesis-trust/correlated-verifier failures (both local `[PROC-4]` instances merely OVERSTATED). So
the specific failure this operationalizes has no receiving-side proof — ships flagged
`Installed 2026-07-07, not yet proven in a live run`. The audit-code clause sits inside the "After
Subagent Returns" block, which already carries a section-level `Installed, not yet proven in a live
run` banner (audit-code.md:229); the new clause inherits it — no second inline banner added.

---

### B3 — Model-provenance labeling on mixed-model dispatch

**What.** MAW's dispatch-modes preamble (line 25) and the worker plan doc header (lines 232–235) say
nothing about which model produced a slice, even though subagent and separate-window workers can run
different models than the PM (Opus PM, Sonnet workers). Add a single conditional one-liner to the
dispatch-modes preamble: when a phase runs workers on different models, note the producing model on
each worker artifact so provenance and cost are visible at a glance.

**Why / revision applied** (refuter + domain-fit + placement-cost all ADOPT-REVISED, unanimous on the
shape). Domain-neutral Claude Code orchestration hygiene — app-blueprint runs the identical dispatch
machinery and genuinely mixes models (`research.md:24` dispatches `model: sonnet` under an Opus PM).
**Adopt only the conditional preamble line; DROP the proposed standing `**Model:**` field in the
worker-doc header skeleton.** All three judges: the source deliberately did NOT add a Model field to
its own skeleton; most app-blueprint phases are single-model, so a mandatory-looking header field
would sit blank/redundant in the vast majority of worker docs — exactly the field-rot the placement
lens guards against, and it contradicts the "keep it optional" intent. If in-doc provenance is ever
wanted, the worker's existing Implementation-log / Completion-notes sections absorb it inline.

**Receiving-side evidence: none, and the source line is itself unproven upstream** (a bare v0.6
one-liner with no harvest provenance). P3 provenance nicety — ships flagged `Installed 2026-07-07,
not yet proven in a live run`.

---

### Decisions

| Decision | Choice | Reasoning | Date |
|---|---|---|---|
| B1 Phase-8 risk-targeted verification | ADOPT — append one Phase-8 directive after the fresh-evidence gate + mirror one line into orchestrate.md Step 8 | Genuine gap (Phase-8 is NEW-slice-scoped); regression testing translates more cleanly to web than to agents; regression half already field-recognized (AUDIT_FINDINGS.md L5, SCOPE.md:22) | 2026-07-07 |
| B1 citation | Swap `falsification-primitive-spec.md §2` → A3 smoke truth-gate (`verification-discipline-adoption-spec.md §3` / `ship.md` Step 3.5) | Source citation does not exist in app-blueprint; A3 is the proven-core carrier of the same honest-clean epistemic | 2026-07-07 |
| B1 autonomy clause | Soften — drop "verification spend exceeding implementation spend"; keep diff-as-risk-map + regression re-exercise + honest-clean | Spend-ratio framing is harvested from fully-autonomous agent phases; not what the app-side audit finding calls for | 2026-07-07 |
| B2 split-verdict escalation | ADOPT both halves — MAW Phase-6 bullet (load-bearing, live gap) + audit-code Refutation-Pass clause (epistemic reinforcement) | Framework-agnostic verification epistemics; MAW holistic-vs-granular split is a present-tense gap; repo half-acknowledges via spec:54 | 2026-07-07 |
| B2 `[PROCESS-4]` ref | Inline the correlated-seed-error rationale; no cross-reference | `[PROCESS-4]` does not resolve in app-blueprint (LESSONS.md empty) | 2026-07-07 |
| B2 audit-code scope | No new multi-refuter mechanism; retain "does not mandate multi-refuter spend" caveat; gate split-language behind re-run/panel/multi-refuter configs | Default path is one refuter per category, so a split cannot arise there; keeps cost bounded | 2026-07-07 |
| B3 model-provenance | ADOPT the conditional preamble one-liner ONLY; DROP the `**Model:**` header-skeleton field | Header is deliberately minimal; most phases single-model → a standing field is blank-row field-rot; unanimous across refuter/domain-fit/placement-cost | 2026-07-07 |

---

### Edit blocks

#### Edit B1.1 — `docs/MULTI_AGENT_WORKFLOW.md` (Phase 8)

Target file: `/Users/chrisparsons/Documents/GitHub/app-blueprint/docs/MULTI_AGENT_WORKFLOW.md`

ANCHOR (verbatim, last line of the fresh-evidence-gate blockquote, line 191):

```
> wrong. This is the existing trace-verifier doing its job — don't build a parallel "verify the synthesis" step.
```

Placement: **AFTER** the anchor line (i.e. after the blockquote closes, before the blank line preceding `### Phase 9: Smoke tests`).

New text:

```

**Risk-targeted verification.** After the fresh-evidence gate passes, diff the deployed baseline
against the integrated candidate (`git diff <deployed-baseline>..HEAD --stat`) and treat the changed
surface as the **risk map** — the same blast radius already computed in Phase 3 (sequencing /
collisions / blast radius / worker shape). Dispatch trace-verifiers and smokes at the highest-delta,
highest-blast-radius files first, and re-exercise the **OLD** behaviors adjacent to the change (the
regression surface: shared components, shared query hooks, dependent Supabase policies/queries), not
only the new feature — `SCOPE.md`'s "Adjacent features … still work after the change" belongs here as
an operative Phase-8 step, not just a Definition-of-Done example. A clean verification is an
honestly-clean result, not proof of under-testing (the same honest-clean epistemic as the A3 smoke
truth-gate / `verification-discipline-adoption-spec.md` §3, and the audit-code blind-spot-honesty
clause). `Installed 2026-07-07, not yet proven in a live run` — the regression-surface half is
field-recognized (`AUDIT_FINDINGS.md` L5), the diff-as-risk-map targeting is not yet fired.
```

#### Edit B1.2 — `.claude/commands/orchestrate.md` (Step 8 mirror)

Target file: `/Users/chrisparsons/Documents/GitHub/app-blueprint/.claude/commands/orchestrate.md`

ANCHOR (verbatim, line 241):

```
- Verify the integrated result against `phase-plan.md`: gaps, edge cases, integration points.
```

Placement: **AFTER** the anchor line.

New text:

```
- **Risk-targeted verification:** `git diff <deployed-baseline>..HEAD --stat` is the risk map — verify the highest-delta / highest-blast-radius files first, and re-exercise OLD behaviors adjacent to the change (regression surface), not only the new feature. A clean result is honestly clean, not under-testing. See [MULTI_AGENT_WORKFLOW.md → Phase 8](../../docs/MULTI_AGENT_WORKFLOW.md).
```

**Flag:** `Installed 2026-07-07, not yet proven in a live run` — recorded here, not embedded in the Step-8 bullet (see header conventions).

#### Edit B2.1 — `.claude/commands/audit-code.md` (Refutation Pass, before Mechanical tally)

Target file: `/Users/chrisparsons/Documents/GitHub/app-blueprint/.claude/commands/audit-code.md`

ANCHOR (verbatim, tail of the Cost escape-hatch paragraph, line 251):

```
An audit that can't be refuted cheaply is itself the finding.
```

Placement: **AFTER** the anchor line (i.e. after the full Cost-escape-hatch paragraph, before the blank line preceding `**Mechanical tally**`).

New text:

```

**Split-verdict escalation.** When a load-bearing finding accumulates multiple independent verdicts
(a re-run, a judge panel, or a multi-refuter configuration) that **disagree**, the split is a
*positive* escalation trigger — route the contested finding to the user with both positions quoted;
do not average it away. And unanimity earns nothing: never promote an all-agree result to "verified
clean," because refuters sharing the same seed error (the same wrong assumption about the schema,
the same missed policy) produce worthless consensus — agreement between correlated verifiers is not
independent confirmation. (Today's default runs one refuter per category, so a split arises only when
extra verdicts are deliberately gathered; this clause does not by itself mandate multi-refuter spend.)
```

(Inherits the section-level `Installed, not yet proven in a live run` banner at audit-code.md:229 —
no separate inline flag.)

#### Edit B2.2 — `docs/MULTI_AGENT_WORKFLOW.md` (Phase 6 reconciliation)

Target file: `/Users/chrisparsons/Documents/GitHub/app-blueprint/docs/MULTI_AGENT_WORKFLOW.md`

ANCHOR (verbatim, the gap-brainstorm bullet, line 142):

```
- PM brainstorms gaps — what did the workers see that the holistic view missed? What did the holistic view see that workers can't?
```

Placement: **AFTER** the anchor line (before the `- For each worker plan doc, PM **edits the doc directly**…` bullet).

New text:

```
- When independent workers or verifiers disagree on the same finding, the split is a positive escalation trigger — resolve it at the PM/human layer with both positions quoted; never average it away, and never treat unanimity among correlated reviewers as independent confirmation. `Installed 2026-07-07, not yet proven in a live run.`
```

#### Edit B3.1 — `docs/MULTI_AGENT_WORKFLOW.md` (Dispatch modes preamble)

Target file: `/Users/chrisparsons/Documents/GitHub/app-blueprint/docs/MULTI_AGENT_WORKFLOW.md`

ANCHOR (verbatim, dispatch-modes preamble, line 25):

```
PM can dispatch a worker two ways. Both modes use the same worker plan doc — the doc is the durable artifact regardless of where the work runs.
```

Placement: **AFTER** the anchor line (before the blank line preceding `### Subagent dispatch (default)`).

New text:

```

When a phase runs workers on **different models** (e.g. an Opus PM dispatching Sonnet workers), note
the producing model on each worker artifact so provenance and cost are visible at a glance. Optional
and conditional — skip it on the common single-model phase; do not add a standing model field to the
worker-doc header skeleton. `Installed 2026-07-07, not yet proven in a live run.`
```

---

### Handoff notes for other lanes

- **No CLAUDE.md edits in this lane** — none of B1/B2/B3 touch CLAUDE.md. Nothing to hand to Lane E.
- **MULTI_AGENT_WORKFLOW.md is touched by three lanes' worth of edits from THIS lane** (B1.1 Phase 8
  @191, B2.2 Phase 6 @142, B3.1 preamble @25) — all three are non-overlapping insertions at distinct
  anchors; assembler can apply in any order. No other lane targets MULTI_AGENT_WORKFLOW.md per the
  dispositions brief, so no cross-lane collision on this file.
- **audit-code.md**: this lane inserts only the Split-verdict clause (B2.1) after line 251. Lane A/C/D
  do not target audit-code.md per the brief; if any lane later cites "audit-code.md Refutation Pass,"
  it should reference the existing Refutation Pass / Refutation Ledger (line 235–255), which this edit
  extends, not replaces.
- **B1 citation dependency:** B1 prose cites `verification-discipline-adoption-spec.md §3` and
  `ship.md` Step 3.5 as the A3 truth-gate carrier — both are existing frozen/shipped artifacts, so no
  other lane needs to create them.


## Lane C — Commands

Items: **C1** (`scope-graduation-autonomy-3`, P2) · **C2** (`triage-provenance-1`, P1) ·
**C3** (`triage-provenance-2`, P2) · **C4** (`empty-result-routing-2`, P2).
Source: agent-blueprint v0.6.0/v0.6.1. Every ported change ships flagged
`Installed 2026-07-07, not yet proven in a live run` except where receiving-side field
evidence is called out explicitly.

---

### C1 — LOCKED certifies dispatch-readiness, NOT deploy authorization

**What.** `/plan-review` Step 6 writes a `> **Status: LOCKED YYYY-MM-DD**` header once a spec
passes the lockdown check. app-blueprint's plan-review.md:204 defines that header only as the
signal that downstream `/orchestrate` (Phase 6) and `/implement` use to decide dispatch-readiness —
it stops short of saying LOCKED is **not** deploy authorization. Append the missing distinction.

**Why.** A LOCKED spec reads as a green light. In app-blueprint the LOCKED→dispatch→implement path
is *shorter* than agent-blueprint's, because `/implement` recommends running `/db-push` (a remote/prod
migration) immediately after batches succeed — so "LOCKED means I can push migrations / promote to prod" is if
anything a sharper failure mode here than in the source framework. The clarification costs one
sentence and closes it. This is the same failure family as E1's scope-graduation gap (design
sign-off ≠ deploy authorization) — C1 fixes the narrow LOCKED-header wording; E1 fixes the general
conduct rule.

**Evidence.** Refutation failed to kill it (`scope-graduation-autonomy-3`, ADOPT, high
confidence): the deploy clause is genuinely absent at plan-review.md:204 and mirrored at
CLAUDE.md:65, and no scope-graduation doctrine was ever ported into app-blueprint, so the finder
correctly scoped it to the narrow LOCKED clause. Source hunk: agent-blueprint plan-review.md
`@@ -194` — "LOCKED certifies design completeness and dispatch-readiness — NOT user authorization to
deploy; deploy remains gated at the Phase 9/10 checkpoints." Gate names are localized to
app-blueprint's real gates (`/ship` smoke truth-gate, `/db-push` remote-migration gate) so there is
no over-port mismatch.

**Receiving-side flag.** `Installed 2026-07-07, not yet proven in a live run.`

The mirrored CLAUDE.md:65 bullet gets the same clause — see **Handoff to Lane E** below (Lane C
writes no CLAUDE.md edit block).

---

### C2 — `/plan` gains the provenance-of-superseded-work rule

**What.** Add a scope-step bullet to `/plan` Step 1 requiring that a plan which replaces or is
inspired by prior work (an open/abandoned PR, a stale branch, or an existing implementation already
in the codebase) link every inspiring artifact and locate the current code *before* proposing the
replacement.

**Why.** Adopted app repos routinely plan rewrites of existing routes/components and re-do stalled
PRs. Naming and reading the prior artifact prevents re-litigating solved decisions and losing
working edge-case handling. This is distinct from the reuse search already in `/plan` Step 2:
Step 2 is REUSE-oriented (find code to build on for the current task); the novel discipline is
SUPERSESSION-oriented (name and locate the specific artifact this plan replaces). A green-field
rewrite of an existing component can satisfy Step 2 without ever linking the thing it replaces — so
the discipline is genuinely absent, not a duplicate.

**Evidence.** `triage-provenance-1` (P1, ADOPT-REVISED, medium): grep for
`supersed|provenance|inspiring|existing implementation` returned zero hits in plan.md/plan-review.md;
the nearest coverage (Step 2 reuse search, Step 3 "reuse existing") is reuse-oriented, not
supersession-oriented. The v0.2.0 port's "A4-provenance" ([verified]/[relayed] claim-tagging) is a
different concept. **Panel revision applied:** frame it supersession-specific (not a second "search
the codebase"). The source hunk (agent-blueprint plan.md:127) carries a `/triage` motivating example;
because Lane C also ports `/triage` into app-blueprint (C3), the `/triage` reference is kept — it is
the same provenance handoff loop `/triage` names back to `/plan`. Source hunk: v06-full-diff.txt:127.

**Receiving-side flag.** `Installed 2026-07-07, not yet proven in a live run.`

---

### C3 — NEW `/triage` command (ported whole from agent-blueprint)

**What.** Add `.claude/commands/triage.md` — a fan-out orchestrator that enumerates-and-freezes N
stale backlog items, dispatches one investigator per item, stress-tests each verdict with an
independent judge that reuses the `/audit-code` Refutation Ledger, escalates split verdicts, and
reconciles a mandatory fail-loud coverage tally (`N in / N verdicts / K unverified`). Sorts a
backlog into action buckets; hands graduated items to `/plan`. A new command-table row goes in
CLAUDE.md (Handoff to Lane E — Lane C writes no CLAUDE.md edit block).

**Why.** App repos accumulate stale PRs, abandoned feature branches, and half-finished work items at
least as much as agent repos; the mechanic is git/gh-based and fully domain-agnostic. The one
dependency it needs already exists: the Refutation Pass / Refutation Ledger is present verbatim at
audit-code.md:235-255, so `/triage` reuses it rather than reinventing.

**Evidence & the citation-repointing correction.** `triage-provenance-2` (P2, ADOPT-REVISED, high).
The gap is real (`ls .claude/commands/` has no triage.md; the only "triage" hits — adopt.md,
orchestrate.md — are unrelated). The refuter confirmed the finder's original repointing plan was
**factually wrong** and specified the corrected citations, applied here:

- **`[PROCESS-3]` is NOT available downstream.** app-blueprint explicitly REJECTED it (no Workflow
  tool — verification-discipline-adoption-spec.md §0/§13). It is not in that spec's §12 (only
  PROC-1/2/4 captured). The source triage.md leans on `[PROCESS-3]` hardest (the entire Step 5
  coverage guard). → **Inlined the coverage-guard rule text**; cited the app-blueprint spec's own
  **field-attested** dropped-agent instance instead: verification-discipline-adoption-spec.md §14
  records two schema-forced verify agents that died and were logged `UNVERIFIED` rather than
  silently dropped. So the fail-loud-tally mechanic is not agent-only theory — it is proven in the
  target framework (Next/Supabase). This is the one part of C3 with receiving-side field evidence.
- **`docs/LESSONS.md` ships EMPTY** — there are no `[PROCESS-*]` / `[SKILL-1]` IDs to cite. →
  `[PROCESS-4]` (unanimity/split) inlined + cited to the spec's §12 `[PROC-4]` reference pattern and
  the `/audit-code` Refutation Pass; `[SKILL-1]` (don't over-embed deterministic logic) inlined as
  rationale.
- Refutation Ledger reuse repoints to `/audit-code` → "Refutation Pass" (audit-code.md Step B,
  present at :235-255). Frontmatter converted to app-blueprint's `arguments:` block convention and
  the description rewritten "Use when…" per docs/AUTHORING_COMMANDS.md §1/§2. Default buckets and the
  frozen-N tally kept verbatim in spirit. Provenance handoff to `/plan` (C2) kept.

**Receiving-side flag.** `Installed 2026-07-07, not yet proven in a live run` for the command as a
whole; the fail-loud coverage-tally mechanic is **field-attested downstream** (spec §14) — noted in
the file's banner.

---

### C4 — Empty-result contract (`/investigate` + docs/AUTHORING_COMMANDS.md)

**What.** (1) Add an empty-result close-out to `/investigate`'s output template and its "After
Subagent Returns" branches: an investigation that legitimately finds nothing MUST say so explicitly
and name the exact target inspected. (2) Generalize the rule as one authoring convention in
docs/AUTHORING_COMMANDS.md so future review/audit/investigate-shaped commands inherit it.

**Why.** investigate.md's "After Subagent Returns" has only two branches (root cause identified;
need more context) — a run that legitimately finds nothing has no prescribed explicit output, so it
returns thin/silent and reads as an incomplete run, triggering a wasteful re-investigation. The
blind-spot-honesty contract already landed on the four audit commands (audit-code.md:255 etc.) — the
highest-stakes surface — but was never generalized to investigate-shaped commands or written into the
authoring guide, so new commands don't inherit it.

**Evidence.** `empty-result-routing-2` (P2, ADOPT-REVISED, medium). Panel narrowed but confirmed:
AUTHORING_COMMANDS.md (all 8 sections read) has no empty-result rule; investigate.md's close-out has
no "found nothing" branch. The candidate over-claimed — investigate.md's required output template
already structurally names inspected targets (Data Flow Trace, "All Usages Found | Location |
File:Line", Routing/Wiring Verification) — so the residual is exactly the explicit close-out branch +
the one generalized authoring line. Source hunks: v06-full-diff.txt:402 (OC_KB_02 empty-result
contract), :411 (checklist), :68 (gen-skill Report step). The source's `[PROCESS-3]` "log-the-drop"
tag is dropped; the app-side rule cites `/audit-code`'s blind-spot honesty, which resolves inside
app-blueprint.

**Receiving-side flag.** `Installed 2026-07-07, not yet proven in a live run.`

---

### Decisions

| Decision | Choice | Reasoning | Date |
|---|---|---|---|
| C1 — where to put the LOCKED≠deploy clause | Append to plan-review.md:204 (the LOCKED-convention sentence) + mirror on CLAUDE.md:65 (handed to Lane E) | Refutation confirmed the deploy clause absent at both; `/implement` recommends `/db-push` immediately after batches so the "LOCKED = green light to prod" failure is sharper in app-blueprint than in the source | 2026-07-07 |
| C1 — which gate names to cite | app-blueprint's real gates: `/ship` smoke truth-gate + `/db-push` remote-migration gate | Localized gate names avoid an over-port mismatch; both resolve inside app-blueprint (CLAUDE.md command table) | 2026-07-07 |
| C2 — frame vs. `/plan` Step 2 reuse search | Supersession-specific bullet, not a second "search the codebase" | Step 2 is reuse-oriented; a green-field rewrite can satisfy it without linking the superseded artifact — the discipline is genuinely absent | 2026-07-07 |
| C2 — keep or drop the `/triage` example | Keep | Lane C ports `/triage` (C3), so the reference resolves; it closes the provenance handoff loop `/triage` names back to `/plan` | 2026-07-07 |
| C3 — port `/triage` as a net-new command | Adopt (P2) | Domain-agnostic git/gh mechanic; Refutation Ledger dependency already present (audit-code.md:235-255); app repos accumulate the same stale backlogs | 2026-07-07 |
| C3 — `[PROCESS-3]` coverage-guard citation | Inline the rule text; cite field-attested downstream instance (spec §14) | `[PROCESS-3]` was explicitly REJECTED in app-blueprint (no Workflow tool) and is absent from §12; the dropped-agent discipline itself IS field-proven downstream, strengthening the port | 2026-07-07 |
| C3 — `[PROCESS-4]` / `[SKILL-1]` / LESSONS citations | Inline rationale; cite spec §12 `[PROC-4]` + `/audit-code` Refutation Pass | `docs/LESSONS.md` ships empty — no `[PROCESS-*]`/`[SKILL-1]` IDs exist to repoint to | 2026-07-07 |
| C3 — frontmatter shape | Convert `argument-hint` → `arguments:` block; rewrite description "Use when…" | Matches app-blueprint's convention (AUTHORING_COMMANDS.md §1/§2) | 2026-07-07 |
| C4 — placement | investigate.md output template + "After Subagent Returns" branch, and one general convention in AUTHORING_COMMANDS.md §5 | Panel narrowed to the explicit close-out branch + one authoring line; audits already carry blind-spot honesty, investigate already names targets | 2026-07-07 |
| C4 — `[PROCESS-3]` "log-the-drop" tag | Drop; cite `/audit-code` blind-spot honesty instead | Keeps every cross-reference resolving inside app-blueprint; `[PROCESS-3]` is rejected downstream | 2026-07-07 |

---

### Edit blocks

#### Edit C-1 — C1 — `.claude/commands/plan-review.md`

**Target:** `/Users/chrisparsons/Documents/GitHub/app-blueprint/.claude/commands/plan-review.md`
**Anchor (verbatim, line 204):**

```
The LOCKED header is the convention that downstream `/orchestrate` (Phase 6) and `/implement` use to decide whether the spec is dispatch-ready. Drafts without the header are exploratory only.
```

**Action:** REPLACE the anchor line with:

```
The LOCKED header is the convention that downstream `/orchestrate` (Phase 6) and `/implement` use to decide whether the spec is dispatch-ready. Drafts without the header are exploratory only. LOCKED certifies design **completeness and dispatch-readiness — NOT user authorization to deploy.** A LOCKED spec is clear to dispatch into implementation; it is not a green light to push migrations or promote to prod. Deploy stays gated downstream at `/ship`'s smoke truth-gate (Step 3.5) and the `/db-push` remote-migration gate — and `/implement` recommends `/db-push` immediately after batches succeed, so LOCKED must never be read as migration-push authorization.
```

**Flag:** `Installed 2026-07-07, not yet proven in a live run` — recorded here, not embedded in the operational plan-review text (see header conventions).

---

#### Edit C-2 — C2 — `.claude/commands/plan.md`

**Target:** `/Users/chrisparsons/Documents/GitHub/app-blueprint/.claude/commands/plan.md`
**Anchor (verbatim, end of the earned-vs-assumed bullet, line 53):**

```
- **Earned vs. assumed scope-out:** For every "out of scope," "existing behavior preserved," or "verifiable later" assumption, classify it. Earned = "I confirmed X works." Assumed = "I couldn't confirm X — building anyway." Mark every assumed scope-out as a dependency that must be verified before or during implementation. See `docs/LESSONS.md` `[PROCESS-1]`.
```

**Action:** INSERT AFTER the anchor line (new bullet in Step 1 "Understand the Scope"):

```
- **Provenance of superseded work:** If this plan replaces or is inspired by prior work — an open or abandoned PR, a stale branch, or an existing implementation already in the codebase (e.g. an item routed here from `/triage`) — link every inspiring artifact and locate where the current code lives *before* proposing the replacement. This is distinct from the reuse search in Step 2: reuse finds code to build on; provenance names and reads the specific artifact this plan supersedes, so you don't re-litigate solved decisions or lose working edge-case handling. Don't design a rewrite in a vacuum when the code it replaces already ships.
```

**Flag:** `Installed 2026-07-07, not yet proven in a live run` — recorded here, not embedded in the Step-1 checklist bullet (see header conventions).

---

#### Edit C-3 — C4 — `.claude/commands/investigate.md` (output template)

**Target:** `/Users/chrisparsons/Documents/GitHub/app-blueprint/.claude/commands/investigate.md`
**Anchor (verbatim, lines 123-124 — the last block inside the Output Format fence):**

```
### Recommended Fix/Approach
[Specific change needed — file and line if known]
```

**Action:** INSERT AFTER the anchor block (still inside the `` ```markdown `` output template, before its closing fence):

```
### If Nothing Was Found (empty-result close-out — required when true)
If this investigation legitimately finds nothing — no root cause, no matching usages, or the reported behavior is not actually a bug — say so **explicitly** and name the exact target inspected (files, globs, routes, and symbols searched). Do not return a thin summary: a silent empty return reads to the caller as an incomplete run and triggers a wasteful re-investigation. (This is the investigate-side twin of `/audit-code`'s blind-spot-honesty rule.)
```

**Flag:** `Installed 2026-07-07, not yet proven in a live run` — recorded here, not embedded in the output template (the template is what investigations print; see header conventions).

---

#### Edit C-4 — C4 — `.claude/commands/investigate.md` (After Subagent Returns)

**Target:** `/Users/chrisparsons/Documents/GitHub/app-blueprint/.claude/commands/investigate.md`
**Anchor (verbatim, lines 139-143):**

```
## After Subagent Returns

1. Root cause identified → run `/plan` for implementation planning
2. Need more context → ask user or run again with narrower focus
```

**Action:** REPLACE the anchor block with:

```
## After Subagent Returns

1. Root cause identified → run `/plan` for implementation planning
2. Need more context → ask user or run again with narrower focus
3. Legitimately found nothing (no root cause, no matching usages, or not actually a bug) → report that explicitly and name the exact target inspected — never return a thin/silent summary that reads as an incomplete run
```

**Flag:** `Installed 2026-07-07, not yet proven in a live run` — recorded here, not embedded in the operational branch list (see header conventions).

---

#### Edit C-5 — C4 — `docs/AUTHORING_COMMANDS.md` (general authoring rule)

**Target:** `/Users/chrisparsons/Documents/GitHub/app-blueprint/docs/AUTHORING_COMMANDS.md`
**Anchor (verbatim, the §5 cross-reference bullet, lines 127-129):**

```
- Cross-reference sibling commands and KBs by name (`/plan-review`, `docs/MULTI_AGENT_WORKFLOW.md`).
  **Do not `@`-link files** — `@path` force-loads the entire file into context every time the
  command loads. Reference the path as text and let the agent open it on demand.
```

**Action:** INSERT AFTER the anchor block (new bullet in §5 "Conventions in this framework"):

```
- **Empty-result contract.** If a command's work can legitimately find *nothing* (a review with no
  findings, an investigation with no root cause, a search with no matches), it MUST say so explicitly
  and name the exact target it inspected (files/globs/routes/branch) rather than returning a thin or
  silent summary — a silent empty return reads to the caller as an incomplete run and triggers a
  wasteful re-invocation. The audit commands already carry this as blind-spot honesty
  (`/audit-code` → "Refutation Pass"); it generalizes to every review/audit/investigate-shaped
  command. (`Installed 2026-07-07, not yet proven in a live run.`)
```

---

#### Edit C-6 — C3 — NEW FILE `.claude/commands/triage.md`

**Target:** `/Users/chrisparsons/Documents/GitHub/app-blueprint/.claude/commands/triage.md`
**Action:** NEW FILE. Full content:

````
---
description: Use when a pile of stale work has accumulated — open PRs, abandoned branches, half-finished work items — and you need a per-item verdict (ready / needs-work / superseded / rewrite) with an independent second opinion before planning anything new. Sorts a backlog into action buckets with a fail-loud coverage tally, then hands graduated items to /plan. Not a planning tool — use /plan for that.
arguments:
  - name: backlog
    description: The backlog to triage — a list of PRs/branches/items, or a source to discover them from (e.g. "open PRs on origin"). Discovers via git/gh if omitted.
    required: false
---

# Backlog Triage

> **`Installed 2026-07-07, not yet proven in a live run.`** Ported from agent-blueprint's
> `/triage`. The fan-out mechanic has not yet fired in an app-blueprint live run — treat its first
> few runs as calibration. The one exception is the fail-loud coverage tally (Steps 1 + 5): that
> exact dropped-agent discipline is **already field-attested downstream** —
> `docs/verification-discipline-adoption-spec.md` §14 records two schema-forced verify agents that
> died and were logged `UNVERIFIED` rather than silently dropped.

**IMPORTANT: This command orchestrates a fan-out of subagents. The main session enumerates the backlog, dispatches one investigator per item, stress-tests each verdict with an independent judge, and reconciles a fail-loud coverage tally. It reuses the Refutation Ledger mechanic from `/audit-code` — do NOT invent a new panel format.**

## When to use

Reach for `/triage` when a pile of stale work has accumulated — open PRs, abandoned branches, half-finished work items — and you need to know, per item, *what to do with it* before you plan anything new. It answers "which of these is ready, which is superseded, which is a good idea that needs a rewrite" with evidence and an independent second opinion, and it refuses to quietly lose an item along the way. It is a **sorting** tool, not a planning tool: it produces buckets and an order of operations, then hands off to `/plan` for anything that graduates to implementation.

## Action Required

Work through the steps below **in order**. The item enumeration (Step 1) and the coverage tally (Step 5) are the two mechanical musts — everything between them is judgment. Do not skip the tally even if every item looks obviously bucketed.

---

## Step 1: Enumerate the item set — record N

Before dispatching anything, build the **explicit list of items to triage** and record its count **N**. N is the coverage denominator for the rest of the run; it is fixed here and checked against at the end.

- If the user supplied the list, use it verbatim — one item = one row.
- If the user named a source ("open PRs", "stale branches"), discover the set with `git`/`gh` (e.g. `gh pr list --state open`, `git branch -a --sort=-committerdate`, `gh issue list`) and enumerate what you find.
- Write the enumerated list back to the user (or into the output table's first column) so N is visible and auditable. An item that can't be pinned to a concrete artifact (a PR number, a branch name, an issue ID) is still an item — record it with whatever identifier exists; do not drop it for being vague.

**N is now frozen.** Every later step reconciles against it.

## Step 2: Fan out — one investigator per item

Spawn **one investigator subagent per item** (`subagent_type: Explore`). Each investigator inspects only its single item and returns a **bucket verdict with evidence**.

**Default buckets** (rename per backlog — these are a starting vocabulary, not a fixed law; a docs backlog or a research backlog may need different names):

| Bucket | Meaning |
|--------|---------|
| `ready-to-merge` | Sound as-is; merge/adopt with no further work. |
| `good-but-needs-touch-up` | Right direction, bounded fixes needed before it lands. |
| `trumped` | Superseded by other work already merged or in flight — close it. |
| `good-idea-but-rewrite` | Worth doing, but the existing implementation should be redone rather than salvaged. |

Each investigator returns: the item ID, its assigned bucket, and **evidence** — concrete `file:line` references, PR/branch refs, or commit SHAs that justify the bucket. A bucket with no evidence is not a verdict; an investigator that cannot find evidence must say so explicitly (see the empty-result / blind-spot-honesty discipline in `/audit-code`).

**Bucket assignment is judgment, not a lookup.** Do not hardcode criteria into a decision tree — read the item's actual diff/state and reason about it. The investigator's job is to argue a bucket *from evidence*, not to pattern-match a label.

## Step 3: Stress-test each verdict — independent judge pass (Refutation Ledger)

Each investigator verdict is a **self-report**. Before trusting it, run an independent stress-test that reuses the `/audit-code` Refutation Ledger mechanic (see `/audit-code` → "Refutation Pass"). For each item's verdict, spawn **one fresh judge** (`subagent_type: Explore`, a context that never saw the investigator's reasoning), given only the item ID, its assigned bucket, and the investigator's evidence, with the inverted mandate:

> "Verdict: this item is `[bucket]` because [evidence]. Your job is to **KILL** that verdict. Read the primary source yourself — the actual diff, branch, or referenced code — and find the strongest evidence the bucket is wrong: it should sit in a different bucket, the evidence is stale, or the item was already superseded. Quote the contradicting lines. If you cannot refute it after a real search, say so and state what observation *would* have changed the bucket. Default to skepticism."

Each judge returns one of **CONFIRMED** (tried and failed to move it — quote the empty/contrary search) · **OVERSTATED** (real but belongs in a milder/different bucket — cite the narrowing evidence) · **REFUTED** (wrong bucket — cite the corrected bucket and the `file:line` that proves it), with a confidence and quoted evidence.

Record a **Refutation Ledger** (Item | Investigator bucket | Judge verdict | Confidence | Refuting/confirming evidence) exactly as `/audit-code` does. The judge verdict — not the investigator's self-report — is what lands in the output table.

## Step 4: Resolve only contested verdicts — split ⇒ escalate

The orchestrator (main session) resolves **only contested verdicts** — those where the investigator and judge disagree, or where independent judges split. Leave uncontested verdicts as they stand.

- **A split is a positive escalation signal, not noise.** Surface every contested item with **both positions quoted** and route it to the operator/human for the call. Never average two buckets into a third or silently pick one.
- **Unanimity earns nothing.** Agreement between investigator and judge is NOT promoted to "verified" — correlated agents that share a seed error launder a false verdict into false confidence. This is the same "the synthesis is the least-trustworthy layer; verify the primaries" rule the `/audit-code` Refutation Pass rests on (`docs/verification-discipline-adoption-spec.md` §12 `[PROC-4]`). A unanimous verdict is *un-contested*, which is all the ledger claims for it — not *independently confirmed*.

## Step 5: Coverage guard — MANDATORY, fail loud

This is the one non-negotiable mechanic. Reconcile the tally against the frozen **N** from Step 1:

- **N items in → N verdicts out.** Count the verdicts in the ledger. If it does not equal N, the run **fails loud** — do not present a triage table that silently covers fewer items than went in.
- **Any dropped or failed investigator/judge = verdict `UNVERIFIED`** for that item, surfaced **loudly** as its own row in the output table. A subagent that died, timed out, or returned nothing does NOT get omitted — it gets an `UNVERIFIED` row so the gap is visible, never silent. (This exact failure mode is field-attested downstream: `docs/verification-discipline-adoption-spec.md` §14 records two schema-forced verify agents that died and were logged `UNVERIFIED` rather than being silently dropped from the coverage count.)
- The output's count line (Step 6) states the reconciliation explicitly so a coverage drop cannot be laundered into a clean-looking table.

## Step 6: Output — triage table, order of operations, count line

Present:

**1. Triage table** — one row per item (including every `UNVERIFIED` row):

```markdown
| Item | Bucket | Judge verdict | Evidence |
|------|--------|---------------|----------|
| PR #123 | ready-to-merge | CONFIRMED | src/foo.ts:44 — matches convention |
| branch/x | good-idea-but-rewrite | OVERSTATED → good-but-needs-touch-up | api/y.ts:12 — smaller fix than claimed |
| PR #130 | UNVERIFIED | — | investigator dropped; re-run required |
```

**2. Suggested order of operations** — a recommended sequence for acting on the buckets (e.g. land `ready-to-merge` first to shrink the surface, then close `trumped`, then schedule `good-but-needs-touch-up`, then `/plan` the `good-idea-but-rewrite` items). This is advice, not a script — the operator sequences by their own priorities.

**3. Count line** (verbatim, always present): **`N in / N verdicts / K unverified`** — the explicit reconciliation. If `verdicts ≠ N`, this line is where the failure is declared.

---

## Provenance rule — for any plan spawned from triage

Any plan that grows out of a triage bucket (typically a `good-idea-but-rewrite` or `good-but-needs-touch-up` item routed to `/plan`) **MUST link every inspiring PR/branch and describe where the existing implementation lives before proposing the replacement.** A triage-born plan that proposes new work without naming the prior artifact it supersedes and locating that artifact's code is incomplete — the whole point of triage is that these items already have a history. (`/plan` carries the same rule in its scope step.)

## Important rules

- **The tally is the one mechanical must; the buckets are judgment.** Bucket names and criteria are operator-adjustable and evidence-driven — do not freeze them into a decision tree (don't over-embed deterministic logic in a judgment workflow). The coverage reconciliation (Steps 1 and 5) is the single line that must fire exactly, every run.
- **Reuse the Refutation Ledger — do not reinvent it.** Step 3 is the `/audit-code` mechanic applied to bucket verdicts, not a new panel format.
- **Escalate splits; never promote unanimity to "verified."** Unanimity is *un-contested*, not *independently confirmed*.
- **Never silently drop an item.** A dropped subagent becomes a loud `UNVERIFIED` row, never an omission.
````

---

### Handoff to Lane E (CLAUDE.md — Lane E is sole owner of CLAUDE.md edit blocks)

Lane C mirrors two one-line deltas into CLAUDE.md; Lane E must apply both.

**Delta E-from-C-1 (C1 — LOCKED≠deploy on the spec-lockdown bullet).**
Anchor (verbatim, CLAUDE.md:65):

```
- **Spec lockdown convention:** a spec doc becomes implementable only once `/plan-review` Step 6 writes a `> **Status: LOCKED YYYY-MM-DD**` header. Drafts without it are exploratory only; `/orchestrate` Phase 6 and `/implement` use the header to decide whether to dispatch.
```

Append to the end of that bullet (exact appended text is fenced in Edit E2-C1, which is the authoritative form): LOCKED certifies design completeness and dispatch-readiness, NOT authorization to deploy — deploy stays gated downstream at `/ship`'s smoke truth-gate (Step 3.5) and the `/db-push` remote-migration gate.

**Delta E-from-C-2 (C3 — new `/triage` command-table row).**
Anchor (verbatim, the `Planning & Review` table, CLAUDE.md:96):

```
| `/plan-review` | Gap analysis on a spec doc before implementing |
```

Insert AFTER it a new row:

```
| `/triage` | Sort a stale backlog (PRs/branches/work items) into action buckets with judge-verified verdicts and a fail-loud coverage tally |
```

(Note for Lane E: if you prefer, these can live in the `Orchestrators` block instead, since `/triage` is a fan-out orchestrator — but Planning & Review is the closer semantic fit next to `/plan` and `/plan-review`.)


## Lane D — routing / debug / glossary (D1, D2, D3)

Source: agent-blueprint v0.6.0/v0.6.1 (OC_KB_05 "Routing philosophy"; debug.md excuse-table row + [PROCESS-7]; kickoff.md Phase 5 Q6 + CLAUDE.md Preferences glossary line + user-memory `**Glossary:**` field). All three ported items are `Installed 2026-07-07, not yet proven in a live run` per [PROCESS-1] — receiving-side field grounding is noted per item where it exists.

---

### D1 — Routing is judged on output quality for what ships (`empty-result-routing-1`, P1)

**What.** `docs/AI KBs/AI_KB_1_Anthropic_API_Patterns.md` `## Model selection` is one-directional: three explicit over-spend guards (line 456 "do not default to it because it 'feels safer'"; line 909 "smallest sufficient model"; line 922 anti-pattern "Default to Opus when Sonnet suffices") and no under-spend guard. The decision heuristic (lines 449–453) falls user-facing copy through to Haiku. The v0.6 counter-doctrine — cost minimization gates *exploration*, not *what ships* — is absent everywhere in the AI/Obs KBs.

**Why (translated to app-domain).** app-blueprint apps *call* the Anthropic API to produce output that ships straight to end users (generated copy, UX text, high-stakes analysis). Under-spending on that output is a first-class app failure mode, arguably more acute than in agent-building where output is often internal ops. The counterweight: output the end user judges directly is judged on output *quality*, not price — escalating to the top tier costs less than shipping mediocre user-facing output.

**Scope discipline (refuter correction — do NOT duplicate).** The tier table (line 442) *already* routes high-stakes analysis to Opus and defaults to Sonnet; the decision heuristic (line 450) already escalates `requiresDeepReasoning || isAgentic` to Opus. Quality-tiering already exists. The only genuine gap is the missing *direction*: escalate-toward-what-ships / judge-output-not-price. So this ships compact (one short counterweight paragraph + one matching ALWAYS bullet), NOT a "floor not a ceiling" paragraph that would re-assert the half-present line-450 guard and read as a contradiction of line 456/922.

**Stripped from source (no app analog).** All OpenClaw-runtime machinery — per-cron API keys, per-cron-key cost attribution, per-skill overrides, "a skill routed to a cheaper model has standing permission to redo the work." A deployed app routes deterministically via a per-call model string; there is no sticky config-routing "ceiling" to unstick and no runtime self-escalation. The design-time analog is: the decision heuristic is a default a feature may override on a stronger model, at design time or via an explicit judge-then-retry loop (AI_KB_4 already carries the judge-model pattern). The app-native cost-visibility hook is the already-present `response.usage` logging (line 911), not cron cost attribution.

**Receiving-side flag.** `Installed 2026-07-07, not yet proven in a live run.` Confidence medium: LESSONS.md is empty, so no downstream transcript yet shows a team under-spending on shipped AI output — only strong structural fit (the domain inherently exhibits the failure mode). AI_KB_4 cross-ref deliberately NOT added (line 846 already carries stronger-judge; ship-vs-explore is not an evals concern — a cross-ref adds link weight for no protection).

---

### D2 — Debug excuse-row + first-fix-cost escalation (`effort-disproportion-3`, P2)

**What.** `.claude/commands/debug.md` has (a) a 5-row "Rationalizations you will generate" table (lines 42–46) with no fix-disproportion / "it merged clean and fast" row, and (b) an escape hatch (line 50–52) that fires only on a *count* of three failed fixes — never on a single expensive/suspiciously-cheap FIRST fix.

**Why (translated).** A fix disproportionate to its request-class (many files, crossed layers) — or one that lands suspiciously fast while asserting a table/column/RLS policy/hook/route you did not expect to exist — is a codebase / world-model signal, not a green light. app-blueprint's own field transcripts document 3 misanchored-debugging chases (`verification-discipline-adoption-spec.md:135`, e.g. `f6d984e0` cache→closure→stale-render, 3 wrong diagnoses before "it's my error, line 167"), so the "your model of the problem is wrong" reflex is field-attested here — but that evidence is *diagnosis-phase*; the post-fix *acceptance*-moment scrutiny is net-new.

**Scope discipline (placement-cost lens).**
- (a) Self-contained excuse-table row — no dangling cite. Source cited `LESSONS.md [PROCESS-7]` + `[PROCESS-1] Corollary 1`; neither resolves in app-blueprint (LESSONS.md ships empty by design; no `[PROCESS-7]` exists; the only in-repo "Corollary 1" at `verification-discipline-adoption-spec.md:54` means the *re-grounding* lesson, a different concept). The row reads fine standalone; it cross-refs only the in-repo Database Layer "read the source" rule (debug.md:174).
- (b) ONE line at the escape hatch generalizing the "wrong model of the system" signal from a *count* of failed fixes to a single disproportionate first fix → route to `/brainstorm` or `/plan-review`.
- (c) DROPPED. Source proposal (c) "read that entity at its source before trusting the fix" as new prose is redundant with debug.md:63 (anchor on the primary artifact) and debug.md:174–190 ("Never guess column names. Read the source" + full-table CHECK/RLS/trigger/FK audit). The novel angle ("asserting an unexpected entity") is carried inside the excuse row's one clause instead of a fourth paragraph.

**Receiving-side flag.** `Installed 2026-07-07, not yet proven in a live run.` The failed-*count* variant is already field-proven and already handled by the existing escape hatch; the first-fix-*cost* variant is app-unproven (no first-expensive-fix incident in the transcripts). Note first-fix cost is measured by diff (files touched / layers crossed), never wall-clock.

**Handoff to Lane B (audit-code.md, not my file).** The source framework put the *merge-time* half of this signal in `audit-code.md` (v06-diff:9). app-blueprint's `audit-code.md` reuse-flag list (lines ~91–97) is the natural mirror home for a one-liner: "a completed fix/change disproportionate to its request-class, or suspiciously cheap while asserting an unexpected entity, is a world-model signal — scrutinize before accepting." Optional, Lane B's call — flagged here so it isn't lost.

---

### D3 — Evaluative-terms glossary (`fact-copy-glossary-2`, P2)

**What.** `.claude/commands/kickoff.md` Phase 5 asks 5 working-style questions (lines 270–282) with no evaluative-terms question; the user-memory template (lines 542–547) has Communication style / Autonomy / Trade-off / Escalation / Code opinions / Things to avoid but no Glossary field; CLAUDE.md `## Preferences` is a bare `[TODO]` with no glossary line.

**Why (translated).** Claude reading "clean" / "done" / "production-ready" / "accessible" differently than the user means is a universal preference-capture concern with no runtime dependency — arguably higher-stakes in taste-driven UI/mobile work, where these terms directly drive `/audit-code` and `/audit-rls` acceptance decisions and worker-dispatch interpretation. The source rationale ("sharpen task instructions and *model-routing rules*") is agent-runtime vocabulary; app-blueprint has no model-routing layer, so the rationale is translated to "sharpen task instructions and *audit acceptance* — how `/audit-code` and `/audit-rls` judge 'done'."

**Scope discipline.** Three cheap, symmetric insertions (one question, one memory field, one CLAUDE.md bullet). Because CLAUDE.md is committed/team-shared while user-memory is per-user, the shared definition is arguably more load-bearing here than in agent-blueprint. UI-taste examples kept ("done", "clean", "polished", "production-ready", "accessible", "good enough") rather than agent-blueprint's "taste."

**Receiving-side flag.** `Installed 2026-07-07, not yet proven in a live run` — recorded here only; an elicitation question and a template field have no sensible inline landing spot for a runtime flag. Confidence medium — no receiving-side field evidence (LESSONS.md empty on this theme), but the receiving structure is symmetric and the discipline is domain-neutral, so parking would add no signal (a downstream kickoff can't "prove" a preference-elicitation prompt).

---

### Decisions

| Decision | Choice | Reasoning | Date |
|---|---|---|---|
| D1 placement | AI_KB_1 `## Model selection` only — one sentence after line 456 + one ALWAYS bullet near line 909; drop AI_KB_4 cross-ref | Placement-cost lens: AI_KB_1 is the canonical routing doc; AI_KB_4:846 already carries stronger-judge, and ship-vs-explore is not an evals concern | 2026-07-07 |
| D1 shape | Compact (short counterweight paragraph + ALWAYS bullet), NOT a "floor not a ceiling" paragraph | Tier table (442) + heuristic (450) already quality-tier; only the escalate-toward-ships *direction* is absent — a full paragraph would re-assert the half-present line-450 guard and read as contradicting 456/922 | 2026-07-07 |
| D1 runtime strip | Drop "standing permission to redo on a stronger model" + per-cron/per-skill machinery; reframe as design-time default a feature may override, or a judge-then-retry loop | Deployed apps route deterministically per-call; no sticky-config ceiling and no runtime self-escalation to port | 2026-07-07 |
| D2 (a) excuse row | Self-contained row, no `[PROCESS-7]`/`[PROCESS-1] Corollary 1` cite; cross-ref in-repo Database Layer "read the source" (debug.md:174) | Both source cites dangle in app-blueprint (LESSONS empty; no PROCESS-7; "Corollary 1" means a different lesson here); row reads fine standalone | 2026-07-07 |
| D2 (b) first-fix cost | One line at the escape hatch generalizing "wrong model of the system" from a failed *count* to a single disproportionate first fix → `/brainstorm` or `/plan-review` | Existing escape hatch (line 50) only counts failed fixes; expensive first fix is the same architecture signal | 2026-07-07 |
| D2 (c) drop | Do NOT add a separate "read the entity at source" paragraph | Redundant with debug.md:63 and :174–190; the novel "unexpected entity" angle rides inside the excuse row's clause | 2026-07-07 |
| D2 merge-time half | Hand to Lane B (audit-code.md reuse-flag list) as optional one-liner, not written here | audit-code.md is Lane B's target; source put the merge-time half there (v06-diff:9) | 2026-07-07 |
| D3 rationale | Translate "model-routing rules" → "audit acceptance (how /audit-code and /audit-rls judge 'done')" | app-blueprint has no model-routing layer; audit acceptance is the app analog that these terms actually drive | 2026-07-07 |
| D3 CLAUDE.md bullet | Deltas handed to Lane E (sole CLAUDE.md owner), not written here | Lane E owns all CLAUDE.md edit blocks | 2026-07-07 |

---

### Edit blocks

#### Edit D1.1 — AI_KB_1 counterweight sentence

Target: `/Users/chrisparsons/Documents/GitHub/app-blueprint/docs/AI KBs/AI_KB_1_Anthropic_API_Patterns.md`

Anchor (verbatim, line 456), insert new text AFTER this line:

```
Sonnet 4.6 is the right default. Opus is 5x the cost per input token — do not default to it because it "feels safer."
```

New text (inserted after the anchor line):

```

**Cost gates exploration, not what ships.** The guidance above is one-directional — it guards against over-spending. The complementary guard: output the end user reads directly (generated copy, user-facing UX text, high-stakes analysis) is judged on output *quality*, not price. Escalate to the top tier when the cheaper model misses the bar — that costs less than shipping mediocre user-facing output. The decision heuristic above is a starting default, not a fixed ceiling: a feature may route a given call to a stronger model, at design time or via a judge-then-retry loop, when the output doesn't clear the bar. `Installed 2026-07-07, not yet proven in a live run.`
```

#### Edit D1.2 — AI_KB_1 ALWAYS bullet (counterweight to the terse one-sided list)

Target: `/Users/chrisparsons/Documents/GitHub/app-blueprint/docs/AI KBs/AI_KB_1_Anthropic_API_Patterns.md`

Anchor (verbatim, line 909), insert new bullet AFTER this line:

```
- Pick the smallest sufficient model: Haiku for fast/cheap tasks, Sonnet as default, Opus only for hard reasoning or agentic work.
```

New text (inserted after the anchor line):

```
- Escalate to the top tier when the cheaper model misses the bar for output the user reads directly (generated copy, UX text, high-stakes analysis) — judge it on output quality, not price; escalating costs less than shipping mediocre user-facing output. (Installed 2026-07-07, not yet proven in a live run in this framework's projects.)
```

#### Edit D2.1 — debug.md excuse-table row

Target: `/Users/chrisparsons/Documents/GitHub/app-blueprint/.claude/commands/debug.md`

Anchor (verbatim, line 46), insert new row AFTER this line:

```
| "The user is in a hurry." | Then a correct fix matters more, not less. Skipping root cause is how a 10-minute bug becomes a 3-day one. |
```

New text (inserted after the anchor line):

```
| "It worked on the first try — ship it." | A fix disproportionate to its request-class (many files, crossed layers), or suspiciously cheap while asserting a table/column/RLS policy/hook/route you did not expect to exist, is a codebase / world-model signal, not a green light. Read that entity at its source (migration / schema / the actual file — see the Database Layer "read the source" rule in Step 3) before trusting the fix; escalate to design scrutiny rather than a ceremony-free merge. |
```

**Flag:** `Installed 2026-07-07, not yet proven in a live run` — recorded here, not embedded in the excuse-table row (see header conventions).

#### Edit D2.2 — debug.md first-fix-cost escalation at the escape hatch

Target: `/Users/chrisparsons/Documents/GitHub/app-blueprint/.claude/commands/debug.md`

Anchor (verbatim, line 50), insert new text AFTER this line:

```
If **three** fix attempts have failed, STOP. Do not try a fourth variation. Three failed fixes is not a failed hypothesis — it's a signal the model of the problem is wrong (wrong layer, wrong abstraction, wrong assumption about how the system works).
```

New text (inserted after the anchor line):

```

The same "the model of the problem is wrong" signal also fires on a **single** fix that is disproportionate to its request-class — an unexpectedly large diff, crossed layers, or a fix that lands suspiciously fast while asserting an entity you didn't expect to exist. Cost here means *diff size / files touched / layers crossed*, never wall-clock. Don't low-ceremony-merge it: escalate to `/brainstorm` or `/plan-review` and question the architectural assumption before shipping.
```

**Flag:** `Installed 2026-07-07, not yet proven in a live run` — recorded here, not embedded in the escape-hatch text (see header conventions).

#### Edit D3.1 — kickoff.md Phase 5 question 6

Target: `/Users/chrisparsons/Documents/GitHub/app-blueprint/.claude/commands/kickoff.md`

Anchor (verbatim, lines 280–282), insert new question BEFORE the "**Phase 5 close:**" line (i.e. after question 5, replacing the gap between line 280 and line 282):

```
5. "What should Claude always ask you before doing? For example: 'ask before any schema change', 'ask before deleting anything', 'ask before touching auth.' Or nothing — full autonomy is fine too."

**Phase 5 close:** Summarize preferences. Confirm before writing files.
```

REPLACE the anchor block above with:

```
5. "What should Claude always ask you before doing? For example: 'ask before any schema change', 'ask before deleting anything', 'ask before touching auth.' Or nothing — full autonomy is fine too."

6. "Any evaluative words you use a lot that you'd want defined so Claude reads them the way you mean them? For example, what 'clean', 'done', 'polished', 'production-ready', 'accessible', or 'good enough' means to you. These sharpen task instructions and audit acceptance — how `/audit-code` and `/audit-rls` judge whether something is 'done.'"

**Phase 5 close:** Summarize preferences. Confirm before writing files.
```

#### Edit D3.2 — kickoff.md user-memory template Glossary field

Target: `/Users/chrisparsons/Documents/GitHub/app-blueprint/.claude/commands/kickoff.md`

Anchor (verbatim, line 547), insert new field AFTER this line:

```
**Things to avoid:** [Specific patterns or behaviors the user doesn't want]
```

New text (inserted after the anchor line):

```
**Glossary:** [Evaluative terms and what they mean here — e.g., "done", "clean", "accessible", "production-ready", "good enough" — so task descriptions and audit/dispatch decisions interpret consistently]
```

---

### Handoff to Lane E (CLAUDE.md — sole owner of CLAUDE.md edit blocks)

Add ONE glossary bullet under CLAUDE.md `## Preferences` (currently a bare `[TODO — populate during /kickoff with working style and communication preferences]`). Suggested text, with agent-runtime "routing rules" phrasing dropped in favor of the app-domain audit-acceptance framing (matches D3.1/D3.2):

```
- Glossary — evaluative terms and what they mean here (e.g., "done", "clean", "accessible", "production-ready", "good enough"), so task instructions and audit acceptance (how /audit-code and /audit-rls judge "done") plus worker-dispatch interpret consistently. [TODO — populate during /kickoff]
```

### Handoff to Lane B (audit-code.md — Lane B's target)

Optional one-liner for the audit-code.md reuse-flag list (lines ~91–97), the merge-time mirror of D2 (source put this half in agent-blueprint's audit-code.md, v06-diff:9): "a completed fix/change disproportionate to its request-class — or suspiciously cheap while asserting an unexpected entity (table/column/RLS policy/hook/route) — is a world-model signal; scrutinize it before accepting rather than merging on the strength of a clean diff." Lane B's call whether to include.

**Resolution (assembly, 2026-07-07): DECLINED.** Lane B's edits do not include it, and adding it now would preempt the parked decision on audit-code sprawl-as-signal (F-P5, `effort-disproportion-2`) — the same territory. If F-P5 promotes, fold this one-liner into that change. Thread closed.


## Lane E — CLAUDE.md conduct (E1 + E2 integration)

Source: agent-blueprint v0.6.0/v0.6.1 (`CLAUDE.md` Patterns hunk `@@ -62`, v06-full-diff.txt:249 —
the "Scope graduation is separate authorization from design sign-off…" bullet). Lane E is the SOLE
owner of every CLAUDE.md edit block; Lanes C and D hand their CLAUDE.md deltas here and write none
themselves. All three ported CLAUDE.md changes ship `Installed 2026-07-07, not yet proven in a live
run` per [PROCESS-1], with receiving-side grounding noted per item.

### E1 — Scope-graduation conduct rule (`scope-graduation-autonomy-1`, P1; folds `-2`)

**What.** Add ONE bullet to CLAUDE.md's `### Verification & safety disciplines (framework-provided)`
subsection: design sign-off is not build+deploy authorization. A design-only brief is not upgraded
to build+deploy authority by the user answering the design's open decisions — even build-scope ones.
Before the FIRST irreversible prod-mutating action (a `supabase db push` / `supabase functions
deploy` against a linked prod project, a Vercel **production** deploy, a prod environment-variable change, or a merge to a deploying
branch) the agent asks one explicit line and waits; announcing "proceeding to build" is not asking;
and it must beware ratifying its own presupposition (if the phrase implying a built/deployable
artifact originated in the agent's own question, the user's echo is not deploy authorization).

**Why.** app-blueprint agents demonstrably can take irreversible prod-mutating actions
(`db-push.md:220-223` runs `npx supabase db push --linked` against a linked prod project; Vercel
production deploy; merge-to-deploying-branch), and `/implement` recommends `/db-push` +
`supabase functions deploy` after batches succeed. The existing verification/safety disciplines
(spec-lockdown, re-grounding+refutation, ground-first anchor, smoke truth-gate, deferred-smoke
rollup, service-boundary gate) all guard the design→SHIP boundary at the test/verification layer —
none governs the earlier design→BUILD/DEPLOY authorization transition, nor the self-presupposition
trap. This is the SAME failure family the deferred-smoke bullet (CLAUDE.md:69) already names — the
self-authorized "authorized posture" ratchet: authority silently ratcheting up without an explicit
per-instance grant.

**Evidence / placement.** Placement judge (`ADOPT-REVISED`, high confidence): grep for
"scope graduation | deploy authoriz | design sign-off | prod-mutat | ratif | proceed to build/deploy
| autonomy budget" across `docs/`, `.claude/`, `CLAUDE.md` returned zero hits — no existing coverage.
The finder targeted the flat Patterns list (correct in agent-blueprint, which has no safety
subsection) — **revised to the `### Verification & safety disciplines (framework-provided)`
subsection**, after the fail-loud-or-closed bullet (~line 71), bold-lead for parity with its sibling
bullets. The DO NOT section (CLAUDE.md:134-135) is the wrong home — it is for project-discovered
hard constraints, not framework-provided conduct. The source's `OC_KB_11 §Autonomy budget` cross-ref
is **dropped** (app-blueprint has no autonomy-budget analog — grep = 0 hits; no dangling reference).

**Folds `scope-graduation-autonomy-2` (REJECTED as a standalone db-push gate; placement note merged
here).** The gap-2 refuter confirmed the "autonomous-reachability" premise was a misread —
`implement.md`'s `/db-push` references (`:240`, `:270`) are human-facing report-template checkboxes
and post-return PM guidance inside a fenced `markdown` block, not autonomous executions; typing
`/db-push` IS the deploy authorization. So NO inline gate is added to `db-push.md`. But gap-2's
placement judge established the rule is **cross-cutting** — `implement.md` recommends
`supabase functions deploy` alongside `/db-push`, so a per-command gate would leave edge-function
deploys ungated. That is why the rule lives in CLAUDE.md and its parenthetical names ALL prod-mutating
paths (db push, functions deploy, Vercel production deploy, prod env-var change, merge-to-deploying-branch), not a
db-push-only gate. (gap-2's REJECTED-import record lives in Lane F's decisions table.)

**Receiving-side flag.** `Installed 2026-07-07, not yet proven in a live run.` The 12-transcript
downstream field-proving pass (verification-discipline-adoption-spec.md §14) INVERTED the source
framework's priorities and surfaced smoke-laundering / provenance / deferred-smoke / service-boundary
as the loud signals — scope-graduation confusion never appeared in any transcript. Unlike the v0.2.0
sister spec's B1 (runtime-only silent-open, architecturally excluded from dev transcripts), this failure IS
architecturally reachable in app-blueprint, so a future downstream dev transcript CAN surface it;
promote from installed-not-proven to field-attested on that first firing.

### E2 — Integration of Lane C and Lane D CLAUDE.md deltas

The Lane C and Lane D handoff deltas were both received at authoring time and read verbatim.
Three deltas integrated:

- **Delta E-from-C-1 (C1, LOCKED≠deploy).** Append the LOCKED-is-not-deploy-authorization clause to
  the Spec-lockdown-convention bullet (CLAUDE.md:65). This mirrors the same clause C1 appends to
  `plan-review.md:204`. Same failure family as E1 (C1 fixes the narrow LOCKED-header wording; E1
  fixes the general design-sign-off→deploy transition). Gate names localized to app-blueprint's real
  gates (`/ship` smoke truth-gate Step 3.5 + `/db-push` remote-migration gate) — both resolve inside
  app-blueprint's CLAUDE.md command table; no dangling reference.
- **Delta E-from-C-2 (C3, `/triage` command-table row).** Lane C ports a NEW `/triage` command but
  cannot write CLAUDE.md; the command must appear in the CLAUDE.md command index or it is
  undiscoverable. Applied as a new row in the `### Planning & Review` table after the `/plan-review`
  row (the closer semantic fit next to `/plan`/`/plan-review`, per Lane C's own note). *(Note: the
  dispositions E2 line spotlighted only the C-1 LOCKED delta from Lane C, but this second CLAUDE.md
  delta is a hard requirement of C3's new command and Lane C explicitly handed both here — applied
  because CLAUDE.md edits route only through Lane E.)*
- **Delta E-from-D (D3, Preferences glossary line).** Add ONE glossary bullet under `## Preferences`,
  using the app-domain audit-acceptance framing (how `/audit-code` and `/audit-rls` judge "done")
  rather than agent-blueprint's agent-runtime "routing rules" phrasing — matches Lane D's kickoff.md
  and user-memory glossary edits (D3.1/D3.2).

### Decisions

| Decision | Choice | Reasoning | Date |
|---|---|---|---|
| E1 — where to place the scope-graduation rule | New bullet in `### Verification & safety disciplines (framework-provided)` (after the fail-loud-or-closed bullet, ~line 71), bold-lead for sibling parity — NOT the flat Patterns list and NOT the DO NOT section | Placement judge `ADOPT-REVISED` (high): it is a framework-provided conduct/safety discipline, same failure family as the deferred-smoke "authorized posture" ratchet bullet; DO NOT is for project-discovered constraints; flat Patterns is agent-blueprint's home because that repo lacks the safety subsection | 2026-07-07 |
| E1 — scope of the prod-mutation gate | Cross-cutting rule naming ALL prod-mutating paths (`supabase db push`, `supabase functions deploy`, Vercel production deploy, prod env-var change, merge-to-deploying-branch) — folds `scope-graduation-autonomy-2` | gap-2 placement judge: a per-`db-push.md` gate leaves `supabase functions deploy` (recommended alongside in `/implement`) ungated; the rule is cross-cutting so it belongs in CLAUDE.md | 2026-07-07 |
| E1 — `OC_KB_11 §Autonomy budget` cross-ref | Dropped | app-blueprint has no autonomy-budget analog (grep = 0 hits); keeping it would dangle | 2026-07-07 |
| E1 — receiving-side status | Ship `Installed 2026-07-07, not yet proven in a live run` | Zero receiving-side field evidence (12-transcript proving pass never surfaced scope-graduation confusion), but architecturally reachable here (unlike B1) so a future transcript can promote it | 2026-07-07 |
| E1 — no inline `db-push.md` gate | Not added | gap-2 refuter (`REJECT`): the autonomous-reachability premise was a misread — `implement.md`'s `/db-push` refs are human-facing report/PM checkboxes, and typing `/db-push` already IS the deploy authorization | 2026-07-07 |
| E2 — apply C3's `/triage` command-table row | Applied (in addition to the C-1 LOCKED delta) | CLAUDE.md edits route only through Lane E; the new `/triage` command is undiscoverable without a command-index row; Lane C explicitly handed it here | 2026-07-07 |
| E2 — `/triage` row placement | `### Planning & Review` table, after `/plan-review` | Closest semantic fit next to `/plan`/`/plan-review` (Lane C's stated preference over the Orchestrators block) | 2026-07-07 |
| E2 — D3 glossary framing | app-domain audit-acceptance framing (`/audit-code`/`/audit-rls` judge "done"), not agent-runtime "routing rules" | Matches Lane D's kickoff.md/user-memory edits; CLAUDE.md is team-shared so the shared definition is load-bearing | 2026-07-07 |

### Edit blocks

All four edits target `/Users/chrisparsons/Documents/GitHub/app-blueprint/CLAUDE.md`.

#### Edit E1 — scope-graduation bullet (INSERT AFTER anchor)

**Target file:** `/Users/chrisparsons/Documents/GitHub/app-blueprint/CLAUDE.md`

**Anchor (verbatim, the last bullet of the `### Verification & safety disciplines (framework-provided)` subsection, line 71):**

```
- **Fail-loud-or-closed (reference):** the defensive-write rule lives in `docs/Obs KBs/OBS_KB_5_Defensive_Writes.md` (Primitive 0 — close the capability; Primitive 9 — fail loud or fail closed, never `catch → log → continue`). Reference KB, not an audit acceptance gate.
```

**Placement:** INSERT the following as a new bullet immediately AFTER the anchor line (i.e., as the new final bullet of the subsection, before the blank line preceding `## Preferences`).

**New text:**

```
- **Scope graduation is separate authorization from design sign-off:** a brief that declares design-only scope is NOT upgraded to build+deploy authority by the user answering the design's open decisions — even build-scope ones. Before the first prod-mutating action (a `supabase db push` or `supabase functions deploy` against a linked prod project, a Vercel **production** deploy, a **prod environment-variable change**, or a merge to a deploying branch), ask one explicit line ("Design ratified — proceed to build + deploy now?") and wait; announcing "proceeding to build" is not asking. Beware ratifying your own presupposition: if the phrase implying a built/deployable artifact originated in your question, the user's echo is not deploy authorization. Same failure family as the deferred-smoke bullet's self-authorized "authorized posture" ratchet — authority silently ratcheting up without an explicit per-instance grant.
```

**Flag:** `Installed 2026-07-07, not yet proven in a live run` — scope-graduation confusion never appeared in the 12-transcript field-proving pass, but the failure is architecturally reachable here (`/implement` recommends `/db-push` + `supabase functions deploy` after batches succeed). Recorded here and in the decisions rows, not embedded in the CLAUDE.md bullet (see header conventions).

#### Edit E2-C1 — append LOCKED≠deploy clause to the spec-lockdown bullet (REPLACES anchor)

**Target file:** `/Users/chrisparsons/Documents/GitHub/app-blueprint/CLAUDE.md`

**Anchor (verbatim, line 65):**

```
- **Spec lockdown convention:** a spec doc becomes implementable only once `/plan-review` Step 6 writes a `> **Status: LOCKED YYYY-MM-DD**` header. Drafts without it are exploratory only; `/orchestrate` Phase 6 and `/implement` use the header to decide whether to dispatch.
```

**Placement:** REPLACES the anchor line (append clause to the end of the existing bullet).

**New text:**

```
- **Spec lockdown convention:** a spec doc becomes implementable only once `/plan-review` Step 6 writes a `> **Status: LOCKED YYYY-MM-DD**` header. Drafts without it are exploratory only; `/orchestrate` Phase 6 and `/implement` use the header to decide whether to dispatch. LOCKED certifies design completeness and dispatch-readiness, NOT authorization to deploy — deploy stays gated downstream at `/ship`'s smoke truth-gate (Step 3.5) and the `/db-push` remote-migration gate.
```

**Flag:** `Installed 2026-07-07, not yet proven in a live run` — recorded here, not embedded in the CLAUDE.md bullet (a condensed form of the flagged plan-review clause in Edit C-1; see header conventions).

#### Edit E2-C3 — `/triage` command-table row (INSERT AFTER anchor)

**Target file:** `/Users/chrisparsons/Documents/GitHub/app-blueprint/CLAUDE.md`

**Anchor (verbatim, the `/plan-review` row in the `### Planning & Review` table, line 96):**

```
| `/plan-review` | Gap analysis on a spec doc before implementing |
```

**Placement:** INSERT the following as a new table row immediately AFTER the anchor line.

**New text:**

```
| `/triage` | Sort a stale backlog (PRs/branches/work items) into action buckets with judge-verified verdicts and a fail-loud coverage tally |
```

#### Edit E2-D3 — Preferences glossary bullet (INSERT AFTER anchor)

**Target file:** `/Users/chrisparsons/Documents/GitHub/app-blueprint/CLAUDE.md`

**Anchor (verbatim, the `## Preferences` TODO line, line 74):**

```
[TODO — populate during /kickoff with working style and communication preferences]
```

**Placement:** INSERT the following as a new bullet immediately AFTER the anchor line.

**New text:**

```
- Glossary — evaluative terms and what they mean here (e.g., "done", "clean", "accessible", "production-ready", "good enough"), so task instructions and audit acceptance (how /audit-code and /audit-rls judge "done") plus worker-dispatch interpret consistently. [TODO — populate during /kickoff]
```


## Lane F — Parked items, rejected imports, deliberate non-ports

This lane carries the candidates the 72-judge panel voted real-but-not-yet-earning-placement
(parked), the imports the maintainer re-verified as dead-on-arrival for app-blueprint (rejected),
and the two changes the finders themselves declined to port (non-ports). Only the parked items
touch a file (`docs/PARKING_LOT.md`); rejected/non-port records are spec-prose in the decisions
table so the kill reasoning is auditable and a future intake doesn't re-litigate them.

Every parked item ships flagged `Installed 2026-07-07, not yet proven in a live run` per
[PROCESS-1]; each carries a concrete promotion trigger ("promote when a downstream app transcript
shows X") so it graduates on receiving-side field evidence, not on a re-reading of the same source.

---

### Parked items (candidates, not committed scope → `docs/PARKING_LOT.md`)

All seven parked because the panel's **domain-fit** judges returned DEFER: the doctrine is sound and
the translation holds, but there is no receiving-side field instance yet, and several depend on a
LESSONS.md that ships empty (no `[PROCESS-*]` entries exist), so a cross-ref would dangle. They are
tagged `framework-meta` (framework-workflow doctrine, not product scope).

#### F-P1 — `negative-status-1`: debug.md has no verify-by-attempt bar for a "cannot reproduce" verdict
- **What:** A negative debug verdict ("cannot reproduce / works-on-my-machine / not-a-bug") is a
  claim, held to the same diagnostic bar as a fix. `debug.md:63` handles a *missing* artifact by
  passive honesty only (mark downstream claims UNVERIFIED); nothing forces execute-verifying the
  candidate repro conditions the investigation surfaced (role, browser, RLS/tenant context,
  feature-flag state, data shape) before the ticket is closed, and the After-Subagent branches
  (`debug.md:268-272`) have no "could not reproduce" terminal branch.
- **Why parked:** refuter ADOPT-REVISED (high) — real but narrower than the finder's "no bar at
  all"; three kill attempts (line-63 covers it / Iron Law + escape hatch cover it / After-Subagent
  branches cover it) all failed. Domain-fit DEFER — ported doctrine, no downstream field instance;
  the v0.2.0 spec attests the claim-laundering failure for smoke/ship claims, NOT for a debug
  cannot-reproduce verdict. Priority correction P1→P2.
- **Promote when:** a downstream app-blueprint debug transcript closes a ticket "cannot reproduce /
  not-a-bug" without execute-verifying the role/browser/RLS-tenant/feature-flag/data-shape
  conditions its own investigation surfaced.

#### F-P2 — `negative-status-3`: investigate.md treats a "no usages / dead code" finding as a conclusion
- **What:** A "no usages found / dead code" verdict is a claim, not a grep result. Before it is
  asserted, attempt the indirect-reference paths a plain grep misses (dynamic/string-keyed
  dispatch, route/registry tables, dynamic `import()`, JSX-via-factory, config-/i18n-key
  references, RN native-module registration) and record the exact searches run + their empty
  results, so a downstream deletion rests on evidence rather than a grep that may have missed an
  indirect reference.
- **Why parked:** refuter ADOPT-REVISED (medium) — the real DELTA over existing coverage is
  attempting indirect-reference paths + recording searches (existing text already says verify
  imports/routing). Domain-fit DEFER (P3) — retarget from investigate.md's read-only output to the
  actual deletion decision point (`/plan` or `/implement`, where a symbol is removed).
- **Promote when:** a downstream transcript greenlights removal of a symbol asserted "unused" that a
  dynamic/string-keyed/registry/route-table/config-key reference actually reached (a false-negative
  dead-code call).

#### F-P3 — `scope-graduation-autonomy-4`: no autonomy-budget doctrine bounding the unsupervised runway
- **What:** How far may an autonomous run go before the prod gate. Grant standing multi-step
  autonomy only when (1) the reachable deploy target cannot touch prod (merges land on a feature
  branch / Vercel **preview**; prod promotion stays human-gated); (2) an automated approval gate
  precedes each irreversible step (CI/typecheck/tests + the A3 smoke truth-gate + the N2
  service-boundary gate, enforced not requested); (3) the permission grant is explicit and
  enumerated (name the verbs) — else turn-by-turn. Point the supervision surface at the existing
  committed worker-plan / phase-plan docs.
- **Why parked:** refuter ADOPT-REVISED (medium) — adopt as a reference-only subsection in
  `docs/MULTI_AGENT_WORKFLOW.md`, NOT `OBS_KB_5` (that KB owns the runtime write-error surface, wrong
  home). Placement-cost ADOPT-REVISED (high) suggested one compact clause on CLAUDE.md's
  "Verification & safety disciplines" block. Maintainer disposition: PARK the doctrine; the sibling
  **conduct** gate (`scope-graduation-autonomy-1`) IS being ported by Lane E (E1) into that CLAUDE.md
  block. This autonomy-budget doctrine is the write-path *complement* of E1's gate — once E1 lands,
  the "complement of the prod-mutation gate" framing resolves and this can home in MAW.md.
- **Promote when:** a downstream multi-step autonomous run (an `/orchestrate` or `/implement`
  session) needs an explicit runway bound because the reachable deploy target's containment is not
  obviously preview-only. **Coordinate with Lane E (E1)** — see handoff notes.

#### F-P4 — `effort-disproportion-1`: LESSONS.md has no effort-disproportion architecture-signal lesson
- **What:** A fix whose blast radius is wildly larger than its request-class implies (many files
  touched, subsystems crossed — component + hook + query + migration for a one-line ask; a bounded
  ask sprawling into a large diff) is evidence about the CODEBASE, not just the change. Do not
  low-ceremony-merge; escalate to design scrutiny (`/brainstorm`, `/plan-review`). Anchor to diff
  size / files-touched / subsystems-crossed, never wall-clock (confounded by model speed and rate
  limits).
- **Why parked:** refuter ADOPT-REVISED (high) — real. Placement-cost ADOPT-REVISED (high) counsels
  do NOT add a paragraph to LESSONS.md; instead extend `debug.md`'s three-strikes escape by one
  clause (fires on a single first fix whose diff is wildly disproportionate, not only after three
  failed fixes). Domain-fit DEFER — installed-not-proven; `docs/LESSONS.md` ships empty (no
  `[PROCESS-*]` entries), so this would be the first entry and would create the cross-ref dependency
  that keeps F-P5/F-P6 parked with it.
- **Promote when:** a downstream transcript shows a bounded ask whose fix sprawled across many
  files/subsystems was low-ceremony merged (blast-radius signal ignored) — author the LESSONS
  `[PROCESS-N]` entry on that real incident, then land F-P5/F-P6 as its consumers.

#### F-P5 — `effort-disproportion-2`: audit-code §4 frames sprawl only as a smell to trim
- **What:** One self-contained line in `audit-code.md` §4 (Over-Engineering Checks): "A fix (or
  diff) disproportionate to its request-class is a codebase signal, not only an over-engineering
  smell — when a bounded ask sprawls across many files/layers, flag it for design scrutiny
  (`/brainstorm`, `/plan-review`), not just trimming."
- **Why parked:** refuter/placement-cost ADOPT-REVISED — must be self-contained with NO dangling
  `[PROCESS-1]` cross-ref (LESSONS ships empty; a cross-ref would be dead). Domain-fit DEFER — author
  the LESSONS `[PROCESS-N]` entry FIRST on a real app-side incident, then append the §4 line with the
  correct ID. Coupled to F-P4.
- **Promote when:** F-P4's LESSONS entry lands, OR a downstream audit-code run treats sprawl only as
  a trim-smell and misses the codebase-signal escalation.

#### F-P6 — `effort-disproportion-4`: Phase 8 has no diff-vs-plan disproportion check
- **What:** A one-bullet note appended after the Phase 8 verification-gate table in
  `docs/MULTI_AGENT_WORKFLOW.md`: when the integrated diff sprawls well beyond what the slice's plan
  scoped (many files/modules for a bounded ask), read the size as a codebase-health signal, not just
  a change to accept — pause and route to `/brainstorm` or `/plan-review` rather than low-ceremony
  merging. app-blueprint's Phase 8 gate is a claim/what-verifies-it table today — promotion adds
  both the `git diff --name-only`-vs-plan computation and the disproportion read.
- **Why parked:** refuter ADOPT-REVISED (LOW) — the *weakest* of the batch: do NOT edit the Phase 8
  operational gate; the source deliberately kept this as prose doctrine and left agent-blueprint's
  own Phase 8 untouched, only cross-reffing it. Domain-fit DEFER. Marginal even if promoted; land the
  LESSONS entry first. Coupled to F-P4.
- **Promote when:** F-P4 lands AND a downstream Phase-8 integration low-ceremony-merges a diff
  disproportionate to the slice plan.

#### F-P7 — `fact-copy-glossary-1`: no durable "KB docs hold query paths, not copies of live facts" discipline
- **What:** A framework-provided KB-hygiene rule: durable docs (KB files, CLAUDE.md, MEMORY) hold the
  rule and the *query path* (which migration / RLS policy / `.env.example` / config source to read),
  never a copy of the live fact — a duplicated fact parses fine, then diverges silently from the
  source, and the agent defends the stale copy against the live system. Store the pointer; read the
  fact fresh.
- **Why parked:** refuter ADOPT-REVISED (medium) — must be NARROWED: the schema/column-name case is
  already guarded by generated Supabase types + migrations (divergence surfaces as a type error); the genuinely uncovered part
  is the *non-type-checked* live facts — **RLS policy text, env/config values, feature-flag states,
  API-contract fields** — which diverge without a type error. Placement-cost: a single bullet on
  CLAUDE.md's "Verification & safety disciplines (framework-provided)" block. Domain-fit DEFER.
- **Promote when:** a downstream transcript shows the agent defending a stale copied fact (RLS policy
  text, env value, feature-flag state, or API-contract field duplicated into a KB / CLAUDE.md /
  MEMORY) against the live source. **If promoted it wants the same CLAUDE.md block Lane E edits** —
  see handoff notes.

---

### Rejected imports (verified kills — spec-prose only, no file edit)

Each was re-verified by the maintainer after the panel. Recorded so a later intake does not resurrect
them. Reasoning lives in the decisions table below; summary here.

- **`negative-status-2`** (OBS_KB_5 negative-status dual for a declared-unavailable capability) —
  REJECT (refuter high). The PARENT primitive (Primitive 9 / silent-open) was already
  field-DISPROVEN for web: `verification-discipline-adoption-spec.md:49,221` record it scored ZERO
  field instances ("silent-open is runtime-only → reference-only") in the 12-transcript proving pass.
  The negative-status dual is even *more* agent-runtime-specific (authored from an MCP-harness-banner
  incident — agent persisting `blocked=true` off a banner it never opened), and the finder's app
  example `if (!process.env.X) return` is inaccurate: `process.env` is a synchronous in-memory read
  that cannot transiently fail. OBS_KB_5's own policy keeps this reference-only.

- **`db-write-integrity-3`** (read-back must check the audit/side-effect row landed, not just the
  primary) — REJECT (refuter medium). The exact ported incident (PGRST204 audit-row drop) is already
  covered TWICE in OBS_KB_5 (lines 50 and 53, write-error surface). More decisively, OBS_KB_3's
  Always-rule mandates writing the audit row INSIDE the same transaction as the state change (SB_KB_6
  DB-function), so an audit-insert failure rolls the primary back too — the "primary succeeds while
  its audit row silently drops" case is structurally impossible in the canonical pattern. And OBS_KB_5
  never imported a read-back primitive at all (it ported only Primitive 0 and Primitive 9), so "attach
  to OBS_KB_5 Primitive 9 read-back" is a category error — no live read-back surface exists to attach
  to.

- **`scope-graduation-autonomy-2`** (db-push.md needs its own scope-graduation gate before the
  irreversible prod push) — REJECT (refuter medium). The autonomous-reachability premise is a misread:
  the two cited chaining sites (`implement.md:240`, `:270`) are human-facing checklist TODOs — one
  sits inside a fenced ```markdown Implementation-Complete REPORT TEMPLATE the subagent prints to the
  user, the other under post-return "After Orchestrator Returns" guidance — not commands the agent
  executes autonomously. db-push is not reachable inside an autonomous flow. The general
  scope-graduation gate IS a real hole, but it is folded into **E1** (Lane E), which places ONE conduct
  bullet covering ALL prod-mutating paths (`supabase db push --linked`, `npx supabase functions
  deploy`, merge to a deploying branch, prod env-var change) — not a db-push-only gate.

- **`orchestration-verification-3`** (Phase 8 needs branch/worktree reconciliation into one
  integration branch) — REJECT (refuter high). The premise is factually wrong: app-blueprint's
  separate-window dispatch (`MULTI_AGENT_WORKFLOW.md:37`) is a new SESSION on the SAME working tree
  editing the SAME plan doc — not branch-per-worker or worktree-per-worker. There is no
  N-overlapping-PRs / worktree-per-worker failure to reconcile; both dispatch modes share one working
  tree and one plan doc by design (grep for `worktree|integration branch` across MAW/orchestrate/
  implement returns nothing).

#### Deliberate non-ports (finders declined to port these)

- **`[PROCESS-3]` / `[PROCESS-4]` Workflow-runtime sharpens** (coverage-guard + "synthesis is the
  least-trustworthy layer" hardened for a scripted fan-out) — NON-PORT. These sharpen an
  agent-runtime **Workflow** (fan-out-and-verify harness with a `[PROCESS-3]` coverage-count guard);
  app-blueprint has no equivalent scripted fan-out dispatch runtime, so the harness-specific sharpen
  has no surface to attach to. The underlying disciplines already live in app-blueprint's
  `audit-code.md` Refutation Pass (which Lane B extends with split-verdict escalation).

- **live-vs-workflow rule** (agent-blueprint MAW's "Live orchestration vs. deterministic workflow"
  subsection — reach for a scripted workflow only for the fan-out/verify shape; orchestrate
  checkpoint-driven programs from the live PM session) — NON-PORT. app-blueprint's dispatch model
  (single-window / separate-window / subagent) is uniformly same-working-tree and has no
  live-orchestration-vs-deterministic-workflow distinction to encode; there is no analog to author.

---

### Decisions

| Decision | Choice | Reasoning | Date |
|---|---|---|---|
| `negative-status-1` (debug cannot-reproduce bar) | PARK w/ promotion trigger | Real (refuter high) but no downstream field instance; v0.2.0 spec attests laundering only for smoke/ship claims, not a debug negative verdict. Ships Installed-not-proven. | 2026-07-07 |
| `negative-status-3` (investigate dead-code bar) | PARK w/ promotion trigger | Real DELTA = attempt indirect-reference paths + record searches; retarget to deletion point (/plan or /implement), not investigate's read-only output. P3, no field instance. | 2026-07-07 |
| `scope-graduation-autonomy-4` (autonomy-budget doctrine) | PARK w/ promotion trigger | Home in MAW.md not OBS_KB_5 (wrong file); write-path complement of E1's conduct gate — resolve framing once E1 lands. No downstream runway-bound anchor yet. | 2026-07-07 |
| `effort-disproportion-1` (LESSONS effort-disproportion entry) | PARK w/ promotion trigger | LESSONS.md ships empty; entry must be authored on a real app-side incident. Anchor to diff/files/subsystems, never wall-clock. Gates F-P5/F-P6. | 2026-07-07 |
| `effort-disproportion-2` (audit-code §4 sprawl-as-signal) | PARK (coupled to F-P4) | Must be self-contained (no dangling [PROCESS-1] cross-ref while LESSONS empty); author the LESSONS entry first. | 2026-07-07 |
| `effort-disproportion-4` (Phase-8 disproportion check) | PARK (coupled to F-P4) | Weakest of batch (refuter LOW); source deliberately left its own Phase 8 untouched. Land LESSONS entry first. | 2026-07-07 |
| `fact-copy-glossary-1` (KB-holds-query-paths-not-facts) | PARK w/ promotion trigger | Narrow to non-type-checked facts (RLS text, env/config values, feature-flag states, API-contract fields); schema/column case already guarded by generated types + migrations (type-error surface). Wants Lane E's CLAUDE.md block if promoted. | 2026-07-07 |
| `negative-status-2` (OBS_KB_5 negative-status dual) | REJECT | Parent primitive field-disproven for web (verification-discipline-adoption-spec.md:49,221 — silent-open is runtime-only, 0 field instances); dual is more agent-runtime-specific; finder's process.env example inaccurate; OBS_KB_5 reference-only by policy. | 2026-07-07 |
| `db-write-integrity-3` (read-back the audit row) | REJECT | Audit-row drop covered twice in OBS_KB_5 (lines 50, 53); OBS_KB_3 same-transaction Always-rule makes "primary succeeds, audit drops" structurally impossible; OBS_KB_5 never imported a read-back primitive (category error, no surface). | 2026-07-07 |
| `scope-graduation-autonomy-2` (db-push.md gate) | REJECT | Autonomous-reachability premise misread — implement.md:240/:270 are human-facing checklist TODOs in a printed report template / post-return guidance, not autonomous executions. General gate folded into E1 (covers ALL prod-mutating paths). | 2026-07-07 |
| `orchestration-verification-3` (worktree reconciliation) | REJECT | Premise factually wrong — separate-window dispatch (MAW:37) is a new session on the SAME tree editing the SAME plan doc, not branch/worktree-per-worker; no N-overlapping-PRs failure exists. | 2026-07-07 |
| `[PROCESS-3]`/`[PROCESS-4]` Workflow-runtime sharpens | NON-PORT | Sharpen an agent-runtime scripted fan-out harness with no app-blueprint analog; underlying disciplines already in audit-code.md Refutation Pass. | 2026-07-07 |
| live-vs-workflow MAW rule | NON-PORT | app-blueprint dispatch is uniformly same-working-tree; no live-orchestration-vs-deterministic-workflow distinction to encode. | 2026-07-07 |

---

### Edit blocks

#### Edit block F-1 — `docs/PARKING_LOT.md` (append 7 parked entries under `## Open`)

**Target file:** `/Users/chrisparsons/Documents/GitHub/app-blueprint/docs/PARKING_LOT.md`

**Anchor (verbatim, exists today — the placeholder line under the `## Open` heading):**
```
_(empty — append new entries here as they surface)_
```

**Operation:** REPLACE the anchor line with the following text.

**New text:**
```
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
```


