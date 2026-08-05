# Architecture decisions

## ADR-001 — Preserve one Next.js application for initial commercial launch

The marketing site, customer portal, developer pages and Studio share `apps/studio-web`, but use separate server-component shells. This avoids a risky monorepo split during domain migration and ensures the public homepage does not import Studio client code.

## ADR-002 — Canonical and compatibility routes

`/studio` and `/studio/[section]` are canonical. Existing top-level Studio routes remain supported during migration. `/app` is the organisation portal and `/admin` is the platform-admin boundary.

## ADR-003 — External workers remain external

Vercel hosts the web control plane only. FastAPI, LiveKit, Redis, object storage, media workers and GPU inference stay in private services with health gates and audio/text fallbacks.

## ADR-004 — Commercial rules are deterministic domain code

Pricing, annual discounts, usage estimates, ROI calculations, permission decisions and marketplace commissions live in a tested TypeScript package. UI copy consumes that central configuration.

## ADR-005 — Backend artifact boundary

`backend-artifacts/php` and `backend-artifacts/sql` are authoritative. `public/php` and `public/sql` are sanitised upload hand-offs excluded by `.vercelignore` and scanned during builds.

## ADR-006 — Honest progressive activation

External features are disabled by flags until their provider, legal, consent and security gates pass. Pages may demonstrate workflows but must identify sample data and unavailable settlement, SSO, GPU or media operations.
