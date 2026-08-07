# Manual configuration required

The repository deliberately cannot complete these external actions:

- Finish Vercel DNS verification and TLS for `vowhumans.com` and `www.vowhumans.com`.
- Create the `api.vowhumans.com` DNS record and Afrihost virtual host.
- Import SQL migration 003 and upload the updated PHP files after taking a backup.
- Set all server-only secrets outside the repository and rotate any value exposed during setup.
- Choose and configure transactional email, payment, object-storage, LiveKit/TURN, monitoring and GPU providers.
- Verify legal documents, pricing, VAT treatment, refund rules, marketplace seller terms and partner commissions.
- Provide real approved customer logos, testimonials and metrics; the site currently uses explicit internal/pilot status labels.
- Configure production persistence for website forms. Until `NEXT_PUBLIC_API_BASE_URL` and the API proxy are connected, forms report a validated non-persistent preview.
- End-user authentication (register/login/logout, hashed passwords, revocable sessions) is implemented and protects `/studio` (any account) and `/admin` (owner/admin role only) — see `apps/studio-web/src/lib/auth.ts` and `docs/LIVE_AUTH_DEPLOYMENT.md`. Still required: provision the Vercel Postgres database and run the migrations (nothing is hosted yet), set `AUTH_SECRET`/`SESSION_COOKIE_DOMAIN` in the Vercel production environment, and add email verification, password reset and MFA — none of which are built yet.
