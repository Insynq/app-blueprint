---
description: Use when an existing web app in this framework needs a native mobile companion app
  (React Native / Expo) sharing the same Supabase backend — e.g. "make this an iPhone app."
  Consumes the web repo read-only (never modified) and produces a NEW sibling mobile repo with a
  parity-contract inventory, a locked port spec, and a device-installable build. For a mobile-only
  greenfield app use /kickoff; for feature work inside an existing mobile repo use /orchestrate.
  Run with "sync" after web-app changes post-port to re-inventory the delta — inventory only,
  no code changes.
arguments:
  - name: web-app-path
    description: Path to the source web-app repo to port (e.g. ../my-app). Optional — the command asks if omitted. The "sync" token may accompany it to enter sync mode (e.g. "sync ../my-app").
    required: false
---

# Port to Mobile

> Field-derived 2026-07-13 from one live web→RN port (July 2026); iOS-validated only.

You are the **PM context** for a once-per-product procedure: porting an existing web app to a native mobile companion (React Native / Expo managed + dev client) in a NEW sibling repo sharing the same Supabase backend. This is a thin orchestrator over the phase loop in docs/MULTI_AGENT_WORKFLOW.md — it owns only the port-specific sequence, gates, and hard rules; mechanics live there and in the docs/Mobile KBs/ family. Once the mobile repo exists, ongoing feature work there uses /orchestrate normally.

## Hard rules (non-negotiable, all phases)

1. **The web app is NEVER modified.** It is a read-only porting reference, enforced by a per-wave byte-clean check against the Phase-0 baseline.
2. **Any new client-originated write path ships fail-closed behind an env flag** (`=== "true"` gate; canonical rule: docs/Obs KBs/OBS_KB_5_Defensive_Writes.md Primitives 0/9) with honest UI when disabled. Flipping the flag live is a **scope-graduation event** requiring an explicit per-instance user grant — announcing is not asking.
3. **Build-time green is not device verification.** `tsc` / bundle-export clean never launders a runtime truth into "verified" — the smoke truth-gate applies unchanged.
4. **Re-verify stack versions at run time.** docs/Mobile KBs/MOB_KB_1_Stack_Selection.md carries a dated snapshot, not current truth; Phase 2 re-verifies via current-month web research.

## Phase 0 — Preconditions & repo setup

1. **Source path:** if $ARGUMENTS names a path (prose-parse it — the user may write "port ../my-app"), extract it; if $ARGUMENTS is empty, ASK the user for the web-app path before doing anything else — never invent it. Validate: the path exists, is a git repo, and plausibly the web app (has package.json; usually CLAUDE.md). Echo the resolved absolute path and app name back for confirmation before consuming it. Never pipe raw $ARGUMENTS into a tool — compute the concrete path first.
2. **Target repo:** ask/confirm the sibling target path, suggesting `../<web-app-name>-mobile` as the default. Never invent this either. Create it (git init) if absent; confirm it is empty or expected if present.
3. **Session posture:** the pipeline runs from THIS (framework-adopted web) repo's session; the sibling repo is operated on via absolute paths / `git -C <target>`. Every dispatch prompt must carry absolute paths for both the MOB_KB files (this repo) and output targets (sibling repo) — subagents get fresh contexts and relative paths will resolve against the wrong repo.
4. **Read-only baseline:** record the web repo's HEAD sha and `git -C <web-repo> status --porcelain` output. The byte-clean gate for every wave is "diff-clean against this baseline" (if the repo starts dirty, the pre-existing dirt is the baseline, not a failure — but flag it to the user).
5. **Read docs/Mobile KBs/MOB_KB_00_Index.md first** — orientation, Always/Never rules, and the VERIFY-BEFORE-SHIPPING checks this pipeline enforces.
6. **Scaffold the minimal doc set** in the target repo (NOT a full framework install — that is a separate later decision): `docs/research/`, `docs/plans/`, `docs/smoke-tests-pending.md`, `docs/CHANGELOG.md`, and a `CLAUDE.md` whose Tech Stack lists this repo as its own client bullet and names the shared Supabase backend once (the sibling-repo shape per MOB_KB_00).

## Phase 1 — Parity contract

Dispatch a **read-only crawler agent** to author the parity contract in the new repo. Runs in parallel with Phase 2. Fill the `<placeholders>` with absolute paths, then dispatch verbatim:

