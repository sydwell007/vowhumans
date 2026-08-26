# Studio navigation UX audit

Date: 2026-08-26

Performed before any change was made, per the instruction to "audit first, don't modify before understanding the current architecture." Every finding below cites the real file/line it was read from, not an assumption.

## What already exists (confirmed real, not aspirational)

- **Digital Human** — a real 8-step wizard (`apps/studio-web/src/components/StudioView.tsx`, `DigitalHumanWizard`), backed by `digital_humans` and its assignment tables. Steps: Identity, Face, Voice, Knowledge, Persona, Gesture, Applications, Review (`apps/studio-web/src/data/platform.ts:DIGITAL_HUMAN_BUILDER_STEPS`).
- **Digital Colleague / Digital Workforce** — a wholly separate, fully real entity (`digital_colleagues` + 20 child tables, migrations 017–019), with a real 12-step governed builder (`WorkforceStudio.tsx`, `ColleagueBuilder`), Test Centre, Work Queue, Work Products, Approvals, Operations and Analytics workspaces, all backed by parameterised SQL — zero mock branches.
- Both entities are real and independently built; the spec's assumption that this scope "already exists" was correct.

## Navigation structure (before this work)

Five flat groups in `platform.ts`, 25 items, no role filtering: Overview (Dashboard, Digital Workforce), Build (Digital Humans, Personas, Knowledge, Voices, Faces, Gesture Profiles), Operate (Test Centre, Operations, Work Queue, Work Products, Live Sessions, Presenter Studio, Languages, Applications), Govern (Approvals, Identity & Consent, API Keys, Webhooks, Safety, Settings), Measure (Workforce Analytics, Usage, Audit Logs).

This grouping already matches the spec's own recommended shape (build / operate / govern / measure), so it was kept as-is — no reshuffling was needed or done.

## Friction points found

1. **No entry point that explains "what to build first."** The Studio landing page (`ProductionControlPlane.tsx`, `ProductionDashboard`) went straight to metrics and a recent-humans list. A first-time user with zero data saw an empty dashboard and had to already know that Digital Human and Digital Colleague are two separate things before picking a nav item.
2. **No visible learning path.** 25 nav items with no guidance on order, and no indication that Digital Human → Digital Colleague is often the natural sequence (a colleague can attach to a human's identity via `digital_human_id`).
3. **No real-time completion feedback outside the wizard's own step rail.** `WizardReviewStep` (`StudioView.tsx:1357`) computes seven real readiness checks, but they were only visible at the very end of the flow, not before or during it.
4. **Two under-served empty states.** `OperationsWorkspace`'s "No Digital Colleagues" (`WorkforceStudio.tsx`, previously ~line 2931) and `TestCentreWorkspace`'s "No retained test runs" (previously ~line 2895) rendered copy with no action — a dead end for a new user landing there before creating anything.
5. **No mechanism to teach the real UI interactively.** No onboarding/tour package, no `data-guide`-style attributes, and no DB table for onboarding progress existed anywhere in the repo (confirmed by grep before writing migration 020).

## What was deliberately NOT changed

- No existing route, component, or database table was removed or renamed.
- No nav group was reshuffled — the five groups' order and membership are untouched.
- The Digital Human wizard's and Digital Colleague builder's own step order and copy are untouched; guide content quotes them, it does not replace them.

## Scope decision: no simulated "learn" environment

The originating spec asked for a `/studio/learn` simulation running against fake "Acme Engineering Demo" data. That was deliberately not built. Reasoning: both flagship guides' first real step already *is* the real creation flow, so a parallel fake-data clone would duplicate maintenance forever (every real UI change would need a matching fake-data change) while teaching muscle memory for a UI that isn't the one the user will actually use. The Guide Library instead launches the same coach-mark engine directly against the user's real Studio — see `docs/STUDIO_NAVIGATION_MAP.md`.
