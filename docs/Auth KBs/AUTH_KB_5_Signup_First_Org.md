# AUTH_KB_5 — Sign-up + First Org Provisioning

**Stack-locked: Supabase Auth + Postgres trigger pattern. Multi-tenant signup logic is portable.**

---

## Pattern

The canonical pattern is a `SECURITY DEFINER` Postgres function that fires `AFTER INSERT ON auth.users FOR EACH ROW`. In a single database transaction it creates the user's `public.profiles` row, optionally creates their first `public.orgs` row, inserts the `public.org_memberships` owner record, and back-fills `profiles.primary_org_id` — all before the auth system issues a JWT. If the user is arriving via an invite link, the trigger detects the invite signal in `raw_user_meta_data` and skips auto-org-creation, leaving membership grant to a validated server action. The result: every user that successfully completes sign-up already has a fully provisioned identity by the time their first request lands.

**SB_KB_1's multi-org RLS assumes these rows exist.** `private.get_my_org_ids()` reads `profiles.primary_org_id` and `org_memberships.org_id`. If the trigger hasn't run or has silently swallowed an error, those policies return empty sets and every authenticated query returns zero rows. AUTH_KB_2's Custom Access Token Hook reads the same rows to build JWT claims — a missing profile means no `org_id` or `role` in the token.

---

## When to use / when to skip

**Use the trigger pattern when:**
- Multi-tenant app where every user belongs to at least one org
- Self-serve sign-up (user creates their own org) OR invite-based join (user joins an existing org)
- You need atomicity: profile + org + membership must exist together or not at all

**Skip / simplify when:**
- Single-tenant app — just insert a `profiles` row, no org machinery needed
- Org provisioning is an explicit admin workflow, not triggered automatically on sign-up
- Your provisioning logic is too complex for a trigger (heavy external calls, billing setup) — use a server action instead and accept the non-atomic trade-off

---

## Anti-patterns

**Storing role in `user_metadata`.**
`user_metadata` is end-user-writable via `supabase.auth.updateUser()`. A user can escalate themselves to `owner` by patching their own metadata. Authoritative roles live in `org_memberships.role` only. The Custom Access Token Hook (AUTH_KB_2) reads from that table, not from metadata.

**Creating the org from a client-side service-role call after sign-up.**
Exposes the service role key to the browser. Also creates a race: the user's first authenticated request may land before the client-side call completes, leaving them with no org and a broken session. The trigger eliminates both problems.

**Non-atomic provisioning across multiple client calls.**
Separate `profiles` INSERT, then `orgs` INSERT, then `org_memberships` INSERT from the client means any network failure leaves partial state: a user with no org, or an org with no owner membership. The trigger wraps all three in one Postgres transaction.

**Missing `REVOKE EXECUTE` on the trigger function.**
`SECURITY DEFINER` functions run as their creator (`postgres` role), bypassing RLS. If `anon` or `authenticated` can call `handle_new_user()` directly, they can provision arbitrary rows under any user id. Revoke execute from all client-facing roles — only the trigger mechanism should invoke it.

```sql
revoke execute on function public.handle_new_user() from public, anon, authenticated;
```

**Using `set search_path = public` instead of `set search_path = ''`.**
The current Supabase docs specify an empty string. An empty `search_path` forces every table reference inside the function to be fully schema-qualified, preventing a search-path injection attack where a malicious role creates a `public.auth` schema to shadow `auth.users`. If you see `pg_temp` in older examples, that was needed for functions that create temp tables — this trigger does not.

**Swallowing exceptions silently in the EXCEPTION block.**
Catching `WHEN OTHERS THEN RETURN NEW` commits the `auth.users` row but silently drops the profile, org, and membership writes. The user exists in auth but has no identity in your application. SB_KB_1's RLS returns empty sets; AUTH_KB_2's hook returns no claims. The safer default is no EXCEPTION block at all — let the trigger raise, roll back the entire transaction (including `auth.users`), and surface a clean sign-up failure. See the trade-offs table below.

**Validating the invite token inside the trigger.**
The trigger runs as `SECURITY DEFINER` inside the auth transaction. Complex multi-table token validation (join to `invitations`, time checks, email matching) adds fragility to a path where any exception blocks all sign-ups. Keep the trigger simple: detect whether an invite signal is present, skip auto-org-creation if so, and delegate all membership grant logic to a server action that runs after auth completes.

---

## Generic example

### Trigger function

