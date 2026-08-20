import { describe, expect, it, beforeEach } from "vitest";
import { translateText } from "./openai";

describe("translateText", () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it("returns the same PROVIDER_DISABLED shape as chatComplete/embedBatch/synthesizeSpeech when OPENAI_API_KEY is unset", async () => {
    const result = await translateText({ text: "Hello", sourceLanguage: "en-ZA", targetLanguage: "zu-ZA" });
    expect(result).toEqual({ ok: false, status: 503, code: "PROVIDER_DISABLED", message: "OpenAI is not configured." });
  });
});
