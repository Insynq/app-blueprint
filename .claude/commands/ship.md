---
description: Use when a chunk of work is done and verified and you are ready to land it — updates project docs and KBs, writes a changelog entry, commits, and pushes. Reach for this at the end of a phase; run from the PM context, not a worker.
arguments:
  - name: summary
    description: Free-text summary of what to ship — a brief, NOT a paste-ready commit message (the orchestrator composes the commit message from it). If it names a phase/wave, that drives the doc-status updates.
    required: true
---

# Ship Orchestrator

**This skill spawns a general-purpose subagent that updates documentation, commits, and pushes.**

## Action Required

Spawn a Task with `subagent_type: general-purpose` using the prompt below.

---

## Subagent Prompt

```
# Ship Orchestrator

Ship summary (free text — what to ship): **$ARGUMENTS**

> `$ARGUMENTS` is a loose brief, **not** a paste-ready commit message — you COMPOSE the commit message from it in Step 5. The Skill harness substitutes only this single flat `$ARGUMENTS` string: there is no `$ARGUMENTS.message` or `$ARGUMENTS.phase`, and Handlebars (`{{…}}`) is not processed. Never emit those tokens into any output. If the summary names a phase or wave (e.g. "Phase 6.5", "auth-refactor"), that name drives the Step 3 doc-status updates and the Step 3.6 retro sweep.

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

### If the ship summary names a phase/wave

That phase/wave is complete. Find and update:

1. **CLAUDE.md** — Mark the named phase as ✅ complete. Update "Current Phase" or equivalent section to advance to the next item.

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

## Step 3.5: Sweep Smoke-Test Catalog

If `docs/smoke-tests-pending.md` exists:

1. Read it. Look for sections where every test is `Passed (YYYY-MM-DD)` — collapse those sections in this commit to a one-liner (e.g., `Phase 2 — all 5 tests passed 2026-05-15. See git history for detail.`). Don't batch this across releases; do it now.
2. Check if the diff introduces behavior that needs new manual verification (UI flows, OAuth, payments, third-party webhooks, migrations, browser-specific bugs, race conditions). If so, propose new entries to add — assign stable IDs following the `<SECTION>-<NUMBER>` or `<SECTION>-<TYPE><NUMBER>` convention (do NOT reuse retired IDs) and tag each with a `Lane` per [smoke-tests-pending.md → Lanes](../../docs/smoke-tests-pending.md#lanes).
3. If any test in the diff's scope is currently in `Failed` status, STOP and report — do not ship until the failing test is resolved or explicitly deferred.
4. **Trace-verified-pending count.** Scan for tests with both `Trace verified: <date>` and `Status: Pending`. Today's date is the reference for TTL math.
   - **0–14 days since trace:** report count in the ship summary as informational. Eyeball debt is fresh.
   - **15–30 days since trace:** report as a **WARN**. Eyeball debt is aging — list the affected IDs explicitly so the user sees them.
   - **>30 days since trace:** STOP and report. Do not ship until either (a) eyeball pass is run and `Status` flipped to `Passed`, or (b) the user explicitly authorizes shipping with overdue trace-verified smokes (capture the authorization in the ship commit body).
5. **Mention trace-deferred IDs in the ship commit body.** When the diff itself trace-verifies smokes (added the annotation in this batch), list the affected IDs in the commit body: "Shipping with `<ID>, <ID>, ...` trace-verified, eyeball pass deferred."

If the file does not exist, skip this step (project hasn't adopted the catalog yet).

## Step 3.6: Phase Retro Sweep (only if the ship summary names a phase/wave)

A phase boundary is the moment to capture what the work taught. Route each signal to its EXISTING home — do **not** create a new retro doc; a second lessons artifact just forks the record and drifts.

Prompt yourself across these buckets and file each signal where it already lives:

- **Durable process / UX / architecture lessons** (a gotcha worth warning the next contributor about) → tagged entry in `docs/LESSONS.md` (`PROCESS-`, `UI-`, `ARCH-` per the file's existing convention). Every entry needs the real incident as its **Why**.
- **Architectural decisions made this phase** → `KB_8_Current_State.md` Recent Decisions (or `docs/KB_1_Architecture.md` `## Architecture Decisions` if durable).
- **Close-calls — things that almost shipped wrong** → a `PROCESS-` entry in `docs/LESSONS.md`; if a code trace or smoke nearly passed something broken, also log it in `tests/smoke/.calibration-log.md`.
- **Tooling / automation to build next time** (the one signal with no existing home — usually a framework or workflow improvement) → `docs/PARKING_LOT.md` Open, as a dated entry tagged `framework-meta`.

