# AUTH_KB_6 — Account Management: Email Change, Password Reset, Soft-Delete

**Stack-locked: Supabase Auth. Account-lifecycle concepts are portable.**

---

## Pattern

Account-lifetime operations — email change, password reset, and account deletion — are the highest-risk mutations in any auth system. Each one requires a re-auth gate (the session being valid is not enough), an immutable audit record written before the mutation, and a deliberate choice about data retention. Email change uses Supabase's Secure Email Change (two-OTP, two confirmations required). Password reset under `@supabase/ssr` uses PKCE: a server-side token exchange before the new password is accepted. Account deletion defaults to soft-delete — ban the auth user, mark `profiles.deleted_at`, anonymize visible PII — then schedule a hard-delete after a retention window. Nothing is destroyed immediately. The audit trail is the source of truth; the auth row is secondary.

---

## When to use / when to skip

**Use the soft-delete pattern when:**
- The app has any audit, billing, or compliance requirements
- Users can leave content (comments, files, sessions, documents) that other rows reference
- A grace period for account recovery is a product requirement
- GDPR or equivalent applies — anonymization satisfies Art. 17 right-to-erasure for retained data

**Skip / simplify when:**
- Consumer-only apps with no shared content and no regulatory obligation
- A strict regulatory requirement mandates immediate hard-delete on request — rare; anonymization satisfies erasure in most jurisdictions, but confirm with legal counsel

---

## Anti-patterns

**Hard-deleting `auth.users` rows directly via SQL.**
Supabase's auth subsystem maintains internal state (tokens, MFA factors, sessions) that is not cleaned up by a raw `DELETE FROM auth.users`. Use `supabase.auth.admin.deleteUser()` instead. Direct SQL also bypasses cascading cleanup and leaves audit records with unresolvable foreign keys.

**Calling `auth.admin.*` from client-side code.**
Admin methods require the `service_role` key. The service_role key must never be sent to the browser. Run all admin operations inside Server Actions, Route Handlers, or Edge Functions. See AUTH_KB_2 for the established server-side admin client pattern.

**Allowing email change without re-auth.**
A hijacked session (stolen refresh token, XSS) can take over an account permanently by changing the email before the owner notices. Always gate `updateUser({ email })` behind a password re-entry challenge or fresh TOTP (see AUTH_KB_3).

**Allowing password change without current-password verification.**
Without this check, anyone who acquires a valid session — including the user themselves after a shared-device slip — can lock out the original owner. Use `updateUser({ password, currentPassword })` (supabase-js v2.102.0+) for in-settings password change, or require a fresh `signInWithPassword` challenge.

**Hard-deleting users before the retention period elapses.**
Breaks audit trails. Rows in `audit_log` that reference the deleted user's UUID become unresolvable. Soft-delete first; schedule hard-delete only after the retention window and only if retention policy allows. See SB_KB_5 / SB_KB_6 for the immutable audit log pattern.

**Relying on FK cascades alone for soft-delete.**
A cascade `DELETE` removes the rows. For soft-delete you want those rows to remain and remain queryable by admins. Use a `deleted_at` column gated by RLS (`WHERE deleted_at IS NULL` for normal reads; separate admin policies for deleted-row visibility). The cascade is only useful when you eventually do hard-delete after the retention window.

**Storing PII in audit log payloads.**
Audit records are immutable and long-lived. After a user is anonymized, the `[deleted]` display name in `profiles` resolves correctly via UUID — but if you stored `email: "user@example.com"` in the `payload` column, it lives forever. Redact PII from payloads; store opaque identifiers (UUID) only.

**Not handling the storage ownership constraint before deletion.**
`auth.admin.deleteUser()` fails if the user owns any objects in Supabase Storage. Always transfer or purge their storage objects as part of the deletion job before issuing the final deleteUser call. See the soft-delete Server Action below — storage cleanup is an async job step.

---

## Generic example

