---
description: Use when pulling newer canonical app-blueprint releases into this project — shows a per-file review and assisted three-way merge that preserves your customizations. Reach for this to upgrade the framework after the initial install.
arguments:
  - name: target-version
    description: Specific version tag to update to (e.g., "0.2.0", no leading "v"). Default — latest published release.
    required: false
  - name: dry-run
    description: Preview the four-category report without writing anything. Pass "true" or "1".
    required: false
  - name: yes
    description: Auto-accept manifest defaults (skip on conflict, apply safe categories). For non-TTY use.
    required: false
  - name: allow-downgrade
    description: Permit updating to a target version older than the installed version. Default refuses to downgrade.
    required: false
---

# Update Framework — Pull Canonical Updates Into This Project

**This is a conversation command.** It runs inline in your session, not as a subagent. The reason: per-file approve / skip / merge prompts can't be shuttled through a one-shot subagent return — you need to see diffs and make decisions interactively.

`/update-framework` fetches the latest (or a specified) release of the **app-blueprint** framework from the canonical GitHub repo, compares it against your installed version, and walks you through a four-category report with explicit per-file resolution. Customizations are never overwritten silently. Backups are made before any write.

**Prerequisites:**
1. The framework installer must have run successfully — `.framework-version` must exist at the project root.
2. `git`, `tar`, and `curl` must be available on `PATH`. Mac, Linux, and WSL on Windows are supported in V1; native Windows without WSL is **deferred to V2**.
3. The repo should not have a partial-update artifact lingering — if `.framework-update-staging/` exists from a previous run, you'll be asked to resume or discard it (Step 8).

---

## Arguments

The command runner substitutes only a single flat string, `$ARGUMENTS` — everything the user typed after `/update-framework`. There are no named variables; the `arguments:` frontmatter block above is documentation only. Parse `$ARGUMENTS` yourself.

Parse `$ARGUMENTS` (space-separated, all optional): the **first token** is the target version — strip any leading `v` (so `v0.2.0` and `0.2.0` both work). The tokens `allow-downgrade`, `dry-run`, and `yes` may appear (in any order) as flags; treat a flag as set when its value is truthy (`true`, `1`, or `yes`). Flags may be written bare (`dry-run`), with a value (`dry-run=true`), or in `--flag`/`--flag=value` form. If `$ARGUMENTS` is empty, default to: latest published release, no downgrade, not a dry run, interactive (TTY) mode.

---

## Step 0 — Welcome

Before anything else, deliver this welcome to the user. Reproduce it largely verbatim:

```
/update-framework — pull canonical app-blueprint updates into this project.

What this command will do:
  1. Read .framework-version to learn your installed version.
  2. Fetch the canonical tarball at install-version AND target-version
     from github.com/Insynq/app-blueprint releases (immutable tags).
  3. Compare your local files against canonical@install-version to
     detect what you've customized.
  4. Show a four-category report:
       FILES YOU CUSTOMIZED      — require your decision
       UNCHANGED LOCALLY         — safe to apply with backup
       NEW FROM CANONICAL        — added in target version
       DEPRECATED IN TARGET      — removed; migration notes shown
  5. Walk you through per-file decisions (skip / overwrite / merge).
  6. Apply changes atomically; back everything up before any write.

Nothing is written until you approve. Backups land in .framework-backup/.

Heads-up on platform support:
  - Mac, Linux, and WSL: fully supported.
  - Native Windows without WSL: not supported in V1 (no `tar` available).

Ready to start? Step 1 is read-only verification.
```

After delivering, proceed to Step 1. Don't wait for an explicit "ready?" — Step 1 is read-only.

---

## Step 1 — Pre-flight Verification

Before any network call, verify the local state. Each check is a hard gate or a warn-only signal as noted.

### 1a. Required tooling (HARD GATE)

Run `command -v curl`, `command -v tar`, `command -v git` via Bash. If any returns empty:

```
Required tool missing: <name>.
/update-framework needs curl, tar, and git on PATH. On macOS these come
with Xcode Command Line Tools (`xcode-select --install`); on Linux use
your package manager; on Windows use WSL (native Windows is V2).
```

Stop. Don't proceed.

### 1b. `.framework-version` present and readable (HARD GATE)

Read `.framework-version` from the project root. If it doesn't exist:

```
Framework not installed in this project (no .framework-version file).
Run `npx @insynq/app-blueprint init` first to install the framework,
then re-run /update-framework.
```

Stop.

If it exists but isn't valid JSON, or doesn't have a `version` field:

```
.framework-version is corrupt or missing the `version` field. Cannot
determine which version of the framework is installed.

Repair: either restore from git (`git checkout .framework-version`) or
re-run the installer at the version you intended (`npx @insynq/app-blueprint
init`). Then retry /update-framework.
```

Stop.

Capture from `.framework-version`:

- `version` — install-version (REQUIRED).
- `canonical_url` — for constructing GitHub API endpoints (REQUIRED — fall back to a hardcoded `https://github.com/Insynq/app-blueprint` and warn the user if missing).
- `installed_at` — display only.
- `installed_from` — display only / sanity check.
- `tarball_sha256` — display only (the SHA the installer recorded).
- `installed_method` — display only.

Parse `canonical_url` to extract owner and repo. Expected pattern: `https://github.com/<owner>/<repo>` or `github.com/<owner>/<repo>`. Use a simple regex; if parse fails, warn and fall back to `Insynq` / `app-blueprint`.

