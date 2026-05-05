# FORM_KB_4 — Specialized Input Wiring

**Stack-locked: react-hook-form + Zod + shadcn/ui + Next.js App Router. Specialized input wiring.**

---

## Pattern

Most form inputs can use `register()` directly. Specialized inputs — components that do not expose a native `ref` or do not emit a standard `onChange(event)` — require `Controller`. This KB covers the common cases: date pickers, dynamic lists, multi-select, rich text, autocomplete, number/currency, masked inputs, and toggle/radio/checkbox groups.

All patterns here assume a parent form configured per FORM_KB_2 (submission pipeline, `useActionState`, error mapping). Zod schema architecture belongs to KB_1 — this file shows only the field-level slices.

---

## When to Use / When to Skip

**Use `Controller`** when the target component:
- Uses a non-standard value prop (`checked`, `onValueChange`, `onCheckedChange`).
- Is a third-party component that does not accept or forward a `ref` to the underlying input element.
- Maintains its own internal state that must be synchronized with RHF (Tiptap, react-imask).
- Needs to store a transformed value (ISO string from a Date object, integer cents from a decimal string).

**Use `register()` directly** for native `<input>`, `<textarea>`, and `<select>` elements. Do not reach for `Controller` out of habit — it adds overhead.

**Skip this KB** for standard text, email, and password fields (covered in FORM_KB_2), wizard step management (FORM_KB_3), and file upload implementation (SB_KB_7).

---

## Anti-Patterns

**Spreading `{...register(name)}` on a non-native component.**
shadcn `Switch`, `RadioGroup`, `Select`, and `Checkbox` do not accept the `ref`/`onChange(event)` shape that RHF emits. Spreading `{...register()}` silently passes wrong props; validation and dirty tracking break. Use `Controller` and map props explicitly.

**Defining `defaultValues` per-field or leaving fields as `undefined`.**
When a field's initial value is `undefined`, React logs "A component is changing an uncontrolled input to be controlled" the moment the first value arrives. Fix this at the `useForm` level — every field must have an explicit empty value (`""`, `[]`, `false`, `0`). Never rely on `Controller`'s `defaultValue` prop as the primary mechanism.

**Calling `setValue(name, value)` without `shouldValidate: true`.**
`setValue` without options does not re-run validation. If a button auto-fills a field and the user then submits, the schema may reject the value while the UI shows no error. For any programmatic update that should behave like user input, pass `{ shouldDirty: true, shouldValidate: true, shouldTouch: true }`.

**Tiptap with `immediatelyRender: true` (the default) in App Router.**
The Tiptap editor uses browser DOM APIs at render time. In Next.js App Router, the component renders on the server during hydration before the browser environment is available — this produces React hydration error #418. `immediatelyRender: false` is non-negotiable.

**Server-side DOMPurify with happy-dom.**
DOMPurify maintainers explicitly flag happy-dom as unsafe for sanitization. It does not provide a sufficiently complete DOM environment. Use jsdom, or switch to `sanitize-html` which has no DOM dependency.

**Storing money as floats.**
`12.34 * 100` evaluates to `1233.9999...` in JavaScript. Store currency as integer cents; use `Math.round()` when converting; use `dinero.js` or `Decimal.js` for complex math.

**`react-imask` `onChange` and bare `ref`.**
react-imask explicitly warns against using `onChange` — it fires on every character including invalid mask states. Use `onAccept` instead. For ref forwarding, use `inputRef={field.ref}`, not `ref={field.ref}` — the component's outer `ref` points to the mask instance, not the input element.

**Storing a `Date` object from the Calendar in RHF state without serialization.**
`Date` objects are not safe to pass through Server Actions (FormData serializes them via locale-dependent `.toString()`). Store as ISO string; convert at the component boundary.

---

## Controller Fundamentals

`Controller` is a thin wrapper around `useController`. It delegates entirely to that hook and exposes the result via a render prop.

