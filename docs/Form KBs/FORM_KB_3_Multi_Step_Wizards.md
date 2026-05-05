# FORM_KB_3 — Multi-Step Wizards

**Stack-locked: Next.js App Router + react-hook-form + Zod + Supabase. State persistence patterns are portable.**

---

## Pattern

A multi-step wizard is a single logical form split across sequential views. The architecture has three layers that must be decided independently:

1. **RHF instance scope** — one instance for the entire wizard (correct) vs one per step (incorrect for most wizards).
2. **Step routing** — query param (`?step=N`) vs dynamic route segments (`/wizard/[step]`).
3. **Persistence layer** — where form values live between step transitions and browser sessions.

These three decisions interact: the one-RHF-instance pattern requires query-param routing (not route segments). The DB draft pattern decouples both from browser memory, enabling cross-device resume. The right combination for most production wizards is **one RHF instance + query-param routing + DB draft row** (hybrid).

---

## When to use / when to skip

**Use this pattern when:**
- A form has four or more fields that benefit from being grouped into conceptual stages.
- The user is expected to abandon and resume across sessions or devices.
- Any step collects PII (name, address, payment config) that must not sit in the URL or client storage unprotected.
- The wizard is part of onboarding where the draft IS the user's emerging account state.

**Skip / simplify when:**
- Two or three steps that a user will complete in one sitting with no sensitive data — a tabbed form with in-memory state is simpler.
- Steps have no shared fields and no cross-step validation — treat as separate pages with separate forms.
- The flow is a checkout funnel that hands off to a payment provider — the payment step is out-of-band; the wizard pattern only covers steps before the handoff.

---

## Anti-patterns

**Wizard state in component state only (`useState` at the wizard root).**
A browser refresh at step 3 drops the user back to step 1 with empty fields. The step indicator says "3" but the form is blank. This is the most common wizard bug. Persist to URL and DB.

**Per-step `useForm` instances.**
Each `useForm` call creates an isolated store. Values from step 1 are not visible in step 3's store. The developer ends up passing values as props or manually assembling a final object at submission time, which diverges from the RHF-typed values and bypasses schema validation. Use one instance; let `shouldUnregister: false` (the default) do the work.

**Storing PII in URL params.**
`?email=user@example.com&ssn=123` is logged by every proxy, CDN, server access log, and browser history entry. Never put form field values in the URL. The URL holds `?step=2&draftId=abc123` — nothing more.

**Storing sensitive data in `sessionStorage` or `localStorage`.**
These are readable by any XSS payload on the same origin. For a wizard collecting PII, the DB draft row (protected by RLS) is the correct persistence layer.

**Autosave on every keystroke.**
Debouncing to every few hundred milliseconds still produces dozens of writes per minute. It burns database writes and interferes with validation (partial values are often invalid). Autosave on step transition — when the user clicks "Next" — is the right trigger. Disable the Next button while the save is in flight.

**Using XState for a linear 3-7 step wizard.**
XState v5 adds ~30-40kB to the bundle (combined `xstate` + `@xstate/react`). For a linear wizard with no complex conditional branching, a `STEP_FIELDS` record and `trigger(stepFields)` covers everything XState would handle. Reserve XState for wizards with genuinely non-linear transitions, parallel async operations, or where the machine definition is shared across a large team. If you have conditional steps based on prior answers, the `STEP_ORDER` derivation pattern in the Edge Cases section is sufficient.

**Separate dynamic routes (`/wizard/[step]`) with a single RHF instance.**
Each page navigation destroys client state. You cannot span one `useForm` instance across route boundaries. If you use route segments, you must accept per-step `useForm` instances and reconstruct full values from the DB at submission time. This is workable but loses the primary benefit of one-instance accumulation.

---

## Persistence decision rubric

