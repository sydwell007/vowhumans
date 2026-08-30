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
- Complete-performance upload route: one authorised private source video can be mapped into the five required motion chapters without duplicating the raw biometric object.
- Chapter-aware processor and GPU renderer: neutral idle, listening, speaking, acknowledgement and explanation ranges are validated and decoded from their declared time boundaries.
- Safe-default feature flags and Render service definition.

## Complete performance video rules

- The source must remain private and must belong to the approved performer identity; a video in `public/` is not acceptable replica training media.
- Exactly five non-overlapping chapters of 1.5–30 seconds are required, each with a reviewer-confirmed neutral start and finish.
- Upload and chapter mapping can complete capture steps 2–8, but cannot complete the automated quality gate, processing, GPU preview, LiveKit evidence or accountable approval steps.
- The processor remains authoritative for resolution, frame rate, single-face continuity and readable chapter duration. The acceptance floor is 720p and 24 fps, with 1080p at 25–30 fps recommended.
- The participant and worker deduplicate a shared source by SHA-256 during preparation, then the GPU decoder reads only the chapter range selected by the motion director.

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
