# Framework Changelog

All notable changes to the **app-blueprint** framework.

Format: based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), structured for parsing by `/update-framework`.
Versioning: [Semantic Versioning](https://semver.org/).

## Parsing contract for `/update-framework`

The `/update-framework` command parses this file to surface migration notes and detect command renames during update operations. Maintainers of this framework MUST keep this format intact:

### Required structure

- Each version entry starts with: `## [X.Y.Z] - YYYY-MM-DD`
- The unreleased section uses: `## [Unreleased]`
- Within a version, subsections use H3 headers: `### Added`, `### Changed`, `### Removed`, `### Renamed`, `### Migration Notes`
- All five subsections are optional within a version; omit if empty (or include with content `N/A` or empty bullets — parser tolerates both)
- Order of subsections within a version: Added, Changed, Removed, Renamed, Migration Notes (parser is order-insensitive but consistency aids readability)
- Versions appear in **descending chronological order** (newest first), with `[Unreleased]` at the top

### `### Renamed` format (parser-critical)

One bullet per rename. Used by `/update-framework` to auto-create deprecation shims:

```
### Renamed
- `/old-command` → `/new-command` (slash command rename — auto-shim created)
- `docs/Old Path/` → `docs/New Path/` (directory rename — auto-detected during diff)
```

Format rules:
- Backticks around old and new names
- Single arrow `→` (Unicode) separating old and new — parser keys on this character
- Optional parenthetical explanation after the arrow
- Slash commands include the leading `/`

### `### Migration Notes` format

Free-form prose, displayed verbatim to users when they encounter the corresponding deprecated files during update. Group by what's changing:

```
### Migration Notes
- **`/old-command` → `/new-command`:** behavior is identical for V1; new name is more accurate. The auto-created shim will redirect for one version, then be removed in vX.Y.
- **`docs/Old Path/` → `docs/New Path/`:** Windows compatibility — colons in paths break `tar` extraction.
```

The parser surfaces these notes when:
- A user has the old file (rename detected via local file matching the canonical@install-version's old name)
- A `### Removed` entry mentions a file the user has locally

### Adopter projects do not have this file

Only the canonical repo (this repo) maintains `FRAMEWORK_CHANGELOG.md`. Adopter projects have their own `docs/CHANGELOG.md` for their project's state. Don't confuse the two.

---

## [Unreleased]

[Changes pending release land here.]

---

## [0.1.1] - 2026-05-08

Fix to v0.1.0's npm package — bin entry was rejected by npm and stripped during publish, leaving `npx @insynq/app-blueprint init` non-functional. Renamed bin to match the unscoped package name (`app-blueprint`), which is the conventional npm pattern. The user-visible install command is unchanged: `npx @insynq/app-blueprint init` still works because the bin script ignores `init` as an argv pass-through.

### Added

- N/A

### Changed

- `package.json` bin entry renamed from `init` → `app-blueprint`. The user-facing command `npx @insynq/app-blueprint init` is unchanged.

### Removed

- N/A

### Renamed

- N/A

### Migration Notes

- v0.1.0 was tagged at canonical but never successfully published to npm (initial publish attempt failed with E403 / 2FA, and bin-entry warning surfaced). v0.1.1 is the first effective release on npm. Users adopting from v0.1.0 do not exist.

---

## [0.1.0] - 2026-05-07

Initial public release of the app-blueprint framework.

### Added

- **npm installer:** `npx @insynq/app-blueprint init` performs a manifest-first install into an existing repo with full pre-flight gates and per-conflict prompts
- **`/adopt` slash command:** existing-repo onboarding — populates KBs from observation, audits existing user KBs against current code for stale references, and assists CLAUDE.md merge. Sibling to `/kickoff` (which handles greenfield)
- **`/update-framework` slash command:** pulls canonical framework updates with four-category review (FILES YOU CUSTOMIZED / UNCHANGED LOCALLY / NEW / DEPRECATED) and per-file resolution (skip / overwrite / `git merge-file`)
- **`.framework-manifest.json`:** declares 5 file categories — framework-managed, hybrid, project-owned, installer_generated, excluded — used by both installer and update command
- **`.framework-version`:** install-time metadata at adopter repo root — version, install timestamp, tarball SHA256, install method, canonical URL
- **Multi-agent workflow:** PM/worker phase loop driven by `/orchestrate` — pivot review → brainstorm → holistic plan + audit → worker dispatch → reconciliation → implementation → verification → smoke → ship
- **Stack-reference KB folders** (vetted patterns): Supabase, UI-UX, Auth, AI, Bill, Form, Job, Obs, Test
- **Project-state KB scaffolds:** KB_1 (Architecture), KB_7 (UI Patterns), KB_8 (Current State), KB_9 (Screen Catalog)

### Changed

- N/A (initial release)

### Removed

- N/A (initial release)

### Renamed

- N/A (initial release)

### Migration Notes

- N/A (initial release)
