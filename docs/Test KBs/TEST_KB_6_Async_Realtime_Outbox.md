# TEST_KB_6 — Testing Async, Realtime, and Scheduled Work

**Stack-locked: Supabase Postgres + Realtime, Edge Functions (Deno), pg_cron, Vercel Cron, Vitest, Trigger.dev v3, Inngest.**

---

## Scope

This KB covers how to verify the async and realtime layer: outbox correctness, Realtime channel behavior, scheduled job functions, Edge Functions, and durable execution tasks. It does not duplicate the outbox schema or worker implementation (see JOB_KB_1) or basic supabase-js query patterns (see TEST_KB_3). The reader is assumed to know how the outbox and worker operate — this KB tests them.

---

## What this KB does NOT cover

- How to build the outbox or worker — that is JOB_KB_1.
- Basic supabase-js CRUD test patterns — that is TEST_KB_3.
- The Realtime index file (TEST_KB_0) or the Playwright e2e foundation (TEST_KB_5).
- Auth session setup for test users — see AUTH_KB tests or TEST_KB_3.
- How to write the pg_cron schedule or Vercel Cron `vercel.json` — see JOB_KB_2.

---

## 1. Outbox Idempotency Replay Test — the cornerstone

**Contract**: run worker → side-effect fires exactly once. Run worker again on the same done row → side-effect does NOT fire again. The DB-level claim (`status = 'done'`) is what prevents replay; Resend's `Idempotency-Key` is the second line of defence if the worker crashes between the HTTP call and the DB ack.

Mock Resend with a local HTTP server that records calls. The worker accepts an injectable `resendBaseUrl` — no global fetch patching required.

```typescript
// tests/outbox-idempotency.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createServer } from 'http';

// --- Local Resend mock ---------------------------------------------------
interface ResendCall { idempotencyKey: string | undefined; body: any; }
const calls: ResendCall[] = [];

const mockServer = createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => (raw += c));
  req.on('end', () => {
    calls.push({
      idempotencyKey: req.headers['idempotency-key'] as string | undefined,
      body: JSON.parse(raw || '{}'),
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'mock-id' }));
  });
});

const MOCK_PORT = 19876;
const MOCK_URL = `http://localhost:${MOCK_PORT}`;

beforeAll(() => new Promise<void>((r) => mockServer.listen(MOCK_PORT, r)));
afterAll(() => new Promise<void>((r) => mockServer.close(() => r())));