### 1c. `.framework-manifest.json` present (HARD GATE)

Read `.framework-manifest.json` from the project root. If missing:

```
.framework-manifest.json missing. The manifest declares which files are
framework-managed and is required for /update-framework to know what
to fetch.

Repair: restore from git or re-run the installer.
```

Stop.

Capture `manifest_schema_version`. If it's not `"1"`, warn:

```
This /update-framework supports manifest schema v1. Your manifest
declares schema v<X>. Proceeding, but if anything is unexpected, the
schema mismatch may be the cause.
```

### 1d. Partial-update staging detection (warn — interactive choice)

Glob for `.framework-update-staging/`. If present:

```
A previous /update-framework run left `.framework-update-staging/` on
disk. This means the previous run was interrupted or did not complete.

Options:
  [r]esume — re-run with the same target-version and resume from where
             it stopped (apply phase will skip already-applied files).
  [d]iscard — delete `.framework-update-staging/` and start fresh.
  [a]bort — exit and let me clean up manually.

Choice [d]:
```

If `[r]esume`: read `.framework-update-staging/.partial-apply` if present (records target-version and which files were already applied) and proceed using the staging files in place. If `[d]iscard`: delete the directory and proceed. If `[a]bort`: exit cleanly.

### 1e. `.framework-backup/` already exists (warn — non-blocking)

If `.framework-backup/` is present from a prior update, surface:

```
.framework-backup/ already exists from a prior update — it will not
be auto-cleaned. New backups from this run will sit alongside old
ones. You can delete .framework-backup/ manually after confirming the
prior update is good.
```

Don't block.

### 1f. Dirty git tree (warn — non-blocking)

Run `git status --porcelain`. If non-empty:

```
Your git working tree has uncommitted changes:

<paste of git status --porcelain output>

/update-framework will write to .framework-backup/ and may modify
framework-managed files. Your eventual `git diff` will show the update
mixed with whatever else is in your working tree. Consider committing
or stashing first.

Continue anyway? [y/N]
```

If user says no, exit cleanly. If git is unavailable (no `.git` directory or `git` fails), surface a one-line note: "Note: git not available — backups in .framework-backup/ are the only recovery path."

### 1g. User-global command shadow re-detection (warn — non-blocking)

Glob `$HOME/.claude/commands/*.md`. For each match whose basename matches a framework command (`audit-code`, `audit-full`, `audit-infra`, `audit-rls`, `brainstorm`, `changelog`, `db-push`, `debug`, `gen-component`, `gen-migration`, `gen-test`, `implement`, `investigate`, `kickoff`, `orchestrate`, `plan`, `plan-review`, `preflight`, `research`, `ship`, `unify`, `update-kb`, `visualize`, `adopt`, `update-framework`), warn:

```
Found user-global command shadow(s) at ~/.claude/commands/:
  - <name>.md

These may shadow project-local framework versions even after the
update lands. /update-framework only modifies project-local files;
your user-global commands are unaffected.

Recommended hygiene: rename ~/.claude/commands/ to ~/.claude/commands_legacy/
until you confirm the new project-local versions work.
```

Don't block.

---

## Step 2 — Determine Target Version

### 2a. Resolve the target version

If a target version was supplied (the first `$ARGUMENTS` token), use it verbatim, stripping any leading `v` (so `v0.2.0` and `0.2.0` both work).

If no target version was supplied:

1. Fetch `https://api.github.com/repos/<owner>/<repo>/releases/latest` via Bash + `curl`. Capture HTTP status and body.

   Suggested fetch command:
   ```
   curl -sS -L \
     -H "Accept: application/vnd.github+json" \
     -H "X-GitHub-Api-Version: 2022-11-28" \
     ${GITHUB_TOKEN:+-H "Authorization: Bearer $GITHUB_TOKEN"} \
     -o /tmp/ab-update-latest.json \
     -w "%{http_code}" \
     "https://api.github.com/repos/<owner>/<repo>/releases/latest"
   ```

2. If status is 200, parse the JSON body. Extract `tag_name` (e.g., `"v0.2.0"`), `tarball_url`, `body` (release notes), `published_at`. Strip leading `v` from `tag_name` to get the target version string.

3. Print:
   ```
   Latest release: v<target-version> (published <published_at>).
   Update from your installed v<install-version> to v<target-version>?
   [Y/n]
   ```

   If user declines, exit cleanly.

4. If status is 403 with header `X-RateLimit-Remaining: 0`, surface:
   ```
   GitHub API rate-limited (60 req/hour for unauthenticated). Wait
   <reset-minutes> minutes (resets at <reset-time>), or set GITHUB_TOKEN
   in your env to raise the limit to 5000/hour:
     export GITHUB_TOKEN=<your-token>
   Then re-run /update-framework.
   ```
   Stop.

5. If status is 404, surface:
   ```
   Cannot find a `latest` release at github.com/<owner>/<repo>. Either
   no releases have been published, or the canonical repo has moved.
   Check `canonical_url` in .framework-version against the canonical
   repo URL.
   ```
   Stop.

6. If network failure (curl exit non-zero), retry up to 3 times with backoff (1s, 3s, 9s). If all retries fail, surface a clear error and exit.

### 2b. Validate the target version

If the user supplied a target-version, fetch the specific release to validate it exists:

