# Form Knowledge Base — Index

**Stack:** Zod v4 + react-hook-form v7 + Server Actions + TanStack Query v5 + shadcn/ui + Next.js 15/16 App Router.

This folder owns the submission pipeline: how a form is authored, validated, submitted, optimistic-updated, persisted across steps, and wired to non-native inputs. Authentication-specific forms (login, signup, password reset) live in `Auth KBs/`. File-upload mechanics live in `Supabase Structure KBs/SB_KB_7`. Cron-based cleanup of abandoned wizard drafts lives in `Job KBs/`.

These files are for Claude. Principles-only docs fail at implementation time. Every KB has complete, runnable code and named gotchas.

---

## File index

| File | Topic | Stack-portable? |
|---|---|---|
| `FORM_KB_1_Schemas_And_Validation.md` | Zod v4 schema authoring: composition, refinements, transforms, async validation, error formatting, FormData coercion | ✅ Portable (Zod is browser+Node; no framework dependency) |
| `FORM_KB_2_RHF_Server_Actions.md` | Canonical pipeline — RHF + zodResolver + useMutation wrapping a Server Action; optimistic updates with TanStack Query; alternatives (`useActionState`, API Route Handler) | 🔒 Stack-locked: Server Actions and useActionState are Next.js |
| `FORM_KB_3_Multi_Step_Wizards.md` | Wizard state across page reloads and back-button: hybrid persistence (nuqs URL + DB draft row), one-RHF-instance pattern, per-step validation with `trigger()`, schema composition across steps | ⚠️ Partial — wizard pattern portable; nuqs and Supabase draft-row code stack-locked |
| `FORM_KB_4_Specialized_Inputs.md` | Controller wrapping for non-native inputs: date pickers, useFieldArray, multi-select, rich text (Tiptap), autocomplete, masked inputs, currency, toggles | ⚠️ Partial — RHF Controller pattern portable; specific primitives are shadcn-locked |

---

## Cross-cutting rules that apply everywhere

**Always:**
- Author one Zod schema per form, in `src/schemas/`, with no `'use client'` or `'use server'` directive. Import the same schema from the client component and the server action — drift between client and server validation is the most common form-bug class.
- Re-parse on the server inside the Server Action, even when the client has already validated. Client validation is a UX layer; the server is the trust boundary.
- Place `'use server'` as the first marker in any action file. Misplacing it (after imports, mid-file) silently turns the file into a regular module and bypasses the server boundary.
- Use `safeParse` on user input and branch on `.success`. `.parse()` throws and surfaces as an unhandled rejection in actions.
- Surface server `fieldErrors` via `form.setError(field, { type: 'server', message })`; surface form-level errors via `form.setError('root.serverError', ...)` or a toast.
- Disable the submit button while the action is pending. Pick exactly one source of truth for the pending state (`form.formState.isSubmitting`, `useMutation`'s `isPending`, or `useFormStatus`'s `pending`) — don't double-disable.
- Wrap optimistic mutations with TanStack Query's `useMutation` + `onMutate` snapshot/rollback pattern. Always have a rollback path in `onError`. Always invalidate in `onSettled`.
- Persist wizard step state to the URL (via nuqs) or to a DB draft row, never to component memory only. Component state is lost on refresh, navigation, or session expiry.
- Re-parse the merged wizard schema on final submit, even if every step was validated on its way in. Cross-step refinements live on the merged schema.
- Use `Controller` from RHF for any non-native input (shadcn `Calendar`, `Combobox`, Tiptap, react-imask). `register()` only works for inputs that natively accept `ref` and `onChange`.

**Never:**
- Trust `formData` without parsing. Every value coming out of `FormData` is a string; numbers, booleans, and dates need `z.coerce.*` or `z.preprocess`.
- Mutate the optimistic cache without a rollback path captured in `onMutate` and applied in `onError`. Without rollback, a server error leaves the UI permanently lying about state.
- Mix uncontrolled inputs with RHF without a `Controller` wrapper. The result is silent missing-value bugs that the type system cannot catch.
- Validate on every keystroke. Default RHF mode (`onSubmit`) is correct for most forms; `onBlur` is the right escalation. `onChange` mode runs validation per-keystroke, including async refinements, and floods the network.
- Persist credit-card numbers, CVVs, or full SSNs through this pipeline. Tokenize via the payment provider; never let raw card data hit your Server Action or DB. (See future BILL_KB.)
- Serialize `Date`, `Map`, `Set`, or `FileList` directly into a Server Action argument without a transform. Server Actions serialize their arguments — these types either lose information or fail to serialize entirely.
- Define schemas inside component bodies. The schema must be importable from the server action; defining it inside a component closes that door.
- Use `useActionState` imported from `'react-dom'` — it is exported from `'react'`. (`useFormStatus` is the one from `'react-dom'`.)
- Place `revalidatePath` or `revalidateTag` after `redirect()`. `redirect()` throws a framework exception; code after it never executes.
- Set Tiptap's `useEditor({ immediatelyRender: true })` (the default) in a Next.js App Router component — produces React hydration error #418. Always set `immediatelyRender: false` AND mark the component `'use client'`.
- Sanitize HTML server-side using `happy-dom` as the DOMPurify backing — DOMPurify maintainers explicitly flag this combination as unsafe. Use `jsdom` or switch to `sanitize-html`.
- Use one `useForm` per wizard step. The single-instance-with-`shouldUnregister:false` pattern is correct; per-step instances lose values on transition and complicate cross-step validation.

