# AI_KB_1: Anthropic API Patterns

**Stack-locked: `@anthropic-ai/sdk` (Node) + Next.js 15/16 App Router + Vercel + Supabase. Cost and model-selection concepts are portable.**

---

## Why this matters

Every AI feature you build costs real money on every call. Without prompt caching, a 3,000-token system prompt on Sonnet 4.6 costs full input price on every single request — even if the system prompt never changes. Without deliberate model selection, teams default to Opus everywhere and pay 5x what Sonnet costs for tasks Sonnet handles identically. These aren't micro-optimizations: at modest scale (1,000 req/day with a 3k-token system prompt), skipping caching wastes ~$3,200/year on Sonnet and ~$5,400/year on Opus. This KB encodes the disciplines that turn those costs into line items you control. Prompt caching is not an optional enhancement — it is the default pattern for any system prompt longer than the model's minimum threshold.

---

## Stack assumptions

- `@anthropic-ai/sdk` Node SDK, server-side only
- Next.js 15/16 App Router (Server Actions, Route Handlers, Server Components)
- Vercel deployment — `nodejs` runtime for AI routes, `edge` for everything else
- Supabase for all data persistence (including usage logs if desired)
- Trigger.dev or Inngest for long-running AI jobs (see JOB_KB_4)
- Model family: Opus 4.7, Sonnet 4.6 (default), Haiku 4.5

---

## SDK setup

### Installation

```bash
npm install @anthropic-ai/sdk
```

Requirements: Node.js 20 LTS or later, TypeScript >= 4.9.

### Singleton client — `lib/anthropic.ts`

Create once, import everywhere. Never instantiate `new Anthropic()` inside a function that runs per-request.

```typescript
// lib/anthropic.ts
import Anthropic from "@anthropic-ai/sdk";

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY is not set");
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY, // reads env var automatically if omitted
  maxRetries: 2,                          // default: 2 — SDK retries 429, 500, 408, 409, connection errors
  timeout: 120_000,                       // 2-minute default; override per-request for large max_tokens
});
```

### Environment variable

```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

Set in Vercel Dashboard → Project Settings → Environment Variables. Do NOT prefix with `NEXT_PUBLIC_`. The SDK refuses to load in browser contexts by default — this is a safety guardrail, not a bug.

### Server-only enforcement in Next.js

The SDK must never be imported in client components. Enforce this at the import boundary:

```typescript
// lib/anthropic.ts — add at top to make bundler fail loudly on client import
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
// ...
```

---

## Request basics

### Minimal request

```typescript
import { anthropic } from "@/lib/anthropic";

const message = await anthropic.messages.create({
  model: "claude-sonnet-4-6",  // REQUIRED
  max_tokens: 1024,            // REQUIRED
  messages: [
    { role: "user", content: "Summarize this in 3 bullet points." }
  ],
});

const text = message.content[0].text;   // primary text response
const usage = message.usage;            // token accounting — always log this
```

### Full parameter reference

```typescript
await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  messages: [{ role: "user", content: "..." }],
  system: "You are a helpful assistant.",  // string or array (use array for caching)
  temperature: 1.0,          // 0.0–1.0, default 1.0
  stop_sequences: ["<END>"],
  stream: false,
  metadata: { user_id: "usr_hashed_id" }, // hash, not PII — for abuse detection
  service_tier: "auto",      // "auto" (default) or "standard_only"
});
```

### Response shape

```typescript
{
  id: "msg_abc123",
  type: "message",
  role: "assistant",
  content: [{ type: "text", text: "Response text" }],
  model: "claude-sonnet-4-6",
  stop_reason: "end_turn",  // "end_turn" | "stop_sequence" | "max_tokens" | "tool_use"
  usage: {
    input_tokens: 25,                    // tokens AFTER the last cache breakpoint — NOT total
    output_tokens: 87,
    cache_creation_input_tokens: 0,      // tokens written to cache (1.25x or 2x cost)
    cache_read_input_tokens: 0,          // tokens read from cache (0.1x cost)
  },
  _request_id: "req_018EeWyXxfu5pfWkrYcMdjWG",  // include in error logs
}
```

**`usage.input_tokens` is not total input.** It is only the tokens after the last cache breakpoint. Always compute total input as:

```
total_input = cache_read_input_tokens + cache_creation_input_tokens + input_tokens
```

### Multi-turn conversation

```typescript
const messages: Anthropic.MessageParam[] = [
  { role: "user",      content: "What is the capital of France?" },
  { role: "assistant", content: "The capital of France is Paris." },
  { role: "user",      content: "What is its population?" },
];

