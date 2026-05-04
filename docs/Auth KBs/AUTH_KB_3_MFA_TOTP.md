# AUTH_KB_3 — MFA / TOTP: Enrollment, Challenge, AAL2 Enforcement

**Stack-locked to Supabase Auth (built-in TOTP). MFA concepts are portable.**

---

## Pattern

Enrollment makes a factor go from `unverified` to `verified` after the first successful challenge+verify call. Until that first verify completes, the factor is inert — it does not appear in MFA prompts and does not affect AAL. After enrollment, **login does not auto-prompt for MFA**. The app must call `getAuthenticatorAssuranceLevel()` after every sign-in and manually redirect or render the challenge screen when `nextLevel === 'aal2' && nextLevel !== currentLevel`. RLS policies gate sensitive operations on `aal2` using the InitPlan idiom (see SB_KB_12); these policies must be marked `as restrictive` or they can be bypassed by permissive policies on the same table. The `aal` claim is written into the JWT by Supabase Auth natively — no custom hook is needed (see AUTH_KB_2 for how a custom Access Token Hook can read and forward it).

---

## When to use / when to skip

**Require MFA when:**
- Admin or privileged role actions
- Billing changes, payment method updates, subscription cancellation
- Account deletion or data export
- Access to regulated, sensitive, or PII-heavy data
- Any operation where an attacker with a stolen password should not be able to proceed

**Skip when:**
- Consumer apps with no sensitive operations — user opt-in is sufficient
- Low-value accounts where MFA friction causes more churn than the security is worth
- Internal tooling where SSO provides equivalent assurance at the IdP level

---

## Anti-patterns

**Assuming Supabase prompts for MFA automatically.** It does not. After password login, the session starts at `aal1`. The app is fully responsible for detecting `nextLevel === 'aal2'` and rendering the challenge UI.

**Omitting `as restrictive` on AAL2 policies.** Without it the policy is OR'd with any permissive policy on the same table. A broad `authenticated` read policy will bypass your AAL2 gate entirely.

**Checking AAL only in the UI.** UI checks are a UX guardrail, not a security control. The RLS policy on the DB is the authoritative enforcement. Any server action that performs a sensitive write should also check `currentLevel` before proceeding, with RLS as the final backstop.

**Allowing unenroll at AAL1.** If a session is compromised at AAL1, an attacker who can remove MFA locks the real user out and downgrades their own access permanently. Require `currentLevel === 'aal2'` (a fresh challenge) before permitting unenrollment.

**Accumulating unverified factors.** Calling `enroll()` multiple times without unenrolling leaves lingering `unverified` factors. They do not trigger MFA prompts but clutter `listFactors()`. Clean up `unverified` factors older than a few minutes before starting a new enrollment.

**Storing or logging the TOTP secret.** The plain-text secret returned by `enroll()` is the TOTP seed. Do not write it to logs, analytics, or the DB. After enrollment the secret is the authenticator app's responsibility.

---

## Generic example

### Enrollment flow (client component)

```tsx
// app/settings/mfa/enroll/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'

export default function EnrollMFAPage() {
  const supabase = createClient()
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enrolled, setEnrolled] = useState(false)

  useEffect(() => {
    async function startEnrollment() {
      // Clean up any lingering unverified factors first
      const { data: existing } = await supabase.auth.mfa.listFactors()
      for (const f of existing?.totp ?? []) {
        if (f.status === 'unverified') {
          await supabase.auth.mfa.unenroll({ factorId: f.id })
        }
      }

      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
      if (error) { setError(error.message); return }
      setQrCode(data.totp.qr_code)   // SVG data URI
      setSecret(data.totp.secret)    // plain-text fallback for manual entry
      setFactorId(data.id)
    }
    startEnrollment()
  }, [])

  async function handleVerify() {
    if (!factorId) return
    setError(null)

    const { data: challenge, error: challengeErr } =
      await supabase.auth.mfa.challenge({ factorId })
    if (challengeErr) { setError(challengeErr.message); return }

    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code: code.trim(),
    })
    if (verifyErr) { setError(verifyErr.message); return }

    setEnrolled(true)
    // Session AAL is now aal2. All other sessions have been invalidated.
  }

  if (enrolled) return <p>MFA enabled. Other active sessions have been signed out.</p>

  return (
    <div>
      {qrCode && <img src={qrCode} alt="Scan this QR code in your authenticator app" />}
      {secret && (
        <details>
          <summary>Cannot scan? Enter manually</summary>
          <code>{secret}</code>
        </details>
      )}
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="6-digit code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <button onClick={handleVerify}>Enable MFA</button>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
```

