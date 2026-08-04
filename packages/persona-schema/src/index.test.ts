import { describe, expect, it } from "vitest";
import { assertMutable, canPublishIdentity, defaultGestureStates } from "./index.js";

describe("governance contracts", () => {
  it("blocks a revoked identity even with a complete package", () => {
    expect(canPublishIdentity({ owner:true,written:true,face:true,voice:true,commercial:true,roles:1,applications:1,geography:true,expiry:true,provenance:true,approved:true,revoked:true })).toBe(false);
  });
  it("keeps published Persona versions immutable", () => expect(() => assertMutable("published")).toThrow(/immutable/));
  it("keeps gesture likelihood restrained", () => expect(Math.max(...Object.values(defaultGestureStates).map((state) => state.gestureLikelihood))).toBeLessThanOrEqual(.2));
});

