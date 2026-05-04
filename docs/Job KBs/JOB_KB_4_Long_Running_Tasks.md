# JOB_KB_4 — Long-Running Tasks: Trigger.dev v3 vs Inngest

**Stack-locked: Trigger.dev or Inngest as managed durable-execution layer. Concepts (durable execution, step functions) portable.**

---

## Pattern

When a task exceeds the ~150s Supabase Edge Function timeout and cannot be cleanly chunked into independent sub-jobs, outsource it to a managed durable-execution platform. Two viable picks: **Trigger.dev v3** (CRIU-checkpointed containers, no timeout ceiling, tasks run in Trigger.dev's infrastructure) and **Inngest** (event-driven, runs in your own serverless, superior step/sleep primitives). Both integrate with Supabase via service-role client and ship free tiers usable in low-traffic production. They are not interchangeable — pick based on the shape of the work.

Use **Trigger.dev v3** when the task is one long continuous execution (AI pipeline, media processing, bulk import). The task runs in a managed container that CRIU-checkpoints on waits — only actual CPU time is billed. Use **Inngest** when the task is a multi-step workflow with sleeps, approval gates, or event-driven fan-out. Inngest holds the orchestration state between steps at zero compute cost; your serverless function executes only the active step.

Both can be triggered from the outbox pattern (JOB_KB_1): the outbox worker dequeues a row and calls `tasks.trigger()` or `inngest.send()` as the side effect, giving you the transactional guarantee that the task only fires after the originating DB transaction commits.

---

## When to use / when to skip

**Use Trigger.dev v3 when:**
- Task is a single long execution: AI pipeline, document processing, large file conversion, bulk row processing that is sequential not parallelizable
- No timeout ceiling needed — work could run for minutes or hours
- Heavy dependencies required: Playwright, FFmpeg, Python binaries — available via build extensions
- You want to deploy task code separately from app code with its own observability dashboard
- Team has data residency requirements — Trigger.dev is open source and self-hostable

**Use Inngest when:**
- Task is a multi-step workflow: each step is short but the sequence spans hours or days
- You need `step.sleep("3d")` — Inngest holds state between sleeps at zero compute cost
- You need human-in-the-loop: `step.waitForEvent()` pauses the function until an event arrives (up to N days)
- Event-driven fan-out matters — one event can trigger multiple functions for free
- The account anonymization or complex onboarding pattern from AUTH_KB_6 applies

**Skip both when:**
- Task fits inside the Edge Function timeout — use the outbox (JOB_KB_1) directly
- Task can be chunked into independent units under ~60s each — use the Postgres queue (JOB_KB_3), which is cheaper and has no external dependency
- You only need periodic scheduling — pg_cron + Vercel Cron (JOB_KB_2) is sufficient and adds no new platform dependency

**Decision tree:**
```
Is the task > ~120s total?
  No  → Edge Function + outbox (JOB_KB_1)
  Yes → Can it be broken into independent, parallelizable chunks of <60s each?
          Yes → Postgres queue worker (JOB_KB_3) — cheaper, no external dependency
          No  → Is it a sequence of short steps with long waits or event gates?
                  Yes → Inngest (step functions, sleep semantics)
                  No  (long continuous compute) → Trigger.dev v3 (container, no timeout)
```

---

## Anti-patterns

**Hardcoding credentials**
Never hardcode `SUPABASE_SERVICE_ROLE_KEY`, `TRIGGER_SECRET_KEY`, or `INNGEST_SIGNING_KEY` in task code. Store them in environment variables. Both platforms provide environment variable management in their dashboards — use it.

**Missing timeout on outbound HTTP calls**
If a task calls a third-party endpoint (user webhook, external API), add an explicit timeout and treat slow endpoints as retryable or use `AbortTaskRunError` / `NonRetriableError` for permanent failures. A stalled external call burns compute time on Trigger.dev and blocks step retries on Inngest.

**Single try/catch swallowing step failures**
In Inngest, a `step.run()` that exhausts all retries fails the whole function. Add an `onFailure` handler or catch within the step to compensate or abort gracefully. In Trigger.dev, use the `onFailure` lifecycle hook and `catchError` to inspect end-of-retries and take corrective action.

**Storing business state only in the platform's run state**
Trigger.dev and Inngest hold execution state for observability and replay — not as a durable database. Persist each intermediate result to Supabase before moving to the next step. The run log is not the source of truth for business data.

**Non-idempotent task bodies**
Retries will re-execute any logic not wrapped in a memoized step. In Trigger.dev, direct DB writes inside `run()` that are not subtasks must be `upsert` or check-before-insert. In Inngest, wrap every side-effecting operation in its own `step.run()` with a stable ID — completed steps are memoized and will not re-execute on replay.

**Using Trigger.dev v2 patterns**
v2 reached EOL January 31, 2025. All v2 patterns (`client.defineJob()`, `@trigger.dev/nextjs`, imports from `@trigger.dev/sdk/v3`) are dead. Use `task()` from `@trigger.dev/sdk` and `tasks.trigger()` from the v3 API.

**Expecting Inngest to escape per-step serverless timeouts**
Inngest calls your HTTP endpoint for each step. On Vercel Hobby, each step invocation is subject to Vercel's 60s function timeout. Inngest holds orchestration state between steps, but it cannot extend the per-step execution window. If a single step takes longer than your serverless timeout, only Trigger.dev's container model solves that.

---

## Generic example

### Trigger.dev v3

**Task definition:**
```typescript
// trigger/process-document.ts
import { task, AbortTaskRunError } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";

export const processDocumentTask = task({
  id: "process-document",
  retry: {
    maxAttempts: 5,
    factor: 1.8,
    minTimeoutInMs: 1_000,
    maxTimeoutInMs: 30_000,
    randomize: true,
  },
  // Uncomment for heavy tasks:
  // machine: { preset: "large-1x" }, // 4 vCPU, 8 GB RAM
  run: async (payload: { documentId: string; userId: string }) => {
    // Always use service role — tasks run server-side with no user session.
    // For user-scoped work, see Supabase JWT pattern below.
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: doc, error } = await supabase
      .from("documents")
      .select("*")
      .eq("id", payload.documentId)
      .single();

    if (error || !doc) {
      // Permanent error — skip retries
      throw new AbortTaskRunError(`Document ${payload.documentId} not found`);
    }

    // This can run for minutes — no timeout ceiling
    const result = await runEmbeddingPipeline(doc.content);

    // Upsert — safe if this task retries
    await supabase
      .from("document_embeddings")
      .upsert({ document_id: payload.documentId, embedding: result.vector });

    return { success: true, chunkCount: result.chunks };
  },
});
```

**Trigger from a Server Action:**
```typescript
// app/actions.ts
"use server";
import type { processDocumentTask } from "@/trigger/process-document";
import { tasks } from "@trigger.dev/sdk";

export async function triggerDocumentProcessing(documentId: string, userId: string) {
  // tasks.trigger() returns immediately — does not wait for the task to complete
  const handle = await tasks.trigger<typeof processDocumentTask>(
    "process-document",
    { documentId, userId }
  );
  return handle.id; // store this to poll status later
}
```

**Batch trigger (fan-out):**
```typescript
const batchHandle = await tasks.batchTrigger<typeof processDocumentTask>(
  "process-document",
  documents.map((doc) => ({ payload: { documentId: doc.id, userId } }))
);
```

**Subtask orchestration (sequential pipeline):**
```typescript
// trigger/onboarding-pipeline.ts
import { task } from "@trigger.dev/sdk";
import { sendWelcomeEmailTask } from "./send-welcome-email";
import { createStripeCustomerTask } from "./create-stripe-customer";

export const onboardingPipelineTask = task({
  id: "onboarding-pipeline",
  run: async (payload: { userId: string; email: string }) => {
    // triggerAndWait() runs a subtask and awaits its result.
    // If this parent retries, idempotency keys prevent duplicate subtasks.
    const emailResult = await sendWelcomeEmailTask.triggerAndWait({
      email: payload.email,
    });
    const stripeResult = await createStripeCustomerTask.triggerAndWait({
      email: payload.email,
    });

    // Fan-out: trigger many subtasks and await all
    const results = await someChildTask.batchTriggerAndWait([
      { payload: { step: "orientation-1" } },
      { payload: { step: "orientation-2" } },
    ]);

    return {
      emailId: emailResult.output?.messageId,
      stripeId: stripeResult.output?.customerId,
    };
  },
});
```

**Note on Next.js routing:** Trigger.dev v3 tasks run in Trigger.dev's managed infrastructure, not inside your Next.js process. There is no route handler to add to your app. Your Next.js code only calls `tasks.trigger()` outbound to the Trigger.dev API, authenticated by `TRIGGER_SECRET_KEY`. This is a key architectural difference from Inngest.

---

### Inngest

**Client singleton:**
```typescript
// src/inngest/client.ts
import { Inngest } from "inngest";
export const inngest = new Inngest({ id: "my-app" });
```

**Function with step primitives:**
```typescript
// src/inngest/functions/onboarding.ts
import { inngest } from "../client";
import { NonRetriableError } from "inngest";
import { createClient } from "@supabase/supabase-js";

export const userOnboarding = inngest.createFunction(
  {
    id: "user-onboarding",
    retries: 5, // per-step retry count
  },
  { event: "app/user.created" },
  async ({ event, step }) => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Each step.run() is independently retried and memoized on replay.
    // On a retry, completed steps return their cached result without re-executing.
    const user = await step.run("fetch-user", async () => {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", event.data.userId)
        .single();
      if (error) throw new NonRetriableError("User not found", { cause: error });
      return data;
    });

    await step.run("send-welcome-email", async () => {
      await sendEmail({ to: user.email, template: "welcome" });
    });

    // Zero compute cost during this wait — Inngest holds state
    await step.sleep("wait-before-nudge", "3d");

    // Pause until an event arrives, or timeout after 7 days
    const completed = await step.waitForEvent("wait-onboarding-complete", {
      event: "app/onboarding.completed",
      timeout: "7d",
      if: `event.data.userId == async.data.userId`,
    });

    if (!completed) {
      // Timeout hit — user did not complete onboarding
      await step.run("send-nudge-email", async () => {
        await sendEmail({ to: user.email, template: "onboarding-nudge" });
      });
    }
  }
);
```

This pattern maps directly to the account anonymization workflow in AUTH_KB_6 — a multi-step sequence with waits is exactly Inngest's strong suit.

**Route handler (App Router) — required:**
```typescript
// src/app/api/inngest/route.ts
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { userOnboarding } from "@/inngest/functions/onboarding";
// Import all other functions here

// Inngest requires all three HTTP methods. This route is how Inngest
// discovers your functions and invokes each step.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [userOnboarding],
});
```

**Trigger by sending an event:**
```typescript
// From a Server Action or API route
import { inngest } from "@/inngest/client";

await inngest.send({
  name: "app/user.created",
  data: { userId: "user_abc123" },
});
// One event can trigger multiple functions simultaneously — fan-out is free.
```

**Retry-after (rate limit handling):**
```typescript
import { RetryAfterError } from "inngest";
// Throw this inside a step.run() to reschedule after a specific time
throw new RetryAfterError("Rate limited", retryAfterDate);
```

---

### Calling Supabase from either platform

```typescript
// Default: service role bypasses RLS — use for admin-level work
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // never hardcode, never log
);
```

For tasks acting on behalf of a specific user where RLS should apply, Trigger.dev's Supabase guide documents a JWT pattern: sign a short-lived JWT using `SUPABASE_JWT_SECRET` for the target user, pass it in the Authorization header when constructing the client. Use service role for admin work; use the JWT pattern for user-scoped work where you want RLS enforced. `[VERIFY BEFORE SHIPPING]` — confirm the JWT signing approach against the current Trigger.dev Supabase authentication guide.

---

## Trade-offs

| Concern | Trigger.dev v3 | Inngest |
|---|---|---|
| Execution environment | Trigger.dev managed containers | Your serverless function (Vercel, Railway, etc.) |
| Per-step timeout ceiling | None — CRIU checkpoint/resume | Your platform's serverless limit (e.g., 60s on Vercel Hobby) |
| Long sleeps / waits | Container checkpointed; no cost during wait | Native `step.sleep()` — days at zero compute cost |
| Step primitives | `triggerAndWait`, `batchTriggerAndWait` | `step.run`, `step.sleep`, `step.waitForEvent`, `step.invoke` |
| Event-driven fan-out | Less ergonomic | Native — one event, many subscribers |
| Heavy dependencies | Yes — Playwright, FFmpeg via build extensions | No — limited to your serverless runtime |
| Machine sizing | Yes — CPU/RAM presets per task | No — inherits your serverless limits |
| Local dev | Yes — built-in dashboard via `npx trigger.dev@latest dev` | Yes — `inngest-cli dev` |
| Open source | Yes — self-hostable | SDK only; platform is SaaS |
| Free tier | $5/month compute credit | 50k executions/month |
| Paid plans start | $10/month (Hobby) | $75/month (Pro) `[VERIFY BEFORE SHIPPING]` |
| Strong fit | One long continuous job | Multi-step workflow with waits |

---

## Gotchas

**Inngest step counting burns the free tier faster than the number looks.**
The 50k executions/month free tier counts each `step.run()` call as one execution. A 5-step onboarding function = 5 executions per user signup. Effective free tier at 5 steps is ~10,000 function invocations/month. Plan accordingly. `[VERIFY BEFORE SHIPPING]` — confirm current Inngest step billing against their pricing page.

**Trigger.dev compute billing pauses during waits.**
CRIU checkpointing means only actual CPU time is billed. A task that runs for 10 seconds, waits 30 minutes, then runs for 5 more seconds bills for 15 seconds of compute, not 30 minutes. This makes Trigger.dev's pricing more predictable for highly variable or wait-heavy tasks than it first appears. `[VERIFY BEFORE SHIPPING]` — confirm current per-second rates at trigger.dev/pricing.

**Supabase database webhooks can trigger Inngest directly.**
The `app/api/inngest` route already handles `POST` requests — Supabase Database Webhooks (Table Webhooks) can post directly to it if the payload is structured as an Inngest event. For non-critical events where losing the trigger on network error is acceptable, this path skips the outbox worker entirely. For critical events, use the outbox (JOB_KB_1) — the webhook fires after the row is visible but provides no transactional guarantee if the external call fails. `[VERIFY BEFORE SHIPPING]` — verify the exact Inngest event payload format required by Supabase webhooks.

**Trigger.dev v3 has no Next.js route handler.**
Unlike Inngest, there is no serve handler to add to your Next.js app. Tasks run in Trigger.dev's infrastructure. If you search for `app/api/trigger` routes, you will not find them in a v3 project — that was a v2 pattern. Triggering is purely outbound from your app via `tasks.trigger()`.

**Vercel Hobby limits each Inngest step to 60s.**
On Vercel Hobby, Vercel enforces a 60s serverless timeout. Each `step.run()` call is a new invocation subject to this limit. If a single step's work takes longer than 60s, Inngest cannot help — only Trigger.dev's container model escapes the per-step timeout. On Vercel Pro, the limit rises to 800s with streaming. Account for this when deciding between platforms for Vercel-deployed apps.

**Task idempotency is your responsibility for non-step logic.**
Inngest's `step.run()` memoizes on the step ID string — the same step ID on replay returns the cached result. But any logic between `step.run()` calls (e.g., a conditional branch or a local variable computation) re-executes on every replay. Keep inter-step logic pure and side-effect-free. In Trigger.dev, direct DB writes in `run()` that are not wrapped in a subtask must use `upsert` or check-before-insert to be safe to replay.

**Outbox dispatching to either platform (JOB_KB_1 integration).**
When the outbox pattern (JOB_KB_1) dispatches to Trigger.dev or Inngest as the side effect, the outbox worker calls `tasks.trigger()` or `inngest.send()` after dequeuing the row. The outbox row is the durable record; the Trigger.dev/Inngest run is the execution. If the external platform is temporarily unavailable, the outbox row remains locked and the worker retries — no events are lost.

**JOB_KB_2 cron vs Trigger.dev/Inngest scheduling.**
Both platforms support scheduled tasks (Trigger.dev `schedules.create()`, Inngest `{ cron: "..." }` trigger). If you already have Trigger.dev or Inngest in the stack, consolidating scheduled jobs there is reasonable. If you only need simple periodic execution with no durable state, pg_cron + Vercel Cron (JOB_KB_2) adds no new platform dependency and is simpler to reason about.

**Pricing as of 2026-05 — verify before committing.**
Pricing for both platforms changes frequently. Numbers in the trade-offs table are current as of the research date (2026-05-04). Always check trigger.dev/pricing and inngest.com/pricing before including cost estimates in architecture decisions. `[VERIFY BEFORE SHIPPING]`
