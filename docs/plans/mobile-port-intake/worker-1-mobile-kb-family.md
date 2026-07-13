# Worker 1 — Mobile KB family (A1–A6)

**Phase:** mobile-port-intake
**Status:** implemented 2026-07-13 — all six files authored; scrub gate CLEAN

## Task

Author the new six-file stack-reference KB family `docs/Mobile KBs/` per spec edit blocks A1–A6 in `docs/mobile-port-intake-spec.md` (LOCKED 2026-07-13). The family covers the native-mobile companion client (React Native / Expo managed + dev client): index, stack-selection JIT-research method + dated July 2026 worked example, parity-contract port method, Supabase on-device, distribution, gotchas/verification. Content is field-derived from the Kai-Mobile port; **everything authored must be self-contained and anonymized per the spec's scrub rule** — the harvest sources are a private downstream product.

## Files involved

All new (directory confirmed absent at `fb757ae`):
- `docs/Mobile KBs/MOB_KB_00_Index.md` — spec A1: house index shape (file table with `Stack-portable?` column, Always/Never, Dependencies, When-to-update, NOT-cover, family provenance line, VERIFY BEFORE SHIPPING last)
- `docs/Mobile KBs/MOB_KB_1_Stack_Selection.md` — spec A2: Part 1 method canon (JIT per-port research, output template, re-verify rule), Part 2 dated July 2026 worked example
- `docs/Mobile KBs/MOB_KB_2_Parity_Contract.md` — spec A3: the parity-contract rule, required sections §0–§6+, the §0 mechanism-map template (generalized), port-vs-rewrite guidance
- `docs/Mobile KBs/MOB_KB_3_Supabase_On_Device.md` — spec A4: client config, claims/guards, signed-URL posture step-down, writes (binary upload, guard order), `useScreenData` lifecycle, env posture
- `docs/Mobile KBs/MOB_KB_4_Distribution.md` — spec A5: two-actor runbook template, distribution ladder, code-signing walkthrough, native-build preflight
- `docs/Mobile KBs/MOB_KB_5_Gotchas_And_Verification.md` — spec A6: Hermes/runtime gotchas, smoke lanes + `device` lane, sim-walk annotation pattern, Maestro

Read-only inputs:
- `docs/mobile-port-intake-spec.md` — the edit blocks are the content contract; A5/A6 transcript-canonicalized content (signing walkthrough, preflight numbers, `devicectl` commands, Maestro advice) is copied FROM THE SPEC, not from harvest docs
- Harvest sources (private, this machine only — see spec Conventions table): `/Users/chrisparsons/Documents/GitHub/Kai/Kai-Mobile/docs/research/rn-stack-research.md`, `.../research/codebase-inventory.md`, `.../kai-mobile-v1-spec.md`, `.../DISTRIBUTION.md`, `.../smoke-tests-pending.md`, `.../CHANGELOG.md`
- House-shape references: an existing family index (e.g. `docs/Job KBs/JOB_KB_00_Index.md` or `docs/Form KBs/FORM_KB_00_Index.md`) for index conventions; `docs/Obs KBs/OBS_KB_5_Defensive_Writes.md` (Primitives 0/9) for the fail-closed rule cited, `docs/UI-UX KBs/UI_KB_0_Index.md`, `docs/Supabase Structure KBs/SB_KB_00_Index.md`, `docs/Auth KBs/AUTH_KB_2*` for cross-ref accuracy

## Constraints / non-goals

- **Scrub rule (load-bearing, HIGH-consequence):** no Supabase project refs, bundle IDs, credentials, table/column names, role names, or product names from Kai. No `Kai`/`Kai-Mobile`/`Kai-App`, no `/Users/chrisparsons/...` paths, no transcript IDs, in any authored file. Cite the field example only as "a July 2026 web→RN port of an internal Supabase dashboard."
- Family provenance line on every file: `Field-derived 2026-07-13 from one live web→RN port (July 2026, internal Supabase dashboard → Expo SDK 57 iPhone app); iOS-validated only.` Android-adjacent claims add `unproven — no Android field run yet`.
- Do NOT touch any existing file — no index wiring (Worker 3 owns KB_INDEX/CLAUDE.md), no command files (Worker 2 owns port-mobile.md).
- Do NOT pre-write parked content: no Android lane, no IAP/billing, no push/offline/realtime, no bare RN, no Maestro-in-repo test scaffolding. The NOT-cover section mirrors the spec's Parked table.
- Spec edit-block text is the contract — where the spec pins wording (Always/Never bullets, file-table rows, §0 map rows), follow it; where it describes shape, match the house family conventions.
- File count is exactly index + 5; resist adding files.

