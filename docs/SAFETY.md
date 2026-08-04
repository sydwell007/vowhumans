# Safety, consent and abuse controls

Every live or generated experience must show an AI label and session disclosure. The application never offers a switch to remove disclosure or watermarks.

## Publication gate

A custom identity remains blocked until the owner, face consent, voice consent, commercial permission, roles, applications, geography, source provenance, expiry and administrator approval are present. Revocation immediately blocks new sessions and render jobs; an audit event records the decision.

## Prohibited product behaviour

No unauthorised face/voice cloning, public-figure impersonation, covert recording, biometric employment scoring, appearance-based decisions, emotion/honesty/intelligence inference, medical diagnosis, stolen media ingestion or employer access to private practice answers.

## Controls

- Tenant-scoped queries and PostgreSQL row-level security.
- Hash-only API key storage with explicit scopes and expiry.
- Signed object URLs and private storage buckets.
- HMAC webhook verification, idempotency and timestamp tolerance.
- Prompt boundary markers, knowledge citations and injection filtering.
- Separate transcript and recording consent with retention limits.
- Moderation events, rate limits, abuse reports and immutable audit history.
- Candidate-owned PlugConnect feedback; employers receive usage metadata only.

