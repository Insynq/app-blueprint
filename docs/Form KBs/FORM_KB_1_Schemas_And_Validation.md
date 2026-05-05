# FORM_KB_1 — Zod Schemas and Validation

**Stack-locked: Zod v4 + TypeScript. Schema authoring concepts are portable.**

---

## Pattern

One Zod schema, defined once, imported by both the client form component and the server action. The schema is the contract. Drift between client-side and server-side validation is one of the most common form bugs in Next.js apps — the client accepts a value the server rejects (silent failure), or the server accepts a shape the client never sends (dead validation). The fix is structural: keep schemas in `src/schemas/`, mark no directive on those files, and import them freely from `'use client'` components and `'use server'` actions alike. Zod has no browser or Node.js dependencies; it is safe on both sides of the boundary.

Always use `safeParse` on user input. `parse` throws a `ZodError` on failure; `safeParse` returns `{ success: true, data }` or `{ success: false, error }`. In a server action handling untrusted form input, a thrown error will surface as an unhandled rejection. Use `safeParse`, check `.success`, and return field errors. Never access `.data` without checking `.success` first — this is a type error and a runtime bug.

---

## When to use / when to skip

**Use Zod schemas when:**
- A user submits any form, regardless of whether validation is also done client-side with React Hook Form.
- A server action receives `FormData` or a JSON body from any caller.
- TypeScript types for form values need to be derived from validation rules (use `z.infer<typeof Schema>`), keeping the type and the validator in sync automatically.
- A wizard collects data across multiple steps and validates each step independently before merging for final submission (see KB_3 for wizard mechanics).

**Skip or simplify when:**
- A server action accepts a single well-typed argument from a trusted internal call path (not user-submitted `FormData`). Still validate at the boundary — skip only when the caller is your own code and the path is not user-reachable.
- A read-only API that accepts no user input has nothing to validate.

---

## Anti-patterns

**Defining schemas inside components.** Every render re-creates the schema object. Zod schema construction is cheap but not free, and more critically this pattern makes it impossible to share the schema with the server action — the schema lives inside the component closure and cannot be imported elsewhere. Always define schemas at module scope in `src/schemas/`.

**Separate client and server schemas.** Two files, two objects, two places to forget to update. Client validates `amount` as optional; server requires it. A user submits a form that passes client validation and gets an opaque server error. Single source of truth prevents this class of bug entirely.

**Trusting the parse result without checking `.success`.** TypeScript will not catch `result.data` access when `result.success` is `false` unless you narrow correctly. Always branch on `.success`.

**Using `z.any()` or `z.unknown()` to satisfy TypeScript.** These produce no validation. If you are reaching for them, the right solution is either a proper schema for the shape, or `z.record(z.string(), z.unknown())` for a map of unknown values that at least constrains the key type.

**Calling `.parse()` on a schema that has async refinements.** It throws at runtime — there is no silent skip. Any schema that uses an async `.refine()` or async `.transform()` must be parsed with `.safeParseAsync()` or `.parseAsync()`.

**Using `z.string().email()` in new code.** The instance-method form is deprecated in v4 and will be removed in v5. Use top-level `z.email()`. Same applies to `z.string().uuid()`, `z.string().url()`, and all other format validators that now live at the top level.

**Using `z.nativeEnum()`.** Deprecated in v4. Use `z.enum(NativeEnum)` — the overloaded form accepts TypeScript enums directly.

**Using `.merge()` on objects.** Deprecated in v4. Prefer `.extend()` or spread syntax (`z.object({ ...A.shape, ...B.shape })`).

**Using `z.record()` with a single argument.** Removed in v4. Pass both key and value schemas: `z.record(z.string(), z.string())`.

If you encounter older code using `message` in error options — `{ message: "Too short" }` — that is the v3 form. In v4 the key is `error`. The v3 form is silently deprecated and will fail in v5.

---

## Canonical schemas

A standard form schema for a server action lives in `src/schemas/` with no directive and exports both the schema and the inferred type.

```typescript
// src/schemas/invoice.schema.ts
import { z } from "zod";

export const CreateInvoiceSchema = z.object({
  customerId:  z.uuid(),
  amount:      z.coerce.number().positive({ error: "Amount must be positive" }),
  dueDate:     z.iso.date(),
  status:      z.enum(["draft", "sent", "paid"]),
  notes:       z.string().max(500).optional(),
});

export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>;
```

`z.uuid()` is a top-level format validator (v4). `z.iso.date()` validates `"YYYY-MM-DD"` strings — the correct type for a date input's string value. `z.coerce.number()` handles the fact that FormData gives you the string `"42"` for a number input.

