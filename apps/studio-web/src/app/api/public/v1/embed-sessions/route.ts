import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import {
  loadVowLmsLessonContext,
  VowLmsContextError,
} from "@/lib/vowLmsContext";

// A pairing is only ever hit by anonymous traffic once it's already enabled — a
// low, generous ceiling that stops one hot pairing (or a script hammering it)
// from generating unbounded LiveKit/OpenAI cost, without ever mattering to normal
// human usage of a single embedded widget.
const PAIRING_SESSIONS_PER_MINUTE = 30;
// Per-client-IP, over a longer window — catches a single abusive caller spraying
// requests across many different pairings, which the per-pairing cap alone
// wouldn't stop.
const IP_SESSIONS_PER_5_MINUTES = 8;

// postgres.js doesn't always hand back jsonb columns as parsed objects (see the
// same defensive pattern on audioObjectKeyFromSettings in api/v1/[...route]) —
// never assume `settings` arrived as an object.
function parseSettings(settings: unknown): { allowed_embed_origins?: unknown } {
  const parsed = typeof settings === "string" ? JSON.parse(settings) : settings;
  return (parsed ?? {}) as { allowed_embed_origins?: unknown };
}

function requestOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  if (origin) return origin;
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

// Never store a raw IP (owner_external_ref_hash is explicitly named for exactly
// this kind of anonymised identifier) — a stable hash is all rate-limit bucketing
// needs, and IPs aren't secret, so no pepper is needed either.
function hashClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : (request.headers.get("x-real-ip") ?? "unknown");
  return createHash("sha256").update(ip).digest("hex");
}

