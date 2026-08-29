# VowHumans Replica Capture Protocol v1

This protocol is for an authorised adult performer who has approved likeness and commercial-use consent. It is not an identity-generation workflow.

## Before recording

1. Confirm the performer identity is approved, not expired or revoked, and has active `face` and `commercial` consent records.
2. Record permitted products, roles, geography, retention date and a human revocation contact.
3. Use a private room. Remove third parties, personal documents, screens, badges and background audio.
4. Use a stable 1080p camera at eye level, 25–30 fps, landscape orientation, locked focus/exposure where possible.
5. Disable beauty filters, virtual backgrounds, portrait blur and automatic reframing.
6. Use soft, stable front light. Avoid flicker, harsh shadows, backlight and eyewear glare.
7. Frame head, shoulders, upper torso and hands. Keep hands inside the safe frame.
8. Capture clean speech audio even though production speech will be replaced; it helps performance review.

## Required performance set

Every clip starts in neutral, contains one bounded performance, and returns to neutral.

| Clip | Minimum direction |
|---|---|
| Neutral idle | Natural breathing, blinking and small gaze shifts; no frozen stare |
| Listening | Attentive listening with one restrained acknowledgement |
| Speaking | Natural calibration passage with normal blinking, breathing and shoulders |
| Acknowledge | One natural nod or small hand acknowledgement |
| Explain | One open-hand explanation gesture, then return to neutral |

Optional expansion clips are `emphasise`, `reassure`, restrained warmth, concern and thinking. Each must be separately authorised and begin/end neutral.

## Capture duration

- Idle and listening: 8–15 seconds each.
- Speaking calibration: 15–30 seconds.
- Individual gestures: 3–8 seconds each.
- Record two clean takes; upload only the approved take.

## Operator checks

- Exactly one face is visible throughout.
- Lips, eyes, hands and shoulders are sharp and unobstructed.
- Frame rate and lighting do not change mid-clip.
- No jump cut occurs inside a clip.
- Neutral boundaries are genuine, not merely checked in the form.
- The performer reviews the selected take before processing.

## Storage and deletion

The browser uploads directly to private S3-compatible storage using a 15-minute signed PUT URL. PostgreSQL and MySQL contain only object keys, hashes, metadata and review evidence. Identity revocation disables runtime assignments immediately; object deletion is a separate audited operation that must be retried until confirmed.
