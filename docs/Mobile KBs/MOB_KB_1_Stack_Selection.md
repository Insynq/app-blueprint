# MOB_KB_1 — Stack Selection: Just-in-Time Research Method + Dated Worked Example

> Field-derived 2026-07-13 from one live web→RN port (July 2026, internal Supabase dashboard → Expo SDK 57 iPhone app); iOS-validated only.

The React Native ecosystem moves quarterly — a new Expo SDK landed *inside the field run's own research window*. A frozen stack recommendation in a KB would rot silently. This file therefore carries two things with different lifetimes:

1. **Part 1 — the method (canon).** How to research a mobile stack, per port. This ages slowly.
2. **Part 2 — a dated worked example (July 2026).** The snapshot the field run produced and validated end-to-end on iOS. This ages honestly, because it is dated. **Never copy it into an implementation without re-verifying every version.**

---

## Part 1 — The method (canon)

Stack research for a mobile port is done **just-in-time, per port**, by a dedicated research agent — never lifted from memory or from a prior port's snapshot. Every version and behavior claim is checked via web search/fetch *in the month of the port* and cited inline ("checked via web search this month, not from memory").

### The output template

The research agent's deliverable (typically `docs/research/rn-stack-research.md` in the new mobile repo) has four required elements:

1. **Summary table** — `Concern | Library | Version (as of <month year>) | Why`. One row per concern (framework, routing, data/auth, styling, lists, gestures, audio, viewers, upload path, build/distribution). The `Why` is one line, tied to the source app's actual needs.
2. **Per-topic findings** — a section per concern with **inline-cited sources for every version/behavior claim**. A claim with no citation is a memory claim and does not belong in the doc.
3. **Distribution runbook section** — who does what (see MOB_KB_4's two-actor split); this is the section MOB_KB_4's runbook consumes.
4. **Risks & open questions** — explicit risks with mitigations, plus the open decisions the PM must make (with a recommended default each). Research that surfaces no risks has not looked hard enough.

### The re-verify rule

*The research doc is dated, and every consumer re-verifies SDK/bundled-lib versions at implementation time.* This rule is load-bearing: the SDK's bundled library versions (gesture, animation, worklets peer deps) shift with each SDK release, and "latest stable" changes roughly quarterly. Consumers of Part 2 below are consumers in exactly this sense.

On every new port's research pass, **append a new dated snapshot section to this file** (keep prior snapshots — the sequence of snapshots is itself evidence of what rots and how fast).

---

## Part 2 — Dated worked example (July 2026, iOS-validated)

The snapshot below was produced by the method above for a July 2026 web→RN port of an internal Supabase dashboard, and validated end-to-end to a physical iPhone. It teaches the *shape* of good findings; the versions are historical facts, not current advice.

| Concern | Library | Version (Jul 2026) | Why (one line) |
|---|---|---|---|
| Framework | Expo (managed) + dev client | SDK 57 | New Architecture mandatory since SDK 55; mic + haptics + gestures need a **dev build**, not Expo Go (Expo Go is non-viable once any native capability is in play) |
| Runtime | React Native / React | 0.86 / 19.2 | Bundled by the SDK; React version matched the source web app |
| Routing | expo-router | v7 (SDK-bundled) | File-based, **typed routes**; `Stack.Protected` boolean guards for auth/role gating |
| Data/auth | `@supabase/supabase-js` | latest 2.x | Same client as web; RLS is the access boundary (see MOB_KB_3) |
| Session storage | `@react-native-async-storage/async-storage` | latest | Supabase RN default; SecureStore throws above 2 KB and JWTs with claims exceed it (MOB_KB_3) |
| Styling | NativeWind | v4.2.x stable | Ports a Tailwind class vocabulary; **see the version-alignment caveat below** |
| Fonts | `@expo-google-fonts/*` + `expo-font` | latest | Bundled font assets for exact typographic parity with the web app |
| Lists | `@shopify/flash-list` | v2.x | New-Arch-**only**, JS-only, no size estimates; built for long tables |
| Charts | `react-native-svg` (hand-rolled) | latest | Direct port when the web hand-rolled its SVG charts; lightest possible, no chart-engine dependency |
| Gestures/animation | `react-native-gesture-handler` + `react-native-reanimated` (+ `react-native-worklets`) | ~2.32 / ~4.5 / ~0.10 | Bespoke swipe surfaces on the UI thread; Reanimated 4 split its worklet runtime into a **required peer dep** |
| Audio | `expo-audio` | SDK 57 | **`expo-av` was removed in SDK 55** — do not port code that imports it; recording metering drives a live waveform |
| Haptics | `expo-haptics` | SDK 57 | Native taptics on gesture commit/undo |
| PDF viewer | `react-native-webview` | latest | iOS WebView renders PDFs natively — **dodges react-native-pdf's New-Architecture blank-view bug** |
| Image viewer | `expo-image` | latest | Caching + transitions; the modern successor to core `Image` |
| Binary upload | `expo-file-system` + `base64-arraybuffer` | latest | RN has no reliable `Blob`; read file as base64 → decode → `ArrayBuffer` upload (MOB_KB_3) |
| Build/distribution | EAS Build + Submit + Update | current | Dev builds, TestFlight internal, OTA JS fixes (MOB_KB_4) |

### Worked risk example — the styling-library major-version bet

The July 2026 research found NativeWind **v4 stable targets Tailwind CSS v3**, while the source web app's tokens were authored in Tailwind v4; the Tailwind-v4-aligned NativeWind v5 was still pre-release ("not intended for production"). The recorded decision: build on v4 stable and **re-encode the design tokens as a Tailwind-v3 `theme.extend` config** — a one-time token-translation task, not a blocker — rather than bet the build on a pre-release. This is the shape a good risk finding takes: the version tension named, the mitigation concrete, the default decided, the alternative acknowledged as a calculated bet.

### Other findings worth keeping (each bit or nearly bit the field run)

- **Dev build, not Expo Go**, from day one: mic, haptics, gesture-handler and reanimated all require a development build, and any config plugin ends the Expo Go story anyway.
- **Every dependency must be New-Architecture-ready.** The Legacy Architecture is gone from current SDKs; a legacy-only library simply won't run. Vet every *future* dependency for New-Arch support before adopting it.
- **Maintained-fork risk on gesture/swipe libraries:** standalone swipe-deck libraries tend to lag New-Arch/Reanimated majors. For bespoke gesture surfaces, hand-roll on gesture-handler + reanimated — same decision the web app made with pointer events.
- **`react-native-pdf` under New Arch had open blank-view-on-iOS bugs** as of July 2026 — the WebView route avoided the bug *and* a config-plugin dependency.
- **Distribution economics belong in stack research** (enrollment fee, build-queue quotas, TestFlight caps and processing times) — they set the PM's expectations before the first build, not after. `unproven — no Android field run yet` applies to everything Apple-shaped here.

> **Re-verify rule applies.** Every row above is a July 2026 fact. Check the current Expo SDK's bundled versions and each library's release page before locking a stack on a new port.
