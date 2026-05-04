# UI_KB_9 — Status & Feedback Systems

---

## Pattern

Feedback is delivered at the right scope: page-level errors inline, action results via toast, destructive confirmations via modal, field errors adjacent to fields. Optimistic UI updates happen immediately on user action with a guaranteed rollback on API failure. Every list/table/data view has a designed empty state. Status badges use color AND text label — never color alone. Progress gamification uses real completion data, not arbitrary XP systems.

---

## When to Use / When to Skip

**Toast:** Non-blocking confirmation of an action the user just took. Auto-dismiss at 4–5 seconds for success. Manual dismiss for warnings. Never for errors that require action.

**Inline error:** Any error tied to a specific field, record, or section of the page. Always adjacent to the affected element — never at the top of the page.

**Modal confirmation:** Destructive or irreversible actions only (delete, revoke, permanently change). Never for success messages.

**Optimistic UI:** Any action that is expected to succeed >99% of the time with low latency (toggle, status change, task check). Avoid for actions with high failure rate or long latency (file upload, payment processing).

**Progress gamification:** Onboarding/activation flows where completion is the job. Do NOT add progress bars to admin dashboards or transactional UIs.

---

## Anti-Patterns

**Toast for destructive confirmations.**
```tsx
// WRONG — user accidentally deleted; toast auto-dismissed before they noticed
toast.success('Record deleted');
// RIGHT — modal with explicit confirm before deletion
<ConfirmDialog
  title="Delete this record?"
  description="This cannot be undone."
  onConfirm={handleDelete}
/>
```

**Color-only status badges.**
```tsx
// WRONG
<span className="bg-amber-500 rounded-full h-2 w-2" />
// RIGHT
<Badge variant="warning">Pending Review</Badge>
```

**Top-of-form error summary instead of inline errors.**
```tsx
// WRONG — user must scroll to find which field caused the error
<div className="text-red-500">Please fix the errors below</div>
<form>...</form>

// RIGHT — error immediately below the offending field
<FormField
  label="Email"
  error={errors.email?.message}
  required
>
  <Input ... />
</FormField>
```

**Optimistic update without rollback.**
```tsx
// WRONG — no rollback path
async function toggleTask(id: string) {
  setTask(t => ({ ...t, status: 'self_complete' })); // optimistic
  await api.completeTask(id); // if this fails, UI is stuck in wrong state
}
```

**Progress bar that only updates on page load.**
A progress bar that doesn't animate when a task is checked off feels broken. Update in real-time.

---

## Generic Example

### Toast Pattern (Sonner)

```tsx
// Sonner is the standard — single <Toaster /> in root layout
// Usage at callsite:
import { toast } from 'sonner';

// Success — auto-dismiss
toast.success('Task marked complete');

// Warning — manual dismiss
toast.warning('Connection issue — changes may not save', { duration: Infinity });

// Error with action
toast.error('Failed to verify task', {
  action: {
    label: 'Retry',
    onClick: () => retryVerify(taskId),
  },
  duration: 8000,
});

// Loading → resolved (for async operations)
const toastId = toast.loading('Saving changes...');
try {
  await saveChanges();
  toast.success('Changes saved', { id: toastId });
} catch {
  toast.error('Failed to save', { id: toastId });
}
```

### Optimistic UI with Rollback

```tsx
// Pattern: snapshot → optimistic update → API call → rollback on failure
function useOptimisticTaskComplete() {
  const queryClient = useQueryClient();
  const QUERY_KEY = ['tasks', entityId];

  return useMutation({
    mutationFn: (taskId: string) => api.completeTask(taskId),

    onMutate: async (taskId) => {
      // Cancel in-flight refetches
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });

      // Snapshot current state
      const snapshot = queryClient.getQueryData(QUERY_KEY);

      // Optimistic update
      queryClient.setQueryData(QUERY_KEY, (old: Task[]) =>
        old.map(t => t.id === taskId ? { ...t, status: 'self_complete' } : t)
      );

      return { snapshot }; // return context for rollback
    },

    onError: (err, taskId, context) => {
      // Rollback to snapshot
      if (context?.snapshot) {
        queryClient.setQueryData(QUERY_KEY, context.snapshot);
      }
      toast.error('Failed to complete task — please try again');
    },

    onSettled: () => {
      // Always refetch to sync with server
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
```

### Status Badge Component

```tsx
// A consistent vocabulary for all status badges across the app
type StatusVariant = 'success' | 'warning' | 'destructive' | 'info' | 'neutral' | 'pending';

const statusBadgeStyles: Record<StatusVariant, string> = {
  success:     'bg-[--status-success-bg] text-[--status-success-text] border-[--status-success-border]',
  warning:     'bg-[--status-warning-bg] text-[--status-warning-text] border-[--status-warning-border]',
  destructive: 'bg-[--status-destructive-bg] text-[--status-destructive-text] border-[--status-destructive-border]',
  info:        'bg-[--status-info-bg] text-[--status-info-text] border-[--status-info-border]',
  neutral:     'bg-[--status-neutral-bg] text-[--status-neutral-text] border-[--status-neutral-border]',
  pending:     'bg-[--status-warning-bg] text-[--status-warning-text] border-[--status-warning-border]',
};

function Badge({ variant, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
        statusBadgeStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

// Usage — always include text label, never color alone
<Badge variant="warning">Pending Review</Badge>
<Badge variant="success">Verified</Badge>
<Badge variant="destructive">Flagged</Badge>
<Badge variant="neutral">Not Started</Badge>
```