const reply = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 512,
  messages,
});
```

---

## System prompts

### String form (no caching)

```typescript
await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  system: "You are a helpful assistant for a SaaS product.",
  messages: [{ role: "user", content: "..." }],
});
```

### Array form (required for caching)

Split the system prompt into stable and dynamic segments. Only stable segments get `cache_control`.

```typescript
await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  system: [
    {
      type: "text",
      text: "You are a helpful assistant for [Product]. [Long stable persona, rules, domain knowledge...]",
      cache_control: { type: "ephemeral" },  // cache the stable part
    },
    {
      type: "text",
      text: `Today is ${new Date().toISOString()}. User context: ${userContext}`,
      // no cache_control — this changes per request
    },
  ],
  messages: [{ role: "user", content: "..." }],
});
```

Rule: the static block must exceed the model's minimum token threshold (see Prompt Caching section below) or caching silently does nothing.

---

## Prompt caching (the centerpiece)

This is the highest-leverage cost optimization available. Skipping it on a non-trivial system prompt is equivalent to paying full price for a static resource on every page load.

### What it does

Caching stores the attention KV cache for a prompt prefix. On a cache hit, the API skips reprocessing the cached portion entirely. Cache reads cost 10% of standard input price. Cache writes cost 125% (5m TTL) or 200% (1h TTL) — but break-even comes after just 2 cache hits on a 5m TTL.

### Syntax

```typescript
// 5-minute TTL (default when ttl is omitted)
cache_control: { type: "ephemeral" }
cache_control: { type: "ephemeral", ttl: "5m" }

// 1-hour TTL (2x write cost; use when requests are spaced >5 min apart)
cache_control: { type: "ephemeral", ttl: "1h" }
```

There is no `"persistent"` cache type. The only type is `"ephemeral"`. The TTL distinguishes the two durations.

### Minimum token thresholds — model-specific

Caching silently fails (no error, no cache activity) if the content block is below the model's minimum. Both `cache_creation_input_tokens` and `cache_read_input_tokens` will be 0.

| Models | Minimum tokens to cache |
|--------|------------------------|
| Claude Opus 4.7, 4.6, 4.5; Claude Haiku 4.5 | **4096 tokens** |
| Claude Sonnet 4.6; Claude Haiku 3.5 | **2048 tokens** |
| Claude Opus 4.1, 4; Claude Sonnet 4.5, 4, 3.7 | **1024 tokens** |

The "1024 is universal" assumption is wrong. If you're on Sonnet 4.6 with a 1,500-token system prompt, you will never get a cache hit — silent miss on every request.

### Cache pricing

| Model | Base Input | 5m Write | 1h Write | Read (hit) | Output |
|-------|-----------|----------|----------|------------|--------|
| Opus 4.7 / 4.6 / 4.5 | $5/MTok | $6.25/MTok | $10/MTok | $0.50/MTok | $25/MTok |
| Sonnet 4.6 / 4.5 / 4 | $3/MTok | $3.75/MTok | $6/MTok | $0.30/MTok | $15/MTok |
| Haiku 4.5 | $1/MTok | $1.25/MTok | $2/MTok | $0.10/MTok | $5/MTok |

**Break-even math:**
- 5m TTL: write costs 1.25x. Each hit saves 0.9x (pays 0.1x instead of 1.0x). Break-even after `ceil(1.25 / 0.9)` = **2 hits**.
- 1h TTL: write costs 2.0x. Break-even after `ceil(2.0 / 0.9)` = **3 hits** (write + 2 reads).
- Use 1h only if gaps between requests regularly exceed 5 minutes AND you expect 3+ hits within the hour.

### Where cache_control can be placed

```typescript
// 1. System prompt blocks (most common — stable persona, rules, domain knowledge)
system: [
  { type: "text", text: "...long stable instructions...", cache_control: { type: "ephemeral" } }
]

// 2. User message content blocks (e.g., a large document provided once per conversation)
messages: [
  {
    role: "user",
    content: [
      { type: "text", text: "...large reference document...", cache_control: { type: "ephemeral" } },
      { type: "text", text: "...user's actual question..." },  // no cache_control
    ],
  }
]

// 3. Last tool definition (caches all tools up to and including this one)
tools: [
  { name: "search", description: "...", input_schema: { ... } },
  { name: "write",  description: "...", input_schema: { ... }, cache_control: { type: "ephemeral" } },
]

