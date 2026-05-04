# TEST_KB_1 — Test Strategy and Layer Decisions

**Stack-locked: Vitest + Playwright + pgTAP + MSW. Next.js App Router + Supabase + @supabase/ssr. Multi-tenant with custom JWT claims.**

---

This KB owns the testing strategy for the full stack: which layer tests which artifact, how to structure test files, coverage targets, and what to skip. It does not own tool configuration details — those belong to [TEST_KB_2](TEST_KB_2_RLS_pgTAP.md) (pgTAP / RLS), [TEST_KB_3](TEST_KB_3_Integration_Supabase.md) (JS integration tests against the local Supabase CLI DB), [TEST_KB_4](TEST_KB_4_Component_MSW.md) (component tests with MSW + fake `supabase-js` client), [TEST_KB_5](TEST_KB_5_E2E_Playwright.md) (Playwright E2E), and [TEST_KB_6](TEST_KB_6_Async_Realtime_Outbox.md) (async tests for Realtime, outbox, scheduled jobs, and durable execution).

---

## Always / Never

**Always:**
- Test async Server Components with Playwright E2E only — Vitest cannot render them
- Run TypeScript (`tsc --noEmit`) and ESLint before tests in CI — fail fast on static errors
- Write both a positive and a negative pgTAP test for every RLS policy
- Extract Server Action business logic into a plain async function before unit-testing it
- Specify `webServer` in `playwright.config.ts` so Playwright can start or reuse the Next.js server
- Use `--with-deps` when installing Playwright browsers in CI (`playwright install chromium --with-deps`)
- Upload the Playwright HTML report as a CI artifact — the trace viewer is the only reliable debugger for CI failures
- Isolate E2E tests — each test owns its own session and storage state
- Use role-based locators in Playwright (`getByRole`, `getByLabel`) — they reflect what the user actually sees

**Never:**
- Unit-test async Server Components with Vitest — they are not supported; the test may silently pass with nothing rendered
- Write a test that calls real Supabase cloud, Resend, Stripe, or any external API in automated CI
- Target 100% coverage — it drives tests of trivial code and creates false confidence
- Snapshot-test entire component trees as the primary assertion strategy
- Test implementation details: internal state variables, private methods, component refs
- Test framework code: Next.js routing, Supabase client initialization, generated `database.types.ts`
- Write tests that share state across test files or depend on execution order
- Mock the entire job/task runner in a unit test — you lose confidence in retry and idempotency behavior
- Use CSS selectors or XPath as primary Playwright locators — they break on DOM refactors

---

## Decision Matrix

| Feature Type | Test Layer | Tool(s) | Why |
|---|---|---|---|
| Pure function (utility, transform, validator) | Unit | Vitest | No side effects, no setup, millisecond feedback |
| Sync Server Component | Component | Vitest + RTL | Next.js confirms sync RSCs are testable with Vitest |
| Async Server Component | E2E | Playwright | Vitest cannot render async RSCs; only a real Next.js runtime can |
| Client Component (hooks, interactivity) | Component | Vitest + RTL + MSW | jsdom + MSW intercepts fetch without a real Supabase instance |
| Server Action (full, with cookies/revalidation) | E2E | Playwright | Requires a running server; cookies and `revalidatePath` don't exist in jsdom |
| Server Action (pure business logic extracted) | Unit | Vitest | Extract the transform/validation into a plain async function |
| RLS policy | Database | pgTAP | SQL tests run as different Postgres roles — only layer that proves unauthorized access is actually blocked |
| Edge Function (business logic) | Unit | Vitest (node env) | Extract pure logic; Deno imports may need shims — see note below |
| Edge Function (full invocation) | Integration | `supabase functions serve` | Full invocation requires local Supabase CLI |
| Outbox worker (task logic) | Unit + integration | Vitest | Test extracted logic as a plain function; full retry/durability behavior requires the task runner dev environment |
| Auth flow (sign-in, PKCE, session) | E2E | Playwright | Involves cookies, redirects, PKCE exchange — none are simulatable in jsdom |
| Supabase Realtime subscription | E2E | Playwright | WebSocket support in jsdom is partial; subscriptions silently fail to fire events |
| Multi-tenant JWT claims (`org_id`, `role`, `aal`) | Unit + E2E | Vitest (claim parsing) + Playwright (full flow) | Parse logic is unit-testable; enforcement requires the full auth + middleware chain |

