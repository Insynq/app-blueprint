# Test Knowledge Base — Index

**Stack:** Vitest + Playwright + pgTAP + MSW v2, against Supabase Postgres + Auth + Edge Functions + Storage + Realtime, Next.js App Router with `@supabase/ssr`, with Trigger.dev / Inngest as the durable-execution escape hatch.

This folder owns testing the whole stack — strategy, RLS at the database, JS integration against the local Supabase CLI DB, component tests, E2E, and the async patterns (Realtime, outbox, scheduled jobs, durable execution) that nothing else can verify. `gen-test.md` reaches into this folder when generating tests; if you're picking a layer, start here.

These files are for Claude. Principles-only docs fail at implementation time. Every KB has real Vitest config, real SQL, real Playwright fixtures, and real gotchas.

---

## File index

| File | Topic | Stack-portable? |
|---|---|---|
| `TEST_KB_1_Test_Strategy.md` | Pyramid for this stack — when unit / component / integration / E2E; decision matrix by feature type; coverage philosophy; colocation conventions; CI strategy | ⚠️ Partial — pyramid concept portable; tool assignments are stack-specific |
| `TEST_KB_2_RLS_pgTAP.md` | pgTAP-driven RLS testing: dual-namespace JWT GUCs (`request.jwt.claim.sub` + `request.jwt.claims`), `SET ROLE authenticated`, multi-tenant fixture helpers, AAL2 gates, the `is_empty` vs `throws_ok` distinction | ✅ Portable (Postgres + pgTAP) |
| `TEST_KB_3_Integration_Supabase.md` | JS integration tests against the local Supabase CLI DB: factory-driven fixtures, two-client auth (anon vs authenticated), `persistSession: false` admin client, RPC + storage paths, RLS error-shape behavior | 🔒 Stack-locked: supabase-js + Supabase CLI |
| `TEST_KB_4_Component_MSW.md` | Vitest + Testing Library + MSW v2: PostgREST URL matching, `mockTable<T>` handler factories, realistic Auth/error shapes, `Accept`-header asymmetry between `.single()` and `.maybeSingle()`, fake `supabase-js` client for tight unit tests | ⚠️ Partial — MSW v2 portable; supabase-js URL/Accept patterns are stack-specific |
| `TEST_KB_5_E2E_Playwright.md` | Playwright `setup` project + `dependencies` for auth-state reuse, multi-tenant subdomain testing, MFA/AAL2 with `otplib`, network mocking only at edges, sharding + trace artifacts in CI, Inbucket-driven invite flows | ⚠️ Partial — Playwright portable; Inbucket / Supabase auth specifics are stack-locked |
| `TEST_KB_6_Async_Realtime_Outbox.md` | Outbox idempotency replay tests, claim-race + lease-expiry tests, Realtime two-client harness, pg_cron + Vercel Cron tests, Edge Function `serve` + `invoke`, Trigger.dev v3 / Inngest test helpers, fake-timer + WebSocket interaction | ⚠️ Partial — outbox concept portable; Realtime / pg_cron / Trigger.dev / Inngest are stack-locked |

---

## Cross-cutting rules that apply everywhere

**Always:**
- Test RLS at the **database** level with pgTAP. JS-only tests cannot simulate the JWT-driven role context the policies actually run under.
- Run RLS assertions as the `authenticated` role with `request.jwt.claims` set. Forgetting `SET ROLE authenticated` is the #1 way to write a passing test for a broken policy.
- Use the local Supabase CLI database for integration tests. The production project is never a test target.
- Mock Supabase at the HTTP layer with MSW v2 for component tests. Reach for a fake `supabase-js` client only when MSW is overkill — tight, logic-only unit tests.
- Reuse Playwright auth state via the `setup` project + `dependencies` pattern (not the legacy `globalSetup` function). One state file per role.
- Make every async assertion explicit: `expect.poll`, `waitFor`, Playwright auto-waits. No fixed sleeps.
- Outbox / durable-execution tests are idempotency tests first: replay the same row and assert exactly-one external side-effect.
- Carry forward `[VERIFY BEFORE SHIPPING]` flags into your test code as comments — re-verify when implementing.

**Never:**
- Mock RLS. Mocks of role context produce passing tests against broken policies — the worst kind of false confidence.
- Run integration tests against the production Supabase project.
- Mix MSW v1 and v2 syntax. The v2 migration broke `rest.get(...)` / `res(ctx.json(...))` — most blog posts still show v1.
- Test async Server Components with Vitest. They render to nothing and tests pass silently. Use Playwright E2E.
- Use `page.waitForTimeout(N)` for app state in Playwright. Use auto-waits and `expect.poll`.
- Mock Supabase in E2E. The whole point is real Supabase + real Next.js.
- Snapshot entire component trees as the primary assertion strategy.
- Use `vi.useFakeTimers()` in the same test file as a real Realtime WebSocket — fake timers stall the heartbeat and the connection drops.
- Trust `@inngest/test` to simulate retries. It does not model them.
- Branch on the `Accept` header to detect `.maybeSingle()` calls. GET-based `.maybeSingle()` sends `application/json`, indistinguishable from an array GET.

---

## Dependencies between files

