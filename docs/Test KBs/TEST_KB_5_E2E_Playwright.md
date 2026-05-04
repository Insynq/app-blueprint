# TEST_KB_5 — End-to-End Testing with Playwright

**Stack-locked: Next.js App Router + Supabase Auth (@supabase/ssr) + multi-tenant subdomains. Playwright is the chosen E2E framework.**

---

## What this KB covers

Setup, auth state reuse, multi-tenant subdomain testing, typed fixtures, async wait patterns, network mocking boundaries, trace/video on failure, parallelism and CI sharding, visual regression basics, MFA/AAL2 fixtures, and flake hygiene.

## What this KB does NOT cover

- Unit or integration testing (see TEST_KB_1)
- Component-level testing (see TEST_KB_3)
- Realtime / WebSocket multi-context flows (see TEST_KB_6)
- Supabase RLS policy verification (see `audit-rls` command)
- Cypress (not the chosen framework for this stack)

---

## 1. Setup

### Installation

```bash
npm init playwright@latest
# Accept: TypeScript, test dir = e2e/, GitHub Actions workflow, install browsers
```

Browsers are NOT auto-downloaded since Playwright 1.38. Always install explicitly:

```bash
# CI: only what you need
npx playwright install chromium --with-deps

# Local dev: all browsers
npx playwright install
```

### Directory structure

```
e2e/
  auth.setup.ts          # setup project — generates storageState files
  fixtures.ts            # typed test.extend fixture file
  invite-flow.spec.ts    # example spec
playwright/
  .auth/                 # .gitignore this entire directory
    admin.json
    member.json
    outsider.json
playwright.config.ts
```

```bash
mkdir -p playwright/.auth
echo 'playwright/.auth' >> .gitignore
```

### `playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'blob' : 'html', // blob required for shard merging
  timeout: 30_000,

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Auth setup runs first — produces storageState files consumed by all test projects
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },

    // Primary browser — all tests
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/admin.json',
      },
      dependencies: ['setup'],
    },

    // Cross-browser-critical flows only — tag tests with @cross-browser
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: 'playwright/.auth/admin.json',
      },
      dependencies: ['setup'],
      grep: /@cross-browser/,
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        storageState: 'playwright/.auth/admin.json',
      },
      dependencies: ['setup'],
      grep: /@cross-browser/,
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI, // always fresh on CI
    timeout: 120_000,                     // next dev cold start is slow
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
```

**`webServer` notes:**
- `url` is polled until it returns any 2xx/3xx/4xx. It does NOT wait for page compilation — only for the server process to accept connections. The first page load after `next dev` starts can still compile cold (10–30 s for large apps). Add a warmup navigation in your `setup` project to pre-compile critical routes.
- `reuseExistingServer: !process.env.CI` — lets local dev reuse a running server. CI always starts fresh.
- To test against a Vercel preview URL instead of `next dev`, set `PLAYWRIGHT_BASE_URL=https://preview-xyz.vercel.app` and remove the `webServer` block or guard it on `!process.env.PLAYWRIGHT_BASE_URL`.

---

## 2. Auth State Reuse — `setup` Project with `dependencies`

**Always use the `setup` project pattern. Never use the legacy `globalSetup` function.**

The `setup` project runs before dependent test projects, appears in the HTML report with traces, and can be re-run in isolation for debugging. `globalSetup` provides none of these.

`storageState` captures cookies + localStorage by default. From v1.51+, IndexedDB capture is available **opt-in** via the `indexedDB: true` option on `browserContext.storageState({ ... })`. Supabase Auth sessions live in cookies + localStorage, so the default capture covers the full session — IndexedDB capture is rarely needed for this stack.

### `e2e/auth.setup.ts`