The server action imports the schema and re-parses `FormData`:

```typescript
// src/app/actions/invoice.action.ts
"use server";
import { z } from "zod";
import { CreateInvoiceSchema, type CreateInvoiceInput } from "@/schemas/invoice.schema";

export type ActionState = {
  errors?: Partial<Record<keyof CreateInvoiceInput, string[]>>;
  message?: string;
};

export async function createInvoice(
  prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const result = CreateInvoiceSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return { errors: z.flattenError(result.error).fieldErrors };
  }

  // result.data is typed as CreateInvoiceInput — use it directly
  // await db.insert(...).values(result.data)
  return { message: "Invoice created" };
}
```

The client component imports the same schema and passes it to `zodResolver`:

```typescript
// src/app/components/InvoiceForm.tsx
"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CreateInvoiceSchema, type CreateInvoiceInput } from "@/schemas/invoice.schema";

export function InvoiceForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateInvoiceInput>({
    resolver: zodResolver(CreateInvoiceSchema),
  });

  return (
    <form>
      <input {...register("amount")} type="number" />
      {errors.amount && <p>{errors.amount.message}</p>}
    </form>
  );
}
```

`zodResolver` calls `schema.safeParseAsync(values)` internally and maps `ZodError.issues` to RHF's `{ [fieldName]: { message, type } }` shape — nested paths like `address.city` map correctly via the `path` array on each issue. The full RHF + Server Action wiring and the `useActionState` loop are owned by KB_2.

---

## String formats

Zod v4 moved format validators from instance methods to top-level functions. Use the top-level forms in all new code.

```typescript
z.email()                              // standard email
z.email({ pattern: z.regexes.html5Email })   // browser HTML5 standard
z.email({ pattern: z.regexes.rfc5322Email }) // RFC 5322
z.uuid()                               // RFC 9562
z.uuidv4()
z.uuidv7()
z.url()
z.e164()                               // E.164 phone numbers
z.ipv4()
z.ipv6()
z.base64()
z.base64url()
z.jwt()
z.iso.date()                           // "YYYY-MM-DD"
z.iso.time()                           // "HH:MM[:SS[.s+]]"
z.iso.datetime()                       // ISO 8601 with optional offset/precision
z.iso.duration()
```

Length and pattern constraints remain as instance methods:

```typescript
z.string().min(1).max(255)
z.string().regex(/^[a-z]+$/)
z.string().trim()
z.string().toLowerCase()
```

---

## Composition operators

### .partial / .pick / .omit / .extend

```typescript
const UserSchema = z.object({
  id:       z.uuid(),
  email:    z.email(),
  name:     z.string().min(1),
  role:     z.enum(["admin", "member"]),
});

// For an update form where only some fields are editable
const UpdateProfileSchema = UserSchema.pick({ name: true }).extend({
  bio: z.string().max(300).optional(),
});

// Partial: all fields optional — useful for PATCH endpoints
const PatchUserSchema = UserSchema.partial();

// Partial only specific fields
const PartialRoleSchema = UserSchema.partial({ role: true });

// Strip internal fields before returning to client
const PublicUserSchema = UserSchema.omit({ id: true });
```

### Spread merge (preferred over .merge)

When combining two object schemas, spread their `.shape` properties. This preserves all object methods (`.pick()`, `.omit()`, etc.) on the result, which `.merge()` does not (and `.merge()` is deprecated in v4).

```typescript
const AddressSchema = z.object({
  street: z.string(),
  city:   z.string(),
  zip:    z.string().regex(/^\d{5}$/),
});

const ShippingSchema = z.object({
  ...UserSchema.pick({ name: true }).shape,
  ...AddressSchema.shape,
  instructions: z.string().optional(),
});
```

### z.intersection

Use `z.intersection` when combining schemas that are not both plain objects, or when you need the TypeScript `A & B` intersection type explicitly. For two plain objects, prefer spread.

```typescript
const WithTimestamps = z.object({
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

// Intersection preserves the type-level & relationship
const StoredInvoice = z.intersection(CreateInvoiceSchema, WithTimestamps);
```

Note that `z.intersection()` does not give you `.pick()`, `.omit()`, or other object methods on the result.

### z.union and z.discriminatedUnion

`z.union` checks members sequentially — first success wins. Prefer `z.discriminatedUnion` when all variants are objects with a shared discriminator key; it is faster and produces better TypeScript narrowing.

