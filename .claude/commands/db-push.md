---
description: Use when you have a Supabase migration ready to apply — validates with a dry-run and RLS audit, pushes it, then regenerates types. Reach for this to ship schema changes safely. Database only; does NOT deploy edge functions.
arguments:
  - name: file
    description: Migration file path. If omitted, auto-detects the latest unpushed migration.
    required: false
  - name: skip-audit
    description: Skip RLS audit (use for data-only/seed migrations that don't touch policies)
    required: false
---

# Database Push Orchestrator

**This skill spawns a general-purpose subagent that validates, audits, and pushes a migration safely.**

**Scope: Database migrations only.** This command does NOT deploy edge functions. Use `npx supabase functions deploy <name>` separately for edge functions.

## Action Required

Spawn a Task with `subagent_type: general-purpose` using the prompt below.

---

## Subagent Prompt

```
# Database Push Orchestrator

{{#if file}}Migration File: **$ARGUMENTS.file**{{/if}}
{{#if skip-audit}}Skip RLS Audit: **yes**{{/if}}

## Your Role

You are a safe database deployment orchestrator for any Supabase project. You will:
1. Identify the migration to deploy
2. Dry-run it against the live DB (BEGIN/ROLLBACK)
3. Audit RLS policies on affected tables (unless skipped)
4. Push only if all checks pass
5. Regenerate TypeScript types after push

You have access to: Read, Edit, Write, Bash, Glob, Grep, Task tools.

## Step 0: Detect Project Configuration

Before anything else, read the project config to extract key values:

```bash
# Get project ID
grep 'project_id' supabase/config.toml | head -1
```

Extract the project_id value. This is required for type generation.

Also detect the TypeScript types output path. Check in this order:
1. `supabase/config.toml` for a `[generate]` section with an `output` path
2. Run: `find . -name "*.ts" \( -path "*/supabase/types*" -o -path "*/database.types*" -o -name "types.ts" \) -not -path "*/node_modules/*" | head -10`
3. Fall back to these common defaults in order: `src/integrations/supabase/types.ts`, `src/types/supabase.ts`, `src/lib/database.types.ts`, `src/database.types.ts`

Report what you found before proceeding.

## Step 1: Identify Migration

{{#if file}}
Use the provided file: `$ARGUMENTS.file`

Verify it exists:
```bash
ls -la $ARGUMENTS.file
```
{{/if}}

{{#unless file}}
Find the latest migration file:
```bash
ls -t supabase/migrations/*.sql | head -5
```

Check which migrations are pending (not yet pushed):
```bash
npx supabase migration list 2>&1 | tail -20
```

Identify the migration(s) that haven't been applied yet. If multiple are pending, report all of them and use the oldest pending one first.
{{/unless}}

## Step 1.5: Pre-Existing Column Check

Before validating, check if the migration adds columns that already exist:

1. Read the migration SQL and extract all `ADD COLUMN` statements
2. For each column addition, check the generated types file (detected in Step 0) to see if the column already exists in the table's type definition
3. If a column already exists:
   - Report it: "Column `{column}` already exists on `{table}` — this ALTER will be a no-op with `IF NOT EXISTS` or will fail without it"
   - Check if the migration uses `IF NOT EXISTS` (safe) or not (will error)
   - Flag for user attention if not using `IF NOT EXISTS`

This prevents duplicate column additions from reaching the DB.

## Step 2: Validate Migration (Dry-Run)

A dry-run wraps the migration in BEGIN/ROLLBACK — all triggers, constraints, and RLS policies fire, but nothing is committed.

### Pre-flight: reject migrations with inline transaction control

Before any dry-run, check the migration file for top-level `BEGIN`/`COMMIT`/`ROLLBACK` statements:

```bash
if grep -qiE '^[[:space:]]*(BEGIN|COMMIT|ROLLBACK)[[:space:]]*;' <migration-file>; then
  echo "Error: migration contains its own BEGIN/COMMIT/ROLLBACK."
  echo "Postgres has no nested transactions, so an inner COMMIT ends the wrapping"
  echo "transaction and the trailing ROLLBACK becomes a no-op — the 'dry-run'"
  echo "would actually persist to the live DB."
  echo "Remove those statements (Supabase wraps each migration in a transaction"
  echo "automatically) and re-run."
  exit 1
fi
```

If this check fails, STOP. Tell the user to remove the inline transaction statements from the migration. Do NOT proceed to the dry-run — running it would commit the migration.

### Detect validation approach

First, check if this project has a custom validation script:
```bash
cat package.json 2>/dev/null | grep -E '"db:validate"|"db:dry-run"'
```

**If a `db:validate` script exists**, use it:
```bash
npm run db:validate -- <migration-file>
```

**If no custom script exists**, run the dry-run directly via psql. First check for DATABASE_URL:
```bash
grep 'DATABASE_URL' .env 2>/dev/null | head -1
```

If DATABASE_URL is available:
```bash
psql "$DATABASE_URL" << 'EOF'
\set ON_ERROR_STOP on
BEGIN;
\i <migration-file>
ROLLBACK;
EOF
```

`\set ON_ERROR_STOP on` is required — without it, psql prints errors but still exits 0, so a mid-migration failure would be silently reported as "validation passed."

If neither DATABASE_URL nor a validate script is available, skip the dry-run and note:
> "Dry-run skipped — no DATABASE_URL in .env and no db:validate script found. Proceeding with push directly. To enable dry-runs: add DATABASE_URL (Session Pooler string from Supabase dashboard) to your .env file."

**If validation FAILS:**
- Report the exact error
- DO NOT proceed to any further steps
- Suggest fixes based on the error:
  - `column X does not exist` → check table schema in earlier migrations
  - `violates check constraint` → verify enum/value constraints
  - `violates foreign key constraint` → check referenced table data
  - `RAISE EXCEPTION` → trigger validation failed, check trigger logic
- STOP here.

**If validation PASSES (or is skipped):**
- Report result
- Proceed to Step 3

## Step 3: Audit RLS Policies

{{#if skip-audit}}
RLS audit skipped (--skip-audit flag). Proceed to Step 4.
{{/if}}

{{#unless skip-audit}}
Read the migration file to identify which tables are affected:
- Tables created (`CREATE TABLE`)
- Tables altered (`ALTER TABLE`)
- Policies created/dropped (`CREATE POLICY`, `DROP POLICY`)
- RLS enabled (`ENABLE ROW LEVEL SECURITY`)

If the migration is data-only (INSERT/UPDATE/DELETE on data, no schema or policy changes), skip the RLS audit and note: "No schema/policy changes detected — RLS audit skipped."

Otherwise, spawn an Explore subagent to audit the affected tables:

```
# RLS Policy Auditor — Targeted Audit

Audit ONLY these tables affected by the migration: [list tables found above]

## Discover the Project's Auth Model

Before auditing, read the codebase to understand how this project implements auth:
1. Search for helper functions used in RLS policies: `grep -r "USING\|WITH CHECK" supabase/migrations/ | grep -v "^--" | head -30`
2. Look for custom role-checking functions in migrations: `grep -r "CREATE OR REPLACE FUNCTION" supabase/migrations/ | grep -i "role\|auth\|permission" | head -10`
3. Note what patterns are used (e.g., `auth.uid() = user_id`, custom `has_role()`, JWT claims, etc.)

## Check for each affected table:

1. **RLS enabled?** — `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` must be present
2. **Policy coverage** — Does it have SELECT/INSERT/UPDATE/DELETE policies as appropriate for the table's purpose?
3. **Overly permissive policies** — Flag any `USING (true)` or `WITH CHECK (true)` unless clearly intentional (e.g., a public read table)
4. **Direct auth pattern** — Are policies using the project's established auth helper functions consistently?
5. **Audit table pattern** — If this looks like an audit/log table (immutable records), it should have INSERT only — no UPDATE or DELETE policies
6. **Admin override** — Does the project have a superuser/admin role? If so, do new tables grant appropriate override access?

## Output Format
```markdown
### RLS Audit: [table_name]
- RLS enabled: Yes/No
- Policies: SELECT ✓ | INSERT ✓ | UPDATE ✓ | DELETE ✗ (intentional)
- Auth pattern: [e.g., "uses has_role() helper — consistent with project"]
- Issues: [any problems found, or "None"]
- Verdict: PASS / NEEDS FIX
```
```

**If RLS audit finds CRITICAL issues:**
- Report the issues clearly
- DO NOT proceed to push
- Suggest specific fixes
- STOP here.

**If RLS audit PASSES (or only warnings):**
- Report the audit summary
- Proceed to Step 4
{{/unless}}

## Step 4: Push Migration

Always pass `--linked` so the target project is unambiguous. The bare `db push` defaults to the linked project, but if multiple Supabase projects are linked across sibling repos, the explicit flag prevents pushing to the wrong one.

```bash
npx supabase db push --linked
```

If push fails:
- Report the error clearly
- Common fixes:
  - "has already been applied" → `supabase migration repair <version> --status reverted` then retry
  - Connection error → check Supabase project status at app.supabase.com
- Do NOT retry automatically — let the user decide

## Step 5: Regenerate TypeScript Types

After successful push, use the project_id detected in Step 0:

```bash
npx supabase gen types typescript --project-id <project_id> > <types-output-path>
```

Verify the types file was updated:
```bash
wc -l <types-output-path>
git diff --stat <types-output-path>
```

If project_id could not be detected, report:
> "Could not auto-detect project_id from supabase/config.toml. Run manually: `npx supabase gen types typescript --project-id YOUR_PROJECT_ID > <types-output-path>`"

## Step 6: Final Output

```markdown
## Database Push Complete

### Project
**Project ID:** [detected or "not found"]
**Types path:** [detected path]

### Migration
**File:** [filename]
**Validation:** ✓ Passed / ⊘ Skipped ([reason])

### RLS Audit
[✓ Passed / ⊘ Skipped (--skip-audit) / ⊘ Skipped (data-only migration)]
[Brief summary if audit ran]

### Push
**Status:** ✓ Success

### Type Generation
**Lines:** [line count]
**Changes:** [git diff stat or "no changes"]

### Summary
[Brief description of what the migration does]
```

## Important Instructions

1. **ALWAYS detect project config first** — project_id and types path before doing anything else
2. **NEVER skip validation** — attempt dry-run unless DATABASE_URL is genuinely unavailable
3. **STOP on any failure** — do not proceed past a failed step
4. **Report errors verbatim** — include the full error message
5. **Don't force anything** — if push fails, report and let the user decide
6. **Always regenerate types** — stale types cause frontend TypeScript errors
7. **Auto-detect data-only migrations** — skip RLS audit if no schema/policy changes
```

---

## After Orchestrator Returns

1. **Validation failed** → fix migration SQL, run `/db-push` again
2. **RLS audit failed** → fix policies in migration, run `/db-push` again
3. **Push failed** → check error, may need `supabase migration repair`
4. **Type gen failed** → run manually with the project_id from `supabase/config.toml`
5. **All passed** → migration is live, types are fresh, ready to develop
