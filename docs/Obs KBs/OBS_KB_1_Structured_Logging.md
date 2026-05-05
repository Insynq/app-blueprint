# OBS_KB_1 — Structured Logging: Next.js + Supabase Edge → Axiom

**Stack-locked: Next.js App Router (Node.js + Edge runtimes) + Supabase Edge Functions (Deno) + Vercel + Axiom. Not portable to other hosting or log destinations.**

---

## Pattern

Every log line is a JSON object with discrete fields. Pino handles Node.js Lambda functions; `next-axiom`'s `Logger` class handles Edge and App Router surfaces; `console.log(JSON.stringify({...}))` handles Supabase Edge Functions (Deno, no Node.js APIs). A `request_id` generated in `proxy.ts` flows through all layers as `x-request-id`. Axiom receives logs via the Vercel log drain (all stdout) and optionally via `next-axiom` direct ingest (richer fields, bypasses the 4 KB drain-line limit).

---

## When to use / when to skip

**Use this pattern when:**
- You need queryable operational logs (APL field-level filtering, aggregation, alerting in Axiom).
- You want end-to-end correlation across proxy → Server Component → Route Handler → Supabase Edge Function.
- You are on Vercel Pro or Enterprise (log drain requires it).

**Skip / simplify when:**
- Hobby plan — Vercel runtime log retention is 1 hour; log drain unavailable. Use `console.log` + Vercel dashboard for debugging only.
- Local development — structured logs appear in terminal stdout; Axiom ingest not needed until you stage.

---

## Anti-patterns

**Free-text log messages.**
`console.log("User 123 signed in")` produces a single opaque string in Axiom. APL cannot filter on it. Use `logger.info({ userId, action: 'sign-in' })` — Axiom flattens nested JSON to dot notation (`user.id`) and makes every field queryable.

**Pino worker-thread transports in Edge or Deno runtimes.**
`pino.transport(...)` uses `thread-stream` (worker threads). Vercel Edge Runtime and Supabase Edge Functions (Deno) have no `worker_threads`. The transport silently fails or throws. Use `next-axiom`'s `Logger` (fetch-based) in Edge Runtime and plain `console.log(JSON.stringify({...}))` in Deno.

**Forgetting `await log.flush()` in Server Components.**
`next-axiom`'s `Logger` buffers logs in memory. If you return from a Server Component without flushing, the buffer is discarded — logs are never sent to Axiom. Flush is explicit in RSCs; `withAxiom` handles it automatically in Route Handlers.

**`NextResponse.next({ headers: newHeaders })` to forward request_id upstream.**
This sends headers to the client, not upstream to RSCs/Route Handlers. The correct form is `NextResponse.next({ request: { headers: newHeaders } })`. Confusing the two silently drops the correlation ID from all downstream server code.

**Logging PII as log fields.**
Email addresses, full names, phone numbers, and raw request bodies are PII in most jurisdictions. Once in Axiom, deletion requires dataset-level operations. Redact before sending — Axiom does not redact on ingest.

**Using `console.warn` in non-streaming Vercel functions and expecting `warning` level.**
Vercel maps `console.warn` to `error` in non-streaming functions. Most App Router Route Handlers and Server Components are non-streaming by default. Use Pino or `next-axiom` to emit explicit `level` fields rather than relying on stdout/stderr routing.

---

## Logging by runtime

| Surface | Logger | Pino transport? | Flush required? |
|---|---|---|---|
| Vercel Lambda (Node.js) | Pino | `sync: true` or stdout only | stdout is auto-captured |
| Next.js proxy.ts | `next-axiom` Logger | No | `event.waitUntil(logger.flush())` |
| Server Component (RSC) | `next-axiom` Logger | No | `await log.flush()` before return |
| Server Action | `next-axiom` Logger | No | `await log.flush()` before return |
| Route Handler | `withAxiom` wrapper | No | Automatic (wrapper handles it) |
| Supabase Edge Function | `console.log(JSON.stringify)` | No | stdout, rate-limited |

---

## Setup

### Environment variables

```bash
# Required for next-axiom
NEXT_PUBLIC_AXIOM_DATASET=your-dataset-name
NEXT_PUBLIC_AXIOM_TOKEN=your-axiom-api-token

# Optional: minimum log level (default: debug)
NEXT_PUBLIC_AXIOM_LOG_LEVEL=info

# For Pino direct ingest (Node.js Lambda only)
AXIOM_DATASET=your-dataset-name
AXIOM_TOKEN=your-axiom-api-token

# For Trigger.dev OTLP (do NOT use OTEL_* env vars — conflicts with internal telemetry)
AXIOM_API_TOKEN=your-axiom-api-token
```