> **[VERIFY BEFORE SHIPPING]** Async RSC support: Next.js docs (last checked 2026-04-10) confirm Vitest does not support async Server Components. Verify whether React 19 stable or a `@testing-library/react` update changes this before removing the E2E-only rule.

> **[VERIFY BEFORE SHIPPING]** Edge Functions + Vitest node env: Whether Vitest correctly resolves Deno-style imports (`https://esm.sh/...`) is unconfirmed. A separate `deno test` runner may be required for full Edge Function coverage.

---

## Coverage Philosophy

Coverage is a smoke detector, not a goal. A line executed without a meaningful assertion is covered on paper and broken in production.

What coverage does not measure:
- Whether assertions are meaningful
- Whether edge cases are exercised
- Whether behavior matches user expectations

A component can have 100% line coverage from a single `render(<Component />)` call that asserts nothing.

**What to exclude from coverage entirely:**
- `**/generated/**` and `**/database.types.ts` — generated from schema; testing them tests Supabase codegen, not your code
- `**/*.config.{ts,js}` — validated by build; no runtime behavior
- `**/*.d.ts`, `**/*.types.ts` — TypeScript handles this
- `**/mocks/**`, `**/__mocks__/**` — test infrastructure, not application logic
- `**/*.stories.{ts,tsx}` — Storybook stories; not shipped behavior

**Realistic targets per layer:**

| Layer | Target | Rationale |
|---|---|---|
| Pure functions / utilities | 90–100% | High ROI, trivial to achieve |
| Client component logic | 70–85% | Focus on meaningful user interactions |
| Sync Server Component | 60–75% | Many branches are layout variants only |
| Server Action (extracted logic) | 80–90% | The extracted function is what gets covered |
| API routes / middleware | 60–80% | Integration-level; defer happy path to E2E |
| E2E (Playwright) | No line metric | E2E line coverage is misleading and not tracked |
| RLS policies (pgTAP) | 100% of policies | Every policy needs a positive + negative test |

**Recommended CI approach:** Set a branch coverage floor in CI as a safety net. Fail the build only if coverage drops from a prior high-water mark, not if it fails an arbitrary target.

```ts
// vitest.config.mts — coverage section
coverage: {
  provider: 'v8',
  reporter: ['text', 'html', 'lcov'],
  include: ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'],
  exclude: [
    '**/*.d.ts',
    '**/generated/**',
    '**/database.types.ts',
    '**/__mocks__/**',
    '**/mocks/**',
    '**/*.stories.{ts,tsx}',
    '**/*.config.{ts,js}',
  ],
  thresholds: {
    branches: 70,
    lines: 75,
  },
}
```

> **[VERIFY BEFORE SHIPPING]** Coverage provider: V8 is faster but Next.js source maps may reduce accuracy in some App Router configurations. Istanbul is more battle-tested for transpiled code. No primary source has confirmed the best provider for App Router specifically — test both if coverage numbers look suspicious.

---

## Test File Colocation Conventions

**Unit and component tests** — colocated with the file they test:

| Source file | Test file |
|---|---|
| `app/(dashboard)/orders/page.tsx` | `app/(dashboard)/orders/page.test.tsx` |
| `app/(dashboard)/orders/_components/OrderCard.tsx` | `app/(dashboard)/orders/_components/OrderCard.test.tsx` |
| `src/lib/format-currency.ts` | `src/lib/format-currency.test.ts` |
| `src/hooks/use-org-context.ts` | `src/hooks/use-org-context.test.ts` |
| `src/actions/submit-order.ts` | `src/actions/submit-order.test.ts` (extracted logic only) |

Colocation is the modern App Router convention. Both colocation and a root-level `__tests__/` folder are valid per Next.js docs — pick one and stay consistent. Colocation is preferred here because it makes coverage gaps visible in the file tree.

**Integration tests** — separate root folder, separate Vitest project:

```
tests/
  integration/
    auth-flow.test.ts
    subscription-query.test.ts
    outbox-rpc.test.ts
```

Integration tests run in `node` environment, need longer timeouts, and often require a local Supabase CLI instance. Separating them allows the Vitest `projects` config to apply different settings.

