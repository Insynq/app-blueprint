# Worker 4 — Delta sync mode (Addendum E, E1–E4)

**Phase:** mobile-port-intake (scope addition, user-granted 2026-07-13)
**Status:** drafted

## Task

Implement spec **Addendum E** (`docs/mobile-port-intake-spec.md`, bottom section): a post-port delta-sync mode for `/port-mobile`, the matching contract-currency section in MOB_KB_2, one CLAUDE.md row clause, and two small MOB_KB_00 index touches. The addendum's decisions table and edit blocks E1–E4 are the contract — they already fold a 7-finding design audit (2026-07-13), so implement as written; do not re-litigate.

## Files involved

- `.claude/commands/port-mobile.md` — E1(a) baseline-stamp line inside the Phase 1 fenced crawler prompt (anchor: `Write your output to <target-repo-abs-path>/docs/research/codebase-inventory.md.`, line ~42); E1(b) new `## Sync mode — post-port catch-up` section, clean EOF append after Phase 7, per the addendum's full bullet spec — including its OWN consumed-verbatim scoped-update crawler prompt (never reuse Phase 1's exhaustive prompt); E1(c) frontmatter amendment — append the sync clause to `description`, extend the argument description, then re-verify YAML parses and description stays under ~1024 chars.
- `docs/Mobile KBs/MOB_KB_2_Parity_Contract.md` — E2 new `## Keeping the contract current (the delta re-crawl)` section, clean EOF append after "Port vs rewrite", opening with the `Installed 2026-07-13, not yet proven in a live run` flag line.
- `CLAUDE.md` — E3: append `; sync mode re-inventories web-app changes post-port` to the `/port-mobile` row's description cell (row currently at :90).
- `docs/Mobile KBs/MOB_KB_00_Index.md` — E4(a) extend MOB_KB_2's file-table `Covers` cell with `, delta re-crawl (post-port sync)`; E4(b) add `MOB_KB_2 — when a sync run changes the contract-currency method` to the "When to update these files" list.

## Constraints / non-goals

- **Provenance flag for ALL new prose:** `Installed 2026-07-13, not yet proven in a live run` — NOT `Field-derived` (zero catch-up field runs). Flag in prose intros only, never inside executed step text.
- The five-bucket classification and its concrete path signals (backend-shared = `supabase/migrations/*.sql`, `supabase/functions/**`, `supabase/config.toml`) are pinned in the addendum decisions table — copy the semantics exactly.
- Sync mode is **inventory-only** — the section text must make it impossible to read as authorization to write app code.
- The scoped-update crawler prompt must carry: read-only line, explicit changed-file list placeholder, update-only-affected-sections-in-place, advance the `Parity baseline:` stamp, empty-result honesty contract.
- Scrub rule applies (no Kai specifics; generic examples only).
- Do NOT touch any other file (no manifest — `docs/Mobile KBs/` and `.claude/commands/` are already covered; no KB_INDEX; no kickoff.md).
- Keep port-mobile.md total length ≤ ~160 lines (currently 103; budget ~40 for the sync section).

## Expected observations & failure signals

- **Expected:** 4 modified files; amended frontmatter parses (run a YAML parse check); port-mobile.md ≤160 lines; exactly TWO new fenced blocks in the sync section at most (the scoped-update prompt; none other needed).
- **Most-likely failure:** frontmatter edit breaking the YAML byte-pin discipline sloppily. Counter-move: edit minimally (append clause, extend argument description), then parse-verify and diff the frontmatter to confirm only the two intended changes.
- **Fork-trigger:** if the EOF-append anchors have shifted (files changed since audit), match by section heading, not line number; if a heading is missing entirely, stop.

## Abort conditions

