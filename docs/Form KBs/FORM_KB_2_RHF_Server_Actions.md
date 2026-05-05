# FORM_KB_2 — RHF + Server Actions: Canonical Submission Pipeline

**Stack-locked: react-hook-form + Zod + Server Actions + TanStack Query + shadcn/ui + Next.js 15/16 App Router. The submission/validation/optimistic-update pipeline.**

---

## Pattern

A Client Component owns form state via `useForm` from react-hook-form (RHF), wired to Zod validation through `@hookform/resolvers/zod`. On submit, `handleSubmit` validates client-side and calls a `useMutation` wrapper that invokes a Server Action. The Server Action re-parses input with Zod server-side, writes to the database, revalidates the Next.js cache, and returns a discriminated-union result. The client reads that result in `onSuccess`, either setting field-level errors via `form.setError` or calling `queryClient.invalidateQueries` and navigating. Pending state comes from one source: `mutation.isPending`.

shadcn/ui's Form primitives (`Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`) wrap RHF's `Controller` render-prop internally. They handle `aria-invalid`, `aria-describedby`, label association, and error message display — you don't wire these manually.

---

## When to use / when to skip

**Use this pattern when:**
- The submitted data lives in the TanStack Query cache (fetched elsewhere via `useQuery`).
- Success/error toasts are needed before navigation.
- Cache invalidation across multiple routes is needed after mutation.
- Complex field validation UX: field-level error highlighting, `isDirty` tracking, conditional fields, inline async validation.
- JavaScript is always available (no progressive-enhancement requirement).

**Skip when:**
- The form is simple (two or three uncontrolled inputs), no cached data is involved, and progressive enhancement matters — use the `useActionState` alternative instead (see below).
- The endpoint must be callable by external consumers or third-party services — use an API Route Handler instead (see below).
- Multi-step wizard — FORM_KB_3 owns that pattern.

---

## Anti-patterns

**Trusting formData or typed input without server-side re-parsing.**
The client calls your Server Action — any value it sends could be tampered with. Always run `schema.safeParse(input)` inside the action before touching the database. The client-side Zod validation is UX; the server-side re-parse is security.

