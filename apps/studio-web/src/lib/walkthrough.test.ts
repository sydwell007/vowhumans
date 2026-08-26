import { describe, expect, it } from "vitest";
import { walkthroughFrames } from "./walkthrough";

describe("walkthrough content contracts", () => {
  it("has a reasonable number of frames — long enough to be a real journey, short enough to actually watch", () => {
    expect(walkthroughFrames.length).toBeGreaterThanOrEqual(10);
    expect(walkthroughFrames.length).toBeLessThanOrEqual(20);
  });

  it("has no duplicate frame ids", () => {
    expect(new Set(walkthroughFrames.map((frame) => frame.id)).size).toBe(walkthroughFrames.length);
  });

  it("gives every frame a non-empty title and caption", () => {
    for (const frame of walkthroughFrames) {
      expect(frame.title.length).toBeGreaterThan(0);
      expect(frame.caption.length).toBeGreaterThan(0);
    }
  });

  it("populates the fields required by each frame's own kind", () => {
    for (const frame of walkthroughFrames) {
      if (frame.kind === "form") expect(frame.fields.length).toBeGreaterThan(0);
      if (frame.kind === "checklist") expect(frame.checks.length).toBeGreaterThan(0);
      if (frame.kind === "result") {
        expect(frame.resultTitle.length).toBeGreaterThan(0);
        expect(frame.resultBody.length).toBeGreaterThan(0);
      }
    }
  });

  it("covers all three tracks — the whole point is showing both entity types and the result", () => {
    const tracks = new Set(walkthroughFrames.map((frame) => frame.track));
    expect(tracks).toEqual(new Set(["digital-human", "digital-colleague", "result"]));
  });

  it("starts with an intro and ends with an outro, both framing it as an illustrative preview", () => {
    expect(walkthroughFrames[0].kind).toBe("intro");
    expect(walkthroughFrames.at(-1)?.kind).toBe("intro");
  });
});
