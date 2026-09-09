import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { mintRigged3DGrant, validatedPlayerUrl, validatedServiceUrl } from "@/lib/rigged3d";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  if ((process.env.ENABLE_RIGGED_3D ?? "false").toLowerCase() !== "true") {
    return NextResponse.json({ success: false, code: "FEATURE_DISABLED", message: "The fully rigged 3D renderer is not enabled." }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const sessionId = typeof body.session_id === "string" && UUID.test(body.session_id) ? body.session_id : "";
  if (!sessionId) {
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "A valid session_id is required." }, { status: 422 });
  }

  const [assignment] = await sql<{
    organisation_id: string;
    digital_human_id: string;
    replica_version_id: string;
    manifest_object_key: string;
  }[]>`
    SELECT s.organisation_id, s.digital_human_id, rv.id AS replica_version_id, rv.manifest_object_key
    FROM sessions s
    JOIN human_replica_assignments hra
      ON hra.organisation_id = s.organisation_id
      AND hra.human_slug = s.digital_human_id::text
      AND hra.renderer_tier = 'rigged_3d' AND hra.enabled = true
    JOIN replica_profiles rp
      ON rp.id = hra.replica_profile_id AND rp.organisation_id = s.organisation_id
      AND rp.renderer_tier = 'rigged_3d' AND rp.status = 'approved'
      AND rp.active_version_id = hra.replica_version_id
    JOIN replica_versions rv
      ON rv.id = hra.replica_version_id AND rv.replica_profile_id = rp.id
      AND rv.organisation_id = s.organisation_id AND rv.state = 'published'
    JOIN identities i
      ON i.id = rp.identity_id AND i.organisation_id = s.organisation_id
      AND i.state = 'approved' AND i.commercial_use_confirmed = true
      AND (i.expires_at IS NULL OR i.expires_at > now())
    WHERE s.id = ${sessionId} AND s.transport_provider = 'pixel-streaming-2'
      AND s.avatar_mode = 'rigged-3d' AND s.created_at > now() - interval '10 minutes'
      AND EXISTS (
        SELECT 1 FROM identity_consents ic WHERE ic.organisation_id = s.organisation_id
          AND ic.identity_id = rp.identity_id AND ic.consent_type = 'face' AND ic.state = 'approved'
          AND ic.revoked_at IS NULL AND (ic.expires_at IS NULL OR ic.expires_at > now())
          AND (ic.permitted_application_ids = '{}' OR s.application_id = ANY(ic.permitted_application_ids))
      )
      AND EXISTS (
        SELECT 1 FROM identity_consents ic WHERE ic.organisation_id = s.organisation_id
          AND ic.identity_id = rp.identity_id AND ic.consent_type = 'commercial' AND ic.state = 'approved'
          AND ic.revoked_at IS NULL AND (ic.expires_at IS NULL OR ic.expires_at > now())
          AND (ic.permitted_application_ids = '{}' OR s.application_id = ANY(ic.permitted_application_ids))
      )
  `;
  if (!assignment) {
    return NextResponse.json({ success: false, code: "RENDERER_NOT_READY", message: "This 3D human is not currently cleared for a live session." }, { status: 409 });
  }

  const brokerUrl = validatedServiceUrl(process.env.RIGGED_3D_BROKER_URL);
  const secret = process.env.RIGGED_3D_RUNTIME_SECRET ?? "";
  if (!brokerUrl || secret.length < 32 || !process.env.RIGGED_3D_PLAYER_ORIGIN) {
    console.error("[rigged-3d-session] provider configuration missing", { requestId, hasBrokerUrl: Boolean(brokerUrl), hasSecret: secret.length >= 32, hasPlayerOrigin: Boolean(process.env.RIGGED_3D_PLAYER_ORIGIN) });
    return NextResponse.json({ success: false, code: "PROVIDER_CONFIGURATION_ERROR", message: "3D capacity is temporarily unavailable." }, { status: 503 });
  }

  try {
    const grant = mintRigged3DGrant({
      session_id: sessionId,
      organisation_id: assignment.organisation_id,
      digital_human_id: assignment.digital_human_id,
      replica_version_id: assignment.replica_version_id,
      character_manifest_ref: assignment.manifest_object_key,
    }, secret);
    const upstream = await fetch(new URL("/v1/sessions", brokerUrl), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${grant}` },
      body: JSON.stringify({ session_id: sessionId }),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    const result = await upstream.json().catch(() => null) as { player_url?: unknown; streamer_id?: unknown; expires_at?: unknown; code?: unknown } | null;
    const playerUrl = validatedPlayerUrl(result?.player_url, process.env.RIGGED_3D_PLAYER_ORIGIN);
    if (!upstream.ok || !playerUrl || typeof result?.streamer_id !== "string") {
      console.error("[rigged-3d-session] broker rejected allocation", { requestId, brokerHost: brokerUrl.host, upstreamStatus: upstream.status, upstreamCode: result?.code ?? null });
      return NextResponse.json({ success: false, code: "CAPACITY_UNAVAILABLE", message: "A 3D streaming session could not be allocated." }, { status: 503 });
    }
    return NextResponse.json({ success: true, data: { player_url: playerUrl, streamer_id: result.streamer_id, expires_at: typeof result.expires_at === "string" ? result.expires_at : null }, meta: { mode: "live", request_id: requestId } }, { status: 201, headers: { "cache-control": "no-store", "x-request-id": requestId } });
  } catch (error) {
    console.error("[rigged-3d-session] broker request failed", { requestId, brokerHost: brokerUrl.host, errorName: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ success: false, code: "BROKER_UNREACHABLE", message: "The 3D streaming service could not be reached." }, { status: 502, headers: { "x-request-id": requestId } });
  }
}