```typescript
import { test as setup, expect } from '@playwright/test';
import path from 'path';

const ADMIN_AUTH    = path.join(__dirname, '../playwright/.auth/admin.json');
const MEMBER_AUTH   = path.join(__dirname, '../playwright/.auth/member.json');
const OUTSIDER_AUTH = path.join(__dirname, '../playwright/.auth/outsider.json');

// Admin — authenticated on org-a subdomain
setup('auth: admin', async ({ page }) => {
  await page.goto('http://org-a.app.test:3000/auth/login');
  await page.getByLabel('Email').fill(process.env.TEST_ADMIN_EMAIL!);
  await page.getByLabel('Password').fill(process.env.TEST_ADMIN_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.context().storageState({ path: ADMIN_AUTH });
});

// Member — authenticated on org-a subdomain
setup('auth: member', async ({ page }) => {
  await page.goto('http://org-a.app.test:3000/auth/login');
  await page.getByLabel('Email').fill(process.env.TEST_MEMBER_EMAIL!);
  await page.getByLabel('Password').fill(process.env.TEST_MEMBER_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
  await page.context().storageState({ path: MEMBER_AUTH });
});

// Outsider — authenticated on org-b subdomain (used for cross-org boundary tests)
setup('auth: outsider', async ({ page }) => {
  await page.goto('http://org-b.app.test:3000/auth/login');
  await page.getByLabel('Email').fill(process.env.TEST_OUTSIDER_EMAIL!);
  await page.getByLabel('Password').fill(process.env.TEST_OUTSIDER_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/dashboard');
  await page.context().storageState({ path: OUTSIDER_AUTH });
});
```

**Role switching within a spec:**

```typescript
// Override storageState for a specific test block
test.use({ storageState: 'playwright/.auth/member.json' });

// Unauthenticated tests
test.use({ storageState: { cookies: [], origins: [] } });
```

`browserContext.setStorageState()` was added in **v1.59** and resets cookies, localStorage, and IndexedDB for all origins, then loads the supplied state — accepts either a file path or a storage-state object. If your project pins to an earlier Playwright version, use `browser.newContext({ storageState })` instead (works on all versions).

---

## 3. Multi-Tenant Testing on Subdomains

### Local dev — host resolution

Add to `/etc/hosts`:

```
127.0.0.1  org-a.app.test
127.0.0.1  org-b.app.test
127.0.0.1  app.test
```

Use `.app.test` TLD, not `.localhost`. Browsers reject cookies with `domain=.localhost`. `.app.test` is unregistered and resolves only via hosts file — safe for local test use.

### CI — GitHub Actions host setup

```yaml
- name: Configure test hostnames
  run: |
    echo "127.0.0.1 org-a.app.test" | sudo tee -a /etc/hosts
    echo "127.0.0.1 org-b.app.test" | sudo tee -a /etc/hosts
```

Add this step before the Playwright test step. No `sudo` prompt on GitHub-hosted runners.

### Per-org project configuration

```typescript
// In playwright.config.ts projects array — for tests scoped to a specific org
{
  name: 'org-a',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://org-a.app.test:3000',
    storageState: 'playwright/.auth/admin.json',
  },
  dependencies: ['setup'],
},
{
  name: 'org-b',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://org-b.app.test:3000',
    storageState: 'playwright/.auth/outsider.json',
  },
  dependencies: ['setup'],
},
```

### Cross-org boundary test

```typescript
test('org-A user cannot access org-B resources', async ({ browser }) => {
  const adminCtx = await browser.newContext({
    storageState: 'playwright/.auth/admin.json',
  });
  const adminPage = await adminCtx.newPage();

  // org-A session navigating to org-B — expect rejection
  await adminPage.goto('http://org-b.app.test:3000/dashboard');
  await expect(adminPage).toHaveURL(/login|unauthorized/);
  await expect(adminPage.getByText(/not authorized|access denied/i)).toBeVisible();

  await adminCtx.close();
});
```

**Cookie domain behavior:** Supabase Auth cookies are scoped to the exact hostname. A cookie from `org-a.app.test` is not sent to `org-b.app.test`. This is correct behavior — the cross-org boundary test verifies it holds. Do not fight it.

**[VERIFY BEFORE SHIPPING]** Playwright v1.52 changed `route.continue()` — it can no longer override the `Cookie` header. If you need to inject cookies for a specific subdomain, use `browserContext.addCookies()` instead.

---

## 4. Typed Fixtures — `test.extend`

### `e2e/fixtures.ts`

