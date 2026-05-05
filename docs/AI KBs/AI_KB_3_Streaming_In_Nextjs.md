# AI_KB_3 — Streaming In Next.js

**Stack-locked: Vercel AI SDK v6 + @ai-sdk/anthropic + Next.js App Router + Supabase + Vercel.**

---

## Why this matters

Streaming is UX-critical for LLM responses. Without streaming, a 1000-token reply at 60 tok/s means a 16-second blank screen before the first word appears. With streaming, the first token arrives in ~200ms and the user reads while the model writes. Time-to-first-byte (TTFB) is the primary UX lever for AI features.

AI SDK v6 is a major breaking release. The import paths, message shape, response helpers, and structured-output API all changed from v4/v5. Most tutorials on the web, and most LLM training data, describe v4. Code examples using `'ai/react'`, `StreamingTextResponse`, `generateObject`, or `content: string` messages are outdated and will not compile against v6. Read this KB before writing any streaming code.

The reference docs domain permanently moved from `sdk.vercel.ai` to `ai-sdk.dev` (HTTP 301). Use `ai-sdk.dev` for all documentation lookups.

---

## Stack assumptions

- `ai@^6.0.0` — core streaming primitives
- `@ai-sdk/anthropic@^2.0.0` — Anthropic provider (major version tracks `ai`) [verify current sub-package version against ai-sdk.dev]
- `@ai-sdk/react@^2.0.0` — React hooks (`useChat`, `useCompletion`, `useObject`) [verify current sub-package version]
- `zod@^4.1.8` — required for structured output schemas; Zod v3 is incompatible
- Next.js 15 or 16 App Router
- Supabase for auth and persistence; `@supabase/ssr` for server-side session reading
- Vercel deployment with Fluid Compute enabled (the default)
- Trigger.dev or Inngest for jobs that exceed Vercel's streaming duration limits

---

## Vercel AI SDK v6 overview

### Package installation

```bash
pnpm add ai @ai-sdk/anthropic @ai-sdk/react zod
```

Do NOT install `ai/react` — that was the v4 sub-path export, removed in v5. Do NOT install `@ai-sdk/rsc` for new work — it is experimental and unrecommended for production.

### What lives where

| Package | Exports |
|---------|---------|
| `ai` | `streamText`, `generateText`, `Output`, `smoothStream`, `createUIMessageStream`, `convertToModelMessages`, `UIMessage`, `ModelMessage`, `createIdGenerator` |
| `@ai-sdk/anthropic` | `anthropic`, `createAnthropic` |
| `@ai-sdk/react` | `useChat`, `useCompletion`, `useObject` |

### v4 → v6 migration: what changed

| Area | v4 (DO NOT USE) | v6 (current) |
|------|-----------------|--------------|
| Hook import | `'ai/react'` | `'@ai-sdk/react'` |
| Message type | `Message` | `UIMessage` |
| CoreMessage type | `CoreMessage` | `ModelMessage` |
| Message content | `content: string` | `parts: Part[]` |
| Convert messages | `convertToCoreMessages()` (sync) | `convertToModelMessages()` (async — must await) |
| Custom stream data | `StreamData` class | `createUIMessageStream` |
| Max tool steps | `maxSteps: 5` in `useChat` | `stopWhen: stepCountIs(5)` on server |
| Initial messages | `initialMessages: [...]` | `messages: [...]` |
| Tool parameters | `parameters: z.object(...)` | `inputSchema: z.object(...)` |
| Token limit | `maxTokens` | `maxOutputTokens` |
| Response method | `toDataStreamResponse()` | `toUIMessageStreamResponse()` |
| Streaming class | `new StreamingTextResponse(...)` — REMOVED | `result.toUIMessageStreamResponse()` |
| Structured output | `generateObject()` / `streamObject()` — DEPRECATED | `generateText()` / `streamText()` with `Output.object({ schema })` |

---

## Server-side primitives

### `streamText` — primary streaming primitive

