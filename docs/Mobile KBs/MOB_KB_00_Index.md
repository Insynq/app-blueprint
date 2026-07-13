# Mobile Knowledge Base — Index

**Stack:** React Native via **Expo managed + dev client** (expo-router, NativeWind, EAS Build/Submit/Update) as the vetted client path; the backend is the framework's standard Supabase stack, **unchanged**.

This folder owns the native mobile companion client for a product whose backend is the framework's standard Supabase stack. **The backend KB families apply unchanged** — RLS, outbox, queues, auth claims, storage policies are client-agnostic; a mobile client is *another RLS-scoped consumer*, not a new backend. Read `SB_KB_00_Index` for anything database-shaped; this family owns only the device side: stack selection, the parity-contract port method, Supabase on-device, distribution, and platform gotchas/verification. It is a client-family sibling to the UI-UX KBs, not a fork of them.

**The sanctioned two-client shape:** a **sibling repo sharing the one Supabase backend** — not a monorepo (`/adopt` and the installer do not support workspaces). The web app is a **read-only porting reference**; the port never modifies it, enforced as a per-wave byte-clean check (`git -C <web-repo> status --porcelain` empty / diff-clean against its HEAD). Declared in each repo's `CLAUDE.md` Tech Stack as its own client bullet naming the shared backend once.

These files are for Claude. Principles-only docs fail at implementation time. Every KB has real config, real commands, and real gotchas.

---

## File index

| File | Covers | Stack-portable? |
|---|---|---|
| `MOB_KB_1_Stack_Selection.md` | JIT stack-research method + dated July 2026 worked example | ⚠️ method portable; snapshot Expo-locked and dated |
| `MOB_KB_2_Parity_Contract.md` | Web→mobile port method: inventory sections, §0 mechanism map, port-vs-rewrite, delta re-crawl (post-port sync) | ✅ method portable to any re-platform |
| `MOB_KB_3_Supabase_On_Device.md` | Client config, claims/guards, signed-URL posture, screen-data lifecycle, writes, env | 🔒 Supabase + Expo |
| `MOB_KB_4_Distribution.md` | EAS/TestFlight, code signing, free-signing bootstrap, native-build preflight | 🔒 Apple/EAS (iOS-validated) |
| `MOB_KB_5_Gotchas_And_Verification.md` | Hermes/runtime gotchas, RN layout rules, smoke lanes, sim-walk, Maestro | ⚠️ mixed |

---

## Cross-cutting rules that apply everywhere

**Always:**
- Dev build, never Expo Go, once any native capability (mic, haptics, gestures) is in play.
- Treat `EXPO_PUBLIC_*` as public (inlined into the JS bundle) — anon key + URL only.
- Re-verify stack versions against the current Expo SDK at implementation time (MOB_KB_1 rule).
- Any NEW client-originated write path ships behind a **fail-closed env flag** (`=== "true"` gate; canonical rule: `OBS_KB_5` Primitives 0/9 — close the capability, fail loud or closed) with honest UI when disabled, and flipping it live is a scope-graduation event per the CLAUDE.md verification-disciplines rule (explicit per-instance user grant).
- Runtime truths (gestures, metering, rendering) go to the device smoke catalog as deferred-to-device — build-time green (`tsc`, `expo export`) is never laundered into "verified".

**Never:**
- Service-role key or any server secret in the app bundle (there is no server hop to hide it).
- Fetch-then-hide as a capability gate — on-device, app-code gates are not a security boundary; a gate that must *hold* must be RLS-enforced, and UI gates reproduce **gated-non-fetch** for parity/least-exposure only (cross-ref `SB_KB_1`/`AUTH_KB_2` canon: authorization at the database).
- New dependencies without New-Architecture support (legacy-only libs won't run on current SDKs).
- `new Date()` on date-only strings ported from the web's string-math formatters.

---

## Dependencies between files

```
MOB_KB_2   ← MOB_KB_3   (the parity contract's RLS-vs-app-gate analysis is what MOB_KB_3's security invariants enforce)
MOB_KB_2   ← MOB_KB_1   (the contract's deliberate-deviation candidates inform stack picks)
MOB_KB_1   ← MOB_KB_4   (MOB_KB_4's runbook consumes the stack research's distribution-runbook section)
```

Cross-folder dependencies:

```
MOB_KB_3   → SB_KB_00 / AUTH_KB_2   (backend canon consumed unchanged — RLS, claims; authorization lives at the database)
MOB_KB_2   → UI_KB_0                (the UI-UX family's token canon is the source the parity contract snapshots as literal values)
MOB_KB_00  → OBS_KB_5               (Primitives 0/9 own the fail-closed rule the write-flag discipline cites)
```

---

## When to update these files

- **MOB_KB_1** — append a new dated snapshot section on every new port's research pass (keep prior snapshots).
- **MOB_KB_5** — whenever a device smoke or sim-walk surfaces a new platform gotcha.
- **MOB_KB_4** — when Apple/EAS mechanics change (enrollment price, TestFlight caps, signing flow).
- **MOB_KB_2** — when a sync run changes the contract-currency method.

Do not update MOB_KBs to reflect project-specific decisions. These are stack patterns, not project docs.

---

## What these files do NOT cover

Mirrors the intake spec's Parked table; each item has a promotion trigger there.

- **Android** — unproven, no field run; every iOS-validated claim that might differ is flagged. (Promotes on the first Android field run.)
- **Mobile billing / IAP** (StoreKit, Play Billing) — genuinely divergent domain. (Promotes on the first adopter mobile app with payments.)
- **Push notifications, offline/caching, realtime-on-device** — out of the field run's scope. (Promote on field usage.)
- **Bare React Native without Expo** — the family documents one vetted path.
- **Mobile test scaffolding** (Maestro flows in-repo, RN Testing Library) — the field run used Maestro interactively only. (Promotes when a ported repo commits a test suite.)
- **Monorepo web+mobile** — the sanctioned shape is a sibling repo; `/adopt` monorepo support is separately parked.

---

> Field-derived 2026-07-13 from one live web→RN port (July 2026, internal Supabase dashboard → Expo SDK 57 iPhone app); iOS-validated only.

## VERIFY BEFORE SHIPPING

The port-specific checks to run before a ported mobile app ships:

- **Byte-clean source repo** — the web app is unmodified: `git -C <web-repo> status --porcelain` empty / diff-clean against its HEAD.
- **Write-flag fail-closed** — every new client write path gates on `=== "true"`, validates before the gate, and shows honest UI when disabled (MOB_KB_3 guard order).
- **No secret in bundle** — `grep` the project for service-role/secret patterns; only the two public `EXPO_PUBLIC_SUPABASE_*` values belong in the app.
- **Gated-non-fetch code trace on every capability gate** — confirm the sensitive fetch is skipped, not hidden (MOB_KB_2 §3 / MOB_KB_3).
- **Device smoke catalog exists with stable IDs** — lanes assigned, runtime truths Pending until a human device pass (MOB_KB_5).
