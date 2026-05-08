# UI_KB_1 — Design Token Architecture

---

## Pattern

Design tokens are named variables storing every visual decision — color, spacing, typography, radius, shadow, motion, z-index. They replace hard-coded values with a single source of truth that flows through the entire UI. The three-tier hierarchy (primitive → semantic → component) is what makes theming, dark mode, and multi-tenant branding possible without touching component code.

---

## When to Use / When to Skip

**Use this pattern (always):** Any project with more than one surface, any project with dark mode planned, any multi-tenant project. Tokens are baseline infrastructure, not optional.

**When to skip the component tier:** Small projects with fewer than 10 components. Stop at semantic tokens and reference them directly in components. Add component-level tokens only when a component needs to deviate from the semantic defaults.

---

## Anti-Patterns

**Hardcoding values in components.**
```tsx
// WRONG
<div className="bg-[#1D4ED8] text-white">
// WRONG
style={{ color: 'oklch(0.45 0.2 250)' }}
```
Breaks theming. Any org color override or dark mode switch will miss this component.

**Ad-hoc Tailwind utilities for semantic concepts.**
```tsx
// WRONG — same status color redefined at 5+ callsites
<span className="border-amber-300 bg-amber-50 text-amber-800">Pending</span>
```
Define `--status-warning-border`, `--status-warning-bg`, `--status-warning-text` as semantic tokens. Reference once.

**No semantic layer — only primitives.**
If components reference `--blue-500` directly, you cannot retheme without touching every component. The semantic layer (`--color-primary: var(--blue-500)`) is what makes a single token swap cascade everywhere.

**Too many tokens too early.**
A 500-token system on day one is unmanageable. Start with the 30 tokens that cover 80% of use cases. Add new tokens only when the same value appears 3+ times in unrelated contexts with the same intent.

**Inconsistent naming conventions.**
Pick one convention and enforce it everywhere. Recommended: `kebab-case`, `category-property-variant-state`.
```
--color-text-primary        ✓
--color-text-primary-hover  ✓
--primaryText               ✗
--bg_color                  ✗
```

---

## Generic Example

### Three-Tier Token Structure in `globals.css`

```css
@import "tailwindcss";

/* ─── TIER 1: Primitives (raw values, no intent) ─── */
@layer base {
  :root {
    /* Color palette */
    --blue-50:   oklch(0.97 0.02 250);
    --blue-500:  oklch(0.55 0.20 250);
    --blue-600:  oklch(0.48 0.20 250);
    --blue-900:  oklch(0.22 0.10 250);
    --gray-50:   oklch(0.98 0.00 0);
    --gray-100:  oklch(0.95 0.00 0);
    --gray-200:  oklch(0.90 0.00 0);
    --gray-500:  oklch(0.65 0.00 0);
    --gray-900:  oklch(0.20 0.00 0);
    --green-500: oklch(0.64 0.18 145);
    --amber-500: oklch(0.75 0.18  75);
    --red-500:   oklch(0.55 0.22  25);
    --white:     oklch(1.00 0.00   0);
    --black:     oklch(0.00 0.00   0);

    /* ─── TIER 2: Semantic (intent, references primitives) ─── */

    /* Surface */
    --color-background:      var(--white);
    --color-surface:         var(--gray-50);
    --color-surface-raised:  var(--gray-100);
    --color-surface-overlay: oklch(0.00 0 0 / 0.4);

    /* Text */
    --color-text-default:    var(--gray-900);
    --color-text-muted:      var(--gray-500);
    --color-text-disabled:   var(--gray-200);
    --color-text-inverse:    var(--white);

    /* Border */
    --color-border-default:  var(--gray-200);
    --color-border-strong:   var(--gray-500);
    --color-border-focus:    var(--blue-500);

    /* Brand/Action */
    --color-primary:             var(--blue-500);
    --color-primary-hover:       var(--blue-600);
    --color-primary-foreground:  var(--white);

    /* Status */
    --status-success:         var(--green-500);
    --status-success-bg:      oklch(0.97 0.04 145);
    --status-success-border:  oklch(0.85 0.10 145);
    --status-warning:         var(--amber-500);
    --status-warning-bg:      oklch(0.97 0.04  75);
    --status-warning-border:  oklch(0.85 0.10  75);
    --status-destructive:     var(--red-500);
    --status-destructive-bg:  oklch(0.97 0.04  25);
    --status-destructive-border: oklch(0.85 0.10 25);
    --status-info:            var(--blue-500);
    --status-info-bg:         var(--blue-50);
    --status-info-border:     oklch(0.80 0.10 250);

    /* Spacing scale (base 4px) */
    --space-1:  0.25rem;
    --space-2:  0.50rem;
    --space-3:  0.75rem;
    --space-4:  1.00rem;
    --space-6:  1.50rem;
    --space-8:  2.00rem;
    --space-12: 3.00rem;
    --space-16: 4.00rem;

    /* Radius */
    --radius-sm:   0.25rem;
    --radius-md:   0.50rem;
    --radius-lg:   0.75rem;
    --radius-xl:   1.00rem;
    --radius-full: 9999px;

    /* Z-index layers */
    --z-base:    0;
    --z-sticky:  100;
    --z-nav:     200;
    --z-overlay: 300;
    --z-toast:   400;
    --z-modal:   500;

    /* Motion */
    --duration-fast:   100ms;
    --duration-normal: 200ms;
    --duration-slow:   400ms;
    --ease-out: cubic-bezier(0.0, 0.0, 0.2, 1.0);
    --ease-in:  cubic-bezier(0.4, 0.0, 1.0, 1.0);
  }

  /* Dark mode — redefines semantic tokens only, never primitives */
  .dark {
    --color-background:     oklch(0.12 0.00 0);
    --color-surface:        oklch(0.16 0.00 0);
    --color-surface-raised: oklch(0.20 0.00 0);
    --color-text-default:   oklch(0.92 0.00 0);
    --color-text-muted:     oklch(0.65 0.00 0);
    --color-border-default: oklch(0.28 0.00 0);
    --color-border-strong:  oklch(0.45 0.00 0);
    --color-primary:        var(--blue-400);
    --color-primary-hover:  var(--blue-300);
  }

  /* Org-level brand override — scoped to a data attribute set by JS */
  [data-org-id] {
    --color-primary:            var(--org-primary);
    --color-primary-hover:      var(--org-primary-hover);
    --color-primary-foreground: var(--org-primary-foreground);
  }
}

/* ─── Register semantic tokens with Tailwind v4 ─── */
@theme {
  --color-background:     var(--color-background);
  --color-surface:        var(--color-surface);
  --color-text-default:   var(--color-text-default);
  --color-text-muted:     var(--color-text-muted);
  --color-primary:        var(--color-primary);
  --color-border-default: var(--color-border-default);
  /* ... register all semantic tokens you want as Tailwind utilities */
}
```

