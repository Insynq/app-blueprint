# AI_KB_4: Tools, Agents, MCP, Evals

**Stack-locked: Anthropic via `@anthropic-ai/sdk` + `@anthropic-ai/claude-agent-sdk`. MCP protocol version `2025-11-25`. Concepts are portable; package names and transport choices are not.**

---

## Why this matters

Agents are cost-runaway machines without hard bounds. A single unbounded loop calling a slow external API can spend $50 in minutes. Tool validation is not optional — LLMs return structurally invalid JSON despite declared schemas, so every tool call input must be validated server-side before execution. MCP is the 2026 standard for tool interoperability across AI providers; building raw tool use for every provider separately is now unnecessary. Evals are the only mechanism that catches prompt drift and model-update regressions — they are not a luxury.

This KB covers the full stack: raw tool use patterns, MCP server-building and consumption, the Claude Agent SDK for complex agentic workloads, evals as a parallel discipline to unit tests, and long-running agents that must escape Vercel function timeouts.

---

## Stack assumptions

- LLM calls: `@anthropic-ai/sdk` (raw API) or `@anthropic-ai/claude-agent-sdk` (agentic workflows)
- MCP servers: `@modelcontextprotocol/sdk` v1.x (v2 is pre-alpha as of 2026-05-04)
- Long agents: Trigger.dev v3 or Inngest (cross-ref JOB_KB_4)
- State persistence: Supabase
- Deployment: Vercel (serverless functions with timeout limits)
- Validation: Zod 3.25.0+ (required for `betaZodTool`)
- MCP protocol version: `2025-11-25`

---

## Tool use (Claude tools API)

### Tools parameter shape

Every tool passed to the API requires three fields. The `description` field is the single highest-leverage field — Claude uses it to decide when and how to call the tool.

```typescript
{
  name: string,           // Required. Regex: ^[a-zA-Z0-9_-]{1,64}$
  description: string,    // Required. 3-4 sentences minimum. Be exhaustive.
  input_schema: {         // Required. JSON Schema object.
    type: "object",
    properties: {
      [paramName]: {
        type: "string" | "number" | "boolean" | "array" | "object",
        description: string,
        enum?: string[],  // constrain to specific values
      }
    },
    required: string[]
  },
  // Optional:
  input_examples?: Array<Record<string, any>>,   // validated against input_schema
  cache_control?: { type: "ephemeral" },          // place on LAST tool (caches all tools)
  strict?: boolean,                               // guarantee schema conformance at model level
  defer_loading?: boolean                         // omit description initially (for Tool Search)
}
```

Example of a well-written tool definition:
```typescript
{
  name: "get_stock_price",
  description: "Retrieves the current stock price for a given ticker symbol. The ticker symbol must be a valid symbol for a publicly traded company on a major US stock exchange like NYSE or NASDAQ. The tool will return the latest trade price in USD. It should be used when the user asks about the current or most recent price of a specific stock. It will not provide any other information about the stock or company.",
  input_schema: {
    type: "object",
    properties: {
      ticker: {
        type: "string",
        description: "The stock ticker symbol, e.g. AAPL for Apple Inc."
      }
    },
    required: ["ticker"]
  }
}
```

### Three tool categories

As of 2026, Anthropic differentiates tools into three categories with meaningfully different execution models:

**User-defined (client-executed)** — You write the schema, you execute the function, you return results. The majority of tool use traffic falls here. You own the loop.

**Anthropic-schema client tools** — Anthropic publishes the schema; you handle execution. Includes `bash`, `text_editor`, `computer`, `memory`. Because the schema is trained into the model, calling behavior is more reliable than user-defined tools with equivalent schemas.

**Server-executed tools** — Anthropic runs the code. Includes `web_search`, `web_fetch`, `code_execution`, `tool_search`. You enable them in the API request; results appear in the response without you managing a loop. Stop reason is `pause_turn` when hitting internal limits — re-send the conversation to continue.

### tool_use / tool_result formatting rules

When Claude calls a tool, `stop_reason` is `"tool_use"` and the response includes `tool_use` content blocks:

```json
{
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "I'll check the weather in San Francisco for you."
    },
    {
      "type": "tool_use",
      "id": "toolu_01A09q90qw90lq917835lq9",
      "name": "get_weather",
      "input": { "location": "San Francisco, CA", "unit": "celsius" }
    }
  ]
}
```

You return results in the next user message as `tool_result` blocks:

```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_01A09q90qw90lq917835lq9",
      "content": "15 degrees, overcast"
    }
  ]
}
```

Errors are surfaced by setting `is_error: true`:
```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_01A09q90qw90lq917835lq9",
  "content": "ConnectionError: weather API returned HTTP 500. Retry after 60 seconds.",
  "is_error": true
}
```

**CRITICAL formatting rules — violating these causes 400 errors:**
- `tool_result` blocks MUST come FIRST in the user content array. Any text content must appear AFTER tool results.
- All tool results for a turn MUST be in a single user message. Never split them across multiple messages.
- Tool result blocks must immediately follow their corresponding `tool_use` assistant message.

### tool_choice options

```typescript
tool_choice: { type: "auto" }                    // Default when tools provided. Claude decides.
tool_choice: { type: "any" }                     // Claude must use at least one tool.
tool_choice: { type: "tool", name: "get_weather" }  // Force a specific tool.
tool_choice: { type: "none" }                    // No tools. Default when tools omitted.

// Modifier: disable parallel tool use when sequential ordering is required
tool_choice: { type: "auto", disable_parallel_tool_use: true }
tool_choice: { type: "any",  disable_parallel_tool_use: true }
```

