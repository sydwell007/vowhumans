# Digital Workforce visual QA

Date: 2026-08-22

## Coverage

| Surface | Viewport | Result | Evidence |
| --- | ---: | --- | --- |
| Public workforce landing | 1440 × 1000 | Pass | `qa/digital-workforce-public-1440.png` |
| Eight vs 12 journey | 1024 × 900 | Pass | `qa/digital-workforce-journey-1024.png` |
| 25-role catalogue | 390 × 844 | Pass | `qa/digital-workforce-roles-mobile-390.png` |
| Studio workforce dashboard | 1440 × 1000 | Pass | `qa/digital-workforce-studio-dashboard-1440.png` |
| Studio role builder | 1440 × 1000 | Pass | `qa/digital-workforce-builder-role-1440.png` |
| Studio workforce dashboard | 390 × 844 | Pass | `qa/digital-workforce-studio-mobile-390.png` |

## Visual findings

- Brand cyan, blue, violet and magenta accents are used as hierarchy signals over the existing premium navy system.
- Digital Human, Persona and Digital Colleague are visually separated, then composed in a single operating-model graphic.
- Public headings retain a bold editorial hierarchy without reducing body text below readable sizes.
- Studio uses explicit live-workspace and capability-truth labels; disabled providers are visible instead of implied.
- Cards, status badges, forms, builder rail, work queue and review controls maintain readable foreground/background contrast.
- The public eight-step journey remains concise; the 12-step Studio rail gives administrators depth without overloading the marketing page.
- Motion is decorative only and is disabled/reduced under `prefers-reduced-motion`.
- Desktop and mobile checks found no horizontal page overflow.

## Automated checks

- WCAG 2 A/AA audit on public workforce landing: no violations.
- WCAG 2 A/AA audit on Studio workforce dashboard: no violations.
- Browser console errors: none.
- Failed browser requests: none.
- Public journey count: 8.
- Studio builder count: 12.
- Public role catalogue count: 25.

## Manual render conclusion

The captured pages present a coherent premium operating system rather than a disconnected feature addition. The identity/behaviour/work separation reads immediately, action hierarchy is clear, provider truth is visible, and the mobile catalogue remains usable without clipping or contrast loss.