// 4. Top-level automatic mode (API manages breakpoints; simplest starting point)
await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  cache_control: { type: "ephemeral" },
  system: "Long system prompt...",
  messages: [/* conversation */],
});
```

Maximum explicit cache breakpoints per request: **4**.

### Verifying cache hits

```typescript
const response = await anthropic.messages.create({ /* ... */ });
const { usage } = response;

// Cache HIT:    cache_read_input_tokens > 0,  cache_creation_input_tokens = 0
// Cache WRITE:  cache_creation_input_tokens > 0, cache_read_input_tokens = 0
// Cache MISS:   both = 0, all tokens in input_tokens (below threshold, or changed content)

const totalInput = usage.cache_read_input_tokens + usage.cache_creation_input_tokens + usage.input_tokens;
const hitRatePct = totalInput > 0
  ? ((usage.cache_read_input_tokens / totalInput) * 100).toFixed(1)
  : "0.0";
```

Check Claude Console → Usage for cache rate charts across your workspace.

### Standard multi-turn caching pattern

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { anthropic } from "@/lib/anthropic";

// Define once — must be byte-for-byte identical across all requests
const SYSTEM_BLOCKS: Anthropic.TextBlockParam[] = [
  {
    type: "text",
    text: `You are a helpful assistant for [Product].
[Long persona, domain knowledge, rules — must exceed 2048 tokens for Sonnet 4.6,
4096 tokens for Opus 4.7 / Haiku 4.5, to trigger caching]`,
    cache_control: { type: "ephemeral" },
  },
];

// Request 1 — cold: cache_creation_input_tokens > 0, cache_read = 0
const response1 = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  system: SYSTEM_BLOCKS,
  messages: [{ role: "user", content: "First question" }],
});

// Request 2 — warm (within 5 min): cache_read_input_tokens = [system tokens], creation = 0
const response2 = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  system: SYSTEM_BLOCKS,               // MUST be byte-for-byte identical
  messages: [
    { role: "user",      content: "First question" },
    { role: "assistant", content: response1.content[0].text },
    { role: "user",      content: "Follow-up question" },
  ],
});
```

### Cache pre-warming

Pre-warm the cache before real traffic arrives to avoid cold-start latency on the first user request:

```typescript
// Run at app startup, before cron window, or before expected traffic spike
const prewarm = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 0,          // generates no output — cache write only
  system: SYSTEM_BLOCKS,  // same blocks as real requests
  messages: [{ role: "user", content: "warmup" }],
});
// stop_reason will be "max_tokens", content will be []
// prewarm.usage.cache_creation_input_tokens confirms what was cached
```

Constraint: `max_tokens: 0` cannot be combined with streaming, extended thinking, structured outputs, or `tool_choice: { type: "tool" }`.

### Mixing 5m and 1h TTLs

Longer TTL entries must appear before shorter ones in prompt order:

```typescript
system: [
  {
    type: "text",
    text: "Static app persona — never changes across requests",
    cache_control: { type: "ephemeral", ttl: "1h" },
  },
  {
    type: "text",
    text: "Daily briefing context — refreshes every few minutes",
    cache_control: { type: "ephemeral", ttl: "5m" },
  },
]
```

When mixing TTLs, the response `usage.cache_creation` object breaks down writes by duration (`ephemeral_5m_input_tokens` and `ephemeral_1h_input_tokens`). [verify against current docs — field may not appear unless both TTLs are present]

### 20-block lookback limit

The cache system looks back up to 20 content blocks from the current breakpoint when searching for prior cache entries. In long multi-turn conversations, conversation history can push earlier cache breakpoints outside the window:

```
Turn 1:  10 blocks, cache_control at block 10  → writes cache
Turn 2:  15 blocks, cache_control at block 15  → finds block 10 → cache HIT
Turn 3:  35 blocks, cache_control at block 35  → looks back 20 blocks to block 16
          → block 10 is outside the window      → cache MISS, new write
```

Fix: add explicit breakpoints at interim positions in long conversations to maintain multiple active cache windows.

### Cache invalidation — what breaks the cache

| Change | Effect |
|--------|--------|
| Any byte change to cached content | Invalidates that cache and all subsequent |
| Tool definitions modified | Invalidates tool cache + subsequent |
| Web search tool toggle | Invalidates tools cache only |
| `tool_choice` parameter change | Invalidates message cache only |
| Images added to prompt | Invalidates message cache only |
| Extended thinking settings change | Invalidates message cache only |