Keep it to signals that actually surfaced — an empty retro sweep is a valid outcome; don't manufacture lessons to fill buckets. "How the phase actually went" already lives in `phase-plan.md` (workflow Phase 10), so don't restate it here.

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

**Compose** a clean commit message from the ship summary — do not paste the summary verbatim:
- **Subject:** ≤72 chars, imperative mood, no trailing period.
- Blank line.
- **Body:** 1–3 short paragraphs distilling *what changed and why* — fold in quality gates run, smoke-test status, and any migration note. Drop meta-instructions aimed at the agent ("highest priority", "don't forget …").
- **Never** emit template tokens (`$ARGUMENTS`, `.message`, `.phase`, `{{…}}`) into the message.

Then commit with both trailers:

```bash
git commit -m "<composed subject>

<composed body>

Co-Authored-By: Claude <MODEL> <noreply@anthropic.com>
Built-With: Insynq's Framework — https://github.com/Insynq/claude-app-blueprint — https://insynqk.com"
```

Replace `<MODEL>` with the model actually executing this ship (e.g. `Opus 4.8`) — do **not** hardcode a version into the template; it drifts. The `Built-With:` trailer credits the framework this project was scaffolded from and links Insynq's site. Keep it on every commit unless the user explicitly says to remove it for a specific repo.

## Step 6: Push

```bash
git push
```

If push fails due to upstream changes:
```bash
git pull --rebase && git push
```

If push fails for any other reason, report the error and STOP — do not force push.

## Step 6.5: Merge to main + branch cleanup (GATED — only on an explicit land/merge request)

**Default: do NOT merge.** `/ship` commits and pushes the working branch; landing to `main` is a separate decision. Run this step ONLY when the ship request explicitly says to land it — phrases like "ship and merge", "land it", "merge to main". Otherwise SKIP this step and, in the final output, remind the user to open a PR for the pushed branch.

When gated ON:

1. Resolve the working branch; if it's already `main` there is nothing to merge — skip the rest of this step:
```bash
BRANCH=$(git branch --show-current)
[ "$BRANCH" = "main" ] && echo "Already on main — no merge needed (skip rest of Step 6.5)"
```

2. **Stacked-branch check.** If `$BRANCH` was stacked on another *unmerged* feature branch, merging it lands the parent's commits too. If stacked, confirm with the user before proceeding.

3. Fast-forward `main`, then merge with a merge commit:
```bash
git checkout main
git pull --ff-only
git merge --no-ff "$BRANCH" -m "Merge $BRANCH"
```

4. **Stop on conflict.** If the merge reports conflicts, do NOT resolve blindly — run `git merge --abort`, surface the conflicting files to the user, and STOP. Never force anything.

5. Verify the result (run the build/typecheck if the project has one, else confirm `git status` is clean), then push `main`:
```bash
git push origin main
```

6. Delete the merged branch locally and on the remote — **safe deletes only**:
```bash
git branch -d "$BRANCH"          # -d (never -D): refuses if the branch isn't fully merged
git push origin --delete "$BRANCH" 2>/dev/null || echo "remote branch already gone (auto-delete on merge?) — fine"
git remote prune origin
```

**Safety rails:** stop on any merge conflict; never `--force`/`-f` push; never `git branch -D` (force-delete); tolerate an already-deleted remote branch.

**Companion (PR-merge path):** this step cleans up only the *in-session* merge. For PR merges, enable GitHub's "Automatically delete head branches" once per repo — `gh repo edit --delete-branch-on-merge` — so merged PR branches are removed automatically.

## Step 6.6: Publish Framework Release (canonical repo ONLY — auto-skips in adopter projects)

This closes a real gap: `/update-framework` resolves versions from the GitHub **Releases** API, so a framework version that is committed but never released is invisible to every adopter project. If this is the canonical framework repo and this ship bumped the version, cut the release now so adopters can actually pull it.

**Guard — run this detection FIRST. If it does not print `CANONICAL`, SKIP this entire step** (you are in an adopter project building a real app; there is no framework release to cut):

```bash
if [ -f FRAMEWORK_CHANGELOG.md ] && [ -f bin/init.js ]; then echo "CANONICAL"; else echo "ADOPTER — skip Step 6.6"; fi
```

