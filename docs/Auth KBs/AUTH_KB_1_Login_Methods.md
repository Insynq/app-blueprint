# AUTH_KB_1 — Login Methods: Magic Link, OTP, OAuth, Password

**Stack-locked to Supabase Auth + Next.js App Router. Login UX patterns are portable.**

---

## Pattern

Supabase Auth supports six method families: email+password, magic link, email OTP, phone OTP, OAuth (social), SSO/SAML, anonymous sign-in, and custom OIDC providers (GA as of April 2026). For most new apps, the decision narrows to three: OAuth as the primary, email OTP as the passwordless fallback, and email+password for users who expect it. All three converge on the same PKCE callback route at `/auth/callback`.

The core flow is PKCE. When a user authenticates, Supabase issues an `authorization_code` that the client exchanges for a session at the callback route via `exchangeCodeForSession(code)`. The code verifier lives in a cookie managed automatically by `@supabase/ssr` — the developer only needs to implement the exchange step. Magic link and email+password confirmation use a parallel confirm route at `/auth/confirm` that calls `verifyOtp({ type, token_hash })` instead. After the callback, session management is AUTH_KB_4's scope.

---

## When to use / when to skip

**Use OAuth (Google, GitHub) when:**
- Conversion rate is the priority — no password to forget, no inbox check required
- The user base already has accounts with a major provider
- You want to offload credential security entirely to the provider
- Building B2C or developer-facing products

