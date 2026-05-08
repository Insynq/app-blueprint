# UI_KB_8 — Admin vs. End-User Surfaces

---

## Pattern

Admin and end-user surfaces are separate product UIs with different information density, interaction patterns, and job-to-be-done. Admin surfaces are high-density, data-table-oriented tools for operators. End-user surfaces are low-density, task-focused guides for people who are new or infrequent. Route-level separation (`/admin/*`) is the correct pattern — not conditional rendering of different versions of the same page based on role.

---

## When to Use / When to Skip

**Route-level separation:** Always. Admin routes live at `/admin/*` and are protected by server-side middleware. End-user routes live at the root. Never serve the same route to both roles and toggle content with `if (isAdmin)`.

**Role-based feature hiding within a shared surface:** Only for minor affordances (e.g., an "Admin only" badge or an extra action in a dropdown). If the difference is more than 2–3 elements, the surfaces should be separate routes.

**Data tables:** Admin surfaces only. End-user surfaces should use card lists, summaries, or checklist views. A raw data table is always wrong for a new user self-service flow.

---

## Anti-Patterns

**Serving the same page to both roles with feature flags.**
```tsx
// WRONG — grows into an unmaintainable tangle
function TaskPage({ task }) {
  const { role } = useAuth();
  return (
    <div>
      {role === 'admin' && <AdminVerifyPanel />}
      {role === 'admin' && <AdminNoteInput />}
      <TaskContent task={task} />
      {role === 'agent' && <AgentSelfCompleteButton />}
      {role === 'admin' && <AdminBulkVerify />}
    </div>
  );
}
// RIGHT — separate surfaces, shared data layer
// /app/tasks/[id]/page.tsx     → AgentTaskPage
// /app/admin/tasks/[id]/page.tsx → AdminTaskPage
```

**Using admin UI density patterns in end-user surfaces.**
Multi-column dense tables, bulk action toolbars, and filter panels create cognitive overload for users who are not trained to read them. End-user surfaces should have one primary action visible at a time.

**Hiding UI elements as the only security layer.**
Never rely on `{isAdmin && <DeleteButton />}` as security. The button must also be gated server-side. UI hiding is UX convenience, not security.

**Using the same empty state for both roles.**
An admin sees "No agents have started onboarding" — with an action to send invites. An agent sees "You haven't started yet" — with a CTA to begin. Same data, different context, different message.

---

## Generic Example

### Admin Data Table Pattern

```tsx
// Full-featured admin table with sort, filter, bulk actions
function AdminEntityTable<T extends { id: string }>({
  data,
  columns,
  isLoading,
  onBulkAction,
  filters,
}: AdminTableProps<T>) {
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [sort, setSort] = React.useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);

  const allSelected = selectedIds.size === data.length && data.length > 0;

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(data.map(r => r.id)));
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      {filters && (
        <div className="flex gap-2 flex-wrap">
          {filters}
        </div>
      )}

      {/* Bulk action bar — appears when rows are selected */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-[--color-primary-subtle] border border-[--color-primary] rounded-[--radius-md]">
          <span className="text-sm font-medium text-[--color-primary]">
            {selectedIds.size} selected
          </span>
          <div className="flex gap-2 ml-auto">
            <Button size="sm" variant="secondary" onClick={() => onBulkAction('verify', [...selectedIds])}>
              Verify All
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              Deselect
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-[--radius-lg] border border-[--color-border-default] overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[--color-surface] border-b border-[--color-border-default]">
            <tr>
              {/* Select all checkbox */}
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all rows"
                  className="rounded border-[--color-border-strong]"
                />
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left font-medium text-[--color-text-muted] cursor-pointer hover:text-[--color-text-default] select-none"
                  onClick={() => setSort(s =>
                    s?.key === col.key ? { key: col.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: col.key, dir: 'asc' }
                  )}
                  aria-sort={sort?.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {sort?.key === col.key && (
                      <span aria-hidden>{sort.dir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </span>
                </th>
              ))}
              <th className="w-16 px-4 py-3" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[--color-border-default]">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={columns.length + 2} className="px-4 py-3">
                    <Skeleton className="h-4 w-full" />
                  </td>
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 2} className="px-4 py-8 text-center text-[--color-text-muted]">
                  <EmptyState
                    title="No records found"
                    description="Try adjusting your filters or search terms."
                  />
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'hover:bg-[--color-surface] transition-colors',
                    selectedIds.has(row.id) && 'bg-[--color-primary-subtle]'
                  )}
                >
                  <td className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.id)}
                      onChange={() => setSelectedIds(s => {
                        const next = new Set(s);
                        next.has(row.id) ? next.delete(row.id) : next.add(row.id);
                        return next;
                      })}
                      aria-label={`Select row ${row.id}`}
                      className="rounded border-[--color-border-strong]"
                    />
                  </td>
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3 text-[--color-text-default]">
                      {col.render ? col.render(row) : (row as any)[col.key]}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <RowActionMenu row={row} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <TablePagination />
    </div>
  );
}
```

### Admin Call View (Onboarding)