### Org Brand Override (set via JS on mount)

```tsx
// Apply org branding from database config
function applyOrgBranding(primaryHex: string) {
  const root = document.documentElement;
  // Convert hex to oklch or store as-is depending on tooling
  root.style.setProperty('--org-primary', primaryHex);
  root.style.setProperty('--org-primary-hover', darken(primaryHex, 10));
  root.style.setProperty('--org-primary-foreground', getContrastForeground(primaryHex));
  root.setAttribute('data-org-id', orgId);
}
```

### Tier 3: Component Tokens (only when deviating from semantic defaults)

```css
/* Inside button.css or as @layer components */
.btn-primary {
  --button-bg:      var(--color-primary);
  --button-text:    var(--color-primary-foreground);
  --button-radius:  var(--radius-md);
  --button-padding: var(--space-3) var(--space-6);

  background: var(--button-bg);
  color: var(--button-text);
  border-radius: var(--button-radius);
  padding: var(--button-padding);
}
```

---

## Trade-offs

| Decision | Pro | Con |
|---|---|---|
| Three-tier hierarchy | Theming is a token swap, zero component changes | More initial setup; more files to manage |
| CSS custom properties over JS theme objects | Runtime-dynamic, works in vanilla CSS | Slightly more verbose syntax |
| Semantic tier naming by intent | Self-documenting; robust to palette changes | Requires discipline to not leak primitive names |
| Tailwind `@theme` registration | Generates utility classes AND CSS vars simultaneously | Tailwind v4 only; requires migration from v3 |

---

## Gotchas

**`@theme` tokens must be defined before `@layer base` in Tailwind v4.** Order matters in the CSS file. Put `@import "tailwindcss"` first, then `@theme`, then `@layer base`.

**Org brand color arrives as HEX from the database.** You cannot use it directly in `oklch()`. Either convert at the point of storage (store as oklch), or use the hex value as-is for the CSS variable and accept that it won't participate in OKLCH-based palette generation.

**Dark mode token gaps cause invisible text.** If you add a new semantic color token for light mode but forget to define it in `.dark`, the token resolves to the light value in dark mode and content becomes unreadable. Audit: every token defined in `:root` needs a `.dark` counterpart if it's used in both modes.

**`var()` references in `@theme` can cause circular resolution.** Do not reference a semantic token inside `@theme` that itself references another `@theme` token. Point `@theme` entries at primitives or final computed values, not at other `@theme` entries.

**Component-level token overrides via `className` do not cascade** the way CSS inheritance does. If you set `--button-bg` on a parent, it will not affect a button nested inside unless that button uses `var(--button-bg)` explicitly. Be deliberate about scope.