**Use email OTP when:**
- Users must not be required to have a social account
- The user might read email on a different device than they're signing in from
- An in-app verification step (enter the code, don't leave the browser) is preferable to a redirect
- Magic link is ruled out due to link-previewer risk (see Gotchas)

**Use email+password when:**
- The user base expects it: enterprise, government, regulated industries
- Offline-compatible auth is required
- Users are suspicious of "sign in with Google"
- Always pair with email confirmation enabled and a password reset flow

**Use magic link when:**
- Users are definitively on desktop, reading email in the same browser session
- Zero-input UX is required and the cross-device/previewer risk is acceptable

**Skip / simplify when:**
- Internal tools with a fixed set of users: SSO/SAML or a single OAuth provider is sufficient
- Single-use prototypes: anonymous sign-in + upgrade path avoids all registration friction

---

## Anti-patterns

**Using `getSession()` in server components or Route Handlers**
`getSession()` does not validate JWT signatures. Access control decisions in server code must use `getClaims()`, which performs signature validation. This is the highest-severity auth bug in Next.js + Supabase codebases.

```typescript
// Wrong
const { data: { session } } = await supabase.auth.getSession()
const userId = session?.user.id  // untrusted — signature not verified

// Correct
const { data: { claims } } = await supabase.auth.getClaims()
const userId = claims?.sub  // JWT signature validated
```

**Using `@supabase/auth-helpers-nextjs`**
This package is deprecated. Use `@supabase/ssr` with `createBrowserClient` / `createServerClient`. Old code using `createMiddlewareSupabaseClient` or `createServerSupabaseClient` must be migrated.

**Using magic link as the sole passwordless method**
Link previewers (Apple Mail Privacy Protection, Outlook SafeLinks, Slack unfurl bots) pre-fetch URLs in emails. Because magic link tokens are one-time-use, the previewer consumes the token before the user clicks — the user sees "link expired" immediately. This is structural, not fixable by the app. Use email OTP instead.

**Passing unchecked `next` params through to `NextResponse.redirect`**
The `next` query parameter in the callback route is user-controlled. Without validation, this is an open-redirect vector.

```typescript
// Wrong
return NextResponse.redirect(`${origin}${searchParams.get('next')}`)

// Correct
let next = searchParams.get('next') ?? '/'
if (!next.startsWith('/')) next = '/'
return NextResponse.redirect(`${origin}${next}`)
```

**Using broad wildcard redirect patterns in production**
`**` glob patterns match any URL and should only be used for local/preview environments. Production `redirectTo` values must be exact URLs registered in Authentication > URL Configuration.

```
# Local only
http://localhost:3000/**

# Production — exact paths only
https://yourapp.com/auth/callback
https://yourapp.com/auth/confirm
```

**Not registering `emailRedirectTo` URLs in the allowlist**
Any `redirectTo` value passed to `signInWithOtp()` or `signInWithOAuth()` must be registered in Authentication > URL Configuration. Unregistered URLs are rejected silently from the user's perspective — the auth flow fails with no helpful error.

**Disabling link tracking on third-party SMTP without verifying Supabase compatibility**
Link tracking (e.g., in Mailgun, Resend, Postmark) rewrites URLs in outbound emails. If your SMTP provider rewrites the Supabase confirmation URL, the token embedded in the link is corrupted and the confirmation flow fails. Disable link tracking for transactional auth emails, or verify that your provider's rewrite is transparent to Supabase.

**Relying on built-in SMTP for production email volume**
The built-in SMTP hard cap is 30 new users per hour. Any sign-up after the 30th in a rolling hour will fail to deliver the confirmation email. Configure custom SMTP (Resend is the standard choice — see SB_KB_10 for the Supabase Send Email Hook + Resend setup) before beta launch.

**Enabling anonymous sign-ins without CAPTCHA/Turnstile**
The rate limit for anonymous sign-ups is 30 per hour per IP. This is insufficient against distributed abuse. Unconstrained anonymous sign-ups inflate the `auth.users` table with no automatic cleanup path. Enable Supabase's Turnstile integration before turning on anonymous sign-in.

---

## Generic example

```typescript
// app/auth/callback/route.ts
// Handles: OAuth exchange, magic link click-through
// Both methods land here after Supabase redirects with ?code=

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  let next = searchParams.get('next') ?? '/'

  // Open-redirect prevention: reject any non-relative path
  if (!next.startsWith('/')) next = '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Reverse-proxy environments (Vercel, Railway, Render) rewrite origin.
      // x-forwarded-host carries the real public hostname.
      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv = process.env.NODE_ENV === 'development'

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }

  // No code param, or code exchange failed — show error UI
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
```

```typescript
// app/auth/confirm/route.ts
// Handles: email+password confirmation tokens, magic link token_hash
// Email templates in SSR/PKCE mode must use {{ .TokenHash }}, not {{ .ConfirmationURL }}

import { type EmailOtpType } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  let next = searchParams.get('next') ?? '/'

  if (!next.startsWith('/')) next = '/'

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) return NextResponse.redirect(`${origin}${next}`)
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
```

```typescript
// OAuth initiation — client component
// Works for any provider: 'google' | 'github' | 'twitter' | etc.
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`,
    // To receive a Google refresh token (for calling Google APIs):
    // queryParams: { access_type: 'offline', prompt: 'consent' },
  },
})
// supabase-js handles the browser redirect automatically
```

```typescript
// Email OTP — send
// Returns { user: null, session: null } on success.
// Session is NOT available until the user verifies the code.
const { error } = await supabase.auth.signInWithOtp({
  email: userEmail,
  options: {
    shouldCreateUser: true, // false = only allow existing users
  },
})
```

```typescript
// Email OTP — verify (called when user submits the 6-digit code)
const { data: { session }, error } = await supabase.auth.verifyOtp({
  email: userEmail,
  token: otpCode,   // the code the user typed in
  type: 'email',
})
// session is now populated if successful
```

```typescript
// Magic link — send
// Requires emailRedirectTo to be registered in Authentication > URL Configuration.
// Email template must use {{ .ConfirmationURL }}, NOT {{ .Token }}.
const { error } = await supabase.auth.signInWithOtp({
  email: userEmail,
  options: {
    emailRedirectTo: `${window.location.origin}/auth/callback`,
    shouldCreateUser: true,
  },
})
```

```typescript
// Email+password — sign-up
// Email confirmation is enabled by default on hosted projects.
// The user must click the confirmation link before signInWithPassword succeeds.
const { error } = await supabase.auth.signUp({
  email: userEmail,
  password: userPassword,
  options: {
    emailRedirectTo: `${window.location.origin}/auth/confirm`,
  },
})