## Expected observations & failure signals

- **Expected:** six new files, each self-contained; index passes a side-by-side shape comparison with an existing family index (file table, Always/Never, Dependencies, When-to-update, NOT-cover, VERIFY last).
- **Most-likely failure:** harvest-source product specifics leaking through paraphrase (table names, role names, storage paths inside example snippets). Counter-move: after drafting each file, self-grep it for the scrub patterns (`Kai`, `kai-`, `/Users/`, project-ref/bundle-ID shapes, and any table/column/role identifier you saw in a harvest doc) before marking done.
- **Fork-trigger:** if a harvest doc contradicts the spec's edit-block text (e.g. different TTL numbers, different library choice), **the spec wins** — it canonicalized transcript content deliberately; note the discrepancy in the Implementation log instead of resolving it yourself.

## Abort conditions

- **Blocked — escalate/stop:** a harvest path unreadable; `docs/Mobile KBs/` unexpectedly exists; a required cross-ref target (`OBS_KB_5` Primitives 0/9, `SB_KB_1`, `AUTH_KB_2`, `UI_KB_0`) doesn't exist under the cited name; any need to invent content the spec doesn't cover.
- **Friction — push through:** long harvest files, minor formatting divergence between existing family indexes (pick the closest common shape and note the choice).

## Granular audit

*Performed 2026-07-13 (Phase 5, pre-implementation). All six harvest sources read in full; all cross-ref targets checked on disk; house index shape compared against Job + Form family indexes.*

### 1. Preconditions — all pass, no blockers

