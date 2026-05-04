# UI_KB_5 — Component Architecture

---

## Pattern

Components are organized in three tiers: primitives (shadcn/Radix — behavior + base style), shared (cross-feature organisms), and feature-local (scoped to one feature). Variants are managed with `cva`. Every interactive component ships with all required states: default, hover, focus, active, disabled, loading, error, empty. Radix/Base UI primitives handle all ARIA and keyboard behavior — never reimplement these from scratch.

---

## When to Use / When to Skip

**Always use Radix/Base UI primitives** for: dialogs, dropdowns, popovers, tooltips, tabs, accordions, checkboxes, radio groups, select menus, sliders. The accessibility contract these provide (keyboard nav, ARIA, focus trapping) is non-trivial to reimplement correctly.

**Build a new component** when the same element combination appears 3+ times with the same behavior across different callsites.

**Skip component extraction** for one-off layouts or compositions that appear once. Inline it.

**Skip component-level tokens** (Tier 3 of the token system) until a component genuinely needs a color or spacing value that the semantic layer doesn't cover. Most components only need semantic tokens.

---

## Anti-Patterns

**Custom dialog/modal built from scratch.**
Focus trapping, Escape key, backdrop click dismissal, scroll lock, and ARIA attributes are all required. Radix `Dialog` provides all of these. Building from scratch reintroduces solved problems.

**Missing component states.**
```tsx
// WRONG — only happy path implemented
function Button({ children, onClick }) {
  return <button onClick={onClick}>{children}</button>;
}

// RIGHT — all required states
function Button({ children, onClick, isLoading, disabled, variant }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      aria-disabled={disabled || isLoading}
      className={button({ variant, isLoading })}
    >
      {isLoading ? <Spinner /> : children}
    </button>
  );
}
```

**Prop sprawl.**
A component with 15+ props is a signal to decompose or use composition instead.
```tsx
// WRONG — brittle and unreadable
<Card title="..." subtitle="..." icon="..." badge="..." badgeColor="..." action="..." actionLabel="..." isLoading={} hasError={} errorMessage="..." footer="..." footerAction="..." />

// RIGHT — compose with children
<Card>
  <Card.Header>
    <Card.Title>...</Card.Title>
    <Badge variant="success">Active</Badge>
  </Card.Header>
  <Card.Content>...</Card.Content>
  <Card.Footer>...</Card.Footer>
</Card>
```

**Ternary hell in `className`.**
```tsx
// WRONG
<button className={`px-4 py-2 ${variant === 'primary' ? 'bg-blue-500' : variant === 'secondary' ? 'bg-gray-100' : 'bg-transparent'} ${size === 'sm' ? 'text-sm' : 'text-base'}`}>
```
Use `cva` instead.

---

## Generic Example

### `cva` Variant Pattern

```tsx
// components/ui/button.tsx
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // Base classes — applied to all variants
  [
    'inline-flex items-center justify-center gap-2',
    'rounded-[--radius-md] font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2',
    'focus-visible:ring-[--color-border-focus] focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-[--color-primary] text-[--color-primary-foreground]',
          'hover:bg-[--color-primary-hover]',
          'active:bg-[--color-primary-active]',
        ],
        secondary: [
          'bg-[--color-surface] text-[--color-text-default]',
          'border border-[--color-border-default]',
          'hover:bg-[--color-surface-raised]',
        ],
        destructive: [
          'bg-[--status-destructive] text-white',
          'hover:opacity-90',
        ],
        ghost: [
          'text-[--color-text-default]',
          'hover:bg-[--color-surface-raised]',
        ],
        link: [
          'text-[--color-primary] underline-offset-4',
          'hover:underline',
        ],
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-base',
        lg: 'h-12 px-6 text-lg',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

export function Button({ variant, size, isLoading, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || isLoading}
      aria-disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Spinner className="h-4 w-4" aria-hidden />}
      {children}
    </button>
  );
}
```

### Compound Component Pattern (Radix-backed)

```tsx
// components/ui/card.tsx
// Simple compound component without Radix (no interactive behavior needed)

const Card = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('rounded-[--radius-lg] border border-[--color-border-default] bg-[--color-surface] shadow-sm', className)}
    {...props}
  >
    {children}
  </div>
);

const CardHeader = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-1 p-6 pb-0', className)} {...props}>
    {children}
  </div>
);

const CardTitle = ({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn('text-xl font-semibold leading-snug text-[--color-text-default]', className)} {...props}>
    {children}
  </h3>
);

const CardContent = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('p-6', className)} {...props}>{children}</div>
);

const CardFooter = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center p-6 pt-0', className)} {...props}>{children}</div>
);

Card.Header = CardHeader;
Card.Title = CardTitle;
Card.Content = CardContent;
Card.Footer = CardFooter;

export { Card };
```

### Required Component States Checklist

Every interactive component must implement:

```
□ Default     — rest state; full visual design
□ Hover       — cursor enters; background/border shift
□ Focus       — keyboard focus ring (never remove without replacement)
□ Active      — during press/click; slight scale or depth change
□ Disabled    — opacity-50, cursor-not-allowed, pointer-events-none, aria-disabled
□ Loading     — spinner, skeleton, or pulse animation; block interaction
□ Error       — destructive color treatment; error message visible
□ Empty       — no data; illustration or icon + guidance + CTA (not a blank void)
```

