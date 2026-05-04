---
description: Update project docs, commit changes, and push to remote
arguments:
  - name: message
    description: Commit message describing the changes
    required: true
  - name: phase
    description: Phase or milestone completed (e.g., "6.5", "v2", "auth-refactor") - triggers doc status updates
    required: false
---

# Ship Orchestrator

**This skill spawns a general-purpose subagent that updates documentation, commits, and pushes.**

## Action Required

Spawn a Task with `subagent_type: general-purpose` using the prompt below.

---

## Subagent Prompt

```
# Ship Orchestrator

Commit Message: **$ARGUMENTS.message**
{{#if phase}}Phase Completed: **$ARGUMENTS.phase**{{/if}}

## Your Role

You are a shipping orchestrator. You will:
1. Review what's being shipped
2. Update project documentation to reflect the work
3. Stage and commit all changes
4. Push to remote

You have access to: Read, Edit, Write, Bash, Glob, Grep tools.

## Step 1: Review Changes

Run these to understand what's being shipped:
```bash
git status
git diff --stat
git log --oneline -5
```

If there are no changes to commit, STOP and report "Nothing to ship — working tree clean."

## Step 2: Discover Project Documentation

Read the project context to understand the doc structure:

1. Read `CLAUDE.md` — look for:
   - References to KB or doc files (e.g., "See `/docs` folder:", file paths)
   - Current phase status section
   - Documentation conventions or maintenance rules

2. Glob for docs: `docs/**/*.md` — list all doc files

3. Identify the docs most likely to need updating based on the git diff:
   - **Current state / session tracking** — most frequently updated doc
   - **Planning or phase docs** — if a phase was completed
   - **CLAUDE.md itself** — if phase status needs updating

If no `docs/` folder exists, check for `README.md` or `.claude/*.md` files.

## Step 3: Update Documentation

### If phase argument is provided

Phase **$ARGUMENTS.phase** is complete. Find and update:

1. **CLAUDE.md** — Mark phase $ARGUMENTS.phase as ✅ complete. Update "Current Phase" or equivalent section to advance to the next item.

2. **Current state doc** — The doc that tracks active work (highest-traffic KB, STATUS.md, etc.).
   Add a one-liner completion entry and clear any resolved session notes for this phase.

3. **Planning doc for this phase** — If found, collapse the completed phase details to a 2-3 line summary:
   - What was built
   - Key deviations from plan (if any)
   - Reference git history for full details

### Always (regardless of phase argument)

Review the git diff. If the changes introduce new features, patterns, or conventions not yet reflected in docs:
- Add a one-liner changelog entry to the relevant docs
- Update any "Recent Additions" or equivalent section in CLAUDE.md if significant enough

### Documentation conventions to apply

**Status emojis:** ✅ Complete | ⏳ In Progress / Next | 📋 Deferred

**Changelog format** — one-liner entries only:
```
| Version | Date | Changes |
| v2.5 | 2026-02-04 | Phase 6.5 complete - Stripe integration |
```

**Collapsed phase format:**
```
### Phase X.Y — Name
[What was built in 1-2 sentences]. [Key deviation if any.]
```

**Versioned docs:** Always bump VERSION and DATE when editing.

## Step 4: Stage Changes

Stage all modified files:
```bash
git add -A
```

Review what's staged:
```bash
git diff --cached --stat
```

## Step 5: Commit

```bash
git commit -m "$ARGUMENTS.message

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

## Step 6: Push

```bash
git push
```

If push fails due to upstream changes:
```bash
git pull --rebase && git push
```

If push fails for any other reason, report the error and STOP — do not force push.

## Step 7: Final Output

```markdown
## Ship Complete

### Changes Shipped
[git diff --stat summary]

### Documentation Updated
- [File]: [what changed]
- [File]: [what changed]
(or "No doc updates needed")

### Commit
**Hash:** [short hash]
**Message:** $ARGUMENTS.message

### Push
[Success + remote URL, or error details]
```

## Important Instructions

1. **Don't skip git status** — always verify there are changes first
2. **Update docs before staging** — doc changes should be part of the same commit
3. **Use the exact commit message provided** — don't modify it
4. **Always include Co-Authored-By** — required for all commits
5. **Never force push** — if push fails after pull --rebase, report and stop
6. **Report failures clearly** — if any step fails, stop and explain
```

---

## After Orchestrator Returns

1. **Nothing to commit** → No action needed
2. **Push failed** → May need to resolve conflicts manually
3. **Doc update failed** → Run `/update-kb` manually, then commit and push