`streamText` does not return a Promise. It returns a `StreamTextResult` immediately, and the actual LLM call begins lazily when the result is consumed (by returning a response or iterating the stream).

```typescript
import { streamText, Output, smoothStream } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

const result = streamText({
  model: anthropic('claude-sonnet-4-6'),
  system: 'You are a helpful assistant.',
  messages: await convertToModelMessages(uiMessages),  // always await in v6
  maxOutputTokens: 4096,                               // was maxTokens in v4
  abortSignal: req.signal,                             // forward for client cancellation
  experimental_transform: smoothStream({ delayInMs: 20, chunking: 'word' }),
  onError: ({ error }) => {
    console.error('[streamText]', error)               // log server-side; not thrown
  },
  onFinish: async ({ text, usage, finishReason, response }) => {
    // Fires after the full stream completes — could be 60s after handler returns
    await persistCompletedMessage({ text, usage })
  },
  onAbort: async ({ steps }) => {
    await logAbortEvent({ completedSteps: steps.length })
  },
})
```

**Key `StreamTextResult` properties:** `toUIMessageStreamResponse()` (for `useChat`), `toTextStreamResponse()` (for `useCompletion`), `consumeStream()` (do NOT await — disconnect safety), `textStream` (raw text deltas), `fullStream` (typed events), `await result.text` / `result.usage` / `result.finishReason` (lazy promises that resolve after stream completes).

### `generateText` — non-streaming

Use for background jobs, server-side automation, or any case where you don't need token-by-token rendering. Returns a real Promise: `const { text, usage, finishReason } = await generateText({ model, prompt, maxOutputTokens })`. For structured output, add `output: Output.object({ schema })` and read `result.output`.

### Structured output: `Output.object()` (v6)

`generateObject` and `streamObject` are deprecated in v6. Use `Output.*()` modifiers on `generateText` / `streamText` instead.

```typescript
import { generateText, streamText, Output } from 'ai'
import { z } from 'zod'  // must be zod v4

const ExtractionSchema = z.object({
  summary: z.string().describe('One-sentence summary'),
  tags: z.array(z.string()),
  sentiment: z.enum(['positive', 'neutral', 'negative']),
})

// Non-streaming: use generateText
const { output } = await generateText({
  model: anthropic('claude-sonnet-4-6'),
  output: Output.object({ schema: ExtractionSchema }),
  prompt: 'Extract from this text: ...',
})
// output is typed as z.infer<typeof ExtractionSchema>

// Streaming: use streamText with partialOutputStream
const result = streamText({
  model: anthropic('claude-sonnet-4-6'),
  output: Output.object({ schema: ExtractionSchema }),
  prompt: 'Extract from this text: ...',
})

for await (const partial of result.partialOutputStream) {
  // partial is Partial<ExtractionSchema> — updates as tokens arrive
  console.log(partial.summary)
}
```

Other `Output` variants: `Output.text()` (default), `Output.array({ element })` (complete elements via `result.elementStream`), `Output.choice({ options })` (enum), `Output.json()` (unstructured). Validation failures throw `AI_NoObjectGeneratedError`.

---

## Client hooks

### `useChat` — multi-turn conversation

Import from `@ai-sdk/react`, not `'ai/react'`.

```typescript
'use client'

import { useChat } from '@ai-sdk/react'

export function ChatUI({ initialMessages }: { initialMessages: UIMessage[] }) {
  const [input, setInput] = useState('')
  const { messages, status, error, sendMessage, stop, regenerate } = useChat({
    api: '/api/chat',
    messages: initialMessages,           // was initialMessages in v4 — prop renamed
    experimental_throttle: 50,          // ms between re-renders
    onFinish: ({ messages }) => {       // use callback arg, not state var — avoids stale closure
      console.log('Done', messages.length)
    },
  })

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>
          {m.parts.map((part, i) => {   // parts[], NOT content — see gotchas
            if (part.type === 'text') return <p key={i}>{part.text}</p>
            if (part.type === 'reasoning') return <details key={i}><summary>Reasoning</summary><p>{part.text}</p></details>
            return null
          })}
        </div>
      ))}

      {(status === 'submitted' || status === 'streaming') && <button onClick={stop}>Stop</button>}
      {error && <><p>Something went wrong.</p><button onClick={() => regenerate()}>Retry</button></>}

      <form onSubmit={e => { e.preventDefault(); sendMessage({ text: input }); setInput('') }}>
        <input value={input} onChange={e => setInput(e.target.value)} disabled={status === 'error'} />
      </form>
    </div>
  )
}
```

