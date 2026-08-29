# Photoreal Replica architecture audit

Date: 2026-08-29  
Repository baseline audited: `main` at `98d7ae5`

## Executive finding

VowHumans already has a working consent-oriented control plane, an eight-step Digital Human builder, a twelve-step Digital Colleague builder, LiveKit voice transport, a separate avatar participant, and a RunPod MuseTalk worker. Those remain the foundation.

The pre-upgrade avatar was not a neural replica. `musetalk_engine.py` prepared one still image, reused the same latent for every frame, replaced the mouth region, then applied synthetic blink and whole-frame affine sway. That is retained as **Quick Portrait** because it is useful, deployed and materially different from captured performance.

The new **Photoreal Replica** tier starts each output frame from an ordered frame of an authorised performer capture. MuseTalk is restricted to the jaw/mouth blend mask. Source blinking, gaze, breathing, shoulder movement and captured hand gestures therefore remain source motion rather than being regenerated. The **Fully Rigged 3D** tier is a provider contract and feature flag only.

## Reused systems

- Existing identity and consent records, including revocation and expiry.
- Existing Digital Human, Persona, Knowledge, Voice, Gesture Profile and Application layers.
- Existing eight-step Digital Human journey. Appearance technology is selected inside its Face stage; the public journey was not expanded.
- Existing twelve-step Digital Colleague configuration and its separate work/governance identity.
- LiveKit room, voice agent and avatar-participant architecture.
- MuseTalk GPU model, mouth mask and FFmpeg output.
- Private S3-compatible object-storage environment contract.
- Existing audit-log function and organisation-scoped database policies.

## Added systems

- PostgreSQL migration `021_photoreal_replicas.sql`.
- Afrihost MySQL mirror `public/sql/007_photoreal_replicas.sql` and PHP control-plane endpoint.
- Private presigned capture uploads with size and SHA-256 metadata verification.
- Twelve-step Replica Studio capture/review workflow.
- Dedicated CPU replica processor for capture integrity and objective media checks.
- Provider-neutral renderer capability contract and explicit fallback order.
- Captured-motion director with a bounded gesture vocabulary and neutral-boundary selection.
- GPU video-replica preparation and mouth-only rendering endpoints.
- Internal runtime manifest endpoint with consent, approval, assignment and feature checks.
- Avatar participant selection: approved replica first, Quick Portrait second, audio-only last.

## Capability truth matrix

| Capability | Quick Portrait | Photoreal Replica | Fully Rigged 3D |
|---|---:|---:|---:|
| One-image setup | Yes | No | No |
| Batch mouth retargeting | Implemented/deployed baseline | Implemented in code, deployment pending | No |
| Real captured blink/gaze/body | No | Preserved by source-frame architecture | Renderer dependent |
| Captured hand gesture clips | No | Implemented in manifest/director | Contract only |
| Per-utterance LiveKit publication | Yes | Implemented via existing participant path | No |
| Low-latency chunk streaming | No | Not yet validated or enabled | No |
| Human visual acceptance | Legacy only | Awaiting authorised capture | Not tested |
| Production status | Existing fallback | Feature-gated POC | Experimental |

## Material risks still open

1. No authorised performer capture was supplied in this change, so visual identity fidelity and motion continuity have not been measured.
2. LiveKit currently buffers an utterance before GPU rendering. The low-latency ring-buffer contract exists, but `ENABLE_STREAMING_REPLICA` must remain false until a persistent chunk transport is completed and measured.
3. Preparing every captured frame creates significant GPU-memory demand. The first POC must measure a realistic clip set and tune `REPLICA_MAX_FRAMES_PER_CLIP`.
4. Haar-cascade face continuity is a capture-screening signal, not identity verification and not a replacement for accountable human QA.
5. Approval is intentionally blocked while GPU lip-sync visual review or LiveKit latency is `not_tested`.

## Architectural decision

Proceed with **Portrait → Photoreal Replica → Fully Rigged 3D** as separate providers. Do not add more synthetic body transforms to the portrait renderer in an attempt to turn a headshot into a full human performance.
