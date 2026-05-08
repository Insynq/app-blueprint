# UI_KB_3 — Typography System

---

## Pattern

Typography in a design system is defined as a named scale of font-size tokens, a documented heading hierarchy, and a maximum of three font-family roles. Every text element references a token from the scale — no arbitrary pixel values. Heading levels are semantic (HTML `h1`–`h4`) with visual styling controlled by CSS class, never by changing the element for visual effect.

---

## When to Use / When to Skip

**Always define a named type scale.** Even a 6-step scale is better than arbitrary sizes.

**Skip the display font role** unless the brand explicitly requires a distinct heading typeface. Two roles (sans + mono) are sufficient for 90% of SaaS products.

**Skip fluid/`clamp()` typography** in application UI. Use it only on marketing pages where text must scale continuously with viewport. In app UIs, breakpoint-based steps are more predictable and easier to debug.

---

## Anti-Patterns

**Arbitrary font sizes scattered across components.**
```tsx
// WRONG
<h2 className="text-[22px]">Section Title</h2>
<p className="text-[15px]">Body text</p>
```
These accumulate into a chaotic pseudo-scale. Use named tokens only.

**Changing heading level for visual sizing.**
```tsx
// WRONG — using h4 because you want small text, not because it's a sub-subsection
<h4 className="text-xl font-semibold">Section Title</h4>
// RIGHT — keep semantic level, control size with class
<h2 className="text-xl font-semibold">Section Title</h2>
```
Screen readers use heading levels to build the page outline. Skipping levels or using them for aesthetics breaks navigation for assistive technology users.

**Undefined `--font-heading` that silently falls back to `--font-sans`.**
If both tokens resolve to the same font family, remove the redundant token. Having it creates confusion and a false impression that a distinct heading font is in use.

**No documented max line width (measure).**
Text that spans 1200px wide on a large monitor is unreadable. Every prose/body text container needs `max-width: 65ch` or equivalent.

**Hardcoding `line-height: 1` on headings globally.**
Headings with descenders or multi-line wrapping need at least `1.1`. `line-height: 1` clips descenders in many typefaces.

---

## Generic Example

### Type Scale Tokens

```css
@layer base {
  :root {
    /* Font families */
    --font-sans:  'Inter', 'Geist', system-ui, sans-serif;
    --font-mono:  'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
    /* --font-display: 'Cal Sans', var(--font-sans); -- only if brand requires it */

    /* Font size scale */
    --font-size-xs:   0.75rem;    /* 12px */
    --font-size-sm:   0.875rem;   /* 14px */
    --font-size-base: 1rem;       /* 16px */
    --font-size-lg:   1.125rem;   /* 18px */
    --font-size-xl:   1.25rem;    /* 20px */
    --font-size-2xl:  1.5rem;     /* 24px */
    --font-size-3xl:  1.875rem;   /* 30px */
    --font-size-4xl:  2.25rem;    /* 36px */
    --font-size-5xl:  3rem;       /* 48px */

    /* Font weights */
    --font-weight-normal:   400;
    --font-weight-medium:   500;
    --font-weight-semibold: 600;
    --font-weight-bold:     700;

    /* Line heights */
    --leading-tight:  1.15;   /* headings */
    --leading-snug:   1.35;   /* subheadings */
    --leading-normal: 1.50;   /* body text */
    --leading-relaxed: 1.65;  /* long-form prose */

    /* Letter spacing */
    --tracking-tight:  -0.03em;  /* large display headings */
    --tracking-normal:  0em;
    --tracking-wide:    0.05em;  /* caps labels, badges */

    /* Measure (max line width for readability) */
    --measure-prose: 65ch;
    --measure-narrow: 45ch;
  }
}

/* Register with Tailwind v4 */
@theme {
  --font-family-sans: var(--font-sans);
  --font-family-mono: var(--font-mono);
  --font-size-xs:   var(--font-size-xs);
  --font-size-sm:   var(--font-size-sm);
  --font-size-base: var(--font-size-base);
  --font-size-lg:   var(--font-size-lg);
  --font-size-xl:   var(--font-size-xl);
  --font-size-2xl:  var(--font-size-2xl);
  --font-size-3xl:  var(--font-size-3xl);
  --font-size-4xl:  var(--font-size-4xl);
}
```

