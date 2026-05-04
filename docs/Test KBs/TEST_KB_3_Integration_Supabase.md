# TEST_KB_3 — JS Integration Tests: Supabase DB, Auth, Storage

**Stack-locked: Supabase CLI local DB, supabase-js v2, Vitest workspace config, Custom Access Token Hook.**

Companion: **TEST_KB_2** owns pgTAP / RLS SQL-level tests. This KB owns JS integration tests — PostgREST response shapes, auth flows, storage, and multi-tenant isolation as seen through the actual API surface.

---

## What This KB Does NOT Cover

- pgTAP / SQL-level RLS assertions — TEST_KB_2
- MSW request mocking or component-level tests — TEST_KB_4
- Realtime channel testing — TEST_KB_6
- Any non-Supabase backend

---

## 1. When to Write an Integration Test

Use this decision tree. If you reach a lower layer, stop — don't write an integration test.

```
Can a unit test answer this question?
  Yes → Write a unit test. Stop.
  No ↓

Is the question about Postgres internals (trigger behavior, constraint
firing order, RLS SQL logic, function correctness inside a transaction)?
  Yes → Write a pgTAP test (TEST_KB_2). Stop.
  No ↓

Write a JS integration test (this KB).
```

**Write a JS integration test when the question requires real PostgREST / GoTrue semantics:**

- The exact TypeScript shape of a query response (`data`, `error`, `error.code`)
- Whether RLS silently returns `{ data: [], error: null }` vs. raises `42501` for a given operation
- An RPC returns the correct JSON from a real authenticated session
- Storage upload / download / signed-URL flows end-to-end
- Auth sign-in side effects (trigger creates a `profiles` row — visible via `from('profiles').select()`)
- Multi-tenant isolation: Org A user cannot see Org B rows

**Summary table:**

| Layer | Tool | What it asserts |
|-------|------|-----------------|
| Postgres internals, RLS SQL logic, triggers | pgTAP (TEST_KB_2) | Constraint semantics, `SET ROLE`, savepoints |
| API / supabase-js response shapes | Vitest + real local DB | TypeScript shapes, RLS HTTP filtering, auth flows |
| UI / browser | Playwright | Rendered state, interactions, navigation |

---

## 2. Local DB Setup

### Prerequisites

```bash
supabase start
supabase status    # prints all keys and URLs
```

**Never point integration tests at production or a shared staging DB.**

### Env vars

```bash
# .env.test.local  — gitignored, never commit
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<anon JWT from supabase status>
SUPABASE_SERVICE_ROLE_KEY=<service_role JWT from supabase status>
```

Generate in one step:

```bash
supabase status -o env > .env.test.local
```

`[VERIFY BEFORE SHIPPING]` — Confirm the key names output by your CLI version match the above. The format has changed between CLI versions.

### Vitest workspace config

Separate `unit` and `integration` projects. Integration tests run with `singleFork: true` — one worker process, sequential files — to prevent shared-auth-state collisions between parallel file workers.

```typescript
// vitest.workspace.ts  (repo root)
import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    // Unit tests — no DB, fast
    extends: './vitest.config.ts',
    test: {
      name: 'unit',
      include: ['src/**/*.unit.test.ts'],
      environment: 'node',
    },
  },
  {
    // Integration tests — real Supabase local DB
    test: {
      name: 'integration',
      include: ['tests/integration/**/*.test.ts'],
      environment: 'node',
      globalSetup: ['./tests/integration/global-setup.ts'],
      setupFiles: ['./tests/integration/setup.ts'],
      testTimeout: 30_000,
      hookTimeout: 60_000,
      pool: 'forks',
      poolOptions: {
        forks: {
          singleFork: true,   // sequential file execution — required; see Gotchas
        },
      },
      env: {
        SUPABASE_URL: process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321',
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? '',
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      },
    },
  },
])
```

`[VERIFY BEFORE SHIPPING]` — Confirm `pool: 'forks'` + `singleFork: true` is the correct API in your installed Vitest version. The pool option naming changed between v0.x, v1.x, and v2.x. If `singleFork` is not available or has been renamed, the documented Vitest fallback for sequential file execution is `fileParallelism: false` (also exposed as the `--no-file-parallelism` CLI flag).