**Extended thinking incompatibility:** Only `auto` and `none` work with extended thinking. Using `any` or `tool` with `thinking` enabled returns a 400 error.

**Preamble behavior:** When `type` is `any` or `tool`, the API prefills the assistant message — no natural language preamble is emitted even if prompted. Use `"auto"` with explicit system instructions to get both text and tool calls.

### Server-side Zod validation (mandatory)

LLMs return invalid JSON despite declared schemas. Always validate tool-call inputs with Zod before executing:

```typescript
import { z } from "zod";

const GetWeatherInput = z.object({
  location: z.string().min(1),
  unit: z.enum(["celsius", "fahrenheit"]).optional().default("celsius")
});

async function handleToolCall(toolName: string, rawInput: unknown, toolUseId: string) {
  if (toolName === "get_weather") {
    const parsed = GetWeatherInput.safeParse(rawInput);
    if (!parsed.success) {
      return {
        type: "tool_result" as const,
        tool_use_id: toolUseId,
        content: `Invalid input: ${parsed.error.message}`,
        is_error: true
      };
    }
    // parsed.data is fully typed and safe
    const { location, unit } = parsed.data;
    return await getWeather(location, unit);
  }
}
```

Setting `strict: true` on a tool definition guarantees schema conformance at the model level — but still validate server-side. Defense in depth, and strict mode does not cover semantic errors (a valid string that is the wrong value).

### Parallel vs sequential tool use

Claude 4 models issue multiple `tool_use` blocks in a single assistant turn automatically. All results must return in one user message:

```typescript
// Execute in parallel, return together
const toolResults = await Promise.all(
  toolUseBlocks.map(async (block) => ({
    type: "tool_result" as const,
    tool_use_id: block.id,
    content: await executeTool(block.name, block.input)
  }))
);

messages.push({ role: "user", content: toolResults }); // ONE message, ALL results
```

To encourage parallel execution in older models, add to the system prompt:
```
For maximum efficiency, invoke all relevant tools simultaneously rather than sequentially whenever operations are independent.
```

To force sequential ordering when needed:
```typescript
tool_choice: { type: "auto", disable_parallel_tool_use: true }
```

### Streaming with tools

Tool inputs stream as `input_json_delta` partial JSON strings. Accumulate them at `content_block_delta` events and parse the complete JSON at `content_block_stop`:

```
event: content_block_start
data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_01","name":"get_weather","input":{}}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"location\": \"San Fra"}}

event: content_block_delta
data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"ncisco, CA\"}"}}

event: content_block_stop
data: {"type":"content_block_stop","index":1}
```

The SDK's `.stream()` helper handles accumulation automatically. Models emit one complete key-value pair at a time — expect delays between events.

### The agent loop (bounded)

ALWAYS cap iterations. An unbounded loop is a cost-runaway bug:

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();
const MAX_ITERATIONS = 10; // Reduce for expensive operations or slow external APIs

async function runAgentLoop(
  userMessage: string,
  tools: Anthropic.Tool[]
) {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage }
  ];

  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 4096,
      tools,
      messages
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      return response; // end_turn, max_tokens, stop_sequence, or refusal
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      try {
        const result = await executeTool(block.name, block.input);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: typeof result === "string" ? result : JSON.stringify(result)
        });
      } catch (err) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
          is_error: true
        });
      }
    }

    // CRITICAL: all tool results in a single user message
    messages.push({ role: "user", content: toolResults });
  }

  throw new Error(`Agent loop exceeded ${MAX_ITERATIONS} iterations — possible infinite loop`);
}
```

**Termination conditions to handle:**
- `"end_turn"` — normal completion
- `"max_tokens"` — hit token limit; log and handle gracefully
- `"stop_sequence"` — hit a stop sequence
- `"refusal"` — safety refusal; surface to user
- `"pause_turn"` — server tool hit internal limit; re-send conversation to continue

Cross-ref: OBS_KB_4 for logging iteration count and token usage per turn.

### Tool-use caching

Place `cache_control: { type: "ephemeral" }` on the LAST tool in the `tools` array. All tools up to and including that tool are cached as a single prefix:

```typescript
tools: [
  { name: "tool_a", description: "...", input_schema: {...} },
  { name: "tool_b", description: "...", input_schema: {...} },
  {
    name: "tool_c",  // Last tool — cache marker applies to tool_a, tool_b, AND tool_c
    description: "...",
    input_schema: {...},
    cache_control: { type: "ephemeral" }
  }
]
```

Cache invalidates on any change to tool names, descriptions, or schemas. Changing `tool_choice` does NOT invalidate the tools cache. Cache hierarchy: `tools` → `system` → `messages` (each level caches everything above it). Verify hits via `cache_read_input_tokens` in the usage object. Cross-ref: AI_KB_1 for full prompt caching patterns.

### SDK helper: beta.messages.toolRunner

The `@anthropic-ai/sdk` ships `beta.messages.toolRunner` to automate the agentic loop with built-in Zod validation:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const client = new Anthropic();

const getWeatherTool = betaZodTool({
  name: "get_weather",
  description: "Get the current weather in a given location. Returns temperature and conditions.",
  inputSchema: z.object({
    location: z.string().describe("The city and state, e.g. San Francisco, CA"),
    unit: z.enum(["celsius", "fahrenheit"]).default("fahrenheit")
  }),
  run: async (input) => {
    // input is fully typed — input.location and input.unit are guaranteed safe
    return JSON.stringify({ temperature: "20°C", condition: "Sunny" });
  }
});

const finalMessage = await client.beta.messages.toolRunner({
  model: "claude-opus-4-7",
  max_tokens: 1024,
  tools: [getWeatherTool],
  messages: [{ role: "user", content: "What's the weather like in Paris?" }]
});
```