**UIMessage shape (v6):**

```typescript
{
  id: string,
  role: 'user' | 'assistant' | 'system',
  parts: UIMessagePart[],   // NOT content: string
  metadata?: unknown,
}

// UIMessagePart examples:
{ type: 'text', text: 'Hello world' }
{ type: 'reasoning', text: 'Let me think through this...' }
{ type: 'tool-getWeather', state: 'output-available', input: { city: 'NYC' }, output: { temp: 72 } }
{ type: 'file', url: 'https://...', mediaType: 'image/png' }
```

`useChat` supports tool calling — see AI_KB_4 for the full tool use pattern. The key hooks are `onToolCall` (client-side tools) and `addToolOutput()` (submitting results).

### `useCompletion` — single-turn text completion

Use for generation tasks with no message history: summarize, translate, fill in a field. The server handler returns `result.toTextStreamResponse()` (not `toUIMessageStreamResponse`). Key state: `{ completion, input, isLoading, error, handleInputChange, handleSubmit, stop }`. Import from `@ai-sdk/react`.

### When to use which hook

| Hook | Use case |
|------|----------|
| `useChat` | Multi-turn conversation with history — 90% of LLM UI |
| `useCompletion` | Single-turn generation (no history): summarize, translate, fill-in |
| `useObject` | Streaming structured JSON: form prefill, classification, real-time structured display [experimental] |

---

## App Router: Route Handlers

Route Handlers are the recommended integration point for `useChat`. They support streaming responses, work with Supabase auth cookies, and can set `maxDuration` per-route.

### Canonical chat handler

```typescript
// app/api/chat/route.ts
import { convertToModelMessages, streamText, UIMessage, createIdGenerator } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'   // always Node for Anthropic streaming — not Edge
export const maxDuration = 60     // seconds; override per-route as needed

export async function POST(req: Request) {
  // Auth check — see AUTH_KB_4 for full Supabase server client setup
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (c) => c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  )
  const { data: { claims }, error: authError } = await supabase.auth.getClaims()
  if (authError || !claims) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Capture user ID now — onFinish closure runs after the response is sent,
  // and the request context (cookies, headers) may no longer be accessible.
  const userId = claims.sub

  const { messages, chatId }: { messages: UIMessage[], chatId: string } = await req.json()

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: 'You are a helpful assistant.',
    messages: await convertToModelMessages(messages),  // async in v6 — always await
    maxOutputTokens: 4096,
    abortSignal: req.signal,                          // forward for client stop()
    onError: ({ error }) => {
      console.error('[chat] streamText error:', error)
    },
    onAbort: async ({ steps }) => {
      await logAbort({ userId, chatId, completedSteps: steps.length })
    },
  })

  // Call consumeStream() (do NOT await) so onFinish fires even if the client disconnects.
  result.consumeStream()

  return result.toUIMessageStreamResponse({
    generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 }),
    originalMessages: messages,
    onFinish: async ({ messages: allMessages }) => {
      // allMessages includes user + new assistant message
      try {
        const serviceSupabase = createServiceRoleClient()  // use service role for persistence
        await serviceSupabase.from('messages').upsert(
          allMessages.map(m => ({
            id: m.id,
            chat_id: chatId,
            user_id: userId,
            role: m.role,
            parts: m.parts,
            created_at: new Date().toISOString(),
          }))
        )
      } catch (err) {
        console.error('[chat] onFinish persist failed:', err)
        // Client already received the stream — this is a silent background failure.
        // Consider: retry queue, alerting, dead letter.
      }
    },
  })
}
```

