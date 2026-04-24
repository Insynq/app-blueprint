---
description: Update knowledge base documents to reflect current project state
arguments:
  - name: phase
    description: Phase that just completed (e.g., "1.2") — triggers phase-specific updates
    required: false
  - name: focus
    description: Specific KB to update - "architecture", "current-state", "ui-patterns", or "all" (default)
    required: false
---

# Update Knowledge Base

Update project documentation to reflect the current state. Run this after significant changes or phase completions, before committing.

## Instructions for Claude

### Step 1: Understand What Changed

If a phase was specified:
- Read `CLAUDE.md` to understand the phase structure
- Run `git diff --stat` to see what files changed
- Read the changed files to understand what was implemented

If no phase specified:
- Run `git status` and `git diff --stat` to see pending changes
- Read changed files to understand what happened

### Step 2: Update the Relevant KBs

**Always update `docs/KB_8_Current_State.md`:**
- Mark the completed phase as ✅
- Add a one-liner changelog entry: `Phase X.Y — [Description] ✅`
- Clear any session notes that were resolved
- Update "Active Phase" to the next phase

**Update `CLAUDE.md` if:**
- A phase status changed
- New patterns were established (add to Patterns section)
- New hard constraints were discovered (add to DO NOT section)
- The tech stack changed

**Update `docs/KB_1_Architecture.md` if:**
- Data model changed (new tables, new relationships)
- Architecture decisions were made
- New services or integrations were added

**Update `docs/KB_7_UI_Patterns.md` if:**
- New UI patterns were established
- Component conventions were documented
- Design decisions were recorded

### Step 3: KB Maintenance Rules

- **Completed phases**: Collapse to 2–3 line summary. Full history is in git.
- **Session notes** in KB_8: Only for active blockers or cross-session context. Clear after resolution.
- **Changelog entries**: One line only — `Phase X.Y — Description ✅`
- **Patterns section**: Add patterns only when established and should be followed project-wide.
- **DO NOT section**: Add only genuine hard constraints, not preferences.

### Step 4: Report

List every file updated and what changed in each.
