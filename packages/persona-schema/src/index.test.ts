import { describe, expect, it } from "vitest";
import { assertMutable, canPublishIdentity, defaultGestureStates, resolveLanguageCapability, type LanguageCapabilityRecord } from "./index.js";

describe("governance contracts", () => {
  it("blocks a revoked identity even with a complete package", () => {
    expect(canPublishIdentity({ owner:true,written:true,face:true,voice:true,commercial:true,roles:1,applications:1,geography:true,expiry:true,provenance:true,approved:true,revoked:true })).toBe(false);
  });
  it("keeps published Persona versions immutable", () => expect(() => assertMutable("published")).toThrow(/immutable/));
  it("keeps gesture likelihood restrained", () => expect(Math.max(...Object.values(defaultGestureStates).map((state) => state.gestureLikelihood))).toBeLessThanOrEqual(.2));
});

describe("resolveLanguageCapability", () => {
  const records: LanguageCapabilityRecord[] = [
    { languageCode: "en-ZA", capability: "tts", provider: "openai", status: "production", notes: "" },
    { languageCode: "af-ZA", capability: "tts", provider: "openai", status: "experimental", fallbackLanguageCode: "en-ZA", notes: "" },
    { languageCode: "zu-ZA", capability: "tts", provider: "openai", status: "unsupported", fallbackLanguageCode: "en-ZA", notes: "" },
    { languageCode: "ve-ZA", capability: "tts", provider: "openai", status: "unsupported", fallbackLanguageCode: "xh-ZA", notes: "" },
  ];

  it("returns the direct record when the language's own status is usable", () => {
    const result = resolveLanguageCapability(records, "af-ZA", "tts");
    expect(result.usedFallback).toBe(false);
    expect(result.record?.status).toBe("experimental");
  });

  it("falls back to en-ZA by default when the requested language is unsupported", () => {
    const result = resolveLanguageCapability(records, "zu-ZA", "tts");
    expect(result.usedFallback).toBe(true);
    expect(result.fallbackLanguageCode).toBe("en-ZA");
    expect(result.record?.languageCode).toBe("en-ZA");
  });

  it("honours an explicit fallback_language_code override instead of always defaulting to en-ZA", () => {
    const result = resolveLanguageCapability(records, "ve-ZA", "tts");
    expect(result.usedFallback).toBe(true);
    expect(result.fallbackLanguageCode).toBe("xh-ZA");
    // xh-ZA has no record at all in this fixture, so the fallback itself is unusable — honest null, not a silent English swap.
    expect(result.record).toBeNull();
  });

  it("falls back to en-ZA (and discloses it via usedFallback) when no capability record exists for the language at all", () => {
    const result = resolveLanguageCapability(records, "nr-ZA", "tts");
    expect(result.usedFallback).toBe(true);
    expect(result.fallbackLanguageCode).toBe("en-ZA");
    expect(result.record?.languageCode).toBe("en-ZA");
  });
});

