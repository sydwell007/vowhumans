import { describe, expect, it, beforeEach } from "vitest";
import { transcribeSpeech } from "./speech";

describe("transcribeSpeech", () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it("returns the same PROVIDER_DISABLED shape as the rest of lib/openai.ts when OPENAI_API_KEY is unset", async () => {
    const result = await transcribeSpeech(Buffer.from("fake audio"), "audio/wav");
    expect(result).toEqual({ ok: false, status: 503, code: "PROVIDER_DISABLED", message: "OpenAI is not configured." });
  });
});
