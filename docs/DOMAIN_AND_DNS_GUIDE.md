# Domain and DNS guide

## Web

Add `vowhumans.com` and `www.vowhumans.com` to the correct Vercel project. Follow the exact records Vercel displays for the project; do not copy values from another domain. Remove conflicting A/AAAA/CNAME records, wait for authoritative propagation, then verify Vercel shows valid configuration and TLS. Choose one canonical hostname and redirect the other.

## API

Create `api.vowhumans.com` for the Afrihost API host. Confirm it never points to Vercel if PHP is meant to run on Afrihost. Issue TLS before accepting credentials. Configure exact CORS origins for the canonical web hostname and staging domains separately.

## Verification

Use `Resolve-DnsName vowhumans.com`, `Resolve-DnsName www.vowhumans.com` and `Resolve-DnsName api.vowhumans.com`; then verify HTTPS, certificates, redirects, `/api/health`, Afrihost `/api/v1/health`, CORS preflight and no SQL/PHP source downloads. DNS remains a manual operator gate in this build.
