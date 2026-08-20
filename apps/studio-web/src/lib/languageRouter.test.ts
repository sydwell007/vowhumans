import { describe, expect, it, vi } from "vitest";

// getCapabilityMatrix()'s actual selection logic (resolveLanguageCapability) is
// already covered by packages/persona-schema's 7 pure unit tests — this file
// only verifies the I/O half this module adds: that a raw Postgres row (snake_case,
// nullable fallback_language_code) maps correctly onto the camelCase
// LanguageCapabilityRecord shape the resolver expects. Mocks lib/db.ts's tagged-
// template sql() rather than hitting a real Postgres connection, matching this
// repo's "no DB fixture harness" constraint for automated tests.
const fakeRows = [
  { language_code: "en-ZA", capability: "tts", provider: "openai", status: "production", fallback_language_code: null, notes: "" },
  { language_code: "zu-ZA", capability: "tts", provider: "openai", status: "unsupported", fallback_language_code: "en-ZA", notes: "Not in OpenAI's documented set." },
];

vi.mock("./db", () => ({
  default: Object.assign(
    () => Promise.resolve(fakeRows),
    { json: (v: unknown) => v },
  ),
}));

describe("getCapabilityMatrix", () => {
  it("maps snake_case Postgres rows onto the camelCase LanguageCapabilityRecord shape", async () => {
    const { getCapabilityMatrix } = await import("./languageRouter");
    const matrix = await getCapabilityMatrix();
    expect(matrix).toEqual([
      { languageCode: "en-ZA", capability: "tts", provider: "openai", status: "production", fallbackLanguageCode: undefined, notes: "" },
      { languageCode: "zu-ZA", capability: "tts", provider: "openai", status: "unsupported", fallbackLanguageCode: "en-ZA", notes: "Not in OpenAI's documented set." },
    ]);
  });
});
