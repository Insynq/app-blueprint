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
3. **Truth-in-world gate (not just `Failed`).** If any test in the diff's scope is currently in `Failed` status, STOP and report — do not ship until the failing test is resolved or explicitly deferred. Additionally, if any test in the diff's scope is **not** `Passed` (never-run, `Pending`, or absent), it is **not** truth-checked: the composed commit/changelog body (Step 5) MUST name it verbatim as `Unverified at ship: <id>` rather than asserting it as validated/working. A never-run smoke must surface as an unverified claim — it may never launder into a bare "Ship Complete." (This gate reads the literal catalog state, an external artifact — not an agent self-report, so it can't be rubber-stamped.)
4. **Trace-verified-pending count.** Scan for tests with both `Trace verified: <date>` and `Status: Pending`. Today's date is the reference for TTL math.
   - **0–14 days since trace:** report count in the ship summary as informational. Eyeball debt is fresh.
   - **15–30 days since trace:** report as a **WARN**. Eyeball debt is aging — list the affected IDs explicitly so the user sees them.
   - **>30 days since trace:** STOP and report. Do not ship until either (a) eyeball pass is run and `Status` flipped to `Passed`, or (b) the user explicitly authorizes shipping with overdue trace-verified smokes (capture the authorization in the ship commit body).
5. **Mention trace-deferred IDs in the ship commit body.** When the diff itself trace-verifies smokes (added the annotation in this batch), list the affected IDs in the commit body: "Shipping with `<ID>, <ID>, ...` trace-verified, eyeball pass deferred."
6. **Reconciliation rule for `Unverified` smokes.** Shipping with an `Unverified at ship: <id>` is allowed *only* if (a) a follow-up phase is named that will clear it, or (b) it is explicitly deferred with an **owner + date**. Otherwise `smoke-tests-pending.md` accumulates `Pending` entries unbounded — record every such deferral in the **Deferred prod smokes** rollup (Step 3.6 / `smoke-tests-pending.md`) so the debt stays visible across phases.
7. **Re-confirmation gate (a "pass" is not execution evidence).** A bare user "pass" / "looks good" is approval of *code quality*, not evidence of *test execution*. Do **not** flip a smoke `Pending → Passed` off an affirmation without a description of what was actually run (the steps exercised, the observed outcome). If no execution description is given, request one or keep the smoke `Unverified`.
8. **`live-required` service-boundary gate (N2).** A **service-boundary flow** — auth, email/outbox→delivery, webhooks, external-API or payment round-trips — has failure modes unit/typecheck/pgTAP green *cannot* model (auth-hook side effects, link encoding across a mail provider, OAuth/PKCE token compatibility). Any diff touching one requires a **live end-to-end smoke before prod exposure**; tag that smoke `live-required`. The truth-gate treats a `live-required` smoke as **gating, not deferrable-by-default** — it cannot ship `Passed` on unit/typecheck/pgTAP alone. It must be run, or explicitly user-waived with a logged per-smoke grant (Step 3.6 / N1). `Installed, not yet proven in a live run.`

If the file does not exist, skip this step (project hasn't adopted the catalog yet).

## Step 3.6: Phase Retro Sweep (only if the ship summary names a phase/wave)

A phase boundary is the moment to capture what the work taught. Route each signal to its EXISTING home — do **not** create a new retro doc; a second lessons artifact just forks the record and drifts.

Prompt yourself across these buckets and file each signal where it already lives:

- **Durable process / UX / architecture lessons** (a gotcha worth warning the next contributor about) → tagged entry in `docs/LESSONS.md` (`PROCESS-`, `UI-`, `ARCH-` per the file's existing convention). Every entry needs the real incident as its **Why**.
- **Architectural decisions made this phase** → `KB_8_Current_State.md` Recent Decisions (or `docs/KB_1_Architecture.md` `## Architecture Decisions` if durable).
- **Close-calls — things that almost shipped wrong** → a `PROCESS-` entry in `docs/LESSONS.md`; if a code trace or smoke nearly passed something broken, also log it in `tests/smoke/.calibration-log.md`.
- **Tooling / automation to build next time** (the one signal with no existing home — usually a framework or workflow improvement) → `docs/PARKING_LOT.md` Open, as a dated entry tagged `framework-meta`.

Keep it to signals that actually surfaced — an empty retro sweep is a valid outcome; don't manufacture lessons to fill buckets. "How the phase actually went" already lives in `phase-plan.md` (workflow Phase 10), so don't restate it here.

### Deferred-smoke debt rollup + phase-boundary forcing function (N1)

A phase boundary is also the moment to confront *cross-phase verification debt* — the smokes that keep getting deferred. Step 3.5's truth-gate hardens a *single* ship; nothing else stops `Unverified` smokes from accumulating silently across phases until a "we've been shipping fine" posture quietly authorizes itself. Do this every phase boundary:

1. **Emit the rollup.** Read the **Deferred prod smokes** section of `docs/smoke-tests-pending.md` and surface the **accumulated count** of still-deferred prod smokes (with their owners + deferral dates + the ship each rode). This count goes in the ship summary, not buried.
2. **Forbid the self-authorized "authorized posture."** Deferring a prod smoke *past a phase boundary* requires an **explicit, logged user grant per smoke** — not a pattern claimed from prior phases ("we shipped the last three this way"). No blanket posture clears the gate; each carried-over smoke needs its own logged grant.
3. **Outcome over output.** Judge the phase by whether the **user's surface actually shrank**, weighting the concrete deferred-debt count over the count of artifacts shipped. A phase that shipped ten files but grew the deferred-smoke backlog did not reduce risk.

`Installed, not yet proven in a live run.`

## Step 4: Stage Changes

Stage all modified files:
```bash
git add -A
```

Review what's staged:
```bash
git diff --cached --stat
```

## Step 4.5: Manifest completeness gate (canonical repo ONLY — auto-skips in adopter projects)

Prevents shipping a release whose `.framework-manifest.json` doesn't account for every tracked file — the failure mode where a newly-added `docs/` root file (or any new path) is missing from the manifest, so `/update-framework` can't categorize it and mishandles the per-file merge for adopters.

**Guard — if this does not print `CANONICAL`, SKIP this step** (adopter projects don't ship the manifest):
```bash
if [ -f FRAMEWORK_CHANGELOG.md ] && [ -f bin/init.js ]; then echo "CANONICAL"; else echo "ADOPTER — skip Step 4.5"; fi
```

If `CANONICAL`, verify every tracked file is covered by a manifest rule — an exact file entry, or a directory entry ending in `/`:
```bash
node -e '
const fs=require("fs"),cp=require("child_process");
const m=JSON.parse(fs.readFileSync(".framework-manifest.json","utf8"));
const rules=[].concat(...Object.values(m.categories));
const dirs=rules.filter(r=>r.endsWith("/"));
const files=new Set(rules.filter(r=>!r.endsWith("/")));
const tracked=cp.execSync("git ls-files",{encoding:"utf8"}).trim().split("\n").filter(Boolean);
const covered=f=>files.has(f)||dirs.some(d=>f.startsWith(d));
const bad=tracked.filter(f=>!covered(f));
if(bad.length){console.error("✗ MANIFEST INCOMPLETE — "+bad.length+" uncovered file(s):\n"+bad.map(x=>"  "+x).join("\n"));process.exit(1);}
console.log("✓ manifest complete: all "+tracked.length+" tracked files covered");
'
```

- **`✓ manifest complete`** → proceed to commit.
- **`✗ MANIFEST INCOMPLETE`** → STOP. Do not commit or publish. For each uncovered file, add it to the right `categories` list in `.framework-manifest.json` — `framework-managed` (framework owns it), `hybrid` (adopters fill it in), `project-owned` (adopters own it), or `excluded` (never ships — e.g. internal specs/audits) — then re-run `/ship`. Remember: `docs/` root files must be enumerated explicitly (no directory rule applies to them).
- If `node` is unavailable, report "manifest gate skipped: node not found" and continue — don't block a ship on missing tooling.

## Step 5: Commit

**Compose** a clean commit message from the ship summary — do not paste the summary verbatim:
- **Subject:** ≤72 chars, imperative mood, no trailing period.
- Blank line.
- **Body:** 1–3 short paragraphs distilling *what changed and why* — fold in quality gates run, smoke-test status, and any migration note. Drop meta-instructions aimed at the agent ("highest priority", "don't forget …").
- **Never** emit template tokens (`$ARGUMENTS`, `.message`, `.phase`, `{{…}}`) into the message.

> **Provenance discipline.** For every claim you carry forward from a worker/sub-agent self-report (smoke status, worker completion notes, the loose brief's quality-gate assertions), tag it `[verified: how]` or `[relayed: source-said]`; never harden a hedge ("appears to" stays "appears to," a grep-count stays a grep-count); re-read the source's own caveats and carry the strongest dissenting line forward so the commit's front-confidence never exceeds its back-caveats. The body may **not** assert more completion than the smoke catalog (Step 3.5) actually verified — carry any `Unverified at ship: <id>` line through **verbatim**, and never relabel a code-level read ("verified at code level") as an end-to-end pass.

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

**npm note (fresh-install path):** publishing the GitHub release does NOT publish to npm. The `npx` installer (`bin/init.js`) fetches its framework tarball from the git tag matching its *own* `package.json` version, so npm's `latest` must always have a matching git tag — otherwise a fresh `npx @insynq/app-blueprint` 404s on a nonexistent tag (this is exactly how npm's `0.1.4` latest broke: `v0.1.4` was never tagged). After a release, run `npm publish` (needs interactive npm auth — cannot be auto-run here) so the installer version keeps pace with the tags. Flag in the final output that npm still needs a manual `npm publish`.

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
