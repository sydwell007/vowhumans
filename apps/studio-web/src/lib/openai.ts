// Centralises the "no SDK, raw fetch with OPENAI_API_KEY" convention already used
// per-callsite in api/v1/[...route]/route.ts for TTS and image generation — same
// timeout/error-shape pattern, just shared instead of duplicated for chat/embeddings.
export type OpenAIResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string; message: string };

const CHAT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_BATCH_SIZE = 100;

function notConfigured<T>(): OpenAIResult<T> {
  return { ok: false, status: 503, code: "PROVIDER_DISABLED", message: "OpenAI is not configured." };
}

export async function chatComplete(args: {
  system?: string;
  messages: { role: "user" | "assistant"; content: string }[];
  jsonMode?: boolean;
  maxOutputTokens?: number;
  model?: string;
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
        max_completion_tokens: args.maxOutputTokens ?? 1200,
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      return { ok: false, status: 502, code: "GENERATION_FAILED", message: detail.slice(0, 300) || "Could not generate a response." };
    }
    const body = (await upstream.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return { ok: false, status: 502, code: "GENERATION_FAILED", message: "The model returned an empty response." };
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
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: batch }),
        signal: AbortSignal.timeout(45000),
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
