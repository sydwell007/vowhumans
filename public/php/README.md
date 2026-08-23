# Afrihost PHP integration adapter

Upload this `php` folder and the sibling `sql` migrations to the relevant Afrihost account following your existing GoalVow deployment convention. This adapter provides organisation-scoped metadata/session APIs and a protected proxy to the core LiveKit token endpoint. It must not run GPU inference, model downloads, FFmpeg renders or long-lived agents.

## Deployment

1. Import `../sql/001_adapter_schema.sql` through `005_digital_workforce_seed_templates.sql` in the documented order in phpMyAdmin.
2. Copy `config.example.php` outside `public_html`, insert database/platform/webhook secrets, and set `VOWHUMANS_CONFIG_FILE`. If the host cannot set it, use a protected `config.php` as a temporary fallback.
3. Generate separate random API keys for PlugConnect and GoalVow services. Store only `SHA256(raw_key)` in `vhm_api_keys` with the minimum scopes.
4. Set the approved CORS origins exactly; wildcards are not accepted.
5. Verify `GET /api/v1/health`, then test identity revocation, tenant isolation, HMAC replay tolerance and session deletion on staging.

Example key scopes: `applications:read`, `digital-humans:read`, `personas:read`, `identities:read`, `sessions:create`, `sessions:read-own`, `sessions:delete-own`, `renders:create`, `renders:read`, `usage:read-own`. Administrative write scopes should use a separate key.

Digital Workforce scopes are deliberately separated: `workforce:read`, `workforce:create`, `workforce:configure`, `workforce:test`, `workforce:approve`, `workforce:deploy`, `workforce:assign`, `workforce:review`, and `workforce:analytics`. Use separate creation, review, and deployment keys. The endpoint is `/api/v1/workforce/` with a `resource` query value such as `templates`, `colleagues`, `colleague`, `steps`, `tests`, `approvals`, `deployments`, `tasks`, `review-brief`, `reviews`, or `analytics`.

The PHP adapter never runs an AI model, invokes a third-party tool, or starts a scheduled job. Those requests return `FEATURE_DISABLED` until an approved platform worker is integrated.

The adapter deliberately never returns practice answers through session listing APIs. Core provider keys stay server-side.

The commercial dispatcher supports protected, organisation-scoped catalogue reads and persistent public sales/support request intake after migration 003. Public request routes are rate-limited and validate consent. Vercel excludes this entire folder; upload it only to the intended Afrihost API virtual host and keep configuration outside `public_html`.
