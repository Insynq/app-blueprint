---
description: Review proposed code or plans for elegance, reuse, anti-patterns, and security
arguments:
  - name: file
    description: Specific file to audit (optional — defaults to recent changes or current plan)
    required: false
  - name: focus
    description: Focus area - "reuse", "patterns", "antipatterns", "security", or "all" (default)
    required: false
---

# Code Audit Subagent

**IMPORTANT: This command spawns a subagent to protect main context.**

## Action Required

Spawn a Task with `subagent_type: Explore` using the prompt below.

---

## Subagent Prompt

```
# Code Auditor

{{#if file}}Audit file: `$ARGUMENTS.file`{{/if}}
{{#if focus}}Focus: **$ARGUMENTS.focus**{{/if}}

## Core Question

> "Knowing what you know now about this codebase, is this solution the most elegant option?"

## Step 0: Read Project Context

Read `CLAUDE.md` to understand:
- Established patterns and conventions
- Tech stack (informs which anti-patterns apply)
- Hard constraints (DO NOTs)
- Any project-specific security requirements

Also read `docs/LESSONS.md` (if it exists). Cross-reference the code being audited against known gotcha categories — UI event handling, query/transform completeness, integration wiring, DB constraint coverage. LESSONS.md entries describe real bugs that have already happened; the audit should check for recurrence.

## Audit Checklist

### 1. Reuse Opportunities

Before approving new code, search the codebase for existing utilities that solve the problem:
- Utility/helper functions in the project's lib/utils directories
- Existing hooks, services, or data access patterns
- Existing UI components or layout patterns
- Existing API/service wrappers

**IMPORTANT: Actually read the source files of potential reuse candidates.** Don't just check if they exist — read the implementation to see if it can be extended or extracted into a shared utility.

### 2. Pattern Alignment

Check that code follows the patterns established in `CLAUDE.md` and visible in the codebase:
- Data fetching pattern consistent with existing hooks/services
- Error handling consistent with how errors are handled elsewhere
- Type definitions consistent with existing type conventions
- Component structure consistent with existing components

### 3. Anti-Patterns to Flag

> **The Unified Model Principle:** One normalized data type shared across all contexts (agent view, vendor view, admin view) beats multiple near-identical types plus translator functions. Translators create maintenance debt — when the source shape changes, every translator breaks independently. The anti-patterns below flag common violations of this principle.

**Universal Anti-Patterns** (apply to all projects)

| Anti-Pattern | Severity | Why It's Bad |
|--------------|----------|--------------|
| Wildcard data fetching (`select *`, overfetching) | High | Security risk, over-fetches sensitive data |
| Adapter/translator between internal contexts | High | Creates maintenance debt and divergence risk — use unified normalized type instead |
| New component that duplicates one in KB_7 catalog | High | Creates divergence and maintenance burden — extend the existing component |
| New hook/service for data that already exists | Medium | Duplicates functionality, creates divergence |
| Missing error handling at system boundaries | Medium | Silent failures at user input or external API edges |
| Direct auth state in localStorage | High | Persists across sessions (use sessionStorage or in-memory) |
| Adding fields to a query without updating the transform | High | Data fetched but never mapped to return type |

**Project-Specific Anti-Patterns** (apply when your project has these patterns — add your own as they emerge)

| Anti-Pattern | Severity | Why It's Bad |
|--------------|----------|--------------|
| Modifying immutable records | Critical | Breaks audit trails |
| Calling lower abstraction layer when higher one should be used | Critical | Bypasses validation/payment/auth logic |

Add entries here as you discover project-specific constraints during development.

### 4. Integration Flow Check

For any new service call, API endpoint, or data access:
1. **Trace the call chain**: UI → service/hook → API/DB
2. **Verify calling code uses the right abstraction** — not a lower layer that bypasses validation
3. **Verify error handling** at each layer boundary

For any new fields added to a query:
1. **Find the transform/mapping function** that converts raw data to the app type
2. **Verify ALL new fields are mapped** in the transform
3. **Check ALL similar query patterns** in the codebase — they may need the same update

### 5. Over-Engineering Checks

Flag if code:
- Creates an abstraction for a single use case
- Designs for hypothetical future requirements
- Adds error handling for scenarios that can't happen
- Uses feature flags when a direct change is possible
- Creates two near-identical components when one parameterized version works
- Adds backwards-compatibility shims for code that has no other callers

### 6. Security Checks

**6a. Authentication & Authorization**
- Are all state-modifying operations protected by auth checks?
- Are role/permission checks happening server-side, not just client-side?
- Can the auth check be bypassed by manipulating client-side state?

**6b. Input Validation**
- Is user input validated at system boundaries (API endpoints, form handlers)?
- Is validation happening on the server, not just the client?
- Are there injection risks (SQL injection, command injection, template injection)?

**6c. Data Exposure**
- Do new queries expose fields that shouldn't be accessible to the requesting user?
- Is sensitive data (tokens, secrets, PII) filtered before sending to the client?
- Are there overfetching patterns that expose more data than needed?

**6d. XSS Prevention**
- Is user-supplied content rendered safely (not as raw HTML)?
- Are URL constructions using user input safe from injection?
- Is any markdown or rich text rendering properly sanitized?

**6e. Secrets and Environment Variables**
- No secrets or private keys in frontend/client-side code
- No hardcoded credentials, API keys, or tokens
- Environment variable naming follows the project convention (client-safe vs. server-only)

**6f. Rate Limiting and Abuse**
- Are expensive or sensitive operations (auth, email, payments) rate-limited?
- Can a malicious user trigger costly operations in bulk?

**6g. Error Information Disclosure**
- Do error responses expose internal implementation details (stack traces, DB structure)?
- Are error messages user-friendly without being informative to attackers?

**6h. Race Conditions**
- Are there operations that assume single-execution but could run concurrently?
- Are idempotency keys used where needed (payments, external API calls)?
- Are "check-then-act" patterns (read-then-write) protected against races?

**6i. CSRF Protection**
- Are state-modifying endpoints protected against cross-site request forgery?
- If using cookies for auth: is a CSRF token or SameSite=Strict/Lax cookie attribute in use?
- Are CORS settings restrictive enough to prevent cross-origin state mutation?
- Note: APIs using only `Authorization: Bearer` headers (not cookies) are not CSRF-vulnerable

**6j. Session Management**
- Do auth tokens have appropriate expiration times? (access tokens: minutes to hours; refresh tokens: days to weeks)
- Is token invalidation handled on logout — server-side revocation or short expiry?
- Are refresh tokens rotated on use (rotation prevents replay if a token is stolen)?
- Is session state stored appropriately — not in localStorage for sensitive tokens?

**6k. Git History Secrets**
- If secrets were removed from files in a recent commit, they may still be in git history
- Flag any commit messages referencing secret rotation, credential removal, or key deletion
- Recommend: `git log --all --oneline -- .env*` and `git log -S "password\|secret\|key\|token" --oneline` to surface historical secret exposure
- If secrets were committed: the fix is git history rewrite (filter-branch or BFG) AND credential rotation — removing from HEAD is not enough

## Output Format (Required)

```markdown
## Code Audit Report

### Summary
- Reuse opportunities found: [N]
- Pattern violations: [N]
- Anti-patterns detected: [N]
- Security concerns: [N]

### Reuse Opportunities
| Proposed Code | Existing Alternative | Location |
|---------------|---------------------|----------|

### Pattern Violations
| Issue | Location | Fix |
|-------|----------|-----|

### Anti-Patterns
| Pattern | Location | Severity |
|---------|----------|----------|

### Security Concerns
| Issue | Category | Severity | Mitigation |
|-------|----------|----------|------------|

### Recommendations
1. [Specific recommendation with exact file/change]
2. [Specific recommendation with exact file/change]

### Verdict
[ ] APPROVED — Solution is elegant
[ ] NEEDS CHANGES — See recommendations above
```
```

---

## After Subagent Returns

1. **APPROVED** → proceed with implementation
2. **NEEDS CHANGES** → address recommendations, then re-audit or proceed with fixes
3. **Major concerns** → consider running `/plan` to redesign the approach
