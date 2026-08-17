import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse, after } from "next/server";
import { academyCourses, integrations, templates } from "@/data/commercial";
import { plans } from "@vowhumans/commercial-core";
import sql from "@/lib/db";
import { SESSION_COOKIE_NAME, createSession, destroySession, hashPassword, isLockedOut, readSession, recordFailedLogin, resetFailedLogins, sessionCookieOptions, verifyPassword } from "@/lib/auth";
import { EMBEDDING_MODEL, chatComplete, embedBatch } from "@/lib/openai";
import { chunkText, extractText, fetchWebsiteText, retrieveChunks } from "@/lib/ingest";

const allowedResources = new Set(["auth","organisations","workspaces","users","consents","digital-humans","identities","voices","voice-assignments","faces","face-assignments","gesture-profiles","gesture-assignments","personas","persona-versions","persona-assignments","guardrails","knowledge","knowledge-bases","knowledge-documents","knowledge-assignments","sessions","livekit","presenter-projects","renders","applications","digital-human-applications","integrations","templates","marketplace","academy","partners","notifications","support-requests","sales-requests","demo-requests","contact-requests","signup-requests","signin-requests","partner-requests","investor-requests","trust-requests","billing","plans","analytics","api-keys","webhooks","usage","health"]);

const OPENAI_TTS_VOICES = new Set(["alloy","ash","ballad","coral","echo","fable","onyx","nova","sage","shimmer","verse","marin","cedar"]);
const VOICE_SAMPLE_TEXT = "Hello, I'm demonstrating this voice for VowHumans. This sample plays through your organisation's own OpenAI account.";

// Seeded onto every newly created persona (blank or AI-generated) so the editor's
// guardrail toggles are never empty — mirrors the three static chips the old mock UI
// always showed, but now as real, per-persona, editable rows.
const DEFAULT_GUARDRAILS = [
  { code: "no_employer_access", instruction: "Never share candidate or learner responses with employers or third parties without explicit consent.", enforcement: "prompt" },
  { code: "no_appearance_scoring", instruction: "Never evaluate or comment on a person's physical appearance.", enforcement: "prompt" },
  { code: "disclose_ai", instruction: "Always disclose that you are an AI-generated digital human when asked or at the start of a session.", enforcement: "prompt" },
];

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

// Gives proxyToGateway's 40s upstream timeout room to complete, gives after()-deferred
// knowledge ingestion (which shares this same budget) room for an embeddings call plus
// per-chunk inserts, and — the largest consumer — sits above lib/openai.ts's own
// 110s chatComplete timeout so a genuinely slow model response surfaces as an honest
// upstream timeout instead of this function budget cutting it off first. If the actual
// Vercel plan's ceiling is lower, Vercel clamps this down automatically; harmless either way.
export const maxDuration = 120;

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

// Records why an ingestion attempt didn't finish, using the already-existing (and
// otherwise unused-by-us) access_policy column rather than adding another migration.
// Without this, a failure (bad API key, rate limit, malformed upload) left a document
// silently stuck in 'draft' forever with the UI reporting "Indexing…" indefinitely.
async function markIngestFailed(organisationId: string, documentId: string, message: string) {
  await sql`
    UPDATE knowledge_documents SET access_policy = ${JSON.stringify({ ingest_error: message.slice(0, 500) })}::jsonb
    WHERE id = ${documentId} AND organisation_id = ${organisationId}
  `.catch((err) => console.error("[knowledge-ingest] could not record failure:", err));
}

// Shared tail of every ingestion path (upload / website / AI-generated): chunk the
// extracted text, embed each chunk, store it, then flip the document live. Runs inside
// after() so the upload response returns immediately — a document sits in 'draft'
// until this completes, which the frontend polls for.
async function storeChunks(organisationId: string, documentId: string, text: string) {
  const chunks = chunkText(text);
  if (chunks.length === 0) {
    await sql`UPDATE knowledge_documents SET state = 'active' WHERE id = ${documentId} AND organisation_id = ${organisationId}`;
    return;
  }
  const embedded = await embedBatch(chunks);
  if (!embedded.ok) {
    await markIngestFailed(organisationId, documentId, embedded.message);
    return;
  }
  for (let i = 0; i < chunks.length; i += 1) {
    const vector = `[${embedded.data[i].join(",")}]`;
    await sql`
      INSERT INTO knowledge_chunks (organisation_id, document_id, ordinal, content, embedding_provider, embedding_model, embedding, citation)
      VALUES (${organisationId}, ${documentId}, ${i}, ${chunks[i]}, 'openai', ${EMBEDDING_MODEL}, ${vector}::vector, ${JSON.stringify({ ordinal: i })}::jsonb)
    `;
  }
  await sql`UPDATE knowledge_documents SET state = 'active' WHERE id = ${documentId} AND organisation_id = ${organisationId}`;
}

async function ingestUploadedDocument(organisationId: string, documentId: string, bytes: Buffer, sourceType: string) {
  try {
    const text = await extractText(bytes, sourceType);
    await storeChunks(organisationId, documentId, text);
  } catch (err) {
    console.error("[knowledge-ingest:upload]", err);
    await markIngestFailed(organisationId, documentId, err instanceof Error ? err.message : "Could not process this document.");
  }
}