```typescript
import { test as base, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import path from 'path';

type OrgFixture = {
  orgId: string;
  orgSlug: string;
  subdomain: string;
};

type Fixtures = {
  adminPage: Page;
  memberPage: Page;
  outsiderPage: Page;
  freshOrg: OrgFixture;
  supabaseAdmin: SupabaseClient;
};

const ADMIN_AUTH    = path.join(__dirname, '../playwright/.auth/admin.json');
const MEMBER_AUTH   = path.join(__dirname, '../playwright/.auth/member.json');
const OUTSIDER_AUTH = path.join(__dirname, '../playwright/.auth/outsider.json');

export const test = base.extend<Fixtures>({
  adminPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: ADMIN_AUTH });
    const page = await ctx.newPage();
    await use(page);
    await ctx.close();
  },

  memberPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: MEMBER_AUTH });
    const page = await ctx.newPage();
    await use(page);
    await ctx.close();
  },

  outsiderPage: async ({ browser }, use) => {
    const ctx = await browser.newContext({ storageState: OUTSIDER_AUTH });
    const page = await ctx.newPage();
    await use(page);
    await ctx.close();
  },

  // Service-role client for direct DB seeding and teardown — never for assertions
  supabaseAdmin: async ({}, use) => {
    const client = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    await use(client);
  },

  // Per-test isolated org — created before test, hard-deleted after
  freshOrg: async ({ supabaseAdmin }, use) => {
    const slug = `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await supabaseAdmin
      .from('organizations')
      .insert({ slug, name: `Test Org ${slug}` })
      .select('id, slug')
      .single();

    if (error) throw error;

    await use({
      orgId: data.id,
      orgSlug: data.slug,
      subdomain: `${data.slug}.app.test`,
    });

    await supabaseAdmin.from('organizations').delete().eq('id', data.id);
  },
});

export { expect };
```

**Worker-scoped fixture** (expensive setup shared across all tests in one worker):

```typescript
workerOrg: [async ({}, use, workerInfo) => {
  const slug = `worker-${workerInfo.workerIndex}-${Date.now()}`;
  const org = await seedOrg(slug);
  await use(org);
  await teardownOrg(org.id);
}, { scope: 'worker' }],
```

Use `workerInfo.workerIndex` in seed data names. Two workers on the same machine both have `workerIndex: 0` unless you account for shard offset — see Gotchas.

---

## 5. Async Waits Done Right

### Hierarchy — use in this order

**1. Web-first assertions (preferred) — always auto-wait up to `timeout`:**

```typescript
// Auto-waits up to 30 s (config timeout) for element to become visible
await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
await expect(page.getByTestId('invite-status')).toHaveText('Sent');

// Never do this — reads state immediately, no waiting
expect(await page.getByText('Sent').isVisible()).toBe(true); // BAD
```

**2. `page.waitForURL()` — for navigation completion:**

```typescript
await page.getByRole('button', { name: 'Accept invite' }).click();
await page.waitForURL('**/dashboard');
```

**3. `page.waitForResponse()` — when you need to confirm a mutation landed before asserting UI:**

```typescript
const responsePromise = page.waitForResponse(
  resp => resp.url().includes('/api/invites') && resp.status() === 201
);
await page.getByRole('button', { name: 'Send invite' }).click();
await responsePromise;
// Now safe to assert UI state that depends on the server write
```

**4. `expect.poll()` — for polling non-DOM conditions (e.g., Inbucket, background jobs):**

```typescript
await expect.poll(
  async () => {
    const resp = await fetch('http://127.0.0.1:54324/api/v1/mailbox/user@example.com');
    if (!resp.ok) return 0;
    const messages = await resp.json();
    return messages.length;
  },
  { timeout: 15_000, intervals: [1000, 2000, 3000] }
).toBeGreaterThan(0);
```

**5. `locator.waitFor()` — wait for state before interacting:**

```typescript
const modal = page.getByRole('dialog', { name: 'Invite sent' });
await modal.waitFor({ state: 'visible', timeout: 5000 });
```

**Never:**

```typescript
await page.waitForTimeout(3000); // always a race condition waiting to happen
```

The only legitimate use of `waitForTimeout` is in combination with `test.slow()` as a deliberate pace control, never as a workaround for timing uncertainty.

---

## 6. Network Mocking — Only at External Edges

Never mock Supabase in E2E tests. The real database is the entire point of E2E. Mock only external services that should not be called from the test environment.

**Block third-party services:**

```typescript
await page.route('**stripe.com/**', route => route.abort());
await page.route('**analytics.example.com/**', route => route.abort());
```

**Fulfill a mock response (e.g., simulate Stripe webhook):**

```typescript
await page.route('**/api/stripe/webhook', async route => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ received: true }),
  });
});
```

**Modify a real response (e.g., force a feature flag):**

```typescript
await page.route('**/api/flags', async route => {
  const response = await route.fetch();
  const json = await response.json();
  json.newBillingUI = true;
  await route.fulfill({ response, json });
});
```

**[VERIFY BEFORE SHIPPING]** Playwright v1.52 breaking change: `route.continue()` can no longer override the `Cookie` header. Use `browserContext.addCookies()` for cookie injection.

---

## 7. Trace, Video, and Screenshot on Failure

```typescript
use: {
  trace: 'retain-on-failure',    // full DOM snapshots + network + console
  video: 'retain-on-failure',    // screen recording — deleted on pass
  screenshot: 'only-on-failure', // still shot at point of failure
},
```

`'retain-on-failure'` records always and deletes on pass. It is more complete than `'on-first-retry'` (misses first-pass failures) and cheaper than `'on'` (keeps all traces including passes).

**View traces locally:**

```bash
npx playwright show-report
# Click the trace icon on any failing test

