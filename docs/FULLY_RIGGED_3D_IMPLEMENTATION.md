# Fully Rigged 3D implementation

The VowHumans web application now supports a controlled UE 5.8 MetaHuman pilot. The full operator runbook is in `C:\Users\sydwe\Desktop\vowhumans-metahuman\Docs\FIRST_FULLY_RIGGED_HUMAN_RUNBOOK.md`.

## Runtime flow

1. `POST /api/public/v1/embed-sessions` selects `rigged_3d` only when the feature flag is on and the assignment, profile, version, identity, face consent and commercial consent are all active.
2. `POST /api/public/v1/embed-livekit` mints the existing voice-room token and tells the gateway not to dispatch the 2D avatar worker for a rigged session.
3. `POST /api/public/v1/rigged-3d-session` rechecks the assignment/consent boundary, mints a short-lived HMAC grant and asks the private runtime broker for capacity.
4. Studio-web validates the returned Pixel Streaming player against `RIGGED_3D_PLAYER_ORIGIN`. The browser never receives `RIGGED_3D_RUNTIME_SECRET`.
5. `EmbedRoom` renders the UE stream with the LiveKit voice connection audio-only. LiveKit speaking events are sent through `/api/public/v1/rigged-3d-control` as allowlisted semantic state/motion messages.
6. A failed 3D allocation is never silently disguised; the visitor may explicitly choose the disclosed voice fallback.

## Server-only configuration

```dotenv
ENABLE_RIGGED_3D=false
RIGGED_3D_BROKER_URL=http://127.0.0.1:8787
RIGGED_3D_RUNTIME_SECRET=<same 32-plus-character secret as the broker>
RIGGED_3D_PLAYER_ORIGIN=http://127.0.0.1
```

Production requires HTTPS/WSS endpoints. Keep the flag false until the Studio's four rigged-3D quality checks pass.

## Studio flow

`/studio/replicas` supports **Fully Rigged 3D · UE 5.8** import. It creates an `unreal-metahuman-5.8` version in quality review and requires append-only evidence for rig integrity, facial animation, body motion and Pixel Streaming latency. Reviewer approval publishes the version; deployment remains a separate action and is rejected while the feature flag is off. Existing identity revocation disables the assignment immediately.

## Honest limitation

The site voice conversation and semantic body state are connected. Remote TTS audio is not yet ingested into the GPU host's MetaHuman Audio Live Link source, so production-quality speech-driven lip sync is still a release gate. Local microphone/audio-source face solving can be quality-tested in UE now.
