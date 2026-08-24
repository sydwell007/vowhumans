# Runtime data ownership

## Canonical ownership

Neon/PostgreSQL is the canonical data store for identities, Personas, knowledge links, Digital Colleagues, deployment snapshots, work, work products, reviews, tests, events, usage and promotions. All runtime records carry `organisation_id`; API access derives that tenant from the authenticated session rather than request input.

Vercel hosts the Next.js control plane and server-side provider adapters. It does not expose provider credentials to the browser. Afrihost-hosted PHP is a compatibility/integration bridge only and must not become a parallel source of truth or execute Digital Colleague reasoning independently.

## Data boundaries

- Digital Human: disclosed identity/presence, Face, Voice and channel assignment.
- Persona: versioned behaviour and guardrails.
- Digital Colleague: bounded role, function, workflow, authority and escalation.
- Deployment: immutable approved configuration snapshot for one environment/version.
- Work item: requested business outcome and lifecycle.
- Work product: reviewable output with sources, assumptions, tools and model identity.
- Runtime evidence: tests, events, provider health and usage. Evidence is append-only where mutation would weaken auditability.

## Secret handling

OpenAI, LiveKit, Neon, GPU worker and bridge credentials are server-only environment variables. Public SQL/PHP directories contain no secrets and explain their upload/security boundaries. Provider health records store only safe status, latency and redacted diagnostics.

## Retention and deletion

Tenant deletion must use the existing controlled organisation deletion flow. Runtime child records use foreign keys and tenant policies; append-only operational evidence must be handled through authorised retention procedures, never client-side deletion.