// --- Supabase client (service role — bypasses RLS) -----------------------
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// --- Worker under test ---------------------------------------------------
// Production worker extracted to a module; accepts resendBaseUrl for tests.
async function sendWelcomeWorker(resendBaseUrl = 'https://api.resend.com') {
  const { data: row, error } = await supabase.rpc('claim_outbox_row', {
    p_event_type: 'welcome_email',
  });
  if (!row || error) return null;

  const idempotencyKey = `welcome-email/${row.id}`;
  const emailRes = await fetch(`${resendBaseUrl}/emails`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer test-key`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      from: 'noreply@example.com',
      to: row.payload.email,
      subject: 'Welcome!',
      html: `<p>Hi ${row.payload.name}</p>`,
    }),
  });

  if (!emailRes.ok) {
    await supabase.from('outbox')
      .update({ status: 'pending', retry_count: (row.retry_count ?? 0) + 1, error: await emailRes.text() })
      .eq('id', row.id);
    return null;
  }

  await supabase.from('outbox')
    .update({ status: 'done', processed_at: new Date().toISOString() })
    .eq('id', row.id);

  return row.id;
}

// --- Tests ---------------------------------------------------------------
describe('Outbox + Resend idempotency', () => {
  let seededId: string;

  beforeEach(async () => {
    calls.length = 0;
    const { data } = await supabase.from('outbox').insert({
      event_type: 'welcome_email',
      payload: { email: 'test@example.com', name: 'Test User' },
    }).select().single();
    seededId = data!.id;
  });

  afterEach(async () => {
    await supabase.from('outbox').delete().eq('id', seededId);
  });

  it('processes row and hits Resend exactly once', async () => {
    await sendWelcomeWorker(MOCK_URL);

    expect(calls).toHaveLength(1);
    expect(calls[0].idempotencyKey).toBe(`welcome-email/${seededId}`);
    expect(calls[0].body.to).toBe('test@example.com');

    const { data: row } = await supabase.from('outbox')
      .select('status, processed_at').eq('id', seededId).single();
    expect(row!.status).toBe('done');
    expect(row!.processed_at).not.toBeNull();
  });

  it('re-running worker on a done row does NOT hit Resend again', async () => {
    await sendWelcomeWorker(MOCK_URL); // first run: claims and processes
    calls.length = 0;

    await sendWelcomeWorker(MOCK_URL); // second run: no pending row to claim
    expect(calls).toHaveLength(0);    // Resend was NOT called
  });

  it('uses the same idempotency-key on retry after crash', async () => {
    // Simulate: Resend call succeeded but DB ack never happened (worker killed)
    const idempotencyKey = `welcome-email/${seededId}`;
    await fetch(`${MOCK_URL}/emails`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ to: 'test@example.com' }),
    });
    calls.length = 0;

    // Worker picks up the still-pending row — key is deterministic (row ID never changes)
    await sendWelcomeWorker(MOCK_URL);
    expect(calls[0].idempotencyKey).toBe(idempotencyKey);
    // In production: Resend returns its cached response — zero additional delivery.
  });
});
```

**Key design choices:**
- `resendBaseUrl` injection avoids global fetch patching. No MSW dependency.
- Idempotency key is `<event-type>/<row-id>` — deterministic across retries.
- Test 2 verifies DB-level claim prevents replay, independent of Resend behaviour.
- Test 3 documents the crash-recovery safety net: same key sent, Resend deduplicates.

---

## 2. Outbox Claim Race Test

Two approaches: pgTAP (needs `dblink` to simulate a second session) or two `pg` pool connections in Vitest. The Vitest approach is more portable and tests exactly what the application code does.

```typescript
// tests/outbox-race.test.ts
import { Pool } from 'pg';
import { it, expect, afterEach } from 'vitest';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function claimRow(client: any): Promise<string | null> {
  const { rows } = await client.query(`
    SELECT id FROM outbox
    WHERE  status = 'pending'
    FOR    UPDATE SKIP LOCKED
    LIMIT  1
  `);
  return rows[0]?.id ?? null;
}

afterEach(async () => {
  await pool.query(`DELETE FROM outbox WHERE event_type = 'race_test'`);
});

it('SKIP LOCKED: two concurrent workers claim different rows', async () => {
  await pool.query(`
    INSERT INTO outbox (event_type, payload)
    VALUES ('race_test', '{}'), ('race_test', '{}')
  `);

  const c1 = await pool.connect();
  const c2 = await pool.connect();
  await c1.query('BEGIN');
  await c2.query('BEGIN');

  const id1 = await claimRow(c1);
  const id2 = await claimRow(c2);

  expect(id1).not.toBeNull();
  expect(id2).not.toBeNull();
  expect(id1).not.toBe(id2); // each worker got a different row

  await c1.query('ROLLBACK');
  await c2.query('ROLLBACK');
  c1.release();
  c2.release();
});

it('SKIP LOCKED: second worker skips when only one row exists', async () => {
  await pool.query(`INSERT INTO outbox (event_type, payload) VALUES ('race_test', '{}')`);

  const c1 = await pool.connect();
  const c2 = await pool.connect();
  await c1.query('BEGIN');
  await c2.query('BEGIN');

  const id1 = await claimRow(c1); // claims the only row
  const id2 = await claimRow(c2); // SKIP LOCKED returns empty — NOT an error

  expect(id1).not.toBeNull();
  expect(id2).toBeNull(); // empty result, not an exception

  await c1.query('ROLLBACK');
  await c2.query('ROLLBACK');
  c1.release();
  c2.release();
});
```

**Gotcha**: `SKIP LOCKED` returns an empty result set when all candidates are locked. It does not throw. Application code must treat `null` / zero rows as "no work available", not as an error condition.

---

## 3. Outbox Dead-Letter Test

Exhaust the retry budget; assert the row moves to `status = 'failed'` (or `'dead'` per your schema) with the error text preserved.

```typescript
// tests/outbox-dead-letter.test.ts
import { it, expect, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function processWithRetries(rowId: string, maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    await supabase.from('outbox').update({ status: 'claimed' }).eq('id', rowId);
    const nextCount = attempt + 1;
    if (nextCount >= maxRetries) {
      await supabase.from('outbox').update({
        status: 'failed',
        error: 'Simulated side-effect failure',
        retry_count: nextCount,
      }).eq('id', rowId);
      return;
    }
    await supabase.from('outbox').update({
      status: 'pending',
      retry_count: nextCount,
      claim_expires: null,
    }).eq('id', rowId);
  }
}

it('row reaches failed status after 5 retries with error captured', async () => {
  const { data: row } = await supabase.from('outbox')
    .insert({ event_type: 'dlq_test', payload: {} })
    .select().single();

  await processWithRetries(row!.id, 5);

  const { data: dead } = await supabase.from('outbox')
    .select('status, retry_count, error')
    .eq('id', row!.id)
    .single();

  expect(dead!.status).toBe('failed');
  expect(dead!.retry_count).toBe(5);
  expect(dead!.error).toBe('Simulated side-effect failure');

  await supabase.from('outbox').delete().eq('id', row!.id);
});
```

---

## 4. Outbox Lease Expiry Test

Set `claim_expires` to a timestamp in the past to simulate a dead worker. Assert another worker can reclaim the row.

```typescript
// tests/outbox-lease-expiry.test.ts
import { it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

it('expired lease allows another worker to reclaim the row', async () => {
  const { data: row } = await supabase.from('outbox')
    .insert({ event_type: 'lease_test', payload: {} })
    .select().single();

  // Simulate worker 1 crash: claimed but lease already expired
  await supabase.from('outbox').update({
    status: 'claimed',
    claim_expires: new Date(Date.now() - 5_000).toISOString(), // 5s in the past
  }).eq('id', row!.id);

  // Worker 2 runs the claim query — the expired row must appear
  const { data: claimed } = await supabase.rpc('claim_outbox_row');

  expect(claimed).not.toBeNull();
  expect(claimed.id).toBe(row!.id);
  expect(new Date(claimed.claim_expires).getTime()).toBeGreaterThan(Date.now());

  await supabase.from('outbox').delete().eq('id', row!.id);
});
```

The claim SQL in `claim_outbox_row` must include `(claim_expires IS NULL OR claim_expires < now())` to enable recovery. If this test fails, that condition is missing from the RPC.

No fake timers needed here — write a past timestamp directly. Do not use `vi.useFakeTimers()` in lease expiry tests that also make real DB calls; manipulate the `claim_expires` column directly instead.

---

## 5. Realtime Postgres Changes Test

### The SUBSCRIBED-vs-ready race

`subscribe()` calls your callback with `'SUBSCRIBED'` based on local state tracking, but the Phoenix channel join confirmation from the server arrives 100–3000ms later. A write triggered immediately after `SUBSCRIBED` will frequently not be observed in tests. Always add a 150ms stabilization pause after the status fires.

```typescript
// Reusable helper — put in tests/helpers/realtime.ts
import { RealtimeChannel } from '@supabase/supabase-js';

export function subscribeAndWait(channel: RealtimeChannel): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Subscription timeout after 10s')),
      10_000,
    );
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timeout);
        // Brief pause: server-side channel registration lags the local state update
        setTimeout(resolve, 150);
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timeout);
        reject(new Error(`Channel ${status}`));
      }
    });
  });
}
```

### Two-client harness

```typescript
// tests/realtime-postgres-changes.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { subscribeAndWait } from './helpers/realtime';

// writer uses service role so RLS doesn't block the insert
const writer = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
// reader uses anon key — tests that RLS allows the read-side through
const reader = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

const channels: RealtimeChannel[] = [];

afterEach(async () => {
  // Always drain channels — leaked subscriptions consume project quota and cause
  // CHANNEL_ERROR in later tests once the per-project channel limit is hit
  for (const ch of channels) await reader.removeChannel(ch);
  channels.length = 0;
});

describe('Realtime Postgres Changes', () => {
  it('reader receives INSERT event when writer inserts', async () => {
    const received: any[] = [];

    const channel = reader
      .channel(`test-insert-${crypto.randomUUID()}`) // unique name prevents cross-test pollution
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => received.push(payload));
    channels.push(channel);
    await subscribeAndWait(channel);

    const { data: inserted } = await writer
      .from('messages')
      .insert({ content: 'hello realtime', room_id: 'test-room' })
      .select().single();

    // Use expect.poll — real WebSocket, no fake timers
    await expect.poll(() => received.length, { timeout: 8_000 }).toBe(1);

    expect(received[0].eventType).toBe('INSERT');
    expect(received[0].new.id).toBe(inserted!.id);
    expect(received[0].new.content).toBe('hello realtime');

    await writer.from('messages').delete().eq('id', inserted!.id);
  });

  it('reader receives UPDATE with old record (requires REPLICA IDENTITY FULL)', async () => {
    const received: any[] = [];

    const channel = reader
      .channel(`test-update-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => received.push(payload));
    channels.push(channel);
    await subscribeAndWait(channel);

    const { data: msg } = await writer.from('messages')
      .insert({ content: 'original' }).select().single();
    await writer.from('messages').update({ content: 'updated' }).eq('id', msg!.id);

    await expect.poll(() => received.length, { timeout: 8_000 }).toBe(1);
    expect(received[0].new.content).toBe('updated');
    expect(received[0].old.content).toBe('original'); // only works if REPLICA IDENTITY FULL

    await writer.from('messages').delete().eq('id', msg!.id);
  });
});
```

**Required DB setup:**
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER TABLE messages REPLICA IDENTITY FULL; -- needed for old record on UPDATE/DELETE
```

