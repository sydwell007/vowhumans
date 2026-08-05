# VowHumans repository audit

Audit date: 5 August 2026. Scope: commit `870ab69`, including the deployed Studio and the Afrihost upload bundle.

## Current architecture

- Turborepo with npm workspaces, Node 22+ and TypeScript 5.9.
- Next.js 16 App Router Studio in `apps/studio-web`; FastAPI service boundaries in `services`.
- PostgreSQL core migrations plus a narrower MariaDB/PHP adapter for Afrihost.
- LiveKit, OpenAI Realtime, avatar and presenter providers are interfaces or safe mocks unless credentials and workers are configured.

## Working

- Responsive Studio shell and 17 Studio views.
- Interview-practice, grounded-tutor and presenter-preview browser demos in disclosed mock mode.
- Next.js production build, API health surface, TypeScript/Python SDK foundations, consent gates and tenant-aware service contracts.
- PHP 8.1+ PDO adapter with scoped API keys, rate limiting, audit calls and server-side LiveKit token proxy.

## Working with limitations

- Studio records and analytics are seeded demonstration data, not persistent customer records.
- Authentication is an architectural boundary, not a complete end-user identity implementation.
- PostgreSQL has strong organisation ownership and RLS foundations; the MariaDB adapter covers only the first platform slice.
- Presenter, realtime and GPU modes are correctly labelled but need external providers.

## Missing before this expansion

- Public commercial website, pricing and ROI experience.
- Organisation/customer portal, platform-admin portal and onboarding.
- Marketplace, partner, Academy, investor, Trust Centre and full developer experience.
- Commercial billing abstractions, entitlement checks and expanded commercial schemas.
- SEO routes, sitemap, robots, PWA manifest and public lead workflows.
- Build-time secret/public-folder exposure gate and `.vercelignore`.

## Risks found

- `npm audit` reported three high-severity dependency findings through Next.js 16.2.12 (`postcss` and `sharp`); upgrade is required.
- Root `public/php` and `public/sql` were not explicitly excluded from Vercel source upload.
- The root API route is an honest development mock, but it must not be confused with the Afrihost or FastAPI production API.
- `public/php/php.zip` is an operator upload archive and must never become a web asset.
- No high-confidence committed private key or provider-key pattern was found.

## Deployment compatibility

The Studio is Vercel-compatible. FastAPI, PostgreSQL, Redis, LiveKit, object storage, PHP and GPU workers remain separate deployment targets. GPU inference must never run inside Vercel Functions.
