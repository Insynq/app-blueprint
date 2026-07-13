# MOB_KB_2 — The Parity Contract: Porting a Web App Against a Contract, Not Vibes

> Field-derived 2026-07-13 from one live web→RN port (July 2026, internal Supabase dashboard → Expo SDK 57 iPhone app); iOS-validated only.

## The rule

A faithful port starts with an exhaustive, `file:line`-cited **parity contract** of the source app, authored by a **read-only crawler agent** *before* any spec or stack decision is final. Workers port against the contract, never against memory of the web app. The contract is the single document a worker consults to answer "what exactly does the web app do here?" — if the answer isn't in the contract, the contract is incomplete, and the fix is to extend the contract, not to go read the web app ad hoc mid-implementation.

Why this is the centerpiece: the field run's query layer ported near-verbatim *because* the contract had already pinned every module, every column allowlist, and every error-contract nuance. Workers with a contract produce parity; workers with impressions produce drift.

## Required sections of a parity contract

- **§0 mechanism map** (template below) — the web-mechanism → mobile-replacement table. Read first.
- **§1 Screen catalog** — every route: roles that reach it, data fan-out (which fetchers, concurrent or sequential), UI islands.
- **§2 Query-contract table** — every query module: view/table read, **column allowlist**, filters/ordering, and the **error contract**. Example of a load-bearing error contract from the field run: a never-throw layer where `{data: null}` means *failure* and `[]` means *true-empty* — **two states that must render differently** ("Couldn't load…" vs "Nothing here."). Never coerce one into the other.
- **§3 Auth + capability matrix**, including the **load-bearing security analysis: which gates are RLS-enforced vs app-code-only**. On-device, queries run on the user's device, so any app-code-only gate stops being a boundary — **flag each one**. This section is what MOB_KB_3's security invariants enforce.
- **§4 Write paths** — the exact table/column/storage-path contracts of every sanctioned write, including ordering (e.g. upload-before-insert) and guard order.
- **§5 Storage / document access model** — buckets, path-prefix conventions, how documents are served today (proxy? signed URLs?), and which storage RLS policies gate which prefixes.
- **§6+ Feature-specific interaction specs** — one section per bespoke interactive surface (gesture decks, recorders, viewers, wizards): thresholds, axis-locks, commit rules, keyboard/undo semantics, feedback timings.
- **Design tokens as literal values** — hex colors, radii, spacing, font names, motion durations/easings, copied out of the web app's source, not described. The mobile theme re-encodes these literals (the web UI family's token canon — see `UI_KB_0_Index` — is the source the contract snapshots).
- **A "deliberate deviations" candidate list for the PM** — places where a 1:1 port is the wrong call on a device (navigation IA, auth flows that need deep-link plumbing, server proxies with no mobile equivalent, URL-param state). The contract *nominates* deviations; the PM *decides* them, and each decided deviation lands in the port spec with its justification.

## The §0 mechanism map

Reproduce this table at the top of every parity contract, filled in for the source app. It answers the ported worker's most common question — "the web does this on the server; what do I do?" — once, centrally.

| Web mechanism | Where it runs today | Mobile replacement |
|---|---|---|
| Server-side cookie-bound Supabase client | server, per request | Single on-device `supabase-js` client with persisted session (MOB_KB_3) |
| Middleware session refresh + redirect gates | edge/server middleware | Auth-state listener + navigation guards; `autoRefreshToken` replaces the refresh |
| Per-request server identity helper | server, per request | One-time claims fetch on session change, held in app context |
| Server Components' `Promise.all` over query modules | server | **The same query modules run unchanged on-device when they take an injected client** — the crown-jewel port |
| Cookie-authed document proxy route | route handler | On-device `createSignedUrl` under the user's RLS-scoped session (MOB_KB_3 posture step-down) |
| Server actions | server | Client functions under RLS |
| Framework font loading | server/build | Bundled font assets |
| Tailwind classes | build | NativeWind / theme re-encoding of the literal tokens |
| Server API routes that merely wrap query modules | route handler | Call the modules directly on-device |

(One recurring mechanism lives in the interaction specs rather than §0: web `?view=` / `?tab=` URL params become component/router state on mobile.)

## Port vs rewrite — guidance from the field run

- **Ports near-verbatim:** pure, injected-client query layers (the crown jewel — same modules, same allowlists, same error contract); capability predicates; formatting helpers (with their date-string and Intl caveats — MOB_KB_5); type contracts.
- **Rewrites (same behavior, new implementation):** UI primitives (dialogs → modals/bottom sheets, tables → lists), gesture surfaces (pointer events → gesture-handler + reanimated), audio capture (Web Audio → `expo-audio`), document viewers (iframe → WebView/`expo-image`).
- **Replaced per §0, never emulated:** server-only plumbing — proxies, middleware, server actions. There is no server on the device; do not build a fake one. Each of these has a named mobile replacement in the mechanism map.

## Keeping the contract current (the delta re-crawl)

> Installed 2026-07-13, not yet proven in a live run.

The contract is dated the moment it's written; it stays authoritative only if every catch-up cycle advances it. The `Parity baseline:` stamp in the inventory header is the sync anchor — it records the web-repo HEAD sha the contract was last crawled against; a delta re-crawl (`/port-mobile` sync mode) diffs the web repo from that sha, updates only the affected sections in place, and advances the stamp.

Every changed file in the delta classifies into **five buckets**: **backend-shared** (paths under `supabase/` — `supabase/migrations/*.sql`, `supabase/functions/**`, `supabase/config.toml` — shared with mobile automatically, no port work; note type-regen if schema changed) · **web-frontend, existing surface** (map through the §0 mechanism map) · **new surface** (port candidate for the PM) · **on the decided deliberate-deviations list** (skip, note) · **no parity impact** (docs, CI/tooling, web-only tests, lockfile-only bumps — noted in the delta report, no work generated).

The standing rule extends to catch-up: **extend the contract, never ad-hoc reads of the web app.** The drift filter is the **decided** deviations block in the port spec — the contract only *nominates* deviations; decisions live there. App-source drift is therefore always classifiable as *port it*, *deviated on purpose*, or *gap* — and an app-source change you cannot classify means the contract is missing a section, not that the change is exempt.
