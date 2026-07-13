# Worker 3 — kickoff second-client edits + wiring (C1, C2, D1–D4)

**Phase:** mobile-port-intake
**Status:** implemented 2026-07-13 (Phase 7 complete — all gates green, not committed)

## Task

Apply the spec's Section C and D edit blocks (`docs/mobile-port-intake-spec.md`, LOCKED 2026-07-13): two `/kickoff` edits closing the second-client-target declaration gap (plus the pre-existing :126 mislabel reconcile), and the wiring edits — `docs/KB_INDEX.md` (four touches), `CLAUDE.md` (two edits), `.framework-manifest.json` (two sorted insertions). All anchors were verified verbatim at `fb757ae`; re-verify each anchor at apply time before editing.

## Files involved

- `.claude/commands/kickoff.md` — C1: insert the native-mobile-companion bullet after the `Mobile-friendly or PWA` bullet at :185 (exact text in spec C1). Also reconcile the :126 mislabel: "Replace question 4 (mobile/PWA)" mispoints — reword the parenthetical to point at the Phase-4 checklist bullets (the mobile/PWA + new companion-app bullets), keeping the non-UI-project instruction coherent. C2: append the multi-client Tech Stack sentence to the `## Tech Stack` instruction at :375 (exact text in spec C2).
- `docs/KB_INDEX.md` — D1, **four** touches: (a) :3 `nine` → `ten` AND :8 `(the nine folders below)` → `ten`; (b) :10 folders list — append `` `Mobile KBs/` (`MOB_KB_*`). `` before the final period; (c) :36 task table — add row `| **Port the web app to a native mobile companion** | MOB_KB_00 → MOB_KB_2 → MOB_KB_1 → MOB_KB_3 → MOB_KB_4 → MOB_KB_5 |` after the "Test a feature end-to-end" row (NO command reference in the cell — decided 2026-07-13); (d) :54 layer table — add row `| Native mobile companion (React Native / Expo), web→mobile ports, device distribution | `Mobile KBs/` |` after the Test row. The :8 stack-description parenthetical: insert ` + Expo/React Native for the optional mobile companion client` only if it fits cleanly; otherwise leave untouched (spec-sanctioned fallback).
- `CLAUDE.md` — D2: add the Mobile KBs consult bullet after the AI KBs bullet at :53 (exact text in spec D2). D3: add the `/port-mobile` row after the `/orchestrate` row at :88 (exact text in spec D3).
- `.framework-manifest.json` — D4: insert `"docs/Mobile KBs/"` into `categories["framework-managed"]` between `"docs/MULTI_AGENT_WORKFLOW.md"` and `"docs/Obs KBs/"`; insert `"docs/mobile-port-intake-spec.md"` into `categories["excluded"]` between `"docs/agent-blueprint-v07-intake-spec.md"` and `"docs/verification-discipline-adoption-spec.md"`. Preserve strict ASCII sort and JSON validity.

## Constraints / non-goals

- Every edit's inserted text is pinned in the spec — copy exactly; do not restyle. The one judgment call is the :126 reconcile wording (keep it minimal) and the :8 parenthetical fit decision.
- Wave 2: runs only after Workers 1 and 2 report complete — every path this worker writes must exist on disk; verify `docs/Mobile KBs/MOB_KB_00_Index.md` and `.claude/commands/port-mobile.md` exist before starting.
- Do NOT touch `docs/Mobile KBs/` or `port-mobile.md` content, MULTI_AGENT_WORKFLOW.md, or any other command file.
- Do NOT bump the manifest version or touch FRAMEWORK_CHANGELOG.md — that is `/ship`'s job at release time.
- Line numbers cited are at `fb757ae`; match by verbatim anchor text, not line number, if the file shifted.

## Expected observations & failure signals

