import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// Separate from the /api/v1/[...route] catch-all deliberately: every branch in that
// file trusts a browser session cookie, but this route's caller is an anonymous
// visitor of a partner site's iframe — there is no cookie and no logged-in
// organisation to derive from the request. The organisation is instead resolved
// from the validated (digital_human_id, application_slug) pairing itself, never
// trusted from the client body.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const digitalHumanId = typeof body.digital_human_id === "string" ? body.digital_human_id : "";
  const applicationSlug = typeof body.application_slug === "string" ? body.application_slug : "";
  if (!digitalHumanId || !applicationSlug) {
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "digital_human_id and application_slug are required." }, { status: 422 });
  }

  const [pairing] = await sql<{ organisation_id: string; application_id: string; digital_human_id: string; persona_version_id: string }[]>`
    SELECT dha.organisation_id, dha.application_id, dha.digital_human_id, dha.persona_version_id
    FROM digital_human_applications dha
    JOIN applications a ON a.id = dha.application_id AND a.organisation_id = dha.organisation_id
    WHERE dha.digital_human_id = ${digitalHumanId} AND a.slug = ${applicationSlug} AND dha.enabled = true AND a.status = 'active'
  `;
  if (!pairing) {
    return NextResponse.json({ success: false, code: "NOT_FOUND", message: "This VowHuman is not available for this application." }, { status: 404 });
  }

  const [session] = await sql<{ id: string }[]>`
    INSERT INTO sessions (organisation_id, application_id, digital_human_id, persona_version_id, transport_provider, avatar_mode, context)
    VALUES (${pairing.organisation_id}, ${pairing.application_id}, ${pairing.digital_human_id}, ${pairing.persona_version_id}, 'livekit', 'live-avatar', ${JSON.stringify({ source: "embed", application_slug: applicationSlug })}::jsonb)
    RETURNING id
  `;

  return NextResponse.json({
    success: true,
    data: { session_id: session.id, disclosure: "You are speaking with an AI-generated digital human, not a real person." },
    meta: { mode: "live", request_id: randomUUID() },
  }, { status: 201 });
}
