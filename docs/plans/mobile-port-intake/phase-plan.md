# Phase: mobile-port-intake

**Status:** shipped ✅ (2026-07-13, v0.5.0)

## Scope addition (2026-07-13, user-granted pre-ship)

Post-port **delta sync**: a sync mode in `/port-mobile` + a "Keeping the contract current" section in MOB_KB_2 + one CLAUDE.md row clause + two MOB_KB_00 index touches. Design recorded as spec Addendum E (decisions + edit blocks E1–E4). Provenance flag differs from core scope: `Installed 2026-07-13, not yet proven in a live run` (zero catch-up field runs). Originated as this session's parity-drift sidebar; adopted directly into scope by user grant instead of parking. Worker 4 owned all four touches (Workers 1–3 wrapped; no concurrent ownership).

**Addendum E audit (2026-07-13):** design-level audit pre-dispatch, NEEDS CHANGES (minor) — 7 findings, all folded into the addendum's edit blocks before Worker 4 authored anything: (1) MEDIUM selection-surface gap — frontmatter description routed sync requests to /orchestrate → E1(c) PM-signed frontmatter amendment; (2) MEDIUM classification not total over a real diff → fifth "no parity impact" bucket + concrete `supabase/` path signals; (3) sync needs its own scoped-update crawler prompt (Phase 1's overwrites the inventory); (4) sync-mode preconditions must never scaffold; (5) drift filter = the port spec's DECIDED deviations block, degrading honestly if absent; (6) candidate carry-forward table so unbuilt candidates survive baseline advances; (7) MOB_KB_00 index touches (E4).

**Addendum E verification (2026-07-13, PM-run):** ownership conformance unchanged (same 8 porcelain paths); scrub + `$ARGUMENTS.`/`{{` greps clean across the 4 delta files (independent re-run); `Installed` flag present in both new-prose intros, no `Field-derived` misuse, no flag in step text; scoped-update prompt carries all five required elements (verified by full read); frontmatter parse-verified, description 568 chars; port-mobile.md at 141 lines; E2/E4 sections present as specced. PASS.

**Worker plan doc:** `docs/plans/mobile-port-intake/worker-4-delta-sync.md`
**Started:** 2026-07-13
**Spec:** `docs/mobile-port-intake-spec.md` (LOCKED 2026-07-13, plan-review PASS at HEAD `fb757ae`)

## Scope

Intake the Kai-Mobile field port (July 2026 web→RN/Expo port, iOS-validated) into the framework: a new five-KB + index `docs/Mobile KBs/` stack-reference family (stack-selection JIT-research method, parity-contract port method, Supabase on-device, distribution, gotchas/verification); a new `/port-mobile` orchestrator command; two `/kickoff` edits closing the second-client-target declaration gap; and wiring (KB_INDEX, CLAUDE.md ×2, manifest). Framework prose + command files only — no app code, no DB, no deploy surface. **Scrub rule is load-bearing:** no Kai product specifics may reach any authored surface.

## Pivot review (2026-07-13)

Parking lot: 7 open items, all `framework-meta` doctrine ports with explicit promotion triggers — none fired, none overlap this scope. No adoptions, no drops. Prior phase (agent-blueprint-v07-intake, shipped v0.4.0) documented no mandatory follow-up that collides.

## Brainstorm findings

Done upstream: the spec is the output of a four-agent Opus review (two transcript analysts, one repo reviewer, one framework gap-mapper) plus a four-investigator `/plan-review` (anchor-integrity 10/10 PASS, fork-scan, coherence, harvest-fidelity) that applied the LOCKED header. All anchors verified verbatim at `fb757ae`; both new-file targets confirmed absent; open decisions D-1…D-5 resolved to their recommendations in the audit record. No re-brainstorm needed.

**Dispatch-time re-checks (2026-07-13, this session):** HEAD is still `fb757ae` (anchors remain valid); all six harvest-source paths readable; working tree clean except the untracked spec itself.

## Sequencing + worker shape

Three workers, fully disjoint file ownership. Phase 5 audits run all-3 parallel (read-only, zero collision, pinned HEAD — justifies exceeding the ~2 cap). Implementation in two waves:

**Wave 1 (parallel):**
1. **Worker 1 — Mobile KB family (A1–A6).** Owns new `docs/Mobile KBs/` — `MOB_KB_00_Index.md`, `MOB_KB_1_Stack_Selection.md`, `MOB_KB_2_Parity_Contract.md`, `MOB_KB_3_Supabase_On_Device.md`, `MOB_KB_4_Distribution.md`, `MOB_KB_5_Gotchas_And_Verification.md`. Reads harvest sources; scrub rule applies hardest here.
2. **Worker 2 — `/port-mobile` command (B1).** Owns new `.claude/commands/port-mobile.md`. Frontmatter is consumed-verbatim from the spec; body authored per `docs/AUTHORING_COMMANDS.md` (~120–160 lines).

