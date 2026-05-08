# UI_KB_11 — React / Tailwind v4 / shadcn Implementation

---

## Pattern

shadcn/ui generates component source into the project — you own the code. Tailwind v4 configures tokens via the `@theme` CSS block, not `tailwind.config.js`. All semantic tokens are registered in `@theme` so they generate utility classes AND remain available as CSS variables. `cva` manages component variants. `cn()` (clsx + tailwind-merge) merges all class strings. File structure follows feature-based organization at scale; type-based for smaller projects.

---

## When to Use / When to Skip

**Always use Tailwind v4 `@theme` for token registration.** Do not maintain a parallel `tailwind.config.js` for colors/spacing — the `@theme` block replaces it entirely.

**Always use shadcn primitives** for: Button, Input, Select, Dialog, Sheet, Dropdown, Tabs, Accordion, Checkbox, Radio, Toast. Do not rebuild these from scratch.

**Skip shadcn** for: highly custom data visualization components, complex drag-and-drop, virtual lists. Use purpose-built libraries for those.

**Skip feature-based folder structure** for projects with fewer than ~15 components. Flat structure is fine until the codebase outgrows it.

---

## Anti-Patterns

**Leaving shadcn default token references in generated components.**
When shadcn generates a component, it references `hsl(var(--primary))` or `hsl(var(--background))`. These are the shadcn default token names. If your system uses different names (`var(--color-primary)`, `var(--color-background)`), update the generated code immediately.

**Tailwind config for tokens (v4).**
```js
// WRONG in v4 — do not add tokens to tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: { primary: '#1D4ED8' }
    }
  }
}

// RIGHT in v4 — all in CSS
@theme {
  --color-primary: oklch(0.55 0.20 250);
}
```

**String concatenation for class merging.**
```tsx
// WRONG — can produce conflicting classes; not type-safe
const cls = `px-4 py-2 ${isActive ? 'bg-blue-500' : 'bg-gray-100'}`;

// RIGHT — tailwind-merge resolves conflicts; clsx handles conditional logic
const cls = cn('px-4 py-2', isActive ? 'bg-[--color-primary]' : 'bg-[--color-surface]');
```

**Deep folder nesting.**
Max 3 levels. Past that, relative imports become fragile and navigation slows down.

**Importing from feature internals across features.**
```tsx
// WRONG — reaching into feature internals
import { TaskItemSkeleton } from '@/features/onboarding/components/TaskItemSkeleton';
// RIGHT — import from the feature's public index
import { TaskItemSkeleton } from '@/features/onboarding';
```

---

## Generic Example

### `globals.css` Full Structure