Caches are isolated per workspace within an organization. API keys from different workspaces do not share cache. [verify exact rollout date against current docs]

### ITPM rate-limit bonus

For Opus 4.7, Sonnet 4.6, and Haiku 4.5, `cache_read_input_tokens` do NOT count toward ITPM rate limits. Only uncached `input_tokens` and `cache_creation_input_tokens` count. At an 80% cache hit rate against a 2M ITPM limit, effective total throughput approaches 10M tokens/minute. Caching is both a cost optimizer and a throughput multiplier.

### Caching anti-patterns

```typescript
// WRONG: dynamic content inside a cached block — cache miss every request
system: [{
  type: "text",
  text: `Instructions... Current time: ${new Date().toISOString()}`,
  cache_control: { type: "ephemeral" },  // invalidated on every request
}]

// RIGHT: split static and dynamic
system: [
  { type: "text", text: "Static instructions...", cache_control: { type: "ephemeral" } },
  { type: "text", text: `Current time: ${new Date().toISOString()}` },  // no cache_control
]

// WRONG: caching content that changes per user
messages: [{
  role: "user",
  content: [{
    type: "text",
    text: `User: ${userName}, question: ${userQuestion}`,
    cache_control: { type: "ephemeral" },  // different every time = cache write every time
  }]
}]

// WRONG: assuming 1024 min threshold for Sonnet 4.6 (2048) or Opus 4.7 (4096)
// Prompt under threshold = silent miss, paying full price

// WRONG: firing parallel requests before cache is warm
// Each parallel request writes its own cache — wasteful and gives no hits
// Pre-warm explicitly, then open to traffic
```

---

## Model selection

| Model | API ID | Use case | Context | Max output | Input | Output | Cache threshold |
|-------|--------|----------|---------|------------|-------|--------|----------------|
| Opus 4.7 | `claude-opus-4-7` | Complex reasoning, novel code, agentic loops, high-stakes analysis | 1M | 128k | $5/MTok | $25/MTok | 4096 tokens |
| Sonnet 4.6 | `claude-sonnet-4-6` | **Default for most app features**; good context + extended thinking | 1M | 64k | $3/MTok | $15/MTok | 2048 tokens |
| Haiku 4.5 | `claude-haiku-4-5` | Classification, tagging, extraction, quick Q&A, high-throughput tasks | 200k | 64k | $1/MTok | $5/MTok | 4096 tokens |

**Decision heuristic:**

```typescript
const model = (() => {
  if (task.requiresDeepReasoning || task.isAgentic) return "claude-opus-4-7";
  if (task.outputLength > 4_000 || task.contextTokens > 100_000) return "claude-sonnet-4-6";
  return "claude-haiku-4-5";  // classification, tagging, extraction, simple Q&A
})();
```

Sonnet 4.6 is the right default. Opus is 5x the cost per input token — do not default to it because it "feels safer."

**Cost gates exploration, not what ships.** The guidance above is one-directional — it guards against over-spending. The complementary guard: output the end user reads directly (generated copy, user-facing UX text, high-stakes analysis) is judged on output *quality*, not price. Escalate to the top tier when the cheaper model misses the bar — that costs less than shipping mediocre user-facing output. The decision heuristic above is a starting default, not a fixed ceiling: a feature may route a given call to a stronger model, at design time or via a judge-then-retry loop, when the output doesn't clear the bar. `Installed 2026-07-07, not yet proven in a live run.`

**Knowledge cutoffs (verified 2026-05-04):** Opus 4.7 = January 2026, Sonnet 4.6 = August 2025, Haiku 4.5 = February 2025.

**Deprecated — migrate away:** `claude-sonnet-4-20250514` and `claude-opus-4-20250514` retire June 15, 2026.

---

## Streaming (server-side)

For streaming UI patterns (piping to `ReadableStream`, `useChat`, client event handling), see AI_KB_3. This section covers server-side streaming only.

### Why stream at all on the server

Non-streaming requests expected to exceed ~10 minutes will error. For large `max_tokens` values (e.g., 64k output on Opus 4.7), always use streaming to keep the connection alive — even if you don't process tokens incrementally.

### Pattern 1: Event listener (preferred for server-side)