### Install

```bash
npm install pino @axiomhq/pino next-axiom
```

---

## Pino logger — Node.js Lambda runtime

Use Pino for API code that runs exclusively in Node.js Lambda functions (not Edge, not Deno). Write to stdout — Vercel captures it automatically. Avoid async transports in serverless: the process exits before the worker thread drains the queue.

```typescript
// lib/logger.ts — Node.js Lambda only; do NOT import in Edge Runtime files
import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'body.email',
      'body.password',
      'user.email',
      'user.phone',
      'tokens[*]',
    ],
    censor: '[REDACTED]',
  },
  // No transport: write to stdout (fd 1). Vercel captures stdout as runtime logs.
  // If you add @axiomhq/pino transport, use sync: true — async transports lose
  // logs when the Lambda process exits before the worker thread drains.
})

// Call once at request start; bind requestId, userId, orgId for all subsequent calls.
export function requestLogger(requestId: string, userId?: string, orgId?: string) {
  return logger.child({ requestId, userId, orgId })
}
```

**Pino redact path syntax** (source: pino docs/api.md):
- Dot notation: `user.email`
- Bracket notation: `creditCard[0].number`
- Wildcard: `tokens[*]` — matches all array elements
- Censor value defaults to `'[Redacted]'`; pass a function `(value, path) => string` for dynamic masking

---

## Correlation ID — proxy.ts

Generate `request_id` once per request in `proxy.ts` and forward it upstream to all RSCs, Route Handlers, and Server Actions via `NextResponse.next({ request: { headers } })`.

Next.js 16 renamed `middleware.ts` → `proxy.ts` and `export function middleware` → `export function proxy`. The proxy file runs on Node.js only — the `runtime` config option is not available in proxy files; setting it throws an error. If you are on Next.js ≤15, use `middleware.ts` / `export function middleware`; the logic below is identical.

```typescript
// proxy.ts (Next.js 16) — rename to middleware.ts + change export name for Next.js ≤15
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'

export function proxy(request: NextRequest) {
  // Honor an upstream-supplied request ID (e.g., from an API gateway), or generate one.
  const requestId = request.headers.get('x-request-id') ?? randomUUID()

  // Copy only the headers you explicitly need — avoid copying all headers (PII leak risk).
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-request-id', requestId)

  const response = NextResponse.next({
    request: { headers: requestHeaders }, // forwarded UPSTREAM to RSCs and Route Handlers
    // NOT NextResponse.next({ headers }) — that goes to the client, not upstream
  })

  // Expose on the response so the browser/caller can correlate (optional but useful for debugging).
  response.headers.set('x-request-id', requestId)
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

> **Composing with auth and tenant routing:** If your app uses Supabase Auth (`proxy.ts` session refresh from AUTH_KB_4) or subdomain routing (SB_KB_8), add the `x-request-id` injection to the same proxy function — run it after session refresh so the request ID is available to all downstream handlers in the same request.

---

## next-axiom — App Router surfaces

### Server Component (RSC)

```typescript
// app/dashboard/page.tsx
import { Logger } from 'next-axiom'
import { headers } from 'next/headers'

export default async function DashboardPage() {
  const log = new Logger()
  const requestId = (await headers()).get('x-request-id') ?? 'unknown'
  // Bind context once; all calls on scopedLog include requestId automatically.
  const scopedLog = log.with({ requestId, component: 'DashboardPage' })

  scopedLog.info('render started')
  const data = await fetchData()
  scopedLog.info('data fetched', { count: data.length }) // log count, not contents

  await log.flush() // Required — without this, buffered logs are discarded
  return <Dashboard data={data} />
}
```

`headers()` is async in Next.js 15+ and makes the route dynamically rendered. Using it makes the route opt out of static rendering — expected when you need per-request correlation.

### Server Action

Server Actions execute as POST requests. `x-request-id` set in `proxy.ts` is accessible via `await headers()` inside Server Actions using the same mechanism as RSCs. (Note: this is consistent with how `NextResponse.next({ request: { headers } })` propagates headers, but verify that your Next.js version threads these headers through to Server Action context before relying on it in production.)

```typescript
// actions/orders.ts
'use server'
import { headers } from 'next/headers'
import { Logger } from 'next-axiom'