### Post-login challenge gate (App Router layout)

Wrap protected routes in this component. It runs once after sign-in and is fast — `getAuthenticatorAssuranceLevel()` rarely requires a network round-trip.

```tsx
// components/AuthGate.tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { MFAChallengeScreen } from '@/components/MFAChallengeScreen'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const [ready, setReady] = useState(false)
  const [needsMFA, setNeedsMFA] = useState(false)

  useEffect(() => {
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      if (data?.nextLevel === 'aal2' && data.nextLevel !== data.currentLevel) {
        setNeedsMFA(true)
      }
      setReady(true)
    })
  }, [])

  if (!ready) return null
  if (needsMFA) return <MFAChallengeScreen onSuccess={() => setNeedsMFA(false)} />
  return <>{children}</>
}
```

```tsx
// components/MFAChallengeScreen.tsx
'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'

export function MFAChallengeScreen({ onSuccess }: { onSuccess: () => void }) {
  const supabase = createClient()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setError(null)
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const totpFactor = factors?.totp[0]
    if (!totpFactor) return

    const { data: challenge, error: cErr } =
      await supabase.auth.mfa.challenge({ factorId: totpFactor.id })
    if (cErr) { setError(cErr.message); return }

    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: totpFactor.id,
      challengeId: challenge.id,
      code: code.trim(),
    })
    if (vErr) { setError(vErr.message); return }

    onSuccess()
  }

  return (
    <div>
      <p>Enter the 6-digit code from your authenticator app.</p>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <button onClick={handleSubmit}>Verify</button>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
```

### Step-up auth (inline AAL2 gate for sensitive actions)

For actions that require AAL2 but don't justify a full page redirect, prompt inline. See AUTH_KB_4 for the full re-auth flow pattern in App Router.

```tsx
// hooks/useMFAGate.ts
'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/client'

export function useMFAGate() {
  const supabase = createClient()
  const [showChallenge, setShowChallenge] = useState(false)
  const pendingAction = useRef<(() => Promise<void>) | null>(null)

  async function requireAAL2(action: () => Promise<void>) {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (data?.currentLevel === 'aal2') {
      await action()
    } else if (data?.nextLevel === 'aal2') {
      pendingAction.current = action
      setShowChallenge(true)
    } else {
      // No MFA enrolled — proceed or redirect to enrollment
      await action()
    }
  }

  async function onChallengeSuccess() {
    setShowChallenge(false)
    if (pendingAction.current) {
      await pendingAction.current()
      pendingAction.current = null
    }
  }

  return { showChallenge, setShowChallenge, requireAAL2, onChallengeSuccess }
}
```

### AAL2-restrictive RLS policies (InitPlan idiom)

The `(select auth.jwt() ->> 'aal')` form evaluates once per query rather than per row. See SB_KB_12 for the full InitPlan idiom explanation.

```sql
-- Hard gate: ALL authenticated users must be at AAL2
-- Use for admin tables, billing, account deletion
create policy "require_aal2"
  on sensitive_table
  as restrictive
  to authenticated
  using ((select auth.jwt() ->> 'aal') = 'aal2');

-- Soft gate: only users who have enrolled MFA must be at AAL2
-- Users without MFA enrolled can still access at AAL1
create policy "require_aal2_if_enrolled"
  on sensitive_table
  as restrictive
  to authenticated
  using (
    array[(select auth.jwt() ->> 'aal')] <@ (
      select case when count(id) > 0
        then array['aal2']
        else array['aal1', 'aal2']
      end
      from auth.mfa_factors
      where (select auth.uid()) = user_id
        and status = 'verified'
    )
  );

-- Grandfathering: enforce only for users created after a rollout date
create policy "require_aal2_new_users"
  on sensitive_table
  as restrictive
  to authenticated
  using (
    array[(select auth.jwt() ->> 'aal')] <@ (
      select case when created_at >= '2025-01-01T00:00:00Z'
        then array['aal2']
        else array['aal1', 'aal2']
      end
      from auth.users
      where (select auth.uid()) = id
    )
  );
```

### Forced enrollment guard (admin role gating)

Prevent role escalation without a verified factor:

```sql
create or replace function check_mfa_before_admin_role()
returns trigger language plpgsql security definer as $$
begin
  if new.role = 'admin' and old.role <> 'admin' then
    if not exists (
      select 1 from auth.mfa_factors
      where user_id = new.id and status = 'verified'
    ) then
      raise exception 'MFA enrollment required before admin role assignment';
    end if;
  end if;
  return new;
end;
$$;
-- Attach to the profiles table (not auth.users — requires service role access)
```

---

## Trade-offs

