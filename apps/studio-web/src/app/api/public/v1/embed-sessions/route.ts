import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import {
  loadVowLmsLessonContext,
  VowLmsContextError,
} from "@/lib/vowLmsContext";
import { resolveForCapability } from "@/lib/languageRouter";

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

// Mirrors the same os.getenv(...).lower()=="true" idiom used everywhere else
// this flag is read (apps/studio-web/src/app/api/v1/[...route]/route.ts) —
// every embed degrades to today's exact default-language-only behaviour when off.
function flagEnabled(name: string): boolean {
  return (process.env[name] ?? "false").toLowerCase() === "true";
}

// A caller-requested language only ever overrides the digital human's
// configured default when the platform flag is on AND `language_capabilities`
// (the platform-wide, tenant-less source of truth per 010_multilingual_registry.sql
// — "whether OpenAI's Whisper documents support for isiZulu is a platform fact, not
// a per-org opinion") says the 'realtime' capability for that code is actually
// usable. Reuses resolveForCapability — the same, already-tested resolution logic
// the rest of this app uses (org preference if one exists, else the platform
// matrix, else an honest fallback) — rather than a second, ad-hoc gate. Falls back
// to the pairing's own default otherwise, silently: this must never be a hard
// error for an unmapped, unsupported, or not-yet-quality-gated code.
async function resolveRequestedLanguage(
  organisationId: string,
  defaultLanguageCode: string,
  requestedCode: string,
): Promise<{ languageCode: string; honored: boolean }> {
  if (!requestedCode || !flagEnabled("ENABLE_MULTILINGUAL")) {
    return { languageCode: defaultLanguageCode, honored: false };
  }
  const resolution = await resolveForCapability(organisationId, requestedCode, "realtime");
  if (!resolution || !resolution.resolvedLanguageCode || resolution.status === "unsupported") {
    return { languageCode: defaultLanguageCode, honored: false };
  }
  return {
    languageCode: resolution.resolvedLanguageCode,
    honored: !resolution.usedFallback && resolution.resolvedLanguageCode === requestedCode,
  };
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
  const requestedLanguageCode =
    typeof body.language_code === "string" ? body.language_code.slice(0, 20) : "";
  if (!digitalHumanId || !applicationSlug) {
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "digital_human_id and application_slug are required." }, { status: 422 });
  }

  const [pairing] = await sql<{
    organisation_id: string; application_id: string; digital_human_id: string; persona_version_id: string;
    application_settings: unknown; face_identity_id: string | null; voice_identity_id: string | null; default_language_code: string;
  }[]>`
    SELECT dha.organisation_id, dha.application_id, dha.digital_human_id, dha.persona_version_id, a.settings AS application_settings,
      fa.identity_id AS face_identity_id, v.identity_id AS voice_identity_id, dh.default_language_code
    FROM digital_human_applications dha
    JOIN applications a ON a.id = dha.application_id AND a.organisation_id = dha.organisation_id
    JOIN digital_humans dh ON dh.id = dha.digital_human_id AND dh.organisation_id = dha.organisation_id
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

  const { languageCode: requestedLanguage, honored: languageHonored } = await resolveRequestedLanguage(
    pairing.organisation_id,
    pairing.default_language_code,
    requestedLanguageCode,
  );

  const [riggedAssignment] = flagEnabled("ENABLE_RIGGED_3D") ? await sql<{ ready: boolean }[]>`
    SELECT true AS ready
    FROM human_replica_assignments hra
    JOIN replica_profiles rp ON rp.id = hra.replica_profile_id AND rp.organisation_id = hra.organisation_id
    JOIN replica_versions rv ON rv.id = hra.replica_version_id AND rv.replica_profile_id = rp.id AND rv.organisation_id = hra.organisation_id
    JOIN identities i ON i.id = rp.identity_id AND i.organisation_id = hra.organisation_id
    WHERE hra.organisation_id = ${pairing.organisation_id} AND hra.human_slug = ${pairing.digital_human_id}::text
      AND hra.renderer_tier = 'rigged_3d' AND hra.enabled = true
      AND rp.renderer_tier = 'rigged_3d' AND rp.status = 'approved' AND rp.active_version_id = rv.id
      AND rv.state = 'published' AND i.state = 'approved' AND i.commercial_use_confirmed = true
      AND (i.expires_at IS NULL OR i.expires_at > now())
      AND EXISTS (
        SELECT 1 FROM identity_consents ic WHERE ic.organisation_id = hra.organisation_id AND ic.identity_id = rp.identity_id
          AND ic.consent_type = 'face' AND ic.state = 'approved' AND ic.revoked_at IS NULL
          AND (ic.expires_at IS NULL OR ic.expires_at > now())
          AND (ic.permitted_application_ids = '{}' OR ${pairing.application_id} = ANY(ic.permitted_application_ids))
      )
      AND EXISTS (
        SELECT 1 FROM identity_consents ic WHERE ic.organisation_id = hra.organisation_id AND ic.identity_id = rp.identity_id
          AND ic.consent_type = 'commercial' AND ic.state = 'approved' AND ic.revoked_at IS NULL
          AND (ic.expires_at IS NULL OR ic.expires_at > now())
          AND (ic.permitted_application_ids = '{}' OR ${pairing.application_id} = ANY(ic.permitted_application_ids))
      )
    LIMIT 1
  ` : [];
  const rendererTier = riggedAssignment?.ready ? "rigged_3d" : "live_voice";
  const transportProvider = rendererTier === "rigged_3d" ? "pixel-streaming-2" : "livekit";
  const avatarMode = rendererTier === "rigged_3d" ? "rigged-3d" : "live-avatar";

  const [session] = await sql<{ id: string }[]>`
    INSERT INTO sessions (organisation_id, application_id, digital_human_id, persona_version_id, owner_external_ref_hash, transport_provider, avatar_mode, context)
    VALUES (${pairing.organisation_id}, ${pairing.application_id}, ${pairing.digital_human_id}, ${pairing.persona_version_id}, ${ipHash}, ${transportProvider}, ${avatarMode}, ${sql.json({ source: "embed", application_slug: applicationSlug, requested_language: requestedLanguage, renderer_tier: rendererTier, ...(lessonContext ? { lesson: lessonContext } : {}) })})
    RETURNING id
  `;

  return NextResponse.json({
    success: true,
    data: {
      session_id: session.id,
      portrait_url: `/api/public/v1/embed-face?session_id=${encodeURIComponent(session.id)}`,
      renderer_tier: rendererTier,
      disclosure: "You are speaking with an AI-generated digital human, not a real person.",
      // Honest disclosure per this table's own doc comment: a caller that
      // requested a specific language must be able to tell whether it was
      // actually used, never assume silent success.
      language_code: requestedLanguage,
      language_requested: requestedLanguageCode || null,
      language_honored: languageHonored,
    },
    meta: { mode: "live", request_id: randomUUID() },
  }, { status: 201 });
}