npx playwright show-trace test-results/my-test/trace.zip
```

---

## 8. Parallelism and Sharding

```typescript
// playwright.config.ts
fullyParallel: true,              // test-level parallelism, not just file-level
workers: process.env.CI ? 2 : undefined, // CI: fixed count; local: half CPU cores
reporter: process.env.CI ? 'blob' : 'html', // blob required for shard merge
```

`fullyParallel: true` distributes individual tests across workers. Without it, distribution is file-level — uneven file sizes cause uneven shards.

**CLI sharding:**

```bash
npx playwright test --shard=1/4
npx playwright test --shard=2/4
npx playwright test --shard=3/4
npx playwright test --shard=4/4
```

**Per-worker org seeding — the only safe pattern for parallel mutable tests:**

```typescript
workerOrg: [async ({}, use, workerInfo) => {
  // Each worker gets its own org — no shared mutable state across workers
  const slug = `worker-${workerInfo.workerIndex}`;
  const org = await seedOrg(slug);
  await use(org);
  await teardownOrg(org.id);
}, { scope: 'worker' }],
```

Never share a seed user across parallel workers. If worker A changes the user's email or preferences, worker B's auth breaks non-deterministically.

---

## 9. CI Integration — GitHub Actions

```yaml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:

jobs:
  e2e:
    name: E2E (${{ matrix.shardIndex }}/${{ matrix.shardTotal }})
    timeout-minutes: 30
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        shardIndex: [1, 2, 3, 4]
        shardTotal: [4]

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install deps
        run: npm ci

      # Since Playwright 1.38, browsers do NOT auto-download — this step is mandatory
      - name: Install Playwright browsers
        run: npx playwright install chromium --with-deps

      - name: Configure test hostnames
        run: |
          echo "127.0.0.1 org-a.app.test" | sudo tee -a /etc/hosts
          echo "127.0.0.1 org-b.app.test" | sudo tee -a /etc/hosts

      - name: Run E2E tests (shard ${{ matrix.shardIndex }}/${{ matrix.shardTotal }})
        run: npx playwright test --shard=${{ matrix.shardIndex }}/${{ matrix.shardTotal }}
        env:
          CI: true
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          TEST_ADMIN_EMAIL: ${{ secrets.TEST_ADMIN_EMAIL }}
          TEST_ADMIN_PASSWORD: ${{ secrets.TEST_ADMIN_PASSWORD }}
          TEST_MEMBER_EMAIL: ${{ secrets.TEST_MEMBER_EMAIL }}
          TEST_MEMBER_PASSWORD: ${{ secrets.TEST_MEMBER_PASSWORD }}
          TEST_OUTSIDER_EMAIL: ${{ secrets.TEST_OUTSIDER_EMAIL }}
          TEST_OUTSIDER_PASSWORD: ${{ secrets.TEST_OUTSIDER_PASSWORD }}

      # Upload even when tests fail — traces are the debug tool
      - name: Upload blob report
        uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: blob-report-${{ matrix.shardIndex }}
          path: blob-report/
          retention-days: 7

  merge-reports:
    name: Merge E2E Reports
    if: ${{ !cancelled() }}
    needs: [e2e]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci

      - name: Download blob reports
        uses: actions/download-artifact@v4
        with:
          path: all-blob-reports
          pattern: blob-report-*
          merge-multiple: true

      - name: Merge reports
        run: npx playwright merge-reports --reporter html ./all-blob-reports

      - name: Upload HTML report
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14
```

**Key CI decisions:**
- `fail-fast: false` — all shards run to completion. You want all traces, not just the first failure.
- `if: ${{ !cancelled() }}` on artifact upload — captures traces even on test failure.
- `retries: process.env.CI ? 2 : 0` in config — retries only on CI. Local retries hide flakes.
- `reporter: 'blob'` on CI — required for `playwright merge-reports` to work across shards.

---

## 10. Visual Stability

Reserve `toHaveScreenshot()` for genuinely visual flows: onboarding wizard layout, chart rendering, specific component states. Not for any screen with dynamic data.

```typescript
test('dashboard layout @visual', async ({ page }) => {
  await page.goto('/dashboard');

  await expect(page).toHaveScreenshot('dashboard.png', {
    mask: [
      page.getByTestId('timestamp'),
      page.getByTestId('user-avatar'),
      page.locator('[data-dynamic]'),
    ],
    maxDiffPixels: 50,
    animations: 'disabled',
  });
});
```

**Update baselines:**

```bash
npx playwright test --update-snapshots
```

Never run `--update-snapshots` in CI automatically. Snapshot updates must be deliberate.

**Platform matters:** Playwright appends `{browser}-{platform}` to snapshot filenames:

```
e2e/dashboard.spec.ts-snapshots/dashboard-chromium-linux.png
```

Snapshots generated on macOS (`-darwin`) will not match CI Linux (`-linux`). Always generate and commit baselines from Linux. Use a `screenshot.css` stylesheet to hide volatile regions instead of masking when you have many of them:

```css
/* e2e/screenshot.css */
[data-testid="realtime-cursor"],
[data-testid="live-users"] { visibility: hidden; }
```

```typescript
await expect(page).toHaveScreenshot({ stylePath: './e2e/screenshot.css' });
```

---

## 11. MFA / AAL2

TOTP codes change every 30 seconds. The strategy: seed the test user's TOTP secret at setup time, then compute the current code live in fixtures using `otplib`.

```bash
npm install otplib
```

**Seeding:** Use the service-role key to insert directly into `auth.mfa_factors` for the test MFA user during database setup. Store the secret as `TEST_MFA_TOTP_SECRET` in CI secrets.

**[VERIFY BEFORE SHIPPING]** Check `auth.mfa_factors` column name for the TOTP secret in your Supabase version — may be `secret` or `totp_secret`.

**[VERIFY BEFORE SHIPPING]** Confirm `import { authenticator } from 'otplib'` works for your installed version. Some versions require `import { authenticator } from '@otplib/preset-default'`.

### MFA fixture

```typescript
import { test as base, type Page } from '@playwright/test';
import { authenticator } from 'otplib';

