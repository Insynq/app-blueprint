# KB 9 — Screen Catalog

> **Running inventory of every screen, modal, dialog, and major UI surface.**
>
> Not seeded at kickoff — populated as screens are built. Add an entry every time a significant new screen or modal is shipped.
>
> **Before building a new screen:** check here first. "This already exists" is a much cheaper answer than building a near-duplicate.

---

## How to Use

- **Scoping:** "Does a screen for X already exist?" — check here before it's added to a spec
- **QA:** Every screen that needs regression testing lives here — use as a checklist
- **Onboarding:** New contributors can understand the full UI surface without exploring every route
- **Refactoring:** `/unify` reads this catalog to find similar surfaces that could be consolidated

## Maintenance

- Add entries when a new screen or modal is shipped (the `/ship` command will prompt for this)
- Update entries when a screen's sections or behavior changes significantly
- Mark deprecated screens rather than deleting entries — they may have deep links that still exist

**Deprecating a screen:** Don't delete the entry. Instead, rename its heading to `### [Deprecated] Screen Name` and add:
`- **Status:** Deprecated [phase/date] — replaced by [Screen Name or route]`

---

## Entry Format

```markdown
### Screen / Dialog Name
- **Route:** `/path` or "Modal (no route)"
- **Roles:** who can access this
- **Objective:** one sentence on what this screen does
- **Key sections:** major UI regions, tabs, or panels
- **Actions:** what state-changing actions are available
- **Modals opened from here:** list of dialogs this screen triggers
- **Entry points:** how users get here (nav, deep link, button, etc.)
```

---

## Screens

> This catalog is intentionally empty on new projects. Populate it incrementally as screens are shipped. Do not prefill before building.

[Add entries as screens are built — organized by role or feature area]