**Wave 2 (after Wave 1 wraps):**
3. **Worker 3 — kickoff + wiring (C1, C2, D1–D4).** Owns `.claude/commands/kickoff.md` (C1 + the :126 mislabel reconcile, C2), `docs/KB_INDEX.md` (D1 — **four** touches: :3/:8 count words "nine"→"ten", :10 folders-list append, :54 layer-table row, :36 task-table row), `CLAUDE.md` (D2 KB bullet, D3 command-table row), `.framework-manifest.json` (D4 — two sorted insertions). Runs after Wave 1 so every reference it writes points at a file that exists on disk.

**Commit posture:** no commits mid-phase. A single ship-time commit lands only after both Wave-1 workers report complete, Wave 2 completes, and Phase 8 passes — this closes the abort window where a manifest-covered `port-mobile.md` could ship referencing not-yet-existing KB files.

## Cross-worker contract (pinned)

- **MOB_KB filenames** are exactly the six in the spec's A1 file table — Worker 3's D1/D2 rows and Worker 2's command body cite these paths verbatim; no renaming.
- **Command name** is `/port-mobile` (spec D-1 resolved); Worker 3's D3 row text is pinned verbatim in the spec.
- **Provenance flag** placement: on every KB (family provenance line per A1); on the command, in doc prose only (a provenance note under the frontmatter), **never inside executed step text** — house convention from agent-blueprint-v07-intake. Flag text: `Field-derived 2026-07-13 from one live web→RN port (July 2026); iOS-validated only.` Android-adjacent claims add `unproven — no Android field run yet`.
- **Scrub rule (all workers):** no Supabase project refs, bundle IDs, credentials, table/column/role names, or product names from Kai. Field example cited as "a July 2026 web→RN port of an internal Supabase dashboard."
- **Transcript-canonicalized content** (A5 signing walkthrough, preflight numbers, `devicectl` commands, A6 Maestro advice): copy from the SPEC's edit-block text, not from harvest docs.

## Collisions / blast radius

| Surface | Touched by | Resolution |
|---|---|---|
| `docs/Mobile KBs/` (6 new files) | W1 only | Directory confirmed absent at `fb757ae` |
| `.claude/commands/port-mobile.md` (new) | W2 only | Confirmed absent |
| `kickoff.md`, `KB_INDEX.md`, `CLAUDE.md`, `.framework-manifest.json` | W3 only | Anchors pinned verbatim in spec at `fb757ae`; W3 re-verifies at apply time |
| `CLAUDE.md` D2/D3 reference files W1/W2 create | Wave ordering | Wave 2 runs after Wave 1 — no dangling-reference window |
| D4 manifest `excluded` entry for the spec | `/ship`-time constraint | Must land in the same commit that first git-tracks the spec (`/ship` Step 4.5 gate) — noted for Phase 10, not a worker concern |
| Blast radius overall | Framework/docs only. Worst failure = malformed command/KB prose degrading a future session, or a Kai-specific leak into the public repo (scrub-rule breach — the one HIGH-consequence failure). | Phase 8: anchor re-verify per file + scrub-rule grep sweep + cross-ref resolution sweep |

## Verification plan (Phase 8/9 preview)

- Prose-only phase — **zero `[RUN]` smokes expected**, justified: nothing executes at app runtime; the artifacts ARE the prose. Same posture as agent-blueprint-v07-intake.
- Phase 8 checks: (1) every spec anchor matched verbatim at apply time; (2) scrub-rule grep sweep over all new/changed files — concrete patterns: `Kai`, `kai-`, `/Users/chrisparsons`, transcript IDs `77770d72` / `8a083a4a`, Supabase project-ref shape (`[a-z]{20}\.supabase\.co`), bundle-ID shape (`com\.[a-z0-9.]+`); (3) cross-ref resolution — D1's four rows **including the :36 task-table row**, D2/D3 rows, C1/C2 pointers, MOB_KB dependency lines, `OBS_KB_5` / `SB_KB_1` / `AUTH_KB_2` cites all resolve; (4) KB_INDEX "ten" count consistent at :3 and :8; (5) `.framework-manifest.json` valid JSON + correct ASCII sort positions; (6) `port-mobile.md` follows AUTHORING_COMMANDS conventions; (7) provenance flags present on every KB, absent from executed command text per house convention; (8) ownership-conformance sweep — `git status --porcelain` lists exactly the expected 12 paths (6 new KBs, 1 new command, 4 wired files, the untracked spec); anything else is a worker ownership breach — stop.
- Smoke lane: one `wiring`-lane doc-integrity smoke (cross-reference + scrub sweep) PM-inline; `visual` eyeball of rendered KBs optional.

## Audit findings

Execution-design audit run 2026-07-13 (subagent, live-verified at HEAD `fb757ae`). Verdict: NEEDS CHANGES (minor) — all five fixes applied to this plan pre-dispatch:

1. **MINOR — D1 undercount (FIXED):** "three touches" risked dropping the :36 task-table row; all four D1 touches now enumerated in the worker shape and named in Phase 8 check (3).
2. **MINOR — provenance-flag contradiction (FIXED):** contract said "every KB/command surface" while check (7) banned flags in executed command text; contract now specifies doc-prose-only placement on the command.
3. **MINOR — scrub sweep under-specified (FIXED):** concrete grep patterns enumerated in check (2), adding the machine-path/transcript-ID leak class the categories missed.
4. **MINOR — no ownership-conformance sweep (FIXED):** check (8) added — changed-file set must equal the plan's file-touch map exactly.
5. **MINOR — commit posture unstated (FIXED):** single ship-time commit rule added to Sequencing, closing the W2-ships-while-W1-aborts dangling-reference window.

Clean: assignment complete (every spec edit block owned exactly once), ownership fully disjoint, 7 anchors byte-exact at live HEAD, manifest sort positions computationally verified, no third manifest insertion needed (`.claude/commands/` directory entry covers the new command; `docs/plans/` is project-owned), zero-`[RUN]` posture justified.

## Phase 8 verification record (2026-07-13, PM-run, independent of worker self-reports)

All eight planned checks PASSED against the working tree:

1. **Anchors:** all worker edits verified against spec-pinned text via full diff review; workers re-grepped anchors unique at apply time (W3 logged one benign note: bare `## Tech Stack` matches twice in kickoff.md but the full C2 anchor line is unique).
2. **Scrub sweep (independent re-run):** zero hits across `docs/Mobile KBs/`, `port-mobile.md`, and the four wired-file diffs for product/path/transcript patterns, project-ref shape, bundle-ID shape, smoke-ID shapes. CLEAN.
3. **Cross-refs:** all family cites in the new KBs (`AUTH_KB_2`, `OBS_KB_5`, `SB_KB_00`, `SB_KB_1`, `UI_KB_0`) resolve to existing files; both stable anchors Worker 2's command cites ("§0 mechanism map" in MOB_KB_2, "The output template" in MOB_KB_1) exist as literal headings; D1's four rows, D2/D3, C1/C2 pointers all resolve.
4. **KB_INDEX counts:** `grep -c nine` = 0; both :3 and :8 read "ten"; :8 parenthetical insert applied cleanly.
5. **Manifest:** valid JSON; both arrays strictly ASCII-sorted post-edit; conflict-map 1:1 coverage of framework-managed preserved (R1 entry present; map's global non-sort is pre-existing grouping at HEAD, not a regression — verified against `git show HEAD:`).
6. **port-mobile.md conventions:** 103 lines; frontmatter byte-identical to spec (worker diff-verified; registered as a live skill); hard rules up front; exactly two consumed-verbatim fenced dispatch prompts; plain-text path cites; no `$ARGUMENTS.`/`{{`. Under the ~120–160 estimate — delta is prose wrapping, all spec-required phases/rules present (verified by full read).
7. **Provenance flags:** exactly one `Field-derived 2026-07-13` line per KB (6/6); command carries the flag as a blockquote under H1 (doc prose, not executed step text); Android flag attached to Android-adjacent claims (MOB_KB_1:66, MOB_KB_4) and the index NOT-cover entry carries the promotion trigger.
8. **Ownership conformance:** `git status --porcelain` = exactly the expected set — 4 modified (kickoff.md, manifest, CLAUDE.md, KB_INDEX.md), 3 untracked (port-mobile.md, `docs/Mobile KBs/`, the spec) plus `docs/plans/mobile-port-intake/`. No stray files; no worker ownership breach.

Diff risk map: +13/−5 across the four wired files (smallest possible wiring footprint); 6 new KB files (416 lines total); 1 new command (103 lines). Matches scope exactly.

## Smoke tests added

**None added to `docs/smoke-tests-pending.md`.** Justification (zero-`[RUN]` rule, same posture as agent-blueprint-v07-intake): every artifact is prose in KB/command files with no app-runtime surface. The `wiring`-lane doc-integrity smoke (cross-ref resolution + scrub sweep) was run PM-inline in Phase 8 (checks 2–4) and passed. The true live validation is the first real `/port-mobile` run — the family carries the house `Field-derived … iOS-validated only` flags for exactly this case; parked items have explicit promotion triggers in the spec's Parked table.

## Worker plan docs

- `docs/plans/mobile-port-intake/worker-1-mobile-kb-family.md` (Wave 1)
- `docs/plans/mobile-port-intake/worker-2-port-mobile-command.md` (Wave 1)
- `docs/plans/mobile-port-intake/worker-3-kickoff-wiring.md` (Wave 2)
- `docs/plans/mobile-port-intake/worker-4-delta-sync.md` (Addendum E, post-Wave 2)
