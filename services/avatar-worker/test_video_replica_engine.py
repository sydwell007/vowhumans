import unittest

from video_replica_engine import _resolve_trim_window


class ReplicaTrimWindowTests(unittest.TestCase):
    def test_keeps_valid_chapter(self):
        self.assertEqual(_resolve_trim_window(12_000, 1_000, 8_000), (1_000, 8_000))

    def test_clamps_container_rounding_difference(self):
        self.assertEqual(_resolve_trim_window(11_960, 0, 12_000), (0, 11_960))

    def test_uses_whole_standalone_clip_for_stale_concatenated_offsets(self):
        self.assertEqual(_resolve_trim_window(12_000, 24_000, 36_000), (0, 12_000))

    def test_uses_whole_clip_for_reversed_range(self):
        self.assertEqual(_resolve_trim_window(12_000, 8_000, 2_000), (0, 12_000))


if __name__ == "__main__":
    unittest.main()
