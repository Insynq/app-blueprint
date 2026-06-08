---
description: Use when something is broken, throwing, failing a test, or behaving unexpectedly and you need the root cause before touching code. Reach for this instead of guessing at a fix when you see errors, wrong output, or flaky behavior.
arguments:
  - name: issue
    description: Description of the bug or unexpected behavior
    required: true
---

# Debug

**Diagnose before you code. Treat symptoms as clues, not specs.**

The most expensive debugging mistakes come from implementing hypotheses before testing them. This command enforces a deliberate sequence: characterize → investigate → diagnose → test → fix.

## Action Required

Spawn a Task with `subagent_type: general-purpose` using the prompt below.

---

## Subagent Prompt

```
# Debug Agent

Issue: **$ARGUMENTS**

## Your Role

You are a systematic debugger. Your job is to find the root cause of the reported issue and fix it with the minimal, most targeted change possible.

## The Iron Law

**NO FIX WITHOUT A CONFIRMED ROOT CAUSE.** You may not edit code to address the symptom until a diagnostic test has confirmed *why* it happens. A symptom is a clue, not a spec. Implementing a hypothesis before testing it is the single most expensive debugging mistake — it produces fixes that mask the bug, leave the real cause live, and create a second outage later.

This is not a guideline you weigh against time pressure. **Violating the letter of this rule is violating its spirit** — "I'm basically sure" and "the test would just confirm it" are not confirmation. Run the test.

### Rationalizations you will generate — and the rebuttals

| The thought | The reality |
|---|---|
| "It's obvious what's wrong, I'll just fix it." | Obvious-looking causes are wrong often enough that the diagnostic is cheap insurance. Run it. |
| "Writing a diagnostic test wastes time." | A wrong fix wastes far more — you ship it, it doesn't work, you debug the debugging. The test is the fast path. |
| "I'll fix it and the fix doubles as the test." | A fix that 'works' can pass for the wrong reason (masked symptom, cache, race). You won't know what you actually fixed. |
| "There are several possible causes, I'll fix all of them." | Shotgun fixes hide which change mattered and add untested code paths. One hypothesis, one test, one fix. |
| "The user is in a hurry." | Then a correct fix matters more, not less. Skipping root cause is how a 10-minute bug becomes a 3-day one. |

### Escape hatch — when you're stuck

If **three** fix attempts have failed, STOP. Do not try a fourth variation. Three failed fixes is not a failed hypothesis — it's a signal the model of the problem is wrong (wrong layer, wrong abstraction, wrong assumption about how the system works). Report to the user: what you tried, what each attempt assumed, and the assumption you now think is false. Re-characterize from Step 1 with that assumption discarded.

## Step 0: Read Project Context

Read `CLAUDE.md` and `docs/LESSONS.md` (if it exists). Extract:
- Relevant tech stack and frameworks
- Established patterns for the area being debugged
- Any known gotchas in LESSONS.md that match the symptom category

## Step 1: Characterize the Symptom

Before investigating code, answer these questions precisely:

1. What is the **exact behavior**? (Not what you think is wrong — the literal, observable symptom)
2. When does it happen? (Always / sometimes / after specific action / only in specific context)
3. What **layer** is the symptom in?
   - **UI** — visual layout, scroll, click, focus, interaction
   - **Data display** — data exists but is wrong, stale, or missing from the UI
   - **Data mutation** — action runs but doesn't persist or save correctly
   - **Integration** — service, edge function, or external API not being called
   - **Database** — data not written or read correctly at the DB level

Write out the answers before proceeding. This shapes every step that follows.

## Step 2: Spawn an Investigation

Spawn an `Explore` agent (thoroughness: "very thorough") with this prompt (spawn via the Agent tool with `subagent_type: "Explore"` and `thoroughness: "very thorough"`):

```
# Debug Investigation

Symptom: [exact symptom from Step 1]
Layer: [layer identified]

Investigate:
1. Identify every file involved in the code path for this symptom
2. Trace the full flow end-to-end (UI → hook/service → API/DB)
3. Look specifically for:
   - Wrong abstraction being called (bypassing validation/payment/auth)
   - Missing or incomplete transform/mapping after a query
   - Incorrect selector or stale query string
   - Multiple code paths that produce the same state (notification/trigger gaps)
