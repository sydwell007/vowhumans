# Afrihost backend deployment

1. Back up and restore-test MariaDB.
2. Import SQL in the exact order documented in `public/sql/MIGRATION_ORDER.md`.
3. Create a database user limited to the VowHumans schema and required DML.
4. Upload the authoritative `backend-artifacts/php` package to the dedicated API host. `public/php` is the sanitized hand-off copy.
5. Put the completed configuration outside the web root and set `VOWHUMANS_CONFIG_FILE`.
6. Ensure Apache rewrite, headers, HTTPS, `Options -Indexes`, PHP 8.2 and disabled display errors.
7. Insert SHA-256 hashes of generated service keys with minimum scopes. Never store raw keys in SQL.
8. Verify health, tenant isolation, public lead consent, rate limits, revocation, HMAC replay controls and log redaction.
9. Remove SQL files and archives from every web-accessible directory after import.

Afrihost handles short PHP/API/database work. LiveKit agents, GPU inference, FFmpeg and model storage must run separately.
