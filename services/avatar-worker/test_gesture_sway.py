# Note: the repo's root `npm run test:python` (python -m unittest discover
# services -p test_*.py) does not actually reach this file — unittest's
# discover can't construct a dotted module path through a hyphenated
# directory name (avatar-worker), a pre-existing limitation unrelated to this
# change. Verified directly instead: `pip install opencv-python-headless
# numpy && python -m unittest test_gesture_sway -v` from this directory.
# Harmless either way — discover silently skips it rather than failing.
import unittest

try:
    import numpy as np

    from gesture_sway import GestureConfig, apply_gesture_sway, gesture_offset

    _DEPS_AVAILABLE = True
except ImportError:
    _DEPS_AVAILABLE = False


@unittest.skipUnless(_DEPS_AVAILABLE, "opencv-python-headless/numpy are only installed in avatar-worker's own build image, not this repo's general test env")
class GestureSwayTests(unittest.TestCase):
    def sample_frame(self):
        # A real 3-channel BGR frame with actual structure (a gradient, not a
        # flat fill) — a uniform-color frame looks byte-identical after any
        # rotation/translation regardless of whether the transform ran, which
        # would make "the frame changed" assertions meaningless.
        frame = np.zeros((64, 64, 3), dtype=np.uint8)
        frame[:, :, 0] = np.linspace(0, 255, 64, dtype=np.uint8)
        frame[:, :, 1] = np.linspace(0, 255, 64, dtype=np.uint8).reshape(-1, 1)
        frame[:, :, 2] = 90
        return frame

    def test_no_gesture_is_a_true_no_op(self):
        frame = self.sample_frame()
        result = apply_gesture_sway(frame, 1.5, None)
        self.assertIs(result, frame)

    def test_inactive_gesture_is_a_true_no_op(self):
        frame = self.sample_frame()
        gesture = GestureConfig(head_tilt_enabled=False, head_nod_enabled=False, breathing_sway_enabled=False)
        result = apply_gesture_sway(frame, 1.5, gesture)
        self.assertIs(result, frame)

    def test_active_gesture_changes_the_frame(self):
        frame = self.sample_frame()
        gesture = GestureConfig(head_tilt_enabled=True, head_tilt_degrees=3)
        # t chosen where sin(2*pi*t/7) is not ~0, so this offset is genuinely non-zero.
        result = apply_gesture_sway(frame, 1.75, gesture)
        self.assertEqual(result.shape, frame.shape)
        self.assertEqual(result.dtype, frame.dtype)
        self.assertFalse(np.array_equal(result, frame))

    def test_breathing_sway_alone_produces_motion(self):
        frame = self.sample_frame()
        gesture = GestureConfig(breathing_sway_enabled=True)
        result = apply_gesture_sway(frame, 1.05, gesture)
        self.assertFalse(np.array_equal(result, frame))

    def test_disabled_head_tilt_with_nonzero_degrees_field_produces_no_motion(self):
        # A defensive check that the *_enabled flag actually gates the effect,
        # not just the presence of a degrees value.
        gesture = GestureConfig(head_tilt_enabled=False, head_tilt_degrees=10)
        self.assertEqual(gesture_offset(1.75, gesture), (0.0, 0.0))

    def test_offset_stays_within_the_configured_bound(self):
        gesture = GestureConfig(head_tilt_enabled=True, head_tilt_degrees=5)
        # Sample across a full period — the sine amplitude is the configured
        # degrees value, so the rotation component must never exceed it.
        for step in range(200):
            t = step * 7.0 / 200
            angle, _ = gesture_offset(t, gesture)
            self.assertLessEqual(abs(angle), 5.0 + 1e-9)

    def test_from_dict_matches_apps_studio_web_lib_gesture_ts_field_names(self):
        gesture = GestureConfig.from_dict({
            "headTiltEnabled": True,
            "headTiltDegrees": 3,
            "headNodEnabled": True,
            "headNodDegrees": 4,
            "breathingSwayEnabled": True,
            "blinkingEnabled": True,
            "blinkIntervalMinSeconds": 4,
            "blinkIntervalMaxSeconds": 7,
        })
        self.assertTrue(gesture.is_active)
        self.assertEqual(gesture.head_tilt_degrees, 3)
        self.assertEqual(gesture.head_nod_degrees, 4)
        self.assertTrue(gesture.blinking_enabled)
        self.assertEqual(gesture.blink_interval_min_seconds, 4)
        self.assertEqual(gesture.blink_interval_max_seconds, 7)

    def test_from_dict_defaults_blink_interval_when_blinking_is_enabled_without_a_range(self):
        # Mirrors gesture.ts's own fallback: an enabled toggle with no/blank
        # range should still get a sane interval, not 0/0 (which would make
        # BlinkSchedule.build loop or produce a nonsensical schedule).
        gesture = GestureConfig.from_dict({"blinkingEnabled": True})
        self.assertTrue(gesture.blinking_enabled)
        self.assertEqual(gesture.blink_interval_min_seconds, 4.0)
        self.assertEqual(gesture.blink_interval_max_seconds, 7.0)

    def test_is_active_does_not_include_blinking(self):
        # Blinking is a separate effect with its own availability check
        # (blink_synth.py) — gesture_sway.apply_gesture_sway must stay a
        # true no-op for a gesture that only has blinking enabled.
        gesture = GestureConfig.from_dict({"blinkingEnabled": True, "blinkIntervalMinSeconds": 4, "blinkIntervalMaxSeconds": 7})
        self.assertFalse(gesture.is_active)

    def test_from_dict_tolerates_a_missing_or_empty_payload(self):
        gesture = GestureConfig.from_dict({})
        self.assertFalse(gesture.is_active)


if __name__ == "__main__":
    unittest.main()
