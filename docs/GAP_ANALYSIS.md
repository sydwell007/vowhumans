# Commercial gap analysis

The original repository is a credible Phase 1 control plane, not yet a complete commercial SaaS business.

## Highest-priority gaps

1. Separate public acquisition, customer self-service and platform administration from Studio creation workflows.
2. Centralise plans, usage units, ROI assumptions, permissions and marketplace economics in tested code.
3. Extend organisation ownership, billing, marketplace, Academy, partner, sales and notification schemas.
4. Introduce end-user authentication and verified payment providers without weakening mock-safe local development.
5. Prevent backend deployment artifacts from entering the public web deployment.
6. Add honest status labels anywhere a provider, legal approval, licensed identity or persistent backend is missing.

## Delivery strategy

- Keep the current Studio components and legacy URLs available.
- Make `/` the marketing site and `/studio` the canonical Studio entry.
- Add reusable data-driven public, industry, portal and admin route architectures rather than duplicating pages.
- Keep one Next.js application for the initial Vercel launch so public pages and Studio share design tokens without duplicating deployment configuration.
- Consolidate early pricing, ROI, metering and permission logic in `@vowhumans/commercial-core`; split it only when independent release cadence is justified.
- Maintain authoritative Afrihost packages in `backend-artifacts`; keep root `public` as an explicitly excluded, sanitised operator hand-off location.
