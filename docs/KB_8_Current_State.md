# KB 8 — Current State

> This is the active tracking file. Keep it current — every Claude session reads it to orient on where the project stands.

## Active Phase
Phase 1 — **framework-distribution** — Phase 9 (smoking) — awaiting user actions

## Session Notes
- Outstanding user actions blocking smoke tests:
  - Rename GitHub repo `claude-app-blueprint` → `app-blueprint`
  - Reserve `@insynq` npm scope + verify `@insynq/app-blueprint` package availability
  - Tag `v0.1.0` GitHub release with tarball
  - Publish `@insynq/app-blueprint@0.1.0` to npm
- Once those are done: run smoke tests `FWD-1` through `FWD-7` from `docs/smoke-tests-pending.md`. `FWD-8` blocked until v0.2.0 ships.

## Changelog
<!-- Format: Phase X.Y — Description ✅ -->
- Phase 1 (framework-distribution) — Built installer (npm package), `/adopt` command, `/update-framework` command, `.framework-manifest.json`, `FRAMEWORK_CHANGELOG.md`, public README. Renamed `docs/UI:UX KBs/` → `docs/UI-UX KBs/`. Implementation complete; smokes pending user actions.
