# UI_KB_6 — Interaction & Motion Design

---

## Pattern

Animation serves one purpose: make state changes legible without introducing delay. The default stance is no animation — add motion only when its absence would be disorienting. Timing is short (100–400ms). Every animation respects `prefers-reduced-motion`. Skeleton loaders replace spinners wherever the content layout is known in advance.

---

## When to Use / When to Skip

**Use animation for:**
- Overlays entering/exiting the viewport (modal, sheet, dropdown)
- State transitions that reorder, add, or remove visible content
- Loading states longer than 300ms
- Micro-interactions confirming a user action (checkbox check, task complete)
- Milestone/completion celebrations (onboarding phase complete — once, not repeated)

**Skip animation for:**
- Inline content updates (a number changing, a label updating)
- Any interaction in dense admin tooling where speed is the priority
- Navigation between routes (SPA route changes should be near-instant; a fade adds latency without clarity)
- Hover states on buttons/links (color/background transition is enough; scale transforms on links are unnecessary)

---

## Anti-Patterns

**Long or complex animations in productivity UIs.**
A 600ms modal open animation in a tool where admins open modals dozens of times per session is an immediate pain point. Keep overlays at ≤250ms.

**Spinner for content with known layout.**
```tsx
// WRONG — spinner where layout is predictable
if (isLoading) return <Spinner />;
return <UserCard user={data} />;

// RIGHT — skeleton matching the content shape
if (isLoading) return <UserCardSkeleton />;
return <UserCard user={data} />;
```

**Animation without `prefers-reduced-motion` handling.**
```css
/* WRONG — no reduced motion handling */
.modal { animation: slideIn 300ms ease-out; }

/* RIGHT */
.modal { animation: slideIn 300ms ease-out; }
@media (prefers-reduced-motion: reduce) {
  .modal { animation: none; opacity: 1; }
}
```

**Scale transforms on interactive elements for hover.**
```tsx
// WRONG — scale on hover feels toyish in B2B context
<button className="hover:scale-105 transition-transform">Save</button>
// RIGHT — color/background shift only
<button className="hover:bg-[--color-primary-hover] transition-colors">Save</button>
```

**Animating expensive CSS properties.** Never animate `width`, `height`, `top`, `left`, `margin`, or `padding` — these trigger layout recalculation. Animate only `transform` and `opacity`.

---

## Generic Example

### Timing Token Reference

```css
:root {
  --duration-instant: 50ms;   /* focus ring appearance */
  --duration-fast:   100ms;   /* hover color change */
  --duration-normal: 200ms;   /* dropdown open, tooltip */
  --duration-slow:   300ms;   /* modal/sheet open */
  --duration-deliberate: 400ms; /* milestone celebration entrance */

  --ease-out:     cubic-bezier(0.0, 0.0, 0.2, 1.0);  /* elements entering */
  --ease-in:      cubic-bezier(0.4, 0.0, 1.0, 1.0);  /* elements leaving */
  --ease-in-out:  cubic-bezier(0.4, 0.0, 0.2, 1.0);  /* elements moving */
  --ease-spring:  cubic-bezier(0.34, 1.56, 0.64, 1.0); /* playful bounce — celebrations only */
}
```

### Tailwind Transition Utilities

```tsx
// Color/background transitions (buttons, links, nav items)
<button className="transition-colors duration-[--duration-fast]">...</button>

// Opacity transitions (tooltips, overlays)
<div className="transition-opacity duration-[--duration-normal]">...</div>

// Combined transform + opacity (modals, dropdowns)
<div className="transition-[transform,opacity] duration-[--duration-slow] ease-[--ease-out]">...</div>
```

### Modal / Sheet Entry Animation (Tailwind + Radix)

```tsx
// In your shadcn DialogContent, add data-state animations
// globals.css
@layer base {
  [data-state='open'] {
    animation: overlayShow var(--duration-slow) var(--ease-out);
  }
  [data-state='closed'] {
    animation: overlayHide var(--duration-normal) var(--ease-in);
  }

  @keyframes overlayShow {
    from { opacity: 0; transform: translateY(8px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)   scale(1); }
  }
  @keyframes overlayHide {
    from { opacity: 1; transform: translateY(0)   scale(1); }
    to   { opacity: 0; transform: translateY(8px) scale(0.97); }
  }

  @media (prefers-reduced-motion: reduce) {
    [data-state='open'],
    [data-state='closed'] { animation: none; }
  }
}
```

### Skeleton Loader Pattern