**Payload shape** (for reference in assertions):
```typescript
// eventType: 'INSERT' | 'UPDATE' | 'DELETE'
// payload.new: { id, column1, ... }   — INSERT / UPDATE
// payload.old: { id, ... }            — UPDATE / DELETE (requires REPLICA IDENTITY FULL)
// payload.schema, payload.table, payload.commit_timestamp
```

---

## 6. Realtime Broadcast and Presence Tests

Use unique channel names per test (`crypto.randomUUID()` suffix). Always drain channels in `afterEach`.

```typescript
// tests/realtime-broadcast.test.ts
import { it, expect, afterEach } from 'vitest';
import { createClient, RealtimeChannel } from '@supabase/supabase-js';

const client1 = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
const client2 = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);

const channels: RealtimeChannel[] = [];

afterEach(async () => {
  for (const ch of channels) {
    await client1.removeChannel(ch).catch(() => {});
    await client2.removeChannel(ch).catch(() => {});
  }
  channels.length = 0;
});

it('client2 receives broadcast from client1', async () => {
  const CHANNEL = `test-bc-${crypto.randomUUID()}`;
  const received: any[] = [];

  // Subscribe receiver first, then sender
  const ch2 = client2.channel(CHANNEL).on('broadcast', { event: 'ping' },
    (payload) => received.push(payload));
  channels.push(ch2);
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('sub timeout')), 10_000);
    ch2.subscribe((s) => {
      if (s === 'SUBSCRIBED') { clearTimeout(t); setTimeout(resolve, 150); }
    });
  });

  const ch1 = client1.channel(CHANNEL, { config: { broadcast: { self: false } } });
  channels.push(ch1);
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('sender timeout')), 10_000);
    ch1.subscribe((s) => {
      if (s === 'SUBSCRIBED') { clearTimeout(t); setTimeout(resolve, 150); }
    });
  });

  await ch1.send({ type: 'broadcast', event: 'ping', payload: { msg: 'hello' } });

  await expect.poll(() => received.length, { timeout: 8_000 }).toBe(1);
  expect(received[0].payload.msg).toBe('hello');
});

it('presence: client2 sees client1 join and leave', async () => {
  const CHANNEL = `test-pr-${crypto.randomUUID()}`;
  const joinEvents: any[] = [];

  const ch2 = client2.channel(CHANNEL)
    .on('presence', { event: 'join' }, ({ newPresences }) => joinEvents.push(newPresences));
  channels.push(ch2);
  await new Promise<void>((r) => { ch2.subscribe((s) => { if (s === 'SUBSCRIBED') setTimeout(r, 150); }); });

  const ch1 = client1.channel(CHANNEL);
  channels.push(ch1);
  await new Promise<void>((r) => {
    ch1.subscribe(async (s) => {
      if (s === 'SUBSCRIBED') {
        await ch1.track({ userId: 'user-1', online: true });
        setTimeout(r, 150);
      }
    });
  });

  await expect.poll(
    () => joinEvents.flat().some((p: any) => p.userId === 'user-1'),
    { timeout: 8_000 },
  ).toBe(true);

  await client1.removeChannel(ch1);
  await expect.poll(() => Object.keys(ch2.presenceState()).length, { timeout: 5_000 }).toBe(0);
});
```