If `CANONICAL`, proceed:

1. Read the version that was just shipped:
```bash
VERSION=$(node -p "require('./package.json').version")
echo "Shipped version: $VERSION"
```

2. Idempotency check — a re-run of `/ship` must never error here:
```bash
gh release view "v$VERSION" >/dev/null 2>&1 && echo "EXISTS" || echo "MISSING"
```
If `EXISTS`, SKIP the rest of this step and note "release v$VERSION already published" in the final output.

3. If `MISSING`, extract this version's notes from `FRAMEWORK_CHANGELOG.md` (everything under the `## [$VERSION]` header up to the next `## [`):
```bash
awk -v v="$VERSION" '$0 ~ "^## \\["v"\\]" {g=1; next} g && /^## \[/ {exit} g {print}' \
  FRAMEWORK_CHANGELOG.md > "/tmp/release-notes-$VERSION.md"
test -s "/tmp/release-notes-$VERSION.md" || echo "WARN: no changelog section for v$VERSION — release will use a placeholder note"
```

4. Tag the shipped commit and create the release. **Stable vs. pre-release matters**: a version containing `-` (e.g. `0.2.0-beta.1`) is a pre-release — mark it `--prerelease` and do NOT pass `--latest` (the `/update-framework` default path deliberately excludes pre-releases). Otherwise mark it `--latest`:
```bash
git tag -a "v$VERSION" -m "v$VERSION" && git push origin "v$VERSION"
# Guarantee a non-empty notes file so --notes-file is always one valid, quoted arg
test -s "/tmp/release-notes-$VERSION.md" || printf 'v%s\n' "$VERSION" > "/tmp/release-notes-$VERSION.md"
# Stable vs. pre-release via shell-native glob — immune to grep/ugrep aliases and arg-splitting.
# A version containing '-' (e.g. 0.2.0-beta.1) is a pre-release: mark it --prerelease and do NOT
# pass --latest (the /update-framework default path deliberately excludes pre-releases).
case "$VERSION" in
  *-*) gh release create "v$VERSION" --title "v$VERSION" --prerelease --notes-file "/tmp/release-notes-$VERSION.md" ;;
  *)   gh release create "v$VERSION" --title "v$VERSION" --latest     --notes-file "/tmp/release-notes-$VERSION.md" ;;
esac
```

5. Verify the adopter-facing endpoint now resolves to this version (stable releases only):
```bash
curl -sS -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/Insynq/app-blueprint/releases/latest | grep -E '"tag_name"|"prerelease"'
```

**Failure handling — never fail the ship for a release problem.** The commit and push already succeeded; the work is safe. If `gh` is missing or unauthenticated, or any command above fails, do NOT stop or roll back — report `release step skipped: <reason> — run 'gh release create v$VERSION --latest' manually` in the final output and continue to Step 7.

**Branch note:** the release is cut at the commit you just shipped — which, if the gated Step 6.5 merge ran, is now the merge commit on `main`. For framework ships the released commit should be on `main` so the default branch never drifts behind the published release; if you shipped from a feature branch and skipped Step 6.5, flag in the final output that `main` may need the merge.

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
**Message:** [the composed commit subject line]

### Push
[Success + remote URL, or error details]

### Merge / branch
[If Step 6.5 ran: merged <branch> → main, branch deleted. Otherwise: pushed <branch> — open a PR to land it.]
```

## Important Instructions

1. **Don't skip git status** — always verify there are changes first
2. **Update docs before staging** — doc changes should be part of the same commit
3. **Compose the commit message from the ship summary** (Step 5) — distill, don't paste. Never emit template tokens (`$ARGUMENTS`, `.message`, `.phase`, `{{…}}`) into the commit.
4. **Always include Co-Authored-By and Built-With trailers** — required for all commits unless the user has explicitly asked to remove them; set the Co-Authored-By model to the one actually executing this ship.
5. **Merge to main only when explicitly asked** (Step 6.5) — default is push-branch + remind to open a PR. Never force-push; never force-delete a branch.
6. **Never force push** — if push fails after pull --rebase, report and stop
7. **Report failures clearly** — if any step fails, stop and explain
```

---

## After Orchestrator Returns

1. **Nothing to commit** → No action needed
2. **Push failed** → May need to resolve conflicts manually
3. **Doc update failed** → Run `/update-kb` manually, then commit and push