**Key facts for this handler:**
- `convertToModelMessages()` is async in v6 — forgetting `await` silently passes a `Promise` to `streamText` and breaks generation.
- `req.signal` must be forwarded to `abortSignal`. Without it, a client `stop()` call has no server-side effect and Anthropic's API keeps generating.
- `toUIMessageStreamResponse()` sets `Content-Type: text/event-stream` and `x-vercel-ai-ui-message-stream: v1` automatically.
- Capture `userId` before the async streaming boundary — the request context is not reliably available inside `onFinish`.

### Simple completion handler

For `useCompletion` consumers: same structure but return `result.toTextStreamResponse()` instead of `toUIMessageStreamResponse()`. The route accepts `{ prompt }` from the request body.

---

## App Router: Server Actions

**AI SDK RSC (`streamUI`, `createStreamableValue`, `createStreamableUI`) is explicitly experimental and not recommended for production.** The official docs state: "AI SDK RSC is currently experimental. We recommend using AI SDK UI for production." Do not use `@ai-sdk/rsc` exports for new work.

For `useChat` integration, use Route Handlers. Server Actions are appropriate for non-chat streaming where you control the consumption loop directly in the component — for example, triggering a generation and writing partial results to a server state store, then polling from the client.

Use `createUIMessageStream` (in a Route Handler) when you need to inject custom data parts before or alongside the LLM stream:

```typescript
// app/api/chat/route.ts — custom stream composition
const stream = createUIMessageStream({
  async execute({ writer }) {
    writer.write({ type: 'data-context', data: { retrievedDocs: 3 } })  // custom part
    writer.merge(streamText({ model, messages: await convertToModelMessages(msgs) }).toUIMessageStream())
  },
  onError: (error) => `An error occurred: ${error.message}`,
  onFinish: async ({ messages }) => { await persistMessages(messages) },
})
return new Response(stream)
```

---

## Runtime and timeouts

### Always use Node.js runtime for Anthropic

Set `export const runtime = 'nodejs'` (or omit — Node is the default). Do not use Edge for AI streaming routes. Edge restrictions that break AI routes: no Node.js native APIs, smaller bundle size limits (large provider SDKs may exceed them), additional cold-start overhead on long streams. The latency advantage of Edge is irrelevant — AI routes are TTFB-dominated by the LLM, not the runtime startup.

### `maxDuration` — per-route execution limit

```typescript
// Set this in every AI route handler
export const maxDuration = 60  // seconds
```

Set `maxDuration` to the realistic worst-case for the route, not the platform maximum. A chat handler that should respond in 30s should set `maxDuration = 60` (2x headroom), not `800`.

### Fluid Compute duration limits (Vercel, as of 2026-05-04)

Fluid Compute is enabled by default on Vercel and supersedes the old "10s Edge / 30s Node" mental model.

| Plan | Default max | Configurable max |
|------|-------------|-----------------|
| Hobby | 300s (5 min) | 300s (5 min) |
| Pro | 300s (5 min) | 800s (13 min) |
| Enterprise | 300s (5 min) | 800s (13 min) |

[verify against current Vercel docs — limits may change]

Most chat responses complete in under 60 seconds. Long-running agent loops that might run for 5–13 minutes approach the platform ceiling.

---

## When to push to Trigger.dev / Inngest

See JOB_KB_4 for full Trigger.dev and Inngest patterns.

Push AI work to a background job when any of these are true:

- The generation could take more than 5 minutes on Hobby or 13 minutes on Pro
- The task is queued work (batch summarization, nightly report generation) with no live user waiting
- You need retry semantics on failure
- You need fan-out: one request triggers N parallel LLM calls
- The result is consumed asynchronously (user checks back later, email on completion)

**Decision criteria:**