**E2E tests** — separate root folder, consumed by Playwright:

```
tests/
  e2e/
    sign-in.spec.ts
    org-dashboard.spec.ts
    realtime-updates.spec.ts
```

**pgTAP tests** — under `supabase/` per Supabase CLI convention:

```
supabase/
  tests/
    rls/
      orders.test.sql
      profiles.test.sql
    functions/
      claim-outbox-batch.test.sql
```

> **[VERIFY BEFORE SHIPPING]** Whether `supabase test db` supports subdirectory organization under `supabase/tests/` is not confirmed from primary sources. The flat convention (`supabase/tests/*.test.sql`) is safe on all versions.

**MSW handlers** — in `src/mocks/`:

```
src/
  mocks/
    handlers.ts     # MSW request handlers
    server.ts       # MSW node server setup (used by Vitest)
    browser.ts      # MSW browser service worker (used in Storybook / dev)
```

---

## Vitest Projects Config (Multi-Environment)

Separate Vitest projects let unit and integration tests run in different environments with different timeouts and setup files, without a separate config file per suite.

> Use `test.projects`. The older `test.workspace` key was deprecated in Vitest 3.2 — many older blog posts still show it; do not copy them.

```ts
// vitest.config.mts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: [
            'app/**/*.test.{ts,tsx}',
            'src/**/*.test.{ts,tsx}',
          ],
          environment: 'jsdom',
          setupFiles: ['src/mocks/server.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          testTimeout: 30000,
          // No MSW — integration tests hit the local Supabase CLI instance directly
        },
      },
    ],
  },
})
```

Run a single project in CI:
```bash
vitest run --project unit       # fast, no DB required
vitest run --project integration # requires supabase start
```

---

## What NOT to Test

**Framework behavior:**
- Next.js `<Link>` navigation — that's Next.js's own test suite
- Supabase `createClient()` returning a client — trust the library
- `database.types.ts` — generated from schema; testing it tests codegen

**Trivial code:**
- Property getters and setters with no logic
- Constants and enum-like objects
- Config files (`tailwind.config.ts`, `next.config.ts`)

**Implementation details:**
- Internal component state (`useState` values)
- Private functions and class internals
- Component instance refs
- Whether `useEffect` fires on mount — test the behavior the effect causes, not the effect itself

**Snapshot anti-patterns:**
- Snapshots of entire component trees as the primary assertion — they catch everything and verify nothing
- Snapshots updated blindly with `--updateSnapshot` because "CI was failing" — a snapshot failure you dismiss is a regression you shipped

**Third-party integrations tested live:**
- Real Resend API calls in unit/integration tests
- Real Stripe webhook events in automated CI
- Real Supabase cloud project in automated CI (use local CLI or a dedicated test project)

**Signal/noise reminder:** Every test has a maintenance cost. A test that fails on a correct refactor is worse than no test — it trains engineers to dismiss failures. Test behaviors that, if broken, cause real user pain.

---

## CI Strategy (High-Level)

Layer-specific CI details live in the KB that owns each tool: [TEST_KB_2](TEST_KB_2_RLS_pgTAP.md) for pgTAP in CI, [TEST_KB_5](TEST_KB_5_E2E_Playwright.md) for Playwright sharding and trace artifact upload. This section sets the layer assignments:

**On every push / PR (target: under 5 minutes):**
1. `tsc --noEmit` — catches type errors before any test runs
2. ESLint — catches static issues
3. `vitest run --project unit` — fast, MSW handles network, no external dependencies
4. `vitest run --project integration` — requires `supabase start`; adds ~1–2 minutes
5. `supabase test db` — pgTAP RLS tests against local Supabase CLI

**On PR (can run in parallel with the fast checks):**
- Playwright E2E against a Vercel preview deployment or a local production build

**On merge to main:**
- All PR checks re-run on the merge commit
- Coverage report generated and threshold enforced

**Nightly:**
- Full cross-browser Playwright (Chromium + Firefox + WebKit)
- Full pgTAP policy audit
- Smoke tests against production (read-only, non-mutating)

> **[VERIFY BEFORE SHIPPING]** Vercel preview URL in GitHub Actions: `VERCEL_URL` is a hostname only (no protocol). Set `BASE_URL=https://${VERCEL_URL}` before passing to Playwright. The exact GitHub Actions step for waiting on Vercel deployment completion (via `vercel-action` or GitHub Deployment status event) is not confirmed from primary sources.

