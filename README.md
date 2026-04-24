# App Blueprint

A Claude Code project template built around a methodology, not scaffolding.

## Philosophy

The most expensive mistakes in software happen when you build the wrong thing with confidence. This template enforces a discovery-first workflow that forces clarity before any code is written.

**The sequence that actually works:**
```
/kickoff → scope review → /brainstorm → /plan-review → /implement → /ship
```

## Getting Started

1. Clone or use this as a template to create your project folder
2. Open the folder in VS Code with Claude Code
3. Start a session and run `/kickoff`

The kickoff command guides you through a discovery session and produces all the foundational files. No configuration needed before that.

**Persistent Memory** — Each project gets a memory directory (`.claude/memory/`) that Claude reads at the start of every session. Kickoff seeds it with project concept, user preferences, and key decisions. Future sessions inherit this context automatically, so you don't repeat yourself across conversations.

## What Kickoff Produces

| File | Purpose |
|------|---------|
| `docs/APP_CONCEPT.md` | Problem statement, users, use cases, success criteria |
| `docs/SCOPE.md` | V1 boundaries, explicit out-of-scope, known unknowns |
| `CLAUDE.md` | Project context — every future Claude session reads this |
| `docs/KB_1_Architecture.md` | Architecture decisions and data model draft |
| `docs/KB_8_Current_State.md` | Phase tracker |
| `.claude/memory/` | Project concept and preference seeds |

## Command Library

### Workflow (Masters — coordinate everything else)
| Command | Purpose |
|---------|---------|
| `/kickoff` | Discovery session — run this first on any new project |
| `/orchestrate` | Full autonomous workflow — investigate → plan → implement |
| `/brainstorm` | Deep research + options before committing to an approach |
| `/implement` | Execute a validated plan (parallel agents + post-batch audit) |
| `/ship` | Update KBs, commit, push |

### Planning & Review
| Command | Purpose |
|---------|---------|
| `/investigate` | Deep codebase exploration — trace data flows, find all usages |
| `/plan` | Create implementation plan from investigation findings |
| `/plan-review` | Gap analysis on a spec doc before implementing |
| `/audit-code` | Review code/plans for elegance, reuse, anti-patterns, security |

### Security Audits
| Command | Purpose |
|---------|---------|
| `/audit-full` | Comprehensive security audit — code + database + infrastructure |
| `/audit-rls` | Database access control audit (SQL databases with row-level security) |
| `/audit-infra` | Infrastructure security — headers, dependencies, env vars, storage |

### Implementation
| Command | Purpose |
|---------|---------|
| `/debug` | Diagnose a bug — characterize symptom, investigate, form hypothesis, confirm before fixing |
| `/changelog` | Generate CHANGELOG.md from git history (run once; `/ship` maintains it going forward) |
| `/unify` | Consolidate duplicate/similar components into one normalized type with role/state variants |

### Generators
| Command | Purpose |
|---------|---------|
| `/gen-test` | Generate tests following project patterns |
| `/gen-migration` | Generate database migrations (SQL databases) |
| `/gen-component` | Generate UI components |
| `/visualize` | Generate ASCII diagrams (architecture, data flows, UI layouts) |
| `/update-kb` | Update knowledge base documents without committing |

## Recommended Workflows

### Full Workflow (for new features)
```
/kickoff                          ← once, at project start
     ↓
/brainstorm "what to build"       ← explore options with trade-offs
     ↓ (pick approach)
Create spec doc in /docs/
     ↓
/plan-review docs/my-spec.md      ← catch gaps before writing code
     ↓ (fill gaps, make decisions)
/implement docs/my-spec.md        ← parallel implementers + post-batch audit
     ↓
/ship "commit message"
```

### Quick Workflow (for clear, scoped tasks)
```
/orchestrate "feature description"
     ↓
/ship "commit message"
```

### Debug Workflow
```
/orchestrate --type debug "issue description"
     ↓
/implement "fix description"
     ↓
/ship "fix: description"
```

## Knowledge Base Conventions

| File | Contains |
|------|---------|
| `docs/APP_CONCEPT.md` | Problem, users, use cases (from kickoff) |
| `docs/SCOPE.md` | V1 scope, out-of-scope, known unknowns (from kickoff) |
| `docs/KB_1_Architecture.md` | Architecture decisions, tech stack, data model |
| `docs/KB_7_UI_Patterns.md` | UI patterns, component conventions, design decisions |
| `docs/KB_8_Current_State.md` | Active phase, session notes, changelog |

**Maintenance rules:**
- Completed phases: collapse to 2–3 line summaries. Full history in git.
- KB_8 session notes: only for active blockers. Clear after resolution.
- Changelog: one-liner entries only.
- Always update CLAUDE.md phase status when updating KBs.

## Customizing Permissions

Claude Code's allowed commands are configured in `.claude/settings.json`. By default only `npm`, `npx`, and `git` are pre-approved. Add your package manager and project-specific tools so Claude can run them without asking every time.

Common additions depending on your stack:
```json
"allowedTools": ["npm", "npx", "git", "pnpm", "bun", "supabase", "gh", "cargo", "python"]
```

Add any CLI tool your workflow requires. Only include tools you're comfortable Claude running autonomously.

## Stack Agnosticism

This template is deliberately stack-agnostic. The `/kickoff` command asks about your tech stack and populates `CLAUDE.md` accordingly. All commands read `CLAUDE.md` for project context rather than making assumptions.

Some commands have stack-specific sections:
- `/audit-rls` — SQL databases with row-level security (e.g., Supabase, PostgreSQL)
- `/gen-migration` — SQL databases
- `/audit-infra` — reads CLAUDE.md to understand your deployment stack

These are labeled clearly and can be skipped when they don't apply.

## Who This Is For

Anyone building a web app who wants to work systematically with Claude Code. The template provides the methodology and command library. You bring the idea and tech stack choices.
