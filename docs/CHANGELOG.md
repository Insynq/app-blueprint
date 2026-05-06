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

## 2026-05-06 — Local-dev tooling recommendations + multi-agent workflow doc

- Added `Local-Dev Tooling Recommendations` section to `/kickoff` (Tier 1/2/3 guidance: Docker Desktop, Supabase CLI, Vercel CLI, gh CLI, pnpm, direnv, plus stack-conditional tools). Wired `docs/MULTI_AGENT_WORKFLOW.md` into the CLAUDE.md template's reference docs list.
- Added `Local-dev tooling` sections to `BILL_KB_00_Index.md` (Stripe CLI: `stripe listen`, `stripe trigger`), `OBS_KB_00_Index.md` (Sentry CLI for releases + source maps, Axiom CLI for terminal log queries), and `JOB_KB_00_Index.md` (Trigger.dev and Inngest CLIs).
- Added `docs/MULTI_AGENT_WORKFLOW.md` — PM/worker context-window pattern: identification protocol (worker numbering, tab naming, dual response headers), communication modes (layman vs. technical for both PM and worker), concurrency cap + PM status board.

## 2026-05-04 — Stack reference KB build-out

- Added 7 stack-reference KB families spanning auth, jobs, testing, forms, observability, billing, and AI. Each family has its own `00_Index` file plus 4–6 content KBs covering implementation patterns, cross-cutting rules, and stack-specific gotchas.
- Added `docs/KB_INDEX.md` — task-routing index across all 9 stack-reference folders (the 7 new families plus the existing Supabase Structure and UI:UX KBs). Maps ~15 representative cross-family build tasks to KB read order, plus a stack-layer lookup table and the cross-family always-true rules.

## 2026-05-04 — Sync .claude/commands with global; add /db-push and /research; align audit-* family

- Add `/db-push` (Supabase migration push with validate-migration safety) and `/research` (deep web research agent) to template.
- Refresh `/implement`, `/ship`, `/audit-code`, `/audit-infra`, `/audit-rls`, `/orchestrate`, `/brainstorm` from iterated global versions; scrub project-specific references so the template ships cleanly to fork users.
- Align `audit-code`, `audit-infra`, `audit-rls` on parallel structure: Core Question, "Actually read" emphasis, checkbox Summary, Verdict section.
