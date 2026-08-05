# Payment, realtime, media and storage deployment

## Payments

Keep PayFast/Stripe disabled until merchant approval. Use server-created checkout, signed raw-body webhook verification, replay protection, idempotency keys, amount/currency reconciliation, append-only billing events and separate refund authorisation. Never accept success solely from a browser redirect.

## Realtime

Issue short-lived, room-scoped LiveKit tokens from the trusted API. Configure TURN, regional latency, participant limits, disconnect cleanup, text/voice fallbacks and capacity alerts. Raw LiveKit keys never enter the browser.

## GPU/media

Deploy licensed MuseTalk/LivePortrait/Audio2Face or alternatives on separate workers. Pin model versions and licences, scan uploads, enforce job timeouts and resource limits, store outputs privately, and report provider state honestly. Afrihost PHP does not run these workloads.

## Object storage

Use private buckets, encryption, signed short-lived URLs, per-organisation prefixes, malware/content scanning, lifecycle policies, deletion jobs and egress monitoring. Store object keys and hashes in databases, not media blobs.
