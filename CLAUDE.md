> ⚠️ **This file is unpopulated until you run `/kickoff`.** Do not edit manually — kickoff discovery will fill in all `[TODO]` sections. If you see `[TODO]` markers, run `/kickoff` first.

# Project: [TODO — run /kickoff to populate this]

> **This file is the project foundation.** Every Claude session reads it at the start.
> Run `/kickoff` in a Claude Code session to complete the discovery session and populate these sections.

## Overview
[TODO — what this app does and for whom]

## Tech Stack
[TODO — populate during /kickoff]

## Build Commands
- Type check: [e.g., npx tsc --noEmit]
- Dev server: [e.g., npm run dev]
- Build: [e.g., npm run build]

## Roles
[TODO — user types and hierarchy. Skip if single user type.]

## Core Entities
[TODO — main domain concepts the app manages, not table names yet]

## Reference Documents
See `/docs` folder:
- `APP_CONCEPT.md`: Problem statement, users, use cases, success criteria
- `SCOPE.md`: V1 scope, out-of-scope, known unknowns
- `KB_1_Architecture.md`: Architecture decisions and data model
- `KB_7_UI_Patterns.md`: Application patterns catalog — UI rules, reusable components, hooks, backend patterns, architecture decisions
- `KB_8_Current_State.md`: Current phase and active tracking
- `KB_9_Screen_Catalog.md`: Inventory of every screen, modal, and dialog — check before building new UI surfaces
- `CHANGELOG.md`: Running log of what was shipped and when — maintained by `/ship`
- `LESSONS.md`: Running log of gotchas and hard-won lessons — read before debugging or implementing in unfamiliar areas

> **Note on KB numbering:** KB_1, KB_7, KB_8, KB_9 are template-provided. Numbers 2–6 are reserved for project-specific knowledge bases added during kickoff (architecture decisions, API contracts, data model, etc.).

## Current Phase
[TODO — Phase 1: Not Started]

## Patterns
[Empty — patterns emerge during development. Add here when established so all future sessions inherit them.]
- Spec docs: Live in `/docs/` with `*-spec.md` naming (e.g., `docs/feature-name-spec.md`). Created by `/brainstorm` or `/unify` output, consumed by `/plan-review` and `/implement`.

## Preferences
[TODO — populate during /kickoff with working style and communication preferences]

## Custom Commands
All commands live in `.claude/commands/`. Run `/kickoff` first on any new project.

### Orchestrators
| Command | Purpose |
|---------|---------|
| `/kickoff` | Discovery session — run this first on any new project |
| `/orchestrate` | Full autonomous workflow — investigate → plan → implement |
| `/audit-full` | Full security audit (code + DB access + infrastructure) in parallel |

### Planning & Review
| Command | Purpose |
|---------|---------|
| `/brainstorm` | Deep codebase research before committing to an approach |
| `/investigate` | Deep exploration — trace data flow, find all usages |
| `/plan` | Create an implementation plan from investigation findings |
| `/plan-review` | Gap analysis on a spec doc before implementing |

### Implementation
| Command | Purpose |
|---------|---------|
| `/implement` | Execute a validated plan (parallel agents + post-batch audit) |
| `/debug` | Diagnose and fix a bug — root-cause investigation before code changes |
| `/unify` | Find duplicate/similar components and design a unified replacement |
| `/ship` | Update KBs, write changelog entry, commit, push |
| `/changelog` | Generate or update CHANGELOG.md from git history |

### Auditing
| Command | Purpose |
|---------|---------|
| `/audit-code` | Review code/plans for elegance, reuse, anti-patterns, security |
| `/audit-rls` | Scan DB access policies for security gaps (SQL databases) |
| `/audit-infra` | Audit infrastructure — headers, dependencies, environment, CORS |

### Generators
| Command | Purpose |
|---------|---------|
| `/gen-test` | Generate tests following project patterns |
| `/gen-migration` | Generate database migrations (SQL databases) |
| `/gen-component` | Generate UI components |
| `/visualize` | Generate ASCII diagrams |
| `/update-kb` | Update knowledge base documents |

## KB Maintenance
- Completed phases: collapse to 2–3 line summaries. Full history lives in git.
- KB_8 session notes: only for active blockers or cross-session context. Clear after resolution.
- Changelog: one-liner entries only.
- Always update CLAUDE.md phase status when updating other KBs.

## DO NOT
[Empty — add hard constraints as they're discovered during development]
