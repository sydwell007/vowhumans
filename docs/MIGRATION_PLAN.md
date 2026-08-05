# VowHumans migration plan

## Compatibility approach

The commercial site becomes `/`. The preserved Studio moves to `/studio` and its named sections move to `/studio/{section}`. Public routes such as `/digital-humans`, `/integrations` and `/webhooks` now describe commercial resources; their Studio equivalents remain under `/studio`.

The database change is additive. PostgreSQL migration `003_commercial_platform.sql` extends the canonical service schema. MariaDB migration `003_commercial_expansion.sql` extends the Afrihost adapter. Existing IDs, sessions, Persona records and the prior uploaded PHP endpoints are not renamed or dropped.

## Release sequence

1. Back up databases and capture current health responses.
2. Deploy the web build with provider features disabled.
3. Import MariaDB migration 003 on staging, then production.
4. Upload the new PHP package and verify `/api/v1/health`.
5. Configure `api.vowhumans.com`, CORS and `NEXT_PUBLIC_API_BASE_URL`.
6. Verify tenant isolation and public request persistence.
7. Enable one provider at a time after its test gate passes.

## Rollback

Revert web traffic to the previous Vercel deployment, turn new feature flags off, stop new commercial writes and restore the pre-migration database backup only if data integrity requires it. Additive tables are otherwise retained for diagnosis. Do not run mass `DROP TABLE` commands in production.
