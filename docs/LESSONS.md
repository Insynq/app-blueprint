# Lessons Log

A running log of gotchas, hard-won lessons, and non-obvious behaviors discovered during development. Add entries here as they accumulate — this becomes more valuable the longer a project runs.

**Format:** Each entry has a short ID for cross-referencing (e.g., `[UI-1]`), the rule itself, a **Why** (the real incident), and a **How to apply** line (when to use it).

Commands that reference this file: `/debug`, `/implement`, `/audit-code`.

---

## UI & Component Patterns

### [UI-1] Radix Dialog: Use `modal={false}` for programmatically-controlled dialogs

**Rule:** Dialog/AlertDialog components controlled via state (`open` prop + programmatic close) should use `modal={false}`. Also add `onInteractOutside={(e) => e.preventDefault()}` and `onCloseAutoFocus={(e) => e.preventDefault()}`.

**Why:** Radix Dialog's default (`modal={true}`) sets `pointer-events: none` on `<body>` when it opens. When the dialog is closed programmatically via state update (not via the close button), Radix doesn't always clean this up — leaving the entire UI frozen and unclickable. This is one of the most confusing bugs because the UI looks normal but nothing responds to input.

**How to apply:** Any time you write or generate a Dialog that is opened/closed by setting a state variable (not by a Radix `DialogTrigger`), add `modal={false}` as a prop. Apply the `onInteractOutside` and `onCloseAutoFocus` handlers to prevent the two most common follow-on issues (closing on outside click, focus trap artifacts).

---

### [UI-2] Scroll/wheel bugs: diagnose in the browser before writing code

**Rule:** When a scroll, wheel, or pointer event isn't working, run one browser DevTools test before touching any code. Determine whether the cause is CSS/layout or event interception — they have completely different solutions.

**CSS symptoms:** Scrollbar visible but unclickable, container won't scroll at all → check height chain, overflow, pointer-events in computed styles.

**Event interception symptoms:** Scrollbar works but wheel/trackpad doesn't → something is calling `e.preventDefault()` upstream. Test with:
```js
document.addEventListener('wheel', (e) => console.log(e.defaultPrevented), { capture: true })
```
If `true`, a library (commonly `react-remove-scroll`, used inside Radix Dialog/Sheet/Popover) is blocking the event. The fix is usually `onWheel={(e) => e.stopPropagation()}` on the scrollable container — a two-word change.

**Why:** A scroll bug in a service detail panel took ~15 debug attempts across multiple sessions. Every attempt was a hypothesis implemented as code — adding ScrollArea components, switching modal modes, adjusting height chains, bypassing wrappers. The actual fix was `onWheel={(e) => e.stopPropagation()}`. The DevTools test above would have identified `react-remove-scroll` as the culprit in under a minute.

**How to apply:** Treat UI interaction bugs as two distinct categories before writing any code: CSS/layout or event interception. Run the `e.defaultPrevented` test for any scroll/wheel issue. Don't reach for a new component or architectural change until a console test confirms the root cause.

---

### [UI-3] Optimistic updates need explicit rollback on failure

**Rule:** When you update UI state before an async operation confirms, you must handle the failure path — restore previous state or show an error. Don't assume success.

**WHY:** Optimistic updates make UIs feel fast, but half-implementations leave users with stale data after a failed save. The success path is obvious; the failure rollback is skipped.

**HOW TO APPLY:** For every optimistic state update (`setItems([...items, newItem])`), the catch block must restore the prior state (`setItems(items)`). If using a query library (React Query, SWR), call `invalidateQueries` or `mutate()` on error to refetch ground truth.

---

## Data & Query Patterns

### [DATA-1] Adding a column to a query: update the transform too

**Rule:** When adding fields to a hook's query/select string, find the transform/mapping function that converts raw DB rows to TypeScript objects and update it to map the new fields. Also check if other files use the same column list and need the same update.

**Why:** `pricing_type` was added to one hook's select string but the transform function wasn't updated, and a second hook with the same column list was missed entirely. Eight quote-related columns were fetched but never surfaced to the UI. Found in a post-batch audit, not during implementation.

**How to apply:** When you add a field to a `.select()` string (or equivalent), immediately ask: "Where does this raw data get converted to a TypeScript object?" Update that mapping function in the same edit. Then grep for other files that select the same table with similar column patterns — they may need the same addition.

---

## Integration Patterns

### [INT-1] Event-driven side effects: wire to ALL trigger paths, not just the obvious one

**Rule:** When a notification, email, webhook, or any side effect is triggered by a status change, grep for every callsite that writes that status value — both client-side mutations and server-side RPC/function calls. Wire the side effect at every callsite, or extract a shared helper.

**Why:** An `order_completed` email was wired to `resolveOrder()` (manual ops action) but missed `reviewDeliverable()` (auto-complete path when all services are approved). Agents completing orders via service review would never have received the confirmation email. Found during brainstorm, not during initial implementation.

**How to apply:** When a plan says "send email/webhook when status = X", treat it as a two-part task: (1) implement the side effect, (2) search for every place that writes that status and wire the side effect there. Common pairs to watch: manual admin action + automated completion trigger, RPC call + direct client state update.

---

### [INT-2] Edge function calls: use `functions.invoke()`, not `rpc()`

**Rule:** When a hook function should trigger an edge function (especially one that handles payments, rate limiting, or validation before DB writes), use `supabase.functions.invoke()`. Never implement as a direct RPC call when an edge function should run first.

