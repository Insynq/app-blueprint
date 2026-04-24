---
description: Comprehensive security audit — code, database access control, and infrastructure in parallel
arguments:
  - name: baseline
    description: Path to previous audit report to check for regressions (optional)
    required: false
---

# Full Security Audit Orchestrator

**Spawns 3 parallel audit agents for maximum coverage.**

## Action Required

Spawn **3 parallel** Explore subagents:

### Subagent 1: Code Security Audit
Run `/audit-code --focus security` across the entire application source and server-side functions. Focus on: auth bypass, race conditions, hardcoded values, data exposure, XSS, CSRF, rate limiting, error disclosure, and environment variable exposure. Read `CLAUDE.md` first to understand the tech stack.

### Subagent 2: Database Access Control Audit
Run `/audit-rls --focus all` across all database migrations and schema files. Check every table for access control coverage, anti-patterns, SECURITY DEFINER functions, cross-table JOIN leaks, recursion risks, and grant/revoke issues. Read `CLAUDE.md` first to identify which tables exist and the role model.

> Note: If the project doesn't use SQL row-level security, replace this with an audit of whatever access control mechanism is in use (middleware authorization checks, API gateway policies, ORM-level scoping, etc.).

**If not using SQL RLS, use the appropriate checklist:**

**Express/Node middleware:**
- Is auth middleware applied to ALL protected routes (not just a subset)?
- Is route ordering correct — auth middleware before route handlers, not after?
- Are there any routes that bypass the middleware chain (e.g., direct `app.get` after `app.use(auth)`)?
- Are role checks done server-side, not trusting client-sent role claims?

**GraphQL (Apollo, Pothos, etc.):**
- Are resolvers protected individually, not just at the schema level?
- Are field-level permissions enforced for sensitive fields?
- Is query depth/complexity limited to prevent denial-of-service via deeply nested queries?
- Is introspection disabled in production?

**API Gateway (AWS API Gateway, Kong, etc.):**
- Are all routes covered by an authorizer — no unprotected paths?
- Is the authorizer's IAM policy scoped to minimum required permissions?
- Are API keys rotated and not embedded in client-side code?

**Firebase/Firestore Security Rules:**
- Are rules validated with the Firebase emulator (not just read for correctness)?
- Do rules default to deny (no wildcard `allow read, write: if true`)?
- Are user-owned documents scoped to `request.auth.uid`?

### Subagent 3: Infrastructure Audit
Run `/audit-infra --focus all`. Check security headers in hosting config, dependency vulnerabilities, environment variable exposure (client vs. server), storage bucket policies, and CORS configuration. Read `CLAUDE.md` first to identify the hosting stack.

---

## After All Subagents Return

### 1. Compile Unified Report

Merge findings from all 3 audits:

```markdown
## Comprehensive Security Audit — [DATE]

### Executive Summary
- Total findings: X (Critical: X, High: X, Medium: X, Low: X)
- Domains audited: Code, Database Access Control, Infrastructure
- Previous audit baseline: [date or "none"]

### Critical & High Findings (Fix Immediately)
| ID | Domain | Finding | Severity | File/Location |
|----|--------|---------|----------|---------------|

### Medium Findings (Next Sprint)
| ID | Domain | Finding | Severity | File/Location |
|----|--------|---------|----------|---------------|

### Low Findings (Backlog)
| ID | Domain | Finding | Severity | File/Location |
|----|--------|---------|----------|---------------|

### Regression Check (if baseline provided)
| Previous Finding | Status | Notes |
|-----------------|--------|-------|
| [Previous issue] | Fixed / Regression / Outstanding | [Details] |

### Recommended Fix Priority
1. [Immediate — Critical issues]
2. [Next sprint — High issues]
3. [Backlog — Medium/Low]
```

### 2. Cross-Reference Baseline (if provided)

{{#if baseline}}
Read `$ARGUMENTS.baseline` and for EACH previous finding:
- **Fixed** — issue no longer exists
- **Regression** — previously fixed issue has reappeared
- **Outstanding** — was never addressed
- **New** — not in the baseline
{{/if}}

### 3. Deduplicate

Remove duplicate findings that appear in multiple domain audits. Keep the most detailed version.

### 4. Save Report

Write the compiled report to `docs/SECURITY_AUDIT_[DATE].md`.