Requires Zod 3.25.0+. Features: Zod validation built-in, automatic context compaction when token usage exceeds threshold, streaming mode (`stream: true`), iterator-based access (`for await (const message of runner)`) for intermediate messages.

**Zod-free alternative:** if you'd rather not take a Zod dependency, the SDK also ships `betaTool` from `@anthropic-ai/sdk/helpers/beta/json-schema`. Same `toolRunner` integration, JSON Schema instead of Zod for input validation. The Zod version is preferred for the typed `run(input)` ergonomics, but the JSON Schema path is fully supported.

**Tool Runner vs manual loop:**
- Tool Runner: most production use cases, automated pipelines, standard tool execution
- Manual loop: human-in-the-loop approval gates, custom logging per iteration, conditional tool execution based on intermediate results

### Error handling

Write instructive error messages — Claude uses error content to decide next steps:

```typescript
// Good: actionable error
{ content: "Rate limit exceeded on weather API. Retry after 60 seconds.", is_error: true }

// Bad: opaque error
{ content: "failed", is_error: true }
```

**Error handling patterns:**
1. Surface recoverable errors to Claude with `is_error: true` — let it adapt
2. Throw for critical failures (auth errors, data corruption) to stop the loop immediately
3. With Tool Runner, iterate `for await` and inspect `block.is_error` blocks for alerting

---

## MCP (Model Context Protocol)

### What MCP is — spec 2025-11-25

MCP is an open-source standard for connecting AI applications to external systems. It acts as a universal adapter — tools, data sources, and workflows built to the MCP spec integrate with any MCP-compatible AI client without per-provider adaptation.

**Why it is the 2026 standard:**
- Supported across Claude, ChatGPT, VS Code Copilot, Cursor, and dozens of other hosts
- Anthropic, OpenAI, Microsoft, and Google all implement the spec
- Hundreds of community MCP servers for databases, browsers, APIs, file systems
- Build once; integrate everywhere

Current protocol version: `2025-11-25` (confirmed from initialization handshake in docs).

### Architecture: tools / resources / prompts

**Three participants:**
- **MCP Host** — The AI application (Claude Desktop, VS Code, your Next.js app)
- **MCP Client** — Component in the host that maintains one dedicated connection per server
- **MCP Server** — Process that exposes capabilities (local or remote)

**Two protocol layers:**
1. **Data layer** — JSON-RPC 2.0 defines lifecycle, primitives, and notifications
2. **Transport layer** — Communication mechanism (stdio or Streamable HTTP)

**Three server primitives:**

**Tools** — Executable functions the LLM can invoke (with user approval in most clients). Have a name, description, and `inputSchema`.

**Resources** — File-like data contexts: database schemas, file contents, API responses. Discovery via `resources/list`, retrieval via `resources/read`.

**Prompts** — Reusable templates for structuring LLM interactions. Discovery via `prompts/list`, retrieval via `prompts/get`.

**Notifications** — Real-time updates when capabilities change. When tools or resources are added/removed, the server sends `notifications/tools/list_changed` and clients re-fetch.

### Transports: stdio and Streamable HTTP

**Stdio transport:**
- Client launches server as subprocess; communication via stdin/stdout with newline-delimited JSON-RPC
- Server MUST NOT write non-MCP content to stdout — use `console.error()` (stderr) for all logging
- Ideal for: local servers, CLI tools, development. Zero network overhead.

```
Client → launches subprocess → Server
Client writes JSON-RPC to server's stdin
Server writes JSON-RPC to stdout
Server writes logs to stderr (NEVER stdout)
```

**Streamable HTTP transport** (replaces deprecated HTTP+SSE from protocol version 2024-11-05):
- Server is an independent process handling multiple clients
- Single HTTP endpoint supporting both POST and GET
- POST for client-to-server messages; GET to open SSE stream for server-to-client
- Supports session management via `Mcp-Session-Id` header
- Supports resumability via SSE event `id` + `Last-Event-ID` header
- Required header on requests: `MCP-Protocol-Version: 2025-11-25`
- Auth: bearer tokens, API keys, custom headers, OAuth per MCP spec

**Streamable HTTP security requirements:**
- Validate `Origin` header on all connections (DNS rebinding protection)
- Bind local servers to `127.0.0.1`, not `0.0.0.0`
- Implement proper authentication before exposing publicly

**NEVER build new MCP servers on the deprecated HTTP+SSE transport.** The old transport from protocol version 2024-11-05 should not be used for new server implementations. New servers must use Streamable HTTP. **Note:** the Anthropic MCP Connector API (covered below) accepts URLs for both Streamable HTTP and SSE transports — that's a connector-side compatibility allowance for already-deployed servers, not a recommendation to build new SSE-only servers.

