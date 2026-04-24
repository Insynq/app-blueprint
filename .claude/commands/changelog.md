---
description: Generate or update CHANGELOG.md from git history
arguments:
  - name: since
    description: Only include commits since this ref or date (e.g., "v1.0.0", "2026-01-01"). Defaults to all history.
    required: false
---

# Changelog Generator

Generate or update `docs/CHANGELOG.md` from git commit history.

**When to use:** Run once when adopting this template on an existing project, or to recover a changelog after a gap. After initial generation, `/ship` maintains the changelog automatically on every commit.

## Instructions for Claude

### Step 1: Check Existing Changelog

If `docs/CHANGELOG.md` exists, read it. Note the most recent entry's date and/or commit hash — stop there when generating to avoid duplication.

### Step 2: Get Commit History

```bash
git log {{#if since}}$ARGUMENTS.since..HEAD {{/if}}--format="%H|%ad|%s" --date=short --no-merges
```

Also get file-change stats per commit to inform bullet points:
```bash
git log {{#if since}}$ARGUMENTS.since..HEAD {{/if}}--stat --no-merges --format="COMMIT|%H|%ad|%s" --date=short | head -200
```

If `git log` returns no output (empty result):
- Report: "No commits found for the specified range. Check: (1) the `--since` date format (use YYYY-MM-DD), (2) whether the repository has commits in that range, or (3) omit `--since` to include all commits."
- Do not write an empty or partial CHANGELOG.md

### Step 3: Group Commits into Entries

Group related commits into logical entries. Grouping heuristics:
- Commits with the same phase label (e.g., "Phase 2.1: ...") → one entry
- Commits within 1–2 days that touch the same feature area → one entry
- Large standalone commits → one entry each

Skip: dependency bumps, formatting-only commits, merge commits, "fix typo" commits.

### Step 4: Write Each Entry

For each group, write:

```markdown
## YYYY-MM-DD{{#if phase}} — Phase X.X:{{/if}} Short descriptive title
- [What was added — specific, not vague]
- [What was changed or fixed]
- [What was removed, if notable]
```

Rules:
- Lead bullets with action verbs: Added, Fixed, Removed, Replaced, Moved, Extended
- Be specific: "Added `useCartIntakeForms` hook for pre-checkout intake form fetching" beats "Improved intake forms"
- 2–4 bullets per entry — more than that means it should be split into multiple entries
- Newest entries at the top

### Step 5: Write CHANGELOG.md

Write the complete `docs/CHANGELOG.md` file.

If the file already had entries, preserve them — prepend only the new entries generated in this run.

### Step 6: Report

Confirm:
- How many entries were written
- Date range covered
- Any commits that were skipped and why