```
User is actively watching the stream? → Route Handler + streaming
Generation takes > maxDuration?       → Trigger.dev / Inngest
Queued / scheduled / batch work?      → Trigger.dev / Inngest
Need retries with backoff?            → Trigger.dev / Inngest
```

**Pattern:** Accept synchronously → enqueue to Trigger.dev/Inngest → return `{ runId }` → client subscribes via Supabase Realtime (SB_KB_8) or polls a status endpoint. See JOB_KB_4 for the full task definition.

---

## Abort signals and disconnect safety

### Client-side cancellation

```typescript
const { stop, status } = useChat({ api: '/api/chat' })

// Show stop button while the request is in flight
{(status === 'submitted' || status === 'streaming') && (
  <button onClick={stop}>Stop generating</button>
)}
```

Calling `stop()` aborts the browser's `fetch` via `AbortController`. This fires `req.signal.aborted = true` on the server.

**Incompatibility:** `stop()` and `resume: true` are mutually exclusive in `useChat`. If you implement stream resumption, remove the stop button or accept that resumption will not work.

### Server-side abort handling

```typescript
const result = streamText({
  model: anthropic('claude-sonnet-4-6'),
  messages: await convertToModelMessages(messages),
  abortSignal: req.signal,
  onAbort: async ({ steps }) => {
    // Called when the client fires stop()
    // steps[] contains completed tool-call steps so far
    await savePartialConversation({ userId, steps })
  },
  onFinish: async ({ text, isAborted }) => {
    if (!isAborted) {
      await saveFinalResponse(text)
    }
  },
})
```

### `consumeStream()` — disconnect safety

When the client disconnects mid-stream (browser tab closed, network drop), the HTTP response body reader is cancelled. Without `consumeStream()`, the `onFinish` callback may never fire because the stream is abandoned.

```typescript
// Call without await — fire and forget.
// This ensures the stream is fully consumed server-side even if the client disconnects.
result.consumeStream()

return result.toUIMessageStreamResponse({
  onFinish: async ({ messages }) => {
    // This now fires reliably regardless of client connectivity
    await persistMessages(messages)
  },
})
```

Do not `await consumeStream()` — it returns a Promise that resolves after the stream ends, which would block the route handler from returning the response.

---

## Error handling mid-stream

### Server-side: errors are emitted, not thrown

Unlike `generateText` (which throws synchronously on failure), `streamText` emits errors as events in the stream. The handler does not crash — the stream emits an `error` part.

```typescript
const result = streamText({
  model: anthropic('claude-sonnet-4-6'),
  messages: await convertToModelMessages(messages),
  onError: ({ error }) => {
    // Server-side only — error still propagates to client as SSE event
    console.error('[streamText error]', error)
    Sentry.captureException(error)
  },
})
```

The SSE wire format for an error:
```
data: {"type":"error","errorText":"Rate limit exceeded"}
```

`useChat` translates this into `status === 'error'` and populates the `error` state.

### Client-side error recovery

Two patterns:
- **Retry:** `{error && <button onClick={() => regenerate()}>Retry</button>}` — resends the last user message.
- **Dismiss:** Call `setMessages(messages.slice(0, -1))` to remove the failed message and let the user retype.

Never surface `error.message` or `error.stack` to users — it may expose API details or stack traces. Use generic copy. Disable input while in error state: `<input disabled={status === 'error'} />`.

---

## UI state machine

### `useChat` status values

```
'ready'      — idle, waiting for user input
'submitted'  — sendMessage() called, waiting for first token
'streaming'  — receiving tokens from the server
'error'      — request failed or stream emitted an error part
```

The old `isLoading: boolean` from v4 is gone. Use `status !== 'ready'` to check if a request is in flight.

### State transitions

```
ready ──sendMessage()──→ submitted ──first chunk──→ streaming ──done──→ ready
  ↑                          │                          │
  └──clearError()────────────┴──────error──────────── error
  └──stop()───────────────────────────────────────────────────────────→ ready
```

### Race conditions

**1. Stale closure in `onFinish`.**

