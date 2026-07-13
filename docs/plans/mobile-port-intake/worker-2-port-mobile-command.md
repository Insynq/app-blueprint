# Worker 2 — /port-mobile command (B1)

**Phase:** mobile-port-intake
**Status:** implemented (2026-07-13)

## Task

Author the new orchestrator command `.claude/commands/port-mobile.md` per spec edit block B1 in `docs/mobile-port-intake-spec.md` (LOCKED 2026-07-13). A thin orchestrator (~120–160 lines) encoding the proven web→RN port pipeline: preconditions/repo setup → parity contract → stack research → port spec → `/plan-review` lockdown → waved implementation → verification → distribution & ship. It drives the existing MAW phase loop with port-specific phases and hard rules; `MULTI_AGENT_WORKFLOW.md` itself is NOT modified.

## Files involved

- `.claude/commands/port-mobile.md` — NEW (confirmed absent at `fb757ae`). Frontmatter `description` + `arguments` blocks are **consumed-verbatim from the spec's B1 edit block — copy exactly**. Body authored per the spec's 8-phase outline (steps 0–7) and hard-rules list.

Read-only inputs:
- `docs/mobile-port-intake-spec.md` §B — the contract (frontmatter verbatim; body outline + hard rules)
- `docs/AUTHORING_COMMANDS.md` — house conventions (description WHEN-shape, `$ARGUMENTS` prose-parsing, fenced-block discipline, line-count norms)
- `docs/MULTI_AGENT_WORKFLOW.md` — the phase loop the command drives (reference only)
- An existing orchestrator for house style: `.claude/commands/orchestrate.md` (read-only — this file steers live sessions, never edit it)
- The six `docs/Mobile KBs/MOB_KB_*.md` filenames (pinned in the phase plan's cross-worker contract) — the command references them by exact path; the files are being authored in parallel by Worker 1, so reference by pinned name without reading them.

## Constraints / non-goals

- Frontmatter is pinned: copy the spec's YAML block byte-for-byte (it was plan-review-hardened for the colon-space hazard). Do not "improve" it.
- Hard rules must appear up front, per spec: web app NEVER modified · new client write paths fail-closed behind env flag, flip = scope-graduation event with explicit user grant · build-time green ≠ device verification · re-verify stack versions at run time.
- `$ARGUMENTS` posture per spec D-4 decision: one optional web-app-path argument, prose-parsed; if absent, ASK before doing anything — never invent the path.
- Scaffolding scope per spec decision: the command creates the minimal doc set only (docs/research/, docs/plans/, port spec, smoke-tests-pending.md, CHANGELOG.md, CLAUDE.md with shared-backend declaration) — NOT a full framework install.
- Provenance flag in doc prose only (a note under the frontmatter or in a trailing comment-style line), NEVER inside executed step text — house convention.
- Scrub rule applies: no Kai specifics anywhere.
- Do NOT touch any other file: no CLAUDE.md command-table row (Worker 3 owns it), no MAW.md edits, no manifest edits.

## Expected observations & failure signals

- **Expected:** one new file, ~120–160 lines, frontmatter byte-identical to spec B1, registers as a valid skill shape (description + optional argument), body phases 0–7 in spec order.
- **Most-likely failure:** drifting into re-implementing MAW phase mechanics inline (bloat past ~160 lines). Counter-move: the command *cites* MAW/MOB_KB files for mechanics and owns only the port-specific sequence, gates, and hard rules.
- **Fork-trigger:** if AUTHORING_COMMANDS.md conventions conflict with the spec's B1 outline on a structural point, the spec wins (it was coherence-audited against AUTHORING §1/§2/§3); log the conflict in the Implementation log.

## Abort conditions

- **Blocked — escalate/stop:** `port-mobile.md` unexpectedly exists; the spec's YAML block fails to parse when copied verbatim; AUTHORING_COMMANDS.md demands a structure the spec forbids.
- **Friction — push through:** line-count pressure (compress prose, don't cut spec-required phases or hard rules).

## Granular audit

*(Phase 5, 2026-07-13 — audit only, nothing implemented.)*

**1. Pinned YAML frontmatter PARSES — verified by execution.** Copied the spec B1 block (`docs/mobile-port-intake-spec.md:146-157`) verbatim into a file and parsed with Ruby stdlib YAML (Psych): clean parse. The folded plain scalar collapses to a single 459-char `description` string; `arguments` yields `[{name: "web-app-path", description: "...", required: false}]`. Whole frontmatter is 650 bytes — well under AUTHORING §2's ~1024-char ceiling. No unquoted `: ` inside any scalar (the colon-space hazard the plan-review hardened is confirmed absent). Embedded double quotes in `"make this an iPhone app."` are legal mid-plain-scalar. Copy byte-for-byte as pinned.

**2. Frontmatter shape matches house convention.** Compared against `orchestrate.md:1-7`, `adopt.md:1-8`, `implement.md:1-11`, `debug.md:1-8`, `triage.md:1-8`: all use `arguments:` as a list of `name`/`description`/`required` maps — the spec block matches exactly. One novelty: every existing command writes `description` as a single long line; the spec's is multi-line folded. This is explicitly sanctioned — AUTHORING §1's own "Good" example (`docs/AUTHORING_COMMANDS.md:27-29`) is multi-line folded — and parses identically. Not a deviation.

**3. Hard-rules placement: spec vs house precedent — spec wins, and precedent supports it.** `orchestrate.md` puts its `## Hard rules` section LAST (`orchestrate.md:340-346`), but the spec (`:171`) mandates "stated up front." This is not the abort-condition conflict: AUTHORING §7's discipline pattern ("state one absolute rule up front, in its own block") and `/debug`'s bold rule at the top are the up-front precedent. Follow the spec: hard-rules block right after the H1 + role sentence, before Phase 0.

**4. Biggest internal gap in the 8-phase outline: session/working-directory posture is undefined.** The command is invoked in the framework-adopted WEB repo (where `.claude/commands/` and `docs/Mobile KBs/` live), but every artifact it produces (inventory, research doc, port spec, plan docs, smoke catalog) lives in the NEW sibling repo — which per the scaffolding decision (spec `:139`) gets NO framework install, so `/plan-review` (Phase 4) and `/ship` (Phase 7) as commands only exist in the invoking session. The outline never says where the session sits or how cross-repo paths resolve. Consequences if unstated: subagents dispatched with prompts citing `docs/Mobile KBs/MOB_KB_2_...` resolve against the wrong repo; Phase 7 "run /ship" is impossible inside the sibling repo. The command must pin this in Phase 0 (see R4/R7).

**5. Byte-clean check edge case: pre-existing dirty web repo.** Spec A1 (`:69`) defines the invariant as `git -C <web-repo> status --porcelain` empty / diff-clean against HEAD. If the user's web repo has uncommitted changes BEFORE the port starts, every per-wave check fails spuriously. Phase 0 must record a baseline (HEAD sha + porcelain snapshot) and compare against the baseline, or require a clean start and say so.

**6. Sibling-repo target path is a decision no source provides.** Phase 0 says "create/confirm the sibling target repo" but neither spec nor MOB_KB family pins its name/location. Same never-invent logic as the web-app path applies (wrong target = writes into the wrong directory). Must ask/confirm with the user, with a suggested default (`../<web-app-name>-mobile`).

**7. MOB_KB filenames: MATCH confirmed.** Phase plan cross-worker contract (`phase-plan.md:26,36`) pins six names; spec A1 headers + file table (`mobile-port-intake-spec.md:64,74-78,87,94,103,112,120`) give exactly: `MOB_KB_00_Index.md`, `MOB_KB_1_Stack_Selection.md`, `MOB_KB_2_Parity_Contract.md`, `MOB_KB_3_Supabase_On_Device.md`, `MOB_KB_4_Distribution.md`, `MOB_KB_5_Gotchas_And_Verification.md`. Identical. These are the only paths the command body may cite for the family.

**8. Undefined-term sweep of the outline: clean, with one soft spot.** Every term the body will use grounds out: "parity contract"/"§0 mechanism map" → MOB_KB_2 (spec A3); "gated-non-fetch" → MOB_KB_00 Never-rules (spec `:80`); "signed-URL posture" → MOB_KB_3 (spec `:107`); "lanes"/"sim-walk annotation" → MOB_KB_5 (spec `:123-124`); "two-actor runbook" → MOB_KB_4 (spec `:114`); "frozen prop/type contracts"/waves → MAW conventions. Soft spot: Phase 5's "security greps" — defined only via A1's VERIFY section ("service-role/secret patterns") plus the phase plan's scrub patterns (`phase-plan.md:56`). The command should name the grep targets in one line rather than leaving "security greps" bare (Worker 1's MOB_KB_00 VERIFY section is the canonical home; cite it).

**9. Line-count feasibility: real but tight.** Command corpus ranges 63 (`update-kb.md`) to ~350 (`orchestrate.md`), avg ~300. 120–160 works only if the body cites MAW/MOB_KB for mechanics and inlines only: hard rules, the 8 phase gates, and 2 short consumed-verbatim dispatch-prompt blocks (crawler + stack-researcher — AUTHORING §5 requires embedded dispatch prompts, and §6 forbids collapsing them to pointers). That is where the budget goes; everything else compresses.

**10. Argument-handling hygiene.** `$ARGUMENTS` may arrive as prose ("port ../my-app"), not a bare path — prose-parse per AUTHORING §2; never pipe raw `$ARGUMENTS` into git/ls. Validate the extracted path (exists, is a git repo, plausibly the web app — e.g. has `CLAUDE.md`/`package.json`) and echo the resolved repo back for confirmation before consuming it. Pre-ship grep the file for `$ARGUMENTS\.` and `{{` (AUTHORING §2's #1 authoring bug).

## Recommendations

- **R1:** Copy frontmatter byte-for-byte from spec `:146-157` (parse-verified above). No reflowing, no quoting "improvements."
- **R2:** Provenance flag as a one-line blockquote directly under the H1 (`> Field-derived 2026-07-13 from one live web→RN port (July 2026); iOS-validated only.`) — prose position, never inside a numbered step, satisfying phase-plan check (7).
- **R3 (fills finding 4/6/5):** Phase 0 must explicitly: (a) prose-parse + validate the web-app path and confirm it with the user by name; (b) ask/confirm the sibling target path with default `../<web-app-name>-mobile`; (c) record the web repo's HEAD + `status --porcelain` baseline, defining the byte-clean gate as "diff-clean against this baseline" (or require clean start).
- **R4 (fills finding 4):** One sentence in Phase 0 pinning session posture: the pipeline runs from THIS (framework-adopted web) repo's session; the sibling repo is operated on via absolute paths / `git -C`; dispatch prompts must carry absolute paths for both the MOB_KB files (this repo) and output targets (sibling repo).
- **R5:** Hard-rules block immediately after H1 + role sentence (spec `:171` order), before Step 0 — the four rules verbatim-faithful to the spec, citing OBS_KB_5 Primitives 0/9 and the smoke truth-gate by name rather than re-deriving them.
- **R6:** Cite KBs/commands as plain-text paths (AUTHORING §5 — no `@`-links; skip orchestrate.md's relative markdown links too, since this command operates cross-repo where relative links mislead).
- **R7 (fills finding 4):** Phase 7 phrased as "apply /ship conventions in the new repo (changelog entry, commit hygiene, smoke truth-gate)" — not "run /ship," which doesn't exist there. Matches the spec's own wording ("`/ship` conventions for the new repo", `:169`). Phase 4 is fine as-is: `/plan-review` runs from this session targeting the sibling repo's spec by path.
- **R8:** Pre-completion greps on the new file: `\$ARGUMENTS\.`, `{{`, and the scrub patterns from `phase-plan.md:56` (Kai, kai-, /Users/chrisparsons, transcript IDs, project-ref/bundle-ID shapes) — all must be empty.
- **R9 (fills finding 8):** In the Phase 5 gate line, name the security greps concretely in one clause (service-role/secret patterns per MOB_KB_00's VERIFY section) instead of the bare phrase.

**No blockers.** All three abort conditions checked: `port-mobile.md` absent from `.claude/commands/` (confirmed by directory listing); the spec YAML parses verbatim (executed check); AUTHORING_COMMANDS conflicts with the spec only on hard-rules placement, where AUTHORING §7 itself sanctions the spec's choice — no structure demanded that the spec forbids.

## PM annotations

**PM annotation (2026-07-13, Phase 6 — reconciled):**

1. **All nine recommendations (R1–R9) APPROVED.** The finding-4/5/6 fixes are within the spec's own latitude ("Body outline — author at implement time per AUTHORING_COMMANDS"): they specify Phase 0 mechanics the outline left open, they don't alter the pipeline.
2. **Phase 0 must pin (R3+R4, consolidated):** (a) prose-parse + validate the web-app path, echo the resolved repo back for confirmation before consuming; (b) ask/confirm the sibling target path, suggested default `../<web-app-name>-mobile` — never invent either path; (c) record the web repo's HEAD sha + `status --porcelain` baseline, define the byte-clean gate as diff-clean against that baseline; (d) one sentence pinning session posture — pipeline runs from the framework-adopted web repo's session, sibling operated via absolute paths / `git -C`, dispatch prompts carry absolute paths for both MOB_KB files (this repo) and output targets (sibling repo).
3. **Phase 7 wording (R7):** "apply /ship conventions in the new repo" — never "run /ship". Matches spec :169.
4. **Phase 5 security greps (R9):** name them in one clause, citing MOB_KB_00's VERIFY section as the canonical list — do not re-derive.
5. **Line budget (finding 9):** the two consumed-verbatim dispatch prompts (crawler + stack-researcher) are where the fenced-block budget goes; everything else cites MAW/MOB_KB by plain-text path (R6 — no `@`-links, no relative markdown links).
6. **Frontmatter byte-for-byte from spec :146–157 (R1); provenance blockquote under H1 (R2); pre-completion greps (R8) are a completion gate** — `\$ARGUMENTS\.`, `{{`, and the phase-plan scrub patterns must all be empty; record results in the Implementation log.
7. **Integration contract with Worker 1 (parallel):** cite the six MOB_KB paths exactly as pinned (finding 7) and reference their internal labels only as "§0 mechanism map" / "output template" — Worker 1 has been instructed to keep those labels stable.

## Implementation log

*(2026-07-13, Phase 7)*

- **Created `.claude/commands/port-mobile.md`** (103 lines). Only file touched besides this plan doc. Abort conditions re-checked at start: file absent in `.claude/commands/` listing; spec YAML parsed verbatim; no AUTHORING conflict encountered.
- **R1 frontmatter:** copied from spec `:147-157`; verified byte-identical via `diff` against `sed -n '147,157p'` extraction of the spec — IDENTICAL. Ruby Psych parse clean: 459-char description, one optional `web-app-path` argument.
- **R2 provenance:** one-line blockquote directly under the H1, doc prose only — never in step text.
- **R5 hard rules:** four-rule numbered block immediately after H1 + role sentence, before Phase 0; cites `docs/Obs KBs/OBS_KB_5_Defensive_Writes.md` Primitives 0/9 and the smoke truth-gate by name.
- **R3/R4 (PM annotation 2, all four pins):** Phase 0 has (a) prose-parse + validate + echo-back confirmation of the web-app path, ask-if-absent; (b) sibling target ask/confirm with default `../<web-app-name>-mobile`; (c) HEAD sha + `status --porcelain` baseline, byte-clean gate defined as diff-clean against that baseline (pre-existing dirt = baseline, flagged to user); (d) session-posture sentence — runs from the web repo's session, sibling via absolute paths / `git -C`, dispatch prompts carry absolute paths for both MOB_KB inputs and sibling outputs.
- **Dispatch prompts:** two consumed-verbatim fenced blocks (Phase 1 crawler, Phase 2 stack-researcher) with `<placeholder>` absolute paths filled at dispatch; both carry the empty-result contract (AUTHORING §5) and the mandatory RLS-vs-app-code analysis / re-verify-versions rules.
- **R7:** Phase 7 says "apply /ship conventions in the new repo … apply the conventions by hand from this session" — never "run /ship". Phase 4 runs /plan-review from this session targeting the spec by absolute path.
- **R9:** Phase 5 gate names the security greps concretely — "service-role/secret patterns per the VERIFY BEFORE SHIPPING section of MOB_KB_00" — cited as the canonical list, not re-derived.
- **R6:** all KB/command/doc references are plain-text paths; zero `@`-links, zero relative markdown links.
- **R8 completion-gate greps (all EMPTY as required):** `\$ARGUMENTS\.` → empty; `{{` → empty; scrub patterns (`kai`, `kai-`, `/Users/chrisparsons`, transcript IDs `77770d72`/`8a083a4a`, commit shas `c8f1870`/`e917ee6`, `supabase.co`, project-ref/bundle-ID shapes) → empty. MOB_KB citations extracted from the file: exactly the six pinned names, no variants.
- **Skill registration confirmed:** the harness surfaced `/port-mobile` as an available skill with the spec description immediately after the write — frontmatter is valid skill shape.

## Completion notes

- **Line count is 103 — below the ~120–160 estimate, deliberately.** All spec-required content is present (8 phases 0–7, four hard rules, both dispatch prompts, every gate); the file uses long unwrapped prose lines where orchestrate.md wraps, so raw line count undershoots. Padding to hit 120 would be filler; AUTHORING §6 favors the shorter body. Flag for PM: if the estimate was load-bearing, the delta is formatting, not missing content.
- **One judgment call (finding 5 latitude):** the byte-clean gate treats a pre-existing dirty web repo as "baseline = the recorded porcelain snapshot, flagged to user" rather than hard-requiring a clean start — the softer of R3(c)'s two sanctioned options, chosen so the command doesn't refuse service on a repo with innocuous local dirt. Baseline is still recorded and the gate is still exact.
- **No AUTHORING-vs-spec conflicts hit** (the hard-rules placement question was pre-resolved by audit finding 3 in the spec's favor). No blockers. Nothing else touched — no CLAUDE.md row (Worker 3), no MAW edits, no manifest edits.
- **Integration contract honored:** MOB_KB internal labels referenced only as "§0 mechanism map" / MOB_KB_1 "Part 1"/"Part 2" template language / "VERIFY BEFORE SHIPPING" — the labels Worker 1 was instructed to keep stable.
