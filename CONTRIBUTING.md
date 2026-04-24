# Contributing to app-blueprint

## What this repo is

A starter template for AI-assisted app development with Claude Code. It ships opinionated commands, knowledge base shells, and workflow patterns — not application code.

## How to contribute

**Found a gap in a command?** Open an issue describing:
- Which command (`/kickoff`, `/implement`, etc.)
- What the command does that's wrong or missing
- What it should do instead

**Found a missing anti-pattern or lesson?** Open an issue or PR with the entry formatted as `[CATEGORY-N]` following the pattern in `docs/LESSONS.md`.

**Want to add a new command?** Open an issue first to discuss scope. New commands should:
- Follow the existing file format (frontmatter description + arguments)
- Be added to the command table in `CLAUDE.md`
- Not duplicate functionality of an existing command

## Reporting issues

Use GitHub Issues at this repository. Include:
1. Which command or file the issue is in
2. What you expected it to do
3. What it actually did (or didn't do)

## Style guidelines

- Commands are written as instructions to Claude, not to users
- No project-specific assumptions (no Supabase, Stripe, etc. references in generic commands)
- Anti-patterns table rows: `| Pattern | Severity | Why It's Bad |`
- LESSONS.md entries: rule + **WHY:** + **HOW TO APPLY:**
