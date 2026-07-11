# UI_KB_0 — Index

> **Purpose:** Master index of the UI/UX knowledge base for Claude building multi-tenant SaaS with React + Tailwind v4 + shadcn/ui. Every project assumes: multi-tenant, role-based access, server-side security, self-service UX. Stack is fixed — do not hedge for other frameworks.

---

## File Listing

| File | Topic | Key Decision |
|---|---|---|
| `UI_KB_1_DesignTokens.md` | Design Token Architecture | Three-tier hierarchy; semantic vs. primitive; token naming conventions |
| `UI_KB_2_ColorSystem.md` | Color System Design | OKLCH; semantic roles; dark mode; multi-tenant brand overrides |
| `UI_KB_3_Typography.md` | Typography System | Named scale; heading hierarchy; font pairing; responsive rules |
| `UI_KB_4_SpacingLayout.md` | Spacing & Layout | Base-4 scale; layout primitives; container widths; breakpoints |
| `UI_KB_5_ComponentArchitecture.md` | Component Architecture | Atomic design; cva variants; compound components; required states |
| `UI_KB_6_MotionInteraction.md` | Interaction & Motion | When to animate; timing; skeletons vs. spinners; reduced motion |
| `UI_KB_7_Navigation.md` | Navigation Patterns | Sidebar vs. top nav; active states; mobile drawer; breadcrumbs |
| `UI_KB_8_AdminVsEndUser.md` | Admin vs. End-User Surfaces | Density; data tables; role-based UI; dashboard layout |
| `UI_KB_9_StatusFeedback.md` | Status & Feedback Systems | Toast vs. inline vs. modal; optimistic UI; empty states |
| `UI_KB_10_Accessibility.md` | Accessibility Baseline | Keyboard nav; focus management; ARIA; contrast |
| `UI_KB_11_ReactTailwindShadcn.md` | React/Tailwind/shadcn Implementation | Tailwind v4 @theme; shadcn architecture; file structure; cva patterns |
| `UI_KB_12_CommonMistakes.md` | Common Agent Mistakes | Consolidated anti-pattern reference; indexed by category |

---

## How to Use This KB

Claude should load the specific file(s) relevant to the task at hand. Do not load all files for every task — grep the index for the relevant topic, then read that file only.

**Examples:**
- Building a new component with variants → `UI_KB_5`, `UI_KB_11`
- Setting up dark mode and org branding → `UI_KB_1`, `UI_KB_2`
- Building an admin data table → `UI_KB_8`
- Adding toast notifications → `UI_KB_9`
- Reviewing code for accessibility issues → `UI_KB_10`, `UI_KB_12`
- Starting a new page layout → `UI_KB_4`, `UI_KB_7`

**User-facing copy in specs:** exact strings on user-facing surfaces (errors, onboarding, billing/consent, empty states) are locked spec content, not build-time decoration — see the copy-locking spec convention gated by `/plan-review` §3a (reading level, never-say list, verbatim copy with rationale).

---

## Stack Assumptions (apply to all files)

- **Framework:** React 18+
- **Styling:** Tailwind CSS v4 (CSS-first config via `@theme`)
- **Components:** shadcn/ui (Radix UI or Base UI registry)
- **All projects are multi-tenant** — org-level branding, role-based UI surfaces, and scoped data are baseline requirements, not optional features
- **Color format:** OKLCH throughout
- **TypeScript:** assumed

---

## Onboarding App Patterns

Onboarding-specific patterns (phased flows, dual-status checklists, gamification, admin call UX) are folded into the relevant topic files as concrete examples:
- Phase/step indicators → `UI_KB_7_Navigation.md`
- Dual-status task checklist component → `UI_KB_5_ComponentArchitecture.md`
- Progress gamification → `UI_KB_9_StatusFeedback.md`
- Admin vs. agent surface differences → `UI_KB_8_AdminVsEndUser.md`
