# VowHumans Visual QA Report

Date: 8 August 2026

## Result

Pass. The upgraded application renders without framework error overlays or browser console errors across the representative route set. The supplied VowHumans lockup is used in the public header and footer, while the supplied mark is the source for the favicon and application icons.

## Viewports reviewed

- 1440 × 1000: homepage, mega menu, pricing, investor overview, sign-in
- 390 × 844: homepage hero, full mobile navigation, sign-in
- Horizontal-overflow checks passed at 1920 × 1080, 1600 × 900, 1366 × 768, 1280 × 800, 1024 × 768, 768 × 900, 430 × 844, 390 × 844, and 375 × 812.

## Routes reviewed

- `/`
- `/pricing`
- `/templates`
- `/investors`
- `/security`
- `/trust`
- `/digital-humans`
- `/sign-in`
- `/studio` unauthenticated redirect
- `/offline`
- unknown-route 404 state

## Interaction checks

- Desktop grouped navigation opens, closes, and supports Escape/outside-click dismissal.
- Mobile navigation covers and scrolls within the viewport, locks body scrolling, exposes expandable groups, and closes on navigation.
- Pricing switches between monthly and annual displays and preserves selected billing in sign-up links.
- Template search and category filters update result counts and provide a recoverable no-results state.
- Unauthenticated `/studio` requests still redirect to `/sign-in?next=%2Fstudio`.

## Accessibility

- Skip link and visible `:focus-visible` treatment are present.
- Navigation controls expose expanded state and controlled element relationships.
- Interactive controls use buttons, links, labels, and status regions appropriate to their behaviour.
- Reduced-motion preferences disable non-essential transitions and animations.
- Automated axe-core WCAG A/AA checks returned zero violations on home, pricing, templates, investor, security, and sign-in routes.
- No horizontal overflow was present at the 390-pixel mobile viewport.

## Build and code quality

- `npm run build`: passed, including security scan and generation of 126 static pages.
- `npm run check`: passed, including security scan, route contract, ESLint, TypeScript, 20 JavaScript/TypeScript tests, 8 Python tests, and Python compile checks.
- Next.js emits an existing advisory that the `middleware` convention is deprecated in favour of `proxy`; it is not a build failure and was left unchanged to protect the current authentication boundary.

## Screenshot evidence

- `artifacts/vowhumans-pre-upgrade-desktop.png`
- `artifacts/vowhumans-upgrade-home-hero.png`
- `artifacts/vowhumans-upgrade-home-desktop.png`
- `artifacts/vowhumans-upgrade-mega-menu.png`
- `artifacts/vowhumans-upgrade-home-mobile.png`
- `artifacts/vowhumans-upgrade-mobile-menu.png`
- `artifacts/vowhumans-upgrade-pricing.png`
- `artifacts/vowhumans-upgrade-investors.png`
- `artifacts/vowhumans-upgrade-signin-mobile.png`