| Approach | UX | Security | When to use |
|---|---|---|---|
| Required at signup (forced enrollment) | Higher friction at onboarding | Strongest — all sessions are AAL2 | Regulated apps, enterprise-only, internal admin tools |
| Required for sensitive ops only (step-up) | Smooth daily use; friction only when it matters | Strong where it counts; AAL1 sessions exist for read-only paths | Most B2B/SaaS apps with a mix of sensitive and non-sensitive operations |
| Optional (user opt-in) | No friction by default | Weakest — opt-in rates are typically low | Consumer apps, low-value accounts, when MFA friction exceeds security benefit |

---

## Gotchas

**Supabase has no native recovery codes.** Recovery codes are not a Supabase feature (confirmed as of May 2026 — not mentioned anywhere in the MFA or TOTP guides). If a user loses their authenticator device, recovery paths are: (a) sign in via email magic link (AAL1 only) and then support-assisted re-enrollment, or (b) a server-side admin action that unenrolls the lost factor. Apps that need self-service recovery codes must generate them at enrollment time (cryptographically random, hashed in the DB, single-use), implement their own verify path, and tell users during enrollment: "Save these codes — Supabase cannot recover your MFA." See AUTH_KB_6 for the recovery code management flow as part of account settings.

**Login does not auto-prompt for MFA.** After any sign-in method (password, OAuth, magic link), the session starts at `aal1` regardless of what factors are enrolled. The app must call `getAuthenticatorAssuranceLevel()` and render the challenge UI when `nextLevel === 'aal2' && nextLevel !== currentLevel`. Skipping this check means enrolled users silently operate at AAL1.

**`as restrictive` is required on AAL2 RLS policies.** A `using` clause without `as restrictive` creates a permissive policy. Permissive policies are OR'd — any other permissive policy that grants access (e.g., a broad `to authenticated` read policy) will bypass the AAL2 check entirely. `as restrictive` forces AND evaluation: every restrictive policy must pass.

**Other sessions are invalidated on first enrollment verify.** When a user successfully verifies their TOTP factor for the first time, Supabase logs out all other active sessions. This is intentional (security) but will surprise users on multiple devices. Surface a warning in the enrollment UI: "Enabling MFA will sign you out of other devices."

**Unenroll requires AAL2.** The `unenroll()` API does not enforce AAL2 on its own. Gate unenrollment behind a fresh challenge, either in a Server Action that checks `currentLevel` or via an AAL2-restrictive RLS policy on the factor management UI path.

**TOTP is time-based — clock drift causes persistent failures.** Supabase tolerates ±1 window (~30 seconds) of clock skew. Users with device clocks more than ~30 seconds off will get repeated "invalid code" errors with no obvious cause. Surface in the error UI: "Is your device clock synchronized to network time?" [VERIFY BEFORE SHIPPING: confirm exact Supabase clock skew tolerance window.]

**`getAuthenticatorAssuranceLevel()` is client-side only.** For server-side AAL checks (Server Components, Route Handlers, Server Actions), inspect the JWT `aal` claim directly via `getClaims()` — see AUTH_KB_4 for the canonical server-side claim-read pattern. Do not call `getAuthenticatorAssuranceLevel()` from server code.

**Admin unenroll is not a documented public API.** Audit verification confirmed the `auth.admin.mfa.unenroll()` shape is not part of the public Admin API surface in current Supabase docs. To unenroll a factor as an admin (e.g., as part of a support flow when a user lost their authenticator), the documented path is direct DB manipulation via service role: `delete from auth.mfa_factors where user_id = $1 and id = $2;`. Wrap this in a Server Action that requires AAL2 from the admin and writes an audit event.

**`challengeAndVerify()` shorthand exists.** `auth.mfa.challengeAndVerify({ factorId, code })` combines the two steps. Acceptable for simple flows. The two-step version shown above is preferred when retry logic needs the `challengeId`, or when the challenge and verify happen in separate UI interactions.

**No "rotate secret" API.** There is no way to refresh a TOTP secret for an existing factor. The only path is unenroll the current factor and re-enroll (which produces a new secret and QR code). Document this for users who need to migrate authenticator apps.

---

## Cross-references

- **AUTH_KB_2**: How the `aal` claim gets written into the JWT; custom Access Token Hook patterns.
- **AUTH_KB_4**: Re-auth (step-up) flow integration in App Router — full pattern for intercepting sensitive navigation.
- **AUTH_KB_6**: Recovery code generation and verification as part of account management settings.
- **SB_KB_12**: InitPlan idiom — why `(select auth.jwt() ->> 'aal')` outperforms `auth.jwt() ->> 'aal'` in RLS policies.