**Presence state shape**: `{ [presenceKey: string]: [{ userId, ... }] }` — each key maps to an array (a client can track multiple presences).

---

## 7. Realtime in Playwright

For e2e coverage, see TEST_KB_5 for the full Playwright setup. Use `browser.newContext()` for each user — each context has isolated cookie storage, meaning separate Supabase sessions.

```typescript
// e2e/realtime.spec.ts — brief two-context example
import { test, expect } from '@playwright/test';

test('user B sees message from user A in real time', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const [pageA, pageB] = await Promise.all([ctxA.newPage(), ctxB.newPage()]);

  await pageA.goto('http://localhost:3000/rooms/test-room');
  await pageB.goto('http://localhost:3000/rooms/test-room');

  // Wait for the app to confirm subscription (app-specific indicator)
  await pageB.waitForSelector('[data-testid="connected"]');

  await pageA.fill('[data-testid="message-input"]', 'Hello from A');
  await pageA.click('[data-testid="send-button"]');

  await expect(pageB.locator('[data-testid="message-list"]')).toContainText('Hello from A');

  await Promise.all([ctxA.close(), ctxB.close()]);
});
```

Never use `vi.useFakeTimers()` in Playwright tests — they run in a browser process, not in the Vitest worker.

---

## 8. pg_cron Tests

Never wait for the schedule. Call the underlying function the cron job invokes and assert the side-effect.

```typescript
// tests/cron-jobs.test.ts
import { it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

it('cleanup_expired_sessions removes sessions past their expiry', async () => {
  const pastTime = new Date(Date.now() - 86_400_000).toISOString();
  await supabase.from('sessions').insert({ user_id: 'test-user', expires_at: pastTime });

  // Call exactly what pg_cron calls — do not wait for the schedule
  await supabase.rpc('cleanup_expired_sessions');

  const { data } = await supabase.from('sessions').select('id').eq('user_id', 'test-user');
  expect(data).toHaveLength(0);
});
```

