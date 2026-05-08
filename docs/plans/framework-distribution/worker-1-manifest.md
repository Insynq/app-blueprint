# Worker 1 — Manifest foundation

**Phase:** framework-distribution
**Status:** drafted

## Task

Author `.framework-manifest.json` at repo root. This is the single source of truth for what the framework owns vs. what an adopter owns. Both the installer (Worker 2) and `/update-framework` (Worker 4) read this file to know what to ship, what to leave alone, and what to merge.

V1 uses **directory-level granularity** with named exceptions for hybrid files. Per-file granularity is V2.

## Files involved

- **CREATE:** `/.framework-manifest.json` (repo root)
- **READ:** every directory under `docs/` (full inventory), `.claude/commands/` (full list), repo-root files (CLAUDE.md, package.json if exists, etc.)
- **READ:** `docs/MULTI_AGENT_WORKFLOW.md` to confirm naming conventions
- **READ:** `docs/plans/framework-distribution/phase-plan.md` (sections: Cross-cutting, Resolved decisions) for the manifest format spec

## Constraints / non-goals

- **Format:** JSON (not YAML, not JSONC). Keep simple for V1 — graduate later if comments needed.
- **Granularity:** directory-level for `framework-managed` and `project-owned`; file-level for `hybrid` (since each hybrid file has its own merge story).
- **Hybrid files in V1:** `CLAUDE.md`, `docs/KB_1_Architecture.md`, `docs/KB_7_UI_Patterns.md`, `docs/KB_8_Current_State.md`, `docs/KB_9_Screen_Catalog.md`. (Confirm by reading what's in `docs/` — there may be more or fewer.)
- **Project-owned in V1:** `docs/APP_CONCEPT.md`, `docs/SCOPE.md`, `docs/CHANGELOG.md`, `docs/LESSONS.md`, `docs/smoke-tests-pending.md`, `docs/plans/`. Confirm by inventory.
- **Don't include:** `.framework-backup/`, `.framework-install-staging/`, `node_modules/`, `.git/`, build artifacts. These aren't part of the framework-vs-project split.
- **Don't author:** README.md (PM owns), FRAMEWORK_CHANGELOG.md (PM owns), any other docs. Manifest only.
- **Don't change:** `.claude/commands/*.md`, KBs, CLAUDE.md, MULTI_AGENT_WORKFLOW.md. Read-only inputs.

## Granular audit

**Status:** audited 2026-05-07. Findings below organized by category.

### F1. Inventory drift between holistic plan and the actual repo

The holistic plan (phase-plan.md:84-97 manifest example) names some directories that don't match disk. Verified against `ls`:

- Plan says `docs/Supabase Structure KBs/` — confirmed on disk (`SB_KB_00_Index.md` etc., 13 files, with `.DS_Store`).
- Plan says `docs/UI-UX KBs/` — confirmed on disk. Note the colon in the directory name. **Risk:** colons in paths break some Windows filesystems and some npm/tar tooling. The installer (Worker 2) already inherits this; the manifest must keep the path as-is so the installer's globs match. Flagging for awareness — not a manifest bug, but a downstream landmine that the README's security-assumptions section should also acknowledge.
- Plan's manifest example shows `"docs/UI-UX KBs/"` — must keep the colon **literal** in JSON. JSON allows it; the consumer parsers must too. Both Node (`fs`) and Claude Code's WebFetch handle colon paths fine; verified mentally — but the installer should pass paths through `path.join` not string concat.

### F2. Hybrid file list — confirmed correct, with one caveat

phase-plan.md:93 lists hybrid files as: `CLAUDE.md`, `docs/KB_1_Architecture.md`, `docs/KB_7_UI_Patterns.md`, `docs/KB_8_Current_State.md`, `docs/KB_9_Screen_Catalog.md`. Verified by reading each:

- `CLAUDE.md:1-124` — template scaffold + project-fillable sections. Confirmed hybrid: framework defines structure (Reference Documents, Custom Commands tables, KB Maintenance rules) but adopter fills `## Overview`, `## Tech Stack`, `## Roles`, `## Core Entities`, `## Current Phase`, `## Patterns`, `## Preferences`, `## DO NOT`. Hybrid status correct.
- `docs/KB_1_Architecture.md:1-34` — pure scaffold ([TODO] markers + Open Questions format). Hybrid status correct.
- `docs/KB_7_UI_Patterns.md:1-122` — hybrid: framework provides Part 1–5 section structure + entry-format examples; adopter fills entries. Hybrid status correct.
- `docs/KB_8_Current_State.md:1-13` — pure scaffold. Hybrid status correct.
- `docs/KB_9_Screen_Catalog.md:1-48` — hybrid: framework provides "How to Use", "Maintenance", "Entry Format"; adopter fills Screens section. Hybrid status correct.

**Caveat / question for PM:** is `docs/KB_INDEX.md` (the cross-family routing index, 89 lines, populated and stack-specific) hybrid or framework-managed? It is *fully populated content* about the 9 stack-reference KB families — not a scaffold. It updates only when the stack-reference KBs change. **Recommendation:** treat as **framework-managed** (single-file exception, since it sits at `docs/` root, not inside a KB folder). Adopters who add their own KB families would need to amend it, but that's edge-case enough for V1 to ignore. See R3.

### F3. Project-owned list — incomplete

phase-plan.md:94 lists project-owned as: `docs/APP_CONCEPT.md`, `docs/SCOPE.md`, `docs/CHANGELOG.md`, `docs/LESSONS.md`, `docs/smoke-tests-pending.md`, `docs/plans/`. Confirmed by reading each:

- `docs/APP_CONCEPT.md:1-19` — pure scaffold from kickoff perspective, but content is 100% project-owned once filled.
- `docs/SCOPE.md:1-26` — same.
- `docs/CHANGELOG.md` — confirmed scaffold-with-comment. Project-owned.
- `docs/LESSONS.md` — confirmed seeded with 2 generic [UI-1], [UI-2] entries that are **stack-reference content** (Radix Dialog, scroll/wheel debugging). **Tension:** if treated as project-owned, framework updates won't ship new generic lessons. If treated as hybrid, the adopter's project-specific lessons get marked "customized" on every update. **Recommendation:** keep project-owned; have FRAMEWORK_CHANGELOG mention "added new lesson [X] — copy in if useful" as a manual nudge for V1. Per-file granularity (V2) solves this cleanly. See R4.
- `docs/smoke-tests-pending.md` — confirmed hybrid-shaped (framework provides structure / instructions; adopter fills tests). However scope-wise it's **simpler to call project-owned** because once an adopter has tests in there, framework updates would conflict with every update. Same logic as LESSONS.md.
- `docs/plans/` — confirmed project-owned (currently contains `framework-distribution/` — our own dogfood plan).

**Files NOT in either list that exist in repo and need a category:**

- **`README.md`** (8431 bytes, populated). Currently the framework's adopter-facing README. Per phase-plan.md:101 ("Public-facing README in canonical repo — separate from project-state CLAUDE.md") and phase-plan.md:48 ("Installer NEVER writes ... README.md"), this is **never touched by installer**. **Manifest decision:** category as **framework-only-at-canonical**. Manifest needs a 4th category, OR an explicit `excluded` list. See R1.
- **`CONTRIBUTING.md`** — same as README. Framework-only; never written to adopter repos. Excluded.
- **`LICENSE`** — distribution decision: do adopters get the framework's MIT? Likely no — adopters pick their own. Excluded from install. **Manifest decision:** excluded.
- **`.gitignore`** — adopter likely has their own. Confirmed by reading: framework's `.gitignore` ignores generic stuff (`node_modules`, `.env`, `dist`) plus framework-specific bits (`.claude/worktrees/`, `.claude/plans/`, `audits/`). **Recommendation:** ship as **install-as-sibling** behavior in the installer (Worker 2's blast-radius list does NOT include `.gitignore` — confirmed phase-plan.md:48). Manifest category: excluded from install. R2 covers this.
- **`.env.example`** — generic scaffold. Could ship to adopters. Currently NOT in installer's WILL list. **Recommendation:** add as `framework-managed` single file (it's a scaffold, not project content). See R5.
- **`.github/pull_request_template.md`** + **`.github/workflows/smoke-test-reminder.yml`** — both have framework-shaped scaffolding. Currently NOT in WILL list. **Recommendation:** ship as `framework-managed` directory (`.github/`). The workflow YAML even has a comment on line 11 saying "EDIT_ME — extended-regex" — it's hybrid, not pure-framework. **But for V1 simplicity:** treat the whole `.github/` as `framework-managed` (overwrite-safe-with-backup behavior); the EDIT_ME comment serves as in-band documentation that the adopter should re-customize. See R6.
- **`.vscode/extensions.json`** — currently exists. **Recommendation:** excluded. Adopters have their own editor preferences.
- **`.claude/settings.json`** — currently has the framework's permission allowlist (15 entries). README.md:170-178 ("Customizing Permissions") explicitly tells adopters to edit this. **Hybrid.** Adopter customizes their permission allowlist; framework updates may add new tools to the default allowlist. **Recommendation:** add to hybrid list. See R7.
- **`.claude/memory/MEMORY.md`** — confirmed scaffold (`# [App Name] — Session Memory` placeholder). Project-owned: kickoff seeds it, project accumulates entries. Add to project-owned list. See R8.
- **`audits/`** — gitignored (`.gitignore:43`). Won't be in canonical install. Excluded — and the manifest doesn't need to mention it.

