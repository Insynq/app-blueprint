# SB_KB_13 — Denormalized cache discipline (the one sanctioned duplicate)

A denormalized copy of a fact — `orders.customer_name` beside `orders.customer_id`, a cached count, a status mirror — is a facts-diverge-silently trap **unless** it is shaped as a **named cache over a single canonical source.** All three conditions must hold, or it is the banned anti-pattern:

1. **The cache names its owner.** The schema (a column `COMMENT`, this KB, or the migration) states which table is canonical and which column is the cache. There is never ambiguity about which one wins.
2. **Co-written from canonical, never hand-edited.** The cache is populated in the same write that creates its row — a `BEFORE INSERT` trigger, a generated column, or an RPC — sourced FROM the canonical row at that moment. It is never typed in independently and never edited in place by a client. (Per-row co-write guarantees only that *this* row's cache matched canonical *at write time* — nothing about later.)
3. **A canonical change fans out — you owe the sweep.** Editing the canonical record leaves every previously-written cache stale. Handle it one of two honest ways: an `AFTER UPDATE` trigger on the canonical table **rewrites the dependent cache columns**, OR you declare the cache **display-only / point-in-time** in the schema doc (it answers "what was true when this row was written"; the FK-resolved canonical value wins for anything current). You may NOT let it drift silently and then treat it as authoritative.

If any condition fails you are back in the trap: an unowned copy, one a second write path can hand-edit, or one whose canonical source can change with no sweep and no display-only declaration.

**Worked examples already in this repo:** `SB_KB_5_Dual_Track_Admin_Session.md:202` demonstrates the *mechanic* — denormalizing a flag onto a child row via trigger (condition 2's co-write shape). `BILL_KB_00_Index.md:7` states the *principle* for one domain — "Stripe is the canonical source of truth… the local DB is a cache" (condition 1's named owner, with webhooks as the condition-3 sweep). This KB generalizes that principle into the reusable three-condition rule.

**Installed 2026-07-10, not yet proven in a live run** — ported from agent-blueprint `OC_KB_16`, translated from its sheet-tab datastore to Postgres. The RLS/trigger mechanics (AFTER-trigger post-commit, SECURITY DEFINER helpers) follow `SB_KB_00` canon.
