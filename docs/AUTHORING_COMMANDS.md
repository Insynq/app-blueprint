# Authoring Commands

How to write or edit a command in this framework. Commands live in `.claude/commands/*.md`, are
surfaced to the agent as invocable skills, and are **framework-managed** (the installer and
`/update-framework` overwrite them with backups — see `.framework-manifest.json`). Adopters may add
their own project commands in the same directory; those are project-owned and won't be overwritten.

This guide distills conventions that were previously implicit in the command set, plus lessons
adopted from the wider Claude Code skills ecosystem (notably obra/superpowers' hard-won rule about
descriptions).

---

## 1. The description is WHEN to use, not WHAT it does

**This is the most important rule.** The agent picks a command from its `description` alone — the
body is only read *after* the command is chosen. If the description summarizes the *workflow*, the
agent may follow the description and skip reading the body.

> Observed in the wider ecosystem: a skill whose description said "code review between tasks" caused
> the agent to run **one** review even though the body's flowchart clearly specified **two** — it
> followed the description instead of the instructions.

So write descriptions as **triggers and symptoms**, third person, starting with "Use when…":

```yaml
# Good — describes the situation that should make the agent reach for this
description: Use when something is broken, throwing, failing a test, or behaving unexpectedly and you
  need the root cause before touching code. Reach for this instead of guessing at a fix.

# Bad — summarizes the workflow; the agent may "do the description" and skip the body
description: Diagnose a bug by investigating root cause, forming a hypothesis, then fixing it.
```

Rules of thumb:
- Lead with the **trigger condition** ("Use when you have a validated plan and are ready to build…").
- Name the **symptoms / inputs** that should fire it (errors, a draft spec, uncommitted changes, a
  stale KB). These double as search keywords (see §4).
- It's fine to add a short tail naming what the command *produces* for keyword coverage, but the
  trigger must come first and dominate.
- Add **negative routing** when two commands are easily confused
  (`…use /investigate for codebase questions`, `…for an existing codebase use /adopt instead`).

---

## 2. Frontmatter

```yaml
---
description: Use when … (see §1)
arguments:
  - name: arg_name
    description: What this argument is, with an example in parentheses.
    required: true | false
---
```

- `description` is the only field the agent uses for selection. Keep the whole frontmatter well under
  ~1024 characters.
- `arguments` is optional. Omit it entirely for no-arg commands (`/kickoff`, `/preflight`).
- Quote an argument `description` only if it contains a colon-space (`: `) or other YAML-special
  punctuation. The top-level `description` may use em dashes, parentheses, and arrows unquoted, but
  must not contain `: ` unquoted.

---

## 3. Naming

- Lowercase, hyphen-separated, verb-first where it reads naturally: `gen-test`, `audit-rls`,
  `update-kb`, `plan-review`.
- Prefix families so related commands sort and read together: `audit-*`, `gen-*`, `update-*`,
  `db-*`. Add new commands to an existing family when one fits.
- The filename (minus `.md`) is the slash command (`debug.md` → `/debug`).

---

## 4. Search optimization (so the right command triggers)

The agent fuzzy-matches a task against descriptions. Help it:
- Cover **synonyms and symptoms**, not just the canonical noun — `/debug` mentions "broken,
  throwing, failing a test, wrong output, flaky," not only "bug."
- Mention the **artifacts** the command consumes or produces (spec doc, migration, RLS policy,
  changelog) — these are strong match signals.
- Use the words a user would actually type when they have the problem, not the internal mechanism.

---

## 5. Body structure

The body is a **narrative instruction document addressed to the agent** — second person, imperative.
It is not a spec for the agent to interpret; it's the procedure to follow.

Conventions in this framework:
- Open with an H1 matching the command and a sentence on its role.
- Lay out the procedure as numbered phases or steps. Mark checkpoints where the agent must stop for
  user input.
- When the command **dispatches a subagent**, embed the full dispatch prompt as a fenced code block
  so it's copy-paste-exact (see `/brainstorm`, `/implement`, and the trace-verifier template in
  `docs/MULTI_AGENT_WORKFLOW.md`). Don't make the subagent re-derive its instructions.
- Cross-reference sibling commands and KBs by name (`/plan-review`, `docs/MULTI_AGENT_WORKFLOW.md`).
  **Do not `@`-link files** — `@path` force-loads the entire file into context every time the
  command loads. Reference the path as text and let the agent open it on demand.

---

## 6. Brevity

Shorter commands are followed more reliably. Keep the body focused on the procedure; push deep
reference material into a KB and link to it. If a command has grown to cover several distinct jobs,
that's a signal to split it.

---

## 7. Discipline commands (Iron-Law style)

For commands that must hold the agent to a non-negotiable practice even under pressure to cut corners
(currently piloted in `/debug`), use the discipline pattern:
- State one **absolute rule** up front, in its own block, unconditionally.
- Add a **rationalization table** mapping the excuses the agent will generate to their rebuttals
  ("we're short on time" → "skipping root cause is how you get the second outage").
- Include the line **"Violating the letter of the rule is violating the spirit of the rule"** to
  close the "I'm following the spirit" loophole.
- Add an **escape hatch** for genuine dead ends (e.g. "after 3 failed fixes, stop and question the
  architecture rather than trying a 4th").

Use this sparingly and only where a real failure mode justifies it — calibrate on one command before
spreading the pattern. Most commands are flexible procedures, not iron laws.

---

## 8. After editing a command

- Edits to `.claude/commands/*.md` are framework changes: add a line to `FRAMEWORK_CHANGELOG.md` and
  bump the version in `.framework-manifest.json` when shipping (handled by `/ship`).
- New commands also need a row in the command tables in `CLAUDE.md`.
