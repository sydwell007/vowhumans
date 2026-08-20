import { resolveLanguageCapability, type CapabilityKind, type LanguageCapabilityRecord, type LanguageCapabilityStatus } from "@vowhumans/persona-schema";
import sql from "./db";

// The I/O half of the language router — packages/persona-schema's
// resolveLanguageCapability() is the actual selection logic (pure, unit-tested
// there). This module only adds loading the matrix from Postgres and recording
// usage. Every caller MUST read `usedFallback` and disclose it — this module
// never lets a caller silently believe the requested language was actually used.

export async function getCapabilityMatrix(): Promise<LanguageCapabilityRecord[]> {
  const rows = await sql<{ language_code: string; capability: CapabilityKind; provider: string; status: LanguageCapabilityStatus; fallback_language_code: string | null; notes: string }[]>`
    SELECT language_code, capability, provider, status, fallback_language_code, notes FROM language_capabilities
  `;
  return rows.map((r) => ({
    languageCode: r.language_code,
    capability: r.capability,
    provider: r.provider,
    status: r.status,
    fallbackLanguageCode: r.fallback_language_code ?? undefined,
    notes: r.notes,
  }));
}

export type ResolvedCapability = {
  provider: string;
  status: LanguageCapabilityStatus;
  usedFallback: boolean;
  fallbackLanguageCode?: string;
  resolvedLanguageCode: string | null;
};

// Resolves the best usable provider for a language+capability, preferring the
// organisation's own configured preference (organisation_languages) when it
// points at a record that's actually usable, otherwise the highest-status
// available record for that language, otherwise the honest fallback chain.
export async function resolveForCapability(
  organisationId: string,
  languageCode: string,
  capability: CapabilityKind,
): Promise<ResolvedCapability | null> {
  const matrix = await getCapabilityMatrix();
  const preferenceColumn = capability === "stt" ? "preferred_stt_provider" : capability === "tts" ? "preferred_tts_provider" : capability === "realtime" ? "preferred_realtime_provider" : null;

  let candidates = matrix;
  if (preferenceColumn) {
    const [orgPref] = await sql<{ preferred: string | null; fallback_language_code: string | null }[]>`
      SELECT ${sql(preferenceColumn)} AS preferred, fallback_language_code
      FROM organisation_languages WHERE organisation_id = ${organisationId} AND language_code = ${languageCode}
    `;
    if (orgPref?.preferred) {
      candidates = matrix.map((r) => (r.languageCode === languageCode && r.capability === capability ? { ...r, provider: orgPref.preferred! } : r));
    }
    if (orgPref?.fallback_language_code) {
      candidates = candidates.map((r) => (r.languageCode === languageCode && r.capability === capability ? { ...r, fallbackLanguageCode: orgPref.fallback_language_code! } : r));
    }
  }

  const resolution = resolveLanguageCapability(candidates, languageCode, capability);
  if (!resolution.record) return { provider: "none", status: "unsupported", usedFallback: resolution.usedFallback, fallbackLanguageCode: resolution.fallbackLanguageCode, resolvedLanguageCode: null };
  return {
    provider: resolution.record.provider,
    status: resolution.record.status,
    usedFallback: resolution.usedFallback,
    fallbackLanguageCode: resolution.fallbackLanguageCode,
    resolvedLanguageCode: resolution.usedFallback ? (resolution.fallbackLanguageCode ?? null) : languageCode,
  };
}

// Reuses the existing usage_records table (organisation_id, session_id,
// provider, unit, quantity, latency_ms, recorded_at all already exist) rather
// than a new metering table — language_code (015_multilingual_usage.sql) is the
// only addition this needed.
export async function recordLanguageUsage(args: {
  organisationId: string;
  sessionId?: string;
  languageCode: string;
  capability: CapabilityKind;
  provider: string;
  latencyMs?: number;
  failed?: boolean;
}): Promise<void> {
  await sql`
    INSERT INTO usage_records (organisation_id, session_id, provider, unit, quantity, latency_ms, language_code)
    VALUES (${args.organisationId}, ${args.sessionId ?? null}, ${args.provider}, ${`language-turn:${args.capability}${args.failed ? ":failed" : ""}`}, 1, ${args.latencyMs ?? null}, ${args.languageCode})
  `;
}
