# Note: same pre-existing limitation as test_gesture_sway.py — the repo's
# root `npm run test:python` (python -m unittest discover services
# -p test_*.py) cannot construct a dotted module path through the hyphenated
# `avatar-worker` directory name, so it never reaches this file. Verified
# directly instead: `pip install "opencv-python-headless==4.10.0.84" numpy
# && python -m unittest test_blink_synth -v` from this directory, against
# the exact opencv-python-headless version pinned in requirements.txt (a
# real, deliberate choice — a throwaway venv with the *latest* opencv-
# python-headless (5.0.0) installed does NOT expose cv2.CascadeClassifier or
# a populated cv2.data.haarcascades directory the way the pinned 4.10.0.84
# build does; testing against "whatever's newest" would have been a false
# pass). Harmless either way — discover silently skips it rather than
# failing.
import unittest

try:
    import numpy as np

    from blink_synth import BlinkSchedule, apply_blink, blink_alpha, build_blink_material, detect_eye_boxes

    _DEPS_AVAILABLE = True
except ImportError:
    _DEPS_AVAILABLE = False


@unittest.skipUnless(_DEPS_AVAILABLE, "opencv-python-headless/numpy are only installed in avatar-worker's own build image, not this repo's general test env")
class BlinkScheduleTests(unittest.TestCase):
    def test_build_is_deterministic_for_a_given_seed(self):
        a = BlinkSchedule.build(4, 7, total_seconds=20, seed=42)
        b = BlinkSchedule.build(4, 7, total_seconds=20, seed=42)
        self.assertEqual(a.onsets, b.onsets)

    def test_onsets_stay_within_the_configured_gap(self):
        schedule = BlinkSchedule.build(4, 7, total_seconds=60, seed=1)
        self.assertGreater(len(schedule.onsets), 0)
        gaps = [b - a for a, b in zip(schedule.onsets, schedule.onsets[1:])]
        for gap in gaps:
            self.assertGreaterEqual(gap, 4)
            self.assertLessEqual(gap, 7)
        # And the first onset itself is within the configured gap from t=0.
        self.assertGreaterEqual(schedule.onsets[0], 4)
        self.assertLessEqual(schedule.onsets[0], 7)

    def test_all_onsets_are_before_total_seconds(self):
        schedule = BlinkSchedule.build(4, 7, total_seconds=15, seed=7)
        for onset in schedule.onsets:
            self.assertLess(onset, 15)

    def test_swapped_min_max_still_produces_a_sane_schedule(self):
        # Defensive: callers should already sort, but this must not crash or
        # infinite-loop if it somehow receives min > max.
        schedule = BlinkSchedule.build(7, 4, total_seconds=20, seed=3)
        self.assertGreater(len(schedule.onsets), 0)


@unittest.skipUnless(_DEPS_AVAILABLE, "opencv-python-headless/numpy are only installed in avatar-worker's own build image, not this repo's general test env")
class BlinkAlphaTests(unittest.TestCase):
    def test_zero_outside_any_blink_window(self):
        schedule = BlinkSchedule(onsets=[5.0])
        self.assertEqual(blink_alpha(0.0, schedule), 0.0)
        self.assertEqual(blink_alpha(1.0, schedule), 0.0)
        self.assertEqual(blink_alpha(10.0, schedule), 0.0)

    def test_none_schedule_or_empty_onsets_is_always_zero(self):
        self.assertEqual(blink_alpha(5.0, None), 0.0)
        self.assertEqual(blink_alpha(5.0, BlinkSchedule(onsets=[])), 0.0)

    def test_peaks_near_1_at_the_onset_centre(self):
        schedule = BlinkSchedule(onsets=[5.0], duration=0.3)
        self.assertGreater(blink_alpha(5.0, schedule), 0.95)

    def test_smooth_and_symmetric_around_the_onset(self):
        schedule = BlinkSchedule(onsets=[5.0], duration=0.3)
        before = blink_alpha(4.925, schedule)
        after = blink_alpha(5.075, schedule)
        self.assertAlmostEqual(before, after, places=4)

    def test_handles_multiple_onsets_independently(self):
        schedule = BlinkSchedule(onsets=[2.0, 8.0], duration=0.3)
        self.assertGreater(blink_alpha(2.0, schedule), 0.95)
        self.assertGreater(blink_alpha(8.0, schedule), 0.95)
        self.assertEqual(blink_alpha(5.0, schedule), 0.0)