```typescript
// Payment form with method-dependent fields
export const PaymentSchema = z.discriminatedUnion("method", [
  z.object({
    method:        z.literal("card"),
    cardNumber:    z.string().length(16),
    cvv:           z.string().length(3),
    expiry:        z.string().regex(/^\d{2}\/\d{2}$/),
    // Never persist raw card numbers — note future BILL_KB for payment tokenization
  }),
  z.object({
    method:        z.literal("bank"),
    accountNumber: z.string().min(6),
    routingNumber: z.string().length(9),
  }),
]);

export type PaymentInput = z.infer<typeof PaymentSchema>;
```

In v4, discriminated union discriminator options can be `z.literal()`, `z.enum()`, `z.null()`, or `z.undefined()`. Unions and pipes are also valid discriminator options in v4.

### Wizard step schemas (brief — see KB_3 for full mechanics)

```typescript
const FullRegistrationSchema = z.object({
  email:    z.email(),
  name:     z.string().min(1),
  plan:     z.enum(["free", "pro"]),
  orgName:  z.string().min(1),
});

const Step1Schema = FullRegistrationSchema.pick({ email: true, name: true });
const Step2Schema = FullRegistrationSchema.pick({ plan: true, orgName: true });

// Validate each step independently; merge at final submit
const finalResult = FullRegistrationSchema.safeParse({ ...step1Data, ...step2Data });
```

KB_3 owns the full wizard pattern: step-wise state management, `z.intersection` across steps, and persisting partial data.

---

## Refinements

### .refine() for a single cross-field constraint

`.refine()` takes a predicate and options. The `path` option attaches the error to a specific field — without it, the error appears at the object level and RHF will not display it under any single field.

```typescript
export const PasswordChangeSchema = z.object({
  currentPassword: z.string().min(1, { error: "Required" }),
  newPassword:     z.string().min(8),
  confirmPassword: z.string(),
})
  .refine(
    (data) => data.newPassword === data.confirmPassword,
    { error: "Passwords do not match", path: ["confirmPassword"] }
  )
  .refine(
    (data) => data.currentPassword !== data.newPassword,
    { error: "New password must differ from current", path: ["newPassword"] }
  );
```

The v4 error key is `error`, not `message`. In v4, `.refine()` chains correctly — you can chain multiple `.refine()` calls and also chain `.min()` after `.refine()` on a string (this was broken in v3).

### .superRefine() for multiple issues

When a single refinement needs to emit more than one error, or when you need to match Zod's internal issue codes for resolver compatibility, use `.superRefine()`. It receives the value and a context object; call `ctx.addIssue()` for each problem.

```typescript
const UniqueTagsSchema = z.array(z.string().min(1)).superRefine((tags, ctx) => {
  if (tags.length > 10) {
    ctx.addIssue({
      code: "too_big",
      maximum: 10,
      origin: "array",
      inclusive: true,
      message: "Maximum 10 tags",
      input: tags,
    });
  }
  const seen = new Set<string>();
  tags.forEach((tag, i) => {
    if (seen.has(tag)) {
      ctx.addIssue({
        code: "custom",
        message: `Duplicate tag: "${tag}"`,
        input: tag,
        path: [i],
      });
    }
    seen.add(tag);
  });
});
```

Pick `.refine()` for a single yes/no constraint with an optional path. Pick `.superRefine()` when you need multiple distinct errors, need to attach errors to array indices, or need to emit a specific `ZodIssueCode` that downstream tooling (like a custom resolver) inspects.

Note: in v4, `ctx.path` is removed from the refinement context (it was available in v3). Use the `path` field inside `ctx.addIssue()` instead.

---

## Transforms

A transform changes the output type of a schema. Once applied, `z.input<typeof Schema>` and `z.output<typeof Schema>` diverge. This matters at API boundaries: if the server receives the post-transform output type and you try to re-parse it through the schema expecting the pre-transform input, it fails.

The safe rule: **parse raw input on both sides of a boundary; never transport the transformed value and re-parse it on the other side.** The schema lives in `src/schemas/` so both sides have access to it — use it.

```typescript
// Asymmetric schema — input: string, output: number
const LengthSchema = z.string().transform((val) => val.length);

type LengthInput  = z.input<typeof LengthSchema>;  // string
type LengthOutput = z.output<typeof LengthSchema>; // number

// Correct: pass the raw string, get the number back
LengthSchema.parse("hello"); // 5
// Wrong: pass 5 and expect 5 back — fails because input type is string
LengthSchema.parse(5); // ZodError
```

When you need a transform that keeps the schema type consistent (so you can chain `.max()` after it), use `.overwrite()`:

```typescript
// .overwrite() returns the same schema type — result is still ZodNumber, not ZodPipe
const BoundedSquare = z.number().overwrite((val) => val ** 2).max(100);
```

For serialization/deserialization symmetry across boundaries, use `.pipe()`:

```typescript
// Parse a date string, store it as an ISO string, but validate the shape
const DateStringSchema = z.string().pipe(z.iso.datetime());
```

### z.preprocess for FormData coercion

`z.preprocess` runs a transform before the schema validates — useful when you need to coerce a value before Zod even looks at the type. The input type of a preprocessed schema is `unknown` unless you annotate it.

```typescript
// Trim whitespace before min-length validation
const TrimmedName = z.preprocess(
  (val: unknown) => (typeof val === "string" ? val.trim() : val),
  z.string().min(1, { error: "Name is required" })
);
```

### .default() and .prefault() in v4

In v4, `.default()` value matches the **output** type (post-transform). In v3 it matched the input type — this is a breaking change.

```typescript
// v4: default is the post-transform type
const LenWithDefault = z.string().transform((v) => v.length).default(0); // 0 is a number

// v4: use .prefault() for a default that matches the input type (pre-transform)
const LenWithPrefault = z.string().transform((v) => v.length).prefault(""); // "" is a string
LenWithPrefault.parse(undefined); // => 0 (runs transform on "")
```

If you see v3 code where `.default("some string")` follows a transform to a non-string type, that will break in v4. Update the default value to match the output type, or switch to `.prefault()`.

---

## Async validation

An async refinement makes the entire schema async. You must call `.safeParseAsync()` — calling `.safeParse()` throws.

```typescript
// src/schemas/signup.schema.ts
import { z } from "zod";

// Username format validation — synchronous, safe for client
export const UsernameSchema = z.string().min(3).max(20).regex(/^[a-z0-9_]+$/);

// Full signup schema — availability check makes it async
// Only use this on the server; do not run availability checks client-side
export const SignupSchema = z.object({
  username: UsernameSchema.refine(
    async (val) => {
      const exists = await db.users.exists({ username: val });
      return !exists;
    },
    { error: "Username is already taken" }
  ),
  email:    z.email(),
  password: z.string().min(8),
});

// Server action:
const result = await SignupSchema.safeParseAsync(Object.fromEntries(formData));
```

The availability check above belongs on the server. Do not bake async refinements that make network or database calls into the shared client-side schema. RHF's `zodResolver` runs in async mode by default, which means the async refinement fires on every validation cycle. Without debouncing, a network check on every keystroke will hammer your API. The recommended approach is to split the schema: use a synchronous schema for the client-side resolver (format validation only) and re-parse the full schema — including async checks — inside the server action.

If a UI uniqueness indicator is required (e.g., a "username available" badge), implement it as a separate controlled component with its own debounced fetch, not as a Zod refinement wired to `useForm`. See KB_2 for the pattern. Use `mode: 'onBlur'` or `mode: 'onSubmit'` in `useForm` to avoid the keystroke-on-every-validation problem when async refinements are unavoidable in the resolver.

---

## Error formatting

`z.flattenError(error)` returns a shallow object best suited to flat single-level forms. It is the primary tool for mapping errors to Server Action return shapes.

```typescript
const result = CreateInvoiceSchema.safeParse(data);

if (!result.success) {
  const flat = z.flattenError(result.error);
  // flat.formErrors — string[] — top-level errors (no field path)
  // flat.fieldErrors — { amount?: string[], dueDate?: string[], ... }
  return { errors: flat.fieldErrors };
}
```

`z.treeifyError(error)` returns a nested structure that mirrors the schema hierarchy. Use it when the schema has nested objects or arrays and you need to locate errors at depth.

```typescript
const tree = z.treeifyError(result.error);
// tree.errors                                   — top-level
// tree.properties?.address?.properties?.city?.errors  — nested object field
// tree.properties?.tags?.items?.[1]?.errors     — specific array item
```

`z.prettifyError(error)` produces a human-readable string for debugging, not for display in UI. Use it in `console.error` calls during development.

The v3 methods — `error.flatten()`, `error.format()`, `error.formErrors`, `error.errors`, `error.addIssue()` — are deprecated in v4 (still callable; slated for removal in v5). Use the top-level functions above. The `.issues` array remains available directly on the `ZodError` instance.

A complete `ZodIssue` has this shape:

```typescript
{
  code:     "too_small",
  minimum:  8,
  type:     "string",
  path:     ["password"],
  message:  "String must contain at least 8 character(s)",
  input:    "abc",
}
```

