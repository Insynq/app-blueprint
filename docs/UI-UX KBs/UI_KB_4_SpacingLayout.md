# UI_KB_4 — Spacing & Layout System

---

## Pattern

All spacing derives from a base-4px scale. Layout is built from named primitives (stack, cluster, grid, sidebar) rather than one-off flex/grid rules. Content is always constrained by a max-width. Breakpoints follow mobile-first min-width convention. Gap is preferred over margin for component-internal spacing.

---

## When to Use / When to Skip

**Always use the base-4 scale.** Never invent spacing values outside the scale except for 1px/2px hairline cases.

**Skip the full layout primitive library** for simple pages. Start with direct Tailwind utilities. Extract a layout primitive component only when the same structure repeats 3+ times across different features.

**Skip responsive breakpoint overrides** for most UI text and inner-component spacing. Responsive layout changes at the page/shell level are enough for most SaaS apps — inner components typically look fine at all breakpoints with fixed spacing.

---

## Anti-Patterns

**Arbitrary spacing values.**
```tsx
// WRONG
<div className="mt-[22px] pb-[13px]">
```
Everything should land on a scale step (4, 8, 12, 16, 20, 24, 32, 40, 48, 64...). If you need 22px, the design needs adjustment, not the scale.

**Mixing margin and gap on the same axis.**
```tsx
// WRONG — gap between flex children AND margin on individual children
<div className="flex gap-4">
  <Card className="mr-2">...</Card>
</div>
```
Pick one. `gap` on the parent, no margin on children.

**Full-width text on large screens.**
```tsx
// WRONG — text stretches 1400px on a 4K monitor
<p className="w-full">Long body text paragraph...</p>
// RIGHT
<p className="max-w-[65ch]">Long body text paragraph...</p>
```

**Positive `tabindex` values in layout components** — covered in accessibility, but layout templates often add these accidentally. Every layout shell should be audited for `tabindex > 0`.

**Desktop-first responsive styles.**
```tsx
// WRONG — starts full and tries to collapse
<div className="grid grid-cols-3 md:grid-cols-1">
// RIGHT — starts single, expands
<div className="grid grid-cols-1 md:grid-cols-3">
```

---

## Generic Example

### Spacing Scale Token Reference

```
Token         rem     px
─────────────────────────
--space-px    0.0625  1
--space-0.5   0.125   2
--space-1     0.25    4
--space-2     0.50    8
--space-3     0.75    12
--space-4     1.00    16
--space-5     1.25    20
--space-6     1.50    24
--space-8     2.00    32
--space-10    2.50    40
--space-12    3.00    48
--space-16    4.00    64
--space-20    5.00    80
--space-24    6.00    96
```

Tailwind v4 generates all of these automatically from its default spacing scale. Reference them as `p-4`, `gap-6`, `mt-12`, etc.

### Layout Primitives

**Stack — vertical list with uniform gap**
```tsx
// Use for: form fields, card content, list items, page sections
function Stack({ gap = 'gap-4', children, className }: StackProps) {
  return (
    <div className={cn('flex flex-col', gap, className)}>
      {children}
    </div>
  );
}

// Usage
<Stack gap="gap-6">
  <SectionHeader />
  <ContentBlock />
  <ActionBar />
</Stack>
```

**Cluster — horizontal group, wraps on overflow**
```tsx
// Use for: tag lists, button groups, filter chips, breadcrumbs
function Cluster({ gap = 'gap-2', align = 'items-center', children, className }: ClusterProps) {
  return (
    <div className={cn('flex flex-wrap', gap, align, className)}>
      {children}
    </div>
  );
}

// Usage
<Cluster gap="gap-2">
  <Badge>React</Badge>
  <Badge>TypeScript</Badge>
  <Badge>Tailwind</Badge>
</Cluster>
```

**Grid — responsive column layout**
```tsx
// Use for: card grids, stat dashboards, feature lists
function Grid({ cols = 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3', gap = 'gap-6', children, className }: GridProps) {
  return (
    <div className={cn('grid', cols, gap, className)}>
      {children}
    </div>
  );
}
```

