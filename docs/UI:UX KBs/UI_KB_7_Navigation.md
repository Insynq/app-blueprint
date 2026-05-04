# UI_KB_7 — Navigation Patterns

---

## Pattern

Navigation type is determined by the number of sections and the role of the surface (end-user vs. admin). Left sidebar is the default for multi-section SaaS. Active state uses both color and weight — never color alone. Mobile nav collapses to a drawer at `<md` (768px). Breadcrumbs appear at 3+ hierarchy levels. SPAs manage focus and document title on every route change.

---

## When to Use / When to Skip

**Left sidebar nav:** Default for SaaS apps with 5–20 primary sections. Scales to complex hierarchies. Works for both agent and admin surfaces.

**Top nav bar:** Use only when sections are 5 or fewer AND the content area benefits from the full vertical height (e.g., map or canvas apps). Avoid for multi-level navigation.

**Tab nav (within a page):** Use for secondary navigation within a single page (e.g., profile tabs: General / Security / Billing). Not a replacement for primary nav.

**Bottom tab bar:** Mobile-primary apps only. 3–5 items max. Never in desktop-first SaaS.

**Breadcrumbs:** Any content that is 3+ levels deep. Required in admin views where items are accessed from lists (list → detail → sub-detail).

**Phase/step sidebar (onboarding):** Replaces or supplements the standard sidebar when the primary job of the app is multi-phase task completion. See Generic Example below.

---

## Anti-Patterns

**Color-only active state.**
```tsx
// WRONG — active item only changes color
<NavItem className={isActive ? 'text-blue-500' : 'text-gray-600'}>...</NavItem>
// RIGHT — color + background + weight
<NavItem className={isActive ? 'bg-[--color-primary-subtle] text-[--color-primary] font-semibold' : 'text-[--color-text-muted] hover:bg-[--color-surface-raised]'}>
```

**Deep nesting beyond 3 levels.**
If the nav requires a third nested level, the information architecture needs rethinking — not more nesting.

**Hamburger menu on desktop.**
Hamburger menus are for `<md` only. A collapsed sidebar at desktop widths should be an icon-only rail, not hidden behind a hamburger.

**Sidebar navigation inside the page content area.**
The sidebar is part of the page shell. It does not scroll with page content. It is always `sticky` or `fixed`.

**Not updating `document.title` on route change.**
Screen reader users rely on the page title changing to understand they've navigated. SPA route changes must update `document.title` every time.

---

## Generic Example

### Sidebar Nav Component

```tsx
// components/shared/SidebarNav.tsx
interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;        // notification count
  end?: boolean;         // exact match for active (react-router)
}

function SidebarNav({ items, orgColor }: { items: NavItem[]; orgColor?: string }) {
  return (
    <nav className="flex flex-col gap-1 p-3" aria-label="Main navigation">
      {items.map((item) => (
        <SidebarNavItem key={item.href} item={item} />
      ))}
    </nav>
  );
}

function SidebarNavItem({ item }: { item: NavItem }) {
  // Using react-router — swap for next/link or other router as needed
  const isActive = useMatch({ path: item.href, end: item.end ?? false }) !== null;

  return (
    <a
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-[--radius-md] text-sm transition-colors',
        isActive
          ? 'bg-[--color-primary-subtle] text-[--color-primary] font-semibold'
          : 'text-[--color-text-muted] hover:bg-[--color-surface-raised] hover:text-[--color-text-default]'
      )}
    >
      <item.icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate">{item.label}</span>
      {item.badge != null && item.badge > 0 && (
        <span className="ml-auto text-xs font-medium bg-[--color-primary] text-[--color-primary-foreground] rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
    </a>
  );
}
```

### Mobile Drawer Nav

```tsx
// Mobile nav — visible only below md breakpoint
// Uses Radix Dialog as the drawer primitive
import * as Dialog from '@radix-ui/react-dialog';

function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        className="p-2 rounded-[--radius-md] hover:bg-[--color-surface-raised]"
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[--z-overlay] bg-[--color-surface-overlay]" />
          <Dialog.Content
            className="fixed left-0 top-0 bottom-0 z-[--z-modal] w-72 bg-[--color-surface] border-r border-[--color-border-default] focus:outline-none"
            aria-label="Navigation menu"
          >
            <div className="flex items-center justify-between p-4 border-b border-[--color-border-default]">
              <span className="font-semibold">Menu</span>
              <Dialog.Close asChild>
                <button aria-label="Close menu" className="p-1 rounded hover:bg-[--color-surface-raised]">
                  <XIcon className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>
            <SidebarNav items={items} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
```

### Phase/Step Sidebar (Onboarding)