```tsx
<Controller
  name="fieldName"          // required — dot-path for nested fields
  control={form.control}    // required — from useForm()
  // defaultValue is a fallback; prefer setting defaultValues in useForm for all fields
  render={({ field, fieldState, formState }) => (
    // field: { onChange, onBlur, value, name, ref }
    // fieldState: { isTouched, isDirty, invalid, error }
    <YourComponent
      value={field.value}
      onChange={field.onChange}
      onBlur={field.onBlur}
      ref={field.ref}         // omit if the component does not support ref
    />
  )}
/>
```

shadcn wraps `Controller` inside `FormField`, which also provides context for `FormMessage` and `FormDescription`. Prefer `FormField` over bare `Controller` when using shadcn form components.

```tsx
<FormField
  control={form.control}
  name="fieldName"
  render={({ field, fieldState }) => (
    <FormItem>
      <FormLabel>Label</FormLabel>
      <FormControl>
        {/* field props mapped to component here */}
      </FormControl>
      <FormMessage />   {/* auto-renders fieldState.error.message */}
    </FormItem>
  )}
/>
```

**`setValue` for programmatic updates:**

```typescript
// Bare set — does not mark dirty, does not re-run validation
form.setValue("amount", 1234)

// Full behavioral set — behaves as if the user typed the value
form.setValue("amount", 1234, {
  shouldDirty: true,
  shouldValidate: true,
  shouldTouch: true,
})
```

Use `setValue` only outside of a `Controller` render prop — inside the render, use `field.onChange`. Use `field.ref` to forward focus management so RHF can scroll-to and focus the field on validation errors. For components with a non-standard ref prop (e.g., `inputRef`), pass `field.ref` via that prop.

---

## Date / Time Picker

**Recommended primitive:** shadcn `Calendar` inside a `Popover`. shadcn's `Calendar` wraps react-day-picker v9.

**Install:** react-day-picker v9 ships as a direct dependency of shadcn — no separate install. For the experimental `timeZone` prop: `npm install @date-fns/tz`.

**Zod schema:**

```typescript
// Recommended: store as ISO string — safe for Server Actions and FormData serialization
const schema = z.object({
  appointmentDate: z.iso.datetime({ offset: true }),
  // offset: true permits +02:00 style offsets in addition to Z
})

// Date-only (no time component):
const schema = z.object({
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
})

// z.coerce.date() — calls new Date(input) internally; converts ISO strings to Date objects.
// Lightly documented in Zod v4; widely used but treat as implementation-stable, not spec-stable.
const schema = z.object({
  appointmentDate: z.coerce.date(),
})
```

**Controller wrapper:**

```tsx
import { format } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

<FormField
  control={form.control}
  name="appointmentDate"
  render={({ field }) => (
    <FormItem className="flex flex-col">
      <FormLabel>Appointment Date</FormLabel>
      <Popover>
        <PopoverTrigger asChild>
          <FormControl>
            <Button variant="outline" className="w-full justify-start font-normal">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {field.value
                ? format(new Date(field.value), "PPP")
                : "Pick a date"}
            </Button>
          </FormControl>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={field.value ? new Date(field.value) : undefined}
            onSelect={(date) => field.onChange(date ? date.toISOString() : "")}
            // timeZone is experimental in react-day-picker v9 — requires @date-fns/tz
            // Without it, selecting near midnight can highlight the wrong day due to UTC offset
            timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
          />
        </PopoverContent>
      </Popover>
      <FormMessage />
    </FormItem>
  )}
/>
```

**Gotchas:**