```tsx
// Skeleton primitive
function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-[--radius-md] bg-[--color-surface-raised]',
        className
      )}
      aria-hidden="true"
    />
  );
}

// Skeleton that matches real component structure
function UserCardSkeleton() {
  return (
    <div className="flex gap-3 p-4 border border-[--color-border-default] rounded-[--radius-lg]">
      <Skeleton className="h-10 w-10 rounded-full shrink-0" />  {/* avatar */}
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-[60%]" />  {/* name */}
        <Skeleton className="h-3 w-[40%]" />  {/* email */}
      </div>
    </div>
  );
}

// Usage — always render skeleton, never spinner, for known layouts
function UserCard({ userId }: { userId: string }) {
  const { data, isLoading } = useUser(userId);
  if (isLoading) return <UserCardSkeleton />;
  return <div>...{data.name}...</div>;
}
```

### Task Completion Micro-interaction (Onboarding)

```tsx
// Checkbox-style task completion with animation
function TaskCheckbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        'h-5 w-5 rounded-[--radius-sm] border-2 transition-all duration-[--duration-fast]',
        'focus-visible:ring-2 focus-visible:ring-[--color-border-focus] focus-visible:ring-offset-2',
        checked
          ? 'bg-[--status-success] border-[--status-success] text-white'
          : 'border-[--color-border-strong] bg-transparent hover:border-[--color-primary]'
      )}
    >
      {checked && (
        <svg className="h-3 w-3 mx-auto" viewBox="0 0 12 12" aria-hidden>
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
        </svg>
      )}
    </button>
  );
}
```

### Milestone Celebration (Phase Complete)

```tsx
// Triggered once when a phase transitions to verified-complete
// Use sparingly — only at meaningful thresholds
function PhaseCompleteCelebration({ phaseName, onContinue }: CelebrationProps) {
  return (
    <div
      className="fixed inset-0 z-[--z-modal] flex items-center justify-center bg-[--color-surface-overlay]"
      style={{ animation: 'fadeIn 300ms ease-out' }}
    >
      <div
        className="bg-[--color-surface] rounded-[--radius-xl] p-8 max-w-md w-full text-center shadow-xl"
        style={{ animation: 'slideUp 400ms cubic-bezier(0.34,1.56,0.64,1.0)' }}
      >
        <div className="text-4xl mb-4" aria-hidden>🎉</div>
        <h2 className="text-2xl font-bold text-[--color-text-default] mb-2">
          {phaseName} Complete!
        </h2>
        <p className="text-[--color-text-muted] mb-6">
          Great work. Keep the momentum going.
        </p>
        <Button onClick={onContinue}>Continue to Next Phase →</Button>
      </div>
    </div>
  );
}
```

---

## Trade-offs

| Decision | Pro | Con |
|---|---|---|
| Animate only transform + opacity | GPU-composited; no layout reflow; smooth | Cannot animate size changes directly (use `max-height` trick for accordions) |
| Skeleton over spinner | Better perceived performance; layout stability | Requires building a matching skeleton for every component |
| Radix `data-state` attribute animations | Integrates cleanly with headless UI | Requires CSS keyframe definitions; no JS animation library needed |
| Short default durations (200–300ms) | Feels snappy and professional | Celebrations and entries may feel abrupt if not tuned per-case |

---

## Gotchas

**`animate-pulse` in Tailwind uses `opacity`.** The default pulse animation shifts between `opacity: 1` and `opacity: 0.5`. On very light surfaces, the contrast difference is subtle. Increase contrast by using a darker skeleton background (`--color-surface-raised` vs `--color-surface`).

**Radix `data-state='closed'` animation requires content to remain mounted during exit.** If you unmount the component immediately on close, the exit animation never plays. Radix handles this automatically — do not add early `return null` inside `DialogContent` or similar.

**`prefers-reduced-motion` must be set at the CSS level, not just in JS.** Some users have reduced motion set at OS level. A global CSS rule is more reliable than checking the media query in JavaScript for every animation.

**Spring/bounce easing (`ease-spring`) is for celebrations only.** Using spring physics on standard UI transitions (dropdowns, buttons) reads as playful/immature in professional tools. Reserve it for milestone moments.

**Accordion max-height animation.** Animating `height: auto` → `height: 0` requires `max-height` as a proxy. Set `max-height` to a value larger than any possible content height. This causes a timing mismatch on very short content (closes faster than the animation). Radix Accordion handles this with CSS custom properties on the content element — use it instead of rolling your own.