```tsx
// Replaces standard SidebarNav in the onboarding shell
// Shows all phases with completion status + progress

interface Phase {
  id: string;
  number: number;
  label: string;
  taskCount: number;
  completedCount: number;
  status: 'locked' | 'not_started' | 'in_progress' | 'self_complete' | 'verified';
}

function PhaseSidebarNav({ phases, activePhaseId, onSelect }: PhaseSidebarNavProps) {
  return (
    <nav className="flex flex-col gap-1 p-3 overflow-y-auto" aria-label="Onboarding phases">
      {/* Overall progress header */}
      <div className="px-3 py-3 mb-2 border-b border-[--color-border-default]">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="font-medium text-[--color-text-default]">Overall Progress</span>
          <span className="text-[--color-text-muted]">{overallPercent}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-[--color-surface-raised] overflow-hidden">
          <div
            className="h-full rounded-full bg-[--color-primary] transition-[width] duration-[--duration-slow]"
            style={{ width: `${overallPercent}%` }}
            role="progressbar"
            aria-valuenow={overallPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Overall onboarding progress"
          />
        </div>
      </div>

      {phases.map((phase) => (
        <PhaseNavItem
          key={phase.id}
          phase={phase}
          isActive={phase.id === activePhaseId}
          onSelect={onSelect}
        />
      ))}
    </nav>
  );
}

function PhaseNavItem({ phase, isActive, onSelect }: PhaseNavItemProps) {
  const isLocked = phase.status === 'locked';
  const isComplete = phase.status === 'verified';
  const fraction = `${phase.completedCount}/${phase.taskCount}`;

  return (
    <button
      onClick={() => !isLocked && onSelect(phase.id)}
      disabled={isLocked}
      aria-current={isActive ? 'page' : undefined}
      aria-disabled={isLocked}
      className={cn(
        'w-full flex items-start gap-3 px-3 py-2.5 rounded-[--radius-md] text-left transition-colors text-sm',
        isActive && !isLocked && 'bg-[--color-primary-subtle] text-[--color-primary]',
        !isActive && !isLocked && 'text-[--color-text-muted] hover:bg-[--color-surface-raised] hover:text-[--color-text-default]',
        isLocked && 'opacity-50 cursor-not-allowed text-[--color-text-disabled]',
      )}
    >
      {/* Status icon */}
      <span className="mt-0.5 shrink-0 text-base" aria-hidden>
        {isLocked ? '🔒' : isComplete ? '✓' : phase.status === 'self_complete' ? '●' : '○'}
      </span>

      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">
          {phase.number}. {phase.label}
        </div>
        <div className="text-xs text-[--color-text-muted] mt-0.5">
          {fraction} tasks
        </div>
      </div>
    </button>
  );
}
```

### Breadcrumbs

```tsx
function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-[--color-text-muted]">
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 && <span aria-hidden>/</span>}
          {item.href && index < items.length - 1 ? (
            <a
              href={item.href}
              className="hover:text-[--color-text-default] transition-colors"
            >
              {item.label}
            </a>
          ) : (
            <span
              className="text-[--color-text-default] font-medium"
              aria-current={index === items.length - 1 ? 'page' : undefined}
            >
              {item.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}
```

---

## Trade-offs

| Decision | Pro | Con |
|---|---|---|
| Left sidebar default | Scales to complex nav; persistent visibility | Takes 240–280px horizontal space |
| Radix Dialog for mobile drawer | Focus trap, Escape, backdrop click — all handled | Adds dependency; overkill for very simple menus |
| `aria-current="page"` for active state | Correct semantic; screen reader announces current page | Must be set correctly — `aria-current` ≠ `aria-selected` |
| Phase sidebar as nav replacement | Reflects the actual job of the app; phases ARE the navigation | Not reusable outside onboarding apps; separate component to maintain |

---

## Gotchas

**Mobile drawer must be `<md` only.** The drawer is rendered conditionally at `md:hidden`. If it stays mounted at larger breakpoints, it will intercept keyboard focus even when visually hidden. Conditionally mount, or use `display: none` with `inert` attribute on the containing element.

**`aria-current="page"` is for the currently active page.** `aria-selected` is for selected items in a list (tabs, options). These are not interchangeable. Nav items use `aria-current="page"`.

**SPA route changes do not auto-update `document.title`.** Implement a `useDocumentTitle(title)` hook or use framework-level mechanisms (Next.js `<title>` in `layout.tsx`, React Router's `<title>` element). Without this, screen reader users hear the same stale title after navigation.

**Phase nav `onSelect` must not navigate to locked phases.** The `disabled` prop prevents click, but keyboard users can still tab to the button and press Enter/Space unless `aria-disabled` is combined with explicit `onClick` guard logic. Both are needed.

**Sticky sidebar height must account for header height.** Use `min-h-[calc(100vh-4rem)]` where `4rem` is the header height. Without this, the sidebar may not fill the full page height on short content pages.
