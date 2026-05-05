# OBS_KB_2 — Error Tracking with Sentry

**Stack-locked: @sentry/nextjs v10.x + Next.js App Router. Sentry is the default exception tracker for this stack.**

---

## Pattern

Sentry captures unhandled exceptions automatically via `instrumentation.ts` + `onRequestError`. Caught errors that return graceful responses — the normal pattern for Server Actions — are **not** automatically captured; they require explicit `Sentry.captureException(error)` calls. Error boundary files (`error.tsx`, `global-error.tsx`) are Client Components that Sentry never sees automatically; they must call `captureException` in a `useEffect`.

Source maps upload automatically during `next build` via `withSentryConfig`. User context is set to `{ id }` only — no email, no username, no IP unless legal has signed off.

For operational logs (structured request logs, `request_id` propagation) → see **OBS_KB_1**. For immutable audit events → see **OBS_KB_3**. For run-failure alert routing and dead-letter monitoring → see **OBS_KB_4**.

---

## SDK version

Current: **@sentry/nextjs 10.51.0** (released 2026-04-29).  
Source: https://github.com/getsentry/sentry-javascript/releases

The App Router instrumentation model (`instrumentation.ts` + `onRequestError`) stabilized in `@sentry/nextjs >= 8.28.0` and `next >= 15`. Both version requirements must be met for automatic RSC error capture.

---

## Installation

The wizard is the canonical starting point:

```bash
npx @sentry/wizard@latest -i nextjs
```

Source: https://docs.sentry.io/platforms/javascript/guides/nextjs/

The wizard generates all files below. Manual setup is an option but the wizard is the recommended path.

---

## Generated files

| File | Purpose |
|------|---------|
| `instrumentation-client.ts` | Browser SDK init |
| `sentry.server.config.ts` | Node.js server SDK init |
| `sentry.edge.config.ts` | Edge runtime SDK init |
| `instrumentation.ts` | Next.js hook — imports server/edge configs, exports `onRequestError` |
| `next.config.ts` | Wrapped with `withSentryConfig` |
| `app/global-error.tsx` | Root error boundary with `captureException` |
| `.env.sentry-build-plugin` | `SENTRY_AUTH_TOKEN` for local source map uploads |

**Naming note:** The client init file is now `instrumentation-client.ts`. Older versions (pre-v10) used `sentry.client.config.ts`. The v9→v10 migration guide does not explicitly call out when this rename occurred — verify against current Sentry Next.js docs if you are upgrading from an older version rather than running the wizard fresh.  
Source: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

---

## Configuration files

### instrumentation.ts

```typescript
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
```

`register()` runs **once** when a new Next.js server instance starts. `onRequestError` is a Next.js 15+ stable export (no `experimental.instrumentationHook` flag needed in Next.js 15+; verify the exact version where the experimental flag was removed if you are on an older codebase).  
Source: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#react-server-components and https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation

### instrumentation-client.ts

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false,          // wizard default is true — see PII section; set false here
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  integrations: [
    Sentry.replayIntegration(),
  ],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
```

The wizard sets `sendDefaultPii: true` by default. This enables automatic IP address capture and request headers in events. (v10.4.0 fixed the `sendDefaultPii` flag actually gating IP-address inference — the behavior was advertised since v9 but did not take effect until v10.4.0. No primary source confirms that v10.4.0 specifically changed the wizard's default.) **Set `sendDefaultPii: false` unless legal has reviewed.**  
Source: https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/ and https://docs.sentry.io/platforms/javascript/guides/nextjs/migration/v9-to-v10/

### sentry.server.config.ts and sentry.edge.config.ts

The Sentry docs do not show the generated contents of these files in any published page. **Run the wizard and inspect the generated output** — do not hand-write these files from memory. Their function is to call `Sentry.init({ dsn, ... })` for their respective runtimes.  
Source: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

### next.config.ts

```typescript
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // your config
};

