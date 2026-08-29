# Photoreal Replica performance benchmark

## Required test asset

Use one authorised performer capture containing neutral idle, listening, speaking, one acknowledgement and one explanation hand gesture. Do not use a generated face to claim replica fidelity.

## Automated capture gates

| Check | Minimum gate |
|---|---:|
| Resolution | 720p hard minimum; 1080p recommended |
| Frame rate | 24 fps minimum |
| Single-face continuity | 0.75 sampled-frame detection ratio minimum |
| Clip duration | 1 second hard minimum; protocol durations recommended |
| SHA-256 | Exact browser declaration/object metadata/processor match |
| Neutral boundaries | Required for every runtime motion clip |

## GPU visual gates

- The mouth changes with arbitrary test speech; eyes, brow, hair, shoulders, body and hands remain the captured source motion.
- No synthetic blink is applied in replica mode.
- No portrait `gesture_sway` transform is applied in replica mode.
- Outside-mouth pixel drift is limited to video encoding differences. Investigate any systematic eye or hand change.
- Mouth/voice offset target: median ≤80 ms and p95 ≤120 ms over at least 20 utterances.
- No visible source-loop jump at a neutral transition in at least 50 transitions.
- Explanation cue selects the approved explanation clip and does not repeat indefinitely.
- Interruption returns to an approved interrupted/idle boundary without publishing stale speech.

## LiveKit gates

- Join success ≥99% over 100 controlled sessions.
- First visible responsive frame target ≤1.5 seconds after speech audio becomes available.
- No unbounded frame queue; stale frames are dropped and counted.
- Audio remains clean and never waits behind failed video. Portrait/audio-only fallback is observable.
- Test network loss, worker timeout, consent revocation and participant disconnect.

## Human acceptance

At least one identity owner and two accountable reviewers compare source and output on calibrated displays. They score identity fidelity, blink/gaze naturalness, body continuity, hand integrity, lip sync and overall trust on a five-point scale. No category may score below 4/5 for pilot approval.

All runs record worker image tag, replica version, quality mode, GPU, clip hashes, provider, render latency and safe failure codes. No transcript or raw frame enters telemetry.