**pg_cron scheduling reference** (for test setup/teardown of ephemeral jobs):

```sql
-- Enable a job for an integration test environment
SELECT cron.schedule('test-job', '* * * * *', 'SELECT process_pending_jobs()');

-- Disable after test
SELECT cron.unschedule('test-job');

-- Assert the last run of a named job succeeded (requires actual execution)
SELECT ok(
  (
    SELECT status = 'succeeded'
    FROM   cron.job_run_details d
    JOIN   cron.job j ON j.jobid = d.jobid
    WHERE  j.jobname = 'nightly-cleanup'
    ORDER  BY d.start_time DESC
    LIMIT  1
  ),
  'Last nightly-cleanup run succeeded'
);
```

**Sub-minute syntax** `[VERIFY BEFORE SHIPPING]`: `cron.schedule('job', '30 seconds', ...)` uses interval string syntax — distinct from standard 5-field cron. Verify this works on your Supabase Postgres version. The safe fallback is standard 5-field cron (`*/1 * * * *` for every-minute).

`cron.job_run_details` is not automatically pruned. Schedule a weekly cleanup from day one or this table will bloat. `[VERIFY BEFORE SHIPPING]` — confirm `SELECT` access to `cron.job_run_details` is available under your Supabase plan (service role is typically required).

---

## 9. Vercel Cron Tests

Vercel sends `GET /api/cron/<job>` with `Authorization: Bearer <CRON_SECRET>`. Test the endpoint directly — do not attempt to test that Vercel calls it on schedule.

```typescript
// tests/cron-endpoint.test.ts
import { it, expect } from 'vitest';

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET ?? 'test-secret';

it('returns 401 without Authorization header', async () => {
  const res = await fetch(`${BASE_URL}/api/cron/nightly-cleanup`);
  expect(res.status).toBe(401);
});

it('returns 401 with wrong secret', async () => {
  const res = await fetch(`${BASE_URL}/api/cron/nightly-cleanup`, {
    headers: { Authorization: 'Bearer wrong-secret' },
  });
  expect(res.status).toBe(401);
});

it('returns 200 and performs cleanup with valid secret', async () => {
  // Seed stale data, then call the endpoint
  const res = await fetch(`${BASE_URL}/api/cron/nightly-cleanup`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  // Assert DB side-effect here
});
```

**Endpoint pattern (Next.js App Router):**
```typescript
// app/api/cron/nightly-cleanup/route.ts
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  await doCleanup(); // must be idempotent
  return Response.json({ success: true });
}
```

**Critical properties of Vercel Cron to account for in tests:**
- No retry on failure — a 500 response is lost. Design the endpoint to pick up missed work on its next run via a `pending` state table.
- Can fire more than once per scheduled run — endpoint must be idempotent.
- Fires only on production deployments. To test locally: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/<job>`.

---

## 10. Edge Function Tests

**Runtime limits (verified 2026-05-04):** 2s CPU, 150s wall-clock (free) / 400s wall-clock (paid), 256 MB memory.

Run `supabase start && supabase functions serve`. Functions are available at `http://localhost:54321/functions/v1/<name>`.

```typescript
// tests/edge-function.test.ts
import { it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const FUNCTION_BASE = 'http://localhost:54321/functions/v1';
const ANON_KEY = process.env.SUPABASE_ANON_KEY!;

it('send-welcome edge function records outbox row as done', async () => {
  // RESEND_BASE_URL must be set to the mock server URL in supabase/functions/.env
  const res = await fetch(`${FUNCTION_BASE}/send-welcome`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ userId: 'test-user-123' }),
  });

  expect(res.status).toBe(200);

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Use expect.poll — local function serve can have cold-start lag (1–2s on first invocation)
  await expect.poll(async () => {
    const { data } = await supabase.from('outbox')
      .select('status')
      .eq('payload->>userId', 'test-user-123')
      .single();
    return data?.status;
  }, { timeout: 10_000 }).toBe('done');
});
```

**Mocking external APIs in Edge Functions**: set `RESEND_BASE_URL=http://host.docker.internal:19876` (or the local mock address) in `supabase/functions/.env` during tests. The function reads this variable when constructing its fetch URL. The mock from section 1 intercepts the call.

`[VERIFY BEFORE SHIPPING]` — confirm the current CLI syntax with `supabase functions invoke --help`. Direct HTTP POST to `http://localhost:54321/functions/v1/<name>` with `Authorization: Bearer <ANON_KEY>` is the reliable fallback.

---

## 11. Trigger.dev v3 Testing

