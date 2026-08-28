# Gesture Profile application — what's real, what isn't

Date: 2026-08-28

## The bug this fixes

Gesture Profiles (`gesture_profiles`, `human_gesture_assignments` — migration `006_faces_gestures.sql`) were entirely write-only: a real Studio UI, a real database, a real 1:1 assignment to a Digital Human — but nothing in the rendering pipeline ever read that assignment. A configured "Head tilt ±3°" had zero effect on a live call, a Presenter Studio render, or an embedded application. `docs/STUDIO_FUNCTIONAL_AUDIT_2026-08-21.md`'s own coverage table only ever tested that a profile could be *created and assigned* — never that it did anything.

## What's genuinely fixed now

Three of the seven configured features — **head tilt, head nod / shake, breathing / idle sway** — now actually drive rendered avatar video, in both places that render one:

- Live calls (Studio test calls and embedded-application calls both go through `services/avatar-participant`)
- Presenter Studio scene renders (`api/v1/presenter-projects/:id/render-next-scene`)

Both call the same `avatar-worker` `/internal/v1/render` endpoint, so the fix lives in one place: `services/avatar-worker/gesture_sway.py` applies a small, continuous, sine-driven `cv2.warpAffine` (rotation for tilt, vertical translation for nod/sway) to each already-blended frame, bounded by the human's actual configured degree range.

Data flow: `apps/studio-web/src/lib/gesture.ts` resolves a human's assigned profile and parses its free-text ranges ("±3°") into numbers → a new internal endpoint (`api/internal/v1/gesture`, same `x-internal-key` convention as `/faces`) serves that to `avatar-participant` for live calls → the render-next-scene route resolves it directly (same Next.js process) for Presenter Studio → both pass a `gesture_json` field to `avatar-worker`'s `/internal/v1/render` → `GestureConfig.from_dict()` → `apply_gesture_sway()`.

## What's still not applied, and why — not a shortcut, a real constraint

**Blinking, gaze shift, micro-expressions and hand gestures remain configured and assigned, but not reflected in rendered video.** This is not scope left for later convenience — it's a real limitation of the current rendering technology:

`avatar-worker`'s pipeline is MuseTalk (`services/avatar-worker/musetalk_engine.py`), a lip-sync model that takes one static source image and, per frame, replaces only the mouth/jaw region to match the spoken audio (`get_image_prepare_material(..., mode="jaw")`). `get_landmark_and_bbox()` gives the engine a single face bounding box — no eye landmarks, no body/hand pose, no expression control surface at all. There is no honest way to make "blink every 4–7 seconds" or "gaze shift" happen with this pipeline without either:

1. Real eye-landmark detection plus a synthesized closed-eye frame (a genuinely new capability this pipeline doesn't have), or
2. A different avatar model entirely — a full talking-head/motion-synthesis model (e.g. something in the SadTalker/LivePortrait/EMO family) that natively supports driven expression, gaze and pose — a materially larger project: new model, new weights, different GPU memory/latency profile, and its own render-quality risk.

Faking these with a cheap visual trick (a screen-flash timed to "blinking," for instance) was deliberately not built — it would report a configured feature as "working" when it isn't, which this codebase's whole approach to capability truth (see `WorkforceStudio.tsx`'s "Capability truth" panel, `runtimeFeatureFlags()`, honest provider-health states) exists specifically to avoid.

## Where this is now visible to a Studio user

The Gesture Profiles page (`StudioView.tsx`) shows a "Capability truth" banner explaining the split, and each of the 7 feature toggles in the create form is labelled **"Applied to rendered video"** or **"Recorded, not yet rendered"** — `GESTURE_FEATURE_DEFAULTS`'s new `appliedToRender` field is the single source of truth for that label, matching `gesture_sway.py`'s actual behaviour exactly.

## Recommended next step, if the remaining four features matter enough to invest in

Evaluate a real talking-head/motion-synthesis model as a genuine architecture change (not an incremental patch to MuseTalk) — this needs its own scoping pass: GPU capacity/cost impact, latency budget against the existing `RENDER_TIMEOUT_SECONDS`, and a real quality bar before it replaces a working, tested lip-sync pipeline.

## Verification performed

- `apps/studio-web/src/lib/gesture.test.ts` — 7 tests, the range-string parser against real Studio default values ("±3°", "±4°"), disabled-toggle handling, malformed/blank input, and a clamp against an absurd edited value.
- `services/avatar-worker/test_gesture_sway.py` — 8 tests, run for real against actual `opencv-python-headless`/`numpy` (installed into a throwaway venv for this verification pass, since this repo's general Python test environment doesn't carry avatar-worker's GPU-service dependencies): confirms `apply_gesture_sway` is a true no-op with no/inactive gesture, genuinely changes frame pixels when active, stays within the configured bound across a full oscillation period, and that `from_dict`'s field names match `gesture.ts`'s camelCase output exactly. Not reachable by `npm run test:python` (`unittest discover` can't build a dotted module path through the hyphenated `avatar-worker` directory name — a pre-existing limitation, harmless: discover silently skips it rather than failing).
- No live GPU/MuseTalk render was performed — no local GPU, no MuseTalk weights available in this environment. The frame-transform math itself was verified for real; end-to-end video output was not watched.
