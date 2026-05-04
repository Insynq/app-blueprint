# SB_KB_8 — Subdomain Routing for Multi-Org in Next.js App Router

**Stack-locked: Next.js App Router + Vercel. Not portable to other hosting.**

---

## Pattern

Each org gets a branded subdomain (`acme.app.com`) and optionally a custom domain (`onboarding.acme.com`). An Edge middleware reads the `host` header, extracts the tenant slug, looks it up in a fast edge store (Vercel KV / Edge Config / Upstash Redis — never raw Postgres), and rewrites the request into a `[slug]` dynamic route segment that Server Components read. Vercel handles wildcard SSL and custom domain verification automatically.

This is the pattern Dub.co uses for ~3,000 customer domains on a single Next.js project.

---

## When to use / when to skip

**Use when:**
- Each tenant needs its own branded URL
- You want one Next.js project (not one deployment per tenant)
- Tenants may bring their own domain (`BYOD`)

**Skip when:**
- Path-based tenancy (`app.com/t/acme/...`) is acceptable — simpler, no middleware needed, no wildcard DNS
- You're building an internal tool with one org — no subdomain routing needed

---

## Anti-patterns

**Querying Postgres from middleware**
Next.js Edge Runtime does not support TCP connections. Raw Supabase DB queries from `middleware.ts` fail at runtime. Use an HTTP-based edge store.

**Trusting client-supplied `x-org-*` headers**
If middleware reads `x-org-slug` from the request and a client sets that header manually, it can impersonate any tenant. Always **overwrite** org headers in middleware — never pass through client-supplied ones.

**Naive `host.split('.')[0]` for subdomain extraction**
Breaks on: `www`, apex domain, Vercel preview URLs (`tenant---branch.vercel.app`), multi-label TLDs (`co.uk`), and `*.localhost`. See the full extraction logic below.

**`*.app.com` via Cloudflare proxy (orange cloud)**
Vercel needs DNS-01 challenge to issue the wildcard Let's Encrypt cert for `*.app.com`. Cloudflare proxying blocks DNS-01. Use nameserver delegation to Vercel, or use a subdomain-specific CNAME record for each tenant (doesn't scale past ~100 tenants).

**Setting Supabase auth cookies with `domain=.app.com`**
Sessions survive subdomain hops on `*.app.com` — fine. But custom-domain tenants (`onboarding.acme.com`) are a different apex domain. Auth cookies don't cross. You need a token-exchange SSO bridge for custom domains.

**One Vercel project per tenant**
Doesn't scale. Doesn't share code. Wildcard certs don't apply. The entire point of this pattern is N tenants on one project.

---

## Generic example

```ts
// middleware.ts
import { NextResponse, type NextRequest } from 'next/server';

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN!; // e.g., "app.com"
const RESERVED_SUBDOMAINS = new Set([
  'www', 'api', 'admin', 'app', 'auth', 'cdn', 'static', 'mail',
]);

function extractTenantSlug(req: NextRequest): string | null {
  const url = req.url;
  const rawHost = (req.headers.get('host') ?? '').split(':')[0]; // strip port

  // Local development: tenant.localhost or tenant.lvh.me
  const localhostMatch = url.match(/http:\/\/([^.]+)\.(localhost|lvh\.me)/);
  if (localhostMatch) return localhostMatch[1] || null;

  // Vercel preview deployments: tenant---branch-proj.vercel.app
  if (rawHost.includes('---') && rawHost.endsWith('.vercel.app')) {
    return rawHost.split('---')[0] || null;
  }

  // Subdomain of root domain: acme.app.com
  const root = ROOT_DOMAIN.split(':')[0];
  if (rawHost !== root && rawHost !== `www.${root}` && rawHost.endsWith(`.${root}`)) {
    return rawHost.slice(0, rawHost.length - root.length - 1);
  }

  return null; // apex domain or unrecognized
}

function isCustomDomain(req: NextRequest): boolean {
  const host = (req.headers.get('host') ?? '').split(':')[0];
  const root = ROOT_DOMAIN.split(':')[0];
  return (
    !host.endsWith(`.${root}`) &&
    host !== root &&
    !host.includes('localhost') &&
    !host.includes('lvh.me') &&
    !host.endsWith('.vercel.app')
  );
}

export async function middleware(req: NextRequest) {
  const slug = extractTenantSlug(req);
  const custom = !slug && isCustomDomain(req);
  const host = (req.headers.get('host') ?? '').split(':')[0];

  // Apex or www — serve marketing/login, no rewrite needed
  if (!slug && !custom) return NextResponse.next();

  // Reserved subdomains — let routing handle normally
  if (slug && RESERVED_SUBDOMAINS.has(slug)) return NextResponse.next();

  const tenantKey = slug ?? host; // host as key for custom domains

  // Look up tenant in edge store (KV, Edge Config, or Upstash)
  // Never query Postgres here
  const orgId = await edgeStore.get(`tenant:${tenantKey}`);
  if (!orgId) return new Response('Not found', { status: 404 });

  // Rewrite into [slug] dynamic route, injecting org context as headers
  const rewriteUrl = new URL(`/t/${tenantKey}${req.nextUrl.pathname}`, req.url);
  const headers = new Headers(req.headers);
  headers.set('x-org-id', orgId);    // always overwrite — never trust client value
  headers.set('x-org-slug', tenantKey);
  headers.set('x-host', host);

  return NextResponse.rewrite(rewriteUrl, { request: { headers } });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
```