`[VERIFY BEFORE SHIPPING]` — Trigger.dev v2 reached EOL January 2025. The `@trigger.dev/testing` package is at v3.3.12+ on npm, but the public documentation primarily describes dashboard-based testing. The package exports `createJobTester` and `toHaveSucceeded`, but the v3 API surface has significant churn relative to v2 examples that appear in search results. Verify import paths against the current package README at npmjs.com/package/@trigger.dev/testing before shipping.

```typescript
// tests/trigger-task.test.ts
// [VERIFY BEFORE SHIPPING] — confirm these exports exist in your installed version
import { describe, it, expect } from 'vitest';
import { vi } from 'vitest';
import { toHaveSucceeded, createJobTester } from '@trigger.dev/testing'; // [VERIFY]
import { welcomeEmailTask } from '../trigger/welcome-email';

expect.extend({ toHaveSucceeded });
const jobTester = createJobTester(vi); // [VERIFY]

describe('welcomeEmailTask', () => {
  it('completes successfully with valid payload', async () => {
    const result = await jobTester.invoke(welcomeEmailTask, {
      userId: 'test-user',
      email: 'test@example.com',
    });
    expect(result).toHaveSucceeded(); // [VERIFY]
  });
});
```

The confirmed primary testing path is the **Trigger.dev dashboard "Test" tab** — trigger tasks in any environment with a custom payload and inspect run results there. Unit tests via `@trigger.dev/testing` are supplemental.

---

## 12. Inngest Testing

**Package**: `npm install -D @inngest/test`

Minimum `inngest` peer version depends on which Inngest SDK major you target: **`inngest@>=3.22.12`** for the v3 SDK, **`inngest@>=4.0.0`** for the v4 SDK. The two minimums are not in conflict — they describe different `@inngest/test` major versions. Check `@inngest/test`'s `package.json` `peerDependencies` to confirm which line your project is on.

```typescript
// tests/inngest-function.test.ts
import { it, expect } from 'vitest';
import { InngestTestEngine } from '@inngest/test';
import { userOnboarding } from '../inngest/functions/onboarding';

const t = new InngestTestEngine({ function: userOnboarding });

it('executes all steps and returns success', async () => {
  const { state, error } = await t.execute({
    events: [{ name: 'app/user.created', data: { userId: 'test-123' } }],
    steps: [
      { id: 'fetch-user', handler: () => ({ id: 'test-123', email: 'a@b.com' }) },
      { id: 'send-welcome-email', handler: () => ({ sent: true }) },
      { id: 'one-day-delay', handler() {} },           // mock sleep — must always be mocked
      { id: 'wait-for-payment', handler() { return { paid: true }; } }, // mock event wait
    ],
  });

  expect(error).toBeUndefined();
  await expect(state['send-welcome-email']).resolves.toEqual({ sent: true });
});

it('runs only until a specific step (executeStep)', async () => {
  const { result } = await t.executeStep('fetch-user', {
    events: [{ name: 'app/user.created', data: { userId: 'test-123' } }],
  });
  // Inspect result for the single step
  expect(result).toBeDefined();
});
```

**Critical limitation**: `@inngest/test` does not simulate retries. From Inngest docs: "any step or function that fails once will fail permanently" inside the test engine. To test retry semantics, call `t.execute()` with pre-populated `steps` entries that simulate the function being called with already-completed step state — this approximates what happens on a real retry.

`step.sleep`, `step.sleepUntil`, and `step.waitForEvent` must always be mocked in `steps`. Unmocked pause steps cause `t.execute()` to hang.

---

## 13. Time Control with `vi.useFakeTimers()`

Fake timers wrap: `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, `Date`. Powered by `@sinonjs/fake-timers`.

```typescript
it('lease considered expired after 60s (time-controlled)', () => {
  vi.useFakeTimers();
  try {
    const lease = new Date(Date.now() + 60_000);
    vi.advanceTimersByTime(60_001);
    expect(Date.now()).toBeGreaterThan(lease.getTime());
  } finally {
    vi.useRealTimers(); // always restore — fake timer state is global in the worker
  }
});

// Async variant for code that awaits inside timers
it('batch flush fires after 500ms debounce', async () => {
  vi.useFakeTimers();
  try {
    const flushed: string[] = [];
    scheduleBatch(() => flushed.push('done'), 500);
    await vi.advanceTimersByTimeAsync(500);
    expect(flushed).toHaveLength(1);
  } finally {
    vi.useRealTimers();
  }
});
```

**Fake timers and `vi.waitFor`**: when `vi.waitFor` is active alongside fake timers, Vitest automatically advances time by the check interval on each poll iteration. This makes polling assertions work correctly when the condition depends on time advancement.

---

## 14. Determinism Techniques

**`expect.poll`** — always use for asynchronous state assertions. Available since Vitest 2. Since Vitest 4, forgetting `await` is a hard failure.

```typescript
await expect.poll(
  () => supabase.from('messages').select('count').single().then((r) => r.data?.count),
  { interval: 200, timeout: 8_000, message: 'Message count did not reach 1' }
).toBe(1);
```

**`vi.waitFor`** — for non-poll assertions where you throw until the condition is met.

```typescript
await vi.waitFor(
  () => {
    if (received.length === 0) throw new Error('not yet');
    return received;
  },
  { timeout: 8_000, interval: 100 },
);
```

**"Drain the queue" pattern** — process all pending outbox rows until idle, then assert aggregate state. Avoids per-row timing assumptions entirely.

```typescript
async function drainOutbox(): Promise<number> {
  let processed = 0;
  let row: any;
  while ((row = await claimNextRow()) !== null) {
    await processRow(row);
    processed++;
  }
  return processed;
}