export async function submitOrder(formData: FormData) {
  const requestId = (await headers()).get('x-request-id') ?? 'unknown'
  const log = new Logger()
  const actionLog = log.with({ requestId, action: 'submitOrder' })

  actionLog.info('action invoked')
  // ... business logic
  actionLog.info('order created', { orderId })

  await log.flush() // Required in Server Actions — same rule as RSCs
}
```

### Route Handler

`withAxiom` wraps the handler, injects `req.log`, and auto-flushes after the handler returns. No manual flush needed.

```typescript
// app/api/orders/route.ts
import { withAxiom, AxiomRequest } from 'next-axiom'
import { NextResponse } from 'next/server'

export const POST = withAxiom(async (req: AxiomRequest) => {
  const requestId = req.headers.get('x-request-id') ?? 'unknown'
  const log = req.log.with({ requestId, route: '/api/orders' })

  log.info('order submission received')
  // ... logic
  log.info('order created', { orderId })

  return NextResponse.json({ ok: true })
  // withAxiom flushes automatically after this return
})
```

### proxy.ts logging

```typescript
// In proxy.ts — add to the proxy function from the correlation ID section above
import { Logger } from 'next-axiom'

export function proxy(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? randomUUID()
  const log = new Logger()
  const proxyLog = log.with({ requestId, layer: 'proxy' })

  proxyLog.info('request received', {
    path: request.nextUrl.pathname,
    method: request.method,
  })

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-request-id', requestId)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('x-request-id', requestId)

  // event.waitUntil keeps the process alive long enough to flush
  // Without this, the proxy exits before the fetch to Axiom completes.
  // @ts-expect-error — waitUntil is available in Next.js proxy/middleware context
  event.waitUntil(log.flush())

  return response
}
```

---

## Supabase Edge Functions — Deno runtime

No Pino, no next-axiom, no Node.js. Use `console.log(JSON.stringify({...}))`. The Supabase Logs Explorer captures this output.

**Hard limits:**
- Max log message: **10,000 characters** — truncated if exceeded (the docs do not specify whether truncation is signaled) (source: supabase.com/docs/guides/functions/logging)
- Rate limit: **100 log events per 10-second window** — behavior when exceeded is not documented; do not assume excess events are queued (source: same)

Use `info` or higher in Edge Functions. `debug` / `trace` volume will hit the rate limit in any real traffic scenario.

```typescript
// supabase/functions/process-webhook/index.ts
Deno.serve(async (req) => {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID()

  // Minimal structured logger for Deno — no deps required.
  const log = (level: string, msg: string, fields: Record<string, unknown> = {}) => {
    // Avoid passing req.headers directly to JSON.stringify — it serializes as empty object in Deno.
    // Use Object.fromEntries(req.headers) if you need to log headers.
    console.log(JSON.stringify({
      level,
      requestId,
      msg,
      ts: new Date().toISOString(),
      ...fields,
    }))
  }

  log('info', 'function invoked', { path: new URL(req.url).pathname })

  try {
    // ... logic
    log('info', 'function complete', { status: 200 })
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': requestId,
      },
    })
  } catch (err) {
    log('error', 'unhandled error', { error: (err as Error).message })
    // For error lifecycle management (grouping, alerting, replays), see OBS_KB_2 for Sentry.
    return new Response('Internal Server Error', { status: 500 })
  }
})
```

> Whether the Supabase Logs Explorer auto-parses `console.log(JSON.stringify({...}))` output into queryable fields is not confirmed in primary source documentation. The BigQuery-backed Logs Explorer is documented, but field-level indexing of structured strings needs verification against current Supabase docs before designing queries that rely on it.

---

## Log levels

| Level | Pino value | next-axiom | When to use |
|---|---|---|---|
| `trace` | 10 | — | Internal loop tracking. Disable in production. Never in Edge Functions. |
| `debug` | 20 | `debug` | Request lifecycle steps during development. Disable in production. |
| `info` | 30 | `info` | Normal operational events: user signed in, order created, job enqueued. Default production level. |
| `warn` | 40 | `warn` | Expected-but-notable: retrying transient error, rate limit approaching, deprecated API called. |
| `error` | 50 | `error` | Unexpected failures: DB query failed, third-party API returned 5xx. Pair with Sentry capture — see OBS_KB_2. |
| `fatal` | 60 | — | Process-level failures. Rarely meaningful in serverless — process does not restart. |
| `silent` | ∞ | `off` | Disable all logging. Use in test runners. |

---

## Output destinations

### Vercel runtime logs

All `console.log/warn/error` from Lambda and Edge functions is captured automatically. No setup required.

**Retention by plan** (source: vercel.com/docs/observability/runtime-logs):

| Plan | Retention |
|---|---|
| Hobby | 1 hour |
| Pro | 1 day |
| Pro + Observability Plus | 30 days |
| Enterprise | 3 days |
| Enterprise + Observability Plus | 30 days |

**Per-request limits** (source: same): 256 log lines, 256 KB per line, 1 MB total.

### Vercel log drain → Axiom

Requires Vercel Pro or Enterprise (source: vercel.com/docs/drains). Cost: $0.50 per drain volume unit.

**Setup (Axiom Marketplace — recommended):**
1. Install Axiom from Vercel Marketplace — automatically configures drain and creates datasets.
2. Add `next-axiom` for structured app-level fields beyond what drain captures.
3. Set `NEXT_PUBLIC_AXIOM_INGEST_ENDPOINT` for preview deployments (source: vercel.com/marketplace/axiom).

**Setup (manual custom endpoint):**
1. Team Settings > Drains > Add Drain
2. Sources: `lambda` + `edge` (minimum); add `build` if desired
3. Format: NDJSON
4. Endpoint: `https://api.axiom.co/v1/ingest/YOUR_DATASET`
5. Header: `Authorization: Bearer YOUR_AXIOM_TOKEN`

