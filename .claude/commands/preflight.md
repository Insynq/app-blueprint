---
description: One-time setup — detect agent + OS, verify commands are project-local, write environment context into CLAUDE.md
---

# Preflight — Run Once Per Project

Run this on a freshly cloned `app-blueprint` project, **before** `/kickoff`.

It captures three things into `CLAUDE.md` so future sessions don't have to re-figure them out:
1. **Which AI agent** is being used (Claude Code, Codex, Cursor, Aider, etc.)
2. **Which operating system** the user is on (macOS, Windows, Linux)
3. **Confirmation** that `.claude/commands/` is at the project root, not installed globally

Should take well under a minute.

## Why This Matters

- **Cross-agent portability.** Codex, Cursor, and other agents don't auto-load `.claude/commands/` the way Claude Code does. Recording the agent name lets future commands adapt their guidance.
- **OS-aware shell commands.** Build commands, paths, and shell syntax differ on Windows vs. macOS/Linux. Capturing the OS once means future sessions don't have to ask or guess.
- **Project-level commands, not global.** Some agents try to install commands into a global directory. The framework only works if the `.md` files live at `<project-root>/.claude/commands/`. Preflight verifies this.

## Instructions for the Agent

Work through the steps in order. Don't skip steps even if they seem trivial — the point is to leave a clean, written record in `CLAUDE.md`.

### Step 1 — Identify yourself (the agent)

State which AI coding agent you are. Common possibilities:
- **Claude Code** (Anthropic's CLI / VS Code extension / web app)
- **Codex** (OpenAI's CLI / VS Code extension)
- **Cursor** (built-in agent)
- **Aider**, **Continue**, **Cline**, or another tool

If you genuinely don't know, ask the user. Don't guess.

### Step 2 — Detect the operating system

Run a single shell command to detect the OS. Try in this order until one succeeds:
- `uname -s` → outputs `Darwin` (macOS) or `Linux`
- If `uname` fails, you're likely on Windows. Try `ver` (cmd) or `$PSVersionTable.OS` (PowerShell)

Also note the shell name (`zsh`, `bash`, `PowerShell`, `cmd`) — useful when building commands later.

### Step 3 — Verify commands are at the project root

Check that `.claude/commands/` exists at the project root and list the `.md` files inside.

The expected 23 commands:

```
audit-code, audit-full, audit-infra, audit-rls, brainstorm, changelog,
db-push, debug, gen-component, gen-migration, gen-test, implement,
investigate, kickoff, orchestrate, plan, plan-review, preflight,
research, ship, unify, update-kb, visualize
```

If any are missing, list which ones and STOP — do not attempt to recreate them. Tell the user the clone is incomplete and they should re-fetch the repo.

If the directory is missing entirely, the project files weren't extracted correctly.

**Important note for non-Claude-Code agents (Codex, Cursor, Aider, etc.):**
These `.md` files are **not** commands you need to install, register, or copy somewhere global. They are **instruction documents** that live with the project. When the user types `/<name>` or asks you to "run X," read the corresponding `.claude/commands/<name>.md` file and follow its instructions inline. Do not duplicate them into a user-global directory.

### Step 4 — Write environment to CLAUDE.md

Insert (or update) an `## Environment` section in `CLAUDE.md`. Place it directly after the `# Project: ...` heading and the introductory blockquote, **above** `## Overview`.

Use this exact structure:

```markdown
## Environment
- **Agent:** [Claude Code | Codex | Cursor | Aider | Other: <name>]
- **OS:** [macOS | Windows | Linux]
- **Shell:** [zsh | bash | PowerShell | cmd]
- **Captured:** YYYY-MM-DD
```

If an `## Environment` section already exists (preflight has been run before), update the values in place. Don't duplicate the section.

Use today's actual date for `Captured`.

### Step 5 — Confirm and hand off

Print a single short summary:

```
Preflight complete.
- Agent: <name>
- OS: <name>
- Shell: <name>
- Commands: <N> found at .claude/commands/

Next:
- Claude Code → run /kickoff
- Other agents → "read and follow .claude/commands/kickoff.md"
```

Then stop. Don't proceed into kickoff automatically — that's a separate, longer conversation the user starts when ready.