- **Timezone offset bug.** Without `timeZone`, selecting "the 20th" near midnight can highlight "the 19th" because react-day-picker compares dates in UTC. The `timeZone` prop fixes this but requires `@date-fns/tz` and is marked experimental in v9; v10 behavior is not yet stable.
- **`useInput` is gone.** react-day-picker v8's `useInput` hook was removed in v9. Use `date-fns` `parse`/`format`/`isValid` directly in the input-driven variant.
- **`fromDate`/`toDate`/`fromMonth`/`toMonth`/`fromYear`/`toYear` are gone.** For navigation bounds, use `startMonth` and `endMonth`. To also hide individual out-of-range days, combine with the `hidden` prop using a `before` or `after` matcher: `<Calendar startMonth={new Date()} hidden={{ before: new Date() }} />`. Use `disabled` (with a function or matcher) only when you want to block selection while still allowing navigation past the boundary.
- **Date-of-birth inputs.** Use `captionLayout="dropdown"` for month/year dropdowns instead of arrow navigation.
- **Time picking.** react-day-picker does not include time selection. Add a separate `<input type="time">` field or use the shadcn "Time Picker" variant (a custom component, not in shadcn core).
- **Server Action serialization.** `Date` objects passed through FormData become locale-dependent strings. Store as ISO string throughout; convert at the component boundary only.

---

## useFieldArray — Dynamic Lists

**Recommended primitive:** `useFieldArray` from react-hook-form. Compose with any input inside each row.

**Zod schema:**

```typescript
const schema = z.object({
  lineItems: z.array(
    z.object({
      description: z.string().min(1, "Required"),
      quantity:    z.coerce.number().int().positive(),
      unitPrice:   z.coerce.number().positive().multipleOf(0.01),
    })
  ).min(1, "At least one line item is required"),

  // Primitive arrays must be wrapped in objects — useFieldArray requires object-shaped items
  emails: z.array(z.object({ value: z.string().email() })),
})
```

**Controller wrapper:**

```tsx
const { fields, append, remove, move } = useFieldArray({
  control: form.control,
  name: "lineItems",
  // Use a non-default keyName when your data objects have their own `id` field
  // to avoid the auto-generated key overwriting your database ID
  keyName: "fieldId",
})

return (
  <div className="flex flex-col gap-4">
    {fields.map((field, index) => (
      // Use field[keyName] as the React key — never index (breaks on reorder)
      <div key={field.fieldId} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-start">
        <FormField
          control={form.control}
          name={`lineItems.${index}.description`}
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input {...field} placeholder="Description" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`lineItems.${index}.quantity`}
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input {...field} type="number" min={1} className="w-20" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`lineItems.${index}.unitPrice`}
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input {...field} type="number" step="0.01" min={0} className="w-28" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
          <TrashIcon className="h-4 w-4" />
        </Button>
      </div>
    ))}

    {/* Array-level error (e.g., min(1) violated) */}
    {form.formState.errors.lineItems?.root && (
      <p className="text-sm text-destructive">
        {form.formState.errors.lineItems.root.message}
      </p>
    )}

    <Button
      type="button"
      variant="outline"
      onClick={() => append({ description: "", quantity: 1, unitPrice: 0 })}
    >
      Add Line Item
    </Button>
  </div>
)
```

**Full API surface:** `append`, `prepend`, `remove`, `insert`, `swap`, `move`, `update`, `replace`. Each method from `useFieldArray` is stable and available in RHF v7.

**Gotchas:**

- **`keyName` collision.** If your row objects have a database `id` field, the default `keyName: "id"` overwrites it in the `fields` array. Set `keyName` to anything else (`"fieldId"`, `"key"`) and use `field[keyName]` as the React key.
- **Nested error access.** Per-item errors are at `form.formState.errors.lineItems?.[index]?.description?.message`. Array-level errors (from `.min()`) are at `form.formState.errors.lineItems?.root?.message` or `form.formState.errors.lineItems?.message` depending on RHF version.
- **Provide defaults on `append`.** `append({ description: "", quantity: 1, unitPrice: 0 })` — every field in the nested schema must have a value. Omitting a field triggers uncontrolled-to-controlled warnings on the first render of that row.
- **Performance.** `append` and `remove` re-render only the affected row. `move` and `swap` still re-render the entire list. For lists above ~100 rows, consider virtualization (e.g., `@tanstack/react-virtual`).
- **`shouldFocus` on append.** By default `append` focuses the newly added row. Pass `append(data, { shouldFocus: false })` for programmatic appends (e.g., bulk import).
- **Computed totals.** Read the array value via `useWatch({ control, name: "lineItems" })` — it subscribes only to that slice and avoids full form re-renders on every keystroke.

