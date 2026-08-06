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

- The root API route is an honest development mock, but it must not be confused with the Afrihost or FastAPI production API.
- No high-confidence committed private key or provider-key pattern was found.

## Deployment compatibility

The Studio is Vercel-compatible. FastAPI, PostgreSQL, Redis, LiveKit, object storage, PHP and GPU workers remain separate deployment targets. GPU inference must never run inside Vercel Functions.

## Second audit pass — 5 August 2026 (later same day)

Re-ran diagnostics and closed out the items above:

- `npm audit`: **0 vulnerabilities**. Next.js was already at 16.3.0 by this pass; the earlier `postcss`/`sharp` finding against 16.2.12 no longer applies.
- `.vercelignore` was confirmed to already exclude `public/php`, `public/sql`, `backend-artifacts`, `**/*.sql`, `**/*.zip` and `.env*`.
- `public/php/php.zip` removed from git tracking and deleted from the web-servable `public/` directory (it duplicated already-tracked source and is flagged in this repo's own docs as something that must never sit in a deployable path).
- Four empty, untracked scaffold directories (`backend-artifacts/php/{config,database,middleware,security}`) removed; their intended responsibilities were already implemented in `shared/*.php`.
- Closed a real gitignore gap: a live, credential-filled `public/php/config.php` (placed by the operator per the documented Afrihost fallback path) was not excluded by `.gitignore` — only `.env`/`.env.local` were. Added `config.php` (keeping `config.example.php` tracked) to prevent a future `git add` from committing production database credentials.
- Backend security hardening applied across `services/*` (Python microservices): `avatar-worker`'s internal-key check failed **open** when `VOWHUMANS_INTERNAL_KEY` was unset — fixed to fail closed with a timing-safe comparison. `realtime-agent` and `moderation-worker` had internal job-submission endpoints with **no** key check at all — added the same guard, now applied consistently across `presenter-worker`, `billing-worker`, `notification-worker`, `integration-worker` and `analytics-worker` too. `realtime-agent`'s `start()` could throw an unhandled `NotImplementedError` (raw 500) instead of an honest disabled-provider response — now caught and returned as `503`. `api-gateway` trusted a client-supplied `X-Organisation-Id` header against a single global shared key with no key→org binding — added an optional `VOWHUMANS_SERVICE_API_KEYS` registry so, once configured, the organisation is resolved from the matched key rather than trusted from the header (falls back to the previous dev-only behaviour when unconfigured).
- Frontend bugs fixed: three Studio-internal links were missing the `/studio` route prefix and 404'd (`/safety`, `/identity-consent`, `/api-keys`); the Dashboard's digital-humans panel linked out to the public marketing site instead of the in-app Studio section; the ROI calculator's payback-period math (`packages/commercial-core`) conflated a free plan's legitimate zero cost with the unpriced "contact sales" enterprise case, always showing no payback period for the Sandbox tier.
- Live connectivity check: `vowhumans.com` resolves (200). `www.vowhumans.com` does not resolve yet (DNS still pending, per `MANUAL_CONFIGURATION_REQUIRED.md`). `api.vowhumans.com` resolves and PHP executes correctly, but `/api/v1/health` returns `500 INTERNAL_ERROR` — config loads, so the failure is downstream at the database layer; under active diagnosis with the operator using a temporary, self-deleting diagnostic script rather than exposing server credentials further.
- All automated gates re-verified green: `npm run check` (security-scan, route-check, lint, typecheck, JS/TS tests, Python tests) and `npm run build` (87 routes).
