# AUTH_KB_4 — Session Lifecycle in Next.js App Router

**Stack-locked: Supabase Auth + @supabase/ssr + Next.js App Router. Cookie-based session concept is portable.**

---

## Pattern

Session state is stored in an HTTP-only cookie (`sb-<project_ref>-auth-token`) managed by `@supabase/ssr` — **not** the deprecated `@supabase/auth-helpers-nextjs`. The session is read server-side via four distinct client setups, one per App Router context. The critical constraint: **Server Components cannot write cookies**, so token refresh must happen in the proxy/middleware layer before RSC rendering begins. If the proxy skips the refresh, RSCs read a stale or expired token with no recovery path in that render cycle.

Each server context uses `createServerClient()` from `@supabase/ssr` but wires cookies differently:

- **Proxy (`proxy.ts` / Next 16, or `middleware.ts` / Next ≤15)** — reads and writes cookies via `NextRequest` / `NextResponse`. The only place that can refresh a token and propagate the refreshed cookie both upstream to RSCs (via `request.cookies`) and downstream to the browser (via `response.cookies`). Must return the *same* `supabaseResponse` object it created, not a new one.
- **Server Components** — reads via `await cookies()` (async required in Next 15+, synchronous access removed in Next 16). Cannot write cookies. The `setAll` handler must silently swallow errors.
- **Server Actions** — reads and writes via `await cookies()`. Server Actions can set response headers, so `cookieStore.set()` works.
- **Route Handlers** — same capabilities as Server Actions.

For reading auth state in proxy/server code, `getClaims()` is the 2026-preferred method (see AUTH_KB_2 for the JWT claims structure it returns). It validates the JWT signature against the project's published JWKS without hitting the Auth server, provided the project uses asymmetric keys (the default for newer Supabase projects). `getUser()` is the safe fallback but always incurs a network round-trip. `getSession()` is explicitly forbidden server-side — it reads the cookie without re-validating.

See AUTH_KB_1 for the login methods (email/password, magic link, OAuth, anonymous) that produce the session this KB manages. See AUTH_KB_3 for the AAL claim and step-up auth flows that may require session re-authentication mid-lifecycle.

---

## When to use / when to skip

**Use this pattern when:**
- Building any Next.js App Router app with Supabase Auth.
- You need server-side access to the current user in RSCs, Server Actions, or Route Handlers.
- You have protected routes that should redirect unauthenticated users.

**Skip / simplify when:**
- Pages Router (different SSR model — use `@supabase/auth-helpers-nextjs` legacy patterns instead).
- Static-only sites with no auth surface (no session to manage).
- Client-only SPAs where `createBrowserClient()` alone is sufficient.

---

## Anti-patterns

**Sync `cookies()` / `headers()` in Next 15+.**
Calling `cookies()` without `await` is a deprecation shim in Next.js 15 and throws in Next.js 16. All four code samples below use `await cookies()`. Any tutorial code from pre-15 that does `cookies().getAll()` inline must be updated.

**Calling `getSession()` server-side.**
Supabase docs explicitly state: *"Never trust `supabase.auth.getSession()` inside server code such as Proxy. It isn't guaranteed to revalidate the Auth token."* The cookie value is tamperable — an attacker can forge it. Always use `getClaims()` (preferred) or `getUser()` (safe, slower) server-side. `getSession()` is safe only in client components where the JS SDK maintains its own in-memory session.

**Returning a new `NextResponse` from proxy after the Supabase client is created.**
If you call `NextResponse.redirect(...)` or a fresh `NextResponse.next()` *after* the `createServerClient` call, the refreshed session cookies written to `supabaseResponse` are silently dropped. The cookies live on `supabaseResponse` — if you need to redirect, copy cookies from it to your new response, or build the redirect using `supabaseResponse` as the base.

**Double network round-trip: `getUser()` in proxy AND RSC.**
The proxy refresh writes the refreshed token back to the cookie. RSCs read that cookie on the same request. If you call `getUser()` (Auth-server network call) in both proxy and RSC, you double the round-trips per page load. Use the proxy to refresh, then use `getClaims()` (JWT-local on asymmetric-key projects) in RSCs and Route Handlers.