- **Expected:** 4 modified files; `python3 -m json.tool .framework-manifest.json` parses; both KB_INDEX count words read "ten"; all inserted paths resolve to existing files.
- **Most-likely failure:** an anchor drifted since `fb757ae`. Counter-move: search for the verbatim anchor string; if found once, proceed; if zero or multiple matches, stop (abort condition).
- **Fork-trigger (:8 parenthetical):** if the sentence structure doesn't take ` + Expo/React Native for the optional mobile companion client` cleanly, leave :8's stack description untouched — the layer-table row carries the routing (spec-pre-designed fallback; still update :8's "nine"→"ten").

## Abort conditions

- **Blocked — escalate/stop:** any verbatim anchor missing or ambiguous at apply time; `docs/Mobile KBs/` or `port-mobile.md` absent at start (wave-ordering breach); manifest arrays not in the expected sort order when opened.
- **Friction — push through:** markdown table alignment/pipe-escaping fiddliness; JSON trailing-comma care.

## Granular audit

*Audited 2026-07-13 against live working tree (HEAD = `fb757ae`). All anchors re-verified byte-for-byte and uniqueness-checked (`grep -c` = 1 for every anchor).*

### Anchor verification (10/10 PASS, all unique)

| Edit | Anchor | Live location | Status |
|---|---|---|---|
| C1 | `   - *(UI apps only)* Mobile-friendly or PWA` | `kickoff.md:185` | PASS, unique (1 match) |
| C1-reconcile | `Replace question 4 (mobile/PWA) with: "How will this be deployed and consumed — HTTP API, CLI binary, SDK, scheduled job?"` | `kickoff.md:126` (inside the API/library/CLI bullet) | PASS, unique; straight quotes + em-dash confirmed byte-exact |
| C2 | `4. **`## Tech Stack`**` instruction line | `kickoff.md:375` | PASS, unique |
| D1a | `This index sits on top of the nine` | `KB_INDEX.md:3` | PASS, unique |
| D1a | `(the nine folders below)` | `KB_INDEX.md:8` | PASS, unique |
| D1b | Folders list ending `` `AI KBs/` (`AI_KB_*`). `` | `KB_INDEX.md:10` | PASS |
| D1c | Task-table last row (`Test a feature end-to-end`) | `KB_INDEX.md:36` | PASS |
| D1d | Layer-table last row (`Test strategy, pgTAP RLS, …`) | `KB_INDEX.md:54` | PASS |
| D2 | AI KBs consult bullet | `CLAUDE.md:53` | PASS, unique |
| D3 | `/orchestrate` table row | `CLAUDE.md:88` | PASS, unique |

Manifest: both arrays confirmed in strict ASCII sort (`python3` check: `fm sorted: True`, `ex sorted: True`).

### kickoff.md :126 reconcile — pinned replacement wording (the one judgment call)

Context verified: Phase 2's question 4 (`kickoff.md:143`) is the multiple-user-types question — and it already says "(or consumers)", so it needs no replacement for non-UI projects. The mobile/PWA item lives only in Phase 4's checklist (:185), which already carries a parallel `*(Non-UI apps only)*` deployment bullet at :186 with the *identical* question text :126 prescribes as a "replacement". So :126's fragment is both mislabeled and redundant. Pinned mechanical edit (fragment-level, inside the :126 line):

- **OLD (exact):** `Replace question 4 (mobile/PWA) with: "How will this be deployed and consumed — HTTP API, CLI binary, SDK, scheduled job?"`
- **NEW (exact):** `In Phase 4's pattern checklist, skip the *(UI apps only)* bullets (mobile/PWA and the native mobile companion) — the *(Non-UI apps only)* bullet ("How will this be deployed and consumed — HTTP API, CLI binary, SDK, scheduled job?") applies instead.`

This keeps the deployment question visible in the non-UI instruction, points at the Phase-4 checklist (both mobile-flavored bullets, including the new C1 one), and touches nothing else on the line ("Replace question 3 …" and "Skip questions about screens …" stay intact).

### KB_INDEX :8 parenthetical — pinned decision: INSERT

Live sentence: `**Stack-reference KBs** (the nine folders below) — vetted patterns for the chosen stack (Supabase + Next.js App Router + Vercel + Resend + Stripe + Anthropic).`
The stack list is a bare `A + B + C` chain; appending ` + Expo/React Native for the optional mobile companion client` before the closing paren reads cleanly (the "for the optional…" qualifier correctly marks it conditional against the unqualified core items). **Decision: insert.** Resulting parenthetical: `(Supabase + Next.js App Router + Vercel + Resend + Stripe + Anthropic + Expo/React Native for the optional mobile companion client)`. Same edit also changes "the nine folders below" → "the ten folders below".

### D1b folders-list mechanics (pinned)

Replace trailing `` `AI KBs/` (`AI_KB_*`). `` with `` `AI KBs/` (`AI_KB_*`), `Mobile KBs/` (`MOB_KB_*`). `` — i.e., comma-join before the final period, matching the list's existing comma-separated style.

### Manifest D4 — mechanical validation (PASS, triples pinned)

- File format: 6-space indent per array element, no trailing comma on last element; insertions are mid-array (comma after inserted line needed, neighbors keep theirs).
- `framework-managed` (insert between live lines 44–45), resulting triple: `"docs/MULTI_AGENT_WORKFLOW.md"` → **`"docs/Mobile KBs/"`** → `"docs/Obs KBs/"`. Sort check: `MU` vs `Mo` — `U`(0x55) < `o`(0x6F); `Mobile` vs `Obs` — `M` < `O`. Correct.
- `excluded` (insert between live lines 81–82), resulting triple: `"docs/agent-blueprint-v07-intake-spec.md"` → **`"docs/mobile-port-intake-spec.md"`** → `"docs/verification-discipline-adoption-spec.md"`. Correct.
- Trailing-slash convention (`_meta.notes`): directory entries end with `/` — `"docs/Mobile KBs/"` complies.

### Findings

1. **[Medium — spec gap] Manifest `default_action_on_conflict` map not covered by D4.** The manifest carries a per-path conflict-action map (32 entries) that is currently in **1:1 coverage** with `framework-managed` (verified: zero fm entries missing from the map — every one of the 17 has an entry). Adding `"docs/Mobile KBs/"` to the array without a matching map entry breaks that invariant. Functionally safe — `lib/paths.js:resolveAction` and `/update-framework` Step 5d fall back to `_meta.category_defaults` (`framework-managed` → `overwrite-with-backup`, confirmed present) — but it would be the only fm entry relying on the fallback. Recommendation R1 below.
2. **[Low — convention mismatch] D1c task-table row breaks the backtick convention.** Every existing task-table "Read in order" cell backticks each KB id (`` `TEST_KB_1` ``, etc.); the spec's pinned row text uses bare `MOB_KB_00 → MOB_KB_2 → …`. Copying exactly as pinned produces the table's only un-backticked cell. Recommendation R2.
3. **[OK] D1d layer-table row matches convention exactly.** 2 columns, plain concern text, backticked folder in col 2 — no adaptation needed. Same for D2 (bullet format matches CLAUDE.md's existing consult bullets) and D3 (row shape matches; no unescaped pipes in the cell text).
4. **[OK] C1 indentation.** Anchor bullet uses 3-space indent + `- *(UI apps only)*`; the spec's inserted line carries identical indentation — mechanical insert, no adaptation.
5. **[Confirmed — wave gate, expected] `docs/Mobile KBs/` and `.claude/commands/port-mobile.md` do not exist yet** (checked at audit time). Expected during Phase 5 (Workers 1/2 not landed); remains a hard start-gate for Phase 7 since C1, C2, and D2 inserted text all reference `docs/Mobile KBs/MOB_KB_00_Index.md` and D3 references `/port-mobile`.
6. **[Confirmed — sequencing] Spec file is currently untracked** (`?? docs/mobile-port-intake-spec.md` in git status), consistent with the spec's D4 sequencing rule: the D4 excluded-entry edit must land in the same commit that first `git add`s the spec (that commit is `/ship`'s, not this worker's — worker just leaves both in the working tree together).
7. **[OK] KB_INDEX self-consistency.** The file's own "When to update this file" section (:86) mandates exactly D1's shape ("A folder is added or removed → update the orientation paragraph and the layer table"); D1 additionally adds a task row, which :84 sanctions for tasks spanning 3+ families. No other "nine" occurrences in the file beyond :3 and :8.

## Recommendations

- **R1 (Medium, needs PM sign-off — one-line scope extension to D4):** add `"docs/Mobile KBs/": "overwrite-with-backup"` to `default_action_on_conflict`, inserted between the `"docs/MULTI_AGENT_WORKFLOW.md"` and `"docs/Obs KBs/"` entries (live lines 108–109) to preserve the map's 1:1 coverage of framework-managed and its sort. Without it nothing breaks (category-default fallback covers it), but the invariant silently erodes. Cheap now, confusing later.
- **R2 (Low, needs PM sign-off — deviate from pinned text or accept):** backtick the KB ids in the D1c task row: ``| **Port the web app to a native mobile companion** | `MOB_KB_00` → `MOB_KB_2` → `MOB_KB_1` → `MOB_KB_3` → `MOB_KB_4` → `MOB_KB_5` |`` — matches every existing row's style. The spec's "no command reference" decision is unaffected.
- **R3 (process):** at Phase 7 start, run the wave gate first (`ls "docs/Mobile KBs/MOB_KB_00_Index.md" .claude/commands/port-mobile.md`), then re-grep each anchor (all unique today; Workers 1/2 touch neither kickoff.md, KB_INDEX.md, CLAUDE.md nor the manifest, so drift risk is low but the check is free). Finish with `python3 -m json.tool .framework-manifest.json` and a `grep -c nine docs/KB_INDEX.md` → expect 0.

## PM annotations

**PM annotation (2026-07-13, Phase 6 — reconciled):**

1. **R1 APPROVED (scope extension to D4, PM-signed):** add `"docs/Mobile KBs/": "overwrite-with-backup"` to `default_action_on_conflict` between the `"docs/MULTI_AGENT_WORKFLOW.md"` and `"docs/Obs KBs/"` entries. Rationale: preserves the map's 1:1 coverage of `framework-managed`; the value equals the category default, so zero behavior change — pure invariant maintenance. Log it in the Implementation log as a signed deviation-from-spec (addition).
2. **R2 APPROVED (deviate from pinned text, PM-signed):** backtick the KB ids in the D1c task row exactly as drafted in R2. Rationale: the spec's pinned decisions for that cell were content decisions (reading order, no command reference) — both preserved; an un-backticked cell would be the table's only style outlier. Log as a signed cosmetic deviation.
3. **R3 APPROVED as the Phase 7 start/finish protocol:** wave gate (`ls` both Wave-1 artifacts) first — abort if either is missing; re-grep every anchor before each edit; finish with `python3 -m json.tool .framework-manifest.json` and `grep -c nine docs/KB_INDEX.md` → 0. Record all three results in the Implementation log.
4. **:126 reconcile and :8 parenthetical: both pinned wordings APPROVED exactly as drafted** in the Granular audit — implementation is now fully mechanical, zero judgment calls remain.
5. **Finding 6 confirmed:** leave the spec file untracked; the same-commit D4 sequencing is `/ship`'s job at Phase 10 (single ship-time commit per phase plan).

## Implementation log

**2026-07-13, Worker 3 — all items DONE.**

1. **Wave gate (R3): PASS.** `ls "docs/Mobile KBs/MOB_KB_00_Index.md" .claude/commands/port-mobile.md` — both exist.
2. **Anchor re-grep: PASS.** All anchors matched with count 1 at apply time (C1, C1-reconcile, D1a×2, D1b, D1c, D2, D3). The bare-heading grep `'## Tech Stack'` shows 2 hits in kickoff.md, but the C2 anchor is the full `4. **\`## Tech Stack\`** — bullets: …` instruction line, which is unique (the other hit at :399 is the plain template heading) — proceeded.
3. **C1 DONE** — native-mobile-companion bullet inserted after the Mobile-friendly/PWA bullet, spec text verbatim, 3-space indent matched.
4. **C1 :126 reconcile DONE** — pinned NEW wording applied exactly as drafted (PM-approved); "Replace question 3 …" and "Skip questions …" untouched.
5. **C2 DONE** — multi-client sentence appended to the `## Tech Stack` instruction, spec text verbatim.
6. **D1 DONE (all four touches + :8 parenthetical INSERT):** (a) :3 and :8 `nine` → `ten`; (b) folders list comma-joined `` `Mobile KBs/` (`MOB_KB_*`). `` before the final period; (c) task-table row added after "Test a feature end-to-end" with **backticked ids per R2 (PM-signed cosmetic deviation from pinned text)**; (d) layer-table row added after the Test row, spec text verbatim. :8 parenthetical inserted per the approved pinned decision (` + Expo/React Native for the optional mobile companion client`).
7. **D2 DONE** — Mobile KBs consult bullet added after the AI KBs bullet in CLAUDE.md, spec text verbatim.
8. **D3 DONE** — `/port-mobile` row added after `/orchestrate` in the Orchestrators table, spec text verbatim.
9. **D4 DONE (two array insertions + R1):** `"docs/Mobile KBs/"` into framework-managed (between MULTI_AGENT_WORKFLOW.md and Obs KBs/); `"docs/mobile-port-intake-spec.md"` into excluded (between agent-blueprint-v07 and verification-discipline specs); **R1 (PM-signed deviation-from-spec, addition):** `"docs/Mobile KBs/": "overwrite-with-backup"` added to `default_action_on_conflict` between the MULTI_AGENT_WORKFLOW.md and Obs KBs/ entries — 1:1 fm↔map coverage preserved. No version bump; FRAMEWORK_CHANGELOG untouched.
10. **Finish gates (R3): ALL PASS.** `python3 -m json.tool .framework-manifest.json` → valid; `grep -c nine docs/KB_INDEX.md` → 0; both manifest arrays re-verified strictly sorted post-edit (`fm sorted: True`, `ex sorted: True`) and map coverage of framework-managed confirmed complete.

Files changed (4, per `git status`): `.claude/commands/kickoff.md`, `docs/KB_INDEX.md`, `CLAUDE.md`, `.framework-manifest.json`. Nothing committed; spec file left untracked per Finding 6.

## Completion notes

- Zero judgment calls exercised — every wording was pinned (spec or PM-approved audit draft) and applied verbatim. The two signed deviations (R1 map entry, R2 backticks) are logged above.
- Anchor-drift risk was nil in practice: Workers 1/2 touched none of this worker's four files; every anchor matched byte-for-byte at `fb757ae` positions.
- Lesson: a bare heading-text grep can double-count when a command file both *instructs about* a heading and *contains* the template heading itself (kickoff.md `## Tech Stack`). Anchor on the full instruction line, not the heading fragment — worth carrying into future anchor-verification protocols.
- For PM verification: expected observations all hold — 4 modified files, valid JSON, "ten" in both KB_INDEX count positions, and every inserted path (`docs/Mobile KBs/MOB_KB_00_Index.md`, `.claude/commands/port-mobile.md` via `/port-mobile`) resolves to an existing file.
