# Afrihost PHP integration adapter

Upload this `php` folder and the sibling `sql` migrations to the relevant Afrihost account following your existing GoalVow deployment convention. This adapter provides organisation-scoped metadata/session APIs and a protected proxy to the core LiveKit token endpoint. It must not run GPU inference, model downloads, FFmpeg renders or long-lived agents.

## Deployment

1. Import `../sql/001_adapter_schema.sql` and `002_seed_reference_data.sql` in phpMyAdmin.
2. Copy `config.example.php` outside `public_html`, insert database/platform/webhook secrets, and set `VOWHUMANS_CONFIG_FILE`. If the host cannot set it, use a protected `config.php` as a temporary fallback.
3. Generate separate random API keys for PlugConnect and GoalVow services. Store only `SHA256(raw_key)` in `vhm_api_keys` with the minimum scopes.
4. Set the approved CORS origins exactly; wildcards are not accepted.
5. Verify `GET /api/v1/health`, then test identity revocation, tenant isolation, HMAC replay tolerance and session deletion on staging.

Example key scopes: `applications:read`, `digital-humans:read`, `personas:read`, `identities:read`, `sessions:create`, `sessions:read-own`, `sessions:delete-own`, `renders:create`, `renders:read`, `usage:read-own`. Administrative write scopes should use a separate key.

The adapter deliberately never returns practice answers through session listing APIs. Core provider keys stay server-side.