**Key drain schema fields** (source: vercel.com/docs/drains/reference/logs):

| Field | Notes |
|---|---|
| `requestId` | Vercel's invocation ID — different from your `x-request-id`. Both are useful: Vercel's for infra correlation, yours for application-layer cross-service correlation. |
| `traceId` / `spanId` | Populated automatically when Vercel tracing is enabled — no code changes required. |
| `source` | `build`, `edge`, `lambda`, `static`, `external`, `firewall`, `redirect` |
| `level` | `info`, `warning`, `error`, `fatal` |
| `message` | Your `console.log` output — up to 256 KB from Vercel's side; Axiom recommends keeping drain-delivered lines under 4 KB (source: axiom.co/docs/integrations/vercel). |
| `path`, `statusCode`, `environment`, `branch`, `executionRegion` | Standard envelope fields |

**4 KB drain-line guidance:** Axiom documentation cites a practical 4 KB per-line guideline for log drain delivery. This is Axiom's recommendation, not a hard Vercel API limit (Vercel allows 256 KB per line in runtime logs). For larger structured payloads, use `next-axiom` direct ingest which bypasses the drain and posts directly to the Axiom ingest API.

### Axiom dataset limits (source: axiom.co/docs/reference/limits, axiom.co/docs/reference/field-restrictions)

| Tier | Retention | Datasets | Fields per dataset |
|---|---|---|---|
| Personal | 30 days | 2 | 256 |
| Cloud | Custom | 100 | 1,024 (soft) |

Axiom flattens nested JSON to dot notation on ingest (`{ "user": { "id": "x" } }` → queryable as `user.id`). Avoid field names starting with `_` — `_blockInfo`, `_cursor`, `_rowID`, `_source`, `_sysTime` are reserved. Max field name: 200 bytes. Max single field value: 1 MB. Max batch: 10,000 events per ingest call.

---

## PII redaction

**Safe to log** (opaque identifiers, not PII on their own): `user_id`, `org_id`, `session_id`, `request_id`, `role`, `plan`, route paths with UUID segments.

**Never log**: email addresses, full names, phone numbers, raw request or form bodies, passwords, API keys, tokens, IP addresses (PII under GDPR in many jurisdictions), payment card data, free-text user-controlled fields.

`next-axiom` has no built-in redaction mechanism (source: github.com/axiomhq/next-axiom). Sanitize fields before passing them to `log.info(message, fields)`.

For Pino, use the `redact` option at logger construction time. Redaction runs before serialization — no PII escapes to stdout.

```typescript
// Pino: object-format redact with censor function
const logger = pino({
  redact: {
    paths: ['req.headers.authorization', 'body.email', 'body.password', 'user.phone', 'tokens[*]'],
    censor: (value, path) => `[REDACTED:${path.join('.')}]`,
    remove: false, // keep the key, replace the value
  },
})
```

