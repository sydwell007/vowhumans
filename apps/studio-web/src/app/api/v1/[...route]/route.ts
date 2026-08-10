import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { applications, humans, personas } from "@/data/platform";
import { academyCourses, integrations, templates } from "@/data/commercial";
import { plans } from "@vowhumans/commercial-core";
import sql from "@/lib/db";
import { SESSION_COOKIE_NAME, createSession, destroySession, hashPassword, isLockedOut, readSession, recordFailedLogin, resetFailedLogins, sessionCookieOptions, verifyPassword } from "@/lib/auth";

const allowedResources = new Set(["auth","organisations","workspaces","users","consents","digital-humans","identities","voices","voice-assignments","faces","face-assignments","gesture-profiles","gesture-assignments","personas","knowledge","sessions","livekit","presenter-projects","renders","applications","integrations","templates","marketplace","academy","partners","notifications","support-requests","sales-requests","demo-requests","contact-requests","signup-requests","signin-requests","partner-requests","investor-requests","trust-requests","billing","plans","analytics","api-keys","webhooks","usage","health"]);

const OPENAI_TTS_VOICES = new Set(["alloy","ash","ballad","coral","echo","fable","onyx","nova","sage","shimmer","verse","marin","cedar"]);
const VOICE_SAMPLE_TEXT = "Hello, I'm demonstrating this voice for VowHumans. This sample plays through your organisation's own OpenAI account.";

const GESTURE_FEATURES: Record<string, { label: string; hasRange: boolean; defaultEnabled: boolean; defaultRange: string }> = {
  blinking: { label: "Blinking", hasRange: true, defaultEnabled: true, defaultRange: "4–7s" },
  head_tilt: { label: "Head tilt", hasRange: true, defaultEnabled: true, defaultRange: "±3°" },
  head_nod: { label: "Head nod / shake", hasRange: true, defaultEnabled: true, defaultRange: "±4°" },
  micro_expressions: { label: "Micro-expressions", hasRange: false, defaultEnabled: true, defaultRange: "" },
  gaze_shift: { label: "Gaze shift", hasRange: false, defaultEnabled: true, defaultRange: "" },
  breathing_sway: { label: "Breathing / idle sway", hasRange: false, defaultEnabled: true, defaultRange: "" },
  hand_gestures: { label: "Hand gestures", hasRange: false, defaultEnabled: false, defaultRange: "" },
};

async function requireOrganisation(request: NextRequest): Promise<string | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = token ? await readSession(token) : null;
  return user?.organisationId ?? null;
}

// postgres.js returns this driver's jsonb columns as raw text, not pre-parsed objects.
function audioObjectKeyFromSettings(settings: unknown): string | null {
  const parsed = typeof settings === "string" ? JSON.parse(settings) : settings;
  const key = (parsed as { audio_object_key?: unknown } | null)?.audio_object_key;
  return typeof key === "string" ? key : null;
}

// Gives proxyToGateway's 40s upstream timeout room to actually complete instead of
// Vercel's own function timeout cutting it off first (Hobby default is 10s).
export const maxDuration = 45;

function response(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data, meta: { mode: "development-mock", request_id: randomUUID() } }, { status, headers: { "x-vowhumans-mode": "development-mock" } });
}

