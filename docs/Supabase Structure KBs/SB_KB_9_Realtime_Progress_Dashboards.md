# SB_KB_9 — Real-Time Progress Dashboards with Supabase Realtime

**Stack-locked: Supabase Realtime. Not portable to other realtime providers without rewrite.**

---

## Pattern

Admins view live progress across multiple users in their org. Every time a user completes an item, checks a box, or updates their status, the admin dashboard updates without polling.

The pattern: **Broadcast from Database** — an `AFTER` trigger on the progress table calls `realtime.broadcast_changes()`, which emits via WAL post-commit to a private per-org channel (`org:{org_id}`). Admins subscribe to one channel for their org, not one channel per user. RLS on `realtime.messages` enforces who can receive what.

Supabase explicitly recommends Broadcast over Postgres Changes for multi-tenant, high-frequency tables as of Launch Week 13 (Dec 2024).

---

## When to use / when to skip

**Use when:**
- Admins need to see user progress update in real time without page refresh
- Progress events are frequent (multiple per minute across many users)
- You need RLS-enforced channel authorization (not just client-side filtering)

**Skip / fall back to polling when:**
- Updates are infrequent (< 1/min) — 15-30s polling is simpler and cheaper
- The admin dashboard is not expected to be "live" — periodic refresh is acceptable
- You're on the Free tier and close to the 200 concurrent connection limit

---

## Anti-patterns

**Using Postgres Changes for multi-tenant fan-out**
Postgres Changes runs on a single thread, runs the RLS policy once per subscriber per changed row, and shares one logical replication slot per project. Under load (many subscribers × many rows), it falls behind. Broadcast is the replacement.

**Per-user channels for a multi-user dashboard**
An admin viewing 50 users' progress would open 50 channels. The limit is 100 channels per connection. At 60 users the admin can no longer open new channels. Use one channel per org.

**Trusting the `filter:` clause for security**
Realtime's `filter:` parameter reduces network traffic but is not a security boundary. RLS on `realtime.messages` is what prevents tenants from seeing each other's events. Always use private channels with proper policies.

**Not calling `removeChannel` on component unmount**
The most common cause of hitting the channel limit. Every unmounted component that doesn't clean up leaks a channel slot until the connection is reset.

**Re-rendering on every broadcast event**
If a user completes 5 items in 3 seconds, you get 5 events. Applying each immediately causes 5 re-renders. Debounce 150–300ms, batch updates in a ref, apply once.

**`replica identity full` on every table**
Required to get the `old` record in UPDATE/DELETE broadcasts. But it multiplies WAL volume — every UPDATE writes the full old row to WAL even if only one column changed. Enable only on tables where you actually need diffs.

**Not reconnecting on tab refocus**
Browsers throttle or suspend WebSocket connections in background tabs. On `visibilitychange` to visible, check connection state and resubscribe if needed. Always `invalidateQueries` on `SUBSCRIBED` to catch events missed during disconnection.

---

## Quantitative limits (verified April 2026)

| Limit | Free | Pro | Pro + no spend cap | Team |
|---|---|---|---|---|
| Concurrent connections | 200 | 500 | 10,000 | 10,000 |
| Messages / second | 100 | 500 | 2,500 | 2,500 |
| Channel joins / second | 100 | 500 | 2,500 | 2,500 |
| Channels per connection | 100 | 100 | 100 | 100 |
| Broadcast payload | 256 KB | 3,000 KB | 3,000 KB | 3,000 KB |

Postgres Changes payload silently truncates fields when the row exceeds 1 MB.

Overage pricing (Pro): $10 per 1,000 peak connections, $2.50 per 1M messages.

---

## Generic example