**Omitting `cacheHeaders` from the `setAll` callback in proxy.**
The `setAll` callback receives a second argument — `cacheHeaders` — containing `Cache-Control: no-store`, `Expires`, and `Pragma`. These must be applied to the HTTP response. Omitting them risks a CDN caching a session-bearing response and serving it to other users.

**Using `signOut()` without specifying scope.**
Default scope is `'global'` — signs the user out of all devices and sessions, not just the current one. Almost always you want `scope: 'local'`. Be explicit.

**Setting `runtime: 'edge'` in `proxy.ts` (Next 16).**
The proxy file runs on Node.js only in Next.js 16. Setting `runtime: 'edge'` throws an error at build time. If your project previously used Edge middleware for auth checks (faster global latency), that option is gone in Next 16. Plan for the Node.js cold-start implications.

---

## Generic example

### Setup: install packages

```bash
npm install @supabase/supabase-js @supabase/ssr
```

---

### Context 1 — Proxy (session refresh layer)

In Next.js 16+, the file is `proxy.ts` with `export function proxy()`. In Next.js ≤15, the file is `middleware.ts` with `export function middleware()`. The Supabase client wiring is identical in both.

```typescript
// proxy.ts (Next.js 16+) — rename to middleware.ts for Next.js ≤15
// and change `export function proxy` → `export function middleware`
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  // Start with a passthrough response.
  // CRITICAL: always use THIS object as the return value — never create a
  // new NextResponse after this point, or the refreshed session cookies are lost.
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, cacheHeaders) {
          // Write refreshed cookies to both:
          //   request.cookies → so RSCs on this request see the refreshed session
          //   supabaseResponse.cookies → so the browser receives the Set-Cookie header
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            supabaseResponse.cookies.set(name, value, options)
          })
          // Apply cache headers — prevents CDN from caching session-bearing responses
          Object.entries(cacheHeaders).forEach(([key, value]) => {
            supabaseResponse.headers.set(key, value)
          })
        },
      },
    }
  )

  // Refresh the session (if expired, Supabase will attempt a token refresh here).
  // getClaims() validates the JWT signature against JWKS — no Auth-server round-trip
  // for asymmetric-key projects (default for new Supabase projects).
  const { data: { claims }, error } = await supabase.auth.getClaims()

  // Handle session absence / refresh failure
  if (error || !claims) {
    // For protected routes: redirect to login
    const isProtectedRoute = request.nextUrl.pathname.startsWith('/dashboard')
    if (isProtectedRoute) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('next', request.nextUrl.pathname)
      // Copy cookies from supabaseResponse before redirecting
      const redirectResponse = NextResponse.redirect(loginUrl)
      supabaseResponse.cookies.getAll().forEach((cookie) => {
        redirectResponse.cookies.set(cookie.name, cookie.value)
      })
      return redirectResponse
    }
  }

  // Always return supabaseResponse so the refreshed session cookie propagates
  return supabaseResponse
}

export const config = {
  matcher: [
    // Run on all paths except static assets
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

> **Composing with tenant routing (SB_KB_8):** If your app uses subdomain-based multi-tenancy, the auth refresh runs first, then tenant resolution. The auth proxy writes the refreshed session cookie to the request before the tenant lookup reads headers. Do not swap the order — tenant resolution can read `claims` from the refreshed session (e.g., to validate org membership) but only if the session refresh has already run.

---

### Context 2 — Server Component client (read-only)

```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()  // async required in Next 15+; sync throws in Next 16

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          // Server Components cannot write cookies — proxy has already refreshed the session.
          // Silently ignore any write attempts (the SDK may call setAll even in RSC context).
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Expected in RSC context — not an error
          }
        },
      },
    }
  )
}
```

```typescript
// Usage in any Server Component or async layout:
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { claims } } = await supabase.auth.getClaims()

  if (!claims) {
    // Proxy should have redirected, but defend in depth
    redirect('/login')
  }

  return <div>Hello, {claims.email}</div>
}
```

---

### Context 3 — Server Action client (can write cookies)

```typescript
// actions/auth.ts
'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

