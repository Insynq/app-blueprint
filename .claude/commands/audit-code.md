---
description: Review proposed code/plans to check if the solution is the most elegant option
arguments:
  - name: file
    description: Specific file to audit (optional - defaults to current plan/changes)
    required: false
  - name: focus
    description: Focus area - "reuse", "patterns", "antipatterns", "security", or "all" (default)
    required: false
---

# Code Audit Subagent

**IMPORTANT: This skill spawns a subagent to protect main context.**

## Action Required

Spawn a Task with `subagent_type: Explore` using the prompt below. The subagent will audit the code/plan and return a verdict.

---

## Subagent Prompt

```
# Code Auditor

Audit target: `$ARGUMENTS` (if argument supplied; otherwise audit current pending changes).

## Core Question

> "Knowing what you know now about this codebase, is this solution the most elegant option?"

## Step 0: Discover Project Patterns

Before auditing, read the project to understand its established patterns.

1. Read `CLAUDE.md` (if present) — look for:
   - Explicit DO NOTs or anti-patterns
   - Patterns section describing established conventions
   - Tech stack (framework, UI library, DB, auth system)

2. Scan for existing utilities/hooks/contexts:
   - `Glob("src/lib/**/*.ts")` — utility functions
   - `Glob("src/hooks/**/*.ts")` — existing hooks
   - `Glob("src/contexts/**/*.tsx")` — state contexts
   - Read a sample of each to understand what's available

3. Read 2-3 existing files similar to what's being audited to understand the established code style.

Document what you find — this informs every check below.

## Audit Checklist

### 1. Reuse Opportunities

Before approving new code, check if existing utilities solve the problem:

- Search `src/lib/` for utility functions that do something similar
- Search `src/hooks/` for hooks that already fetch or compute this data
- Search `src/contexts/` for contexts that already provide this state
- Search `src/components/` for UI components with similar patterns

**IMPORTANT: Actually read the source files of potential reuse candidates.**
Don't just check if they exist — read the code to see if the implementation
can be extended or extracted into a shared component.

### 2. Pattern Alignment

Check that new code follows the patterns established in the codebase:

- **Data fetching**: Does it use the same approach as existing fetches (custom hooks, React Query, context, etc.)?
- **Auth/user identity**: Does it access the current user the same way as other components?
- **Database queries** (if Supabase): Does it use explicit column selection, not `select('*')`?
- **Role/permission checks**: Does it use the project's established role-checking pattern?
- **Class names** (if Tailwind): Does it use the project's class merging utility (e.g., `cn()`)?
- **Error handling**: Does it follow the project's error handling conventions?

### 3. Universal Anti-Patterns to Flag

| Anti-Pattern | Severity | Why It's Bad |
|--------------|----------|--------------|
| `select('*')` on DB queries | High | Security risk, over-fetches data |
| `localStorage` for auth/session state | High | Persists unexpectedly across sessions |
| Direct role column comparison | Medium | Bypasses role abstraction |
| Missing error handling at system boundaries | Medium | Silent failures |
| New hook/component for data already fetched elsewhere | Medium | Duplicates functionality |
| String concatenation for class names | Low | Use project's class merging utility |

### 4. Over-Engineering Checks

Flag if code:
- Creates abstraction for single use
- Designs for hypothetical future requirements
- Adds error handling for impossible scenarios (trust internal code)
- Uses feature flags when a direct change is possible
- Creates a helper for a one-time operation
- Creates two near-identical hooks/components when one parameterized version works

### 5. Type Consistency

Check types match project standards:
- Uses the project's established type definitions (not ad-hoc inline types for shared concepts)
- Date handling consistent with rest of codebase (Date objects vs ISO strings)
- Enum values match DB or project-defined enums

### 6. Security-Specific Checks (REQUIRED)

These checks catch vulnerabilities that pattern matching alone won't find.

**6a. Auth/Data Bypass**
For any endpoint or server action that accepts status fields or IDs from the client:
- Can a user call it directly with fabricated data to skip payment/validation?
- Is the frontend the only thing preventing bad data, or is there server-side validation?
- For payment flows: Can someone submit a completion status with a fake payment reference?

**6b. Race Conditions on Shared State**
For any counter, flag, or status field modified by the plan:
- Are there OTHER code paths (existing edge functions, hooks, DB triggers) that also modify this same field?
- If multiple paths exist, are ALL of them atomic?

**6c. Webhook/Event Idempotency**
For any webhook or event handler that modifies data:
- What happens if the same event fires twice?
- Will it double-count, double-charge, or corrupt state?
- Is there a check for "already processed" before modifying data?

**6d. Hardcoded Values vs Config**
Are there values in the plan (limits, fees, thresholds) that:
- Are hardcoded in SQL/code but also exist as configurable constants elsewhere?
- Could drift if an admin changes configuration via UI?
- Exist in multiple places that could get out of sync?

**6e. Data Exposure**
Do any new columns or fields (especially tokens, keys, identifiers):
- Get exposed to the frontend via existing broad queries?
- Contain sensitive data that shouldn't be in the browser?

**6f. XSS Prevention**
- Flag any `dangerouslySetInnerHTML` — each usage must be justified and sanitized
- Check URL construction with user input — use `new URL()` not string concat
- Verify any markdown rendering uses sanitization (e.g., DOMPurify)
- Verify user-supplied content in email templates is escaped

**6g. CSRF & Request Forgery**
- Verify all server-side handlers for state changes check authentication (JWT, session, etc.)
- Verify CORS is configured via environment variable (not hardcoded `"*"`)
- Check that no GET requests perform state-changing operations

**6h. Rate Limiting**
Flag any server-side handler that processes these WITHOUT rate limiting:
- Authentication endpoints (password reset, magic links, invite acceptance)
- Payment creation
- Email sending
- User registration/account creation

**6i. Privilege / Auth Scope**
- Does any new code allow a lower-privileged user to trigger actions reserved for higher roles?
- Are there any direct object reference issues (user A accessing user B's data by ID)?
- Verify server-side handlers re-check permissions, not just the frontend

**6j. Payment Security** (if project uses a payment provider)
- Amount validation: server must verify prices against DB records, not trust client-provided amounts
- Customer ownership: verify payment customer ID belongs to the authenticated user
- Webhook idempotency: every webhook handler must check "already processed"
- No raw payment data (card numbers, CVVs) in logs, DB, or error messages

**6k. Error Information Disclosure**
- Flag server handlers returning raw error messages to clients
- Flag logging of auth metadata (email addresses, tokens, user IDs in auth flows)
- Verify error responses don't reveal: database structure, table/column names, stack traces

**6l. Environment Variable Exposure**
- Verify no client-side env vars (e.g., `VITE_` in Vite, `NEXT_PUBLIC_` in Next.js) contain secrets
- Verify secret keys are NEVER referenced in frontend code
- Check that no `.env` file with real values is committed

## OUTPUT FORMAT (Required)

```markdown
## Code Audit Report