```typescript
// tests/integration/global-setup.ts
// Runs ONCE in the main process before any worker. Use for connectivity checks.
export async function setup() {
  const url = process.env.SUPABASE_URL
  if (!url) throw new Error('SUPABASE_URL not set — run: supabase start')
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: process.env.SUPABASE_ANON_KEY ?? '' },
  })
  if (!res.ok) throw new Error(`Supabase not reachable at ${url}`)
}

export async function teardown() {
  // Nothing needed for the local CLI stack
}
```

### Parallelism implications

Integration tests share a local DB. Parallel file execution is dangerous:

1. Auth session state can leak between workers if clients share storage.
2. Truncate-and-reseed in `beforeEach` races with other files doing the same.
3. Concurrent FK deletes produce constraint violations.

`singleFork: true` eliminates all three. Per-test org-scoping (below) makes individual test cases within a file safe without further restrictions.

---

## 3. Per-Test Isolation

### Why transaction-rollback is not viable here

The standard Prisma / raw-pg pattern wraps each test in `BEGIN` / `ROLLBACK` so no cleanup is needed. This does **not** work for supabase-js:

- supabase-js communicates over HTTP (PostgREST). You cannot share a Postgres transaction handle across HTTP request boundaries.
- GoTrue Auth runs in its own Docker container. `auth.users` operations are not reachable by your test transaction.
- Triggers that fire on `INSERT` and write to external tables fire inside the transaction but PostgREST queries in the same test run on a separate connection and will not see those writes.

**Transaction rollback is not viable for supabase-js integration tests. Use org-scoping.**

### Recommended: per-test org scoping

Each test (or `describe` block) creates its own org with a unique ID. All test data hangs off that org. RLS policies scope to `org_id`, so different tests' data is naturally invisible to each other. No truncation is needed.

```
Does the test need multi-tenant isolation?
  Yes → Org-scoping (always)
  No, single-user behavior → Truncate-reseed is acceptable but slower
```

Truncate-reseed order must respect FK constraints:

```typescript
// Use when org-scoping is overkill (single-user tests, no tenant machinery)
beforeEach(async () => {
  const admin = createAdminClient()
  await admin.from('documents').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await admin.from('org_members').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await admin.from('orgs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
})
```

For multi-tenant tests, use factories (Section 4) and clean up in `afterAll`.

---

## 4. Factory-Based Fixtures

Hide DB setup behind typed factory functions. Factories throw on error — a factory that silently returns null causes confusing failures downstream.

```typescript
// tests/integration/factories/index.ts
import { createAdminClient } from '../helpers/clients'
import type { Database } from '../../../src/database.types'

type Org = Database['public']['Tables']['orgs']['Row']
type OrgMember = Database['public']['Tables']['org_members']['Row']

export interface TestMember {
  user: { id: string; email: string; password: string }
  member: OrgMember
}

export interface TestOrg {
  org: Org
  members: TestMember[]
}

/**
 * Creates an org with two members: one 'owner', one 'member'.
 * IMPORTANT: org membership is inserted BEFORE the user can sign in.
 * The Custom Access Token Hook reads org_members at JWT issuance — if membership
 * doesn't exist at sign-in time, the JWT will have no org_id claim.
 */
export async function anOrgWithTwoMembers(): Promise<TestOrg> {
  const admin = createAdminClient()
  const ts = Date.now()

  const { data: org, error: orgErr } = await admin
    .from('orgs')
    .insert({ name: `Test Org ${ts}`, plan: 'free' })
    .select()
    .single()
  if (orgErr) throw new Error(`anOrgWithTwoMembers: org insert: ${orgErr.message}`)

  // Create confirmed users via Admin API — bypasses email confirmation
  const users = await Promise.all([
    createConfirmedUser(`owner-${ts}@test.invalid`, 'Test1234!'),
    createConfirmedUser(`member-${ts}@test.invalid`, 'Test1234!'),
  ])

  // Insert org_members BEFORE any signInAs call (see Custom Access Token Hook gotcha)
  const memberRecords = await Promise.all(
    users.map((u, i) =>
      admin
        .from('org_members')
        .insert({ org_id: org.id, user_id: u.id, role: i === 0 ? 'owner' : 'member' })
        .select()
        .single()
        .then(({ data, error }) => {
          if (error) throw new Error(`org_member insert: ${error.message}`)
          return data
        })
    )
  )

  return {
    org,
    members: users.map((u, i) => ({ user: u, member: memberRecords[i] })),
  }
}

/**
 * Inserts a document in a given state for a given org, bypassing RLS.
 */
export async function aDocumentInState(
  orgId: string,
  state: Database['public']['Enums']['document_status']
) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('documents')
    .insert({ org_id: orgId, status: state, title: `Doc-${Date.now()}` })
    .select()
    .single()
  if (error) throw new Error(`aDocumentInState: ${error.message}`)
  return data
}

// Internal helper only — requires service_role key
async function createConfirmedUser(email: string, password: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,  // bypasses email flow; requires service_role key
  })
  if (error) throw new Error(`createConfirmedUser(${email}): ${error.message}`)
  return { id: data.user.id, email, password }
}
```

