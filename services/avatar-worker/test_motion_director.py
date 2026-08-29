import unittest

from motion_director import ConversationState, MotionClip, MotionDirector
from renderer_contract import RendererTier, Rigged3DProvider, fallback_order
from stream_buffer import LatestFrameBuffer


class MotionDirectorTests(unittest.TestCase):
    def setUp(self):
        self.clips = [
            MotionClip("idle-a", ConversationState.IDLE),
            MotionClip("idle-b", ConversationState.IDLE),
            MotionClip("speak-a", ConversationState.SPEAKING),
            MotionClip("explain-a", ConversationState.SPEAKING, "explain"),
        ]

    def test_structured_gesture_uses_captured_clip(self):
        selected = MotionDirector(self.clips, seed=1).select(ConversationState.SPEAKING, "explain")
        self.assertEqual(selected.key, "explain-a")

    def test_unknown_gesture_falls_back_to_plain_state(self):
        selected = MotionDirector(self.clips, seed=1).select(ConversationState.SPEAKING, "dance")
        self.assertEqual(selected.key, "speak-a")

    def test_non_neutral_clip_is_never_selected(self):
        director = MotionDirector([MotionClip("unsafe", ConversationState.SPEAKING, ends_neutral=False)])
        with self.assertRaises(ValueError):
            director.select(ConversationState.SPEAKING)

    def test_renderer_fallback_is_explicit(self):
        self.assertEqual(
            fallback_order(RendererTier.RIGGED_3D),
            (RendererTier.RIGGED_3D, RendererTier.VIDEO_REPLICA, RendererTier.PORTRAIT),
        )

    def test_rigged_provider_does_not_claim_availability(self):
        self.assertFalse(Rigged3DProvider().health()["available"])

    def test_live_buffer_drops_oldest_frame(self):
        buffer = LatestFrameBuffer[int](2)
        buffer.put(1)
        buffer.put(2)
        buffer.put(3)
        self.assertEqual(buffer.get(), 2)
        self.assertEqual(buffer.stats.dropped, 1)


if __name__ == "__main__":
    unittest.main()
