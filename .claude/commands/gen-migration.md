---
description: Generate a database migration following project patterns (SQL databases)
arguments:
  - name: description
    description: What the migration does (e.g., "add user preferences table")
    required: true
---

# Migration Generator

> **Stack-specific:** This command is for SQL databases (e.g., PostgreSQL/Supabase). Adapt for your ORM/migration tool.

Generate a database migration following project conventions.

## Instructions for Claude

### Step 1: Read Project Context

Read `CLAUDE.md` to understand:
- Database in use and migration tool/folder
- Naming conventions for migrations
- Whether RLS is in use (and which tables require it)
- Established schema patterns (how similar tables are structured)

Also read `docs/LESSONS.md` if it exists — skim for DB-category entries (`[DB-*]`) before writing the migration. Full-table constraint audits and schema verification requirements are documented there.

If the project uses Supabase or Postgres, consult `docs/Supabase Structure KBs/SB_KB_00_Index.md` and read only the SB_KB files relevant to this migration (e.g., `SB_KB_1_Multi_Org_RLS.md` for tenancy, `SB_KB_12_RLS_Performance.md` for InitPlan idiom and indexing requirements).

### Step 2: Read Existing Migrations

Find 2–3 recent migration files similar in scope. Read them to understand:
- Exact naming format (`YYYYMMDDHHMMSS_description.sql` or similar)
- How tables are created (column naming conventions, default values, timestamps)
- How RLS is enabled and policies are written
- Whether SECURITY DEFINER functions are used for cross-table access
- How indexes and constraints are named
- Seed data patterns (if applicable)

### Step 3: Verify Before Writing

Before writing the migration:
- Identify any existing tables/columns the migration references
- Read their CREATE TABLE statements to get exact column names
- Verify foreign key targets exist
- Check for naming conflicts with existing objects

### Step 4: Generate the Migration

Write a complete migration file that includes:

1. **Schema changes** (CREATE TABLE, ALTER TABLE, CREATE INDEX, etc.)
2. **RLS setup** (if applicable to this project):
   - `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
   - Policies for each relevant operation (SELECT, INSERT, UPDATE, DELETE)
   - `REVOKE` statements for functions if SECURITY DEFINER is used
3. **Constraints** (CHECK constraints, UNIQUE constraints, FK constraints)
4. **Comments** explaining non-obvious design decisions
5. **Seed data** if the table needs initial records

### What to Check For

- **No wildcard grants** — don't `GRANT ALL` when specific permissions suffice
- **RLS on all new user-facing tables** — if the project uses RLS, every table needs it
- **Immutable audit tables** — INSERT only (no UPDATE or DELETE policies)
- **Recursion risk** — if a policy subqueries another RLS-protected table, use a SECURITY DEFINER helper
- **Search path safety** — all SECURITY DEFINER functions must include `SET search_path = public`
- **Column names** — use the project's established naming convention (snake_case, etc.)
- **Timestamps** — include `created_at` / `updated_at` where appropriate

### Output

Write the complete migration file to the correct path with the correct filename format. Then briefly note:
- What the migration creates/changes
- Any RLS policies created and who they grant access to
- Any follow-up required (type regeneration, UI updates)
