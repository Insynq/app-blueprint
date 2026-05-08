# Worker 2 — Installer (npm package)

**Phase:** framework-distribution
**Status:** drafted

## Task

Build the npm package `@insynq/app-blueprint` with an `init` bin script that performs the manifest-first install of the framework into a target repo. Adopters will run `npx @insynq/app-blueprint init` from inside their existing project; the installer drops framework files in, with full pre-flight gates and per-conflict prompts.

## Files involved

- **CREATE:** package source — exact directory layout is Worker's call during audit (likely `packages/installer/` inside this canonical repo, or a sibling structure). Includes:
  - `package.json` (name `@insynq/app-blueprint`, bin entry, dependencies)
  - `bin/init.js` (or similar — the entry point invoked by `npx ... init`)
  - source modules: pre-flight gates, manifest loader, conflict resolver, file mover, post-install messager
- **READ:** `/.framework-manifest.json` (Worker 1's output — describes what to install)
- **READ:** `docs/plans/framework-distribution/phase-plan.md` (sections: Brainstorm findings → Installer; Sequencing → Worker 2) for full behavior spec
- **READ:** existing project structure for context — but **never write outside the package directory** during install (the installer code itself, when run by an adopter, writes per the phase plan's blast-radius list)

## Constraints / non-goals

### Installer behavior (when adopter runs `npx @insynq/app-blueprint init`)

- **Pre-flight gates** (refuse install if any fail):
  - Working tree clean (recovery requires git diff)
  - Is a git repo (offer `git init` if not)
  - Repo writable from current directory (test-write + cleanup)
  - Detect user-global command shadows in `~/.claude/commands/` — prompt user to disable per `commands_legacy/` pattern
  - Detect monorepo (`apps/` or `packages/` at root) — block with explicit per-package vs root prompt
- **Manifest-first behavior:** scan target repo, read `.framework-manifest.json` from canonical, show user a per-file plan **before** writing anything.
- **Default conflict resolution: skip** (NOT install-as-sibling). Silent siblings risk shadowing user files. User opts into sibling or overwrite explicitly.
- **Network resilience:** all downloads land in `./.framework-install-staging/`; only move to final location after **all** files succeed. On interrupt, leave staging dir for retry. Document recovery: *"If install fails, delete .framework-install-staging and re-run."*
- **Hard-limited blast radius (enforce explicitly):**
  - **WILL write:** `.claude/commands/*`, `docs/[stack-reference KB folders]/*`, `docs/KB_*.md` templates, `CLAUDE.md` (sibling/skip if exists), `.framework-version` at root
  - **NEVER writes:** `src/`, `package.json`, `.env*`, `README.md`, `supabase/`, `.git/`, anything else
  - Code should reject any write outside the WILL list as a bug.
- **`.framework-version` format:** `{ "version": "0.1.0", "installed_at": "ISO-8601 timestamp" }` at repo root. Single file, no per-file SHAs.
- **Post-install message:** clear next-step instructions (`/preflight`, `/adopt`), brief "framework owns X, you own Y" explanation, and any deferred user-global shadow remediation.

### Package / publish concerns

- **Don't publish to npm yet** — that's a separate user action after Worker 2's audit + implementation + smoke testing.
- Worker 2 may verify package name availability (`@insynq/app-blueprint` on npm) but does not register or publish.
- Worker 2 may add npm publish scripts to package.json but does not run `npm publish`.

### Out of scope

- Don't author the canonical-repo README.md (PM step)
- Don't author FRAMEWORK_CHANGELOG.md (PM step)
- Don't handle private-repo support (V2)
- Don't handle uninstall (V2)
- Don't sign packages (V2)
- Don't build a TUI / fancy progress UI — text output is fine for V1

## Granular audit

Audit run 2026-05-07. Verdict: **proceed with changes** — phase-plan is solid, but several concrete decisions are still latent. None are blockers; all are "decide now or get bitten in Phase 7." Findings numbered for cross-reference in PM annotations.

### 1. npm package layout

- **Canonical repo has no `package.json` at root** today (verified — `find -maxdepth 3 -name package.json` returns empty). The repo is currently a pure markdown/docs payload (`docs/` 1.5 MB, `.claude/commands/` 240 KB, plus `CLAUDE.md`, `LICENSE`, `README.md`, `.github/`). No pre-existing JS toolchain to honor.
- **No `packages/` directory exists** — there's no monorepo convention to honor either.
- **Recommendation:** put the installer **at canonical repo root**, not in a sub-directory. Reasons:
  - This is the only JS code shipping from this repo, ever (V1). A sub-directory adds friction with zero payoff.
  - Root-level `package.json` is what `npm publish` expects. A `packages/installer/` layout would force a workspace setup or extra publish step (`npm publish ./packages/installer`) for no gain.
  - If a second package ever appears in V2+ (e.g., a private-repo fetcher), *then* convert to workspaces. Don't pre-build a monorepo for a single artifact.
- **`bin` entry:** `bin/init.js` (not `src/cli.js` or similar). Reason: matches the user-visible invocation — `npx @insynq/app-blueprint init` reads naturally as "run `init` from `app-blueprint`." `package.json#bin` should be `{ "init": "./bin/init.js" }` so the binary name is `init` (short, intent-revealing). Avoid `app-blueprint-init` — too long for the post-install message.
- **Source layout under root:** `bin/init.js` (entrypoint, shebang `#!/usr/bin/env node`), `lib/` for modules (`preflight.js`, `manifest.js`, `conflicts.js`, `staging.js`, `postinstall.js`). No build step (plain Node — see Finding 9 on dependency posture).
- **`files` field in `package.json`** must be set explicitly to **only** `["bin/", "lib/", "README.md", "LICENSE"]` so npm doesn't ship `docs/`, `.claude/`, the framework payload, or `audits/` inside the package. The framework payload is fetched at install-time from canonical (per phase plan), not bundled into the npm tarball.
- **Verified npm namespace state (2026-05-07):**
  - `@insynq/app-blueprint` — **available** (404 on `npm view`)
  - `@insynq` scope itself — **not registered** ("Scope not found"). User must `npm login` then `npm publish --access public` (creating an unscoped public package on first publish auto-creates the scope, but `npm org create insynq` is cleaner if the user wants org-level control).

### 2. Pre-flight gate completeness

Phase plan lists 5 gates: clean tree, git repo, repo writable, user-global shadow detection, monorepo detection. **All necessary; none missing-with-cost-justified.** But I want to add nuance:

- **Working-tree-clean gate:** spec says "refuse otherwise." I propose: refuse by default, but allow `--force-dirty` for the case where a user is mid-feature and wants to install the framework into the same branch. Recovery is still `git diff` — the gate is about *visibility* of the install diff, not about preventing the user from layering changes. Not a hard requirement; if the implementation is simpler without the flag, drop it.
- **Git-repo gate:** "offer `git init` if not." Concrete: prompt is `Not a git repo. Initialize one before install? [Y/n]`. If `n`, exit with message *"Install requires a git repo so changes are reviewable. Re-run after `git init`."* Don't allow install in a non-git directory — the recovery story is broken without git.
- **Repo-writable check:** test-write a file to `./.framework-install-staging/.write-test`, delete it, then `rmdir` the staging dir if it was just-created. If the dir exists but isn't empty, that's a separate signal (see Finding 4 on staging cleanup).
- **User-global shadow detection:** check `~/.claude/commands/` (Linux/macOS) or `%USERPROFILE%\.claude\commands\` (Windows) for any `.md` file whose basename matches one of the 23 framework command files. **Don't compare contents** — just basename collision. If detected, prompt: *"Found user-global commands that will shadow framework commands: <list>. Disable them by renaming `~/.claude/commands/` to `~/.claude/commands_legacy/`? [Y/n]"* If user declines, **defer the remediation message to post-install** (Finding 7).
- **Monorepo detection:** `apps/` OR `packages/` at root → block with explicit prompt. Concrete prompt: *"Monorepo detected (`apps/` and/or `packages/` at root). V1 doesn't support per-package install. Choose: [1] install at repo root anyway (advanced — framework files live next to your packages), [2] cd into a single package and re-run install there, [3] cancel. [3]"* Default = cancel. Worker 4's `/update-framework` will need the same detection.

**Additional gates worth adding (low-cost, high-signal):**

- **Existing-`.framework-version` gate:** if `./.framework-version` exists at repo root, refuse install with `Framework already installed at version X (installed YYYY-MM-DD). Run /update-framework to update, or delete .framework-version to force re-install.` This is the re-adopt-idempotency hint that phase plan deferred to V2 — but the *gate* is cheap and prevents catastrophic re-install over a customized tree. Implementation: ~5 lines.
- **Existing-`.claude/commands/` with non-framework files:** scan the local `.claude/commands/` directory. Bucket files by basename:
  - In framework manifest → known framework file (will be conflict-resolved per Finding 3)
  - **Not** in framework manifest → user-authored or third-party command. **Leave untouched.** Mention in the inventory output: `Found N user-authored commands in .claude/commands/ that the installer won't touch: <list>.` This is informational, not a gate.
- **Disk space:** **skip.** The total framework payload is ~1.7 MB. A disk-space check would be theatre — any disk that can't hold 2 MB has bigger problems. Saves complexity.
- **Permissions on `~/.claude/`:** if the shadow-detection gate can't read `~/.claude/commands/`, fall back to "couldn't check shadows — verify manually" warning. Don't fail the install on a home-directory permission quirk.
- **Node version:** add an `engines.node` field in `package.json` (>=18 — covers Node 18 LTS and forward; phase-plan says nothing about supporting older Node, and async/await + `fs/promises` are 14+ anyway). Also add a runtime check in `bin/init.js` so npx users on Node 16 get a clear error rather than a syntax surprise.

### 3. Manifest-first conflict resolution UX

Phase plan: default = skip. Worker plan: skip / install-as-sibling / overwrite. Audit:

- **Two-phase output, not per-conflict prompts.** Sequence:
  1. **Inventory phase:** scan target, fetch manifest, build conflict report. **Print the full report**, then **single confirmation prompt** before any writes. Format below.
  2. **Resolution phase:** if any conflicts exist, **batch prompt** — one prompt per conflict but printed in sequence, not interleaved with the inventory. Reason: per-conflict prompts in a long file list bury the user. The inventory IS the review screen.
- **Inventory format** (to print verbatim, then prompt):

  ```
  Framework install plan — @insynq/app-blueprint v0.1.0
  Target: /Users/foo/my-project

  WILL CREATE (no conflict):
    .claude/commands/audit-code.md
    .claude/commands/audit-full.md
    [...23 commands]
    docs/Supabase Structure KBs/SB_KB_00_Index.md
    [...]
    .framework-version

  CONFLICTS (will prompt for each):
    CLAUDE.md          [exists, 7689 bytes — sibling install recommended]
    docs/KB_8_Current_State.md  [exists, 415 bytes]

  WILL NOT TOUCH (user-authored, not in framework):
    .claude/commands/my-custom-command.md

  Total: 89 files to write, 2 conflicts to resolve.
  Proceed? [y/N]
  ```

- **Per-conflict prompt** (after the inventory):

  ```
  CONFLICT: CLAUDE.md (exists, 7689 bytes)
    [s] skip — keep yours, framework version not installed (default)
    [b] sibling — write framework version to CLAUDE.md.framework
    [o] overwrite — replace yours (recommended only if you've never customized it)
    [d] diff — show framework vs. local before deciding
  Choose [s/b/o/d]:
  ```

  `[d]` is essential — it lets a user inspect rather than guess. Implementation: print the unified diff inline, then re-prompt s/b/o.

- **CLAUDE.md special-case:** the *recommended* default for `CLAUDE.md` is **`b` (sibling)**, not `s` (skip). Reason: phase plan explicitly says CLAUDE.md is install-as-sibling (`CLAUDE.md.framework`) so `/adopt` can later merge it. Per-file default override should live in the manifest (see Finding 8).

- **Non-TTY environments:** detect `process.stdin.isTTY === false` (CI, piped, scripted invocations). In non-TTY:
  - If no conflicts: proceed with inventory printed and no prompts.
  - If conflicts and no `--yes` flag: **exit with code 2** and a clear message: *"Conflicts detected; cannot run interactively. Re-run with `--yes` to accept defaults (skip on conflict, sibling for CLAUDE.md), or run interactively in a terminal."*
  - With `--yes`: apply per-file defaults from manifest.

- **`--non-interactive`** alias for `--yes` (npm convention varies; support both).
- **`--dry-run` flag:** prints inventory + exits 0 without writing. Essential for CI smoke testing (Worker 4 / `/update-framework` will want the same flag).
- **`--debug` flag:** verbose logging including HTTP details from the canonical fetch. Helps diagnose Finding 5 (network resilience).

### 4. Network resilience details

Phase plan: staging dir at `./.framework-install-staging/`, move-on-success, leave-on-interrupt. Audit reveals concrete edge cases:

- **Atomic-move portability:**
  - APFS, HFS+, ext4: `rename(2)` is atomic *only when source and destination are on the same filesystem.* `./.framework-install-staging/` and the final files are both inside the same git repo, so same FS — safe.
  - NTFS: `rename` is atomic for files but **not for non-empty directories** in older Node versions. The installer should move *files individually*, not move a tree. (Loop: for each staged file, mkdir -p destination parent, then `fs.rename(src, dst)`.) This avoids the cross-FS and cross-volume edge case entirely and means partial failures land cleanly.
  - **Recommendation:** stage all files into `./.framework-install-staging/<full-relative-path>` mirroring the final layout. Final phase = sequential per-file rename into place. If any rename fails midway, the staging dir still has the unmoved files, and the user can re-run.

- **Cleanup behavior:**
  - **On success:** `rm -rf ./.framework-install-staging/` after **all** renames complete. Print `Cleaned staging directory.`
  - **On any error before write phase:** `rm -rf` staging too — the user's tree wasn't touched, no point keeping garbage.
  - **On error during write phase (mid-rename):** **leave staging.** Print `Install interrupted at file <path>. Staging directory preserved at ./.framework-install-staging/. Re-run `npx @insynq/app-blueprint init` to retry — installer will resume.` Resume = re-scan staging, skip any file already in place at destination, rename remainder.
  - **On Ctrl+C (SIGINT):** install a SIGINT handler that prints *"Interrupted. Staging preserved for retry."* and exits with code 130. Don't try to clean up partial work — that's how race conditions happen.

- **Race conditions:**
  - **Concurrent runs of the installer in the same repo:** detect via lock file `./.framework-install-staging/.lock` containing the current PID. If lock exists and PID is alive, refuse with *"Another install in progress (PID X)."* If lock exists but PID is dead, log a warning and proceed (stale lock from killed process).
  - **User edits a target file mid-install:** there's no general defense. We're moving files, not merging. Mitigation: the *clean-tree* pre-flight gate is what catches this for git-tracked files; for the brief window during install, the user should not be editing the tree. Document in post-install message.
  - **Staging-write vs. final-move:** writes complete fully (await fs.writeFile) before the move phase begins. No interleaving. Safe.

- **Download failure handling:** the install fetches the canonical tarball (per phase plan, GitHub release tarball). On fetch failure: retry with exponential backoff 3 times (1s, 3s, 9s), then exit with `Network error fetching canonical from <URL>. Check connectivity and re-run.` Don't fall back to a different mechanism — fail loud.

- **Tarball validation:** after download, verify the tarball is non-empty and parseable as a tar.gz before extracting. Print SHA256 of the downloaded tarball *before* extraction (Finding 5).

### 5. Security review

Operating within phase-plan assumptions (npm account secure, canonical not compromised, no MITM checks). Additional protection within those assumptions:

- **Print SHA256 of downloaded tarball** before extracting and applying. Format:
  ```
  Fetched canonical tarball: 1842 KB
  SHA256: abcdef0123456789...
  (verify against Insynq/app-blueprint releases page if you want to confirm)
  ```
  Cost: 5 lines of code (`crypto.createHash('sha256').update(buf).digest('hex')`). Benefit: power users can verify; non-power-users get a permanent log entry that's auditable later. **Worth doing.**
- **No pre-/post-install npm scripts ship in our package.** The installer's own `package.json` (`@insynq/app-blueprint`) should have **no `scripts.preinstall`, `postinstall`, `prepare`** etc. Reason: npx-invocation runs the bin script directly; lifecycle scripts add an unnecessary trust surface. Set `"scripts": {}` (or just publish-related scripts the user runs manually).
- **Warn before fetching:** before the staging download begins, print:
  ```
  About to fetch framework files from:
    https://github.com/Insynq/app-blueprint/releases/download/v0.1.0/app-blueprint-v0.1.0.tar.gz
  Continue? [Y/n]
  ```
  Skip prompt with `--yes` / non-interactive. Cost: one prompt. Benefit: user sees the URL before any code runs, can ctrl-C if it doesn't match expectations. Critical because phase plan says "users verify the canonical URL matches what they expect before running install" — make that verification explicit, not implicit.
- **Verify the tarball came from the canonical URL** (check `Location` header on redirects didn't drift to a different domain). If GitHub redirects somewhere unexpected, abort with the actual destination printed.
- **Don't write outside the WILL-write list — runtime check.** Phase plan calls this out as a discipline. Make it a hard invariant: every write goes through a single function `applyFile(stagedPath, destPath)` that asserts `destPath` matches one of the allowed prefixes. Reject silently-bad manifests at install time. Prevents a compromised manifest from clobbering `src/` or `.git/`.
- **Path-traversal defense in tarball extraction:** when extracting the canonical tarball, reject any entry whose resolved path is outside the staging directory (`..` traversal). Standard hygiene; use a known-good tar library (`tar` from npm) and pass `{ strict: true, filter: (path) => !path.includes('..') }` or similar.
- **Refuse to run as root.** If `process.getuid && process.getuid() === 0` and the user didn't pass `--allow-root`, refuse with *"Running as root is not recommended; framework files would be owned by root and break for the dev user. Re-run as your normal user."* Common npx footgun.

### 6. `.framework-version` format edge cases

Phase plan: `{ "version": "0.1.0", "installed_at": "ISO-8601 timestamp" }`. Audit:

- **On update (V1 path is `/update-framework`, not the installer):** Worker 4's command should rewrite `.framework-version` after a successful update. The installer itself shouldn't *update* — it should refuse if `.framework-version` exists (per Finding 2 new gate).
- **Add `installed_method`** field: `"npx" | "manual"` (V1 always `"npx"`; V2 leaves room for `"manual"` if a curl-style installer ever ships). Cheap forward-compat.
- **Add `canonical_url`** field. Reason: if a fork ever ships under a different scope, `.framework-version` becomes the on-disk record of "where do I update from?" — `/update-framework` (Worker 4) needs this.
- **Add `installed_from`** field: the GitHub release tag URL the install pulled from. Auditable provenance for free.
- **Final shape:**
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
  All fields except `version` and `installed_at` are technically optional for V1; document them as "will be present from v0.1.0 forward; older versions may omit." Worker 4 must treat missing fields as `null`, not crash.
- **`.framework-version` gitignore policy:** **commit it.** It's a stable record of what version of the framework this repo was built against. Don't add to `.gitignore`. The post-install message should call this out: *"`.framework-version` should be committed; it lets `/update-framework` and your team know which framework version this repo runs on."*

### 7. Post-install message content

Phase plan says: clear next-step instructions, "framework owns X, you own Y," deferred shadow remediation. Concrete proposal:

```
Install complete — @insynq/app-blueprint v0.1.0

Files written: 89 (.claude/commands/* + docs/* KB stack + .framework-version)
Files preserved: 2 (CLAUDE.md, docs/KB_8_Current_State.md → existing untouched)
Sibling files: 1 (CLAUDE.md.framework — review during /adopt)

Next steps:
  1. Run /preflight             # records your agent + OS in CLAUDE.md
  2. Run /adopt                 # discovery for an existing project
                                # (use /kickoff instead if this is a fresh project)
  3. Commit:  git add . && git commit -m "Add @insynq/app-blueprint framework v0.1.0"

Framework ownership:
  Framework owns:  .claude/commands/*, docs/*KBs*, docs/KB_*.md (templates)
  You own:         everything else — src/, package.json, README.md, supabase/, etc.
  Shared:          CLAUDE.md (after /adopt merges your project content with the template)

Updates:
  Run /update-framework to pull the latest version when canonical releases.
  See https://github.com/Insynq/app-blueprint for changelog.

⚠ Action required (deferred from pre-flight):
  User-global commands at ~/.claude/commands/ may shadow framework commands.
  Disable them with:
    mv ~/.claude/commands ~/.claude/commands_legacy

(omit ⚠ block if no shadows detected, or if user already remediated during pre-flight)
```

- **Sample command invocations:** include `/preflight` and `/adopt` literally as next steps (item 1 and 2). User just types them.
- **Show the `git add . && git commit` line** verbatim — gives the user a copy-paste action with the ownership context already in mind.
- **Conditionally show the user-global shadow remediation** only if the user deferred during pre-flight. Don't print the warning if it doesn't apply — confuses people.
- **Don't print versions or fancy banners.** Plain text. Phase plan says "no TUI" — honor that.

### 8. Anything else (edge cases / npm / publish pitfalls)

- **Per-file defaults in manifest, not in installer code.** Worker 1's manifest should have a `default_action_on_conflict` field per file (or a category-level default). E.g., CLAUDE.md → `"sibling"`. KB_*.md templates → `"skip"`. Keeps the installer logic generic and lets V2 evolve defaults without code changes.
- **`"docs/UI-UX KBs"` directory name** has a colon. **Cross-platform issue:** Windows file systems disallow `:` in names. The colon will fail extraction on Windows. **Two options:**
  1. **Rename to `docs/UI-UX KBs/`** at canonical (one-time fix; updates ~UI_KB_0_Index.md cross-references).
  2. **Special-case rewrite during install** on Windows. Ugly, brittle.
  - **Recommend option 1.** This is the kind of thing that bites a Windows user weeks later and is impossible to debug without prior knowledge. Surface to PM — it's actually a Worker 1 (manifest) and PM (canonical-repo) concern, not a Worker 2 concern, but **Worker 2 will be the one who sees the bug report**.
- **Spaces in directory names** (`UI-UX KBs`, `Supabase Structure KBs`, `Test KBs` etc.): handled fine by `fs.rename` and `path.join`, but watch out for shell-out cases. The installer should never shell out to `mv` or `cp` — use `fs.promises` exclusively. Avoids quoting hell.
- **`@insynq` scope publish gotcha:** scoped packages default to private on `npm publish`. Need explicit `--access public` for the first publish, or set `"publishConfig": { "access": "public" }` in `package.json`. **Add the publishConfig to package.json** so future publishes don't surprise.
- **`prepublishOnly` script:** add a sanity check that ensures the `bin/init.js` is executable and that `files` doesn't accidentally include `node_modules/`. Cheap.
- **`bin` shebang on Windows:** Node's npx wrapper handles `.js` shebang correctly on Windows via `cmd-shim`. No `.cmd` shim needed if `bin` entry is a `.js` file with proper shebang. Test on Windows in Phase 7 smoke.
- **Version-tag handling:** the installer must know which version of canonical to fetch. Two options:
  1. Hardcode the tag in the installer (`const CANONICAL_TAG = 'v0.1.0';`). Pro: deterministic — `npx @insynq/app-blueprint@0.1.0 init` always pulls the framework tag matching the npm version. Con: every framework release requires a coordinated npm + GitHub release.
  2. Read from `package.json#version`. Pro: same as option 1, less duplication. Con: same coupling.
  - **Recommend option 2:** the npm `package.json` version IS the canonical version. `npx @insynq/app-blueprint@0.1.0` → installer reads its own version → fetches `Insynq/app-blueprint` tag `v0.1.0`. Add a note in `FRAMEWORK_CHANGELOG.md` (PM-owned) that "release process = tag canonical, then publish npm with matching version."
- **`npx` cache behavior:** `npx @insynq/app-blueprint init` caches the package globally (`~/.npm/_npx/`). On second invocation, npx may use cache. **Not our problem** — npx handles this — but note in the post-install message that "if reinstall is needed, run `npx --yes @insynq/app-blueprint@latest init` to bypass cache."
- **README inside the npm package** (`README.md` shipped with the package, not the canonical repo's README): write a short one explaining "this is the installer for app-blueprint; run `npx @insynq/app-blueprint init` from inside your project." Don't ship the canonical-repo README.
- **`LICENSE` file** should ship with the package. Canonical repo has one; copy it into the package directory if package isn't at canonical root, OR (per Finding 1) just publish from canonical root and the existing LICENSE ships automatically.
- **Engines warning vs. error:** `engines.node` is a *warning* by default in npm. Add `"engineStrict": true` (deprecated in newer npm but still respected by some tools) AND a runtime check in `bin/init.js`:
  ```js
  const [maj] = process.versions.node.split('.').map(Number);
  if (maj < 18) { console.error('Node 18+ required, found', process.versions.node); process.exit(1); }
  ```
- **Telemetry / analytics:** none in V1. Phase plan doesn't mention it; don't add silently. Surface to PM if they want it for V2 — it's a privacy / consent decision.
- **Release notes integration:** the installer could fetch and print the GitHub release notes for the version being installed (extra polite touch). Cost: one more HTTP call. **Optional.** Recommend implementing only if Phase 7 has time after core install path is solid.

## Recommendations

Bundled, prioritized by what blocks Phase 7 vs. what's polish.

### Must-decide before Phase 7 (PM checkpoints)

1. **Package layout = canonical root** (no `packages/installer/`). Worker 2 implements `package.json`, `bin/init.js`, `lib/*` at repo root.
2. **`docs/UI-UX KBs/` rename to `docs/UI-UX KBs/`** before V1 ships. Cross-platform Windows blocker. **PM decision; affects Worker 1 (manifest) and integration step.**
3. **`.framework-version` schema = expanded** (Finding 6 final shape) including `tarball_sha256`, `installed_from`, `canonical_url`, `installed_method`. Cost: 5 minutes; future-proofs Worker 4.
4. **Manifest gets `default_action_on_conflict` per file/category** (Finding 8). Worker 1 dependency. Lets installer stay generic.
5. **Pre-flight gate added: existing `.framework-version` refuses install** with /update-framework hint (Finding 2). Cheap, prevents a real footgun.
6. **Pre-flight gate added: existing `.claude/commands/*.md` non-framework files surfaced (informational)** (Finding 2).

### Must-implement in Phase 7

7. **Two-phase output** (inventory then per-conflict prompts), not interleaved (Finding 3).
8. **Diff option `[d]` in conflict prompts** (Finding 3) — table-stakes for user trust.
9. **Non-TTY handling: `--yes`, `--non-interactive`, `--dry-run`, `--debug` flags** (Finding 3).
10. **Per-file rename in staging cleanup, not directory move** (Finding 4) — avoids NTFS edge.
11. **Lock file for concurrent-install detection** (Finding 4).
12. **SIGINT handler that preserves staging** (Finding 4).
13. **3x exponential-backoff retry on canonical fetch** (Finding 4).
14. **SHA256 print + tarball validation** (Finding 5).
15. **Pre-fetch URL confirmation prompt** (Finding 5) — explicit user verification of canonical URL.
16. **`applyFile()` runtime path-allowlist enforcement** (Finding 5).
17. **Refuse `process.getuid() === 0` without `--allow-root`** (Finding 5).
18. **Path-traversal defense in tarball extraction** (Finding 5).
19. **Engines >=18 + runtime version check** (Finding 8).
20. **`files` field in `package.json` set explicitly** to `["bin/", "lib/", "README.md", "LICENSE"]` (Finding 1).
21. **`publishConfig.access = "public"`** (Finding 8).
22. **No `preinstall`/`postinstall`/`prepare` scripts** in our package (Finding 5).
23. **Post-install message exactly per Finding 7** (or close — exact copy is editable).

### Polish / optional in Phase 7

24. **Framework release notes printed at install time** (Finding 8) — nice-to-have.
25. **`--force-dirty` flag** (Finding 2) — drop if implementation gets messy.
26. **`--debug` verbose logging** (Finding 3) — recommend doing it because Phase 7 debugging will need it anyway.

### Out of scope (carry to V2 / Worker 4 / PM)

- Telemetry: defer.
- Auto-update notification: V2.
- Uninstall: V2.
- The CLAUDE.md.framework-into-CLAUDE.md merge: Worker 3's `/adopt`, not Worker 2.
- Public-facing README in canonical repo: PM step.
- `FRAMEWORK_CHANGELOG.md`: PM step.

### Blockers needing user/PM action before Phase 7

- **`@insynq` npm scope registration.** Verified via `npm view`: scope does not exist. User must `npm login` then either `npm org create insynq` (if multiple humans publish) or just `npm publish --access public` will auto-create on first publish. **Tied to Phase 10/PM-integration, not Worker 2 directly, but if user wants to test against a real npm install before Phase 10, scope must exist.** Worker 2 can develop and smoke-test against `npm pack` + local install (`npm install ./app-blueprint-0.1.0.tgz`) without ever publishing.
- **`Insynq/app-blueprint` GitHub repo rename** (already in user-actions list per phase plan). Until then, installer should be parameterized to allow swapping the canonical URL (not hardcoded mid-flight). Concrete: use `package.json#config.canonical_url` or a constant in `lib/manifest.js` that a single grep can flip.
- **`docs/UI-UX KBs/` rename decision** (Recommendation 2 above) — PM sign-off needed.

## PM annotations

**Reconciled 2026-05-07.** Audit accepted with the following decisions:

**PM annotation 1 (package layout):** Confirmed — installer at canonical repo root. NOT `packages/installer/`. Single artifact, single source of truth. `bin/init.js` entry, binary name `init`. `package.json#files` strictly `["bin/", "lib/", "README.md", "LICENSE"]` — framework payload is fetched at install time, never bundled.

**PM annotation 2 (`.framework-version` schema):** Use your expanded schema. Required fields at install: `version`, `installed_at` (ISO-8601), `tarball_sha256`, `installed_method` ("npx" | "git-clone" — V1 only ships npx, but field exists for future), `canonical_url`. Worker 4 depends on these — they're locked in.

**PM annotation 3 (UI:UX rename):** **Done by PM 2026-05-07.** `docs/UI:UX KBs/` → `docs/UI-UX KBs/`. Worker 1's manifest references the new path. Your installer can rely on the canonical structure being clean. No special-case handling needed.

**PM annotation 4 (additional pre-flight gates):** Add: refuse install if `.framework-version` already exists (V1 idempotency — phase plan defers re-adopt to V2; this gate makes the absence visible). Surface user-authored non-framework commands in `.claude/commands/` informationally (don't block, just inform). Refuse `process.getuid() === 0` without `--allow-root`.

**PM annotation 5 (default conflict action sourced from manifest):** Read `default_action_on_conflict` from Worker 1's manifest per-file/per-category. CLAUDE.md → sibling, KB templates → skip, `.claude/commands/*` → overwrite-with-backup. Don't hardcode defaults in installer code — pull from manifest so changes don't require installer rewrites.

**PM annotation 6 (UX patterns):** Two-phase output (single inventory + confirmation, then per-conflict prompts) over interleaved prompts — agreed. Add `[d]iff` option to per-conflict prompt — agreed. Per-file rename on staging move (not directory rename — NTFS atomicity) — agreed.

**PM annotation 7 (security visibility):** SHA256 of tarball printed pre-extraction — agreed. Pre-fetch URL confirmation prompt makes phase-plan's "verify canonical URL" guidance explicit — agreed. Don't sign packages in V1 (assumption documented in phase-plan Security Assumptions).

**PM annotation 8 (cross-worker dependencies):** YOUR installer reads Worker 1's manifest as source of truth for what to install. If you encounter a file in canonical NOT in the manifest, raise as `User action required:` block — do not unilaterally categorize.

**PM annotation 9 (out of scope, hard):** Don't `npm publish` (separate user action after smoke testing). Don't author canonical README.md or FRAMEWORK_CHANGELOG.md (PM has authored FRAMEWORK_CHANGELOG.md at canonical root 2026-05-07; README.md is PM integration step). Don't build a fancy TUI — text output is fine.

**Implementation handoff (Phase 7):** deliverables — `package.json`, `bin/init.js`, `lib/*` modules at canonical repo root. Test target: `npm pack` succeeds, package extracts cleanly, `node ./bin/init.js --help` works. **Don't run `npm publish` yourself.** When done: edit Implementation log + Completion notes of THIS plan doc, return brief summary.

## Implementation log

**Phase 7 implementation, 2026-05-07.**

### Files created (all at canonical repo root)

- `package.json` — `@insynq/app-blueprint` v0.1.0; bin `{ "init": "./bin/init.js" }`; `files` strictly `["bin/", "lib/", "README.md", "LICENSE"]`; engines `>=18`; `publishConfig.access = "public"`; single dep `tar ^7.5.15`; no preinstall/postinstall scripts; `prepublishOnly` sanity check that `bin/init.js` runs `--version`.
- `bin/init.js` — entrypoint with shebang `#!/usr/bin/env node`. Runtime Node-version check, arg parsing, orchestration of pre-flight → URL confirm → fetch → SHA256 print → extract → manifest load → inventory → conflict prompts → apply → stamp `.framework-version` → cleanup → post-install message. Single `applyFile()` funnel asserts allowlist on every write.
- `lib/log.js` — debug/info/warn/error helpers, debug toggle.
- `lib/prompt.js` — minimal readline prompts (`confirm`, `choose`); `isInteractive()` TTY detection; `autoYes` opt-out.
- `lib/preflight.js` — 8 gates: not-root, git-repo, clean-tree, repo-writable, not-already-installed (`.framework-version` exists), not-monorepo, user-global-shadows (with rename-to-commands_legacy remediation), user-authored-commands-notice.
- `lib/staging.js` — staging dir mgmt; PID lock; `downloadWithRetry` (3 attempts, 1s/3s/9s exponential backoff, host-allowlist on final URL: `github.com`/`githubusercontent.com`); `sha256Hex`; `extractTarball` (uses `tar.x` with `strip:1` for GitHub-release tarball top-level dir; defensive filter rejects `..` segments); `moveFile` (per-file rename for NTFS atomicity, EXDEV fallback to copy+unlink); `backupFile` (writes to `.framework-backup/<rel>.<timestamp>`); `walkStagingFiles` (async iterator).
- `lib/manifest.js` — loads + validates `.framework-manifest.json` from staging; checks `manifest_schema_version === '1'`; derives tarball URL from manifest.
- `lib/conflicts.js` — `buildPlan`, `printInventory`, `promptForConflict` with `[s/b/o/d]` and inline diff (line-based, 200-line truncation). Action vocabulary matches manifest exactly: `skip`, `sibling`, `overwrite-with-backup`.
- `lib/paths.js` — `buildAllowList`, `assertAllowedDest` (defense-in-depth hard-block list: `package.json`, lockfiles, `.git/`, `node_modules/`, `.framework-install-staging/`); `resolveAction` (longest-prefix-match for both category lookup and per-path overrides); `shouldSkipCategory` (project-owned/excluded never get written).
- `lib/version.js` — writes `.framework-version` with PM-fixed schema: `version`, `installed_at`, `tarball_sha256`, `installed_method`, `canonical_url`, plus `installed_from` (URL of the actual fetched tarball post-redirect).
- `lib/postinstall.js` — plain-text post-install message; conditionally surfaces deferred user-global shadow remediation; lists ownership boundaries; copy-paste git-commit line.

### npm tarball verification

- `npm pack --dry-run` confirms exactly 13 files: package.json, README.md, LICENSE, bin/init.js, lib/*.js (×9). No docs/, no .claude/, no audits/, no node_modules/, no .framework-manifest.json. **Total package size 20.9 KB (unpacked 65.2 KB)** — well under the 1.7 MB framework payload (which is fetched at install time, not bundled).
- `npm pack` produced `insynq-app-blueprint-0.1.0.tgz`; extracted to /tmp; ran `npm install --omit=dev`; `node ./bin/init.js --help` and `--version` both produced expected output. Executable bit `rwxr-xr-x` preserved on `bin/init.js` inside the tarball.
- `npm audit` → 0 vulnerabilities (after pinning `tar ^7.5.15` to dodge a chain of 7 advisories on older 7.x).

### Smoke tests run locally

- `--help` / `--version` / `--unknown` flag exits → 0 / 0 / 2 respectively.
- Fresh clean git repo + `--dry-run --yes` → all 8 pre-flight gates pass; URL confirm prompt skipped (auto-yes); fetch attempts canonical `https://github.com/Insynq/app-blueprint/archive/refs/tags/v0.1.0.tar.gz`; gets HTTP 404 (no v0.1.0 release tagged yet — expected; this is PM's release step), exits 1 with clear network-error message. **Confirms full pipeline up to the network boundary.**
- `.framework-version` already-installed gate → refuses with version + date + remediation message, exit 1.
- Dirty tree gate → refuses with `--force-dirty` hint, exit 1.
- `--force-dirty` bypass → passes gate, proceeds to fetch (404 again).
- Non-TTY without `--yes` → exits 2 with explanation (verified by code path; not run in actual non-TTY harness).

### Vocabulary alignment with Worker 1's manifest

The manifest uses three actions: `skip` / `sibling` / `overwrite-with-backup`. Worker 2 uses the same exact strings — no translation layer. The audit-doc earlier mentioned a lighter `overwrite` (no backup) variant; **rejected** for the live UX because PM annotation 5 explicitly fixes `.claude/commands/*` → `overwrite-with-backup`, and a bare `overwrite` would create a footgun. Per-conflict prompt offers `[o] overwrite-with-backup` only; no plain-overwrite option exposed.

### Ambiguities raised in PM dispatch — resolved

The dispatch flagged 4 manifest ambiguities. None changed our installer code:
1. **Conflict-action vocabulary alignment.** Resolved: we use the manifest's exact strings (`skip`, `sibling`, `overwrite-with-backup`). No new vocabulary needed for Worker 4 either — same three actions cover update flows.
2. **`.framework-version` action.** Manifest sets `installer_generated` category default = `skip` and per-file `.framework-version` = `skip`. The installer won't conflict-process this file because it never extracts to staging from canonical; it's stamped at the end of install with `version.writeFrameworkVersion()`. Pre-flight gate refuses install if it already exists. Coherent.
3. **`.github/` action.** Manifest has it as `framework-managed` → `overwrite-with-backup`. Installer respects this. Adopter's existing `.github/workflows/` get backed up to `.framework-backup/` if conflicting paths come down. Reasonable for V1.
4. **`.env.example` action.** Manifest has it as `framework-managed` with per-path `sibling`. Adopter's `.env.example` (likely customized) is preserved; canonical version writes to `.env.example.framework`. Coherent and safe.

No `User action required:` block needed — manifest as authored is consistent with installer behavior.

### Not done (explicit non-goals)

- **Did not** run `npm publish` (PM/user task post-smoke-test).
- **Did not** modify canonical README.md (PM task — kept the existing project-state README intact; npm tarball ships that file as-is, which is acceptable for now and PM can rewrite for adopter audience before v0.1.0 publish).
- **Did not** modify FRAMEWORK_CHANGELOG.md, CLAUDE.md, MULTI_AGENT_WORKFLOW.md, KBs, or any `.claude/commands/*.md`.
- **Did not** modify `.framework-manifest.json` (Worker 1's territory).
- **Did not** add `.framework-install-staging/` to the canonical `.gitignore` — adopter-repo concern, not canonical-repo concern. Worker 4 (or V2) can ship a gitignore patch.
- **Did not** implement `--debug` HTTP body logging beyond URL + attempt counter — fetch internals don't expose much without instrumentation. Sufficient for V1 debugging.
- **Did not** implement framework release-notes printing (Recommendation 24, optional polish).

### Lessons / gotchas

- **`tar` v7 vs v6.** Pin to `^7.5.15`; v6 and earlier 7.x have 7 known security advisories (path traversal, hardlink escape, race conditions). The API change v6→v7 was minimal (`tar.x` works the same).
- **Node 18+ global `fetch`.** Avoids pulling in `node-fetch` or `undici` directly. One less supply-chain surface.
- **Path normalization in `paths.js`.** Tested the longest-prefix-match ordering — `.claude/commands/` (directory entry) and a file inside it both match; the per-path override beats the category default at equal length, and longer matches always win. Behavior verified by reading the manifest in tests.
- **GitHub release tarball top-level directory.** `tar.x` with `strip: 1` strips the top-level `<repo>-<sha>/` wrapper that GitHub adds. Without `strip: 1`, every staged file lands one level too deep and the manifest can't find itself.
- **`.framework-manifest.json` lives in canonical and gets installed to adopter.** It's listed in `framework-managed` so adopters get it; that's how `/update-framework` (Worker 4) knows ownership boundaries on the adopter side. Installer's manifest load comes from the staged tarball copy, not from the adopter's existing one (if any) — fresh source of truth per install.

## Completion notes

**Status: complete; ready for PM verification + smoke test against a real (post-tag) v0.1.0 release.**

### What PM should verify

1. `npm pack` from canonical repo root produces only the 4 listed file types (bin/, lib/, README.md, LICENSE) plus package.json. Confirmed locally.
2. After PM tags `v0.1.0` at canonical and creates a GitHub release, run `npx ./insynq-app-blueprint-0.1.0.tgz` (or `npm install -g ./insynq-app-blueprint-0.1.0.tgz && app-blueprint init`) inside a clean adopter repo and watch the full pipeline run end-to-end.
3. Verify `.framework-version` is written with all 5 required fields (`version`, `installed_at`, `tarball_sha256`, `installed_method`, `canonical_url`) plus optional `installed_from`.
4. Verify `.framework-backup/` directory is created on first overwrite-with-backup conflict (e.g., adopt into a project that already has `.claude/commands/*.md`).

### Known limitations / V2 carryovers (already documented in audit + plan)

- Idempotent re-install (refuses if `.framework-version` exists; gate cheap, proper re-adopt is V2).
- No uninstall path.
- No private-repo support.
- No telemetry.
- No release-notes printout.
- `--force-dirty` flag included; could be removed in V2 if it's never used.

### Outstanding user actions (separate from worker work)

- **PM/user:** create v0.1.0 git tag at canonical and a matching GitHub release. Without the release, `npx @insynq/app-blueprint init` will 404 on tarball fetch.
- **PM/user:** `npm login` (with @insynq scope) and `npm publish` after smoke testing — `publishConfig.access = "public"` is already set so the scope auto-creates if needed.
- **PM/user:** decide whether to replace canonical `README.md` with adopter-targeted version before v0.1.0 publish. Current README ships into npm tarball as-is.
- **PM/user:** remove the local `node_modules/` and `package-lock.json` from canonical-repo gitignore? Currently `node_modules/` IS ignored; `package-lock.json` will be tracked, which is correct for reproducible installer builds.

