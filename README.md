# VowHumans Commercial Digital Human Platform

VowHumans is GoalVow's consent-first platform for governed digital employees, presenters, tutors, interview-practice partners, mentors, coaches and support agents. The repository now contains a commercial website, product catalogue, customer and partner portals, Studio, API contracts, SDKs, database migrations, Afrihost PHP/MySQL deployment files and provider-safe service boundaries.

The interface is deliberately honest about runtime state. Provider-dependent features remain labelled as previews or disabled until production credentials, data stores and licensed media pipelines are configured.

## Run locally

```powershell
npm install
npm run dev
```

Open `http://localhost:3000` for the commercial site and `http://localhost:3000/studio` for Studio.

## Validate

```powershell
npm run check
npm run build
```

The check includes a secrets/deployment-boundary scan, required-route contract, ESLint, TypeScript, 17 Vitest tests and 8 Python tests.

## Main surfaces

| Surface | Route or location |
| --- | --- |
| Commercial website | `/`, `/platform`, `/products`, `/industries`, `/pricing`, `/digital-humans` |
| Marketplace and Academy | `/marketplace`, `/templates`, `/academy` |
| Customer and admin portals | `/app`, `/admin` |
| Partner portal | `/partners` |
| Developer and trust centres | `/developers`, `/docs`, `/api-reference`, `/security`, `/trust` |
| Digital Human Studio | `/studio` |
| Versioned preview API | `/api/v1/*` |
| Afrihost upload package | `public/php`, `public/sql` |
| Authoritative backend source | `backend-artifacts/php`, `backend-artifacts/sql` |

## Deployment boundary

Vercel hosts the Next.js experience. PHP and SQL are excluded from Vercel by `.vercelignore` and must be uploaded to Afrihost. Apply SQL migrations in `public/sql/MIGRATION_ORDER.md` order, then upload the contents of `public/php` without exposing configuration secrets. GPU inference, realtime providers, billing, email, persistent authentication and object storage require their respective external services.

Start with [Final implementation report](docs/FINAL_IMPLEMENTATION_REPORT.md), [Production readiness checklist](docs/PRODUCTION_READINESS_CHECKLIST.md), [Afrihost deployment guide](docs/AFRIHOST_BACKEND_DEPLOYMENT.md), [DNS guide](docs/DOMAIN_AND_DNS_GUIDE.md), and [Manual configuration](docs/MANUAL_CONFIGURATION_REQUIRED.md).