---

## Multi-Select / Combobox

**Recommended primitive:** shadcn Combobox. The shadcn docs now offer two implementations side-by-side — the older `Popover` + `Command` (cmdk) composition shown here, and a newer Base UI-backed component with its own primitives (`ComboboxInput`, `ComboboxContent`, `ComboboxList`, `ComboboxItem`). The component APIs differ; check what `npx shadcn@latest add combobox` actually installs into your project before copying the code below verbatim. The Controller-wrapping concept is identical either way — only the JSX shape changes.

**Zod schema:**

```typescript
const schema = z.object({
  // Single select — string
  category: z.string().min(1, "Required"),

  // Multi-select — string array
  tags: z.array(z.string()).min(1, "Select at least one tag"),

  // Constrained to known values
  roles: z.array(z.enum(["admin", "editor", "viewer"])).min(1),
})
```

**Controller wrapper — static options:**

```tsx
import { Check, ChevronsUpDown } from 'lucide-react'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

// Multi-select combobox — field.value is string[]
function MultiSelectCombobox({
  field,
  options,
}: {
  field: ControllerRenderProps<any, any>
  options: { value: string; label: string }[]
}) {
  const [open, setOpen] = useState(false)
  const selected: string[] = field.value ?? []

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between">
          {selected.length > 0
            ? `${selected.length} selected`
            : "Select options..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => {
                    const next = selected.includes(option.value)
                      ? selected.filter((v) => v !== option.value)
                      : [...selected, option.value]
                    field.onChange(next)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", selected.includes(option.value) ? "opacity-100" : "opacity-0")} />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
```

**Async-loaded options via TanStack Query:**

```tsx
function AsyncMultiSelectCombobox({ field }: { field: ControllerRenderProps<any, any> }) {
  const [open, setOpen] = useState(false)
  const [inputValue, setInputValue] = useState("")
  const debouncedInput = useDebounce(inputValue, 300)

  const { data: options = [], isLoading } = useQuery({
    queryKey: ["options", debouncedInput],
    queryFn: () => fetchOptions(debouncedInput),
    // Avoid querying on empty string — set threshold to match UX expectations
    enabled: debouncedInput.length >= 2,
  })

  const selected: string[] = field.value ?? []

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox">
          {selected.length > 0 ? `${selected.length} selected` : "Search..."}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={inputValue}
            onValueChange={setInputValue}
            placeholder="Type to search..."
          />
          <CommandList>
            {isLoading && <CommandEmpty>Loading...</CommandEmpty>}
            {!isLoading && options.length === 0 && (
              <CommandEmpty>No results.</CommandEmpty>
            )}
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => {
                    const next = selected.includes(option.value)
                      ? selected.filter((v) => v !== option.value)
                      : [...selected, option.value]
                    field.onChange(next)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", selected.includes(option.value) ? "opacity-100" : "opacity-0")} />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
```

**Gotchas:**

- **`shouldFilter={false}` for async.** When options are server-filtered, pass `shouldFilter={false}` to `Command` so cmdk does not apply its own client-side filter on top of the already-filtered results.
- **Store value, not label.** Store the ID or slug in RHF state. Reconstruct the display label from the options array for rendering. Never store the label string in the field.
- **Default values.** Multi-select must default to `[]`, not `undefined`. Single-select must default to `""`.
- **Validation of async selections.** TanStack Query loading state does not block form submission. If the valid set of options is security-sensitive, validate server-side in the Server Action; client-side Zod can only validate format, not membership.

---

## Rich Text (Tiptap)

**Install:**

```bash
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit
```

StarterKit bundles: Blockquote, BulletList, CodeBlock, Heading, HorizontalRule, OrderedList, BoldItalicStrike, Code, Link, History, and utility extensions. Add individual extensions as needed.

**Zod schema:**

