# VowHumans Afrihost MySQL adapter

These files are manual phpMyAdmin migrations for the Afrihost integration adapter. The PostgreSQL platform schema remains canonical for realtime, GPU and media services.

1. Back up the target database.
2. Confirm MariaDB 10.6+ or MySQL 8.0 with `utf8mb4`.
3. Import `001_adapter_schema.sql`, `002_seed_reference_data.sql`, `003_commercial_expansion.sql`, `004_digital_workforce.sql`, then `005_digital_workforce_seed_templates.sql` in that order.
4. Create a random service key (at least 32 bytes), calculate its SHA-256 hash locally, and insert only the hash into `vhm_api_keys`; never upload the raw key in SQL or Git.
5. Copy `public/php/config.example.php` outside `public_html`, set secrets, then set `VOWHUMANS_CONFIG_FILE` in the hosting environment where available.

These migrations create tables and indexes without dropping existing data. The seed uses stable UUIDs and `INSERT IGNORE` so it is safe to re-run. Test on staging before production.

The Digital Workforce adapter stores configuration and governance evidence only. Model inference, external tool side effects and scheduled execution remain disabled until separately approved platform workers are configured. The starter catalogue creates drafts, never approvals or deployments.

Security boundary: this folder exists only as a sanitized manual-upload copy for Afrihost. `.vercelignore` excludes it from the Vercel deployment. Never expose it beneath a web-accessible `public_html` path; remove the SQL files from the server immediately after a verified import.
