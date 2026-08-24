import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { NextRequest, NextResponse, after } from "next/server";
import { academyCourses, integrations, templates } from "@/data/commercial";
import { plans } from "@vowhumans/commercial-core";
import sql, { databaseConfigured } from "@/lib/db";
import { SESSION_COOKIE_NAME, createSession, destroySession, hashPassword, isLockedOut, readSession, recordFailedLogin, resetFailedLogins, sessionCookieOptions, verifyPassword } from "@/lib/auth";
import { EMBEDDING_MODEL, chatComplete, embedBatch, synthesizeSpeech, translateText } from "@/lib/openai";
import { transcribeSpeech } from "@/lib/speech";
import { chunkText, extractText, fetchWebsiteText, retrieveChunks } from "@/lib/ingest";
import { mintEmbedToken } from "@/lib/embedToken";
import { getCapabilityMatrix, recordLanguageUsage, resolveForCapability } from "@/lib/languageRouter";
import type { CapabilityKind } from "@vowhumans/persona-schema";

const allowedResources = new Set(["auth","dashboard","organisations","workspaces","users","consents","digital-humans","identities","voices","voice-assignments","faces","face-assignments","gesture-profiles","gesture-assignments","personas","persona-versions","persona-assignments","guardrails","knowledge","knowledge-bases","knowledge-documents","knowledge-assignments","sessions","livekit","presenter-projects","generated-videos","renders","applications","digital-human-applications","live-sessions","integrations","templates","marketplace","academy","partners","notifications","support-requests","sales-requests","demo-requests","contact-requests","signup-requests","signin-requests","partner-requests","investor-requests","trust-requests","billing","plans","analytics","api-keys","webhooks","usage","health","safety","audit-logs","languages","digital-human-languages","terminology","language-reviews"]);

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

// No ENABLE_* flag was read anywhere in this file before the multilingual work —
// every other "is this configured" check tests a secret env var's presence
// directly (OPENAI_API_KEY, AVATAR_WORKER_URL, etc). This is the first explicit
// on/off feature flag, mirroring the os.getenv(...).lower()=="true" idiom the
// Python services already use. Every gate below degrades to today's exact
// English-only behaviour when off.
function flagEnabled(name: string): boolean {
  return (process.env[name] ?? "false").toLowerCase() === "true";
}

function controlPlaneEncryptionKey(): Buffer {
  const configured = process.env.ENCRYPTION_KEY ?? "";
  if (configured) {
    if (/^[0-9a-f]{64}$/i.test(configured)) return Buffer.from(configured, "hex");
    const decoded = Buffer.from(configured, "base64");
    if (decoded.length === 32) return decoded;
  }
  const fallback = process.env.AUTH_SECRET ?? "";
  if (!fallback) throw new Error("ENCRYPTION_KEY is not configured.");
  return createHash("sha256").update(fallback).digest();
}

