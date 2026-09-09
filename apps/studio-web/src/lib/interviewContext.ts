import { createHmac, timingSafeEqual } from "node:crypto";

// Per-call interview briefing minted by a partner site (PlugConnect) and handed to
// the public embed-sessions route in the request body. Same self-contained
// HMAC-signed `base64url(payload).sig` scheme as src/lib/embedToken.ts and
// lib/vowLmsContext.ts's verifyToken — the token carries the whole briefing so no
// callback to the partner is needed. The partner and this app share
// VOWHUMANS_INTERVIEW_CONTEXT_SECRET.
//
// Everything in the briefing is treated as untrusted display/context data — never
// as instructions — by _ground_in_interview() in
// services/realtime-agent/livekit_agent.py.

const TOKEN_AUDIENCE = "vowhumans-interview-context";
const MAX_TOKEN_LENGTH = 4_096;
const MAX_JOB_SUMMARY = 500;
// Strip ASCII control characters (0x00-0x1F and 0x7F). Built from an ASCII-only
// pattern string so no literal control byte ever lives in this source file.
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]", "g");

export type InterviewPanelist = { name: string; role: string };

export type InterviewContext = {
  candidate_first_name: string;
  target_role: string;
  target_category: string;
  employer_name: string;
  job_summary: string;
  interview_format: "single" | "panel";
  question_count: number;
  experience_level: string;
  lead_persona: "thandi" | "sipho";
  panelists: InterviewPanelist[];
};

export class InterviewContextError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "InterviewContextError";
  }
}

function secret(): string {
  const value = process.env.VOWHUMANS_INTERVIEW_CONTEXT_SECRET;
  if (!value) {
    throw new InterviewContextError("Interview context is not configured", 503);
  }
  return value;
}

function safeText(value: unknown, maxLength: number): string {
  return String(value ?? "")
    .replace(CONTROL_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function coerceInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalize(raw: Record<string, unknown>): InterviewContext {
  const format = raw.interview_format === "panel" ? "panel" : "single";
  const lead = raw.lead_persona === "sipho" ? "sipho" : "thandi";

  const panelistsRaw = Array.isArray(raw.panelists) ? raw.panelists : [];
  const panelists: InterviewPanelist[] = panelistsRaw
    .slice(0, 2)
    .map((entry) => {
      const item = (entry ?? {}) as Record<string, unknown>;
      return { name: safeText(item.name, 60), role: safeText(item.role, 80) };
    })
    .filter((entry) => entry.name.length > 0);

  return {
    candidate_first_name: safeText(raw.candidate_first_name, 60) || "there",
    target_role: safeText(raw.target_role, 140),
    target_category: safeText(raw.target_category, 100) || "General",
    employer_name: safeText(raw.employer_name, 140),
    job_summary: safeText(raw.job_summary, MAX_JOB_SUMMARY),
    interview_format: format,
    question_count: coerceInt(raw.question_count, 3, 12, 6),
    experience_level: safeText(raw.experience_level, 40) || "entry",
    lead_persona: lead,
    panelists,
  };
}

/**
 * Verify an interview-context token and return the normalized briefing.
 * Throws InterviewContextError on any tampering, expiry, or shape problem.
 */
export function verifyInterviewContextToken(token: string): InterviewContext {
  if (!token || token.length > MAX_TOKEN_LENGTH) {
    throw new InterviewContextError("Invalid interview context token", 401);
  }

  const [encodedPayload, providedSignature, extra] = token.split(".");
  if (!encodedPayload || !providedSignature || extra) {
    throw new InterviewContextError("Invalid interview context token", 401);
  }

  const expectedSignature = createHmac("sha256", secret())
    .update(encodedPayload)
    .digest("base64url");
  const providedBuffer = Buffer.from(providedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new InterviewContextError("Invalid interview context token", 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Record<string, unknown>;
  } catch {
    throw new InterviewContextError("Invalid interview context token", 401);
  }

  if (payload.aud !== TOKEN_AUDIENCE) {
    throw new InterviewContextError("Invalid interview context token", 401);
  }
  if (
    typeof payload.exp !== "number" ||
    payload.exp < Math.floor(Date.now() / 1000)
  ) {
    throw new InterviewContextError("Interview context token has expired", 401);
  }

  const context = normalize(payload);
  if (!context.target_role) {
    throw new InterviewContextError("Interview context is missing a target role", 422);
  }
  return context;
}