```css
/* 1. Import Tailwind v4 */
@import "tailwindcss";

/* 2. Register design tokens with Tailwind — generates utility classes */
@theme {
  /* Colors — semantic tokens become bg-*, text-*, border-* utilities */
  --color-background:        oklch(1.00 0.00 0);
  --color-surface:           oklch(0.98 0.00 0);
  --color-surface-raised:    oklch(0.95 0.00 0);
  --color-text-default:      oklch(0.20 0.00 0);
  --color-text-muted:        oklch(0.55 0.00 0);
  --color-text-disabled:     oklch(0.75 0.00 0);
  --color-border-default:    oklch(0.88 0.00 0);
  --color-border-focus:      oklch(0.55 0.20 250);
  --color-primary:           oklch(0.55 0.20 250);
  --color-primary-hover:     oklch(0.48 0.20 250);
  --color-primary-foreground: oklch(1.00 0.00 0);
  --color-primary-subtle:    oklch(0.96 0.04 250);

  /* Typography */
  --font-family-sans: 'Inter', system-ui, sans-serif;
  --font-family-mono: 'JetBrains Mono', ui-monospace, monospace;

  /* Radius */
  --radius-sm:   0.25rem;
  --radius-md:   0.5rem;
  --radius-lg:   0.75rem;
  --radius-xl:   1rem;
  --radius-full: 9999px;
}

/* 3. Base layer — non-generated token definitions and dark mode */
@layer base {
  :root {
    /* Status tokens — not registered in @theme since they're used via var() not utilities */
    --status-success:              oklch(0.60 0.18 145);
    --status-success-bg:           oklch(0.97 0.04 145);
    --status-success-border:       oklch(0.82 0.10 145);
    --status-success-text:         oklch(0.35 0.12 145);
    --status-warning:              oklch(0.72 0.18  75);
    --status-warning-bg:           oklch(0.97 0.04  75);
    --status-warning-border:       oklch(0.82 0.10  75);
    --status-warning-text:         oklch(0.40 0.14  75);
    --status-destructive:          oklch(0.55 0.22  25);
    --status-destructive-bg:       oklch(0.97 0.04  25);
    --status-destructive-border:   oklch(0.80 0.12  25);
    --status-destructive-text:     oklch(0.38 0.16  25);

    /* Z-index */
    --z-sticky:  100;
    --z-nav:     200;
    --z-overlay: 300;
    --z-toast:   400;
    --z-modal:   500;

    /* Motion */
    --duration-fast:   100ms;
    --duration-normal: 200ms;
    --duration-slow:   300ms;
  }

  .dark {
    --color-background:      oklch(0.12 0.00 0);
    --color-surface:         oklch(0.17 0.00 0);
    --color-surface-raised:  oklch(0.22 0.00 0);
    --color-text-default:    oklch(0.92 0.00 0);
    --color-text-muted:      oklch(0.62 0.00 0);
    --color-border-default:  oklch(0.28 0.00 0);
    --color-primary:         oklch(0.65 0.18 250);
    --color-primary-hover:   oklch(0.72 0.18 250);
    --color-primary-subtle:  oklch(0.20 0.06 250);
    --status-success-bg:     oklch(0.20 0.06 145);
    --status-warning-bg:     oklch(0.20 0.06  75);
    --status-destructive-bg: oklch(0.20 0.06  25);
  }

  /* Focus ring */
  :focus-visible {
    outline: 2px solid var(--color-border-focus);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }
  :focus:not(:focus-visible) { outline: none; }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
}
```

### `cn()` Utility

```ts
// lib/utils.ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### File Structure

```
src/
├── app/                        # Routes (Next.js app router / react-router)
│   ├── layout.tsx              # Root layout: <SkipToContent>, <Header>, <Toaster>
│   ├── page.tsx
│   └── admin/
│       ├── layout.tsx          # Admin shell: role guard + admin sidebar
│       └── [feature]/page.tsx
│
├── components/
│   ├── ui/                     # shadcn-generated primitives — button, input, badge, dialog, etc.
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── badge.tsx
│   │   ├── dialog.tsx
│   │   └── ...
│   └── shared/                 # Cross-feature organisms
│       ├── BrandedHeader.tsx
│       ├── SidebarNav.tsx
│       ├── PageLayout.tsx
│       ├── EmptyState.tsx
│       └── ConfirmDialog.tsx
│
├── features/
│   ├── onboarding/             # Feature folder example
│   │   ├── components/
│   │   │   ├── PhaseList.tsx
│   │   │   ├── TaskItem.tsx
│   │   │   └── ProgressRing.tsx
│   │   ├── hooks/
│   │   │   ├── usePhases.ts
│   │   │   └── useTaskComplete.ts
│   │   ├── types.ts
│   │   └── index.ts            # Public API: export { PhaseList, TaskItem, usePhases }
│   └── admin/
│       ├── components/
│       ├── hooks/
│       └── index.ts
│
├── hooks/                      # Global hooks
│   ├── useRouteAccessibility.ts
│   ├── useOrgBranding.ts
│   └── useDocumentTitle.ts
│
├── lib/                        # Utilities
│   ├── utils.ts                # cn(), formatDate(), etc.
│   └── branding.ts             # applyOrgBranding()
│
├── types/                      # Shared TypeScript types
│   ├── auth.ts
│   ├── org.ts
│   └── api.ts
│
└── styles/
    └── globals.css             # @import, @theme, @layer base — all tokens here