```typescript
// -------------------------------------------------------
// Email change — Server Action
// (triggers Secure Email Change; SB_KB_10 Send Email Hook
//  handles dispatch of both confirmation emails)
// -------------------------------------------------------
'use server'
import { createServerClient } from '@/lib/supabase/server'
import { requireRecentAuth } from '@/lib/auth/reauth'

export async function changeEmail(newEmail: string) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Re-auth gate: reject sessions older than 10 minutes for this operation
  await requireRecentAuth(user)

  const { error } = await supabase.auth.updateUser({ email: newEmail })
  if (error) throw error

  // Supabase fires the Send Email Hook once with email_action_type = 'email_change'
  // The hook (SB_KB_10) detects this and sends TWO emails:
  //   - one to the current address (confirm you initiated this)
  //   - one to the new address (confirm you own it)
  // Both must be clicked before the change takes effect.

  // Defensive: record pending state so we can reject stale confirmations
  await supabase.from('profiles').update({
    pending_email: newEmail,
    pending_email_at: new Date().toISOString(),
  }).eq('id', user.id)
}
```

```typescript
// -------------------------------------------------------
// Password reset — App Router (Next.js + @supabase/ssr)
// -------------------------------------------------------

// Step 1: Forgot-password page — initiate the flow
// (runs client-side; redirectTo must be whitelisted in Auth > URL Configuration)
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: `${origin}/auth/confirm?next=/account/reset-password`,
})

// Step 2: app/auth/confirm/route.ts — PKCE server-side token exchange
// The email template must use:
//   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
import { type EmailOtpType } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/'

  if (token_hash && type) {
    const supabase = await createServerClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) return NextResponse.redirect(new URL(next, request.url))
  }
  return NextResponse.redirect(new URL('/auth/error', request.url))
}

// Step 3: /account/reset-password — user now has an active session via cookie
// Collect and validate the new password, then:
await supabase.auth.updateUser({ password: newPassword })

// For in-settings password change (user is already logged in, knows old password):
await supabase.auth.updateUser({ password: newPassword, currentPassword: oldPassword })
// Requires supabase-js v2.102.0+
```

```typescript
// -------------------------------------------------------
// Soft-delete Server Action — requires service_role client
// Parallels the document supersession pattern in SB_KB_7:
// nothing is destroyed immediately; deletion is append-only state.
// -------------------------------------------------------
'use server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRecentAuth } from '@/lib/auth/reauth'

export async function deleteAccount(userId: string, actorId: string) {
  const adminClient = createAdminClient() // service_role key — server only

  // Re-auth gate: confirm the actor recently authenticated (see AUTH_KB_3 for AAL2)
  await requireRecentAuth({ userId: actorId, maxAgeSeconds: 300 })

  // 1. Write the audit event FIRST — immutable, even if later steps fail.
  //    See SB_KB_5 / SB_KB_6 for the audit_log table structure.
  //    Never store PII in the payload — UUID resolves via profiles.
  await adminClient.from('audit_log').insert({
    event_type: 'account.deletion_requested',
    actor_id: actorId,
    target_id: userId,
    payload: { requested_at: new Date().toISOString() },
  })

  // 2. Active session handling.
  //    There is NO public admin API to invalidate all sessions for a target user
  //    by userId. `auth.admin.signOut(jwt, scope)` requires the user's own JWT,
  //    not a userId — making it useless from a deletion flow where the actor
  //    is an admin operating on someone else.
  //    After step 4 (ban) future logins are blocked. Existing access tokens
  //    remain valid until expiry (default 1 hour). For immediate refresh-token
  //    revocation, delete from auth.refresh_tokens via the service role:
  //      delete from auth.refresh_tokens where user_id = $1;
  //    Most apps accept the up-to-1-hour residual window after ban rather than
  //    touching auth.refresh_tokens directly.

  // 3. Anonymize visible PII in profiles — keep the row for audit linkage.
  await adminClient.from('profiles').update({
    deleted_at: new Date().toISOString(),
    display_name: '[deleted]',
    avatar_url: null,
    // email kept in auth.users for audit; anonymize here after retention period
  }).eq('id', userId)

  // 4. Ban the auth user — prevents re-login during the retention window.
  //    [VERIFY BEFORE SHIPPING] — ban_duration string format ('876000h', 'none')
  //    is widely cited but was not confirmed in official docs during research.
  //    Verify against current Supabase admin docs / SDK TypeScript types
  //    (UserAttributes.ban_duration) before shipping.
  await adminClient.auth.admin.updateUserById(userId, {
    ban_duration: '876000h', // ~100 years
  })

  // 5. Transfer or delete storage objects owned by this user.
  //    deleteUser() will FAIL if the user owns any Storage objects.
  //    Enqueue as an async job — see JOB_KB family (future KB) for
  //    the background job pattern for storage cleanup and hard-delete scheduling.

  // 6. Schedule the hard-delete after the retention window (e.g., 30 days).
  //    The background job calls auth.admin.deleteUser(userId) when the
  //    retention period elapses and all storage objects are cleared.
}
```