// Canonical sign-out action — use scope: 'local' unless you explicitly want global sign-out
export async function signOutAction() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          // Server Actions CAN write cookies
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  // scope: 'local' — signs out current session only
  // scope: 'global' (default) — signs out all devices; almost never what you want
  // scope: 'others' — signs out all OTHER sessions, keeps current one active
  await supabase.auth.signOut({ scope: 'local' })

  redirect('/login')
}
```

---

### Context 4 — Route Handler client

```typescript
// app/api/me/route.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          // Route Handlers CAN write cookies
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { claims }, error } = await supabase.auth.getClaims()
  if (error || !claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({ userId: claims.sub, email: claims.email })
}
```

---

### Anonymous auth + upgrade path

Anonymous auth produces a real session with `is_anonymous: true` in the JWT. The user gets a real `auth.uid()` UUID and assumes the `authenticated` Postgres role — RLS policies for `authenticated` apply unless you explicitly check the claim.

```typescript
// Client component — sign in anonymously
const { data, error } = await supabase.auth.signInAnonymously()
// data.user.is_anonymous === true
// data.user.id is a stable UUID — safe to use as a FK in your schema
```

**Upgrading to a permanent account (most common path):**

```typescript
// Step 1: attach email — triggers verification email
const { error } = await supabase.auth.updateUser({ email: 'user@example.com' })

// Step 2: after user clicks verification link, optionally set a password
const { error } = await supabase.auth.updateUser({ password: 'secure_password' })

// Alternative: link an OAuth provider instead
const { error } = await supabase.auth.linkIdentity({ provider: 'google' })
```

> **[VERIFY BEFORE SHIPPING]** The anonymous auth docs do not explicitly confirm that `auth.uid()` is preserved when converting an anonymous user to a permanent account via `updateUser()`. The SDK design (modifying the existing user record rather than creating a new one) strongly implies the UUID stays the same. However, this needs explicit verification from Supabase documentation or source before you build data models that depend on the anonymous UID being stable through upgrade.

**RLS: distinguishing anonymous from permanent users:**

```sql
-- Restrict writes to permanent (non-anonymous) users
create policy "Only permanent users can post"
on posts as restrictive for insert
to authenticated
with check ((select (auth.jwt() ->> 'is_anonymous')::boolean) is false);