export default withSentryConfig(nextConfig, {
  org: "your-org-slug",
  project: "your-project-slug",
  silent: !process.env.CI,
  widenClientFileUpload: true,     // broader source map set for cleaner traces
  // tunnelRoute: "/sentry-tunnel", // see Ad-blocker bypass section
});
```

**Breaking changes from earlier versions (still apply):**
- `deleteSourcemapsAfterUpload` defaults to `true` (introduced in **v8→v9**, not v9→v10 — the v9→v10 migration guide makes no mention of it). Client source maps are deleted after upload. Add `sourcemaps: { deleteSourcemapsAfterUpload: false }` to retain them locally.
- SDK no longer uses Next.js Build IDs as release identifiers (v9→v10). Set `release: { name: '...' }` explicitly if you use Sentry releases.

Sources: https://docs.sentry.io/platforms/javascript/guides/nextjs/migration/v8-to-v9/ (deleteSourcemapsAfterUpload) and https://docs.sentry.io/platforms/javascript/guides/nextjs/migration/v9-to-v10/ (release identifiers)

---

## Source maps

Source maps upload automatically during `next build` when `SENTRY_AUTH_TOKEN` is set. The wizard creates `.env.sentry-build-plugin` for local builds; add `SENTRY_AUTH_TOKEN` to Vercel environment variables for CI/CD.

**Vercel integration:** Installing the Sentry integration from Vercel's marketplace auto-provisions `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, and `NEXT_PUBLIC_SENTRY_DSN` as environment variables. You still need `withSentryConfig` in `next.config.ts` — the integration provides env vars; the SDK uploads the maps.

**Turbopack:** Requires `@sentry/nextjs >= 10.13.0` + `next >= 15.4.1`. Source maps upload after the build completes rather than during. Tree-shaking options (`webpack.treeshake.*`) do not work with Turbopack — if bundle size is a concern on Turbopack, there is no equivalent option currently.

Source: https://docs.sentry.io/platforms/javascript/guides/nextjs/sourcemaps/ and https://docs.sentry.io/product/integrations/deployment/vercel/

---

## Error boundaries

### What Sentry captures automatically vs. manually

| Error source | Automatic? | What to do |
|---|---|---|
| Unhandled RSC crash (via `onRequestError`) | Yes, with `@sentry/nextjs >= 8.28.0` + `next >= 15` | Nothing — `instrumentation.ts` covers it |
| Unhandled client-side exception | Yes | Nothing |
| Unhandled API route / Route Handler | Yes | Nothing |
| Error caught by `error.tsx` | **No** | `captureException(error)` in `useEffect` |
| Error caught by `global-error.tsx` | **No** | `captureException(error)` in `useEffect` |
| `try/catch` with graceful return | **No** | `captureException(error)` before returning |
| Server Action returning `{ error: ... }` | **No** | `captureException(error)` or use `withServerActionInstrumentation` |

Source: https://docs.sentry.io/platforms/javascript/guides/nextjs/capturing-errors/

### app/error.tsx

```tsx
"use client";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;       // named `reset` in Next.js < 16 — check your version
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div>
      <h2>Something went wrong</h2>
      <button onClick={() => unstable_retry()}>Try again</button>
    </div>
  );
}
```

**Prop name:** Next.js 16.x docs show `unstable_retry`; earlier versions use `reset`. The prop is for triggering a re-render attempt — name it to match your Next.js version.  
Source: https://nextjs.org/docs/app/building-your-application/routing/error-handling and https://docs.sentry.io/platforms/javascript/guides/nextjs/capturing-errors/

### app/global-error.tsx

Catches errors in the root layout (`app/layout.tsx`). Must include `<html>` and `<body>` — it replaces the entire document when active.

```tsx
"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
```

Source: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#create-a-global-error-handler

### Error boundary hierarchy

```
app/
  layout.tsx              ← errors here → global-error.tsx
  global-error.tsx        ← last resort; rare in practice
  dashboard/
    layout.tsx
    page.tsx              ← errors here → dashboard/error.tsx
    error.tsx
    invoices/
      page.tsx            ← bubbles up to dashboard/error.tsx if no invoices/error.tsx
```

---

## Server Component and Server Action error capture

### Server Components — automatic via onRequestError

Unhandled RSC errors (component crashes, not caught) are captured automatically via `onRequestError = Sentry.captureRequestError` in `instrumentation.ts`. No additional code required.

**Gotcha:** The `error` instance passed to `onRequestError` may not be the original error — React can wrap RSC errors during payload processing. The `digest` property identifies the actual error type. Use `digest` to correlate with Sentry event IDs and with operational logs (see OBS_KB_1 for the `request_id` propagation contract that Sentry breadcrumbs should mirror).  
Source: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation

