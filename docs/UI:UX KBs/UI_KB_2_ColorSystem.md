# UI_KB_2 — Color System Design

---

## Pattern

A complete color system starts from a brand color and generates a structured palette with semantic roles for every UI state. OKLCH is the authoring format. Semantic tokens map roles (primary, success, warning) to palette values — components never reference raw color values. Multi-tenant branding is handled via a CSS variable scope override, not component props.

---

## When to Use / When to Skip

**Always implement a full semantic color system.** Even single-tenant projects benefit from the semantic layer when dark mode is in scope.

**Skip the component-level color token tier** for small projects. Semantic tokens are sufficient until a component needs a color that genuinely deviates from the semantic defaults (rare).

**Skip custom palette generation** when using a third-party brand color that arrives from a database. Store it as-is, apply it to `--color-primary` and its derived tokens, and move on. Do not attempt to generate a full 10-step scale from an arbitrary org color at runtime.

---

## Anti-Patterns

**Using HSL for design system authoring.**
HSL's lightness is not perceptually uniform — `hsl(210 80% 50%)` and `hsl(120 80% 50%)` have the same `L` value but dramatically different perceived brightness. This causes accessibility failures and unpredictable dark-mode behavior. Use OKLCH.

**Color as the only status indicator.**
A red badge communicates nothing to colorblind users. Always pair color with a text label or icon.

**Redefining status colors per-component.**
```tsx
// WRONG — this pattern repeated across the codebase
<span className="bg-amber-50 text-amber-800 border-amber-200">Pending</span>
```
Define `--status-warning-bg/text/border` once. Use everywhere.

**Overriding primitive tokens for org theming.**
```css
/* WRONG */
[data-org="acme"] { --blue-500: #10b981; }
```
This corrupts every component that references `--blue-500` for non-brand purposes. Override only `--color-primary` and its foreground/hover derivatives.

**Not accounting for contrast on brand color backgrounds.**
Org brand colors vary wildly in lightness. A dark navy primary (`#0f172a`) and a light cyan (`#06b6d4`) both need different foreground colors. Always compute or store `--color-primary-foreground` alongside the primary.

---

## Generic Example

### Complete Semantic Color Role Set

```css
:root {
  /* ── Surface ── */
  --color-background:       oklch(1.00 0.00   0);   /* page bg */
  --color-surface:          oklch(0.98 0.00   0);   /* card/panel */
  --color-surface-raised:   oklch(0.95 0.00   0);   /* dropdown, tooltip */
  --color-surface-overlay:  oklch(0.00 0.00   0 / 0.40); /* modal backdrop */

  /* ── Text ── */
  --color-text-default:     oklch(0.20 0.00   0);
  --color-text-muted:       oklch(0.55 0.00   0);
  --color-text-disabled:    oklch(0.75 0.00   0);
  --color-text-inverse:     oklch(1.00 0.00   0);
  --color-text-link:        var(--color-primary);

  /* ── Border ── */
  --color-border-default:   oklch(0.88 0.00   0);
  --color-border-strong:    oklch(0.70 0.00   0);
  --color-border-focus:     var(--color-primary);

  /* ── Brand/Action ── */
  --color-primary:          oklch(0.55 0.20 250);
  --color-primary-hover:    oklch(0.48 0.20 250);
  --color-primary-active:   oklch(0.42 0.20 250);
  --color-primary-subtle:   oklch(0.96 0.04 250);   /* tinted bg */
  --color-primary-foreground: oklch(1.00 0.00   0);

  /* ── Status: Success ── */
  --status-success:         oklch(0.60 0.18 145);
  --status-success-bg:      oklch(0.97 0.04 145);
  --status-success-border:  oklch(0.82 0.10 145);
  --status-success-text:    oklch(0.35 0.12 145);

  /* ── Status: Warning ── */
  --status-warning:         oklch(0.72 0.18  75);
  --status-warning-bg:      oklch(0.97 0.04  75);
  --status-warning-border:  oklch(0.82 0.10  75);
  --status-warning-text:    oklch(0.40 0.14  75);

  /* ── Status: Destructive ── */
  --status-destructive:     oklch(0.55 0.22  25);
  --status-destructive-bg:  oklch(0.97 0.04  25);
  --status-destructive-border: oklch(0.80 0.12 25);
  --status-destructive-text:oklch(0.38 0.16  25);

  /* ── Status: Info ── */
  --status-info:            oklch(0.55 0.20 250);
  --status-info-bg:         oklch(0.97 0.04 250);
  --status-info-border:     oklch(0.82 0.10 250);
  --status-info-text:       oklch(0.35 0.14 250);

  /* ── Status: Neutral (pending/draft) ── */
  --status-neutral:         oklch(0.55 0.00   0);
  --status-neutral-bg:      oklch(0.95 0.00   0);
  --status-neutral-border:  oklch(0.82 0.00   0);
  --status-neutral-text:    oklch(0.35 0.00   0);
}
```

