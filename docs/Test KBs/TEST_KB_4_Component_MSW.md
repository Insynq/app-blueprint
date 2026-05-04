# TEST_KB_4 — Component Tests: MSW v2 + Fake Supabase Client

**Stack:** React 18 + Next.js App Router · supabase-js v2 · Vitest · MSW v2

---

## Pattern

Client Components (`'use client'`) are the testable surface for component tests. MSW v2 intercepts the HTTP calls supabase-js makes (PostgREST, Auth, Edge Functions) at the Node fetch layer — no real network, no test database. A typed `mockTable<T>` factory produces per-test handler overrides. For logic-only hook and service tests where HTTP interception is overkill, a fake supabase-js client stubs the builder chain directly.

React Server Components cannot be rendered in Vitest. Test their logic helpers in isolation; validate their rendered output via Playwright (TEST_KB_5).

---

## When to Use / When to Skip

**Use MSW** when the test renders a React component that calls supabase through a `useEffect`, React Query, or SWR. Any test that asserts on UI states that depend on HTTP responses belongs here.

**Use the fake client** when the test covers a pure hook or service function — no component rendering, only logic and data transformation. Faster setup, no lifecycle overhead.

**Skip component tests entirely** for async RSCs — render them only via E2E (TEST_KB_5).

---

## Setup

### Install

```bash
npm i -D msw @testing-library/react @testing-library/dom @testing-library/user-event
npm i -D @vitejs/plugin-react jsdom vite-tsconfig-paths
```

MSW v2 requires Node 18+.

### File layout

```
src/
  mocks/
    handlers.ts        # baseline handlers (shared across all tests)
    server.ts          # node server instance
    factories.ts       # mockTable<T> and related helpers
  test/
    setup.ts           # vitest setupFiles entry point
    fixtures/
      auth.ts          # makeUser(), makeSession()
  lib/
    fakeSupabaseClient.ts
```

### `src/mocks/server.ts`

```typescript
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)
```

`setupServer` does not start a real HTTP server. It patches Node's native fetch and http modules. It is synchronous — no `await` needed.

### `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Only needed if 'msw/node' fails to resolve — Vitest ≥1.0 usually handles this automatically
    // environmentOptions: {
    //   jsdom: { customExportConditions: ['node', 'node-addons'] },
    // },
  },
})
```

### `src/test/setup.ts`

```typescript
import { beforeAll, afterEach, afterAll } from 'vitest'
import { cleanup } from '@testing-library/react'
import { server } from '../mocks/server'

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }))

afterEach(() => {
  server.resetHandlers()   // remove per-test overrides; baseline handlers remain
  cleanup()                // unmount all RTL-rendered components
})

afterAll(() => server.close())
```

`onUnhandledRequest: 'warn'` logs unmatched requests during development. Switch to `'error'` in CI to catch missing handlers before they silently pass tests.

---

## Mocking PostgREST Endpoints

### How supabase-js builds URLs

```
supabase.from('documents').select('*').eq('org_id', 'abc').order('created_at', { ascending: false })
→ GET https://<project>.supabase.co/rest/v1/documents?select=*&org_id=eq.abc&order=created_at.desc
```

| supabase-js call | Effect on request |
|---|---|
| `.select('id,title')` | `?select=id%2Ctitle` |
| `.eq('col', val)` | `?col=eq.val` |
| `.order('col', { ascending: false })` | `?order=col.desc` |
| `.limit(10)` | `?limit=10` |
| `.single()` | Adds `Accept: application/vnd.pgrst.object+json` header — URL is unchanged |
| `.maybeSingle()` | GET requests send `Accept: application/json` (same as an array request); non-GET requests send `Accept: application/vnd.pgrst.object+json`. Returns `null` data (not error) on zero rows. **Cannot be distinguished from a normal array GET by Accept header.** |

### Basic handler

```typescript
import { http, HttpResponse } from 'msw'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

