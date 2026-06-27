---
description: Use when you need a comprehensive security sweep before a release or milestone — runs code review, database access-control (RLS), and infrastructure audits in parallel. Reach for this for a full-surface audit rather than one focused area.
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

If `$ARGUMENTS` provides a baseline (a path to a prior audit-findings doc), read it and for EACH previous finding:
- **Fixed** — issue no longer exists
- **Regression** — previously fixed issue has reappeared
- **Outstanding** — was never addressed
- **New** — not in the baseline

### 3. Deduplicate

Remove duplicate findings that appear in multiple domain audits. Keep the most detailed version.

### 4. Re-grounding + Refutation Pass (load-bearing findings)

> **`Installed, not yet proven in a live run.`**

The 3 domain subagents ran their **audit checklists only** — they did NOT run the per-domain re-grounding + refutation (that lives in each command's "After Subagent Returns", executed by the orchestrating session, not the spawned Explore). So this merged audit must run it once, on the **merged + deduped** load-bearing set across all three domains. This is the same discipline as `/audit-code` / `/audit-rls` / `/audit-infra` Step A + B — see those for the full mechanic.

1. **Re-ground (Step A):** for every Critical/High finding and every finding in the security-critical / irreversible class (auth/RLS bypass, secret/PII exposure, destructive migration, webhook signature/idempotency, payment-path, public storage, CORS), re-derive it against the **live source this run** — the actual policy/migration/config/handler — never on the domain subagent's prose summary or a `file:line` alone. Quote what you read.
2. **Refute (Step B):** group the load-bearing findings by security-class **category** (typically 1–3 per domain), and for each spawn **one fresh `Explore` agent** given only the claims + `file:line` with the KILL mandate. Record a **Refutation Ledger** (ID | Domain | Finding | Refuter verdict | Confidence | Evidence) and fold it into the report below.
3. **Cost escape-hatch (BLOCKER):** if the merged load-bearing set spans more than ~4–5 distinct security-class categories, **halt and escalate** — a release surface too broad to refute cheaply needs scoping before it ships.
4. **Mechanical tally + blind-spot honesty:** a finding leaves the Critical/High list only if its refuter graded it `REFUTED` with cited contradicting evidence; any `CONFIRMED`/`OVERSTATED`-still-High stays. If the load-bearing set was empty, state verbatim — *"Refutation pass: no-op — no load-bearing findings surfaced. A clean verdict means the audits found nothing, NOT that an independent skeptic verified the surface is clean."*

The Refutation Ledger supersedes the raw domain verdicts in the saved report.

### 5. Save Report

Write the compiled report (including the Refutation Ledger) to `docs/SECURITY_AUDIT_[DATE].md`.
