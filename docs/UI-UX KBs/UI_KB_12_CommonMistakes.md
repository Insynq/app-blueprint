# UI_KB_12 — Common Agent Mistakes

---

## Pattern

This file is a consolidated, indexed anti-pattern reference. It covers the most frequent mistakes made when building React/Tailwind/shadcn UIs. Every item includes the wrong pattern, the right pattern, and the reason. Use this file during code review, before shipping a component, or when debugging a UI issue that seems hard to pin down.

Cross-reference with topic-specific files for full context.

---

## Index

1. [Token & Color Mistakes](#1-token--color-mistakes)
2. [Typography Mistakes](#2-typography-mistakes)
3. [Spacing & Layout Mistakes](#3-spacing--layout-mistakes)
4. [Component Architecture Mistakes](#4-component-architecture-mistakes)
5. [Status & Feedback Mistakes](#5-status--feedback-mistakes)
6. [Accessibility Mistakes](#6-accessibility-mistakes)
7. [Tailwind v4 / shadcn Mistakes](#7-tailwind-v4--shadcn-mistakes)
8. [Multi-Tenant / Role-Based Mistakes](#8-multi-tenant--role-based-mistakes)
9. [Onboarding Pattern Mistakes](#9-onboarding-pattern-mistakes)

---

## 1. Token & Color Mistakes

**Hardcoding color values in components.**
```tsx
// WRONG
<div className="bg-[#1D4ED8] text-white">
<div style={{ color: 'oklch(0.55 0.20 250)' }}>
// RIGHT
<div className="bg-[--color-primary] text-[--color-primary-foreground]">
```
Reason: hardcoded values are invisible to the theming system. Org branding and dark mode will miss this element.

**Ad-hoc status colors at every callsite.**
```tsx
// WRONG — same status redefined differently across the app
<span className="bg-amber-50 text-amber-800 border-amber-200">Pending</span>
<span className="bg-yellow-100 text-yellow-700 border-yellow-300">In Review</span>
// RIGHT — single semantic badge component
<Badge variant="warning">Pending</Badge>
```
Reason: inconsistent visual treatment; impossible to change status color system-wide.

**Referencing primitive tokens directly in components.**
```tsx
// WRONG — component knows about palette internals
<button className="bg-[--blue-500]">
// RIGHT — component references semantic intent
<button className="bg-[--color-primary]">
```
Reason: changes to the palette require touching every component that references primitives.

**Org brand color applied only to the header.**
Reason: `--org-primary` set on the header via branding config but never consumed below it. Set it on `:root` or on a wrapper `[data-org-id]` scope. See `UI_KB_2`.

**No dark mode counterpart for a new semantic token.**
Reason: missing `.dark` override means the light-mode value shows in dark mode, producing invisible text or clashing backgrounds.

---

## 2. Typography Mistakes

**Arbitrary font sizes.**
```tsx
// WRONG
<h2 className="text-[22px] font-[550]">
// RIGHT
<h2 className="text-2xl font-semibold">
```
Reason: breaks the visual rhythm established by the type scale; impossible to enforce consistency.

**Using a heading level for visual sizing, not semantic structure.**
```tsx
// WRONG — using h4 because it's visually small, not because it's a sub-subsection
<h4 className="text-xl font-bold">Main Page Title</h4>
// RIGHT
<h1 className="text-3xl font-bold">Main Page Title</h1>
```
Reason: screen readers build a page outline from heading levels. Skipping or misusing levels breaks screen reader navigation.

**Multiple `<h1>` elements on a single page.**
Reason: the page outline becomes ambiguous for assistive technologies. One `<h1>` per page.

**No max-width on prose/body text.**
```tsx
// WRONG — text runs 1400px wide on large monitor
<p className="w-full">Long paragraph...</p>
// RIGHT
<p className="max-w-[65ch]">Long paragraph...</p>
```
Reason: line lengths above ~75 characters dramatically reduce readability.

**`--font-heading` and `--font-sans` resolving to the same font.**
Reason: redundant token with no effect. Audit and remove the duplicate. If a distinct heading font is not in use, do not define the role.

---

## 3. Spacing & Layout Mistakes

**Arbitrary spacing values.**
```tsx
// WRONG
<div className="mt-[22px] pb-[13px] gap-[11px]">
// RIGHT — use scale steps
<div className="mt-6 pb-3 gap-3">
```
Reason: breaks visual rhythm; impossible to enforce a consistent spacing system.

**Mixing `gap` and `margin` on the same axis.**
```tsx
// WRONG
<div className="flex gap-4">
  <Card className="mr-2">
// RIGHT — one or the other, not both
<div className="flex gap-4">
  <Card>
```
Reason: additive spacing produces inconsistent gaps between elements.

**No max-width on content containers.**
```tsx
// WRONG — page stretches full width
<main className="p-6">
// RIGHT
<main className="p-6 max-w-6xl mx-auto">
```
Reason: UI becomes unreadable and visually disconnected on large screens.

**Desktop-first responsive styles.**
```tsx
// WRONG
<div className="grid-cols-3 md:grid-cols-1">
// RIGHT — mobile first
<div className="grid-cols-1 md:grid-cols-3">
```
Reason: mobile-first min-width overrides have lower specificity complexity and better represent the actual usage pattern.

**`sticky` inside `overflow: hidden` parent.**
Reason: `sticky` positioning is broken by any ancestor with `overflow: hidden` or `overflow: auto`. Check the full ancestor chain when `sticky` stops working.

---

## 4. Component Architecture Mistakes

**Missing component states — only implementing the happy path.**
```tsx
// WRONG — no loading, error, empty, disabled states
function TaskList({ tasks }) {
  return tasks.map(t => <TaskItem task={t} />);
}
// RIGHT — all states handled
function TaskList({ tasks, isLoading, error }) {
  if (isLoading) return <TaskListSkeleton />;
  if (error) return <ErrorState />;
  if (tasks.length === 0) return <EmptyState />;
  return tasks.map(t => <TaskItem task={t} />);
}
```
Reason: users will always encounter loading, empty, and error states in production. Missing states produce blank screens or broken layouts.

**Building dialog/modal from scratch.**
Reason: focus trapping, Escape key, backdrop click, scroll lock, and ARIA attributes are all required. Radix Dialog handles all of them. Reimplementing is error-prone and misses edge cases.

**Prop sprawl (10+ props on a component).**
```tsx
// WRONG
<Card title icon badge badgeColor action actionLabel footer isLoading hasError />
// RIGHT — use composition
<Card>
  <Card.Header><Card.Title>{title}</Card.Title></Card.Header>
  <Card.Content>...</Card.Content>
</Card>
```
Reason: prop sprawl makes components brittle, hard to test, and difficult to read at callsites.

**Ternary hell in `className`.**
```tsx
// WRONG
className={`btn ${variant === 'primary' ? 'bg-blue-500' : variant === 'ghost' ? 'bg-transparent' : 'bg-gray-100'}`}
// RIGHT — use cva
className={buttonVariants({ variant })}
```
Reason: unreadable; no type safety; cannot be extended.

**Not exporting new components from the feature's `index.ts`.**
Reason: cross-feature imports fail at compile time. Make `index.ts` update part of the component creation flow.

---

## 5. Status & Feedback Mistakes

**Toast for destructive confirmations.**
```tsx
// WRONG — auto-dismissed before user reads it; no confirmation step
await deleteRecord(id);
toast.success('Record deleted');
// RIGHT — modal confirmation before the action
<ConfirmDialog onConfirm={handleDelete} title="Delete this record?" />
```
Reason: irreversible actions require explicit user intent. A toast is not a confirmation.

**Optimistic update without rollback.**
```tsx
// WRONG
setTasks(t => t.map(task => task.id === id ? {...task, status: 'complete'} : task));
await api.completeTask(id); // if this throws, UI is wrong forever
// RIGHT — use onMutate/onError rollback pattern from UI_KB_9
```
Reason: API failures leave the UI in an incorrect state with no recovery path.

**Color-only status differentiation.**
```tsx
// WRONG
<span className="text-green-500">{status}</span>
// RIGHT — color + icon + text label
<Badge variant="success">Verified</Badge>
```
Reason: colorblind users receive no status information. WCAG requires non-color indicators.

**No empty state for a list or table.**
Reason: a blank component renders nothing, which looks broken. Always design and implement empty states at component creation time.

**Page-level error shown at the top of the form instead of adjacent to the field.**
Reason: users must re-read the form to find which field caused the error. Place validation errors immediately below the relevant input.

---

## 6. Accessibility Mistakes

**Removing focus outline without replacement.**
```css
/* WRONG */
* { outline: none; }
/* RIGHT */
:focus-visible { outline: 2px solid var(--color-border-focus); outline-offset: 2px; }
:focus:not(:focus-visible) { outline: none; }
```
Reason: keyboard users have no visual indicator of where focus is on the page.

**Icon-only button with no accessible label.**
```tsx
// WRONG
<button onClick={handleDelete}><TrashIcon /></button>
// RIGHT
<button onClick={handleDelete} aria-label="Delete task">
  <TrashIcon aria-hidden />
</button>
```
Reason: screen reader announces "button" with no context of what the button does.

**Non-interactive element used as a button.**
```tsx
// WRONG
<div onClick={handleClick} className="cursor-pointer">Action</div>
// RIGHT
<button onClick={handleClick}>Action</button>
```
Reason: `<div>` is not keyboard-focusable, not announced as interactive, and lacks expected keyboard behavior (Enter/Space activation).

**Positive `tabindex` values.**
```tsx
// WRONG — disrupts natural tab order
<button tabIndex={2}>
// RIGHT — let DOM order determine tab order
<button>
```
Reason: positive tabindex creates a non-linear, unpredictable tab sequence that is nearly impossible to maintain.

**Not moving focus into a modal on open.**
Reason: keyboard users have no way to interact with a modal whose content isn't focused. Radix Dialog handles this — do not override its focus behavior.

**No `aria-live` region for dynamic content updates.**
```tsx
// WRONG — screen reader user doesn't know the task list updated
setTasks(updatedTasks);
// RIGHT — announce the change
setTasks(updatedTasks);
setAnnouncement(`Task marked complete. ${remaining} tasks remaining.`);
// <LiveRegion message={announcement} /> renders in DOM
```
Reason: dynamic content changes are invisible to screen reader users unless announced via an ARIA live region.

**Skipping heading levels.**
```tsx
// WRONG — jumps from h2 to h4
<h2>Section</h2>
<h4>Subsection</h4>
// RIGHT
<h2>Section</h2>
<h3>Subsection</h3>
```
Reason: screen readers announce heading levels. Skipped levels signal a broken document structure.

---

## 7. Tailwind v4 / shadcn Mistakes

**Using `tailwind.config.js` for token definitions in a v4 project.**
Reason: v4 reads tokens from the `@theme` CSS block. Config file entries for colors/spacing are ignored.

**Defining `--color-primary` in `@layer base` instead of `@theme`.**
```css
/* WRONG — defined in base, not available as utility class */
@layer base { :root { --color-primary: oklch(0.55 0.20 250); } }
/* RIGHT — defined in @theme, generates bg-primary utility AND CSS var */
@theme { --color-primary: oklch(0.55 0.20 250); }
```
Reason: `@layer base` definitions do not generate Tailwind utility classes. `@theme` does both.

**Not migrating shadcn default token names after generating a component.**
Reason: shadcn-generated files reference `hsl(var(--primary))` which resolves to shadcn's internal token, not your semantic system. Always update to `var(--color-primary)` after running `npx shadcn add`.

**Not using `cn()` for class merging.**
```tsx
// WRONG — duplicate classes not resolved
const cls = `p-4 ${isCompact ? 'p-2' : ''}`;
// RIGHT
const cls = cn('p-4', isCompact && 'p-2'); // twMerge resolves to p-2
```
Reason: Tailwind applies the last class in the stylesheet, which may not be the last in the string. `tailwind-merge` correctly handles specificity.

**Running `npx shadcn add` without checking git diff.**
Reason: shadcn overwrites existing files. If you've customized the generated component, your changes will be lost.

---

## 8. Multi-Tenant / Role-Based Mistakes

**Org brand color set only on header, not consumed below it.**
Reason: `--org-primary` must be set on `:root` or a scoped `[data-org-id]` wrapper. Setting it on the header element limits its cascade to header children only.

**Role-based UI relying only on frontend checks.**
```tsx
// WRONG — hides button but route is still accessible
{isAdmin && <AdminPanel />}
// RIGHT — route-level protection in middleware + UI hiding
```
Reason: a URL-aware user can bypass frontend-only guards. Server-side route protection is mandatory.

**Serving the same page component to both agent and admin with conditional rendering.**
Reason: grows into unmaintainable conditional sprawl. Separate routes with separate components. Shared data layer (hooks/queries) is fine; shared UI is not.

**No role-aware empty states.**
Reason: an admin's empty state and an agent's empty state have different explanations and different actions. Generic empty states provide no guidance.

**Org branding not cleaned up on org switch.**
```tsx
// WRONG — old org styles persist on org switch
useEffect(() => { applyBranding(org); }, [org?.id]);
// RIGHT — cleanup function removes old branding
useEffect(() => {
  applyBranding(org);
  return () => removeBranding();
}, [org?.id]);
```
Reason: stale CSS custom properties remain on `documentElement` and affect the new org's appearance.

---

## 9. Onboarding Pattern Mistakes

**Phase locking without explanation.**
Reason: users blocked by a lock with no explanation will assume a bug. Always show which tasks must be completed to unlock and provide a direct link to them.

**Progress percentage without task count context.**
```tsx
// WRONG — "47%" means nothing without context
<span>47% complete</span>
// RIGHT
<span>47% complete · 8 tasks remaining</span>
```
Reason: percentage alone doesn't tell the user how much work is left.

**Milestone celebration that fires on every render where status is 'verified'.**
```tsx
// WRONG — celebration fires every time component re-renders
if (phase.status === 'verified') showCelebration();
// RIGHT — track status transition, not current status
const prevStatus = useRef(phase.status);
useEffect(() => {
  if (prevStatus.current !== 'verified' && phase.status === 'verified') {
    showCelebration();
  }
  prevStatus.current = phase.status;
}, [phase.status]);
```
Reason: users see the celebration animation every time they revisit the phase.

**Identical UI for agent self-complete and admin-verified status.**
Reason: agents need to know their self-reported items are pending review, not fully complete. The visual distinction between `self_complete` (amber) and `verified` (green) carries meaningful information.

**Admin using the same gamified, progress-focused view as the agent.**
Reason: the admin's job during an onboarding call is verification and annotation — not motivation. Admin call view should be sorted by urgency (flagged → needs verification → incomplete) and optimized for rapid action, not visual celebration.

**Onboarding progress state stored only in local state or localStorage.**
Reason: if a user logs out, clears storage, or switches devices, all progress is lost. Phase and task completion must be server-persisted and tied to the user's account.
