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

## 2026-05-04 — Sync .claude/commands with global; add /db-push and /research; align audit-* family

- Add `/db-push` (Supabase migration push with validate-migration safety) and `/research` (deep web research agent) to template.
- Refresh `/implement`, `/ship`, `/audit-code`, `/audit-infra`, `/audit-rls`, `/orchestrate`, `/brainstorm` from iterated global versions; scrub project-specific references so the template ships cleanly to fork users.
- Align `audit-code`, `audit-infra`, `audit-rls` on parallel structure: Core Question, "Actually read" emphasis, checkbox Summary, Verdict section.
