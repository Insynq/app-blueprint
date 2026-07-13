# MOB_KB_5 — Platform Gotchas & Device Verification

> Field-derived 2026-07-13 from one live web→RN port (July 2026, internal Supabase dashboard → Expo SDK 57 iPhone app); iOS-validated only.

Two halves: the runtime gotchas that bit (or nearly bit) the field run, and the verification model for an app whose truths live on a device you may not have yet.

## Hermes / runtime gotchas

Each of these is field-earned — treat them as defaults, not trivia:

- **Hermes silently ignores `Intl.NumberFormat` `notation: "compact"`** (and is inconsistent on some Intl surfaces). In the field run a compact-currency tile rendered `$74,589.0`-style garbage — no error, just wrong output. **Hand-roll compact/percent formatters and never trust Intl silently**; verify each Intl call path visually on Hermes before relying on it.
- **`expo-av` is removed (SDK 55+)** — use `expo-audio`. Its recorder is a **SharedObject with lifecycle rules**: don't hold it across screen focus changes; re-prepare after stop. Its `metering` has intermittent-report history — **validate on real hardware early** and degrade the waveform gracefully (a static/animated baseline) if metering is flaky; the recording itself is unaffected.
- **moti/New-Arch skeleton shimmer has a known issue** — keep an animated-opacity fallback ready; a plain pulsing view is a trivial substitute.
- **react-native-pdf blank-view under New Arch** — render PDFs in a WebView instead (MOB_KB_1 worked example).
- **Focus-refetch clobbers in-progress interactive state.** `useFocusEffect`-driven refetches (MOB_KB_3's screen-data lifecycle) will reshape data under a user mid-flow (a deck/wizard mid-flow). **Guard stateful screens against refetch clobber** — freeze the in-progress run against background data changes; the review step lists exactly what the user answered.
- **FlashList is the ROOT scroller only.** Header content goes in `ListHeaderComponent`; never nest FlashList inside a same-orientation ScrollView. Detail/home screens = **one ScrollView + plain `.map()`** for short sub-lists.
- **NativeWind/Tailwind-v3 opacity modifiers (`/10`) compose only on base-hex colors.** A token defined as `rgba(...)` makes the opacity class **silently no-op**. Define semantic colors as base hex so `/opacity` composes, and pre-bake needed `rgba()` fills as named alpha colors.
- **Export expo-router `ErrorBoundary` from root + tab layouts.** Queries under the never-throw contract don't throw — but derive/render code can. The boundary prevents a white screen; data failures still render as the unavailable state, never as a crash screen.
- **Respect `AccessibilityInfo.isReduceMotionEnabled` globally** — parity with the web's `prefers-reduced-motion` guard. Wire it once at the theme/motion layer, not per component.
- **`new Date()` on date-only strings** ported from the web shifts the date in any timezone west of UTC (UTC-midnight parsing) — keep the web's string-math date formatters verbatim (index Never rule).

## Device verification model

Harvest shape for the mobile repo's smoke catalog (the project `smoke-tests-pending.md` conventions apply unchanged — stable IDs, single source of truth, `Status: Pending` until a **human** verifies the observable):

Every smoke ID carries a **lane**:

- `wiring` — data-path correctness, trace-verifiable.
- `visual` — must be eyeballed on a device.
- `integration` — needs a live run against real data.
- `device` — needs physical-device capabilities: mic, haptics, gestures.

**Everything runtime is deferred-to-device at build time when no simulator exists.** `tsc` exit 0 and a clean `expo export` are build-time gates; they say nothing about gestures, metering, PDF rendering, or style translation. **Build-time green is never laundered into "verified"** — a smoke written at build time for a runtime truth ships as Pending, honestly.

## The sim-walk annotation pattern

When a simulator comes online (often mid-project — the field run got one after the build), a PM live-walk **annotates** each smoke with what the walk proved and what device residuals remain:

- **Annotations never flip `Status: Pending`.** Only the human device pass does.
- Each annotation states its lane honestly: what was **asserted absent** (a driven check — e.g. a gated element confirmed not present) vs what was merely **eyeballed**.
- Residuals stay named per smoke: haptics feel, real-mic permission prompts, install flows, other-role logins — the things a simulator constitutionally cannot prove.

The pattern's value: the catalog accumulates evidence without ever overstating it, and the final device pass is a short residual list instead of a full re-walk.

## Maestro as the simulator driver

Maestro works as the UI-automation driver for simulator walks and **caught a real bug in the field run**. Working advice:

- Expect **selector churn** — prefer `testID` / accessibility-label selectors over text-match; text changes with copy edits, IDs don't.
- When a selector misses, **read the view hierarchy** rather than guessing at variations.
- **Budget iteration time** — driving a real app is trial-and-error; treat the first flow as a spike, not a one-shot.

(Committed Maestro flows / an in-repo mobile test suite are out of this family's scope — see the index NOT-cover list.)