The `messages` state variable from `useChat` is captured at the time the hook renders. If the user sends another message before `onFinish` fires, the state variable is stale.

```typescript
// WRONG — stale closure:
const { messages } = useChat({
  onFinish: () => {
    saveToLocalStorage(messages)  // stale messages from before the stream
  }
})

// RIGHT — use the argument passed to the callback:
useChat({
  onFinish: ({ messages }) => {
    saveToLocalStorage(messages)  // fresh from the stream
  }
})
```

**2. `onFinish` timing on the server.** Fires 30–60s after the HTTP response is sent. If the database write throws, the client already received the response — it's a silent failure. Always wrap in try/catch and log.

**3. React StrictMode double-send.** In development, StrictMode double-invokes effects. `sendMessage` may appear to fire twice. Add request deduplication by request ID server-side, or test in production mode before concluding there is a bug.

---

## Smooth rendering

### `smoothStream` — control how tokens are released to the UI

By default, every text-delta SSE event triggers a re-render. On fast models this causes jank. `smoothStream` buffers tokens and releases them in configured chunks.

```typescript
import { streamText, smoothStream } from 'ai'

const result = streamText({
  model: anthropic('claude-sonnet-4-6'),
  messages,
  experimental_transform: smoothStream({
    delayInMs: 20,        // ms between chunk releases (default: 10)
    chunking: 'word',     // default — splits on whitespace
  }),
})
```

Chunking modes: `'word'` (default — splits on whitespace, does NOT work for CJK/Vietnamese/Thai), `'line'` (code streaming), `RegExp`, `Intl.Segmenter` (locale-aware, recommended for non-Latin), or a custom function. CJK-safe: `chunking: new Intl.Segmenter('zh', { granularity: 'word' })`.

Non-text parts (tool calls, step-finish) pass through immediately, never buffered. Multiple transforms: `experimental_transform: [smoothStream({ delayInMs: 20 }), customLogger()]` — applied in order. Simpler alternative: `useChat({ experimental_throttle: 50 })` throttles re-renders without changing chunk shape.

---

## Persistence

### Server-side ID generation (required for stable persistence)

Do not trust client-supplied message IDs. The client generates IDs with `nanoid()` by default; if the page reloads, the IDs regenerate and you cannot match them to database rows.

Generate IDs server-side and include them in the SSE stream — `useChat` adopts them:

```typescript
import { createIdGenerator } from 'ai'

return result.toUIMessageStreamResponse({
  generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 }),
  // IDs are emitted in the stream start event:
  // data: {"type":"start","messageId":"msg-a1b2c3d4e5f6g7h8"}
  // useChat adopts this ID for the message in local state.
})
```

### Save on stream completion (`onFinish`)

This is the recommended pattern for most apps. The full message (including generated text) is available in `onFinish`.

```typescript
return result.toUIMessageStreamResponse({
  generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 }),
  originalMessages: messages,  // include so onFinish sees user message too
  onFinish: async ({ messages: allMessages }) => {
    try {
      // Use service role — request cookies may be unavailable here
      await serviceSupabase.from('messages').upsert(
        allMessages.map(m => ({
          id: m.id,
          chat_id: chatId,
          user_id: userId,    // captured before streaming began
          role: m.role,
          parts: m.parts,
        }))
      )
    } catch (err) {
      console.error('[onFinish] persist failed:', err)
    }
  },
})
```

**Supabase client in `onFinish`:** The request context (cookies, session) may not be accessible inside `onFinish` because it runs after the HTTP response is sent. Use a service role client for persistence, and pass `userId` via closure captured before `streamText` is called. See AUTH_KB_4 for service role client setup.

### Load existing chat history

Query `messages` ordered by `created_at` in a Server Component or layout, then pass to `useChat` as `messages: storedMessages as UIMessage[]`. The `messages` prop (not `initialMessages` — renamed in v6) hydrates the client state.

### Incremental saving for crash recovery (advanced)

