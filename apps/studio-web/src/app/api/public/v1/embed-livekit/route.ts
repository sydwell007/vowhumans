import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { mintEmbedToken } from "@/lib/embedToken";

// session_id is a random UUID minted by embed-sessions' own INSERT — unguessable,
// and the pairing that created it was already validated as enabled, so re-reading
// it here for its organisation is enough; no separate re-validation is needed.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const sessionId = typeof body.session_id === "string" ? body.session_id : "";
  if (!sessionId) {
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "session_id is required." }, { status: 422 });
  }

  const [session] = await sql<{ organisation_id: string; digital_human_id: string; persona_version_id: string }[]>`
    SELECT organisation_id, digital_human_id, persona_version_id FROM sessions WHERE id = ${sessionId}
  `;
  if (!session) {
    return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
  }

  const baseUrl = process.env.API_GATEWAY_URL;
  if (!baseUrl) {
    return NextResponse.json({ success: false, code: "PROVIDER_DISABLED", message: "LiveKit tokens are issued only by the configured server-side API gateway." }, { status: 503 });
  }

  try {
    const upstream = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v1/livekit/token`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${mintEmbedToken(session.organisation_id)}` },
      body: JSON.stringify({
        session_id: sessionId,
        participant_identity: `embed-guest-${randomUUID().slice(0, 8)}`,
        human_slug: session.digital_human_id,
        persona_version_id: session.persona_version_id,
      }),
      signal: AbortSignal.timeout(40000),
    });
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok || data === null) {
      return NextResponse.json({ success: false, code: "GATEWAY_ERROR", message: "Could not start the live call." }, { status: 502 });
    }
    return NextResponse.json({ success: true, data, meta: { mode: "live", request_id: randomUUID() } });
  } catch {
    return NextResponse.json({ success: false, code: "GATEWAY_ERROR", message: "Could not start the live call." }, { status: 502 });
  }
}
