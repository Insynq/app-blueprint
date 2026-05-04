# Auth Knowledge Base — Index

**Stack:** Supabase Auth + Next.js App Router (`@supabase/ssr`) + Resend (via Send Email Hook).

This folder owns everything from "user signs up" through "user deletes account." Tenancy + RLS are in `Supabase Structure KBs/` (specifically SB_KB_1 + SB_KB_12); this folder populates the identity context those policies read.

These files are for Claude. Principles-only docs fail at implementation time. Every KB has real SQL, real Server Actions, and real gotchas.

---

## File index

| File | Topic | Stack-portable? |
|---|---|---|
| `AUTH_KB_1_Login_Methods.md` | Magic link, OTP, OAuth (Google/GitHub), email+password, anonymous auth — decision matrix + UX | ⚠️ Partial — Supabase Auth APIs are Supabase-specific; UX patterns portable |
| `AUTH_KB_2_Auth_Hook_Claims.md` | Custom Access Token Hook: server-set `org_id`, `role`, `plan`, `aal` claims in the JWT | 🔒 Stack-locked: Supabase Custom Access Token Hook |
| `AUTH_KB_3_MFA_TOTP.md` | TOTP enrollment, manual login challenge, AAL2 step-up, recovery codes (app-built) | ⚠️ Partial — TOTP API is Supabase-specific; AAL pattern portable |
| `AUTH_KB_4_Session_Lifecycle_Nextjs.md` | `@supabase/ssr` clients across middleware/proxy + RSC + Route Handler + Server Action; refresh dance; sign-out; anonymous→auth upgrade | 🔒 Stack-locked: Supabase + Next.js App Router |
| `AUTH_KB_5_Signup_First_Org.md` | `SECURITY DEFINER` trigger on `auth.users` INSERT; self-serve vs invite path; first-org provisioning atomicity | ✅ Portable (Postgres trigger pattern) |
| `AUTH_KB_6_Account_Management.md` | Secure Email Change, password reset (PKCE under @supabase/ssr), soft-delete (ban + anonymize + audit), re-auth gate | ⚠️ Partial — Supabase admin API specifics; soft-delete pattern portable |

---

## Cross-cutting rules that apply everywhere

**Always:**
- Populate identity claims (`org_id`, `role`, `plan`) via the **Custom Access Token Hook** server-side. Never trust `user_metadata` for security decisions — it's client-writable.
- Read sessions server-side via `@supabase/ssr` cookie clients. The legacy `auth-helpers-nextjs` package is deprecated.
- Refresh the session in middleware/proxy **before** any RSC reads it — RSCs cannot write cookies.
- Use the InitPlan idiom for JWT claim reads in RLS: `(select auth.jwt() ->> 'org_id')`. See SB_KB_12.
- Prefer `supabase.auth.getClaims()` on the server (validates JWT against project JWKS, no Auth-server round-trip). `getUser()` works but adds latency. `getSession()` is unsafe server-side.
- Use AAL2 (`(select auth.jwt() ->> 'aal') = 'aal2'`) on RLS policies that gate sensitive operations. Mark them `as restrictive`.
- Soft-delete user accounts (ban + `deleted_at` + anonymize). Hard-delete only after the retention period elapses, if at all.
- Re-auth before any account-sensitive operation (email change, password change, deletion, role escalation).

**Never:**
- Trust `user_metadata` for roles, org IDs, or any access-control decision.
- Call `auth.admin.*` from client code — it leaks the service role key. These calls are server-only.
- Use synchronous `cookies()` / `headers()` — broken in Next.js 15, removed in Next.js 16.
- Call `auth.getSession()` server-side — the cookie value is tamperable.
- Use `signOut()` with the default `scope: 'global'` unless you actually want to sign the user out on every device. Always pass `scope: 'local'` explicitly.
- Use Edge Runtime in Next.js 16 `proxy.ts` — proxy is Node.js-only.
- Assume Supabase auto-prompts for MFA after login — it doesn't. Apps must check `getAuthenticatorAssuranceLevel()` and prompt manually.
- Hard-delete `auth.users` rows directly via SQL — orphans cascading data and breaks audit trails.
- Use `auth.admin.deleteUser(id, true)` expecting reversibility — the soft-delete flag is misleadingly named and is **not reversible**. Use app-layer soft-delete.

---

## Dependencies between files

```
AUTH_KB_2   ← AUTH_KB_5   (signup trigger creates the rows the hook reads)
AUTH_KB_2   ← AUTH_KB_4   (server-side session reading uses claims set by the hook)
AUTH_KB_3   ← AUTH_KB_2   (the `aal` JWT claim is populated through the hook flow)
AUTH_KB_4   ← AUTH_KB_1   (login methods produce the session the lifecycle KB manages)
AUTH_KB_6   ← AUTH_KB_3   (re-auth gate uses AAL2 step-up)
AUTH_KB_6   ← AUTH_KB_4   (sign-out flow on deletion)
```

Cross-folder dependencies:

```
AUTH_KB_2   → SB_KB_1     (the multi-org RLS policies that read the claims this KB populates)
AUTH_KB_2   → SB_KB_12    (InitPlan idiom for JWT claim reads)
AUTH_KB_5   → SB_KB_1     (this KB creates the org/membership rows SB_KB_1 assumes exist)
AUTH_KB_6   → SB_KB_5/6   (account events written to the immutable audit trail)
AUTH_KB_6   → SB_KB_7     (soft-delete pattern parallels document supersession)
AUTH_KB_1/6 → SB_KB_10    (transactional email dispatch for magic link, password reset, email change)
```

---

## When to update these files

Update the relevant AUTH_KB when:
- Supabase Auth changes a supported flow (e.g., Auth Hook signature, MFA API, password reset PKCE flow)
- `@supabase/ssr` ships a behavioral change (refresh semantics, client construction)
- Next.js changes App Router auth-relevant APIs (async `cookies()` / `headers()`, proxy.ts vs middleware.ts, runtime support)
- A pattern produces an unexpected result in production
- A new gotcha is discovered

Do not update AUTH_KBs to reflect project-specific decisions. These are stack patterns, not project docs.

---

## What these files do NOT cover

- **Custom auth providers** (Auth0, Clerk, Stytch, WorkOS) — different stack; would need a separate folder if adopted
- **SSO / SAML / SCIM** — Supabase Enterprise concern; out of scope for the template
- **Mobile-only auth flows** (deep linking, native biometrics, Sign in with Apple on iOS) — focused on Next.js
- **Bot / CAPTCHA / abuse mitigation** — better handled in an OBS_KB (planned)
- **Authorization beyond RLS** (ABAC, attribute-based logic in app code) — see SB_KB_1 + SB_KB_12 for what RLS handles
- **Account recovery for "lost password AND lost MFA"** — the app's responsibility to provide a support channel; no Supabase built-in

---

## VERIFY BEFORE SHIPPING

Several KBs flag items that primary Supabase docs didn't fully confirm. Search each KB for `[VERIFY BEFORE SHIPPING]` and confirm against current docs before relying on these patterns in production. Notable items:

- `ban_duration: '876000h'` syntax for soft-banning users (AUTH_KB_6)
- Anonymous-auth `auth.uid()` preservation across the upgrade-to-authenticated step (AUTH_KB_4)
- `reauthenticate()` reference page (AUTH_KB_6)
- Default magic-link validity duration (AUTH_KB_1)
- Supabase Auth's stance on GDPR right-to-erasure (AUTH_KB_6)

These are not blockers — most are operationally well-known but lack a quotable primary source. Re-verify when implementing.