export const handlers = [
  http.get(`${SUPABASE_URL}/rest/v1/documents`, () => {
    return HttpResponse.json([
      { id: 'doc-1', title: 'Alpha', org_id: 'org-abc', created_at: '2024-01-01T00:00:00Z' },
      { id: 'doc-2', title: 'Beta',  org_id: 'org-abc', created_at: '2024-01-02T00:00:00Z' },
    ])
  }),
]
```

### Reading query parameters inside a handler

MSW matches handlers on the URL pathname. Query strings are stripped during matching. Read them inside the resolver:

```typescript
http.get(`${SUPABASE_URL}/rest/v1/documents`, ({ request }) => {
  const url = new URL(request.url)
  const orgId = url.searchParams.get('org_id') // returns "eq.abc-123", not "abc-123"

  if (orgId === 'eq.org-abc') {
    return HttpResponse.json([{ id: 'doc-1', title: 'Alpha', org_id: 'org-abc' }])
  }
  return HttpResponse.json([])
})
```

The value from `searchParams.get('org_id')` includes the PostgREST operator prefix (`eq.`). Strip it when needed: `orgId.replace(/^eq\./, '')`.

### Handling `.single()` vs array responses

`.single()` adds an `Accept` header; the URL path does not change. A handler can branch on it:

```typescript
http.get(`${SUPABASE_URL}/rest/v1/documents`, ({ request }) => {
  const accept = request.headers.get('Accept') ?? ''

  if (accept.includes('pgrst.object')) {
    // single-row response
    return HttpResponse.json({ id: 'doc-1', title: 'Alpha', org_id: 'org-abc' })
  }
  // array response
  return HttpResponse.json([{ id: 'doc-1', title: 'Alpha', org_id: 'org-abc' }])
})
```

Alternatively, return an array in all cases — supabase-js unwraps it client-side when `.single()` is used.

> The Accept-header branch reliably identifies `.single()` only. `.maybeSingle()` GET requests send `Accept: application/json`, indistinguishable from a normal array GET. If you need to mock `.maybeSingle()` calls separately, branch on URL filters or response shape instead — never on Accept.

Confirmed (postgrest-js source `PostgrestTransformBuilder.ts`): `.single()` sets `Accept: application/vnd.pgrst.object+json` on all HTTP methods.

---

## Handler Factory: `mockTable<T>`

Compose test handlers instead of duplicating inline handler code.

```typescript
// src/mocks/factories.ts
import { http, HttpResponse, type HttpHandler } from 'msw'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

type PostgrestError = {
  message: string
  details: string | null
  hint: string | null
  code: string
}

/**
 * Returns an MSW GET handler for a PostgREST table.
 *
 * server.use(mockTable('documents', rows))
 * server.use(mockTable('documents', rows, { filter: (url, rows) => ... }))
 */
export function mockTable<T>(
  tableName: string,
  rows: T[],
  options: {
    filter?: (url: URL, rows: T[]) => T[]
  } = {}
): HttpHandler {
  return http.get(`${SUPABASE_URL}/rest/v1/${tableName}`, ({ request }) => {
    const url = new URL(request.url)
    const filtered = options.filter ? options.filter(url, rows) : rows
    return HttpResponse.json(filtered)
  })
}

/**
 * Returns an MSW GET handler that simulates a PostgREST error.
 * Use for RLS denials, constraint violations, etc.
 */
export function mockTableError(
  tableName: string,
  error: Partial<PostgrestError> = {},
  status = 400
): HttpHandler {
  return http.get(`${SUPABASE_URL}/rest/v1/${tableName}`, () => {
    return HttpResponse.json(
      {
        message: error.message ?? 'An error occurred',
        details: error.details ?? null,
        hint:    error.hint    ?? null,
        code:    error.code    ?? 'PGRST000',
      },
      { status }
    )
  })
}

/** Returns an MSW POST handler for INSERT operations. */
export function mockTablePost<T>(tableName: string, response: T): HttpHandler {
  return http.post(`${SUPABASE_URL}/rest/v1/${tableName}`, () => {
    return HttpResponse.json(response, { status: 201 })
  })
}
```

---

## Mocking Supabase Auth

### Auth endpoint URLs

| Operation | Method | URL |
|---|---|---|
| Sign in with password | POST | `/auth/v1/token?grant_type=password` |
| Refresh token | POST | `/auth/v1/token?grant_type=refresh_token` |
| Get user | GET | `/auth/v1/user` |
| Sign up | POST | `/auth/v1/signup` |
| Password recovery | POST | `/auth/v1/recover` |
| Sign out | POST | `/auth/v1/logout` |
| OTP | POST | `/auth/v1/otp` |

### Auth fixture factory

```typescript
// src/test/fixtures/auth.ts
import type { Session, User } from '@supabase/supabase-js'

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-test-123',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'test@example.com',
    email_confirmed_at: '2024-01-01T00:00:00Z',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    last_sign_in_at: '2024-01-01T00:00:00Z',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    is_anonymous: false,
    ...overrides,
  }
}

