import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatCompleteDetailed, translateText } from "./openai";

describe("translateText", () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it("returns the same PROVIDER_DISABLED shape as chatComplete/embedBatch/synthesizeSpeech when OPENAI_API_KEY is unset", async () => {
    const result = await translateText({ text: "Hello", sourceLanguage: "en-ZA", targetLanguage: "zu-ZA" });
    expect(result).toEqual({ ok: false, status: 503, code: "PROVIDER_DISABLED", message: "OpenAI is not configured." });
  });
});

describe("chatCompleteDetailed", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });

  it("retains actual provider metadata and usage", async () => {
    process.env.OPENAI_API_KEY = "server-test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "chatcmpl_test",
      model: "gpt-test-2026-01-01",
      choices: [{ message: { content: "Grounded draft" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 31, completion_tokens: 12, prompt_tokens_details: { cached_tokens: 8 } },
    }), { status: 200, headers: { "x-request-id": "req_runtime_test" } })));
    const result = await chatCompleteDetailed({ messages: [{ role: "user", content: "Prepare a brief" }] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toMatchObject({
      content: "Grounded draft",
      provider: "openai",
      model: "gpt-test-2026-01-01",
      providerRequestId: "req_runtime_test",
      usage: { inputTokens: 31, outputTokens: 12, cachedTokens: 8 },
    });
  });

  it("distinguishes budget blocking from invalid configuration", async () => {
    process.env.OPENAI_API_KEY = "server-test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":{"code":"insufficient_quota"}}', { status: 429 })));
    const result = await chatCompleteDetailed({ messages: [{ role: "user", content: "Run" }] });
    expect(result).toEqual(expect.objectContaining({ ok: false, code: "BUDGET_BLOCKED", status: 402 }));
  });
});
