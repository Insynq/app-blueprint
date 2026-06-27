# OBS_KB_5 — Defensive Writes (fail-loud-or-closed + close-the-capability)

> **Reference KB — not an audit acceptance gate.** This documents two safety primitives for write/side-effect paths. It is deliberately *not* wired as a `/audit-*` pass/fail criterion: in the transcripts that informed app-blueprint's verification layer, silent-open failures did not surface — app failures tended to surface *loudly* (the user sees "could not save" / a 400). Silent-open is primarily a **runtime / cron / background-worker** phenomenon. Re-evaluate gating this when a real silent-open incident surfaces in an app-blueprint project. `Installed, not yet proven in a live run.`

**Stack-portable?** ✅ Mostly — the principles are universal; the examples are Next.js + Supabase (Server Actions, Edge Functions, outbox, pg migrations).

This KB owns the **error surface of a write**: what must happen the moment a write or side-effect *fails*. It is the authoring-side complement of the verification rule "a shipped write is unproven until its trigger fires and you inspect the persisted artifact" — here we make sure that when the write fails, *someone finds out*.

> **Scope boundary — read this before adding anything here.**
> - **OBS_KB_5 (this file)** owns the **error surface**: when a write fails, do you fail loud, fail closed, or (the bug) fail silent-open?
> - **JOB_KB_1 (Outbox Worker)** owns the **work-claiming surface**: how not to *lose* work — `FOR UPDATE SKIP LOCKED`, lease/`available_at`, exponential backoff, dead-letter.
> - They reference each other and compose (a worker that fails loud per this KB still needs JOB_KB_1's dead-letter to not lose the row), but they are **not duplicate homes**. Retry/backoff/DLQ mechanics live in JOB_KB_1; "don't swallow the error" lives here.

---

## Primitive 0 — Close the capability (don't expose the operation)

The strongest defense against a destructive operation is to **not put it on the callable surface at all**. You cannot mis-fire, be tricked into, or have an injected input reach a capability that doesn't exist.

**Threat model (the one that actually happens):** it is rarely "the code spontaneously invents a `DELETE FROM users`." It is "**someone, or some input, caused the operation to fire**" — a confused-deputy path, an injected value flowing into a query builder, a compromised or over-scoped token, an admin endpoint reachable without the check the author assumed was upstream. If the bulk/destructive capability isn't exposed, none of those reach it.

**In a web app, this means:**
- Don't ship a "delete all / bulk-purge" endpoint or a Server Action that takes a table name + filter from the client because it was convenient during development. Build the *specific* narrow operation the product needs.
- Don't add a `service_role`-bypass route ("just to make this one admin thing work") that skips RLS. A `service_role` key in a request-reachable code path is a capability you've opened to anything that can reach that path.
- Route rare legitimate destructive needs (GDPR erase, tenant offboarding, data migration) through a **human-confirmed admin UI** with an explicit typed confirmation — not a callable API that any caller (or a future caller) can hit unattended.

**Risk dial (match the rigor to the blast radius):**
- A single-user toy can expose more — the only person who can mis-fire it is the owner.
- A multi-tenant app holding other people's PII must **close** destructive/bulk operations behind human confirmation and per-tenant scoping. The cost of a closed capability is a little friction; the cost of an open one is a cross-tenant data-loss incident.

The question to ask in review is not "is this delete-endpoint's auth check correct?" — it's "**does this endpoint need to exist on the callable surface at all?**"

---

## Primitive 9 — Fail loud or fail closed; never fail silent-open

When a write or side-effect fails, there are exactly **two safe responses**, and one common bug:

- **Fail LOUD** — re-surface the failure where a human (or an alert) will see it: throw past the boundary, return a non-2xx, set user-visible error state, capture to Sentry *and re-throw*, push the failure into the run summary. The operation did not happen and that fact is now visible.
- **Fail CLOSED** — abort the whole operation, roll back partial state, and do not let downstream logic proceed as if the write succeeded. Nothing happened and nothing depends on it having happened.
- **Fail SILENT-OPEN (the bug)** — `catch → log → continue`: swallow the error, write a log line nobody reads, and let the caller believe the write succeeded. The system now carries state that doesn't match reality, and the gap surfaces later as a corruption or a "but it said it worked" incident — far from the cause.

**The tell:** a `catch` block whose only body is a `console.log` / `logger.warn` followed by normal continuation, on a path that *wrote* (or was supposed to write) something. That is silent-open unless the log is paired with a re-throw, a non-2xx return, surfaced error state, or a dead-letter.

### Web reframes — where silent-open hides in this stack

| Surface | Silent-open bug | Fail loud / closed instead |
|---|---|---|
| **Server Action** | `try { await db.update(...) } catch(e){ console.error(e) }` then return success | Throw, or return `{ error }` the form renders. Also: an RLS `UPDATE` with no matching policy returns **200 with empty result** — check `count`/returned row, don't assume success (see `audit-rls.md` / `debug.md` Data-Mutation layer). |
| **Outbox / background worker** | side-effect fails, worker marks the row done anyway | Bump `attempts`, back off, dead-letter after the cap — **JOB_KB_1**. The audit row for the run must also be written; if *that* write fails (e.g. a missing column → PostgREST `PGRST204`), that is itself a loud failure, not a warning to swallow. |
| **Webhook handler** | downstream write fails, handler still returns `200` | Return non-2xx so the sender retries (and keep the handler idempotent — JOB_KB_1 / OBS_KB_3). A `200` is a promise you processed it. |
| **Migration** | a statement fails mid-migration, leaving half-applied schema | Run DDL in a transaction so a failure rolls the whole migration back; never leave a partially-applied schema as the new baseline. |
| **Audit write** (OBS_KB_3) | the action succeeds but its audit-log insert fails and is swallowed | The audit trail is the thing you'll need after an incident — a failed audit write must be loud (re-thrown or alerted), per OBS_KB_3's "install all three immutability layers." |

This restates, as an authoring rule, the cross-cutting **OBS index** guidance already in force: *"Capture errors at the boundary … Never silently swallow inside business logic"* and *"Re-throw after `captureException` in background-job catch blocks."* OBS_KB_5 names the failure mode those rules prevent.

---

## Cross-cutting rules (mirror into the Obs / Job indexes)

**Always:**
- Treat every `catch` on a write path as a decision: loud or closed. If it's neither, it's a bug.
- Re-throw (or return an error the caller surfaces) after logging/capturing on a write path.
- Prefer *not building* a destructive/bulk capability over building it with a careful guard (Primitive 0).
- Run multi-statement DDL inside a transaction so partial failure rolls back.

**Never:**
- `catch → log → continue` on a path that wrote (or should have written) state.
- Return `2xx` from a webhook/handler whose downstream write failed.
- Expose a `service_role`-bypass or table-name-from-client operation on a request-reachable surface.
- Assume a Supabase `UPDATE`/`DELETE` succeeded because the call didn't throw — a missing RLS policy returns 200 with no rows.

---

## When to update this file

- A real silent-open incident surfaces in an app-blueprint project (then reconsider wiring this as an `/audit-code` / `/audit-rls` gate, not just reference).
- Supabase / Next.js change the failure semantics of Server Actions, Edge Functions, or RLS write rejection.
- A new write surface enters the stack (a new queue runtime, a new external-write integration).

Do not update this KB with project-specific decisions — these are stack-level safety patterns.