### Empty State Component

```tsx
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      {Icon && (
        <div className="h-12 w-12 rounded-full bg-[--color-surface-raised] flex items-center justify-center mb-4">
          <Icon className="h-6 w-6 text-[--color-text-muted]" aria-hidden />
        </div>
      )}
      <h3 className="text-base font-semibold text-[--color-text-default] mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-[--color-text-muted] max-w-sm mb-4">{description}</p>
      )}
      {action && (
        <Button size="sm" onClick={action.onClick}>{action.label}</Button>
      )}
    </div>
  );
}

// Role-aware empty states
function TaskListEmptyState({ role }: { role: 'agent' | 'admin' }) {
  if (role === 'agent') {
    return (
      <EmptyState
        icon={CheckCircleIcon}
        title="Nothing here yet"
        description="Your tasks will appear here as your onboarding progresses."
        action={{ label: 'Start Phase 1', onClick: startPhase1 }}
      />
    );
  }
  return (
    <EmptyState
      icon={UsersIcon}
      title="No agents in this phase"
      description="Agents appear here once they begin this phase of onboarding."
    />
  );
}
```

### Progress Gamification (Onboarding)

```tsx
// Overall progress ring — always visible in sidebar header
function OverallProgressRing({ completed, total }: { completed: number; total: number }) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1 py-3">
      <div className="relative h-16 w-16">
        <svg className="rotate-[-90deg]" width="64" height="64" aria-hidden>
          {/* Track */}
          <circle cx="32" cy="32" r={radius} fill="none" stroke="var(--color-surface-raised)" strokeWidth="5" />
          {/* Progress */}
          <circle
            cx="32" cy="32" r={radius}
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="5"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 400ms ease-out' }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-[--color-text-default]">
          {percent}%
        </span>
      </div>
      <p className="text-xs text-[--color-text-muted]">{completed}/{total} tasks</p>
      {/* Screen reader text */}
      <span className="sr-only">Overall onboarding progress: {percent}%, {completed} of {total} tasks complete</span>
    </div>
  );
}

// Phase completion celebration — triggered once on status change to 'verified'
function usePhaseCompleteCelebration(phaseStatus: string) {
  const [showCelebration, setShowCelebration] = React.useState(false);
  const prevStatus = React.useRef(phaseStatus);

  React.useEffect(() => {
    if (prevStatus.current !== 'verified' && phaseStatus === 'verified') {
      setShowCelebration(true);
    }
    prevStatus.current = phaseStatus;
  }, [phaseStatus]);

  return { showCelebration, dismiss: () => setShowCelebration(false) };
}
```

### Destructive Confirmation Modal

```tsx
function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Delete',
  onConfirm,
  isLoading,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[--z-overlay] bg-[--color-surface-overlay]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[--z-modal] w-full max-w-md bg-[--color-surface] rounded-[--radius-xl] border border-[--color-border-default] p-6 shadow-lg focus:outline-none"
          onPointerDownOutside={(e) => e.preventDefault()} // require explicit button action
        >
          <Dialog.Title className="text-lg font-semibold text-[--color-text-default] mb-2">
            {title}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-[--color-text-muted] mb-6">
            {description}
          </Dialog.Description>
          <div className="flex gap-3 justify-end">
            <Dialog.Close asChild>
              <Button variant="secondary">Cancel</Button>
            </Dialog.Close>
            <Button variant="destructive" onClick={onConfirm} isLoading={isLoading}>
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

---

## Trade-offs

| Decision | Pro | Con |
|---|---|---|
| Sonner for toasts | Great DX; stacking; promise API | One more dependency; must configure position and theme |
| Optimistic UI everywhere | Instant perceived performance | Rollback complexity; requires query invalidation discipline |
| Role-aware empty states | Correct guidance per user type | More empty state components to write |
| SVG progress ring | Full control; no library | More code than a `<progress>` element; accessibility requires manual ARIA |

---

## Gotchas

**Sonner toast z-index must be above modals.** Default Sonner z-index may be below your modal. Set `<Toaster className="z-[--z-toast]" />` explicitly. Toast z-index in tokens should be `500`, modal `400` (or reverse if toast should be lower — define explicitly).

**Optimistic updates break if the query key is inconsistent.** `queryClient.setQueryData(QUERY_KEY, ...)` and `queryClient.invalidateQueries({ queryKey: QUERY_KEY })` must use the exact same key structure. Mismatched keys silently fail — the rollback or invalidation never fires.

**Empty states must be built for every async data view at component creation time.** It is never acceptable to ship a component that renders nothing when the data array is empty. Write the empty state when you write the component.

**Progress ring requires `role="progressbar"` and `aria-valuenow/min/max`.** The SVG is purely visual. Without the ARIA attributes on a wrapping element, screen reader users get no progress information.

**Milestone celebration must fire only once per threshold crossing.** Use a ref to track previous status (`prevStatus.current`) and only trigger when transitioning FROM non-verified TO verified — not on every render where status is verified.

**`onPointerDownOutside` on destructive confirm dialogs.** Radix Dialog closes on backdrop click by default. For destructive confirmations, disable this with `(e) => e.preventDefault()`. Users must explicitly click Cancel or Confirm — an accidental backdrop click should not dismiss the dialog.