| Criterion | URL search params | `sessionStorage` | DB draft row | Hybrid (URL + DB) |
|---|---|---|---|---|
| Survives page refresh | Yes | No (cross-tab); Yes (localStorage) | Yes | Yes |
| Cross-device resume | No | No | Yes | Yes |
| Bookmarkable / shareable | Yes (if draftId is in URL) | No | Via draftId in URL | Yes |
| Sensitive data safe | No — URL is logged everywhere | Partial — XSS-readable | Yes — RLS-protected | Yes |
| Size limit | ~2KB practical | 5–10MB | No practical limit | No practical limit |
| SSR-friendly | Yes — `searchParams` prop on page | No — client-only; hydration mismatch | Yes — query in RSC | Yes |
| Multi-tab isolation | Yes (each tab has its own URL) | `sessionStorage` yes; `localStorage` shared | Safe with per-tab draftId | Yes — each tab gets its own draftId |
| Implementation cost | Low | Low-medium | High | High |
| Cleanup required | No | Automatic on session end | Yes — TTL + cron | Yes |

**Decision guide:**

- **URL-only:** short wizard (2-3 steps), non-sensitive data, no resume required. Store step index only. Use nuqs.
- **sessionStorage:** single-session flow (in-page checkout), non-sensitive, no cross-device resume. Acceptable for throwaway flows. User loses progress if tab is closed.
- **DB draft row:** any wizard collecting PII, or where cross-device resume is a requirement. The gold standard.
- **Hybrid (default recommendation):** `?step=N&draftId=UUID` in the URL via nuqs; form values in the DB draft row. The URL encodes position; the DB encodes content. On page load, the RSC reads the draft from DB and passes it as RHF `defaultValues`. This is the pattern this KB implements.

---

## Schema composition across steps

Define one Zod schema per step, then merge into a full schema for final submission. The full schema is also what the resolver validates against — per-step validation uses `trigger(stepFields)`, not a resolver swap.

```ts
// lib/schemas/wizard.ts
import { z } from 'zod'

// Each schema validates only its own fields.
// Note: Zod v4 uses `{ error: '...' }` (not bare strings) for inline error messages,
// and the top-level `z.email()` (not `z.string().email()`).
export const step1Schema = z.object({
  firstName: z.string().min(1, { error: 'Required' }),
  lastName:  z.string().min(1, { error: 'Required' }),
  email:     z.email(),
})

export const step2Schema = z.object({
  plan:          z.enum(['starter', 'pro', 'enterprise']),
  billingCycle:  z.enum(['monthly', 'annual']),
})

export const step3Schema = z.object({
  companyName:   z.string().min(1, { error: 'Required' }),
  teamSize:      z.number().int().positive(),
})

// .merge() is deprecated in Zod v4 — use .extend() with a spread of the other schema's
// .shape to combine ZodObjects. The right-side fields win on key collisions.
export const fullWizardSchema = step1Schema
  .extend({ ...step2Schema.shape, ...step3Schema.shape })

// Cross-step refinements go on the merged schema, not on individual step schemas.
// .superRefine() lets you attach errors to specific field paths across steps.
export const fullWizardSchemaWithRules = fullWizardSchema.superRefine((data, ctx) => {
  if (data.plan === 'enterprise' && data.teamSize < 10) {
    ctx.addIssue({
      code: 'custom',
      path: ['teamSize'],         // error surfaces on the step3 field
      message: 'Enterprise plan requires a team of at least 10',
    })
  }
})

export type Step1Values = z.infer<typeof step1Schema>
export type Step2Values = z.infer<typeof step2Schema>
export type Step3Values = z.infer<typeof step3Schema>
export type WizardValues = z.infer<typeof fullWizardSchema>
```

**Composition operators relevant to wizards:**
- `.extend({ ...other.shape })` — combines ZodObject schemas. The Zod v4 idiom for what `.merge()` did in v3 (`.merge()` is deprecated in v4).
- `.extend({ field })` — adds or overwrites fields on an existing schema. Right-side keys win on collision.
- `.pick({ field: true })` — extract a subset; useful if you need to validate just one step's fields in isolation (e.g., in a test).
- `.partial()` — make every field optional; useful for the in-progress draft state where the user hasn't filled everything yet.
- `.superRefine((val, ctx) => { ctx.addIssue(...) })` — multiple custom issues on the merged schema; use `path` to attach errors to specific fields.

