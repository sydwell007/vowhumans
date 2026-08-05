# VowHumans production PHP adapter

This is the authoritative Afrihost-compatible API package. It provides short-running metadata, commercial, billing-contract, webhook, consent, usage and audit endpoints. It must not host GPU inference, WebRTC agents, model downloads or FFmpeg jobs.

## Deploy

1. Use PHP 8.2+ with PDO MySQL, JSON and mbstring.
2. Import all SQL migrations in documented order and create a least-privilege database user.
3. Place `config.php` outside `public_html`; set `VOWHUMANS_CONFIG_FILE` to its absolute path.
4. Upload this package to a dedicated API virtual host such as `api.vowhumans.com`.
5. Confirm `.htaccess` is honoured and directory listing is off.
6. Generate random service keys, store only SHA-256 hashes and grant minimum scopes.
7. Run `php tests/smoke.php`, then verify health, CORS, tenant isolation, rate limits, consent revocation and webhook replay protection on staging.

No production secret or raw API key is included. Payment, email, LiveKit, object storage and GPU providers remain disabled until their environment values and feature flags are approved. The public copy is intentionally sanitized; never upload `php.zip` as an executable web asset.