```typescript
// HTML storage — guard against the empty-paragraph false-positive
const schema = z.object({
  body: z.string()
    .min(1, "Content required")
    .refine((val) => val !== "<p></p>", "Content required"),
})

// JSON storage (ProseMirror document — preferred for re-editing fidelity)
const schema = z.object({
  body: z.object({ type: z.string(), content: z.array(z.unknown()) }),
})
```

**Controller wrapper:**

```tsx
// components/rich-text-editor.tsx
'use client'  // required — Tiptap uses browser DOM APIs

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect } from 'react'
import type { ControllerRenderProps } from 'react-hook-form'

interface RichTextEditorProps {
  field: ControllerRenderProps<any, any>
  placeholder?: string
}

export function RichTextEditor({ field }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: field.value || "",
    // NON-NEGOTIABLE for Next.js App Router — prevents React hydration error #418.
    // Tiptap accesses browser DOM APIs at initialization; without this flag the editor
    // attempts to render during SSR/hydration before the DOM is available.
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      field.onChange(editor.getHTML())
      // Switch to editor.getJSON() if storing as ProseMirror JSON
    },
  })

  // Sync external value changes — form.reset() updates field.value but not the editor
  useEffect(() => {
    if (editor && field.value !== editor.getHTML()) {
      editor.commands.setContent(field.value || "", false)
    }
  }, [editor, field.value])

  return (
    <div className="rounded-md border border-input bg-background">
      {/* Toolbar goes here if needed */}
      <EditorContent
        editor={editor}
        onBlur={field.onBlur}
        className="prose prose-sm max-w-none p-3 focus-within:outline-none"
      />
    </div>
  )
}
```

```tsx
// In form:
<FormField
  control={form.control}
  name="body"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Content</FormLabel>
      <FormControl>
        <RichTextEditor field={field} />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

**HTML vs JSON storage trade-off:**

| | HTML (`getHTML()`) | JSON (`getJSON()`) |
|---|---|---|
| Column type | `text` | `jsonb` |
| Rendering | `dangerouslySetInnerHTML` + sanitize, or any HTML renderer | `generateHTML(json, extensions)` from `@tiptap/html` in a Server Component |
| XSS surface | Must sanitize on every write and read path | No HTML until render time; sanitize only when converting to HTML |
| Editor migration | Fragile — extension changes may not parse old HTML correctly | More portable; ProseMirror schema is versioned |

**Recommendation:** JSON for new builds where re-editing is needed. HTML for simpler stacks where non-Tiptap HTML rendering is sufficient.

**Server-side sanitization:**

```typescript
// Option A: DOMPurify + jsdom (battle-tested; larger dependency)
// DO NOT substitute happy-dom — DOMPurify maintainers explicitly flag it as unsafe
import { JSDOM } from 'jsdom'
import DOMPurify from 'dompurify'

const window = new JSDOM('').window
const purify = DOMPurify(window as unknown as Window)
const clean = purify.sanitize(htmlString)

// Option B: sanitize-html (no DOM dependency — simpler for Next.js server contexts)
import sanitizeHtml from 'sanitize-html'
const clean = sanitizeHtml(htmlString, {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat(['h1', 'h2']),
  allowedAttributes: { a: ['href', 'target', 'rel'] },
})
```

**Gotchas:**

- **`immediatelyRender: false` is non-negotiable.** Omitting it causes hydration error #418 in App Router. Always set it.
- **`'use client'` on the editor component.** The editor component cannot be a Server Component. Keep it as a leaf client component and pass the `field` object down from a parent `FormField`.
- **`form.reset()` sync.** Tiptap state is external to RHF. When `form.reset()` fires, `field.value` changes but the editor does not update automatically. The `useEffect` above handles this.
- **Empty state.** `editor.getHTML()` on an empty editor returns `"<p></p>"`, not `""`. The Zod `.refine()` guard is required if you want empty to fail validation.
- **Server-side rendering of stored content.** To render stored Tiptap JSON back to HTML in a Server Component, use `generateHTML(json, extensions)` from `@tiptap/html` — this runs without a browser.
- **XSS.** Always sanitize on write (Server Action or Route Handler) when storing HTML. If storing JSON, sanitize only when converting JSON to HTML for display.

---

## Autocomplete

**Recommended primitive:** shadcn Combobox (same building blocks as multi-select above) in single-select mode with TanStack Query for async data. The key difference from multi-select: the field stores the selected entity's ID, not its display label.

**Zod schema:**

```typescript
// Enforced selection — must be a valid entity ID
const schema = z.object({
  userId: z.string().uuid("Must select a valid user"),
})

