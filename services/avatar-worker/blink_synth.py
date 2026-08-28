"""Real, deliverable application of a Digital Human's configured "Blinking"
gesture feature to rendered avatar video.

Unlike head_tilt/head_nod/breathing_sway (gesture_sway.py — one whole-frame
affine warp needing no facial structure at all), a believable blink needs to
know roughly where the eyes are. MuseTalk's own face detector
(musetalk.utils.preprocessing.get_landmark_and_bbox) gives this pipeline
only a face bounding box — no eyelid contour, no iris. A full facial-
landmark model (e.g. mediapipe's 468-point face mesh) would give a far more
precise eyelid contour, but mediapipe transitively depends on
opencv-contrib-python, which installs its own build of the `cv2` native
extension under the same import name as the opencv-python-headless build
this service already depends on for MuseTalk's own preprocessing — a real,
documented pip conflict (whichever installs last silently wins, and the
loser's features can vanish or misbehave depending on install order).
Rather than risk destabilising the already-working lip-sync path over that
conflict, this uses a classical technique already bundled inside
opencv-python-headless itself: the Haar cascade eye detector
(cv2.CascadeClassifier + cv2.data.haarcascades/'haarcascade_eye.xml'), run
once against the prepared avatar's own source frame and restricted to
search inside its already-known face bounding box.

That gives each eye's bounding rectangle — not a full eyelid contour — which
is enough to synthesize a plausible closed-eye frame: compress the detected
rectangle toward a horizontal line and blend in the skin tone sampled from
directly above it (the real eyelid-closed colour for that exact photo, not
a guessed average). This is a real, tested detector and a real, tested
compositing step, not a placebo effect — but it is coarser than a full
landmark mesh, and it depends on the cascade actually finding both eyes in
the source photo, which is not guaranteed for every angle/lighting/glasses
condition. When it can't find both eyes confidently, blinking is silently
left inactive for that avatar (never a crash, never a faked blink) — see
build_blink_material()'s None return path. docs/AVATAR_GESTURE_APPLICATION.md
has the full reasoning and discloses exactly what was and wasn't verified
against a real photo in this environment (no GPU, no MuseTalk weights, no
real face photo available here — the detector/compositing math is verified
for real against synthetic fixtures; finding real eyes in a real photo is
not).
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass

import cv2
import numpy as np

BlinkMaterial = tuple[np.ndarray, np.ndarray]  # (closed_eyes_frame, blend_mask: float32 single-channel, 0..1)

# Real eyelids close and reopen in roughly 100-150ms each way; the whole
# blink reads naturally at ~300-350ms total. A fixed constant, not part of
# the configured range — the configured range ("4-7s") only controls how
# *often* a blink happens, matching Studio's own copy for that field.
_BLINK_DURATION_SECONDS = 0.32


@dataclass
class BlinkSchedule:
    """Deterministic per-render blink onset times (seconds from the start of
    this reply). Deterministic — seeded, not because real blinking is
    metronomic, but so the same config/duration reproduces the same schedule
    for tests, and two renders of an identical reply don't visibly disagree
    if ever compared side by side."""

    onsets: list[float]
    duration: float = _BLINK_DURATION_SECONDS

    @classmethod
    def build(cls, min_seconds: float, max_seconds: float, total_seconds: float, seed: int = 0) -> "BlinkSchedule":
        rng = random.Random(seed)
        lo, hi = min(min_seconds, max_seconds), max(min_seconds, max_seconds)
        onsets: list[float] = []
        t = rng.uniform(lo, hi)
        while t < total_seconds:
            onsets.append(t)
            t += rng.uniform(lo, hi)
        return cls(onsets=onsets)


def blink_alpha(t: float, schedule: BlinkSchedule | None) -> float:
    """0.0 (eyes fully open) .. 1.0 (eyes fully closed) at elapsed time t.
    Pure, allocation-free, safe to call once per rendered frame. Onsets are
    ascending (BlinkSchedule.build only ever appends increasing values), so
    this can stop scanning once it passes t."""
    if schedule is None or not schedule.onsets:
        return 0.0
    half = schedule.duration / 2
    for onset in schedule.onsets:
        if onset - half > t:
            break
        if onset - half <= t <= onset + half:
            progress = (t - (onset - half)) / schedule.duration
            # sin^2 easing: 0 -> 1 -> 0 across the window, smooth at both ends
            # (no visible snap into/out of the closed frame).
            return math.sin(math.pi * progress) ** 2
    return 0.0


def detect_eye_boxes(frame: np.ndarray, bbox: tuple[float, float, float, float]) -> list[tuple[int, int, int, int]]:
    """Absolute-coordinate (x, y, w, h) boxes for exactly 2 eyes, searched
    only inside the supplied face bbox to cut false positives elsewhere in
    the frame. Returns [] if fewer than 2 confident detections land in the
    upper part of the face — callers must treat that as "blinking
    unavailable for this avatar," never guess a fallback position."""
    x1, y1, x2, y2 = (int(v) for v in bbox)
    x1, y1 = max(x1, 0), max(y1, 0)
    x2, y2 = min(x2, frame.shape[1]), min(y2, frame.shape[0])
    if x2 <= x1 or y2 <= y1:
        return []
    face = frame[y1:y2, x1:x2]
    if face.size == 0:
        return []
    gray = cv2.cvtColor(face, cv2.COLOR_BGR2GRAY)
    cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_eye.xml")
    if cascade.empty():
        return []
    detections = cascade.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=6,
        minSize=(max(int(face.shape[1] * 0.06), 1), max(int(face.shape[0] * 0.04), 1)),
    )
    if len(detections) < 2:
        return []
    # Eyes sit in the upper half of a face crop; a Haar eye cascade run over
    # a whole face can still fire on eyebrows/nostrils/glare lower down.
    upper_half = [d for d in detections if d[1] < face.shape[0] * 0.6]
    if len(upper_half) < 2:
        return []
    # Keep the 2 largest (most confident) detections, left-to-right.
    upper_half.sort(key=lambda d: -(int(d[2]) * int(d[3])))
    two = sorted(upper_half[:2], key=lambda d: d[0])
    return [(int(ex + x1), int(ey + y1), int(ew), int(eh)) for ex, ey, ew, eh in two]