```

### shadcn Component Migration Pattern

After running `npx shadcn add [component]`, immediately update token references:

```tsx
// BEFORE (shadcn default) — uses shadcn's HSL token convention
<button className="bg-primary text-primary-foreground hover:bg-primary/90">

// AFTER — migrated to your semantic token system
<button className="bg-[--color-primary] text-[--color-primary-foreground] hover:bg-[--color-primary-hover]">
```

Find all instances of shadcn's default token names in the generated file:
```
shadcn default → your token
─────────────────────────────────────────────────────────
bg-primary          → bg-[--color-primary]
text-primary        → text-[--color-primary]
bg-secondary        → bg-[--color-surface]
bg-background       → bg-[--color-background]
bg-card             → bg-[--color-surface]
text-foreground     → text-[--color-text-default]
text-muted-foreground → text-[--color-text-muted]
border-border       → border-[--color-border-default]
bg-destructive      → bg-[--status-destructive]
ring-ring           → ring-[--color-border-focus]
```

### Org Branding Hook

```tsx
// hooks/useOrgBranding.ts
// Call in root layout after org data is loaded
export function useOrgBranding(org: Org | null) {
  React.useEffect(() => {
    if (!org?.branding?.primary_color) return;

    const root = document.documentElement;
    const hex = org.branding.primary_color;

    root.style.setProperty('--org-primary', hex);
    root.style.setProperty('--org-primary-hover', adjustHex(hex, -10));
    root.style.setProperty('--org-primary-subtle', hexToRgba(hex, 0.08));
    root.style.setProperty('--org-primary-foreground', getContrastForeground(hex));
    root.setAttribute('data-org-id', org.id);

    return () => {
      root.removeAttribute('data-org-id');
      root.style.removeProperty('--org-primary');
    };
  }, [org?.id, org?.branding?.primary_color]);
}
```

---

## Trade-offs

| Decision | Pro | Con |
|---|---|---|
| `@theme` in CSS (v4) | Single source of truth; no JS config | v4 only; migration cost from v3 |
| Feature-based folder structure | Scales to large codebases; encapsulation | Upfront thought required; overkill for small projects |
| `index.ts` public API per feature | Prevents internal coupling; clean imports | Extra file to maintain; must remember to export new items |
| Own shadcn code | Full control; no library lock-in | Manual sync for upstream improvements |
| Org branding via CSS variable | Runtime-dynamic; no component changes | Hex→oklch conversion needed for derived tokens |

---

## Gotchas

**Tailwind v4 `@theme` tokens must use `--color-*` namespace to generate `bg-*`/`text-*` utilities.** The namespace mapping is: `--color-*` → `bg-*`, `text-*`, `border-*`, `ring-*`. `--font-family-*` → `font-*`. `--radius-*` → `rounded-*`. `--spacing-*` → `p-*`, `m-*`, `gap-*`. If you define `--primary` (missing the `color-` namespace), `bg-primary` will not be generated.

**`tailwind-merge` must know about your custom tokens** to resolve conflicts correctly. It handles all default Tailwind utilities. For custom `bg-[--color-primary]` arbitrary values, twMerge deduplicates by CSS property, which works correctly.

**shadcn `npx shadcn add` overwrites existing files** if you've modified the generated component. Always check git diff after adding a component. Commit modified components before running `add` on updated versions.

**`cn()` with Tailwind v4 arbitrary values.** `cn('bg-[--color-primary]', 'bg-[--color-surface]')` will correctly deduplicate to the last bg value via tailwind-merge. Test this behavior explicitly if you pass conflicting arbitrary values.

**Dark mode flash (FOUC) on page load.** If dark mode class is applied by JS after hydration, users see a flash of light mode on dark-mode-preferred devices. Fix: read `localStorage` theme preference in a `<script>` tag in `<head>` before React hydrates, and apply the `.dark` class synchronously.

**Feature `index.ts` must be kept up to date.** When you add a new component to a feature folder, if you forget to export it from `index.ts`, imports from outside the feature will fail silently (TypeScript will error, but only at compile time). Make exporting from `index.ts` part of the component creation checklist.
