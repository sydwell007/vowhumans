import { describe, expect, it } from "vitest";
import { replicaCaptureReadiness, safeCaptureExtension } from "./replicas";

describe("replica capture readiness", () => {
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
});
