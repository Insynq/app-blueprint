# Supabase Knowledge Base — Index

**Location:** `~/.claude/knowledge/supabase/` or `app-blueprint/.claude/knowledge/supabase/`
**Reference from:** each project's `CLAUDE.md`

---

## Purpose

Concrete, implementation-ready patterns for multi-tenant SaaS on Supabase + Next.js App Router + Vercel + Resend. Every project built on this stack starts here before implementing tenancy, access control, file uploads, email, or real-time features.

These files are for Claude. Principles-only docs fail at implementation time. Every KB file has real SQL, real policies, and real gotchas.

---

## File index

| File | Topic | Stack-portable? |
|---|---|---|
| `SB_KB_1_Multi_Org_RLS.md` | Union-membership RLS: one user, many orgs, shared content | ✅ Portable (Postgres RLS concept) |
| `SB_KB_2_Hierarchical_Graph_Orgs.md` | Tree + graph org structures, recursive CTE, effective_org_ids | ✅ Portable (Postgres) |
| `SB_KB_3_Split_Benefit_Relationships.md` | Typed many-to-many with benefit_type enum, partial unique index | ✅ Portable (Postgres) |
| `SB_KB_4_Composable_Checklists.md` | Assembled ordered lists from multiple org sources, LexoRank, phase gating | ✅ Portable (Postgres) |
| `SB_KB_5_Dual_Track_Admin_Session.md` | Admin-guided session + user self-service, state machine, RLS by parent state | ✅ Portable (Postgres/RLS) |
| `SB_KB_6_Submit_To_Reveal.md` | Atomic publish: idempotent submit, transactional outbox, audit trail | ✅ Portable (Postgres) |
| `SB_KB_7_Document_Upload_Compliance.md` | Secure upload, magic byte validation, async scanning, signed URLs, audit log | ⚠️ Partial — Supabase Storage RLS is Supabase-specific; concepts portable |
| `SB_KB_8_Subdomain_Routing_Nextjs.md` | Multi-org subdomain routing in Next.js App Router, Vercel domain config | 🔒 Stack-locked: Next.js + Vercel |
| `SB_KB_9_Realtime_Progress_Dashboards.md` | Broadcast from DB, per-org channels, RLS on realtime.messages, limits | 🔒 Stack-locked: Supabase Realtime |
| `SB_KB_10_Branded_Email_Resend.md` | Per-tenant email branding, BYOD domain via Resend API, Auth Send Email Hook | 🔒 Stack-locked: Resend + Supabase Auth Hook |
| `SB_KB_11_Phase_Locking_Progress.md` | Computed phase state, live vs materialized progress, retroactive items | ✅ Portable (Postgres) |
| `SB_KB_12_RLS_Performance.md` | InitPlan idiom, indexing for RLS, DEFINER helpers, consolidated policies | ✅ Portable (Postgres RLS internals) |
| `SB_KB_13_Denormalized_Cache_Discipline.md` | The one sanctioned duplicate: named cache over a single canonical source, three-condition rule | ✅ Portable (Postgres) |

---

## Cross-cutting rules that apply everywhere

**Always:**
- Wrap all `auth.uid()` and helper function calls in `(select ...)` inside `USING` clauses to force InitPlan evaluation
- Put tenancy helper functions in a `private` schema; revoke execute from `anon` and `public`
- Index every FK and every column referenced in a `USING` clause
- Use `SECURITY DEFINER STABLE` (not `IMMUTABLE`) for helper functions that read tables
- Use `app_metadata` for server-set identity claims; never `user_metadata`
- Test RLS as the `authenticated` role, never as superuser
- Emit notifications from `AFTER` triggers (post-commit), never `BEFORE`
- Use the transactional outbox for side effects that must fire after commit (emails, webhooks)

**Never:**
- Run Postgres TCP queries from Next.js middleware (Edge Runtime doesn't support TCP)
- Trust client-supplied `x-org-*` headers — always overwrite in middleware
- Send emails before the triggering DB transaction commits
- Delete compliance documents — supersede and archive instead
- Use `REFRESH MATERIALIZED VIEW` (non-concurrent) in production under read load
- Use Postgres Changes for multi-tenant fan-out at scale — use Broadcast
- Store the same fact in two columns/tables with no declared canonical owner — a denormalized copy is sanctioned only as a named cache written from canonical with a fan-out sweep or a display-only declaration (see `SB_KB_13`)

---

## Dependencies between files

```
SB_KB_1  ← SB_KB_12 (RLS performance applies to all SB_KB_1 policies)
SB_KB_1  ← SB_KB_2  (SB_KB_2 extends get_my_org_ids() with tree + graph)
SB_KB_1  ← SB_KB_3  (SB_KB_3 extends get_my_org_ids() with org_access benefit type)
SB_KB_4  ← SB_KB_1  (assembly function calls get_my_org_ids())
SB_KB_4  ← SB_KB_11 (phase state function calls get_user_checklist())
SB_KB_5  ← SB_KB_1  (session RLS uses DEFINER helper pattern)
SB_KB_5  ← SB_KB_6  (SB_KB_6 implements the submit function for SB_KB_5's session entity)
SB_KB_6  ← SB_KB_9  (broadcast trigger pattern from SB_KB_9 used in SB_KB_6 submit)
SB_KB_7  ← SB_KB_6  (outbox pattern from SB_KB_6 used for document upload notifications)
SB_KB_9  ← SB_KB_1  (Realtime channel RLS follows same DEFINER helper pattern)
```

---

## When to update these files

Update the relevant KB file when:
- A Supabase feature changes behavior (e.g., Realtime limits, Storage RLS functions)
- A pattern produces an unexpected result in production
- A new Supabase/Next.js major version changes a pattern (e.g., Next.js 16 middleware rename)
- You discover a new gotcha not documented here

Do not update KB files to reflect project-specific decisions. KB files are stack patterns, not project docs.

---

## What these files do NOT cover

- Authentication flow (magic link, OAuth) — see Supabase Auth docs
- Database migrations tooling (Drizzle, Prisma, raw SQL) — project-level decision
- Deployment pipeline (GitHub Actions, Vercel CI) — project-level decision  
- Frontend state management — project-level decision
- Billing / subscription gating — not yet documented
- Search (full-text, vector) — not yet documented
