# VowHumans Afrihost database package

This directory is the authoritative, non-public MariaDB/MySQL deployment package. It complements the existing adapter migrations in `public/sql`; it does not replace the canonical PostgreSQL schema used by realtime/media services.

Deployment order:

1. Back up and restore-test the target database.
2. Apply `public/sql/001_adapter_schema.sql`.
3. Apply `public/sql/002_seed_reference_data.sql`.
4. Apply `003_commercial_expansion.sql` from this directory (or its sanitized upload copy in `public/sql`).
5. Run table, index, tenant-isolation, idempotency and least-privilege smoke tests.

The migration is additive and repeatable. It intentionally does not store raw API keys, raw payment secrets, large media, embeddings or GPU artifacts. Object references belong in object storage; secrets belong outside the web root.

Rollback is application-first: disable new feature flags, stop new writes, restore the pre-migration backup if required, and retain new tables for forensic review. Automated destructive `DROP TABLE` rollback is deliberately not shipped.
