---
description: Update KBs, commit changes, and push to remote
arguments:
  - name: message
    description: Commit message describing the changes
    required: true
  - name: phase
    description: Phase completed (e.g., "1.2") - triggers KB update if provided
    required: false
---

# Ship Orchestrator

**This command spawns a general-purpose subagent that updates documentation, commits, and pushes.**

## Action Required

Spawn a Task with `subagent_type: general-purpose` using the prompt below.

---

## Subagent Prompt

```
# Ship Orchestrator

Commit Message: **$ARGUMENTS.message**
{{#if phase}}Phase Completed: **$ARGUMENTS.phase**{{/if}}

## Your Role

You will:
1. Review what's changed
2. Update knowledge base documents (if phase provided)
3. Stage and commit all changes
4. Push to remote

You have access to: Read, Edit, Write, Bash, Glob, Grep tools.

## Step 1: Review Changes

```bash
git status
git diff --stat
```

If there are no changes to commit, STOP and report "Nothing to ship — working tree clean."

### Detect Deployment Needs
Read `CLAUDE.md` to understand the project's deployment stack. Then check:

```bash
# Check for uncommitted migration files
find . -name "*.sql" -newer .git/index 2>/dev/null | grep -v .git

# Check for changed server-side functions
git diff --name-only | grep -E "(functions|api|server)" | head -10
```

If deployment artifacts were changed, note this in the final output as a **deployment reminder**.

## Step 2: Update KBs (if phase provided)

{{#if phase}}
Phase $ARGUMENTS.phase is complete. Update these files:

### CLAUDE.md
- Mark phase $ARGUMENTS.phase as ✅ complete
- Update "Current Phase" section if needed

### docs/KB_8_Current_State.md
- Add one-liner changelog entry for phase completion
- Clear any resolved session notes

### Relevant planning KBs
- Collapse completed phase details to 2–3 line summary
{{/if}}

{{#unless phase}}
No phase specified — skip KB updates.
{{/unless}}

## Step 2.5: Update Changelog

If `docs/CHANGELOG.md` exists, prepend a new entry at the top (after the header comment, before any existing entries).

Get today's date:
```bash
date +%Y-%m-%d
```

Use `git diff --stat` and the commit message to write 2–4 specific bullets. Lead each with an action verb (Added, Fixed, Removed, Replaced, Extended).

Entry format:
```markdown
## YYYY-MM-DD{{#if phase}} — Phase $ARGUMENTS.phase:{{/if}} $ARGUMENTS.message
- [Specific thing that changed]
- [Another specific thing]
```

Example of good bullets: "Added `useCartIntakeForms` hook for pre-checkout form fetching", "Fixed scroll event blocked by modal overlay"
Example of bad bullets: "Improved performance", "Various bug fixes"

If `docs/CHANGELOG.md` does not exist, note in the final output: "CHANGELOG.md not found — run `/changelog` to initialize it from git history, then re-run `/ship`." Do not skip silently.

## Step 2.6: Update Screen Catalog (if screens were added)

If new screens, pages, or modals were built in this commit:
- Open `docs/KB_9_Screen_Catalog.md`
- Add an entry for each new screen following the format in that file's header
- If KB_9_Screen_Catalog.md does not exist, skip this step

## Step 3: Stage and Commit

```bash
git add -A
git diff --cached --stat
```

```bash
git commit -m "$ARGUMENTS.message

Co-Authored-By: Claude <noreply@anthropic.com>"
```

## Step 4: Push

```bash
git push
```

If push fails due to upstream changes:
```bash
git pull --rebase && git push
```

## Step 5: Final Output

```markdown
## Ship Complete

### Changes Shipped
[Summary from git diff --stat]

### KB Updates
[What was updated, or "None — no phase specified"]

### Commit
**Hash:** [short hash]
**Message:** $ARGUMENTS.message

### Deployment Needed?
[List any migration files, server functions, or deployment artifacts that were changed]
[Or: "No deployment artifacts changed"]
```

## Important

1. Always verify there are changes before committing
2. Use the exact commit message provided — don't modify it
3. Always include Co-Authored-By
4. If push fails, try rebase before escalating
5. Don't force push
```

---

## After Orchestrator Returns

1. **Nothing to commit** → no action needed
2. **Push failed** → resolve conflicts manually
3. **Deployment needed** → follow project-specific deployment steps
