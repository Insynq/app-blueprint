# MOB_KB_3 — Supabase On-Device: Client, Claims, Storage Posture, Writes, Screen Data

> Field-derived 2026-07-13 from one live web→RN port (July 2026, internal Supabase dashboard → Expo SDK 57 iPhone app); iOS-validated only.

The backend is unchanged — same project, same RLS, same views. What this file owns is the *client side of the wire* on a device: how the one Supabase client is configured, how identity and gates work without a server, the storage posture step-down, the write-path discipline, and the screen-data lifecycle that replaces server-side per-navigation rendering.

## Client config

One `supabase-js` client for the whole app:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  }
);

// Documented pattern: refresh only while foregrounded
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
```

**Why AsyncStorage, not SecureStore:** SecureStore throws above **2 KB**, and a Supabase JWT with custom claims can exceed it. The documented hardening option — AES-encrypt the session, keep the small AES key in SecureStore, store the ciphertext in AsyncStorage — exists for when the threat model demands it (untrusted users, regulated data). **Session-at-rest-unencrypted is an accepted, documented trade-off for internal/trusted-user apps — record it as a decision in the port spec, not a default nobody chose.**

## Claims & guards

- `getClaims()` validates the JWT **locally via JWKS** when the project uses asymmetric signing keys `[VERIFY per env — symmetric keys make it a network call]`. Local validation means role-gating UI costs no round-trip per navigation.
- Identity lives in app context: one claims fetch + one profile-role read **per session change**, not per screen (the mobile replacement for the web's per-request identity helper — MOB_KB_2 §0 mechanism map).
- Route/role gating: `Stack.Protected` guards in the router layout, driven by a **reactive `onAuthStateChange` subscription** — a signed-out event clears identity and the guard drops to login.
- **A query returning null is a data failure, never inferred as logged-out.** Auth state changes come from the auth listener only; never demote a user to the login screen because a fetch failed.

## Storage reads — the posture step-down (load-bearing)

There is no server proxy on mobile. The standard pattern is on-device `createSignedUrl(path, <short TTL>)` under the user's RLS-scoped session — **the RLS-checked signing call *is* the access control** (a role denied by the storage policies is denied at signing time).

The residual risk vs a web proxy: a signed URL is a time-boxed *bearer* link, and on mobile it exists in the app runtime for its TTL (a web proxy could keep it server-side). Mitigations, all of which the field run shipped:

- **Short TTL:** 60–120 s — long enough to render, too short to reshare meaningfully. Use **120 s if slow-cellular renders fail at 60** (the field run's plan review escalated to 120 s for exactly this); have the viewer re-mint once on load error/expiry.
- **Render only inside an in-app WebView / `expo-image`** — never a share sheet or the system browser for sensitive documents (system chrome shows the URL; in-app viewers don't).
- **Never persist or log the URL.** No copy-link affordance on sensitive docs.

**Document the step-down explicitly in the port spec** — it is an accepted trade-off, not an oversight, and the security review that finds it undocumented is right to flag it.

## Writes

**Binary upload path.** RN's `Blob` is unreliable for binary. The working path:

```
expo-file-system (read file as base64)
  → base64-arraybuffer decode() → ArrayBuffer
  → storage.upload(path, arrayBuffer, { contentType: "<explicit mime>" })
```

Two asserts before every upload: **`byteLength > 0`** (the well-known 0-byte footgun: an un-awaited file read uploads an empty object with no error) and a **max-size guard** matching whatever ceiling the web enforced.

**Inserts** are plain `.insert()` under the user session — RLS-scoped, and INSERT-only where the web was INSERT-only. Preserve the web's ordering contract (e.g. upload-before-insert so a row never references an object that failed to land).

**New client-originated write paths ship behind the fail-closed env flag** (index Always rule; canonical rule `OBS_KB_5` Primitives 0/9), with **guard order fixed**:

1. Identity + input validation run **before** the flag gate.
2. The flag gate precedes **all** IO.
3. The disabled stub path returns the **same validation errors as live**.

That ordering means flipping the flag never unlocks a never-validated path — the stub exercised the guards the whole time.

## Screen-data lifecycle (field BLOCKER-class finding)

The web re-renders per navigation on the server; **mobile tab screens stay mounted**. Without a discipline, every screen grows its own ad-hoc `useEffect` fetch with its own staleness bugs. Ship **one shared hook in the foundation wave**:

```ts
useScreenData<T>(fetcher: (supabase) => Promise<T>, deps?): {
  data: T | null;
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
  refreshing: boolean;
}
```

- Fetch on mount; refetch on `useFocusEffect`; `refresh()` wired to pull-to-refresh on **every screen's root scroller**.
- **No ad-hoc useEffect fetches anywhere.**
- Screens map: `loading` → skeleton · `null` → unavailable ("Couldn't load…") · `[]` → empty ("Nothing here.") — the parity contract's error contract, rendered honestly (MOB_KB_2 §2).
- Batch signed-URL mints **`Promise.all`-concurrent** — serial mints stack latency on document-heavy screens.
- Guard stateful interactive screens against focus-refetch clobbering in-progress state (MOB_KB_5).

## Env posture

- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` are **public-by-design** (same posture as the web's `NEXT_PUBLIC_*`): they are inlined into the JS bundle, and RLS is the boundary.
- EAS Environment Variables per profile (development/preview/production) supply them to cloud builds; `.env` for local Metro.
- **Never a service-role key or any server secret** — there is no server, so there is nowhere to hide one; anything in the bundle is extractable.