```typescript
import { anthropic } from "@/lib/anthropic";

const stream = anthropic.messages.stream({
  model: "claude-sonnet-4-6",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Explain async/await in 3 paragraphs." }],
});

// Incremental text
stream.on("text", (text) => process.stdout.write(text));

// Full message with usage at completion
const finalMessage = await stream.finalMessage();
console.log(finalMessage.usage);
```

### Pattern 2: for-await (event-by-event)

```typescript
for await (const event of stream) {
  if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
    process.stdout.write(event.delta.text);
  }
  if (event.type === "message_delta") {
    // usage.output_tokens here is CUMULATIVE total for the stream
    console.log("Total output tokens:", event.usage.output_tokens);
  }
}
```

### Pattern 3: stream for connection keep-alive, consume as batch

```typescript
// Streaming keeps the connection alive; finalMessage() returns a complete Message object
const stream = anthropic.messages.stream({
  model: "claude-opus-4-7",
  max_tokens: 64_000,
  messages: [{ role: "user", content: "Write a detailed analysis..." }],
});
const message = await stream.finalMessage();
```

### SSE event sequence

```
message_start → (content_block_start, content_block_delta*, content_block_stop)* → message_delta → message_stop
```

Cache usage fields (`cache_creation_input_tokens`, `cache_read_input_tokens`) appear in the `message_start` event.

### 529 errors in streams

A 529 overloaded error can arrive as an SSE `error` event after the 200 response header has been sent. A regular `try/catch` on the initial `create()` call will not catch it. Handle error events in the SSE parsing layer or use the SDK's built-in stream helpers which surface these as thrown errors.

### Route Handler with explicit runtime

```typescript
// app/api/ai/route.ts
export const runtime = "nodejs";   // required — do not omit
export const maxDuration = 60;     // seconds — Pro/Enterprise plan required for >10s

export async function POST(req: Request) {
  const { prompt } = await req.json();
  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });
  // For client streaming: see AI_KB_3
  // For server-only: await finalMessage()
  const message = await stream.finalMessage();
  return Response.json({ text: message.content[0].text, usage: message.usage });
}
```

---

## Error handling

### SDK built-in retry behavior

Default: 2 automatic retries with exponential backoff.
Retried automatically: connection errors, 408, 409, 429, 500, 529.

```typescript
// Default (2 retries)
const client = new Anthropic({ maxRetries: 2 });

// Disable (manual retry control)
const client = new Anthropic({ maxRetries: 0 });

// Per-request override (second argument)
await client.messages.create(params, { maxRetries: 5 });
```

### Error types and retryability

| HTTP | Error class | Retryable by SDK? |
|------|-------------|------------------|
| 400 | `BadRequestError` | No |
| 401 | `AuthenticationError` | No |
| 403 | `PermissionDeniedError` | No |
| 404 | `NotFoundError` | No |
| 413 | `APIError` (request_too_large) | No — reduce payload |
| 422 | `UnprocessableEntityError` | No |
| 429 | `RateLimitError` | Yes |
| 500 | `InternalServerError` | Yes |
| 504 | `InternalServerError` (server-side gateway timeout) | Yes |
| 529 | `InternalServerError` | Yes |
| (client-side network/socket timeout) | `APIConnectionTimeoutError` | Yes |

### Route Handler error handling pattern

```typescript
import { anthropic } from "@/lib/anthropic";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(req: Request) {
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: await req.text() }],
    });
    return Response.json({ text: message.content[0].text, usage: message.usage });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      // SDK already retried 2x — surface to client
      return Response.json({ error: "Service busy, please try again." }, { status: 429 });
    }
    if (err instanceof Anthropic.AuthenticationError) {
      console.error("Anthropic auth failed:", err.message);
      return Response.json({ error: "Internal configuration error." }, { status: 500 });
    }
    if (err instanceof Anthropic.InternalServerError) {
      return Response.json({ error: "AI service temporarily unavailable." }, { status: 503 });
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return Response.json({ error: "Connection failed, please try again." }, { status: 503 });
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error:", {
        status: err.status,
        type: err.error?.type,
        message: err.message,
        request_id: err.headers?.["request-id"],
      });
      return Response.json({ error: "AI request failed." }, { status: 500 });
    }
    throw err; // programming errors — let them surface
  }
}
```

### Manual backoff for 429s

Use this when you need more control than the SDK's built-in retries (e.g., background jobs, batch processing):

