---
description: Use when reviewing deployment or infrastructure security — HTTP headers, dependency vulnerabilities, environment variables and secrets, storage/bucket exposure, CORS, and deploy config. Reach for this when hardening infrastructure rather than application code.
arguments:
  - name: focus
    description: Focus area - "headers", "deps", "env", "storage", or "all" (default)
    required: false
---

# Infrastructure Security Audit Subagent

**IMPORTANT: This skill spawns a subagent to protect main context.**

## Action Required

Spawn a Task with `subagent_type: Explore` using the prompt below. The subagent will scan infrastructure configuration and return a security report.

---

## Subagent Prompt

```
# Infrastructure Security Auditor

Focus: if `$ARGUMENTS` names a focus area (e.g. "headers", "deps", "env", "storage"), scope the audit to it; otherwise audit the full infrastructure surface.

## Core Question

> "Does this infrastructure configuration follow security best practices and avoid critical vulnerabilities?"

## Step 0: Detect Project Infrastructure

Before auditing, identify the actual stack being used.

**Deployment platform** — check for these config files:
- `netlify.toml` → Netlify
- `vercel.json` → Vercel
- `.github/workflows/` → GitHub Actions (may deploy anywhere)
- `fly.toml` → Fly.io
- `Dockerfile` / `docker-compose.yml` → containerized

**Backend** — check for:
- `supabase/` directory → Supabase (Postgres + Edge Functions)
- `firebase.json` → Firebase
- `api/` or `pages/api/` or `app/api/` → Next.js API routes / serverless
- `server/` or `backend/` → custom backend

**Frontend framework**:
- `vite.config.ts` → Vite
- `next.config.*` → Next.js
- `nuxt.config.*` → Nuxt

**Payment provider** — search for:
- `stripe` in `package.json` → Stripe

**Client-side env var prefix** — determines what's exposed to browser:
- Vite: `VITE_`
- Next.js: `NEXT_PUBLIC_`
- Create React App: `REACT_APP_`

Document what you find. Skip sections below that don't apply to this project.

**IMPORTANT: Actually read the configuration files — don't just check whether they exist.**

## Audit Sections

### 1. Security Headers

Check the deployment platform config for security headers.

**Required headers for any web app:**

| Header | Recommended Value | Why |
|--------|------------------|-----|
| `X-Frame-Options` | `DENY` or `SAMEORIGIN` | Clickjacking prevention |
| `X-Content-Type-Options` | `nosniff` | MIME type sniffing prevention |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Force HTTPS |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit referrer leakage |
| `Permissions-Policy` | `geolocation=(), microphone=(), camera=()` | Disable unused APIs |
| `Content-Security-Policy` | (project-dependent — see below) | XSS prevention |

**CSP guidance:** The correct CSP depends on which external services are used. Build it based on what the project actually loads:
- Stripe: add `https://js.stripe.com` to `script-src` and `frame-src`
- Google Fonts: add `https://fonts.googleapis.com` to `style-src`
- Supabase realtime: add `wss://*.supabase.co` to `connect-src`
- CDN assets: add CDN domain to `img-src` or `script-src`

For Netlify: check `netlify.toml` `[[headers]]` section.
For Vercel: check `vercel.json` `headers` array.
For Next.js: check `next.config.*` `headers()` function.

Flag missing headers as **Medium** severity. Missing CSP as **High**.

### 2. Dependency Vulnerabilities

