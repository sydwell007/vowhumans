# Photoreal Replica implementation report

Date: 2026-08-29

## Delivered

- Three-tier renderer contract and explicit fallback order.
- Captured-motion director, bounded gesture vocabulary and stale-frame buffer.
- GPU preparation of actual captured frame sequences and mouth-only MuseTalk retargeting.
- Internal GPU endpoints to prepare, render and release a replica.
- Avatar participant selection of an approved replica with portrait/audio-only fallback.
- Private S3-compatible signed capture uploads with server-side HEAD verification.
- PostgreSQL consent/capture/job/version/clip/quality/assignment schema and revocation trigger.
- Afrihost PHP endpoint and MySQL migration copy in the requested public folders.
- Dedicated replica processor Docker service.
- Twelve-step Replica Studio and three appearance technology choices inside the existing eight-step Digital Human journey.
- Internal consent-gated runtime manifest with short-lived signed clip URLs.
- Safe-default feature flags and Render service definition.

## Deliberately not claimed

- Low-latency streaming is not implemented by the current per-utterance LiveKit participant, so `ENABLE_STREAMING_REPLICA=false`.
- Gesture cue transport is accepted by the avatar participant, but production dialogue policy does not yet emit cues automatically.
- A real performer POC has not been run.
- Fully Rigged 3D is not implemented.
- No foundation model was trained.

## Verification completed

- Studio TypeScript typecheck.
- Focused replica utility tests.
- Motion director, fallback and bounded-buffer Python tests.
- Python bytecode compilation for avatar worker, avatar participant and replica processor.
- PHP syntax validation for the Afrihost endpoint.

Run the repository-wide check and production build again after applying migration 021 to a disposable/staging database. Database-backed browser capture cannot be truthfully tested without configured private storage, an approved identity and authorised media.
