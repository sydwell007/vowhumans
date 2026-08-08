# VowHumans Brand and UI Audit

Date: 8 August 2026

## Scope

This audit covers the public marketing experience, authentication entry points, protected Studio shell, commercial/customer/admin portal surfaces, responsive behaviour, metadata assets, and the supplied VowHumans logo files. Existing authentication, organisation scoping, database, API, middleware, provider, and Afrihost PHP/SQL behaviour are protected implementation boundaries.

## Current strengths

- The platform already has unusually broad commercial depth: products, industries, templates, integrations, pricing, trust, investor, Academy, developer, Studio, customer, partner, and admin surfaces exist.
- Claims are generally responsible. Demo, planned, internal, fictional, gated, and proposed states are labelled instead of being presented as customer proof.
- Authentication and protected Studio routing work; an unauthenticated `/studio` request correctly redirects to sign-in with a return path.
- The homepage has a strong information hierarchy and moves from value proposition through product architecture, roles, deployment steps, demos, ROI, security, and conversion.
- Responsive layouts are functional at desktop and phone sizes, and the page emitted no console errors in the pre-upgrade browser audit.

## Gaps to address

- The existing coral, lime, cream, and serif visual system conflicts with the supplied cyan-blue-violet-magenta VowHumans identity.
- A CSS-drawn placeholder mark is repeated across public, Studio, and portal shells instead of using one canonical brand component.
- Navigation is dense and very small at desktop widths; product discovery depends on a flat link row rather than decision-oriented grouped menus.
- Public page heroes are oversized on pricing, investor, and information pages, reducing useful above-the-fold content.
- The full product and commercial depth feels visually uneven because the interface uses several generations of card, badge, and button styling.
- The Studio shell is functional but visually disconnected from the public identity.
- Metadata icons and social artwork use the previous placeholder identity rather than the supplied logo.
- Some visible strings contain encoding artefacts that weaken production polish.
- The experience needs stronger focus states, reduced-motion handling, mobile navigation behaviour, and formal visual QA documentation.

## Brand direction

The upgrade adopts a deep midnight enterprise interface with the supplied luminous logo as the source of truth:

- Core surfaces: `#050816`, `#080B18`, `#0D1224`, and `#11172B`
- Primary text: `#F8FAFC`; secondary text: `#CBD5E1`; muted text: `#94A3B8`
- Signature spectrum: cyan `#00D9FF` to blue `#2563FF` to violet `#7C3AED` to magenta `#D946EF`
- Visual balance: enterprise trust first, human warmth second, future-facing energy third
- Gradients are reserved for the logo, key headline accents, primary calls to action, selected active states, and restrained ambient glow

## Implementation priorities

1. Establish canonical assets and a reusable `BrandLogo` component.
2. Replace the flat public navigation with accessible grouped desktop and mobile navigation.
3. Align public pages, Studio, portals, feedback states, and metadata to one tokenised brand system.
4. Improve type scale, hero proportions, card hierarchy, conversion paths, focus treatment, and responsive behaviour.
5. Verify build, tests, protected routing, major public routes, accessibility fundamentals, and representative viewports.