```tsx
// Admin's view during a live onboarding call
// Optimized for verification workflow, not for engagement/gamification
function AdminCallView({ entityId }: { entityId: string }) {
  const { tasks, isLoading } = useEntityTasks(entityId);

  // Sort: flagged first, then self_complete (needs verification), then incomplete, then verified
  const sortedTasks = React.useMemo(() =>
    [...tasks].sort((a, b) => {
      const priority: Record<string, number> = {
        flagged: 0, self_complete: 1, incomplete: 2, in_progress: 3, verified: 4, skipped: 5, locked: 6
      };
      return priority[a.status] - priority[b.status];
    }), [tasks]
  );

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Onboarding Call</h1>
        <Button size="sm" variant="secondary" onClick={handleBulkVerify}>
          Verify All Submitted
        </Button>
      </div>

      {/* Session notes — global */}
      <div className="border border-[--color-border-default] rounded-[--radius-lg] p-4">
        <label className="text-sm font-medium text-[--color-text-default] block mb-2">
          Session Notes
        </label>
        <AutosaveTextarea placeholder="Call notes, action items..." />
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {sortedTasks.map((task) => (
          <AdminTaskItem key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

function AdminTaskItem({ task }: { task: Task }) {
  const [noteOpen, setNoteOpen] = React.useState(false);

  return (
    <div className="border border-[--color-border-default] rounded-[--radius-md] p-4">
      <div className="flex items-start gap-3">
        <StatusIcon status={task.status} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[--color-text-default]">{task.title}</p>
          <p className="text-xs text-[--color-text-muted] mt-0.5">
            Agent: {task.agentSubmittedAt ? `Submitted ${formatRelative(task.agentSubmittedAt)}` : 'Not submitted'}
          </p>
        </div>
        {/* Admin actions */}
        <div className="flex gap-2 shrink-0">
          {task.status === 'self_complete' && (
            <Button size="sm" onClick={() => verifyTask(task.id)}>Verify</Button>
          )}
          <Button size="sm" variant="secondary" onClick={() => flagTask(task.id)}>Flag</Button>
          <Button size="sm" variant="ghost" onClick={() => setNoteOpen(v => !v)}>Note</Button>
        </div>
      </div>

      {/* Inline note input */}
      {noteOpen && (
        <div className="mt-3 pt-3 border-t border-[--color-border-default]">
          <AutosaveTextarea
            taskId={task.id}
            placeholder="Note for this task..."
            className="text-sm"
          />
        </div>
      )}

      {/* Audit trail */}
      {task.history?.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-[--color-text-muted] cursor-pointer hover:text-[--color-text-default]">
            Activity
          </summary>
          <ul className="mt-1 space-y-0.5">
            {task.history.map((event, i) => (
              <li key={i} className="text-xs text-[--color-text-muted]">
                {event.actor} — {event.action} — {formatRelative(event.at)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
```

### Dashboard Layout Convention

```
┌──────────────────────────────────────────────────────┐
│ HEADER — sticky, branded, h-16                       │
├──────────────┬───────────────────────────────────────┤
│              │ PAGE HEADER                           │
│   SIDEBAR    │  Title + primary action button        │
│   NAV        ├───────────────────────────────────────┤
│              │ STAT SUMMARY ROW (3–4 KPI cards)      │
│   w-64       ├───────────────────────────────────────┤
│              │ PRIMARY CONTENT                       │
│              │  (table, list, or card grid)          │
│              │                                       │
└──────────────┴───────────────────────────────────────┘
```

KPI card pattern:
```tsx
function KpiCard({ label, value, trend, trendLabel }: KpiCardProps) {
  return (
    <div className="p-5 bg-[--color-surface] border border-[--color-border-default] rounded-[--radius-lg]">
      <p className="text-sm text-[--color-text-muted] font-medium">{label}</p>
      <p className="text-3xl font-bold text-[--color-text-default] mt-1">{value}</p>
      {trend && (
        <p className={cn('text-sm mt-1', trend > 0 ? 'text-[--status-success]' : 'text-[--status-destructive]')}>
          {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}% {trendLabel}
        </p>
      )}
    </div>
  );
}
```

---

## Trade-offs

| Decision | Pro | Con |
|---|---|---|
| Route-level role separation | Clean; secure; no role-flag sprawl | More routes; some logic duplication between surfaces |
| Separate components per role | No conditional rendering chaos | More files; shared state/hooks need to work for both |
| Dense admin tables | Efficient for operators | Overwhelming for occasional users; requires training |
| Simplified card UI for end-users | Low cognitive load; self-service friendly | Less data visible; requires more navigation to see all info |

---

## Gotchas

**Admin routes must be protected at the middleware/server level**, not just by hiding the nav link. A user who knows the URL can access `/admin/*` if only the UI is gated.

**Bulk verification must show a confirmation summary.** When an admin bulk-verifies 15 tasks in one click, show exactly what was verified before committing. Bulk actions on consequential data require a review step.

**Admin tables need `min-w-0` on text cells** to prevent long strings (emails, names, notes) from breaking the table layout.

**The "session notes" autosave must debounce.** Firing a save request on every keystroke in a notes textarea will cause rate limit issues. Debounce at 500–1000ms.

**Pagination defaults.** Default page size for admin tables: 25 rows. Provide a size selector (10 / 25 / 50 / 100). Persist the user's choice to `localStorage` per table.

**Row action menus with 3+ actions need a `...` overflow pattern.** Putting 5 action buttons inline on each row makes the table too wide. Keep 1–2 inline, overflow the rest into a Radix DropdownMenu.