```sql
-- SECURITY DEFINER with empty search_path (current Supabase best practice)
-- All table references must be fully schema-qualified.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_org_id      uuid;
  v_display_name text;
  v_invite_token text;
begin
  -- Extract display name from OAuth or form metadata; fall back to email prefix
  v_display_name := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(new.email, '@', 1)
  );

  -- Invite signal: client passes invite_token in options.data during signUp()
  -- WARNING: raw_user_meta_data is client-supplied. This flag only controls whether
  -- auto-org-creation is skipped. Membership grant is delegated to the server action
  -- which validates the token against the invitations table.
  v_invite_token := new.raw_user_meta_data ->> 'invite_token';

  -- Always create the profile row (required by SB_KB_1 RLS + AUTH_KB_2 hook)
  insert into public.profiles (id, email, display_name, created_at)
  values (new.id, new.email, v_display_name, now());

  -- Self-serve path: no invite signal → auto-create first org + owner membership
  if v_invite_token is null then
    insert into public.orgs (name, owner_id, created_at)
    values (v_display_name || '''s Workspace', new.id, now())
    returning id into v_org_id;

    insert into public.org_memberships (org_id, user_id, role, created_at)
    values (v_org_id, new.id, 'owner', now());

    -- Back-fill primary_org_id so RLS helper and hook can read it immediately
    update public.profiles
    set primary_org_id = v_org_id
    where id = new.id;
  end if;

  -- Invite path: profile row exists; server action completes membership after token validation.

  return new;

  -- EXCEPTION BLOCK: intentionally omitted in the recommended configuration.
  -- Without it: any trigger error rolls back auth.users INSERT → sign-up fails cleanly,
  -- no orphaned rows, misconfiguration is surfaced loudly.
  -- If you add an EXCEPTION block that catches and returns NEW: auth.users commits
  -- but profile/org may not exist → partial state, broken RLS, no JWT claims.
  -- If you must catch: RAISE EXCEPTION to re-raise after logging, or add repair-on-login.
end;
$$;

-- Attach trigger to auth.users
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Lock down the SECURITY DEFINER function
revoke execute on function public.handle_new_user() from public, anon, authenticated;
```

### Invitations table + RLS

```sql
create table public.invitations (
  id            uuid primary key default gen_random_uuid(),
  token         uuid unique not null default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  invitee_email text not null,
  role          text not null default 'member',
  invited_by    uuid not null references public.profiles(id),
  expires_at    timestamptz not null default now() + interval '7 days',
  accepted_at   timestamptz,
  created_at    timestamptz not null default now()
);

alter table public.invitations enable row level security;

-- Invitee can read their own pending invite (for the acceptance page to verify)
create policy "Invitee can read own invite"
  on public.invitations for select
  using (invitee_email = auth.email());

-- Org owners/admins can create invites
create policy "Org admins can create invites"
  on public.invitations for insert
  with check (
    exists (
      select 1 from public.org_memberships
      where org_id = invitations.org_id
        and user_id = (select auth.uid())
        and role in ('owner', 'admin')
    )
  );
```

### Invite acceptance — server action (Next.js)

The invite flow requires a server action because the trigger is intentionally kept simple. The server action runs after auth completes, reads the validated invite, grants membership, and marks the invite consumed. Log the acceptance event per SB_KB_5/SB_KB_6 if you have an audit trail.

```typescript
// app/accept-invite/route.ts
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const { token } = await req.json();
  const supabase = createClient(); // server-side, user's auth context

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  // Validate: token exists, belongs to this email, not expired, not already accepted
  const { data: invite, error } = await supabase
    .from('invitations')
    .select('*')
    .eq('token', token)
    .eq('invitee_email', user.email)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !invite) {
    return new Response('Invalid or expired invite', { status: 400 });
  }

  // Grant membership
  const { error: memberError } = await supabase
    .from('org_memberships')
    .insert({ org_id: invite.org_id, user_id: user.id, role: invite.role });

  if (memberError) {
    return new Response('Membership grant failed', { status: 500 });
  }

  // Set as primary org if the user has none (invite path leaves primary_org_id null)
  await supabase
    .from('profiles')
    .update({ primary_org_id: invite.org_id })
    .eq('id', user.id)
    .is('primary_org_id', null);

  // Consume the invite
  await supabase
    .from('invitations')
    .update({ accepted_at: new Date().toISOString() })
    .eq('token', token);

  // Optionally: log to audit trail (see SB_KB_5/SB_KB_6)

  return Response.json({ org_id: invite.org_id });
}
```

---

## Trade-offs

| Provisioning approach | Atomicity | Failure mode | When to use |
|---|---|---|---|
| Trigger on `auth.users` INSERT (recommended) | High — single DB transaction | Trigger raises → sign-up fails, no orphan | Default for most apps |
| Server action after sign-up | Medium — multi-step | Network failure leaves partial state | When provisioning logic is too heavy for a trigger |
| Background job (queue/cron) | Low — async | Window where user exists with no org | Only for very heavy provisioning (billing, external APIs) |

**EXCEPTION block sub-trade-off:**

| EXCEPTION strategy | auth.users committed | profile/org committed | Recommendation |
|---|---|---|---|
| No EXCEPTION block | Only if trigger succeeds | Same transaction | Default — fail loudly |
| Catch + RAISE EXCEPTION | No (re-raised) | No | Acceptable if you want custom logging before re-raise |
| Catch + RETURN NEW (swallow) | Yes | No — orphaned auth user | Avoid unless you implement repair-on-login |

---

## Gotchas

**Race window between trigger commit and first JWT — mostly a non-issue.**
The trigger fires inside the `auth.users` INSERT transaction. Supabase Auth issues the JWT only after that transaction commits. So the profile, org, and membership rows exist before any JWT is minted. The one exception: with email confirmation enabled, `auth.users` is inserted immediately (trigger fires, rows provisioned) but the JWT is issued only after the user clicks the confirmation link — well after provisioning completes. The race is not practically observable in either path.