### Building an MCP server (TS SDK v1.x)

```bash
npm install @modelcontextprotocol/sdk zod@3
```

Note: v2 is pre-alpha on main branch as of 2026-05-04. Use v1.x for production.

**Minimal stdio server:**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "my-app-server",
  version: "1.0.0",
});

// Register a tool
server.registerTool(
  "get_user",
  {
    description: "Retrieve a user by ID from the application database. Returns user profile data including name, email, role, and account status. Use when you need to look up a specific user's details.",
    inputSchema: {
      userId: z.string().uuid().describe("The UUID of the user to retrieve"),
    },
  },
  async ({ userId }) => {
    const user = await db.users.findById(userId);
    if (!user) {
      return {
        content: [{ type: "text", text: `User ${userId} not found` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(user) }],
    };
  }
);

// Register a resource (database schema, file content, etc.)
server.setResourceHandler("users/schema", async () => ({
  contents: [{
    uri: "users/schema",
    mimeType: "application/json",
    text: JSON.stringify({ id: "uuid", name: "string", email: "string" })
  }]
}));

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Server running on stdio"); // console.error writes to stderr — correct
}

main().catch(console.error);
```

**CRITICAL for stdio servers:** Never `console.log()` — it writes to stdout and corrupts the JSON-RPC stream. Use `console.error()` for all logging.

### Consuming MCP servers

#### Option A — Claude Agent SDK (preferred)

The Agent SDK's `mcpServers` option launches stdio servers as subprocesses automatically. No boilerplate:

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Analyze all critical errors in Sentry and create GitHub issues for them",
  options: {
    mcpServers: {
      "sentry": { command: "npx", args: ["@sentry/mcp-server"] },
      "github": { command: "npx", args: ["@modelcontextprotocol/server-github"] }
    }
  }
})) {
  if ("result" in message) console.log(message.result);
}
```

#### Option B — Anthropic MCP Connector (beta, remote HTTP servers)

For remote MCP servers accessible via HTTP. Anthropic's infrastructure manages the connection:

```typescript
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const response = await anthropic.beta.messages.create({
  model: "claude-opus-4-7",
  max_tokens: 1000,
  messages: [{ role: "user", content: "List all active users" }],
  mcp_servers: [
    {
      type: "url",
      url: "https://my-app-mcp.example.com/mcp",
      name: "app-server",
      authorization_token: process.env.MCP_TOKEN
    }
  ],
  tools: [
    {
      type: "mcp_toolset",
      mcp_server_name: "app-server"
      // Allowlist specific tools:
      // default_config: { enabled: false },
      // configs: { "get_user": { enabled: true } }
    }
  ],
  betas: ["mcp-client-2025-11-20"]  // beta header required
});
```

**Beta header:** `mcp-client-2025-11-20`. Previous header `mcp-client-2025-04-04` is deprecated.

**MCP Connector limitations:**
- Only tools are supported — resources and prompts are NOT available
- Server must be publicly accessible via HTTP (no local stdio servers)
- Not available on Amazon Bedrock or Google Vertex

#### Option C — Client-side MCP helpers (TypeScript SDK)

For local stdio servers or when you need resources/prompts:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { mcpTools } from "@anthropic-ai/sdk/helpers/beta/mcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["./mcp-server/build/index.js"]
});
const mcpClient = new Client({ name: "my-app-client", version: "1.0.0" });
await mcpClient.connect(transport);

const { tools } = await mcpClient.listTools();

const finalMessage = await new Anthropic().beta.messages.toolRunner({
  model: "claude-opus-4-7",
  max_tokens: 1024,
  messages: [{ role: "user", content: "What users are active?" }],
  tools: mcpTools(tools, mcpClient)
});
```

### Auth / authz in MCP

**Streamable HTTP servers** should use OAuth per the MCP spec. The authorization flow is defined in the spec; the MCP Inspector tool can walk through obtaining an `access_token` for testing.

Passing auth to the MCP Connector:
```typescript
mcp_servers: [{
  type: "url",
  url: "https://example.com/mcp",
  name: "server",
  authorization_token: "Bearer eyJ..."  // OAuth access token or API key
}]
```

For internal app MCP servers on the same domain: a pre-shared secret or service-to-service token is sufficient. Full OAuth is overkill for same-tenant scenarios.

### MCP vs raw tool use — decision criteria

| Factor | Raw tool use | MCP |
|---|---|---|
| Build target | One LLM provider | Any MCP-compatible host |
| Reuse | Per-provider adaptation needed | Zero adaptation |
| Tool discovery | Static (defined per API call) | Dynamic (server exposes; changes without redeploying AI) |
| Auth standard | You implement | OAuth built into transport spec |
| Ecosystem | None | Hundreds of existing servers |

**Use raw tool use when:**
- Building tightly coupled to Anthropic only
- Fewer than ~5 custom tools
- Tools are request-scoped with no reuse across projects
- Team is unfamiliar with MCP protocol overhead

**Use MCP when:**
- Tools should work across Claude, ChatGPT, VS Code Copilot, Cursor
- Building an internal tool platform for the team
- Exposing existing services (database, API) to multiple AI clients
- Need dynamic tool discovery without redeploying the AI app
- Community servers already exist for the target system

### Common MCP servers

| Server | What it provides | Use case |
|---|---|---|
| `@modelcontextprotocol/server-filesystem` | Read/write local files | File-based agents |
| `@modelcontextprotocol/server-github` | Issues, PRs, repos, search | Dev tooling agents |
| `@modelcontextprotocol/server-postgres` | DB query tools, schema resources | Data analysis agents |
| `@playwright/mcp` | Browser automation tools | Web scraping, E2E agents |
| Sentry MCP | Error tracking, issues | Debugging agents |

Full registry: https://github.com/modelcontextprotocol/servers

---

## Claude Agent SDK

### Package: @anthropic-ai/claude-agent-sdk

The package was renamed from `claude-code-sdk` to `@anthropic-ai/claude-agent-sdk`. The old package name and its imports are deprecated. Requires v0.2.111+ for claude-opus-4-7.

```bash
npm install @anthropic-ai/claude-agent-sdk
```

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
```

