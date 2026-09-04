import unittest

from timeline import infer_declared_source_duration, normalise_chapter_range


class TimelineTests(unittest.TestCase):
    def test_browser_chapter_timeline_is_mapped_to_decoded_duration(self):
        self.assertEqual(
            normalise_chapter_range(9000, 8000, 10000, 10000),
            (7200, 9000),
        )

    def test_invalid_declared_chapter_still_fails(self):
        with self.assertRaisesRegex(ValueError, "CAPTURE_CHAPTER_RANGE_INVALID"):
            normalise_chapter_range(9000, 9500, 12000, 10000)

    def test_legacy_capture_recovers_timeline_from_largest_chapter_end(self):
        self.assertEqual(
            infer_declared_source_duration(None, [2000, 4500, 7000, 9500, 12000]),
            12000,
        )

    def test_explicit_source_duration_wins_over_legacy_inference(self):
        self.assertEqual(infer_declared_source_duration(15000, [12000]), 15000)

    def test_inconsistent_legacy_source_duration_is_reconstructed(self):
        self.assertEqual(
            infer_declared_source_duration(6000, [2000, 4500, 7000, 9500, 12000]),
            12000,
        )


if __name__ == "__main__":
    unittest.main()
