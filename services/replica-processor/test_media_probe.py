import unittest

from media_probe import _rate


class MediaProbeTests(unittest.TestCase):
    def test_fractional_frame_rate(self):
        self.assertAlmostEqual(_rate("30000/1001"), 29.97002997)

    def test_zero_or_missing_rate(self):
        self.assertEqual(_rate("0/0"), 0)
        self.assertEqual(_rate(None), 0)


if __name__ == "__main__":
    unittest.main()
