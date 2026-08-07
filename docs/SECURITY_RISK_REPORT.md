# Security risk report

| Risk | Severity | Control / required action |
| --- | --- | --- |
| Next.js dependency advisories in 16.2.12 | High | Upgrade to the patched supported release and rerun audit/build. |
| Backend artifacts included in repository source | High | Exclude with `.vercelignore`; fail builds on secrets or app-public PHP/SQL. |
| End-user authentication has no email verification, reset or MFA yet | Medium | Registration/login/logout are real (scrypt-hashed passwords, revocable server-side sessions, lockout after 5 failed attempts, `/studio` and `/admin` protected). Add email verification, password reset and MFA before treating this as complete; see `docs/LIVE_AUTH_DEPLOYMENT.md`. |
| Payment settlement unavailable | High | Disable payment actions; use provider interfaces and verified idempotent webhooks only after merchant approval. |
| Cross-tenant data access | High | Organisation IDs from verified auth context, DB tenant indexes/RLS, least privilege and negative tests. |
| Identity misuse | High | Consent/provenance gates, immediate revocation and immutable audits; never remove disclosure. |
| Public-demo abuse | Medium | Sandbox knowledge, explicit consent, rate limits, bounded prompts and no transcript persistence by default. |
| Webhook forgery/replay | Medium | HMAC signature, timestamp tolerance, unique event ID and idempotent processing. |
| Sensitive logging | Medium | Correlation IDs and structured metadata only; redact credentials and private conversation content. |

No high-confidence private key, OpenAI key or AWS access key pattern was found in tracked text during the audit.