def build_blink_material(frame: np.ndarray, bbox: tuple[float, float, float, float]) -> BlinkMaterial | None:
    """Runs once per prepared avatar (never per frame) — the expensive,
    one-off half of this feature, mirroring how MuseTalk's own bbox/latent
    computation is a one-off prepare_avatar() cost. Returns None when both
    eyes can't be confidently located, so the caller leaves blinking
    inactive rather than compositing on a guess."""
    eye_boxes = detect_eye_boxes(frame, bbox)
    if not eye_boxes:
        return None

    closed = frame.copy()
    mask = np.zeros(frame.shape[:2], dtype=np.float32)
    for ex, ey, ew, eh in eye_boxes:
        # The skin immediately above the eye is the real eyelid-closed colour
        # for this exact photo (not an averaged/guessed skin tone) — sample a
        # thin strip just above the detected box and stretch it down over the
        # eye opening.
        pad_x = max(int(ew * 0.15), 1)
        strip_y2 = max(ey - 1, 0)
        strip_y1 = max(strip_y2 - max(int(eh * 0.35), 2), 0)
        x1, x2 = max(ex - pad_x, 0), min(ex + ew + pad_x, frame.shape[1])
        if strip_y2 <= strip_y1 or x2 <= x1:
            continue
        strip = frame[strip_y1:strip_y2, x1:x2]
        if strip.size == 0:
            continue
        lid = cv2.resize(strip, (x2 - x1, eh), interpolation=cv2.INTER_LINEAR)
        closed[ey:ey + eh, x1:x2] = lid

        region_mask = np.zeros(frame.shape[:2], dtype=np.float32)
        cx, cy = ex + ew / 2, ey + eh / 2
        cv2.ellipse(region_mask, (int(cx), int(cy)), (max(int(ew * 0.65), 1), max(int(eh * 0.9), 1)), 0, 0, 360, 1.0, -1)
        mask = np.maximum(mask, region_mask)

    if not mask.any():
        return None
    # Feather the mask so the blend has no hard seam at the eye-region edge.
    blur_sigma = max(1.0, eye_boxes[0][2] * 0.08)
    mask = cv2.GaussianBlur(mask, (0, 0), sigmaX=blur_sigma)
    return closed, mask


def apply_blink(frame: np.ndarray, material: BlinkMaterial | None, t: float, schedule: BlinkSchedule | None) -> np.ndarray:
    """Alpha-composites the pre-synthesized closed-eye frame over `frame`
    inside the eye mask, weighted by blink_alpha(t). A true no-op (returns
    the identical frame, not a copy) whenever blinking isn't configured/
    available for this avatar or we're between blinks — matching
    gesture_sway.apply_gesture_sway's existing no-op contract, so a render
    with no eyes detected or no gesture assigned is unaffected."""
    if material is None or schedule is None:
        return frame
    alpha = blink_alpha(t, schedule)
    if alpha <= 0.001:
        return frame
    closed, mask = material
    if closed.shape != frame.shape or mask.shape != frame.shape[:2]:
        return frame
    weight = (mask * alpha)[..., None]
    blended = frame.astype(np.float32) * (1 - weight) + closed.astype(np.float32) * weight
    return blended.astype(np.uint8)