KB_1 owns Zod authoring conventions. The above shows composition only.

---

## One RHF instance for the entire wizard

**Decision: a single `useForm` at the wizard parent, passed to step components via `FormProvider`.**

Why one instance wins:
- `shouldUnregister: false` (the RHF default) preserves field values in the internal store when a step unmounts. Step 1's fields are still in the store when the user is on step 3.
- `getValues()` at final submit returns the complete `WizardValues` object without manual assembly.
- `trigger(stepFields)` validates a subset of fields without swapping the resolver or splitting the schema.
- No value synchronization between sibling stores.

Why route segments (`/wizard/[step]`) break this: each page navigation destroys the React tree, including the `useForm` instance. You cannot mount a single `useForm` across page boundaries. If you use route segments, you must accept per-page instances and rebuild `WizardValues` from the DB at submission time.

```tsx
// components/wizard/WizardShell.tsx
'use client'

import { useState } from 'react'
import { useForm, FormProvider } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryStates, parseAsInteger, parseAsString } from 'nuqs'
import { fullWizardSchemaWithRules, type WizardValues } from '@/lib/schemas/wizard'
import { Step1 } from './steps/Step1'
import { Step2 } from './steps/Step2'
import { Step3 } from './steps/Step3'
import { saveDraftAction, submitWizardAction } from '@/app/actions/wizard'

// Map step number → the field names that belong to that step
const STEP_FIELDS: Record<number, (keyof WizardValues)[]> = {
  1: ['firstName', 'lastName', 'email'],
  2: ['plan', 'billingCycle'],
  3: ['companyName', 'teamSize'],
}

const TOTAL_STEPS = 3

interface WizardShellProps {
  initialStep: number
  initialDraftId: string | null
  defaultValues?: Partial<WizardValues>
}

export function WizardShell({ initialStep, initialDraftId, defaultValues }: WizardShellProps) {
  // nuqs owns step + draftId in the URL; history: 'push' so browser back steps backward
  const [{ step, draftId }, setWizard] = useQueryStates(
    {
      step:    parseAsInteger.withDefault(initialStep),
      draftId: parseAsString,
    },
    { history: 'push' }
  )

  const [activeDraftId, setActiveDraftId] = useState<string | null>(initialDraftId)
  const [saveError, setSaveError]         = useState<string | null>(null)
  const [isSaving, setIsSaving]           = useState(false)

  // Single form instance for the entire wizard.
  // shouldUnregister defaults to false — unmounted step fields retain their values.
  const methods = useForm<WizardValues>({
    resolver:      zodResolver(fullWizardSchemaWithRules),
    defaultValues: defaultValues ?? {},
    mode:          'onTouched',
  })

  const handleNext = async () => {
    // Validate only the current step's fields before advancing
    const isValid = await methods.trigger(STEP_FIELDS[step])
    if (!isValid) return

    setIsSaving(true)
    setSaveError(null)

    const result = await saveDraftAction({
      draftId: activeDraftId,
      values:  methods.getValues(),
      step:    step + 1, // record the step the user is advancing TO
    })

    setIsSaving(false)

    if (result.error) {
      // Autosave failure: surface the error but do not advance.
      // Never silently lose progress by advancing without a confirmed save.
      setSaveError(result.error)
      return
    }

    if (result.draftId && result.draftId !== activeDraftId) {
      setActiveDraftId(result.draftId)
      // Also write draftId into the URL so a refresh can reload the draft
      void setWizard({ step: step + 1, draftId: result.draftId })
    } else {
      void setWizard({ step: step + 1 })
    }
  }

  const handleBack = () => {
    // No reset() needed — the RHF store retains all field values
    void setWizard({ step: step - 1 })
  }

  const onSubmit = methods.handleSubmit(async (data) => {
    const result = await submitWizardAction({ draftId: activeDraftId, data })
    if (!result.success) {
      setSaveError(result.error ?? 'Submission failed')
    }
    // On success, the Server Action calls redirect() — component unmounts
  })

  return (
    <FormProvider {...methods}>
      <form onSubmit={onSubmit} noValidate>
        {saveError && (
          <p role="alert" className="text-destructive text-sm mb-4">{saveError}</p>
        )}

        {step === 1 && <Step1 />}
        {step === 2 && <Step2 />}
        {step === 3 && <Step3 />}

        <div className="flex justify-between mt-8">
          {step > 1 && (
            <button type="button" onClick={handleBack} disabled={isSaving}>
              Back
            </button>
          )}
          {step < TOTAL_STEPS ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={isSaving || methods.formState.isLoading}
            >
              {isSaving ? 'Saving…' : 'Next'}
            </button>
          ) : (
            <button
              type="submit"
              disabled={methods.formState.isSubmitting}
            >
              {methods.formState.isSubmitting ? 'Submitting…' : 'Submit'}
            </button>
          )}
        </div>
      </form>
    </FormProvider>
  )
}
```

