# Digital Workforce implementation report

Date: 2026-08-22

## Delivered surfaces

### Public platform

- `/workforce`
- `/workforce/roles`
- `/workforce/how-it-works`
- `/workforce/deployment`
- `/workforce/human-collaboration`
- `/workforce/governance`

The public site retains the existing eight-step journey while explaining why Studio expands it into 12 persistent controls. Navigation, footer links, sitemap, home-page role library, metadata and terminology now consistently use Digital Colleague and Digital Workforce language.

### Studio

- `/studio/workforce` — live organisation dashboard and capability truth.
- `/studio/workforce/create` — searchable 25-role draft catalogue.
- `/studio/workforce/:id/:step` — persistent 12-step builder.
- `/studio/tasks` — governed work queue and reviewable outputs.
- `/studio/approvals` — configuration and work-product review queues.
- `/studio/workforce-analytics` — recorded evidence only.

The Studio navigation is reorganised around Overview, Build, Operate, Govern and Measure. Digital Humans and Personas remain separate build resources, while Digital Workforce is the operating layer.

## Canonical platform implementation

### Shared policy package

`packages/commercial-core/src/workforce.ts` provides:

- builder-step and lifecycle contracts;
- risk and autonomy levels;
- deterministic readiness evaluation;
- allow/review/escalate/block decisions;
- 25 bounded starter roles;
- no-provider unit-test coverage.

Commercial permissions now distinguish `workforce:create`, `workforce:configure`, `workforce:test`, `workforce:approve`, `workforce:deploy`, `workforce:assign`, `workforce:review` and `workforce:analytics`.

### PostgreSQL migrations

Apply in order:

1. `017_digital_workforce.sql`
2. `018_digital_workforce_seed_templates.sql`

Production Vercel builds now run `scripts/migrate-workforce.mjs` before the
Studio build. The runner uses the configured PostgreSQL connection, holds an
advisory lock, applies migration 017 only when the workforce schema is absent,
upserts migration 018 safely, and verifies that all workforce tables and at
least 25 published templates exist before allowing the deployment to continue.
Afrihost SQL remains a separate MySQL/MariaDB adapter and does not migrate the
canonical PostgreSQL database used by Studio authentication and persistence.

The schema covers teams, colleagues, role configuration, approved knowledge, tool policy, workflows, objectives/KPIs, guardrails, collaboration, tests, approvals, deployments, work items/events/products/reviews, escalations, costs, scheduled-job definitions and model policies. Organisation tables use RLS; control-plane entities are audited; approvals/events/reviews are append-only.

### Authenticated API

The Next.js API lives at `/api/v1/workforce` and supports:

- dashboard, templates, references, colleague detail and analytics reads;
- draft creation from templates or manual configuration;
- persistent 12-step updates;
- deterministic readiness tests;
- immutable approval and governed deployment;
- work assignment, deterministic briefs, optional gated model drafts and human reviews;
- tool registration as policy only.

Role-generation and model-execution endpoints return honest disabled states unless their specific server-side flags and providers are configured. Model outputs are labelled as drafts awaiting human review.

## Afrihost upload package

Upload/import these new files after the existing adapter resources:

- `public/sql/004_digital_workforce.sql`
- `public/sql/005_digital_workforce_seed_templates.sql`
- `public/php/api/v1/workforce/index.php`

The PHP endpoint accepts a `resource` query parameter and implements organisation-scoped templates, colleagues, generic 12-step persistence, tests, approvals, deployments, tasks, deterministic review briefs, reviews and analytics. AI inference, external tools and scheduled execution intentionally return `FEATURE_DISABLED` on shared hosting.

Recommended API-key separation:

- Builder key: `workforce:read`, `workforce:create`, `workforce:configure`, `workforce:test`.
- Reviewer key: `workforce:read`, `workforce:approve`, `workforce:review`.
- Deployment key: `workforce:read`, `workforce:deploy`, `workforce:assign`.
- Reporting key: `workforce:read`, `workforce:analytics`.

## Safe feature defaults

```text
ENABLE_DIGITAL_WORKFORCE=true
ENABLE_DIGITAL_COLLEAGUES=true
ENABLE_WORKFORCE_AI_GENERATION=false
ENABLE_WORKFORCE_MODEL_EXECUTION=false
ENABLE_WORKFORCE_TOOL_EXECUTION=false
ENABLE_WORKFORCE_SCHEDULES=false
```

The first two flags expose the implemented control plane. The remaining flags require separately approved providers/workers.

## Verification result

- Production build: passed with valid process-scoped validation URLs.
- TypeScript: passed for Studio and commercial core.
- ESLint: passed with no warnings/errors.
- Security scan and route contracts: passed.
- Core tests: 21/21 passed.
- PHP syntax: every PHP file passed.
- PostgreSQL migrations 001–018: applied successfully to a disposable PostgreSQL 17/pgvector database.
- Afrihost MySQL migrations 001–005: applied successfully to disposable MariaDB 10.11.
- Seed catalogue: 25/25 templates in both databases.
- RLS tenant isolation: verified using a non-owner role.
- Append-only approval mutation: rejected by the database trigger.
- Browser workflow: registration → identity → Persona → publish → colleague → role link → tests → approval → deployment → task → deterministic brief → human review → completed.
- Browser runtime: no console errors or failed requests.
- Responsive QA: no horizontal overflow at 1440, 1024 or 390 pixels.
- Automated accessibility: no WCAG A/AA violations on audited public/Studio workforce pages.

## Deployment note

The repository’s local `apps/studio-web/.env.production.local` is a redacted Vercel export and contains values that are intentionally not valid URLs. It is ignored/private and was not modified. Local production-build verification supplied valid URLs as process-only environment values. Ensure the real Vercel project has valid `NEXT_PUBLIC_SITE_URL` and PostgreSQL connection variables before deployment.