```typescript
async function callWithBackoff(
  params: Anthropic.MessageCreateParams,
  maxAttempts = 5,
): Promise<Anthropic.Message> {
  const client = new Anthropic({ maxRetries: 0 }); // manual control

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await client.messages.create(params);
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError && attempt < maxAttempts - 1) {
        const retryAfter = err.headers?.["retry-after"];
        const waitMs = retryAfter
          ? parseInt(retryAfter) * 1000
          : Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 60_000);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Max retry attempts exceeded");
}
```

### Always capture `_request_id`

```typescript
// On success
console.log(message._request_id);

// On error
if (err instanceof Anthropic.APIError) {
  console.error({ request_id: err.headers?.["request-id"], ...err });
}
```

Include this in every error log. It is required when filing a support ticket with Anthropic.

---

## Rate limits

### Limit types

1. **RPM** — Requests per minute
2. **ITPM** — Input tokens per minute (cache reads excluded for current models)
3. **OTPM** — Output tokens per minute

### Tier limits (verified 2026-05-04)

**Tier 1** ($5 credit purchase):

| Model class | RPM | ITPM | OTPM |
|------------|-----|------|------|
| Opus 4.x | 50 | 30,000 | 8,000 |
| Sonnet 4.x | 50 | 30,000 | 8,000 |
| Haiku 4.5 | 50 | 50,000 | 10,000 |

**Tier 2** ($40 cumulative):

| Model class | RPM | ITPM | OTPM |
|------------|-----|------|------|
| Opus 4.x | 1,000 | 450,000 | 90,000 |
| Sonnet 4.x | 1,000 | 450,000 | 90,000 |
| Haiku 4.5 | 1,000 | 450,000 | 90,000 |

Limits apply per model class — Opus 4.x share one bucket and Sonnet 4.x share another. Haiku 4.5's pooling differs; check current rate-limit docs before assuming Haiku versions share. You can use different model classes simultaneously up to their respective limits.

### Cache-aware ITPM

For Opus 4.7, Sonnet 4.6, and Haiku 4.5, `cache_read_input_tokens` do NOT count toward ITPM. Only uncached `input_tokens` and `cache_creation_input_tokens` count. Caching is therefore also a rate limit optimizer at high throughput.

### Rate limit headers

```
anthropic-ratelimit-requests-limit: 1000
anthropic-ratelimit-requests-remaining: 998
anthropic-ratelimit-requests-reset: 2026-05-04T00:01:00Z
anthropic-ratelimit-input-tokens-limit: 450000
anthropic-ratelimit-input-tokens-remaining: 440000
retry-after: 30   (present on 429 responses)
```

Read headers in SDK:

```typescript
const response = await anthropic.messages.create(params).asResponse();
console.log(response.headers.get("anthropic-ratelimit-requests-remaining"));
```

### Rate limit algorithm

Anthropic uses a **token bucket** algorithm — capacity refills continuously, not at fixed-interval resets. A 60 RPM limit can fire as ~1 req/s; bursts even under the per-minute average can trigger 429s. Ramp up production traffic gradually — sudden spikes trigger acceleration limits.

---

## Cost discipline

### The four token counters

```typescript
type Usage = {
  input_tokens: number;                  // uncached tokens after last cache breakpoint
  output_tokens: number;                 // generated tokens (most expensive on Opus)
  cache_creation_input_tokens: number;   // written to cache this request (1.25x or 2x)
  cache_read_input_tokens: number;       // read from cache (0.1x cost)
};
```

### Cost calculation

```typescript
function calculateCostUsd(usage: Anthropic.Usage, model: "opus-4.7" | "sonnet-4.6" | "haiku-4.5"): number {
  const pricing = {
    "opus-4.7":   { input: 5, write: 6.25, read: 0.50, output: 25 },
    "sonnet-4.6": { input: 3, write: 3.75, read: 0.30, output: 15 },
    "haiku-4.5":  { input: 1, write: 1.25, read: 0.10, output: 5  },
  };
  const p = pricing[model];
  return (
    usage.input_tokens * p.input +
    usage.cache_creation_input_tokens * p.write +  // assumes 5m TTL
    usage.cache_read_input_tokens * p.read +
    usage.output_tokens * p.output
  ) / 1_000_000;
}
```

### Cost logging pattern (log every request)