**Step components are thin wrappers that consume the shared context:**

```tsx
// components/wizard/steps/Step1.tsx
'use client'

import { useFormContext } from 'react-hook-form'
import type { WizardValues } from '@/lib/schemas/wizard'

export function Step1() {
  const { register, formState: { errors } } = useFormContext<WizardValues>()

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="firstName">First name</label>
        <input id="firstName" {...register('firstName')} />
        {errors.firstName && <p className="text-destructive text-sm">{errors.firstName.message}</p>}
      </div>
      <div>
        <label htmlFor="email">Email</label>
        <input id="email" type="email" {...register('email')} />
        {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
      </div>
      {/* ... */}
    </div>
  )
}
```

---

## DB draft row pattern

### Migration

```sql
-- migrations/0010_wizard_drafts.sql
create table wizard_drafts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  step        int  not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days'
);

-- Fast cleanup: cron filters on expires_at
create index wizard_drafts_expires_at_idx on wizard_drafts (expires_at);
-- User-scoped lookup (resume flow)
create index wizard_drafts_user_id_idx on wizard_drafts (user_id);

alter table wizard_drafts enable row level security;

-- Users can read, insert, update, and delete only their own drafts.
-- No separate policies needed — a single policy covering all operations is cleaner
-- when there is no admin-visibility requirement on drafts.
create policy "users manage own drafts"
on wizard_drafts
using  (user_id = auth.uid())
with check (user_id = auth.uid());
```

`expires_at` is the only abandoned-draft mechanism this table needs. See JOB_KB for the pg_cron or Vercel Cron job that deletes expired rows nightly. One-liner: `delete from wizard_drafts where expires_at < now()`.

If the project uses a multi-tenant data model, add a `tenant_id` column and extend RLS to enforce tenant isolation — not just user isolation. See `KB_1_Architecture.md` and `SB_KB_1_Multi_Org_RLS.md` for the multi-tenant column strategy.

### Server Actions