The Agent SDK embeds the same tools, agent loop, and context management that power Claude Code — usable programmatically. It handles tool execution, session management, and MCP integration that you would otherwise build manually.

### Built-in tools / hooks / subagents / sessions / MCP

**Built-in tools:**

| Tool | What it does |
|---|---|
| Read | Read files in working directory |
| Write | Create new files |
| Edit | Make precise edits to existing files |
| Bash | Run terminal commands, scripts, git |
| Monitor | Watch a background script, react to each output line |
| Glob | Find files by pattern (e.g., `**/*.ts`) |
| Grep | Search file contents with regex |
| WebSearch | Search the web |
| WebFetch | Fetch and parse web pages |
| AskUserQuestion | Ask user clarifying questions with multiple-choice |
| Agent | Invoke a named subagent |

Control access with `allowedTools`. For read-only analysis, restrict to `["Read", "Glob", "Grep"]`.

**Core API — `query()`:**
```typescript
for await (const message of query({
  prompt: "Find and fix the authentication bug in src/auth.ts",
  options: {
    allowedTools: ["Read", "Edit", "Bash", "Grep"],
    model: "claude-opus-4-7",
    maxTurns: 20,
    cwd: "/path/to/project"
  }
})) {
  if ("result" in message) {
    console.log("Final result:", message.result);
  }
}
```

**Hooks — lifecycle callbacks:**
```typescript
import { query, type HookCallback } from "@anthropic-ai/claude-agent-sdk";

const auditLog: HookCallback = async (input) => {
  const filePath = (input as any).tool_input?.file_path ?? "unknown";
  await appendFile("./audit.log", `${new Date().toISOString()}: modified ${filePath}\n`);
  return {}; // empty = allow; return { block: true } to prevent the tool call
};

for await (const message of query({
  prompt: "Refactor the auth module",
  options: {
    permissionMode: "acceptEdits",
    hooks: {
      PostToolUse: [{ matcher: "Edit|Write", hooks: [auditLog] }]
    }
  }
})) { ... }
```

Available hooks: `PreToolUse`, `PostToolUse`, `Stop`, `SessionStart`, `SessionEnd`, `UserPromptSubmit`.
Hook return values: `{}` (allow), `{ block: true, message: "..." }` (block and return message to Claude), or throw (propagates as error).

**Named subagents:**
```typescript
for await (const message of query({
  prompt: "Use the security-auditor agent to audit src/auth.ts, then use code-reviewer to review any fixes",
  options: {
    allowedTools: ["Read", "Glob", "Grep", "Agent"],  // Agent tool required
    agents: {
      "security-auditor": {
        description: "Expert in application security, OWASP Top 10, and authentication flaws.",
        prompt: "Audit code for security vulnerabilities. Focus on injection, XSS, CSRF, and auth bypass.",
        tools: ["Read", "Glob", "Grep"]
      },
      "code-reviewer": {
        description: "Senior engineer reviewing code for quality and maintainability.",
        prompt: "Review code quality, performance, and maintainability.",
        tools: ["Read", "Glob"]
      }
    }
  }
})) { ... }
```

Subagent messages include `parent_tool_use_id` for tracking delegation lineage.

**Resumable sessions:**
```typescript
// Step 1: Capture session ID
let sessionId: string | undefined;
for await (const message of query({
  prompt: "Read and analyze the authentication module",
  options: { allowedTools: ["Read", "Glob"] }
})) {
  if (message.type === "system" && message.subtype === "init") {
    sessionId = message.session_id;
  }
}

// Step 2: Resume — full prior context is available
for await (const message of query({
  prompt: "Now find all callers of authenticate()",
  options: { resume: sessionId }
})) {
  if ("result" in message) console.log(message.result);
}
```

Sessions are stored as JSONL on the filesystem. For durability across server restarts, see "Long-running agents" section.

### When to use: decision matrix vs raw API vs Vercel AI SDK

| Use case | Recommended choice |
|---|---|
| Direct API control, custom loop, streaming to UI | Raw `@anthropic-ai/sdk` |
| Chat interface streaming to browser | Vercel AI SDK (`useChat` + `streamText`) |
| Cross-provider portability (Claude + OpenAI) | Vercel AI SDK |
| Agent that reads/writes files, runs commands | Claude Agent SDK |
| CI/CD pipeline agent (code review, migration) | Claude Agent SDK |
| Background task agent (analysis, reporting) | Claude Agent SDK |
| Multi-agent orchestration with specialists | Claude Agent SDK |
| Long-running async session (hours/days) | Managed Agents (beta, monitor for GA) |