type MfaFixtures = {
  mfaPage: Page;
  totpCode: () => string;
};

export const test = base.extend<MfaFixtures>({
  totpCode: async ({}, use) => {
    const secret = process.env.TEST_MFA_TOTP_SECRET!;
    // Return a function so the code is computed at call time, not fixture init time
    await use(() => authenticator.generate(secret));
  },

  mfaPage: async ({ browser, totpCode }, use) => {
    // Always start with a clean, unauthenticated context for MFA tests
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();

    await page.goto('/auth/login');
    await page.getByLabel('Email').fill(process.env.TEST_MFA_EMAIL!);
    await page.getByLabel('Password').fill(process.env.TEST_MFA_PASSWORD!);
    await page.getByRole('button', { name: 'Sign in' }).click();

    // App redirects to MFA challenge — now at aal1, step-up required
    await page.waitForURL('**/auth/mfa');
    await page.getByLabel('Authentication code').fill(totpCode());
    await page.getByRole('button', { name: 'Verify' }).click();

    // Now at aal2
    await page.waitForURL('**/dashboard');
    await use(page);
    await ctx.close();
  },
});
```

**Testing expired code rejection:**

```typescript
const expiredCode = authenticator.generate(secret, { timestamp: Date.now() - 60_000 });
```

`otplib` handles ±1 interval clock skew automatically for valid codes.

---

## 12. Email Handling via Inbucket

`supabase start` starts Inbucket on `http://127.0.0.1:54324` (not 8025 or 9000 — those are common wrong citations). The SMTP submission port is `54325`.

