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
});