### Onboarding: Dual-Status Task Item Component

```tsx
// Status enum for task items
type TaskStatus =
  | 'incomplete'
  | 'in_progress'
  | 'self_complete'   // agent self-reported
  | 'verified'        // admin confirmed
  | 'flagged'         // admin flagged issue
  | 'skipped'
  | 'locked';

const statusConfig: Record<TaskStatus, { icon: string; label: string; color: string; badgeVariant: string }> = {
  incomplete:    { icon: '○', label: 'Incomplete',         color: 'text-[--color-text-muted]',    badgeVariant: 'neutral' },
  in_progress:   { icon: '◔', label: 'In Progress',        color: 'text-[--status-info]',         badgeVariant: 'info' },
  self_complete: { icon: '●', label: 'Pending Review',     color: 'text-[--status-warning]',      badgeVariant: 'warning' },
  verified:      { icon: '✓', label: 'Verified',           color: 'text-[--status-success]',      badgeVariant: 'success' },
  flagged:       { icon: '⚠', label: 'Needs Attention',   color: 'text-[--status-destructive]',  badgeVariant: 'destructive' },
  skipped:       { icon: '⊘', label: 'Skipped',           color: 'text-[--color-text-disabled]', badgeVariant: 'neutral' },
  locked:        { icon: '🔒', label: 'Locked',            color: 'text-[--color-text-disabled]', badgeVariant: 'neutral' },
};

function TaskItem({ task, onCheck, onUndo, role }: TaskItemProps) {
  const config = statusConfig[task.status];
  const isActionable = !['verified', 'locked'].includes(task.status);

  return (
    <div
      className={cn(
        'flex gap-4 p-4 rounded-[--radius-md] border transition-colors',
        task.status === 'verified'  && 'border-[--status-success-border] bg-[--status-success-bg]',
        task.status === 'flagged'   && 'border-[--status-destructive-border] bg-[--status-destructive-bg]',
        task.status === 'locked'    && 'border-[--color-border-default] bg-[--color-surface] opacity-60',
        !['verified','flagged','locked'].includes(task.status) && 'border-[--color-border-default] bg-[--color-surface]',
      )}
    >
      {/* Status icon */}
      <span className={cn('text-lg mt-0.5 shrink-0', config.color)} aria-hidden>
        {config.icon}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('font-medium text-[--color-text-default]', task.status === 'verified' && 'text-[--color-text-muted]')}>
            {task.title}
          </p>
          <Badge variant={config.badgeVariant as any}>{config.label}</Badge>
        </div>

        {task.description && (
          <p className="text-sm text-[--color-text-muted] mt-1">{task.description}</p>
        )}

        {/* Admin flag note */}
        {task.status === 'flagged' && task.adminNote && (
          <p className="text-sm text-[--status-destructive-text] mt-2 font-medium">
            Note: {task.adminNote}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-3">
          {isActionable && role === 'agent' && task.status !== 'self_complete' && (
            <Button size="sm" variant="secondary" onClick={() => onCheck(task.id)}>
              Mark Complete
            </Button>
          )}
          {task.status === 'self_complete' && role === 'agent' && (
            <Button size="sm" variant="ghost" onClick={() => onUndo(task.id)}>
              Undo
            </Button>
          )}
          {task.resourceUrl && (
            <Button size="sm" variant="ghost" asChild>
              <a href={task.resourceUrl} target="_blank" rel="noopener noreferrer">
                Help →
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## Trade-offs

| Decision | Pro | Con |
|---|---|---|
| `cva` for variants | Type-safe; composable; no ternary sprawl | Another dependency; learning curve |
| Radix/Base UI for interactive primitives | A11y handled; keyboard/ARIA baked in | Bundle size; API has opinions that can feel constraining |
| Compound component pattern | Flexible; clean at callsite | More files; slightly more boilerplate |
| Copy-owned shadcn code | Full control; no upstream breakage | Must manually sync updates; easy to diverge from shadcn defaults |

---

## Gotchas

**shadcn components reference HSL tokens by default** (`hsl(var(--primary))`). When you add a shadcn component, the generated code uses the shadcn default token names which may conflict with your semantic token structure. Always audit and migrate to your own token names after generating.

**`cn()` requires both `clsx` and `tailwind-merge`.** `clsx` alone does not resolve conflicting Tailwind classes (e.g., `p-4` and `p-2` both applied). `tailwind-merge` resolves the conflict. Both are needed.

**Radix Dialog's `disableOutsideClick` / `onPointerDownOutside`.** If you need to prevent dialog dismissal on backdrop click (e.g., for destructive confirmation dialogs), pass `onPointerDownOutside={(e) => e.preventDefault()}`. Do not set this globally — only on dialogs where it's intentional UX.

**`asChild` prop in Radix/shadcn.** When passing `asChild`, the component renders its child as the root element, merging props. The child must accept `ref` and spread all props. This breaks with components that don't forward refs.

**Disabled state must also prevent keyboard activation.** `pointer-events-none` only blocks mouse events. For keyboard users, also set `disabled` attribute on the native element (not just `aria-disabled`). For non-button interactive elements using ARIA, handle `keydown` events and check disabled state explicitly.

**Empty state must be designed before the component is shipped.** It's always skipped until a user hits it in production. Design and implement empty states when you build the component, not as a follow-up.
