# Spec: Verification & safety-discipline intake (reverse sister-framework adoption)

> **Status: IMPLEMENTED 2026-06-26 (was LOCKED 2026-06-26)** — all change-set items (A1–A5, N1, N2, B1) landed in build order A5 → A3 + A4-prov → N1 + N2 → A1 + A2 → B1, packaged as framework release `0.2.0` (see `FRAMEWORK_CHANGELOG.md`). Each anchor was re-grounded at its live file before editing (`[PROC-1]` Corollary 1 — several had drifted from the spec's estimates, e.g. `debug.md` already used "Step 0", so A2 folded into Step 1). A3 + A4-provenance shipped field-attested; A1/A2/N1/N2 ship flagged `Installed, not yet proven in a live run`. **Not yet committed/shipped — the maintainer gates `/ship` (commit + tag `v0.2.0` + GitHub release).**

> **Status: LOCKED 2026-06-26** — re-scoped by field evidence after `/plan-review` + a 12-transcript downstream proving pass (full trail in §14). The change-set below is **re-prioritized by what the field actually proved**, not by the original draft's ordering. *(Lock header written manually by the reviewer: app-blueprint's `/plan-review` has no Step-6 lockdown writer yet — change **A5** back-fills it.)*

- **Type:** Framework improvement (verification disciplines in commands + a safety reference KB + two field-attested smoke disciplines + a lockdown back-fill)
- **Source:** agent-blueprint v0.4.0–v0.5.1, reframed for web apps — **not drop-in** — then **validated against 12 real Kai-App + eXp Onboarding transcripts**. The mirror of agent-blueprint's `sister-framework-adoption-spec.md` (v0.3.0), which flowed the other way.
- **Consumed by:** `/implement`.

### Decisions confirmed (dogfoods the `Decision | Choice | Reasoning | Date` table)

| # | Decision | Choice | Reasoning | Date |
|---|---|---|---|---|
| 1 | Scope | Tier A + Tier B reframed; Tier C (OpenClaw-only) rejected | Maintainer chose "Tier A + B as a spec." Tier C has no web analog | 2026-06-26 |
| 2 | Framing | **Add the missing layer onto app-blueprint's existing verification culture** | Grounding (not the initial grep) found app-blueprint already has `plan-review` Step 3a, `ship` Step 3.5/3.6, `debug` Iron Law | 2026-06-26 |
| 3 | LESSONS.md seeding | **Do NOT seed** — capture `[PROCESS-1/2/4]` as reference patterns (§12); embed disciplines in commands | `docs/LESSONS.md:11` is ships-empty by design (same call as the original sister-spec) | 2026-06-26 |
| 4 | Retro shape | Harden the existing `ship.md` Step 3.6 — no standalone `/retro` | app-blueprint already does retro inline | 2026-06-26 |
| 5 | Safety-primitive home | New `OBS_KB_5_Defensive_Writes.md`; add OBS_KB_5↔JOB_KB_1 disambiguation | Cross-cutting rule spanning migrations/webhooks/Server-Actions/outbox; folding buries it | 2026-06-26 |
| 6 | "DO-NOT trap" allowlist reframe | Web **irreversible/security-critical class**: RLS/auth, secret/PII, destructive migration, webhook signature/idempotency, payment path | app-blueprint's `CLAUDE.md` "DO NOT" is empty; the web equivalent is the security/irreversibility class | 2026-06-26 |
| 7 | Ship trailer | Keep `Built-With … claude-app-blueprint` | Different canonical repo | 2026-06-26 |
| 8 | **Re-prioritization (field proving)** | Lead with **A3 + A4-provenance** (proven); ship **A1/A2** flagged installed-not-proven; **demote B1 + the A4 Phase-8 synthesis line to reference-only** | 12-transcript proving: A3 = 6 instances incl. a prod outage; A1's refuter mechanism never fired (smokes caught the bugs); B1 had **0** field instances (silent-open is runtime-only) | 2026-06-26 |
| 9 | **A1 re-lead** | Lead A1 with **"re-derive security/RLS claims against live SQL this run" (Corollary 1)**; the independent refuter is the wrapper; **add `/audit-rls`** to the targets | Both field A1 cases were stale-citation / live-policy-mismatch problems caught by smokes, not skeptics; `/audit-rls` was the missing target | 2026-06-26 |
| 10 | **Add N1** (deferred-smoke debt rollup + phase-boundary gate) | In scope | Loudest field signal (3+ sessions; the self-authorized "authorized posture" ratchet); A3 hardens single-ship, not cross-phase debt | 2026-06-26 |
| 11 | **Add N2** (mandatory live-smoke gate for service-boundary flows) | In scope | The only confirmed prod outage: 213/213 unit tests shipped a non-functional auth/email flow | 2026-06-26 |
| 12 | **Add A5** (port `/plan-review` Step 6 Lockdown Check) | In scope | app-blueprint never received the v0.3.0 decision-discipline layer that came from its own retro; also the spec's own lock mechanism | 2026-06-26 |
| 13 | B1 disposition | Ship `OBS_KB_5` as a **reference KB only** — not an acceptance-gated change | 0 field instances; re-evaluate when a real silent-open incident surfaces | 2026-06-26 |