// Local human catalogue entries use readable slug ids (e.g. "thandi-mokoena"), but the
// gateway's contract requires a real UUID. Derive a stable, deterministic one per slug
// rather than adding a second id field to every catalogue entry.
function slugToUuid(slug: string): string {
  const bytes = createHash("sha256").update(slug).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Fixed public-demo organisation. Unauthenticated demo traffic (no end-user account
// system exists yet) is scoped to this one organisation id, which must be bound to
// VOWHUMANS_SERVICE_API_KEY in the gateway's VOWHUMANS_SERVICE_API_KEYS registry.
const PUBLIC_DEMO_ORGANISATION_ID = "00000000-0000-4000-8000-000000000001";

// Proxies to the real FastAPI gateway when configured; returns null on any failure
// (not configured, unreachable, timeout, non-2xx) so callers can fall back to the
// existing honest mock response rather than surfacing a raw error.
async function proxyToGateway(path: string, body: unknown): Promise<{ status: number; data: unknown } | null> {
  const baseUrl = process.env.API_GATEWAY_URL;
  const apiKey = process.env.VOWHUMANS_SERVICE_API_KEY;
  if (!baseUrl || !apiKey) return null;
  try {
    const upstream = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "x-organisation-id": PUBLIC_DEMO_ORGANISATION_ID },
      body: JSON.stringify(body),
      // The gateway can run on a free instance that spins down after inactivity and
      // takes up to ~50s to wake on the next request — a short timeout here would
      // misreport a slow-but-working gateway as unreachable and fall back to mock mode.
      signal: AbortSignal.timeout(40000),
    });
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok || data === null) return null;
    return { status: upstream.status, data };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ route: string[] }> }) {
  const { route } = await params;
  const resource = route[0];
  if (!allowedResources.has(resource)) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
  if (resource === "auth" && route[1] === "session") {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const user = token ? await readSession(token) : null;
    if (!user) return response({ authenticated: false });
    return response({ authenticated: true, user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role }, organisation: { id: user.organisationId, name: user.organisationName, slug: user.organisationSlug } });
  }
  if (resource === "health") return response({ status: "ok", persistence: false, providers: { afrihost_api: "not-verified", realtime: "mock", avatar: "static", gpu: "disabled", billing: "disabled", email: "disabled" } });
  if (resource === "digital-humans") return response({ items: humans });

  if (resource === "voices" && route[1] && route[2] === "sample") {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const [voice] = await sql<{ provider: string; provider_voice_id: string | null; settings: unknown }[]>`
      SELECT provider, provider_voice_id, settings FROM voices WHERE id = ${route[1]} AND organisation_id = ${organisationId}
    `;
    if (!voice) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });

    if (voice.provider === "openai" && voice.provider_voice_id) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) return NextResponse.json({ success: false, code: "PROVIDER_DISABLED", message: "OpenAI is not configured." }, { status: 503 });
      const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: voice.provider_voice_id, input: VOICE_SAMPLE_TEXT, response_format: "mp3" }),
        signal: AbortSignal.timeout(20000),
      });
      if (!upstream.ok) {
        const detail = await upstream.text().catch(() => "");
        return NextResponse.json({ success: false, code: "TTS_FAILED", message: detail.slice(0, 300) || "Could not generate the sample." }, { status: 502 });
      }
      const audio = await upstream.arrayBuffer();
      return new NextResponse(audio, { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=3600" } });
    }

    const objectKey = audioObjectKeyFromSettings(voice.settings);
    if (!objectKey) return NextResponse.json({ success: false, code: "NO_AUDIO", message: "This voice has no stored audio yet." }, { status: 404 });
    const [blob] = await sql<{ data: Buffer; mime_type: string }[]>`SELECT data, mime_type FROM media_blobs WHERE object_key = ${objectKey} AND organisation_id = ${organisationId}`;
    if (!blob) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    return new NextResponse(new Uint8Array(blob.data), { headers: { "content-type": blob.mime_type, "cache-control": "private, max-age=3600" } });
  }

  if (resource === "voices" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const rows = await sql`
      SELECT id, name, provider, provider_voice_id, language, is_custom, state, created_at
      FROM voices WHERE organisation_id = ${organisationId} ORDER BY created_at DESC
    `;
    return response({ items: rows, available_provider_voices: [...OPENAI_TTS_VOICES] });
  }

  if (resource === "voice-assignments" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const rows = await sql`
      SELECT a.human_slug, a.voice_id, v.name AS voice_name
      FROM human_voice_assignments a JOIN voices v ON v.id = a.voice_id
      WHERE a.organisation_id = ${organisationId}
    `;
    return response({ items: rows });
  }

  if (resource === "faces" && route[1] && route[2] === "image") {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const [face] = await sql<{ object_key: string }[]>`SELECT object_key FROM face_assets WHERE id = ${route[1]} AND organisation_id = ${organisationId}`;
    if (!face) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    const [blob] = await sql<{ data: Buffer; mime_type: string }[]>`SELECT data, mime_type FROM media_blobs WHERE object_key = ${face.object_key} AND organisation_id = ${organisationId}`;
    if (!blob) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    return new NextResponse(new Uint8Array(blob.data), { headers: { "content-type": blob.mime_type, "cache-control": "private, max-age=3600" } });
  }

  if (resource === "faces" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const rows = await sql`SELECT id, media_type, detector_provider, preprocessing_state, state, created_at FROM face_assets WHERE organisation_id = ${organisationId} ORDER BY created_at DESC`;
    return response({ items: rows });
  }

  if (resource === "face-assignments" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const rows = await sql`SELECT human_slug, face_asset_id FROM human_face_assignments WHERE organisation_id = ${organisationId}`;
    return response({ items: rows });
  }

  if (resource === "gesture-profiles" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const rows = await sql`SELECT id, name, state, state_config, created_at FROM gesture_profiles WHERE organisation_id = ${organisationId} ORDER BY created_at DESC`;
    const items = rows.map((row) => ({ ...row, state_config: typeof row.state_config === "string" ? JSON.parse(row.state_config) : row.state_config }));
    return response({ items, available_features: GESTURE_FEATURES });
  }

  if (resource === "gesture-assignments" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const rows = await sql`SELECT human_slug, gesture_profile_id FROM human_gesture_assignments WHERE organisation_id = ${organisationId}`;
    return response({ items: rows });
  }
  if (resource === "personas") return response({ items: personas });
  if (resource === "applications") return response({ items: applications });
  if (resource === "plans") return response({ items: plans, pricing_status: "proposed-configurable", currency: "ZAR" });
  if (resource === "integrations") return response({ items: integrations });
  if (resource === "templates" || resource === "marketplace") return response({ items: templates, purchases_enabled: false });
  if (resource === "academy") return response({ items: academyCourses, progress_persistent: false });
  if (resource === "usage" || resource === "analytics" || resource === "billing") return response({ sessions: 0, minutes: 0, estimated_cost_minor: 0, currency: "ZAR", source_connected: false, private_content_included: false });
  return response({ items: [], resource, persistent: false });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ route: string[] }> }) {
  const { route } = await params;
  const resource = route[0];
  if (!allowedResources.has(resource)) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });

  // Multipart uploads must be branched off before the generic request.json() parse
  // below — a request body can only be read once.
  if (resource === "voices" && !route[1] && (request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const form = await request.formData();
    const name = String(form.get("name") ?? "").trim();
    const language = String(form.get("language") ?? "English (South Africa)").trim();
    const file = form.get("file");
    if (!name || !(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Provide a name and an audio file." }, { status: 422 });
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Audio file must be 8MB or smaller." }, { status: 422 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const objectKey = `voice-${randomUUID()}`;
    const mimeType = file.type || "audio/mpeg";
    await sql`INSERT INTO media_blobs (object_key, organisation_id, mime_type, data, size_bytes) VALUES (${objectKey}, ${organisationId}, ${mimeType}, ${bytes}, ${bytes.length})`;
    const [voiceRow] = await sql`
      INSERT INTO voices (organisation_id, name, provider, language, is_custom, state, settings)
      VALUES (${organisationId}, ${name}, 'custom', ${language}, true, 'active', ${JSON.stringify({ audio_object_key: objectKey })}::jsonb)
      RETURNING id, name, provider, language, is_custom, state, created_at
    `;
    return NextResponse.json({ success: true, data: voiceRow, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
  }

  if (resource === "faces" && !route[1] && (request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Choose an image file." }, { status: 422 });
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Image file must be 8MB or smaller." }, { status: 422 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const objectKey = `face-${randomUUID()}`;
    const mimeType = file.type || "image/jpeg";
    await sql`INSERT INTO media_blobs (object_key, organisation_id, mime_type, data, size_bytes) VALUES (${objectKey}, ${organisationId}, ${mimeType}, ${bytes}, ${bytes.length})`;
    const [faceRow] = await sql`
      INSERT INTO face_assets (organisation_id, object_key, sha256, media_type, provenance, detector_provider, preprocessing_state, state)
      VALUES (${organisationId}, ${objectKey}, ${createHash("sha256").update(bytes).digest("hex")}, ${mimeType}, ${JSON.stringify({ source: "upload" })}::jsonb, 'upload', 'ready', 'active')
      RETURNING id, media_type, detector_provider, preprocessing_state, state, created_at
    `;
    return NextResponse.json({ success: true, data: faceRow, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (resource === "auth" && route[1] === "register") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const displayName = typeof body.name === "string" ? body.name.trim() : "";
    const organisationName = typeof body.organisation === "string" ? body.organisation.trim() : "";
    if (!email || password.length < 8 || !displayName || !organisationName) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Provide a work email, a password of at least 8 characters, your name and a workspace name." }, { status: 422 });
    }
    const baseSlug = organisationName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
    const passwordHash = await hashPassword(password);
    try {
      const result = await sql.begin(async (tx) => {
        let organisation: { id: string; name: string; slug: string } | undefined;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomUUID().slice(0, 6)}`;
          try {
            [organisation] = await tx`INSERT INTO organisations (name, slug) VALUES (${organisationName}, ${slug}) RETURNING id, name, slug`;
            break;
          } catch (error) {
            if (!(error instanceof Error) || !("code" in error) || (error as { code?: string }).code !== "23505") throw error;
          }
        }
        if (!organisation) throw new Error("Could not allocate a unique workspace slug.");
        const [user] = await tx`INSERT INTO users (organisation_id, email, display_name, role, password_hash) VALUES (${organisation.id}, ${email}, ${displayName}, 'owner', ${passwordHash}) RETURNING id`;
        return { organisationId: organisation.id as string, userId: user.id as string };
      });
      const token = await createSession(result.userId, result.organisationId, request.headers.get("user-agent"));
      const res = NextResponse.json({ success: true, data: { redirect: "/studio" }, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
      res.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
      return res;
    } catch (error) {
      console.error("[auth/register]", error);
      return NextResponse.json({ success: false, code: "REGISTRATION_FAILED", message: "Registration could not be completed. Try again shortly." }, { status: 500 });
    }
  }

  if (resource === "auth" && route[1] === "login") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Enter your email and password." }, { status: 422 });
    }
    // Runs before any organisation context is known, so this relies on the app's DB role
    // having BYPASSRLS — tenant isolation elsewhere is enforced by explicit organisation_id
    // filters, not RLS, for exactly this reason. Same email can exist under multiple
    // organisations (schema allows it); the most recently active match wins.
    const candidates = await sql<{ id: string; organisation_id: string; password_hash: string | null }[]>`
      SELECT id, organisation_id, password_hash FROM users WHERE email = ${email} ORDER BY last_login_at DESC NULLS LAST, created_at DESC
    `;
    const candidate = candidates[0];
    if (!candidate || !candidate.password_hash) {
      return NextResponse.json({ success: false, code: "INVALID_CREDENTIALS", message: "Incorrect email or password." }, { status: 401 });
    }
    if (await isLockedOut(candidate.id)) {
      return NextResponse.json({ success: false, code: "ACCOUNT_LOCKED", message: "Too many failed attempts. Try again in a few minutes." }, { status: 423 });
    }
    const valid = await verifyPassword(password, candidate.password_hash);
    if (!valid) {
      await recordFailedLogin(candidate.id);
      return NextResponse.json({ success: false, code: "INVALID_CREDENTIALS", message: "Incorrect email or password." }, { status: 401 });
    }
    await resetFailedLogins(candidate.id);
    const token = await createSession(candidate.id, candidate.organisation_id, request.headers.get("user-agent"));
    const res = NextResponse.json({ success: true, data: { redirect: "/studio" }, meta: { mode: "live", request_id: randomUUID() } });
    res.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    return res;
  }

  if (resource === "auth" && route[1] === "logout") {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (token) await destroySession(token);
    const res = NextResponse.json({ success: true, data: { redirect: "/" }, meta: { mode: "live", request_id: randomUUID() } });
    res.cookies.set(SESSION_COOKIE_NAME, "", sessionCookieOptions(0));
    return res;
  }

  if (resource === "sessions" && !route[1] && typeof body.digital_human_id === "string") {
    const proxied = await proxyToGateway("/api/v1/sessions/interview-practice", {
      candidate_reference: randomUUID(),
      digital_human_id: slugToUuid(body.digital_human_id),
      mode: body.mode ?? "guided",
      job_context: body.job_context ?? body.context,
      transcript_consent: Boolean(body.transcript_consent ?? body.consent),
      recording_consent: Boolean(body.recording_consent ?? body.consent),
    });
    if (proxied) return NextResponse.json({ success: true, data: proxied.data, meta: { mode: "live", request_id: randomUUID() } }, { status: proxied.status, headers: { "x-vowhumans-mode": "live" } });
  }

  if (resource === "voices" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const language = typeof body.language === "string" ? body.language.trim() : "English (South Africa)";
    const providerVoiceId = typeof body.provider_voice_id === "string" ? body.provider_voice_id : "";
    if (!name || !OPENAI_TTS_VOICES.has(providerVoiceId)) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Provide a name and choose a valid provider voice." }, { status: 422 });
    }
    const [voiceRow] = await sql`
      INSERT INTO voices (organisation_id, name, provider, provider_voice_id, language, is_custom, state)
      VALUES (${organisationId}, ${name}, 'openai', ${providerVoiceId}, ${language}, false, 'active')
      RETURNING id, name, provider, provider_voice_id, language, is_custom, state, created_at
    `;
    return NextResponse.json({ success: true, data: voiceRow, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
  }

  if (resource === "voice-assignments" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const humanSlug = typeof body.human_slug === "string" ? body.human_slug : "";
    const voiceId = typeof body.voice_id === "string" ? body.voice_id : null;
    if (!humanSlug) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "human_slug is required." }, { status: 422 });
    if (voiceId) {
      await sql`
        INSERT INTO human_voice_assignments (organisation_id, human_slug, voice_id) VALUES (${organisationId}, ${humanSlug}, ${voiceId})
        ON CONFLICT (organisation_id, human_slug) DO UPDATE SET voice_id = EXCLUDED.voice_id, assigned_at = now()
      `;
    } else {
      await sql`DELETE FROM human_voice_assignments WHERE organisation_id = ${organisationId} AND human_slug = ${humanSlug}`;
    }
    return NextResponse.json({ success: true, data: { human_slug: humanSlug, voice_id: voiceId }, meta: { mode: "live", request_id: randomUUID() } });
  }

  if (resource === "faces" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt || prompt.length < 10) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Describe the face you want generated (at least 10 characters)." }, { status: 422 });
    }
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ success: false, code: "PROVIDER_DISABLED", message: "OpenAI is not configured." }, { status: 503 });
    const disclosedPrompt = `Professional headshot portrait photo, original fictional person (not a real or public individual), ${prompt}. Neutral studio background, forward-facing, natural lighting, photorealistic.`;
    const upstream = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "gpt-image-1", prompt: disclosedPrompt, n: 1, size: "1024x1024", quality: "low" }),
      signal: AbortSignal.timeout(60000),
    });
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      return NextResponse.json({ success: false, code: "GENERATION_FAILED", message: detail.slice(0, 300) || "Could not generate this face." }, { status: 502 });
    }
    const generated = await upstream.json() as { data?: { b64_json?: string }[] };
    const b64 = generated.data?.[0]?.b64_json;
    if (!b64) return NextResponse.json({ success: false, code: "GENERATION_FAILED", message: "The provider returned no image." }, { status: 502 });
    const bytes = Buffer.from(b64, "base64");
    const objectKey = `face-${randomUUID()}`;
    await sql`INSERT INTO media_blobs (object_key, organisation_id, mime_type, data, size_bytes) VALUES (${objectKey}, ${organisationId}, 'image/png', ${bytes}, ${bytes.length})`;
    const [faceRow] = await sql`
      INSERT INTO face_assets (organisation_id, object_key, sha256, media_type, provenance, detector_provider, preprocessing_state, state)
      VALUES (${organisationId}, ${objectKey}, ${createHash("sha256").update(bytes).digest("hex")}, 'image/png', ${JSON.stringify({ source: "openai-generated", prompt })}::jsonb, 'gpt-image-1', 'ready', 'active')
      RETURNING id, media_type, detector_provider, preprocessing_state, state, created_at
    `;
    return NextResponse.json({ success: true, data: faceRow, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
  }

  if (resource === "face-assignments" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const humanSlug = typeof body.human_slug === "string" ? body.human_slug : "";
    const faceAssetId = typeof body.face_asset_id === "string" ? body.face_asset_id : null;
    if (!humanSlug) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "human_slug is required." }, { status: 422 });
    if (faceAssetId) {
      await sql`
        INSERT INTO human_face_assignments (organisation_id, human_slug, face_asset_id) VALUES (${organisationId}, ${humanSlug}, ${faceAssetId})
        ON CONFLICT (organisation_id, human_slug) DO UPDATE SET face_asset_id = EXCLUDED.face_asset_id, assigned_at = now()
      `;
    } else {
      await sql`DELETE FROM human_face_assignments WHERE organisation_id = ${organisationId} AND human_slug = ${humanSlug}`;
    }
    return NextResponse.json({ success: true, data: { human_slug: humanSlug, face_asset_id: faceAssetId }, meta: { mode: "live", request_id: randomUUID() } });
  }

  if (resource === "gesture-profiles" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const featuresInput = (body.features && typeof body.features === "object" ? body.features : {}) as Record<string, { enabled?: boolean; range?: string }>;
    if (!name) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Give the gesture profile a name." }, { status: 422 });
    const features: Record<string, { enabled: boolean; range: string }> = {};
    for (const key of Object.keys(GESTURE_FEATURES)) {
      const input = featuresInput[key];
      features[key] = { enabled: input ? Boolean(input.enabled) : GESTURE_FEATURES[key].defaultEnabled, range: typeof input?.range === "string" ? input.range : GESTURE_FEATURES[key].defaultRange };
    }
    const [profileRow] = await sql`
      INSERT INTO gesture_profiles (organisation_id, name, state, state_config)
      VALUES (${organisationId}, ${name}, 'active', ${JSON.stringify({ features })}::jsonb)
      RETURNING id, name, state, state_config, created_at
    `;
    return NextResponse.json({ success: true, data: { ...profileRow, state_config: { features } }, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
  }

  if (resource === "gesture-assignments" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const humanSlug = typeof body.human_slug === "string" ? body.human_slug : "";
    const gestureProfileId = typeof body.gesture_profile_id === "string" ? body.gesture_profile_id : null;
    if (!humanSlug) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "human_slug is required." }, { status: 422 });
    if (gestureProfileId) {
      await sql`
        INSERT INTO human_gesture_assignments (organisation_id, human_slug, gesture_profile_id) VALUES (${organisationId}, ${humanSlug}, ${gestureProfileId})
        ON CONFLICT (organisation_id, human_slug) DO UPDATE SET gesture_profile_id = EXCLUDED.gesture_profile_id, assigned_at = now()
      `;
    } else {
      await sql`DELETE FROM human_gesture_assignments WHERE organisation_id = ${organisationId} AND human_slug = ${humanSlug}`;
    }
    return NextResponse.json({ success: true, data: { human_slug: humanSlug, gesture_profile_id: gestureProfileId }, meta: { mode: "live", request_id: randomUUID() } });
  }

  if (resource === "livekit") {
    const proxied = await proxyToGateway("/api/v1/livekit/token", {
      session_id: body.session_id,
      participant_identity: body.participant_identity ?? `guest-${randomUUID().slice(0, 8)}`,
    });
    if (proxied) return NextResponse.json({ success: true, data: proxied.data, meta: { mode: "live", request_id: randomUUID() } }, { status: proxied.status, headers: { "x-vowhumans-mode": "live" } });
    return NextResponse.json({ success: false, code: "PROVIDER_DISABLED", message: "LiveKit tokens are issued only by the configured server-side API gateway." }, { status: 503 });
  }

  const isPublicRequest=resource.endsWith("-requests") || (resource === "organisations" && !request.headers.get("authorization"));
  return response({ id: randomUUID(), resource, state: isPublicRequest ? "validated-preview" : "draft", persistent: false, message: "Validated in safe preview. Configure the production API to persist and deliver this request.", received_fields: Object.keys(body as object).filter(key=>!key.toLowerCase().includes("password")), disclosure_required: true }, isPublicRequest ? 202 : 201);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ route: string[] }> }) {
  const { route } = await params;
  if (route[0] === "voices" && route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const [deleted] = await sql<{ settings: unknown }[]>`
      DELETE FROM voices WHERE id = ${route[1]} AND organisation_id = ${organisationId} RETURNING settings
    `;
    const objectKey = deleted ? audioObjectKeyFromSettings(deleted.settings) : null;
    if (objectKey) await sql`DELETE FROM media_blobs WHERE object_key = ${objectKey} AND organisation_id = ${organisationId}`;
    return response({ id: route[1], deleted: Boolean(deleted) }, 202);
  }
  if (route[0] === "faces" && route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const [deleted] = await sql<{ object_key: string }[]>`
      DELETE FROM face_assets WHERE id = ${route[1]} AND organisation_id = ${organisationId} RETURNING object_key
    `;
    if (deleted) await sql`DELETE FROM media_blobs WHERE object_key = ${deleted.object_key} AND organisation_id = ${organisationId}`;
    return response({ id: route[1], deleted: Boolean(deleted) }, 202);
  }
  if (route[0] === "gesture-profiles" && route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const [deleted] = await sql`DELETE FROM gesture_profiles WHERE id = ${route[1]} AND organisation_id = ${organisationId} RETURNING id`;
    return response({ id: route[1], deleted: Boolean(deleted) }, 202);
  }
  if (route[0] !== "sessions") return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
  return response({ id: route[1] ?? null, deletion: "mock-queued", private_content_included: false }, 202);
}