function encryptControlPlaneSecret(value: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", controlPlaneEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}

function decryptControlPlaneSecret(value: Buffer): string {
  const iv = value.subarray(0, 12);
  const tag = value.subarray(12, 28);
  const decipher = createDecipheriv("aes-256-gcm", controlPlaneEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString("utf8");
}

function publicFeatureStatus() {
  return {
    live_sessions: flagEnabled("ENABLE_LIVE_SESSIONS"),
    multilingual: flagEnabled("ENABLE_MULTILINGUAL"),
    presenter_studio: flagEnabled("ENABLE_PRESENTER_STUDIO"),
    transcripts: flagEnabled("ENABLE_TRANSCRIPTS"),
    recordings: flagEnabled("ENABLE_RECORDINGS"),
    openai_realtime: flagEnabled("ENABLE_OPENAI_REALTIME"),
    avatar_participant: flagEnabled("ENABLE_AVATAR_PARTICIPANT"),
    gpu_avatar: flagEnabled("ENABLE_MUSETALK") || flagEnabled("ENABLE_LIVEPORTRAIT") || flagEnabled("ENABLE_AUDIO2FACE"),
  };
}

// Separate from requireOrganisation (used everywhere else and left untouched) —
// only live-sessions needs the full user record, to attribute who started a test call.
async function requireUser(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return token ? await readSession(token) : null;
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
  return NextResponse.json({ success: true, data, meta: { mode: "live", request_id: randomUUID() } }, { status, headers: { "x-vowhumans-mode": "live" } });
}

function previewResponse(data: unknown, status = 200) {
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

// Presenter Studio: a script becomes one scene per paragraph (blank-line separated),
// or the whole script as a single scene if the author never broke it up.
function splitScriptIntoScenes(script: string): string[] {
  const paragraphs = script.trim().split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
  return paragraphs.length > 0 ? paragraphs : [script.trim()];
}

// Same words-per-second formula the old mock UI already used for its "~X sec"
// estimate — kept as the upfront planning estimate; real playback duration comes
// from the actual rendered/synthesized media once a scene finishes generating.
function estimateSceneDurationMs(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1000, Math.round((words / 2.3) * 1000));
}

// Minimal RIFF/WAVE header parse (no library) — real duration from the fmt chunk's
// byte rate and the data chunk's size, not another estimate, for whatever OpenAI's
// TTS endpoint actually returned. Confirmed live against a real response: OpenAI
// streams this wav and writes the data chunk's declared size as 0xFFFFFFFF ("unknown,
// read to EOF" — a real, if unusual, RIFF convention for streamed output), not the
// true byte count — trusting that field literally produced a multi-hour "duration"
// from a five-second clip. The real size is just whatever's left in the buffer.
function wavDurationMs(buffer: Buffer): number | null {
  if (buffer.length < 44 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") return null;
  let offset = 12;
  let byteRate: number | null = null;
  let dataSize: number | null = null;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const declaredChunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === "fmt " && offset + 8 + 16 <= buffer.length) {
      byteRate = buffer.readUInt32LE(offset + 8 + 8);
    } else if (chunkId === "data") {
      dataSize = declaredChunkSize === 0xffffffff ? buffer.length - (offset + 8) : declaredChunkSize;
      break; // Size-unknown data chunks are always last — nothing meaningful follows.
    }
    offset += 8 + declaredChunkSize + (declaredChunkSize % 2);
  }
  if (!byteRate || !dataSize) return null;
  return Math.round((dataSize / byteRate) * 1000);
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

type GatewayHealth = {
  gateway_reachable: boolean;
  avatar_configured: boolean;
  realtime_configured: boolean;
  // False whenever REALTIME_AGENT_HEALTH_URL isn't set (or unreachable) — lets
  // the UI say "unknown" instead of a false "not configured". See the long
  // comment below for why this can't just be read off the gateway itself.
  realtime_check_available: boolean;
};

// Two separate Railway services matter here (docs/LIVE_VOICE_DEPLOYMENT.md):
// api-gateway (mints tokens — its own ENABLE_AVATAR_PARTICIPANT genuinely
// controls its own behavior in create_livekit_token(), so reading it off the
// gateway is accurate) and realtime-agent-worker, the actual voice bridge,
// deliberately deployed with no public network at all (outbound-only, to
// LiveKit) — it can never be pinged directly. realtime-agent-health is a
// separate, publicly-reachable companion service (services/realtime-agent/
// main.py) built for exactly this gap; its /health reports whether
// ENABLE_OPENAI_REALTIME + OPENAI_API_KEY are present in ITS OWN environment,
// which is only a true proxy for the worker's config if the operator also
// mirrors those two vars onto it (documented in
// docs/LIVE_VOICE_DEPLOYMENT.md) — REALTIME_AGENT_HEALTH_URL being unset is
// the common case today, hence realtime_check_available.
async function fetchGatewayHealth(): Promise<GatewayHealth> {
  const gatewayBaseUrl = process.env.API_GATEWAY_URL;
  const realtimeHealthUrl = process.env.REALTIME_AGENT_HEALTH_URL;

  let gatewayReachable = false;
  let avatarConfigured = false;
  if (gatewayBaseUrl) {
    try {
      const upstream = await fetch(`${gatewayBaseUrl.replace(/\/$/, "")}/api/v1/health`, { signal: AbortSignal.timeout(4000) });
      if (upstream.ok) {
        const body = (await upstream.json().catch(() => null)) as { providers?: { avatar?: string } } | null;
        gatewayReachable = true;
        avatarConfigured = body?.providers?.avatar === "configured";
      }
    } catch {
      // Not reachable — gatewayReachable stays false.
    }
  }

  let realtimeConfigured = false;
  let realtimeCheckAvailable = false;
  if (realtimeHealthUrl) {
    try {
      const upstream = await fetch(`${realtimeHealthUrl.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(4000) });
      if (upstream.ok) {
        const body = (await upstream.json().catch(() => null)) as { provider_health?: { healthy?: boolean } } | null;
        realtimeCheckAvailable = true;
        realtimeConfigured = Boolean(body?.provider_health?.healthy);
      }
    } catch {
      // Not reachable — realtimeCheckAvailable stays false.
    }
  }

  return { gateway_reachable: gatewayReachable, avatar_configured: avatarConfigured, realtime_configured: realtimeConfigured, realtime_check_available: realtimeCheckAvailable };
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
  if (resource === "health") {
    const gateway = await fetchGatewayHealth();
    return response({
      status: "ok",
      persistence: databaseConfigured,
      features: publicFeatureStatus(),
      providers: {
        gateway: gateway.gateway_reachable ? "reachable" : "not-reachable",
        realtime: !gateway.realtime_check_available ? "unknown" : gateway.realtime_configured ? "configured" : "not-configured",
        avatar: gateway.avatar_configured ? "configured" : "audio-fallback",
        billing: process.env.BILLING_PROVIDER && process.env.BILLING_PROVIDER !== "disabled" ? "configured" : "disabled",
        email: process.env.EMAIL_PROVIDER && process.env.EMAIL_PROVIDER !== "disabled" ? "configured" : "disabled",
      },
    });
  }

  if (resource === "dashboard") {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const [counts, recentHumans, recentAudit, gateway] = await Promise.all([
      sql<{
        digital_humans: number; published_personas: number; sessions_today: number;
        live_now: number; pending_identities: number; active_consents: number;
        usage_cost_minor: number; usage_events: number;
      }[]>`
        SELECT
          (SELECT count(*)::int FROM digital_humans WHERE organisation_id = ${organisationId} AND state <> 'archived') AS digital_humans,
          (SELECT count(*)::int FROM persona_versions WHERE organisation_id = ${organisationId} AND state = 'published') AS published_personas,
          (SELECT count(*)::int FROM sessions WHERE organisation_id = ${organisationId} AND created_at >= current_date) AS sessions_today,
          (SELECT count(*)::int FROM sessions WHERE organisation_id = ${organisationId} AND state IN ('created','connecting','active') AND created_at > now() - interval '30 minutes') AS live_now,
          (SELECT count(*)::int FROM identities WHERE organisation_id = ${organisationId} AND state = 'pending') AS pending_identities,
          (SELECT count(*)::int FROM identity_consents WHERE organisation_id = ${organisationId} AND state = 'approved' AND (expires_at IS NULL OR expires_at > now())) AS active_consents,
          (SELECT coalesce(sum(estimated_cost_minor),0)::int FROM usage_records WHERE organisation_id = ${organisationId} AND recorded_at >= date_trunc('month', now())) AS usage_cost_minor,
          (SELECT count(*)::int FROM usage_records WHERE organisation_id = ${organisationId} AND recorded_at >= date_trunc('month', now())) AS usage_events
      `,
      sql`
        SELECT dh.id, dh.name, dh.role, dh.disclosure, dh.state, dh.created_at,
          (SELECT hfa.face_asset_id FROM human_face_assignments hfa
           WHERE hfa.organisation_id = dh.organisation_id AND hfa.human_slug = dh.id::text
           LIMIT 1) AS face_asset_id
        FROM digital_humans dh
        WHERE dh.organisation_id = ${organisationId} AND dh.state <> 'archived'
        ORDER BY
          CASE WHEN EXISTS (
            SELECT 1 FROM identities i
            WHERE i.id = dh.identity_id
              AND i.provenance->>'source' = 'vowhumans-showcase'
          ) THEN 0 ELSE 1 END,
          dh.updated_at DESC
        LIMIT 5
      `,
      sql`SELECT action, resource_type, occurred_at FROM audit_logs WHERE organisation_id = ${organisationId} ORDER BY occurred_at DESC LIMIT 5`,
      fetchGatewayHealth(),
    ]);
    return NextResponse.json({ success: true, data: { counts: counts[0], humans: recentHumans, activity: recentAudit, gateway }, meta: { mode: "live", request_id: randomUUID() } });
  }

  if (resource === "identities" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const rows = await sql`
      SELECT i.id, i.owner_name, i.display_name, i.provenance, i.geographic_scope,
        i.commercial_use_confirmed, i.state, i.approved_at, i.expires_at, i.revoked_at,
        count(ic.id)::int AS consent_count,
        count(ic.id) FILTER (WHERE ic.state = 'approved' AND (ic.expires_at IS NULL OR ic.expires_at > now()))::int AS approved_consent_count
      FROM identities i
      LEFT JOIN identity_consents ic ON ic.identity_id = i.id AND ic.organisation_id = i.organisation_id
      WHERE i.organisation_id = ${organisationId}
      GROUP BY i.id
      ORDER BY i.created_at DESC
    `;
    return NextResponse.json({ success: true, data: { items: rows }, meta: { mode: "live", request_id: randomUUID() } });
  }

  if (resource === "api-keys" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const rows = await sql`
      SELECT k.id, k.name, k.prefix, k.scopes, k.status, k.expires_at, k.last_used_at, k.created_at,
        a.name AS application_name
      FROM api_keys k LEFT JOIN applications a ON a.id = k.application_id
      WHERE k.organisation_id = ${organisationId}
      ORDER BY k.created_at DESC
    `;
    return NextResponse.json({ success: true, data: { items: rows }, meta: { mode: "live", request_id: randomUUID() } });
  }

  if (resource === "webhooks" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const rows = await sql`
      SELECT w.id, w.name, w.endpoint_url, w.event_types, w.status, w.last_delivery_at,
        w.last_status_code, w.consecutive_failures, w.paused_at, w.created_at,
        a.name AS application_name
      FROM webhooks w LEFT JOIN applications a ON a.id = w.application_id
      WHERE w.organisation_id = ${organisationId}
      ORDER BY w.created_at DESC
    `;
    return NextResponse.json({ success: true, data: { items: rows }, meta: { mode: "live", request_id: randomUUID() } });
  }

  if (resource === "usage") {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const [summary, trend, providers] = await Promise.all([
      sql<{
        usage_events: number; metered_quantity: number; estimated_cost_minor: number;
        session_minutes: number; presenter_jobs: number; avg_latency_ms: number | null;
      }[]>`
        SELECT
          (SELECT count(*)::int FROM usage_records WHERE organisation_id = ${organisationId}) AS usage_events,
          (SELECT coalesce(sum(quantity),0)::float FROM usage_records WHERE organisation_id = ${organisationId}) AS metered_quantity,
          (SELECT coalesce(sum(estimated_cost_minor),0)::int FROM usage_records WHERE organisation_id = ${organisationId}) AS estimated_cost_minor,
          (SELECT coalesce(sum(extract(epoch FROM (coalesce(ended_at, now()) - coalesce(started_at, created_at))) / 60),0)::float FROM sessions WHERE organisation_id = ${organisationId}) AS session_minutes,
          (SELECT count(*)::int FROM generated_videos WHERE organisation_id = ${organisationId}) AS presenter_jobs,
          (SELECT round(avg(latency_ms))::int FROM usage_records WHERE organisation_id = ${organisationId} AND latency_ms IS NOT NULL) AS avg_latency_ms
      `,
      sql`
        SELECT to_char(day, 'YYYY-MM-DD') AS day,
          coalesce(sum(u.quantity),0)::float AS quantity,
          coalesce(sum(u.estimated_cost_minor),0)::int AS estimated_cost_minor
        FROM generate_series(current_date - interval '29 days', current_date, interval '1 day') day
        LEFT JOIN usage_records u ON u.organisation_id = ${organisationId} AND u.recorded_at >= day AND u.recorded_at < day + interval '1 day'
        GROUP BY day ORDER BY day
      `,
      sql`
        SELECT provider, unit, count(*)::int AS events, sum(quantity)::float AS quantity,
          sum(estimated_cost_minor)::int AS estimated_cost_minor
        FROM usage_records WHERE organisation_id = ${organisationId}
        GROUP BY provider, unit ORDER BY estimated_cost_minor DESC, provider
      `,
    ]);
    return NextResponse.json({ success: true, data: { summary: summary[0], trend, providers, currency: "ZAR", private_content_included: false }, meta: { mode: "live", request_id: randomUUID() } });
  }

  if (resource === "audit-logs") {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const rows = await sql`
      SELECT al.id, al.action, al.resource_type, al.resource_id, al.before_state, al.after_state, al.occurred_at,
        coalesce(u.display_name, k.name, 'System') AS actor
      FROM audit_logs al
      LEFT JOIN users u ON u.id = al.actor_user_id
      LEFT JOIN api_keys k ON k.id = al.actor_service_key_id
      WHERE al.organisation_id = ${organisationId}
      ORDER BY al.occurred_at DESC LIMIT 250
    `;
    return NextResponse.json({ success: true, data: { items: rows }, meta: { mode: "live", request_id: randomUUID() } });
  }

  if (resource === "safety") {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const [counts, organisation] = await Promise.all([
      sql<{
        identities: number; approved_identities: number; pending_identities: number;
        approved_consents: number; total_consents: number; moderation_events: number;
        knowledge_chunks: number; open_concerns: number;
      }[]>`
        SELECT
          (SELECT count(*)::int FROM identities WHERE organisation_id = ${organisationId}) AS identities,
          (SELECT count(*)::int FROM identities WHERE organisation_id = ${organisationId} AND state = 'approved') AS approved_identities,
          (SELECT count(*)::int FROM identities WHERE organisation_id = ${organisationId} AND state = 'pending') AS pending_identities,
          (SELECT count(*)::int FROM identity_consents WHERE organisation_id = ${organisationId} AND state = 'approved') AS approved_consents,
          (SELECT count(*)::int FROM identity_consents WHERE organisation_id = ${organisationId}) AS total_consents,
          (SELECT count(*)::int FROM moderation_events WHERE organisation_id = ${organisationId} AND occurred_at > now() - interval '30 days') AS moderation_events,
          (SELECT count(*)::int FROM knowledge_chunks WHERE organisation_id = ${organisationId}) AS knowledge_chunks,
          (SELECT count(*)::int FROM support_tickets WHERE organisation_id = ${organisationId} AND status = 'open' AND subject = 'Safety concern') AS open_concerns
      `,
      sql<{ settings: Record<string, unknown> }[]>`SELECT settings FROM organisations WHERE id = ${organisationId}`,
    ]);
    return NextResponse.json({ success: true, data: { counts: counts[0], settings: organisation[0]?.settings ?? {}, features: publicFeatureStatus() }, meta: { mode: "live", request_id: randomUUID() } });
  }

  if (resource === "organisations" && route[1] === "current") {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const [organisation] = await sql`SELECT id, name, slug, status, settings, created_at FROM organisations WHERE id = ${organisationId}`;
    const gateway = await fetchGatewayHealth();
    return NextResponse.json({ success: true, data: { organisation, features: publicFeatureStatus(), gateway }, meta: { mode: "live", request_id: randomUUID() } });
  }

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
    const [[face], [voice], [gestureRow], [persona], knowledgeBases, languageRows] = await Promise.all([
      sql`SELECT fa.id, fa.media_type, fa.detector_provider, fa.preprocessing_state, fa.state FROM human_face_assignments hfa JOIN face_assets fa ON fa.id = hfa.face_asset_id WHERE hfa.organisation_id = ${organisationId} AND hfa.human_slug = ${route[1]}`,
      sql`SELECT v.id, v.name, v.provider, v.provider_voice_id, v.language, v.is_custom FROM human_voice_assignments hva JOIN voices v ON v.id = hva.voice_id WHERE hva.organisation_id = ${organisationId} AND hva.human_slug = ${route[1]}`,
      sql`SELECT gp.id, gp.name, gp.state_config FROM human_gesture_assignments hga JOIN gesture_profiles gp ON gp.id = hga.gesture_profile_id WHERE hga.organisation_id = ${organisationId} AND hga.human_slug = ${route[1]}`,
      sql`SELECT p.id AS persona_id, p.name AS persona_name, pv.id AS version_id, pv.version, pv.role, pv.state FROM human_persona_assignments hpa JOIN persona_versions pv ON pv.id = hpa.persona_version_id JOIN personas p ON p.id = pv.persona_id WHERE hpa.organisation_id = ${organisationId} AND hpa.human_slug = ${route[1]}`,
      sql`SELECT kb.id, kb.name FROM human_knowledge_assignments hka JOIN knowledge_bases kb ON kb.id = hka.knowledge_base_id WHERE hka.organisation_id = ${organisationId} AND hka.human_slug = ${route[1]}`,
      // Best status across every provider per language, matching the honest
      // capability registry rather than any one human's own override — a
      // digital human "supports" isiZulu only as much as the platform does.
      flagEnabled("ENABLE_MULTILINGUAL")
        ? sql`
            SELECT l.code, l.english_name,
              (SELECT lc.status FROM language_capabilities lc WHERE lc.language_code = l.code AND lc.capability = 'tts'
               ORDER BY CASE lc.status WHEN 'production' THEN 1 WHEN 'beta' THEN 2 WHEN 'experimental' THEN 3 WHEN 'degraded' THEN 4 WHEN 'temporarily-unavailable' THEN 5 ELSE 6 END LIMIT 1) AS status,
              dhlv.voice_id, v.name AS voice_name
            FROM languages l
            LEFT JOIN digital_human_language_voices dhlv ON dhlv.language_code = l.code AND dhlv.organisation_id = ${organisationId} AND dhlv.human_slug = ${route[1]}
            LEFT JOIN voices v ON v.id = dhlv.voice_id
            ORDER BY l.sort_order
          `
        : Promise.resolve([]),
    ]);
    const gestureProfile = gestureRow ? { ...gestureRow, state_config: typeof gestureRow.state_config === "string" ? JSON.parse(gestureRow.state_config) : gestureRow.state_config } : null;
    return response({ human, face: face ?? null, voice: voice ?? null, gesture_profile: gestureProfile, persona: persona ?? null, knowledge_bases: knowledgeBases, languages: languageRows });
  }

  if (resource === "digital-humans" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const rows = await sql`
      SELECT dh.id, dh.name, dh.role, dh.disclosure, dh.state, dh.created_at, dh.updated_at,
        (SELECT hfa.face_asset_id FROM human_face_assignments hfa
         WHERE hfa.organisation_id = dh.organisation_id AND hfa.human_slug = dh.id::text
         LIMIT 1) AS face_asset_id
      FROM digital_humans dh
      WHERE dh.organisation_id = ${organisationId} AND dh.state <> 'archived'
      ORDER BY dh.created_at DESC
    `;
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

  // ENABLE_MULTILINGUAL off => only en-ZA comes back, enabled:true — every
  // consuming <LanguageSelect> across the app collapses to today's single-option
  // equivalent rather than offering 11 languages nobody can actually use yet.
  if (resource === "languages" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) {
      return previewResponse({ items: [{ code: "en-ZA", english_name: "English (South Africa)", native_name: "English", enabled: true, default_voice_id: null, capabilities: [] }] });
    }
    if (!flagEnabled("ENABLE_MULTILINGUAL")) {
      return previewResponse({ items: [{ code: "en-ZA", english_name: "English (South Africa)", native_name: "English", enabled: true, default_voice_id: null, capabilities: [] }] });
    }
    const [languages, capabilities, orgLanguages, usageStats, reviewStats] = await Promise.all([
      sql<{ code: string; english_name: string; native_name: string; sort_order: number }[]>`SELECT code, english_name, native_name, sort_order FROM languages ORDER BY sort_order`,
      sql<{ language_code: string; capability: string; provider: string; status: string; notes: string }[]>`SELECT language_code, capability, provider, status, notes FROM language_capabilities ORDER BY language_code, capability, provider`,
      sql<{ language_code: string; enabled: boolean; default_voice_id: string | null; preferred_stt_provider: string | null; preferred_tts_provider: string | null; preferred_realtime_provider: string | null; fallback_language_code: string | null }[]>`
        SELECT language_code, enabled, default_voice_id, preferred_stt_provider, preferred_tts_provider, preferred_realtime_provider, fallback_language_code
        FROM organisation_languages WHERE organisation_id = ${organisationId}
      `,
      // Real usage, not synthetic — every row starts at zero until the org's own
      // benchmarking/live-session calls actually record something (recordLanguageUsage).
      sql<{ language_code: string; avg_latency_ms: number | null; recent_failures: string }[]>`
        SELECT language_code, avg(latency_ms) AS avg_latency_ms, count(*) FILTER (WHERE unit LIKE '%:failed' AND recorded_at > now() - interval '7 days') AS recent_failures
        FROM usage_records WHERE organisation_id = ${organisationId} AND language_code IS NOT NULL GROUP BY language_code
      `,
      sql<{ language_code: string; total: string; passed: string }[]>`
        SELECT language_code, count(*) AS total, count(*) FILTER (WHERE verdict = 'pass') AS passed
        FROM language_quality_reviews GROUP BY language_code
      `,
    ]);
    const items = languages.map((lang) => {
      const org = orgLanguages.find((o) => o.language_code === lang.code);
      const usage = usageStats.find((u) => u.language_code === lang.code);
      const reviews = reviewStats.find((r) => r.language_code === lang.code);
      return {
        code: lang.code, english_name: lang.english_name, native_name: lang.native_name,
        enabled: org?.enabled ?? false, default_voice_id: org?.default_voice_id ?? null,
        preferred_stt_provider: org?.preferred_stt_provider ?? null, preferred_tts_provider: org?.preferred_tts_provider ?? null,
        preferred_realtime_provider: org?.preferred_realtime_provider ?? null, fallback_language_code: org?.fallback_language_code ?? null,
        capabilities: capabilities.filter((c) => c.language_code === lang.code),
        avg_latency_ms: usage?.avg_latency_ms ?? null,
        recent_failures: Number(usage?.recent_failures ?? 0),
        validation_reviews: Number(reviews?.total ?? 0),
        validation_passed: Number(reviews?.passed ?? 0),
      };
    });
    return response({ items });
  }

  if (resource === "digital-human-languages" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const humanSlug = request.nextUrl.searchParams.get("human_slug");
    const rows = await sql`
      SELECT dhlv.language_code, dhlv.voice_id, v.name AS voice_name
      FROM digital_human_language_voices dhlv LEFT JOIN voices v ON v.id = dhlv.voice_id
      WHERE dhlv.organisation_id = ${organisationId} ${humanSlug ? sql`AND dhlv.human_slug = ${humanSlug}` : sql``}
    `;
    return response({ items: rows });
  }

  if (resource === "terminology" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const languageCode = request.nextUrl.searchParams.get("language_code");
    const rows = await sql`
      SELECT id, language_code, source_term, preferred_form, phonetic_guidance, translation, prohibited_translation, notes, created_at
      FROM terminology_entries WHERE organisation_id = ${organisationId} ${languageCode ? sql`AND language_code = ${languageCode}` : sql``}
      ORDER BY language_code, source_term
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
    const languageMessages = versions.length > 0
      ? await sql`SELECT * FROM persona_version_language_messages WHERE organisation_id = ${organisationId} AND persona_version_id = ANY(${versions.map((v) => v.id)}::uuid[]) ORDER BY language_code`
      : [];
    return response({ persona, versions, guardrails, language_messages: languageMessages });
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
      SELECT a.human_slug, a.persona_version_id, pv.persona_id, pv.version, pv.state, p.name AS persona_name
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

  // The real operations center for every VowHumans call — both external embed
  // calls (application_id set, from api/public/v1/embed-sessions) and Studio's
  // own test calls (application_id null, from the live-sessions POST below) —
  // one unified, organisation-scoped view.
  if (resource === "live-sessions" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });

    const [items, [summary], firstAudioRows, reconnectRows, health] = await Promise.all([
      sql<{
        id: string; state: string; avatar_mode: string; created_at: string; started_at: string | null; ended_at: string | null;
        human_id: string | null; human_name: string | null; application_name: string | null;
      }[]>`
        SELECT s.id, s.state, s.avatar_mode, s.created_at, s.started_at, s.ended_at,
          dh.id AS human_id, dh.name AS human_name, a.name AS application_name
        FROM sessions s
        LEFT JOIN digital_humans dh ON dh.id = s.digital_human_id
        LEFT JOIN applications a ON a.id = s.application_id
        WHERE s.organisation_id = ${organisationId}
        ORDER BY s.created_at DESC
        LIMIT 50
      `,
      sql<{ live_now: string; sessions_today: string; avg_duration_seconds: number | null }[]>`
        SELECT
          count(*) FILTER (WHERE state IN ('created','connecting','active')) AS live_now,
          count(*) FILTER (WHERE created_at >= current_date) AS sessions_today,
          avg(EXTRACT(EPOCH FROM (ended_at - COALESCE(started_at, created_at)))) FILTER (WHERE state = 'completed' AND ended_at IS NOT NULL) AS avg_duration_seconds
        FROM sessions WHERE organisation_id = ${organisationId}
      `,
      // One row per session (first report wins) — client-reported "time to first
      // audio", not a server-measured guarantee; labelled as such in the UI.
      sql<{ session_id: string; elapsed_ms: number }[]>`
        SELECT DISTINCT ON (se.session_id) se.session_id, (se.payload->>'elapsed_ms')::numeric AS elapsed_ms
        FROM session_events se JOIN sessions s ON s.id = se.session_id
        WHERE s.organisation_id = ${organisationId} AND se.event_type = 'first_audio' AND se.occurred_at > now() - interval '30 days'
        ORDER BY se.session_id, se.occurred_at ASC
      `,
      sql<{ session_id: string }[]>`
        SELECT DISTINCT se.session_id
        FROM session_events se JOIN sessions s ON s.id = se.session_id
        WHERE s.organisation_id = ${organisationId} AND se.event_type = 'reconnected' AND se.occurred_at > now() - interval '30 days'
      `,
      fetchGatewayHealth(),
    ]);

    const TELEMETRY_MIN_SAMPLE = 3;
    const elapsedValues = firstAudioRows.map((row) => Number(row.elapsed_ms)).sort((a, b) => a - b);
    const sampleSize = elapsedValues.length;
    const insufficientTelemetry = sampleSize < TELEMETRY_MIN_SAMPLE;
    const p95Index = Math.min(elapsedValues.length - 1, Math.floor(elapsedValues.length * 0.95));

    return response({
      items: items.map((row) => ({
        id: row.id,
        state: row.state,
        avatar_mode: row.avatar_mode,
        created_at: row.created_at,
        started_at: row.started_at,
        ended_at: row.ended_at,
        human_name: row.human_name,
        source: row.application_name ? "embed" : "studio_test",
        application_name: row.application_name,
      })),
      metrics: {
        live_now: Number(summary.live_now),
        sessions_today: Number(summary.sessions_today),
        avg_duration_seconds: summary.avg_duration_seconds !== null ? Number(summary.avg_duration_seconds) : null,
        p95_first_audio_ms: insufficientTelemetry ? null : elapsedValues[p95Index],
        reconnect_rate: insufficientTelemetry ? null : reconnectRows.length / sampleSize,
        telemetry_sample_size: sampleSize,
        telemetry_insufficient: insufficientTelemetry,
      },
      health,
    });
  }

  if (resource === "presenter-projects" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const rows = await sql`
      SELECT pp.id, pp.title, pp.course, pp.module, pp.lesson, pp.digital_human_id, dh.name AS digital_human_name,
        pp.voice_id, v.name AS voice_name, pp.output_language, pp.aspect_ratio, pp.state, pp.created_at
      FROM presenter_projects pp
      LEFT JOIN digital_humans dh ON dh.id = pp.digital_human_id
      LEFT JOIN voices v ON v.id = pp.voice_id
      WHERE pp.organisation_id = ${organisationId}
      ORDER BY pp.created_at DESC
    `;
    return response({ items: rows });
  }

  if (resource === "presenter-projects" && route[1] && !route[2]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const [project] = await sql`
      SELECT pp.*, dh.name AS digital_human_name, v.name AS voice_name
      FROM presenter_projects pp
      LEFT JOIN digital_humans dh ON dh.id = pp.digital_human_id
      LEFT JOIN voices v ON v.id = pp.voice_id
      WHERE pp.id = ${route[1]} AND pp.organisation_id = ${organisationId}
    `;
    if (!project) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    const scenes = await sql`
      SELECT ps.id, ps.ordinal, ps.script, ps.duration_ms, ps.state,
        gv.id AS generated_video_id, gv.output_kind, gv.duration_ms AS render_duration_ms, gv.state AS render_state, gv.failure_reason
      FROM presenter_scenes ps
      LEFT JOIN generated_videos gv ON gv.scene_id = ps.id
      WHERE ps.project_id = ${route[1]} AND ps.organisation_id = ${organisationId}
      ORDER BY ps.ordinal
    `;
    return response({ project, scenes });
  }

  if (resource === "generated-videos" && route[1] && route[2] === "media") {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const [video] = await sql<{ object_key: string | null }[]>`SELECT object_key FROM generated_videos WHERE id = ${route[1]} AND organisation_id = ${organisationId}`;
    if (!video?.object_key) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    const [blob] = await sql<{ data: Buffer; mime_type: string }[]>`SELECT data, mime_type FROM media_blobs WHERE object_key = ${video.object_key} AND organisation_id = ${organisationId}`;
    if (!blob) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    return new NextResponse(new Uint8Array(blob.data), { headers: { "content-type": blob.mime_type, "cache-control": "private, max-age=3600" } });
  }

  // Populates generated_videos' existing subtitle_object_key concept on the fly
  // rather than as a stored file — the underlying facts (scene script, duration_ms)
  // already exist, so there's nothing to keep in sync by generating it per-request.
  // ?language=<code> serves a stored translation's text instead of the original
  // script when one exists; the original scene script is never altered either way.
  if (resource === "generated-videos" && route[1] && route[2] === "subtitles") {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const format = request.nextUrl.searchParams.get("format") === "vtt" ? "vtt" : "srt";
    const language = request.nextUrl.searchParams.get("language");
    const [video] = await sql<{ scene_id: string | null; duration_ms: number | null }[]>`SELECT scene_id, duration_ms FROM generated_videos WHERE id = ${route[1]} AND organisation_id = ${organisationId}`;
    if (!video?.scene_id) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    const [scene] = await sql<{ script: string }[]>`SELECT script FROM presenter_scenes WHERE id = ${video.scene_id} AND organisation_id = ${organisationId}`;
    if (!scene) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    let text = scene.script;
    if (language) {
      const [translation] = await sql<{ translated_script: string }[]>`SELECT translated_script FROM presenter_scene_translations WHERE scene_id = ${video.scene_id} AND language_code = ${language} AND organisation_id = ${organisationId}`;
      if (translation) text = translation.translated_script;
    }
    const durationMs = video.duration_ms ?? 4000;
    const toTimestamp = (ms: number, vtt: boolean) => {
      const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), msec = ms % 1000;
      const pad = (n: number, len = 2) => String(n).padStart(len, "0");
      return `${pad(h)}:${pad(m)}:${pad(s)}${vtt ? "." : ","}${String(msec).padStart(3, "0")}`;
    };
    const body = format === "vtt"
      ? `WEBVTT\n\n${toTimestamp(0, true)} --> ${toTimestamp(durationMs, true)}\n${text}\n`
      : `1\n${toTimestamp(0, false)} --> ${toTimestamp(durationMs, false)}\n${text}\n`;
    return new NextResponse(body, { headers: { "content-type": format === "vtt" ? "text/vtt; charset=utf-8" : "application/x-subrip; charset=utf-8", "cache-control": "private, max-age=3600" } });
  }

  if (resource === "plans") return previewResponse({ items: plans, pricing_status: "proposed-configurable", currency: "ZAR" });
  if (resource === "integrations") return previewResponse({ items: integrations });
  if (resource === "templates" || resource === "marketplace") return previewResponse({ items: templates, purchases_enabled: false });
  if (resource === "academy") return previewResponse({ items: academyCourses, progress_persistent: false });
  if (resource === "usage" || resource === "analytics" || resource === "billing") return previewResponse({ sessions: 0, minutes: 0, estimated_cost_minor: 0, currency: "ZAR", source_connected: false, private_content_included: false });
  return previewResponse({ items: [], resource, persistent: false });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ route: string[] }> }) {
  const { route } = await params;
  const resource = route[0];
  if (!allowedResources.has(resource)) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });

  // Multipart uploads must be branched off before the generic request.json() parse
  // below — a request body can only be read once.
  // "Test transcription" / "Test mic" in Settings -> Languages — a real STT call
  // (not a stored artifact), writes nothing, gated on both the general
  // multilingual flag and the specific OpenAI STT flag so it can't be exercised
  // silently once multilingual is on but STT hasn't been explicitly enabled.
  if (resource === "languages" && route[1] === "test-transcription" && (request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    if (!flagEnabled("ENABLE_MULTILINGUAL") || !flagEnabled("ENABLE_OPENAI_STT")) {
      return NextResponse.json({ success: false, code: "PROVIDER_DISABLED", message: "Speech-to-text testing is not enabled in this environment." }, { status: 503 });
    }
    const form = await request.formData();
    const file = form.get("file");
    const languageCode = String(form.get("language_code") ?? "");
    if (!(file instanceof Blob) || file.size === 0 || !file.type.startsWith("audio/")) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Provide an audio file." }, { status: 422 });
    }
    if (file.size > 8 * 1024 * 1024) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Audio file must be 8MB or smaller." }, { status: 422 });
    if (!languageCode && !flagEnabled("ENABLE_AUTO_LANGUAGE_DETECTION")) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Choose a language, or enable ENABLE_AUTO_LANGUAGE_DETECTION to allow auto-detect." }, { status: 422 });
    }
    const started = Date.now();
    const resolution = languageCode ? await resolveForCapability(organisationId, languageCode, "stt") : null;
    const languageHint = resolution && resolution.status !== "unsupported" && !resolution.usedFallback ? languageCode : undefined;
    const result = await transcribeSpeech(Buffer.from(await file.arrayBuffer()), file.type, languageHint);
    if (languageCode) await recordLanguageUsage({ organisationId, languageCode, capability: "stt", provider: "openai", latencyMs: Date.now() - started, failed: !result.ok });
    if (!result.ok) return NextResponse.json({ success: false, code: result.code, message: result.message }, { status: result.status });
    return NextResponse.json({ success: true, data: { text: result.data.text, latency_ms: Date.now() - started, language_hint_used: languageHint ?? null }, meta: { mode: "live", request_id: randomUUID() } });
  }

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
          [organisation] = await tx`
            INSERT INTO organisations (name, slug) VALUES (${organisationName}, ${slug})
            ON CONFLICT (slug) DO NOTHING
            RETURNING id, name, slug
          `;
          if (organisation) break;
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

  if (resource === "identities" && !route[1]) {
    const user = await requireUser(request);
    if (!user) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const ownerName = typeof body.owner_name === "string" ? body.owner_name.trim() : "";
    const displayName = typeof body.display_name === "string" ? body.display_name.trim() : "";
    const authorityReference = typeof body.authority_reference === "string" ? body.authority_reference.trim() : "";
    const roles = Array.isArray(body.permitted_roles) ? body.permitted_roles.filter((role): role is string => typeof role === "string" && role.trim().length > 0) : [];
    const geographicScope = Array.isArray(body.geographic_scope) ? body.geographic_scope.filter((scope): scope is string => typeof scope === "string" && scope.trim().length > 0) : [];
    const expiresAt = typeof body.expires_at === "string" && body.expires_at ? new Date(body.expires_at) : null;
    if (!ownerName || !displayName || !authorityReference || body.authority_confirmed !== true || body.commercial_use_confirmed !== true || roles.length === 0 || geographicScope.length === 0) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Owner, display name, authority reference, roles, geography and both authority confirmations are required." }, { status: 422 });
    }
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date())) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Expiry must be a valid future date." }, { status: 422 });
    }
    const result = await sql.begin(async (tx) => {
      const [identity] = await tx`
        INSERT INTO identities (organisation_id, owner_name, display_name, provenance, geographic_scope, commercial_use_confirmed, state, approved_by, approved_at, expires_at)
        VALUES (${user.organisationId}, ${ownerName}, ${displayName}, ${JSON.stringify({ authority_reference: authorityReference, attested_by_user_id: user.id, source: "customer_authority_attestation" })}::jsonb, ${geographicScope}, true, 'approved', ${user.id}, now(), ${expiresAt?.toISOString() ?? null})
        RETURNING id, owner_name, display_name, geographic_scope, commercial_use_confirmed, state, approved_at, expires_at
      `;
      const digest = createHash("sha256").update(`${user.organisationId}:${identity.id}:${authorityReference}`).digest("hex");
      for (const consentType of ["written", "face", "voice", "commercial"]) {
        await tx`
          INSERT INTO identity_consents (organisation_id, identity_id, consent_type, object_key, sha256, permitted_roles, state, signed_at, expires_at)
          VALUES (${user.organisationId}, ${identity.id}, ${consentType}, ${`attestation:${authorityReference}`}, ${digest}, ${roles}, 'approved', now(), ${expiresAt?.toISOString() ?? null})
        `;
      }
      return identity;
    });
    return NextResponse.json({ success: true, data: result, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
  }

  if (resource === "api-keys" && !route[1]) {
    const user = await requireUser(request);
    if (!user) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const allowedScopes = new Set(["sessions:create", "sessions:read", "renders:create", "renders:read", "usage:read", "webhooks:manage"]);
    const scopes = Array.isArray(body.scopes) ? body.scopes.filter((scope): scope is string => typeof scope === "string" && allowedScopes.has(scope)) : [];
    const applicationId = typeof body.application_id === "string" && body.application_id ? body.application_id : null;
    const expiresAt = typeof body.expires_at === "string" && body.expires_at ? new Date(body.expires_at) : null;
    if (!name || scopes.length === 0 || (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()))) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Name, at least one valid scope and a future expiry (when supplied) are required." }, { status: 422 });
    }
    if (applicationId) {
      const [application] = await sql`SELECT id FROM applications WHERE id = ${applicationId} AND organisation_id = ${user.organisationId}`;
      if (!application) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Application does not belong to this organisation." }, { status: 422 });
    }
    const rawKey = `vhm_live_${randomBytes(32).toString("base64url")}`;
    const prefix = rawKey.slice(0, 17);
    const [row] = await sql`
      INSERT INTO api_keys (organisation_id, application_id, name, prefix, key_hash, scopes, status, expires_at, created_by)
      VALUES (${user.organisationId}, ${applicationId}, ${name}, ${prefix}, ${createHash("sha256").update(rawKey).digest("hex")}, ${scopes}, 'active', ${expiresAt?.toISOString() ?? null}, ${user.id})
      RETURNING id, name, prefix, scopes, status, expires_at, created_at
    `;
    return NextResponse.json({ success: true, data: { ...row, secret: rawKey }, meta: { mode: "live", request_id: randomUUID(), secret_display: "once" } }, { status: 201 });
  }

  if (resource === "webhooks" && route[1] && route[2] === "test") {
    const user = await requireUser(request);
    if (!user) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const [hook] = await sql<{ id: string; secret_ciphertext: Buffer }[]>`SELECT id, secret_ciphertext FROM webhooks WHERE id = ${route[1]} AND organisation_id = ${user.organisationId}`;
    if (!hook) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    const eventId = `evt_test_${randomUUID()}`;
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify({ id: eventId, type: "system.webhook_test", created_at: new Date().toISOString(), data: { synthetic: true } });
    const signature = createHmac("sha256", decryptControlPlaneSecret(Buffer.from(hook.secret_ciphertext))).update(`${timestamp}.${payload}`).digest("hex");
    return NextResponse.json({ success: true, data: { verified: true, payload: JSON.parse(payload), headers: { "X-VowHumans-Event": eventId, "X-VowHumans-Signature": `t=${timestamp},v1=${signature}` }, private_content_included: false }, meta: { mode: "local-signature-verification", request_id: randomUUID() } });
  }

  if (resource === "webhooks" && !route[1]) {
    const user = await requireUser(request);
    if (!user) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const endpointUrl = typeof body.endpoint_url === "string" ? body.endpoint_url.trim() : "";
    const allowedEvents = new Set(["session.created", "session.completed", "session.failed", "render.completed", "render.failed", "identity.revoked"]);
    const eventTypes = Array.isArray(body.event_types) ? body.event_types.filter((event): event is string => typeof event === "string" && allowedEvents.has(event)) : [];
    const applicationId = typeof body.application_id === "string" && body.application_id ? body.application_id : null;
    let parsedUrl: URL;
    try { parsedUrl = new URL(endpointUrl); } catch { return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Enter a valid endpoint URL." }, { status: 422 }); }
    const localHttp = process.env.NODE_ENV !== "production" && parsedUrl.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsedUrl.hostname);
    if (!name || eventTypes.length === 0 || (parsedUrl.protocol !== "https:" && !localHttp)) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Name, HTTPS endpoint and at least one supported event are required." }, { status: 422 });
    }
    if (applicationId) {
      const [application] = await sql`SELECT id FROM applications WHERE id = ${applicationId} AND organisation_id = ${user.organisationId}`;
      if (!application) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Application does not belong to this organisation." }, { status: 422 });
    }
    const secret = `whsec_${randomBytes(32).toString("base64url")}`;
    const [row] = await sql`
      INSERT INTO webhooks (organisation_id, application_id, name, endpoint_url, secret_ciphertext, event_types, status)
      VALUES (${user.organisationId}, ${applicationId}, ${name}, ${endpointUrl}, ${encryptControlPlaneSecret(secret)}, ${eventTypes}, 'active')
      RETURNING id, name, endpoint_url, event_types, status, created_at
    `;
    return NextResponse.json({ success: true, data: { ...row, signing_secret: secret }, meta: { mode: "live", request_id: randomUUID(), secret_display: "once" } }, { status: 201 });
  }

  if (resource === "safety" && !route[1]) {
    const user = await requireUser(request);
    if (!user) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const priority = typeof body.priority === "string" && ["normal", "high", "urgent"].includes(body.priority) ? body.priority : "normal";
    if (description.length < 10) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Describe the safety concern in at least 10 characters." }, { status: 422 });
    const [ticket] = await sql`
      INSERT INTO support_tickets (organisation_id, user_id, priority, status, subject, description)
      VALUES (${user.organisationId}, ${user.id}, ${priority}, 'open', 'Safety concern', ${description})
      RETURNING id, priority, status, created_at
    `;
    await sql`INSERT INTO audit_logs (organisation_id, actor_user_id, action, resource_type, resource_id, after_state) VALUES (${user.organisationId}, ${user.id}, 'safety.concern.reported', 'support_tickets', ${ticket.id}, ${JSON.stringify({ priority, status: "open" })}::jsonb)`;
    return NextResponse.json({ success: true, data: ticket, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
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

  if (resource === "digital-human-languages" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const humanSlug = typeof body.human_slug === "string" ? body.human_slug : "";
    const languageCode = typeof body.language_code === "string" ? body.language_code : "";
    const voiceId = typeof body.voice_id === "string" ? body.voice_id : null;
    if (!humanSlug || !languageCode) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "human_slug and language_code are required." }, { status: 422 });
    await sql`
      INSERT INTO digital_human_language_voices (organisation_id, human_slug, language_code, voice_id) VALUES (${organisationId}, ${humanSlug}, ${languageCode}, ${voiceId})
      ON CONFLICT (organisation_id, human_slug, language_code) DO UPDATE SET voice_id = EXCLUDED.voice_id
    `;
    return NextResponse.json({ success: true, data: { human_slug: humanSlug, language_code: languageCode, voice_id: voiceId }, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
  }

  if (resource === "terminology" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const languageCode = typeof body.language_code === "string" ? body.language_code : "";
    const sourceTerm = typeof body.source_term === "string" ? body.source_term.trim() : "";
    const preferredForm = typeof body.preferred_form === "string" ? body.preferred_form.trim() : "";
    if (!languageCode || !sourceTerm || !preferredForm) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "language_code, source_term and preferred_form are required." }, { status: 422 });
    }
    const phoneticGuidance = typeof body.phonetic_guidance === "string" ? body.phonetic_guidance.trim() : "";
    const translation = typeof body.translation === "string" ? body.translation.trim() : "";
    const prohibitedTranslation = typeof body.prohibited_translation === "string" ? body.prohibited_translation.trim() : "";
    const notes = typeof body.notes === "string" ? body.notes.trim() : "";
    const [row] = await sql`
      INSERT INTO terminology_entries (organisation_id, language_code, source_term, preferred_form, phonetic_guidance, translation, prohibited_translation, notes)
      VALUES (${organisationId}, ${languageCode}, ${sourceTerm}, ${preferredForm}, ${phoneticGuidance}, ${translation}, ${prohibitedTranslation}, ${notes})
      ON CONFLICT (organisation_id, language_code, source_term) DO UPDATE SET
        preferred_form = EXCLUDED.preferred_form, phonetic_guidance = EXCLUDED.phonetic_guidance,
        translation = EXCLUDED.translation, prohibited_translation = EXCLUDED.prohibited_translation, notes = EXCLUDED.notes, updated_at = now()
      RETURNING id, language_code, source_term, preferred_form, phonetic_guidance, translation, prohibited_translation, notes, created_at
    `;
    return NextResponse.json({ success: true, data: row, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
  }

  // Calls every CONFIGURED provider's real function against a corpus sample and
  // returns the raw outputs — writes nothing, so viewing a comparison can never
  // fabricate or silently publish a "winning" provider. Unconfigured providers
  // (Azure/Google — no credentials in this environment) return an honest
  // not_configured card rather than being silently omitted, so the gap is visible.
  if (resource === "languages" && route[1] === "benchmark") {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    if (!flagEnabled("ENABLE_LANGUAGE_BENCHMARKING")) return NextResponse.json({ success: false, code: "PROVIDER_DISABLED", message: "Language benchmarking is not enabled in this environment." }, { status: 503 });
    const languageCode = typeof body.language_code === "string" ? body.language_code : "";
    const capability = typeof body.capability === "string" ? (body.capability as CapabilityKind) : "";
    if (!languageCode || !capability) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "language_code and capability are required." }, { status: 422 });
    const matrix = await getCapabilityMatrix();
    const providerRows = matrix.filter((r) => r.languageCode === languageCode && r.capability === capability);
    const [sample] = await sql<{ id: string; source_text: string }[]>`SELECT id, source_text FROM language_test_corpus WHERE language_code = ${languageCode} ORDER BY random() LIMIT 1`;
    const phrase = sample?.source_text || "Hello, thank you for calling. How may I help you today?";
    const results = await Promise.all(providerRows.map(async (row) => {
      if (row.provider !== "openai") return { provider: row.provider, status: "not_configured" as const, notes: row.notes };
      const started = Date.now();
      if (capability === "tts") {
        if (!flagEnabled("ENABLE_OPENAI_TTS")) return { provider: row.provider, status: "not_configured" as const, notes: "ENABLE_OPENAI_TTS is off in this environment." };
        const result = await synthesizeSpeech(phrase, "alloy");
        return result.ok
          ? { provider: row.provider, status: "ok" as const, latency_ms: Date.now() - started, audio_base64: result.data.toString("base64"), mime_type: "audio/wav" }
          : { provider: row.provider, status: "error" as const, message: result.message };
      }
      if (capability === "translation") {
        if (!flagEnabled("ENABLE_TRANSLATION_FALLBACK")) return { provider: row.provider, status: "not_configured" as const, notes: "ENABLE_TRANSLATION_FALLBACK is off in this environment." };
        const result = await translateText({ text: phrase, sourceLanguage: "en-ZA", targetLanguage: languageCode });
        return result.ok
          ? { provider: row.provider, status: "ok" as const, latency_ms: Date.now() - started, text: result.data.text, confidence: result.data.confidence }
          : { provider: row.provider, status: "error" as const, message: result.message };
      }
      // stt/reasoning/realtime have no cheap text-only benchmark path here — report
      // the registry status honestly rather than fabricating a machine-test result.
      return { provider: row.provider, status: "registry_only" as const, registry_status: row.status, notes: row.notes };
    }));
    return response({ language_code: languageCode, capability, test_phrase: phrase, results });
  }

  // Org admin can only enable/prefer a language and pick a default voice —
  // never writes language_capabilities, so an org can't fabricate a "production"
  // status for every tenant. See docs/MULTILINGUAL_AUDIT.md. Must stay after the
  // "benchmark" check above — route[1] here is otherwise treated as a language
  // code, and "benchmark" would (harmlessly, since it fails the FK, but
  // confusingly) never reach the real benchmark handler if this ran first.
  if (resource === "languages" && route[1] && route[1] !== "benchmark" && route[1] !== "test-transcription") {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    if (!flagEnabled("ENABLE_MULTILINGUAL")) return NextResponse.json({ success: false, code: "PROVIDER_DISABLED", message: "Multilingual support is not enabled in this environment." }, { status: 503 });
    const enabled = Boolean(body.enabled);
    const defaultVoiceId = typeof body.default_voice_id === "string" ? body.default_voice_id : null;
    const preferredSttProvider = typeof body.preferred_stt_provider === "string" ? body.preferred_stt_provider : null;
    const preferredTtsProvider = typeof body.preferred_tts_provider === "string" ? body.preferred_tts_provider : null;
    const preferredRealtimeProvider = typeof body.preferred_realtime_provider === "string" ? body.preferred_realtime_provider : null;
    const fallbackLanguageCode = typeof body.fallback_language_code === "string" ? body.fallback_language_code : "en-ZA";
    const [row] = await sql`
      INSERT INTO organisation_languages (organisation_id, language_code, enabled, default_voice_id, preferred_stt_provider, preferred_tts_provider, preferred_realtime_provider, fallback_language_code)
      VALUES (${organisationId}, ${route[1]}, ${enabled}, ${defaultVoiceId}, ${preferredSttProvider}, ${preferredTtsProvider}, ${preferredRealtimeProvider}, ${fallbackLanguageCode})
      ON CONFLICT (organisation_id, language_code) DO UPDATE SET
        enabled = EXCLUDED.enabled, default_voice_id = EXCLUDED.default_voice_id,
        preferred_stt_provider = EXCLUDED.preferred_stt_provider, preferred_tts_provider = EXCLUDED.preferred_tts_provider,
        preferred_realtime_provider = EXCLUDED.preferred_realtime_provider, fallback_language_code = EXCLUDED.fallback_language_code, updated_at = now()
      RETURNING *
    `;
    return response(row);
  }

  if (resource === "language-reviews" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const languageCode = typeof body.language_code === "string" ? body.language_code : "";
    const capability = typeof body.capability === "string" ? body.capability : "";
    const provider = typeof body.provider === "string" ? body.provider : "";
    const reviewType = body.review_type === "formal_qa" ? "formal_qa" : "admin_benchmark";
    if (!languageCode || !capability || !provider) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "language_code, capability and provider are required." }, { status: 422 });
    }
    const score = typeof body.score === "number" && body.score >= 1 && body.score <= 5 ? body.score : null;
    const verdict = typeof body.verdict === "string" && ["pass", "fail", "needs_review"].includes(body.verdict) ? body.verdict : null;
    const [row] = await sql`
      INSERT INTO language_quality_reviews (organisation_id, language_code, capability, provider, review_type, reviewer_name, reviewer_contact, score, verdict, notes, reviewed_at)
      VALUES (${organisationId}, ${languageCode}, ${capability}, ${provider}, ${reviewType},
        ${typeof body.reviewer_name === "string" ? body.reviewer_name.trim() : null}, ${typeof body.reviewer_contact === "string" ? body.reviewer_contact.trim() : null},
        ${score}, ${verdict}, ${typeof body.notes === "string" ? body.notes.trim() : ""}, now())
      RETURNING *
    `;
    // Deliberately does not touch language_capabilities.status here — promoting a
    // language's real status is a separate, deliberate manual step per
    // docs/SOUTH_AFRICAN_LANGUAGE_QA.md, never an automatic side effect of one review.
    return NextResponse.json({ success: true, data: row, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
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

  const MAX_CONCURRENT_SESSIONS_PER_ORG = 3;

  // Studio's own "test this VowHuman live" flow — reuses the exact embed-token
  // gateway path api/public/v1/embed-sessions already established, just
  // authenticated by session cookie instead of an (application, origin) pairing,
  // and with no consuming application (sessions.application_id is nullable —
  // see migration 008_live_sessions.sql).
  if (resource === "live-sessions" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const user = await requireUser(request);
    const digitalHumanId = typeof body.digital_human_id === "string" ? body.digital_human_id : "";
    if (!digitalHumanId) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "digital_human_id is required." }, { status: 422 });
    }

    const [human] = await sql<{ id: string }[]>`SELECT id FROM digital_humans WHERE id = ${digitalHumanId} AND organisation_id = ${organisationId}`;
    if (!human) return NextResponse.json({ success: false, code: "NOT_FOUND", message: "VowHuman not found." }, { status: 404 });

    const [publishedVersion] = await sql<{ id: string }[]>`
      SELECT pv.id FROM human_persona_assignments hpa JOIN persona_versions pv ON pv.id = hpa.persona_version_id
      WHERE hpa.organisation_id = ${organisationId} AND hpa.human_slug = ${digitalHumanId} AND pv.state = 'published'
    `;
    if (!publishedVersion) {
      return NextResponse.json({ success: false, code: "PERSONA_NOT_PUBLISHED", message: "Publish this VowHuman's persona before testing it live." }, { status: 409 });
    }

    const [{ count: activeCount }] = await sql<{ count: string }[]>`
      SELECT count(*) FROM sessions WHERE organisation_id = ${organisationId} AND state IN ('created','connecting','active')
    `;
    if (Number(activeCount) >= MAX_CONCURRENT_SESSIONS_PER_ORG) {
      return NextResponse.json({ success: false, code: "TOO_MANY_ACTIVE_SESSIONS", message: "Too many live sessions running at once. End one before starting another." }, { status: 429 });
    }

    const [face] = await sql<{ face_asset_id: string }[]>`SELECT face_asset_id FROM human_face_assignments WHERE organisation_id = ${organisationId} AND human_slug = ${digitalHumanId}`;
    const avatarMode = face ? "live-avatar" : "audio-only";

    // requested_language rides in the existing context jsonb rather than a new
    // sessions column — sessions has no dedicated language field, and context
    // already exists precisely for this kind of extensible per-session metadata.
    const requestedLanguage = flagEnabled("ENABLE_MULTILINGUAL") && typeof body.requested_language === "string" && body.requested_language ? body.requested_language : null;
    const [session] = await sql<{ id: string }[]>`
      INSERT INTO sessions (organisation_id, application_id, digital_human_id, persona_version_id, owner_user_id, transport_provider, avatar_mode, context)
      VALUES (${organisationId}, NULL, ${digitalHumanId}, ${publishedVersion.id}, ${user?.id ?? null}, 'livekit', ${avatarMode}, ${sql.json({ source: "studio-test", ...(requestedLanguage ? { requested_language: requestedLanguage } : {}) })})
      RETURNING id
    `;
    return NextResponse.json({
      success: true,
      data: { session_id: session.id, disclosure: "You are testing an AI-generated digital human, not a real person." },
      meta: { mode: "live", request_id: randomUUID() },
    }, { status: 201 });
  }

  if (resource === "live-sessions" && route[1] && route[2] === "token") {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const [session] = await sql<{ digital_human_id: string; persona_version_id: string; context: unknown }[]>`
      SELECT digital_human_id, persona_version_id, context FROM sessions WHERE id = ${route[1]} AND organisation_id = ${organisationId}
    `;
    if (!session) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    const context = typeof session.context === "string" ? JSON.parse(session.context) : session.context;
    const requestedLanguage = typeof (context as { requested_language?: unknown } | null)?.requested_language === "string" ? (context as { requested_language: string }).requested_language : undefined;

    const baseUrl = process.env.API_GATEWAY_URL;
    if (!baseUrl) {
      return NextResponse.json({ success: false, code: "PROVIDER_DISABLED", message: "LiveKit tokens are issued only by the configured server-side API gateway." }, { status: 503 });
    }
    try {
      const upstream = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v1/livekit/token`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${mintEmbedToken(organisationId)}` },
        body: JSON.stringify({
          session_id: route[1],
          participant_identity: `studio-test-${randomUUID().slice(0, 8)}`,
          human_slug: session.digital_human_id,
          persona_version_id: session.persona_version_id,
          ...(requestedLanguage ? { requested_language: requestedLanguage } : {}),
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

  if (resource === "live-sessions" && route[1] && route[2] === "end") {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const [row] = await sql<{ id: string }[]>`
      UPDATE sessions SET state = 'completed', ended_at = now()
      WHERE id = ${route[1]} AND organisation_id = ${organisationId} AND state != 'completed'
      RETURNING id
    `;
    return NextResponse.json({ success: true, data: { id: route[1], ended: Boolean(row) }, meta: { mode: "live", request_id: randomUUID() } });
  }

  if (resource === "live-sessions" && route[1] && route[2] === "events") {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const eventType = typeof body.event_type === "string" ? body.event_type : "";
    if (!eventType) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "event_type is required." }, { status: 422 });
    const [owned] = await sql<{ id: string }[]>`SELECT id FROM sessions WHERE id = ${route[1]} AND organisation_id = ${organisationId}`;
    if (!owned) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    // Round-tripped through JSON rather than just narrowing the type — this is
    // client-supplied data (a telemetry payload like {elapsed_ms}), and this is
    // the cheapest way to guarantee it's plain, serializable JSON before it
    // reaches sql.json(), not just a same-shaped TypeScript assertion.
    const payload = JSON.parse(JSON.stringify(body.payload && typeof body.payload === "object" ? body.payload : {}));
    await sql`
      INSERT INTO session_events (organisation_id, session_id, sequence, event_type, payload)
      VALUES (${organisationId}, ${route[1]}, COALESCE((SELECT max(sequence) FROM session_events WHERE session_id = ${route[1]}), 0) + 1, ${eventType}, ${sql.json(payload)})
    `;
    return NextResponse.json({ success: true, data: { recorded: true }, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
  }

  // Resolves the requested language via the capability registry and logs the
  // attempt as a session_events row regardless of outcome — the one guaranteed
  // part of mid-call language switching (see docs/MULTILINGUAL_AUDIT.md for why
  // the LiveKit agent-side hot-swap itself is a separate, less certain step).
  // Never silently pretends the switch used the requested language when it fell
  // back — the client is expected to disclose usedFallback to the user.
  if (resource === "live-sessions" && route[1] && route[2] === "switch-language") {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    if (!flagEnabled("ENABLE_LANGUAGE_SWITCHING")) return NextResponse.json({ success: false, code: "PROVIDER_DISABLED", message: "Mid-call language switching is not enabled in this environment." }, { status: 503 });
    const targetLanguage = typeof body.target_language === "string" ? body.target_language : "";
    if (!targetLanguage) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "target_language is required." }, { status: 422 });
    const [owned] = await sql<{ id: string; digital_human_id: string }[]>`SELECT id, digital_human_id FROM sessions WHERE id = ${route[1]} AND organisation_id = ${organisationId}`;
    if (!owned) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });

    const [realtimeResolution, voiceOverride] = await Promise.all([
      resolveForCapability(organisationId, targetLanguage, "realtime"),
      sql<{ voice_id: string }[]>`SELECT voice_id FROM digital_human_language_voices WHERE organisation_id = ${organisationId} AND human_slug = ${owned.digital_human_id} AND language_code = ${targetLanguage}`,
    ]);
    await sql`
      INSERT INTO session_events (organisation_id, session_id, sequence, event_type, payload)
      VALUES (${organisationId}, ${route[1]}, COALESCE((SELECT max(sequence) FROM session_events WHERE session_id = ${route[1]}), 0) + 1, 'language_switch_requested',
        ${sql.json({ target_language: targetLanguage, resolved_status: realtimeResolution?.status ?? "unsupported", used_fallback: realtimeResolution?.usedFallback ?? true, fallback_language_code: realtimeResolution?.fallbackLanguageCode ?? null })})
    `;
    if (realtimeResolution) await recordLanguageUsage({ organisationId, sessionId: route[1], languageCode: targetLanguage, capability: "realtime", provider: realtimeResolution.provider });
    return response({
      target_language: targetLanguage,
      resolved_language: realtimeResolution?.resolvedLanguageCode ?? null,
      status: realtimeResolution?.status ?? "unsupported",
      used_fallback: realtimeResolution?.usedFallback ?? true,
      fallback_language_code: realtimeResolution?.fallbackLanguageCode ?? null,
      voice_id: voiceOverride[0]?.voice_id ?? null,
    });
  }

  if (resource === "presenter-projects" && !route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const user = await requireUser(request);
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const script = typeof body.script === "string" ? body.script.trim() : "";
    if (!title || !script) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Give the project a title and a script." }, { status: 422 });
    }
    const digitalHumanId = typeof body.digital_human_id === "string" && body.digital_human_id ? body.digital_human_id : null;
    const voiceId = typeof body.voice_id === "string" && body.voice_id ? body.voice_id : null;
    const outputLanguage = typeof body.output_language === "string" && body.output_language.trim() ? body.output_language.trim() : "English (South Africa)";
    const aspectRatio = typeof body.aspect_ratio === "string" && ["16:9", "9:16", "1:1", "audio"].includes(body.aspect_ratio) ? body.aspect_ratio : "16:9";
    const course = typeof body.course === "string" && body.course.trim() ? body.course.trim() : null;
    const projectModule = typeof body.module === "string" && body.module.trim() ? body.module.trim() : null;
    const lesson = typeof body.lesson === "string" && body.lesson.trim() ? body.lesson.trim() : null;

    const splitScenes = splitScriptIntoScenes(script);
    const result = await sql.begin(async (tx) => {
      const [project] = await tx`
        INSERT INTO presenter_projects (organisation_id, title, course, module, lesson, script, digital_human_id, voice_id, output_language, aspect_ratio, state, created_by)
        VALUES (${organisationId}, ${title}, ${course}, ${projectModule}, ${lesson}, ${script}, ${digitalHumanId}, ${voiceId}, ${outputLanguage}, ${aspectRatio}, 'draft', ${user?.id ?? null})
        RETURNING *
      `;
      const scenes = [];
      for (let i = 0; i < splitScenes.length; i += 1) {
        const [scene] = await tx`
          INSERT INTO presenter_scenes (organisation_id, project_id, ordinal, script, duration_ms, state)
          VALUES (${organisationId}, ${project.id}, ${i}, ${splitScenes[i]}, ${estimateSceneDurationMs(splitScenes[i])}, 'draft')
          RETURNING *
        `;
        scenes.push(scene);
      }
      return { project, scenes };
    });
    return NextResponse.json({ success: true, data: result, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
  }

  // The core render step. One scene per call, by design — TTS plus a GPU lip-sync
  // render comfortably fits inside this route's own maxDuration, but a whole
  // multi-scene project doing all of that in one request risks exceeding it. The
  // frontend calls this in a loop until {done: true}, giving real, visible,
  // incremental progress with no separate job-queue service needed. Re-running it
  // after a scene fails naturally retries that same scene, since the "next scene"
  // lookup below is WHERE state != 'completed', not WHERE state = 'draft'.
  if (resource === "presenter-projects" && route[1] && route[2] === "render-next-scene") {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });

    const [project] = await sql<{ id: string; state: string; digital_human_id: string | null; voice_id: string | null }[]>`
      SELECT id, state, digital_human_id, voice_id FROM presenter_projects WHERE id = ${route[1]} AND organisation_id = ${organisationId}
    `;
    if (!project) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    if (!project.voice_id) {
      return NextResponse.json({ success: false, code: "VOICE_REQUIRED", message: "Assign a voice to this project before generating." }, { status: 422 });
    }

    const [nextScene] = await sql<{ id: string; ordinal: number; script: string }[]>`
      SELECT id, ordinal, script FROM presenter_scenes
      WHERE project_id = ${route[1]} AND organisation_id = ${organisationId} AND state != 'completed'
      ORDER BY ordinal LIMIT 1
    `;
    if (!nextScene) {
      await sql`UPDATE presenter_projects SET state = 'preview_ready' WHERE id = ${route[1]} AND organisation_id = ${organisationId}`;
      return NextResponse.json({ success: true, data: { done: true, project_state: "preview_ready" }, meta: { mode: "live", request_id: randomUUID() } });
    }

    await sql`UPDATE presenter_scenes SET state = 'processing' WHERE id = ${nextScene.id} AND organisation_id = ${organisationId}`;
    if (project.state !== "processing") {
      await sql`UPDATE presenter_projects SET state = 'processing' WHERE id = ${route[1]} AND organisation_id = ${organisationId}`;
    }

    const [voice] = await sql<{ provider_voice_id: string | null }[]>`SELECT provider_voice_id FROM voices WHERE id = ${project.voice_id} AND organisation_id = ${organisationId}`;
    if (!voice?.provider_voice_id) {
      await sql`UPDATE presenter_scenes SET state = 'failed' WHERE id = ${nextScene.id} AND organisation_id = ${organisationId}`;
      await sql`UPDATE presenter_projects SET state = 'failed' WHERE id = ${route[1]} AND organisation_id = ${organisationId}`;
      return NextResponse.json({ success: false, code: "VOICE_NOT_CONFIGURED", message: "This project's voice is not usable." }, { status: 422 });
    }

    const speech = await synthesizeSpeech(nextScene.script, voice.provider_voice_id);
    if (!speech.ok) {
      await sql`UPDATE presenter_scenes SET state = 'failed' WHERE id = ${nextScene.id} AND organisation_id = ${organisationId}`;
      await sql`UPDATE presenter_projects SET state = 'failed' WHERE id = ${route[1]} AND organisation_id = ${organisationId}`;
      await sql`
        INSERT INTO generated_videos (organisation_id, project_id, scene_id, render_provider, output_kind, state, failure_reason)
        VALUES (${organisationId}, ${route[1]}, ${nextScene.id}, 'openai-tts', 'scene-audio', 'failed', ${speech.message.slice(0, 500)})
      `;
      return NextResponse.json({ success: false, code: speech.code, message: speech.message }, { status: speech.status });
    }

    let finalBytes: Buffer = speech.data;
    let mimeType = "audio/wav";
    let outputKind: "scene-clip" | "scene-audio" = "scene-audio";
    let renderProvider = "openai-tts";
    let fallbackNote: string | null = null;

    const avatarWorkerUrl = process.env.AVATAR_WORKER_URL;
    const internalKey = process.env.VOWHUMANS_INTERNAL_KEY;
    if (project.digital_human_id && (!avatarWorkerUrl || !internalKey)) {
      fallbackNote = "Avatar rendering isn't configured in this environment — used audio-only fallback.";
    }
    if (project.digital_human_id && avatarWorkerUrl && internalKey) {
      const [face] = await sql<{ object_key: string }[]>`
        SELECT fa.object_key FROM human_face_assignments hfa
        JOIN face_assets fa ON fa.id = hfa.face_asset_id
        WHERE hfa.organisation_id = ${organisationId} AND hfa.human_slug = ${project.digital_human_id}
      `;
      const blob = face
        ? (await sql<{ data: Buffer; mime_type: string }[]>`SELECT data, mime_type FROM media_blobs WHERE object_key = ${face.object_key} AND organisation_id = ${organisationId}`)[0]
        : undefined;
      if (!blob) {
        fallbackNote = "No face image is assigned to this VowHuman yet — used audio-only fallback.";
      }
      if (blob) {
        try {
          const prepareForm = new FormData();
          prepareForm.append("image_file", new Blob([new Uint8Array(blob.data)], { type: blob.mime_type }), "face.png");
          const prepareRes = await fetch(`${avatarWorkerUrl.replace(/\/$/, "")}/internal/v1/avatars`, {
            method: "POST",
            headers: { "x-internal-key": internalKey },
            body: prepareForm,
            signal: AbortSignal.timeout(30000),
          });
          if (prepareRes.ok) {
            const { avatar_id: avatarId } = (await prepareRes.json()) as { avatar_id: string };
            const renderForm = new FormData();
            renderForm.append("avatar_id", avatarId);
            renderForm.append("audio_file", new Blob([new Uint8Array(speech.data)], { type: "audio/wav" }), "narration.wav");
            const renderRes = await fetch(`${avatarWorkerUrl.replace(/\/$/, "")}/internal/v1/render`, {
              method: "POST",
              headers: { "x-internal-key": internalKey },
              body: renderForm,
              signal: AbortSignal.timeout(90000),
            });
            // Best-effort release regardless of render outcome — mirrors
            // avatar-participant's own cleanup, never blocks the response on it.
            fetch(`${avatarWorkerUrl.replace(/\/$/, "")}/internal/v1/avatars/${avatarId}`, { method: "DELETE", headers: { "x-internal-key": internalKey } }).catch(() => {});
            if (renderRes.ok) {
              finalBytes = Buffer.from(await renderRes.arrayBuffer());
              mimeType = "video/mp4";
              outputKind = "scene-clip";
              renderProvider = "openai-tts+musetalk";
            } else {
              fallbackNote = `Avatar rendering unavailable (${renderRes.status}) — used audio-only fallback.`;
            }
          } else {
            fallbackNote = `Avatar rendering unavailable (${prepareRes.status}) — used audio-only fallback.`;
          }
        } catch {
          fallbackNote = "Avatar rendering unreachable — used audio-only fallback.";
        }
      }
    }

    const durationMs = wavDurationMs(speech.data) ?? estimateSceneDurationMs(nextScene.script);
    const objectKey = `presenter-scene-${nextScene.id}-${randomUUID().slice(0, 8)}`;
    await sql`INSERT INTO media_blobs (object_key, organisation_id, mime_type, data, size_bytes) VALUES (${objectKey}, ${organisationId}, ${mimeType}, ${finalBytes}, ${finalBytes.length})`;
    // failure_reason doubles as a plain explanatory note here — this row isn't a
    // failure (state is 'completed'), but when outputKind stayed 'scene-audio' the
    // reason why is worth keeping around instead of only ever existing in this one
    // response, otherwise there's no way to see it again once the generate() call
    // that produced it is over.
    const [generatedVideo] = await sql`
      INSERT INTO generated_videos (organisation_id, project_id, scene_id, render_provider, output_kind, object_key, duration_ms, state, completed_at, failure_reason)
      VALUES (${organisationId}, ${route[1]}, ${nextScene.id}, ${renderProvider}, ${outputKind}, ${objectKey}, ${durationMs}, 'completed', now(), ${fallbackNote})
      RETURNING id, output_kind, object_key, duration_ms, state
    `;
    await sql`UPDATE presenter_scenes SET state = 'completed' WHERE id = ${nextScene.id} AND organisation_id = ${organisationId}`;

    return NextResponse.json({
      success: true,
      data: { done: false, scene_id: nextScene.id, ordinal: nextScene.ordinal, generated_video: generatedVideo, fallback_note: fallbackNote },
      meta: { mode: "live", request_id: randomUUID() },
    }, { status: 201 });
  }

  // Once every scene is 'completed', render-next-scene's own state != 'completed'
  // filter finds nothing left to do — there was previously no way back from that
  // short of deleting the whole project and starting over, which is exactly what
  // fixing a since-corrected gap (e.g. a face assigned after the first render)
  // would otherwise force. Wipes prior render artifacts and resets scenes back to
  // 'draft' so the normal render-next-scene loop can pick them up fresh.
  if (resource === "presenter-projects" && route[1] && route[2] === "regenerate") {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const [project] = await sql<{ id: string }[]>`SELECT id FROM presenter_projects WHERE id = ${route[1]} AND organisation_id = ${organisationId}`;
    if (!project) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });

    const videoRows = await sql<{ object_key: string | null }[]>`
      SELECT object_key FROM generated_videos WHERE project_id = ${route[1]} AND organisation_id = ${organisationId}
    `;
    await sql`DELETE FROM generated_videos WHERE project_id = ${route[1]} AND organisation_id = ${organisationId}`;
    for (const row of videoRows) {
      if (row.object_key) await sql`DELETE FROM media_blobs WHERE object_key = ${row.object_key} AND organisation_id = ${organisationId}`;
    }
    await sql`UPDATE presenter_scenes SET state = 'draft' WHERE project_id = ${route[1]} AND organisation_id = ${organisationId}`;
    await sql`UPDATE presenter_projects SET state = 'draft' WHERE id = ${route[1]} AND organisation_id = ${organisationId}`;
    return response({ id: route[1], reset: true });
  }

  // Translation lands as its own explicit, reviewable version — presenter_scenes.script
  // (the source) is never written by this handler. Re-running this for the same
  // scene+language overwrites only that language's own translation row, always
  // resetting it back to 'machine_draft' since it's a fresh machine output.
  if (resource === "presenter-projects" && route[1] && route[2] === "translate-scene") {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    if (!flagEnabled("ENABLE_MULTILINGUAL")) return NextResponse.json({ success: false, code: "PROVIDER_DISABLED", message: "Multilingual support is not enabled in this environment." }, { status: 503 });
    if (!flagEnabled("ENABLE_TRANSLATION_FALLBACK")) return NextResponse.json({ success: false, code: "PROVIDER_DISABLED", message: "Translation is not enabled in this environment." }, { status: 503 });
    const sceneId = typeof body.scene_id === "string" ? body.scene_id : "";
    const targetLanguage = typeof body.target_language === "string" ? body.target_language : "";
    if (!sceneId || !targetLanguage) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "scene_id and target_language are required." }, { status: 422 });
    const [scene] = await sql<{ id: string; script: string; project_id: string }[]>`
      SELECT ps.id, ps.script, ps.project_id FROM presenter_scenes ps
      JOIN presenter_projects pp ON pp.id = ps.project_id
      WHERE ps.id = ${sceneId} AND ps.organisation_id = ${organisationId} AND pp.id = ${route[1]}
    `;
    if (!scene) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    const glossaryRows = await sql<{ source_term: string; preferred_form: string }[]>`
      SELECT source_term, preferred_form FROM terminology_entries WHERE organisation_id = ${organisationId} AND language_code = ${targetLanguage}
    `;
    const glossary = glossaryRows.map((g) => ({ sourceTerm: g.source_term, preferredForm: g.preferred_form }));
    const translation = await translateText({ text: scene.script, sourceLanguage: "en-ZA", targetLanguage, glossary });
    if (!translation.ok) return NextResponse.json({ success: false, code: translation.code, message: translation.message }, { status: translation.status });
    const [row] = await sql`
      INSERT INTO presenter_scene_translations (organisation_id, scene_id, language_code, translated_script, translation_status)
      VALUES (${organisationId}, ${sceneId}, ${targetLanguage}, ${translation.data.text}, 'machine_draft')
      ON CONFLICT (scene_id, language_code) DO UPDATE SET translated_script = EXCLUDED.translated_script, translation_status = 'machine_draft', reviewed_by = NULL, reviewed_at = NULL, updated_at = now()
      RETURNING id, scene_id, language_code, translated_script, translation_status, created_at
    `;
    return NextResponse.json({ success: true, data: { ...row, confidence: translation.data.confidence }, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
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
    const supportedLanguages = Array.isArray(pick("supported_languages")) ? (pick("supported_languages") as string[]) : latest.supported_languages ?? [];
    const codeSwitchingPolicy = ["discouraged","allowed","encouraged"].includes(pick("code_switching_policy") as string) ? (pick("code_switching_policy") as string) : latest.code_switching_policy ?? "discouraged";
    const translationPolicy = ["never","fallback_only","always_offer"].includes(pick("translation_policy") as string) ? (pick("translation_policy") as string) : latest.translation_policy ?? "fallback_only";
    const [version] = await sql`
      INSERT INTO persona_versions (organisation_id, persona_id, version, state, role, system_instructions, conversation_style, opening_message, language, speaking_rate, max_response_words, knowledge_base_ids, supported_languages, code_switching_policy, translation_policy)
      VALUES (${organisationId}, ${personaId}, ${latest.version + 1}, 'draft', ${role}, ${systemInstructions}, ${conversationStyle}, ${openingMessage}, ${language}, ${speakingRate}, ${maxResponseWords}, ${knowledgeBaseIds}::uuid[], ${supportedLanguages}::text[], ${codeSwitchingPolicy}, ${translationPolicy})
      RETURNING *
    `;
    return NextResponse.json({ success: true, data: version, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
  }

  if (resource === "persona-versions" && route[1] && route[2] === "language-messages") {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    if (!flagEnabled("ENABLE_MULTILINGUAL")) return NextResponse.json({ success: false, code: "PROVIDER_DISABLED", message: "Multilingual support is not enabled in this environment." }, { status: 503 });
    const languageCode = typeof body.language_code === "string" ? body.language_code : "";
    if (!languageCode) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "language_code is required." }, { status: 422 });
    const openingMessage = typeof body.opening_message === "string" ? body.opening_message.trim() : "";
    const fallbackMessage = typeof body.fallback_message === "string" ? body.fallback_message.trim() : "";
    const autoTranslate = body.auto_translate === true;
    if (autoTranslate && !flagEnabled("ENABLE_TRANSLATION_FALLBACK")) {
      return NextResponse.json({ success: false, code: "PROVIDER_DISABLED", message: "Translation is not enabled in this environment — write this message by hand instead." }, { status: 503 });
    }
    const source = autoTranslate ? "machine_translated" : "human";
    let finalOpening = openingMessage;
    const finalFallback = fallbackMessage;
    if (autoTranslate) {
      const [version] = await sql<{ opening_message: string }[]>`SELECT opening_message FROM persona_versions WHERE id = ${route[1]} AND organisation_id = ${organisationId}`;
      if (version) {
        const translated = await translateText({ text: version.opening_message, sourceLanguage: "en-ZA", targetLanguage: languageCode });
        if (translated.ok) finalOpening = translated.data.text;
      }
    }
    const [row] = await sql`
      INSERT INTO persona_version_language_messages (organisation_id, persona_version_id, language_code, opening_message, fallback_message, source)
      VALUES (${organisationId}, ${route[1]}, ${languageCode}, ${finalOpening}, ${finalFallback}, ${source})
      ON CONFLICT (persona_version_id, language_code) DO UPDATE SET opening_message = EXCLUDED.opening_message, fallback_message = EXCLUDED.fallback_message, source = EXCLUDED.source, updated_at = now()
      RETURNING *
    `;
    return NextResponse.json({ success: true, data: row, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
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

    // Optional language override for Settings -> Languages' "Test digital-human
    // response" tool and the Digital Human page — resolves through the same
    // capability registry live sessions use, so this test reflects the real
    // routing decision rather than just trusting the requested code.
    const requestedLanguage = flagEnabled("ENABLE_MULTILINGUAL") && typeof body.language === "string" && body.language ? body.language : null;
    let respondInLanguage = version.language as string;
    let languageResolution: { status: string; used_fallback: boolean; fallback_language_code: string | null } | null = null;
    let terminologyBlock = "";
    if (requestedLanguage) {
      const resolved = await resolveForCapability(organisationId, requestedLanguage, "reasoning");
      languageResolution = { status: resolved?.status ?? "unsupported", used_fallback: resolved?.usedFallback ?? true, fallback_language_code: resolved?.fallbackLanguageCode ?? null };
      respondInLanguage = resolved?.resolvedLanguageCode ?? version.language;
      const glossary = await sql<{ source_term: string; preferred_form: string }[]>`SELECT source_term, preferred_form FROM terminology_entries WHERE organisation_id = ${organisationId} AND language_code = ${respondInLanguage}`;
      if (glossary.length > 0) terminologyBlock = `\n\nUse these exact preferred terms wherever they're relevant, never a different translation:\n${glossary.map((g) => `- "${g.source_term}" -> "${g.preferred_form}"`).join("\n")}`;
    }

    const generated = await chatComplete({
      system: `${version.system_instructions}\n\nConversation style: ${version.conversation_style}\nRespond in ${respondInLanguage}. Keep responses under ${version.max_response_words} words.${context}${terminologyBlock}`,
      messages: [{ role: "user", content: message }],
      maxOutputTokens: Math.min(800, version.max_response_words * 6),
      reasoningEffort: "none",
    });
    if (!generated.ok) return NextResponse.json({ success: false, code: generated.code, message: generated.message }, { status: generated.status });
    return NextResponse.json({
      success: true,
      data: {
        reply: generated.data,
        citations: cited.map((c) => ({ document_title: c.documentTitle, content: c.content.slice(0, 240), similarity: c.similarity })),
        ...(languageResolution ? { language: languageResolution } : {}),
      },
      meta: { mode: "live", request_id: randomUUID() },
    });
  }

  if (resource === "livekit") {
    const proxied = await proxyToGateway("/api/v1/livekit/token", {
      session_id: body.session_id,
      participant_identity: body.participant_identity ?? `guest-${randomUUID().slice(0, 8)}`,
      human_slug: body.human_slug,
      ...(flagEnabled("ENABLE_MULTILINGUAL") && typeof body.requested_language === "string" && body.requested_language ? { requested_language: body.requested_language } : {}),
    });
    if (proxied) return NextResponse.json({ success: true, data: proxied.data, meta: { mode: "live", request_id: randomUUID() } }, { status: proxied.status, headers: { "x-vowhumans-mode": "live" } });
    return NextResponse.json({ success: false, code: "PROVIDER_DISABLED", message: "LiveKit tokens are issued only by the configured server-side API gateway." }, { status: 503 });
  }

  const isPublicRequest=resource.endsWith("-requests") || (resource === "organisations" && !request.headers.get("authorization"));
  return previewResponse({ id: randomUUID(), resource, state: isPublicRequest ? "validated-preview" : "draft", persistent: false, message: "Validated in safe preview. Configure the production API to persist and deliver this request.", received_fields: Object.keys(body as object).filter(key=>!key.toLowerCase().includes("password")), disclosure_required: true }, isPublicRequest ? 202 : 201);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ route: string[] }> }) {
  const { route } = await params;
  if (route[0] === "webhooks" && route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const [deleted] = await sql`DELETE FROM webhooks WHERE id = ${route[1]} AND organisation_id = ${organisationId} RETURNING id`;
    if (!deleted) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ success: true, data: { id: deleted.id, deleted: true }, meta: { mode: "live", request_id: randomUUID() } }, { status: 202 });
  }
  if (route[0] === "digital-human-languages" && route[1] && route[2]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const [deleted] = await sql`DELETE FROM digital_human_language_voices WHERE organisation_id = ${organisationId} AND human_slug = ${route[1]} AND language_code = ${route[2]} RETURNING human_slug`;
    return response({ human_slug: route[1], language_code: route[2], deleted: Boolean(deleted) }, 202);
  }
  if (route[0] === "terminology" && route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const [deleted] = await sql`DELETE FROM terminology_entries WHERE id = ${route[1]} AND organisation_id = ${organisationId} RETURNING id`;
    return response({ id: route[1], deleted: Boolean(deleted) }, 202);
  }
  if (route[0] === "voices" && route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    // presenter_projects.voice_id is a real FK with no cascade — same SET NULL
    // reasoning as digital_human_id below: a project's script and already-rendered
    // scenes are independent artifacts once generated.
    await sql`UPDATE presenter_projects SET voice_id = NULL WHERE organisation_id = ${organisationId} AND voice_id = ${route[1]}`;
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
    // the row itself. presenter_projects.digital_human_id IS a real FK with no cascade
    // and, now that Presenter Studio actually writes to it, can genuinely block this
    // delete — SET NULL instead of failing: a project's script and already-rendered
    // scenes are independent artifacts once generated, same reasoning digital_human_
    // applications already applies by pinning its own persona_version_id rather than
    // staying live-linked. (sessions.digital_human_id is NOT NULL with no cascade
    // either, but nothing writes real rows there yet, so it still can't block this.)
    const deleted = await sql.begin(async (tx) => {
      await tx`DELETE FROM human_voice_assignments WHERE organisation_id = ${organisationId} AND human_slug = ${route[1]}`;
      await tx`DELETE FROM human_face_assignments WHERE organisation_id = ${organisationId} AND human_slug = ${route[1]}`;
      await tx`DELETE FROM human_gesture_assignments WHERE organisation_id = ${organisationId} AND human_slug = ${route[1]}`;
      await tx`DELETE FROM human_knowledge_assignments WHERE organisation_id = ${organisationId} AND human_slug = ${route[1]}`;
      await tx`DELETE FROM human_persona_assignments WHERE organisation_id = ${organisationId} AND human_slug = ${route[1]}`;
      await tx`UPDATE presenter_projects SET digital_human_id = NULL WHERE organisation_id = ${organisationId} AND digital_human_id = ${route[1]}`;
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
  if (route[0] === "presenter-projects" && route[1]) {
    const organisationId = await requireOrganisation(request);
    if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    // generated_videos.project_id has no ON DELETE CASCADE (unlike presenter_scenes,
    // which does) — delete its rows and their media_blobs explicitly first.
    const videoRows = await sql<{ object_key: string | null }[]>`
      SELECT object_key FROM generated_videos WHERE project_id = ${route[1]} AND organisation_id = ${organisationId}
    `;
    await sql`DELETE FROM generated_videos WHERE project_id = ${route[1]} AND organisation_id = ${organisationId}`;
    for (const row of videoRows) {
      if (row.object_key) await sql`DELETE FROM media_blobs WHERE object_key = ${row.object_key} AND organisation_id = ${organisationId}`;
    }
    const [deleted] = await sql`DELETE FROM presenter_projects WHERE id = ${route[1]} AND organisation_id = ${organisationId} RETURNING id`;
    return response({ id: route[1], deleted: Boolean(deleted) }, 202);
  }
  if (route[0] !== "sessions") return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
  return previewResponse({ id: route[1] ?? null, deletion: "mock-queued", private_content_included: false }, 202);
}

// New draft-only edit path — publishing forks a new version (POST persona-versions)
// instead of allowing in-place mutation, keeping the audit trail promise real.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ route: string[] }> }) {
  const { route } = await params;
  const organisationId = await requireOrganisation(request);
  if (!organisationId) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });

  if (route[0] === "organisations" && route[1] === "current") {
    const user = await requireUser(request);
    if (!user) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : null;
    const incoming = typeof body.settings === "object" && body.settings !== null ? body.settings as Record<string, unknown> : {};
    const settings: Record<string, unknown> = {};
    if (typeof incoming.primary_region === "string") settings.primary_region = incoming.primary_region.slice(0, 80);
    if (typeof incoming.default_language === "string") settings.default_language = incoming.default_language.slice(0, 20);
    if (typeof incoming.retention_days === "number" && [0, 7, 30, 90].includes(incoming.retention_days)) settings.retention_days = incoming.retention_days;
    if (typeof incoming.notifications === "object" && incoming.notifications !== null) {
      settings.notifications = Object.fromEntries(Object.entries(incoming.notifications as Record<string, unknown>).filter(([, value]) => typeof value === "boolean"));
    }
    if (!name && Object.keys(settings).length === 0) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "No supported settings were supplied." }, { status: 422 });
    const [row] = await sql`
      UPDATE organisations SET name = COALESCE(${name || null}, name), settings = settings || ${JSON.stringify(settings)}::jsonb, updated_at = now()
      WHERE id = ${organisationId}
      RETURNING id, name, slug, status, settings, created_at, updated_at
    `;
    await sql`
      INSERT INTO audit_logs (organisation_id, actor_user_id, action, resource_type, resource_id, after_state)
      VALUES (${organisationId}, ${user.id}, 'organisation.settings.updated', 'organisations', ${organisationId}, ${JSON.stringify({ name: row.name, settings: Object.keys(settings) })}::jsonb)
    `;
    return NextResponse.json({ success: true, data: row, meta: { mode: "live", request_id: randomUUID() } });
  }

  if (route[0] === "identities" && route[1]) {
    const user = await requireUser(request);
    if (!user) return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.state !== "revoked") return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Only revocation is supported after approval." }, { status: 422 });
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 5) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Provide a revocation reason." }, { status: 422 });
    const [row] = await sql`
      UPDATE identities SET state = 'revoked', revoked_at = now(), revocation_reason = ${reason}
      WHERE id = ${route[1]} AND organisation_id = ${organisationId} AND state <> 'revoked'
      RETURNING id, owner_name, display_name, state, revoked_at
    `;
    if (!row) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    await sql`UPDATE identity_consents SET state = 'revoked', revoked_at = now() WHERE identity_id = ${route[1]} AND organisation_id = ${organisationId} AND state <> 'revoked'`;
    await sql`INSERT INTO audit_logs (organisation_id, actor_user_id, action, resource_type, resource_id, after_state) VALUES (${organisationId}, ${user.id}, 'identity.revoked', 'identities', ${route[1]}, ${JSON.stringify({ state: "revoked", reason })}::jsonb)`;
    return NextResponse.json({ success: true, data: row, meta: { mode: "live", request_id: randomUUID() } });
  }

  if (route[0] === "api-keys" && route[1]) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.status !== "revoked") return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "API keys can only be revoked." }, { status: 422 });
    const [row] = await sql`UPDATE api_keys SET status = 'revoked' WHERE id = ${route[1]} AND organisation_id = ${organisationId} RETURNING id, name, prefix, scopes, status, expires_at, last_used_at, created_at`;
    if (!row) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ success: true, data: row, meta: { mode: "live", request_id: randomUUID() } });
  }

  if (route[0] === "webhooks" && route[1]) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const status = body.status === "active" ? "active" : body.status === "paused" ? "archived" : null;
    if (!status) return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Webhook status must be active or paused." }, { status: 422 });
    const [row] = await sql`
      UPDATE webhooks SET status = ${status}::lifecycle_state, paused_at = CASE WHEN ${status} = 'archived' THEN now() ELSE NULL END
      WHERE id = ${route[1]} AND organisation_id = ${organisationId}
      RETURNING id, name, endpoint_url, event_types, status, paused_at, last_delivery_at, last_status_code, consecutive_failures
    `;
    if (!row) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json({ success: true, data: row, meta: { mode: "live", request_id: randomUUID() } });
  }

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

  if (route[0] === "presenter-projects" && route[1]) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const [current] = await sql<{ state: string }[]>`SELECT state FROM presenter_projects WHERE id = ${route[1]} AND organisation_id = ${organisationId}`;
    if (!current) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
    if (current.state !== "draft") {
      return NextResponse.json({ success: false, code: "CONFLICT", message: "Only draft projects can be edited — delete and start a new one instead." }, { status: 409 });
    }

    const newScript = typeof body.script === "string" && body.script.trim() ? body.script.trim() : null;
    const aspectRatio = typeof body.aspect_ratio === "string" && ["16:9", "9:16", "1:1", "audio"].includes(body.aspect_ratio) ? body.aspect_ratio : null;

    const result = await sql.begin(async (tx) => {
      const [project] = await tx`
        UPDATE presenter_projects SET
          title = COALESCE(${typeof body.title === "string" && body.title.trim() ? body.title.trim() : null}, title),
          course = COALESCE(${typeof body.course === "string" ? body.course.trim() || null : null}, course),
          module = COALESCE(${typeof body.module === "string" ? body.module.trim() || null : null}, module),
          lesson = COALESCE(${typeof body.lesson === "string" ? body.lesson.trim() || null : null}, lesson),
          script = COALESCE(${newScript}, script),
          digital_human_id = COALESCE(${typeof body.digital_human_id === "string" ? body.digital_human_id : null}, digital_human_id),
          voice_id = COALESCE(${typeof body.voice_id === "string" ? body.voice_id : null}, voice_id),
          output_language = COALESCE(${typeof body.output_language === "string" && body.output_language.trim() ? body.output_language.trim() : null}, output_language),
          aspect_ratio = COALESCE(${aspectRatio}, aspect_ratio)
        WHERE id = ${route[1]} AND organisation_id = ${organisationId}
        RETURNING *
      `;
      // Editing the script re-splits scenes from scratch — safe only while still
      // draft (enforced above), since nothing has rendered against the old ones yet.
      const scenes: unknown[] = [];
      if (newScript) {
        await tx`DELETE FROM presenter_scenes WHERE project_id = ${route[1]} AND organisation_id = ${organisationId}`;
        const splitScenes = splitScriptIntoScenes(newScript);
        for (let i = 0; i < splitScenes.length; i += 1) {
          const [scene] = await tx`
            INSERT INTO presenter_scenes (organisation_id, project_id, ordinal, script, duration_ms, state)
            VALUES (${organisationId}, ${route[1]}, ${i}, ${splitScenes[i]}, ${estimateSceneDurationMs(splitScenes[i])}, 'draft')
            RETURNING *
          `;
          scenes.push(scene);
        }
      }
      return { project, scenes };
    });
    return NextResponse.json({ success: true, data: result, meta: { mode: "live", request_id: randomUUID() } });
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
      knowledge_base_ids = COALESCE(${Array.isArray(body.knowledge_base_ids) ? (body.knowledge_base_ids as string[]) : null}::uuid[], knowledge_base_ids),
      supported_languages = COALESCE(${Array.isArray(body.supported_languages) ? (body.supported_languages as string[]) : null}::text[], supported_languages),
      code_switching_policy = COALESCE(${["discouraged","allowed","encouraged"].includes(body.code_switching_policy as string) ? body.code_switching_policy as string : null}, code_switching_policy),
      translation_policy = COALESCE(${["never","fallback_only","always_offer"].includes(body.translation_policy as string) ? body.translation_policy as string : null}, translation_policy)
    WHERE id = ${route[1]} AND organisation_id = ${organisationId}
    RETURNING *
  `;
  return NextResponse.json({ success: true, data: version, meta: { mode: "live", request_id: randomUUID() } });
}