---

## 0. TL;DR — the change-set, ordered by evidence tier

**PROVEN CORE (field-attested, acceptance-gated):**
- **A3** — ship truth-gate hardening (`never-run = Unverified at ship`, never laundered into "Ship Complete"). *6 field instances incl. a prod outage.*
- **A4-provenance** — `[verified]/[relayed]` tagging, don't-harden-a-hedge, verify-the-primary-not-the-digest in `/brainstorm` + commit composition. *5+ field instances.*

**NEED-PROVEN, MECHANISM FLAGGED `Installed, not yet proven`:**
- **A1** — re-grounding-led refutation in `/audit-code`, `/audit-rls`, `/audit-infra`, `/audit-full`, `/debug`. *Led by Corollary-1 (re-derive security/RLS claims against live SQL); refuter is the wrapper. Need proven (2 RLS→prod bugs); refuter mechanism unproven.*
- **A2** — ground-first primary-artifact anchor: **mandatory for `/debug`**, optional for `/investigate`. *3 field instances of misanchored debugging.*

**NEW (field-attested):**
- **N1** — deferred-smoke debt rollup + phase-boundary forcing function. *Loudest field signal.*
- **N2** — mandatory live-smoke gate for service-boundary flows (auth/email/webhook/external API). *The one confirmed prod outage.*

**ENABLER:**
- **A5** — port agent-blueprint's `/plan-review` Step 6 Lockdown Check (gives app-blueprint the `LOCKED` convention; back-fills the v0.3.0 decision-discipline layer).

**REFERENCE-ONLY (documented, NOT acceptance-gated — re-evaluate on a real incident):**
- **B1** — safety primitives (`OBS_KB_5_Defensive_Writes.md`: Primitive 0 close-the-capability + Primitive 9 fail-loud-or-closed). *0 field instances; silent-open is a runtime/cron phenomenon absent from dev transcripts.*
- **A4 Phase-8 synthesis line** — fold as lane-discipline that *names the existing trace-verifier*, not a generic "verify the synthesis" addition. *Both field synthesis-trust instances were OVERSTATED.*

**REJECTED (Tier C, §13):** `[PROCESS-3]` Workflow-schema, `OC_KB_10` capability taxonomy, `validate-skills.mjs` + OpenClaw DO-NOT traps + mcporter/cron/gateway, standalone `/retro`, seeding `LESSONS.md`.

> **Honest grounding note (kept as a worked example).** An initial keyword grep claimed app-blueprint had *zero* verification discipline; re-grounding refuted it (`[PROCESS-1]` Corollary 1). And the spec's first draft over-claimed A1 was "proved downstream" — the 75-agent incident proves `[PROCESS-4]`, a sibling discipline; the field proving then showed A1's refuter mechanism has never fired here. Both corrections are *why* this spec is re-scoped rather than locked as-drafted.

---

## 1. Motivation — one seam, anchored on what the field proved

