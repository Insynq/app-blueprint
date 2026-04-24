---
description: Generate tests following the project's testing patterns and conventions
arguments:
  - name: file
    description: Source file to test (e.g., "src/hooks/useOrders.ts")
    required: true
  - name: type
    description: Test type - "unit", "integration", "component" (auto-detected if not specified)
    required: false
---

# Test Generator

Generate tests following the project's existing patterns and conventions.

## Instructions for Claude

### Step 1: Read Project Context

Read `CLAUDE.md` to understand:
- Testing framework in use (Vitest, Jest, Playwright, etc.)
- Test file location conventions (co-located vs. `__tests__` folder)
- Existing test setup and global mocks
- What types of tests exist already

Also read `docs/LESSONS.md` if it exists — skim for entries relevant to testing patterns or the area being tested. Known gotchas are cheaper to avoid than to debug after the fact.

### Step 2: Read the Source File

Read `$ARGUMENTS.file` completely. Understand:
- What the code does
- What it depends on (imports, external calls)
- What behaviors are worth testing
- What edge cases exist

### Step 3: Find Existing Test Examples

Search for 2–3 existing test files that are similar in type (hook tests if testing a hook, component tests if testing a component). Read them to understand:
- The exact import patterns used
- How mocks are set up
- What helper utilities exist
- The overall test structure and naming conventions

**If no existing tests are found** (new project or first test file):
Use this default pattern:
- Test file location: `src/__tests__/[component-or-module].test.ts` (or `.test.tsx` for React components)
- Test runner: check `package.json` for vitest, jest, or similar — use whichever is configured
- Default structure:
  ```ts
  import { describe, it, expect } from 'vitest' // or jest

  describe('[ComponentOrFunction]', () => {
    it('does [expected behavior]', () => {
      // arrange
      // act
      // assert
    })
  })
  ```
- For React components: use `@testing-library/react` with `render`, `screen`, and `userEvent`
- For utilities/functions: test inputs and outputs directly, no DOM needed

### Step 4: Generate Tests

Write the test file following EXACTLY the patterns from existing tests. Do not introduce new patterns.

Cover:
1. **Happy path** — the thing works as expected
2. **Loading/empty states** — while data is fetching, when data is empty
3. **Error states** — when things fail
4. **Edge cases** — null values, empty arrays, boundary conditions
5. **User interactions** (for components) — clicks, inputs, form submissions

### Test File Location

Follow the project's convention. Common patterns:
- Co-located: `src/hooks/useOrders.test.ts` next to `src/hooks/useOrders.ts`
- Separate folder: `src/__tests__/hooks/useOrders.test.ts`
- Check existing tests to confirm which convention this project uses

### What NOT to Do

- Don't test implementation details (internal state, private methods)
- Don't duplicate the business logic in test assertions
- Don't create mocks that are more complex than the thing being tested
- Don't introduce testing utilities that don't already exist in the project
- Don't write tests for things that can't reasonably break (simple getters, constants)

### Output

Write the complete test file. Then briefly explain:
- What's covered
- What's intentionally NOT covered and why
- Any setup required (new mock, global config, etc.)