- **Harvest sources:** all six paths exist and are readable (verified this session): `rn-stack-research.md` (167 ln), `codebase-inventory.md` (400 ln), `kai-mobile-v1-spec.md` (102 ln), `DISTRIBUTION.md` (36 ln), `smoke-tests-pending.md` (75 ln), `CHANGELOG.md` (6 ln). The CHANGELOG is only 6 lines but its 2026-07-12 device-install entry carries everything A5 needs from it (free-signing 7-day/single-device/no-OTA caveats, the Expo-CLI-can't-see-the-new-Xcode-cert-store incident, the xcodebuild-direct + devicectl resolution).
- **Target directory:** `docs/Mobile KBs/` confirmed absent.
- **Cross-ref targets — every one exists under the cited name:**
  - `docs/Obs KBs/OBS_KB_5_Defensive_Writes.md` — "Primitive 0 — Close the capability" at :16, "Primitive 9 — Fail loud or fail closed" at :35. ✓
  - `docs/Supabase Structure KBs/SB_KB_1_Multi_Org_RLS.md` ✓ · `SB_KB_00_Index.md` ✓
  - `docs/Auth KBs/AUTH_KB_2_Auth_Hook_Claims.md` ✓
  - `docs/UI-UX KBs/UI_KB_0_Index.md` ✓ (note: this family's index is numbered `_0_`, not `_00_` — cite it exactly as `UI_KB_0_Index.md`)
  - `docs/Form KBs/FORM_KB_00_Index.md:99` — the "Native mobile forms … differ enough to need their own folder if adopted" forward-note is at exactly line 99. ✓

### 2. Authorability per edit block — all six authorable; two content notes

- **A1 (index):** fully authorable — the spec pins the file-table rows, Always/Never bullets, dependencies, when-to-update, NOT-cover list, provenance line, and VERIFY items verbatim or near-verbatim. Shape questions are house-convention questions (see §4 below), not content gaps.
- **A2 (stack selection):** fully authorable. Part 1 template maps 1:1 onto the harvest research doc's actual structure (summary table with `Version (Jul 2026)` column, per-topic inline-cited findings, §3 distribution runbook, §4 Risks & open questions + PM decisions — exactly the four template elements the spec lists). Part 2: every library entry the spec enumerates is present in the harvest doc with its one-line why, including the Tailwind-major-version caveat, the worklets peer dep, the expo-av-removed note, and the react-native-pdf New-Arch blank-view dodge. The harvest also carries entries the spec does NOT enumerate (moti skeletons, gifted-charts option, expo-web-browser fallback) — spec list is the contract; moti is still needed in A6's gotcha list, so its A2 omission is deliberate slimming, not an oversight.
- **A3 (parity contract):** authorable, one gap to know about: **the "deliberate deviations candidate list" required section has NO harvest exemplar inside the inventory doc** — grep for "deviation" in `codebase-inventory.md` returns nothing; the deviations list lives in the downstream port *spec* (§1, PM-decided), not the inventory. Author that requirement from the spec's own text (the spec deliberately promotes it into the contract); don't hunt the harvest for a template. Also a **section-numbering mismatch**: the spec's required-section list says "§6+ feature-specific interaction specs," but the harvest inventory's interaction specs are its §8 (its §6 is a summary-API contract, §7 is design tokens). Follow the spec's §0–§6+ scheme; the harvest's exact numbering is an artifact of that one port.
- **A4 (Supabase on-device):** fully authorable. Every claim traced to a source: client config + AsyncStorage-vs-SecureStore (2 KB limit) + AES-hybrid hardening option → research §2.3; getClaims/JWKS-local with the symmetric-key caveat → research §2.3; signed-URL step-down + mitigations → research architecture note + risks §3; TTL 60–120 s with the slow-cellular escalation → the port spec's plan-review resolution (60 s risked slow-cellular PDF failure → 120 s); upload path + 0-byte footgun + max-size guard → research + port-spec m6; guard order (validate before flag gate) → CHANGELOG 2026-07-11 fix wave ("stub submit now validates identity/answers first"); `useScreenData` shape → port-spec B1 verbatim; concurrent signed-URL mints → port-spec B2/n4; env posture → research §2.12.
- **A5 (distribution):** authorable — but note **the code-signing walkthrough, the ≥10 GB / ENOSPC-at-84–98 % preflight numbers, `xcodebuild -downloadPlatform iOS`, and the devicectl commands appear in NO harvest doc** (transcript-canonicalized). The spec's own Conventions block says so and makes edit-block A5 their source of record — copy those verbatim from the spec, never paraphrase from memory. Harvest carries the rest: two-actor split (DISTRIBUTION.md + research §3), ladder rungs, TestFlight internal caps/timing, EAS Update JS-vs-native rule.
- **A6 (gotchas/verification):** authorable. Each gotcha traced: Hermes Intl compact → CHANGELOG + the visual-fidelity smoke's FOUND+FIXED note; focus-refetch clobber → CHANGELOG fix wave + the refetch-survival smoke; FlashList-root-scroller rule → port-spec M1; opacity-modifier no-op → port-spec m4; ErrorBoundary exports → M4; moti shimmer fallback → research §2.13; pdf/WebView → research §2.10; reduce-motion → port-spec §4. Smoke lanes (`wiring`/`visual`/`integration`/`device`) and the sim-walk annotation pattern ("annotations never flip Pending"; "asserted absent" vs "eyeballed") are verbatim harvestable from the smoke doc's header + entries. The expo-audio SharedObject lifecycle phrasing and Maestro selector advice are spec-canonicalized (transcript-derived) — copy from spec A6.

### 3. Harvest-vs-spec discrepancies (fork-trigger class — spec wins, log only)

1. **Signed-URL TTL is internally inconsistent in the harvest:** the inventory §0 row and the port spec's architecture tree both say 60 s; the port spec's deviations block and B2 resolution say 120 s (the later, plan-review-corrected value). Spec A4's "60–120 s; 120 s if slow-cellular renders fail at 60" is the deliberate canonicalization — author that, don't reconcile the harvest.
2. **Free-signing posture flips between docs:** research §2.11 and DISTRIBUTION.md call the free tier "explicitly unacceptable — don't use it"; the CHANGELOG field entry then used it successfully as the tonight-on-my-phone bootstrap. Spec A5's ladder (rung 2 = "unacceptable for ongoing distribution but validated as a pre-enrollment bootstrap") is the deliberate synthesis — author the spec's version.
3. Minor: harvest research recommends `eas update --channel production` day-to-day and a personal-team install route the spec supersedes with the richer `expo run:ios → xcodebuild-direct` fallback story. Spec wins.

### 4. House-shape ambiguities (Job vs Form index compared side-by-side; both 115 ln, near-identical skeletons)

Common shape both share: H1 `# <Family> Knowledge Base — Index` · bold `**Stack:**` line · 1-para orientation · "These files are for Claude. Principles-only docs fail at implementation time…" boilerplate line · `## File index` with `| File | Topic | Stack-portable? |` header · `## Cross-cutting rules that apply everywhere` containing `**Always:**` / `**Never:**` bullet groups · `## Dependencies between files` as ASCII-arrow code blocks (intra-family block + "Cross-folder dependencies" block) · `## When to update these files` (with a closing "these are stack patterns, not project docs" line) · `## What these files do NOT cover` · `## VERIFY BEFORE SHIPPING` last. Job additionally has a `## Local-dev tooling` section (family-specific, not part of the common shape — omit).

Resolutions I'll apply unless PM overrides:
- **Column header:** spec A1's table uses `Covers`; house uses `Topic`. The spec pins the whole table including its header row → use `Covers` (spec text is the contract; divergence is cosmetic).
- **`**Stack:**` line:** not mentioned in A1 but present in every family index → include one (e.g. React Native via Expo managed + dev client, Supabase backend unchanged), since A1 says "follows the family-index shape."
- **"These files are for Claude" boilerplate:** include — it's in both reference indexes and A1 defers to house shape.
- **Always/Never placement:** put A1's pinned Always/Never bullets inside a `## Cross-cutting rules that apply everywhere` section (house heading), not a bare "Always/Never" heading.
- **Dependencies:** render A1's prose dependency description in the house ASCII-arrow two-block form (intra-family + cross-folder), keeping the spec's stated edges exactly (MOB_KB_2→3, 2→1, 1→4 intra; SB_KB_00/AUTH_KB_2, UI_KB_0, OBS_KB_5 cross).
- **Provenance line:** no house precedent exists (novel requirement) — spec pins both text and position ("above VERIFY"); place it as a one-line blockquote or bold line immediately before `## VERIFY BEFORE SHIPPING`.
- **File-count/numbering:** family uses `_00_` index + `_1…_5` (Job/Form/Obs convention) — matches spec names exactly; UI family's `_0_` is the outlier, don't copy it.

### 5. Scrub-rule hazard classes actually observed in the harvest docs (classes only — the identifiers themselves stay out of this doc and out of every authored file)

1. Product / repo / app display names and their lowercase token forms (app name, both repo names, a sibling backend repo name).
2. A literal Supabase project-ref string (appears in two harvest docs).
3. iOS bundle IDs (two variants), an App Store SKU, and the App Store Connect app display name.
4. Company web/email domain (appears in login instructions).
5. The product's real write-flag env-var name (the `EXPO_PUBLIC_*` feature flag) — generalize to a placeholder flag name; keep only the generic `EXPO_PUBLIC_SUPABASE_URL/_ANON_KEY` names, which are library-standard.
6. Storage bucket name and storage path-prefix contract (upload path template embeds it).
7. Database view/table names (a `v_*` family throughout the inventory §2 tables), column names — including financial/commission column identifiers and two partner-entity net-payout column names — and column-allowlist constant names.
8. Two product-coined role names (the other two are generic) + the synthetic provisioning-state name; capability-gate function names (`canView*` family tied to product domain concepts).
9. Product domain vocabulary used as identifiers: the deck feature's name, settlement/commission metric abbreviations, query-module/type/hook file names from the web app, screen/route names.
10. Personal/environmental data: the user's absolute home paths, the owner's phone model + iOS version, team size / teammate counts, session-transcript UUIDs (these also appear in the intake spec itself, which is manifest-excluded — fine there, never in a KB).
11. Product smoke-test IDs (`MOB-*` and their web `SMOKE-*` twins) and concrete live-data values quoted in smoke annotations (deal counts, dollar figures, funnel numbers).

Post-draft self-grep per file (counter-move from Expected-failures, now concretized): case-insensitive grep for the product token, `/Users/`, `EXPO_PUBLIC_` (allowlist the two standard names), `v_`, `can[A-Z]`, the two coined role-name strings, bundle-ID/domain dot-shapes, UUID shapes, and `MOB-`/`SMOKE-` ID shapes.

### 6. Integration risks with the other workers' slices

- **Filename contract:** Worker 3's D1/D2 wiring and Worker 2's `/port-mobile` body cite `MOB_KB_00_Index.md` and the `MOB_KB_1…5` names exactly as this plan lists them — zero latitude on file names, including the space in `Mobile KBs/`.
- **Stable internal anchors:** Worker 2's command body references "MOB_KB_2's required sections / §0 mechanism map" and "MOB_KB_1's template" — keep those literal section labels ("§0 mechanism map", "output template") stable in the authored files so the command's prose references resolve.
- **No file-side wiring:** confirmed nothing in A1–A6 requires touching `KB_INDEX.md`, `CLAUDE.md`, or the manifest — the index's cross-folder references are outbound prose only. No ordering dependency on Workers 2/3; this slice can author first.
- **Parked-table mirror:** the NOT-cover list must stay in lockstep with the spec's Parked table (Android, IAP/billing, push, offline/caching, realtime-on-device, bare RN) — if the PM amends Parked in reconciliation, this file's NOT-cover section is the one downstream copy to update.

## Recommendations

1. **Author order:** MOB_KB_00 last (or draft-first, finalize-last) — its file-table "Covers" phrasing, dependency arrows, and VERIFY items should describe what the five files actually ended up saying.
2. **Adopt the house resolutions in §4 above** (Covers header per spec, Stack line, Claude boilerplate, Cross-cutting-rules heading, ASCII dependency blocks, provenance line as the last line before VERIFY) — flag them in completion notes so the PM can veto cheaply.
3. **Copy transcript-canonicalized content (A5 signing walkthrough + preflight numbers, A6 SharedObject/Maestro advice) verbatim from the spec**, and take the TTL and free-signing-ladder content from the spec over the harvest (discrepancies §3 above logged here so the Implementation log can reference rather than re-derive them).
4. **Run the concretized scrub grep (audit §5) after each file, plus one whole-directory pass at the end**; treat any hit outside the two standard env names as a stop-and-fix.
5. **Generalize the worked example consistently** as "a July 2026 web→RN port of an internal Supabase dashboard" (spec-pinned phrasing) — including inside code snippets: placeholder bucket/table/flag names, generic role pair (e.g. an ops role vs a field role) when the gated-non-fetch examples need two roles.
6. **No spec changes needed** — zero blockers; the two content notes (deviations-list has no harvest exemplar; interaction-specs numbering) are authorable-from-spec as written.

## PM annotations

**PM annotation (2026-07-13, Phase 6 — reconciled):**

1. **All six recommendations APPROVED as written**, including every §4 house-shape resolution (Covers header per spec, `**Stack:**` line, Claude boilerplate, Cross-cutting-rules heading, ASCII dependency blocks in the two-block house form, provenance line as the last line before VERIFY, `_00_` numbering). Flag them in completion notes as planned.
2. **Author order:** MOB_KB_00 finalized last — approved.
3. **Scrub grep (audit §5 recipe) is a completion GATE, not advice:** run per-file plus the whole-directory pass; any hit outside `EXPO_PUBLIC_SUPABASE_URL`/`_ANON_KEY` is stop-and-fix before reporting done. Record the final whole-directory grep result (clean) in the Implementation log — Phase 8 re-runs it independently.
4. **Discrepancy handling confirmed:** spec wins on all three logged harvest-vs-spec discrepancies (TTL 60–120 s with escalation clause; free-signing as pre-enrollment bootstrap in documented tension with the anti-pattern warning; install-route supersession). Do not reconcile the harvest docs.
5. **Stable internal anchors (integration contract with Worker 2, running in parallel):** keep the literal section labels "§0 mechanism map" (MOB_KB_2) and "output template" (MOB_KB_1) as section-level headings/labels — Worker 2's command body cites them by name.
6. **Parked-table mirror:** no amendments to the spec's Parked table this phase — NOT-cover list mirrors it exactly as specced.
7. Two content notes accepted as authorable-from-spec (deviations-list without harvest exemplar; §6+ numbering per spec, not harvest §8). No spec changes.

## Implementation log

*2026-07-13, Phase 7.*

- **Preconditions re-checked at dispatch:** all six harvest paths readable; `docs/Mobile KBs/` absent before authoring. ✓
- **Author order:** MOB_KB_1 → 2 → 3 → 4 → 5, index finalized last (per PM annotation #2) — index file-table Covers phrasing, dependency arrows, and VERIFY items describe what the five files actually say.
- **All six files authored** per spec A1–A6:
  - `docs/Mobile KBs/MOB_KB_1_Stack_Selection.md` — Part 1 method with a `### The output template` heading (stable label per PM annotation #5) + re-verify rule; Part 2 dated July 2026 worked example as a `Concern | Library | Version (Jul 2026) | Why` table (mirrors the template's own shape) + the Tailwind-major-version worked-risk example + the spec-enumerated caveats (worklets peer dep, expo-av removed, react-native-pdf New-Arch dodge). Spec's slimmed library list followed (moti/gifted-charts/web-browser omissions honored; moti appears in MOB_KB_5's gotchas as specced).
  - `MOB_KB_2_Parity_Contract.md` — rule, required sections §0–§6+ incl. the deviations candidate list (authored from spec text — no harvest exemplar, per audit content note) and design-tokens-as-literals; `## The §0 mechanism map` heading (stable label) with the spec's generalized 9-row table + the URL-params parenthetical placed outside §0 per spec; port-vs-rewrite guidance. Spec's §6+ numbering used, not the harvest's §8 (audit content note #2).
  - `MOB_KB_3_Supabase_On_Device.md` — client-config snippet (AsyncStorage/SecureStore 2 KB rationale + AES hardening option + accepted-trade-off framing), claims/guards (JWKS-local with `[VERIFY per env]` symmetric caveat; null-is-data-failure rule), signed-URL posture step-down with **TTL 60–120 s + slow-cellular escalation clause** (spec canonicalization over the harvest's 60-vs-120 inconsistency — discrepancy §3.1, not reconciled), writes (base64→ArrayBuffer path, byteLength>0 + max-size asserts, fixed guard order), `useScreenData` shape verbatim from spec, concurrent signed-URL mints, env posture.
  - `MOB_KB_4_Distribution.md` — two-actor runbook template; ladder with **free-signing rung framed as pre-enrollment bootstrap in documented tension with the anti-pattern warning** (spec synthesis over harvest flip-flop — discrepancy §3.2); **code-signing walkthrough, `expo run:ios → xcodebuild-direct + devicectl` install route, ≥10 GB / ENOSPC 84–98 % preflight numbers, `xcodebuild -downloadPlatform iOS` — all copied from spec A5 text (transcript-canonicalized), not from harvest** (discrepancy §3.3 supersession honored); Android flag line verbatim.
  - `MOB_KB_5_Gotchas_And_Verification.md` — all ten spec-A6 gotchas incl. the `$74,589.0`-style Hermes example (spec-canonicalized phrasing), expo-audio SharedObject lifecycle + Maestro selector advice copied from spec (transcript-canonicalized); four smoke lanes verbatim; sim-walk annotation pattern with "annotations never flip Pending" and asserted-absent-vs-eyeballed distinction; NOT-cover pointer for in-repo Maestro scaffolding.
  - `MOB_KB_00_Index.md` — house shape per audit §4 resolutions (all PM-approved): `Covers` header (spec-pinned), `**Stack:**` line, Claude boilerplate, `## Cross-cutting rules that apply everywhere` with the spec's pinned Always/Never bullets, two-block ASCII dependencies (spec's exact edges: 2→3, 2→1, 1→4 intra; SB_KB_00/AUTH_KB_2, UI_KB_0, OBS_KB_5 cross), When-to-update + "stack patterns, not project docs" closer, NOT-cover mirroring the Parked table (six A1 items + test-scaffolding + monorepo rows, no amendments per PM annotation #6), provenance blockquote as the last line before VERIFY, VERIFY last with the five spec-pinned port checks.
- **Provenance line** present on every file (blockquote under H1 on KB_1–5; above VERIFY on the index per spec pin). MOB_KB_4 carries the additional `unproven — no Android field run yet` flag; MOB_KB_1's Apple-shaped distribution finding flagged likewise.
- **SCRUB GATE (PM annotation #3) — per-file + whole-directory: CLEAN.** Per-file grep after each draft, then the whole-directory pass:
  - Patterns run: `kai` (ci) · `/Users/` · `EXPO_PUBLIC_*` inventory · `v_[a-z]` · `can[A-Z]` (case-sensitive) · coined role names (`tmt`, `hp_pm`, `hp-`) · project-ref/bundle-ID/domain dot-shapes (`insynq`, `iwxhmn`, reverse-dns regex) · UUID shape · `MOB-[A-Z]`/`SMOKE-[A-Z]` ID shapes · product table/bucket/path/domain vocab (`ask_`, `ask-voice`, `geist`, `denver`, `gci`, `parsons`, `settlement`, `commission`, `deck_`/`_deck`).
  - **Result: zero true hits.** `EXPO_PUBLIC_` occurrences are exactly: the two standard names (`_SUPABASE_URL`, `_SUPABASE_ANON_KEY`), the spec-pinned wildcard `EXPO_PUBLIC_*` (A1 Always bullet text), and `EXPO_PUBLIC_SUPABASE_*` as a glob over the two standard names in the index VERIFY item — no product flag name anywhere (write flag described generically per audit §5.5). First-pass `-i` grep produced only case-class false positives ("canonical"/"canon"/"candidates"/"cannot" vs `can[A-Z]`; `smoke-tests-pending.md` — the framework's own house filename — vs `SMOKE-`); the case-sensitive re-run above is the authoritative clean result. Phase 8 re-run should use case-sensitive `can[A-Z]` and ID-shape patterns `MOB-[A-Z]`/`SMOKE-[A-Z]` to avoid the same FPs.
- **Nothing outside `docs/Mobile KBs/` touched** except this plan doc (git status verified; the `port-mobile.md` in the worktree is Worker 2's parallel slice).
- **No blockers. No spec discrepancies beyond the three pre-logged in audit §3 (all resolved spec-wins as directed).**

## Completion notes

For PM verification (cheap-veto flags per Recommendation #2):

1. **House-shape resolutions applied as approved** — one judgment call to note: the NOT-cover list includes the two Parked rows A1 didn't enumerate (in-repo test scaffolding, monorepo) in addition to A1's six items, satisfying both the A1 text and this plan's "mirrors the spec's Parked table" constraint. Trivial to trim if the PM prefers A1's six only.
2. **Stable anchors for Worker 2** (integration contract): MOB_KB_2 has the literal heading `## The §0 mechanism map`; MOB_KB_1 has the literal heading `### The output template`. Filenames exactly as the plan lists them, space in `Mobile KBs/` included.
3. **Generalization phrasing**: field example cited as "a July 2026 web→RN port of an internal Supabase dashboard" throughout (spec-pinned); roles referenced only generically ("role-gating", "other-role logins"); no placeholder table/bucket names were needed — content stayed at the pattern level, so no invented identifiers to confuse adopters.
4. **Spec-canonicalized content copied verbatim from spec A5/A6** (signing walkthrough, preflight numbers, devicectl route, SharedObject/Maestro advice, `$74,589.0`-style Hermes example) — never paraphrased from harvest or memory.
5. **Lesson worth keeping**: a case-insensitive grep over `can[A-Z]`-style patterns self-defeats (the `-i` flag collapses the case class). The Phase 8 independent re-run should keep the identifier patterns case-sensitive and use the concrete pattern list logged above.