async function isIdentityClearedForApplication(organisationId: string, identityId: string, consentType: "face" | "voice", applicationId: string): Promise<boolean> {
  const [identity] = await sql<{ state: string }[]>`SELECT state FROM identities WHERE id = ${identityId} AND organisation_id = ${organisationId}`;
  if (!identity || identity.state !== "approved") return false;
  const [consent] = await sql<{ id: string }[]>`
    SELECT id FROM identity_consents
    WHERE organisation_id = ${organisationId} AND identity_id = ${identityId} AND consent_type = ${consentType} AND state = 'approved'
      AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())
      AND (permitted_application_ids = '{}' OR ${applicationId} = ANY(permitted_application_ids))
  `;
  return Boolean(consent);
}

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
  const lessonContextToken =
    typeof body.lesson_context_token === "string" ? body.lesson_context_token : "";
  if (!digitalHumanId || !applicationSlug) {
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "digital_human_id and application_slug are required." }, { status: 422 });
  }

  const [pairing] = await sql<{
    organisation_id: string; application_id: string; digital_human_id: string; persona_version_id: string;
    application_settings: unknown; face_identity_id: string | null; voice_identity_id: string | null;
  }[]>`
    SELECT dha.organisation_id, dha.application_id, dha.digital_human_id, dha.persona_version_id, a.settings AS application_settings,
      fa.identity_id AS face_identity_id, v.identity_id AS voice_identity_id
    FROM digital_human_applications dha
    JOIN applications a ON a.id = dha.application_id AND a.organisation_id = dha.organisation_id
    LEFT JOIN human_face_assignments hfa ON hfa.organisation_id = dha.organisation_id AND hfa.human_slug = dha.digital_human_id::text
    LEFT JOIN face_assets fa ON fa.id = hfa.face_asset_id
    LEFT JOIN human_voice_assignments hva ON hva.organisation_id = dha.organisation_id AND hva.human_slug = dha.digital_human_id::text
    LEFT JOIN voices v ON v.id = hva.voice_id
    WHERE dha.digital_human_id = ${digitalHumanId} AND a.slug = ${applicationSlug} AND dha.enabled = true AND a.status = 'active'
  `;
  if (!pairing) {
    return NextResponse.json({ success: false, code: "NOT_FOUND", message: "This VowHuman is not available for this application." }, { status: 404 });
  }

  // Opt-in: an application with no allowlist configured keeps today's open
  // behaviour (matches how this pairing already worked before this check
  // existed) rather than silently locking out every already-enabled pairing.
  const allowedOriginsRaw = parseSettings(pairing.application_settings).allowed_embed_origins;
  const allowedOrigins = Array.isArray(allowedOriginsRaw) ? allowedOriginsRaw.filter((o): o is string => typeof o === "string") : [];
  if (allowedOrigins.length > 0) {
    const origin = requestOrigin(request);
    if (!origin || !allowedOrigins.includes(origin)) {
      return NextResponse.json({ success: false, code: "ORIGIN_NOT_ALLOWED", message: "This application does not allow embedding from this origin." }, { status: 403 });
    }
  }

  // No face/voice in this app has ever been given a real identity_id yet (every
  // digital human here is disclosed as fictional/AI-generated) — so this is a
  // no-op today for every existing pairing, and only starts mattering once a
  // real person's likeness/voice with tracked consent is attached to one.
  if (pairing.face_identity_id && !(await isIdentityClearedForApplication(pairing.organisation_id, pairing.face_identity_id, "face", pairing.application_id))) {
    return NextResponse.json({ success: false, code: "CONSENT_REQUIRED", message: "This VowHuman's face does not have active consent to be embedded in this application." }, { status: 403 });
  }
  if (pairing.voice_identity_id && !(await isIdentityClearedForApplication(pairing.organisation_id, pairing.voice_identity_id, "voice", pairing.application_id))) {
    return NextResponse.json({ success: false, code: "CONSENT_REQUIRED", message: "This VowHuman's voice does not have active consent to be embedded in this application." }, { status: 403 });
  }

  const ipHash = hashClientIp(request);
  const [[pairingRate], [ipRate]] = await Promise.all([
    sql<{ count: string }[]>`
      SELECT count(*) FROM sessions
      WHERE organisation_id = ${pairing.organisation_id} AND digital_human_id = ${pairing.digital_human_id} AND application_id = ${pairing.application_id}
        AND created_at > now() - interval '1 minute'
    `,
    sql<{ count: string }[]>`
      SELECT count(*) FROM sessions WHERE organisation_id = ${pairing.organisation_id} AND owner_external_ref_hash = ${ipHash} AND created_at > now() - interval '5 minutes'
    `,
  ]);
  if (Number(pairingRate.count) >= PAIRING_SESSIONS_PER_MINUTE || Number(ipRate.count) >= IP_SESSIONS_PER_5_MINUTES) {
    return NextResponse.json({ success: false, code: "RATE_LIMITED", message: "Too many session requests. Try again shortly." }, { status: 429 });
  }

  let lessonContext = null;
  if (lessonContextToken) {
    try {
      lessonContext = await loadVowLmsLessonContext(lessonContextToken);
    } catch (error) {
      const status = error instanceof VowLmsContextError ? error.status : 502;
      console.error("[embed-sessions] lesson context rejected", {
        status,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json(
        {
          success: false,
          code: status === 401 ? "LESSON_CONTEXT_UNAUTHENTICATED" : "LESSON_CONTEXT_UNAVAILABLE",
          message: "The approved lesson material could not be prepared. Please try again.",
        },
        { status },
      );
    }
  }

  const [session] = await sql<{ id: string }[]>`
    INSERT INTO sessions (organisation_id, application_id, digital_human_id, persona_version_id, owner_external_ref_hash, transport_provider, avatar_mode, context)
    VALUES (${pairing.organisation_id}, ${pairing.application_id}, ${pairing.digital_human_id}, ${pairing.persona_version_id}, ${ipHash}, 'livekit', 'live-avatar', ${sql.json({ source: "embed", application_slug: applicationSlug, ...(lessonContext ? { lesson: lessonContext } : {}) })})
    RETURNING id
  `;

  return NextResponse.json({
    success: true,
    data: {
      session_id: session.id,
      portrait_url: `/api/public/v1/embed-face?session_id=${encodeURIComponent(session.id)}`,
      disclosure: "You are speaking with an AI-generated digital human, not a real person.",
    },
    meta: { mode: "live", request_id: randomUUID() },
  }, { status: 201 });
}