```
You are a read-only codebase crawler. Produce an exhaustive, file:line-cited parity contract
of the web app at <web-repo-abs-path>. You MUST NOT modify anything in that repo — read only.
Write your output to <target-repo-abs-path>/docs/research/codebase-inventory.md.
Stamp the doc header with "Parity baseline: <web-repo HEAD sha at crawl time>".

Follow the required-sections contract in
<framework-repo-abs-path>/docs/Mobile KBs/MOB_KB_2_Parity_Contract.md exactly:
§0 mechanism map (Web mechanism | Where it runs today | Mobile replacement) · §1 screen catalog
(route, roles, data fan-out, UI islands) · §2 query-contract table (module, view/table, column
allowlist, error contract — distinguish null-failure vs []-empty) · §3 auth + capability matrix
with the MANDATORY security analysis: which gates are RLS-enforced vs app-code-only — flag every
app-code-only gate, since on-device it stops being a boundary · §4 write paths (exact
table/column/storage-path contracts) · §5 storage/document access model · §6+ feature-specific
interaction specs · design tokens as LITERAL values (hex, radii, spacing, font names) · a
"deliberate deviations" candidate list for the PM.

Every claim carries a file:line citation from the web repo. Port against evidence, not memory.
If a required section has genuinely nothing to inventory, say so explicitly and name what you
inspected — never return a thin section silently.
```

**Gate:** all required sections present; the RLS-vs-app-code gate analysis is non-optional.

## Phase 2 — Stack research

Dispatch a **research agent** (parallel with Phase 1). Fill `<placeholders>`, dispatch verbatim:

```
You are a stack-research agent for a web→React Native/Expo port. Author
<target-repo-abs-path>/docs/research/rn-stack-research.md following the method template in
<framework-repo-abs-path>/docs/Mobile KBs/MOB_KB_1_Stack_Selection.md (Part 1).

Requirements: (1) a summary table `Concern | Library | Version (as of <current month year>) | Why`;
(2) per-topic findings where EVERY version/behavior claim is web-verified this month with an
inline citation — "checked via web search this month, not from memory"; (3) a distribution
runbook section; (4) an explicit Risks & open questions section with mitigations and the PM
decisions needed. Treat MOB_KB_1's Part 2 (July 2026 snapshot) as a dated worked example of the
output shape, NOT as current truth — re-verify everything against the current Expo SDK.
```

**Gate:** dated doc, inline citations on every version claim, risks section present. Surface the open PM questions to the user before Phase 3.

## Phase 3 — Port spec

Author `<target-repo>/docs/<app>-mobile-v1-spec.md` from the two research docs. Required blocks: product scope · **deliberate deviations from web** (PM-decided with the user, each justified) · locked stack · architecture tree · **security invariants (LOAD-BEARING)** — including gated-non-fetch parity for every app-code-only gate flagged in Phase 1, and the signed-URL posture decision (on-device `createSignedUrl`, short TTL — the documented step-down per docs/Mobile KBs/MOB_KB_3_Supabase_On_Device.md; record it as an accepted trade-off, not an oversight) · acceptance criteria (build-time gates + the device smoke catalog) · out-of-scope.

## Phase 4 — /plan-review lockdown

Run /plan-review from this session against the port spec by absolute path. Fold every BLOCKER/MAJOR resolution into the spec as a **binding-on-all-workers** section. No worker dispatch until the spec carries the LOCKED header. LOCKED certifies design completeness, not deploy authorization.

## Phase 5 — Waved implementation

Standard MAW worker plan docs under `<target-repo>/docs/plans/` (structure per docs/MULTI_AGENT_WORKFLOW.md). Wave order: **foundation wave solo** (theme tokens, Supabase client, auth context, routing shell, shared primitives — including the `useScreenData` hook per MOB_KB_3), then parallel waves ordered by dependency, with **frozen prop/type contracts** published in each worker's completion notes and disjoint file ownership.

**Per-wave gates, all mandatory:** `tsc --noEmit` at 0 errors · bundle export clean (`expo export`) · security greps — service-role/secret patterns in the app source per the VERIFY BEFORE SHIPPING section of docs/Mobile KBs/MOB_KB_00_Index.md (the canonical list; do not re-derive) · web repo byte-clean against the Phase-0 baseline.

## Phase 6 — Verification