```
TEST_KB_1   ← all others   (strategy informs tool choice; every tool KB defers feature-routing decisions to KB_1)
TEST_KB_2   ← TEST_KB_3    (TEST_KB_2 owns policy correctness; TEST_KB_3 asserts API behavior under those policies)
TEST_KB_3   ← TEST_KB_6    (outbox / async tests use TEST_KB_3's factory + sign-in helpers)
TEST_KB_4   ← TEST_KB_5    (component tests assert rendered shape; E2E asserts the full flow end-to-end)
TEST_KB_5   ← TEST_KB_6    (Playwright two-context patterns mirror TEST_KB_6's Realtime two-client harness)
```

Cross-folder dependencies:

```
TEST_KB_2   → AUTH_KB_2    (the top-level JWT claims TEST_KB_2 sets via set_config are populated by the Custom Access Token Hook)
TEST_KB_2   → SB_KB_1      (the multi-org RLS policies pgTAP tests verify)
TEST_KB_2   → SB_KB_12     (InitPlan idiom — `(select auth.jwt() ->> 'org_id')` — under test)
TEST_KB_3   → AUTH_KB_4    (server-side @supabase/ssr clients used inside integration tests)
TEST_KB_3   → AUTH_KB_5    (signup trigger creates the org/membership rows the factories assume exist)
TEST_KB_5   → AUTH_KB_3    (MFA / AAL2 step-up flows tested in E2E with otplib)
TEST_KB_5   → SB_KB_8      (multi-tenant subdomain routing — `org-a.app.test`, `org-b.app.test` Playwright fixtures)
TEST_KB_6   → JOB_KB_1     (the outbox worker under test)
TEST_KB_6   → JOB_KB_2     (pg_cron + Vercel Cron jobs under test)
TEST_KB_6   → JOB_KB_3     (queue table patterns under test)
TEST_KB_6   → JOB_KB_4     (Trigger.dev v3 / Inngest under test)
TEST_KB_6   → SB_KB_6      (transactional outbox producer the worker drains)
TEST_KB_6   → SB_KB_9      (Realtime patterns Playwright + Vitest harnesses verify)
TEST_KB_6   → SB_KB_10     (Resend Idempotency-Key — the canonical idempotent receiver in replay tests)
```

---

## When to update these files

Update the relevant TEST_KB when:
- A major version of Vitest, Playwright, MSW, pgTAP, `supabase-js`, or `@supabase/ssr` ships and changes test-relevant APIs
- Trigger.dev or Inngest ships a test-helper API change (the v2 → v3 churn was significant; assume more to come)
- Supabase CLI changes the local stack (e.g., the Inbucket → Mailpit migration in progress as of 2026-Q2)
- pg_cron behavior changes (sub-minute syntax availability has shifted across versions)
- A test pattern produces a flaky result or a false-confidence pass in production

Do not update TEST_KBs to reflect project-specific decisions. These are stack patterns, not project docs.

---

## What these files do NOT cover

- **Visual regression** (Chromatic, Percy, Argos, BackstopJS) — different tool class
- **Load / performance testing** (k6, Artillery, Lighthouse CI) — different concern
- **Mutation testing** (Stryker), **contract testing** (Pact / OpenAPI-driven) — overkill for this template
- **Snapshot testing** as a primary pattern — covered as anti-pattern, never as a recommended approach
- **Cypress** — Playwright is the chosen E2E framework
- **Jest** — Vitest is the chosen unit/component runner
- **Detox / Maestro / mobile E2E** — focused on the Next.js App Router web stack
- **Storybook + Chromatic** as a test layer — Storybook is fine for development; not part of the test strategy here

---

## VERIFY BEFORE SHIPPING

Several KBs flag items that primary docs didn't fully confirm. Search each KB for `[VERIFY BEFORE SHIPPING]` and confirm against current docs before relying on these patterns in production. Notable items:

- **Inbucket vs Mailpit at port 54324** (TEST_KB_5, TEST_KB_6) — Supabase docs use both names; REST API paths differ. Run `curl http://127.0.0.1:54324/api/v1/mailbox/...` locally to confirm before wiring email-driven tests
- **`@trigger.dev/testing` v3 export names** (TEST_KB_6) — `createJobTester` / `toHaveSucceeded` could not be confirmed from primary docs; Trigger.dev's docs primarily cover dashboard testing
- **Inngest minimum peer version** (TEST_KB_6) — `>= 3.22.12` for v3 SDK, `>= 4.0.0` for v4 SDK; check `@inngest/test`'s `package.json`
- **`auth.users` minimum required columns for direct INSERT in pgTAP fixtures** (TEST_KB_2) — schema evolves across Auth versions
- **`supabase test db` subdirectory support under `supabase/tests/`** (TEST_KB_1, TEST_KB_2) — flat layout is safe; nested layout unconfirmed
- **pgTAP `dblink` extension availability** (TEST_KB_6) — required for the two-transaction concurrency pattern
- **Supabase Realtime channel limits per plan** (TEST_KB_6)
- **Playwright `browserContext.setStorageState()`** added in v1.59 (TEST_KB_5) and the `indexedDB: true` capture option added in v1.51 — confirm against your installed version
- **`supabase-js` ≥ 2.45.6 resolves the `@supabase/node-fetch` ESM/MSW interception issue** (TEST_KB_4) — version-specific changelog claim

These are not blockers — flagged so users verify per-project before relying.