Read `package.json`:
- Are security-critical packages on recent versions? (`zod`, auth libraries, payment SDKs)
- Are dependency versions pinned with exact versions or using `^`/`~` ranges?
- Is a lockfile (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`) present and checked into git?

Run if available:
```bash
npm audit --audit-level=high 2>&1 | head -50
```

Flag packages with known CVEs as **High** severity. Unpinned critical deps as **Medium**.

### 3. Environment Variable Audit

**Client-side exposure check:**
Search for the client-side env var prefix (detected in Step 0) across `src/`:
```bash
grep -r "VITE_\|NEXT_PUBLIC_\|REACT_APP_" src/ | grep -v "node_modules"
```

- Verify only publishable/safe values use the client-side prefix (URLs, publishable API keys)
- Flag any secret keys, service role keys, or API secrets with the client-side prefix as **Critical**

**Documentation:**
- Does `.env.example` exist and document required secrets WITHOUT real values?
- Does `.gitignore` include `.env` and `.env.local`?

**Git exposure:**
```bash
git log --all --oneline -- "*.env" ".env*" 2>&1 | head -10
```
Check that no `.env` file with real values was ever committed.

### 4. Backend Storage Security (if applicable)

**For Supabase Storage:**
Search migrations and edge functions for bucket creation/configuration:
- Which buckets are public vs private?
- Are file type restrictions enforced?
- Can anonymous users list public bucket contents?
- Are file size limits configured?

**For other storage (S3, GCS, Firebase):**
- Check for public bucket/container policies
- Verify presigned URL expiry times are short

### 5. CORS Configuration

Search for CORS configuration:
```bash
grep -r "ALLOWED_ORIGINS\|cors\|Access-Control" supabase/functions/ src/ --include="*.ts" | grep -v "node_modules" | head -20
```

Check:
- Is `ALLOWED_ORIGINS` (or equivalent) read from environment, not hardcoded?
- Is the fallback for missing config restrictive (not `"*"`)?
- Is origin validation exact match (not substring)?

For Supabase edge functions: check `_shared/cors.ts` or equivalent.
For Next.js API routes: check middleware or API route headers.

### 6. Server-Side Handler Security (if applicable)

**For Supabase Edge Functions** (`supabase/functions/`):
- Functions that should be internal-only (scheduled jobs, webhooks) vs client-facing — are they gated appropriately?
- Any function that could expose secrets via error messages?

**For Next.js API routes / server actions**:
- Are all state-changing routes checking authentication?
- Are any routes callable without auth that shouldn't be?

**General:**
- Search for hardcoded secrets in server-side code:
```bash
grep -r "sk_live\|secret_key\|private_key\|password" supabase/functions/ src/api/ --include="*.ts" 2>/dev/null | grep -v "node_modules\|\.env" | head -20
```

## OUTPUT FORMAT (Required)

```markdown
## Infrastructure Security Audit Report

### Stack Detected
- Deployment: [platform]
- Backend: [Supabase / Next.js API / custom / etc.]
- Frontend: [framework]
- Payment provider: [Stripe / none / other]
- Client env prefix: [VITE_ / NEXT_PUBLIC_ / etc.]

### Summary
- [ ] Security headers configured
- [ ] Dependencies free of known vulnerabilities
- [ ] Environment variables properly scoped
- [ ] Storage access properly restricted
- [ ] CORS policies properly configured

### Security Headers
| Header | Status | Recommendation |
|--------|--------|----------------|

### Dependency Issues
| Package | Current Version | Issue | Severity |
|---------|----------------|-------|----------|

### Environment Variable Issues
| Issue | Location | Severity |
|-------|----------|----------|

### Storage Issues
| Bucket/Container | Public? | Issue |
|-----------------|---------|-------|

### CORS Issues
| Issue | Location | Severity |
|-------|----------|----------|

### Server-Side Handler Issues
| Issue | Location | Severity |
|-------|----------|----------|

### Recommendations
1. [Specific fix with file and line]
2. [Specific fix with file and line]

### Verdict
[ ] PASSED - Infrastructure is secure
[ ] NEEDS CHANGES - See recommendations above
```
```

---

## After Subagent Returns

> **`Installed, not yet proven in a live run.`** The re-grounding + refutation discipline below is ported from agent-blueprint's field-proven pattern; treat early app-blueprint firings as calibration.

### Step A: Re-ground every load-bearing infra finding against the live config (the load-bearing mechanic)

Before acting on any **security-critical** infra finding (or accepting a clean verdict on one), the **main session** re-derives it against the **live config this run** — read the actual `netlify.toml`/`vercel.json` headers block, the `.env`/`.env.example` contents, the CORS source, the bucket policy — never on the auditor's prose or a `file:line` alone. Quote the line you read yourself. A "secret is not exposed" / "CORS is locked down" claim resting only on relayed audit text is `[relayed]`, not verified.

### Step B: Refutation Pass (independent — supersedes the provisional verdict)

The auditor's `PASSED`/`NEEDS CHANGES` checkbox is that subagent's **self-report**. Refute the load-bearing findings from a fresh context.

**Load-bearing set:** every **Critical/High** finding, **and** every finding in the infra security-critical class *regardless of assigned severity* — secret / service-role-key exposure (client-prefixed env var, committed `.env`), CORS wildcard / permissive fallback, public storage bucket exposing private data.

**Refute per security-class *category*, not per finding** (typically 1–3: *secret-exposure*, *CORS*, *storage*). For each, **spawn one fresh `Explore` agent** given ONLY the claims + `file:line`, mandate: *"Read the live config yourself and KILL each finding — quote the contradicting config line, or state what would have falsified it. Default to skepticism."* Each refuter returns per finding **CONFIRMED** · **OVERSTATED** · **REFUTED** with quoted config → a **Refutation Ledger** that supersedes the checkbox.

**Cost escape-hatch (BLOCKER).** More than ~3–4 distinct security-class categories → **halt and escalate the audit itself** rather than spawning unbounded refuters.

**Mechanical tally + blind-spot honesty:** `PASSED` only if **every** load-bearing finding came back `REFUTED`; any surviving `CONFIRMED`/`OVERSTATED`-still-High → `NEEDS CHANGES`. If the load-bearing set was empty, state verbatim — *"Refutation pass: no-op — no load-bearing findings surfaced. A clean verdict means the audit found nothing, NOT that an independent skeptic verified the infra is clean."*

### Then act on the ledger
1. **If Critical issues survive refutation** → fix immediately (especially secret exposure)
2. **If Missing headers** → add to deployment config (low-risk change; headers are not in the security-critical refutation class — they ride the auditor's report)
3. **If Dependency issues** → create update plan with testing
4. **If all clear** (every load-bearing finding `REFUTED`) → note audit complete in project docs, carrying the no-op caveat if it applies
