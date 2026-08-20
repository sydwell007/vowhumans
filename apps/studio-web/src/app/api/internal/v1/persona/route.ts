import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { resolveForCapability } from "@/lib/languageRouter";

// Same x-internal-key convention as api/internal/v1/faces/route.ts — this route's
// caller (services/realtime-agent) has no browser and no session cookie.
function requireInternalKey(request: NextRequest): boolean {
  const expected = process.env.VOWHUMANS_INTERNAL_KEY;
  const provided = request.headers.get("x-internal-key");
  if (!expected || !provided) return false;
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
}

// Duplicated from api/v1/[...route]/route.ts rather than shared — this codebase's
// existing convention (requireOrganisation/requireInternalKey etc.) is to keep
// each route file's small local helpers local rather than introducing a shared
// utils module neither route file otherwise needs.
function flagEnabled(name: string): boolean {
  return (process.env[name] ?? "false").toLowerCase() === "true";
}

type PersonaRow = {
  id: string; role: string; system_instructions: string; conversation_style: string; opening_message: string;
  language: string; speaking_rate: string; max_response_words: number; knowledge_base_ids: string[];
};

export async function GET(request: NextRequest) {
  if (!requireInternalKey(request)) {
    return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const organisationId = request.headers.get("x-organisation-id");
  const humanSlug = request.nextUrl.searchParams.get("human_slug");
  const personaVersionId = request.nextUrl.searchParams.get("persona_version_id");
  const requestedLanguage = flagEnabled("ENABLE_MULTILINGUAL") ? request.nextUrl.searchParams.get("language") : null;
  if (!organisationId || !humanSlug) {
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "x-organisation-id header and human_slug query param are required." }, { status: 422 });
  }

  // A pinned persona_version_id (set when an embed session was created — see
  // digital_human_applications.persona_version_id) always wins over the human's
  // current live assignment, since a studio user can swap that assignment after
  // an application was already enabled and this call must keep using what was
  // pinned at the time. Falling back to the live assignment (still requiring
  // published, never a draft) covers every caller with no pin to give, including
  // today's /demos/interview flow.
  const personaRows = personaVersionId
    ? await sql<PersonaRow[]>`
        SELECT id, role, system_instructions, conversation_style, opening_message, language, speaking_rate, max_response_words, knowledge_base_ids
        FROM persona_versions WHERE id = ${personaVersionId} AND organisation_id = ${organisationId} AND state = 'published'
      `
    : await sql<PersonaRow[]>`
        SELECT pv.id, pv.role, pv.system_instructions, pv.conversation_style, pv.opening_message, pv.language, pv.speaking_rate, pv.max_response_words, pv.knowledge_base_ids
        FROM human_persona_assignments hpa JOIN persona_versions pv ON pv.id = hpa.persona_version_id
        WHERE hpa.organisation_id = ${organisationId} AND hpa.human_slug = ${humanSlug} AND pv.state = 'published'
      `;
  const persona = personaRows[0];
  if (!persona) {
    return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
  }

  let resolvedLanguage: string | null = null;
  let terminology: { source_term: string; preferred_form: string; phonetic_guidance: string }[] = [];
  if (requestedLanguage) {
    const resolution = await resolveForCapability(organisationId, requestedLanguage, "reasoning");
    resolvedLanguage = resolution?.resolvedLanguageCode ?? null;
    if (resolvedLanguage) {
      terminology = await sql`SELECT source_term, preferred_form, phonetic_guidance FROM terminology_entries WHERE organisation_id = ${organisationId} AND language_code = ${resolvedLanguage}`;
      const [languageMessage] = await sql<{ opening_message: string }[]>`SELECT opening_message FROM persona_version_language_messages WHERE organisation_id = ${organisationId} AND persona_version_id = ${persona.id} AND language_code = ${resolvedLanguage} AND opening_message != ''`;
      // Substituting language/opening_message directly on the returned persona
      // object (rather than adding parallel fields) keeps livekit_agent.py's
      // existing f"Respond in {persona['language']}" / opening_message
      // construction completely unaware of the distinction — this endpoint is
      // the single place that resolves "what language, really" for a call.
      persona.language = resolvedLanguage;
      if (languageMessage) persona.opening_message = languageMessage.opening_message;
    }
  }

  // 3-tier voice resolution: per-human per-language override -> org's default
  // voice for that language -> the human's one existing default voice
  // assignment (today's exact, only behaviour when no language is requested or
  // multilingual is off). Each tier only runs if the previous ones found nothing.
  type VoiceRow = { provider: string; provider_voice_id: string | null };
  let resolvedVoice: VoiceRow | null = null;
  if (resolvedLanguage) {
    const [languageVoice] = await sql<VoiceRow[]>`
      SELECT v.provider, v.provider_voice_id FROM digital_human_language_voices dhlv JOIN voices v ON v.id = dhlv.voice_id
      WHERE dhlv.organisation_id = ${organisationId} AND dhlv.human_slug = ${humanSlug} AND dhlv.language_code = ${resolvedLanguage}
    `;
    resolvedVoice = languageVoice ?? null;
    if (!resolvedVoice) {
      const [orgDefaultVoice] = await sql<VoiceRow[]>`
        SELECT v.provider, v.provider_voice_id FROM organisation_languages ol JOIN voices v ON v.id = ol.default_voice_id
        WHERE ol.organisation_id = ${organisationId} AND ol.language_code = ${resolvedLanguage}
      `;
      resolvedVoice = orgDefaultVoice ?? null;
    }
  }
  if (!resolvedVoice) {
    const [defaultVoice] = await sql<VoiceRow[]>`
      SELECT v.provider, v.provider_voice_id FROM human_voice_assignments hva JOIN voices v ON v.id = hva.voice_id
      WHERE hva.organisation_id = ${organisationId} AND hva.human_slug = ${humanSlug}
    `;
    resolvedVoice = defaultVoice ?? null;
  }

  return NextResponse.json({
    success: true,
    data: { persona, voice: resolvedVoice, terminology, ...(requestedLanguage ? { requested_language: requestedLanguage, resolved_language: resolvedLanguage } : {}) },
  });
}