### Heading Hierarchy — Usage Rules

```
h1  →  Page title. One per page. font-size: 3xl–4xl. font-weight: bold. leading: tight. tracking: tight.
h2  →  Major section. font-size: 2xl. font-weight: semibold. leading: snug.
h3  →  Subsection within h2. font-size: xl. font-weight: semibold. leading: snug.
h4  →  Rarely needed. font-size: lg. font-weight: medium.
```

```tsx
// Correct pattern: semantic element + visual class
// Never change the h-level for visual sizing

// Page title
<h1 className="text-3xl font-bold leading-tight tracking-tight text-[--color-text-default]">
  Dashboard
</h1>

// Section heading
<h2 className="text-2xl font-semibold leading-snug text-[--color-text-default]">
  Recent Activity
</h2>

// Card heading (visually smaller, semantically still a section heading)
<h2 className="text-lg font-semibold text-[--color-text-default]">
  Quick Stats
</h2>
```

### Prose / Body Text

```tsx
// Long-form readable text — constrain width
<div className="max-w-[65ch] text-base leading-normal text-[--color-text-default]">
  <p>Body paragraph...</p>
</div>

// Secondary / muted text
<p className="text-sm leading-normal text-[--color-text-muted]">
  Caption or helper text
</p>

// Label (for form fields, data table headers)
<label className="text-sm font-medium text-[--color-text-default]">
  Field Label
</label>

// Badge / tag text (uppercase, wide tracking)
<span className="text-xs font-semibold uppercase tracking-wide">
  STATUS
</span>

// Code / technical string
<code className="font-mono text-sm bg-[--color-surface-raised] px-1.5 py-0.5 rounded">
  entity_id
</code>
```

### Responsive Type

```tsx
// Page title scales at lg breakpoint only
<h1 className="text-2xl lg:text-4xl font-bold leading-tight tracking-tight">
  Page Title
</h1>

// Most UI text does NOT need responsive scaling — keep static
<p className="text-base leading-normal">
  Body text at all sizes
</p>
```

---

## Trade-offs

| Decision | Pro | Con |
|---|---|---|
| Named scale (xs→5xl) over arbitrary values | Consistent rhythm; easy to enforce via linting | Requires buy-in; devs default to arbitrary values without discipline |
| Semantic heading levels, styled with CSS | Accessible document outline; correct screen reader behavior | Requires overriding default browser heading styles explicitly |
| 2 font roles (sans + mono) | Simple; fast to load; consistent | Limits brand expression; display fonts require another role |
| Static (non-fluid) type in app UI | Predictable; debuggable | Requires breakpoint overrides for responsive headings |

---

## Gotchas

**`font-sans` and `font-heading` silently resolving to the same family.** If you define `--font-heading: var(--font-sans)` without a distinct family, every usage of `font-heading` is invisible noise. Audit and remove redundant font role tokens.

**Tailwind v4 font-family utilities require `font-family-*` namespace in `@theme`.** The token `--font-sans` in `@theme` does NOT automatically generate `font-sans` utility. Must be `--font-family-sans`.

**System font stack fallbacks matter.** Inter may not be loaded in all environments. Always end font stacks with a generic family: `system-ui, sans-serif` or `ui-monospace, monospace`.

**`text-[--color-text-default]` syntax requires Tailwind v4.** In v3, CSS variable references in arbitrary values work differently. Confirm v4 is in use before applying this pattern.

**Letter spacing on headings should be negative (tight), not positive.** Large headings with default or wide letter spacing look amateurish. Apply `tracking-tight` or `--tracking-tight: -0.03em` to h1 and h2.

**Line height on single-line UI text (badges, buttons, labels) should be `1` or `1.15`.** Loose line height on short text creates unexpected vertical padding that breaks alignment with adjacent elements.
