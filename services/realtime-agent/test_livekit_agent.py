import unittest

from livekit_agent import _realtime_voice, _safe_voice_error


class RealtimeVoiceTests(unittest.TestCase):
    def test_custom_voice_uses_openai_object_reference(self):
        self.assertEqual(_realtime_voice("voice_123"), {"id": "voice_123"})

    def test_builtin_voice_remains_a_string(self):
        self.assertEqual(_realtime_voice("marin"), "marin")

    def test_missing_voice_uses_fallback(self):
        self.assertIsInstance(_realtime_voice(None), str)

    def test_rejected_custom_voice_has_actionable_browser_error(self):
        code, message = _safe_voice_error(RuntimeError("invalid_voice: custom voice permission denied"))
        self.assertEqual(code, "provider_voice_rejected")
        self.assertIn("selected live voice", message.lower())


if __name__ == "__main__":
    unittest.main()
