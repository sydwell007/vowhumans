# Guided Studio implementation report

Date: 2026-08-26

## Summary

Studio's existing Digital Human and Digital Colleague functionality was already fully real and working — this work added a discoverability and learning layer on top of it, not a rebuild. Nothing existing was removed, hidden, or rebuilt: the same 8-step Digital Human wizard and 12-step Digital Colleague builder, the same nav groups, the same API routes are all unchanged. What's new is a generic, reusable guide engine (coach marks + a persistent "Follow Along" dock) that highlights and validates real user actions on the real UI.

## Shipped

- **Guide engine** — `apps/studio-web/src/lib/guides.ts` (content: 2 flagship guides, 3 focused guides, 34 total steps, zero invented steps — see `docs/STUDIO_NAVIGATION_MAP.md`) and `apps/studio-web/src/lib/guideEngine.ts` (pure logic: setup-progress scoring mirroring the wizard's own real checks, next-best-action, target resolution). Both are DOM/DB-free and unit-tested.
- **`data-guide` instrumentation** — 20 real attributes across `StudioView.tsx` and `WorkforceStudio.tsx`, each paired with either a real navigation the existing UI already performs, or one new `studio:guide-step-complete` CustomEvent dispatched at the real point an action succeeds (7 total new dispatch call sites — far fewer than the ~14 originally estimated, because the Digital Colleague builder turned out to be entirely URL-driven per step, needing no new events at all for 11 of its 12 steps).
- **`CoachMark`** (`components/CoachMark.tsx`) — portaled spotlight + tooltip, polls the real `[data-guide]` element's `getBoundingClientRect()`, keyboard-navigable, floats with a "Finding this on the page…" state when the target isn't mounted yet (e.g. before navigating there).
- **`GuideProvider` + `FollowAlongPanel`** (`components/GuideProvider.tsx`, `components/FollowAlongPanel.tsx`) — live in `app/studio/layout.tsx`, the one genuinely persistent layout in the Studio tree. Progress hydrates from `localStorage` instantly, reconciles against the database in the background, auto-collapses while the Digital Human wizard is open.
- **Studio Home** — `StudioHomeChooser.tsx` ("what would you like to create?", collapses to a compact Guide Library link once the org has ≥1 of each entity, or in Expert Mode), `MySetupProgress.tsx` (two real columns, mirroring `WizardReviewStep`'s own checks and the real workforce readiness checks — never a fabricated 0%), `NextBestAction.tsx` (real counts only: pending identities, zero humans, work products awaiting review, zero colleagues, deployed-with-no-work-yet).
- **Guided/Expert Mode toggle** — `StudioShell.tsx` topbar, backed by `studio_user_preferences.guided_mode`.
- **Guide Library** — `/studio/learn` (`GuideLibrary.tsx`), lists all 5 guides with real per-user progress, resumes at the real saved step, surfaces "Work Products basics" first for the `reviewer` role.
- **Empty-state CTAs** — added to the two that had none (`OperationsWorkspace`'s "No Digital Colleagues", `TestCentreWorkspace`'s "No retained test runs") and to the Studio Home "no digital humans" state. Already-good empty states (Work Products, template grid) were left alone.
- **Database** — migration `020_guide_progress.sql`: `guide_progress` (per-user, per-guide status/step/completion, mutable in place) and `studio_user_preferences` (`guided_mode`). Applied and RLS-verified against a full `001`→`020` chain on an isolated container.
- **API** — `guide-progress` and `guide-preferences` added to the existing generic `/api/v1/[...route]` catch-all (not a new dedicated route file — 4 small endpoints didn't earn one), reusing the existing `requireUser()` helper.
- **Tests** — `guideEngine.test.ts` (12 tests), `guides.test.ts` (11 content-contract tests), 3 new route tests, 1 new `platform.test.ts` assertion. All pass; `npm run check` passes clean end to end.

## Deviations from the original spec, and why

- **No `/studio/learn` simulation with fake demo data.** Replaced with a Guide Library that runs the same engine against the user's real Studio. See the "Scope decision" section of `docs/STUDIO_NAVIGATION_UX_AUDIT.md`.
- **Guide step order follows the real UI, not the spec's assumed order.** The spec assumed Digital Human "connect an application" happens after testing and deployment; the real wizard connects an application *during* the wizard (step 7 of 8), before activation. The guide follows the real order.
- **Role set is the real 5 roles** (`owner, admin, operator, reviewer, viewer`, migration 001), not the spec's invented set (owner/admin/creator/reviewer/developer/analyst). Used only for light, UI-only guide-visibility surfacing — never as an enforcement layer; the real API routes already enforce write/approval/deployment roles independently.
- **`ApprovalsWorkspace`'s own colleague-approval and work-product-approval buttons were not separately instrumented.** Reading the code showed the colleague-configuration approval happens on the builder's own `approval` step page (already a navigation-validated guide step), and the work-product approval there is the identical action already instrumented in `TasksWorkspace` — adding a second `data-guide` target for the same underlying action would have been redundant, not more complete.

## Deferred (see `docs/GUIDED_STUDIO_ADDITIONAL_RECOMMENDATIONS.md`)

A granular `guide_events` log table, `NextBestAction` on entity detail pages, additional Guide Library entries beyond the 5 shipped, and a real analytics dashboard of guide completion.