it('all pending rows are processed', async () => {
  await seedNPendingRows(5);
  const count = await drainOutbox();
  expect(count).toBe(5);
  // Assert all side-effects fired after the drain
});
```

**Promise-based first-event await** — cleaner than polling when you only need to observe the first occurrence.

```typescript
const firstEvent = new Promise<any>((resolve) => {
  channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'foo' },
    (payload) => resolve(payload));
});
await writer.from('foo').insert({ value: 42 });
const payload = await Promise.race([
  firstEvent,
  new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8_000)),
]);
expect(payload.new.value).toBe(42);
```

---

## Vitest Config for Async Test Suites

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Realtime tests require sequential execution — parallel opens too many
    // WebSocket connections and Supabase Realtime channel limits kick in
    maxConcurrency: 1,
    pool: 'threads', // switch to 'forks' only if any test mocks process.nextTick
    testTimeout: 30_000, // real WebSocket round-trips need headroom
    hookTimeout: 30_000,
    globalSetup: './tests/setup/global.ts', // supabase start / stop
    fakeTimers: {
      // Explicitly enumerate what to fake — never use { shouldFake: () => true }
      // Deliberately omit: queueMicrotask, setImmediate — breaks MSW and Supabase WS internals
      toFake: ['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'Date'],
    },
  },
});
```

For suites that mix fake timers (outbox lease expiry) with real WebSocket tests (Realtime), keep them in separate files and call `vi.useFakeTimers()` / `vi.useRealTimers()` at the individual test level wrapped in `try/finally`. Never set fake timers globally in a file that contains Realtime tests.

---

## Always / Never Rules

**Always:**
- Await `SUBSCRIBED` status before triggering writes that Realtime tests will observe.
- Add a 150ms stabilization pause after `SUBSCRIBED` — the server-side registration lags the local status callback by 100–3000ms.
- Remove all Realtime channels in `afterEach` or `afterAll`. Leaks consume project quota and cause `CHANNEL_ERROR` in later tests.
- Use unique channel names per test (`crypto.randomUUID()` suffix).
- Use `expect.poll` or a `Promise`-based approach for Realtime event assertions.
- Use the `claim_outbox_row` RPC, not raw SQL, in TypeScript tests — keeps lease logic in one place.
- Enable `REPLICA IDENTITY FULL` on tables where DELETE or UPDATE tests need `old` record.
- Call the function pg_cron invokes directly in tests — never wait for the schedule.
- Test Vercel Cron endpoints with `Authorization: Bearer <CRON_SECRET>` directly — do not test that Vercel fires the schedule.
- Wrap `vi.useFakeTimers()` calls in `try/finally` and restore in `finally`.
- Mark Trigger.dev API imports `[VERIFY BEFORE SHIPPING]` until confirmed from the installed package README.

**Never:**
- Use `vi.useFakeTimers()` in tests that make real WebSocket connections to Supabase Realtime. Fake timers intercept `setTimeout` globally, stalling heartbeat timers; after 60s of fake-time advancement Realtime disconnects.
- Mock `queueMicrotask` in fake timer configuration — this breaks MSW and Supabase's internal WebSocket machinery.
- Use `setTimeout(realDelay)` for async synchronization in tests. `expect.poll` and `vi.waitFor` are deterministic; fixed delays are not.
- Share a Realtime channel instance between tests.
- Use `'realtime'` as a channel name — it is reserved by Supabase.
- Rely on `@inngest/test` to simulate retries. It does not model them; test retry semantics separately.
- Expose the `service_role` key in test code that could be committed or logged.

---

## Gotchas

1. **Realtime channel cleanup leaks.** Failing to call `supabase.removeChannel(ch)` in `afterEach` leaves WebSocket subscriptions open. Supabase imposes per-project channel limits (100 channels per connection `[VERIFY BEFORE SHIPPING]` — confirm current limits for your plan). In CI with many parallel test files, leaked channels cause `CHANNEL_ERROR` in later tests. Track all channels in an array; drain in `afterEach`.

