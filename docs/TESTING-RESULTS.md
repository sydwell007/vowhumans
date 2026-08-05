# Testing results

Validated locally on 5 August 2026 after the commercial expansion.

| Check | Result |
| --- | --- |
| `npm run security:scan` | Passed across 242 text files; Vercel exclusion rules confirmed |
| `npm run route:check` | Passed for 29 required commercial route files |
| `npm run lint` | Passed across all applicable workspaces |
| `npm run typecheck` | Passed across all typed workspaces |
| `npm run test` | 17/17 Vitest tests passed |
| `npm run test:python` | 8/8 tests passed; service and Python SDK bytecode compiled |
| `npm run build` | Passed on Next.js 16.3.0; 87 static pages generated plus dynamic/API routes |
| `npm audit --offline --audit-level=high` | Passed with zero known vulnerabilities in the local advisory cache; the live endpoint had a local CA-chain transport error on the final run |
| PHP syntax and smoke checks | Passed on all public and authoritative PHP files |
| Automated accessibility checks | Zero axe violations on home, pricing, Studio and demo-request pages |
| Browser route checks | HTTP 200 across representative product, industry, portal, legal, Studio, API, sitemap and robots routes |
| Protected artifacts | `/php/*` and `/sql/*` returned 404 from the Next.js site |

Browser verification covered desktop and 390 px mobile layouts, the responsive navigation, ROI recalculation, lead-form validation, truthful non-persistent form feedback, Studio navigation, API provider-state reporting and console output. No application console errors remained after the final pass.

Local MySQL migration execution was not performed because a MySQL client/server is not installed. The additive migration is syntax-reviewed and must be applied to an Afrihost staging database before production. Docker/GPU, payment, email, realtime and persistent authentication integration tests require external accounts and credentials and are listed in the production-readiness documentation.