Run `supabase status` to confirm the exact ports on your machine.

**Inbucket REST API:**

```
GET http://127.0.0.1:54324/api/v1/mailbox/{email}           — list messages
GET http://127.0.0.1:54324/api/v1/mailbox/{email}/{id}      — get message (includes HTML body)
DELETE http://127.0.0.1:54324/api/v1/mailbox/{email}/{id}   — delete message
```

**[VERIFY BEFORE SHIPPING]** Run `curl http://127.0.0.1:54324/api/v1/mailbox/test@example.com` locally to confirm the REST path. The Inbucket API has changed across versions.

**URL rewriting for subdomain tests:** Supabase local dev generates email links pointing to `localhost`, not your test subdomain. Before navigating to an email link in a subdomain-scoped context, rewrite it:

```typescript
const localizedUrl = inviteUrl.replace('localhost:3000', 'org-a.app.test:3000');
```

---

## 13. Worked Example: Admin Invites Member

Complete flow: admin sends invite → member receives email in Inbucket → member accepts → lands on dashboard → admin sees member in list.

```typescript
// e2e/invite-flow.spec.ts
import { test, expect } from './fixtures';

const INBUCKET_URL = process.env.INBUCKET_URL ?? 'http://127.0.0.1:54324';
const INVITE_EMAIL = 'new-member@example.com';

async function waitForInviteEmail(email: string): Promise<string> {
  let inviteUrl: string | null = null;

  await expect.poll(
    async () => {
      const resp = await fetch(
        `${INBUCKET_URL}/api/v1/mailbox/${encodeURIComponent(email)}`
      );
      if (!resp.ok) return 0;
      const messages: Array<{ id: string }> = await resp.json();
      if (messages.length === 0) return 0;

      const msgResp = await fetch(
        `${INBUCKET_URL}/api/v1/mailbox/${encodeURIComponent(email)}/${messages[0].id}`
      );
      const msg = await msgResp.json();

      // [VERIFY BEFORE SHIPPING] Validate this regex against your actual Supabase invite email template
      const match = msg.body.html.match(/href="(https?:\/\/[^"]*invite[^"]*)"/);
      if (match) inviteUrl = match[1];

      return messages.length;
    },
    { timeout: 15_000, intervals: [1000, 2000, 3000] }
  ).toBeGreaterThan(0);

  if (!inviteUrl) throw new Error('Could not extract invite URL from email body');
  return inviteUrl;
}

test.describe('Member invite flow', () => {
  test('admin invites member, member accepts and reaches dashboard', async ({
    adminPage,
    browser,
  }) => {
    // Step 1: Admin sends invite
    await adminPage.goto('http://org-a.app.test:3000/dashboard/members');
    await adminPage.getByRole('button', { name: 'Invite member' }).click();

    const modal = adminPage.getByRole('dialog', { name: 'Invite member' });
    await modal.waitFor({ state: 'visible' });

    await modal.getByLabel('Email address').fill(INVITE_EMAIL);
    await modal.getByRole('combobox', { name: 'Role' }).selectOption('member');

    const responsePromise = adminPage.waitForResponse(
      resp => resp.url().includes('/api/invites') && resp.status() === 201
    );
    await modal.getByRole('button', { name: 'Send invite' }).click();
    await responsePromise;

    await expect(adminPage.getByText(`Invite sent to ${INVITE_EMAIL}`)).toBeVisible();

    // Step 2: Poll Inbucket for the invite email
    const inviteUrl = await waitForInviteEmail(INVITE_EMAIL);

    // Step 3: Member opens invite in a fresh, unauthenticated context
    const memberCtx = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    const memberPage = await memberCtx.newPage();

    // Rewrite localhost URL to subdomain — Supabase local generates localhost links
    const localizedUrl = inviteUrl.replace('localhost:3000', 'org-a.app.test:3000');
    await memberPage.goto(localizedUrl);

    // Step 4: Accept invite
    await expect(memberPage.getByRole('heading', { name: /join|accept/i })).toBeVisible();
    await memberPage.getByRole('button', { name: /accept|join/i }).click();

    // Step 5: Member reaches dashboard
    await memberPage.waitForURL('**/dashboard');
    await expect(memberPage.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    // Step 6: Verify member appears in admin's list
    await adminPage.reload();
    await expect(adminPage.getByText(INVITE_EMAIL)).toBeVisible();

    await memberCtx.close();
  });
});
```