**Reading org context in Server Components:**
```ts
// app/t/[slug]/layout.tsx
import { headers } from 'next/headers';

export default async function TenantLayout({ children, params }) {
  const h = await headers();             // Next.js 15+: headers() is async
  const orgId = h.get('x-org-id');       // trusted — set by middleware
  const orgSlug = h.get('x-org-slug');

  const org = await getOrgById(orgId);  // DB read here is fine — RSC context
  return <OrgProvider org={org}>{children}</OrgProvider>;
}
```

**Custom domain registration via Vercel API:**
```ts
// Called when a tenant adds a custom domain in your app's settings
async function addCustomDomain(domain: string, orgId: string) {
  // 1. Add to Vercel project
  await fetch(`https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/domains`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
    body: JSON.stringify({ name: domain }),
  });

  // 2. Store mapping in edge store
  await edgeStore.set(`tenant:${domain}`, orgId);

  // 3. Return DNS verification instructions to the tenant
  // Poll GET /v9/projects/{id}/domains/{domain} until verified = true
}
```

**Edge store population (keep slug → orgId mapping fresh):**
```ts
// Supabase webhook or DB trigger calls this when an org's slug or custom domain changes
export async function POST(req: Request) {
  const { org_id, slug, custom_domain } = await req.json();
  await edgeStore.set(`tenant:${slug}`, org_id);
  if (custom_domain) await edgeStore.set(`tenant:${custom_domain}`, org_id);
}
```

---

## Trade-offs

| Edge store | Read latency | Write latency | Limit |
|---|---|---|---|
| **Vercel Edge Config** | ~15ms global | ~500ms (REST API) | 512 KB total; ~5K keys |
| **Vercel KV (Upstash Redis)** | ~30ms global | ~30ms | Plan-dependent |
| **Upstash Redis (direct)** | ~30ms global | ~30ms | Plan-dependent |
| **Cloudflare KV** | ~10ms global | Minutes (eventual) | Different platform |

Edge Config is best for rarely-changing slug→orgId mappings (updated only when a tenant changes their slug). KV is better when mappings change frequently or you have many tenants approaching Edge Config's 512 KB limit.

---

## Gotchas

**`*.app.com` wildcard cert requires Vercel nameservers.** You cannot use Cloudflare proxy (orange cloud) in front of Vercel if you want Let's Encrypt to issue `*.app.com` — that cert requires DNS-01 challenge, which Cloudflare proxy blocks. Options: use Vercel nameservers; or use Cloudflare DNS-only (grey cloud) with Cloudflare's wildcard cert via their API separately.

**Preview deployments emit `tenant---branch-proj.vercel.app` URLs.** The `---` separator is Vercel's convention. Your `extractTenantSlug` must handle this; otherwise every preview deploy resolves to slug `tenant` and looks up the wrong org (or crashes on undefined).

**Supabase auth on custom domains requires a token-exchange bridge.** Supabase Auth sets cookies scoped to `supabase.co` or your custom auth domain. A custom-domain tenant (`onboarding.acme.com`) can't receive that cookie. Pattern: after Supabase login on your app domain, exchange the session token for a short-lived code via a `/auth/exchange` endpoint, redirect to the custom domain with `?code=...`, and the custom domain immediately exchanges it for a session. This is complex — budget time for it.

**`localhost` subdomains in modern browsers.** Chrome, Firefox, and Safari resolve `*.localhost → 127.0.0.1` automatically. But Supabase cookies with `domain=.localhost` are rejected by browsers (`.localhost` is not a valid cookie domain). Use `lvh.me` or `localtest.me` for local subdomain development instead.

**Next.js 16 (Oct 2025) renamed middleware to proxy.** Three changes, not one: (1) filename `middleware.ts` → `proxy.ts`, (2) exported function name `middleware` → `proxy`, (3) runtime is **Node.js only** — Edge Runtime is not supported in proxy and cannot be configured. A codemod (`npx @next/codemod@canary middleware-to-proxy`) handles the rename. If you're on Next 14/15, `middleware.ts` with Edge Runtime is current and stable. Plan for the runtime change when you upgrade — Node.js cold-starts are slower than Edge, which matters for tenant resolution on every request.

**Don't use `unstable_after()` or `after()` from middleware for tenant context.** These run after the response is sent — too late to influence rendering or headers.
