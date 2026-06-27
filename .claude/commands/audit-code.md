---
description: Use when you have a draft plan, a spec, or uncommitted changes and want a second opinion before committing — checks for the most elegant option, reuse of existing code, anti-patterns, and security gaps. Reach for this before implementing or as a post-batch gate.
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

> **`Installed, not yet proven in a live run.`** The re-grounding + refutation discipline below is ported from agent-blueprint's field-proven pattern but has not yet fired in an app-blueprint live run. Run it; treat its first few firings as calibration.

### Step A: Re-ground every load-bearing security finding against the live source (the load-bearing mechanic)

The audit above came from a single Explore subagent reading the codebase **once**. Before acting on any **security-class** finding (or accepting any security-class *all-clear*), the **main session** re-derives it against the **live source this run** — the actual policy, migration, server handler, or query — never on the auditor's prose summary or a `file:line` citation alone (citations go stale across migrations; a summary can quietly drop the qualifier that flips the verdict). Quote the contradicting or confirming lines you read yourself. A security claim that rests only on the relayed audit text is `[relayed]`, not verified.

### Step B: Refutation Pass (independent — supersedes the provisional verdict)

The auditor's `APPROVED`/`NEEDS CHANGES` checkbox is that subagent's **self-report**. Refute the load-bearing findings from a fresh context that never saw the audit's reasoning.

**Load-bearing set** (the only findings refuted — keeps cost bounded):
- every **Critical/High** finding, **and**
- every finding in the **web security-critical / irreversible class** — *regardless of the severity the auditor assigned* (a fixed allowlist the producing auditor cannot shrink): auth / data-bypass, secret or PII exposure, destructive or irreversible migration, webhook signature/idempotency, payment-path.

Medium/Low/style/over-engineering rows are NOT refuted — they ride the auditor's self-report.

**Refute per security-class *category*, not per finding** (bounds cost on audits that surface many related rows). Group the load-bearing findings into categories — e.g. *auth/data-bypass*, *secret/PII exposure*, *payment-path*, *webhook-idempotency* — typically 1–3. For each category, **spawn one fresh `Explore` agent** (a context that never saw the audit), given ONLY the finding claims + their `file:line`, with the inverted mandate:

> "Findings: [claims] at [file:line]. Your job is to **KILL** them. Read the primary source yourself and find the strongest evidence each is wrong, overstated, or already mitigated elsewhere — quote the contradicting lines. If you cannot refute one after a real search, say so and state what observation *would* have falsified it. Default to skepticism; do not assume the findings are correct."

Each refuter returns, per finding, **CONFIRMED** (tried and failed to kill it — quote the empty/contrary search) · **OVERSTATED** (real but narrower/lower-severity — cite the narrowing evidence) · **REFUTED** (contradicted — cite the killing `file:line`), with a confidence. Record a **Refutation Ledger** (ID | Finding | Refuter verdict | Confidence | Refuting/weakening evidence) that supersedes the binary checkbox.

**Cost escape-hatch (BLOCKER).** If the load-bearing set spans more than ~3–4 distinct security-class categories, do **not** spawn unbounded refuters — **halt and escalate the audit itself** to the user ("this change has a security-class surface too broad to refute cheaply — it needs a scoped re-audit / redesign"). An audit that can't be refuted cheaply is itself the finding.

**Mechanical tally** (so a bad ledger can't be laundered into a pass):
- Treat the result as `APPROVED` only if **every** load-bearing finding came back `REFUTED`. Any `CONFIRMED` or `OVERSTATED`-still-High → `NEEDS CHANGES`. A finding leaves the must-fix list only if its refuter graded it `REFUTED` with cited contradicting evidence.
- **Blind-spot honesty:** if the load-bearing set was empty, state verbatim — *"Refutation pass: no-op — no load-bearing findings surfaced. A clean verdict here means the audit found nothing, NOT that an independent skeptic verified the code is clean."* Refutation tests findings that exist; it cannot surface one the auditor missed.

### Then act on the ledger
1. **All load-bearing findings `REFUTED` (or none surfaced)** → proceed (carry the no-op caveat if it applies)
2. **Any `CONFIRMED`/`OVERSTATED`-still-High** → address those recommendations, then re-audit or proceed with fixes
3. **Major confirmed concerns** → consider running `/plan` to redesign approach