```typescript
// -------------------------------------------------------
// Re-auth gate helper — referenced by all three flows above
// Pairs with AUTH_KB_3 for AAL2 enforcement
// -------------------------------------------------------
import { createServerClient } from '@/lib/supabase/server'

export async function requireRecentAuth({
  userId,
  maxAgeSeconds = 600,
}: {
  userId: string
  maxAgeSeconds?: number
}) {
  const supabase = await createServerClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) throw new Error('No active session')

  const lastAuth = new Date(session.user.last_sign_in_at ?? 0).getTime()
  const ageSeconds = (Date.now() - lastAuth) / 1000

  if (ageSeconds > maxAgeSeconds) {
    throw new Error('Re-authentication required for this operation')
  }

  // For MFA-enrolled users, optionally assert AAL2 here.
  // See AUTH_KB_3 for getAuthenticatorAssuranceLevel() pattern.
}
```

---

## Trade-offs

| Deletion approach | Reversibility | Audit fidelity | When to use |
|---|---|---|---|
| Soft-delete + anonymize (recommended) | High — reversible within retention window | High — UUID linkage preserved | Default for all apps with audit, billing, or shared content |
| Hard-delete via admin API after retention | None | Low — audit refs become stale | Only after retention period elapses AND retention policy allows |
| `deleteUser(userId, true)` (Supabase soft-delete flag) | None — not reversible despite the name | Low — hashes the user ID | Avoid; use app-layer soft-delete instead |
| Ban only, no deletion | Full | Full | Temporary suspension; disputes; fraud hold |

---

## Gotchas

**Secure Email Change sends two emails, not one.**
When Secure Email Change is enabled in your Supabase project, Supabase fires the Send Email Hook a single time with `email_action_type: "email_change"` and two token pairs populated. The hook implementation must detect this event and dispatch two separate emails — one to the current address, one to the new address. Both links must be confirmed before the change takes effect. The SB_KB_10 Send Email Hook handler is responsible for this dispatch logic.

**Token hash naming is backwards — a documented backward-compat quirk.**
In the Send Email Hook payload for `email_change`:
- `token` + `token_hash_new` → confirm link for the **current** address
- `token_new` + `token_hash` → confirm link for the **new** address

The `_new` suffix is on the field that goes to the *current* email, not the new one. This is a Supabase backward-compatibility quirk documented in the Send Email Hook guide. Test against a live environment before deploying; do not rely on the naming to infer direction.

**Password reset under `@supabase/ssr` requires PKCE — the implicit flow will not work.**
The implicit flow delivers the access token as a URL fragment (`#access_token=...`). Fragments are never sent to the server and are invisible to Next.js Route Handlers. Always use the `token_hash` approach: configure the email template to include `{{ .TokenHash }}` as a query param, and exchange it server-side in `/auth/confirm` using `verifyOtp`. The confirm route must use `createServerClient()` from `@supabase/ssr`, not the browser client.

