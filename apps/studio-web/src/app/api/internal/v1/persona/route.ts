import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

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

  const [voice] = await sql<{ provider: string; provider_voice_id: string | null }[]>`
    SELECT v.provider, v.provider_voice_id FROM human_voice_assignments hva JOIN voices v ON v.id = hva.voice_id
    WHERE hva.organisation_id = ${organisationId} AND hva.human_slug = ${humanSlug}
  `;

  return NextResponse.json({ success: true, data: { persona, voice: voice ?? null } });
}
