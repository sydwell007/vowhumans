# Manual configuration required

The repository deliberately cannot complete these external actions:

- Finish Vercel DNS verification and TLS for `vowhumans.com` and `www.vowhumans.com`.
- Create the `api.vowhumans.com` DNS record and Afrihost virtual host.
- Import SQL migration 003 and upload the updated PHP files after taking a backup.
- Set all server-only secrets outside the repository and rotate any value exposed during setup.
- Choose and configure authentication, transactional email, payment, object-storage, LiveKit/TURN, monitoring and GPU providers.
- Verify legal documents, pricing, VAT treatment, refund rules, marketplace seller terms and partner commissions.
- Provide real approved customer logos, testimonials and metrics; the site currently uses explicit internal/pilot status labels.
- Configure production persistence for website forms. Until `NEXT_PUBLIC_API_BASE_URL` and the API proxy are connected, forms report a validated non-persistent preview.
- Restrict `/admin` using production auth, platform roles and MFA before any real administrative data is exposed.
