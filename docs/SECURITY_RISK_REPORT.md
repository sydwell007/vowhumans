# Security risk report

| Risk | Severity | Control / required action |
| --- | --- | --- |
| Next.js dependency advisories in 16.2.12 | High | Upgrade to the patched supported release and rerun audit/build. |
| Backend artifacts included in repository source | High | Exclude with `.vercelignore`; fail builds on secrets or app-public PHP/SQL. |
| End-user authentication not persistent | High | Keep sign-in in clearly labelled preview mode until secure sessions, verification, reset, MFA readiness and audit storage are configured. |
| Payment settlement unavailable | High | Disable payment actions; use provider interfaces and verified idempotent webhooks only after merchant approval. |
| Cross-tenant data access | High | Organisation IDs from verified auth context, DB tenant indexes/RLS, least privilege and negative tests. |
| Identity misuse | High | Consent/provenance gates, immediate revocation and immutable audits; never remove disclosure. |
| Public-demo abuse | Medium | Sandbox knowledge, explicit consent, rate limits, bounded prompts and no transcript persistence by default. |
| Webhook forgery/replay | Medium | HMAC signature, timestamp tolerance, unique event ID and idempotent processing. |
| Sensitive logging | Medium | Correlation IDs and structured metadata only; redact credentials and private conversation content. |

No high-confidence private key, OpenAI key or AWS access key pattern was found in tracked text during the audit.