```ts
// app/actions/wizard.ts
'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { fullWizardSchemaWithRules, type WizardValues } from '@/lib/schemas/wizard'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => cookieStore.getAll(),
        setAll: (cookies) =>
          cookies.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  )
}

// saveDraftAction: upserts the draft on every step transition (not every keystroke)
export async function saveDraftAction({
  draftId,
  values,
  step,
}: {
  draftId: string | null
  values:  Partial<WizardValues>
  step:    number
}): Promise<{ draftId: string; error?: string }> {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // Surface auth expiry to the client — see Edge Cases: session expiry mid-wizard
    return { draftId: draftId ?? '', error: 'SESSION_EXPIRED' }
  }

  if (draftId) {
    const { error } = await supabase
      .from('wizard_drafts')
      .update({
        data:       values,
        step,
        updated_at: new Date().toISOString(),
      })
      .eq('id', draftId)
      .eq('user_id', user.id) // belt-and-suspenders alongside RLS
    return error ? { draftId, error: error.message } : { draftId }
  }

  const { data, error } = await supabase
    .from('wizard_drafts')
    .insert({ user_id: user.id, data: values, step })
    .select('id')
    .single()

  if (error || !data) return { draftId: '', error: error?.message ?? 'Insert failed' }
  return { draftId: data.id }
}

// submitWizardAction: re-parses the full schema, runs the real mutation, deletes draft
export async function submitWizardAction({
  draftId,
  data,
}: {
  draftId: string | null
  data:    WizardValues
}): Promise<{ success: boolean; error?: string }> {
  // Re-parse on the server — never trust client-assembled values
  const parsed = fullWizardSchemaWithRules.safeParse(data)
  if (!parsed.success) {
    return {
      success: false,
      error:   'Validation failed — all steps must be complete. ' +
               parsed.error.issues.map(i => i.message).join(', '),
    }
  }

  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'SESSION_EXPIRED' }

  // Write the final record to your target table.
  // Wrap in a Postgres function if the insert + draft delete must be atomic.
  // Example (replace with your actual domain table):
  const { error: insertError } = await supabase
    .from('accounts')
    .insert({
      user_id:      user.id,
      first_name:   parsed.data.firstName,
      last_name:    parsed.data.lastName,
      email:        parsed.data.email,
      plan:         parsed.data.plan,
      billing_cycle: parsed.data.billingCycle,
      company_name: parsed.data.companyName,
      team_size:    parsed.data.teamSize,
    })

  if (insertError) return { success: false, error: insertError.message }

  // Delete draft on success — do not leave orphaned drafts for the cron to clean up
  if (draftId) {
    await supabase.from('wizard_drafts').delete().eq('id', draftId)
  }

  redirect('/dashboard')
}
```

### RSC entry point

```tsx
// app/onboarding/page.tsx
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { WizardShell } from '@/components/wizard/WizardShell'
import type { WizardValues } from '@/lib/schemas/wizard'

// Page receives searchParams as a Promise in Next.js 15+
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; draftId?: string }>
}) {
  const { step: stepParam, draftId } = await searchParams
  const initialStep = stepParam ? parseInt(stepParam, 10) : 1

  let defaultValues: Partial<WizardValues> = {}
  let resolvedDraftId: string | null = draftId ?? null

  if (draftId) {
    const supabase = await createClient()
    const { data } = await supabase
      .from('wizard_drafts')
      .select('data, step')
      .eq('id', draftId)
      .single()

    if (data) {
      defaultValues    = data.data as Partial<WizardValues>
      // Trust the DB's step record over the URL param to prevent step-skipping
      resolvedDraftId  = draftId
    }
  }

  return (
    // WizardShell uses useQueryStates; it must be wrapped in Suspense
    // because nuqs reads from useSearchParams under the hood in Next.js App Router
    <Suspense>
      <WizardShell
        initialStep={initialStep}
        initialDraftId={resolvedDraftId}
        defaultValues={defaultValues}
      />
    </Suspense>
  )
}
```

---

## URL-based step routing with nuqs

**Use query params (`?step=N`), not dynamic route segments (`/wizard/[step]`).** The query param approach keeps the entire wizard on a single page component, which is the prerequisite for one RHF instance. Route segments force per-page component teardown and rebuild, which destroys the form instance.

```ts
// nuqs v2 — install: npm install nuqs
import { useQueryStates, parseAsInteger, parseAsString } from 'nuqs'

const [{ step, draftId }, setWizard] = useQueryStates(
  {
    step:    parseAsInteger.withDefault(1),
    draftId: parseAsString,            // null if not yet set
  },
  { history: 'push' }                 // each Next click creates a history entry
)
```