// Email+password — sign-in
const { data, error } = await supabase.auth.signInWithPassword({
  email: userEmail,
  password: userPassword,
})
// If email confirmation is enabled and the user hasn't confirmed,
// this returns an error. Handle it and prompt the user to check their inbox.
```

After any of these methods creates a session, see AUTH_KB_4 for how to read the session server-side, handle token refresh, and sign out. For JWT custom claims attached at login time, see AUTH_KB_2.

---

## Trade-offs

| Method | UX | Security | Setup | When to use |
|---|---|---|---|---|
| OAuth (Google, GitHub) | Highest conversion, no password | Provider handles credentials; PKCE required | OAuth app registration per provider | Default choice for B2C, developer tools |
| Email OTP | One extra step (enter code) | Short-lived code; works across devices | None beyond SMTP | Passwordless fallback when OAuth not viable |
| Magic link | Zero input after email | One-time token; link-previewer risk | Registered `emailRedirectTo` URL required | Desktop-only SaaS where device-pinning is acceptable |
| Email+password | Familiar; works offline | Credential stuffing risk; requires password reset flow | Custom SMTP required at scale | Enterprise/gov user bases; offline requirements |
| Anonymous | Zero friction, instant access | `is_anonymous` claim required in RLS; no cleanup automation | CAPTCHA/Turnstile strongly recommended | Onboarding, demos, try-before-register flows |

---

## Gotchas

**`getSession()` is unsafe in server code.** `getClaims()` validates JWT signatures; `getSession()` does not. Any server-side access control decision based on `getSession()` is a security bug. This is the most common auth mistake in Next.js + Supabase codebases.

**Magic link previewers invalidate the token before the user clicks.** Apple Mail Privacy Protection, Outlook SafeLinks, and some Slack unfurl bots pre-fetch URLs in incoming emails. Because Supabase magic link tokens are one-time-use, the pre-fetch consumes the token. The user clicks the link and sees "expired." This is not fixable at the app level. Use email OTP for any multi-device or high-deliverability flow. **[VERIFY BEFORE SHIPPING]** A specific Supabase documentation page recommending OTP over magic link for this reason was not found in primary sources during research — the inference is sound operationally but check the current docs for official guidance.

**OTP maximum validity is 86400 seconds, but production recommends ≤3600.** A 6-digit OTP has 1,000,000 combinations. A long expiry window increases brute-force exposure. Set OTP validity to 600–900 seconds (10–15 minutes) in Authentication > Rate Limits. **[VERIFY BEFORE SHIPPING]** The 86400-second upper bound is widely cited but was not confirmed against current Rate Limits dashboard documentation — verify in your project before relying on the cap.

**60-second re-request window for OTP and magic link.** Supabase enforces a minimum 60-second gap between `signInWithOtp()` calls for the same email. Users who click "resend" within that window receive nothing. Surface a countdown timer in the UI — otherwise users assume the system is broken and bounce.

**`x-forwarded-host` required in production callback route.** When deployed behind a reverse proxy (Vercel, Railway, Render), `new URL(request.url).origin` returns the internal hostname, not the public URL. The callback route must check the `x-forwarded-host` header and redirect to `https://${forwardedHost}${next}` in production. Omitting this causes redirect loops or 404s. The generic example above includes this handling.

**Email confirmation must be complete before `signInWithPassword` succeeds.** Email confirmation is enabled by default on hosted Supabase projects. An unconfirmed user calling `signInWithPassword` receives an error. The UI must explicitly handle this state and prompt the user to check their inbox.

**Email template in SSR must use `{{ .TokenHash }}`, not `{{ .ConfirmationURL }}`.** For email+password sign-up confirmation (and magic link in PKCE mode), the email template must embed the token hash. The app exchanges it at `/auth/confirm` via `verifyOtp({ type, token_hash })`. Using `{{ .ConfirmationURL }}` in an SSR PKCE flow produces a broken confirmation link.

**OAuth provider tokens are not stored; capture them immediately.** Supabase does not persist the provider `access_token` or `refresh_token` from an OAuth sign-in. If your app needs to call Google Calendar, GitHub, or another provider API, read `session.provider_token` and `session.provider_refresh_token` at callback time and store them yourself. They are gone after the callback.

**Google does not send a refresh token by default.** To receive a `provider_refresh_token` from Google (needed for background API calls), add `queryParams: { access_type: 'offline', prompt: 'consent' }` to `signInWithOAuth()`. Without these params, `session.provider_refresh_token` will be null.

**Rate limit on built-in SMTP: 30 new users per hour, hard cap.** This is not a soft warning — sign-ups beyond 30 per hour will silently fail to deliver confirmation emails. Configure custom SMTP (Resend via the Send Email Hook — see SB_KB_10) before any public launch.

**New publishable key format.** Keys created on recent Supabase projects use the `sb_publishable_xxx` format. The legacy `anon` key format still works but will be deprecated. If environment variables reference the old format, update them when migrating or creating new projects.

**`signInWithPassword` rate limit bucket is unspecified.** The Supabase production checklist documents rate limits for OTP (360/hr), verification (360/hr), and token refresh (1800/hr) but does not explicitly state a rate limit for password-based sign-in. **[VERIFY BEFORE SHIPPING]** Check the current Authentication > Rate Limits dashboard for your project and test behavior under load before launch.

**`next` query param open-redirect.** The `next` parameter is user-supplied. Always validate `next.startsWith('/')` before using it in a redirect. The generic example above enforces this. An unchecked `next` allows an attacker to redirect authenticated users to a phishing domain after successful login.

**Magic link default validity duration is not published.** The dashboard exposes it at Authentication > Rate Limits, but the Supabase docs do not state a concrete default number. **[VERIFY BEFORE SHIPPING]** Check your project's current setting before relying on any assumed default.
