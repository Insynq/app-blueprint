---
description: Audit database row-level security policies for gaps, anti-patterns, and recursion (SQL databases with RLS — e.g., Supabase/PostgreSQL)
arguments:
  - name: table
    description: Audit a specific table only (optional)
    required: false
  - name: focus
    description: Focus area - "gaps", "antipatterns", "recursion", or "all" (default)
    required: false
---

# RLS Audit Subagent

> **Stack-specific:** This command is for SQL databases with row-level security (e.g., Supabase/PostgreSQL). Skip if your project doesn't use SQL RLS.

**IMPORTANT: This command spawns a subagent to protect main context.**

## Action Required

Spawn a Task with `subagent_type: Explore` using the prompt below.

---

## Subagent Prompt

```
# RLS Policy Auditor

{{#if table}}Audit table: `$ARGUMENTS.table`{{/if}}
{{#if focus}}Focus: **$ARGUMENTS.focus**{{/if}}

## Step 0: Read Project Context

Read `CLAUDE.md` to understand:
- The role/permission model (who the user types are)
- Any project-specific RLS helper functions
- Which tables are designated as immutable audit logs

Also read `docs/Supabase Structure KBs/SB_KB_12_RLS_Performance.md` — it's the canonical anti-pattern list (naked `auth.uid()`, missing indexes on USING-clause columns, IMMUTABLE on table-reading functions, multiple permissive policies, recursion through membership tables, etc.). Validate every finding against the patterns documented there.

## Audit Process

### 1. Scan Migrations Directory
Read all migration files to find:
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- `CREATE POLICY ... ON ...`
- `DROP POLICY ... ON ...`
- `GRANT` / `REVOKE` statements

### 2. For Each Table, Check:
- Has RLS enabled?
- Has SELECT policy covering all relevant user types?
- Has INSERT policy?
- Has UPDATE policy (if records are ever updated)?
- Has DELETE policy (or is DELETE intentionally denied)?
- Does the highest-privilege role have appropriate override access?

### 3. Anti-Patterns to Detect

| Anti-Pattern | Severity | Example |
|--------------|----------|---------|
| Overly permissive | Critical | `USING(true)` with no user scoping |
| Direct role column reference | Critical | `profiles.role = 'admin'` instead of helper function |
| Missing operations | High | SELECT but no INSERT/UPDATE where needed |
| Audit table with UPDATE/DELETE | Critical | Immutable logs must be INSERT-only |
| SELECT * in policy subquery | Medium | Overfetches in policy evaluation |
| **Self-referencing policy** | **Critical** | Policy on table X has subquery reading table X → infinite recursion |
| **Cross-table recursion chain** | **Critical** | A reads B, B reads C, C reads A → infinite recursion |
| **Missing SECURITY DEFINER on cross-table helper** | **High** | Policy subquery reads another table without going through a SECURITY DEFINER helper |

### 4. Audit/Immutable Tables
Tables designated as audit logs MUST have INSERT only (no UPDATE/DELETE).
Check CLAUDE.md for the list of audit tables in this project. Common examples:
- Audit trail tables
- Access log tables
- Immutable event records

### 5. SECURITY DEFINER Function Audit
For each function declared with `SECURITY DEFINER`:
- Has `SET search_path = public`? (prevents search_path injection)
- Has auth.uid() IS NULL guard where appropriate?
- Validates inputs (NULL checks)?
- Is the RLS bypass justified?
- Does it log to audit tables when modifying sensitive data?

### 6. Cross-Table JOIN Leak Detection
For policies containing `EXISTS (SELECT 1 FROM ...)` subqueries:
- Is the inner table also RLS-protected?
- Is the full JOIN chain user-scoped at every level?
- Could an attacker use the subquery to infer data from the inner table?

### 7. Policy Recursion Detection (CRITICAL)
For EVERY policy containing subqueries:

**7a. Self-Reference Check:**
- Does the policy's USING/WITH CHECK clause reference the SAME table it protects?
- Fix: Use a SECURITY DEFINER helper function to read the table without triggering RLS

**7b. Cross-Table Recursion Chain:**
- Trace the full reference chain: Policy on A reads B → Policy on B reads C → Policy on C reads A?
- Even 2-table cycles cause recursion
- Fix: ALL cross-table references in policies MUST use SECURITY DEFINER helpers

### 8. EXECUTE Permission Check
For each SECURITY DEFINER function used in RLS policies:
- Has EXECUTE been revoked from public/anon?
- Is EXECUTE granted only to authenticated?
- These functions bypass RLS — they MUST NOT be directly callable by unauthenticated users

### 9. Grant/Revoke Check
Scan for:
- `GRANT ... TO public` or `GRANT ... TO anon` — flag unless explicitly justified
- Missing REVOKE statements after table creation

## Output Format (Required)

```markdown
## RLS Audit Report

### Summary
- Tables audited: X
- Tables with RLS: X
- Total policies: X
- Critical issues: X
- Warnings: X

### Critical Issues
| Table | Issue | Details |

### Warnings
| Table | Issue | Details |

### Table Coverage Matrix
| Table | SELECT | INSERT | UPDATE | DELETE | Notes |
|-------|--------|--------|--------|--------|-------|

### Audit Table Check
| Table | INSERT Only? | Violations |

### SECURITY DEFINER Functions
| Function | search_path Set? | Auth Guard? | Justified? |

### Recursion Check
| Policy | Table | References | Risk | Status |

### EXECUTE Permissions
| Function | public Revoked? | anon Revoked? | Status |

### Recommendations
1. [Specific fix with migration approach]
```
```

---

## After Subagent Returns

1. **Critical issues** → create migration to fix immediately
2. **Warnings** → evaluate if intentional, document or fix
3. **All clear** → document audit date in KB_8