```typescript
function logUsage(requestId: string, model: string, usage: Anthropic.Usage, latencyMs: number) {
  const totalInput = usage.cache_read_input_tokens + usage.cache_creation_input_tokens + usage.input_tokens;
  const hitRatePct = totalInput > 0
    ? ((usage.cache_read_input_tokens / totalInput) * 100).toFixed(1)
    : "0.0";

  console.log(JSON.stringify({
    event: "anthropic_usage",
    request_id: requestId,
    model,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_write_tokens: usage.cache_creation_input_tokens,
    cache_read_tokens: usage.cache_read_input_tokens,
    total_input_tokens: totalInput,
    cache_hit_rate_pct: hitRatePct,
    latency_ms: latencyMs,
  }));
}
```

Route to OBS_KB_2 (error tracking) and OBS_KB_4 (cost/latency monitoring) for alerting setup.

### Batch API — 50% discount for non-real-time work

Use the Message Batches API for bulk analysis, offline reports, or any task that does not need synchronous response:

```typescript
const batch = await anthropic.messages.batches.create({
  requests: items.map((item, i) => ({
    custom_id: `item-${i}`,
    params: {
      model: "claude-haiku-4-5",
      max_tokens: 512,
      messages: [{ role: "user", content: item.text }],
    },
  })),
});

// Poll for completion
let status = await anthropic.messages.batches.retrieve(batch.id);
while (status.processing_status !== "ended") {
  await new Promise((r) => setTimeout(r, 5_000));
  status = await anthropic.messages.batches.retrieve(batch.id);
}

// Retrieve results
for await (const entry of await anthropic.messages.batches.results(batch.id)) {
  if (entry.result.type === "succeeded") {
    console.log(entry.custom_id, entry.result.message.content[0].text);
  }
}
```

Batch pricing (50% off): Opus 4.7 = $2.50/$12.50 MTok, Sonnet 4.6 = $1.50/$7.50 MTok, Haiku 4.5 = $0.50/$2.50 MTok. Batch + prompt caching discounts stack.

For long-running batch jobs that should not tie up a Vercel function, hand off to Trigger.dev or Inngest — see JOB_KB_4.

---

## Runtime: Node, not Edge

### Why

The `@anthropic-ai/sdk` Node SDK supports Vercel Edge Runtime, but Edge functions have practical limits for AI calls:

- With Fluid Compute (now default on Vercel), Node.js routes get **300s on Hobby and 800s on Pro/Enterprise** — but only on the Node runtime. Edge runtime durations are still tighter.
- Complex prompts or large `max_tokens` values can still exceed even the Node ceiling — push to Trigger.dev/Inngest for those (cross-ref JOB_KB_4).
- Edge functions do not support all Node built-ins the SDK may rely on.
- AI SDK v6 patterns rely on Node-runtime APIs the Anthropic SDK uses. [verify current Vercel docs for any runtime limit changes]

**Default to `nodejs` for any Route Handler that calls the Anthropic API.**

```typescript
// app/api/ai/route.ts
export const runtime = "nodejs";    // explicit — do not rely on Next.js defaults
export const maxDuration = 300;     // Hobby ceiling with Fluid Compute; raise on Pro/Ent up to 800s
```

### For jobs exceeding Vercel's maxDuration

AI tasks that may run longer than 60 seconds (agentic loops, large document processing, multi-step pipelines) must move to Trigger.dev or Inngest. Route Handlers and Server Actions should enqueue the job and return immediately. See JOB_KB_4 for the outbox/queue pattern.

---

## Common gotchas

### Opus 4.7 tokenizer change

Opus 4.7 uses a new tokenizer that produces up to **35% more tokens** for the same text compared to prior models. A 1,500-word system prompt that was ~2,000 tokens on Opus 4.6 may be ~2,700 tokens on Opus 4.7. This affects cost estimates, cache threshold calculations, and context window planning. Re-estimate token counts when migrating to Opus 4.7.

Use `anthropic.messages.countTokens()` to measure before committing. [verify exact API in current SDK docs]

### Prefilling is unsupported on current models

Prefilling assistant messages (adding a partial assistant turn at the end of the message array to steer format) returns a **400 `invalid_request_error`** on Opus 4.7, Opus 4.6, and Sonnet 4.6. This worked on older models but is not supported on the current generation.

```typescript
// WRONG — 400 error on Opus 4.7, Opus 4.6, Sonnet 4.6
messages: [
  { role: "user",      content: "Respond only as JSON." },
  { role: "assistant", content: "{" },  // prefill — UNSUPPORTED
]

// RIGHT: use system prompt instructions or structured output config
system: "Respond only with valid JSON. No markdown. No explanation.",
```

### Cache threshold variance by model