**`deleteUser(userId, true)` soft-delete is NOT reversible — despite the parameter name.**
Supabase's built-in `shouldSoftDelete: true` flag hashes the user ID. The user cannot be restored. App-layer soft-delete (ban + `deleted_at` + anonymize) is reversible within the retention window. Prefer the app-layer approach.

**`ban_duration: '876000h'` — verify string format before shipping. [VERIFY BEFORE SHIPPING]**
This value is widely cited in community guides and GitHub issues, but the exact string format was not confirmed in the official `updateUserById` documentation during research (the reference page showed only parameter names). Verify against the current Supabase JS SDK TypeScript types (`UserAttributes.ban_duration`) and the latest admin docs before relying on this in production.

**Session invalidation after deletion is not automatic.**
JWTs issued before the ban remain valid until their expiry time. Always call `auth.admin.signOut(userId)` before banning or deleting to revoke refresh tokens and close active sessions. Short JWT TTLs (15 minutes, the Supabase default) reduce the residual window. See AUTH_KB_4 for the full session lifecycle.

**`resetPasswordForEmail` with `redirectTo` — the URL must be whitelisted.**
Supabase silently ignores a `redirectTo` value that is not listed under Auth > URL Configuration in the dashboard. If not whitelisted, the link will redirect to the default site URL, stripping the `next` param and breaking the recovery flow. Add your confirm route to the allowed list before testing.

**Email change race condition — pending state is not managed by Supabase. [VERIFY BEFORE SHIPPING]**
If a user calls `updateUser({ email })` twice quickly, it is not confirmed whether Supabase invalidates the prior pending token pair. Two competing confirmation links may both be valid until expiry, creating an ambiguous account state. Defensive pattern: store `pending_email` and `pending_email_at` in `profiles`; reject confirmation callbacks older than the most recent request's timestamp.

**Lost password + lost MFA = locked out.**
If a user loses access to both their password (hence the recovery email) and their TOTP authenticator simultaneously, recovery is the app's responsibility. Supabase provides no built-in recovery flow for this scenario. Design a support-assisted recovery path (identity verification, manual admin unlock) before going to production. See AUTH_KB_3 for the MFA enrollment and recovery considerations.

**Anonymization satisfies GDPR right-to-erasure in most cases — but confirm for your jurisdiction. [VERIFY BEFORE SHIPPING]**
Replacing PII with `[deleted]` and a UUID satisfies Art. 17 right-to-erasure under GDPR when the data subject is no longer identifiable. However, "legitimate retention" exceptions apply (fraud prevention, legal disputes, billing records). This KB assumes anonymization is sufficient; confirm with legal counsel for the specific app jurisdiction and retention period before finalizing the deletion policy. No official Supabase GDPR guide was accessible during research.

**Audit log entries must use UUIDs, not emails or display names.**
After a user is anonymized, audit log rows that reference the user's UUID still resolve correctly to `[deleted]` via the profiles table. Rows that stored the email string directly are permanently de-anonymized. See SB_KB_5 / SB_KB_6 for the immutable audit log pattern and the constraint that audit payloads must not contain PII.

---

## Cross-references

- **AUTH_KB_3** — MFA: AAL2 assertions and `getAuthenticatorAssuranceLevel()` for the re-auth gate
- **AUTH_KB_4** — Session lifecycle: sign-out flow and session revocation after account deletion
- **SB_KB_5 / SB_KB_6** — Audit trail: immutable event log that account lifecycle events must write to before mutating state
- **SB_KB_7** — Document compliance: soft-delete parallels the document supersession pattern (append-only, nothing destroyed immediately)
- **SB_KB_10** — Resend + Send Email Hook: handles transactional dispatch for both emails in the Secure Email Change flow
- **JOB_KB** (future) — Background jobs: the async storage cleanup and hard-delete scheduling referenced in the soft-delete Server Action
