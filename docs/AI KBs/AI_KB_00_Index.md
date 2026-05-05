# AI Knowledge Base — Index

**Stack:** Anthropic via `@anthropic-ai/sdk` (Node, server-only) + Voyage AI embeddings + pgvector in Supabase Postgres + Vercel AI SDK v6 (`ai` + `@ai-sdk/anthropic` + `@ai-sdk/react`) + `@anthropic-ai/claude-agent-sdk` for opinionated agent patterns + `@modelcontextprotocol/sdk` for MCP servers.

This folder owns Claude integration end-to-end: API plumbing and prompt caching, retrieval-augmented generation with pgvector, streaming UI in the App Router, and tools / agents / MCP / evals. The LLM provider is **Anthropic only**. OpenAI / Gemini / Mistral / open-source LLMs and fine-tuning are explicitly out of scope.

AI APIs change faster than anything else in the stack — Anthropic SDK, Vercel AI SDK, Voyage embeddings, pgvector, Claude Agent SDK, MCP. **Verify model IDs and SDK shapes against primary docs before relying on a pattern in production.** As of 2026-05-04 the Claude family is Opus 4.7 / Sonnet 4.6 / Haiku 4.5; that may have shifted by the time you read this.

These files are for Claude. Principles-only docs fail at implementation time. Every KB has real TypeScript, real SQL, and real gotchas.

---

## File index

| File | Topic | Stack-portable? |
|---|---|---|
| `AI_KB_1_Anthropic_API_Patterns.md` | `@anthropic-ai/sdk` setup; request/response; system prompts; **prompt caching deep-dive** (model-specific thresholds: 4096 / 2048 / 1024); model-selection table; server-side streaming; error handling and retries; rate limits with cache-aware ITPM; cost discipline via `response.usage`; Node-runtime requirement; gotchas (Opus 4.7 tokenizer, prefilling unsupported on 4.6+ models) | 🔒 Stack-locked: Anthropic-specific |
| `AI_KB_2_RAG_With_pgvector.md` | Voyage AI embeddings (voyage-4 family) with `input_type` semantics; pgvector setup with `halfvec(2048)` workaround for the 2000-dim HNSW limit; HNSW index parameters and the post-scan filter problem; distance operators (`<->`, `<=>`, `<#>`); chunking strategies (fixed / semantic / recursive / parent-child); embedding pipeline (sync vs Trigger.dev async); hybrid search via Supabase RRF SQL function; retrieval evaluation; RAG anti-patterns | 🔓 Mostly portable: pgvector + Voyage; Supabase-specific bits flagged |
| `AI_KB_3_Streaming_In_Nextjs.md` | Vercel AI SDK v6 (`ai` + `@ai-sdk/react` + `@ai-sdk/anthropic`); v4→v5→v6 migration map; `streamText` / `generateText` / `Output.object()`; `useChat` / `useCompletion`; Route Handlers and Server Actions; Fluid Compute timeouts (Hobby 300s, Pro/Ent 800s) and `maxDuration`; abort signals + `consumeStream()`; UI state machine; smooth rendering; persistence via server-generated IDs + `onFinish`; direct SSE escape hatch | 🔒 Stack-locked: Next.js App Router + Vercel AI SDK v6 |
| `AI_KB_4_Tools_Agents_Evals.md` | Claude tools API (three categories, `tool_use` / `tool_result` formatting rules, `tool_choice`); **mandatory** server-side Zod validation; bounded agent loops (max-iter 10); tool-use caching via `cache_control` on last tool; `beta.messages.toolRunner`; **MCP** (spec `2025-11-25`, Streamable HTTP transport, `@modelcontextprotocol/sdk` v1.x) — building servers and consuming via Claude Agent SDK or MCP Connector; `@anthropic-ai/claude-agent-sdk` (renamed from `claude-code-sdk`); evals (golden sets, judge-model with Opus grading Sonnet, bias mitigation, sampling); long-running agents → Trigger.dev/Inngest | 🔒 Stack-locked: Anthropic + MCP-specific |

---

## Model selection guide

The default policy: **Sonnet first, Haiku where speed/cost dominates, Opus only when reasoning quality justifies the 5x input-cost gap.**

| Model | API ID | Use case | Context | Max output | Input $/MTok | Output $/MTok | Cache threshold |
|---|---|---|---|---|---|---|---|
| Opus 4.7 | `claude-opus-4-7` | Complex reasoning, novel code, agentic loops, high-stakes analysis, judge model for evals | 1M | 128k | $5 | $25 | 4096 tokens |
| Sonnet 4.6 | `claude-sonnet-4-6` | **Default for most app features**; structured extraction at scale; tool-using agents | 1M | 64k | $3 | $15 | 2048 tokens |
| Haiku 4.5 | `claude-haiku-4-5` | Classification, tagging, extraction, quick Q&A, high-throughput inline calls | 200k | 64k | $1 | $5 | 4096 tokens |

