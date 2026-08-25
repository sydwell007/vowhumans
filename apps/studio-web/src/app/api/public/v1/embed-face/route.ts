import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { resolveFaceBytes } from "@/lib/faces";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id") ?? "";
  if (!UUID_PATTERN.test(sessionId)) {
    return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
  }

  // The session UUID is minted by the server and only returned to its embed. Keep
  // portrait access short-lived and require the pairing to remain enabled.
  const [session] = await sql<{ organisation_id: string; digital_human_id: string }[]>`
    SELECT s.organisation_id, s.digital_human_id
    FROM sessions s
    JOIN digital_human_applications dha
      ON dha.organisation_id = s.organisation_id
      AND dha.application_id = s.application_id
      AND dha.digital_human_id = s.digital_human_id
      AND dha.enabled = true
    JOIN applications a
      ON a.id = s.application_id
      AND a.organisation_id = s.organisation_id
      AND a.status = 'active'
    WHERE s.id = ${sessionId}
      AND s.created_at > now() - interval '30 minutes'
  `;
  if (!session) {
    return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
  }

  const face = await resolveFaceBytes(session.organisation_id, session.digital_human_id);
  if (!face) {
    return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(face.data), {
    headers: {
      "content-type": face.mimeType,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
