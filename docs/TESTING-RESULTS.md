# Testing results

Validated locally on 4 August 2026.

| Check | Result |
| --- | --- |
| `npm run lint` | Passed across Studio, Persona schema and TypeScript SDK |
| `npm run typecheck` | Passed across all typed workspaces |
| `npm run test` | 8/8 Vitest tests passed |
| `npm run test:python` | 8/8 safety contract tests passed; service and Python SDK bytecode compiled |
| `npm run build` | Passed; Next.js generated 24 pages and all API routes |
| `php -l public/php/**/*.php` | Passed for every Afrihost PHP entry point and shared module on PHP 8.5.8 |
| `docker compose config --quiet` | Passed; the local multi-service Compose definition is valid |
| Production browser flows | Passed at desktop and 390 px mobile widths with no page errors |

The browser verification covered Studio navigation, search-ready controls, responsive navigation, visible AI disclosure, interview consent gating and candidate-private completion, tutor citation display, Presenter static-preview generation and format selection, and the API-key draft state. Screenshots are stored in `artifacts/screenshots`.

Docker integration tests were not run because the local Docker daemon was unavailable. GPU health/latency tests require an approved CUDA worker and are intentionally excluded from this CPU-safe development validation. The absence of these external runtimes is reflected in the product UI and known-limitations documentation.