The threshold is not universal. Sonnet 4.6 = 2048, Opus 4.7 = 4096. A system prompt that caches on Sonnet may not cache after upgrading to Opus. Always verify cache hits in `response.usage` when changing models.

### `usage.input_tokens` is not total input

```typescript
// WRONG: treating input_tokens as the full prompt size
const totalCost = usage.input_tokens * ratePerToken;  // undercount if caching is active

// RIGHT: sum all three
const totalInput = usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens;
```

### Parallel requests before cache is warm

If multiple requests fire simultaneously before the first cache write completes, each request writes its own cache at 1.25x cost with no hits. Pre-warm explicitly (`max_tokens: 0`) before opening an endpoint to traffic. Gate the first real requests until the pre-warm resolves.

### `_request_id` missing from error logs

Every Anthropic APIError and every successful Message response carries a `_request_id`. Without it, Anthropic support cannot trace your failing request. Log it on every call.

### 529 errors in streams are post-header

A 529 overloaded error that arrives mid-stream cannot be caught by the `try/catch` wrapping the initial `messages.create()` call — the 200 response header has already been sent. Handle error events in the SSE parsing layer or rely on the SDK's `stream.finalMessage()` which surfaces these.

### Singleton vs. per-request client

Creating `new Anthropic()` inside a per-request handler is harmless but wasteful (connection pool is not reused). Use the singleton from `lib/anthropic.ts`. Per-request options (timeout, maxRetries) can still be overridden on individual calls.

---

## ALWAYS

- Cache long system prompts — if your system prompt exceeds the model's threshold, add `cache_control: { type: "ephemeral" }` to the stable block. No exception.
- Pick the smallest sufficient model: Haiku for fast/cheap tasks, Sonnet as default, Opus only for hard reasoning or agentic work.
- Escalate to the top tier when the cheaper model misses the bar for output the user reads directly (generated copy, UX text, high-stakes analysis) — judge it on output quality, not price; escalating costs less than shipping mediocre user-facing output. (Installed 2026-07-07, not yet proven in a live run in this framework's projects.)
- Run all Anthropic API calls server-side — Server Action, Route Handler, or background job. Never from client components.
- Log `response.usage` on every request (input, output, cache_write, cache_read, latency).
- Include `_request_id` in every error log.
- Set `export const runtime = "nodejs"` explicitly on AI Route Handlers.
- Verify model IDs against `platform.claude.com` — the model family changes and deprecated models stop working.
- Pre-warm the cache before traffic spikes, not concurrently with the first real requests.

---

## NEVER

- Embed `ANTHROPIC_API_KEY` in client-side code or prefix it with `NEXT_PUBLIC_`.
- Default to Opus when Sonnet suffices — Opus is 5x the input cost and 5x the output cost.
- Skip prompt caching on a stable system prompt that exceeds the model's minimum threshold.
- Assume the 1024-token cache threshold applies universally — it applies only to Opus 4.1 and earlier, Sonnet 4.5 and earlier.
- Use prefilling (partial assistant message) with Opus 4.7, Opus 4.6, or Sonnet 4.6 — it returns 400.
- Treat `usage.input_tokens` as total input — it excludes cached tokens.
- Use `max_tokens > ~8000` without streaming in a Vercel Route Handler — timeouts will occur.
- Fire parallel requests before the cache is warm — each parallel request writes its own cache.
- Use the `"persistent"` cache type — it does not exist. Only `"ephemeral"` is valid.

---

## Cross-references

- **AI_KB_2** — RAG, embeddings, vector search patterns
- **AI_KB_3** — Streaming UI in Next.js (ReadableStream, `useChat`, client event handling)
- **AI_KB_4** — Tool use, agents, MCP, structured outputs, evals
- **JOB_KB_4** — Long-running AI jobs via Trigger.dev / Inngest (for tasks exceeding Vercel's `maxDuration`)
- **OBS_KB_2** — Error tracking for AI calls (Sentry integration, error classification)
- **OBS_KB_4** — Cost and latency monitoring, alerting on token spend
- `platform.claude.com/docs/en/docs/build-with-claude/prompt-caching` — authoritative caching reference
- `platform.claude.com/docs/en/docs/about-claude/models/overview` — current model IDs and context windows
- `platform.claude.com/docs/en/about-claude/pricing` — pricing table (verify before cost estimates)
- `platform.claude.com/docs/en/api/rate-limits` — tier limits and ITPM cache exclusion rules

---

*Last verified: 2026-05-04 against platform.claude.com (redirects from docs.anthropic.com)*
