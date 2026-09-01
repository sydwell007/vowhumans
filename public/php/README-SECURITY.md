# Afrihost PHP adapter security

The PHP package is an integration adapter, not the VowHumans runtime or source of truth. Post-deployment tasks, tests, runtime evidence, work products, approvals and promotions remain in Neon/PostgreSQL.

- Keep runtime configuration and all secrets outside `public_html`.
- Use PHP 8.1+, PDO prepared statements, scoped service keys and exact CORS origins.
- Store only hashes of service keys; never commit or upload raw provider credentials.
- Never let a browser call unrestricted model or tool execution through this adapter.
- The whole `public/php` directory is excluded from Vercel and should be uploaded only to the protected Afrihost API host.
- Replica media must use `/home/vowhumg0z5c9/vowhumans-private` (or another absolute directory outside every web root). The storage gateway encrypts each object part with AES-256-GCM and authenticates Vercel requests with a timestamped, nonce-protected HMAC.
- Keep `AFRIHOST_PRIVATE_STORAGE_SECRET` only in Vercel and the external Afrihost configuration. Keep the separate encryption key only on Afrihost. Rotate either credential after suspected disclosure.