**`history: 'push'` is required for sensible browser back-button behavior.** With the default `history: 'replace'`, pressing browser back exits the wizard entirely instead of returning to the previous step. With `'push'`, browser back decrements the step naturally.

**nuqs does not write default values to the URL by default.** `step=1` is the default, so the URL at step 1 will show `/onboarding?draftId=abc123` without a `step` param. If you need `?step=1` explicitly written, use `parseAsInteger.withDefault(1).withOptions({ clearOnDefault: false })`.

**Server-side step reading (for RSCs that need to know the current step):**

```ts
// lib/params/wizard.ts — shared between server and client
import { createSearchParamsCache, parseAsInteger, parseAsString } from 'nuqs/server'

export const wizardParamsCache = createSearchParamsCache({
  step:    parseAsInteger.withDefault(1),
  draftId: parseAsString,
})
```

```tsx
// app/onboarding/page.tsx — reading step server-side
const { step, draftId } = await wizardParamsCache.parse(searchParams)
```

**Practical URL size limit.** nuqs is for step index and IDs only — never form field values. URLs have a ~2KB practical limit across proxies and browsers. A UUID draft ID is 36 characters; keep it that way.

---

## Browser back button

With `history: 'push'` on the nuqs state:
- Each "Next" click adds a browser history entry (`?step=N`).
- Browser back navigates to `?step=N-1`. nuqs updates the `step` state. The wizard component re-renders the previous step.
- The RHF store is still mounted in memory (the page component did not unmount). All field values from prior steps are intact.
- No `reset()` call is needed on back navigation. Fields re-register against their stored values when the step component mounts.

With a DB draft, browser back is also safe across refreshes:
- If the user refreshes mid-wizard after pressing back, the URL has `?step=2&draftId=abc123`. The RSC loads the draft (which recorded step 3's values too, since `saveDraftAction` stores `getValues()` — all steps' current values at time of save). RHF initializes with those values. The user is at step 2 with all fields populated.

**Do not** use `router.replace()` (raw Next.js) for step navigation when you want browser back to work. `replace()` overwrites the current history entry — browser back exits the wizard. Use nuqs with `history: 'push'` instead.

---

## Edge cases

**Mid-wizard refresh (query param routing).**
Step index survives in the URL. If no DB draft exists, RHF initializes with empty `defaultValues` at whatever step the URL shows — the indicator says "3" but fields are blank. Prevention: always create the draft row on the first "Next" click and write `draftId` to the URL immediately. Do not allow step > 1 without an active draftId.