For very long responses, use `onChunk` to periodically upsert partial text into a `partial_responses` table, then clean up in `onFinish`. Only worth the complexity for responses long enough that a mid-stream crash is a meaningful UX problem (5+ minute document generations). [verify: throttle DB writes — do not upsert on every chunk]

---

## Direct SSE escape hatch

Use the AI SDK for 95% of cases. Drop to the native Anthropic SDK when you need:
- Raw Anthropic event types before the SDK normalizes them (e.g., `input_json_delta` for streaming tool input)
- Custom SSE protocols for non-`useChat` consumers (mobile apps, third-party clients)
- Anthropic extended features not yet exposed in `@ai-sdk/anthropic`

```typescript
// app/api/chat/native/route.ts
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: Request) {
  const { messages } = await req.json()
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const anthropicStream = await client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          messages,
        })

        for await (const event of anthropicStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            const data = `data: ${JSON.stringify({ type: 'text', delta: event.delta.text })}\n\n`
            controller.enqueue(encoder.encode(data))
          }
          if (event.type === 'message_stop') {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          }
        }
        controller.close()
      } catch (err) {
        controller.error(err)
      }
    },
    cancel() {
      // Client disconnected — stream cleanup via GC.
      // If you held an AbortController, call .abort() here.
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',   // prevents Nginx proxy buffering
      'Connection': 'keep-alive',
    },
  })
}
```

**Consuming a custom SSE stream client-side (without `useChat`):** Create an `AbortController`, fetch with `signal: controller.signal`, get `res.body!.getReader()`, decode chunks with `TextDecoder`, split on `'\n'`, parse `data: ` prefixed lines as JSON, skip `data: [DONE]`. Return `() => controller.abort()` as a cancel function.

---

## Backpressure / slow clients

The AI SDK uses pull-based `ReadableStream` internally — the stream only requests the next token from Anthropic when the consumer is ready. This prevents memory growth when the client reads slowly. When building custom SSE handlers, prefer the `pull` handler over `start`:

```typescript
// GOOD: pull-based — lazy, respects consumer pace
new ReadableStream({ async pull(controller) {
  const { value, done } = await iterator.next()
  done ? controller.close() : controller.enqueue(value)
}})

// BAD: start-based — produces faster than client can consume, unbounded queue
new ReadableStream({ async start(controller) {
  for await (const v of iterator) { controller.enqueue(v) }
}})
```

When a client disconnects, `req.signal.aborted` becomes `true`, `onAbort` fires, and the pull loop stops naturally. No explicit teardown needed.

**Nginx / reverse proxy buffering:** Add `X-Accel-Buffering: no` to manual SSE responses. Without it, Nginx holds tokens until the buffer fills, which looks like stalling. `toUIMessageStreamResponse()` sets this header automatically on Vercel.

---

## Common gotchas

**`'ai/react'` import is broken.** This was the v4 sub-path export. It no longer exists. Any code or tutorial using `import { useChat } from 'ai/react'` must be updated to `import { useChat } from '@ai-sdk/react'`.

**`content: string` vs `parts: Part[]`.** v4 messages had `content: 'Hello'`. v6 UIMessage uses `parts: [{ type: 'text', text: 'Hello' }]`. Rendering code that reads `message.content` silently renders nothing — no error, just blank. Always iterate `m.parts`.

**`generateObject` / `streamObject` are deprecated.** Any v4/v5 examples using these as top-level imports will fail in v6. Use `generateText` / `streamText` with `Output.object({ schema })`.

**`StreamingTextResponse` class is removed.** `new StreamingTextResponse(result.toAIStream())` from v4 does not exist. Use `result.toUIMessageStreamResponse()` or `result.toTextStreamResponse()`.

**`convertToModelMessages` is async.** Omitting `await` produces a `Promise<ModelMessage[]>` which `streamText` cannot process. The error is silent or produces a confusing type error. Always `await convertToModelMessages(messages)`.

**Zod v3 is incompatible.** AI SDK v5+ requires Zod v4 (`zod@^4.1.8`). If `Output.object()` throws an unexpected error, check `package.json` for the Zod version first.