### Dark Mode Token Overrides

```css
.dark {
  --color-background:      oklch(0.12 0.00 0);
  --color-surface:         oklch(0.17 0.00 0);
  --color-surface-raised:  oklch(0.22 0.00 0);
  --color-text-default:    oklch(0.92 0.00 0);
  --color-text-muted:      oklch(0.62 0.00 0);
  --color-text-disabled:   oklch(0.42 0.00 0);
  --color-border-default:  oklch(0.28 0.00 0);
  --color-border-strong:   oklch(0.45 0.00 0);
  --color-primary:         oklch(0.65 0.18 250); /* lighter in dark mode */
  --color-primary-hover:   oklch(0.72 0.18 250);
  --color-primary-subtle:  oklch(0.20 0.06 250);

  /* Status backgrounds need to be darker in dark mode */
  --status-success-bg:     oklch(0.20 0.06 145);
  --status-warning-bg:     oklch(0.20 0.06  75);
  --status-destructive-bg: oklch(0.20 0.06  25);
  --status-info-bg:        oklch(0.20 0.06 250);
}
```

### Multi-Tenant Brand Override

```css
/* Applied via JS on mount using org's stored primary color */
[data-org-id] {
  --color-primary:            var(--org-primary);
  --color-primary-hover:      var(--org-primary-hover);
  --color-primary-active:     var(--org-primary-active);
  --color-primary-subtle:     var(--org-primary-subtle);
  --color-primary-foreground: var(--org-primary-foreground);
  --color-border-focus:       var(--org-primary);
}
```

```tsx
// utils/branding.ts
export function applyOrgBranding(org: { primary_color: string }) {
  const el = document.documentElement;
  const hex = org.primary_color;

  // Store hex directly — browser will use it as-is
  el.style.setProperty('--org-primary', hex);

  // Derive hover/active by lightness manipulation
  // For OKLCH: parse and adjust L channel
  // Simple fallback: use opacity layers or CSS filter
  el.style.setProperty('--org-primary-hover', adjustHex(hex, -10));
  el.style.setProperty('--org-primary-active', adjustHex(hex, -20));
  el.style.setProperty('--org-primary-subtle', hexToRgba(hex, 0.08));
  el.style.setProperty('--org-primary-foreground', getContrastColor(hex));
}
```

### OKLCH Syntax Reference

```
oklch(L C H / alpha)

L = Lightness: 0 (black) → 1 (white)
C = Chroma:    0 (gray)  → ~0.4 (max saturation; varies by hue)
H = Hue:       0–360 degrees (red=25, yellow=75, green=145, blue=250, purple=300)
alpha = optional transparency

Examples:
oklch(0.55 0.20 250)      -- medium blue
oklch(0.92 0.00 0)        -- near-white gray
oklch(0.60 0.18 145)      -- medium green
oklch(0.72 0.18 75)       -- amber/yellow
oklch(0.55 0.22 25)       -- red
oklch(0.20 0.00 0)        -- near-black
```

---

## Trade-offs

| Decision | Pro | Con |
|---|---|---|
| OKLCH throughout | Perceptually uniform; wide gamut; accessible | Not natively readable without tooling; harder to eyeball values |
| Semantic status tokens (4 bg/border/text per status) | Pixel-perfect consistent across all surfaces | Verbose to define; 20+ status tokens per theme |
| Class-based dark mode (`.dark`) | User-togglable; works in SSR | Requires JS to apply class; flash of wrong theme if not handled |
| `[data-org-id]` brand scoping | Clean cascade; multiple orgs per page possible | Requires JS to set attribute; one extra DOM attribute |

---

## Gotchas

**OKLCH hue shift in blue-purple range.** Values between hue 270–330 can produce unexpected hue shifts when adjusting lightness or chroma. Test blue and purple swatches carefully in dark mode. Prefer hue 250 for a stable blue.

**Org brand colors often fail contrast.** A brand color passed from a database is not guaranteed to meet 4.5:1 contrast against white. Always compute `--color-primary-foreground` dynamically — never assume white or black works.

**Status color backgrounds in dark mode.** A light-mode `--status-success-bg: oklch(0.97 0.04 145)` (near-white tint) is invisible on a dark surface. Every status background token needs a dark mode override.

**Browser support fallback for OKLCH.** OKLCH is supported in all modern browsers (Chrome 111+, Safari 16.4+, Firefox 128+) — the baseline Tailwind v4 targets. No fallback needed for these targets. If supporting older browsers, provide `@supports` fallbacks with hex equivalents.

**`color-mix()` for derived tokens.** Modern CSS allows `--color-primary-hover: color-mix(in oklch, var(--color-primary) 85%, black)` — this is a cleaner alternative to manually specifying hover values, but requires the browser to support `color-mix()` with OKLCH (all targets do).