### Server Actions — withServerActionInstrumentation (preferred)

`withServerActionInstrumentation` connects client→server trace spans and captures errors. Use it when the action is a critical path or you want trace correlation:

```typescript
"use server";
import * as Sentry from "@sentry/nextjs";
import { headers } from "next/headers";

export async function submitForm(formData: FormData) {
  return Sentry.withServerActionInstrumentation(
    "submitForm",
    {
      headers: await headers(),   // connects client→server traces
      formData,
      recordResponse: true,
    },
    async () => {
      const result = await processForm(formData);
      return { success: true, data: result };
      // if this throws, Sentry captures it automatically
    },
  );
}
```

Source: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#server-actions-instrumentation

### Server Actions — explicit captureException (simpler, trace-less)

When you catch and return a graceful error response — the normal Server Action pattern per AUTH_KB_4 — call `captureException` explicitly. This loses trace correlation but is sufficient for error visibility:

```typescript
"use server";
import * as Sentry from "@sentry/nextjs";
// For operational logging, see OBS_KB_1 for the logger import

export async function createPost(formData: FormData) {
  try {
    const post = await db.posts.create({ /* ... */ });
    return { success: true, id: post.id };
  } catch (error) {
    Sentry.captureException(error);           // Sentry gets the exception
    // logger.error({ err: error }, "createPost failed"); // OBS_KB_1 for structured log
    return { success: false, error: "Failed to create post" };
  }
}
```

Source: https://docs.sentry.io/platforms/javascript/guides/nextjs/capturing-errors/

---

## Edge runtime

`sentry.edge.config.ts` is loaded when `process.env.NEXT_RUNTIME === "edge"` in `instrumentation.ts`. The `onRequestError` hook runs in both Node.js and Edge runtimes per Next.js instrumentation docs.

**Known limitation:** The Sentry feature page for Edge runtime returned 404 during research. Suspected (not confirmed from primary source) limitations in Edge runtime: local variable capture, profiling, some Node.js-specific integrations. **Verify against current Sentry Next.js Edge docs before relying on advanced features in Edge routes.**

**Middleware / tunnel route exclusion:** If using `tunnelRoute`, exclude `/sentry-tunnel` from your proxy/middleware matcher. In Next.js 15 this is `middleware.ts`; in Next.js 16+ this is `proxy.ts` (see AUTH_KB_4 for proxy structure).  
Source: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#configure-tunneling-to-avoid-ad-blockers

---

## Supabase Edge Functions (Deno)

Supabase Edge Functions run on Deno. The Sentry Deno SDK is **beta**.

**Import path (current):**
```typescript
import * as Sentry from "npm:@sentry/deno";
```

The `deno.land/x/sentry` registry is **deprecated** — use the `npm:` import.  
Source: https://deno.land/x/sentry and https://github.com/getsentry/sentry-deno

**Requirements:** Deno >= 2.0.0 + network access to your Sentry ingest domain.

**Open questions to verify before shipping:**
- Which Deno version does Supabase currently run? The SDK requires Deno >= 2.0.0.
- Is there a v10 of `@sentry/deno`? The deno.land registry showed 8.55.0; `npm:@sentry/deno` should resolve to the current npm version but verify.

```typescript
// supabase/functions/my-function/index.ts
import * as Sentry from "npm:@sentry/deno";

Sentry.init({
  dsn: Deno.env.get("SENTRY_DSN"),
});

Deno.serve(async (req) => {
  try {
    // function logic
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    Sentry.captureException(error);
    await Sentry.flush(2000);   // flush before function exits — standard serverless requirement;
                                // not explicitly confirmed by Sentry Deno docs but is the known pattern
    return new Response("Internal error", { status: 500 });
  }
});
```

Supabase natively surfaces uncaught exceptions in the Functions dashboard (Dashboard → Functions → Logs). Sentry adds cross-system aggregation and alerting on top of that.  
Source: https://supabase.com/docs/guides/functions/logging and https://docs.sentry.io/platforms/javascript/guides/deno/

---

## Background jobs (Trigger.dev v3 / Inngest)

Neither Trigger.dev nor Inngest has native Sentry integration. Both have their own dashboards for run state and retry history. Sentry adds cross-system error aggregation.