### F4. Manifest format — parsing concerns for both consumers

The phase-plan.md:84-97 example uses simple JSON with three string-array categories. Verified parseability:

- **Worker 2 (installer, Node.js):** trivially parses with `JSON.parse(fs.readFileSync('.framework-manifest.json'))`. Directory entries with trailing slash (`.claude/commands/`) need to be normalized — installer should strip the trailing slash for `path.join`, then re-add for glob-style matching. Suggest documenting this convention IN the manifest (or in a `format` field) to prevent Worker 2 from inventing it.
- **Worker 4 (`/update-framework`, Claude Code slash command):** Claude Code can read JSON files via the Read tool — no custom parser needed. Comparing local-vs-canonical can be done with WebFetch + Read + diff. The structure as proposed is fine. **Risk:** if the manifest itself changes between versions (e.g., V2 adds per-file SHAs), Worker 4 needs to handle multiple manifest schema versions. **Recommendation:** add a `manifest_schema_version` field separate from `version` (the framework version). Then Worker 4 can branch on schema. See R9.

- **Trailing-slash convention.** Directories should consistently use trailing `/`. Files should not. Mixing breaks glob libraries. The example at phase-plan.md:92 already has the trailing slashes — recommend this be the documented convention.

### F5. Directory-level granularity edge cases

