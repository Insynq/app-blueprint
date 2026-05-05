# Changelog

> Maintained automatically by `/ship`. Newest entries at the top.
> Each entry represents one shipped commit or completed phase.
>
> This is the primary "what has been built and when" reference for Claude sessions.
> Read alongside `docs/KB_8_Current_State.md` for project history without reading git log.
>
> To generate this file from existing git history, run `/changelog`.

---

<!-- /ship prepends new entries below this line -->

## 2026-05-04 — Stack reference KB build-out

- Added 7 stack-reference KB families spanning auth, jobs, testing, forms, observability, billing, and AI. Each family has its own `00_Index` file plus 4–6 content KBs covering implementation patterns, cross-cutting rules, and stack-specific gotchas.
- Added `docs/KB_INDEX.md` — task-routing index across all 9 stack-reference folders (the 7 new families plus the existing Supabase Structure and UI:UX KBs). Maps ~15 representative cross-family build tasks to KB read order, plus a stack-layer lookup table and the cross-family always-true rules.

## 2026-05-04 — Sync .claude/commands with global; add /db-push and /research; align audit-* family

- Add `/db-push` (Supabase migration push with validate-migration safety) and `/research` (deep web research agent) to template.
- Refresh `/implement`, `/ship`, `/audit-code`, `/audit-infra`, `/audit-rls`, `/orchestrate`, `/brainstorm` from iterated global versions; scrub project-specific references so the template ships cleanly to fork users.
- Align `audit-code`, `audit-infra`, `audit-rls` on parallel structure: Core Question, "Actually read" emphasis, checkbox Summary, Verdict section.