`zodResolver` reads `.issues` internally and maps them to RHF's `{ [fieldName]: { message, type } }` shape — you do not need to do this manually when using the resolver. For server action returns consumed by `useActionState`, use `z.flattenError().fieldErrors` and pass the keyed error arrays to the form's error display.

---

## FormData parsing

Every value in `FormData` is a string. Three strategies:

**`z.coerce.*` — the default choice** for numeric and boolean fields:

```typescript
export const ProductSchema = z.object({
  name:      z.string().min(1).max(100),
  price:     z.coerce.number().nonnegative(),   // "19.99" → 19.99
  quantity:  z.coerce.number().int().min(0),    // "5" → 5
  category:  z.enum(["electronics", "clothing", "food"]),
});

const result = ProductSchema.safeParse(Object.fromEntries(formData));
```

**`z.stringbool()` for checkbox inputs** — do not use `z.coerce.boolean()` for checkbox or toggle values that send strings. `Boolean("false")` is `true` in JavaScript. `z.stringbool()` (new in v4) maps `"true"`, `"1"`, `"yes"`, `"on"`, `"y"`, `"enabled"` to `true` and `"false"`, `"0"`, `"no"`, `"off"`, `"n"`, `"disabled"` to `false`. Anything else throws a `ZodError`.

```typescript
const SettingsSchema = z.object({
  emailNotifications: z.stringbool(),
  publicProfile:      z.stringbool(),
});
```

**`z.preprocess` for custom coercions** — when the built-in coerce helpers do not cover your case:

```typescript
const schema = z.object({
  tags: z.preprocess(
    (val) => (typeof val === "string" ? val.split(",").map((s) => s.trim()) : val),
    z.array(z.string().min(1))
  ),
});
```

When using `Object.fromEntries(formData)`, Next.js appends internal `$ACTION_*` keys to the FormData for server actions. These are stripped automatically because Zod's default `z.object()` strips unknown keys. This is safe. If you switch to `z.strictObject()`, those keys will cause validation failures — stick with the default strip behavior when parsing FormData.

In v4, the input type of coerced schemas is `unknown` (was typed in v3). This is intentional — `z.coerce.*` accepts any input and runs JavaScript's coercion rules. If TypeScript needs a narrower input type at the call site, validate with a non-coerce schema first (e.g., `z.string().pipe(z.coerce.number())`) so the input type is preserved.

---

## Sharing schemas

The canonical file layout:

```
src/
  schemas/
    invoice.schema.ts     // no directive — safe for both sides
    user.schema.ts
    auth.schema.ts
  app/
    actions/
      invoice.action.ts   // 'use server' — imports from src/schemas/
    components/
      InvoiceForm.tsx     // 'use client' — imports from src/schemas/
```

Schema files carry no `"use server"` or `"use client"` directive. They contain only Zod schema definitions and inferred types — no browser APIs, no Node.js APIs, no database clients. This makes them importable from either context.

A `"use client"` component can import a schema file. It cannot import a `"use server"` file. A `"use server"` action can import a schema file. It cannot import client-only modules.

Export both the schema and the inferred type from each schema file. Consuming code imports the type for annotations and the schema for validation — keeping them from the same export prevents them from silently diverging.

```typescript
// src/schemas/user.schema.ts
import { z } from "zod";

export const CreateUserSchema = z.object({
  email:    z.email(),
  password: z.string().min(8),
  name:     z.string().min(1),
});

// Export the type alongside the schema — always keep them co-located
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

// Separate schema for updates — reuse the base rather than redefining
export const UpdateUserSchema = CreateUserSchema.pick({ name: true }).extend({
  avatarUrl: z.url().optional(),
});

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
```

---

## Cross-references

- **KB_2** — Full React Hook Form + Server Action wiring: `useActionState`, form submission flow, error display loop, optimistic updates, progressive enhancement. The `zodResolver` integration shown above is the entry point; KB_2 owns the surrounding pipeline.
- **KB_3** — Multi-step wizard schema composition: step-wise validation, partial schemas per step, persisting partial data between steps, merging at final submit.
- **KB_4** — Specialized input schemas: date pickers, `useFieldArray` for arrays of objects, complex controlled inputs. This KB covers the schema side (`z.iso.datetime`, `z.array`, `z.coerce.number`); KB_4 covers the input component wiring.
- **SB_KB_7** — File upload validation end-to-end: `z.file().min().max().mime()` in Zod v4, MIME type and size validation, Supabase Storage integration. Do not duplicate here.