The plan defers per-file granularity to V2. Two edge cases where directory-level might bite us in V1:

- **Stack-reference KB folders.** All 9 folders are pure framework-managed at V1 (verified — every file in `docs/AI KBs/`, `docs/Auth KBs/`, etc. is stack-reference content with no adopter-fillable scaffolding). No issue.
- **`.claude/commands/`.** The 24 command files are framework-managed. But once the adopter runs `/preflight`, **none of them get modified** — preflight writes to CLAUDE.md, not to commands. So this stays clean. ✅
- **`docs/` root.** This is the messy one. Files at `docs/` root mix framework-managed (`KB_INDEX.md`, `MULTI_AGENT_WORKFLOW.md`, `AUDIT_FINDINGS.md`), hybrid (`KB_1_Architecture.md`, etc.), and project-owned (`APP_CONCEPT.md`, `LESSONS.md`, etc.). **You cannot use directory-level rules for `docs/` itself — it must be enumerated file-by-file.** This is a known constraint and the phase plan implicitly handles it (the manifest is a list of paths, not a tree). Just confirming: every `docs/*.md` at root must be explicitly named in the manifest's `framework-managed`, `hybrid`, or `project-owned` lists. Files not listed are by-default ignored by installer/update. See R10.
- **`docs/MULTI_AGENT_WORKFLOW.md`** (20816 bytes, populated) — never mentioned in phase-plan.md categorization. **Framework-managed.** Per phase-plan.md:191-194, "PM integration step WRITES any installation nuances. Workers don't touch this file." It's framework-managed (single-file exception). See R11.
- **`docs/AUDIT_FINDINGS.md`** (22197 bytes, populated) — pre-existing template-audit document, dated April 24, 2026. Currently in canonical, but is it shipped to adopters? **Recommendation: excluded.** It's a one-time PM artifact specific to the canonical repo's history. Including it would confuse adopters. See R12.