```sql
-- Broadcast trigger: fires AFTER commit, emits to org channel
create or replace function broadcast_progress_change()
returns trigger
security definer
language plpgsql as $$
declare
  v_org_id uuid;
begin
  -- Look up org_id from the user's profile (adjust to your schema)
  select primary_org_id into v_org_id
  from profiles
  where id = coalesce(new.user_id, old.user_id);

  perform realtime.broadcast_changes(
    'org:' || v_org_id::text,   -- channel name: one per org
    tg_op,                       -- event: INSERT, UPDATE, DELETE
    'progress_changed',          -- custom event name for client filtering
    tg_table_name,
    tg_table_schema,
    new,
    old
  );
  return null;
end;
$$;

create trigger trg_progress_broadcast
after insert or update or delete on entity_progress
for each row
execute function broadcast_progress_change();

-- RLS on realtime.messages: only org admins can subscribe to org:{id}
-- Requires Supabase Realtime authorization feature (enabled by default on Pro+)
create policy "realtime: org admins subscribe to org channel"
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and exists (
    select 1 from org_memberships m
    where m.user_id = (select auth.uid())
      and m.role in ('admin', 'owner')
      and 'org:' || m.org_id::text = (select realtime.topic())
  )
);
```

```ts
// Client: admin dashboard subscribing to org channel
import { createClient } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

export function useOrgProgressChannel(orgId: string) {
  const supabase = createClient(/* ... */);
  const qc = useQueryClient();
  const batchRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Authenticate realtime with the current user's JWT
    supabase.realtime.setAuth(/* session.access_token */);

    const channel = supabase.channel(`org:${orgId}`, {
      config: { private: true },  // enforce RLS on realtime.messages
    });

    const batchedInvalidate = () => {
      if (batchRef.current) clearTimeout(batchRef.current);
      batchRef.current = setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['org-progress', orgId] });
      }, 200); // debounce 200ms
    };

    channel
      .on('broadcast', { event: 'progress_changed' }, batchedInvalidate)
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          // Reconcile: invalidate immediately on connect to catch missed events
          qc.invalidateQueries({ queryKey: ['org-progress', orgId] });
        }
      });

    // Reconnect on tab refocus
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        supabase.realtime.connect();
        qc.invalidateQueries({ queryKey: ['org-progress', orgId] });
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      supabase.removeChannel(channel);          // critical: always clean up
      document.removeEventListener('visibilitychange', handleVisibility);
      if (batchRef.current) clearTimeout(batchRef.current);
    };
  }, [orgId]);
}
```

**Polling fallback for background / offline:**
```ts
// Alongside the realtime subscription, run a slow poll as a safety net
const { data } = useSWR(
  ['org-progress', orgId],
  fetcher,
  { refreshInterval: 30_000 }  // 30s polling fallback
);
```

---

## Trade-offs

| Approach | Multi-tenant security | Scale ceiling | Setup |
|---|---|---|---|
| **Broadcast from DB (this pattern)** | RLS on `realtime.messages` | Highest | Trigger + policy |
| **Broadcast client→client** | RLS on `realtime.messages` | High | Policy only |
| **Postgres Changes** | Table RLS (auto) | Low — single-threaded | `alter publication` |
| **Polling (REST)** | Standard RLS | Infinite | None |

Postgres Changes becomes the bottleneck around 100–200 concurrent subscribers on Pro. Broadcast scales to the connection limit.

---

## Gotchas

**`realtime.broadcast_changes()` requires the `realtime` extension to be enabled** and is a Supabase-specific function — not standard Postgres. It's enabled by default on all Supabase projects but is not available in self-hosted Postgres.

**Channel names are case-sensitive.** `org:ABC` and `org:abc` are different channels. Normalize org IDs to lowercase (or use the raw UUID) when building channel names.

**Realtime quota exhaustion suspends the entire project.** Supabase will suspend a project that repeatedly exceeds its Realtime quota. Monitor message count and connection count in the Realtime Reports dashboard before launch. Set a spend cap alert.

**WAL-based broadcast adds ~50–200ms latency** between DB commit and client receipt (WAL decoding overhead). This is acceptable for progress dashboards. If you need sub-50ms latency (e.g., collaborative cursor positions), use Presence or client-side Broadcast instead.

**The `filter:` option on Postgres Changes channels is NOT supported for Broadcast channels.** For Broadcast, filtering is done client-side by event name (`{ event: 'progress_changed' }`) or server-side by channel name. You cannot filter on payload field values.

**Signs you're approaching limits:** WebSocket close codes containing `too_many_*`; `tenant_events` errors in Realtime logs; rising channel join latency visible in Realtime Reports; admins reporting "dashboard isn't updating." Don't wait for these — set up the Realtime Reports dashboard as standard practice before launch.
