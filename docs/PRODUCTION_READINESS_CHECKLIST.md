# Production readiness checklist

## Automated gates

- [x] `npm audit` reports no known vulnerabilities. (Verified 5 Aug 2026, second pass: 0 vulnerabilities.)
- [x] Lint, TypeScript, JS tests and Python tests pass. (`npm run check`: security-scan, route-check, lint, typecheck, 18 JS/TS tests, 8 Python tests — all green.)
- [x] Next.js production build passes with no dynamic-route conflicts. (87 routes generated, no errors.)
- [x] PHP 8.2 syntax checks pass for edited/added files (`php -l`). Full `tests/smoke.php` package smoke check still needs running against the live Afrihost host by the operator (no local MariaDB available in this environment).
- [x] Secret and public-artifact scans pass. (`scripts/security-scan.mjs`: 241 text files scanned, PHP/SQL deployment exclusions present; closed a gap where a live, credential-filled `config.php` was not gitignored.)
- [ ] Browser checks cover desktop/mobile home, Studio, pricing, ROI, forms, portal, admin denial/preview, API health and 404.

## Operator gates

- [x] `vowhumans.com` resolves to the intended Vercel project. (`www.vowhumans.com` DNS still pending — see `DOMAIN_AND_DNS_GUIDE.md`.)
- [x] `api.vowhumans.com` resolves to the Afrihost API host and PHP executes correctly (confirmed via live headers/response envelope).
- [ ] `api.vowhumans.com/api/v1/health` returns `200` — currently `500 INTERNAL_ERROR` at the database layer; under active diagnosis.
- [x] MariaDB migrations applied after a tested backup. (Operator-confirmed: all three migrations imported.)
- [ ] PHP configuration is outside `public_html`; least-privilege database user enabled. (Config currently sits in the supported in-package fallback location rather than outside `public_html`; database-user privilege grants not yet confirmed — likely cause of the current `500`.)
- [ ] Authentication provider, secure cookie domain, email verification, MFA and recovery tested.
- [ ] CORS contains exact production origins; rate limiting tested through the proxy path.
- [ ] Object storage lifecycle, encryption and signed URLs tested.
- [ ] Payment webhooks, idempotency, tax, refund and reconciliation tested before billing is enabled.
- [ ] LiveKit/TURN and GPU workers pass separate health, capacity, safety and licence review.
- [ ] Legal counsel approves all published terms; DPA/subprocessor and incident contacts are current.
- [ ] Backups, restore, alerting, runbooks, on-call ownership and rollback drill completed.