### Project Patterns Discovered
- Framework/stack: [what was found]
- Established data fetching pattern: [description]
- Auth/user identity pattern: [description]
- Key reusable utilities found: [list]

### Summary
- [ ] Reuse opportunities found
- [ ] Pattern violations
- [ ] Anti-patterns detected
- [ ] Over-engineering concerns
- [ ] Security concerns

### Reuse Opportunities
| Proposed Code | Existing Alternative | Location |
|---------------|---------------------|----------|

### Pattern Violations
| Issue | Location | Fix |
|-------|----------|-----|

### Anti-Patterns
| Pattern | Location | Severity |
|---------|----------|----------|

### Over-Engineering Concerns
| Concern | Recommendation |
|---------|----------------|

### Security Concerns
| Issue | Category | Severity | Mitigation |
|-------|----------|----------|------------|

### Recommendations
1. [Specific recommendation with exact file/change needed]
2. [Specific recommendation with exact file/change needed]

### Verdict
[ ] APPROVED - Solution is elegant
[ ] NEEDS CHANGES - See recommendations above
```
```

---

## After Subagent Returns

1. **If APPROVED** → proceed with implementation
2. **If NEEDS CHANGES** → address recommendations, then re-audit or proceed with fixes
3. **If major concerns** → consider running `/plan` to redesign approach
