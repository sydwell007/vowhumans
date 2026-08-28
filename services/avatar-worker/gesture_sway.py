"""Real, deliverable application of a Digital Human's assigned Gesture Profile
to rendered avatar video — deliberately its own module, separate from
musetalk_engine.py, so it needs only cv2/numpy (never torch or MuseTalk's own
repo) and can be tested on its own.

Three of a Gesture Profile's seven configured features are applied here —
head_tilt, head_nod, breathing_sway — as one small continuous whole-frame
sway needing no facial structure at all. A fourth, blinking, is applied by
the sibling module blink_synth.py using a one-off Haar-cascade eye-region
detection per avatar. See apps/studio-web/src/lib/gesture.ts and
docs/AVATAR_GESTURE_APPLICATION.md for the full reasoning: MuseTalk's
get_landmark_and_bbox() gives this pipeline only a face bounding box, no
eyelid contour or body landmarks, so gaze_shift, micro_expressions and
hand_gestures are not something this pipeline can honestly apply — they stay
configured and shown in Studio, but unapplied, rather than faked.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class GestureConfig:
    head_tilt_enabled: bool = False
    head_tilt_degrees: float = 0.0
    head_nod_enabled: bool = False
    head_nod_degrees: float = 0.0
    breathing_sway_enabled: bool = False
    # Blinking's fields live on this same shared config object (matching the
    # one JSON blob apps/studio-web/src/lib/gesture.ts already produces and
    # avatar-participant already forwards verbatim) but its actual detection/
    # compositing logic lives in blink_synth.py, not here — unlike the sway
    # fields above, applying a blink needs a one-off per-avatar eye-region
    # detection pass, not just a per-frame transform.
    blinking_enabled: bool = False
    blink_interval_min_seconds: float = 4.0
    blink_interval_max_seconds: float = 7.0

    @classmethod
    def from_dict(cls, data: dict) -> "GestureConfig":
        return cls(
            head_tilt_enabled=bool(data.get("headTiltEnabled", False)),
            head_tilt_degrees=float(data.get("headTiltDegrees") or 0),
            head_nod_enabled=bool(data.get("headNodEnabled", False)),
            head_nod_degrees=float(data.get("headNodDegrees") or 0),
            breathing_sway_enabled=bool(data.get("breathingSwayEnabled", False)),
            blinking_enabled=bool(data.get("blinkingEnabled", False)),
            blink_interval_min_seconds=float(data.get("blinkIntervalMinSeconds") or 4.0),
            blink_interval_max_seconds=float(data.get("blinkIntervalMaxSeconds") or 7.0),
        )

    @property
    def is_active(self) -> bool:
        """Gates only the whole-frame sway this module applies. Blinking is a
        separate effect with its own availability check (blink_synth.py's
        build_blink_material() succeeding) — deliberately not folded in here,
        so a render can genuinely blink without also swaying, or vice versa."""
        return self.head_tilt_enabled or self.head_nod_enabled or self.breathing_sway_enabled


def gesture_offset(t: float, gesture: GestureConfig | None) -> tuple[float, float]:
    """(rotation_degrees, vertical_shift_px) for one frame at elapsed time t
    (seconds since this reply started rendering). Slow sine oscillations, not
    random jitter, so the motion reads as a natural sway rather than a twitch
    — matching Studio's own "Motion with restraint" framing for this feature.
    head_nod's configured *degrees* can't literally rotate a face-on 2D crop
    on that axis, so it's deliberately scaled into a small vertical bob
    instead — a larger configured range still reads as "more motion," just
    not a literal nod. Bounded by construction: gesture.ts's parser already
    clamps degrees to a sane maximum before this ever sees them."""
    if gesture is None or not gesture.is_active:
        return 0.0, 0.0
    angle = 0.0
    dy = 0.0
    if gesture.head_tilt_enabled and gesture.head_tilt_degrees > 0:
        angle = gesture.head_tilt_degrees * math.sin(2 * math.pi * t / 7.0)
    if gesture.head_nod_enabled and gesture.head_nod_degrees > 0:
        dy += gesture.head_nod_degrees * 0.6 * math.sin(2 * math.pi * t / 5.0 + 1.1)
    if gesture.breathing_sway_enabled:
        dy += 1.5 * math.sin(2 * math.pi * t / 4.2)
    return angle, dy


def apply_gesture_sway(frame: np.ndarray, t: float, gesture: GestureConfig | None) -> np.ndarray:
    """Applied to the already fully-blended (mouth-synced) frame, so it moves
    the whole head including MuseTalk's own mouth region together — never
    just re-warps a sub-region and risks misaligning the lip-sync. A no-op
    (returns the identical frame, not a copy) whenever gesture is None/
    inactive, so a render with no gesture profile assigned is byte-for-byte
    what this engine already produced before this existed."""
    angle, dy = gesture_offset(t, gesture)
    if angle == 0.0 and dy == 0.0:
        return frame
    height, width = frame.shape[:2]
    matrix = cv2.getRotationMatrix2D((width / 2, height / 2), angle, 1.0)
    matrix[1, 2] += dy
    # BORDER_REPLICATE, not a black/transparent fill — at these small angles
    # and offsets (a few degrees, a few pixels) the exposed edge is a sliver,
    # and repeating the nearest real pixels there is far less visible than a
    # hard black border would be.
    return cv2.warpAffine(frame, matrix, (width, height), borderMode=cv2.BORDER_REPLICATE)