---

## Gotchas

**1. Vitest + async Server Components silently render nothing.**
If you render an `async` Server Component with Vitest, it may return an empty component or an unresolved Promise. Tests pass while asserting on empty output. There is no loud error. Fix: async RSC scenarios belong in Playwright E2E exclusively. Add a test naming convention or lint rule to make this boundary explicit.

**2. MSW does not intercept `@supabase/ssr` cookie handling.**
MSW intercepts `fetch`, but `@supabase/ssr` reads and writes cookies via `next/headers` — a Next.js server-only API that does not exist in jsdom. If a client component calls a Server Action that uses `@supabase/ssr`, the component test throws on the `next/headers` import. Fix: do not test Server Action integration at the component level. Pass a mocked callback prop to the component; test the full Server Action with Playwright E2E.

**3. `VERCEL_URL` has no protocol — Playwright's `baseURL` breaks.**
The `VERCEL_URL` environment variable from Vercel preview deployments is a bare hostname (`my-app-abc123.vercel.app`). Playwright's `baseURL` requires `https://`. Fix: in your GitHub Actions workflow, set `BASE_URL=https://${{ env.VERCEL_URL }}` before the Playwright step.

**4. pgTAP tests fail non-deterministically if `supabase start` isn't settled.**
`supabase test db` requires the local stack to be fully running and all migrations applied. If CI starts pgTAP before `supabase start` completes, tests fail with connection errors or stale schema. Fix: use `supabase db reset` instead of relying on start order — `db reset` applies migrations before tests run.

**5. Coverage gaps on dynamic route segments.**
A Vitest test that renders `app/orders/[id]/page.tsx` with a single hard-coded `id` prop hits one branch of conditional logic. Coverage appears complete but alternate `id` shapes (missing, malformed, unauthorized) are untested. Fix: parameterize unit tests across representative values, or defer dynamic-segment edge cases to Playwright E2E.

**6. Realtime subscriptions silently fail in jsdom.**
`supabase-js` Realtime uses WebSockets. jsdom's WebSocket implementation is partial — a subscription may appear to connect but never fire events. Tests pass; the feature is untested. Fix: all Realtime subscription behavior is E2E-only territory. Use Playwright with a real or local Supabase instance.

> **[VERIFY BEFORE SHIPPING]** Vitest browser mode (with Playwright provider) may handle WebSocket correctly. Not confirmed from primary sources as of 2026-04-10.

**7. Job/task files import server-only modules — jsdom environment throws.**
Task files for outbox workers or Trigger.dev/Inngest jobs commonly import server-only packages (`server-only`, Supabase service role client, Resend). Vitest in jsdom throws immediately on these imports. Fix: run job unit tests in the `integration` Vitest project (node environment), or extract the pure business logic into a separate module that does not import server-only packages.

**8. Playwright trace artifacts fill CI storage on large suites.**
With `trace: 'on'` (always), each test generates a 10–50 MB ZIP for complex interactions. CI artifact storage fills quickly. Fix: use `trace: 'on-first-retry'` — Playwright's own recommendation — which generates traces only for failing tests being retried. Those are the only traces you need to debug.

---

## What This KB Does NOT Cover

- **[TEST_KB_2](TEST_KB_2_RLS_pgTAP.md)** — pgTAP test structure, `supabase test db` setup, writing role-switching SQL tests for RLS
- **[TEST_KB_3](TEST_KB_3_Integration_Supabase.md)** — JS integration tests against the local Supabase CLI DB: factories, two-client auth, RPC, storage, RLS error shapes
- **[TEST_KB_4](TEST_KB_4_Component_MSW.md)** — component tests: MSW v2 handlers, fake `supabase-js` client, PostgREST URL matching, auth/error shapes
- **[TEST_KB_5](TEST_KB_5_E2E_Playwright.md)** — Playwright config, the `setup` project for auth state reuse, multi-tenant subdomain testing, sharding, MFA/AAL2
- **[TEST_KB_6](TEST_KB_6_Async_Realtime_Outbox.md)** — async test patterns: outbox idempotency replay, Realtime two-client harness, pg_cron + Vercel Cron, Edge Functions, Trigger.dev / Inngest