**Key rule: always re-throw after capturing** so the platform also marks the run as failed and applies its retry logic.

### Trigger.dev v3

```typescript
import { task } from "@trigger.dev/sdk/v3";
import * as Sentry from "@sentry/nextjs";

export const myTask = task({
  id: "my-task",
  run: async (payload) => {
    try {
      // task logic
    } catch (err) {
      Sentry.captureException(err, {
        tags: { task_id: "my-task" },
        extra: { payload },
      });
      throw err;   // re-throw — Trigger.dev marks the run failed and applies retry config
    }
  },
});
```

Source: https://trigger.dev/docs/errors-retrying (no Sentry mention in Trigger.dev docs — pattern inferred from Sentry's captureException API)

### Inngest

```typescript
import { inngest } from "./client";
import * as Sentry from "@sentry/nextjs";

export const myFunction = inngest.createFunction(
  { id: "my-function" },
  { event: "my/event" },
  async ({ event, step }) => {
    return await step.run("do-work", async () => {
      try {
        // work here
      } catch (err) {
        Sentry.captureException(err, {
          tags: { inngest_function: "my-function" },
          extra: { event_id: event.id },
        });
        throw err;   // re-throw — Inngest handles retry
      }
    });
  }
);
```

Source: https://www.inngest.com/docs/guides/error-handling (no Sentry mention in Inngest docs — pattern inferred)

For Trigger.dev task structure → **JOB_KB_4**. For dead-letter and run-failure alert routing → **OBS_KB_4**.

---

## User context and PII

### setUser — id only

```typescript
// Call once after auth resolves (layout, middleware, or Server Component context)
Sentry.setUser({ id: user.id });   // internal identifier — not PII in most definitions

// To clear on sign-out:
Sentry.setUser(null);
```

Source: https://docs.sentry.io/platforms/javascript/enriching-events/identify-user/

### Multi-tenant: org context via setTag and setContext

```typescript
Sentry.setUser({ id: user.id });

// setTag — indexed and filterable in Sentry UI
Sentry.setTag("org_id", session.orgId);
Sentry.setTag("plan", session.plan);

// setContext — visible on issue pages, not searchable
Sentry.setContext("organization", {
  org_id: session.orgId,
  plan: session.plan,
});
```

Source: https://docs.sentry.io/platforms/javascript/enriching-events/context/

### sendDefaultPii

`sendDefaultPii: false` (SDK default, not wizard default) prevents:
- Automatic `ip_address` capture (v10.4.0 fixed this flag actually gating IP inference — the behavior was advertised since v9 but did not take effect until v10.4.0)
- Request headers in events

Set `sendDefaultPii: false` in all three config files. If IP collection is needed for security analysis, enable it with a server-side scrubbing rule in Sentry project settings to drop `$user.ip_address` for users in restricted regions.  
Source: https://docs.sentry.io/platforms/javascript/guides/nextjs/migration/v9-to-v10/ and https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/

### beforeSend — strip before data reaches Sentry

```typescript
Sentry.init({
  beforeSend(event) {
    if (event.user) {
      delete event.user.email;
      delete event.user.username;
    }
    return event;   // return null to drop the event entirely
  },
});
```

Server-side scrubbing (Sentry project settings) catches fields after they arrive. For fields that must never reach Sentry at all, use `beforeSend`.  
Source: https://docs.sentry.io/platforms/javascript/data-management/sensitive-data/ and https://docs.sentry.io/security-legal-pii/scrubbing/server-side-scrubbing/

---

## Filtering noise

```typescript
Sentry.init({
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    /^Network request failed$/,
  ],
  allowUrls: [/your-domain\.com/],   // capture only errors from your own code
  beforeSend(event) {
    // return null to drop; return event to keep
    return event;
  },
});
```

`thirdPartyErrorFilterIntegration` (v8.10.0+) marks your JS files at build time and filters errors from unmarked (third-party) code at runtime.  
Source: https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/filtering/

---

## captureException with context

```typescript
Sentry.captureException(error, {
  tags: { section: "checkout", feature: "payment" },   // searchable
  extra: { orderId, userId: user.id },                  // non-searchable context
});
```

Always pass actual `Error` instances — non-Error objects produce incomplete stack traces.  
Source: https://docs.sentry.io/platforms/javascript/usage/