```
curl -sS -L \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  ${GITHUB_TOKEN:+-H "Authorization: Bearer $GITHUB_TOKEN"} \
  -o /tmp/ab-update-target.json \
  -w "%{http_code}" \
  "https://api.github.com/repos/<owner>/<repo>/releases/tags/v<target-version>"
```

If 404: `Tag v<target-version> not found in releases. Available: <link to releases page>.` Stop.

If 200, capture the `tarball_url` for the target version.

### 2c. Refuse / warn on version drift

Compute semver comparison between `install-version` and `target-version`.

- **Equal:** no-op detection. Print:
  ```
  Already at v<install-version>. Nothing to update. Exiting cleanly.
  ```
  Stop. (This is the most likely first-invocation case in early dogfood. Detect it BEFORE fetching the install-version tarball — saves a network round-trip.)

- **Target < install** (downgrade): if the `allow-downgrade` flag is not set:
  ```
  Refusing to downgrade from v<install-version> to v<target-version>.
  Downgrade UX is a separate concern (un-applying customizations cleanly
  is hard) and is not in V1 scope.

  If you really want to revert:
    1. Re-run with --allow-downgrade=true
    2. OR manually delete .framework-version and re-run the installer
       at the older version.
  ```
  Stop.

  If `--allow-downgrade=true`, surface a strong warning and require explicit confirmation:
  ```
  --allow-downgrade is set. About to downgrade from v<install-version>
  to v<target-version>. This is a non-standard operation; review the
  four-category report VERY carefully before proceeding.

  Continue with downgrade? [y/N]
  ```
  Default no.

- **Target is pre-release** (target-version contains `-` like `0.2.0-beta.1`): surface:
  ```
  v<target-version> is a pre-release tag. Updating to a pre-release on
  a production project is risky — partial features, breaking changes,
  and untested code paths are likely.

  Continue? [y/N]
  ```

- **Target is non-semver** (e.g., `nightly`, `latest`, no major.minor.patch shape): refuse:
  ```
  Tag <target> is not semver. /update-framework only supports semver
  releases (e.g., 0.2.0). Refusing to proceed.
  ```
  Stop.

---

## Step 3 — Fetch Canonical Tarballs

### 3a. Acquire lock + create staging

Create `./.framework-update-staging/` if it doesn't already exist (it would already exist if the user picked `[r]esume` in Step 1d).

Write `./.framework-update-staging/.lock` containing the current process PID and timestamp. If `.lock` already exists with a different PID, refuse:

```
Another /update-framework run is in progress (PID <pid>). Wait for
it to complete or, if you're sure no other run is active, delete
.framework-update-staging/.lock and retry.
```

Stop.

### 3b. Fetch the install-version tarball

If we're in resume mode (`.framework-update-staging/canonical-install/` already exists), skip this. Otherwise:

1. Fetch `https://api.github.com/repos/<owner>/<repo>/releases/tags/v<install-version>`. If 200, extract `tarball_url`.

2. Download the tarball with retry (3x exponential backoff, 1s/3s/9s):
   ```
   curl -sS -L \
     ${GITHUB_TOKEN:+-H "Authorization: Bearer $GITHUB_TOKEN"} \
     -o ./.framework-update-staging/canonical-install.tar.gz \
     "<tarball_url>"
   ```

3. Compute SHA256 of the downloaded tarball:
   ```
   shasum -a 256 ./.framework-update-staging/canonical-install.tar.gz
   ```
   (On Linux without `shasum`, fall back to `sha256sum`.)

   Capture the hex SHA. If `.framework-version` has `tarball_sha256` set, compare and surface:
   ```
   Install-version v<install-version> tarball SHA256:
     Recorded at install: <recorded-sha>
     Just downloaded:     <fresh-sha>
     Match: <yes/no>
   ```
   If they don't match, warn but don't fail — this can happen if the canonical tag was force-pushed (rare) or if the installer used a different fetch path. Surface and continue.

4. Extract:
   ```
   mkdir -p ./.framework-update-staging/canonical-install/
   tar -xzf ./.framework-update-staging/canonical-install.tar.gz \
     --strip-components=1 \
     -C ./.framework-update-staging/canonical-install/
   ```

   `--strip-components=1` removes the GitHub-prefix top-level dir (e.g., `Insynq-app-blueprint-abc123/`).

5. After extract, verify no symlinks escape staging:
   ```
   find ./.framework-update-staging/canonical-install/ -type l \
     -exec readlink -f {} \;
   ```
   Any path that doesn't begin with the staging dir's absolute path → reject:
   ```
   Tarball contains a symlink that escapes the staging directory: <path>.
   This is suspicious — refusing to proceed.
   ```
   Stop. Clean up staging.

### 3c. Handle install-version unavailable (degraded mode)

If `releases/tags/v<install-version>` returns 404:

1. Try fallback: `curl -sS -L -o /tmp/ab-tags.json https://api.github.com/repos/<owner>/<repo>/git/refs/tags/v<install-version>` — even if the *release* was deleted, the *tag* often persists.

2. If 200, attempt deterministic tarball URL: `https://codeload.github.com/<owner>/<repo>/legacy.tar.gz/refs/tags/v<install-version>`. Download and proceed.

3. If both fail:
   ```
   Cannot find install-version v<install-version> at canonical. The
   release may have been deleted or the tag moved.

   Falling back to DEGRADED MODE: every framework-managed file will be
   treated as "customized" (i.e., requires per-file decision). This is
   conservative — when in doubt, you'll be asked.

   Recommend filing an issue at:
     https://github.com/<owner>/<repo>/issues

   Continue in degraded mode? [y/N]
   ```

   If yes, set a degraded-mode flag — Step 5 routes every file into the FILES YOU CUSTOMIZED bucket. If no, exit.