export function makeSession(overrides: Partial<Session> = {}): Session {
  const user = overrides.user ?? makeUser()
  return {
    access_token:  'fake-access-token-jwt',
    refresh_token: 'fake-refresh-token',
    expires_in:    3600,
    expires_at:    Math.floor(Date.now() / 1000) + 3600,
    token_type:    'bearer',
    user,
    ...overrides,
  }
}
```

### Auth handlers

```typescript
// src/mocks/authHandlers.ts
import { http, HttpResponse } from 'msw'
import { makeSession, makeUser } from '../test/fixtures/auth'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

export const authHandlers = [
  // signInWithPassword / refreshSession
  http.post(`${SUPABASE_URL}/auth/v1/token`, async ({ request }) => {
    const url = new URL(request.url)
    const grantType = url.searchParams.get('grant_type')
    const body = await request.json() as { email?: string; password?: string }

    if (grantType === 'password') {
      if (body.email === 'bad@example.com') {
        return HttpResponse.json(
          { error: 'invalid_grant', error_description: 'Invalid login credentials' },
          { status: 400 }
        )
      }
      return HttpResponse.json(makeSession())
    }

    // grant_type=refresh_token
    return HttpResponse.json(makeSession())
  }),

  // getUser
  http.get(`${SUPABASE_URL}/auth/v1/user`, ({ request }) => {
    const auth = request.headers.get('Authorization') ?? ''
    if (!auth.startsWith('Bearer ')) {
      return HttpResponse.json({ message: 'JWT expired' }, { status: 401 })
    }
    return HttpResponse.json(makeUser())
  }),
]
```

---

## Mocking Edge Functions

Edge Functions live at `/functions/v1/<name>`. No PostgREST conventions apply — arbitrary request and response shapes.

```typescript
import { http, HttpResponse } from 'msw'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

export const edgeFunctionHandlers = [
  http.post(`${SUPABASE_URL}/functions/v1/send-email`, async ({ request }) => {
    const body = await request.json() as { to: string; subject: string }
    return HttpResponse.json({ success: true, messageId: 'msg-test-123' })
  }),

  http.post(`${SUPABASE_URL}/functions/v1/process-payment`, () => {
    return HttpResponse.json({ error: 'Card declined' }, { status: 402 })
  }),
]
```

---

## Realistic Supabase Error Shapes

Always return the correct wire shape so supabase-js surfaces the error as expected.

### PostgREST errors (DB layer)

```typescript
// RLS denial — 403
{
  message: 'permission denied for table documents',
  details: null,
  hint:    null,
  code:    '42501',   // PostgreSQL SQLSTATE
}

// Not-null constraint violation — 400 or 422
{
  message: 'null value in column "user_id" violates not-null constraint',
  details: 'Failing row contains (null, My Doc).',
  hint:    null,
  code:    '23502',
}

// PostgREST-originated error (bad relationship)
{
  message: "Could not find a relationship between 'documents' and 'nonexistent'",
  details: null,
  hint:    null,
  code:    'PGRST200',
}
```

supabase-js wraps these as `{ message, details, hint, code }` in the `.error` field of the query result.

### Auth errors (GoTrue)

```typescript
// Invalid credentials
{ error: 'invalid_grant', error_description: 'Invalid login credentials' }

// Expired JWT
{ code: 401, msg: 'Invalid token' }

// Weak password
{ code: 422, msg: 'Password should be at least 6 characters' }
```

supabase-js surfaces these as `AuthError` — an `Error` subclass with `.message` and `.status`.

### MSW handler for RLS-denied response

```typescript
http.get(`${SUPABASE_URL}/rest/v1/documents`, () => {
  return HttpResponse.json(
    { message: 'permission denied for table documents', details: null, hint: null, code: '42501' },
    { status: 403 }
  )
})
```

---

## Fake supabase-js Client

For unit tests of hooks or service modules where MSW is overkill — no component rendering, no HTTP involved.

```typescript
// src/lib/fakeSupabaseClient.ts
import { vi } from 'vitest'

type QueryResult<T> = { data: T | null; error: { message: string } | null }