Cross-ref: AI_KB_3 for full Vercel AI SDK coverage including `useChat` tool-calling patterns.

### Cost / latency / observability

- Each `query()` call may make many API requests internally — one per agent turn
- No per-turn cost visibility by default. Add a `PostToolUse` hook to log `message.usage`
- Each subagent invocation spawns a fresh context window — cost multiplies with subagent depth
- Network latency is one API round-trip per turn; Agent SDK has no internal batching
- Cross-ref: OBS_KB_2 for error tracking AI calls; OBS_KB_4 for cost and latency monitoring

---

## Evals

### Why evals matter

LLM applications degrade silently. Unlike deterministic software where bugs cause test failures, LLM regression is probabilistic and cumulative:

- **Prompt drift:** Minor system prompt edits shift output quality in hard-to-detect ways
- **Model updates:** Provider model updates — even minor versions — can change behavior
- **Context window effects:** As conversations grow longer, earlier context degrades
- **Tool description changes:** Tool definition wording affects when and how Claude calls them

Evals catch what unit tests cannot: "Does this response correctly answer the user?" requires semantic understanding. String matching does not.

### Golden test sets

A golden test set is a corpus of `input → expected output` pairs representing production traffic:

```typescript
interface EvalCase {
  id: string;                     // Stable ID for regression tracking
  input: {
    systemPrompt?: string;
    userMessage: string;
    context?: Record<string, any>; // e.g., { user_role: "admin" }
  };
  expectedOutput?: string;        // For exact-match or similarity evals
  rubric?: string;                // For judge-model evals
  tags: string[];                 // ["happy-path", "edge-case", "regression-bug-#123"]
  lastPassed?: string;            // ISO date of last passing run
}
```

**Sourcing golden test sets:**
1. Sample real production conversations (anonymize PII first)
2. Generate edge cases with Claude: `"Generate 20 tricky edge cases for a billing assistant that might cause hallucination"`
3. Add a regression case for every bug found in production — immediately
4. Ensure coverage across: happy path, edge cases, adversarial inputs, error handling

### Judge-model patterns (Opus judges Sonnet)

Using Claude to grade Claude is practical and cost-effective. The critical constraint: use a stronger model to judge than the model generating responses.

**Rule: application model is claude-sonnet-4-5; judge model is claude-opus-4-7.**

Instruct the judge to reason before scoring (chain-of-thought grading improves accuracy):

```typescript
async function judgeResponse(
  question: string,
  response: string,
  rubric: string
): Promise<{ score: number; reasoning: string }> {
  const graderPrompt = `Grade this response on a scale of 1-5.

Question: ${question}

Response to grade:
<response>
${response}
</response>

Grading rubric:
<rubric>
${rubric}
</rubric>

Think step-by-step in <thinking> tags, then provide your final score in <score> tags.
Only output an integer 1-5 in the score tags.`;

  const result = await anthropic.messages.create({
    model: "claude-opus-4-7",  // stronger judge
    max_tokens: 512,
    messages: [{ role: "user", content: graderPrompt }]
  });

  const text = result.content[0].type === "text" ? result.content[0].text : "";
  const scoreMatch = text.match(/<score>(\d)<\/score>/);
  const thinkingMatch = text.match(/<thinking>([\s\S]*?)<\/thinking>/);

  return {
    score: scoreMatch ? parseInt(scoreMatch[1]) : 0,
    reasoning: thinkingMatch?.[1] ?? ""
  };
}
```

For binary yes/no checks:
```typescript
const judgePrompt = `Does this response contain PHI (Personal Health Information)?
<response>${response}</response>
Output only 'yes' or 'no'. Do not explain.`;
```

### Rubric design (pairwise vs absolute)

**Absolute rubrics** — score against a fixed standard. Use for CI threshold gates and regression detection:
```
Score 1: Response is completely wrong or hallucinates
Score 2: Response is partially correct but missing key elements
Score 3: Response is correct but incomplete
Score 4: Response is correct and complete
Score 5: Response is correct, complete, and concisely worded
```

**Pairwise rubrics** — compare two responses directly. Use when measuring relative improvement (prompt A vs prompt B). More sensitive for detecting small improvements:
```
Given responses A and B, which is better?
A is better / B is better / Tie
```

**Rubric anti-patterns:**
- Vague rubrics ("good response" is unmeasurable)
- Rubrics that reward length (amplifies length bias)
- Single-dimension rubrics for multi-aspect outputs

### Bias mitigations (position, length, self-preferential)

**Position bias:** Judges prefer the first response shown. In pairwise evals, always run A/B and B/A and average the scores.

**Length bias:** Judges prefer longer responses. Explicitly counter in the judge system prompt:
```typescript
const judgeSystemPrompt = `You are an impartial evaluator.
Rules:
- Longer responses are NOT better. Conciseness is valued equally.
- Do not consider response position when judging.
- Evaluate the response on its own merits, not how confident it sounds.
- A response that admits uncertainty is NOT worse than a confident response.`;
```

**Self-preferential bias:** A model tends to grade its own outputs higher. Always use a different — and typically stronger — judge model.

**Sycophancy bias:** Judges tend to agree with assertions embedded in the prompt. Avoid framing that implies the correct answer.

### Eval automation (sampling on PRs, full weekly)

Evals run as a separate CI job — NOT as part of unit tests (too slow, too expensive):