**Key conventions:**
- Email domain `@test.invalid` — RFC 2606 reserved, cannot receive real mail, distinguishable from real users.
- `Date.now()` / `crypto.randomUUID()` suffixes prevent cross-run name collisions.
- Return raw DB types (`Org`, `OrgMember`) not simplified objects — tests can assert on them directly.
- `[VERIFY BEFORE SHIPPING]` — `admin.auth.admin.createUser` requires `SUPABASE_SERVICE_ROLE_KEY`. If using preview branches, confirm `supabase_auth_admin` has INSERT on `auth.users` (known issue in some branch environments; workaround: `signUp` then `admin.auth.admin.updateUserById({ email_confirm: true })`).

---

## 5. Client Helpers

```typescript
// tests/integration/helpers/clients.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../src/database.types'

const URL = process.env.SUPABASE_URL!
const ANON = process.env.SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * Admin client: service role, bypasses RLS.
 * MUST have persistSession: false — prevents session contamination (see Gotcha 1).
 * MUST NOT be used to assert on RLS behavior.
 */
export function createAdminClient(): SupabaseClient<Database> {
  return createClient<Database>(URL, SERVICE, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,   // CRITICAL — see Gotcha 1
    },
  })
}

/**
 * Signs in as a specific user and returns an isolated authenticated client.
 * Each call returns a NEW client instance. Never reuse across tests.
 *
 * IMPORTANT: The caller must have already created org membership before calling
 * this function. The JWT is issued at sign-in — org_id claims will be missing
 * if membership is created afterward.
 */
export async function signInAs(credentials: {
  email: string
  password: string
}): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(URL, ANON, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,  // node environment; no browser storage
    },
  })

  const { data, error } = await client.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  })

  if (error) throw new Error(`signInAs(${credentials.email}): ${error.message}`)
  if (!data.session) throw new Error(`signInAs: no session returned for ${credentials.email}`)

  return client
}

/**
 * Returns a client pre-loaded with a known access token.
 * Use when testing with a token minted outside of signInWithPassword.
 */
export function clientWithToken(accessToken: string): SupabaseClient<Database> {
  const client = createClient<Database>(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  client.auth.setSession({ access_token: accessToken, refresh_token: '' })
  return client
}
```

### Why `persistSession: false` on the admin client

In jsdom environments, all `createClient()` instances within the same process share one localStorage by default. When you call `signInWithPassword` on a user client, supabase-js writes the session token to that shared storage. The admin client then reads the same storage and starts sending the user's JWT instead of the service role key — causing RLS errors on admin operations.

`persistSession: false` tells supabase-js to hold session state only in-memory on that specific instance. Session state is instance-local. This applies to both the admin client and user clients in Node/Vitest environments.

---

## 6. RPC Testing

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createAdminClient, signInAs } from '../helpers/clients'
import { anOrgWithTwoMembers } from '../factories'