Build the device smoke catalog in `<target-repo>/docs/smoke-tests-pending.md` with stable IDs, each carrying a **lane** — `wiring` / `visual` / `integration` / `device` — per docs/Mobile KBs/MOB_KB_5_Gotchas_And_Verification.md. When a simulator is available, run a PM live-walk (Maestro or manual): **annotate** each smoke with what it proved and what device residuals remain — annotations never flip `Status: Pending`; only the human device pass does. When no simulator exists, report honestly: "built but never rendered," with every runtime truth deferred-to-device.

## Phase 7 — Distribution & ship

Follow the two-actor (USER vs AGENT/CLI) runbook in docs/Mobile KBs/MOB_KB_4_Distribution.md, cheapest rung first (simulator → free-signing device bootstrap → TestFlight internal). Steps needing Apple identity, billing, or a password are the USER's — hand them over explicitly and wait. Then apply /ship conventions in the new repo (changelog entry, commit hygiene, the smoke truth-gate on anything unverified) — the sibling repo has no /ship command installed, so apply the conventions by hand from this session.

**Checkpoint before anything prod-facing:** device install, TestFlight submission, and any write-flag flip are each an explicit user grant — per hard rule 2 and the scope-graduation discipline in CLAUDE.md.

## Sync mode — post-port catch-up

> Installed 2026-07-13, not yet proven in a live run.

**Trigger:** if $ARGUMENTS contains "sync", enter this mode instead of the port pipeline.

**Preconditions:** resolve/confirm both repo paths per Phase 0 steps 1–3, except the target repo must already exist and contain `docs/research/codebase-inventory.md` — never create or scaffold in sync mode. The contract must carry a `Parity baseline:` stamp; if absent (a pre-stamp port), stop and offer a full Phase-1 re-crawl, which itself produces the stamp. Locate the port spec's decided-deviations block (`docs/<app>-mobile-v1-spec.md` in the target repo); if the port spec is missing, the deviations filter degrades to candidate-list-only and the delta report must say so.

**Steps:**

1. **Compute the delta:** `git -C <web-repo> diff --name-status <baseline>..HEAD` plus `git -C <web-repo> log --oneline <baseline>..HEAD`.
2. **Classify every changed file into five buckets** — classification must be total, nothing left unlabeled: **backend-shared** (paths under `supabase/` — `supabase/migrations/*.sql` (RLS lives there), `supabase/functions/**`, `supabase/config.toml` — no mobile port work; note type-regen if schema changed) · **web-frontend, existing surface** (map through the contract's §0 mechanism map) · **new surface** (port candidate for the PM) · **on the decided deliberate-deviations list** (skip, note) · **no parity impact** (docs, CI/tooling, web-only tests, lockfile-only bumps — noted in the delta report, no work generated).
3. **Dispatch the scoped-update crawler.** Fill `<placeholders>` (including the classified changed-file list), dispatch verbatim — never reuse the Phase 1 prompt here; it overwrites the whole inventory:

```
You are a read-only codebase crawler running a scoped parity-contract update. You MUST NOT
modify anything in the web repo at <web-repo-abs-path> — read only.

The contract was last crawled at baseline <baseline-sha>. These files changed since then
(read only these and what they directly reference): <changed-file-list>

Update <target-repo-abs-path>/docs/research/codebase-inventory.md IN PLACE: revise only the
sections affected by the changed files, per the required-sections contract in
<framework-repo-abs-path>/docs/Mobile KBs/MOB_KB_2_Parity_Contract.md; leave every other
section untouched. Every revised claim carries a file:line citation from the web repo.
Advance the header stamp to "Parity baseline: <new web-repo HEAD sha>".
If a changed file affects no contract section, say so explicitly and name what you
inspected — never report an empty result silently.
```

4. **Write the delta report** — `<target-repo>/docs/research/parity-delta-<YYYY-MM-DD>.md`: the classified table, the port-candidate list, open PM questions, and an **"Outstanding from previous syncs"** table inheriting the prior report's still-open candidates before the baseline advances.
5. **Hand off:** implementation of port candidates is a normal /orchestrate phase in the mobile repo — sync mode changes no app code.

**Hard rules restated:** the web repo stays read-only (the byte-clean check applies to the sync crawl too), and sync is inventory-only — it updates the parity contract and emits a delta report; it never writes app code.