- **Blocked — escalate/stop:** amended YAML fails to parse; any anchor heading missing; description exceeds the ~1024-char ceiling after the clause (trim the clause, not the original pinned text — and log it).
- **Friction — push through:** line-budget pressure (compress sync prose, never drop the addendum's pinned elements).

## Granular audit

*(Skipped as a separate phase — the addendum design itself was adversarially audited 2026-07-13 (7 findings, all folded into the edit blocks before this doc was authored). Audit record: phase-plan.md scope-addition section.)*

## Recommendations

*(n/a — see above)*

## PM annotations

**PM annotation (2026-07-13):** dispatch-ready as written. The frontmatter amendment is a PM-signed deviation from the B1 byte-pin, recorded in the addendum decisions table — do not treat the pin as a blocker. Run the completion greps: YAML parse, `$ARGUMENTS.`, `{{`, scrub patterns, line count.

## Implementation log

**2026-07-13 — all edits applied per Addendum E, in order:**

1. **E1(a)** — baseline-stamp line added inside the Phase 1 fenced crawler prompt, directly after the `Write your output to …codebase-inventory.md.` anchor line: `Stamp the doc header with "Parity baseline: <web-repo HEAD sha at crawl time>".`
2. **E1(b)** — `## Sync mode — post-port catch-up` appended after Phase 7 (clean EOF append). Provenance flag `Installed 2026-07-13, not yet proven in a live run` as a blockquote in the prose intro only, never in step text. Trigger / preconditions (target-must-exist + never-scaffold, stamp-absent → stop and offer full Phase-1 re-crawl, port-spec-missing → degraded filter declared in report) / 5 steps / hard-rules-restated, per the addendum bullets. Exactly ONE new fenced block: the scoped-update crawler prompt, carrying all five required elements — read-only line, explicit `<changed-file-list>` placeholder, update-only-affected-sections-in-place, advance the `Parity baseline:` stamp, empty-result honesty contract. Five-bucket classification copied with the pinned path signals (`supabase/migrations/*.sql`, `supabase/functions/**`, `supabase/config.toml`).
3. **E1(c)** — frontmatter amended minimally: sync clause appended to `description` (2 continuation lines), `web-app-path` argument description extended with the sync-token note.
4. **E2** — `## Keeping the contract current (the delta re-crawl)` appended to MOB_KB_2 after "Port vs rewrite" (clean EOF append), opening with the Installed-flag line; covers stamp-as-anchor, the five buckets, extend-the-contract standing rule, decided-deviations-block-as-filter, and the port-it / deviated-on-purpose / gap classifiability rule (unclassifiable app-source change = missing contract section).
5. **E3** — CLAUDE.md `/port-mobile` row (:90): appended `; sync mode re-inventories web-app changes post-port` before the closing `|`.
6. **E4(a)** — MOB_KB_00 file-table `Covers` cell for MOB_KB_2 extended with `, delta re-crawl (post-port sync)`. **E4(b)** — added `MOB_KB_2 — when a sync run changes the contract-currency method.` to the "When to update these files" list.

**Completion gates (all clean):**

| Gate | Result |
|---|---|
| YAML parse (Ruby Psych, same check as B1) | OK — parses; description 568 chars (< ~1024 ceiling) |
| Frontmatter diff vs pre-edit snapshot | Exactly the two intended changes (description clause + argument-description extension); nothing else touched |
| `grep -E '\$ARGUMENTS\.'` over all four files | Empty |
| `grep '{{'` over all four files | Empty |
| Scrub greps (`Kai`, `kai-`, `/Users/chrisparsons`, `77770d72`, `8a083a4a`) over all four files | Empty |
| `wc -l port-mobile.md` | **141** lines (was 103; ≤ ~160 budget) |

## Completion notes

- 4 files modified, exactly as scoped: `.claude/commands/port-mobile.md`, `docs/Mobile KBs/MOB_KB_2_Parity_Contract.md`, `docs/Mobile KBs/MOB_KB_00_Index.md`, `CLAUDE.md`. Nothing else touched; nothing committed.
- All anchors matched at their expected locations — no fork-trigger fired.
- Provenance flag used verbatim (`Installed 2026-07-13, not yet proven in a live run`) in the two new-prose intros (port-mobile sync section, MOB_KB_2 section); no `Field-derived` anywhere in new prose; no flag inside executed step text.
- Sync-mode text states inventory-only twice (steps hand-off + hard-rules restatement) and the crawler prompt is read-only — no reading of the section authorizes app-code writes.
- No blockers; zero deviations from the addendum's edit blocks.
