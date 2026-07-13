# Mobile-port intake spec — React Native / Expo companion-app capability, first downstream field intake

> **Status: LOCKED 2026-07-13** (plan review complete — all findings folded; audit record at bottom)

**Source:** the Kai-Mobile port (2026-07-11 → 2026-07-12): a near-one-shot conversion of Kai-App (Next.js 16 / Supabase web dashboard) into a working, device-installed Expo SDK 57 iPhone app, executed with this framework's multi-agent workflow from PM context. Primary artifacts: Kai-App session transcripts `77770d72-…` (research → LOCKED spec → 8-worker waved build) and `8a083a4a-…` (3-judge stress panel → fix wave → simulator/Maestro verification → device install → write-flag graduation), and the Kai-Mobile repo (13 commits, `c8f1870` → `e917ee6`, ~19.9k LOC, strict TS, zero suppressions).

**Method & provenance.** Candidate material gathered 2026-07-13 by a four-agent Opus review orchestrated from app-blueprint: two transcript analysts (build sessions + lead-up sessions), one Kai-Mobile repo reviewer, one framework gap-mapper. Key gap-map facts this spec builds on: app-blueprint contains **zero** native-mobile/RN/Expo guidance (grep re-verified 2026-07-13 — the one prior reference is a forward-note at `docs/Form KBs/FORM_KB_00_Index.md:99`, "React Native form patterns differ enough to need their own folder if adopted," which pre-sanctions this family rather than conflicting with it); the backend KB families (Supabase, Job, and the DB halves of Auth/Obs/Bill) already serve a mobile client unchanged; the client-facing families (UI-UX, Test, Form, AI-streaming, Bill-checkout) are web-locked by design; and a product currently has **no way to declare a second client target** (single-frontend `## Tech Stack`, no mobile branch in `/kickoff`, `/adopt` hard-exits on monorepos). The port itself confirmed this live: its research agent recorded *"app-blueprint has zero mobile guidance — greenfield for the framework."*

**Unlike the agent-blueprint intakes, most of this content is field-proven, not speculative** — it was executed once, end-to-end, to a physical device. The standing caveats: **one** port, **iOS only**, one stack generation (Expo SDK 57, July 2026). Flag convention for this spec: ported prose ships flagged `Field-derived 2026-07-13 from one live web→RN port; iOS-validated only`. Any Android-specific claim is additionally flagged `unproven — no Android field run yet`.

**Conventions.** Decisions per-section in `Decision | Choice | Reasoning | Date` tables. Every edit block quotes a verbatim anchor verified against `HEAD` = `fb757ae` (2026-07-13) while authoring. New-file targets are confirmed absent. **Scrub rule (load-bearing):** the harvest sources are a private downstream product. KB/command content authored from them must be **self-contained and anonymized** — no Supabase project refs, bundle IDs, credentials, table/column names, role names, or product names from Kai. Cite the field example as "a July 2026 web→RN port of an internal Supabase dashboard." Structural shapes, library choices, gotchas, and runbook steps port; product specifics do not.

**Harvest sources (absolute paths — available on this machine only, not to adopters; hence the self-containment rule):**

| Source | What to harvest |
|---|---|
| `/Users/chrisparsons/Documents/GitHub/Kai/Kai-Mobile/docs/research/rn-stack-research.md` | Stack-research template + July 2026 dated snapshot (§B of MOB_KB_1) |
| `/Users/chrisparsons/Documents/GitHub/Kai/Kai-Mobile/docs/research/codebase-inventory.md` | Parity-contract method; §0 mechanism-mapping table |
| `/Users/chrisparsons/Documents/GitHub/Kai/Kai-Mobile/docs/kai-mobile-v1-spec.md` | Port-spec shape: deliberate-deviations block, security-invariants block, §6a binding plan-review resolutions |
| `/Users/chrisparsons/Documents/GitHub/Kai/Kai-Mobile/docs/DISTRIBUTION.md` | Two-actor (USER vs AGENT/CLI) distribution runbook |
| `/Users/chrisparsons/Documents/GitHub/Kai/Kai-Mobile/docs/smoke-tests-pending.md` | Device smoke lanes + sim-walk annotation pattern |
| `/Users/chrisparsons/Documents/GitHub/Kai/Kai-Mobile/docs/CHANGELOG.md` | Device-install friction record: free-signing caveats (7-day / single-device / no-OTA), the Expo-CLI-can't-see-Xcode-26-cert-store incident, xcodebuild-direct resolution |
| Transcripts (Kai-App project dir, `77770d72`/`8a083a4a`) | Friction log: code-signing walkthrough, disk-space preflight numbers, `devicectl` commands, Maestro selector advice |

**Transcript-derived content is canonicalized in THIS spec.** The code-signing walkthrough, native-build preflight numbers, `devicectl` fallback commands, and Maestro selector advice in A5/A6 appear in no harvest doc — the edit-block text below is their source of record; KB authors copy from this spec, not from the docs. `[VERIFY at implement: the six harvest paths above exist and are readable — RESOLVED: all read 2026-07-13 on this machine by the gathering agents and this review's fidelity investigator; re-check at dispatch since they live in a separate private repo.]`

---

## Theme

The port succeeded because the framework's existing disciplines were applied to a new platform, plus three things the framework did not provide and the session had to invent just-in-time: (1) a **parity contract** — an exhaustive `file:line` inventory of the source app that let workers port against a contract instead of vibes; (2) **dated, cited, just-in-time stack research** — because the RN ecosystem moves quarterly and a frozen recommendation would rot; (3) **native-boundary operational knowledge** — code signing, EAS/TestFlight, Hermes quirks, device-vs-simulator verification — where all of the actual friction lived. This spec captures those three as a new stack-reference KB family, encodes the proven pipeline as a `/port-mobile` orchestrator, and closes the schema gap that prevents a product from declaring a second client target at all.

What this spec deliberately does **not** do: rewrite the web-locked KB families for mobile. The Supabase/Job/Auth-DB families already serve a mobile client unchanged — that is an architecture strength the new family's index states explicitly.

---

## File-touch map

| Section | Items | Targets |
|---|---|---|
| **A. New Mobile KB family** | A1–A6 | new `docs/Mobile KBs/` — `MOB_KB_00_Index.md`, `MOB_KB_1` … `MOB_KB_5` |
| **B. New orchestrator command** | B1 | new `.claude/commands/port-mobile.md` |
| **C. Second-client-target declaration** | C1, C2 | `.claude/commands/kickoff.md` (two edits) |
| **D. Wiring** | D1–D4 | `docs/KB_INDEX.md`, `CLAUDE.md` (two edits), `.framework-manifest.json` |

