import { describe, expect, it } from "vitest";
import { NEUTRAL_GESTURE_OVERLAY, parseGestureOverlay } from "./gesture";

describe("parseGestureOverlay", () => {
  it("parses the real default range strings Studio ships (±3°, ±4°)", () => {
    const overlay = parseGestureOverlay({
      features: {
        head_tilt: { enabled: true, range: "±3°" },
        head_nod: { enabled: true, range: "±4°" },
        breathing_sway: { enabled: true },
      },
    });
    expect(overlay).toEqual({
      headTiltEnabled: true,
      headTiltDegrees: 3,
      headNodEnabled: true,
      headNodDegrees: 4,
      breathingSwayEnabled: true,
      blinkingEnabled: false,
      blinkIntervalMinSeconds: 0,
      blinkIntervalMaxSeconds: 0,
    });
  });

  it("returns the neutral overlay for a null/missing state_config, never throwing", () => {
    expect(parseGestureOverlay(null)).toEqual(NEUTRAL_GESTURE_OVERLAY);
    expect(parseGestureOverlay(undefined)).toEqual(NEUTRAL_GESTURE_OVERLAY);
    expect(parseGestureOverlay({})).toEqual(NEUTRAL_GESTURE_OVERLAY);
  });

  it("respects a disabled toggle even when a range is present", () => {
    const overlay = parseGestureOverlay({ features: { head_tilt: { enabled: false, range: "±3°" } } });
    expect(overlay.headTiltEnabled).toBe(false);
  });

  it("falls back to a sensible default degree value for unparseable or edited-blank ranges", () => {
    expect(parseGestureOverlay({ features: { head_tilt: { enabled: true, range: "" } } }).headTiltDegrees).toBe(3);
    expect(parseGestureOverlay({ features: { head_tilt: { enabled: true, range: "gentle" } } }).headTiltDegrees).toBe(3);
    expect(parseGestureOverlay({ features: { head_nod: { enabled: true, range: "not a number" } } }).headNodDegrees).toBe(4);
  });

  it("clamps an unreasonably large edited range instead of producing a broken-looking render", () => {
    const overlay = parseGestureOverlay({ features: { head_tilt: { enabled: true, range: "±300°" } } });
    expect(overlay.headTiltDegrees).toBeLessThanOrEqual(12);
  });

  it("ignores a zero or negative parsed value rather than disabling motion entirely by accident", () => {
    expect(parseGestureOverlay({ features: { head_tilt: { enabled: true, range: "0°" } } }).headTiltDegrees).toBe(3);
  });

  it("extracts the first number from a real edited min–max range like a Studio user would type", () => {
    // Degrees are single-value (±N°), unlike blinking's two-value range — the
    // parser intentionally only needs the first number for head_tilt/head_nod.
    expect(parseGestureOverlay({ features: { head_tilt: { enabled: true, range: "2-5°" } } }).headTiltDegrees).toBe(2);
  });

  it("parses the real default blink range Studio ships (4–7s)", () => {
    const overlay = parseGestureOverlay({ features: { blinking: { enabled: true, range: "4–7s" } } });
    expect(overlay.blinkingEnabled).toBe(true);
    expect(overlay.blinkIntervalMinSeconds).toBe(4);
    expect(overlay.blinkIntervalMaxSeconds).toBe(7);
  });

  it("zeroes both blink bounds when the toggle is disabled, even with a range present", () => {
    const overlay = parseGestureOverlay({ features: { blinking: { enabled: false, range: "4–7s" } } });
    expect(overlay.blinkingEnabled).toBe(false);
    expect(overlay.blinkIntervalMinSeconds).toBe(0);
    expect(overlay.blinkIntervalMaxSeconds).toBe(0);
  });

  it("treats a single edited blink value as a fixed gap (min === max)", () => {
    const overlay = parseGestureOverlay({ features: { blinking: { enabled: true, range: "5s" } } });
    expect(overlay.blinkIntervalMinSeconds).toBe(5);
    expect(overlay.blinkIntervalMaxSeconds).toBe(5);
  });

  it("sorts a reversed min–max blink range instead of producing an inverted window", () => {
    const overlay = parseGestureOverlay({ features: { blinking: { enabled: true, range: "9-3s" } } });
    expect(overlay.blinkIntervalMinSeconds).toBe(3);
    expect(overlay.blinkIntervalMaxSeconds).toBe(9);
  });

  it("falls back to the real Studio default blink range for unparseable or blank input", () => {
    expect(parseGestureOverlay({ features: { blinking: { enabled: true, range: "" } } })).toMatchObject({
      blinkIntervalMinSeconds: 4,
      blinkIntervalMaxSeconds: 7,
    });
    expect(parseGestureOverlay({ features: { blinking: { enabled: true, range: "often" } } })).toMatchObject({
      blinkIntervalMinSeconds: 4,
      blinkIntervalMaxSeconds: 7,
    });
  });

  it("clamps an unreasonably fast edited blink range instead of a strobing render", () => {
    const overlay = parseGestureOverlay({ features: { blinking: { enabled: true, range: "0.01-0.02s" } } });
    expect(overlay.blinkIntervalMinSeconds).toBeGreaterThanOrEqual(1.5);
    expect(overlay.blinkIntervalMaxSeconds).toBeGreaterThanOrEqual(1.5);
  });
});