Pricing and thresholds verified 2026-05-04 against `platform.claude.com` — re-verify before pinning costs in code or alerting thresholds.

**Decision heuristic:**

```ts
const model = (() => {
  if (task.requiresDeepReasoning || task.isAgentic) return "claude-opus-4-7";
  if (task.outputLength > 4_000 || task.contextTokens > 100_000) return "claude-sonnet-4-6";
  return "claude-haiku-4-5";
})();
```

**Cache threshold quirk:** the threshold is **not uniform**. Opus 4.7 / 4.6 / 4.5 and Haiku 4.5 require **4096 tokens** for caching to engage. Sonnet 4.6 requires **2048 tokens**. Older Opus 4.1 / 4 and Sonnet 4.5 / 4 / 3.7 are at 1024 tokens. Caching a 1500-token system prompt on Opus 4.7 silently does nothing.

**Opus 4.7 tokenizer:** Opus 4.7 ships a new tokenizer that emits up to ~35% more tokens than older models for the same input text. Cost estimates ported from Sonnet or older Opus will under-budget Opus 4.7.

---

## Cross-cutting rules that apply everywhere

**Always:**
- Run AI calls **server-side only**. Anthropic API key never reaches client code. Even with a "secure proxy," the answer is still server-side.
- **Cache long system prompts** (above the model's threshold — 4096 / 2048 / 1024 depending on model) with `cache_control: { type: "ephemeral" }`. Skipping caching on a hot system prompt pays full price every request.
- Pick the **smallest sufficient model**. Sonnet is the default. Reach for Opus only when task quality demands it. Haiku for tagging / extraction / classification.
- Track cost per request via `response.usage` (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`). `input_tokens` is **post-cache** — total = `cache_read + cache_creation + input_tokens`.
- **Validate every tool-call argument** with Zod (or equivalent). LLMs return schema-violating JSON often enough that "trust the schema" breaks in production.
- **Bound agent loops** with a max-iteration cap (default 10). Unbounded loops are cost-runaway machines.
- Sanitize user-supplied text before embedding it. Retrieved chunks are concatenated into the next prompt — prompt injection enters via the vector store as readily as via direct user input.
- Re-embed everything when the embedding model generation changes. Mixing voyage-3 and voyage-4 vectors in one column produces silently wrong similarity rankings.
- Use **Node runtime** for Anthropic API calls in Next.js. Edge runtime has caveats with long streams; Fluid Compute (Hobby 300s, Pro/Ent 800s) is the right ceiling for most chat UX.
- Push agent runs that exceed Vercel function timeouts (~3+ tool-calling turns is the practical threshold) to **Trigger.dev or Inngest**. Cross-ref JOB_KB_4.
- Use `@anthropic-ai/claude-agent-sdk` (the **renamed** package). The old `claude-code-sdk` name is gone.
- Use **Streamable HTTP** transport when building new MCP servers. The old HTTP+SSE transport (protocol 2024-11-05) is deprecated for new server implementations — though the Anthropic MCP Connector still accepts SSE URLs for already-deployed servers.
- Generate message IDs server-side (e.g., via `createIdGenerator`) for stable persistence. Client-supplied IDs collide and break replay.
- Verify model IDs and SDK shapes against current docs at audit time. **AI APIs change quarterly**; this folder will rot without active maintenance.

**Never:**
- Embed the Anthropic API key in client code, edge config that reaches the client, or any browser-exposed env (`NEXT_PUBLIC_*`). Server-only, full stop.
- Default to Opus when Sonnet suffices. The cost gap is large; the quality gap on most tasks is small.
- Skip prompt caching on repeated system prompts. The break-even is typically the **second request** — paying full price for cacheable content is paying tax.
- Assume the universal 1024-token cache threshold. Verify per-model.
- Trust LLM tool-call arguments without server-side validation. Schemas are guidance, not contracts.
- Run unbounded agent loops. Always have a max-iteration cap and a wallclock budget.
- Embed PII without a deletion plan. Vectors persist past the source row's deletion — RLS doesn't protect against re-derivation from leaked vectors. Track `embedded_at` and a deletion path.
- Treat similarity > 0.85 as equivalence. Semantic similarity is not equality. Unique constraints belong on hashes, not on vector distances.
- Use deprecated v4/v5 Vercel AI SDK imports (`'ai/react'`, `StreamingTextResponse`, `generateObject`, `streamObject`, `streamUI`). v6 broke them all. AI SDK RSC is **explicitly experimental** — don't ship it to production.
- Build new MCP servers on the deprecated HTTP+SSE transport. Streamable HTTP for new server work; the Connector keeps SSE URL compatibility for legacy servers.
- Combine `tool_choice: "any"` or `"tool"` with extended thinking. Returns errors.
- Place `tool_result` blocks anywhere except first in the content array, or split tool results across multiple user messages. Returns 400.
- Run full eval suites at 100% sampling on every PR. Cost runaway. Sample at 20% on PRs, full suite weekly.
- Call AI APIs from Edge Runtime when streaming durations exceed Edge timeouts. Use Node runtime, or push to Trigger.dev / Inngest.
- Hard-code pricing or model IDs without `[verify]` markers. They shift, and silent breakage is worse than loud breakage.

---

## Dependencies between files

```
AI_KB_2  ← AI_KB_1   (RAG generation half uses the API and caching patterns from KB_1)
AI_KB_3  ← AI_KB_1   (streaming UI sits on top of the Anthropic streaming patterns from KB_1)
AI_KB_4  ← AI_KB_1   (tool use, agents, MCP all build on the API and caching foundations of KB_1)
AI_KB_4  ← AI_KB_2   (retrieval-augmented agents pull context via the RAG patterns of KB_2)
AI_KB_4  ← AI_KB_3   (`useChat` supports tool-calling — UI streaming + tools live together at the surface)
```

Cross-folder dependencies:

```
AI_KB_1  → JOB_KB_4   (long-running and queued generation pushes off Vercel onto Trigger.dev / Inngest)
AI_KB_1  → OBS_KB_2   (error tracking for AI calls — capture API errors, 429s, mid-stream failures)
AI_KB_1  → OBS_KB_4   (cost / latency / token-usage monitoring; alert thresholds)

AI_KB_2  → SB_KB_3    (schema patterns — chunks table, source linkage, idempotency keys)
AI_KB_2  → SB_KB_12   (RLS performance for `org_id` filters on vector queries — HNSW post-scan filter problem)
AI_KB_2  → JOB_KB_4   (Trigger.dev for batch embedding jobs and re-embedding migrations)
AI_KB_2  → AUTH_KB_4  (auth context inside Server Actions invoking embedding flows)

AI_KB_3  → AUTH_KB_4  (auth check pattern in streaming Route Handlers / Server Actions)
AI_KB_3  → SB_KB_8    (Next.js + Vercel runtime patterns; Fluid Compute ceiling)
AI_KB_3  → JOB_KB_4   (push long generations off the request path)

AI_KB_4  → JOB_KB_4   (long agent runs → Trigger.dev with state persistence and resumability)
AI_KB_4  → OBS_KB_2   (tool-call failures, agent-loop blowups, MCP transport errors)
AI_KB_4  → OBS_KB_4   (per-turn latency, cost-per-agent-run, iteration histograms)
AI_KB_4  → TEST_KB_*  (eval patterns are parallel to test patterns — golden sets, fixtures, CI gating)
AI_KB_4  → SB_KB_3    (`agent_state` and `agent_runs` table schema for resumable agents)
```

---

## When to update these files

Update the relevant AI_KB when:
- The Claude model family shifts (e.g., Opus 4.8 ships, Haiku 4.5 retires). Update model IDs, cache thresholds, pricing, knowledge cutoffs, and any decision tables.
- Anthropic changes the prompt-caching surface (new TTLs, new placement rules, threshold adjustments).
- The `@anthropic-ai/sdk` ships a major (e.g., a new `beta.messages` namespace shape, or a streaming helper rename).
- The Vercel AI SDK ships a new major. v6 was a hard break from v5; v7 will likely be similar. Migration tables in AI_KB_3 are the durable artifact.
- The `@ai-sdk/anthropic` provider changes shape (provider options, model-mapping conventions).
- pgvector adds an index type or changes HNSW defaults (e.g., `iterative_scan` becomes default rather than opt-in).
- Voyage AI ships a new generation (voyage-5) or deprecates voyage-3.x. Re-embedding cost and dimension changes are project-affecting events.
- The MCP spec version increments (currently `2025-11-25`). Transport, auth, or schema changes ripple through both server-building and consumption patterns.
- `@anthropic-ai/claude-agent-sdk` ships built-in tool changes, hook lifecycle changes, or a transport rename.
- A pattern produces an unexpected result in production.
- A new gotcha is discovered.

Do **not** update AI_KBs to reflect project-specific decisions (specific prompt copy, specific tool names, specific chunking heuristics tuned for one corpus). Those belong in project KBs (KB_1 Architecture or a dedicated AI project doc). These are stack patterns, not project docs.

---

## What these files do NOT cover

- **Other LLM providers** — OpenAI (GPT-5, o-series), Google Gemini, Mistral, Cohere, open-source LLMs (Llama, Qwen, DeepSeek). The stack is Anthropic only. Adding a second provider would mean a new folder with provider-abstraction patterns; the template doesn't carry that complexity.
- **Fine-tuning Anthropic models** — Anthropic doesn't offer general-purpose fine-tuning; this is intentional. Use prompt engineering, retrieval, and tool use instead.
- **Prompt engineering as theory** — chain-of-thought, few-shot, self-consistency, etc. are mentioned only where they intersect with API mechanics. Anthropic's prompt-engineering guide is the source.
- **Other vector stores** — Pinecone, Weaviate, Chroma, Qdrant, Milvus. The stack is pgvector. The `halfvec(2048)` and HNSW post-scan filter patterns don't transfer.
- **Other embedding providers as defaults** — OpenAI text-embedding-3 and Supabase-hosted gte-small are mentioned briefly in AI_KB_2 but Voyage is the recommended default.
- **Custom training pipelines** — embedding model training, classifier training, distillation. Out of scope.
- **Speech / audio / image generation** — Anthropic's Messages API is text-and-vision in / text out. Whisper, ElevenLabs, image generators all out of scope.
- **Real-time / WebSocket bidirectional voice** — out of scope for this template.
- **LangChain / LlamaIndex orchestration frameworks** — explicitly avoided. Vercel AI SDK + Anthropic SDK + Claude Agent SDK + MCP cover the surface without the indirection.
- **OpenAI-compatible third-party gateways** — Together, OpenRouter, Replicate fronting Anthropic. The template assumes direct Anthropic API access.
- **Bedrock / Vertex Claude access** — patterns mostly transfer but auth, region, and feature-availability differ. Notably the Anthropic MCP Connector is **not** available on Bedrock/Vertex (flagged in AI_KB_4). If switching, audit each KB for region-gated features.

---

## VERIFY BEFORE SHIPPING

Several KBs flag items where primary docs were ambiguous, where Supabase-hosted versions lag pgvector, or where API surfaces are pre-1.0 / beta. Search each KB for `[verify` and confirm against current docs before relying on these patterns in production. Notable items as of 2026-05-04:

- **Claude model family and pricing** — Opus 4.7 / Sonnet 4.6 / Haiku 4.5 with the prices and thresholds in the table above. Re-verify against `platform.claude.com/docs/en/about-claude/pricing` and `/docs/en/docs/about-claude/models/overview` before pinning costs in alerts or budgets (AI_KB_1).
- **Cache thresholds per model** — 4096 / 2048 / 1024 tokens depending on model. Threshold for newer models is well-documented but verify before assuming it applies to a model not yet in the KB (AI_KB_1).
- **`messages.countTokens()` SDK surface** — used in cost-estimation snippets; verify the exact namespace in current `@anthropic-ai/sdk` (AI_KB_1).
- **Voyage TypeScript / npm package (`voyageai`)** — REST API surface is verified, but the Node SDK package's maintenance status was not confirmed. Calling the REST endpoint directly via `fetch` is the safe path until verified (AI_KB_2).
- **Supabase hosted pgvector version** — `hnsw.iterative_scan` requires pgvector 0.8+. Confirm Supabase's hosted version before depending on it; raise `ef_search` as the fallback mitigation for the post-scan filter problem (AI_KB_2).
- **`ef_construction` defaults** — pgvector defaults vs. project-tuned values. The KB recommends 128; verify against current pgvector docs and your corpus size (AI_KB_2).
- **Vercel Fluid Compute timeout limits** — Hobby 300s, Pro/Enterprise 800s as of 2026-05-04. Vercel changes these periodically (AI_KB_3).
- **Vercel AI SDK v6 API surface** — major-version churn is the norm here. Verify `streamText` callback signatures, `useChat` `parts` shape, and `Output.object()` syntax against `ai-sdk.dev` before assuming the dossier code compiles unchanged (AI_KB_3).
- **`@anthropic-ai/claude-agent-sdk` minimum version** — v0.2.111+ for `claude-opus-4-7` support. Re-check before pinning (AI_KB_4).
- **MCP spec version `2025-11-25`** and **MCP TS SDK** v1.x recommended for production (v2 is pre-alpha). Re-check `modelcontextprotocol.io` before building a new server (AI_KB_4).
- **Anthropic MCP Connector beta header** — `mcp-client-2025-11-20`. Beta features get renamed; verify before deployment (AI_KB_4).
- **Tool-use cache placement rule** — `cache_control` on the **last** tool in the tools array caches the full array. Verify behavior hasn't changed if API surface shifts (AI_KB_4).

These are not blockers — most are version-gated, beta, or Supabase-hosted-version-dependent. Re-verify when implementing.
