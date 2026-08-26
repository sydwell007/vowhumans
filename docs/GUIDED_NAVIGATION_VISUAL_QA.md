# Guided navigation visual QA

Date: 2026-08-26

## What this pass covers, honestly

Unlike `docs/DIGITAL_WORKFORCE_VISUAL_QA.md` (which captured real browser screenshots against a live, seeded database), this pass could not authenticate against a real organisation: the local `DATABASE_URL` (`postgresql://vowhumans:vowhumans@localhost:5432/vowhumans`) points at port 5432, which on this machine is occupied by an unrelated project's Postgres container that must not be touched or reused. Standing up an isolated, fully-migrated VowHumans database on an alternate port, signing up a real user, and manually clicking through 20+ guide steps was out of scope for this pass. What follows is what was actually verified, and what is explicitly deferred.

## Verified

- `npm run build` (Next.js production build): compiles, typechecks, and statically generates all 135 pages, including the new `/studio/learn` route — clean, no errors or warnings introduced.
- `npm run check` (security scan → route check → lint → typecheck → unit tests → Python tests): passes clean across every workspace package.
- The dev server boots and correctly reaches the new route: an unauthenticated `GET /studio/learn` returns `307` to `/sign-in?next=%2Fstudio%2Flearn` (proving the route executed the real auth redirect in `app/studio/layout.tsx`, not a fallback 404).
- Migration 020 (`guide_progress`, `studio_user_preferences`) applied cleanly against the full `001`→`020` chain on an isolated `pgvector/pgvector:pg17` container, with `\d` confirming the exact column/constraint/index shape and `pg_class.relrowsecurity` confirming RLS is enabled on both tables.
- Code-level review of every new CSS rule against the real design tokens and z-index inventory (`docs/STUDIO_NAVIGATION_MAP.md`'s z-index table) — no collision with the existing `--coral` (active/brand), `--lime` (success/done), sidebar, topbar, drawer-scrim, wizard-panel, test-drawer, or toast layers. `--violet` was chosen specifically because it was defined but essentially unused elsewhere in the stylesheet.
- `prefers-reduced-motion`: no new JS-driven animation was introduced. `CoachMark`'s ring position and `FollowAlongPanel`'s progress bar both move via plain CSS `transition`, which the existing global rule (`globals.css`, `@media (prefers-reduced-motion: reduce)`) already zeroes to `.01ms` for every element on the page — no guide-specific opt-out was needed or added.
- Mobile: a new `@media (max-width: 560px)` block (the first breakpoint below the existing 620px one) converts `.follow-along-panel`/`.follow-along-tab` to full-width and `.coachmark-tooltip` to a bottom sheet, reviewed against the existing 860px/620px breakpoints for consistency.
- Keyboard handling: `CoachMark` attaches a single `keydown` listener for `Escape` (skip), `ArrowRight`/`Enter` (next, only when the step is actually validated), and `ArrowLeft` (previous) — reviewed by reading the code, not exercised in a real browser.
- `aria-live="polite"` on the tooltip (so it doesn't fight the wizard's own `aria-modal` dialog when both are open) and `aria-hidden` on the purely decorative ring/scrim — reviewed by reading the code.

## Not verified in this pass (explicit gap, not silently skipped)

- No real browser screenshots were captured — no visual confirmation of spacing, contrast, or overlap beyond code review.
- No authenticated end-to-end click-through of either flagship guide (all 10 Digital Human steps, all 20 Digital Colleague steps) was performed.
- No screen-reader pass (VoiceOver/NVDA) was performed.
- No real mobile-device or emulator pass was performed — only the CSS breakpoint rules were reviewed.

## Recommended before this ships to real users

Run the manual click-through script in the implementation plan (fresh zero-data org → Studio Home chooser → both flagship guides end to end → reload mid-guide to confirm resume → open the wizard while Follow-Along is expanded to confirm auto-collapse → toggle Expert Mode → keyboard-only pass → `prefers-reduced-motion` emulation → a real mobile viewport) against a real seeded database, and capture screenshots the way `docs/DIGITAL_WORKFORCE_VISUAL_QA.md` did.