**Partial save on tab close.**
If `saveDraftAction` is in flight when the user closes the tab, the draft may have values from the previous step only. On resume, the user is returned to the step recorded in `data.step` in the DB (not the URL's step param, which the RSC ignores in favor of the DB record). Design: save the target step (the step the user is advancing TO) in the `step` column, not the step they just completed. If the save fails, the `step` column reflects where the user last successfully landed.

**Multi-tab editing the same draft.**
The hybrid URL pattern naturally handles this: each browser tab has its own URL, and therefore its own `draftId` if tabs opened the wizard independently. If the user deliberately opens the same `draftId` URL in two tabs, the second "Next" click will overwrite the first tab's data in the DB. This is acceptable for most wizards. If you need tab-level isolation, generate a new `draftId` on page load if one does not already exist and the user has no prior draft.

**Session expiry mid-wizard.**
`saveDraftAction` returns `{ error: 'SESSION_EXPIRED' }`. The wizard shell should detect this sentinel and redirect to login with the draftId preserved:

```ts
if (result.error === 'SESSION_EXPIRED') {
  router.push(`/login?redirect=/onboarding?draftId=${activeDraftId}`)
  return
}
```

On login, the redirect returns the user to the wizard. The RSC loads the draft by ID. Progress is fully restored. Anonymous auth (see AUTH_KB_5) sidesteps this for pre-signup wizards — the anonymous session persists until the user explicitly signs out.

**Abandoned drafts.**
`expires_at` is set to `now() + interval '30 days'` on insert. A nightly cron deletes rows where `expires_at < now()`. See JOB_KB_00_Index for the full pg_cron and Vercel Cron patterns. On successful submission, `submitWizardAction` deletes the draft immediately — the cron is only for drafts that were never submitted.

**`shouldUnregister` conflict.**
If any ancestor `FormProvider` or the project's global form configuration sets `shouldUnregister: true`, unmounting step 1's fields removes their values from the store. Verify the wizard's `useForm` call explicitly passes no `shouldUnregister` override (the default `false` is correct) and that no parent provider overrides it.

**`formState.isLoading` and async `defaultValues`.**
If you pass `defaultValues` as an async function to `useForm` (an alternative to the RSC approach above), `formState.isLoading` is `true` until the promise resolves. Disable the Next and Submit buttons during this period. `formState.isLoading` was introduced in RHF v7.33.0; if the project pins an older version, manage loading state with a separate `useState`.

**Conditional steps.**
When prior answers determine which steps appear, derive the active step list from form values:

```ts
const getStepOrder = (values: Partial<WizardValues>): (keyof typeof STEP_FIELDS)[] => [
  1,
  2,
  ...(values.plan === 'enterprise' ? [3] : []),
]
```

`handleNext` and `handleBack` navigate by this list, not by arithmetic. `STEP_FIELDS` for the hidden step is never triggered, so those fields never fail validation.

**File inputs across steps.**
`File` objects cannot be serialized to JSON and stored in a DB draft row. If a step includes file upload: upload immediately on file selection and store the resulting URL (or Supabase Storage path) in the form value for that field. The draft then stores the URL string, not the binary. See KB_4 for the controlled file input pattern.

**Cross-step validation surfacing.**
When `submitWizardAction` re-parses with `fullWizardSchemaWithRules` and a cross-step rule fails, `zodResolver` sets errors on fields that may belong to an already-completed step (e.g., an error on `email` when the user is on step 3). The wizard shell should render a summary message — "Please go back and correct the email field" — rather than relying on the per-field error display in the unmounted step component. Alternatively, use the eager re-validation pattern: `watch('plan')` in Step2 + `trigger('teamSize')` in a `useEffect` when the plan changes.

---

## Cross-references

- **FORM_KB_1** — Zod schema authoring conventions. The composition operators shown here (`.extend({ ...other.shape })`, `.superRefine()`) are the wizard-specific subset. Per-field validation rules and `.refine()` patterns live in KB_1.
- **FORM_KB_2** — Single-screen form pattern. Each wizard step IS a single-screen form. KB_2's field component patterns, error display, and submit-handling conventions apply inside each step component. KB_3 adds the persistence and navigation layer on top.
- **FORM_KB_4** — Specialized inputs. File uploads, date pickers, and comboboxes within step components follow KB_4 patterns. File-upload-mid-wizard requires the upload-on-select approach described in KB_4.
- **AUTH_KB_5** — Signup as wizard. When the wizard IS the signup flow (the user creates an account at the end of the wizard), the anonymous auth pattern applies: call `signInAnonymously()` before the first `saveDraftAction`, store the draft under the anonymous UID, then upgrade the anonymous user to a permanent account at submission. AUTH_KB_5 owns the full lifecycle.
- **JOB_KB_00_Index** — Scheduled jobs. The `expires_at` column strategy is the interface between this KB and JOB_KB. JOB_KB owns the cron definition, retry logic, and monitoring. This KB owns the column and the insert default.
- **KB_1_Architecture.md** / **SB_KB_1_Multi_Org_RLS.md** — Multi-tenant data model. If the project is multi-tenant, `wizard_drafts` needs a `tenant_id` column and RLS must enforce tenant isolation in addition to user isolation.