**AI SDK RSC is experimental.** `streamUI` and `createStreamableValue` from `@ai-sdk/rsc` are marked experimental. Do not use them for production features. They are not deprecated in the sense that they exist, but they are explicitly recommended against for production use.

**Hydration mismatches from streaming state.** If an assistant message is "in progress" during SSR, partial content in the server HTML will conflict with the empty initial state in the client. Keep chat UIs as `'use client'` components — do not render streaming state in Server Components.

**`onFinish` is a background operation.** It fires long after the HTTP response is sent. Unhandled promise rejections inside `onFinish` are silent from the client's perspective. Always wrap in try/catch.

**Service role for `onFinish` persistence.** The user's session cookie is not reliably accessible inside `onFinish`. Use a service role Supabase client for database writes, and capture `userId` in the route handler before the streaming response begins.

**`useChat` `initialMessages` renamed.** The prop is now `messages` (not `initialMessages`). Passing `initialMessages` to `useChat` does nothing in v6 — no error, messages just don't hydrate.

---

## ALWAYS

- Use `runtime = 'nodejs'` for Anthropic streaming route handlers — not Edge
- Set `maxDuration` explicitly on every AI route handler to bound execution
- Forward `req.signal` to `abortSignal` in `streamText` so client `stop()` cleans up server resources
- Call `result.consumeStream()` (without `await`) before returning `toUIMessageStreamResponse()` to ensure `onFinish` fires on client disconnect
- Generate message IDs server-side via `createIdGenerator` in `toUIMessageStreamResponse` — never trust client-supplied IDs for persistence
- Capture `userId` (and any other request-context data) before streaming begins, then use it via closure in `onFinish`
- Use a service role Supabase client inside `onFinish` for database writes — the user session may be unavailable
- Wrap `onFinish` logic in try/catch and log failures — the client is unaffected but failures are invisible otherwise
- Push to Trigger.dev/Inngest when generation could exceed Vercel's duration limits or when work is queued/batch

---

## NEVER

- Use `import { useChat } from 'ai/react'` — this is the v4 import; it does not exist in v6
- Use `generateObject()` or `streamObject()` — deprecated in v6; use `Output.object()` instead
- Use `new StreamingTextResponse(...)` — removed in v5; use `toUIMessageStreamResponse()`
- Use AI SDK RSC (`streamUI`, `createStreamableValue`) in production code — experimental and explicitly unrecommended
- Run unbounded streams — always set `maxOutputTokens` and `maxDuration`
- Trust client-supplied message IDs for persistence — generate server-side
- Await `consumeStream()` — it blocks the route handler from returning the response
- Read `message.content` in the UI — v6 messages use `parts`, not `content`; `content` reads silently return `undefined`
- Surface raw error messages or stack traces to users — always show generic error copy
- Use `scope: 'global'` for sign-out inadvertently — be explicit with auth scope (see AUTH_KB_4)

---

## Cross-references

- **AI_KB_1** — Anthropic API base configuration, prompt caching, model selection. Provider setup with cache control (`providerOptions.anthropic.cacheControl`) belongs there, not here.
- **AI_KB_2** — RAG patterns, embeddings, vector search, context injection into the messages array.
- **AI_KB_4** — Tool use loop, server-side tools, client-side tools with `addToolOutput()`, multi-step agents, MCP integration. `useChat` supports tool calling — see AI_KB_4 for the full pattern.
- **AUTH_KB_4** — Auth check in Route Handlers (`getClaims()`, Supabase server client setup, cookie wiring). The inline auth snippet in this KB is abbreviated — AUTH_KB_4 has the canonical version.
- **JOB_KB_4** — Trigger.dev and Inngest patterns for long-running AI jobs that exceed Vercel streaming limits, queued generation, and batch processing.
- **SB_KB_8** — Supabase Realtime for async job status polling; Next.js + Vercel runtime patterns for multi-tenant routing that composes with auth.
