# MOB_KB_4 — Distribution: EAS, TestFlight, Code Signing, Native-Build Preflight

> Field-derived 2026-07-13 from one live web→RN port (July 2026, internal Supabase dashboard → Expo SDK 57 iPhone app); iOS-validated only.
> `iOS-validated only; the Android lane (keystores, Play internal testing) is unproven — no Android field run yet.`

Distribution is where the port's *human* friction lives: everything in this file involves Apple identity, hardware, or disk space rather than code. The field run's #1 human-loop cost was code signing (~4 iterations); its recurring environmental blocker was disk space.

## The two-actor runbook template

Write every distribution runbook (in the mobile repo, e.g. `docs/DISTRIBUTION.md`) with **every step assigned to one of two actors**. This split is what makes the runbook executable without stalling — the agent never sits blocked on a step only a human can do, and the human's list is short and identity-shaped.

**USER** — anything requiring Apple identity, billing, or a password:
- Apple Developer Program enrollment ($99/yr).
- App Store Connect app record + team users (each internal tester needs an Apple ID, an accepted invite, and the TestFlight app).
- Apple-account login for credentials (`eas credentials` can auto-generate the distribution cert + provisioning profile, but the Apple login itself is the user's).
- Device trust / Developer Mode on the physical phone.

**AGENT/CLI** — everything else:
- `eas init` / `eas credentials` / `eas build` / `eas submit` / `eas update`.
- Config plugins (permission strings, fonts, webview), `eas.json` profiles.
- Setting EAS Environment Variables once values are supplied.

## Distribution ladder (cheapest-first)

1. **Simulator** — no signing at all. Where all pre-device verification happens (MOB_KB_5).
2. **Free personal-team device install** — 7-day expiry, single device, no OTA. The distribution docs correctly call this **unacceptable for *ongoing* distribution**, but the field run validated it as a **pre-enrollment bootstrap**: tonight-on-my-phone, before the $99 enrollment clears. Rebuild-over-USB takes minutes; TestFlight supersedes all three caveats once enrollment lands.
3. **TestFlight internal** — ≤100 internal testers (App Store Connect users), **no Beta App Review**, builds live ~10–15 min after processing, via EAS Build + Submit. **The steady state for internal tools.**
4. **Public App Store** — out of this family's scope.

**EAS Update (OTA)** rides alongside the ladder: JS/asset-only fixes ship in seconds with no rebuild and no re-submission. **Native changes — a new native module, a permission string, an SDK bump — always need a rebuild.** Know which kind of change you're shipping before promising a turnaround.

## Code signing — the walkthrough (the #1 human-loop cost in the field run, ~4 iterations)

The core confusion, spelled out because it burned real hours: **signing into the Mac's Apple ID is NOT signing into Xcode's Accounts tab.** The walkthrough:

1. Xcode → Settings → **Accounts** tab → add the Apple ID there (regardless of what the Mac's System Settings says).
2. Manage Certificates → “+” → **Apple Development** to mint the development certificate.
3. On the device: enable **Developer Mode**, **trust the profile**, and have the phone **plugged in and unlocked** during install.

**Install route (field-tested):** try `expo run:ios --device --configuration Release` first. When the Expo CLI can't see the new Xcode's cert store and dies at signing (the field run's actual failure on a new-major Xcode), go direct — `xcodebuild` archive/build + `devicectl device install app` / `devicectl device process launch` was the path that worked.

## Native build environment preflight

Run this preflight *before* the first native build attempt — preflight beats recovery:

- **Full Xcode** installed (not just Command Line Tools) and the license accepted.
- **CocoaPods** present.
- The target iOS **simulator runtime downloaded**: `xcodebuild -downloadPlatform iOS`.
- **≥ 10 GB free disk before the first native build.** The field run's recurring blocker was `ENOSPC` at 84–98 % disk; the recovery move is the cache-clearing sweep (DerivedData, npm/brew/CocoaPods caches), but the preflight check makes the sweep unnecessary.

## When Apple/EAS mechanics change

This file describes July 2026 mechanics (enrollment price, TestFlight caps and processing times, EAS flows). Apple and EAS both move — re-verify the numbers when relying on them, and update this file when they shift (index When-to-update rule).