### 3d. Fetch the target-version tarball

Same as 3b but for `v<target-version>`. Extract into `./.framework-update-staging/canonical-target/`. Compute and display its SHA256 (this becomes `update_from_tarball_sha256` in `.framework-version` after success).

### 3e. Read both manifests

Read:
- `./.framework-update-staging/canonical-install/.framework-manifest.json` — install-version manifest.
- `./.framework-update-staging/canonical-target/.framework-manifest.json` — target-version manifest.

Compare `manifest_schema_version` between them and against the local `.framework-manifest.json`:

- If `target.manifest_schema_version > 1`: refuse:
  ```
  Target version's manifest is schema v<X>; this /update-framework
  understands up to v1. Pull the latest framework-distribution updates
  before continuing, or update step-by-step through intermediate
  versions.
  ```
  Stop.

- If `install.manifest_schema_version != target.manifest_schema_version`: warn:
  ```
  Manifest schema bumped from v<install-schema> to v<target-schema>
  in this update. Categories or fields may have shifted; review the
  per-category report carefully.
  ```

### 3f. Read FRAMEWORK_CHANGELOG.md from target

Read `./.framework-update-staging/canonical-target/FRAMEWORK_CHANGELOG.md`. Parse the `## [<target-version>] - YYYY-MM-DD` section and capture:

- **`### Added` bullets** — surfaced as NEW FROM CANONICAL items.
- **`### Changed` bullets** — informational; surfaced in the report header.
- **`### Removed` bullets** — used in 🔵 DEPRECATED bucket. Each bullet may include backticked file paths.
- **`### Renamed` bullets** — parser keys on the `→` Unicode arrow. Format: `` - `/old-name` → `/new-name` (parenthetical) ``. Capture every `(old, new)` pair.
- **`### Migration Notes` body** — free-form prose, captured verbatim for display.

If the section is missing or `FRAMEWORK_CHANGELOG.md` is missing entirely:

```
Note: target version v<target-version> has no changelog section. Migration
notes for any deprecated files won't be available — using a generic
"canonical no longer ships this file" note instead.
```

Don't fail.

---

## Step 4 — Apply Manifest Update First

The manifest itself may be one of the files being updated. Per Worker 1 R13 and the phase-plan F8c, the manifest must be applied first so subsequent file processing uses the new categories.

Compare local `.framework-manifest.json` against `./.framework-update-staging/canonical-install/.framework-manifest.json`:

- If they're byte-equal: no manifest change. Proceed using the local manifest.
- If they differ: the user has customized the manifest. Surface as a special FILES YOU CUSTOMIZED entry — surface immediately:

  ```
  Your .framework-manifest.json differs from canonical@v<install-version>.
  Either you customized it or the installer wrote a slightly different
  version.

  Showing diff (local vs canonical@install):
    <unified diff>

  Action: [s]kip / [o]verwrite / [m]erge / [d]iff full
  ```

  - `[s]kip`: keep your local manifest. Future updates may behave inconsistently if categories drift.
  - `[o]verwrite`: back up local to `.framework-backup/.framework-manifest.json@<install-version>` and overwrite with target. Reload categories from target.
  - `[m]erge`: write target manifest to `.framework-backup/.framework-manifest.json.merging`, prompt user to resolve conflicts (this is a JSON file — encourage `[o]verwrite` unless the user truly customized).
  - `[d]iff full`: show the full unified diff and re-prompt.

After resolution, also compare local manifest against target. If different, apply target manifest first (with backup), then reload categories from the now-applied target manifest. The rest of Step 5 onward operates on the target manifest's categories.

---

## Step 5 — Build the Inventory (Read-Only)

Now build the four-category report. This phase is **read-only** — no writes happen until Step 7.

### 5a. Walk every file in target's framework-managed and hybrid categories

For each path entry in the target manifest's `framework-managed` and `hybrid` lists:

- If the entry ends with `/`, walk that directory in `./.framework-update-staging/canonical-target/<dir>/` to find all files.
- Otherwise treat as a single file.

For each file, its target-version path is the relative path within the target tarball.

### 5b. Detect renames from FRAMEWORK_CHANGELOG

For every `(old, new)` pair captured from `### Renamed`:

- If the local repo has a file or directory at `<old>` AND the target tarball has it at `<new>`, mark this as a **rename** (not a separate delete + add). Coalesce in the report — single 🟢 line "Renaming `<old>` → `<new>` (N files in the directory)" rather than separate 🔵 (delete) + 🟡 (add) entries.
- The rename action: at apply time, copy from canonical-target `<new>` into local `<new>`, and back up local `<old>` to `.framework-backup/<old>@<install-version>`, then delete local `<old>`.

### 5c. Per-file customization detection

For each file in target's framework-managed + hybrid lists (excluding files involved in a coalesced rename):

1. **Local exists, install-version exists:** read both, normalize line endings + trailing whitespace + UTF-8 BOM (the "normalize" step below), and compare:
   - `local == canonical@install-version` (after normalization) → **🟢 UNCHANGED LOCALLY** (safe to apply target).
   - `local != canonical@install-version` → **🟥 FILES YOU CUSTOMIZED** (require decision).
   - `local != canonical@install-version` BUT `local == canonical@target-version` → still 🟢 (already at target — no-op).
   - `local != canonical@install-version` AND `local != canonical@target-version` → 🟥 (customized OR partial-update artifact). Note the partial-update possibility in the per-file display.

