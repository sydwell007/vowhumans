# Video Replica POC results

Status: **NO-GO — implementation ready for authorised-capture testing, visual POC not executed**  
Date: 2026-08-29

## What was proven in this repository

- The replica renderer starts from captured video frames and composites only the MuseTalk jaw/mouth mask.
- Synthetic blink and portrait sway are absent from the replica render function.
- Captured clip selection supports idle, listening, speaking, interruption fallback and bounded structured gestures.
- Unknown gesture requests fall back to a plain captured state.
- Non-neutral gesture clips are rejected by the motion director.
- Live frame buffers drop stale frames instead of growing latency without bound.
- TypeScript, focused API/UI tests, Python contract tests and PHP syntax checks pass (see implementation report).

## What was not proven

- No authorised Thandi-style performer capture was provided.
- No replica Docker image was built or deployed to RunPod during this implementation.
- No replica version was processed on a real GPU.
- No visual lip-sync, identity-fidelity or hand-integrity review was performed.
- No measured low-latency chunk stream was run through LiveKit. The current participant path is per-utterance.

## Decision

Keep `ENABLE_VIDEO_REPLICA`, `ENABLE_STREAMING_REPLICA` and `ENABLE_REPLICA_GESTURES` false in production. The next decision point is one authorised vertical-slice capture run using `REPLICA_CAPTURE_PROTOCOL.md`, followed by the complete benchmark. Passing repository tests alone is not permission to market the capability as production-ready.
