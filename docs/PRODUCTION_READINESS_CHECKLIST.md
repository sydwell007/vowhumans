# Production readiness checklist

## Automated gates

- [ ] `npm audit` reports no known vulnerabilities.
- [ ] Lint, TypeScript, JS tests and Python tests pass.
- [ ] Next.js production build passes with no dynamic-route conflicts.
- [ ] PHP 8.2 syntax and package smoke checks pass.
- [ ] Secret and public-artifact scans pass.
- [ ] Browser checks cover desktop/mobile home, Studio, pricing, ROI, forms, portal, admin denial/preview, API health and 404.

## Operator gates

- [ ] `vowhumans.com` and `www` resolve to the intended Vercel project with valid TLS.
- [ ] `api.vowhumans.com` resolves only to the intended Afrihost API host.
- [ ] MariaDB migrations applied after a tested backup.
- [ ] PHP configuration is outside `public_html`; least-privilege database user enabled.
- [ ] Authentication provider, secure cookie domain, email verification, MFA and recovery tested.
- [ ] CORS contains exact production origins; rate limiting tested through the proxy path.
- [ ] Object storage lifecycle, encryption and signed URLs tested.
- [ ] Payment webhooks, idempotency, tax, refund and reconciliation tested before billing is enabled.
- [ ] LiveKit/TURN and GPU workers pass separate health, capacity, safety and licence review.
- [ ] Legal counsel approves all published terms; DPA/subprocessor and incident contacts are current.
- [ ] Backups, restore, alerting, runbooks, on-call ownership and rollback drill completed.