-- Permissive read for all authenticated users (anonymous + permanent)
create policy "All authenticated users can view"
on posts for select
to authenticated
using (true);
```

Note: A restrictive policy alone blocks everything. Pair every `restrictive` policy with a `permissive` policy that grants the underlying access.

---

## Trade-offs

| Auth read method | Latency | Tamper-resistance | When to use |
|---|---|---|---|
| `getClaims()` | Near-zero on asymmetric keys (JWKS cached locally); falls back to network on symmetric keys | JWT signature verified against JWKS | Default for proxy, RSC, Route Handlers, Server Actions on projects using asymmetric signing (new projects) |
| `getUser()` | +1 Auth-server network round-trip per call | JWT validated server-side by Supabase Auth | Fallback if `getClaims()` is unavailable (older `@supabase/ssr` versions); or when you need the most current user state (e.g., post-suspension check) |
| `getSession()` | Fastest — no network, no validation | **None** — cookie value is trusted as-is | **Never server-side.** Safe only in browser client components where the JS SDK manages the session in memory |

---

## Gotchas

**`signOut()` defaults to `scope: 'global'`.** Signs out all the user's devices, not just the current session. Almost every UX expectation is `scope: 'local'`. Set it explicitly — do not rely on the default. If you want a "sign out everywhere" security feature, expose it as a separate action with a confirmation dialog.

**`getClaims()` is the 2026-preferred read method.** The Supabase docs now feature `getClaims()` as the primary server-side auth check, replacing `getUser()` in canonical examples. Older guides, blog posts, and Supabase starter repos may still use `getUser()`. Both are safe; `getClaims()` avoids the Auth-server round-trip for asymmetric-key projects (the default for newer Supabase projects). If your project uses symmetric (HMAC-based) JWT signing — typical of older projects — `getClaims()` falls back to a network call and the latency difference disappears.

**[VERIFY BEFORE SHIPPING] Minimum `@supabase/ssr` version for `getClaims()`.** The `getClaims()` method is a relatively recent addition. Projects using older pinned versions of `@supabase/ssr` may not have it. If `getClaims` is undefined at runtime, fall back to `getUser()`. Document the minimum version that includes `getClaims()` once confirmed.

**RSC cannot write cookies.** If session refresh is needed, it must happen in proxy before the RSC renders. The `try/catch` in the RSC's `setAll` is not a fallback — it is a silent guard against a call that will always fail in RSC context. The proxy refresh is non-optional; removing it means expired sessions are never refreshed.

**Never return a new `NextResponse` from proxy without forwarding cookies.** If your proxy needs to redirect after creating the Supabase client, copy cookies from `supabaseResponse` to the redirect response (see Context 1 example above). Creating `NextResponse.redirect(...)` independently silently discards all cookie writes made by the Supabase client.

**Edge Runtime is gone in Next.js 16 proxy.** In Next 14/15, you could run `middleware.ts` on the Edge Runtime for lower global latency. In Next 16, `proxy.ts` is Node.js only — `runtime: 'edge'` throws. Plan for this when upgrading: Node.js cold-starts are slower than Edge, and auth runs on every non-static request. Consider the latency trade-off for geographically distributed users.

**Multi-tab session refresh race condition.** If a user has multiple tabs open and the access token expires, all tabs may call refresh simultaneously. `@supabase/ssr` includes an internal refresh mutex, but this protection only works if all tabs share the same cookie store (they do in a normal browser). Be aware of this if you're doing unusual session state management.

**Anonymous users assume the `authenticated` role.** Not the `anon` role. Any RLS policy that opens access to `authenticated` also applies to anonymous users. Audit your policies when enabling anonymous auth — an open INSERT policy for `authenticated` means anonymous users can write.

**`signOut()` does not immediately invalidate the access token.** It revokes the refresh token, but the current access token remains valid until it naturally expires (default: 1 hour). An attacker with a stolen access token has up to 1 hour of access after sign-out. Mitigation: shorten JWT expiry in Supabase project settings (Auth → Settings → JWT expiry). This is a Supabase platform constraint, not a bug.

**Subdomain routing and auth cookie domain scope.** If the auth cookie's domain is set to the apex domain (e.g., `.example.com`), it flows across subdomains — fine for `*.example.com` tenants. Custom-domain tenants (`onboarding.acme.com`) are a different apex and cannot receive that cookie. See SB_KB_8 for the token-exchange SSO bridge pattern required for custom-domain tenants.

**[VERIFY BEFORE SHIPPING] Supabase starter repos and Next.js 16 `proxy.ts`.** As of the research date, Supabase's official Next.js starter templates may still reference `middleware.ts`. Verify whether Supabase has updated their starters for Next 16 before using them as copy-paste references. The client-creation code patterns are identical between `middleware.ts` and `proxy.ts` — only the filename and exported function name change.

---

## Cross-references

- **AUTH_KB_1** — Login methods (email/password, magic link, OAuth, anonymous) that produce the session this KB manages.
- **AUTH_KB_2** — JWT custom claims structure; what `getClaims()` returns and how to extend claims with app-specific data.
- **AUTH_KB_3** — AAL claim and step-up auth; when a valid session must still re-authenticate for sensitive operations.
- **SB_KB_8** — Subdomain routing middleware that composes with this auth refresh pattern. Auth refresh runs first; tenant resolution reads the refreshed claims. Required reading if building multi-tenant with custom domains.
