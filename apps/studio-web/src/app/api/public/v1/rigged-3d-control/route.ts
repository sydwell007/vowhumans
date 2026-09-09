import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { mintRigged3DGrant, validatedServiceUrl } from "@/lib/rigged3d";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATES = new Set(["idle", "listening", "acknowledging", "thinking", "speaking", "interrupted", "presenting", "closing"]);
const MOTIONS = new Set(["open_palm_left", "open_palm_right", "open_palm_both", "explain", "emphasize", "acknowledge", "question", "encourage", "welcome", "agreement", "closing", "wave"]);

export async function POST(request: NextRequest) {
  if ((process.env.ENABLE_RIGGED_3D ?? "false").toLowerCase() !== "true") return NextResponse.json({ success: false, code: "FEATURE_DISABLED" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const sessionId = typeof body.session_id === "string" && UUID.test(body.session_id) ? body.session_id : "";
  const control = body.type === "state" && STATES.has(body.state)
    ? { type: "state", state: body.state }
    : body.type === "motion" && MOTIONS.has(body.intent)
      ? { type: "motion", intent: body.intent }
      : null;
  if (!sessionId || !control) return NextResponse.json({ success: false, code: "VALIDATION_ERROR" }, { status: 422 });

  const [assignment] = await sql<{ organisation_id: string; digital_human_id: string; replica_version_id: string; manifest_object_key: string }[]>`
    SELECT s.organisation_id, s.digital_human_id, rv.id AS replica_version_id, rv.manifest_object_key
    FROM sessions s
    JOIN human_replica_assignments hra ON hra.organisation_id=s.organisation_id AND hra.human_slug=s.digital_human_id::text AND hra.enabled=true AND hra.renderer_tier='rigged_3d'
    JOIN replica_profiles rp ON rp.id=hra.replica_profile_id AND rp.organisation_id=s.organisation_id AND rp.status='approved' AND rp.active_version_id=hra.replica_version_id
    JOIN replica_versions rv ON rv.id=hra.replica_version_id AND rv.organisation_id=s.organisation_id AND rv.state='published'
    JOIN identities i ON i.id=rp.identity_id AND i.organisation_id=s.organisation_id
      AND i.state='approved' AND i.commercial_use_confirmed=true
      AND (i.expires_at IS NULL OR i.expires_at > now())
    WHERE s.id=${sessionId} AND s.transport_provider='pixel-streaming-2' AND s.created_at > now() - interval '10 minutes'
      AND EXISTS (
        SELECT 1 FROM identity_consents ic WHERE ic.organisation_id=s.organisation_id
          AND ic.identity_id=rp.identity_id AND ic.consent_type='face' AND ic.state='approved'
          AND ic.revoked_at IS NULL AND (ic.expires_at IS NULL OR ic.expires_at > now())
          AND (ic.permitted_application_ids='{}' OR s.application_id=ANY(ic.permitted_application_ids))
      )
      AND EXISTS (
        SELECT 1 FROM identity_consents ic WHERE ic.organisation_id=s.organisation_id
          AND ic.identity_id=rp.identity_id AND ic.consent_type='commercial' AND ic.state='approved'
          AND ic.revoked_at IS NULL AND (ic.expires_at IS NULL OR ic.expires_at > now())
          AND (ic.permitted_application_ids='{}' OR s.application_id=ANY(ic.permitted_application_ids))
      )
  `;
  if (!assignment) return NextResponse.json({ success: false, code: "SESSION_NOT_ACTIVE" }, { status: 409 });

  const broker = validatedServiceUrl(process.env.RIGGED_3D_BROKER_URL);
  const secret = process.env.RIGGED_3D_RUNTIME_SECRET ?? "";
  if (!broker || secret.length < 32) return NextResponse.json({ success: false, code: "PROVIDER_CONFIGURATION_ERROR" }, { status: 503 });
  const grant = mintRigged3DGrant({ session_id: sessionId, organisation_id: assignment.organisation_id, digital_human_id: assignment.digital_human_id, replica_version_id: assignment.replica_version_id, character_manifest_ref: assignment.manifest_object_key }, secret, 30);
  try {
    const upstream = await fetch(new URL(`/v1/sessions/${encodeURIComponent(sessionId)}/control`, broker), { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${grant}` }, body: JSON.stringify(control), cache: "no-store", signal: AbortSignal.timeout(3000) });
    return upstream.ok ? new NextResponse(null, { status: 202 }) : NextResponse.json({ success: false, code: "RUNTIME_NOT_READY" }, { status: upstream.status === 409 ? 409 : 502 });
  } catch {
    return NextResponse.json({ success: false, code: "BROKER_UNREACHABLE" }, { status: 502 });
  }
}
