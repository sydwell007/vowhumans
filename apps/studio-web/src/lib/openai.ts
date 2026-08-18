// Centralises the "no SDK, raw fetch with OPENAI_API_KEY" convention already used
// per-callsite in api/v1/[...route]/route.ts for TTS and image generation — same
// timeout/error-shape pattern, just shared instead of duplicated for chat/embeddings.
export type OpenAIResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string; message: string };

// Per-purpose OPENAI_*_MODEL env vars are this codebase's established convention
// (see OPENAI_REALTIME_MODEL in docker-compose.yml) — not the generic OPENAI_MODEL.
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
export const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const EMBEDDING_BATCH_SIZE = 100;
// knowledge_chunks.embedding is a fixed vector(1536) column. text-embedding-3's family
// supports an explicit `dimensions` truncation (Matryoshka), so requesting 1536 here
// keeps any of these models — small (native 1536) or large (native 3072) — compatible
// with that fixed column without another migration.
const EMBEDDING_DIMENSIONS = 1536;
// Chat models can vary widely in latency (a slower/more-capable model can comfortably
// exceed a minute for a long, thorough response) — kept just under route.ts's own
// maxDuration budget so a real slow response surfaces as an honest upstream timeout
// rather than this abort firing first and masking how long the model actually needed.
const CHAT_TIMEOUT_MS = 110_000;
const EMBEDDING_TIMEOUT_MS = 60_000;

function notConfigured<T>(): OpenAIResult<T> {
  return { ok: false, status: 503, code: "PROVIDER_DISABLED", message: "OpenAI is not configured." };
}

export async function chatComplete(args: {
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  jsonMode?: boolean;
  maxOutputTokens?: number;
  model?: string;
  // Reasoning-capable models (confirmed present in this deployment: reasoning_effort
  // accepts none/low/medium/high/xhigh) count hidden reasoning tokens against the same
  // max_completion_tokens budget as the visible answer — on a plain writing/drafting
  // task with no real reasoning to do, that budget can be entirely consumed by reasoning
  // with zero tokens left for output, which reads to the caller as "empty response".
  // Only sent when a caller opts in, since a non-reasoning model may reject the param.
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh";
}): Promise<OpenAIResult<string>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return notConfigured();
  try {
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: args.model || CHAT_MODEL,
        messages: [...(args.system ? [{ role: "system", content: args.system }] : []), ...args.messages],
        ...(args.jsonMode ? { response_format: { type: "json_object" } } : {}),
        ...(args.reasoningEffort ? { reasoning_effort: args.reasoningEffort } : {}),
        max_completion_tokens: args.maxOutputTokens ?? 1200,
      }),
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    });
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      return { ok: false, status: 502, code: "GENERATION_FAILED", message: detail.slice(0, 300) || "Could not generate a response." };
    }
    const body = (await upstream.json()) as { choices?: { message?: { content?: string }; finish_reason?: string }[] };
    const choice = body.choices?.[0];
    const content = choice?.message?.content;
    if (!content) {
      const reasonHint = choice?.finish_reason === "length" ? " (ran out of tokens — try again with reasoning effort lowered or a larger token budget)" : "";
      return { ok: false, status: 502, code: "GENERATION_FAILED", message: `The model returned an empty response${reasonHint}.` };
    }
    return { ok: true, data: content };
  } catch (err) {
    return { ok: false, status: 502, code: "GENERATION_FAILED", message: err instanceof Error ? err.message : "Could not reach OpenAI." };
  }
}

export async function embedBatch(texts: string[]): Promise<OpenAIResult<number[][]>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return notConfigured();
  if (texts.length === 0) return { ok: true, data: [] };
  try {
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
      const upstream = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: batch, dimensions: EMBEDDING_DIMENSIONS }),
        signal: AbortSignal.timeout(EMBEDDING_TIMEOUT_MS),
      });
      if (!upstream.ok) {
        const detail = await upstream.text().catch(() => "");
        return { ok: false, status: 502, code: "EMBEDDING_FAILED", message: detail.slice(0, 300) || "Could not generate embeddings." };
      }
      const body = (await upstream.json()) as { data?: { embedding: number[]; index: number }[] };
      const sorted = (body.data ?? []).slice().sort((a, b) => a.index - b.index);
      vectors.push(...sorted.map((row) => row.embedding));
    }
    return { ok: true, data: vectors };
  } catch (err) {
    return { ok: false, status: 502, code: "EMBEDDING_FAILED", message: err instanceof Error ? err.message : "Could not reach OpenAI." };
  }
}

const SPEECH_TIMEOUT_MS = 60_000;

// The same POST /v1/audio/speech call api/v1/[...route]/route.ts already makes
// inline for Voice Library sample playback (mp3, a fixed sentence) — factored
// out now that Presenter Studio needs it a second time for real scene
// narration. wav (not mp3) because avatar-worker's /internal/v1/render expects
// a .wav upload.
export async function synthesizeSpeech(text: string, providerVoiceId: string): Promise<OpenAIResult<Buffer>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return notConfigured();
  try {
    const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: providerVoiceId, input: text, response_format: "wav" }),
      signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
    });
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      return { ok: false, status: 502, code: "TTS_FAILED", message: detail.slice(0, 300) || "Could not generate narration." };
    }
    return { ok: true, data: Buffer.from(await upstream.arrayBuffer()) };
  } catch (err) {
    return { ok: false, status: 502, code: "TTS_FAILED", message: err instanceof Error ? err.message : "Could not reach OpenAI." };
  }
}