### F6. Integration risks

- **Worker 2 reads manifest at install time. Worker 4 reads manifest at update time.** They will read **different versions** of the manifest (Worker 2 reads canonical-at-install, Worker 4 reads `local` AND `canonical-at-target`). The manifest itself must be **stable across categorization changes** — i.e., if v0.2 moves a file from `hybrid` to `project-owned`, Worker 4 must handle the recategorization gracefully. **Recommendation:** add a brief "categorization changes" section to FRAMEWORK_CHANGELOG (PM-owned later); Worker 4 reads it and surfaces "FOO was hybrid in 0.1, now project-owned — your local copy is preserved." **Out of scope for Worker 1; flag for PM.**

- **Manifest is itself in `framework-managed`.** It must be self-referential: the manifest must include `.framework-manifest.json` in its own `framework-managed` list, otherwise `/update-framework` won't know to update it. See R13.

- **`.framework-version` is also framework-managed but written by installer/updater, not in the canonical source.** Different beast. **Recommendation:** call it out as a special category or an "installer-generated" item. Putting it in `framework-managed` would cause `/update-framework` to compare local-vs-canonical and always flag it as "missing from canonical" because the canonical repo doesn't (and shouldn't) ship a `.framework-version` file. **Solution:** explicit `installer_generated: [".framework-version"]` list. See R14.

### F7. Other format/schema concerns

- **Version format:** phase-plan.md:88 shows `"version": "0.1.0"`. Recommend explicitly **semver** with no `v` prefix (the GitHub release tag is `v0.1.0`, the manifest field is `0.1.0`). Worker 4 needs to map between them. **Recommendation:** document this in the manifest header or in FRAMEWORK_CHANGELOG.
- **Canonical URL format:** phase-plan.md:90 shows `"canonical_url": "github.com/Insynq/app-blueprint"`. Worker 4 needs to fetch from GitHub releases API; the URL format must be parseable to `owner/repo`. Either include a separate `github_owner` + `github_repo` pair, or document that `canonical_url` is always `github.com/{owner}/{repo}`. See R15.
- **Comments in JSON.** JSON doesn't support comments. The plan-doc constraint at worker-1-manifest.md:21 says "Keep simple for V1 — graduate later if comments needed." Document conventions in a sibling `MANIFEST_FORMAT.md` if needed. **Recommendation: defer.** A `_comment` field or ignored-key convention is fine for now if needed.
- **Encoding / line endings.** JSON should be UTF-8, no BOM, LF line endings. Document in repo's `.gitattributes` if not already. Out of scope for Worker 1, but flag for PM if `.gitattributes` doesn't exist (verified — it doesn't exist at repo root).

### F8. Files I considered but rejected

- **`package.json` at repo root** — does not exist (verified). The framework template doesn't ship one (adopters create per their stack). Confirmed correct: not in any list.
- **`bin/`, `src/`** — don't exist. Will be created by Worker 2 inside the npm package, not at repo root.
- **`.DS_Store` files** — exist in `docs/`, `docs/Supabase Structure KBs/`, `docs/UI-UX KBs/`, `.claude/`. Already in `.gitignore`. Excluded from manifest.

## Recommendations

Numbered for PM cross-reference. **Bold = blockers for Phase 7. Plain = quality-of-life.**

**R1. Add an `excluded` (or `canonical_only`) category to the manifest.** Captures `README.md`, `CONTRIBUTING.md`, `LICENSE`, `docs/AUDIT_FINDINGS.md`. Documents intent; helps Worker 2's "reject any write outside the WILL list" assertion match the manifest's authority. **Blocker.**

**R2. Explicitly list `.gitignore` and `.vscode/extensions.json` in `excluded`.** Same rationale. **Blocker.**

**R3. Add `docs/KB_INDEX.md` to `framework-managed` (single-file exception under `docs/`).** It's stack-reference content that updates with the framework, not the project. **Blocker.**

**R4. Keep `docs/LESSONS.md` and `docs/smoke-tests-pending.md` in `project-owned`** (despite being scaffolds shipped from canonical). FRAMEWORK_CHANGELOG can call out "consider adding new lesson X" as a soft nudge. Per-file granularity solves this in V2. Document the rationale in the manifest header. **Blocker.** (Confirms phase-plan.md:94, no change.)

**R5. Add `.env.example` to `framework-managed`** (single-file exception at repo root). It's a scaffold. **Blocker.** (Worker 2's WILL list must also be updated to match — flag for PM to coordinate.)

