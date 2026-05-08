# Worker 4 — `/update-framework` slash command

**Phase:** framework-distribution
**Status:** drafted

## Task

Author the `/update-framework` slash command at `.claude/commands/update-framework.md`. This command lets adopters pull canonical framework updates into their project with full visibility and control: see what changed, decide per file (skip / overwrite / assisted merge), preserve customizations, get clear migration notes for deprecated commands.

`/update-framework` runs in the user's PM context (or any Claude Code session); fetches canonical via GitHub release tarballs; diffs locally; presents a four-category manifest; resolves per file with explicit user approval.

## Files involved

- **CREATE:** `/.claude/commands/update-framework.md` (the slash command definition)
- **READ for command-file convention:** same set as Worker 3 (preflight, kickoff, ship, investigate)
- **READ for content:** `docs/plans/framework-distribution/phase-plan.md` (sections: Brainstorm findings → /update-framework; Sequencing → Worker 4) for full behavior spec
- **READ:** `.framework-manifest.json` (Worker 1's output) — defines what's framework-managed and thus eligible for update
- **READ:** `.framework-version` (set by Worker 2 at install) — tracks installed version

## Constraints / non-goals

### `/update-framework` behavior

- **Customization detection (V1 simplified):**
  - Read `.framework-version` to learn install-version
  - Fetch canonical at install-version AND target-version (both via GitHub release tarballs)
  - For each file in `framework-managed` + `hybrid` categories of the manifest:
    - Local matches canonical@install-version → not customized; safe to apply target version
    - Local differs from canonical@install-version → customized; surface to user for decision
- **Mechanism: GitHub release tarballs, NOT raw URLs.** Raw URLs are mutable (a GitHub repo takeover or rebase changes content silently). Release tarballs have immutable tags.
- **Four-category presentation (user-centric):**
  - 🟥 **FILES YOU CUSTOMIZED — CONFLICTS POSSIBLE** (require decision)
  - 🟢 **FILES UNCHANGED LOCALLY — SAFE TO APPLY** (auto-apply with backup)
  - 🟡 **NEW FROM CANONICAL — CONSIDER** (added by canonical, no conflict)
  - 🔵 **DEPRECATED — MIGRATION NOTES** (removed by canonical, with migration notes from FRAMEWORK_CHANGELOG)
- **Per-conflict options:** skip (keep local, may diverge from future updates), overwrite (with backup), assisted merge.
- **Concrete merge algorithm — specify exactly during your audit (Phase 5):**
  - Suggested starting point: if diff < 10 lines, draft inline merge + ask approve. If >= 10 lines, offer skip/overwrite/merge per file.
  - Backup destination: `.framework-backup/[file]@[old-version]` before any write.
  - Define what "diff" means: lines, percentage, file size threshold? Worker should propose concrete numbers based on what's reasonable.
- **Removed-file handling:** if canonical@target-version no longer has a file that exists locally, present in 🔵 with migration notes pulled from FRAMEWORK_CHANGELOG. User chooses keep / remove / leave-as-deprecation-shim.
- **Update `.framework-version`** after success — bump to target version, record `last_updated_at` timestamp.
- **Always require user approval per category at minimum.** No silent overwrites.

### Network / security

- Fetch from GitHub releases API (`/repos/Insynq/app-blueprint/releases/tags/v0.X.Y`)
- Verify the canonical URL matches what's in `.framework-manifest.json` before fetching (catch URL drift)
- Fail loudly if fetch fails — don't silently use stale local cache

### Out of scope

- **Don't auto-update silently** — always require user approval at four-category review, then per-file decisions for customized files.
- **Don't fetch outside the manifest's `framework-managed` + `hybrid` lists** — `project-owned` files are never touched.
- **Don't handle private-repo auth** (V2)
- **Don't handle version drift across multiple projects** (V2 — `/check-framework-versions`)
- **Don't sign or verify package signatures** (V2)
- **Don't auto-resolve deeply complex merges** — fall back to "this is hard, here's the conflict, you decide" when in doubt.

## Granular audit

Audit run 2026-05-07. Verdict: **proceed with changes** — the holistic plan and the Worker 1/2 audits give a solid foundation, but the merge algorithm, GitHub API mechanics, and category-presentation UX need concrete pinning. Findings numbered for cross-reference in PM annotations.

### 1. Command-file structure

- **Frontmatter / argument shape.** Reviewed sample commands (`brainstorm.md`, `kickoff.md`, `ship.md`, `update-kb.md`, `audit-code.md`, `preflight.md`). Two conventions in current repo: (a) `description:` only, no `arguments` block (kickoff, preflight) — pure conversational commands; (b) `description:` + `arguments:` array with named optional/required args (audit-code, ship, update-kb, brainstorm). Worker 4's command needs **arguments**, so use convention (b).
- **Recommended frontmatter:**
  ```yaml
  ---
  description: Pull canonical app-blueprint updates into this project, with per-file review and assisted merge for customizations.
  arguments:
    - name: target-version
      description: Specific version tag to update to (e.g., "0.2.0"). Default — latest release.
      required: false
    - name: dry-run
      description: Preview the four-category report without writing anything. Pass "true" or "1".
      required: false
    - name: yes
      description: Auto-accept defaults (skip on conflict, apply safe categories). For non-TTY use.
      required: false
  ---
  ```
- **Subagent vs. user session.** Reviewed five commands' patterns. Three patterns exist:
  - **Conversational, runs in user's session** (kickoff, preflight, update-kb): no subagent spawn; instructions tell Claude what to do directly.
  - **Spawns single subagent** (audit-code → Explore type, brainstorm → general-purpose, ship → general-purpose).
  - **Spawns multiple parallel subagents** (audit-full per its description; not read here).
  - **Recommendation: runs in user's session, no subagent spawn.** Reasons: (1) `/update-framework` requires extensive user interaction (per-file approve/skip/merge prompts) — a subagent's `Task` return value is one-shot, and shuttling many prompts through is awkward; (2) the user *wants* visibility into the diff and the decisions; subagent isolation hides that; (3) `kickoff.md` is the closest analog — long-form interactive workflow, runs in main session.
- **Bug to avoid: the `{{#if}}` Handlebars syntax in `audit-code.md` lines 27-28.** Claude Code does not interpret Mustache/Handlebars conditionals — they print literally if not stripped, or the worker has to reason about them as plain text. Use plain English instead: *"If the user supplied a target-version, use it; otherwise default to latest release."* Confirmed pattern: `kickoff.md`, `preflight.md`, `ship.md` all use plain conditional language, no templating syntax.
- **`$ARGUMENTS.<name>` interpolation** appears in `audit-code.md`, `brainstorm.md`, `ship.md`, `update-kb.md`. **Confirmed working** (used by current shipping commands). Worker 4 uses the same syntax: `$ARGUMENTS.target-version`, etc.

### 2. GitHub Releases API specifics

Working against `Insynq/app-blueprint` (public; per phase-plan security assumptions).

- **Endpoint set (V1):**
  1. **Get latest release** (when no `target-version` arg): `GET https://api.github.com/repos/Insynq/app-blueprint/releases/latest` → returns `tag_name` (e.g., `"v0.2.0"`), `tarball_url`, `body` (release notes), `published_at`.
  2. **Get release by tag** (when target-version specified or for canonical@install-version): `GET https://api.github.com/repos/Insynq/app-blueprint/releases/tags/{tag}` where `{tag}` is `v` + version (e.g., `v0.1.0`).
  3. **Tarball download:** the `tarball_url` field on a release object resolves to `https://api.github.com/repos/Insynq/app-blueprint/tarball/{tag}` which 302-redirects to `https://codeload.github.com/Insynq/app-blueprint/legacy.tar.gz/refs/tags/{tag}`. **Use `tarball_url` from the API response, not a hand-constructed URL** — it accommodates renames and avoids drift.
  4. **Tarball SHA verification:** GitHub Releases API returns no native SHA256 for source tarballs (the SHAs in the assets array are for *uploaded* assets, not the auto-generated source tarball). For V1, **read `tarball_sha256` from `.framework-version` for the install-version comparison**, and **compute fresh SHA256 of newly-downloaded tarball** for both install-version and target-version, printing both for the user. No verification against a canonical pinned hash — that's V2 (signed-package work).
- **Authentication / rate limit:**
  - V1 uses **unauthenticated** API calls. Public endpoints work fine.
  - **Unauthenticated GitHub API rate limit: 60 requests/hour per IP.** A single `/update-framework` invocation makes ~3 API calls (latest release, install-version release, target-version release if different) plus 2 tarball downloads (which hit `codeload.github.com`, not `api.github.com` — separate rate limit, much higher and rarely a concern).
  - **Survivable?** Yes — 60/hour means 20 sequential `/update-framework` runs/hour before throttling. Far above what a real adopter does.
  - **Edge case:** shared-IP environments (corporate NAT, CI runners, VPNs) can exhaust the 60/hour fast. **Mitigation:** if API returns `403` with header `X-RateLimit-Remaining: 0`, surface clearly: *"GitHub API rate-limited (60 req/hour for unauthenticated). Wait <reset-minutes> minutes, or set `GITHUB_TOKEN` env var to raise limit to 5000/hour."* Don't fail silently. Reading `GITHUB_TOKEN` from env if present is a 3-line addition — recommended for V1; doesn't compromise the public-repo posture.
- **Tarball extraction approach:**
  - **Worker 4 runs as a slash command in Claude Code, NOT as Node.js code in a published package.** Claude Code doesn't bundle a `tar` library. Two real options:
    - **Option A — Shell out to `tar`** via the Bash tool: `curl -L "$tarball_url" | tar -xz -C "$staging_dir"`. Pros: ubiquitous on macOS/Linux, no dependency. Cons: Windows users without WSL or Git-Bash lack `tar`. **However:** Claude Code itself runs on macOS/Linux/Windows-with-WSL, and the framework's adopters who run slash commands are all in Claude Code anyway. Survives.
    - **Option B — Use Claude Code's WebFetch + manual extraction.** WebFetch returns text content but tarballs are binary — WebFetch will mangle them. **Not viable.**
  - **Recommendation: Option A — shell out to `tar` via Bash tool.** Concrete pattern: download with `curl -L -o /tmp/app-blueprint-v0.X.Y.tar.gz "$tarball_url"`, then `tar -xzf /tmp/app-blueprint-v0.X.Y.tar.gz -C /tmp/ab-update-staging-<version>/`. Document Windows-without-WSL as **deferred to V2**.
- **Path-traversal protections during extraction:**
  - GitHub source tarballs use a top-level prefix like `Insynq-app-blueprint-<short-sha>/`. Strip it: `tar -xzf ... --strip-components=1 -C <target>` puts file `Insynq-app-blueprint-abc/CLAUDE.md` at `<target>/CLAUDE.md`.
  - GNU `tar` rejects `..` traversal by default (since GNU tar 1.32, ~2019); BSD `tar` (macOS) similarly defends with `--no-absolute-paths` (default in modern versions). **Belt-and-suspenders: pass `--no-absolute-paths` and verify no extracted path exits the staging dir** before any file is touched outside staging. Concrete check: after extraction, `find <staging>/ -type l -exec readlink {} \;` to inspect symlinks for traversal; reject any symlink whose target leaves the staging tree.
  - **Limit: don't extract from a tarball not from `codeload.github.com` or `api.github.com`** — verify the final URL after redirect resolution. (Worker 2's installer audit calls this out for installs; same applies here.)