```yaml
# .github/workflows/evals.yml
name: LLM Evals
on:
  pull_request:
    paths: ['prompts/**', 'src/ai/**']   # Only when AI code changes
  schedule:
    - cron: '0 6 * * 1'                   # Full suite weekly on Mondays

jobs:
  evals:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run evals:sample          # 20% sample on PRs
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - run: node scripts/check-eval-threshold.js
```

**Sampling strategy:**
- PRs: 10-20% of eval suite (random sample, but always include all regression-tagged cases)
- Weekly: full suite (100%)
- Pre-release: full suite + pairwise against previous model version

**Threshold gates:**
```typescript
function checkThresholds(results: EvalResults): void {
  if (results.meanScore < 3.5) {
    throw new Error(`Mean score ${results.meanScore} below threshold 3.5`);
  }
  if (results.passRate < 0.85) {
    throw new Error(`Pass rate ${results.passRate} below 85%`);
  }
  if (!results.allRegressionCasesPassed) {
    throw new Error("Regression test cases failed");
  }
}
```

**Running evals with concurrency control:**
```typescript
async function runEvalSuite(
  cases: EvalCase[],
  options: { concurrency?: number; sampleRate?: number } = {}
) {
  const { concurrency = 5, sampleRate = 1.0 } = options;

  const sampled = sampleRate < 1.0
    ? cases.filter(() => Math.random() < sampleRate)
    : cases;

  // Always include regression cases regardless of sample rate
  const regressionCases = cases.filter(c => c.tags.includes("regression"));
  const toRun = [...new Set([...sampled, ...regressionCases])];

  const results: EvalResult[] = [];
  for (let i = 0; i < toRun.length; i += concurrency) {
    const batch = toRun.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(runEval));
    results.push(...batchResults);
  }

  return results;
}
```

### Deterministic vs judge — when each

**Use deterministic checks first (fast, free, reliable):**
- Does the output parse as valid JSON? `zod.parse(output)`
- Does the output contain required fields?
- Is the output under the maximum length?
- Does the tool call include the required parameter name?
- Does the response mention the required entity name?

**Use the judge model when deterministic checks pass but quality requires semantic judgment:**
- Is the tone appropriate for the context?
- Is the explanation clear and accurate?
- Does the response avoid hallucination?
- Is the level of detail appropriate?
- Is the suggested action correct given the context?

**Cost discipline:** Only invoke the judge model for cases that pass basic deterministic checks. A response that fails JSON parsing does not need Opus to grade.

### Cost discipline

A 1000-case eval suite with Opus as judge costs roughly $35-50 per full run. Cost reduction strategies:

1. Sample (20% on PRs reduces to ~$7-10 per PR eval run)
2. Use prompt caching on system prompt for judge calls — reduces judge input tokens ~50%
3. Cache eval responses — do not re-run cases where prompt and model are unchanged
4. Use Haiku or Sonnet as judge for lower-stakes dimensions; reserve Opus for critical cases
5. Run deterministic checks first; only call the judge model for cases that pass

Cross-ref: TEST_KB family for unit/integration test patterns. Evals are a parallel discipline — they complement but do not replace deterministic tests.

| | Unit/Integration Tests | Evals |
|---|---|---|
| Run on | Every commit | PRs touching AI code + weekly |
| Failure = | Block merge | Flag for review (configurable gate) |
| Speed | Seconds | Minutes to hours |
| Cost | Near zero | $5-50+ per suite run |
| What they catch | Code regressions | Quality regressions |

---

## Long-running agents

### When to push to Trigger.dev/Inngest

Vercel function timeouts: 60s (Hobby), 300s (Pro serverless), 800s (Pro streaming). An agent loop at 10 iterations × 20s per turn = 200s easily exceeds limits.

**Decision matrix:**
```
Simple Q&A with 1-2 tool calls            → Vercel function (< 30s expected)
Content generation with tool enrichment    → Vercel streaming function (< 300s)
Multi-step research agent (5+ turns)       → Trigger.dev / Inngest
Code analysis across a large codebase     → Trigger.dev / Inngest
Batch processing agent                     → Trigger.dev / Inngest (with parallelism)
```

Detection heuristic: if an agent requires more than 3-5 tool-calling turns OR calls slow external APIs (database, third-party services with variable latency), push off Vercel. Cross-ref JOB_KB_4 for the Trigger.dev vs Inngest decision matrix.

### Trigger.dev pattern for long agents

```typescript
// trigger/agent-task.ts
import { task } from "@trigger.dev/sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";

export const runAgentTask = task({
  id: "run-agent",
  maxDuration: 3600,  // 1 hour max
  retry: {
    maxAttempts: 3,
    factor: 2
  },
  run: async (payload: {
    prompt: string;
    sessionId?: string;
    userId: string;
  }, { ctx }) => {
    for await (const message of query({
      prompt: payload.prompt,
      options: {
        allowedTools: ["Read", "Glob", "Grep"],
        resume: payload.sessionId,
        maxTurns: 30
      }
    })) {
      // Persist intermediate results — do not rely on run log as source of truth
      if (message.type === "assistant") {
        await supabase.from("agent_events").insert({
          task_id: ctx.run.id,
          user_id: payload.userId,
          message_type: message.type,
          content: JSON.stringify(message)
        });
      }

      if ("result" in message) {
        return { result: message.result, completedAt: new Date().toISOString() };
      }
    }
  }
});
```