---

# Section A — New stack-reference KB family: `docs/Mobile KBs/` (`MOB_KB_*`)

**What.** A sixth-through-tenth-file KB family covering the native-mobile companion client: stack selection, the parity-contract port method, Supabase on-device, distribution, and platform gotchas/verification. It is a **client-family sibling to the UI-UX KBs**, not a fork of them: it assumes the same Supabase backend canon (`SB_KB_*`, `JOB_KB_*`, auth DB halves) applies unchanged, and it owns only what is genuinely different on a device.

### Decisions

| Decision | Choice | Reasoning | Date |
|---|---|---|---|
| Family scope | React Native / **Expo managed + dev client** as the vetted path; bare RN out of scope | The field run validated Expo end-to-end; the framework's KB families document one vetted stack per concern, not a survey | 2026-07-13 |
| File count | Index + 5 KBs | Matches the granularity of the smaller existing families (Job, Form); resists the temptation to pre-write unproven content | 2026-07-13 |
| Version-sensitive content | MOB_KB_1 carries the **method/template as canon** and the July 2026 stack snapshot as a **dated worked example**, with a mandatory re-verify-at-implementation-time rule | RN moves quarterly (SDK 56→57 landed inside the field run's own research window); a template + dated example ages honestly, a bare recommendation ages silently | 2026-07-13 |
| Android | Not covered beyond "nothing should preclude it"; every iOS-validated claim that *might* differ on Android is flagged | Zero Android field evidence; unproven guidance in a KB is worse than absent guidance | 2026-07-13 |
| Kai specifics | Scrubbed per the Conventions scrub rule | Public framework repo; private downstream product | 2026-07-13 |

### Edit blocks

#### Edit A1 — new `docs/Mobile KBs/MOB_KB_00_Index.md`

New file (directory confirmed absent). Follows the family-index shape (`file table`, always/never rules, dependencies, `VERIFY BEFORE SHIPPING`). Must contain:

- **Orientation:** this family covers the native mobile companion client (React Native via Expo managed + dev client) for a product whose backend is the framework's standard Supabase stack. **The backend KB families apply unchanged** — RLS, outbox, queues, auth claims, storage policies are client-agnostic; a mobile client is *another RLS-scoped consumer*, not a new backend. Read `SB_KB_00_Index` for anything database-shaped; this family owns only the device side.
- **The sanctioned two-client shape:** a **sibling repo sharing the one Supabase backend** (not a monorepo — `/adopt` and the installer do not support workspaces). The web app is a **read-only porting reference**; the port never modifies it, enforced as a per-wave byte-clean check (`git -C <web-repo> status --porcelain` empty / diff-clean against its HEAD). Declared in each repo's `CLAUDE.md` Tech Stack as its own client bullet naming the shared backend once.
- **File table** (real markdown table, house index shape, including the `Stack-portable?` column the other family indexes carry):

  | File | Covers | Stack-portable? |
  |---|---|---|
  | `MOB_KB_1_Stack_Selection.md` | JIT stack-research method + dated July 2026 worked example | ⚠️ method portable; snapshot Expo-locked and dated |
  | `MOB_KB_2_Parity_Contract.md` | Web→mobile port method: inventory sections, §0 mechanism map, port-vs-rewrite | ✅ method portable to any re-platform |
  | `MOB_KB_3_Supabase_On_Device.md` | Client config, claims/guards, signed-URL posture, screen-data lifecycle, writes, env | 🔒 Supabase + Expo |
  | `MOB_KB_4_Distribution.md` | EAS/TestFlight, code signing, free-signing bootstrap, native-build preflight | 🔒 Apple/EAS (iOS-validated) |
  | `MOB_KB_5_Gotchas_And_Verification.md` | Hermes/runtime gotchas, RN layout rules, smoke lanes, sim-walk, Maestro | ⚠️ mixed |
- **Always:** dev build, never Expo Go, once any native capability (mic, haptics, gestures) is in play · treat `EXPO_PUBLIC_*` as public (inlined into the JS bundle) — anon key + URL only · re-verify stack versions against current Expo SDK at implementation time (MOB_KB_1 rule) · any NEW client-originated write path ships behind a **fail-closed env flag** (`=== "true"` gate; canonical rule: `OBS_KB_5` Primitives 0/9 — close the capability, fail loud or closed) with honest UI when disabled, and flipping it live is a scope-graduation event per the CLAUDE.md verification-disciplines rule (explicit per-instance user grant) · runtime truths (gestures, metering, rendering) go to the device smoke catalog as deferred-to-device — build-time green (`tsc`, `expo export`) is never laundered into "verified".
- **Never:** service-role key or any server secret in the app bundle (there is no server hop to hide it) · fetch-then-hide as a capability gate — on-device, app-code gates are not a security boundary; a gate that must *hold* must be RLS-enforced, and UI gates reproduce **gated-non-fetch** for parity/least-exposure only (cross-ref `SB_KB_1`/`AUTH_KB_2` canon: authorization at the database) · new dependencies without New-Architecture support (legacy-only libs won't run on current SDKs) · `new Date()` on date-only strings ported from the web's string-math formatters.
- **Dependencies between files:** MOB_KB_2 (the parity contract) feeds MOB_KB_3 (its RLS-vs-app-gate analysis is what MOB_KB_3's invariants enforce) and MOB_KB_1 (deviation candidates inform stack picks); MOB_KB_4 consumes MOB_KB_1's distribution-research section. Cross-folder: `SB_KB_00`/`AUTH_KB_2` own the backend canon this family consumes unchanged; the UI-UX family's token canon (`UI_KB_0` index) is the source the parity contract snapshots as literal values; `OBS_KB_5` (Primitives 0/9) owns the fail-closed rule the write-flag discipline cites.
- **When to update these files:** MOB_KB_1 — append a new dated snapshot section on every new port's research pass (keep prior snapshots); MOB_KB_5 — whenever a device smoke or sim-walk surfaces a new platform gotcha; MOB_KB_4 — when Apple/EAS mechanics change (enrollment price, TestFlight caps, signing flow).
- **What these files do NOT cover:** Android (unproven — no field run), mobile billing/IAP, push notifications, offline/caching, realtime-on-device, bare React Native without Expo. Mirrors this spec's Parked table; each item has a promotion trigger there.
- Family provenance line (above VERIFY): `Field-derived 2026-07-13 from one live web→RN port (July 2026, internal Supabase dashboard → Expo SDK 57 iPhone app); iOS-validated only.`
- **VERIFY BEFORE SHIPPING (last section, house convention):** the port-specific checks — byte-clean source repo, write-flag fail-closed, no secret in bundle (`grep` for service-role/secret patterns), gated-non-fetch code trace on every capability gate, device smoke catalog exists with stable IDs.

#### Edit A2 — new `docs/Mobile KBs/MOB_KB_1_Stack_Selection.md`

Two-part file:

- **Part 1 — the method (canon):** stack research for a mobile port is done **just-in-time, per port**, by a dedicated research agent, because the RN ecosystem moves quarterly. The output template: (1) a `Concern | Library | Version (as of <month year>) | Why` summary table; (2) per-topic findings with **inline-cited sources for every version/behavior claim** ("checked via web search this month, not from memory"); (3) a distribution runbook section; (4) an explicit **Risks & open questions** section with mitigations and PM decisions needed. Rule: *the research doc is dated, and every consumer re-verifies SDK/bundled-lib versions at implementation time.*
- **Part 2 — dated worked example (July 2026, iOS-validated):** the harvested snapshot — Expo managed + dev client (New Architecture mandatory since SDK 55; Expo Go non-viable for native capabilities); expo-router (typed routes, `Stack.Protected` for auth/role guards); `@supabase/supabase-js` + AsyncStorage session (see MOB_KB_3); NativeWind to port a Tailwind class vocabulary (with the Tailwind-major-version alignment caveat as a worked risk example); `@expo-google-fonts/*` for font parity; FlashList for long lists (New-Arch-only); hand-rolled `react-native-svg` charts when the web hand-rolled SVG; `gesture-handler` + `reanimated` (+ worklets peer dep) for bespoke gestures over abandoned gesture libs; `expo-audio` (**`expo-av` removed in SDK 55**) with metering caveat; `expo-haptics`; `react-native-webview` for PDFs (dodges react-native-pdf's New-Arch blank-view bug) + `expo-image`; `expo-file-system` + `base64-arraybuffer` for binary upload; EAS Build/Submit/Update. Each entry keeps its one-line *why*, scrubbed of product specifics.

#### Edit A3 — new `docs/Mobile KBs/MOB_KB_2_Parity_Contract.md`

The port method's centerpiece. Contents:

- **The rule:** a faithful port starts with an exhaustive, `file:line`-cited **parity contract** of the source app, authored by a read-only crawler agent *before* any spec or stack decision is final. Workers port against the contract, never against memory of the web app.
- **Required sections of a parity contract:** §0 mechanism map (below) · §1 screen catalog (route, roles, data fan-out, UI islands) · §2 query-contract table (every module, view/table, column allowlist, error contract — e.g. a never-throw `{data: null}`-failure vs `[]`-empty distinction that must render differently) · §3 auth + capability matrix, including the **load-bearing security analysis: which gates are RLS-enforced vs app-code-only** — on-device, queries run on the user's device, so any app-code-only gate stops being a boundary; flag each one · §4 write paths (exact table/column/storage-path contracts) · §5 storage/document access model · §6+ feature-specific interaction specs · design tokens as **literal values** (hex, radii, spacing, font names) · a "deliberate deviations" candidate list for the PM.
- **The §0 mechanism map** (reproduce as the template, generalized): a `Web mechanism | Where it runs today | Mobile replacement` table covering — server-side cookie-bound Supabase client → single on-device client with persisted session; middleware session refresh + redirect gates → auth-state listener + navigation guards; per-request server identity helper → one-time claims fetch on session change held in app context; Server Components' `Promise.all` over query modules → **the same query modules run unchanged on-device when they take an injected client** (the crown-jewel port); cookie-authed document proxy route → on-device `createSignedUrl` (MOB_KB_3 posture); server actions → client functions under RLS; framework font loading → bundled font assets; Tailwind classes → NativeWind/theme re-encoding; server API routes that merely wrap query modules → call the modules directly on-device. (From the inventory's interaction-spec sections, not §0: web `?view=`/`?tab=` URL params become component/router state.)
- **Port-vs-rewrite guidance from the field run:** pure injected-client query layers port near-verbatim; UI primitives, gesture surfaces, audio, and document viewers are rewrites; server-only plumbing (proxies, middleware, server actions) is replaced per §0, never emulated.

#### Edit A4 — new `docs/Mobile KBs/MOB_KB_3_Supabase_On_Device.md`

- **Client config:** single `supabase-js` client — `storage: AsyncStorage`, `autoRefreshToken: true`, `persistSession: true`, `detectSessionInUrl: false`, `flowType: 'pkce'`; `AppState`-wired `startAutoRefresh()`/`stopAutoRefresh()`. Why AsyncStorage over SecureStore: SecureStore throws above 2 KB and JWTs with claims exceed it; the documented hardening option (AES-encrypt session, key in SecureStore) noted with its trigger. Session-at-rest-unencrypted recorded as an **accepted, documented trade-off** for internal/trusted-user apps — a decision, not a default.
- **Claims & guards:** `getClaims()` validates locally via JWKS when the project uses asymmetric signing keys (`[VERIFY per env]` — symmetric keys make it a network call); role/route gating via `Stack.Protected` + a reactive `onAuthStateChange` subscription (`SIGNED_OUT` → clear identity → guard drops to login; a query returning null is a **data failure, never inferred as logged-out**).
- **Storage reads — the posture step-down (load-bearing):** there is no server proxy on mobile; the standard pattern is on-device `createSignedUrl(path, <short TTL>)` under the user's RLS-scoped session — the RLS-checked signing call *is* the access control. Residual risk vs a web proxy (the time-boxed bearer URL exists in the app runtime) and the mitigations: short TTL (60–120 s; 120 s if slow-cellular renders fail at 60), render only inside in-app WebView/`expo-image`, never a share sheet or system browser for sensitive docs, never persist/log the URL. **Document the step-down explicitly in the port spec** — it is an accepted trade-off, not an oversight.
- **Writes:** binary upload path — RN `Blob` is unreliable; read the file via `expo-file-system` as base64 → `base64-arraybuffer.decode()` → `ArrayBuffer` upload with explicit `contentType`; assert `byteLength > 0` (the 0-byte un-awaited-read footgun) and a max-size guard. Inserts are plain `.insert()` under the user session — RLS-scoped, INSERT-only where the web was. New write paths behind the fail-closed flag (index Always rule), with **guard order fixed**: identity + input validation run BEFORE the flag gate, and the flag gate precedes ALL IO — the disabled stub path returns the same validation errors as live, so flipping the flag never unlocks a never-validated path.
- **Screen-data lifecycle (field BLOCKER-class finding):** the web re-renders per navigation on the server; mobile tab screens stay mounted. Ship ONE shared hook in the foundation wave — `useScreenData<T>(fetcher, deps)` → `{data, loading, error, refresh, refreshing}`: fetch on mount, refetch on `useFocusEffect`, `refresh()` wired to pull-to-refresh on every screen's root scroller; **no ad-hoc useEffect fetches anywhere**. Screens map loading → skeleton, `null` → unavailable, `[]` → empty. Batch signed-URL mints `Promise.all`-concurrent (serial mints stack latency).
- **Env posture:** `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` are public-by-design (same as `NEXT_PUBLIC_*`); EAS Environment Variables per profile for cloud builds; never a service-role key (no server exists).

#### Edit A5 — new `docs/Mobile KBs/MOB_KB_4_Distribution.md`

- **The two-actor runbook template (harvest the shape):** every distribution step is assigned to **USER** (anything requiring Apple identity, billing, or a password: Developer Program enrollment $99/yr, App Store Connect app record + team users, Apple-account login for credentials, device trust/Developer Mode) or **AGENT/CLI** (everything else: `eas init/credentials/build/submit/update`, config plugins, env vars). This split is what makes the runbook executable without stalling.
- **Distribution ladder, cheapest-first:** (1) simulator (no signing); (2) free personal-team device install — 7-day expiry, single device, no OTA; the distribution docs correctly call this unacceptable for *ongoing* distribution, but the field run validated it as a **pre-enrollment bootstrap** (tonight-on-my-phone, before the $99 enrollment clears); (3) TestFlight **internal** (≤100 testers, no Beta App Review, ~10–15 min processing) via EAS Build + Submit — the steady state for internal tools; (4) public App Store (out of family scope). EAS Update for OTA JS/asset fixes (seconds, no rebuild); native changes (new module, permission, SDK bump) need a rebuild.
- **Code signing — the #1 human-loop cost in the field run (~4 iterations):** the walkthrough — signing into the **Mac's** Apple ID is NOT signing into **Xcode's** Accounts tab (Settings → Accounts → add Apple ID) → Manage Certificates → “+” → Apple Development; then device: enable Developer Mode, trust the profile, phone plugged in and unlocked. Install route (field-tested): try `expo run:ios --device --configuration Release` first; when the Expo CLI can't see the new Xcode's cert store and dies at signing (the field run's actual failure on Xcode 26), go direct — `xcodebuild` archive/build + `devicectl device install app` / `devicectl device process launch` was the path that worked.
- **Native build environment preflight:** full Xcode (not just CLT) + license accepted; CocoaPods; the target iOS **simulator runtime downloaded** (`xcodebuild -downloadPlatform iOS`); **≥ 10 GB free disk before first native build** — the field run's recurring blocker was `ENOSPC` at 84–98 % disk; the cache-clearing sweep (DerivedData, npm/brew/CocoaPods caches) is the recovery move, but preflight beats recovery.
- Flag: `iOS-validated only; the Android lane (keystores, Play internal testing) is unproven — no Android field run yet.`

#### Edit A6 — new `docs/Mobile KBs/MOB_KB_5_Gotchas_And_Verification.md`

- **Hermes/runtime gotchas (each one bit or nearly bit the field run):** Hermes silently ignores `Intl.NumberFormat` `notation: "compact"` (and is inconsistent on some Intl surfaces) — a compact-currency tile rendered `$74,589.0`-style garbage; hand-roll compact/percent formatters and never trust Intl silently · `expo-av` is **removed** (SDK 55+) — `expo-audio`, whose recorder is a SharedObject with lifecycle rules (don't hold across screen focus changes; re-prepare after stop) and whose `metering` has intermittent-report history — validate on real hardware early, degrade the waveform gracefully · moti/New-Arch skeleton shimmer has a known issue — animated-opacity fallback · react-native-pdf blank-view under New Arch — WebView instead · focus-refetch (`useFocusEffect`) reshaping in-progress interactive state (a deck/wizard mid-flow) — guard stateful screens against refetch clobber · **FlashList is the ROOT scroller only** (header content via `ListHeaderComponent`), never nested inside a same-orientation ScrollView; detail/home screens = one ScrollView + plain `.map()` for short sub-lists · NativeWind/Tailwind-v3 opacity modifiers (`/10`) compose only on **base-hex** colors — pre-bake `rgba()` tokens as named alpha colors or the class silently no-ops · export expo-router `ErrorBoundary` from root + tab layouts: queries never throw, but derive/render code can — the boundary prevents a white screen while data failures still render as unavailable-state · respect `AccessibilityInfo.isReduceMotionEnabled` globally (parity with web `prefers-reduced-motion`).
- **Device verification model (harvest the smoke-catalog shape):** smoke IDs carry a **lane** — `wiring` (trace-verifiable) / `visual` (eyeball on device) / `integration` (live run against real data) / `device` (physical capabilities: mic, haptics, gestures). Everything runtime is **deferred-to-device at build time** when no simulator exists; build-time green is never laundered into verified (the project `smoke-tests-pending.md` conventions apply unchanged).
- **The sim-walk annotation pattern:** when a simulator comes online, a PM live-walk **annotates** each smoke with what it proved and what device residuals remain — annotations never flip `Status: Pending`; only the human device pass does. Distinguish "asserted absent" (driven check) from "eyeballed".
- **Maestro as the simulator driver:** works and caught a real bug in the field run; expect selector churn — prefer testID/accessibility-label selectors over text-match; read the view hierarchy when a selector misses; budget iteration time.

---

# Section B — New command: `.claude/commands/port-mobile.md`

**What.** A thin orchestrator encoding the proven pipeline. It drives the existing MAW phase loop (no changes to `MULTI_AGENT_WORKFLOW.md` needed — gap-map confirmed) with port-specific phases and hard rules. File confirmed absent.

### Decisions

| Decision | Choice | Reasoning | Date |
|---|---|---|---|
| Name | `/port-mobile` | Verb-first per AUTHORING §3; no existing family fits (`gen-*` generates artifacts, this orchestrates a project) | 2026-07-13 |
| Relationship to `/orchestrate` | Sibling orchestrator for the port project's *inception*; once the mobile repo exists, ongoing feature work there uses `/orchestrate` normally | One command per job; the port pipeline is a distinct, once-per-product procedure | 2026-07-13 |
| Scaffolding in the new repo | The command creates the minimal doc set its own pipeline produces (`docs/research/`, `docs/plans/`, the port spec, `docs/smoke-tests-pending.md`, `docs/CHANGELOG.md`, a CLAUDE.md pointing at the shared-backend declaration) — NOT the full framework install | Field evidence: the port ran fine without full scaffolding; full adoption of the mobile repo is a separate later decision (Open decision D-5) | 2026-07-13 |
| Argument posture | One optional argument — the source web-app path — prose-parsed from `$ARGUMENTS`; if absent, the command asks before proceeding | AUTHORING §2; the path is the one input the command must never invent (wrong target = wrong repo consumed); optionality keeps invocation frictionless | 2026-07-13 |

### Edit block B1 — new command file

**Frontmatter description (consumed-verbatim artifact — final text):**

```yaml
---
description: Use when an existing web app in this framework needs a native mobile companion app
  (React Native / Expo) sharing the same Supabase backend — e.g. "make this an iPhone app."
  Consumes the web repo read-only (never modified) and produces a NEW sibling mobile repo with a
  parity-contract inventory, a locked port spec, and a device-installable build. For a mobile-only
  greenfield app use /kickoff; for feature work inside an existing mobile repo use /orchestrate.
arguments:
  - name: web-app-path
    description: Path to the source web-app repo to port (e.g. ../my-app). Optional — the command asks if omitted.
    required: false
---
```

**Body outline (author at implement time per AUTHORING_COMMANDS; ~120–160 lines):**

0. **Preconditions & repo setup** — read the source web-app path from $ARGUMENTS (prose-parsed per AUTHORING §2; if empty, ask the user before doing anything else — never invent it); create/confirm the sibling target repo; state the **source-app read-only invariant** and install the per-wave byte-clean check; read `docs/Mobile KBs/MOB_KB_00_Index.md` first.
1. **Phase 1 — Parity contract**: dispatch a read-only crawler agent to author `docs/research/codebase-inventory.md` in the new repo per MOB_KB_2 (all required sections; the RLS-vs-app-code gate analysis is mandatory).
2. **Phase 2 — Stack research**: dispatch a research agent to author `docs/research/rn-stack-research.md` per MOB_KB_1's template — current-month web-verified versions, inline citations, risks + open PM questions. Runs in parallel with Phase 1.
3. **Phase 3 — Port spec**: author `docs/<app>-mobile-v1-spec.md` with the required blocks: product scope · **deliberate deviations from web (PM-decided, each justified)** · locked stack · architecture tree · **security invariants (LOAD-BEARING)** incl. gated-non-fetch parity and the signed-URL posture decision · acceptance criteria (build-time gates + device smoke catalog) · out-of-scope.
4. **Phase 4 — `/plan-review` lockdown**: BLOCKER/MAJOR resolutions folded into the spec as a **binding-on-all-workers** section before any dispatch.
5. **Phase 5 — Waved implementation**: MAW worker plan docs; foundation wave solo (theme tokens, client, auth context, routing shell, primitives), then parallel waves ordered by dependency with **frozen prop/type contracts** published in each worker's completion notes; disjoint file ownership; per-wave gates: `tsc --noEmit` 0, bundle export clean, security greps, source-repo byte-clean.
6. **Phase 6 — Verification**: device smoke catalog with lanes (MOB_KB_5); simulator + UI-automation walk when available (annotate, never flip); honest "built but never rendered" reporting when no simulator exists.
7. **Phase 7 — Distribution & ship**: MOB_KB_4 two-actor runbook; `/ship` conventions for the new repo.

**Hard rules stated up front:** the web app is NEVER modified · any new client write path ships fail-closed behind an env flag; flipping it is a scope-graduation event requiring an explicit user grant · build-time green is not device verification (smoke truth-gate applies) · re-verify stack versions at run time, don't trust MOB_KB_1's dated snapshot.

---

# Section C — Second-client-target declaration in `/kickoff`

**What.** Close the "can't even declare it" gap with two minimal edits. `/adopt` monorepo support is explicitly NOT in scope (parked — the sanctioned shape is a sibling repo, which `/adopt` handles today as a normal single repo).

### Edit C1 — `kickoff.md` Phase 4 pattern checklist

**Anchor (verbatim, exists today at `.claude/commands/kickoff.md:185`):**
```
   - *(UI apps only)* Mobile-friendly or PWA
```

**Change:**
```
   - *(UI apps only)* Mobile-friendly or PWA
   - *(UI apps only)* A native mobile companion app (iOS/Android) — now or on the roadmap? (If yes: the sanctioned shape is a separate sibling repo sharing this app's Supabase backend, ported later via /port-mobile — see docs/Mobile KBs/MOB_KB_00_Index.md. Record it as a second client target in Tech Stack; it does not change V1 web scope.)
```

While applying C1, also reconcile a pre-existing mislabel the new bullet would deepen: `kickoff.md:126` says "Replace question 4 (mobile/PWA)" but Phase 2's question 4 is the multiple-user-types question — the mobile/PWA item is actually the Phase-4 checklist bullet at :185. Reword :126's parenthetical to point at the Phase-4 checklist bullets so the two mobile-flavored bullets stay coherent for non-UI projects.

### Edit C2 — `kickoff.md` CLAUDE.md Tech Stack edit instruction

**Anchor (verbatim, exists today at `.claude/commands/kickoff.md:375`):**
```
4. **`## Tech Stack`** — bullets: frontend framework + key libraries, backend/database, auth, hosting, other services (payments, email, storage, etc.).
```

**Change:**
```
4. **`## Tech Stack`** — bullets: frontend framework + key libraries, backend/database, auth, hosting, other services (payments, email, storage, etc.). If the product has (or plans) more than one client — e.g. web + a native mobile companion — list each client target as its own bullet naming its framework and repo, and name the shared backend once (see docs/Mobile KBs/MOB_KB_00_Index.md for the sibling-repo shape).
```

---

# Section D — Wiring (index, CLAUDE.md, manifest)

### Edit D1 — `docs/KB_INDEX.md` (three touches)

**Anchor 1 (verbatim, `docs/KB_INDEX.md:3`):**
```
This index sits on top of the nine **stack-reference** KB folders under `docs/`.
```
**Change:** `nine` → `ten`. **Also** (anchor verified at `docs/KB_INDEX.md:8`): the file carries a second count word — `**Stack-reference KBs** (the nine folders below)` — update it to `ten` in the same edit, or :3 and :8 contradict each other.

**Anchor 2 (verbatim, `docs/KB_INDEX.md:10`):**
```
Folders: `Supabase Structure KBs/` (`SB_KB_*`), `UI-UX KBs/` (`UI_KB_*`), `Auth KBs/` (`AUTH_KB_*`), `Job KBs/` (`JOB_KB_*`), `Test KBs/` (`TEST_KB_*`), `Form KBs/` (`FORM_KB_*`), `Obs KBs/` (`OBS_KB_*`), `Bill KBs/` (`BILL_KB_*`), `AI KBs/` (`AI_KB_*`).
```
**Change:** append `` `Mobile KBs/` (`MOB_KB_*`). `` to the list (before the final period), and update the count sentence at :8's parenthetical stack description with ` + Expo/React Native for the optional mobile companion client` if the sentence structure allows a clean insertion; otherwise leave :8 untouched (the layer table row below carries the routing).

**Anchor 3 (verbatim, `docs/KB_INDEX.md:54`, last row of the "By stack layer" table):**
```
| Test strategy, pgTAP RLS, integration, component, E2E, async | `Test KBs/` |
```
**Change:** add a row after it:
```
| Native mobile companion (React Native / Expo), web→mobile ports, device distribution | `Mobile KBs/` |
```
Also add one task-table row (Anchor: the task table's last row at :36, the "Test a feature end-to-end" row): `| **Port the web app to a native mobile companion** | MOB_KB_00 → MOB_KB_2 → MOB_KB_1 → MOB_KB_3 → MOB_KB_4 → MOB_KB_5 |` — no command reference in the cell (**Why:** existing task rows never name commands; /port-mobile routing lives in CLAUDE.md's command table and MOB_KB_00. Decided 2026-07-13).

### Edit D2 — `CLAUDE.md` stack-reference KB bullet

**Anchor (verbatim, `CLAUDE.md:53`):**
```
- `docs/AI KBs/AI_KB_00_Index.md` — consult for Claude API integration, prompt caching, RAG with pgvector + Voyage embeddings, streaming UI in Next.js, tool use, MCP servers, agents (Claude Agent SDK), or evals.
```
**Change:** add a bullet after it:
```
- `docs/Mobile KBs/MOB_KB_00_Index.md` — consult for a native mobile companion app (React Native / Expo), web→mobile ports, Supabase on-device patterns, EAS/TestFlight distribution, or device verification.
```

### Edit D3 — `CLAUDE.md` Orchestrators command table

**Anchor (verbatim, `CLAUDE.md:88`):**
```
| `/orchestrate` | PM phase loop — pivot → brainstorm → plan + audit → workers → reconcile → implement → smoke → ship. See `docs/MULTI_AGENT_WORKFLOW.md`. |
```
**Change:** add a row after it:
```
| `/port-mobile` | Port the web app to a native mobile companion (React Native/Expo, sibling repo, shared Supabase backend) — parity contract → stack research → locked spec → waved build → device smokes → TestFlight |
```

### Edit D4 — `.framework-manifest.json`

Two array insertions (match the file's existing sort):
- `"docs/Mobile KBs/"` into `categories["framework-managed"]` at the file's strict-ASCII sort position: after `"docs/MULTI_AGENT_WORKFLOW.md"`, before `"docs/Obs KBs/"` (the array is case-sensitive ASCII sorted — `U` 0x55 < `o` 0x6F).
- `"docs/mobile-port-intake-spec.md"` into `categories["excluded"]` between `"docs/agent-blueprint-v07-intake-spec.md"` and `"docs/verification-discipline-adoption-spec.md"` (canonical-repo-internal, never shipped to adopters). **Sequencing:** D4 must land in the same commit that first git-tracks this spec file — `/ship` Step 4.5 gates on tracked-file manifest coverage.

Version bump + `FRAMEWORK_CHANGELOG.md` entry are `/ship`'s job at release time, not edits in this spec.

---

# Open decisions (for `/plan-review` to gate)

| ID | Fork | Options | Recommendation |
|---|---|---|---|
| **D-1** | Command name | (a) `/port-mobile`; (b) fold into `/orchestrate` as a mode; (c) `/gen-mobile` | **(a)** — distinct once-per-product procedure; a mode flag inside `/orchestrate` bloats the framework's most-loaded command |
| **D-2** | MOB_KB_1 dated snapshot: include or template-only? | (a) template + July 2026 worked example with mandatory re-verify rule; (b) template only | **(a)** — the example is field-validated and teaches the *shape* of good findings; the re-verify rule is the rot guard |
| **D-3** | Android posture | (a) flag-and-omit (this spec); (b) research Android now to ship both lanes | **(a)** — no field evidence; unproven KB content violates the family's own honesty rules |
| **D-4** | Mobile branches in `/gen-component`, `/gen-test`, `/audit-infra`, `/ship` | (a) now; (b) park with promotion trigger | **(b)** — park; promotion trigger: "first adopter project runs /port-mobile and hits the gap." The port field run never used those commands |
| **D-5** | Does the ported mobile repo get full framework adoption (`/adopt`)? | (a) minimal doc set only (B decision); (b) full install at port time | **(a)** now; revisit when a ported repo accumulates enough sessions that missing KBs/LESSONS visibly hurt (the field repo's state lives in its spec + plans, acknowledged debt) |

# Parked (not ported this pass)

| Item | Why parked | Promotion trigger |
|---|---|---|
| Android lane (keystores, Play internal testing, Android-specific gotchas) | Zero field evidence | First Android field run |
| Monorepo support in `/adopt` (`--target-package`) | Sibling-repo shape dodges it; already V2-flagged in adopt.md — hard gate at `adopt.md:111` ("Monorepo detection (HARD GATE — V1 limitation)"), exit message at `:134` ("V2 will support monorepos with a `--target-package` flag") [RESOLVED: quoted from the live file 2026-07-13, anchor-integrity pass] | An adopter with an existing web+mobile monorepo |
| Mobile billing (IAP / StoreKit / Play Billing) KB | The field app had no mobile billing; genuinely divergent domain | First adopter mobile app with payments |
| Push notifications / offline / realtime-on-device patterns | Explicitly out of the field run's v1 scope | Field usage |
| Mobile test scaffolding (Maestro flows in-repo, RN Testing Library) | Field run used Maestro interactively only; zero committed tests to harvest | First ported repo that commits a test suite |

---

## Provenance & flags

- Every KB/command authored from this spec carries: `Field-derived 2026-07-13 from one live web→RN port (July 2026); iOS-validated only.` Android-adjacent claims add `unproven — no Android field run yet`.
- The gathering method (four Opus agents over two transcripts + two repos) and their findings are recorded in the 2026-07-13 app-blueprint session; the load-bearing facts (zero mobile content; single-target stack schema; `/adopt` monorepo exit; the port's artifact list and friction log) were re-verified against the live repos while authoring, and all edit-block anchors were read verbatim from `HEAD` = `fb757ae`.
- **Scrub rule is load-bearing** (see Conventions): no Kai product specifics may reach the public framework surfaces.
- **Not a deploy authorization.** A LOCKED header on this spec certifies design completeness and dispatch-readiness only — implementation and the eventual framework release (`/ship`, version bump, npm publish) are separate, explicit user grants.

## /plan-review audit record (2026-07-13)

Four read-only Explore investigators, retargeted for a docs/commands intake spec: anchor-integrity, capture-recheck + coherence, harvest-source fidelity, and the Step 6a lockdown fork-scan.

- **Anchor-integrity: 10/10 PASS.** All verbatim anchors (kickoff :185/:375, CLAUDE.md :53/:88, KB_INDEX :3/:8/:10/:36/:54, manifest sort neighbors, adopt.md :111/:134) matched `HEAD` = `fb757ae` exactly; both new-file targets confirmed absent; `/ship` Step 4.5 mechanics confirmed (gate reads tracked files — hence D4's same-commit sequencing rule).
- **Fork-scan: FAIL with 1 → resolved.** The Parked table's adopt.md-V2 claim was an untagged environment claim; now cited with quoted evidence from the live file. All five open decisions (D-1…D-5) are backed by dated recorded decisions in the Section A/B tables (the two upstream forks, D-1 name and D-2 snapshot, are recorded decisions, satisfying the upstream-forks-block rule); no bare `TODO`/`TBD`; the in-content `[VERIFY per env]` tags are the permanent per-environment idiom, not unresolved lockdown items; the harvest-path `[VERIFY at implement]` is resolved with evidence and re-checked at dispatch.
- **Coherence: 2 must-fixes + shape gaps, all folded.** B1's YAML colon-space hazard reworded and the workflow-recital description trimmed to WHEN-shape (AUTHORING §1/§2); `$ARGUMENTS` posture decided and recorded (optional web-app-path argument); KB_INDEX's second "nine" (:8) added to D1; A1 upgraded to house index shape (file table with `Stack-portable?` column, Dependencies, When-to-update, NOT-cover sections, VERIFY last); fail-closed/scope-graduation now cite their canonical sources (`OBS_KB_5` Primitives 0/9, CLAUDE.md discipline) instead of paraphrasing them; the "zero mobile guidance" claim carries its `FORM_KB_00:99` carve-out (a forward-note that pre-sanctions this family); the KB_INDEX task-row command reference dropped for convention consistency; a pre-existing kickoff :126 mislabel is reconciled inside C1's scope.
- **Harvest fidelity: core clusters CONFIRMED; 1 misattribution + 2 source-tension items fixed; 7 missed disciplines folded.** A3 no longer attributes the URL-params row to the §0 table (it lives in the inventory's interaction specs); the free-signing rung is reframed as a pre-enrollment bootstrap in documented tension with the distribution docs' anti-pattern warning, and the field-proven `xcodebuild` + `devicectl` route is stated as the path that actually worked (the Expo CLI failed at the Xcode 26 cert store); `CHANGELOG.md` added as a harvest source and transcript-only content (signing walkthrough, preflight numbers, Maestro advice) explicitly canonicalized in this spec's text. Folded misses: the `useScreenData` screen-data lifecycle discipline (field plan-review BLOCKER B1), the FlashList root-scroller rule (M1), expo-router error boundaries (M4), the NativeWind opacity-on-base-hex gotcha (m4), write-path guard order, reduced-motion parity, and concurrent signed-URL mints.

**Verdict: PASS.** No UNRESOLVED or UNVERIFIED items remain. LOCKED certifies design completeness and dispatch-readiness only — NOT authorization to implement, ship a framework release, or publish; each of those is a separate, explicit user grant.

---

# Addendum E — Post-port delta sync (user-granted scope addition, 2026-07-13)

**Authorization:** added after LOCKED by an explicit user grant during this spec's implementation phase ("let's add the delta sync mode as a scope addition before we ship"). Not covered by the original plan-review; audited separately at add time (record in `docs/plans/mobile-port-intake/phase-plan.md`).

**Provenance (differs from the rest of this spec):** the port field run ended at device install — there has been **zero** post-port catch-up cycle. All Addendum-E prose therefore ships flagged `Installed 2026-07-13, not yet proven in a live run` (house convention for designed-not-field-proven disciplines), NOT the `Field-derived` flag. First real sync run is its calibration run.

**Problem.** `/port-mobile` is once-per-product inception. Backend changes serve both clients automatically (one shared Supabase), but web-frontend changes after the port have no standing discipline: the parity contract is dated the moment it's written, and nothing records how far the mobile app has drifted from web HEAD.

### Decisions

| Decision | Choice | Reasoning | Date |
|---|---|---|---|
| Surface | A **sync mode inside `/port-mobile`** (prose-parsed from `$ARGUMENTS`), not a new command | Sync consumes the same artifact set (parity contract, §0 map, baseline sha) and the same two-repo posture; a separate command duplicates Phase-0 mechanics. D-1's anti-mode-flag reasoning was specific to `/orchestrate` being the framework's most-loaded command; `/port-mobile` is thin | 2026-07-13 |
| Sync is inventory-only | The mode updates the parity contract and emits a delta report; it **never writes app code**. Implementation of port candidates is a normal `/orchestrate` phase in the mobile repo | Keeps the web-repo read-only invariant absolute and makes sync output a plannable artifact, not a side-channel build | 2026-07-13 |
| Baseline anchor | Phase 1's crawler stamps `Parity baseline: <web-repo HEAD sha>` in the inventory header; sync reads it, crawls the delta, and advances it | A delta needs a recorded start point; the crawl-time sha is the only honest anchor. Without the stamp, sync stops and offers a full re-crawl | 2026-07-13 |
| Delta classification | **Five** buckets: **backend-shared** (paths under `supabase/` — `supabase/migrations/*.sql` (RLS lives there), `supabase/functions/**`, `supabase/config.toml` — no mobile port work; note type-regen if schema changed) · **web-frontend, existing surface** (map through the §0 mechanism map) · **new surface** (port candidate for the PM) · **on the decided deliberate-deviations list** (skip, note) · **no parity impact** (docs, CI/tooling, web-only tests, lockfile-only bumps — noted in the delta report, no work generated) | Makes the classification total over a real `--name-status` diff; drift in app source stays classifiable as port-it / deviated-on-purpose / gap | 2026-07-13 |
| Deviations filter source | The **port spec's decided deviations block** (`docs/<app>-mobile-v1-spec.md`), not the contract's candidate list; if the port spec is missing, the filter degrades to candidate-list-only and the delta report says so | The contract only *nominates* deviations (MOB_KB_2); decisions live in the port spec — bucket 4 needs decisions. Also why a stamp-absent full re-crawl (which overwrites the contract) is safe | 2026-07-13 |
| Candidate carry-forward | Each new delta report inherits the prior report's still-open port candidates into an "Outstanding from previous syncs" table before the baseline advances | The stamp advances unconditionally; without carry-forward, never-ported candidates silently drop out of the next diff window — re-creating the drift-invisibility problem sync exists to fix | 2026-07-13 |
| Frontmatter amendment (PM-signed) | E1 deliberately amends the B1-pinned frontmatter: one clause appended to `description` (sync routing) and a note that `sync` may appear in the argument text | The description is the command's only selection surface; as shipped it actively routes catch-up requests to `/orchestrate`. B1's byte-pin certified the original text against YAML hazards; the amendment is re-verified the same way (parse check) at implement time | 2026-07-13 |

### Edit block E1 — `.claude/commands/port-mobile.md` (three touches)

(a) Inside the Phase 1 consumed-verbatim crawler prompt, after the `Write your output to <target-repo-abs-path>/docs/research/codebase-inventory.md.` line, add: `Stamp the doc header with "Parity baseline: <web-repo HEAD sha at crawl time>".`

(b) New `## Sync mode — post-port catch-up` section after Phase 7 (clean EOF append), flagged `Installed 2026-07-13, not yet proven in a live run` (flag in prose intro, not in executed step text). Contents:

- **Trigger:** if `$ARGUMENTS` contains "sync", enter this mode instead of the port pipeline.
- **Preconditions:** resolve/confirm both repo paths per Phase 0 steps 1–3, **except the target repo must already exist and contain `docs/research/codebase-inventory.md` — never create or scaffold in sync mode**. The contract must carry a `Parity baseline:` stamp — if absent (a pre-stamp port), stop and offer a full Phase-1 re-crawl, which itself produces the stamp. Locate the port spec's decided-deviations block; if the port spec is missing, the deviations filter degrades to candidate-list-only and the delta report must say so.
- **Steps:** (1) compute the delta — `git -C <web-repo> diff --name-status <baseline>..HEAD` plus log; (2) classify every changed file into the **five buckets** (decisions table) — classification must be total, nothing left unlabeled; (3) dispatch the scoped-update crawler (own consumed-verbatim fenced prompt — Phase 1's exhaustive prompt must NOT be reused: it overwrites the whole inventory. The sync prompt carries: the read-only line, the explicit changed-file list, update-only-affected-sections-in-place, advance the `Parity baseline:` stamp, and the empty-result honesty contract); (4) write `docs/research/parity-delta-<YYYY-MM-DD>.md` in the mobile repo — classified table, port-candidate list, open PM questions, and an **"Outstanding from previous syncs"** table inheriting the prior report's still-open candidates before the baseline advances; (5) hand off: implementation of candidates is a normal `/orchestrate` phase in the mobile repo — sync mode changes no app code.
- **Hard rules restated:** web repo stays read-only (byte-clean applies to the sync crawl too); inventory-only — no app-code writes in this mode.

(c) **Frontmatter amendment (PM-signed deviation from the B1 byte-pin):** append one clause to the YAML `description` (e.g. ` Run with "sync" after web-app changes post-port to re-inventory the delta — inventory only, no code changes.`) and extend the `web-app-path` argument description to note the `sync` token may accompany it. Re-verify the amended block parses (same Psych/yaml check as B1) and stays under the ~1024-char description ceiling.

### Edit block E2 — `docs/Mobile KBs/MOB_KB_2_Parity_Contract.md`

New section `## Keeping the contract current (the delta re-crawl)` after "Port vs rewrite" (clean EOF append), opening with the `Installed 2026-07-13, not yet proven in a live run` flag line. Content: the contract is dated the moment it's written and stays authoritative only if every catch-up advances it — the `Parity baseline:` header stamp is the sync anchor; the five-bucket delta classification (backend-shared paths under `supabase/` are shared automatically — no port work; "no parity impact" absorbs docs/CI/tooling/test-only churn); the standing rule extends to catch-up ("extend the contract, not ad-hoc reads of the web app"); the **decided** deviations block in the port spec is the drift filter (the contract only nominates) — **app-source** drift is always classifiable as *port it*, *deviated on purpose*, or *gap*, and an unclassifiable app-source change means the contract is missing a section.

### Edit block E3 — `CLAUDE.md` command-table row

Append to the `/port-mobile` row's description cell (before the closing `|`): `; sync mode re-inventories web-app changes post-port`.

### Edit block E4 — `docs/Mobile KBs/MOB_KB_00_Index.md` (two small touches)

(a) Extend MOB_KB_2's file-table `Covers` cell with `, delta re-crawl (post-port sync)`. (b) Add to the "When to update these files" list: `MOB_KB_2 — when a sync run changes the contract-currency method`.