---

## Dependencies between files

```
FORM_KB_1   ← FORM_KB_2   (the canonical pipeline assumes the schema patterns from KB_1)
FORM_KB_1   ← FORM_KB_3   (wizard schema composition uses operators from KB_1)
FORM_KB_1   ← FORM_KB_4   (specialized inputs reference Zod patterns from KB_1)
FORM_KB_2   ← FORM_KB_3   (each wizard step IS a KB_2-style submission)
FORM_KB_2   ← FORM_KB_4   (specialized inputs plug into the KB_2 pipeline)
```

Cross-folder dependencies:

```
FORM_KB_2   → AUTH_KB_4   (Server Action server-client setup via @supabase/ssr)
FORM_KB_2   → SB_KB_7     (file uploads via signed URLs)
FORM_KB_3   → AUTH_KB_5   (signup-as-wizard provisions the first org)
FORM_KB_3   → JOB_KB      (abandoned-draft cleanup runs as a scheduled job)
FORM_KB_3   → SB_KB_1     (RLS policies on the wizard_drafts table)
FORM_KB_4   → SB_KB_7     (file-upload inputs cross-reference rather than duplicate)
FORM_KB_4   → UI_KB_5     (Controller pattern lives within the broader component-architecture KB)
```

---

## When to update these files

Update the relevant FORM_KB when:
- Zod ships a major version (the v3 → v4 transition required reworking error formatting, defaults semantics, and string-format methods)
- React Hook Form changes a public API (resolver shape, `Controller` props, `useFieldArray` semantics)
- Next.js changes a Server Action, `useActionState`, `useFormStatus`, `revalidatePath`, or `revalidateTag` API (the v15 → v16 `revalidateTag('tag', 'max')` two-arg requirement is one such change)
- TanStack Query changes the optimistic-update lifecycle hooks
- shadcn ships a primitive that supersedes one referenced here (e.g., the newer Base UI-backed `Combobox`)
- A library named here goes unmaintained or is replaced (Tiptap, react-day-picker, react-imask, nuqs, DOMPurify)
- A pattern produces an unexpected result in production

Do not update FORM_KBs to reflect project-specific decisions. These are stack patterns, not project docs.

---

## What these files do NOT cover

- **Authentication-specific forms** (login, signup, password reset, MFA enrollment) — see `Auth KBs/`. They use the same KB_2 pipeline but layer Supabase Auth APIs on top.
- **File uploads end-to-end** (signed URLs, chunked upload, virus scan, supersession) — see `SB_KB_7`. FORM_KB_4 cross-references but does not duplicate.
- **Payment forms / billing inputs** — credit-card capture must use the payment provider's tokenization (Stripe Elements, etc.); raw card data must never traverse this pipeline. See future BILL_KB.
- **AI chat forms / streaming inputs** — see future AI_KB. Streaming response handling diverges from the request/response pipeline this folder describes.
- **Form analytics / abandonment tracking / field-level telemetry** — observability concern; see future OBS_KB.
- **CAPTCHA / bot mitigation on form submit** — observability/security concern; see future OBS_KB.
- **Native mobile forms** — focused on Next.js App Router; React Native form patterns differ enough to need their own folder if adopted.

---

## VERIFY BEFORE SHIPPING

A handful of items in these KBs depend on library or framework behavior that primary docs document lightly or describe as experimental. Re-verify against current docs before relying on these patterns in production:

- `z.coerce.date()` semantics in Zod v4 (FORM_KB_1, FORM_KB_4) — works in practice but underdocumented in the v4 reference.
- `z.stringbool` v4 availability and exact API (FORM_KB_1).
- react-day-picker v9 `timeZone` prop (FORM_KB_4) — flagged experimental, requires `@date-fns/tz`.
- shadcn ships two `Combobox` implementations (older Radix/cmdk `Popover + Command` and a newer Base UI-backed component with `ComboboxInput`/`ComboboxContent`/`ComboboxList`/`ComboboxItem`). The component APIs differ. FORM_KB_4 shows the cmdk pattern; before copying it, confirm which one `npx shadcn@latest add combobox` installs into your project.
- `revalidateTag` two-argument requirement in Next.js 16 (FORM_KB_2) — confirm against the version pinned in `package.json`.
- nuqs v2 compatibility with the specific Next.js 16.x release in use (FORM_KB_3).
- react-imask and libphonenumber-js current versions (FORM_KB_4).

These are not blockers — most are stable in production usage but lack a quotable, version-locked primary source. Re-verify when implementing.
