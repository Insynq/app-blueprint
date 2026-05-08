# UI_KB_10 — Accessibility Baseline

---

## Pattern

Accessibility is built in at component creation time, not audited afterward. The baseline target is WCAG 2.1 AA. Native HTML elements carry ARIA semantics for free — use them first. Radix/Base UI primitives handle keyboard navigation and ARIA for all interactive compound components. Focus management is explicit for every dynamic UI change: modal open/close, route changes, drawer open/close.

---

## When to Use / When to Skip

**Always implement this baseline.** WCAG 2.1 AA is not optional for any web app. Keyboard accessibility alone affects screen reader users, motor disability users, power keyboard users, and anyone on a broken trackpad.

**Skip AAA requirements** (7:1 contrast, no timing constraints) unless the project explicitly requires it. AA is the legal and practical standard.

**Skip custom ARIA implementations** for components that Radix/Base UI already handle. Adding your own `aria-expanded` to a Radix Accordion trigger is redundant and may conflict.

---

## Anti-Patterns

**Removing focus outline without providing a replacement.**
```css
/* WRONG — removes focus for ALL users including keyboard users */
* { outline: none; }
button:focus { outline: none; }

/* RIGHT — remove browser default, provide custom ring */
button:focus-visible {
  outline: 2px solid var(--color-border-focus);
  outline-offset: 2px;
}
```

**Color as the only differentiator.**
```tsx
// WRONG — red = error, but no other indicator
<span className="text-red-500">{value}</span>

// RIGHT — icon + color + text label or aria-label
<span className="text-[--status-destructive] flex items-center gap-1">
  <AlertIcon className="h-4 w-4" aria-hidden />
  {value}
  <span className="sr-only">(Error)</span>
</span>
```

**Non-interactive `<div>` used as a button.**
```tsx
// WRONG — mouse-only; no keyboard, no screen reader role
<div onClick={handleClick} className="cursor-pointer">Click me</div>

// RIGHT — use <button>; native keyboard and ARIA handling
<button onClick={handleClick}>Click me</button>
```

**Positive `tabindex` values.**
```tsx
// WRONG — creates unpredictable tab order
<button tabIndex={2}>Second</button>
<button tabIndex={1}>First</button>

// RIGHT — let DOM order determine tab order; use tabIndex={0} only when needed
<button>First</button>
<button>Second</button>
```

**Modal that doesn't return focus on close.**
Opening a modal moves focus inside it. Closing the modal must return focus to the element that opened it. Radix Dialog handles this — do not override it.

**Icon-only buttons with no accessible label.**
```tsx
// WRONG — screen reader says "button" with no context
<button onClick={handleDelete}><TrashIcon /></button>

// RIGHT
<button onClick={handleDelete} aria-label="Delete task">
  <TrashIcon aria-hidden />
</button>
```

---

## Generic Example

### Focus Ring — Global CSS

```css
/* globals.css */
/* Remove browser defaults; apply custom ring only on keyboard focus */
@layer base {
  :focus-visible {
    outline: 2px solid var(--color-border-focus);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  /* Remove outline for mouse users (browser handles this with :focus-visible) */
  :focus:not(:focus-visible) {
    outline: none;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
}
```

### Skip Link

```tsx
// First element in <body> — allows keyboard users to skip repeated nav
// Visible only on focus
function SkipToContent() {
  return (
    <a
      href="#main-content"
      className={cn(
        'fixed top-2 left-2 z-[--z-toast] px-4 py-2 rounded-[--radius-md]',
        'bg-[--color-primary] text-[--color-primary-foreground] font-medium text-sm',
        // Visually hidden until focused
        'opacity-0 focus:opacity-100',
        'translate-y-[-100%] focus:translate-y-0',
        'transition-[opacity,transform] duration-[--duration-fast]',
      )}
    >
      Skip to main content
    </a>
  );
}

// In root layout:
<SkipToContent />
<Header />
<main id="main-content" tabIndex={-1}>
  {children}
</main>
```

### Form Field with Accessible Error

```tsx
function FormField({
  label,
  error,
  required,
  hint,
  children,
  id,
}: FormFieldProps) {
  const fieldId = id ?? useId();
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={fieldId}
        className="text-sm font-medium text-[--color-text-default] flex items-center gap-1"
      >
        {label}
        {required && <span aria-hidden className="text-[--status-destructive]">*</span>}
        {required && <span className="sr-only">(required)</span>}
      </label>

      {hint && (
        <p id={hintId} className="text-xs text-[--color-text-muted]">{hint}</p>
      )}

      {React.cloneElement(children as React.ReactElement, {
        id: fieldId,
        'aria-describedby': [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined,
        'aria-invalid': error ? true : undefined,
        'aria-required': required ? true : undefined,
      })}

      {error && (
        <p id={errorId} role="alert" className="text-xs text-[--status-destructive] flex items-center gap-1">
          <AlertIcon className="h-3 w-3" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}
```

### Keyboard Navigation Rules by Component