**R6. Add `.github/` directory to `framework-managed`** (with the understanding that the workflow YAML has an explicit `EDIT_ME` comment — adopters re-customize after each update). **Blocker for parity with adopter expectations.** (Worker 2's WILL list must also be updated — flag for PM.)

**R7. Add `.claude/settings.json` to `hybrid`.** Framework provides scaffolding allowlist; adopter extends with their own tools. **Blocker.**

**R8. Add `.claude/memory/MEMORY.md` to `project-owned`.** Scaffold is shipped initially by installer; thereafter project-owned. **Blocker.**

**R9. Add `manifest_schema_version` field separate from `version`.** `manifest_schema_version: "1"` for V1; bump independently of framework version. Lets Worker 4 (and future Workers) handle schema migrations. **Blocker.**

**R10. Document in the manifest header that `docs/` root files must be enumerated explicitly** (no directory-level rule applies). The categorization works because every `docs/*.md` at root is explicitly named. **Quality-of-life.**

**R11. Add `docs/MULTI_AGENT_WORKFLOW.md` to `framework-managed`** (single-file exception under `docs/`). Currently un-categorized in phase-plan.md. **Blocker.**

**R12. Exclude `docs/AUDIT_FINDINGS.md`** (canonical-only artifact). **Blocker.**

**R13. Add `.framework-manifest.json` to its own `framework-managed` list.** Self-referential update. **Blocker.**

**R14. Add `installer_generated: [".framework-version"]` as a 5th top-level list.** These files exist on the adopter side but never in canonical; `/update-framework` skips diff-comparison for them. **Blocker.**

**R15. Add `github_owner: "Insynq"` and `github_repo: "app-blueprint"` as explicit fields**, in addition to or instead of `canonical_url`. Worker 4 uses these to construct `https://api.github.com/repos/{owner}/{repo}/releases/tags/{tag}`. Less parsing, less ambiguity. **Quality-of-life (Worker 4 can parse `canonical_url` if needed, but explicit is better).**

**R16. Add a brief `_meta` or header block documenting conventions:** trailing-slash for dirs, no trailing-slash for files, semver for `version`, `manifest_schema_version` for the manifest itself, list of categories with their semantics. Embedded in the JSON as a `_meta.notes` array (since JSON has no comments) or in a sibling `docs/MANIFEST_FORMAT.md`. **Quality-of-life — but recommended to do up front to prevent ambiguity in Worker 2/4 implementations.**

**R17. Final proposed manifest schema (V1):**

```json
{
  "manifest_schema_version": "1",
  "version": "0.1.0",
  "name": "app-blueprint",
  "canonical_url": "github.com/Insynq/app-blueprint",
  "github_owner": "Insynq",
  "github_repo": "app-blueprint",
  "_meta": {
    "notes": [
      "Directory entries end with /. File entries do not.",
      "Files at docs/ root must be enumerated explicitly (no directory-level rule).",
      "framework-managed: framework owns; updates overwrite (with backup).",
      "hybrid: framework provides structure, adopter fills content; updates require user decision.",
      "project-owned: adopter owns; framework never writes after install.",
      "installer_generated: created by installer at adopter side; never compared to canonical.",
      "excluded: exists in canonical repo but not shipped to adopters."
    ]
  },
  "categories": {
    "framework-managed": [
      ".claude/commands/",
      ".claude/memory/",
      ".env.example",
      ".framework-manifest.json",
      ".github/",
      "docs/AI KBs/",
      "docs/Auth KBs/",
      "docs/Bill KBs/",
      "docs/Form KBs/",
      "docs/Job KBs/",
      "docs/KB_INDEX.md",
      "docs/MULTI_AGENT_WORKFLOW.md",
      "docs/Obs KBs/",
      "docs/Supabase Structure KBs/",
      "docs/Test KBs/",
      "docs/UI-UX KBs/"
    ],
    "hybrid": [
      ".claude/settings.json",
      "CLAUDE.md",
      "docs/KB_1_Architecture.md",
      "docs/KB_7_UI_Patterns.md",
      "docs/KB_8_Current_State.md",
      "docs/KB_9_Screen_Catalog.md"
    ],
    "project-owned": [
      ".claude/memory/MEMORY.md",
      "docs/APP_CONCEPT.md",
      "docs/CHANGELOG.md",
      "docs/LESSONS.md",
      "docs/SCOPE.md",
      "docs/plans/",
      "docs/smoke-tests-pending.md"
    ],
    "installer_generated": [
      ".framework-version"
    ],
    "excluded": [
      ".gitignore",
      ".vscode/extensions.json",
      "CONTRIBUTING.md",
      "LICENSE",
      "README.md",
      "audits/",
      "docs/AUDIT_FINDINGS.md"
    ]
  }
}
```

**Tension to flag for PM:** `.claude/memory/` is `framework-managed` (the directory ships with the scaffold) but `.claude/memory/MEMORY.md` is `project-owned` (adopters fill it). The proposed schema lists both — the more-specific file rule overrides the directory rule. Worker 2 and Worker 4 must agree on the precedence convention. **Recommendation:** document "more-specific entry wins" in `_meta.notes`. Or simpler: drop `.claude/memory/` from framework-managed (the directory is created implicitly when MEMORY.md is installed), and only list `.claude/memory/MEMORY.md` in project-owned. **Going with the simpler option in R17 above is cleaner — this caveat applies if PM wants to keep both.**

**R18. Open question for PM:** the worker-1 plan-doc constraint says "Don't author: README.md (PM owns), FRAMEWORK_CHANGELOG.md (PM owns)" but **does** Worker 1 write the manifest's `excluded` entries naming `README.md` etc.? **Yes — naming a file as excluded ≠ authoring it.** Just confirming the boundary. No action needed.

**R19. Validation script (nice-to-have, deferred to Worker 2 or PM):** consider a tiny script that walks the repo, checks every file is categorized in the manifest, and warns on uncategorized files. Catches drift when new files are added to canonical. Can ship in Worker 2's package or as a `npm run validate-manifest` script. **Defer — flag for PM as a post-Worker-4 nice-to-have.**

## PM annotations

**Reconciled 2026-05-07.** Audit accepted with the following decisions:

**PM annotation 1 (schema):** Adopt your full R17 schema. 5 categories — `framework-managed`, `hybrid`, `project-owned`, `installer_generated`, `excluded`. Add fields: `manifest_schema_version: "1"` (separate from framework `version`, for future schema migrations), `github_owner: "Insynq"`, `github_repo: "app-blueprint"`. Manifest is **self-referential** (lists `.framework-manifest.json` itself in `framework-managed` so `/update-framework` updates it).

**PM annotation 2 (per-file conflict default):** Add `default_action_on_conflict` field (per file or per category — your call). Worker 2 depends on this. Defaults: `CLAUDE.md` → `sibling`, KB templates (`KB_1`/`KB_7`/`KB_8`/`KB_9`) → `skip`, `.claude/commands/*` → `overwrite-with-backup` (framework owns these; project-level is source of truth).

**PM annotation 3 (KB_INDEX.md):** **framework-managed** (single-file exception inside `docs/`). Confirmed your reasoning.

**PM annotation 4 (LESSONS.md, smoke-tests-pending.md):** Stay **project-owned**. V2 per-file granularity solves the framework-wants-to-ship-new-lessons tension. For V1, FRAMEWORK_CHANGELOG nudges users via Migration Notes when a useful generic lesson is added.

**PM annotation 5 (UI:UX rename):** **Already done by PM 2026-05-07.** `docs/UI:UX KBs/` → `docs/UI-UX KBs/`. All 10 referencing files updated. Manifest must use new path.

**PM annotation 6 (cross-worker sync):** Worker 2's installer "WILL write" list and your manifest's `framework-managed` + `hybrid` + `installer_generated` lists must stay synchronized. Worker 2 reads YOUR manifest as source of truth — if Worker 2 finds a discrepancy, Worker 2 raises it as a `User action required:` block (do not unilaterally diverge).

**PM annotation 7 (excluded list):** Confirmed per your inventory: `README.md`, `CONTRIBUTING.md`, `LICENSE`, `AUDIT_FINDINGS.md`, `.gitignore`, `.vscode/`, `audits/` → `excluded`. `.env.example` and `.github/` → `framework-managed` per your R5/R6. `.claude/settings.json` → `hybrid` per R7. `.claude/memory/MEMORY.md` → `project-owned` per R8.

**PM annotation 8 (out of scope reminder):** Don't author README.md, FRAMEWORK_CHANGELOG.md (PM has authored 2026-05-07 at `/FRAMEWORK_CHANGELOG.md`), or CONTRIBUTING.md — PM tasks. Your scope: manifest only.

**Implementation handoff (Phase 7):** deliverable is `/Users/chrisparsons/Documents/GitHub/app-blueprint/.framework-manifest.json`. Use schema from your R17. Re-walk the actual repo state at implementation time (some files may have been added since audit). When done: edit Implementation log + Completion notes sections of THIS plan doc, then return brief summary.

## Implementation log

**2026-05-07 — Phase 7 implementation (Worker 1):**

1. Re-walked the repo (`ls -la` at root, `docs/`, `.claude/`, `.github/`, `.vscode/`) to confirm inventory at implementation time. Findings vs. audit:
   - Confirmed `docs/UI-UX KBs/` is the actual on-disk path (PM rename 2026-05-07 done).
   - Confirmed `FRAMEWORK_CHANGELOG.md` exists at **repo root** (not under `docs/`) — categorized in `framework-managed` accordingly.
   - Confirmed `.claude/commands/` has 23 command `.md` files (no `adopt.md` or `update-framework.md` yet — they are Workers 3 and 4's deliverables; the directory rule covers them once added).
   - Confirmed `.github/` has `pull_request_template.md` + `workflows/smoke-test-reminder.yml`.
   - Confirmed all 9 stack-reference KB folders present: AI, Auth, Bill, Form, Job, Obs, Supabase Structure, Test, UI-UX.
   - Confirmed `docs/` root files match audit: `KB_INDEX.md`, `MULTI_AGENT_WORKFLOW.md`, `AUDIT_FINDINGS.md`, `KB_1`/`KB_7`/`KB_8`/`KB_9`, `APP_CONCEPT.md`, `SCOPE.md`, `CHANGELOG.md`, `LESSONS.md`, `smoke-tests-pending.md`, `plans/`.

2. Authored `/Users/chrisparsons/Documents/GitHub/app-blueprint/.framework-manifest.json` per the schema in R17 + PM annotations.

3. Schema-level decisions:
   - **`default_action_on_conflict` representation:** chose **dual representation** — a per-category default in `_meta.category_defaults` AND a per-path override map at the top level (`default_action_on_conflict`). This makes Workers 2 and 4 unambiguous: per-path map wins, category default is the fallback. Per-path map is exhaustive for V1 (every entry across all 5 categories has an explicit value), which avoids any precedence ambiguity.
   - PM-mandated overrides applied:
     - `CLAUDE.md` → `sibling`
     - `docs/KB_1_Architecture.md`, `KB_7`, `KB_8`, `KB_9` → `skip`
     - `.claude/commands/` → `overwrite-with-backup`
   - **Self-referential:** `.framework-manifest.json` is listed in `framework-managed` with `overwrite-with-backup`.
   - **`canonical_url` upgraded** to full `https://github.com/Insynq/app-blueprint` (audit had bare `github.com/...`; full URL is unambiguous for WebFetch, and `github_owner`/`github_repo` are still provided explicitly for API construction).

4. Validated JSON parses cleanly via `python3 -c "import json; json.load(...)"`. Counts: 16 framework-managed, 6 hybrid, 7 project-owned, 1 installer_generated, 7 excluded; 30 per-path conflict-action entries.

**Lessons / observations for downstream workers (PM to relay if useful):**

- The `.claude/memory/MEMORY.md` precedence question raised in R17's footnote (file vs. directory) was resolved by simply NOT listing `.claude/memory/` as a directory in any category — only the file `.claude/memory/MEMORY.md` appears (in `project-owned`). Worker 2's installer should create the parent directory implicitly. Documented in `_meta.notes` as "more-specific entries override less-specific ones" for safety, but not exercised in V1.
- Per-path `default_action_on_conflict` map is exhaustive (covers all 30 entries). Worker 2 / Worker 4 do not need to fall back to category defaults in V1 — they can require an explicit entry for each path they touch. Category defaults remain in `_meta` as documentation for future categories or omitted entries.
- `docs/AUDIT_FINDINGS.md` is `excluded` (canonical-only). If PM later decides this is useful adopter context, recategorize to `framework-managed` and bump `manifest_schema_version` is **not** needed (categorization changes are within-schema).

## Completion notes

**Status: complete.**

- **Files created:** `/Users/chrisparsons/Documents/GitHub/app-blueprint/.framework-manifest.json` (single deliverable per scope).
- **Files inventoried:** 30 categorized entries (mixture of files and directories) across 5 categories. All on-disk paths re-verified at implementation time (post-audit).
- **Schema:** matches PM annotations 1–8 in full. `manifest_schema_version: "1"`, `version: "0.1.0"`, `name: "app-blueprint"`, full `canonical_url` + explicit `github_owner` / `github_repo`, 5 categories, self-referential, per-path `default_action_on_conflict` with PM-mandated values for CLAUDE.md/KBs/commands.
- **JSON validates** via `python3 json.load`. UTF-8, no BOM, LF endings (default for Write tool).
- **No constraints violated:** did not modify CLAUDE.md, MULTI_AGENT_WORKFLOW.md, FRAMEWORK_CHANGELOG.md, README.md, or any other existing file. Did not author README, FRAMEWORK_CHANGELOG, or CONTRIBUTING.

**Ambiguities raised for PM verification:**

1. **Conflict action vocabulary:** I used the verbs `skip`, `sibling`, `overwrite-with-backup` (matching PM annotation 2 wording). Worker 2 and Worker 4 must use these exact strings. If they prefer a different vocabulary (e.g., `installAsSibling`), this is the place to align before they start. (Recommend keep as-is — kebab-case strings parse identically and match the brainstorm prose.)
2. **`.framework-version` conflict default:** set to `skip` because it's installer-generated and `/update-framework` should rewrite it directly (not via the conflict-resolution flow). Worker 4 should use a dedicated update path for `.framework-version`, not the manifest's per-path action. Confirm with PM.
3. **`.github/` is `overwrite-with-backup` despite the `EDIT_ME` comment in the workflow YAML.** This is the simpler V1 behavior — adopters re-customize after each update. If PM wants `sibling` for `.github/workflows/smoke-test-reminder.yml` specifically (single-file override under a directory), say so and I'll add the override. Recommend keep as-is for V1.
4. **`.env.example` is `sibling` on conflict.** If an adopter has their own `.env.example`, the framework's incoming version is written as `.env.example.framework`. Alternative would be `skip` (don't touch existing). Chose `sibling` for parity with `CLAUDE.md`'s rationale (adopter sees both versions, can diff).

None of these are blockers — manifest is internally consistent and ready for Worker 2/4 consumption. PM can adjust conflict-action values without re-walking the inventory.