---

## 14. Realtime in E2E

Tests that verify realtime behavior (Supabase Realtime WebSocket subscriptions, Presence, Broadcast) require two independent browser contexts — each context has its own WebSocket connection. See **TEST_KB_6** for full coverage of Realtime E2E patterns.

---

## 15. Flake Hygiene

### Common flake sources

| Source | Symptom | Fix |
|--------|---------|-----|
| Animations | Assertions fire mid-transition | `animations: 'disabled'` in config; or CSS `transition: none` via `stylePath` |
| Network timing | Response arrives after assertion | Use `page.waitForResponse()` before asserting dependent UI |
| `next dev` cold compilation | First test fails, rest pass | Increase `webServer.timeout`; add warmup navigation in setup project |
| Shared seed user across workers | Passes in isolation, fails in parallel | Worker-scoped fixtures with per-worker user accounts |
| Auth token expiry | Long suites fail late with login redirects | Extend JWT expiry for test users; or re-run setup if TTL < suite duration |
| Realtime subscription not yet active | Realtime assertion fails intermittently | Wait for subscription confirmation signal; use `expect.poll` on subscription state |
| Retry with mutated state | Retry passes on stale pre-existing data | Use `freshOrg` per test; tear down on every attempt via `afterEach` |

### Anti-flake patterns

```typescript
// Annotate slow tests — triples the timeout
test('complex multi-step flow @slow', async ({ page }) => {
  test.slow();
  // ...
});

// Skip with a ticket, never silently
test.skip('known flaky realtime test', async ({ page }) => {
  // Filed: https://github.com/org/repo/issues/123
});
```

**Retries mask bugs.** A test that only passes on retry 2 is a flaky test, not a reliable test. Use `retries` as a CI stability buffer while you investigate root cause, not as a permanent fix.

---

## Always / Never

### Always

- Use `expect(locator).toBeVisible()` and web-first assertions — they auto-wait
- Use the `setup` project with `dependencies` for auth state — never `globalSetup`
- Add `playwright/.auth` to `.gitignore` — these files contain live session cookies
- Set `retries: process.env.CI ? 2 : 0` — retry only in CI
- Set `trace: 'retain-on-failure'` — traces are the primary debug tool when tests fail in CI
- Capture `storageState` from the same subdomain you'll use in tests
- Use `page.waitForResponse()` when you need to confirm a server-side mutation before asserting UI
- Mock external services (`stripe.com`, analytics) with `page.route()` — never let tests call real third-party APIs
- Generate and commit visual snapshot baselines from Linux to match CI
- Run `npx playwright install` explicitly in CI — browsers do not auto-download since v1.38

### Never

- `page.waitForTimeout(N)` for app state — always a race condition
- Mock Supabase in E2E tests — the real database is the point
- Share a seed user across parallel workers — workers stomp each other
- Skip a flaky test without filing a bug ticket
- Commit `playwright/.auth/*.json` — contains raw session tokens
- Run `--update-snapshots` in CI automatically — snapshot changes must be deliberate
- Assert on volatile regions (timestamps, IDs, avatar initials) — mask or hide them

---

## Gotchas

**1. `storageState` captured on wrong origin breaks subdomain tests.**
Supabase Auth cookies are scoped to the exact hostname. A `storageState` captured on `localhost:3000` will not send cookies to `org-a.app.test:3000`. The browser sees a different origin. Always capture `storageState` from the same subdomain URL you'll navigate to in tests. This is why the setup file uses `http://org-a.app.test:3000/auth/login`, not `http://localhost:3000/auth/login`.