2. **Local exists, install-version DOESN'T have it, target has it:** 🟡 NEW FROM CANONICAL. (User added this independently? Or framework adds it in the target version.) If the local content matches canonical-target byte-equal (after normalize), classify 🟢; else 🟥.

3. **Local doesn't exist, target has it:** 🟡 NEW FROM CANONICAL.

4. **Local exists, target DOESN'T have it (file removed in target):** 🔵 DEPRECATED.
   - If install-version had this file AND `local != canonical@install-version`: still 🔵 but mark as customized-deprecation (the user customized a file that's being removed). Surface migration note prominently.

5. **In degraded mode** (Step 3c): every file goes to 🟥.

**Normalization (CRITICAL — handles Windows `core.autocrlf=true`):**

```
normalize(content) =
  content
    .replace(/^\xEF\xBB\xBF/, '')   // strip leading UTF-8 BOM
    .replace(/\r\n/g, '\n')          // CRLF → LF
    .replace(/[ \t]+\n/g, '\n')      // strip trailing whitespace per line
    .replace(/\n+$/, '\n')           // collapse trailing blank lines
```

If `bytes(local) != bytes(canonical@install)` BUT `normalize(local) == normalize(canonical@install)`, classify as 🟢 with a note: *"<path> — line-ending / whitespace-only diff, applied target."*

### 5d. Per-file `default_action_on_conflict`

For each 🟥 customized file, look up `default_action_on_conflict` from the target manifest. The lookup order:

1. Exact path match in the manifest's `default_action_on_conflict` map.
2. Longest prefix match against directory entries (e.g., `.claude/commands/foo.md` matches `.claude/commands/` if no exact entry).
3. Category default from `_meta.category_defaults` (e.g., `framework-managed` → `overwrite-with-backup`, `hybrid` → `sibling`).

This becomes the suggested default in the per-file prompt — the user can always pick a different action.

### 5e. Detect uncategorized files

Glob the local repo for any files in framework-managed paths (e.g., `.claude/commands/*.md`) that are NOT in the target manifest's framework-managed list. Surface as a footer note in the report:

```
Note: N file(s) found in framework-managed paths but not in canonical
target. They were left untouched by /update-framework:
  - .claude/commands/my-custom-command.md
  - docs/Form KBs/MY_FORM_KB.md

These are project-owned by default. Add them to the manifest's
project-owned list if you want this behavior recorded.
```

### 5f. Detect expired deprecation shims

Glob `.claude/commands/*.md` and check each for a frontmatter `description:` starting with `DEPRECATED —`. If found, parse the body for the line `Will be removed in v<future-version>`. If `<future-version> <= target-version` (semver compare), mark for auto-removal. Surface in 🔵 bucket as:

```
Removing expired shim: .claude/commands/<name>.md
  (was scheduled for removal in v<future-version>; you're updating to
  v<target-version>).
```

These are auto-removed on apply (no per-file prompt — already announced).

---

## Step 6 — Present the Four-Category Report and Get Approval

### 6a. Show the inventory screen

Print the full report in a single screen:

```
/update-framework — app-blueprint v<install-version> → v<target-version>
Canonical: <canonical_url>
Install-version tarball SHA256: <recorded> (recorded at install)
                                <fresh>    (just fetched)
Target-version tarball SHA256:  <fresh>

🟢 UNCHANGED LOCALLY — N files (you have not customized; safe to apply with backup)
   .claude/commands/audit-code.md
   .claude/commands/brainstorm.md
   [... collapsible if > 10; show "(N more — say 'show all 🟢' to expand)"]

🟥 FILES YOU CUSTOMIZED — M files (require your decision)
   CLAUDE.md                 — 23 lines diff (you), 14 lines diff (canonical)
   docs/KB_7_UI_Patterns.md  — 6 lines diff (you), 4 lines diff (canonical)
   .claude/settings.json     — 8 lines diff (you), 0 lines diff (canonical)

🟡 NEW FROM CANONICAL — K files (added in target version)
   .claude/commands/orchestrate-v2.md
   docs/AI KBs/AI_KB_05_Agent_Patterns.md

🔵 DEPRECATED IN v<target-version> — J files (canonical removed; you still have local)
   .claude/commands/old-debug.md  — see migration: → /debug supersedes /old-debug

🔁 RENAMED — R rename actions (coalesced from changelog)
   docs/Old Path/ → docs/New Path/ (15 files)

📋 SUMMARY: N auto-apply | M require decision | K to add | J deprecated | R renames

Migration notes (from FRAMEWORK_CHANGELOG.md):
  <verbatim ### Migration Notes section, if present>

Continue to per-file decisions? [y/N]
```

### 6b. Dry-run exit point

If the `dry-run` flag is set (truthy: `true`, `1`, `yes`):

```
--dry-run set; exiting without writing.
Staging directory at .framework-update-staging/ has been deleted (dry-run cleanup).
```

Clean up staging (delete `.framework-update-staging/`). Stop.

Otherwise, wait for user approval. If user declines, exit cleanly: "Cancelled. No changes written."

### 6c. Non-TTY / `--yes` mode

If the `yes` flag is set (truthy):

- Skip the per-file walkthrough.
- For each 🟥 file, apply the per-file `default_action_on_conflict` from Step 5d. Default for `framework-managed` is `overwrite-with-backup`; for `hybrid` is `sibling`.
- For 🟡, auto-add all new files.
- For 🔵, default to `[k]eep` (don't auto-remove without explicit consent — exception: expired shims still auto-remove since they were already announced).
- For 🔁 renames, apply the rename.

If non-TTY AND the `yes` flag is NOT set:

```
Non-interactive run without --yes. Cannot prompt for per-file decisions.
Re-run with `--yes=true` to accept manifest defaults, or run in a TTY.
```

Stop.

---

## Step 7 — Per-File Walkthrough

Walk through categories in this order: 🔁 renames → 🟥 customized → 🟢 batch confirm → 🟡 new files → 🔵 deprecated. Hold all decisions in memory; nothing is written yet.

### 7a. 🔁 Rename actions

For each rename:

```
─── RENAME: docs/Old Path/ → docs/New Path/ ───

This is a directory rename announced in FRAMEWORK_CHANGELOG.
N files affected. Local copies of the old path will be backed up
to .framework-backup/<old-path>@v<install-version>/.

Apply rename? [Y/n]
```

If yes, queue the rename. If no, skip — the old path stays, and the new path becomes a separate 🟡 add (warn the user this means they'll have both).

### 7b. 🟥 Customized files (one at a time)

For each file in 🟥, in alphabetical order:

#### Step 7b-i. Compute three-way diff metrics

- `local_vs_install` diff: lines changed between local and canonical@install-version.
- `install_vs_target` diff: lines changed between canonical@install-version and canonical@target-version.
- `larger_file_lines`: max(local, target) line count.

Inline-merge eligibility: `install_vs_target_diff_lines < 10 AND install_vs_target_diff_lines / larger_file_lines < 0.30`.

(The `install_vs_target` diff is what `/update-framework` is trying to bring forward. The threshold gates whether that's small enough to inline-suggest a merge.)

#### Step 7b-ii. Show per-file prompt

```
─── CONFLICT: <path> ───
  Local size: <N> lines
  Canonical@install size: <N> lines
  Canonical@target size: <N> lines
  Your customization: <X> lines diff (local vs canonical@install)
  Canonical update:   <Y> lines diff (canonical@install vs canonical@target)

  Per-file default (from manifest): <default-action>
  Inline merge eligible: <yes/no>

Action:
  [s] skip      — keep local; this file diverges from canonical going forward (default if hybrid)
  [o] overwrite — replace with target (back up local to .framework-backup/)
  [m] merge     — three-way merge via `git merge-file` (local + install + target)
  [d] diff      — show full unified diff before deciding
  [i] inline    — apply only the canonical update (only shown if inline-merge eligible)
  [v] view      — show local, install, and target side-by-side (truncated)

Choose [<default>]:
```

#### Step 7b-iii. Action handlers

**`[s] skip`:** queue action `SKIP`. Note: file diverges from canonical permanently unless user reconciles in a later release.

**`[o] overwrite`:** queue action `OVERWRITE`. At apply time: back up local to `.framework-backup/<path>@v<install-version>` and copy canonical-target version into place.

**`[m] merge`:** Three-way merge via `git merge-file`. Prepare three input files:

```
LOCAL=<path-to-local>
INSTALL=./.framework-update-staging/canonical-install/<path>
TARGET=./.framework-update-staging/canonical-target/<path>
MERGED=./.framework-backup/<path>.merging
mkdir -p $(dirname "$MERGED")
cp "$LOCAL" "$MERGED"
git merge-file --marker-size=7 "$MERGED" "$INSTALL" "$TARGET"
```

Capture the exit code:
- `0` — clean merge (no conflicts). Surface:
  ```
  Clean three-way merge succeeded. Result at:
    .framework-backup/<path>.merging

  Apply merged version to <path>?
    [a] apply  (back up local, install merged version)
    [r] review (open the merged file, then re-prompt)
    [s] skip   (keep local, discard merge)
  ```
- Positive exit code (number of conflict regions) — merge had conflicts:
  ```
  Three-way merge had <N> conflict region(s). Result with conflict markers
  written to:
    .framework-backup/<path>.merging

  Open that file, resolve the <<<<<<< / ======= / >>>>>>> markers, then:
    [c] continue — apply the resolved file to <path>
    [s] skip      — keep local; discard merge attempt
  ```
- Negative / error: surface error and fall back to skip/overwrite prompt.

For `[c] continue`: re-read `.framework-backup/<path>.merging`. If it still contains conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`), refuse:
```
Conflict markers still present in .framework-backup/<path>.merging. Resolve
them first, then re-run /update-framework or pick [s]kip.
```

**`[d] diff`:** show full unified diff between local and canonical-target:
```
diff -u <local> <canonical-target>
```
Then re-prompt with the same options.

**`[i] inline`** (only shown if inline-merge eligible per 7b-i): same as `[m] merge` — `git merge-file` produces a clean merge for small diffs.

**`[v] view`:** show truncated three-pane (first 60 lines of each, with an indicator if truncated). Then re-prompt.

### 7c. 🟢 Unchanged-locally batch confirmation

After 🟥 is resolved, batch-confirm 🟢:

```
🟢 UNCHANGED LOCALLY — N files

These have no local customizations vs canonical@v<install-version>. Each will
be backed up to .framework-backup/<path>@v<install-version> and replaced
with the canonical@v<target-version> version.

Apply all <N> 🟢 files? [Y/n]
  [y] yes — batch apply (default)
  [n] no  — skip all
  [r] review — show me the list of files first
```

Default yes. If `[r]` review, list all files and re-prompt.

### 7d. 🟡 New-from-canonical files

For each new file:

```
─── NEW: <path> ───
  Size: <N> lines (<bytes> bytes)
  First 5 lines:
    <preview>

Action:
  [y] add (default)
  [n] skip
  [d] diff — show full file
```

Default add.

### 7e. 🔵 Deprecated files

For each deprecated file, show migration note from FRAMEWORK_CHANGELOG (look up by file path within `### Removed` and `### Migration Notes` sections):

```
─── DEPRECATED: <path> ───
  This file was removed in canonical v<target-version>.

Migration note (from FRAMEWORK_CHANGELOG.md):
  <verbatim migration note for this file, or generic if none>

Local size: <N> lines
Local matches canonical@install: <yes/no>

Action:
  [k] keep      — leave local file in place (will surface again on next update) (default if no successor)
  [r] remove    — delete local file (back up to .framework-backup/)
  [s] shim      — replace with deprecation-redirect shim (only for .claude/commands/* with a known successor)
  [d] diff      — show what was here in canonical@install vs what your local has
```

If `[s] shim` is selected (only available for command files with an `Auto-shim available: yes` flag in the changelog migration note):

Read the successor name from the migration note (format: `→ <successor>` or "superseded by `<successor>`"). Generate shim content:

````
---
description: DEPRECATED — superseded by /<successor>. Will be removed in v<future-version>.
---

# /<old-name> — Deprecated

This command was renamed to `/<successor>` in v<deprecated-in-version>.

**Action: invoke `/<successor>` instead.**

Stop processing this command. Read `.claude/commands/<successor>.md` and follow those instructions.

This shim was generated by `/update-framework` at <timestamp>. It will be removed automatically in v<future-version>.
````

Queue the shim write.

If `[r] remove`: queue removal (back up first).

If `[k] keep`: queue no-op. Note in update_log.

---

## Step 8 — Apply Phase (the only writing phase)

Now execute everything queued, in this order, with a `.partial-apply` marker file per phase so a crash leaves a recoverable trail.

### 8a. Backup phase

For every file that's about to change (🟥 overwrite/merge, 🟢 batch, 🔁 renames, 🔵 remove/shim):

- Compute backup path: `.framework-backup/<rel-path>@v<install-version>`. If that path already exists, append `.<UTC-ISO-timestamp>` (e.g., `.framework-backup/CLAUDE.md@0.1.0.20260507T183214Z`).
- `mkdir -p` parent directory.
- Copy local file (or directory contents, for renames) to backup.

If any backup fails, abort the whole update — nothing has been written yet, so the repo is consistent.

Write `.framework-update-staging/.partial-apply` with `{ phase: "backup-complete", target_version: "<X>", remaining: [<list-of-paths>] }`.

### 8b. Apply phase

Process each queued action in this order (deterministic, alphabetical within each bucket):

1. **Manifest update** (already applied in Step 4 if it changed — re-confirm).
2. **🟥 SKIP** actions — no-op (just record).
3. **🟥 OVERWRITE / 🟢 batch / 🟡 add / 🔁 rename / 🔵 shim** — copy from staging into place via `cp` (per Worker 2 NTFS-safety: per-file copy, not directory move). For renames: copy target version into new path; delete old path (already backed up).
4. **🟥 MERGE applied** — copy `.framework-backup/<path>.merging` into place (the user has resolved conflicts).
5. **🔵 REMOVE** — delete local file (already backed up).
6. **Expired shim auto-removal** — delete the expired shim (back up first per 8a).

After each file, update `.partial-apply` to record progress.

If any apply step fails mid-stream:
```
Apply failed at <path>: <error>.
Staging preserved at .framework-update-staging/.
Backups in .framework-backup/ are intact.

To resume: re-run /update-framework with the same target-version. The
resume logic will skip already-applied files.

To abort: delete .framework-update-staging/ and manually restore from
.framework-backup/ if needed.
```

Stop. Don't write `.framework-version`.

### 8c. Write `.framework-version` (atomic commit point)

Read existing `.framework-version`. Construct the new content:

```json
{
  "version": "<target-version>",
  "installed_at": "<unchanged>",
  "tarball_sha256": "<target-tarball-sha256>",
  "installed_method": "<unchanged or 'npx'>",
  "canonical_url": "<unchanged>",
  "installed_from": "<unchanged>",
  "previous_version": "<install-version>",
  "last_updated_at": "<now-iso8601>",
  "update_method": "slash-command",
  "update_from_tarball_sha256": "<target-tarball-sha256>",
  "update_log": [
    { "path": "<path>", "action": "overwrote|merged|skipped|added|removed|shim|renamed|kept-customized", "reason": "<one-line>" },
    ...
  ]
}
```

**Field sync rules (per Worker 2 schema):**
- Bump `version` → `<target-version>`.
- **Preserve** `installed_at` — it's the original install timestamp; don't touch it.
- Update `tarball_sha256` → SHA256 of the just-applied target tarball.
- Preserve `installed_method`, `canonical_url`, `installed_from`.
- Add new fields: `previous_version`, `last_updated_at`, `update_method`, `update_from_tarball_sha256`, `update_log`.
- `update_log` is replaced (not appended) — only the most recent update is recorded; full history is in git.

Write atomically: write to `.framework-version.tmp` first, then rename. If the write fails:

```
Apply succeeded but .framework-version write failed: <error>.
Manually update .framework-version to set:
  "version": "<target-version>"
to clear the inconsistent state. Backups in .framework-backup/ are intact.
```

Stop.

### 8d. Cleanup

On success:
- Delete `.framework-update-staging/` entirely.
- Leave `.framework-backup/` in place — never auto-delete (let user verify and remove manually).

---

## Step 9 — Post-Update Summary

After successful apply, print:

```
/update-framework complete.

Updated: app-blueprint v<install-version> → v<target-version>

Applied:
  ✓ <N> files unchanged-locally batch
  ✓ <M> customized files resolved (<X> overwritten, <Y> merged, <Z> skipped)
  ✓ <K> new files added
  ✓ <J> deprecated files (<r> removed, <s> shimmed, <k> kept)
  ✓ <R> renames applied

Backups: .framework-backup/  (preserved indefinitely; delete manually when confident)

Manifest update: <applied / no change>

.framework-version updated:
  version: <install-version> → <target-version>
  previous_version recorded: <install-version>
  last_updated_at: <iso-timestamp>

Full release notes:
  <canonical_url>/releases/tag/v<target-version>

Migration notes (from FRAMEWORK_CHANGELOG):
  <verbatim notes, if any>

Recommended next steps:
  1. git diff — review what changed.
  2. Run your test suite if you have one.
  3. If anything broke, files in .framework-backup/<path>@v<install-version>
     are your recovery path.
  4. Commit the update as a separate commit with a clear message:
     `chore: bump framework v<install-version> → v<target-version>`
```

---

## Step 10 — SIGINT / Error Recovery

At any phase, if the user hits Ctrl+C:

- **During Steps 1–6 (read-only, no writes):** print "Interrupted. No changes were made." Clean up staging if it was created. Exit.

- **During Step 7 (decisions in memory):** print "Interrupted during decision phase. Staging preserved at .framework-update-staging/. No files modified yet. Re-run to start over with the same target-version, or delete the staging dir to discard." Don't clean up staging. Exit.

- **During Step 8a (backup phase):** print "Interrupted during backup. Some backups may exist in .framework-backup/, but no source files have been modified. Re-run to retry — backups will be re-created if missing." Don't clean up. Exit.

- **During Step 8b (apply phase):** print "Interrupted during apply. Some files may have been applied. Staging and `.partial-apply` marker preserved. Re-run /update-framework with the same target-version to resume from where it stopped." Don't clean up. Exit.

- **During Step 8c (version write):** print "Interrupted at the version-write step. The apply succeeded but `.framework-version` may not have been written. Verify by reading `.framework-version` and manually update its `version` to `<target-version>` if needed." Don't clean up. Exit.

---

## V1 Limitations (Document for User Awareness)

- **Native Windows without WSL not supported.** `tar` is required; install WSL or use Mac/Linux.
- **No LLM-generated merges in V1.** Only `git merge-file` (three-way merge with conflict markers). LLM-assisted merge is V2.
- **No private-repo auth.** GitHub canonical must be publicly accessible. Setting `GITHUB_TOKEN` in env raises rate limit (60 → 5000 req/hour) but doesn't enable private-repo support in V1.
- **No tarball signature verification.** SHA256 is printed for the user's manual verification but not pinned. Signed-package work is V2.
- **No cross-project version drift detection.** Each project tracks its own `.framework-version`. The `/check-framework-versions` command is V2.
- **Per-file SHA tracking not implemented.** Customization detection is whole-file diff against `canonical@install-version`. If the user manually applied a partial update from a different version, classification may be inaccurate.
- **JSON-merge limited to `.claude/settings.json` (special-case in V2).** Other hybrid JSON files use the same skip/overwrite/merge flow as text files.
- **`--allow-downgrade` only undoes manifest + framework-managed file changes.** It cannot un-apply customizations the user made on top of newer framework versions.

---

## Boundaries with the Installer and `/adopt`

For reference (don't act on this — it's the contract):

| Action | Owner |
|---|---|
| Initial install (write framework files, write `.framework-version`) | Installer (`bin/init.js`) |
| Adopt-time merge of CLAUDE.md, KB drafts, audit existing user KBs | `/adopt` |
| Read `.framework-manifest.json` and `.framework-version` | Both installer and `/update-framework` |
| Fetch tarballs from GitHub releases | `/update-framework` (uses `tarball_url` from API) |
| Three-way merge via `git merge-file` | `/update-framework` |
| Write to `.framework-backup/<path>@<version>` before any framework-managed change | `/update-framework` |
| Write back `.framework-version` with bumped `version` + new fields | `/update-framework` |
| Delete framework files | `/update-framework` (only when user explicitly chooses 🔵 `[r] remove`) |

`.framework-version` is the shared "framework installed?" signal:
- Installer writes it on install.
- `/update-framework` reads it for the install-version anchor and rewrites it after a successful update (preserving `installed_at`).

`.framework-backup/` is `/update-framework`-only:
- Created on first update.
- Never auto-deleted.
- Path convention: `.framework-backup/<path>@v<version>` (timestamp suffix if collision).

No write collisions across the installer and `/update-framework`.