---

## Trigger.dev and Inngest

### Trigger.dev — OTLP to Axiom

Do not use `OTEL_*` environment variables — they conflict with Trigger.dev's internal telemetry (source: trigger.dev/docs/config/config-file). Pass the OTLP config directly to exporter constructors:

```typescript
// trigger.config.ts
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

export default {
  telemetry: {
    logExporters: [
      new OTLPLogExporter({
        url: 'https://api.axiom.co/v1/logs',
        headers: {
          Authorization: `Bearer ${process.env.AXIOM_API_TOKEN}`,
          'X-Axiom-Dataset': process.env.AXIOM_DATASET,
        },
      }),
    ],
    exporters: [
      new OTLPTraceExporter({
        url: 'https://api.axiom.co/v1/traces',
        headers: {
          Authorization: `Bearer ${process.env.AXIOM_API_TOKEN}`,
          'X-Axiom-Dataset': process.env.AXIOM_DATASET,
        },
      }),
    ],
  },
}
```

Pass `requestId` as a structured field when dispatching to a task — Trigger.dev's logger auto-injects `runId` but not your application correlation ID (source: trigger.dev/docs/logging).

### Inngest — Pino as logger

```typescript
// lib/inngest.ts
import pino from 'pino'
import { Inngest } from 'inngest'

const pinoLogger = pino({ level: 'info' })

export const inngest = new Inngest({
  id: 'my-app',
  logger: pinoLogger, // Inngest calls .child() on logger to inject run metadata automatically
})
```

Inngest injects function run metadata via `.child()` on loggers that implement it — Pino does (source: inngest.com/docs/guides/logging). Pass `requestId` as a field in step calls to maintain application-layer correlation.

---

## Always / Never

**Always:**
- Generate `request_id` in `proxy.ts` and forward via `NextResponse.next({ request: { headers: requestHeaders } })`.
- Use `.with({ requestId, userId, orgId })` to create a child logger once per request. Never repeat context fields on every log call.
- Call `await log.flush()` before returning from Server Components and Server Actions when using `next-axiom`.
- Use `event.waitUntil(log.flush())` in `proxy.ts` — without it, logs are dropped when the proxy function returns.
- Log `info` or higher in Supabase Edge Functions — the 100 events/10s rate limit makes `debug`/`trace` impractical.
- Redact PII before it reaches any log call. Axiom does not redact on ingest; deletion requires dataset-level operations.
- Keep drain-delivered log lines under 4 KB. Use `next-axiom` direct ingest for larger structured payloads.
- Log discrete fields for queryable data: `{ userId, orderId, action }`, not `{ msg: "user 123 placed order 456" }`.
- Pair `error`-level logs with Sentry capture — see OBS_KB_2. Structured logs provide context; Sentry handles error lifecycle (grouping, alerting, replay).

**Never:**
- Log email addresses, full names, phone numbers, raw request bodies, API keys, passwords, or tokens — even at `debug` level.
- Use `pino.transport(...)` (worker-thread transports) in Vercel Edge Runtime or Supabase Edge Functions (Deno).
- Use `NextResponse.next({ headers: newHeaders })` without the `request:` wrapper — that sends headers to the client, not upstream.
- Copy all incoming request headers into forwarded headers — PII leak risk.
- Rely on `console.warn` level in non-streaming Vercel functions — it maps to `error`, not `warning`.
- Create a new logger instance per sub-function call. Create once per request entry point; pass child loggers.
- Pass `OTEL_*` env vars to Trigger.dev for configuring log exporters — use constructor config instead.
- Exceed 10,000 characters in a single Supabase Edge Function log line — truncation is silent.
- Store immutable audit events in operational logs → use OBS_KB_3 for compliance audit trails.
- Configure pg_stat_statements, queue-depth monitoring, or alerting here → see OBS_KB_4.

---

## Cross-references

- **OBS_KB_2** — Sentry error tracking: capturing exceptions, error boundaries, source maps, session replay.
- **OBS_KB_3** — Immutable audit log table design in Postgres. Never use operational logs for compliance audit trails.
- **OBS_KB_4** — pg_stat_statements, queue depth monitoring, dead-letter alerting, performance thresholds.
- **AUTH_KB_4** — proxy.ts session lifecycle (Supabase Auth refresh runs in the same proxy function as `x-request-id` injection).
- **SB_KB_8** — Subdomain routing middleware that composes with this proxy pattern.
