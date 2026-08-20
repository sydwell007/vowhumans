import type { OpenAIResult } from "./openai";

// This repo had no speech-to-text function anywhere before this file — confirmed
// by grep, zero calls to /v1/audio/transcriptions existed. Mirrors openai.ts's
// OpenAIResult<T>/notConfigured() shape exactly rather than inventing a new one.
const STT_TIMEOUT_MS = 60_000;

function notConfigured<T>(): OpenAIResult<T> {
  return { ok: false, status: 503, code: "PROVIDER_DISABLED", message: "OpenAI is not configured." };
}

// `language` is intentionally optional and should only ever be passed by a
// caller that already checked the language_capabilities registry shows this
// language at experimental-or-better for stt+openai (see languageRouter.ts).
// Forcing a language code Whisper doesn't document risks worse output than
// letting it auto-detect — so callers omit it rather than guess.
export async function transcribeSpeech(audio: Buffer, mimeType: string, language?: string): Promise<OpenAIResult<{ text: string }>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return notConfigured();
  try {
    const extension = mimeType.includes("wav") ? "wav" : mimeType.includes("mp3") || mimeType.includes("mpeg") ? "mp3" : mimeType.includes("webm") ? "webm" : mimeType.includes("m4a") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "wav";
    const form = new FormData();
    // OPENAI_STT_MODEL was declared in .env.example but never actually read
    // anywhere in this repo until now.
    form.append("model", process.env.OPENAI_STT_MODEL || "whisper-1");
    form.append("file", new Blob([new Uint8Array(audio)], { type: mimeType }), `audio.${extension}`);
    // Whisper expects a bare ISO-639-1 code (e.g. "af"), not a locale tag like
    // "af-ZA" — strip the region.
    if (language) form.append("language", language.split("-")[0]);
    const upstream = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(STT_TIMEOUT_MS),
    });
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      return { ok: false, status: 502, code: "STT_FAILED", message: detail.slice(0, 300) || "Could not transcribe this audio." };
    }
    const body = (await upstream.json()) as { text?: string };
    if (typeof body.text !== "string") {
      return { ok: false, status: 502, code: "STT_FAILED", message: "The model returned no transcript." };
    }
    return { ok: true, data: { text: body.text } };
  } catch (err) {
    return { ok: false, status: 502, code: "STT_FAILED", message: err instanceof Error ? err.message : "Could not reach OpenAI." };
  }
}
