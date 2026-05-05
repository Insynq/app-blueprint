# App Blueprint

A Claude Code project template built around a methodology, not scaffolding.

> Built and maintained by [Insynq](https://insynqk.com). Source: [github.com/Insynq/claude-app-blueprint](https://github.com/Insynq/claude-app-blueprint).

## Philosophy

The most expensive mistakes in software happen when you build the wrong thing with confidence. This template enforces a discovery-first workflow that forces clarity before any code is written.

**The sequence that actually works:**
```
/preflight → /kickoff → scope review → /brainstorm → /plan-review → /implement → /ship
```

## Getting Started

### 1. Get the code

Pick whichever you have available — your AI agent doesn't need to figure this out.

**With git** (cross-platform, easiest):
```
git clone https://github.com/Insynq/claude-app-blueprint.git my-project
cd my-project
```

**Without git, on macOS/Linux:**
```
curl -L https://github.com/Insynq/claude-app-blueprint/archive/refs/heads/main.zip -o app-blueprint.zip
unzip app-blueprint.zip && mv claude-app-blueprint-main my-project && cd my-project
```

**Without git, on Windows (PowerShell):**
```
Invoke-WebRequest -Uri https://github.com/Insynq/claude-app-blueprint/archive/refs/heads/main.zip -OutFile app-blueprint.zip
Expand-Archive app-blueprint.zip
Move-Item claude-app-blueprint-main\claude-app-blueprint-main my-project
cd my-project
```

### 2. Open in your editor with an AI agent

Open the folder in VS Code (or your editor of choice). Any of these agents work: Claude Code, Codex, Cursor, Aider, Continue, Cline.

### 3. Run preflight

This is a one-time, sub-minute setup that records which agent + OS you're on into `CLAUDE.md` so future sessions don't have to re-figure it out. It also confirms the framework's `.md` instruction files weren't accidentally installed somewhere global.

- **Claude Code:** type `/preflight`
- **Other agents:** paste *"Read and follow the instructions in `.claude/commands/preflight.md`"*

### 4. Run kickoff

The discovery session that defines your app concept, scope, and architecture before any code is written.

- **Claude Code:** type `/kickoff`
- **Other agents:** paste *"Read and follow the instructions in `.claude/commands/kickoff.md`"*

> **Note for Codex / Cursor / non-Claude-Code agents:** The `.md` files in `.claude/commands/` are instruction documents, not commands you need to install. When the user types `/<name>`, just read the corresponding file and follow its steps inline. Don't copy them anywhere global.

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
| `/preflight` | One-time per clone — captures agent + OS into CLAUDE.md, verifies commands are project-local |
| `/kickoff` | Discovery session — run after `/preflight` on any new project |
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
/preflight                        ← once, on a fresh clone (agent + OS)
     ↓
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

---

**App Blueprint** is by [Insynq](https://insynqk.com) — operations-focused software design. Found this useful? A star on the [repo](https://github.com/Insynq/claude-app-blueprint) helps others discover it.