function makeQueryBuilder<T>(defaultResult: QueryResult<T>) {
  const mockSingle = vi.fn().mockResolvedValue(defaultResult)
  const mockLimit  = vi.fn().mockReturnValue({ single: mockSingle })
  const mockOrder  = vi.fn().mockReturnValue({ limit: mockLimit, single: mockSingle })
  const mockEq     = vi.fn().mockReturnValue({ order: mockOrder, single: mockSingle, limit: mockLimit })
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq, order: mockOrder, limit: mockLimit })

  return { mockSelect, mockEq, mockOrder, mockLimit, mockSingle }
}

export function setupFakeSupabaseClient() {
  const defaultResult = { data: [] as unknown[], error: null }
  const builder = makeQueryBuilder(defaultResult)

  const fakeClient = {
    from: vi.fn().mockReturnValue({ select: builder.mockSelect }),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      getUser:    vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      signOut:    vi.fn().mockResolvedValue({ error: null }),
    },
    _mocks: builder,   // expose for per-test configuration
  }

  return fakeClient
}
```

**Usage:**

```typescript
// src/hooks/__tests__/useDocuments.test.ts
import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setupFakeSupabaseClient } from '../../lib/fakeSupabaseClient'
import { useDocuments } from '../useDocuments'

describe('useDocuments', () => {
  let fakeClient: ReturnType<typeof setupFakeSupabaseClient>

  beforeEach(() => {
    fakeClient = setupFakeSupabaseClient()
  })

  it('returns documents on success', async () => {
    const docs = [{ id: 'doc-1', title: 'Alpha' }]
    fakeClient._mocks.mockSelect.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: docs, error: null }),
    })

    const { result } = renderHook(() => useDocuments(fakeClient as any, 'org-abc'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.documents).toEqual(docs)
  })

  it('surfaces error on fetch failure', async () => {
    fakeClient._mocks.mockSelect.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied' } }),
    })

    const { result } = renderHook(() => useDocuments(fakeClient as any, 'org-abc'))
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.error).toBe('permission denied')
  })
})
```

**Tradeoffs vs MSW:**

| | Fake client | MSW |
|---|---|---|
| Setup cost | Low | Moderate |
| Exercises HTTP encoding | No | Yes |
| Exercises supabase-js builder chain | No (stubbed) | Yes |
| Drift risk on supabase-js upgrades | High — chaining changes break stubs silently | None |
| Test speed | Fastest | Fast |

---

## Decision Rule: MSW vs Fake Client

| Scenario | Use |
|---|---|
| Component with `useEffect` fetching data | MSW |
| Component using React Query or SWR over supabase | MSW |
| Optimistic update (write → re-fetch cycle) | MSW |
| Error state UI driven by a PostgREST 4xx | MSW |
| Auth flow UI (sign-in form, session gate) | MSW + auth handlers |
| Unit test of a pure hook or service function | Fake client |
| Testing data transformation logic only | Fake client |
| CI suite with thousands of unit tests | Fake client (fastest) |

**Rule of thumb:** Component renders → MSW. Function calls → fake client.

---

## Worked Example: `<DocumentList orgId>`

### Component

```typescript
// src/components/DocumentList.tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Document = { id: string; title: string; org_id: string; created_at: string }

export function DocumentList({ orgId }: { orgId: string }) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('documents')
      .select('id, title, org_id, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setDocuments(data ?? [])
        setIsLoading(false)
      })
  }, [orgId])

  if (isLoading) return <p>Loading...</p>
  if (error)     return <p role="alert">Error: {error}</p>
  if (documents.length === 0) return <p>No documents found.</p>

  return (
    <ul>
      {documents.map((doc) => (
        <li key={doc.id}>{doc.title}</li>
      ))}
    </ul>
  )
}
```

### Test file

```typescript
// src/components/__tests__/DocumentList.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { server } from '../../mocks/server'
import { mockTable, mockTableError } from '../../mocks/factories'
import { DocumentList } from '../DocumentList'

const MOCK_DOCS = [
  { id: 'doc-1', title: 'Alpha Report',  org_id: 'org-abc', created_at: '2024-02-01T00:00:00Z' },
  { id: 'doc-2', title: 'Beta Analysis', org_id: 'org-abc', created_at: '2024-01-15T00:00:00Z' },
]