**Using `register()` with shadcn/Radix-based components without Controller.**
shadcn's `Input`, `Select`, `Checkbox`, and similar components are controlled components built on Radix UI. They need the `value`/`onChange`/`onBlur`/`ref` interface that RHF's `Controller` (or shadcn's `FormField`) provides. Passing `{...register('field')}` directly works for native `<input>` elements but breaks or loses reactivity on Radix-wrapped components. Always use `<FormField>`.

**Double-disabling the submit button.**
`disabled={mutation.isPending || form.formState.isSubmitting}` is redundant. When you use `mutateAsync` inside `handleSubmit`, both flags are true for nearly the same window. Pick one source of truth: use `mutation.isPending` when using TanStack Query, `form.formState.isSubmitting` when calling the action directly without TQ, or `pending` from `useActionState`/`useFormStatus` for the form-action pattern.

**Mutating the optimistic cache without a rollback path.**
If you call `queryClient.setQueryData` in `onMutate` without first snapshotting the previous value and returning it as context, the cache is corrupted on failure with no recovery. Always snapshot, always return context, and restore on both failure paths: in `onError` for thrown errors, and in `onSuccess` for `{ ok: false }` results returned as data — `onError` does not fire on logical failures.

**Placing `redirect()` before `revalidatePath()`.**
`redirect()` throws a control-flow exception internally — Next.js catches it to issue the redirect response. Any code after `redirect()` never runs. Revalidate first, then redirect.

**Using `getSession()` server-side in Server Actions.**
`getSession()` reads the cookie without re-validating the JWT signature. Use `supabase.auth.getUser()` (network round-trip, always accurate) or `getClaims()` (JWT-local for asymmetric-key projects). See AUTH_KB_4.

**Using `revalidateTag` with a single argument in Next.js 16.**
The single-argument form `revalidateTag(tag)` is deprecated. The canonical form requires a second argument naming a cache life profile: `revalidateTag('posts', 'max')`. `'max'` is the built-in profile for stale-while-revalidate semantics; other profile names come from your `cacheLife` config. The current type definitions mark the second argument as required, so TypeScript will error against the single-arg form. For immediate expiration (e.g., webhook-driven invalidation), pass `{ expire: 0 }` instead of a profile string.

**Submitting on every keystroke.**
Never call `form.handleSubmit(onSubmit)()` from an `onChange` handler — debounce patterns belong outside `handleSubmit`. Wire submission to the form's `onSubmit` event only.

**Serializing non-serializable values through Server Action boundaries.**
`Date`, `Map`, `Set`, `FileList`, and class instances are not serializable across the Server Action boundary. Transform `Date` to ISO strings, pass file uploads via `FormData` (see SB_KB_7), and keep action arguments as plain JSON-compatible types.

**Placing server-only imports in shared schema files.**
A schema file imported by both the client component and the server action must be free of server-only imports (`next/headers`, `@supabase/ssr`, etc.). Keep schemas pure Zod — no side effects, no server imports.

---

## Canonical pattern — full code

The following three files form a coherent set. Adapt names for your domain.

### `src/schemas/post.ts`

```ts
// Pure Zod schema — imported by both the client component and the server action.
// No server-only imports here. See FORM_KB_1 for schema authoring conventions.
import { z } from 'zod'

export const CreatePostSchema = z.object({
  title:   z.string().min(3, 'Title must be at least 3 characters').max(100),
  slug:    z.string().regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens'),
  content: z.string().min(10, 'Content must be at least 10 characters'),
})

export type CreatePostInput = z.infer<typeof CreatePostSchema>
```

### `src/app/posts/actions.ts`

```ts
'use server'
// 'use server' must be the first statement in the file — all exports become Server Functions.

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CreatePostSchema, type CreatePostInput } from '@/schemas/post'

// Discriminated-union return type.
// ok: true  → caller can read data and navigate.
// ok: false → caller reads fieldErrors (mapped to form fields) and/or formError (shown at root).
// This is better than throwing: thrown errors surface as onError in useMutation, which
// loses the field mapping. A discriminated union lets onSuccess handle both paths cleanly.
export type CreatePostResult =
  | { ok: true;  data: { id: string; slug: string } }
  | {
      ok: false;
      fieldErrors?: Partial<Record<keyof CreatePostInput, string[]>>
      formError?: string
    }

export async function createPost(input: CreatePostInput): Promise<CreatePostResult> {
  // 1. Auth — use getUser(), which re-validates the JWT, not getSession().
  //    See AUTH_KB_4 for the full auth-in-Server-Actions discussion.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, formError: 'You must be signed in to create a post.' }
  }

  // 2. Server-side re-parse — always. The client already validated, but input is untrusted.
  const parsed = CreatePostSchema.safeParse(input)
  if (!parsed.success) {
    // z.flattenError is the Zod v4 API for flattening field errors.
    const flat = z.flattenError(parsed.error)
    return {
      ok: false,
      fieldErrors: flat.fieldErrors as CreatePostResult['fieldErrors'],
    }
  }

  // 3. Database write
  const { data: post, error } = await supabase
    .from('posts')
    .insert({ ...parsed.data, author_id: user.id })
    .select('id, slug')
    .single()

  if (error) {
    // Map known DB constraint violations to user-facing field errors.
    // Postgres unique-violation code is 23505.
    if (error.code === '23505') {
      return { ok: false, fieldErrors: { slug: ['This slug is already taken.'] } }
    }
    return { ok: false, formError: 'Failed to create post. Please try again.' }
  }

  // 4. Revalidate BEFORE redirect. redirect() throws — nothing after it runs.
  revalidatePath('/posts')
  revalidatePath(`/posts/${post.slug}`)
  // For tag-based revalidation in Next.js 16, the second arg is required:
  // revalidateTag('posts', 'max')
  // The single-argument form revalidateTag('posts') is deprecated in Next.js 16.

  // 5. Return success — let the client navigate (preferred when using TQ for toast timing).
  //    If you want a server-side redirect instead, call redirect('/posts') here — but then
  //    you cannot show a toast before navigation. Pick one approach per form.
  return { ok: true, data: { id: post.id, slug: post.slug } }
}
```

### `src/components/post-form.tsx`

```tsx
'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { CreatePostSchema, type CreatePostInput } from '@/schemas/post'
import { createPost } from '@/app/posts/actions'

export function CreatePostForm() {
  const router = useRouter()
  const queryClient = useQueryClient()

  // useForm wires Zod validation through zodResolver.
  // defaultValues is required — omitting it breaks isDirty tracking and reset().
  // mode: 'onBlur' runs validation when the user leaves a field (good UX default).
  const form = useForm<CreatePostInput>({
    resolver: zodResolver(CreatePostSchema),
    mode: 'onBlur',
    defaultValues: {
      title:   '',
      slug:    '',
      content: '',
    },
  })

  const mutation = useMutation({
    mutationFn: (values: CreatePostInput) => createPost(values),

    onSuccess: (result) => {
      if (!result.ok) {
        // Map server fieldErrors back into RHF — they appear in <FormMessage /> automatically.
        if (result.fieldErrors) {
          for (const [field, messages] of Object.entries(result.fieldErrors)) {
            form.setError(field as keyof CreatePostInput, {
              type: 'server',
              message: messages?.[0],
            })
          }
        }
        // Form-level errors (auth failures, generic DB errors) appear in the root error block.
        if (result.formError) {
          form.setError('root', { type: 'server', message: result.formError })
        }
        return
      }

      // Success path
      toast.success('Post created!')
      queryClient.invalidateQueries({ queryKey: ['posts'] })
      router.push(`/posts/${result.data.slug}`)
    },

    onError: () => {
      // Network-level failure or unexpected throw from the action (not a discriminated-union
      // failure — those come through onSuccess). Show a generic root error.
      form.setError('root', {
        type: 'server',
        message: 'An unexpected error occurred. Please try again.',
      })
    },
  })

  async function onSubmit(values: CreatePostInput) {
    // Clear any root error from a previous attempt before retrying.
    form.clearErrors('root')
    // mutateAsync inside handleSubmit: isSubmitting covers the same window as isPending.
    // Error surfacing lives entirely in onSuccess/onError callbacks — don't duplicate here.
    await mutation.mutateAsync(values)
  }

  return (
    // <Form> spreads the useForm() return into FormProvider so all FormField children
    // can access form context via useFormContext() internally.
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="My first post" {...field} />
              </FormControl>
              {/* FormMessage renders fieldState.error.message — null when no error */}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Slug</FormLabel>
              <FormControl>
                <Input placeholder="my-first-post" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Content</FormLabel>
              <FormControl>
                <Textarea rows={8} placeholder="Write your post..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Root (form-level) error — shown for auth failures and generic server errors */}
        {form.formState.errors.root?.message && (
          <p className="text-sm font-medium text-destructive" role="alert">
            {form.formState.errors.root.message}
          </p>
        )}

        {/*
          Pending state: use mutation.isPending — it covers the full Server Action round-trip.
          form.formState.isSubmitting is true only while handleSubmit's own promise is pending;
          in practice they overlap completely when mutateAsync is used, but mutation.isPending
          is the semantically correct choice when TanStack Query is the submission layer.
          Do not combine both — pick one.
        */}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Creating...' : 'Create Post'}
        </Button>
      </form>
    </Form>
  )
}
```

---

## Optimistic updates

Use TanStack Query's `onMutate` / `onError` / `onSettled` lifecycle for optimistic updates when the mutated data lives in the TQ cache (fetched somewhere via `useQuery`). Multiple components that read the same query key see the optimistic value immediately — the cache is the single source of truth.

Use React's `useOptimistic` instead when the data is local state only (not cached), the update is confined to a single component, and you're using the `form action=` prop variant (where the action already runs inside a React transition).

### Full TanStack Query optimistic pattern

```tsx
'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { CreatePostSchema, type CreatePostInput } from '@/schemas/post'
import { createPost } from '@/app/posts/actions'

type Post = { id: string; title: string; slug: string }

export function CreatePostFormOptimistic() {
  const queryClient = useQueryClient()
  const form = useForm<CreatePostInput>({
    resolver: zodResolver(CreatePostSchema),
    mode: 'onBlur',
    defaultValues: { title: '', slug: '', content: '' },
  })

  const mutation = useMutation({
    mutationFn: (values: CreatePostInput) => createPost(values),

    // Step 1: Before the action fires — cancel in-flight refetches, snapshot, apply optimistic update.
    onMutate: async (newPost) => {
      // Awaiting cancelQueries is required. Without await, an in-flight refetch can
      // land after setQueryData and overwrite the optimistic value — a race condition.
      await queryClient.cancelQueries({ queryKey: ['posts'] })

      // Snapshot current cache value. This becomes the rollback target.
      const previousPosts = queryClient.getQueryData<Post[]>(['posts'])

      // Apply optimistic update. Use a temporary ID — server will assign the real one.
      queryClient.setQueryData<Post[]>(['posts'], (old = []) => [
        ...old,
        { id: `temp-${Date.now()}`, title: newPost.title, slug: newPost.slug },
      ])

      // Return context. If you forget to return, context is undefined in onError
      // and rollback silently fails — a common mistake.
      return { previousPosts }
    },

    // Step 2: Rollback on a thrown error (network failure, exception in mutationFn).
    // Note: onError does NOT fire when the action returns { ok: false } — that result
    // arrives in onSuccess as data, not a throw. Logical-failure rollback lives in onSuccess below.
    onError: (_err, _vars, context) => {
      if (context?.previousPosts !== undefined) {
        queryClient.setQueryData(['posts'], context.previousPosts)
      }
      form.setError('root', {
        type: 'server',
        message: 'Failed to create post. Changes reverted.',
      })
    },

    onSuccess: (result, _vars, context) => {
      if (!result.ok) {
        // Manual rollback — onError will not fire for { ok: false } returned as data.
        // Without this, the optimistic post stays in the cache after the user is shown errors.
        if (context?.previousPosts !== undefined) {
          queryClient.setQueryData(['posts'], context.previousPosts)
        }
        if (result.fieldErrors) {
          for (const [field, messages] of Object.entries(result.fieldErrors)) {
            form.setError(field as keyof CreatePostInput, {
              type: 'server',
              message: messages?.[0],
            })
          }
        }
        return
      }
      form.reset()
    },

    // Step 3: Always invalidate after settlement so the cache converges to server truth.
    // This fires on both success and error — the rollback in onError corrects the cache,
    // then invalidate triggers a fresh fetch to confirm.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] })
    },
  })

  async function onSubmit(values: CreatePostInput) {
    form.clearErrors('root')
    await mutation.mutateAsync(values)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* slug and content fields follow the same pattern */}
        {form.formState.errors.root?.message && (
          <p className="text-sm text-destructive" role="alert">
            {form.formState.errors.root.message}
          </p>
        )}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Creating...' : 'Create Post'}
        </Button>
      </form>
    </Form>
  )
}
```

### `useOptimistic` variant (form action prop, non-cached state)

`useOptimistic` is React 19's built-in alternative for UI-only optimistic state. No explicit rollback needed — React reverts the optimistic state automatically when the action's promise resolves (success or failure).

```tsx
'use client'

import { useOptimistic } from 'react'
import { addItem } from '@/app/actions/items'

type Item = { id: string; text: string; pending?: boolean }

export function ItemList({ items }: { items: Item[] }) {
  const [optimisticItems, addOptimisticItem] = useOptimistic(
    items,
    // Reducer: merges the action payload into current optimistic state
    (state: Item[], newItem: Item) => [...state, { ...newItem, pending: true }]
  )

  const formAction = async (formData: FormData) => {
    const text = formData.get('text') as string
    // addOptimisticItem updates optimisticItems immediately.
    // When formAction's promise resolves, React automatically reverts to the `items` prop.
    addOptimisticItem({ id: `temp-${Date.now()}`, text })
    await addItem(text)
  }

  return (
    <div>
      {optimisticItems.map((item) => (
        <div key={item.id} style={{ opacity: item.pending ? 0.5 : 1 }}>
          {item.text}
        </div>
      ))}
      <form action={formAction}>
        <input name="text" required />
        <button type="submit">Add</button>
      </form>
    </div>
  )
}
```

`useOptimistic` must be called inside an action (a function passed to `startTransition`, or a `form action=` prop, which is already a transition). It does not interact with the TQ cache — if multiple components display the same data, `useOptimistic` is the wrong tool.

---

## Alternative: `<form action={serverAction}>` + `useActionState`

**When to pick this pattern:**
- Progressive enhancement — the form must work before JavaScript hydrates.
- Simple CRUD forms with no cached data to optimistically update.
- You prefer React's built-in form state over TanStack Query.
- The form is embedded in or composed by a Server Component.

This pattern uses uncontrolled inputs and relies on the server action for validation. You lose RHF's field-level error highlighting before first submit, `isDirty` tracking, and real-time `isValid` state. That's an acceptable trade-off for simple forms; it's a poor trade-off for complex multi-field forms.

### Server Action (with `prevState` first argument)

`useActionState` wraps the action and prepends `prevState` as the first argument. The action must declare it even if it doesn't use the previous state.

```ts
'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

const CreateUserSchema = z.object({
  name:  z.string().min(2),
  email: z.string().email(),
})

export type CreateUserState = {
  ok?: boolean
  fieldErrors?: Partial<Record<string, string[]>>
  formError?: string
}

export async function createUserAction(
  prevState: CreateUserState,
  formData: FormData
): Promise<CreateUserState> {
  // Object.fromEntries drops $ACTION_* keys from Next.js serialization automatically
  // when Zod strips unknown keys (the default for z.object). No manual filtering needed.
  const raw = Object.fromEntries(formData)
  const parsed = CreateUserSchema.safeParse(raw)

  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('users').insert(parsed.data)
  if (error) {
    return { ok: false, formError: 'Failed to create user. Please try again.' }
  }

  revalidatePath('/users')
  return { ok: true }
}
```

### Client Component with `useActionState`

```tsx
'use client'

import { useActionState } from 'react'       // React 19 — imports from 'react', not 'next'
import { useFormStatus } from 'react-dom'    // must be called in a child of <form>
import { createUserAction, type CreateUserState } from '@/app/actions/create-user-action'

const initialState: CreateUserState = {}

// SubmitButton is a separate component because useFormStatus must be called
// inside a descendant of the <form>, not in the same component that renders it.
function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Saving...' : 'Create User'}
    </button>
  )
}

export function CreateUserForm() {
  // useActionState returns [state, formAction, pending].
  // formAction is a wrapped version of createUserAction — pass it to <form action>.
  // pending is true while the action is executing (same concept as mutation.isPending).
  const [state, formAction, pending] = useActionState(createUserAction, initialState)

  return (
    <form action={formAction} aria-busy={pending}>
      <div>
        <label htmlFor="name">Name</label>
        <input id="name" name="name" type="text" required />
        {state.fieldErrors?.name && (
          <p className="text-destructive text-sm" role="alert">
            {state.fieldErrors.name[0]}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required />
        {state.fieldErrors?.email && (
          <p className="text-destructive text-sm" role="alert">
            {state.fieldErrors.email[0]}
          </p>
        )}
      </div>

      {state.formError && (
        <p className="text-destructive text-sm" role="alert">
          {state.formError}
        </p>
      )}

      {state.ok && (
        <p className="text-sm text-green-600">User created successfully.</p>
      )}

      <SubmitButton />
    </form>
  )
}
```

**`useActionState` import:** from `'react'` — not `'next'`, not `'react-dom'`. This is a React 19 hook; projects on React 18 must use the deprecated `useFormState` from `'react-dom'` instead.

**`useFormStatus` import:** from `'react-dom'`. It must be called inside a component that is a descendant of the `<form>` element — which is why `SubmitButton` is a separate component. If the submit button is in the same component as the form, use `pending` from `useActionState` directly; don't use `useFormStatus` in that case.

**Progressive enhancement:** With `action={formAction}`, Next.js queues any submissions that arrive before hydration and processes them after. The form works without JavaScript — the browser does a full-page POST. After hydration, submissions no longer cause a page reload.

---

## Alternative: API Route Handler

**When to pick this pattern:**
- External consumers (mobile apps, third-party services, webhooks) need to call this endpoint.
- An OpenAPI/REST contract is required.
- The action is not tied to a first-party web form.

Do not use Route Handlers for first-party web forms. Server Actions are strictly better there: no manual `Content-Type` wiring, no manual `res.ok` checking, built-in CSRF protection via the Origin header check, and no HTTP status code interpretation.

### Route Handler with Zod validation

```ts
// src/app/api/posts/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { CreatePostSchema } from '@/schemas/post'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = CreatePostSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { errors: z.flattenError(parsed.error).fieldErrors },
      { status: 422 }
    )
  }

  const { data: post, error } = await supabase
    .from('posts')
    .insert({ ...parsed.data, author_id: user.id })
    .select('id, slug')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  revalidatePath('/posts')
  return NextResponse.json({ id: post.id, slug: post.slug }, { status: 201 })
}
```

**Key differences from Server Actions:**
- Caller must set `Content-Type: application/json` and `JSON.stringify` the body manually.
- Caller must check `res.ok` and parse error responses by status code.
- CSRF protection is not built-in — external callers are the point. For browser callers, rely on `SameSite=Lax` cookies. For webhook callers, validate a shared secret.
- Returns HTTP status codes; your `useMutation.mutationFn` must throw on non-2xx responses for `onError` to fire.

```tsx
// Client-side useMutation for a Route Handler
const mutation = useMutation({
  mutationFn: async (values: CreatePostInput) => {
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    if (!res.ok) {
      // Throw so onError receives the error object
      throw await res.json()
    }
    return res.json()
  },
  onSuccess: (data) => { /* data.id, data.slug */ },
  onError: (err) => { /* err.errors for 422, err.error for others */ },
})
```

---

## Submit-state and pending UX

Pick one source of pending truth per form. Do not combine them.

| Submission pattern | Pending signal | Import |
|---|---|---|
| RHF + `useMutation` (this KB's canonical pattern) | `mutation.isPending` | `useMutation` from `@tanstack/react-query` |
| RHF + direct `async function` (no TQ) | `form.formState.isSubmitting` | RHF `formState` |
| `form action=` + `useActionState` (same component as button) | `pending` (third tuple item from `useActionState`) | `useActionState` from `'react'` |
| `form action=` + `useFormStatus` (button in child component) | `useFormStatus().pending` | `useFormStatus` from `'react-dom'` |

When using the canonical RHF + `useMutation` pattern, `mutation.isPending` is the correct choice. `form.formState.isSubmitting` is true only for the duration of `handleSubmit`'s own async wrapper — which ends when `mutateAsync` resolves. In practice the windows overlap almost completely, but `mutation.isPending` is more semantically accurate: it reflects the full lifecycle of the TanStack Query mutation, including any retry attempts.

Always show a loading label alongside the disabled state. A disabled button with no visual change is confusing on slow connections.

```tsx
<Button type="submit" disabled={mutation.isPending}>
  {mutation.isPending ? 'Creating...' : 'Create Post'}
</Button>
```

---

## Server-side error surfacing

### Field-level errors

Server fieldErrors map directly to RHF via `setError`. They appear in `<FormMessage />` exactly like client-side validation errors.

```ts
// In onSuccess, after checking !result.ok
if (result.fieldErrors) {
  for (const [field, messages] of Object.entries(result.fieldErrors)) {
    form.setError(field as keyof FormValues, {
      type: 'server',         // 'type' is an arbitrary string — used for conditional styling
      message: messages?.[0] ?? 'Invalid value',
    })
  }
}
```

`shouldFocus: true` can be passed as a third argument to scroll to and focus the first erroring field:

```ts
form.setError('email', { type: 'server', message: 'Already in use' }, { shouldFocus: true })
```

### Form-level (root) errors

Auth failures, generic database errors, and rate-limit responses don't belong to a specific field. Set them on `'root'` and render them manually — `<FormMessage />` only renders field-level errors.

```ts
form.setError('root', { type: 'server', message: 'Something went wrong. Please try again.' })
// Namespaced variant (same effect, but namespaced for clarity):
form.setError('root.serverError', { type: 'server', message: '...' })
```

```tsx
{form.formState.errors.root?.message && (
  <p className="text-sm font-medium text-destructive" role="alert">
    {form.formState.errors.root.message}
  </p>
)}
```

### Error persistence and clearing

Server-injected errors (`type: 'server'`) persist across re-renders until:
- `form.clearErrors()` clears all errors, or `form.clearErrors('root')` clears just the root.
- A new `handleSubmit` call re-validates the form (field-level errors for re-validated fields are cleared; root errors are not).
- `form.reset()` resets to `defaultValues` and clears all errors.

Clear the root error at the start of each submit attempt to avoid stale error messages from a previous failed submission:

```ts
async function onSubmit(values: FormValues) {
  form.clearErrors('root')
  await mutation.mutateAsync(values)
}
```

### Toast vs. inline error

Use `toast.success` for successful outcomes, called in `onSuccess` after confirming `result.ok`. Use inline `setError` for actionable field or form errors the user must correct. Reserve `toast.error` for unexpected network-level failures that the user cannot directly fix — and even then, a root `setError` with a retry message is often better UX than a toast that disappears.

Do not call toast in `onSettled` — it fires on both success and error.

---

## Revalidation

`revalidatePath` and `revalidateTag` purge the Next.js Data Cache and Full Route Cache for the specified paths or tags. They must be called inside Server Actions or Route Handlers — never from Client Components.

**Placement rule:** Call revalidation AFTER the successful database write, BEFORE any `redirect()`. The `redirect()` call throws a `NEXT_REDIRECT` exception to signal the redirect to the framework — any code after it is unreachable.

```ts
// Correct order
await supabase.from('posts').insert(...)
revalidatePath('/posts')          // comes after write, before redirect
revalidatePath(`/posts/${slug}`)
redirect('/posts')                // throws — nothing after this runs
```

**`revalidateTag` in Next.js 16:** The second argument is required and names a cache life profile. The single-argument form is deprecated; current type definitions reject it.

```ts
revalidateTag('posts', 'max')    // correct — 'max' is a built-in profile (stale-while-revalidate)
revalidateTag('posts', { expire: 0 })  // immediate expiration (webhook-driven invalidation)
// revalidateTag('posts')        // deprecated in Next.js 16 — do not use
```

`'max'` is one of the built-in profile names; additional profile names come from the `cacheLife` config. Tags must be assigned at data-fetch time via `fetch(url, { next: { tags: ['posts'] } })` or `cacheTag('posts')` inside a `'use cache'` function. `revalidateTag` only affects fetches that were tagged — untagged fetches are unaffected.

| Scenario | Call |
|---|---|
| Single page has stale data | `revalidatePath('/posts')` |
| Dynamic route — all matching pages | `revalidatePath('/posts/[slug]', 'page')` |
| Layout and all children | `revalidatePath('/app', 'layout')` |
| Nuclear option (full cache bust) | `revalidatePath('/', 'layout')` |
| Cross-route tagged data (Next.js 16) | `revalidateTag('posts', 'max')` |

---

## CSRF protection

Server Actions have two built-in CSRF defenses — no manual CSRF token is required for first-party use:

1. **POST-only enforcement:** Server Actions only accept POST requests. CSRF attacks via `<img src>` or `<link href>` (which issue GET requests) are blocked at the framework level.
2. **Origin header check:** Next.js compares the request `Origin` header against the `Host` (or `X-Forwarded-Host`) header. A mismatch aborts the request before any action code runs.

For reverse-proxy or multi-domain deployments where the Origin and Host legitimately differ, add allowed origins to `next.config.js`:

```js
module.exports = {
  experimental: {
    serverActions: {
      allowedOrigins: ['my-proxy.com', '*.my-proxy.com'],
    },
  },
}
```

Server Action IDs are additionally encrypted and regenerated per build, and dead code elimination removes unused actions from the client bundle. These protections are additive — they do not replace proper authentication and authorization inside each action.

---

## Cross-references

| Topic | Document |
|---|---|
| Zod schema authoring, composition, branded types, coercion | FORM_KB_1 |
| Specialized inputs: `Controller` wrapper for Combobox, DatePicker, rich text, radio groups | FORM_KB_4 |
| Multi-step wizard state (multi-page forms) | FORM_KB_3 |
| File upload via Supabase Storage (do not cover file uploads here) | SB_KB_7 |
| Auth in Server Actions: `getUser()` vs `getClaims()`, session context | AUTH_KB_4 |
| `createClient()` setup for Server Components and Server Actions | AUTH_KB_4 |
| `useQuery`, `QueryClient` setup, queryKey conventions | Project TQ patterns (if KB exists) |
| shadcn/ui component catalog — `Input`, `Textarea`, `Select`, `Button` | UI_KB_0_Index |