@unittest.skipUnless(_DEPS_AVAILABLE, "opencv-python-headless/numpy are only installed in avatar-worker's own build image, not this repo's general test env")
class DetectEyeBoxesGracefulFailureTests(unittest.TestCase):
    """detect_eye_boxes()/build_blink_material() against a real face photo is
    NOT exercised here — no real face image is available in this sandbox
    (no GPU, no camera, no bundled test asset), and a Haar cascade reliably
    finds nothing meaningful on a synthetic drawn shape (it's trained on real
    eye texture, not geometry). What IS verified for real here is the
    contract every caller of this module actually depends on: a frame with
    no usable eyes must degrade to "blinking unavailable," never raise and
    never fabricate a detection."""

    def test_blank_frame_returns_no_boxes(self):
        frame = np.zeros((256, 256, 3), dtype=np.uint8)
        boxes = detect_eye_boxes(frame, (40, 40, 216, 216))
        self.assertEqual(boxes, [])

    def test_blank_frame_yields_no_blink_material(self):
        frame = np.zeros((256, 256, 3), dtype=np.uint8)
        self.assertIsNone(build_blink_material(frame, (40, 40, 216, 216)))

    def test_degenerate_bbox_does_not_crash(self):
        frame = np.zeros((256, 256, 3), dtype=np.uint8)
        self.assertEqual(detect_eye_boxes(frame, (100, 100, 100, 100)), [])
        self.assertEqual(detect_eye_boxes(frame, (500, 500, 600, 600)), [])

    def test_bbox_outside_frame_bounds_does_not_crash(self):
        frame = np.zeros((64, 64, 3), dtype=np.uint8)
        self.assertEqual(detect_eye_boxes(frame, (-50, -50, 500, 500)), [])


@unittest.skipUnless(_DEPS_AVAILABLE, "opencv-python-headless/numpy are only installed in avatar-worker's own build image, not this repo's general test env")
class ApplyBlinkCompositingTests(unittest.TestCase):
    """Tests the actual alpha-compositing math against a hand-built material
    (bypassing real eye detection entirely) so this is fully deterministic
    and independent of whether a Haar cascade fires on any given photo."""

    def sample_frame(self):
        frame = np.zeros((64, 64, 3), dtype=np.uint8)
        frame[:, :, 0] = np.linspace(0, 255, 64, dtype=np.uint8)
        frame[:, :, 1] = np.linspace(0, 255, 64, dtype=np.uint8).reshape(-1, 1)
        frame[:, :, 2] = 90
        return frame

    def full_mask_material(self, frame):
        closed = np.full_like(frame, 255)
        mask = np.ones(frame.shape[:2], dtype=np.float32)
        return closed, mask

    def test_no_material_is_a_true_no_op(self):
        frame = self.sample_frame()
        result = apply_blink(frame, None, 5.0, BlinkSchedule(onsets=[5.0]))
        self.assertIs(result, frame)

    def test_no_schedule_is_a_true_no_op(self):
        frame = self.sample_frame()
        material = self.full_mask_material(frame)
        result = apply_blink(frame, material, 5.0, None)
        self.assertIs(result, frame)

    def test_between_blinks_is_a_true_no_op(self):
        frame = self.sample_frame()
        material = self.full_mask_material(frame)
        result = apply_blink(frame, material, 0.0, BlinkSchedule(onsets=[5.0]))
        self.assertIs(result, frame)

    def test_at_full_blink_the_output_matches_the_closed_frame_within_the_mask(self):
        frame = self.sample_frame()
        closed, mask = self.full_mask_material(frame)
        result = apply_blink(frame, (closed, mask), 5.0, BlinkSchedule(onsets=[5.0], duration=0.3))
        # Full mask, alpha ~1 at the onset centre -> result should be very close to `closed`.
        self.assertTrue(np.allclose(result, closed, atol=2))

    def test_mismatched_material_shape_is_a_safe_no_op(self):
        frame = self.sample_frame()
        wrong_shape_closed = np.zeros((32, 32, 3), dtype=np.uint8)
        mask = np.ones(frame.shape[:2], dtype=np.float32)
        result = apply_blink(frame, (wrong_shape_closed, mask), 5.0, BlinkSchedule(onsets=[5.0]))
        self.assertTrue(np.array_equal(result, frame))

    def test_output_dtype_and_shape_are_preserved(self):
        frame = self.sample_frame()
        material = self.full_mask_material(frame)
        result = apply_blink(frame, material, 5.0, BlinkSchedule(onsets=[5.0], duration=0.3))
        self.assertEqual(result.shape, frame.shape)
        self.assertEqual(result.dtype, frame.dtype)


if __name__ == "__main__":
    unittest.main()