**Why:** `acceptOpportunity()` was implemented calling the RPC directly, completely bypassing the $25 charge edge function. The edge function was built and deployed but never connected. The bug only appeared when someone actually tried to accept an opportunity.

**How to apply:** When writing a service/hook that involves payment, auth, or external side effects, trace the full call chain in the plan before implementing. If an edge function is supposed to run, the calling code must use `functions.invoke()`. Verify this during implementation, not after.

---

### [INT-3] Stripe PaymentIntent: always include an idempotency key

**Rule:** Every Stripe `PaymentIntent.create()` call must include an idempotency key. If the function both charges money AND updates state, do both inside the same function — never split charge (server) from state update (client).

**Why:** An initial edge function had no idempotency key (double-charge risk on network retry) and delegated the state update to the client after the charge succeeded. This created a window where the payment could succeed but the state update could fail, leaving the order in an inconsistent state with no recovery path.

**How to apply:** Treat "charge + state update" as an atomic unit. Any time you write a payment edge function, the idempotency key and the state update are non-negotiable — not optional polish.

---

## Database & Schema Patterns

### [DB-1] Extending an existing table: audit the WHOLE table, not just what the spec mentions

**Rule:** When a new use case writes to an existing table, read the FULL `CREATE TABLE` statement and ALL existing policies (SELECT, INSERT, UPDATE, DELETE). Don't stop at the constraint the spec mentions — audit every column the new write pattern touches.

**Why:** A profile asset upload feature audited the `category` CHECK constraint but missed a `type` CHECK constraint on the same table. This caused an immediate 400 on the smoke test. After fixing that, a latent bug appeared: the table had no UPDATE policy, so the "replace existing record" flow would have silently failed (RLS UPDATE rejections return HTTP 200 with an empty result — no error, no data). Both bugs were visible in the migration file we read — the audit just didn't read it exhaustively. Required a hot-fix migration during smoke testing.

**How to apply:** When a spec says "extend table X for new use case Y", treat it as a forcing function to read the entire `CREATE TABLE` + all policies, even if the spec only mentions one constraint. Make a checklist: every CHECK constraint, every RLS policy (all four operations), every unique constraint, every FK. Run through all of them against the new write pattern.

---

## Architecture & Design Patterns

### [ARCH-1] Don't create an abstraction for a single use case

**Rule:** Don't extract a shared utility, base class, or abstraction until it's needed by at least two distinct use cases. Premature abstraction creates indirection without reuse benefit.

**WHY:** Projects consistently over-engineer early. A utility used once is just complexity. Wait until the second callsite to extract — the shape becomes clearer and the abstraction fits both cases instead of one.

**HOW TO APPLY:** When writing a helper, ask: "Is there a second caller for this right now?" If no, keep it inline. The refactor to extract is cheap; the refactor to un-abstract is not.

---

## Process & Verification Patterns

### [PROCESS-1] Earned vs. assumed scope-out

**Rule:** When labeling something "out of scope," "verifiable later," "existing behavior preserved," "separate concern," or "trust the system," classify it as **earned** or **assumed**. Earned scope-out = "I confirmed X works; we can build on it." Assumed scope-out = "I couldn't confirm X; let's build anyway." Only earned scope-out is engineering. Assumed scope-out is hope wearing engineering's clothes.

**Why:** During a remediation, a "$25 fee fires" verification kept resisting clean answers. Each rephrasing — "$25 fee fires?" → "fee fires somewhere?" → "existing behavior preserved?" → "trust the system?" — made the question easier to dismiss but didn't get closer to knowing. Had we plowed ahead, we'd have shipped activation hooks attached to a payment flow that wasn't actually firing — then spent days debugging the new code when the bug was upstream of everything we wrote. The pause cost was hours; the retrofit cost would have been days plus a confidence hit on the whole architecture.

**How to apply:**

1. **When a verification keeps resisting, expand the question, don't shrink it.** The natural impulse is to shrink the question until it's tractable ("does the fee fire?" → "is the system broadly working?"). The correct move is the opposite — expand the investigation until the question can actually be answered. Rephrasing toward dismissibility is the warning sign.
2. **Treat "I couldn't find X" as a fact about your search, not about reality.** When grep doesn't show something, the question is "what kind of thing does grep miss?" — not "this thing must not exist." The same applies to read-only investigation across files, services, and external systems.
3. **Domain-owner intent is verification-grade data.** When the user says "this was working before," that's a load-bearing claim that should flip the posture from "probably fine" to "probably broken until I prove otherwise." Treat it as one of the few signals that beats grep evidence.
4. **Pause cost < retrofit cost, almost always.** The only exception is genuine deadline pressure — and even then, the retrofit usually costs more than the deadline saves.

Trigger phrases that should make you stop and verify: *"out of scope," "existing behavior preserved," "verifiable later," "separate concern," "trust the system," "probably fine."*

---

## How to Add a New Entry

Copy this template and append to the relevant section:

```markdown
### [CATEGORY-N] Short title

**Rule:** The specific, actionable rule.

**Why:** The real incident that caused this lesson. Be specific — which bug, what failed, what the actual root cause was.

**How to apply:** When exactly does this apply? What's the trigger that should remind you of this lesson?
```

Categories: `UI`, `DATA`, `INT`, `DB`, `ARCH` (architecture/design patterns), `PROCESS` (planning, verification, scoping discipline)