2. **`SUBSCRIBED` fires before the server is ready.** The supabase-js client emits `SUBSCRIBED` when it receives a local state change, but the server-side Phoenix channel join confirmation arrives 100–3000ms later. Writes triggered immediately after `SUBSCRIBED` routinely go unobserved. Fix: always add a 150ms stabilization pause after the status callback fires.

3. **`vi.useFakeTimers()` stalls real WebSocket heartbeats.** Vitest fake timers wrap the global `setTimeout`/`setInterval`, and Supabase Realtime's Phoenix-based client uses those timers for its heartbeat. With fake timers active, heartbeats stop firing on real time and the connection drops once the server-side keepalive elapses (observed in practice around the 60-second mark; exact timing depends on the Realtime client's heartbeat-interval setting). Fix: do not enable fake timers in the same test file as real Realtime connections. Keep them in separate files.

4. **Trigger.dev v2 → v3 API churn.** `createJobTester`, `toHaveSucceeded`, and the `@trigger.dev/testing` API changed between v2 and v3. v2-era examples are prevalent in search results but the imports no longer match. v2 reached EOL January 2025. Always verify import paths against the current npm package README — not the Trigger.dev docs site, which primarily covers dashboard testing.

5. **`@inngest/test` does not model retries at all.** From the primary Inngest documentation: any step that fails once fails permanently inside the test engine. Retry behaviour must be tested in production-mirrored environments or simulated manually by providing pre-populated step state. Do not write tests that depend on `InngestTestEngine` retrying failed steps — it will not.

6. **`FOR UPDATE SKIP LOCKED` returns an empty result set, not an error.** Unlike `FOR UPDATE NOWAIT`, `SKIP LOCKED` silently returns zero rows when all candidates are locked. Application code must treat an empty result as "no work now — try later". Tests must assert that the second worker received `null` or zero rows, not an exception. Confusing this with an error is a common source of misdesigned worker retry loops.

7. **Vercel Cron has no retry and can fire twice.** A 500 response is silently dropped; there is no retry. A single scheduled time slot can produce more than one invocation. Test the endpoint's idempotency explicitly: call it twice with the same `CRON_SECRET` and assert the side-effect happened exactly once.

8. **Edge Function cold-start lag in local `supabase functions serve`.** The local Deno runtime can take 1–2 seconds on the first invocation of a function. Tests that immediately assert a DB side-effect after `fetch()` returns may race the function's completion. Always use `expect.poll` for DB assertions after invoking an Edge Function — never a bare `await` followed by a direct query.

---

## Verify Before Shipping

- `[VERIFY]` **`@trigger.dev/testing` v3 API**: confirm `createJobTester` and `toHaveSucceeded` exist in the installed version. Check npmjs.com/package/@trigger.dev/testing README, not the docs site.
- `[VERIFY]` **Inngest minimum version**: check `@inngest/test`'s `package.json` `peerDependencies` — one source says `>= 3.22.12`, another says `>= 4.0.0`.
- **Resend SDK option**: the Node.js SDK uses `idempotencyKey` (camelCase) as a property *inside* the email options object passed to `resend.emails.send({ ... })` — not a second argument or a header. The raw HTTP header name remains `Idempotency-Key` for direct `fetch()` calls (24h window, 256-char max). `[VERIFY]` only if upgrading the Resend SDK across major versions.
- `[VERIFY]` **pg_cron sub-minute syntax**: `'30 seconds'` interval string syntax requires a recent Supabase Postgres version. Confirm your project's version in the Supabase dashboard before using it in migrations. Standard 5-field cron works on all versions.
- `[VERIFY]` **`supabase functions invoke` CLI syntax**: run `supabase functions invoke --help` to confirm current flags. Direct HTTP POST to `http://localhost:54321/functions/v1/<name>` is the stable fallback.
- `[VERIFY]` **`cron.job_run_details` access**: confirm `SELECT` access is available to the service role on your Supabase plan.
- `[VERIFY]` **pgTAP `dblink` availability**: `CREATE EXTENSION dblink` if not already enabled when using the two-transaction pgTAP concurrency pattern.
- `[VERIFY]` **Supabase Realtime channel limit per project**: verify the current per-connection and per-project limits for your plan at supabase.com/docs/guides/realtime.

---

## Cross-references

- **JOB_KB_1** — outbox schema, worker SQL, claim/retry/dead-letter implementation
- **JOB_KB_2** — pg_cron and Vercel Cron scheduling patterns
- **JOB_KB_4** — Trigger.dev v3 and Inngest task definitions
- **SB_KB_6** — outbox producer: writing the row inside the business transaction
- **SB_KB_9** — Realtime broadcast from DB triggers (Broadcast, not Postgres Changes)
- **TEST_KB_3** — basic supabase-js query patterns and Auth test setup
- **TEST_KB_5** — Playwright foundation; use for Realtime e2e multi-context tests
