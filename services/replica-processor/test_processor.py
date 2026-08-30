import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

try:
    from main import ClipInput, quality_checks, state_for_clip
    DEPS_AVAILABLE = True
except ImportError:
    DEPS_AVAILABLE = False


@unittest.skipUnless(DEPS_AVAILABLE, "replica processor dependencies are installed in its own image")
class ProcessorTests(unittest.TestCase):
    def test_gesture_maps_to_speaking_state(self):
        self.assertEqual(state_for_clip("gesture"), "speaking")

    def test_low_resolution_is_failed_not_silently_accepted(self):
        checks = quality_checks([{
            "height": 480, "fps": 25, "face_detection_ratio": .9,
            "duration_ms": 2000,
        }])
        resolution = next(check for check in checks if check["code"] == "capture_resolution")
        self.assertEqual(resolution["status"], "failed")

    def test_gpu_and_livekit_proof_remain_not_tested(self):
        checks = quality_checks([{
            "height": 1080, "fps": 25, "face_detection_ratio": .9,
            "duration_ms": 2000,
        }])
        statuses = {check["code"]: check["status"] for check in checks}
        self.assertEqual(statuses["lip_sync_visual_review"], "not_tested")
        self.assertEqual(statuses["livekit_latency"], "not_tested")

    def test_complete_video_clip_accepts_a_bounded_chapter_range(self):
        clip = ClipInput(
            segment_id="segment-1", segment_type="gesture", gesture_key="explain",
            object_key="organisations/example/source.mp4",
            object_url="https://private.example/source.mp4",
            sha256="a" * 64, starts_neutral=True, ends_neutral=True,
            trim_start_ms=12000, trim_end_ms=16000,
        )
        self.assertEqual(clip.trim_end_ms - clip.trim_start_ms, 4000)


if __name__ == "__main__":
    unittest.main()