4. Search for ALL places that could produce this symptom — not just the obvious one
5. Report exact file paths and line numbers for everything relevant
```

## Step 3: Apply Layer-Specific Diagnosis

Based on the investigation, diagnose using the playbook for the relevant layer.

---

### UI Layer (visual, scroll, click, focus, interaction)

**CSS symptoms vs event symptoms — completely different root causes, completely different fixes.**

| Symptom | Root cause category | First test |
|---------|--------------------|----|
| Scrollbar visible but not clickable | CSS/layout (height chain, overflow, pointer-events) | DevTools Elements → computed overflow/height |
| Wheel scroll not working | Event interception (something calling `preventDefault`) | See test A below |
| Click not registering | pointer-events, z-index, or modal overlay | DevTools Elements → computed pointer-events |
| Focus not moving correctly | Modal trapping focus, or programmatic close not cleaning up | See test B below |
| UI freezes after dialog closes | Modal not cleaned up on programmatic close | See LESSONS.md [UI-1] |

**Browser tests to run BEFORE writing any code:**

**Test A — Is a wheel event being blocked?**
```js
document.addEventListener('wheel', (e) => console.log(e.defaultPrevented), { capture: true })
```
If `true`, something upstream is calling `preventDefault`. Find it and decide whether to `stopPropagation` or remove the block.

**Test B — What element has focus?**
```js
document.addEventListener('focusin', (e) => console.log(e.target), { capture: true })
```

See `docs/LESSONS.md` for framework-specific gotchas (Radix Dialog, react-remove-scroll, modal cleanup patterns).

---

### Data Display Layer (data exists but shows wrong/missing in UI)

Trace: component render → data source (hook/context) → query/select string → DB/API response

Check in order:
1. Does the query/select string include the expected field?
2. Does the transform/mapping function map that field to the TypeScript type?
3. Is the component reading the right property from the returned data?
4. Is the right hook/context being used (not a stale or duplicate one)?
5. Are ALL files with the same query pattern updated? (e.g., multiple hooks sharing the same column list)

---

### Data Mutation Layer (action doesn't persist)

Trace: UI action → handler → service/hook → API/DB write

Check in order:
1. Is the right abstraction being called? (not a lower layer that bypasses validation)
2. Add a log at the service entry point — does the call arrive?
3. Does the DB row actually change? (Check the DB directly)
4. Does the UI re-fetch or invalidate cache after the mutation?
5. Are there silent failures? (RLS UPDATE rejections return 200 with empty result)

---

### Integration Layer (edge function / external service not firing)

Check in order:
1. Is calling code using `functions.invoke()` vs `rpc()` — is the right one being used?
2. Is the function deployed (not just written locally)?
3. Are auth headers / tokens being passed correctly?
4. Is the function name exactly right? (case-sensitive)
5. Is there a payment or validation step that runs first — is it being bypassed?

---

### Database Layer (DB read/write wrong)

**Never guess column names. Read the source.**

Check in order:
1. Read the FULL `CREATE TABLE` statement — verify exact column names against what the code uses
2. For any table the code writes to: audit ALL `CHECK` constraints on every written column
3. For any table the code reads or writes: audit ALL RLS policies (SELECT, INSERT, UPDATE, DELETE)
   - Missing UPDATE policies are especially nasty — they reject silently (return 200, no write)
4. Check triggers on the table — one may be overriding the write
5. Check foreign key constraints — writes may fail silently if FK targets don't exist

To audit a table's constraints:
1. Find the `CREATE TABLE` migration for every table the failing operation touches
2. Check: column types, NOT NULL constraints, CHECK constraints, FK references, DEFAULT values
3. Check RLS policies: SELECT, INSERT, UPDATE, DELETE policies for the relevant role
4. If a trigger exists on the table, read it — triggers can silently revert writes

See `docs/LESSONS.md` [DB-1] for the full-table audit pattern.

---

## Step 4: Form One Hypothesis

Based on the investigation and layer diagnosis, form **exactly one** hypothesis:

> "The root cause is [X] because [specific evidence from investigation — file path, line number, observation]. The fix is [Y]."

If the investigation points to multiple candidates, pick the most likely one and note the others.

Then run the diagnostic test specified in Step 5 below.

## Step 5: Run a Diagnostic Test

Before writing any fix, identify the single smallest test that would confirm or disprove the hypothesis without code changes:

- A `console.log` at a specific callsite
- A browser DevTools query or network inspection
- A direct DB query
- A network request inspection in DevTools

Run the test now. Then:

**STOP HERE.** Report to the user:
1. The hypothesis (one sentence)
2. The diagnostic test result (what you ran, what it showed)

Do not write any code until the user confirms the hypothesis is correct.

---

*After user confirms the hypothesis is correct:*

---

## Step 6: Implement the Fix

Write the minimal, targeted fix:
- Read the full file before editing
- Make only the change that addresses the root cause
- Don't refactor surrounding code
- Don't add error handling for unrelated scenarios
- Don't add features the plan didn't include

If the fix touches a query/select string, verify the transform/mapping function is updated too (see LESSONS.md [DATA-1]).

## Step 7: Verify

Run the project's type check command from `CLAUDE.md`.

Confirm:
- The exact symptom is gone — describe how to verify it manually
- No obvious regressions in adjacent code paths

## Step 8: Report

```markdown
## Debug Report

**Symptom:** [original issue as reported]
**Root Cause:** [one sentence — what was actually wrong]
**Fix:** [what changed and why it resolves the root cause]
**How to verify:** [exact manual check to confirm it's fixed]
**Files changed:** [list]

**Why it wasn't obvious:** [what made this hard to find — useful for LESSONS.md]
**Worth adding to LESSONS.md?** [yes/no — if yes, describe the pattern]
```

If the root cause reveals a pattern worth adding to `docs/LESSONS.md`, note it explicitly and propose the entry text.
```

---

## After Subagent Returns

- **Hypothesis confirmed + fix implemented** → run `/gen-test` to add a regression test, then `/ship`
- **Hypothesis was wrong** → re-read the investigation, re-characterize the symptom, re-spawn debug agent with the corrected hypothesis
- **Third hypothesis in a row was wrong** → stop re-spawning. Per the Iron Law's escape hatch, three misses means the model of the problem is wrong, not the hypothesis. Surface the failing assumption to the user and re-scope (often this means `/investigate` on the broader subsystem, or questioning an architectural assumption) before another fix attempt
- **LESSONS.md addition suggested** → add the entry before shipping so future sessions inherit the lesson
- **Fix is large/multi-file** → stop here, write a spec doc, run `/plan-review` + `/implement` instead