```
Component         Tab behavior              Arrow keys            Escape
──────────────────────────────────────────────────────────────────────────
Button            Focusable                 N/A                   N/A
Link              Focusable                 N/A                   N/A
Input/Select      Focusable                 N/A                   N/A
Checkbox          Focusable                 N/A                   N/A
Radio group       Tab to group             Arrow: select item    N/A
Tabs              Tab to tablist           Arrow: switch tab     N/A
Dropdown menu     Tab to trigger           Arrow: navigate items Escape: close
Dialog/Modal      Focus trapped inside     N/A                   Escape: close
Drawer            Focus trapped inside     N/A                   Escape: close
Accordion         Tab to each trigger      N/A                   N/A
Combobox          Tab to input             Arrow: navigate list  Escape: close
```

### Focus Management for SPA Route Changes

```tsx
// hooks/useRouteAccessibility.ts
// Call on every route change
export function useRouteAccessibility(pageTitle: string) {
  const location = useLocation(); // react-router
  const mainRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    // Update document title
    document.title = `${pageTitle} — AppName`;

    // Move focus to main content area on route change
    // tabIndex={-1} on <main> allows programmatic focus without adding to tab order
    mainRef.current?.focus();
  }, [location.pathname, pageTitle]);

  return mainRef;
}

// In page component:
function DashboardPage() {
  const mainRef = useRouteAccessibility('Dashboard');
  return (
    <main ref={mainRef} tabIndex={-1} id="main-content" className="focus:outline-none">
      ...
    </main>
  );
}
```

### ARIA Live Region for Dynamic Updates

```tsx
// For content that updates without a page navigation (search results, task status change)
function LiveRegion({ message, politeness = 'polite' }: { message: string; politeness?: 'polite' | 'assertive' }) {
  return (
    <div
      role="status"
      aria-live={politeness}
      aria-atomic="true"
      className="sr-only"
    >
      {message}
    </div>
  );
}

// Usage — update message when async content changes
const [announcement, setAnnouncement] = React.useState('');

async function handleTaskComplete(taskId: string) {
  await completeTask(taskId);
  setAnnouncement('Task marked complete. 5 tasks remaining.');
}

<LiveRegion message={announcement} />
```

### Contrast Verification Checklist

```
Required contrast ratios (WCAG 2.1 AA):
  Normal text (< 18px / < 14px bold):   ≥ 4.5:1
  Large text (≥ 18px / ≥ 14px bold):    ≥ 3.0:1
  UI components, focus indicators:       ≥ 3.0:1
  Decorative elements:                   no requirement

Common failures to audit:
  □ Muted text on light surface    (--color-text-muted on --color-background)
  □ Disabled text                  (--color-text-disabled — intentionally low; still must be 3:1 on AA)
  □ Status badge text on tinted bg (--status-success-text on --status-success-bg)
  □ Placeholder text in inputs     (often gray-400 on white — fails 4.5:1)
  □ White text on brand primary    (only safe if primary is dark enough)
  □ Focus ring on primary color    (primary-colored ring on primary-colored surface fails)

Tools:
  - oklch.com — OKLCH color picker with contrast checker
  - WebAIM Contrast Checker — contrast ratio calculator
  - browser DevTools accessibility panel
```

---

## Trade-offs

| Decision | Pro | Con |
|---|---|---|
| `:focus-visible` instead of `:focus` | Focus ring only for keyboard users; cleaner for mouse users | Requires all browsers to support `:focus-visible` (all Tailwind v4 targets do) |
| Radix/Base UI for interactive primitives | Keyboard + ARIA handled for free | Less control over internals if behavior needs to deviate |
| `tabIndex={-1}` on `<main>` | Enables programmatic focus for route changes | Adds a tabbable element to DOM (doesn't enter tab order; only programmatic) |
| `role="alert"` on inline errors | Announced immediately by screen readers | Can be disruptive if errors fire rapidly on every keystroke |

---

## Gotchas

**`aria-label` on an element overrides its visible text for screen readers.** Use `aria-label` on icon-only buttons. Never use it on elements that already have visible text — the visible text and the `aria-label` will conflict.

**Radix Dialog's `onPointerDownOutside` and `onEscapeKeyDown` can be overridden.** If you need to prevent Escape from closing a dialog (e.g., unsaved changes warning), use `onEscapeKeyDown={(e) => e.preventDefault()}`. But always provide another explicit close path.

**`role="status"` vs `role="alert"`.** `status` (maps to `aria-live="polite"`) announces when the user is idle. `alert` (maps to `aria-live="assertive"`) interrupts immediately. Use `alert` only for critical errors. Use `status` for success messages and progress updates.

**`:focus-visible` does not apply to click-triggered focus on all browsers.** After a mouse click, Chrome applies `:focus-visible` in some cases. Explicitly test with keyboard-only to confirm focus rings are visible.

**Disabled form fields must still communicate their state.** `disabled` on a native input is accessible — screen readers announce "dimmed" or similar. Custom components that visually appear disabled but don't use the native `disabled` attribute must add `aria-disabled="true"` and prevent interaction via keyboard event handlers.

**`tabIndex` on `<main>` produces a visible outline when it receives programmatic focus** unless you suppress it explicitly: `<main tabIndex={-1} className="focus:outline-none">`. The `:focus-visible` rule will NOT apply here because the focus was programmatic, not keyboard-initiated — so `outline: none` on `:focus` here is acceptable and intentional.