// Free-text with suggestions (selection not enforced)
const schema = z.object({
  city: z.string().min(1, "Required"),
})
```

**Controller wrapper:**

```tsx
function UserAutocomplete({ field }: { field: ControllerRenderProps<any, any> }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const debouncedQuery = useDebounce(query, 300)

  const { data: users = [] } = useQuery({
    queryKey: ["users-search", debouncedQuery],
    queryFn: () => searchUsers(debouncedQuery),
    enabled: debouncedQuery.length >= 1,
  })

  // Resolve display label from current ID — for showing selected value in trigger
  const selectedLabel = users.find((u) => u.id === field.value)?.name
    ?? (field.value ? "Loading..." : "Select a user...")

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between">
          {selectedLabel}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search users..."
          />
          <CommandList>
            <CommandEmpty>No users found.</CommandEmpty>
            <CommandGroup>
              {users.map((user) => (
                <CommandItem
                  key={user.id}
                  value={user.id}
                  onSelect={(id) => {
                    field.onChange(id)
                    setOpen(false)
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", field.value === user.id ? "opacity-100" : "opacity-0")} />
                  {user.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
```

**Gotchas:**

- **Store ID, not label.** The RHF field holds the entity ID. The display label is derived locally from the options list. If the selected entity is not in the current query results (e.g., page load with a pre-filled value), fetch it separately or accept the "Loading..." fallback.
- **`enabled: query.length >= 1`** — prevent empty-string queries. Tune the threshold based on dataset size; 2 is common for large datasets.
- **Stale trigger label.** When the popover closes after selection, the query resets but the trigger must show the selected label. Keep a local reference or use `keepPreviousData: true` to retain the last result set.

---

## Number / Currency

**Recommended primitive:** Native `<Input type="number">` for whole numbers. For currency display, `<Input type="text" inputMode="decimal">` gives better mobile keyboard UX (no spinner arrows, numeric decimal keyboard on mobile).

Store currency as **integer cents**. Do complex currency arithmetic with `bigint`, `Decimal.js`, or `dinero.js` — see BILL_KB (future) for the full pattern.

**Zod schema:**

```typescript
// Integer input — quantity, count
const schema = z.object({
  quantity: z.coerce.number().int().positive().max(10_000),
})

// Currency — user types decimal, store as integer cents via transform
const schema = z.object({
  amount: z.coerce.number()
    .positive()
    .multipleOf(0.01)
    .transform((val) => Math.round(val * 100)),
})

// Pre-stored cents displayed as dollars
const schema = z.object({
  amountCents: z.coerce.number().int().nonnegative().max(999_999_999),
})
```

**Controller wrapper (currency):**

```tsx
<FormField
  control={form.control}
  name="amountCents"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Amount</FormLabel>
      <FormControl>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
          <Input
            type="text"
            inputMode="decimal"
            className="pl-7"
            // field.value is cents (integer); display as dollars
            value={field.value != null ? (field.value / 100).toFixed(2) : ""}
            onChange={(e) => {
              const parsed = parseFloat(e.target.value)
              field.onChange(isNaN(parsed) ? 0 : Math.round(parsed * 100))
            }}
            onBlur={field.onBlur}
          />
        </div>
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

**Gotchas:**

- **Always `z.coerce.number()`, never `z.number()`, for `input[type=number]` values.** Native number inputs return strings from FormData. `z.number()` rejects strings.
- **`NaN` from empty input.** `parseFloat("")` returns `NaN`. Guard with `isNaN()` or use `.optional()` on the schema and convert `undefined`/`NaN` at the boundary.
- **`Math.round()` for cents conversion.** `12.34 * 100 = 1233.9999...` in floating-point. Always wrap with `Math.round()`.
- **`type="number"` UX.** Browsers add spinner arrows; mobile keyboards vary. `type="text" inputMode="decimal"` gives a cleaner UX for currency and removes the spinner. Both pass numeric values to the handler.

---

## Phone / Address / SSN with Masking

**Recommended primitives:**
- Phone: `react-imask` (`IMaskInput` component) + `libphonenumber-js` for validation.
- SSN: `react-imask` with pattern `000-00-0000`.
- Address: No masking — standard inputs; add Google Places autocomplete if auto-fill is needed.

**Install:**

```bash
npm install react-imask libphonenumber-js
```

**Zod schema:**

```typescript
import { isValidPhoneNumber } from 'libphonenumber-js'

const schema = z.object({
  // Store E.164 (+12125551234), display masked
  phone: z.string()
    .min(1, "Required")
    .refine((val) => isValidPhoneNumber(val), "Invalid phone number"),

  // Store 9-digit string (no dashes), display masked
  ssn: z.string().regex(/^\d{9}$/, "Invalid SSN"),
})
```

**Controller wrapper — US phone:**

```tsx
import { IMaskInput } from 'react-imask'

<FormField
  control={form.control}
  name="phone"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Phone</FormLabel>
      <FormControl>
        <IMaskInput
          mask="+{1} (000) 000-0000"
          // Use onAccept, NOT onChange.
          // onChange fires on every character including invalid mask states.
          // onAccept fires only when the mask accepts the value.
          onAccept={(_maskedValue, mask) => {
            // Store E.164 in form state — unmasked is the digit string
            const digits = mask.unmaskedValue
            field.onChange(digits ? `+1${digits}` : "")
          }}
          onBlur={field.onBlur}
          // Use inputRef, NOT ref.
          // The bare ref prop on IMaskInput points to the mask instance; inputRef forwards to the <input> element.
          inputRef={field.ref}
          placeholder="+1 (555) 000-0000"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

**Gotchas:**

- **`onAccept` not `onChange`.** react-imask explicitly warns: do not use `onChange`. `onAccept` fires only when the mask considers the value valid and complete enough to accept.
- **`inputRef` not `ref`.** `IMaskInput`'s `ref` prop is the mask controller instance. `inputRef` is the forwarded ref to the underlying `<input>` element — required for RHF focus management.
- **Store unmasked.** Store phone as E.164 (`+12125551234`) and SSN as 9 digits (`123456789`). Display masking is presentation-only.
- **libphonenumber-js bundle size.** The default export is large. Use `libphonenumber-js/min` (no metadata for less common formats) or `libphonenumber-js/mobile` for lighter client bundles. Import the full build in Server Action validation only.
- **SSN sensitivity.** Never log SSN values. Store in an encrypted column. The mask pattern `000-00-0000` with `unmask={true}` passes the raw 9-digit string to `onAccept`.

---

## Toggle / Radio / Checkbox Group

**Recommended primitives:**
- Boolean toggle: shadcn `Switch`
- Single selection from N options: shadcn `RadioGroup` + `RadioGroupItem`
- Multiple boolean selections: shadcn `Checkbox`, one `Controller` per checkbox when backing as `string[]`

**Zod schema:**

```typescript
const schema = z.object({
  isActive: z.boolean(),
  // z.literal("yes") vs z.boolean(): use boolean for Switch (native boolean component);
  // use literal or enum when the value originates from an HTML radio/checkbox (always a string).
  consent: z.literal("yes", { error: "You must agree to continue" }),
  notificationType: z.enum(["email", "sms", "push"]),
  permissions: z.array(z.enum(["read", "write", "delete"])).min(1),
})
```

**Controller wrappers:**

```tsx
// Switch — boolean
<FormField
  control={form.control}
  name="isActive"
  render={({ field }) => (
    <FormItem className="flex items-center gap-3">
      <FormControl>
        {/* Switch uses checked/onCheckedChange, not value/onChange */}
        <Switch
          checked={field.value}
          onCheckedChange={field.onChange}
          onBlur={field.onBlur}
          ref={field.ref}
        />
      </FormControl>
      <FormLabel className="!mt-0">Active</FormLabel>
    </FormItem>
  )}
/>

// RadioGroup — string enum
<FormField
  control={form.control}
  name="notificationType"
  render={({ field }) => (
    <FormItem>
      <FormLabel>Notification Type</FormLabel>
      <FormControl>
        <RadioGroup
          value={field.value}
          onValueChange={field.onChange}
          onBlur={field.onBlur}
          className="flex flex-col gap-2"
        >
          {[
            { value: "email", label: "Email" },
            { value: "sms",   label: "SMS" },
            { value: "push",  label: "Push notification" },
          ].map((option) => (
            <div key={option.value} className="flex items-center gap-2">
              <RadioGroupItem value={option.value} id={`notif-${option.value}`} />
              <Label htmlFor={`notif-${option.value}`}>{option.label}</Label>
            </div>
          ))}
        </RadioGroup>
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>

// Checkbox group — string[] array, one FormField per option
{permissionOptions.map((perm) => (
  <FormField
    key={perm.value}
    control={form.control}
    name="permissions"
    render={({ field }) => (
      <FormItem className="flex items-center gap-2">
        <FormControl>
          <Checkbox
            checked={(field.value as string[])?.includes(perm.value)}
            onCheckedChange={(checked) => {
              const current: string[] = field.value ?? []
              field.onChange(
                checked
                  ? [...current, perm.value]
                  : current.filter((v) => v !== perm.value)
              )
            }}
            ref={field.ref}
          />
        </FormControl>
        <FormLabel className="!mt-0">{perm.label}</FormLabel>
      </FormItem>
    )}
  />
))}
```

**Gotchas:**

- **`Switch` prop mapping.** `Switch` uses `checked`/`onCheckedChange`. Spreading `{...field}` passes `value`/`onChange` and is silently wrong — the switch will not reflect form state.
- **`RadioGroup` uses `value`/`onValueChange`** (string). Always provide a non-undefined `defaultValues` entry: `notificationType: "email"`, not `undefined`.
- **Multiple `FormField` with the same `name` is safe.** Each checkbox registers to the same field; each `onCheckedChange` updates the array slice. RHF handles concurrent updates to the same field reference correctly.
- **FormData checkbox behavior.** HTML checkboxes submit `"on"` when checked and omit the field when unchecked. For Server Actions that parse `FormData` directly, use `z.preprocess((val) => val === "on", z.boolean())`. For JSON-based actions, this is not an issue.

---

## File Uploads

File uploads use a hidden `<input type="file" ref={field.ref} />` wrapped in a `Controller`. Apply client-side guards (file size, MIME type) via Zod `.refine()` or in the `onChange` handler before storing the `File` object in state. For the upload itself — signed URLs, resumable uploads, Supabase Storage client configuration — defer entirely to SB_KB_7. Do not attempt to pass `File` objects through Server Actions directly; upload to storage first and submit the resulting URL or path.

---

## Cross-References

- **KB_1** — Zod schema architecture: `z.discriminatedUnion`, cross-field validation, schema composition, reuse patterns. This file covers only input-specific coercions (`z.coerce.number()`, `z.iso.datetime()`, `z.array()`).
- **FORM_KB_2** — Canonical submission pipeline: Server Action wiring, `useActionState`, optimistic updates, server error mapping to fields. All patterns here assume a parent form from FORM_KB_2.
- **FORM_KB_3** — Wizard/multi-step forms: step state management, partial per-step validation, shared `useFieldArray` state across steps.
- **SB_KB_7** — File uploads end-to-end: Supabase Storage client, signed URLs, resumable uploads, RLS for storage buckets. One paragraph is shown here; the full implementation lives there.