app-blueprint's verification culture is **self-report-shaped**: an auditor returns `APPROVED`; `plan-review` Step 3a flags assumed scope-outs; `ship` reads the smoke catalog. The field shows the recurring break is not lack of *a* check — it's **unverified claims laundering into "done"**: a never-run smoke shipped as passed, a security audit trusting a stale spec citation instead of live SQL, a hedge ("needs a real run") hardened into a ship. The proven core (A3 + A4-provenance) closes that laundering. A1/A2 add the independent/ground-first seam where it's field-attested it's needed; N1/N2 close the two highest-consequence gaps the field surfaced that the original spec missed.

```
produce a claim → re-ground it at the primary (live SQL / the artifact) → don't let it launder into "done"
   (audit / hypothesis / smoke)     (A1 Corollary-1, A2)                  (A3, A4-provenance, N1, N2)
```

The independent refuter (A1's wrapper) and the safety primitives (B1) ship **installed-but-flagged / reference-only** respectively — the field attests the *failure modes* but not (yet) that *these specific mechanisms* are what catch them here.

---

## 2. Scope
**In:** A1, A2, A3, A4, A5, N1, N2 (§3–§10), B1 reference-only (§11), reference-patterns capture (§12).
**Out (rejected, §13):** Tier C (OpenClaw-only), standalone `/retro`, seeding `LESSONS.md`, an *acceptance-gated* B1.

---

## 3. A3 — Smoke truth-gate hardening **(PROVEN CORE)**

### Current state (grounded)
`ship.md` Step 3.5 (~lines 107–120) collapses passed sections, proposes new tests, STOPs on `Failed`, and blocks on >30-day trace-verified smokes — **but** does not treat never-run/Pending/absent smokes as unverified claims.

### Field evidence (proven)
6 instances. `accce00f` (2026-06-25): agent wrote *"this is the critical path — it needs a smoke before a real agent hits it,"* shipped `733ad2f` anyway, prod invite link failed ~17h later (`validation_failed: Verify requires a token`). `d0fad266`: smokes flipped `Pending → Passed (manual)` off a bare user "Pass" with zero execution evidence.

### Change
Add to `ship.md` Step 3.5: **Truth-in-world gate (not just `Failed`).** If any in-scope test is not `Passed` (never-run/Pending/absent), it is not truth-checked — the commit/changelog body MUST name it verbatim `Unverified at ship: <id>`, never laundered into "Ship Complete." The gate reads the literal catalog state (external artifact), so it can't be rubber-stamped. **Plan-review edit #3 (reconciliation rule):** ship with `Unverified` only if a follow-up phase is named to clear it, or it is explicitly deferred with **owner + date** — otherwise `smoke-tests-pending.md` accumulates `Pending` unbounded (this feeds N1). **Plan-review edit (re-confirmation):** a bare user "pass" is approval of *code quality*, not evidence of *test execution* — do not flip `Pending → Passed` off an affirmation without an execution description; request one or keep it `Unverified`.

### Files / Risk / Acceptance
`ship.md` Step 3.5 + commit composition (keep the `claude-app-blueprint` trailer). Low. **Accept:** a diff touching a never-run smoke yields `Unverified at ship: <id>`, not a clean completion claim; `Pending→Passed` requires an execution description.

---

## 4. A4 — Provenance discipline **(PROVEN CORE)** + Phase-8 lane-discipline (reference-only)

### Current state (grounded)
`brainstorm.md` grounds well (Phase 1a/1b) but carries Explore-digest claims forward without provenance tags. `MULTI_AGENT_WORKFLOW.md` already encodes "verify the code, not the report" in the trace-verifier contract (~line 320) and the Phase-8 lane table (~176–181).

### Field evidence
Provenance half **proven** (5+): a "smoke PASSES" verdict on user-pasted SQL with zero re-execution (`1f01b3eb`); "verified at code level" right before the `accce00f` prod break. Synthesis-trust half **weak**: both `synthesis_trusted` instances OVERSTATED (agents were transparent).

### Change
- **(Proven, gated)** `brainstorm.md`: tag every claim carried from the Explore digest `[verified: how]` or `[relayed: source-said]`; never harden a hedge; surface any buried blocker so front-confidence never exceeds back-caveats.
- **(Reference-only)** `MULTI_AGENT_WORKFLOW.md` Phase 8: one line reframed as **lane-discipline that names the existing trace-verifier** (not generic "verify the synthesis"): *"For wiring-lane smokes, the worker's summary is a claim; verify via the trace-verifier contract or eyeball-per-lane (Phase 9), expecting errors in both directions."* Do not over-build — it reinforces existing infrastructure.

### Files / Risk / Acceptance
`brainstorm.md`; `MULTI_AGENT_WORKFLOW.md` Phase 8. Low. **Accept:** brainstorm options carry provenance tags; Phase 8 points at the trace-verifier, not a duplicate rule.

---

## 5. A1 — Re-grounding-led refutation in audits **(NEED-PROVEN; mechanism `Installed, not yet proven`)**

### Current state (grounded)
`audit-code.md` ends at a "Verdict" checkbox (~219); `audit-infra.md` at ~220; `audit-full.md` spawns 3 Explore subagents (code via `/audit-code`, DB via **`/audit-rls`**, infra via `/audit-infra`) and merges at "### 4. Save Report" (~103). **`/audit-rls` had no refutation in the original spec — the field shows it's the highest-value target.** `debug.md` has the Step-5 gate + three-strikes escape (~50) and already reports the failing assumption + reasoning to the user (not bare self-assertion).

### Field evidence (need proven, mechanism unproven)
2 RLS audits waved through → prod/smoke-caught bugs: Wave K (`15a61449`) — audit declared RLS safe by trusting the spec's stale `can_view_agent` line-citation; Wave L smoke found `agent_progress` had **no sponsor arm**. `accce00f` F1 — pgTAP 17/17 passed but only tested `profiles.role` admins, missing the membership-admin path; broke in prod. **In both, the existing smoke caught it, not a refuter** — and Wave K is a *stale-citation vs. live-SQL* problem.

### Change (re-led per decision 9)
1. **Lead with Corollary-1 (the load-bearing mechanic):** before the verdict, every load-bearing security/RLS finding must be **re-derived against the live SQL/policy this run** — never accepted on a spec's prose or a line-number citation (which goes stale across migrations). This is what would have caught both field cases.
2. **Refuter as the wrapper (`Installed, not yet proven`):** spawn one fresh `Explore` agent per load-bearing **security-class category** (decision 9 / plan-review Decision 2 — *per category, not per finding*: auth-bypass / audit-table / permission-style; ~1–3 per RLS audit), given only the claim + `file:line`, mandate: *"read the live policy/migration yourself and KILL this — quote contradicting SQL, or state what would falsify it."* Verdicts CONFIRMED/OVERSTATED/REFUTED → a Refutation Ledger that supersedes the checkbox.
3. **Targets:** `/audit-code`, **`/audit-rls`**, `/audit-infra`, `/audit-full` (Step 5), and `/debug` three-strikes (an independent skeptic **replaces** the self-asserted "wrong model" — plan-review Decision 3).
4. **Cost escape-hatch (plan-review edit #2, named BLOCKER):** if security-class *categories* would exceed N, **halt and escalate the audit itself** rather than spawning unbounded refuters. **Blind-spot disclaimer** verbatim when the load-bearing set is empty (the expected output of a prose/framework-change dogfood — plan-review edit #7).

### Files / Risk / Acceptance
`audit-code.md`, `audit-rls.md`, `audit-infra.md`, `audit-full.md`, `debug.md`. Med. Carries `Installed, not yet proven in a live run`. **Accept:** each audit re-derives security/RLS claims against live SQL before verdict; a Refutation Ledger gates it; `/audit-rls` is covered; debug three-strikes fires an independent refuter before "wrong model."

---

## 6. A2 — Ground-first primary-artifact anchor **(NEED-PROVEN; `Installed, not yet proven`)**

### Current state (grounded)
`investigate.md` opens "1. Read Project Context First" (~35) → "2. Trace the Full Data Flow" (~41); no primary-artifact anchor.

### Field evidence
3 misanchored debugging chases (e.g. `f6d984e0`: cache → closure-gate → stale-render, 3 wrong diagnoses before "it's my error, line 167"; `accce00f` token-loss chase). The agent **self-recovers by re-grounding on the user's primary symptom** — A2 codifies that recovery as an upfront step.

### Change (scoped per plan-review edit #5)
Add **Step 0 — Anchor on the Primary Artifact**: quote the literal artifact (error text, failing test, Sentry event, failing RLS query, network response) verbatim; derive the entry point from what it *shows*, not what the description *implies*; if unretrievable, mark downstream claims UNVERIFIED. **Mandatory for `/debug`** (symptom needs characterization); **optional/best-effort for `/investigate`** when the PM has already framed scope (so exploratory investigations aren't orphaned).

### Files / Risk / Acceptance
`debug.md` (mandatory Step 0), `investigate.md` (optional Step 0). Low. Carries `Installed, not yet proven`. **Accept:** `/debug` quotes a primary artifact before hypothesizing.

---

## 7. N1 — Deferred-smoke debt rollup + phase-boundary forcing function **(NEW, field-attested)**

### Field evidence (loudest signal, 3+ sessions)
Deferred prod smokes accumulate with no ritual transitioning `Pending → explicitly-waived → must-run-before-next-phase`. `Kai-111`: three phases shipped on a **self-authorized "authorized posture"** with no evidence the user granted it and no rollup of accumulated unverified risk. A3 hardens the *single* ship; nothing addresses *cross-phase verification debt*.

### Change
1. **`smoke-tests-pending.md`** gains a **"Deferred prod smokes" rollup** section: every `Unverified`/`Pending`-deferred smoke with its owner + deferral date + the ship it rode (fed by A3's reconciliation rule).
2. **`ship.md` Step 3.6 (retro sweep)** surfaces the **accumulated** deferred-smoke count at every phase boundary and **forbids the self-authorized "authorized posture"**: deferring a prod smoke past a phase boundary requires an *explicit, logged user grant per smoke* (not a pattern claimed from prior phases).
3. **Outcome-vs-output (plan-review):** Step 3.6 judges the phase by whether the user's surface shrank, weighting the concrete deferred-debt count over artifacts shipped.

### Files / Risk / Acceptance
`ship.md` Step 3.6; `smoke-tests-pending.md` (rollup section + template). Low–Med. **Accept:** every phase boundary emits the deferred-smoke rollup; no smoke is deferred across a boundary without a logged per-smoke user grant.

---

## 8. N2 — Mandatory live-smoke gate for service-boundary flows **(NEW, field-attested)**

### Field evidence (the only confirmed prod outage)
`accce00f`: **213/213 unit tests + typecheck-clean shipped a completely non-functional auth/email flow** — the class unit tests structurally cannot model (auth-hook side effects, link encoding across Resend, OAuth/PKCE token compatibility).

### Change
Define a **service-boundary flow class** (auth, email/outbox→delivery, webhooks, external-API/payment round-trips) and require a **live end-to-end smoke before prod exposure** for any change touching it — unit/typecheck/pgTAP green is explicitly **not sufficient**. Wire into `ship.md` Step 3.5 (a `live-required` smoke tag that the truth-gate treats as gating, not deferrable-by-default) and a one-line note in `MULTI_AGENT_WORKFLOW.md` Phase 8/9 lane discipline.

### Files / Risk / Acceptance
`ship.md` Step 3.5 (`live-required` class); `smoke-tests-pending.md` (tag); `MULTI_AGENT_WORKFLOW.md`. Med. **Accept:** a diff touching a service-boundary flow cannot ship `Passed` on unit/typecheck alone — a `live-required` smoke must be run or explicitly user-waived with the N1 grant.

---

## 9. A5 — Port `/plan-review` Step 6 Lockdown Check **(ENABLER)**

### Current state (grounded, CONFIRMED gap)
`plan-review.md` ends at Step 5 (~139); **no Step 6, no `Status: LOCKED` writer** (lives only in agent-blueprint `plan-review.md:143–197`). No app-blueprint spec uses the convention. app-blueprint never received the v0.3.0 decision-discipline layer that originated in its own retro.

### Change
Port agent-blueprint's **Step 6 Lockdown Check** into app-blueprint's `plan-review.md`: scan for unresolved forks, verify the decisions table has a row per fork with a cited evidence source, and on pass prepend `> **Status: LOCKED YYYY-MM-DD**`. Add the convention note to `CLAUDE.md` Patterns. This gives the framework its lock mechanism *and* back-fills the missing decision-discipline layer.

### Files / Risk / Acceptance
`plan-review.md` (new Step 6); `CLAUDE.md` Patterns. Low. **Accept:** `/plan-review` writes a `LOCKED` header on a fork-free spec; refuses (lists unresolved items) otherwise.

---

## 10. CLAUDE.md Patterns notes (name the disciplines)
Add to `CLAUDE.md` "Patterns" (hybrid → `.framework` sibling on update): independent re-grounding/refutation of security-class audit findings; ground-first anchor in `/debug`; truth-gate (`never-run = Unverified at ship`); deferred-smoke debt rollup (N1); live-smoke gate for service-boundary flows (N2); the `LOCKED` convention (A5); fail-loud-or-closed (`OBS_KB_5`, reference).

---

## 11. B1 — Safety primitives `OBS_KB_5_Defensive_Writes.md` **(REFERENCE-ONLY)**

### Field evidence (theoretical here)
**0 `fail_silent_open` field instances** in 12 transcripts. app-blueprint failures surface *loudly* (user sees "could not save" / 400); silent-open is a **runtime/cron** phenomenon (cf. Kai's PGRST204), absent from dev transcripts.

### Change (documentation, NOT acceptance-gated)
Create `docs/Obs KBs/OBS_KB_5_Defensive_Writes.md` documenting **Primitive 0** (close the capability — don't build the mass-delete endpoint / service-role-bypass route; gate rare real needs behind a human-confirmed UI) and **Primitive 9** (fail loud — re-surface into the run summary — or fail closed — abort; never `catch → log → continue`), web-reframed (outbox/webhook/migration/Server-Action). Add Always/Never cross-refs to the Obs + Job indexes. **Plan-review edit #6 disambiguation:** OBS_KB_5 owns the *error surface* (what happens when a write fails); JOB_KB_1 owns the *work-claiming surface* (how not to lose work — dead-letter/backoff/lease). They reference each other; not duplicate homes. **Not** wired as an audit acceptance gate — re-evaluate when a real silent-open incident surfaces.

### Files / Risk / Acceptance
`OBS_KB_5_Defensive_Writes.md` (new, framework-managed); OBS + Job index cross-refs. Low. **Accept:** OBS_KB_5 documents both primitives + the disambiguation; no command is gated on it.

---

## 12. Reference-patterns capture (NOT seeded into `LESSONS.md`)
Per decision 3, captured here for adopters to copy into their `## Process & Verification Patterns` when a matching incident surfaces:
- **[PROC-1]** prose unproven until a live run (+ Corollary 1: a prior analysis/audit/spec is `relayed` until re-derived at the primary *this run*; + Corollary 2: a shipped migration/RLS/webhook is unproven until its trigger fires and the persisted artifact is inspected — **plan-review edit #4:** for a Supabase Edge Function / pg_cron job, "the artifact" = the inspected row or side-effect record, *not* a worker's `console.log` digest; this is app-blueprint's existing "fresh evidence, not the worker's word" rule, named).
- **[PROC-2]** augment the deterministic baseline (zod / pgTAP / `tsc` / typegen / the smoke gate); use the LLM to augment, never to *be* the check.
- **[PROC-4]** in a fan-out the synthesis is least-trustworthy — verify the primaries. *(Field caveat: app-blueprint's own corpus did not show synthesis-trust failures — both instances OVERSTATED; the strong evidence is in the agent-blueprint/Kai corpus. Carry it, but it is `relayed` for app-blueprint.)*

---

## 13. Rejected (Tier C — explicit)
`[PROCESS-3]` schema-forced Workflow under-cover (no Workflow tool); `OC_KB_10` capability taxonomy (no agent-cognition layers in a web app); `validate-skills.mjs` + OpenClaw DO-NOT traps + mcporter/cron/model-routing/gateway (OpenClaw-only); standalone `/retro` (folded into `ship` Step 3.6); seeding `docs/LESSONS.md` (ships-empty); an **acceptance-gated B1** (0 field evidence — reference-only instead).

---

## 14. Evidence trail (plan-review + field proving, 2026-06-26)

**Plan-review** (adversarial Workflow: 10 grounding + 5 dimension + 1 prose critic; 11 load-bearing findings refuted; 4 decisions closed): ready-with-edits, **5 of 7 surviving gaps OVERSTATED** (refutation working). Confirmed real: the lock-mechanism gap (→ A5) and the A1 evidence over-claim (→ corrected). `[PROCESS-3]` recurred — 2 schema-forced verify agents died without calling StructuredOutput (logged UNVERIFIED, not silently dropped).

**Field proving** (12 transcripts — 9 eXp Onboarding + 3 Kai-App; scan → verify-against-raw → judge; 23 confirmed instances): **inverted the spec's priorities.** A3 field-proven (6, incl. a re-verified prod outage `accce00f` → `733ad2f` → `validation_failed` ~17h later); A4-provenance proven (5+); A1 need-proven but mechanism unproven (smokes caught both RLS cases, not refuters; Wave K = stale-citation) → re-led by Corollary-1 + `/audit-rls`; A2 proven for `/debug` (3, agent self-recovers); B1 **theoretical** (0 — silent-open is runtime-only) → reference-only; **N1 + N2** surfaced as field-attested gaps the draft missed.

**Plan-review edits #1–7** are folded into the body above: #1 lock mechanism → **A5**; #2 cost escape-hatch → §5; #3 `Unverified` reconciliation → §3 + N1; #4 web-observability grounding → §12 [PROC-1]; #5 Step-0 scope → §6; #6 OBS_KB_5↔JOB_KB_1 → §11; #7 prose-audit blind-spot → §5.

---

## 15. File-touch map + propagation

| File | Change | Manifest → downstream |
|---|---|---|
| `ship.md` | A3 truth-gate + reconciliation; N1 rollup/forcing-function; N2 live-required class (keep `claude-app-blueprint` trailer) | framework-managed → overwrite-with-backup |
| `audit-code.md` · `audit-rls.md` · `audit-infra.md` · `audit-full.md` · `debug.md` | A1 re-grounding-led refutation; A2 Step-0 (debug) | framework-managed |
| `investigate.md` | A2 Step-0 (optional) | framework-managed |
| `brainstorm.md` | A4 provenance | framework-managed |
| `plan-review.md` | A5 Step-6 Lockdown Check | framework-managed |
| `MULTI_AGENT_WORKFLOW.md` | A4 Phase-8 lane line (reference); N2 note | framework-managed |
| `smoke-tests-pending.md` | N1 deferred-smoke rollup; N2 `live-required` tag | **project-owned → skip** (ships a template update; adopters merge manually) |
| `docs/Obs KBs/OBS_KB_5_Defensive_Writes.md` | B1 **NEW** (reference) | framework-managed → auto-propagates *(verify manifest enumerates new files in the dir; else add explicitly)* |
| `docs/Obs KBs/OBS_KB_00_Index.md` · `docs/Job KBs/JOB_KB_00_Index.md` | B1 cross-refs | framework-managed |
| `CLAUDE.md` | §10 Patterns notes; A5 convention | hybrid → `.framework` sibling |
| `docs/LESSONS.md` | untouched (ships-empty) | project-owned → skip |

**Release (post-`/implement`):** add a `FRAMEWORK_CHANGELOG.md` section (next version after 0.1.10) — `### Added`: OBS_KB_5, Refutation+re-grounding pass, ground-first anchor, N1/N2, A5; `### Changed`: the commands above. Bump `package.json` + `.framework-manifest.json`. Cut a GitHub release. **Per `[PROC-1]`, A1/A2 + N1/N2 prose ship flagged `Installed, not yet proven in a live run`**; the proven core (A3, A4-provenance) is field-attested. Dogfood: run `/audit-rls` (now with re-grounding) against a real migration and confirm the ledger fires.

---

> **Next:** `/implement` this locked spec. Build order: A5 (unblocks the lock convention) → A3 + A4-provenance (proven core) → N1 + N2 (field-attested) → A1 + A2 (flagged) → B1 reference KB.