### 3. Concrete merge algorithm

Plan suggests: <10 lines diff = inline merge; >=10 lines = per-file skip/overwrite/merge. Pinning down:

- **What "lines of diff" means:**
  - Use `diff -u local target` (unified diff) and **count only `+`/`-` lines, not context lines (` `) or hunk headers (`@@`).** Equivalent to `diff -u | grep -E '^[+-]' | grep -vE '^(\+\+\+|---) ' | wc -l`.
  - Why not `diff --stat`? `--stat` shows insertions+deletions but is a different format and slower to parse.
  - Why include both `+` and `-`? A line "changed" in a diff appears as one `-` and one `+`, so a single-line modification counts as 2 in this metric. This is fine — the threshold is calibrated against this counting.
- **Threshold tuning:** plan says 10. Re-evaluating against likely real diffs:
  - For a typical `.claude/commands/*.md` file (50-300 lines, prose-heavy), a 10-line diff is roughly ~3-5% of file content. That feels right for "small enough to merge inline."
  - For a small file (e.g., `KB_8_Current_State.md` is 13 lines), 10-line diff is most of the file. The percentage-of-file metric matters here.
  - **Recommendation: dual threshold — `< 10 absolute diff lines AND < 30% of larger-file size`**, both must hold for inline merge. If the file is tiny enough that 10 lines is a large fraction, fall through to per-file resolution.
  - **Why 30%:** below 30%, the diff is plausibly an additive change (one new section). Above 30%, the file's been substantially rewritten on at least one side — a manual three-way decision is more honest.