describe('rpc: get_org_stats', () => {
  const admin = createAdminClient()
  let orgData: Awaited<ReturnType<typeof anOrgWithTwoMembers>>

  beforeAll(async () => {
    orgData = await anOrgWithTwoMembers()
  })

  afterAll(async () => {
    for (const { user } of orgData.members) {
      try {
        await admin.from('users').delete().eq('id', user.id)
        await admin.auth.admin.deleteUser(user.id)
      } catch (e) {
        console.warn(`Cleanup warning: ${user.id}`, e)
      }
    }
    await admin.from('orgs').delete().eq('id', orgData.org.id)
  })

  it('returns stats for org member', async () => {
    const userClient = await signInAs(orgData.members[0].user)

    const { data, error } = await userClient.rpc('get_org_stats', {
      p_org_id: orgData.org.id,
    })

    expect(error).toBeNull()
    expect(data).toMatchObject({
      member_count: 2,
      document_count: expect.any(Number),
    })
  })

  it('returns null for user outside org', async () => {
    const { data: outsiderData } = await admin.auth.admin.createUser({
      email: `outsider-${Date.now()}@test.invalid`,
      password: 'Test1234!',
      email_confirm: true,
    })
    const outsiderClient = await signInAs({
      email: outsiderData.user!.email!,
      password: 'Test1234!',
    })

    const { data, error } = await outsiderClient.rpc('get_org_stats', {
      p_org_id: orgData.org.id,
    })

    // SECURITY DEFINER functions: error shape depends on implementation.
    // If the function raises: error.code is a Postgres error code (e.g. 'P0001', '42501').
    // If the function returns NULL for unauthorized: data === null, error === null.
    // Document which behavior your function uses.
    expect(data).toBeNull()

    await admin.auth.admin.deleteUser(outsiderData.user!.id)
  })
})
```

### RPC error shape reference

When an RPC function raises a Postgres exception:

```typescript
{
  data: null,
  error: {
    message: string,
    details: string | null,
    hint: string | null,
    code: string,   // e.g. 'P0001' (RAISE EXCEPTION), '42501' (insufficient_privilege)
  }
}
```

Error code distinctions:
- `PGRST116` — PostgREST-level error: `.single()` matched 0 or more than 1 rows. Not a Postgres permission code.
- `42501` — Postgres insufficient_privilege. Surfaces from write operations blocked by RLS. Does NOT surface from SELECT filtering.
- `P0001` — Generic `RAISE EXCEPTION` from PL/pgSQL.

SECURITY DEFINER functions run as their owner and bypass RLS unless the function explicitly re-applies access checks. Always test that SECURITY DEFINER functions correctly scope results to the calling user's org.

---

## 7. Storage Testing

```typescript
import { beforeAll, afterAll, it, expect } from 'vitest'
import { createAdminClient, signInAs } from '../helpers/clients'

const BUCKET = `test-bucket-${Date.now()}`

beforeAll(async () => {
  const admin = createAdminClient()
  const { error } = await admin.storage.createBucket(BUCKET, { public: false })
  if (error) throw new Error(`Failed to create test bucket: ${error.message}`)
})

afterAll(async () => {
  const admin = createAdminClient()
  await admin.storage.emptyBucket(BUCKET)
  await admin.storage.deleteBucket(BUCKET)
})

