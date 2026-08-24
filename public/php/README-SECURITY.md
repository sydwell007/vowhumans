# Afrihost PHP adapter security

The PHP package is an integration adapter, not the VowHumans runtime or source of truth. Post-deployment tasks, tests, runtime evidence, work products, approvals and promotions remain in Neon/PostgreSQL.

- Keep runtime configuration and all secrets outside `public_html`.
- Use PHP 8.1+, PDO prepared statements, scoped service keys and exact CORS origins.
- Store only hashes of service keys; never commit or upload raw provider credentials.
- Never let a browser call unrestricted model or tool execution through this adapter.
- The whole `public/php` directory is excluded from Vercel and should be uploaded only to the protected Afrihost API host.
