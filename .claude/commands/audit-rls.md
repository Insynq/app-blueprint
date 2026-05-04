---
description: Audit RLS policies for security gaps, anti-patterns, and missing coverage
arguments:
  - name: table
    description: Audit a specific table only (optional)
    required: false
  - name: focus
    description: Focus area - "gaps", "antipatterns", "audit-tables", or "all" (default)
    required: false
---

# RLS Audit Subagent

**IMPORTANT: This skill spawns a subagent to protect main context.**

## Action Required

Spawn a Task with `subagent_type: Explore` using the prompt below. The subagent will scan migrations and return a security report.

---

## Subagent Prompt

```
# RLS Policy Auditor

{{#if table}}Audit table: `$ARGUMENTS.table`{{/if}}
{{#if focus}}Focus: **$ARGUMENTS.focus**{{/if}}

## Core Question

> "Are RLS policies comprehensive, correctly scoped, and free of bypass vulnerabilities?"

## Step 0: Discover the Project's Auth Model

Before auditing, read the codebase to understand how this project implements auth and access control.

**From migrations** (`supabase/migrations/` if Supabase project):
- Search for custom role enums: `grep -r "CREATE TYPE.*role\|CREATE TYPE.*permission" supabase/migrations/`
- Search for auth helper functions: `grep -r "CREATE.*FUNCTION.*auth\|CREATE.*FUNCTION.*role\|CREATE.*FUNCTION.*permission" supabase/migrations/`
- Note what helper functions are available (e.g., `has_role()`, `has_any_role()`, custom JWT claims)

**From existing RLS policies** — read a sample of existing policies to understand the established pattern:
- What functions do policies call for role checks?
- How is ownership expressed? (`user_id = auth.uid()`, JWT claims, etc.)
- Are there any superuser/admin roles that get blanket access?

Document what you find — this is the reference for what's "correct" in this project.

**IMPORTANT: Actually read the migrations and existing policies — don't just scan for keywords.**

## Audit Process

### 1. Scan Migrations Directory

Read all files in `supabase/migrations/` (or equivalent) to find:
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- `CREATE POLICY ... ON ...`
- `DROP POLICY ... ON ...`
- Tables created with `CREATE TABLE`

Build a complete list of: all tables, which have RLS enabled, and all their policies.

### 2. For Each Table, Check:
- Has RLS enabled?
- Has SELECT policy?
- Has INSERT policy?
- Has UPDATE policy?
- Has DELETE policy (if needed — immutable/audit tables intentionally omit this)?
- Do admin/superuser roles have appropriate override access?

### 3. Anti-Patterns to Detect

| Anti-Pattern | Severity | Example |
|--------------|----------|---------|
| Direct role column reference | Critical | `profiles.role = 'admin'` (bypasses role abstraction) |
| Overly permissive | Critical | `USING(true)` or `USING(auth.uid() IS NOT NULL)` |
| Missing operations | High | SELECT but no INSERT/UPDATE where needed |
| Audit table violations | Critical | UPDATE/DELETE on immutable log tables |
| Unscoped JOIN in subquery | High | `EXISTS (SELECT 1 FROM other_table)` without user-scoping the inner query |
| Not using established helper functions | Medium | Raw JWT check when project has `has_role()` available |

### 4. Audit / Immutable Log Tables (SPECIAL)

Identify tables that are audit/log/trail tables by naming pattern:
- Names containing: `_log`, `_audit`, `_trail`, `_history`, `_event`
- These MUST have INSERT only — no UPDATE or DELETE policies
- Flag any UPDATE or DELETE policy on these tables as Critical

### 5. SECURITY DEFINER Function Audit

For each function declared with `SECURITY DEFINER`:
- Has `SET search_path = public` (prevents search_path injection)?
- Has `auth.uid() IS NULL` guard at top where appropriate?
- Validates inputs (NULL checks, type checks)?
- Is the RLS bypass justified? Flag if function does more than necessary.
- Does the function log to audit tables when modifying sensitive data?

### 6. Cross-Table JOIN Leak Detection

For RLS policies containing `EXISTS (SELECT 1 FROM ...)` subqueries:
- Is the inner table also RLS-protected?
- Is the full JOIN chain user-scoped? (every table in the chain must verify user access)
- Could an attacker use the policy's subquery to infer data from the inner table?
- Flag any policy that checks only table existence without user-scoping the inner query.

### 7. Grant/Revoke Check

Scan migrations for:
- `GRANT ... TO public` or `GRANT ... TO anon` — flag any that aren't explicitly justified
- `GRANT ... TO authenticated` on sensitive tables — verify this is intentional
- Missing `REVOKE` statements after table creation (Supabase defaults may be too permissive)

## OUTPUT FORMAT (Required)

```markdown
## RLS Audit Report

### Project Auth Model (Discovered)
- Role system: [what was found]
- Auth helper functions: [what's available]
- Ownership pattern: [how ownership is expressed in policies]

### Summary
- [ ] All tables RLS-enabled
- [ ] Policies cover all CRUD operations as appropriate
- [ ] Anti-patterns and bypass vectors eliminated
- [ ] SECURITY DEFINER functions justified and guarded
- [ ] Cross-table scoping correct

### Critical Issues
| Table | Issue | Details |
|-------|-------|---------|

### Warnings
| Table | Issue | Details |
|-------|-------|---------|

### Table Coverage Matrix
| Table | SELECT | INSERT | UPDATE | DELETE | Notes |
|-------|--------|--------|--------|--------|-------|

### Audit/Log Table Check
| Table | INSERT Only? | Violations |
|-------|--------------|------------|

### SECURITY DEFINER Functions
| Function | search_path Set? | Auth Guard? | RLS Bypass Justified? |
|----------|-----------------|-------------|----------------------|

### Cross-Table JOIN Leaks
| Policy | Tables in Chain | Fully Scoped? | Issue |
|--------|----------------|---------------|-------|

### Grant/Revoke Issues
| Statement | Table | Issue |
|-----------|-------|-------|

### Recommendations
1. [Specific fix with file and line]
2. [Specific fix with file and line]

### Verdict
[ ] PASSED - RLS policies are secure
[ ] NEEDS CHANGES - See recommendations above
```
```

---

## After Subagent Returns

1. **If Critical issues** → create migration to fix immediately
2. **If Warnings** → evaluate if intentional, document or fix
3. **If all clear** → note audit complete in project docs