**2. `next dev` cold compilation is not blocked by `webServer.url` polling.**
`webServer` only waits for the server to accept a connection (any 2xx/3xx/4xx). It does NOT wait for Next.js to compile the first page. Tests that hit a cold route can timeout during initial compilation. Mitigate: add a warmup navigation in the setup project to pre-compile critical routes before tests start. Set `webServer.timeout: 120_000` — the default 60 s is not enough for larger App Router projects.

**3. Parallel workers stomping a shared seed account.**
If the same `admin@test.com` account is used across all parallel workers, any test that modifies user state (email, preferences, role assignment) can break other workers non-deterministically. Use worker-scoped fixtures to create a distinct user account per worker. Include `workerInfo.workerIndex` in the username to avoid cross-worker collisions.

**4. Inbucket port and URL rewriting.**
`supabase start` puts Inbucket on `http://127.0.0.1:54324`, not 8025 or 9000 (commonly cited but wrong for the Supabase CLI bundle). Verify with `supabase status`. Beyond the port, Supabase local dev generates email links pointing to `localhost:3000`. If your test navigates that link in a subdomain-scoped browser context, the cookie domain won't match and auth will fail. Always rewrite `localhost:3000` → `org-a.app.test:3000` before navigating to email links in subdomain tests.

**5. Retry with pre-existing mutated state produces false positives.**
With `retries: 2`, if a test creates a database record and then the assertion fails, the retry runs with that record already in the database. The retry may pass because the pre-existing record satisfies the assertion — masking the actual bug. Always use per-test isolated data via `freshOrg` or equivalent, and ensure teardown runs after each attempt (not just after final pass), or use a transaction rollback strategy.

**6. `storageState` expiry mid-suite.**
Supabase access tokens expire after 1 hour by default. If your full E2E suite takes longer than 1 hour, sessions captured at setup time will expire before later tests run. Symptoms: tests that hit authenticated pages start landing on the login page mid-suite. Fix: extend JWT expiry in Supabase project settings for the test environment, or split the suite to complete within the token TTL.

**7. Visual snapshot platform mismatch.**
`toHaveScreenshot()` auto-names baselines with the OS: `dashboard-chromium-linux.png` vs `dashboard-chromium-darwin.png`. Baselines committed from macOS will never match CI Linux snapshots and vice versa. Generate all baselines from the same Linux environment used in CI. A practical approach: run `--update-snapshots` in a Docker container that matches the CI runner image, then commit those files.

**8. Worker index collisions across shards.**
`workerInfo.workerIndex` resets to 0 on each shard machine. If you use `workerIndex` alone as a seed identifier, shard 1's worker 0 and shard 2's worker 0 will both generate `worker-0-*` and collide in the database. Include the shard index or a timestamp in the worker-scoped seed name.

---

## Environment Variables Reference

```bash
# Test user credentials — stored as CI secrets
TEST_ADMIN_EMAIL=
TEST_ADMIN_PASSWORD=
TEST_MEMBER_EMAIL=
TEST_MEMBER_PASSWORD=
TEST_OUTSIDER_EMAIL=
TEST_OUTSIDER_PASSWORD=
TEST_MFA_EMAIL=
TEST_MFA_PASSWORD=
TEST_MFA_TOTP_SECRET=    # seeded into auth.mfa_factors for the MFA test user

# Supabase — service-role key required for fixture seeding/teardown
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=

# Inbucket — default port from supabase start
INBUCKET_URL=http://127.0.0.1:54324

# Override base URL to test against a Vercel preview deployment
PLAYWRIGHT_BASE_URL=
```

---

## Cross-references

- **TEST_KB_6** — Realtime E2E: two-context WebSocket tests, Presence, Broadcast
- **AUTH_KB_3** — AAL2 / step-up auth: what triggers the MFA challenge page this KB tests
- **AUTH_KB_4** — Session lifecycle: how `@supabase/ssr` manages the cookie `storageState` captures
- **SB_KB_8** — Subdomain routing: the middleware this KB's host-file setup exercises in tests