**Sidebar — fixed-width aside + fluid main**
```tsx
// Use for: page layout with nav sidebar
function SidebarLayout({ sidebar, children }: SidebarLayoutProps) {
  return (
    <div className="flex min-h-screen">
      <aside className="w-64 shrink-0 border-r border-[--color-border-default]">
        {sidebar}
      </aside>
      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}
```

### Container Width Conventions

```tsx
// Narrow — forms, dialogs, auth pages
<div className="max-w-sm mx-auto">      {/* 384px */}
<div className="max-w-md mx-auto">      {/* 448px */}
<div className="max-w-lg mx-auto">      {/* 512px */}

// Standard — content pages, settings
<div className="max-w-2xl mx-auto">     {/* 672px */}
<div className="max-w-3xl mx-auto">     {/* 768px */}

// Wide — dashboards, data tables
<div className="max-w-5xl mx-auto">     {/* 1024px */}
<div className="max-w-6xl mx-auto">     {/* 1152px */}
<div className="max-w-7xl mx-auto">     {/* 1280px */}

// Full-bleed — shell/page wrapper only
<div className="w-full">
```

### Standard Page Layout Shell

```tsx
function PageLayout({ header, sidebar, children }: PageLayoutProps) {
  return (
    <div className="min-h-screen bg-[--color-background]">
      {/* Sticky header */}
      <header className="sticky top-0 z-[--z-nav] h-16 border-b border-[--color-border-default] bg-[--color-surface]/90 backdrop-blur-sm">
        {header}
      </header>

      <div className="flex">
        {/* Sidebar — hidden on mobile, visible md+ */}
        {sidebar && (
          <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col border-r border-[--color-border-default] min-h-[calc(100vh-4rem)]">
            {sidebar}
          </aside>
        )}

        {/* Main content */}
        <main className="flex-1 min-w-0 p-6 lg:p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
```

### Breakpoints Reference

```
Default (mobile):  < 640px
sm:                ≥ 640px    large phones
md:                ≥ 768px    tablets, small laptops
lg:                ≥ 1024px   laptops
xl:                ≥ 1280px   desktops
2xl:               ≥ 1536px   large monitors
```

**Mobile drawer breakpoint:** `< md` (768px). Admin sidebar collapses to hamburger below this.

---

## Trade-offs

| Decision | Pro | Con |
|---|---|---|
| Base-4 scale | Consistent visual rhythm; maps to Tailwind defaults | Requires discipline; devs reach for arbitrary values |
| Gap over margin | Predictable; easier to reason about; no margin collapse | Parent must be flex/grid; requires more intentional container structure |
| Max-width on all content containers | Readable at all screen sizes | Easy to forget on new pages; must be enforced in code review |
| Mobile-first breakpoints | Simpler override chain; better reflects usage patterns | Counter-intuitive for desktop-first thinkers |

---

## Gotchas

**`min-w-0` on flex children prevents content overflow.** When a flex child contains a long string or wide table, it can push past its container. Always add `min-w-0` to flex children that contain unbounded content.

**`sticky` positioning requires all ancestors to have `overflow: visible`.** A sticky header inside a parent with `overflow: hidden` or `overflow: auto` will not stick. Check the ancestor chain when sticky breaks.

**`min-h-screen` vs `min-h-svh`.** On mobile browsers with retractable UI bars, `100vh` is the full height including the browser chrome — content gets clipped. Use `min-h-svh` (small viewport height) for full-page layouts on mobile.

**`gap` in flex does not work in older Safari versions** (pre-14.1). Tailwind v4's browser targets (Safari 16.4+) make this a non-issue for new projects. Confirm target before using `flex` + `gap`.

**Content inside `max-w-` containers is not centered** without `mx-auto`. Always pair `max-w-*` with `mx-auto` when centering.

**Sidebar width must be `shrink-0`** in flex layouts. Without it, the sidebar compresses when the main content area is too wide.