**Trigger from Next.js API route:**
```typescript
// app/api/agent/start/route.ts
import { runAgentTask } from "@/trigger/agent-task";

export async function POST(req: Request) {
  const { prompt, userId } = await req.json();
  const handle = await runAgentTask.trigger({ prompt, userId });
  return Response.json({ taskId: handle.id });
}
```

### State persistence (agent_state table)

Agent SDK sessions are JSONL on the filesystem — not durable across Vercel restarts or Trigger.dev reruns. For durable state, use Supabase:

```typescript
// Save state after each major step
await supabase.from("agent_state").upsert({
  session_id: sessionId,
  step: currentStep,
  state: JSON.stringify({ filesRead, findingsAccumulated, pendingActions }),
  updated_at: new Date().toISOString()
});

// Restore on resume
const { data } = await supabase
  .from("agent_state")
  .select("state")
  .eq("session_id", sessionId)
  .single();
const state = JSON.parse(data.state);
```

Also use Trigger.dev metadata for lightweight checkpoint data:
```typescript
await context.run.updateMetadata({
  step: "searching",
  filesSearched: 42,
  lastCheckpoint: new Date().toISOString()
});
```

### Idempotency keys

Use `session_id` as the idempotency key for retries. When a task retries due to failure, the agent can resume from the last checkpoint rather than starting over:

```typescript
export const resumableAgentTask = task({
  id: "resumable-agent",
  run: async (payload: { prompt: string; sessionId: string }) => {
    const { data: existing } = await supabase
      .from("agent_state")
      .select("*")
      .eq("session_id", payload.sessionId)
      .single();

    const startingContext = existing
      ? `Resume from previous session. Prior work: ${existing.summary}`
      : payload.prompt;

    for await (const message of query({
      prompt: startingContext,
      options: {
        resume: existing ? payload.sessionId : undefined,
        allowedTools: ["Read", "Grep", "Glob"]
      }
    })) {
      if ("result" in message) {
        await supabase.from("agent_state").upsert({
          session_id: payload.sessionId,
          summary: message.result.substring(0, 500),
          completed: true
        });
      }
    }
  }
});
```

### Resumability after failure

**Failure handling patterns:**
- Use idempotent tool operations (read-only, or check-before-write)
- Persist results as they arrive — not just at the end of the run
- Use `session_id` as idempotency key for retries
- Design prompts to accept resumption context gracefully

Cross-ref: JOB_KB_4 for Trigger.dev retry configuration and idempotency patterns.

---

## ALWAYS

- Validate tool-call inputs server-side with Zod — LLMs return invalid JSON despite declared schemas
- Bound agent loops with a max-iteration cap (default 10; reduce for expensive operations)
- Use `@anthropic-ai/claude-agent-sdk` (not the deprecated `claude-code-sdk`)
- Use Streamable HTTP transport when **building** new MCP servers (the MCP Connector itself accepts both Streamable HTTP and SSE URLs — but new servers should not be SSE-only)
- Push long agent runs (5+ tool-calling turns, slow external APIs) to Trigger.dev/Inngest
- Cache the tools array via `cache_control` on the last tool when the tools list is large or stable
- Use Opus as judge model when grading Sonnet outputs — or use a larger model than the one under test
- Write instructive error messages in `tool_result` `is_error` blocks — Claude uses them to decide next steps
- Use `console.error()` (not `console.log()`) for all logging inside stdio MCP servers
- Persist intermediate agent results to Supabase — do not rely on task run logs as the source of truth

---

## NEVER

- Run unbounded agent loops — cost runaway risk is real and immediate
- Trust LLM tool-call arguments without server-side validation
- Build a new MCP server on the deprecated HTTP+SSE transport (protocol version 2024-11-05). The MCP Connector still accepts SSE URLs for legacy compatibility, but new servers should be Streamable HTTP.
- Combine `tool_choice: "any"` or `tool_choice: "tool"` with extended thinking — 400 error
- Place `tool_result` blocks anywhere except first in the user content array — 400 error
- Split tool results across multiple user messages — all results for a turn in one message
- Sample evals at 100% on every PR — $35-50/full run multiplied by PR frequency causes cost runaway
- Use `console.log()` in stdio MCP servers — it corrupts the JSON-RPC stream
- Use `@modelcontextprotocol/sdk` v2 in production — it is pre-alpha as of 2026-05-04

---

## Cross-references

- **AI_KB_1** — Anthropic API base, prompt caching patterns including `cache_control` on tools, token budgets
- **AI_KB_2** — RAG and embeddings; agents often call RAG tools to retrieve context before reasoning
- **AI_KB_3** — Vercel AI SDK (`useChat`, `streamText`); when to use Vercel AI SDK vs raw API vs Agent SDK
- **JOB_KB_4** — Trigger.dev v3 and Inngest for long agent runs; retry configuration, step primitives
- **OBS_KB_2** — Error tracking for AI calls; surface agent loop failures and tool errors
- **OBS_KB_4** — Latency and cost monitoring; track per-turn token usage and agent loop depth
- **TEST_KB family** — Unit/integration test patterns; evals are a parallel discipline, not a replacement
- **SB_KB family** — Supabase schema and RLS for `agent_state` table and `agent_events` table

---

*Researched: 2026-05-04 | Next verification recommended: 2026-08-01 (MCP spec, Agent SDK, and Tool Runner evolve rapidly)*