- **Inline merge UX (when threshold passes):**
  - Print a unified diff in the slash-command output with `🟥`/`🟢` color cues:
    ```
    ASSISTED MERGE: docs/KB_7_UI_Patterns.md
    Diff: 6 lines (well under the inline-merge threshold)

    Showing local→target diff:
    @@ -42,3 +42,7 @@
       ## Component Conventions
    +  ### Card layout
    +  Use Card from @/components/ui/card. Variants: default, ghost, outline.
       ### Form inputs
       ...

    Proposed merge: take all canonical changes (yours had no edits in this region).
    Approve? [a/e/s]
      [a] approve — apply the diff
      [e] edit — open in $EDITOR before applying (you write the merge)
      [s] skip — keep local
    ```
  - **The merge IS the diff applied to local** (one-sided patch, since Worker 4 already verified `local == canonical@install-version` for the unchanged-locally case, OR is showing just the canonical-side delta when local has its own changes — see below).
  - **For `[e] edit`:** drop the user into `$EDITOR` (or Claude Code's editor) with the merged file. After save, re-diff and re-prompt for approval. **For Claude Code specifically:** because `/update-framework` runs in Claude Code, "edit" means write the proposed merge to a file and tell the user *"Edit the file at `<staging>/<merged-path>`, then type 'continue' to apply."* Adopt the same pattern as the installer's interactive prompts (Worker 2).
  - **Markdown rendering:** Claude Code renders markdown; use code-fenced unified-diff in output blocks (` ```diff `) for syntax highlighting.
- **Per-file (when threshold fails — diff is too big for inline):**
  - Same skip / overwrite / merge / diff prompt format as Worker 2's installer (Finding 3 of `worker-2-installer.md`):
    ```
    CONFLICT: docs/KB_7_UI_Patterns.md (152 lines local, 187 lines target, 47-line diff)
      [s] skip — keep local; this file diverges from canonical going forward (default)
      [o] overwrite — replace with canonical (back up to .framework-backup/)
      [m] assisted merge — three-way merge: drop me into staging file with conflict markers
      [d] diff — show full unified diff before deciding
    Choose [s/o/m/d]:
    ```
- **What "merge" actually does (the honest version):**
  - Plan says "draft merge inline" for small diffs but is vague about big-diff merges. The honest answer for V1: **for big-diff cases, "merge" is a three-way merge with conflict markers**, not an automatic AI-generated merge attempt. Reasons:
    - Three-way merge needs three inputs: `canonical@install-version` (the common ancestor), `local` (theirs), `canonical@target-version` (ours-to-pull-in). Worker 4 already has all three.
    - Use `git merge-file` (available everywhere git is) for the merge: `git merge-file -p local-file install-version-file target-version-file > merged-with-markers`. Outputs a file with `<<<<<<< local`, `=======`, `>>>>>>> canonical@target` conflict markers.
    - Write the merge result to `.framework-backup/<file>.merging` (NOT directly into the live tree), tell the user *"Wrote merge with conflict markers to `.framework-backup/<file>.merging`. Resolve conflicts there, then type 'continue' or 'cancel'."* On `continue`: copy resolved file into place, also back up the original to `.framework-backup/<file>@<install-version>`.
  - **Don't attempt LLM-generated merges in V1.** The risk surface (hallucinated "fixes" that subtly change semantics) is too high for an unattended-style command. V2 can offer "AI-assisted merge" as opt-in.
- **Backup destination:** `.framework-backup/<full-relative-path>@<install-version>` (e.g., `.framework-backup/CLAUDE.md@0.1.0`) — matches plan-doc spec. Backups created **before any write**, never overwritten on subsequent updates. Add timestamp suffix if file already exists: `.framework-backup/CLAUDE.md@0.1.0.20260507T183214Z`.

### 4. `.framework-version` consumption

Per Worker 2's audit (Finding 6 final shape), the file contains:
```json
{
  "version": "0.1.0",
  "installed_at": "2026-05-07T18:32:14Z",
  "installed_method": "npx",
  "canonical_url": "github.com/Insynq/app-blueprint",
  "installed_from": "https://github.com/Insynq/app-blueprint/releases/download/v0.1.0/app-blueprint-v0.1.0.tar.gz",
  "tarball_sha256": "abcdef..."
}
```

**Fields Worker 4 reads:**
- `version` — the install-version anchor for diff comparison. **Required.**
- `canonical_url` — to construct GitHub API endpoint. Parse `github.com/{owner}/{repo}` to `Insynq` + `app-blueprint`. **Required.**
- `installed_at` — display-only ("you installed v0.1.0 on 2026-05-07; updating to v0.2.0").
- `installed_from` — display-only / sanity check (compare host of new tarball URL to confirm same canonical).
- `tarball_sha256` — display-only ("install-version tarball SHA256 was X; if you re-fetch v0.1.0 it should still match"). For V1, no enforcement, but a useful diagnostic in the report.
- `installed_method` — read for diagnostic only; doesn't gate behavior.

**Fields Worker 4 must handle as missing/null** (per Worker 2's audit: "older versions may omit"):
- All of the above except `version` and `installed_at` (those existed from v0.1.0 forward per Worker 2). If `canonical_url` is missing, fall back to a hardcoded constant in the command file matching the canonical the framework was distributed with — and warn the user.

**Fields Worker 4 writes after a successful update:**
- Updates `version` → target version.
- Adds new fields:
  - `last_updated_at` — ISO-8601 timestamp of update.
  - `previous_version` — what `version` was before the update (one-deep history; full history is git).
  - `update_method` — `"slash-command"` (forward-compat with future automated updaters).
  - `update_from_tarball_sha256` — SHA256 of the target-version tarball just applied.
  - `update_log` — array of file-action records: `[{path, action: "skipped|overwrote|merged|kept-customized|new", reason}]`. Capped at the most recent update only — full history is in git.
- Final shape after first update:
  ```json
  {
    "version": "0.2.0",
    "installed_at": "2026-05-07T18:32:14Z",
    "installed_method": "npx",
    "canonical_url": "github.com/Insynq/app-blueprint",
    "installed_from": "https://github.com/Insynq/app-blueprint/releases/download/v0.1.0/app-blueprint-v0.1.0.tar.gz",
    "tarball_sha256": "abcdef...",
    "previous_version": "0.1.0",
    "last_updated_at": "2026-06-12T14:09:33Z",
    "update_method": "slash-command",
    "update_from_tarball_sha256": "fedcba...",
    "update_log": [
      {"path": ".claude/commands/audit-code.md", "action": "overwrote", "reason": "local matches install-version, applied target"},
      {"path": "CLAUDE.md", "action": "kept-customized", "reason": "user chose [s] skip on conflict"},
      ...
    ]
  }
  ```

### 5. Detecting customizations — edge cases

The plan's approach: fetch canonical@install-version + canonical@target-version, compare local against canonical@install-version. Audit:

- **F5a. Canonical@install-version no longer available.**
  - GitHub release deletion is rare but possible (and force-pushed tags are recoverable but unusual).
  - **Detection:** API returns 404 on `GET /repos/{owner}/{repo}/releases/tags/{install-version-tag}`.
  - **Fallback chain:**
    1. Try the GitHub Releases API.
    2. Try `GET /repos/{owner}/{repo}/git/refs/tags/{tag}` (lightweight tag info — even if the *release* is deleted, the *tag* often persists).
    3. Try the tarball at the deterministic URL `https://codeload.github.com/{owner}/{repo}/legacy.tar.gz/refs/tags/{tag}`.
    4. If all three fail: surface explicitly: *"Cannot find install-version v0.1.0 at canonical. The release may have been deleted, or the tag may have been moved. Falling back to **degraded mode**: every framework-managed file will be treated as 'customized' (i.e., requires per-file decision). This is conservative — when in doubt, the user is asked. Recommend filing an issue at github.com/Insynq/app-blueprint/issues."*
  - **Degraded mode behavior:** every file in `framework-managed` and `hybrid` categories goes into the 🟥 bucket; user clicks through each. Tedious but safe.
- **F5b. Local matches NEITHER install-version nor target-version (intermediate state from a partial update).**
  - Cause: previous `/update-framework` was interrupted mid-write; some files updated, some didn't, `.framework-version` didn't get bumped.
  - **Detection:** `local != canonical@install-version` AND `local != canonical@target-version`. Plan's algorithm classifies this as "customized" — but it's actually "partial-update artifact."
  - **Disambiguation:** check if `.framework-backup/` directory exists with files matching the install-version pattern. If yes, the user has prior-update artifacts on disk → suggest *"Found `.framework-backup/` from a previous update. Last update may have been interrupted. Inspect that directory before proceeding."*
  - **For the file in question:** treat as customized (force user decision). Don't try to detect "this file was actually updated to v0.1.5 in a prior run" — that requires tracking inferred-version per file, which we explicitly deferred to V2 (per Worker 1 R9 about per-file SHAs).
  - **Atomicity (Finding 9 below) prevents most of this** going forward.
- **F5c. Whitespace-only diffs / line-ending differences.**
  - **Risk:** Windows users with `core.autocrlf=true` will see all framework files diff as "customized" because LF→CRLF on checkout flips every line.
  - **Mitigation:**
    - Pre-flight check: read `local` and `canonical@install-version` byte-for-byte. If `bytes(local) != bytes(canonical@install-version)`, **also** compute `bytes(local.lstrip().rstrip().replace('\r\n', '\n')) == bytes(canonical@install-version.lstrip().rstrip().replace('\r\n', '\n'))`. If yes → categorize as **🟢 unchanged locally** (whitespace-only) and apply target version; surface in the report as *"docs/KB_1_Architecture.md — line-ending diff only, applied target."*
    - Don't ignore *all* whitespace — that loses meaningful indentation diffs in code. Just ignore line-ending and trailing-whitespace differences.
  - **Implementation:** small helper `normalize(s) = s.replace('\r\n', '\n').rstrip()`. Compare normalized.
- **F5d. BOM (byte-order mark) differences.** Some Windows editors add UTF-8 BOM. Normalize: strip leading `\xEF\xBB\xBF` if present in either side before comparing. Same bucket as F5c.
- **F5e. File present locally but not in install-version manifest.** (E.g., user ran a non-standard installer or hand-copied files.) Worker 4 must skip these — they're not framework-managed by definition. Surface in a "uncategorized files" footer for transparency: *"Found N files in framework-managed paths that aren't in canonical@install-version: <list>. Left untouched."*

### 6. Four-category presentation — UX details

- **Single review screen, then per-file walkthrough for 🟥 only.** Pattern matches Worker 2's installer (Finding 3) — top-level inventory with counts, then prompts only for the items requiring decisions.
- **Top-level review screen format:**
  ```
  /update-framework — app-blueprint v0.1.0 → v0.2.0
  Canonical: github.com/Insynq/app-blueprint
  Install-version tarball SHA256: abcdef... (verified from .framework-version)
  Target-version tarball SHA256: fedcba... (computed from fresh download)

  🟢 SAFE TO APPLY — 18 files (you have not customized; framework will overwrite with backup)
    .claude/commands/audit-code.md
    .claude/commands/brainstorm.md
    [...16 more — collapse with `[v] view list`]

  🟥 CONFLICTS — 3 files (you customized; require your decision)
    CLAUDE.md          — 23 lines diff (you), 14 lines diff (canonical 0.1→0.2), threshold-fail → per-file
    docs/KB_7_UI_Patterns.md  — 6 lines diff (you), 4 lines diff (canonical), threshold-pass → inline merge offered
    .claude/settings.json   — 8 lines diff (you), 0 lines diff (canonical), threshold-pass → no canonical change, kept

  🟡 NEW FROM CANONICAL — 2 files (added in v0.2.0)
    .claude/commands/orchestrate-v2.md
    docs/AI KBs/AI_KB_05_Agent_Patterns.md

  🔵 DEPRECATED IN v0.2.0 — 1 file (canonical removed; you still have local)
    .claude/commands/old-debug.md  — see migration note: → /debug supersedes /old-debug

  📋 SUMMARY: 21 auto-apply | 3 require decision | 2 to add | 1 deprecated | 0 errors

  Continue to per-file decisions? [y/N]
  ```
- **🟥 detail format (during walkthrough):**
  - Per Finding 3, exact prompt format. Always include a `[d] diff` option.
  - Per-conflict prompt is one at a time, sequential. Don't batch.
- **🟢 detail (during walkthrough, after 🟥 is resolved):**
  - Single confirmation: *"Apply 18 files in 🟢? Each will be backed up to `.framework-backup/<path>@0.1.0`. [Y/n]"* → batch-apply.
  - **No per-file prompts in 🟢.** That's the point of the category.
- **🟡 detail:**
  - For each new file: print path + first 5 lines + size. Single prompt: *"Add `<path>`? [y/n/d=show full content]"*. Default `y`.
  - User opts out of any new file independently.
- **🔵 detail (DEPRECATED):**
  - Per file: print migration note from `FRAMEWORK_CHANGELOG.md` (see Finding 6c below for format).
  - Three options:
    - **`[r] remove`** — delete local file (back up to `.framework-backup/`).
    - **`[k] keep`** — leave as-is. The next update will surface this again (with the same deprecation note) since it's still missing from canonical. Document as *"will continue to surface in 🔵 on each update until removed or shimmed."*
    - **`[s] shim`** — replace local file with a deprecation shim that auto-redirects (see Finding 7 below).
  - Default: `[s] shim` for known one-step renames; `[k] keep` if there's no successor mapping.
- **🔵 migration-notes format in `FRAMEWORK_CHANGELOG.md`** (PM authors this file; Worker 4 reads it). Spec for the format Worker 4 expects:
  ```markdown
  ## v0.2.0 — 2026-08-15

  ### Removed
  - `.claude/commands/old-debug.md` — superseded by `/debug` (renamed; same behavior, clearer name).
    - **Auto-shim available:** yes
    - **Migration note:** Update any references in your custom commands or docs from `/old-debug` to `/debug`. The shim will print a deprecation warning and redirect for two versions (v0.2.0, v0.3.0), then be removed in v0.4.0.
  - `docs/Old KBs/Foo_KB.md` — content folded into `docs/AI KBs/AI_KB_03_RAG.md`.
    - **Auto-shim available:** no (content was merged, not renamed).
    - **Migration note:** No action required. The Foo content is now in AI_KB_03 §RAG.
  ```
  - Worker 4 parses this YAML-ish markdown by:
    1. Find the heading matching `## v<target-version>` in `FRAMEWORK_CHANGELOG.md` (or fetch the file fresh from canonical@target-version).
    2. Find the `### Removed` subsection.
    3. For each list item, extract: file-path (between backticks), successor-name (after "superseded by" or similar), `Auto-shim available: yes|no`, `Migration note:` body.
    4. Wire into the 🔵 prompt.
  - **If `FRAMEWORK_CHANGELOG.md` is missing or doesn't have a `## v<target-version>` section:** surface deprecated files anyway, but with a generic note: *"Canonical no longer ships this file. No migration note available — recommend keep-as-is for now."* Don't fail the update.

### 7. Removed-file handling — deprecation shim spec

Plan: "shim with auto-redirect." Pinning down:

- **Opt-in vs. auto-installed:** opt-in. Default for the 🔵 prompt is `[k] keep` if no successor is defined; `[s] shim` is the recommended choice when a successor exists (Worker 4 reads `Auto-shim available: yes` from FRAMEWORK_CHANGELOG to enable the option).
- **Shim content (markdown command files only — `.claude/commands/*.md`):**
  ```markdown
  ---
  description: DEPRECATED — superseded by /<successor>. Will be removed in v<future-version>.
  ---

  # /<old-name> — Deprecated

  This command was renamed to `/<successor>` in v<deprecated-in-version>.

  **Action: invoke `/<successor>` instead.**

  Run `/<successor>` now and the new command will execute. This shim was generated by `/update-framework` at <timestamp>.

  ## Why this shim exists

  When `/update-framework` pulled in v<target-version>, the old name was no longer in canonical. Auto-shim was opted in.
  This shim will be removed automatically in v<future-version>. After that, `/<old-name>` will simply not exist.
  ```
- **Auto-redirect mechanism:** in Claude Code, slash commands are markdown files Claude reads. The shim *can't* programmatically invoke `/<successor>` (no such mechanism). What the shim does is **tell the model to invoke `/<successor>`** as the first action. Concrete: the shim's body should read like *"This command is deprecated. Stop. Run `/<successor>` instead — read `.claude/commands/<successor>.md` and follow those instructions."* — Claude follows that instruction.
- **Shim lifetime:** **two versions** (the version that introduced the rename, and the next minor version). E.g., `/old-debug` removed in v0.2.0 → shim ships in v0.2.0 and v0.3.0 → fully removed in v0.4.0. Specify in `FRAMEWORK_CHANGELOG.md` per-deprecation as `Shim lifetime: v0.2.0–v0.3.0`. Worker 4 reads this and prints a heads-up when shim auto-removal is imminent.
- **Shim removal trigger:** when `/update-framework` runs, scan `.claude/commands/` for files matching the shim header pattern (description starts with `DEPRECATED —`). For each, parse the "Will be removed in v<future-version>" line; if `target-version >= future-version`, automatically remove the shim (after backup to `.framework-backup/`). Surface in the report under 🔵: *"Removing expired shim: `.claude/commands/old-debug.md` (was scheduled for removal in v0.4.0; you're updating to v0.4.0)."*
- **Non-command shims (e.g., docs):** **don't try.** A shim only makes sense for an executable that needs to redirect. For a removed doc, just remove or keep — no shim option. The 🔵 prompt for non-command files only offers `[r] remove` and `[k] keep`.

### 8. Manifest changes between versions

If `.framework-manifest.json` changes between install-version and target-version:

- **F8a. File category change** (e.g., `.claude/settings.json` was `framework-managed` in v0.1, now `hybrid` in v0.2). Worker 4 must:
  1. **Read both manifests** — install-version manifest (from canonical@install-version tarball) and target-version manifest (from canonical@target-version tarball).
  2. For each file present in both, compute the local-vs-install diff using the **install-version's category logic**, then categorize the file under the **target-version's category** for presentation.
  3. **If the category changed in a way that demands user attention** — e.g., `hybrid` → `project-owned` (framework gives up ownership) — surface explicitly in the report: *"Note: `.claude/settings.json` is now project-owned. Your local copy is preserved; this is the last update that touched it. Future updates will leave it alone."*
  4. **If category changed `project-owned` → `framework-managed`** (framework reclaims): treat as customization — force user decision. *"Note: `docs/foo.md` is now framework-managed. Local content preserved as customization; canonical version offered as overwrite."*
- **F8b. New top-level keys / schema changes in the manifest itself.** Per Worker 1's R9, manifest has a `manifest_schema_version` field. Worker 4 must:
  1. Read both manifests' schema versions.
  2. If they differ, log: *"Manifest schema bumped from v<X> to v<Y> in this update. Worker 4 supports schemas up to v<N>. Update <if Y > N> recommended before proceeding."*
  3. If `target.manifest_schema_version > Worker 4's known max`: refuse with *"Target version's manifest is schema v<Y>; this `/update-framework` understands up to v<N>. Pull the latest framework manifest support before updating, or update step-by-step through intermediate versions."*
  4. **For V1 schema_version=1**, Worker 4 only supports schema 1. Forward compat is V2.
- **F8c. Manifest itself is one of the files being updated.** Per Worker 1 R13, the manifest is in its own `framework-managed` list — so the same diff/decision flow applies. **Special case:** apply the manifest update **first**, before processing any other file. Reason: the rest of the per-file processing reads the new categories. Order: (1) update `.framework-manifest.json` if changed, (2) reload categories, (3) process all other files. Worker 4 must NOT use the install-version manifest for downstream decisions once it's applied target's manifest.
- **F8d. `installer_generated` files.** Per Worker 1 R14, `.framework-version` is in this list — never compared to canonical. Worker 4 reads it for input but writes it as the **last** action of the update (atomicity — see Finding 9).

### 9. Atomicity

If `/update-framework` is interrupted partway:

- **Worker 2's installer pattern: staging directory at `./.framework-install-staging/`, move-on-success, leave-on-interrupt.** Adopt the same pattern but rename: `./.framework-update-staging/` so a concurrent install vs. update doesn't collide.
- **Atomicity sequence:**
  1. **Inventory phase** (read-only, no writes): fetch tarballs, compute diffs, build report. Atomic on its own — Ctrl+C kills with no side effects.
  2. **User-decision phase** (interactive, no writes): walk through 🟥 prompts. Atomic — decisions are held in memory until `[continue]` confirmation.
  3. **Backup phase**: copy every file that's about to change to `.framework-backup/<path>@<install-version>`. Atomic per-file (single `cp`); collectively, if interrupted, partial backups exist but no files have been changed yet — safe to restart.
  4. **Apply phase**: per-file rename from staging → final location (per Worker 2 Finding 4 — per-file rename, not directory move, for NTFS-safety).
  5. **`.framework-version` write phase**: write updated `.framework-version` last. **This is the atomic commit point.** If everything else succeeds but `.framework-version` write fails, the apply already happened — surface as *"Apply succeeded but `.framework-version` write failed. Manually update `.framework-version` to version `0.2.0` to clear this state."*
- **Interrupt detection:**
  - SIGINT handler: print *"Interrupted at <phase>. <Recovery action>."*
    - During inventory: nothing to recover, exit clean.
    - During backup: nothing applied yet, exit clean.
    - During apply: leave staging + `.framework-update-staging/.partial-apply` marker file. On next `/update-framework`, detect marker, offer *"Previous update interrupted. Resume? [y/n]"* — if yes, re-do apply phase from staging; if no, abort and instruct user to manually resolve.
    - During version-write: same as Finding 9 last-bullet above.
- **Lock file:** `.framework-update-staging/.lock` containing PID — same pattern as Worker 2 (Finding 4). Refuse concurrent runs.
- **Backup retention:** never auto-delete `.framework-backup/`. Surface in post-update message: *"Backups in `.framework-backup/` from this update are preserved indefinitely. Delete manually when you're confident the update is good."*
- **Resume behavior on partial-apply re-run:** check each file in `.framework-update-staging/` against its destination. If destination already matches staging (apply succeeded for that file), skip. If destination still matches install-version (apply didn't happen), proceed. If destination matches neither (manual edits between interruption and re-run): refuse with *"File `<path>` was modified between interruption and resume. Resolve manually before resuming."*

### 10. Anything else (edge cases / gaps)

- **F10a. Same-version "update" / no-op detection.** If `target-version == install-version`, Worker 4 should detect early and exit: *"Already at v0.1.0. Nothing to update."* Don't go through the inventory phase pointlessly. Implementation: 2 lines after parsing args.
- **F10b. Downgrade.** If `target-version < install-version` (semver compare), refuse with *"Refusing to downgrade from v0.2.0 to v0.1.0. If you really want to revert, manually delete `.framework-version` and re-run installer at the old version."* Reason: downgrade UX is a separate beast (un-applying customizations cleanly is hard); not in V1 scope.
- **F10c. Pre-release / non-semver tags.** GitHub allows tags like `v0.2.0-beta.1` or even non-semver like `nightly`. **Recommendation:** support semver-with-pre-release tags but warn — *"Updating to pre-release v0.2.0-beta.1 — release-notes recommendation: don't put pre-release on production projects."* Refuse non-semver tags entirely (`nightly`, etc.) — *"Tag <name> is not semver. /update-framework only supports semver-tagged releases."*
- **F10d. Empty target-version (latest fetch).** If `target-version` arg is empty, fetch `/releases/latest` and use its `tag_name`. Worker 4 should print *"Latest release: v0.2.0 (published 2026-08-15). Update to this version? [y/n]"* before proceeding — don't silently update to whatever the canonical pushed yesterday.
- **F10e. Network connectivity.** Same retry policy as Worker 2 (3x exponential backoff: 1s, 3s, 9s). If all retries fail: clear error, leave nothing modified.
- **F10f. User-global command shadows.** Worker 2's installer detects shadows in `~/.claude/commands/` at install. **Worker 4 should re-detect at update time** — if user added user-global commands since install, surface: *"Detected user-global commands at `~/.claude/commands/` that may shadow framework commands: <list>. These are not affected by `/update-framework`. Disable per the `commands_legacy/` pattern if interfering."*
- **F10g. The `docs/UI-UX KBs/` colon-in-path issue** (per Worker 1 F1 and Worker 2 Finding 8). If PM accepts the rename to `docs/UI-UX KBs/`, this rename happens in some target-version: Worker 4 will see `docs/UI-UX KBs/` listed locally as a directory tree and `docs/UI-UX KBs/` in target. **All files in the renamed directory are technically "deleted" (🔵) from canonical and "added" (🟡) under the new name** — this would be terrible UX. **Recommendation: PM authors a manual `## v0.2.0 — Renames` section in FRAMEWORK_CHANGELOG.md that Worker 4 detects and uses to coalesce rename pairs. Format:**
  ```markdown
  ### Renamed
  - `docs/UI-UX KBs/` → `docs/UI-UX KBs/` (cross-platform compatibility)
  ```
  Worker 4 reads this, treats matching pairs as "rename" rather than "delete + add" — single 🟢 entry: *"Renaming `docs/UI-UX KBs/` → `docs/UI-UX KBs/` (15 files). Backup of old path to `.framework-backup/`."* Per-file diffs still apply if the file content also changed in the same release.
- **F10h. The `audit-code.md` Handlebars bug propagating into `update-framework.md`.** Don't use `{{#if}}` syntax — proven not-working in Claude Code. Use plain conditional language. Already noted in Finding 1.
- **F10i. Telemetry / phone-home.** None in V1 (matches Worker 2 Finding 8). Surface to PM if V2 wants it.
- **F10j. The `--minimal` parallel.** Worker 3's `/adopt` has `--minimal`. `/update-framework` doesn't need an equivalent — the four-category filter already lets users skip categories.
- **F10k. What about `.claude/settings.json` as a hybrid file** (Worker 1 R7)? Adopters extend the framework's permission allowlist. On update, the **canonical settings.json may add new entries** the adopter wants. Default behavior on hybrid `.claude/settings.json`:
  - Three-way merge: add canonical's new entries, preserve adopter's added entries.
  - Implementation: parse both as JSON, take `union(local.permissions.allow, canonical.permissions.allow)`, write merged.
  - **For V1, special-case this:** call out `.claude/settings.json` in the docs as "merged automatically — appends new framework allowlist entries." Don't generalize to other JSON files yet (V2 work).
- **F10l. Per-file `default_action_on_conflict`** (Worker 2 R4). Worker 4 should honor the same field if Worker 1 adds it. E.g., `CLAUDE.md` → `default: sibling`; KB scaffolds → `default: skip`. Reduces user clicks for non-customized cases.

## Recommendations

Numbered for PM cross-reference. **Bold = blockers for Phase 7. Plain = quality-of-life.**

**R1. Use plain conditional language, not `{{#if}}` Handlebars syntax.** The bug in `audit-code.md` lines 27-28 must not propagate. Use *"If <condition>, do X."* prose. **Blocker.**

**R2. Use convention-(b) frontmatter** with `description:` + `arguments:` block. Recommended args: `target-version` (optional), `dry-run` (optional flag), `yes` (optional flag for non-TTY). **Blocker.**

**R3. Run in user's session, not subagent.** Long-form interactive workflow with many user decisions; subagent's one-shot `Task` return doesn't suit. Pattern matches `kickoff.md`. **Blocker.**

**R4. Use `tarball_url` from API response, not hand-constructed URL.** Survives canonical renames. Use `GITHUB_TOKEN` env var if present (raise rate limit from 60→5000/hr). **Blocker.**

**R5. Shell out to `tar` via Bash tool** for extraction. Document Windows-without-WSL as V2 limitation. Pass `--strip-components=1` and `--no-absolute-paths`; verify symlinks don't escape staging. **Blocker.**

**R6. Dual threshold for inline merge: < 10 absolute diff lines AND < 30% of larger-file size.** Both conditions must hold; otherwise per-file resolution. **Blocker.**

**R7. Three-way merge with conflict markers via `git merge-file`** (NOT LLM-generated merges). Write merged file to `.framework-backup/<path>.merging`, prompt user to resolve there, then `[continue]` to apply. **Blocker.**

**R8. Worker 4 must read 5 fields from `.framework-version` and gracefully handle missing optional fields.** Required: `version`, `canonical_url`. Optional: `installed_at`, `installed_from`, `tarball_sha256`, `installed_method`. **Blocker.**

**R9. Worker 4 must write 5 new fields after success:** `last_updated_at`, `previous_version`, `update_method`, `update_from_tarball_sha256`, `update_log` (capped to current update only). **Blocker.**

**R10. Customization detection must handle three edge cases gracefully:**
- F5a: Canonical@install-version unavailable → degraded mode (treat all as customized).
- F5b: Local matches neither install nor target → treat as customized; check `.framework-backup/` for partial-update artifacts.
- F5c–d: Whitespace / line-ending / BOM differences → normalize before compare; categorize as 🟢 with note.
**Blocker.**

**R11. Single review screen (top-level inventory with counts), then walkthrough only for 🟥 and per-decision categories.** Don't prompt per-file in 🟢. **Blocker.**

**R12. PM must author `FRAMEWORK_CHANGELOG.md` with structured sections** (`### Removed`, `### Renamed`, optional `Auto-shim available:` and `Shim lifetime:` per entry). Worker 4 parses this for migration notes and rename detection. **Blocker on PM (not Worker 4 alone).**

**R13. Deprecation shim is opt-in via `[s] shim` choice; lifetime is 2 versions** (announced in FRAMEWORK_CHANGELOG); auto-removed when target-version >= scheduled removal version. Shim content tells the model to invoke the successor. **Blocker.**

**R14. Manifest changes handled in three buckets:** category change (informational note), schema-version change (refuse if newer than supported), manifest-itself update (apply first before processing other files). **Blocker.**

**R15. Atomicity: same staging-directory pattern as Worker 2 installer**, renamed `.framework-update-staging/`. Five-phase apply (inventory → decisions → backup → apply → version-write); `.framework-version` write is the commit point. SIGINT handler + lock file + resume detection. **Blocker.**

**R16. Refuse downgrades; warn on pre-release tags; refuse non-semver tags.** Default to latest with confirmation prompt. Same-version → no-op exit. **Blocker.**

**R17. `.claude/settings.json` special-case three-way merge** (union of allow lists). Don't generalize to other JSON files in V1. **Blocker.**

**R18. Honor per-file `default_action_on_conflict` from manifest** (Worker 2 R4 dependency). **Quality-of-life — depends on Worker 1's manifest including it.**

**R19. Coalesce rename pairs from FRAMEWORK_CHANGELOG `### Renamed` section.** Especially relevant if PM accepts `docs/UI-UX KBs/` → `docs/UI-UX KBs/` rename in v0.2.0. Without this, every file in renamed dir shows as 🔵+🟡 (terrible UX). **Quality-of-life — but high-leverage if any rename ships in V1's first update.**

**R20. Display tarball SHA256s prominently** (install-version from `.framework-version`, target-version freshly computed) so power-users can verify. **Quality-of-life.**

**R21. Re-detect user-global command shadows at update time** and surface — install-time detection from Worker 2 may miss shadows the user added later. **Quality-of-life.**

**R22. PM open question: standardize on `npm run update-framework` as a launcher?** Adopters can run `/update-framework` only inside Claude Code. If PM wants a non-Claude-Code path, that's a separate `bin/update.js` in the npm package — defer to V2 (matches the npx-only-V1 stance from phase plan). **Surface for PM.**

**R23. PM open question: surface FRAMEWORK_CHANGELOG link in the post-update message.** Adopters will want to read what changed in the version they just pulled in. Current post-update spec doesn't include it. Add line: *"Full release notes: https://github.com/Insynq/app-blueprint/releases/tag/v<target-version>"*. **Quality-of-life — flag for PM.**

**R24. PM blocker check: ensure FRAMEWORK_CHANGELOG.md exists before v0.2.0 ships.** Worker 4 falls back gracefully if it's missing, but the 🔵 UX is much worse without migration notes. PM-integration task. **Blocker on PM.**

### Non-blocker / V2 carries

- LLM-assisted merge (only after V1's three-way-with-markers proves out).
- Auto-update notifications / webhook nudge.
- Downgrade support.
- Per-file SHA tracking (more accurate customization detection).
- Telemetry.
- Cross-project version drift (`/check-framework-versions`).
- Windows-without-WSL tar extraction.
- Generalized JSON-merge for hybrid JSON files (beyond `.claude/settings.json`).

## PM annotations

**Reconciled 2026-05-07.** Audit accepted with the following decisions:

**PM annotation 1 (dispatch mode):** Confirmed — `/update-framework` runs **inline** in user's session. Matches `/kickoff` and `/adopt`. Per-file approve/skip/merge prompts can't be shuttled through a subagent's one-shot return. User wants visibility into the diff.

**PM annotation 2 (frontmatter):** Adopt your F1 frontmatter — `description` + `target-version` (optional, default latest), `dry-run` (optional), `yes` (optional, non-TTY). `$ARGUMENTS.target-version` etc. work as designed.

**PM annotation 3 (Handlebars avoidance):** Confirmed banned. Plain English conditionals only.

**PM annotation 4 (GitHub Releases API):** Adopt your F2 endpoint set. V1 uses unauthenticated public-repo calls. Document rate-limit guidance (60 req/hour unauthenticated) — should be more than enough for typical update sessions but worth surfacing in error messages.

**PM annotation 5 (merge strategy — V1):** Use **`git merge-file`** for three-way merge (your R7). NOT LLM-generated merges in V1 — risk surface too large for unattended bulk-apply. V2 can add AI-assisted merge as opt-in. Concrete merge inputs: `local file` + `canonical@install-version` + `canonical@target-version`. Standard `git merge-file` semantics; fall back to per-file skip/overwrite if merge has conflicts.

**PM annotation 6 (Windows scope):** Shell out to `tar` is fine for V1 — Mac/Linux/WSL only. Windows-without-WSL deferred to V2 (added to phase-plan Non-blocking decisions). Document in `/update-framework`'s preflight output: *"Windows users without WSL not supported in V1."*

**PM annotation 7 (CRLF / whitespace normalization):** Adopt your R10. Critical for Windows users with `core.autocrlf=true` — without normalization every file shows as "customized."

**PM annotation 8 (FRAMEWORK_CHANGELOG.md format):** **PM has authored `/FRAMEWORK_CHANGELOG.md` 2026-05-07** with the parsing contract. Read it. The format you'll parse:
- Version sections: `## [X.Y.Z] - YYYY-MM-DD`
- Subsections within version: `### Added`, `### Changed`, `### Removed`, `### Renamed`, `### Migration Notes`
- Renamed entries: ``- `/old-name` → `/new-name` (parenthetical)`` — parser keys on `→` Unicode arrow
- Migration Notes: free-form prose, displayed verbatim to users

**PM annotation 9 (rename-pair coalescing):** Adopt your R19. Parser pulls renames from `### Renamed` section of changelog. For v0.1.0 there are no renames yet (initial release). For v0.2.0+, the parser must auto-detect `docs/UI:UX KBs/` → `docs/UI-UX KBs/` style renames in `### Renamed` and present as a single "rename" action, not separate 🔵 + 🟡 entries.

**PM annotation 10 (manifest-itself ordering):** Adopt your F8c — apply manifest update first, reload categories, then process other files. This makes the manifest authoritative across the update.

**PM annotation 11 (downgrade refusal):** Adopt your R16 — refuse downgrade by default, warn for pre-release tags. `--allow-downgrade` flag for the rare legitimate case (rolling back a broken release).

**PM annotation 12 (`.framework-version` schema sync):** Worker 2's expanded schema (`tarball_sha256`, `installed_method`, `canonical_url`) — your update logic reads + writes these. After successful update, write back: bump `version` to target, update `tarball_sha256`, set `last_updated_at`, leave `installed_at` untouched.

**PM annotation 13 (cross-worker dependency on Worker 1's manifest):** Manifest is the source of truth for what's framework-managed and thus eligible for update. If you find files in canonical that are NOT in the manifest, raise as `User action required:` — do not update them silently.

**PM annotation 14 (dogfood blocker — IMPORTANT):** PM dogfood install will be on a real existing project. Your implementation MUST handle the case where install-version is v0.1.0 (the only version that exists) and target-version is also v0.1.0 — no-op behavior, exit cleanly with informative message ("already at latest"). This is the most likely first invocation in dogfood.

**Implementation handoff (Phase 7):** deliverable is `/Users/chrisparsons/Documents/GitHub/app-blueprint/.claude/commands/update-framework.md`. When done: edit Implementation log + Completion notes of THIS plan doc, return brief summary.

## Implementation log

**Worker 4 — Phase 7 implementation, 2026-05-07.**

Authored `.claude/commands/update-framework.md` as a single inline conversational command, sibling to `/adopt` and `/kickoff`.

### Structure followed

10-step structure mirroring `/adopt`:
0. Welcome message (verbatim block).
1. Pre-flight verification — 7 sub-checks (tooling, .framework-version, manifest, partial-update detection, backup-dir warn, dirty-tree warn, global-shadow warn).
2. Resolve target version — fetch latest if not specified, validate target tag, refuse downgrade / non-semver / warn pre-release / no-op detection.
3. Fetch canonical tarballs — both install-version and target-version, with retry, SHA256 print, symlink-escape verification, degraded-mode fallback if install-version unavailable.
4. Apply manifest update first (per F8c / R14 / PM annotation 10).
5. Build inventory (read-only) — walk target manifest, rename detection from changelog, customization detection with normalize() helper for CRLF/BOM/whitespace, default_action_on_conflict lookup, uncategorized-file footer, expired-shim detection.
6. Four-category report screen with summary + dry-run exit + non-TTY/--yes handling.
7. Per-file walkthrough — renames, then 🟥 customized one-at-a-time with `git merge-file` three-way merge, then 🟢 batch confirm, then 🟡 add, then 🔵 deprecated with `[k]eep / [r]emove / [s]him` options.
8. Apply phase — backup phase → apply phase → atomic .framework-version write (preserves installed_at, bumps version, records previous_version + last_updated_at + update_method + update_from_tarball_sha256 + update_log).
9. Post-update summary with release-notes link.
10. SIGINT / error recovery per phase.

Plus V1 Limitations section and Boundaries-with-installer-and-/adopt section.

### Key requirements honored

- **No `{{#if}}` Handlebars syntax** — plain English conditionals throughout (e.g., "If user supplied $ARGUMENTS.target-version, use it; otherwise default to latest release.").
- **Frontmatter per F1** — `description` + four optional args: `target-version`, `dry-run`, `yes`, `allow-downgrade`. Used `$ARGUMENTS.<name>` syntax verified via existing commands.
- **GitHub Releases API endpoints** documented inline as concrete `curl` commands. Rate-limit guidance (60 req/hour unauth, 5000 with GITHUB_TOKEN) surfaced in the 403 handling.
- **Three-way merge via `git merge-file`** — concrete command shown, captures exit code (0 = clean / N = conflict regions), writes to `.framework-backup/<path>.merging`, prompts user to resolve markers before `[c]ontinue`.
- **Shell out to `tar`** for V1; native Windows-without-WSL deferred to V2 (documented in Step 0 welcome AND V1 Limitations section).
- **CRLF / whitespace / BOM normalization** — explicit `normalize()` pseudo-code shown in Step 5c. Files matching after normalize but differing byte-for-byte classify as 🟢 with a note.
- **FRAMEWORK_CHANGELOG.md parser** — Step 3f captures `### Added`, `### Changed`, `### Removed`, `### Renamed`, `### Migration Notes`. Renamed-entry parser keys on `→` Unicode arrow per PM annotation 8.
- **Rename-pair coalescing** — Step 5b coalesces `(old, new)` pairs into a single 🔁 RENAMED bucket; users see one rename action, not separate 🔵 + 🟡 entries (per R19 / PM annotation 9).
- **Manifest-itself ordering** — Step 4 explicitly applies manifest update first, then Step 5 onward operates on target manifest's categories (per F8c / PM annotation 10).
- **Refuse downgrade by default** — Step 2c semver compare. `--allow-downgrade=true` flag opens path with strong-warning re-confirmation (per R16 / PM annotation 11).
- **Pre-release warning + non-semver refusal** — Step 2c.
- **No-op detection** — Step 2c equal-version case exits cleanly BEFORE fetching install-version tarball (per F10a / PM annotation 14 — most likely first-invocation case in dogfood).
- **`.framework-version` schema sync per Worker 2** — Step 8c spells out preserve `installed_at`, bump `version`, update `tarball_sha256`, add `previous_version` + `last_updated_at` + `update_method` + `update_from_tarball_sha256` + `update_log` (per PM annotation 12).
- **Four-category presentation** — 🟥 / 🟢 / 🟡 / 🔵 plus 🔁 RENAMED. Single review screen, then per-file walkthrough only for 🟥 + 🔵.
- **Backup destination** — `.framework-backup/<path>@v<install-version>` with timestamp suffix on collision (per Step 8a).
- **Honor per-file `default_action_on_conflict`** — Step 5d describes the lookup order (exact path → longest prefix → category default) used to suggest defaults in 🟥 prompts.
- **Uncategorized-file footer** — Step 5e surfaces files in framework-managed paths but not in the manifest.
- **Expired-shim auto-removal** — Step 5f detects shims scheduled for removal at-or-before target-version; surfaces in 🔵 bucket; auto-removes with backup.
- **SIGINT recovery per phase** — Step 10 covers all 5 phases with phase-specific recovery messages.
- **Atomicity** — five-phase commit (inventory → decisions → backup → apply → version-write); `.framework-version` write is the atomic commit point; staging preserved on interrupt.
- **Lock file** — `.framework-update-staging/.lock` with PID; refuses concurrent runs (Step 3a).

### Constraints respected

- Did NOT modify `.framework-manifest.json`, `bin/init.js`, `lib/*`, `adopt.md`, `FRAMEWORK_CHANGELOG.md`, or any sibling command.
- Did NOT author other slash commands.
- Did NOT auto-update silently — user approval required at four-category review and per-file decisions for 🟥.
- Did NOT fetch outside the manifest's `framework-managed` + `hybrid` lists.

### Cross-references

- Read `.framework-manifest.json` for manifest schema (especially `_meta.category_defaults` and `default_action_on_conflict`).
- Read `FRAMEWORK_CHANGELOG.md` parsing contract — followed `## [X.Y.Z] - YYYY-MM-DD` heading shape, `### Renamed` arrow keying, `### Migration Notes` verbatim display.
- Read `adopt.md` for the conversational-command convention and the welcome-message pattern.
- Read `kickoff.md` for "no subagent dispatch — runs in user session" pattern.
- Confirmed `.framework-version` field names by reading `lib/version.js` (`version`, `installed_at`, `tarball_sha256`, `installed_method`, `canonical_url`, optional `installed_from`).

### Line count

~600 lines markdown. 10 numbered steps, plus V1 Limitations and Boundaries appendix.

### Ambiguities / open questions raised

None. The PM annotations resolved every question that came up in the granular audit. Two minor implementation choices made without asking:

1. **Rename action ordering in apply phase** — chose to process renames in Step 8b alongside other actions rather than as a pre-step. Rationale: backup phase 8a captures the renamed source, apply 8b copies target into new path and removes old path. This stays within the 5-phase atomicity model.
2. **`--allow-downgrade` arg** — added as an arg even though phase plan didn't explicitly require it; followed PM annotation 11 ("`--allow-downgrade` flag for legitimate rollback"). Standard arg shape; doesn't conflict with anything.

## Completion notes

- Deliverable: `/Users/chrisparsons/Documents/GitHub/app-blueprint/.claude/commands/update-framework.md` (created, ~600 lines).
- All 14 PM annotations honored.
- All 24 audit recommendations honored where applicable; V2 carries left as documented limitations.
- No edits made to any other file (per constraints).
- Ready for PM verification. Suggest PM dogfood-test by running `/update-framework` in a project where `.framework-version` shows v0.1.0 — should hit the no-op exit path in Step 2c (per PM annotation 14 dogfood blocker) without making any network calls beyond the latest-release lookup.