---

## Ad-blocker bypass (tunnelRoute)

```typescript
withSentryConfig(nextConfig, {
  tunnelRoute: "/sentry-tunnel",
});
```

Routes browser→Sentry events through your Next.js server. Increases server load — every client-side Sentry event goes through your origin. Exclude `/sentry-tunnel` from your proxy/middleware matcher.  
Source: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#configure-tunneling-to-avoid-ad-blockers

---

## Always / Never

**ALWAYS** re-throw after `captureException` in background job catch blocks so the job platform (Trigger.dev / Inngest) also marks the run as failed and triggers its retry logic.

**ALWAYS** call `Sentry.captureException(error)` in `useEffect` inside `error.tsx` and `global-error.tsx` — Sentry does not auto-capture errors that reach these boundaries.

**ALWAYS** call `await Sentry.flush(2000)` before a Supabase Edge Function (or any short-lived serverless function) returns an error response — the process may exit before Sentry flushes its queue otherwise.

**ALWAYS** set `sendDefaultPii: false` unless legal has reviewed IP and header collection under your applicable data-protection obligations.

**NEVER** set `user.email`, `user.username`, or any user-facing identifier in `Sentry.setUser()` without legal sign-off — these are PII and are stored in Sentry's cloud.

**NEVER** set PII fields as tags (`setTag`) — tags are indexed and searchable, compounding exposure.

**NEVER** pass raw JWT tokens, Supabase service role keys, or PHI in `extra`, breadcrumbs, or context — the default Sentry server-side scrubbing catches `token` and `bearer` keyword patterns, but do not rely on scrubbing as a first line of defense.

**NEVER** capture the same error in two locations (e.g., both `error.tsx` and a parent component that also catches) — Sentry will create duplicate issues.

---

## Gotchas

**"If you catch an error and don't re-throw it, Sentry never sees it."** This is the most common reason errors go missing. Every swallowed catch block needs an explicit `captureException`.  
Source: https://docs.sentry.io/platforms/javascript/guides/nextjs/capturing-errors/

**pnpm + import-in-the-middle conflicts.** Sentry's OTel dependency (`import-in-the-middle`) needs hoisting in pnpm projects. Add hoisting patterns to `.npmrc` if you see initialization errors.  
Source: https://docs.sentry.io/platforms/javascript/guides/nextjs/troubleshooting/

**`sideEffects: false` in package.json breaks Sentry init.** Aggressive tree-shaking strips the SDK initialization side effects. Remove `sideEffects: false` or exclude Sentry packages from it.  
Source: https://docs.sentry.io/platforms/javascript/guides/nextjs/troubleshooting/

**`NEXT_PUBLIC_SENTRY_DSN` prefix required for client-side.** The DSN must be prefixed `NEXT_PUBLIC_` to be available in browser code. Use `debug: true` during setup to verify the SDK is initializing.  
Source: https://docs.sentry.io/platforms/javascript/guides/nextjs/troubleshooting/

**Missing stack traces in production.** Source map upload must succeed. Server errors include a `digest` property for cross-referencing with operational logs — see OBS_KB_1.

**`onRequestError` requires both `@sentry/nextjs >= 8.28.0` AND `next >= 15`.** For Next.js 14, automatic RSC error capture via `onRequestError` is not available — manual `captureException` in Server Components and wrapping with `withServerActionInstrumentation` are the fallbacks.  
Source: https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#react-server-components

---

## Cross-references

- **OBS_KB_1** — Structured operational logs to Axiom. The `request_id` propagation contract that Sentry breadcrumbs should mirror. Logger import for use alongside `captureException` in catch blocks.
- **OBS_KB_3** — Immutable audit events in Postgres. Not exception tracking — separate concern.
- **OBS_KB_4** — Run-failure alerts, queue depth, dead-letter monitoring for Trigger.dev / Inngest. Error capture in this KB; alert routing is there.
- **AUTH_KB_4** — Server Action authoring patterns and proxy structure. Sentry `withServerActionInstrumentation` wraps the action body shown in AUTH_KB_4's catch pattern.
- **JOB_KB_4** — Trigger.dev v3 / Inngest task structure. `captureException` + re-throw is the only Sentry integration point; task retry and lifecycle config lives there.