**Failed trigger leaves no orphaned `auth.users` row (with the recommended no-EXCEPTION config).**
An unhandled exception in the trigger rolls back the entire transaction including the `auth.users` INSERT. The client receives HTTP 500 "Database error saving new user" with no detail. There is no partial state to clean up, but you also get no programmatic error differentiation on the client — constraint violation and misconfigured schema look identical. Log aggressively in development; use Supabase dashboard logs to diagnose.

**Invite token in `raw_user_meta_data` is client-supplied — treat it as untrusted.**
The token value in `raw_user_meta_data ->> 'invite_token'` is passed by the browser via `supabase.auth.signUp({ options: { data: { invite_token: '...' } } })`. Any user can include this field with any value to skip auto-org-creation. The trigger uses it only as a signal to suppress org creation — it never grants access based on it. All access decisions happen in the server action, which validates the token against the `invitations` table.

**Enum type mismatch is the most common trigger failure cause.**
If `org_memberships.role` is a Postgres enum and the trigger inserts a string literal without casting, the trigger fails with SQLSTATE 22P02 and blocks all sign-ups. Always cast role literals: `'owner'::public.org_role`. Test with a real sign-up in a staging environment before deploying.

**Non-nullable columns without defaults cause silent 500s.**
If `profiles` has a `NOT NULL` column with no default value that the trigger doesn't populate, sign-up fails. Keep the profiles schema minimal at trigger time: only columns derivable from `auth.users` data (`id`, `email`, `display_name`, `created_at`). Add additional columns as nullable or with defaults.

**Trigger fires on every `auth.users` INSERT, including admin-created and OAuth users.**
Dashboard-created users, `inviteUserByEmail`-created users, and OAuth first-sign-in all fire the trigger. Ensure every code path handles missing `raw_user_meta_data` fields gracefully — the `coalesce` chain in the example above covers this. OAuth sign-ins land on the self-serve path (no invite token in metadata), which auto-creates an org — this is usually correct behavior.

**`REVOKE EXECUTE` is required on `SECURITY DEFINER` functions.** `[VERIFY BEFORE SHIPPING]`
The trigger function runs as `postgres`, bypassing RLS. If you forget to revoke execute from `public`/`anon`/`authenticated`, any client can call `handle_new_user()` directly via PostgREST RPC with arbitrary `NEW`-like arguments. Confirm the revoke statement is in your migration and that the Supabase Performance Advisor does not flag lint `0011` (mutable search_path in DEFINER functions).

**`ON CONFLICT` handling for trigger re-runs.** `[VERIFY BEFORE SHIPPING]`
If the trigger runs twice for the same user (unlikely but possible in disaster-recovery scenarios where a row is re-inserted), the `profiles` INSERT will hit a primary key conflict. Consider adding `ON CONFLICT (id) DO NOTHING` to make the trigger idempotent. Verify whether your schema requires this before deploying.

**Custom Access Token Hook reads rows created here — timing is correct but must be verified.**
AUTH_KB_2's hook fires each time a JWT is issued. It reads `profiles.primary_org_id` and `org_memberships.role`. For the self-serve path this data is committed before the first JWT. For the invite path, `primary_org_id` is set by the server action after token validation — until the user's token is next refreshed after the server action completes, their JWT may carry stale (null) org claims. Trigger a `supabase.auth.refreshSession()` after the invite acceptance server action returns to force immediate claim refresh. `[VERIFY BEFORE SHIPPING]`

**Supabase's built-in `inviteUserByEmail` conflicts with custom invite flow.**
`inviteUserByEmail` creates the `auth.users` row directly; the trigger fires on that insert. If you are also using a custom `invitations` table, you need a consistent strategy: either use `inviteUserByEmail` exclusively (and pass the invite token in the `data` option, noting the known bug supabase/auth#1370 where custom metadata may not appear in invite emails), or use the custom flow exclusively. Mixing the two creates ambiguous trigger state. This template recommends the custom flow.

---

## Cross-references

- **SB_KB_1** — Multi-org RLS. The `private.get_my_org_ids()` helper reads `profiles.primary_org_id` and `org_memberships` rows provisioned here. If this trigger has not run, all RLS policies return empty sets.
- **AUTH_KB_2** — Custom Access Token Hook. Reads `profiles.primary_org_id` and `org_memberships.role` to build JWT claims. Hook timing is correct: trigger commits before the first JWT is issued.
- **AUTH_KB_4** — Session lifecycle. Documents the first-request-after-signup path and what to do when a profile row is unexpectedly missing (repair-on-login pattern).
- **AUTH_KB_6** — Account management. Handles soft-deletion and cleanup of the `profiles`, `orgs`, and `org_memberships` rows provisioned here.
- **SB_KB_5 / SB_KB_6** — Audit trail. Invite acceptance (`invitations.accepted_at`) is a security-relevant event worth logging. Consider writing an audit row from the server action.
