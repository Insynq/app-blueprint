---
description: Generate a UI component following project patterns and conventions
arguments:
  - name: description
    description: What the component does (e.g., "user avatar with dropdown menu")
    required: true
  - name: type
    description: Component type hint - "page", "modal", "form", "card", "layout" (optional)
    required: false
---

# Component Generator

Generate a UI component following the project's existing patterns and conventions.

## Instructions for Claude

### Step 1: Read Project Context

Read `CLAUDE.md` to understand:
- UI framework and component library in use (shadcn/ui, Material UI, Chakra, custom, etc.)
- Styling approach (Tailwind, CSS modules, styled-components, etc.)
- Component file structure conventions
- Role/permission model (if components need to be role-aware)
- Any established component patterns

### Step 2: Check the Catalog

Read `docs/KB_7_UI_Patterns.md` — specifically Parts 2 (Component Catalog) and 3 (Hook Catalog).

Check:
- Is there an existing component that does what's being requested, or is close enough to extend?
- Is there an existing hook that provides the data this component needs?
- Are there established patterns for this component type (modal, form, card, list)?

**If a suitable component already exists:** report it and stop. Don't generate a near-duplicate. Suggest extending the existing component instead.

### Step 3: Find Similar Components in Code

Search for 2–3 existing components similar in type or complexity. Read them to understand:
- File structure (imports, props interface, export pattern)
- How state is managed
- How data is fetched (hooks used)
- How the component library is used (which primitives, variants)
- How role/permission checks are done (if applicable)
- Error and loading state handling patterns

### Step 4: Check for Reuse

Before generating new code, check whether:
- A similar component already exists that could be extended or parameterized
- There are shared primitives (Button, Input, Card, Modal) that should be composed
- There are existing hooks that provide the data this component needs
- There are utility functions (formatting, validation) this component should use

Report what you found and whether the new component is genuinely needed.

### Step 4: Generate the Component

Write a complete component that:
1. Uses existing primitives — don't re-implement what the component library provides
2. Follows the exact file structure of similar existing components
3. Has a typed props interface
4. Handles loading, empty, and error states consistently with how other components do it
5. Is role-aware if the project has a permission model (don't show things users can't access)
6. Is accessible (semantic HTML, ARIA labels where needed, keyboard navigation for interactive elements)

### What NOT to Do

- Don't introduce new styling patterns if the project has established ones
- Don't create component-specific utility functions that belong in shared utilities
- Don't add features the description doesn't require
- Don't use a new library import when existing imports cover the need
- Don't add comments explaining what the code does — well-named code is self-documenting

### Output

Write the component file to the appropriate location following project conventions. Then briefly note:
- Where to import it from
- Any props that need to be wired up by the parent
- Any new hooks or utilities it depends on

### Update the Catalog

After generating, add an entry to `docs/KB_7_UI_Patterns.md` Part 2 (Component Catalog):

```
**[ComponentName]**
`src/components/path/ComponentName.tsx`
- **Purpose:** [one sentence]
- **When to use:** [specific scenario]
- **When NOT to use:** [common mistake]
- **Key props:** [only non-obvious props]
```

If any new reusable hooks were created, add them to Part 3 (Hook Catalog) as well.
