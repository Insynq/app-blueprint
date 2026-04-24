# KB 7 — Application Patterns

> **Living catalog.** Read before building anything new — extend existing patterns rather than creating parallel ones.
>
> Add entries once a pattern is proven and should be followed project-wide. Don't fill in speculatively.
>
> Commands that consult this KB: `/brainstorm`, `/plan-review`, `/gen-component`, `/audit-code`, `/unify`

---

## Part 1: UI Rules

Establish these once early in the project. Future sessions will inherit them.

### Design System & Component Library
[TODO — which library is in use and any project-specific setup. e.g., shadcn/ui with custom theme tokens]

### Styling Conventions
[TODO — Tailwind, CSS modules, styled-components, etc. Key naming or utility patterns. Any class organization rules.]

### Component File Structure
[TODO — where components live, how files are named, how index files are used]

### State Management Approach
[TODO — local state vs. context vs. global store. What kinds of state belong where.]

### Modal & Overlay Rules
[TODO — when to use Dialog vs Sheet vs Drawer vs Toast vs inline expansion.
This is a critical architectural decision: inconsistency here creates a fragmented UX.
Example: "Dialog for detail views, Sheet for multi-step flows, Toast for transient confirmations"]

### Loading, Empty & Error States
[TODO — how loading spinners, skeletons, empty states, and error messages are handled consistently across components]

### Forms
[TODO — form library in use (react-hook-form, Formik, native), validation approach, submit pattern, error display]

### Role-Aware Rendering
[TODO — how components check permissions before rendering actions.
Example: "usePermissions() hook returns a gates object; components check gates.canDoX before rendering the button"]

---

## Part 2: Reusable Component Catalog

> **Before creating a new component, search this section.**
> Add an entry here immediately after creating a component that others might reuse.
> The `/gen-component` command reads and updates this section automatically.

> This catalog populates as components are built via `/gen-component`. It is intentionally empty on new projects — do not prefill. The first real entry replaces this note.

### Entry format

```
**[ComponentName]**
`src/components/path/ComponentName.tsx`
- **Purpose:** One sentence on what it does.
- **When to use:** Specific scenarios where this is the right choice.
- **When NOT to use:** Common mistake or tempting but wrong scenario.
- **Key props:** Only document props that aren't obvious from their names.
  - `propName: type` — what it does
```

---
*Example entry (remove or replace with your first real component):*

**ConfirmDialog**
`src/components/ui/ConfirmDialog.tsx`
- **Purpose:** Reusable confirmation dialog with title, message, and confirm/cancel actions.
- **When to use:** Any destructive or irreversible action (delete, cancel, submit).
- **When NOT to use:** Informational alerts that don't require user confirmation — use a toast instead.
- **Key props:** `onConfirm` (called on confirm), `destructive` (red confirm button variant).

---

## Part 3: Hook & Utility Catalog

> **Before writing a new hook or utility, search this section.**
> Add an entry here immediately after creating something reusable.

### Entry format

```
**[useHookName]** or **[utilityFunctionName]**
`src/hooks/...` or `src/lib/...`
- **Returns / Does:** What it provides or produces.
- **When to use:** The specific problem it solves.
- **Key parameters:** Only non-obvious ones.
```

---

## Part 4: Backend & API Patterns

> Only populate sections that apply to this project. Delete sections that don't apply.

### API Contract Conventions
[TODO — request/response shapes, error format, status codes, authentication header patterns]

### Error Handling
[TODO — how errors propagate through the stack, what gets sanitized before reaching clients, how errors surface in the UI]

### Data Access Patterns
[TODO — ORM patterns, query conventions, how data access layers are structured, any query builder patterns]

### Background Jobs & Queues
[TODO — job queue system in use, retry patterns, failure handling, monitoring approach]

### Caching Strategy
[TODO — what gets cached, TTLs, cache invalidation approach, where caching lives (CDN, server, client)]

---

## Part 5: Architecture Decisions

> One entry per non-obvious architectural decision.
> Format: **Decision:** [what] — **Reason:** [why] — **Alternatives rejected:** [what and why]
>
> These entries prevent future sessions from re-litigating settled questions.
> Add an entry whenever a meaningful architectural choice is made.

[Add decisions here as they're made]
