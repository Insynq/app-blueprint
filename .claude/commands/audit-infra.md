---
description: Audit infrastructure security — headers, dependencies, env vars, storage, deployment config
arguments:
  - name: focus
    description: Focus area - "headers", "deps", "env", "storage", or "all" (default)
    required: false
---

# Infrastructure Security Audit Subagent

**IMPORTANT: This command spawns a subagent to protect main context.**

## Action Required

Spawn a Task with `subagent_type: Explore` using the prompt below.

---

## Subagent Prompt

```
# Infrastructure Security Auditor

{{#if focus}}Focus: **$ARGUMENTS.focus**{{/if}}

## Step 0: Read Project Context

Read `CLAUDE.md` to understand:
- Tech stack (hosting platform, backend, frontend framework)
- Deployment configuration files
- Services in use (payments, email, storage, auth)

The audit checks below apply generically — adapt them to the project's actual stack.

## Audit Process

### 1. Security Headers

Find the project's hosting/server configuration file (e.g., `netlify.toml`, `vercel.json`, `nginx.conf`, `next.config.js`, server middleware). Check for these headers:

| Header | Required Value | Why |
|--------|---------------|-----|
| `Content-Security-Policy` | Restrictive policy allowing only known sources | XSS prevention |
| `X-Frame-Options` | `DENY` or `SAMEORIGIN` | Clickjacking prevention |
| `X-Content-Type-Options` | `nosniff` | MIME type sniffing prevention |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Force HTTPS |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limit referrer leakage |
| `Permissions-Policy` | Disable unused browser APIs | Reduce attack surface |

Flag any missing headers as Medium severity (Critical if CSP is absent and the app renders user content).

Note: CSP `connect-src` must allow all API/backend domains the app calls. Read the code to identify external calls before evaluating CSP.

### 2. Dependency Vulnerabilities

Read `package.json` (or equivalent for the project's package manager):
- Are security-critical packages (auth libraries, crypto, HTTP clients) on recent versions?
- Are there packages with known CVEs in the version ranges specified?
- Are versions pinned or using ranges (`^`/`~`)?
- Is a lockfile present and committed?

Flag significantly outdated security-critical packages as High severity.

### Supply Chain Security
- **Lockfile integrity:** Is a lockfile committed (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`)? Lockfiles should be committed — they pin exact versions and prevent dependency substitution attacks.
- **Outdated dependencies:** Run `npm audit` (or equivalent). Note any high/critical CVEs.
- **Typosquatting risk:** Check recently added packages for common typosquatting patterns — packages with names very similar to popular ones (e.g., `lodahs` vs `lodash`, `expres` vs `express`).
- **Unpinned versions:** Dependencies with `*` or `latest` as version can silently upgrade to malicious releases. Flag any found.
- **Transitive risk:** Note if any dependency is unmaintained (last publish > 2 years, no issues response) — these are targets for maintainer hijacking.

### 3. Environment Variable Audit

**Client-side exposure check:**
- Find all places the code reads environment variables for use in client-side/browser code
- Identify which are safe to expose (publishable keys, public API URLs) vs. which are secrets
- Verify that any secret (API key, signing secret, service role key) is NOT readable in the browser

Common safe client-side vars: `NEXT_PUBLIC_*`, `VITE_*` that contain only publishable keys
Never safe: service role keys, signing secrets, private API keys, database passwords

**Documentation check:**
- Does `.env.example` exist and document all required variables WITHOUT real values?
- Is `.env` (with real values) in `.gitignore`?

**Git exposure:**
- Verify no `.env` file with real values is committed
- Check git history if suspicious

### 4. File Storage Security (if applicable)

If the project uses file storage (S3, Supabase Storage, GCS, etc.):
- Which buckets/containers are public vs. private?
- Are file type restrictions enforced (only allow expected file types)?
- Are file size limits configured?
- Can anonymous users list bucket contents? (public buckets should disable listing unless needed)
- Are upload endpoints authenticated?

### 5. CORS Configuration

Find CORS configuration (middleware, server config, or API gateway settings):
- Is `Access-Control-Allow-Origin` set to specific allowed origins (not `*`)?
- Is the allowed origins list driven by an environment variable (not hardcoded)?
- Does the configuration fail closed (deny by default) if the env var is missing?
- Does `*` appear anywhere for non-public APIs?

**Additional CORS checks:**
- **Credentials + wildcard:** `Access-Control-Allow-Credentials: true` with `Access-Control-Allow-Origin: *` is a critical misconfiguration — browsers reject it, but misconfigured servers expose this. Verify the origin is always a specific domain when credentials are enabled.
- **Preflight cache duration:** `Access-Control-Max-Age` should be set to reduce preflight overhead. Missing it causes a preflight on every cross-origin request.
- **Multi-layer consistency:** If CORS is configured at both the API server AND an upstream proxy (nginx, Cloudflare, API Gateway), they must agree. Conflicting headers cause intermittent failures that are hard to debug.
- **Dynamic origin validation:** If origin is validated dynamically (regex or list match), verify the regex doesn't have anchoring issues (e.g., `example.com` matching `evil-example.com`).

### 6. API/Server Function Security

For server-side functions or API routes:
- Are state-changing endpoints protected by authentication checks?
- Are there functions intended to be internal/scheduled that are inadvertently exposed publicly?
- Is there proper request validation (required fields, type checking)?

## Output Format (Required)

```markdown
## Infrastructure Security Audit

### Summary
- Security headers configured: X/6
- Dependency issues: X
- Environment variable issues: X
- Storage issues: X
- CORS issues: X

### Security Headers
| Header | Status | Current Value | Recommendation |

### Dependency Issues
| Package | Current Version | Issue | Severity |

### Environment Variable Issues
| Issue | Location | Severity |

### Storage Issues
| Bucket/Container | Public? | File Type Restriction? | Issue |

### CORS Issues
| Issue | Location | Severity |

### Recommendations
1. [Specific fix with file/location]
2. [Specific fix with file/location]
```
```

---

## After Subagent Returns

1. **Critical issues** → fix immediately (especially secrets exposure)
2. **Missing headers** → add to hosting config (low-risk change)
3. **Dependency issues** → create update plan with testing
4. **All clear** → document audit date in KB_8
