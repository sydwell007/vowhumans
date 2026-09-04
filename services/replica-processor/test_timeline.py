import unittest

from timeline import normalise_chapter_range


class TimelineTests(unittest.TestCase):
    def test_browser_chapter_timeline_is_mapped_to_decoded_duration(self):
        self.assertEqual(
            normalise_chapter_range(9000, 8000, 10000, 10000),
            (7200, 9000),
        )

    def test_invalid_declared_chapter_still_fails(self):
        with self.assertRaisesRegex(ValueError, "CAPTURE_CHAPTER_RANGE_INVALID"):
            normalise_chapter_range(9000, 9500, 12000, 10000)


if __name__ == "__main__":
    unittest.main()