it('owner uploads, downloads, and generates a signed URL', async () => {
  const userClient = await signInAs(orgData.members[0].user)
  const filePath = `${orgData.org.id}/report.txt`
  const content = new Uint8Array(Buffer.from('hello world'))

  // Upload
  const { data: uploadData, error: uploadErr } = await userClient.storage
    .from(BUCKET)
    .upload(filePath, content, { contentType: 'text/plain', upsert: false })
  expect(uploadErr).toBeNull()
  expect(uploadData?.path).toBe(filePath)

  // Download
  const { data: blob, error: downloadErr } = await userClient.storage
    .from(BUCKET)
    .download(filePath)
  expect(downloadErr).toBeNull()
  expect(await blob!.text()).toBe('hello world')

  // Signed URL (60-second expiry)
  const { data: signedData, error: signedErr } = await userClient.storage
    .from(BUCKET)
    .createSignedUrl(filePath, 60)
  expect(signedErr).toBeNull()
  expect(signedData?.signedUrl).toMatch(/^https?:\/\//)

  // Cleanup
  await userClient.storage.from(BUCKET).remove([filePath])
})

it('non-member cannot download another org file', async () => {
  const ownerClient = await signInAs(orgData.members[0].user)
  const filePath = `${orgData.org.id}/private.txt`
  await ownerClient.storage
    .from(BUCKET)
    .upload(filePath, new Uint8Array(Buffer.from('private')), { upsert: false })

  const outsiderClient = await signInAs(/* outsider credentials */)
  const { data, error } = await outsiderClient.storage.from(BUCKET).download(filePath)
  expect(data).toBeNull()
  expect(error).not.toBeNull()

  await createAdminClient().storage.from(BUCKET).remove([filePath])
})
```

Use per-run unique bucket names (`test-bucket-${Date.now()}`) to avoid cross-run collisions and make cleanup unambiguous.

`[VERIFY BEFORE SHIPPING]` — Bucket RLS policies defined in migrations are applied in the local stack after `supabase db reset`. Verify this in your environment; bucket policies in local dev sometimes require an explicit policy migration rather than inheriting from the default schema.

---

## 8. Type-Safe Assertions

### Generate types from local DB

```bash
npx supabase gen types typescript --local > src/database.types.ts
```

Run after every migration. Add to a `postmigrate` script or pre-push hook.

### Typed client and row types

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database, Tables } from '../../src/database.types'

// All query results typed against schema
const supabase = createClient<Database>(url, key)

type Document = Tables<'documents'>
// equivalent to Database['public']['Tables']['documents']['Row']

const { data } = await userClient.from('documents').select('*').eq('org_id', orgId)
// TypeScript: data is Document[] | null
```

### `QueryData` for complex selects

```typescript
import { QueryData } from '@supabase/supabase-js'

const orgWithMembersQuery = supabase
  .from('orgs')
  .select('id, name, org_members(user_id, role)')

type OrgWithMembers = QueryData<typeof orgWithMembersQuery>
// TypeScript infers nested join shape automatically
```

Never use `as any` to silence type errors in test assertions. A mismatch means either the migration hasn't run, types haven't been regenerated, or the schema changed — all of which the test is correctly catching.

---

## 9. RLS Error-Shape Behavior

This is the most common source of incorrect test assertions.

**SELECT policies:** PostgREST silently returns an empty result set. RLS does not raise an HTTP error on SELECT.

```typescript
// Correct assertion for a SELECT blocked by RLS:
expect(error).toBeNull()
expect(data).toHaveLength(0)

// WRONG — will pass for the wrong reason (no error is thrown):
expect(error).not.toBeNull()  // ← this never fires on SELECT filtering
```

**Write operations (INSERT, plus UPDATE that fails WITH CHECK on the new row):** Blocked by RLS raises `42501` (insufficient_privilege).

```typescript
// Correct assertion for a write blocked by RLS:
expect(data).toBeNull()
expect(error?.code).toBe('42501')
```

> **`42501` only fires on WITH CHECK violations.** UPDATE and DELETE rows that fail a USING clause are silently filtered: PostgREST returns `{ data: [], error: null }` (or `data` containing only the rows that *did* match). Only INSERTs that violate WITH CHECK — and UPDATEs whose new-row state fails WITH CHECK — produce `42501`. See [TEST_KB_2](TEST_KB_2_RLS_pgTAP.md) for the SQL-level distinction; if a TS test asserts `42501` on a USING-only DELETE/UPDATE, the assertion is wrong.

**`.single()` on a policy-filtered row:**

```typescript
const { data, error } = await userAClient
  .from('documents')
  .select('id')
  .eq('id', docB.id)   // org B's doc — filtered by RLS
  .single()

// PGRST116: PostgREST shape error (0 rows returned to .single())
// NOT a permission error
expect(error?.code).toBe('PGRST116')
expect(error?.code).not.toBe('42501')  // distinguish from a real permission denial
```

---

## 10. Custom Access Token Hook — Timing Gotcha

The Custom Access Token Hook fires **at JWT issuance**, not at query time. The hook reads `org_members` to populate `org_id` / `role` / `aal` claims into the JWT.

**If you sign a user in before their org membership exists, their JWT will not contain `org_id`. RLS policies that use `(auth.jwt() ->> 'org_id')::uuid` will see null and filter everything.**

**Required factory ordering:**

```
1. Create org
2. Create user (via admin.auth.admin.createUser)
3. Insert org_members row
4. Call signInAs (JWT issued HERE — reads org_members as it exists now)
```

If a test needs to verify behavior after membership is added post-sign-in, the user must sign out and sign in again to get a refreshed JWT with the new claims.

`[VERIFY BEFORE SHIPPING]` — Confirm that the Custom Access Token Hook is enabled for the local stack via `supabase/config.toml`. Hooks defined in SQL or Edge Functions require explicit registration in `config.toml`; they do not activate automatically from migrations in all CLI versions.

---

## 11. Cleanup Philosophy

### Cleanup order

```typescript
// Safe cleanup regardless of whether auth.users → public.users FK is CASCADE:
async function cleanupUser(userId: string) {
  const admin = createAdminClient()
  await admin.from('users').delete().eq('id', userId)   // app-level row first
  await admin.auth.admin.deleteUser(userId)              // then GoTrue record
}
```

`[VERIFY BEFORE SHIPPING]` — Whether deleting from GoTrue cascades to `public.users` depends on your FK definition. `ON DELETE CASCADE` on the FK means GoTrue deletion handles the cascade. Without CASCADE, delete the app-level row first or you get an FK violation. Verify your schema's FK definition.

`[VERIFY BEFORE SHIPPING]` — `admin.auth.admin.deleteUser` defaults to hard-delete (`shouldSoftDelete: false`). Confirm whether hard-delete triggers FK cascades on Postgres, or whether GoTrue handles this independently.

### `afterAll` vs `afterEach`

- `afterAll` — for fixtures created in `beforeAll` (org + members shared across a `describe` block). Prefer this over `afterEach` to reduce overhead.
- `afterEach` — for records created per individual test case.

### Cleanup failures

Wrap cleanup in `try/catch` and `console.warn` rather than rethrowing. A cleanup failure in `afterAll` that rethrows can cascade into false positives in subsequent test files.

```typescript
afterAll(async () => {
  for (const { user } of orgData.members) {
    try {
      await admin.from('users').delete().eq('id', user.id)
      await admin.auth.admin.deleteUser(user.id)
    } catch (e) {
      console.warn(`Cleanup warning for ${user.id}:`, e)
    }
  }
  await admin.from('orgs').delete().eq('id', orgData.org.id)
})
```

### What survives between tests (org-scoping strategy)

- Other tests' org rows, members, and documents — invisible via RLS, harmless.
- The local DB schema and seed fixtures inserted in `globalSetup`.
- Nothing inserted by THIS test's `beforeAll` / `beforeEach` — that's your cleanup responsibility.

Orphaned `auth.users` entries accumulate and cause duplicate-email errors in future runs. Always delete them in `afterAll`.

---

## 12. Worked Example: Two-Org RLS Isolation

The canonical multi-tenant correctness test.

```typescript
// tests/integration/documents/rls-isolation.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createAdminClient, signInAs } from '../helpers/clients'
import { anOrgWithTwoMembers, aDocumentInState } from '../factories'
import type { Tables } from '../../../src/database.types'

describe('documents: RLS cross-org isolation', () => {
  const admin = createAdminClient()

  let orgA: Awaited<ReturnType<typeof anOrgWithTwoMembers>>
  let orgB: Awaited<ReturnType<typeof anOrgWithTwoMembers>>
  let docA: Tables<'documents'>
  let docB: Tables<'documents'>

  beforeAll(async () => {
    // Two independent orgs, created in parallel
    ;[orgA, orgB] = await Promise.all([anOrgWithTwoMembers(), anOrgWithTwoMembers()])

    // One document per org — admin client bypasses RLS for setup
    ;[docA, docB] = await Promise.all([
      aDocumentInState(orgA.org.id, 'uploaded'),
      aDocumentInState(orgB.org.id, 'uploaded'),
    ])
  })

  afterAll(async () => {
    await admin.from('documents').delete().in('id', [docA.id, docB.id])
    for (const org of [orgA, orgB]) {
      for (const { user } of org.members) {
        try {
          await admin.from('users').delete().eq('id', user.id)
          await admin.auth.admin.deleteUser(user.id)
        } catch (e) {
          console.warn(`Cleanup warning for ${user.id}:`, e)
        }
      }
      await admin.from('orgs').delete().eq('id', org.org.id)
    }
  })

  it('org A owner sees org A document', async () => {
    const userAClient = await signInAs(orgA.members[0].user)

    const { data, error } = await userAClient
      .from('documents')
      .select('id, org_id, status')
      .eq('id', docA.id)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].id).toBe(docA.id)
    expect(data![0].org_id).toBe(orgA.org.id)
  })

  it('org A owner gets empty result for org B document — RLS filters, no error', async () => {
    const userAClient = await signInAs(orgA.members[0].user)

    const { data, error } = await userAClient
      .from('documents')
      .select('id, org_id')
      .eq('id', docB.id)

    // RLS SELECT policy silently returns empty — NOT a 403 or 42501
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('org A owner sees only org A documents on unfiltered select', async () => {
    const userAClient = await signInAs(orgA.members[0].user)

    const { data, error } = await userAClient.from('documents').select('id, org_id')

    expect(error).toBeNull()
    expect(data?.every(d => d.org_id === orgA.org.id)).toBe(true)
    expect(data?.some(d => d.id === docB.id)).toBe(false)
  })

  it('.single() on RLS-filtered row returns PGRST116, not 42501', async () => {
    const userAClient = await signInAs(orgA.members[0].user)

    const { data, error } = await userAClient
      .from('documents')
      .select('id')
      .eq('id', docB.id)
      .single()

    // PGRST116: PostgREST "0 rows returned to .single()"
    // This is NOT a permission error — RLS silently filtered the row
    expect(data).toBeNull()
    expect(error?.code).toBe('PGRST116')
    expect(error?.code).not.toBe('42501')
  })
})
```

**What this demonstrates:**
- `beforeAll` shared setup — two orgs, four users, two documents — runs once for four tests.
- SELECT RLS filtering returns `{ data: [], error: null }` — not an HTTP error.
- `.single()` on a policy-filtered row yields `PGRST116`, not a permission code.
- Type-safe: `data` is `Tables<'documents'>[]` inferred from the typed client.

---

## 13. Speed Budget

Integration tests are 10–100× slower than unit tests. Auth sign-in is 50–200ms. Admin user creation is 100–400ms. A full org + 2 users + sign-in + query + cleanup cycle is 400–1500ms. At 100 integration tests that's 40–150 seconds. At 1000 it's 7–25 minutes and no longer fits a PR check.

**Discipline rules:**

- One factory call per `describe` block in `beforeAll`, not per test in `beforeEach`.
- Target fewer than 30 integration test files total for a typical SaaS app.
- Don't test the same behavior at both pgTAP and JS levels. pgTAP owns RLS policy correctness; JS integration tests own PostgREST response shapes.
- If a unit test can answer the question, write a unit test.

---

## Always / Never

**Always:**
- Create a fresh `createClient()` instance per test or per `describe` block. Never share a client instance across test files.
- Set `auth: { persistSession: false, autoRefreshToken: false }` on all clients in Node/Vitest context.
- Set `auth: { persistSession: false }` on the admin (service role) client even in jsdom — prevents session contamination.
- Await `signInAs(...)` and verify the returned client has a session before issuing queries.
- Create org membership BEFORE calling `signInAs`. The Custom Access Token Hook reads `org_members` at JWT issuance.
- Use `admin.auth.admin.createUser({ email_confirm: true })` to create confirmed users. Never rely on the email inbox in tests.
- Delete `auth.users` entries via `admin.auth.admin.deleteUser()` in `afterAll`. Orphaned entries cause duplicate-email failures in future runs.
- Use `@test.invalid` email domain for all test users.
- Suffix test resource names with timestamps or UUIDs to prevent cross-run collisions.
- Assert on both `data` and `error`. A test that only checks `data` can miss an error that coincidentally left `data` non-null from prior state.
- Regenerate types after every migration: `npx supabase gen types typescript --local`.

**Never:**
- Never use the service role (admin) client to assert on RLS behavior. It bypasses all policies.
- Never share a single global supabase client across multiple test cases. Session state mutates the instance.
- Never use transaction-rollback isolation with supabase-js. It cannot share a Postgres connection handle across PostgREST HTTP calls.
- Never run integration tests against production or any DB with real user data.
- Never use `as any` to silence TypeScript errors in test assertions.
- Never truncate `auth.users` directly via SQL. Use `admin.auth.admin.deleteUser()` — direct SQL truncation skips GoTrue's cleanup logic.
- Never call `supabase.auth.signOut()` in `afterEach` on a `persistSession: false` client. It is a no-op and wastes a round trip.
- Never assert `expect(error).not.toBeNull()` for a SELECT operation blocked by RLS. SELECT filtering returns `{ data: [], error: null }`, not an error.

---

## Gotchas

**Gotcha 1: Service role client inherits user session (session contamination).**
After `signInWithPassword` on a user client, the admin client starts failing with RLS errors. In jsdom environments, both clients share localStorage. The user's session token overwrites the admin client's stored key. Fix: `persistSession: false` on the admin client. This prevents it from reading or writing any storage — it always uses its initialization key. Source: index.garden/supabase-vitest.

**Gotcha 2: Org membership created after sign-in — JWT has no org_id.**
The Custom Access Token Hook runs at JWT issuance. If `signInAs` is called before `org_members` is inserted, the JWT is issued without `org_id`. RLS policies that read `(auth.jwt() ->> 'org_id')::uuid` see null and return empty sets for everything. Every factory must insert membership rows before calling `signInAs`. If you need to test post-assignment state, sign out and sign in again.

**Gotcha 3: Parallel test files stomp shared data.**
Tests pass in isolation, fail unpredictably together. Multiple files running in parallel hit `beforeEach` truncation simultaneously, deleting each other's freshly created data. Fix: `singleFork: true` in Vitest config, plus org-scoping so tests within a file never touch each other's data.

**Gotcha 4: SELECT RLS returns empty, not 403 — incorrect assertion pattern.**
A test asserts `expect(error).not.toBeNull()` for a policy-filtered SELECT query. The test passes — but for the wrong reason. RLS SELECT filtering is silent (`{ data: [], error: null }`). The test was never actually catching the right behavior. For SELECT RLS, assert `expect(data).toHaveLength(0)` AND `expect(error).toBeNull()`. For write RLS, assert on `error.code === '42501'`.

**Gotcha 5: Module-level singleton client leaks session state.**
A test file defines `const supabase = createClient(...)` at module scope. Session state from one test (`signInWithPassword`) persists into the next. In `persistSession: false` mode the in-memory session on the instance persists until the instance is garbage-collected or re-assigned. Create clients inside `beforeAll` or at the top of each `it` block. Pass them as arguments to helpers rather than importing a singleton.

**Gotcha 6: `auth.admin.createUser` requires service role, not anon key.**
`admin.auth.admin.createUser()` returns a permission error when the client was initialized with the anon key. The `auth.admin.*` namespace requires the service role key. Always use `createAdminClient()` for `auth.admin.*` calls.

**Gotcha 7: Cleanup `afterAll` rethrows — cascades to false positives.**
One cleanup failure (e.g., a user already deleted) rethrows and aborts `afterAll`. Subsequent test files see stale data from the failed cleanup and fail for unrelated reasons. Wrap every cleanup call in `try/catch`, log a warning, and continue.

**Gotcha 8: `PGRST116` confused with `42501`.**
`.single()` on any query that returns 0 rows — including rows silently filtered by RLS — produces `PGRST116`. This is a PostgREST shape error, not a Postgres permission error. `42501` only surfaces from write operations. Tests that assert `error.code === '42501'` on a `.single()` SELECT will always fail even when RLS is correctly blocking the row.

---

## Cross-references

- **TEST_KB_2** — pgTAP: SQL-level RLS policy correctness, trigger assertions, constraint testing.
- **TEST_KB_4** — MSW and component testing: rendered state, UI interactions.
- **TEST_KB_6** — Realtime channel testing: async subscriptions and broadcast.
- **AUTH_KB_2** — Custom Access Token Hook: what claims are injected and when (directly affects Section 10 gotcha).
- **SB_KB_1** — Multi-org RLS patterns that these integration tests verify.
