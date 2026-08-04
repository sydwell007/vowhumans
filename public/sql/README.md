# VowHumans Afrihost MySQL adapter

These files are manual phpMyAdmin migrations for the Afrihost integration adapter. The PostgreSQL platform schema remains canonical for realtime, GPU and media services.

1. Back up the target database.
2. Confirm MariaDB 10.6+ or MySQL 8.0 with `utf8mb4`.
3. Import `001_adapter_schema.sql`, then `002_seed_reference_data.sql`.
4. Create a random service key (at least 32 bytes), calculate its SHA-256 hash locally, and insert only the hash into `vhm_api_keys`; never upload the raw key in SQL or Git.
5. Copy `public/php/config.example.php` outside `public_html`, set secrets, then set `VOWHUMANS_CONFIG_FILE` in the hosting environment where available.

These migrations create tables and indexes without dropping existing data. The seed uses stable UUIDs and `INSERT IGNORE` so it is safe to re-run. Test on staging before production.

