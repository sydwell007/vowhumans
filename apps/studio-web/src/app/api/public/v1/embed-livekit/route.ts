import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { mintEmbedToken } from "@/lib/embedToken";

// session_id is a random UUID minted by embed-sessions' own INSERT — unguessable,
// and the pairing that created it was already validated as enabled, so re-reading
// it here for its organisation is enough; no separate re-validation is needed.
export async function POST(request: NextRequest) {
  const requestId = randomUUID();
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
  const embedTokenSecret = process.env.VOWHUMANS_EMBED_TOKEN_SECRET;
  let gatewayUrl: URL | null = null;
  try {
    gatewayUrl = baseUrl ? new URL(baseUrl) : null;
  } catch {
    gatewayUrl = null;
  }
  const gatewayUrlAllowed = Boolean(
    gatewayUrl &&
      (gatewayUrl.protocol === "https:" ||
        (process.env.NODE_ENV !== "production" && gatewayUrl.protocol === "http:")),
  );
  if (!gatewayUrlAllowed || !embedTokenSecret) {
    console.error("[embed-livekit] provider configuration missing", {
      requestId,
      hasGatewayUrl: gatewayUrlAllowed,
      hasEmbedTokenSecret: Boolean(embedTokenSecret),
    });
    return NextResponse.json(
      {
        success: false,
        code: "PROVIDER_CONFIGURATION_ERROR",
        message: "The AI presenter service is temporarily unavailable.",
        meta: { request_id: requestId },
      },
      { status: 503, headers: { "x-request-id": requestId } },
    );
  }

  try {
    const upstream = await fetch(`${gatewayUrl!.toString().replace(/\/$/, "")}/api/v1/livekit/token`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${mintEmbedToken(session.organisation_id)}` },
      body: JSON.stringify({
        session_id: sessionId,
        participant_identity: `embed-guest-${randomUUID().slice(0, 8)}`,
        human_slug: session.digital_human_id,
        persona_version_id: session.persona_version_id,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(40000),
    });
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok || data === null) {
      console.error("[embed-livekit] gateway rejected token request", {
        requestId,
        gatewayHost: gatewayUrl!.host,
        upstreamStatus: upstream.status,
        upstreamCode:
          data && typeof data === "object" && "code" in data ? String(data.code) : null,
      });
      return NextResponse.json(
        {
          success: false,
          code: upstream.status === 401 ? "GATEWAY_AUTH_ERROR" : "GATEWAY_ERROR",
          message: "The AI presenter could not start. Please try again shortly.",
          meta: { request_id: requestId },
        },
        { status: 502, headers: { "x-request-id": requestId } },
      );
    }
    return NextResponse.json(
      { success: true, data, meta: { mode: "live", request_id: requestId } },
      { headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    console.error("[embed-livekit] gateway request failed", {
      requestId,
      gatewayHost: gatewayUrl!.host,
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: error instanceof Error ? error.message : "Unknown gateway failure",
    });
    return NextResponse.json(
      {
        success: false,
        code: "GATEWAY_UNREACHABLE",
        message: "The AI presenter could not connect. Please try again shortly.",
        meta: { request_id: requestId },
      },
      { status: 502, headers: { "x-request-id": requestId } },
    );
  }
}
