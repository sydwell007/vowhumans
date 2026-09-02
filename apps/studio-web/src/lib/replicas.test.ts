import { describe, expect, it } from "vitest";
import {
  MAX_GUIDED_CAPTURE_BYTES,
  MAX_GUIDED_CAPTURE_MS,
  replicaApprovalReadiness,
  replicaCaptureReadiness,
  safeCaptureExtension,
  validateCompletePerformanceChapters,
} from "./replicas";

describe("replica capture readiness", () => {
  it("keeps same-origin guided captures below the serverless request ceiling", () => {
    expect(MAX_GUIDED_CAPTURE_BYTES).toBe(3 * 1024 * 1024);
    expect(MAX_GUIDED_CAPTURE_MS).toBe(12_000);
  });

  it("requires real neutral-boundary motion clips", () => {
    const result = replicaCaptureReadiness([
      { segment_type: "idle", state: "uploaded", starts_neutral: true, ends_neutral: true },
      { segment_type: "listening", state: "uploaded", starts_neutral: true, ends_neutral: true },
      { segment_type: "speaking", state: "uploaded", starts_neutral: true, ends_neutral: true },
      { segment_type: "gesture", gesture_key: "acknowledge", state: "uploaded", starts_neutral: true, ends_neutral: true },
      { segment_type: "gesture", gesture_key: "explain", state: "uploaded", starts_neutral: true, ends_neutral: false },
    ]);
    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(["Explanation gesture"]);
  });

  it("never trusts an arbitrary upload extension", () => {
    expect(safeCaptureExtension("capture.exe", "video/mp4")).toBe("mp4");
    expect(safeCaptureExtension("capture.WEBM", "video/webm")).toBe("webm");
  });

  it("keeps approval locked until processing and every quality gate are ready", () => {
    const checks = [
      "capture_resolution",
      "capture_frame_rate",
      "single_face_continuity",
      "clip_duration",
      "lip_sync_visual_review",
      "livekit_latency",
    ].map((check_code) => ({ check_code, status: "passed" }));

    expect(replicaApprovalReadiness("capturing", checks).ready).toBe(false);
    expect(replicaApprovalReadiness("quality_review", checks.slice(0, -1))).toMatchObject({
      ready: false,
      missing: ["livekit_latency"],
    });
    expect(replicaApprovalReadiness("quality_review", checks).ready).toBe(true);
  });

  it("accepts one non-overlapping chapter for every required performance", () => {
    const result = validateCompletePerformanceChapters([
      { type: "idle", start_ms: 0, end_ms: 2000 },
      { type: "listening", start_ms: 2500, end_ms: 4500 },
      { type: "speaking", start_ms: 5000, end_ms: 9000 },
      { type: "gesture", gesture: "acknowledge", start_ms: 9500, end_ms: 11500 },
      { type: "gesture", gesture: "explain", start_ms: 12000, end_ms: 14000 },
    ], 15000);
    expect(result.valid).toBe(true);
    expect(result.chapters).toHaveLength(5);
  });

  it("rejects overlapping or incomplete complete-video chapters", () => {
    const result = validateCompletePerformanceChapters([
      { type: "idle", start_ms: 0, end_ms: 2000 },
      { type: "listening", start_ms: 1500, end_ms: 3500 },
      { type: "speaking", start_ms: 4000, end_ms: 6000 },
    ], 8000);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Performance chapters must not overlap.");
    expect(result.errors).toContain("Acknowledgement must have exactly one chapter.");
  });
});