async function ingestWebsiteDocument(organisationId: string, documentId: string, url: string) {
  try {
    const text = await fetchWebsiteText(url);
    await storeChunks(organisationId, documentId, text);
  } catch (err) {
    console.error("[knowledge-ingest:website]", err);
    await markIngestFailed(organisationId, documentId, err instanceof Error ? err.message : "Could not import this page.");
  }
}

async function ingestGeneratedDocument(organisationId: string, documentId: string, precomposedContent: string) {
  try {
    await storeChunks(organisationId, documentId, precomposedContent);
  } catch (err) {
    console.error("[knowledge-ingest:generated]", err);
    await markIngestFailed(organisationId, documentId, err instanceof Error ? err.message : "Could not index this article.");
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

  // Profile aggregate for one digital human — the 5 assignment tables (voice/face/
  // gesture/knowledge/persona) key on human_slug text, not a real FK, so a real digital
  // human's id just flows through them the same way the 5 static demo humans' string
  // ids already do. The 5 demo humans themselves are never served from here — they're
  // static and public, the client reads them straight from data/platform.ts.
  if (resource === "digital-humans" && route[1] && !route[2]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const [human] = await sql`SELECT id, name, role, disclosure, state, created_at, updated_at FROM digital_humans WHERE id = ${route[1]} AND organisation_id = ${organisationId}`;
    if (!human) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    const [[face], [voice], [gestureRow], [persona], knowledgeBases] = await Promise.all([
      sql`SELECT fa.id, fa.media_type, fa.detector_provider, fa.preprocessing_state, fa.state FROM human_face_assignments hfa JOIN face_assets fa ON fa.id = hfa.face_asset_id WHERE hfa.organisation_id = ${organisationId} AND hfa.human_slug = ${route[1]}`,
      sql`SELECT v.id, v.name, v.provider, v.provider_voice_id, v.language, v.is_custom FROM human_voice_assignments hva JOIN voices v ON v.id = hva.voice_id WHERE hva.organisation_id = ${organisationId} AND hva.human_slug = ${route[1]}`,
      sql`SELECT gp.id, gp.name, gp.state_config FROM human_gesture_assignments hga JOIN gesture_profiles gp ON gp.id = hga.gesture_profile_id WHERE hga.organisation_id = ${organisationId} AND hga.human_slug = ${route[1]}`,
      sql`SELECT p.id AS persona_id, p.name AS persona_name, pv.id AS version_id, pv.version, pv.role, pv.state FROM human_persona_assignments hpa JOIN persona_versions pv ON pv.id = hpa.persona_version_id JOIN personas p ON p.id = pv.persona_id WHERE hpa.organisation_id = ${organisationId} AND hpa.human_slug = ${route[1]}`,
      sql`SELECT kb.id, kb.name FROM human_knowledge_assignments hka JOIN knowledge_bases kb ON kb.id = hka.knowledge_base_id WHERE hka.organisation_id = ${organisationId} AND hka.human_slug = ${route[1]}`,
    ]);
    const gestureProfile = gestureRow ? { ...gestureRow, state_config: typeof gestureRow.state_config === "string" ? JSON.parse(gestureRow.state_config) : gestureRow.state_config } : null;
    return response({ human, face: face ?? null, voice: voice ?? null, gesture_profile: gestureProfile, persona: persona ?? null, knowledge_bases: knowledgeBases });
  }

  if (resource === "digital-humans" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const rows = await sql`SELECT id, name, role, disclosure, state, created_at, updated_at FROM digital_humans WHERE organisation_id = ${organisationId} ORDER BY created_at DESC`;
    return response({ items: rows });
  }

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
  if (resource === "knowledge-bases" && route[1] && !route[2]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const [base] = await sql`SELECT id, name, description, state, created_at FROM knowledge_bases WHERE id = ${route[1]} AND organisation_id = ${organisationId}`;
    if (!base) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    const documentRows = await sql`
      SELECT d.id, d.title, d.source_type, d.approved_url, d.state, d.language, d.created_at, d.access_policy, COUNT(c.id)::int AS chunk_count
      FROM knowledge_documents d LEFT JOIN knowledge_chunks c ON c.document_id = d.id
      WHERE d.knowledge_base_id = ${route[1]} AND d.organisation_id = ${organisationId} AND d.deleted_at IS NULL
      GROUP BY d.id ORDER BY d.created_at DESC
    `;
    // postgres.js returns jsonb columns as raw text, not pre-parsed objects.
    const documents = documentRows.map((row) => ({ ...row, access_policy: typeof row.access_policy === "string" ? JSON.parse(row.access_policy) : row.access_policy }));
    return response({ base, documents });
  }

  if (resource === "knowledge-bases" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const rows = await sql`
      SELECT b.id, b.name, b.description, b.state, b.created_at,
        COUNT(DISTINCT d.id)::int AS document_count,
        COUNT(c.id)::int AS chunk_count,
        COUNT(DISTINCT d.language) FILTER (WHERE d.language IS NOT NULL)::int AS language_count
      FROM knowledge_bases b
      LEFT JOIN knowledge_documents d ON d.knowledge_base_id = b.id AND d.deleted_at IS NULL
      LEFT JOIN knowledge_chunks c ON c.document_id = d.id
      WHERE b.organisation_id = ${organisationId}
      GROUP BY b.id ORDER BY b.created_at DESC
    `;
    return response({ items: rows });
  }

  if (resource === "knowledge-assignments" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const rows = await sql`SELECT human_slug, knowledge_base_id FROM human_knowledge_assignments WHERE organisation_id = ${organisationId}`;
    return response({ items: rows });
  }

  if (resource === "personas" && route[1] && !route[2]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const [persona] = await sql`SELECT id, name, description, created_at FROM personas WHERE id = ${route[1]} AND organisation_id = ${organisationId}`;
    if (!persona) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    const versions = await sql`SELECT * FROM persona_versions WHERE persona_id = ${route[1]} AND organisation_id = ${organisationId} ORDER BY version DESC`;
    const guardrails = await sql`SELECT id, code, instruction, enforcement FROM guardrails WHERE persona_id = ${route[1]} AND organisation_id = ${organisationId} ORDER BY created_at`;
    return response({ persona, versions, guardrails });
  }

  if (resource === "personas" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const rows = await sql`
      SELECT DISTINCT ON (p.id) p.id, p.name, p.description, p.created_at,
        pv.id AS version_id, pv.version, pv.state, pv.role, pv.conversation_style, pv.opening_message,
        pv.language, pv.speaking_rate, pv.max_response_words, pv.knowledge_base_ids, pv.published_at
      FROM personas p
      LEFT JOIN persona_versions pv ON pv.persona_id = p.id AND pv.organisation_id = p.organisation_id
      WHERE p.organisation_id = ${organisationId}
      ORDER BY p.id, pv.version DESC NULLS LAST
    `;
    return response({ items: rows });
  }

  if (resource === "persona-assignments" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const rows = await sql`
      SELECT a.human_slug, a.persona_version_id, pv.persona_id, pv.version, p.name AS persona_name
      FROM human_persona_assignments a
      JOIN persona_versions pv ON pv.id = a.persona_version_id
      JOIN personas p ON p.id = pv.persona_id
      WHERE a.organisation_id = ${organisationId}
    `;
    return response({ items: rows });
  }

  if (resource === "applications" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const rows = await sql`SELECT id, name, slug, status, settings, created_at FROM applications WHERE organisation_id = ${organisationId} ORDER BY created_at DESC`;
    return response({ items: rows });
  }

  if (resource === "digital-human-applications" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const rows = await sql`
      SELECT dha.digital_human_id, dha.application_id, a.name AS application_name, a.slug AS application_slug, dha.persona_version_id, dha.enabled
      FROM digital_human_applications dha JOIN applications a ON a.id = dha.application_id
      WHERE dha.organisation_id = ${organisationId}
    `;
    return response({ items: rows });
  }
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
    if (!name || !(file instanceof Blob) || file.size === 0 || !file.type.startsWith("audio/")) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Provide a name and an audio file." }, { status: 422 });
    }
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Audio file must be 4MB or smaller." }, { status: 422 });
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
    if (!(file instanceof Blob) || file.size === 0 || !file.type.startsWith("image/")) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Choose an image file." }, { status: 422 });
    }
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Image file must be 4MB or smaller." }, { status: 422 });
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

  if (resource === "knowledge-documents" && !route[1] && (request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const form = await request.formData();
    const knowledgeBaseId = String(form.get("knowledge_base_id") ?? "").trim();
    const title = String(form.get("title") ?? "").trim();
    const language = String(form.get("language") ?? "").trim() || null;
    const file = form.get("file");
    if (!knowledgeBaseId || !(file instanceof Blob) || file.size === 0) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Choose a knowledge base and a file." }, { status: 422 });
    }
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "File must be 4MB or smaller." }, { status: 422 });
    }
    const [base] = await sql`SELECT id FROM knowledge_bases WHERE id = ${knowledgeBaseId} AND organisation_id = ${organisationId}`;
    if (!base) return NextResponse.json({ success: false, code: "NOT_FOUND", message: "Knowledge base not found." }, { status: 404 });
    const filename = file instanceof File ? file.name : "document";
    const ext = filename.toLowerCase().split(".").pop() ?? "";
    const sourceType = ext === "pdf" ? "pdf" : ext === "docx" ? "docx" : ext === "xlsx" || ext === "xls" ? "xlsx" : ext === "md" || ext === "markdown" ? "markdown" : "text";
    const bytes = Buffer.from(await file.arrayBuffer());
    const objectKey = `knowledge-${randomUUID()}`;
    await sql`INSERT INTO media_blobs (object_key, organisation_id, mime_type, data, size_bytes) VALUES (${objectKey}, ${organisationId}, ${file.type || "application/octet-stream"}, ${bytes}, ${bytes.length})`;
    const [docRow] = await sql`
      INSERT INTO knowledge_documents (organisation_id, knowledge_base_id, title, source_type, object_key, sha256, language, state)
      VALUES (${organisationId}, ${knowledgeBaseId}, ${title || filename}, ${sourceType}, ${objectKey}, ${createHash("sha256").update(bytes).digest("hex")}, ${language}, 'draft')
      RETURNING id, title, source_type, state, language, created_at
    `;
    after(() => ingestUploadedDocument(organisationId, docRow.id, bytes, sourceType));
    return NextResponse.json({ success: true, data: docRow, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
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

  if (resource === "digital-humans" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const role = typeof body.role === "string" ? body.role.trim() : "";
    if (!name || !role) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Give this VowHuman a name and a role." }, { status: 422 });
    const disclosure = typeof body.disclosure === "string" && body.disclosure.trim() ? body.disclosure.trim() : "AI-generated digital human. Not a real person.";
    const [humanRow] = await sql`
      INSERT INTO digital_humans (organisation_id, name, role, disclosure)
      VALUES (${organisationId}, ${name}, ${role}, ${disclosure})
      RETURNING id, name, role, disclosure, state, created_at, updated_at
    `;
    return NextResponse.json({ success: true, data: humanRow, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
  }

  if (resource === "applications" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Give the application a name." }, { status: 422 });
    const requestedSlug = typeof body.slug === "string" && body.slug.trim() ? body.slug.trim() : name;
    const baseSlug = requestedSlug.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "application";
    let applicationRow: { id: string; name: string; slug: string; status: string; settings: unknown; created_at: string } | undefined;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomUUID().slice(0, 6)}`;
      try {
        [applicationRow] = await sql`
          INSERT INTO applications (organisation_id, name, slug) VALUES (${organisationId}, ${name}, ${slug})
          RETURNING id, name, slug, status, settings, created_at
        `;
        break;
      } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || (error as { code?: string }).code !== "23505") throw error;
      }
    }
    if (!applicationRow) return NextResponse.json({ success: false, code: "SLUG_CONFLICT", message: "Could not allocate a unique application slug." }, { status: 500 });
    return NextResponse.json({ success: true, data: applicationRow, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
  }

  if (resource === "digital-human-applications" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const digitalHumanId = typeof body.digital_human_id === "string" ? body.digital_human_id : "";
    const applicationId = typeof body.application_id === "string" ? body.application_id : "";
    const enabled = Boolean(body.enabled);
    if (!digitalHumanId || !applicationId) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "digital_human_id and application_id are required." }, { status: 422 });
    }
    if (!enabled) {
      await sql`UPDATE digital_human_applications SET enabled = false WHERE organisation_id = ${organisationId} AND digital_human_id = ${digitalHumanId} AND application_id = ${applicationId}`;
      return NextResponse.json({ success: true, data: { digital_human_id: digitalHumanId, application_id: applicationId, enabled: false }, meta: { mode: "live", request_id: randomUUID() } });
    }
    // Every application enablement pins to whichever persona version is currently
    // published — never an editable draft, since that's the one immutability
    // guarantee the rest of this app already makes about published personas.
    const [publishedVersion] = await sql<{ id: string }[]>`
      SELECT pv.id FROM human_persona_assignments hpa JOIN persona_versions pv ON pv.id = hpa.persona_version_id
      WHERE hpa.organisation_id = ${organisationId} AND hpa.human_slug = ${digitalHumanId} AND pv.state = 'published'
    `;
    if (!publishedVersion) {
      return NextResponse.json({ success: false, code: "PERSONA_NOT_PUBLISHED", message: "Publish this VowHuman's persona before enabling it for an application." }, { status: 409 });
    }
    const [row] = await sql`
      INSERT INTO digital_human_applications (organisation_id, digital_human_id, application_id, persona_version_id, enabled)
      VALUES (${organisationId}, ${digitalHumanId}, ${applicationId}, ${publishedVersion.id}, true)
      ON CONFLICT (digital_human_id, application_id) DO UPDATE SET enabled = true, persona_version_id = EXCLUDED.persona_version_id
      RETURNING digital_human_id, application_id, persona_version_id, enabled
    `;
    return NextResponse.json({ success: true, data: row, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
  }

  // Generates the article text synchronously and returns it without writing anything —
  // lets the user review it in the UI before committing. Also keeps the slow chatComplete
  // call out of the after()-deferred background job entirely, so that job (now just
  // embedding + inserts) comfortably fits the maxDuration budget instead of risking the
  // combined chat+embed latency exceeding it and leaving a document stuck in 'draft' forever.
  if (resource === "knowledge-documents" && route[1] === "preview") {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const topic = typeof body.topic === "string" ? body.topic.trim() : "";
    if (!topic || topic.length < 5) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Describe the topic, skill or expertise to generate (at least 5 characters)." }, { status: 422 });
    }
    const generated = await chatComplete({
      system: "You are a meticulous subject-matter expert writing an internal knowledge-base article for an AI assistant to reference. Write clearly, factually and comprehensively in well-structured prose with headings. Do not invent statistics, citations or sources.",
      messages: [{ role: "user", content: `Write a thorough knowledge-base article covering: ${topic}` }],
      maxOutputTokens: 4000,
      reasoningEffort: "none",
    });
    if (!generated.ok) return NextResponse.json({ success: false, code: generated.code, message: generated.message }, { status: generated.status });
    return NextResponse.json({ success: true, data: { content: generated.data }, meta: { mode: "live", request_id: randomUUID() } });
  }

  if (resource === "knowledge-documents" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const knowledgeBaseId = typeof body.knowledge_base_id === "string" ? body.knowledge_base_id : "";
    const sourceType = typeof body.source_type === "string" ? body.source_type : "";
    if (!knowledgeBaseId || (sourceType !== "website" && sourceType !== "generated")) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Provide a knowledge base and a valid source type." }, { status: 422 });
    }
    const [base] = await sql`SELECT id FROM knowledge_bases WHERE id = ${knowledgeBaseId} AND organisation_id = ${organisationId}`;
    if (!base) return NextResponse.json({ success: false, code: "NOT_FOUND", message: "Knowledge base not found." }, { status: 404 });

    if (sourceType === "website") {
      const url = typeof body.url === "string" ? body.url.trim() : "";
      if (!url) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Provide a URL." }, { status: 422 });
      const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : url;
      const [docRow] = await sql`
        INSERT INTO knowledge_documents (organisation_id, knowledge_base_id, title, source_type, approved_url, state)
        VALUES (${organisationId}, ${knowledgeBaseId}, ${title}, 'website', ${url}, 'draft')
        RETURNING id, title, source_type, state, language, created_at
      `;
      after(() => ingestWebsiteDocument(organisationId, docRow.id, url));
      return NextResponse.json({ success: true, data: docRow, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
    }

    const content = typeof body.content === "string" ? body.content.trim() : "";
    const topic = typeof body.topic === "string" ? body.topic.trim() : "";
    if (!content) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Generate a preview before adding this source." }, { status: 422 });
    }
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : (topic || content.slice(0, 80));
    const [docRow] = await sql`
      INSERT INTO knowledge_documents (organisation_id, knowledge_base_id, title, source_type, language, state)
      VALUES (${organisationId}, ${knowledgeBaseId}, ${title}, 'generated', 'en-ZA', 'draft')
      RETURNING id, title, source_type, state, language, created_at
    `;
    after(() => ingestGeneratedDocument(organisationId, docRow.id, content));
    return NextResponse.json({ success: true, data: docRow, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
  }

  if (resource === "knowledge-bases" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (!name) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Give the knowledge base a name." }, { status: 422 });
    const [baseRow] = await sql`
      INSERT INTO knowledge_bases (organisation_id, name, description, state)
      VALUES (${organisationId}, ${name}, ${description}, 'active')
      RETURNING id, name, description, state, created_at
    `;
    return NextResponse.json({ success: true, data: baseRow, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
  }

  if (resource === "knowledge-assignments" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const humanSlug = typeof body.human_slug === "string" ? body.human_slug : "";
    const knowledgeBaseId = typeof body.knowledge_base_id === "string" ? body.knowledge_base_id : "";
    const assigned = Boolean(body.assigned);
    if (!humanSlug || !knowledgeBaseId) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "human_slug and knowledge_base_id are required." }, { status: 422 });
    if (assigned) {
      await sql`
        INSERT INTO human_knowledge_assignments (organisation_id, human_slug, knowledge_base_id) VALUES (${organisationId}, ${humanSlug}, ${knowledgeBaseId})
        ON CONFLICT (organisation_id, human_slug, knowledge_base_id) DO NOTHING
      `;
    } else {
      await sql`DELETE FROM human_knowledge_assignments WHERE organisation_id = ${organisationId} AND human_slug = ${humanSlug} AND knowledge_base_id = ${knowledgeBaseId}`;
    }
    return NextResponse.json({ success: true, data: { human_slug: humanSlug, knowledge_base_id: knowledgeBaseId, assigned }, meta: { mode: "live", request_id: randomUUID() } });
  }

  if (resource === "personas" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const mode = body.mode === "generate" || body.mode === "duplicate" ? body.mode : "blank";
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Give the persona a name." }, { status: 422 });

    if (mode === "duplicate") {
      const sourcePersonaId = typeof body.source_persona_id === "string" ? body.source_persona_id : "";
      const [source] = await sql`SELECT * FROM persona_versions WHERE persona_id = ${sourcePersonaId} AND organisation_id = ${organisationId} ORDER BY version DESC LIMIT 1`;
      if (!source) return NextResponse.json({ success: false, code: "NOT_FOUND", message: "Source persona not found." }, { status: 404 });
      const sourceGuardrails = await sql`SELECT code, instruction, enforcement FROM guardrails WHERE persona_id = ${sourcePersonaId} AND organisation_id = ${organisationId}`;
      const result = await sql.begin(async (tx) => {
        const [persona] = await tx`INSERT INTO personas (organisation_id, name, description) VALUES (${organisationId}, ${name}, ${typeof body.description === "string" ? body.description.trim() : ""}) RETURNING id, name, description, created_at`;
        const [version] = await tx`
          INSERT INTO persona_versions (organisation_id, persona_id, version, state, role, system_instructions, conversation_style, opening_message, language, speaking_rate, max_response_words, knowledge_base_ids)
          VALUES (${organisationId}, ${persona.id}, 1, 'draft', ${source.role}, ${source.system_instructions}, ${source.conversation_style}, ${source.opening_message}, ${source.language}, ${source.speaking_rate}, ${source.max_response_words}, ${source.knowledge_base_ids})
          RETURNING *
        `;
        for (const g of sourceGuardrails) await tx`INSERT INTO guardrails (organisation_id, persona_id, code, instruction, enforcement) VALUES (${organisationId}, ${persona.id}, ${g.code}, ${g.instruction}, ${g.enforcement})`;
        return { persona, version };
      });
      return NextResponse.json({ success: true, data: result, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
    }

    let role = typeof body.role === "string" ? body.role.trim() : "";
    let systemInstructions = "Be helpful, honest and concise. Always disclose that you are an AI-generated digital human.";
    let conversationStyle = "Warm, professional and concise";
    let openingMessage = "Hello, I'm an AI-generated assistant. How can I help today?";
    let language = "English (South Africa)";
    let speakingRate = 1;
    let maxResponseWords = 150;

    if (mode === "generate") {
      if (!role || role.length < 5) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Describe the VowHuman's role (at least 5 characters)." }, { status: 422 });
      const generated = await chatComplete({
        system: "You design conversational AI persona configurations for VowHumans, a platform for disclosed, consent-first AI digital humans. Given a role description, respond ONLY with a JSON object with keys: system_instructions (string, detailed behavioural instructions, including that the assistant must always disclose it is AI and never claim to be human), conversation_style (short string), opening_message (string), language (label like 'English (South Africa)'), max_response_words (integer 60-200), speaking_rate (number 0.85-1.15).",
        messages: [{ role: "user", content: `Role: ${role}` }],
        jsonMode: true,
        maxOutputTokens: 1500,
        reasoningEffort: "none",
      });
      if (!generated.ok) return NextResponse.json({ success: false, code: generated.code, message: generated.message }, { status: generated.status });
      try {
        const parsed = JSON.parse(generated.data) as Record<string, unknown>;
        systemInstructions = String(parsed.system_instructions ?? systemInstructions);
        conversationStyle = String(parsed.conversation_style ?? conversationStyle);
        openingMessage = String(parsed.opening_message ?? openingMessage);
        language = String(parsed.language ?? language);
        speakingRate = Number(parsed.speaking_rate) || speakingRate;
        maxResponseWords = Number(parsed.max_response_words) || maxResponseWords;
      } catch {
        return NextResponse.json({ success: false, code: "GENERATION_FAILED", message: "The model returned an unexpected format." }, { status: 502 });
      }
    } else if (!role) {
      role = "New role";
    }

    const result = await sql.begin(async (tx) => {
      const [persona] = await tx`INSERT INTO personas (organisation_id, name, description) VALUES (${organisationId}, ${name}, ${typeof body.description === "string" ? body.description.trim() : role}) RETURNING id, name, description, created_at`;
      const [version] = await tx`
        INSERT INTO persona_versions (organisation_id, persona_id, version, state, role, system_instructions, conversation_style, opening_message, language, speaking_rate, max_response_words)
        VALUES (${organisationId}, ${persona.id}, 1, 'draft', ${role}, ${systemInstructions}, ${conversationStyle}, ${openingMessage}, ${language}, ${speakingRate}, ${maxResponseWords})
        RETURNING *
      `;
      for (const g of DEFAULT_GUARDRAILS) await tx`INSERT INTO guardrails (organisation_id, persona_id, code, instruction, enforcement) VALUES (${organisationId}, ${persona.id}, ${g.code}, ${g.instruction}, ${g.enforcement})`;
      return { persona, version };
    });
    return NextResponse.json({ success: true, data: result, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
  }

  if (resource === "guardrails" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const personaId = typeof body.persona_id === "string" ? body.persona_id : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
    if (!personaId || !code || !instruction) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "persona_id, code and instruction are required." }, { status: 422 });
    }
    const [persona] = await sql`SELECT id FROM personas WHERE id = ${personaId} AND organisation_id = ${organisationId}`;
    if (!persona) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    const [row] = await sql`
      INSERT INTO guardrails (organisation_id, persona_id, code, instruction, enforcement) VALUES (${organisationId}, ${personaId}, ${code}, ${instruction}, 'prompt')
      RETURNING id, code, instruction, enforcement
    `;
    return NextResponse.json({ success: true, data: row, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
  }

  if (resource === "persona-versions" && route[1] && route[2] === "publish") {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const [version] = await sql`
      UPDATE persona_versions SET state = 'published', published_at = now()
      WHERE id = ${route[1]} AND organisation_id = ${organisationId} AND state = 'draft'
      RETURNING *
    `;
    if (!version) return NextResponse.json({ success: false, code: "CONFLICT", message: "Only a draft version can be published." }, { status: 409 });
    return NextResponse.json({ success: true, data: version, meta: { mode: "live", request_id: randomUUID() } });
  }

  if (resource === "persona-versions" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const personaId = typeof body.persona_id === "string" ? body.persona_id : "";
    if (!personaId) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "persona_id is required." }, { status: 422 });
    const [latest] = await sql`SELECT * FROM persona_versions WHERE persona_id = ${personaId} AND organisation_id = ${organisationId} ORDER BY version DESC LIMIT 1`;
    if (!latest) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    const pick = (key: string) => (key in body ? body[key] : undefined);
    const role = typeof pick("role") === "string" ? (pick("role") as string) : latest.role;
    const systemInstructions = typeof pick("system_instructions") === "string" ? (pick("system_instructions") as string) : latest.system_instructions;
    const conversationStyle = typeof pick("conversation_style") === "string" ? (pick("conversation_style") as string) : latest.conversation_style;
    const openingMessage = typeof pick("opening_message") === "string" ? (pick("opening_message") as string) : latest.opening_message;
    const language = typeof pick("language") === "string" ? (pick("language") as string) : latest.language;
    const speakingRate = typeof pick("speaking_rate") === "number" ? (pick("speaking_rate") as number) : latest.speaking_rate;
    const maxResponseWords = typeof pick("max_response_words") === "number" ? (pick("max_response_words") as number) : latest.max_response_words;
    const knowledgeBaseIds = Array.isArray(pick("knowledge_base_ids")) ? (pick("knowledge_base_ids") as string[]) : latest.knowledge_base_ids;
    const [version] = await sql`
      INSERT INTO persona_versions (organisation_id, persona_id, version, state, role, system_instructions, conversation_style, opening_message, language, speaking_rate, max_response_words, knowledge_base_ids)
      VALUES (${organisationId}, ${personaId}, ${latest.version + 1}, 'draft', ${role}, ${systemInstructions}, ${conversationStyle}, ${openingMessage}, ${language}, ${speakingRate}, ${maxResponseWords}, ${knowledgeBaseIds}::uuid[])
      RETURNING *
    `;
    return NextResponse.json({ success: true, data: version, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
  }

  if (resource === "persona-assignments" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const humanSlug = typeof body.human_slug === "string" ? body.human_slug : "";
    const personaVersionId = typeof body.persona_version_id === "string" ? body.persona_version_id : null;
    if (!humanSlug) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "human_slug is required." }, { status: 422 });
    if (personaVersionId) {
      await sql`
        INSERT INTO human_persona_assignments (organisation_id, human_slug, persona_version_id) VALUES (${organisationId}, ${humanSlug}, ${personaVersionId})
        ON CONFLICT (organisation_id, human_slug) DO UPDATE SET persona_version_id = EXCLUDED.persona_version_id, assigned_at = now()
      `;
    } else {
      await sql`DELETE FROM human_persona_assignments WHERE organisation_id = ${organisationId} AND human_slug = ${humanSlug}`;
    }
    return NextResponse.json({ success: true, data: { human_slug: humanSlug, persona_version_id: personaVersionId }, meta: { mode: "live", request_id: randomUUID() } });
  }

  if (resource === "personas" && route[1] && route[2] === "test") {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Enter a test message." }, { status: 422 });
    const [version] = await sql`SELECT * FROM persona_versions WHERE persona_id = ${route[1]} AND organisation_id = ${organisationId} ORDER BY version DESC LIMIT 1`;
    if (!version) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    const knowledgeBaseIds: string[] = Array.isArray(version.knowledge_base_ids) ? version.knowledge_base_ids : [];
    const cited = await retrieveChunks(organisationId, knowledgeBaseIds, message, 5);
    const context = cited.length > 0
      ? `\n\nGrounding context from the organisation's knowledge base (cite naturally, don't invent facts beyond this):\n${cited.map((c, i) => `[${i + 1}] (${c.documentTitle}) ${c.content}`).join("\n\n")}`
      : "";
    const generated = await chatComplete({
      system: `${version.system_instructions}\n\nConversation style: ${version.conversation_style}\nRespond in ${version.language}. Keep responses under ${version.max_response_words} words.${context}`,
      messages: [{ role: "user", content: message }],
      maxOutputTokens: Math.min(800, version.max_response_words * 6),
      reasoningEffort: "none",
    });
    if (!generated.ok) return NextResponse.json({ success: false, code: generated.code, message: generated.message }, { status: generated.status });
    return NextResponse.json({
      success: true,
      data: { reply: generated.data, citations: cited.map((c) => ({ document_title: c.documentTitle, content: c.content.slice(0, 240), similarity: c.similarity })) },
      meta: { mode: "live", request_id: randomUUID() },
    });
  }

  if (resource === "livekit") {
    const proxied = await proxyToGateway("/api/v1/livekit/token", {
      session_id: body.session_id,
      participant_identity: body.participant_identity ?? `guest-${randomUUID().slice(0, 8)}`,
      human_slug: body.human_slug,
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
  if (route[0] === "digital-humans" && route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    // human_slug in the 5 assignment tables is plain text, not a FK to digital_humans —
    // nothing cascades automatically, so clean each one up explicitly before dropping
    // the row itself. (sessions.digital_human_id and presenter_projects.digital_human_id
    // do have a real FK with no cascade, but neither table is ever written to by this
    // app yet, so they can't block this delete today — revisit if that changes.)
    const deleted = await sql.begin(async (tx) => {
      await tx`DELETE FROM human_voice_assignments WHERE organisation_id = ${organisationId} AND human_slug = ${route[1]}`;
      await tx`DELETE FROM human_face_assignments WHERE organisation_id = ${organisationId} AND human_slug = ${route[1]}`;
      await tx`DELETE FROM human_gesture_assignments WHERE organisation_id = ${organisationId} AND human_slug = ${route[1]}`;
      await tx`DELETE FROM human_knowledge_assignments WHERE organisation_id = ${organisationId} AND human_slug = ${route[1]}`;
      await tx`DELETE FROM human_persona_assignments WHERE organisation_id = ${organisationId} AND human_slug = ${route[1]}`;
      const [human] = await tx`DELETE FROM digital_humans WHERE id = ${route[1]} AND organisation_id = ${organisationId} RETURNING id`;
      return Boolean(human);
    });
    return response({ id: route[1], deleted }, 202);
  }
  if (route[0] === "knowledge-documents" && route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const [deleted] = await sql<{ object_key: string | null }[]>`
      DELETE FROM knowledge_documents WHERE id = ${route[1]} AND organisation_id = ${organisationId} RETURNING object_key
    `;
    if (deleted?.object_key) await sql`DELETE FROM media_blobs WHERE object_key = ${deleted.object_key} AND organisation_id = ${organisationId}`;
    return response({ id: route[1], deleted: Boolean(deleted) }, 202);
  }
  if (route[0] === "knowledge-bases" && route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const deleted = await sql.begin(async (tx) => {
      const objectKeys = await tx<{ object_key: string | null }[]>`SELECT object_key FROM knowledge_documents WHERE knowledge_base_id = ${route[1]} AND organisation_id = ${organisationId}`;
      const [base] = await tx`DELETE FROM knowledge_bases WHERE id = ${route[1]} AND organisation_id = ${organisationId} RETURNING id`;
      if (base) {
        const keys = objectKeys.map((row) => row.object_key).filter((key): key is string => Boolean(key));
        if (keys.length > 0) await tx`DELETE FROM media_blobs WHERE object_key = ANY(${keys}) AND organisation_id = ${organisationId}`;
      }
      return Boolean(base);
    });
    return response({ id: route[1], deleted }, 202);
  }
  if (route[0] === "personas" && route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const [deleted] = await sql`DELETE FROM personas WHERE id = ${route[1]} AND organisation_id = ${organisationId} RETURNING id`;
    return response({ id: route[1], deleted: Boolean(deleted) }, 202);
  }
  if (route[0] === "guardrails" && route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const [deleted] = await sql`DELETE FROM guardrails WHERE id = ${route[1]} AND organisation_id = ${organisationId} RETURNING id`;
    return response({ id: route[1], deleted: Boolean(deleted) }, 202);
  }
  if (route[0] !== "sessions") return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
  return response({ id: route[1] ?? null, deletion: "mock-queued", private_content_included: false }, 202);
}

// New draft-only edit path — publishing forks a new version (POST persona-versions)
// instead of allowing in-place mutation, keeping the audit trail promise real.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ route: string[] }> }) {
  const { route } = await params;
  const organisationId = await requireOrganisation(request);
  if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });

  if (route[0] === "guardrails" && route[1]) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const enforcement = typeof body.enforcement === "string" ? body.enforcement : null;
    if (!enforcement) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "enforcement is required." }, { status: 422 });
    const [row] = await sql`UPDATE guardrails SET enforcement = ${enforcement} WHERE id = ${route[1]} AND organisation_id = ${organisationId} RETURNING id, code, instruction, enforcement`;
    if (!row) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ success: true, data: row, meta: { mode: "live", request_id: randomUUID() } });
  }

  if (route[0] === "digital-humans" && route[1]) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const state = typeof body.state === "string" ? body.state : null;
    if (state && !["draft", "active", "archived", "revoked"].includes(state)) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Invalid state." }, { status: 422 });
    }
    const [row] = await sql`
      UPDATE digital_humans SET
        name = COALESCE(${typeof body.name === "string" && body.name.trim() ? body.name.trim() : null}, name),
        role = COALESCE(${typeof body.role === "string" && body.role.trim() ? body.role.trim() : null}, role),
        disclosure = COALESCE(${typeof body.disclosure === "string" && body.disclosure.trim() ? body.disclosure.trim() : null}, disclosure),
        state = COALESCE(${state}::lifecycle_state, state),
        updated_at = now()
      WHERE id = ${route[1]} AND organisation_id = ${organisationId}
      RETURNING id, name, role, disclosure, state, created_at, updated_at
    `;
    if (!row) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ success: true, data: row, meta: { mode: "live", request_id: randomUUID() } });
  }

  if (route[0] === "applications" && route[1]) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (!Array.isArray(body.allowed_embed_origins)) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "allowed_embed_origins must be an array of origin strings." }, { status: 422 });
    }
    const allowedOrigins = body.allowed_embed_origins.filter((o): o is string => typeof o === "string" && o.trim().length > 0).map((o) => o.trim());
    for (const origin of allowedOrigins) {
      let isBareOrigin = false;
      try {
        isBareOrigin = new URL(origin).origin === origin;
      } catch {
        isBareOrigin = false;
      }
      if (!isBareOrigin) {
        return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: `"${origin}" is not a valid origin (expected e.g. https://plugconnect.com, no path).` }, { status: 422 });
      }
    }
    const [row] = await sql`
      UPDATE applications SET settings = jsonb_set(settings, '{allowed_embed_origins}', ${allowedOrigins}::jsonb)
      WHERE id = ${route[1]} AND organisation_id = ${organisationId}
      RETURNING id, name, slug, status, settings, created_at
    `;
    if (!row) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ success: true, data: row, meta: { mode: "live", request_id: randomUUID() } });
  }

  if (route[0] !== "persona-versions" || !route[1]) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const [current] = await sql<{ state: string }[]>`SELECT state FROM persona_versions WHERE id = ${route[1]} AND organisation_id = ${organisationId}`;
  if (!current) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
  if (current.state !== "draft") {
    return NextResponse.json({ success: false, code: "CONFLICT", message: "Published versions are immutable. Create a new draft version instead." }, { status: 409 });
  }
  const [version] = await sql`
    UPDATE persona_versions SET
      role = COALESCE(${typeof body.role === "string" ? body.role : null}, role),
      system_instructions = COALESCE(${typeof body.system_instructions === "string" ? body.system_instructions : null}, system_instructions),
      conversation_style = COALESCE(${typeof body.conversation_style === "string" ? body.conversation_style : null}, conversation_style),
      opening_message = COALESCE(${typeof body.opening_message === "string" ? body.opening_message : null}, opening_message),
      language = COALESCE(${typeof body.language === "string" ? body.language : null}, language),
      speaking_rate = COALESCE(${typeof body.speaking_rate === "number" ? body.speaking_rate : null}, speaking_rate),
      max_response_words = COALESCE(${typeof body.max_response_words === "number" ? body.max_response_words : null}, max_response_words),
      knowledge_base_ids = COALESCE(${Array.isArray(body.knowledge_base_ids) ? (body.knowledge_base_ids as string[]) : null}::uuid[], knowledge_base_ids)
    WHERE id = ${route[1]} AND organisation_id = ${organisationId}
    RETURNING *
  `;
  return NextResponse.json({ success: true, data: version, meta: { mode: "live", request_id: randomUUID() } });
}
