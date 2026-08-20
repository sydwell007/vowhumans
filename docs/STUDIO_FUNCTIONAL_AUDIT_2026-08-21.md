# VowHumans Studio functional audit — 21 August 2026

## Scope and method

The Studio was tested against an isolated PostgreSQL 17 + pgvector database with migrations 001–016 applied in order. A real account and organisation were created through the browser. The audit combined authenticated desktop and mobile browser automation, direct API workflow checks, database-backed reload checks, accessibility scanning, console/network monitoring, TypeScript, lint, unit tests and a production build.

The browser crawl covered every left-navigation route at 1536×960 and 390×844. It checked headings, links, buttons, enabled/disabled form controls, images, horizontal overflow, error overlays, failed requests, non-2xx responses and WCAG A/AA violations. Studio does not contain a canvas subsystem; motion is DOM/CSS/media based. Reduced-motion CSS now disables non-essential transitions and animations.

## Route and workflow results

| Studio area | Verified customer workflow | Result |
| --- | --- | --- |
| Dashboard | Live organisation counts, recent digital humans, session totals, consent totals, cost ledger, provider truth and audit activity | Pass |
| Digital Humans | Create, edit, activate, assemble and reload a governed digital human | Pass |
| Faces | Upload a real organisation-owned image asset and assign it to a persisted digital human | Pass |
| Voices | Upload a consented audio asset and assign it without exposing provider credentials | Pass |
| Knowledge | Create a library, ingest a document, assign only to persisted digital humans and reload | Pass |
| Personas | Create a blank Persona, persist its first version, publish it and assign it | Pass |
| Gesture Profiles | Create and assign a persisted motion configuration | Pass |
| Live Sessions | Create a test session for a published Persona, record a synthetic telemetry event and end the session | Pass; media transport remains provider-gated |
| Presenter Studio | Create and reload a real project and scene plan | Pass; render generation remains provider-gated |
| Languages | Read the capability registry and verify that disabled multilingual operations return `PROVIDER_DISABLED` rather than pretending to work | Pass |
| Applications | Create an application, validate a bare HTTPS embed origin and link a published Persona/digital human | Pass |
| Usage | Read the real usage ledger and download a valid CSV | Pass |
| Identity & Consent | Register an authority attestation and create four linked written/face/voice/commercial consent records; revoke path implemented | Pass |
| API Keys | Generate 32 random bytes, store only a SHA-256 hash, reveal once, reload without the secret and revoke | Pass |
| Webhooks | Encrypt a signing secret with AES-256-GCM, reveal once, verify an HMAC envelope locally, pause/resume and delete | Pass |
| Safety | Read measured controls and create a tracked safety support record | Pass |
| Audit Logs | Read append-only events, filter and export CSV; database trigger blocks update/delete | Pass |
| Settings | Load, save and reload organisation defaults, retention and notification preferences; read server-side feature/provider truth | Pass |

## Automated evidence

- 18 of 18 Studio routes rendered.
- 0 empty pages, broken images, horizontal-overflow pages or unexpected canvas elements.
- 0 browser console errors, page errors, failed requests or non-2xx page-data responses in the final crawl.
- 0 WCAG A/AA violations reported by axe in the final crawl.
- End-to-end workflow produced 1 active digital human, 1 completed session, 1 identity, 4 approved consent records, 1 revoked API key, a created/tested/deleted webhook and at least 27 append-only audit events.
- One-time API-key and webhook secrets were absent after page reload.
- Mobile navigation measured 310 px inside a 390 px viewport and the page did not overflow horizontally.

Screenshots and JSON browser reports are stored outside the repository under:

`C:\Users\sydwe\.codex\artifacts\vowhumans-studio-functional-audit`

## Production boundaries

The application no longer labels persisted customer data as a preview dataset or claims mock providers are active. It reports current server checks instead. Realtime audio/video, LiveKit tokens, GPU avatar workers, external email, billing and provider-backed rendering still require their documented production services and environment gates. A disabled or unreachable dependency is surfaced as disabled/unreachable; it is never represented as healthy.

Before production deployment, apply `packages/database/migrations/016_production_control_plane.sql` to the canonical PostgreSQL database. The Afrihost files in `public/php` and `public/sql` are a separate MariaDB integration adapter and must not receive this PostgreSQL migration.
