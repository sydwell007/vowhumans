# SQL deployment security

- `001` through `005` are sanitized Afrihost MariaDB adapter migrations and run in the order documented by `MIGRATION_ORDER.md`.
- `006_post_deployment_runtime.sql` is a reference pointer only. The executable post-deployment migration is PostgreSQL migration `019` and belongs on Neon.
- Never place database URLs, passwords, API keys, tokens or production data in this directory.
- This directory is excluded from Vercel by `.vercelignore`; do not copy it beneath a publicly browsable Afrihost directory.
- Back up the target, use an approved operator account, test on staging and verify schema health before production use.