describe('DocumentList', () => {
  it('renders a list of documents', async () => {
    server.use(mockTable('documents', MOCK_DOCS))

    render(<DocumentList orgId="org-abc" />)

    expect(screen.getByText('Loading...')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('Alpha Report')).toBeInTheDocument()
    })
    expect(screen.getByText('Beta Analysis')).toBeInTheDocument()
  })

  it('shows empty state when no documents exist', async () => {
    server.use(mockTable('documents', []))

    render(<DocumentList orgId="org-empty" />)

    await waitFor(() => {
      expect(screen.getByText('No documents found.')).toBeInTheDocument()
    })
  })

  it('shows error message on RLS denial', async () => {
    server.use(
      mockTableError('documents', {
        message: 'permission denied for table documents',
        code: '42501',
      }, 403)
    )

    render(<DocumentList orgId="org-abc" />)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('permission denied for table documents')
    })
  })

  it('filters documents by org', async () => {
    server.use(
      mockTable('documents', MOCK_DOCS, {
        filter: (url, rows) => {
          const orgId = url.searchParams.get('org_id')?.replace('eq.', '')
          return rows.filter((r) => r.org_id === orgId)
        },
      })
    )

    render(<DocumentList orgId="org-abc" />)

    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(2)
    })
  })
})
```

---

## Server Components Note

Vitest cannot render `async` Server Components. The Next.js team's recommendation:

1. Extract data-fetching logic into standalone helpers (e.g., `lib/getDocuments.ts`). Test those with the fake client or by mocking fetch.
2. Test Client Components only in Vitest — `'use client'` components are the correct boundary.
3. Use Playwright (TEST_KB_5) for full-page renders where RSC output must be validated.

Never call `render()` on an async RSC in JSDOM — it throws or hangs. Never import Server Components that use `next/headers`, `cookies()`, or `headers()` directly in Vitest without mocking those modules.

If you must mock Next.js server APIs for a narrow helper test:

```typescript
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (_name: string) => ({ value: 'mock-cookie-value' }),
    getAll: () => [],
  }),
  headers: () => new Headers({ 'x-test': 'true' }),
}))
```

This is a workaround. Prefer extracting logic.

---

## Realtime / WebSocket

MSW does not intercept Supabase Realtime WebSocket connections. MSW's `ws` namespace supports standard WebSocket interception but explicitly does not support custom protocols, and Supabase Realtime uses the Phoenix channel protocol on top of WebSocket.

Do not attempt to mock Supabase Realtime via MSW in component tests. Options:

- Abstract the subscription behind a hook interface; test the hook with a fake subscription object.
- Use Playwright against a local Supabase instance for Realtime integration tests.
- See **TEST_KB_6** for full Realtime mocking coverage.

---

## Always / Never Rules

**Always:**
- Use MSW v2 syntax. Never copy a v1 example without translating it. The import check: `import { http, HttpResponse } from 'msw'` is v2. `import { rest } from 'msw'` is v1 and does not work.
- Import `setupServer` from `msw/node`, not `msw/browser`.
- Call `server.resetHandlers()` in `afterEach`. This is the single most important lifecycle call — skip it and per-test overrides bleed into subsequent tests.
- Call `cleanup()` from `@testing-library/react` in `afterEach`.
- Write handler paths without query strings. Read query params inside the resolver via `new URL(request.url).searchParams`.
- Use `process.env.NEXT_PUBLIC_SUPABASE_URL` in handler URLs — never hardcode the project URL.
- Set `onUnhandledRequest: 'warn'` locally and `'error'` in CI.
- Use `makeUser()` / `makeSession()` fixtures for all auth mocks — raw literals drift from the real gotrue-js shape.

**Never:**
- Never call `res(ctx.json(...))` — that is MSW v1 syntax and will throw.
- Never use `rest.get(...)` — v1 import; not available in MSW v2.
- Never include query strings in the handler path predicate — MSW ignores them during matching.
- Never call `server.close()` in `afterEach` — only once in `afterAll`.
- Never rely on mutable handler closure state across tests without resetting it in `beforeEach`.
- Never render async RSCs in Vitest — use E2E for server component output.
- Never use SWR or React Query caches without clearing them between tests (`queryClient.clear()`).

---

## Gotchas

**1. v1 syntax is everywhere — and it's wrong in v2.**
The most common failure mode when adopting MSW. Every blog post before late 2023 uses v1. Copy-pasting triggers `res is not a function`, `rest is not defined`, or silent no-match. The v1 API (`rest`, `req/res/ctx`) was completely replaced. The v2 API is `http.get(url, resolver)` where the resolver returns `HttpResponse.json(...)` directly. If you see `rest` in an import, it's v1. Stop. Translate before pasting.

**2. `server.resetHandlers()` missing from `afterEach`.**
`server.use(handler)` prepends a handler to the runtime list. It persists until `resetHandlers()` removes it. Test A's error handler leaks into Test B. The baseline handlers added via `setupServer(...)` are never removed by `resetHandlers()` — only per-test `server.use()` additions are cleared. This distinction matters when test suites mix baseline and per-test handlers.

**3. Query strings in handler paths are silently ignored.**
`http.get('/rest/v1/documents?select=*', resolver)` — the `?select=*` is stripped from matching. The handler matches all requests to `/rest/v1/documents` regardless of query string. This is a feature: one handler covers all filter variations. Access the params inside the resolver via `new URL(request.url).searchParams`. A handler with query params in the path is not wrong — it just never narrows matching.

**4. `msw/node` import fails in older Vitest + JSDOM setups.**
JSDOM resolves the `browser` export condition by default. `msw/node` uses the `node` condition. On Vitest \<1.0 or certain configuration combinations, this causes `Cannot find module 'msw/node'`. Fix: add `environmentOptions: { jsdom: { customExportConditions: ['node', 'node-addons'] } }` to `vitest.config.ts`. Vitest ≥1.0 resolves this automatically for most setups. `[VERIFY BEFORE SHIPPING]` — confirm your Vitest version before assuming it's automatic.

**5. supabase-js `@supabase/node-fetch` conflicts with Vitest's ESM handling.**
Older supabase-js versions bundled `@supabase/node-fetch` with incorrect ESM configuration. Symptoms: `Cannot read property 'bind' of undefined` or `No such module` errors in Vitest. Resolved in supabase-js 2.45.6+ (native fetch used on Node 18+). If pinned to an older version, add `test: { server: { deps: { inline: ['@supabase/node-fetch'] } } }` to `vitest.config.ts` as a workaround. `[VERIFY BEFORE SHIPPING]` — confirm the exact version where `@supabase/node-fetch` was removed from supabase-js core. The postgrest-js changelog and supabase-js CHANGELOG.md in `packages/core/` are the primary sources.

**6. SWR / React Query cache poisoning between tests.**
If the component under test uses React Query or SWR to wrap supabase calls, the library caches successful responses in memory. Test A populates the cache; Test B reads cached data instead of the MSW mock response. Fix for React Query: create a fresh `QueryClient` in a wrapper for each test (or call `queryClient.clear()` in `beforeEach`). Fix for SWR: set `dedupingInterval: 0` globally in test setup, or use `SWRConfig` with `provider: () => new Map()` in the render wrapper.

**7. Mutable state in handler closures leaks between tests.**
Handlers that close over mutable arrays and mutate them on POST requests accumulate state across the test run. Even with `server.resetHandlers()`, the captured variable persists because `resetHandlers()` removes the handler reference but does not reset variables in the enclosing scope. Generate handler state fresh per test by calling `server.use()` with a closure over a local variable, or reset the variable explicitly in `beforeEach`.

---

## What This KB Does NOT Cover

- **Integration tests** — tests that exercise multiple layers (DB + auth + component together). See TEST_KB_3.
- **E2E tests** — full browser automation via Playwright. See TEST_KB_5.
- **Supabase Realtime mocking** — Phoenix channel protocol, WebSocket simulation, `mock-socket`. See TEST_KB_6.
- **Server Component rendering** — RSCs cannot be rendered in Vitest. This KB only covers Client Components.
- **Snapshot tests** — not recommended as a default strategy. Snapshots are brittle for component trees; prefer explicit assertions on accessible text and roles.
- **MSW browser integration** — `msw/browser` with a Service Worker for development. This KB covers the Node integration for Vitest only.
- **Test coverage thresholds, CI configuration, or reporters** — those are cross-cutting concerns that belong in a project-level testing overview.

---

## Cross-references

- **TEST_KB_3** — integration tests (DB + auth + component layers)
- **TEST_KB_5** — Playwright E2E, RSC validation, full-page assertions
- **TEST_KB_6** — Realtime and WebSocket mocking
- **AUTH_KB_\*** — auth session shapes and login flows (the `makeUser`/`makeSession` fixtures here align with gotrue-js types from those KBs)
- **SB_KB_00_Index** — PostgREST URL patterns and RLS context for mocking realistic error responses
