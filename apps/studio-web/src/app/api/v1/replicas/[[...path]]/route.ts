import { createHash, randomUUID } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, readSession, type SessionUser } from "@/lib/auth";
import sql, { databaseConfigured } from "@/lib/db";
import { synthesizeSpeech } from "@/lib/openai";
import {
  createPrivateReplicaUpload,
  createPrivateReplicaDownload,
  completePrivateReplicaCapture,
  privateReplicaObjectKey,
  privateObjectStorageConfigured,
  privateObjectStorageProvider,
  PRIVATE_REPLICA_UPLOAD_CHUNK_BYTES,
  storePrivateReplicaCapture,
  storePrivateReplicaCapturePart,
  storePrivateReplicaManifest,
  verifyPrivateReplicaObject,
} from "@/lib/objectStorage";
import {
  isReplicaSegmentType,
  MAX_GUIDED_CAPTURE_BYTES,
  REQUIRED_CAPTURE_SEGMENTS,
  replicaCaptureReadiness,
  safeCaptureExtension,
  validateCompletePerformanceChapters,
  type ReplicaGesture,
  type ReplicaQualityMode,
} from "@/lib/replicas";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ path?: string[] }> };
const QUALITY_MODES = new Set<ReplicaQualityMode>(["standard", "premium", "presenter"]);
const GESTURES = new Set<ReplicaGesture>(["acknowledge", "explain", "emphasise", "reassure"]);
const VIDEO_TYPES = new Set(["video/webm", "video/mp4", "video/quicktime"]);
const MAX_CAPTURE_BYTES = 300 * 1024 * 1024;

function ok(data: unknown, status = 200) {
  return NextResponse.json(
    { success: true, data, meta: { mode: "live", request_id: randomUUID() } },
    { status, headers: { "x-vowhumans-mode": "live" } },
  );
}

function problem(message: string, code: string, status: number, details?: unknown) {
  return NextResponse.json(
    { success: false, code, message, ...(details ? { details } : {}), meta: { request_id: randomUUID() } },
    { status },
  );
}

async function authenticated(request: NextRequest): Promise<SessionUser | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return token ? readSession(token) : null;
}

async function identityConsentReady(organisationId: string, identityId: string) {
  const identities = await sql<{ state: string; commercial_use_confirmed: boolean; revoked_at: Date | null }[]>`
    SELECT state, commercial_use_confirmed, revoked_at FROM identities
    WHERE id=${identityId} AND organisation_id=${organisationId} LIMIT 1
  `;
  const identity = identities[0];
  if (!identity || identity.state !== "approved" || identity.revoked_at || !identity.commercial_use_confirmed) {
    return { ready: false, missing: ["approved identity and commercial-use confirmation"] };
  }
  const consents = await sql<{ consent_type: string }[]>`
    SELECT DISTINCT consent_type FROM identity_consents
    WHERE organisation_id=${organisationId} AND identity_id=${identityId}
      AND state='approved' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())
      AND consent_type IN ('face','commercial')
  `;
  const types = new Set(consents.map((row) => row.consent_type));
  const missing = ["face", "commercial"].filter((type) => !types.has(type));
  return { ready: missing.length === 0, missing: missing.map((type) => `${type} consent`) };
}

async function findProfile(organisationId: string, profileId: string) {
  const rows = await sql<{
    id: string; identity_id: string; status: string; active_version_id: string | null;
    renderer_tier: string; capture_session_id: string | null; capture_status: string | null;
  }[]>`
    SELECT rp.id, rp.identity_id, rp.status, rp.active_version_id, rp.renderer_tier,
      rcs.id AS capture_session_id, rcs.status AS capture_status
    FROM replica_profiles rp
    LEFT JOIN LATERAL (
      SELECT id, status FROM replica_capture_sessions
      WHERE replica_profile_id=rp.id ORDER BY created_at DESC LIMIT 1
    ) rcs ON true
    WHERE rp.id=${profileId} AND rp.organisation_id=${organisationId} LIMIT 1
  `;
  return rows[0] ?? null;
}

async function bodyObject(request: NextRequest): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("INVALID_BODY");
  return body as Record<string, unknown>;
}

function databaseFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/replica_(profiles|capture|versions)|does not exist/i.test(message)) {
    return problem("Photoreal Replica database setup is incomplete. Apply PostgreSQL migration 021, then try again.", "REPLICA_SCHEMA_REQUIRED", 503);
  }
  console.error("[replicas-api]", error);
  return problem("The replica request could not be completed.", "REPLICA_REQUEST_FAILED", 500);
}

function storageFailure(error: unknown) {
  console.error("[replica-capture-upload]", error);
  return problem(
    "Private storage could not accept this capture. Verify the active Afrihost or S3 storage configuration, then retry.",
    "OBJECT_STORAGE_UPLOAD_FAILED",
    502,
  );
}

type ProcessorClip = {
  segment_id: string;
  segment_type: string;
  gesture_key: string | null;
  object_key: string;
  sha256: string;
  starts_neutral: boolean;
  ends_neutral: boolean;
  trim_start_ms?: number;
  trim_end_ms?: number;
  source_duration_ms?: number;
  duration_ms?: number;
  fps?: number;
};

type StoredCaptureSegment = ProcessorClip & {
  state: string;
  metadata: unknown;
  created_at: Date;
};

function processingClip(segment: StoredCaptureSegment): ProcessorClip {
  const metadata = segment.metadata && typeof segment.metadata === "object" && !Array.isArray(segment.metadata)
    ? segment.metadata as Record<string, unknown>
    : {};
  const trimStart = Number(metadata.trim_start_ms);
  const trimEnd = Number(metadata.trim_end_ms);
  const sourceDuration = Number(segment.source_duration_ms ?? metadata.source_duration_ms);
  const duration = Number(segment.duration_ms);
  const fps = Number(segment.fps);
  return {
    segment_id: segment.segment_id,
    segment_type: segment.segment_type,
    gesture_key: segment.gesture_key,
    object_key: segment.object_key,
    sha256: segment.sha256,
    starts_neutral: segment.starts_neutral,
    ends_neutral: segment.ends_neutral,
    ...(Number.isSafeInteger(trimStart) && Number.isSafeInteger(trimEnd) && trimEnd > trimStart
      ? { trim_start_ms: trimStart, trim_end_ms: trimEnd }
      : {}),
    ...(Number.isSafeInteger(sourceDuration) && sourceDuration > 0
      ? { source_duration_ms: sourceDuration }
      : {}),
    ...(Number.isSafeInteger(duration) && duration > 0 ? { duration_ms: duration } : {}),
    ...(Number.isFinite(fps) && fps > 0 ? { fps } : {}),
  };
}

function latestRequiredProcessingClips(segments: StoredCaptureSegment[]) {
  return REQUIRED_CAPTURE_SEGMENTS.map((requirement) => segments.find((segment) =>
    segment.state === "uploaded"
    && segment.segment_type === requirement.type
    && (!requirement.gesture || segment.gesture_key === requirement.gesture),
  )).filter((segment): segment is StoredCaptureSegment => Boolean(segment)).map(processingClip);
}

type ProcessorResult = {
  manifest: Record<string, unknown> & { clips?: Array<Record<string, unknown>> };
  checks: Array<{ code: string; status: "passed" | "warning" | "failed" | "blocked" | "not_tested"; measured_value?: number; threshold_value?: number; unit?: string; detail?: Record<string, unknown> }>;
  detail?: unknown;
};

async function dispatchReplicaProcessing(input: { jobId: string; organisationId: string; profileId: string; clips: ProcessorClip[] }) {
  const processorUrl = process.env.REPLICA_PROCESSOR_URL?.replace(/\/$/, "");
  const internalKey = process.env.VOWHUMANS_INTERNAL_KEY;
  if (!processorUrl || !internalKey) return;
  try {
    await sql`UPDATE replica_processing_jobs SET status='running', progress=5, started_at=now() WHERE id=${input.jobId} AND organisation_id=${input.organisationId}`;
    const clips = await Promise.all(input.clips.map(async (clip) => ({ ...clip, object_url: await createPrivateReplicaDownload(clip.object_key) })));
    const processorResponse = await fetch(`${processorUrl}/internal/v1/process`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-key": internalKey },
      body: JSON.stringify({ job_id: input.jobId, profile_id: input.profileId, clips }),
      signal: AbortSignal.timeout(240_000),
    });
    const result = await processorResponse.json().catch(() => null) as ProcessorResult | null;
    if (!processorResponse.ok) {
      const detail = typeof result?.detail === "string" && /^CAPTURE_[A-Z0-9_]{3,64}$/.test(result.detail) ? result.detail : null;
      throw new Error(detail ?? `PROCESSOR_${processorResponse.status}`);
    }
    if (!result?.manifest || !Array.isArray(result.checks)) throw new Error("PROCESSOR_INVALID_RESPONSE");
    const failed = result.checks.some((check) => check.status === "failed" || check.status === "blocked");
    const versions = await sql<{ version: number }[]>`SELECT COALESCE(max(version),0)::int + 1 AS version FROM replica_versions WHERE replica_profile_id=${input.profileId}`;
    const version = Number(versions[0]?.version ?? 1);
    const manifestJson = JSON.stringify(result.manifest);
    const manifestSha256 = createHash("sha256").update(manifestJson).digest("hex");
    const manifestObjectKey = await storePrivateReplicaManifest({ organisationId: input.organisationId, profileId: input.profileId, version, manifest: result.manifest, sha256: manifestSha256 });
    const versionId = randomUUID();
    await sql.begin(async (transaction) => {
      await transaction`
        INSERT INTO replica_versions (id, organisation_id, replica_profile_id, version, provider, state, manifest_object_key, manifest_sha256, capability_snapshot)
        VALUES (${versionId}, ${input.organisationId}, ${input.profileId}, ${version}, 'musetalk-video-replica', ${failed ? "failed" : "quality_review"}, ${manifestObjectKey}, ${manifestSha256}, ${transaction.json({ captured_motion: true, mouth_only_retargeting: true, streaming_validated: false })})
      `;
      for (const check of result.checks) {
        await transaction`
          INSERT INTO replica_quality_checks (organisation_id, replica_profile_id, replica_version_id, check_code, status, measured_value, threshold_value, unit, safe_detail)
          VALUES (${input.organisationId}, ${input.profileId}, ${versionId}, ${check.code}, ${check.status}, ${check.measured_value ?? null}, ${check.threshold_value ?? null}, ${check.unit ?? null}, ${transaction.json(JSON.parse(JSON.stringify(check.detail ?? {})))})
        `;
      }
      for (const rawClip of result.manifest.clips ?? []) {
        const clip = rawClip as { segment_id?: string; key?: string; state?: string; gesture_key?: string | null; object_key?: string; sha256?: string; duration_ms?: number; fps?: number; frame_count?: number; starts_neutral?: boolean; ends_neutral?: boolean; trim_start_ms?: number; trim_end_ms?: number };
        if (!clip.segment_id || !clip.key || !clip.state || !clip.object_key || !clip.sha256 || !clip.duration_ms || !clip.fps || !clip.frame_count) continue;
        await transaction`
          INSERT INTO replica_motion_clips (organisation_id, replica_version_id, source_segment_id, clip_key, conversation_state, gesture_key, object_key, sha256, duration_ms, fps, frame_count, starts_neutral, ends_neutral, metadata)
          VALUES (${input.organisationId}, ${versionId}, ${clip.segment_id}, ${clip.key}, ${clip.state}, ${clip.gesture_key ?? null}, ${clip.object_key}, ${clip.sha256}, ${clip.duration_ms}, ${clip.fps}, ${clip.frame_count}, ${clip.starts_neutral === true}, ${clip.ends_neutral === true}, ${transaction.json({ trim_start_ms: clip.trim_start_ms ?? null, trim_end_ms: clip.trim_end_ms ?? null })})
        `;
      }
      await transaction`UPDATE replica_processing_jobs SET status='completed', progress=100, output_manifest_object_key=${manifestObjectKey}, safe_metrics=${transaction.json({ check_count: result.checks.length, failed })}, completed_at=now() WHERE id=${input.jobId} AND organisation_id=${input.organisationId}`;
      await transaction`UPDATE replica_profiles SET status=${failed ? "failed" : "quality_review"}, updated_at=now() WHERE id=${input.profileId} AND organisation_id=${input.organisationId}`;
    });
  } catch (error) {
    const safeCode = error instanceof Error && /^(?:PROCESSOR_(?:\d+|INVALID_RESPONSE)|CAPTURE_[A-Z0-9_]{3,64})$/.test(error.message) ? error.message : "PROCESSOR_FAILED";
    console.error("[replica-processor-dispatch]", error);
    await sql`UPDATE replica_processing_jobs SET status='failed', safe_error_code=${safeCode}, completed_at=now() WHERE id=${input.jobId} AND organisation_id=${input.organisationId}`.catch(() => undefined);
    await sql`UPDATE replica_profiles SET status='failed', updated_at=now() WHERE id=${input.profileId} AND organisation_id=${input.organisationId}`.catch(() => undefined);
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  if (!databaseConfigured) return problem("PostgreSQL is not configured.", "DATABASE_NOT_CONFIGURED", 503);
  const user = await authenticated(request);
  if (!user) return problem("Sign in to manage photoreal replicas.", "UNAUTHORISED", 401);
  const { path = [] } = await context.params;
  try {
    if (path.length === 0) {
      const items = await sql`
        SELECT rp.id, rp.name, rp.human_slug, rp.renderer_tier, rp.status, rp.quality_mode,
          rp.provider, rp.active_version_id, rp.approved_at, rp.updated_at,
          i.display_name AS identity_name,
          (SELECT count(*)::int FROM replica_capture_segments rseg
            JOIN replica_capture_sessions rcs ON rcs.id=rseg.capture_session_id
            WHERE rcs.replica_profile_id=rp.id AND rseg.state <> 'deleted') AS segment_count
        FROM replica_profiles rp JOIN identities i ON i.id=rp.identity_id
        WHERE rp.organisation_id=${user.organisationId}
        ORDER BY rp.updated_at DESC
      `;
      return ok({
        items,
        storage_configured: privateObjectStorageConfigured(),
        feature_flags: {
          video_replica: process.env.ENABLE_VIDEO_REPLICA === "true",
          streaming_replica: process.env.ENABLE_STREAMING_REPLICA === "true",
          replica_gestures: process.env.ENABLE_REPLICA_GESTURES === "true",
          rigged_3d: process.env.ENABLE_RIGGED_3D === "true",
        },
      });
    }
    if (path.length === 2 && path[1] === "source-preview") {
      const profile = await findProfile(user.organisationId, path[0]);
      if (!profile) return problem("Replica profile not found.", "NOT_FOUND", 404);
      const clips = await sql<{ object_key: string }[]>`
        SELECT rmc.object_key FROM replica_motion_clips rmc
        JOIN replica_versions rv ON rv.id=rmc.replica_version_id AND rv.organisation_id=rmc.organisation_id
        WHERE rmc.organisation_id=${user.organisationId} AND rv.replica_profile_id=${profile.id}
          AND rmc.conversation_state='idle' AND rv.state IN ('quality_review','published')
        ORDER BY rv.version DESC, rmc.created_at LIMIT 1
      `;
      if (!clips[0]) return problem("No processed idle source is available for comparison.", "SOURCE_PREVIEW_NOT_FOUND", 404);
      const source = await fetch(await createPrivateReplicaDownload(clips[0].object_key), { cache: "no-store", signal: AbortSignal.timeout(60_000) });
      if (!source.ok) return problem("The private source preview could not be loaded.", "SOURCE_PREVIEW_FAILED", 502);
      return new NextResponse(source.body, { status: 200, headers: { "content-type": source.headers.get("content-type") || "video/mp4", "cache-control": "private, no-store" } });
    }
    if (path.length !== 1) return problem("Replica route not found.", "NOT_FOUND", 404);
    const profile = await findProfile(user.organisationId, path[0]);
    if (!profile) return problem("Replica profile not found.", "NOT_FOUND", 404);
    const [details] = await sql`
      SELECT rp.*, i.display_name AS identity_name, i.state AS identity_state
      FROM replica_profiles rp JOIN identities i ON i.id=rp.identity_id
      WHERE rp.id=${profile.id} AND rp.organisation_id=${user.organisationId}
    `;
    const segments = profile.capture_session_id ? await sql`
      SELECT id, segment_type, gesture_key, expression_key, media_type, byte_size,
        duration_ms, width, height, fps, starts_neutral, ends_neutral, state, metadata, created_at
      FROM replica_capture_segments
      WHERE organisation_id=${user.organisationId} AND capture_session_id=${profile.capture_session_id}
      ORDER BY created_at
    ` : [];
    const qualityChecks = await sql`
      SELECT check_code, status, measured_value, threshold_value, unit, safe_detail, checked_at
      FROM replica_quality_checks WHERE organisation_id=${user.organisationId}
        AND replica_profile_id=${profile.id} ORDER BY checked_at DESC
    `;
    const jobs = await sql`
      SELECT id, status, progress, safe_error_code, safe_metrics, created_at, completed_at
      FROM replica_processing_jobs WHERE organisation_id=${user.organisationId}
        AND replica_profile_id=${profile.id} ORDER BY created_at DESC
    `;
    const assignments = await sql`
      SELECT human_slug, replica_version_id, enabled, assigned_at
      FROM human_replica_assignments
      WHERE organisation_id=${user.organisationId} AND replica_profile_id=${profile.id}
      ORDER BY assigned_at DESC LIMIT 1
    `;
    return ok({ profile: details, assignment: assignments[0] ?? null, capture_session: profile.capture_session_id ? { id: profile.capture_session_id, status: profile.capture_status } : null, segments, quality_checks: qualityChecks, jobs, readiness: replicaCaptureReadiness(segments as never[]) });
  } catch (error) {
    return databaseFailure(error);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  if (!databaseConfigured) return problem("PostgreSQL is not configured.", "DATABASE_NOT_CONFIGURED", 503);
  const user = await authenticated(request);
  if (!user) return problem("Sign in to manage photoreal replicas.", "UNAUTHORISED", 401);
  const { path = [] } = await context.params;
  const guidedUpload = path.length === 4 && path[1] === "segments" && path[3] === "content";
  const chunkedUpload = path.length === 6 && path[1] === "segments" && path[3] === "content" && path[4] === "parts";
  if (!guidedUpload && !chunkedUpload) {
    return problem("Replica route not found.", "NOT_FOUND", 404);
  }

  const declaredLength = Number(request.headers.get("content-length"));
  const requestLimit = chunkedUpload ? PRIVATE_REPLICA_UPLOAD_CHUNK_BYTES : MAX_GUIDED_CAPTURE_BYTES;
  if (Number.isFinite(declaredLength) && declaredLength > requestLimit) {
    return problem(chunkedUpload ? "This private upload part is too large." : "This guided capture is too large. Record a clip of 12 seconds or less and retry.", "CAPTURE_TOO_LARGE", 413);
  }

  const profileId = path[0];
  const segmentId = path[2];
  try {
    const profile = await findProfile(user.organisationId, profileId);
    if (!profile) return problem("Replica profile not found.", "NOT_FOUND", 404);
    if (profile.status === "revoked") return problem("This replica has been revoked.", "REPLICA_REVOKED", 409);
    const rows = await sql<{ object_key: string; byte_size: number; sha256: string; media_type: string }[]>`
      SELECT rseg.object_key, rseg.byte_size, rseg.sha256, rseg.media_type
      FROM replica_capture_segments rseg JOIN replica_capture_sessions rcs ON rcs.id=rseg.capture_session_id
      WHERE rseg.id=${segmentId} AND rseg.organisation_id=${user.organisationId}
        AND rcs.replica_profile_id=${profileId} AND rseg.state='upload_pending' LIMIT 1
    `;
    const segment = rows[0];
    if (!segment) return problem("Pending segment not found.", "NOT_FOUND", 404);
    if (guidedUpload && Number(segment.byte_size) > MAX_GUIDED_CAPTURE_BYTES) {
      return problem("This endpoint accepts guided capture clips only.", "CAPTURE_TOO_LARGE", 413);
    }

    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength < 1 || bytes.byteLength > requestLimit) {
      return problem("This private upload part has an invalid size.", "CAPTURE_TOO_LARGE", 413);
    }
    if (guidedUpload && bytes.byteLength !== Number(segment.byte_size)) {
      return problem("Capture size changed during upload. Record the clip again.", "UPLOAD_SIZE_MISMATCH", 409);
    }
    const actualSha256 = createHash("sha256").update(bytes).digest("hex");
    const declaredSha256 = request.headers.get("x-vowhumans-sha256")?.toLowerCase();
    if (guidedUpload && (actualSha256 !== segment.sha256 || (declaredSha256 && declaredSha256 !== segment.sha256))) {
      return problem("Capture integrity verification failed. Record the clip again.", "UPLOAD_INTEGRITY_FAILED", 409);
    }
    const contentType = request.headers.get("content-type")?.split(";")[0] ?? "";
    if (contentType !== segment.media_type || !VIDEO_TYPES.has(contentType)) {
      return problem("Capture media type did not match the upload intent.", "UPLOAD_MEDIA_MISMATCH", 409);
    }

    try {
      if (chunkedUpload) {
        const partNumber = Number(path[5]);
        const totalParts = Number(request.headers.get("x-vowhumans-total-parts"));
        const partSha256 = request.headers.get("x-vowhumans-part-sha256")?.toLowerCase() ?? "";
        const expectedTotalParts = Math.ceil(Number(segment.byte_size) / PRIVATE_REPLICA_UPLOAD_CHUNK_BYTES);
        const expectedPartBytes = Math.min(PRIVATE_REPLICA_UPLOAD_CHUNK_BYTES, Number(segment.byte_size) - (partNumber - 1) * PRIVATE_REPLICA_UPLOAD_CHUNK_BYTES);
        if (!Number.isSafeInteger(partNumber) || partNumber < 1 || totalParts !== expectedTotalParts || partNumber > totalParts || bytes.byteLength !== expectedPartBytes) {
          return problem("Private upload part order or size did not match the upload intent.", "UPLOAD_PART_MISMATCH", 409);
        }
        if (!/^[a-f0-9]{64}$/.test(partSha256) || actualSha256 !== partSha256) {
          return problem("Private upload part integrity verification failed.", "UPLOAD_INTEGRITY_FAILED", 409);
        }
        await storePrivateReplicaCapturePart({ objectKey: segment.object_key, contentType, partNumber, totalParts, partSha256, body: bytes });
        return ok({ id: segmentId, state: "part-stored", part_number: partNumber, total_parts: totalParts, integrity_verified: true });
      }
      await storePrivateReplicaCapture({ objectKey: segment.object_key, contentType, sha256: segment.sha256, body: bytes });
    } catch (error) {
      return storageFailure(error);
    }
    return ok({ id: segmentId, state: "stored", integrity_verified: true });
  } catch (error) {
    return databaseFailure(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!databaseConfigured) return problem("PostgreSQL is not configured.", "DATABASE_NOT_CONFIGURED", 503);
  const user = await authenticated(request);
  if (!user) return problem("Sign in to manage photoreal replicas.", "UNAUTHORISED", 401);
  const { path = [] } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = await bodyObject(request);
  } catch {
    return problem("A JSON object is required.", "INVALID_BODY", 400);
  }

  try {
    if (path.length === 0) {
      const identityId = typeof body.identity_id === "string" ? body.identity_id : "";
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const humanSlug = typeof body.human_slug === "string" ? body.human_slug.trim() : "";
      const digitalHumanId = typeof body.digital_human_id === "string" ? body.digital_human_id : null;
      const qualityMode = QUALITY_MODES.has(body.quality_mode as ReplicaQualityMode) ? body.quality_mode as ReplicaQualityMode : "standard";
      if (!identityId || !name || (!humanSlug && !digitalHumanId)) return problem("Identity, name and a Digital Human are required.", "VALIDATION_ERROR", 422);
      const consent = await identityConsentReady(user.organisationId, identityId);
      if (!consent.ready) return problem("Approved likeness and commercial consent are required before capture.", "CONSENT_REQUIRED", 409, { missing: consent.missing });
      const profileId = randomUUID();

      if (body.renderer_tier === "rigged_3d") {
        if (!new Set(["owner", "admin", "reviewer"]).has(user.role)) return problem("A reviewer or administrator must import a rigged character.", "FORBIDDEN", 403);
        const characterManifestRef = typeof body.character_manifest_ref === "string" ? body.character_manifest_ref.trim() : "";
        if (!/^ue5\.8:\/Game\/[A-Za-z0-9_\-/]{3,500}$/.test(characterManifestRef)) {
          return problem("A UE 5.8 Blueprint reference is required, for example ue5.8:/Game/MetaHumans/Ada/BP_Ada.", "VALIDATION_ERROR", 422);
        }
        const versionId = randomUUID();
        const manifestSha256 = createHash("sha256").update(characterManifestRef).digest("hex");
        const checks = ["metahuman_rig_integrity", "facial_animation_review", "body_motion_review", "pixel_streaming_latency"];
        await sql.begin(async (transaction) => {
          await transaction`
            INSERT INTO replica_profiles (id, organisation_id, digital_human_id, human_slug, identity_id, name, renderer_tier, quality_mode, provider, status, created_by)
            VALUES (${profileId}, ${user.organisationId}, ${digitalHumanId}, ${humanSlug || null}, ${identityId}, ${name}, 'rigged_3d', ${qualityMode}, 'unreal-metahuman-5.8', 'quality_review', ${user.id})
          `;
          await transaction`
            INSERT INTO replica_versions (id, organisation_id, replica_profile_id, version, provider, state, manifest_object_key, manifest_sha256, capability_snapshot)
            VALUES (${versionId}, ${user.organisationId}, ${profileId}, 1, 'unreal-metahuman-5.8', 'quality_review', ${characterManifestRef}, ${manifestSha256}, ${transaction.json({ unreal_engine: "5.8", rigged_body: true, rigged_face: true, pixel_streaming_2: true, streaming_validated: false })})
          `;
          for (const check of checks) {
            await transaction`
              INSERT INTO replica_quality_checks (organisation_id, replica_profile_id, replica_version_id, check_code, status, safe_detail)
              VALUES (${user.organisationId}, ${profileId}, ${versionId}, ${check}, 'not_tested', ${transaction.json({ source: "rigged_3d_import" })})
            `;
          }
        });
        return ok({ id: profileId, version_id: versionId, status: "quality_review", renderer_tier: "rigged_3d", required_checks: checks }, 201);
      }

      const captureSessionId = randomUUID();
      await sql.begin(async (transaction) => {
        await transaction`
          INSERT INTO replica_profiles (id, organisation_id, digital_human_id, human_slug, identity_id, name, quality_mode, status, created_by)
          VALUES (${profileId}, ${user.organisationId}, ${digitalHumanId}, ${humanSlug || null}, ${identityId}, ${name}, ${qualityMode}, 'capturing', ${user.id})
        `;
        await transaction`
          INSERT INTO replica_capture_sessions (id, organisation_id, replica_profile_id, identity_id, status, consent_scope, consent_verified_at)
          VALUES (${captureSessionId}, ${user.organisationId}, ${profileId}, ${identityId}, 'consent_verified', ${transaction.json({ likeness: true, commercial: true })}, now())
        `;
      });
      return ok({ id: profileId, capture_session_id: captureSessionId, status: "capturing", next_step: 2 }, 201);
    }

    const profileId = path[0];
    const action = path[1];
    const profile = await findProfile(user.organisationId, profileId);
    if (!profile) return problem("Replica profile not found.", "NOT_FOUND", 404);
    if (profile.status === "revoked") return problem("This replica has been revoked.", "REPLICA_REVOKED", 409);

    if (action === "preview" && path.length === 2) {
      if (!new Set(["owner", "admin", "reviewer"]).has(user.role)) return problem("A reviewer or administrator must generate a replica preview.", "FORBIDDEN", 403);
      const workerUrl = (process.env.AVATAR_WORKER_URL || process.env.GPU_WORKER_URL || "").replace(/\/$/, "");
      const internalKey = process.env.VOWHUMANS_INTERNAL_KEY || "";
      if (!workerUrl || !internalKey) return problem("The staged GPU renderer is not configured. Configure AVATAR_WORKER_URL and its matching internal key before Step 11.", "REPLICA_RENDERER_NOT_CONFIGURED", 503);
      const versions = await sql<{ id: string; state: string }[]>`
        SELECT id, state FROM replica_versions WHERE organisation_id=${user.organisationId}
          AND replica_profile_id=${profileId} AND state IN ('quality_review','published')
        ORDER BY version DESC LIMIT 1
      `;
      const version = versions[0];
      if (!version) return problem("A processed version in quality review is required before generating a preview.", "PROCESSING_REQUIRED", 409);
      const clips = await sql<{
        key: string; state: string; gesture_key: string | null; intensity: number; object_key: string; sha256: string;
        starts_neutral: boolean; ends_neutral: boolean; trim_start_ms: number | null; trim_end_ms: number | null;
      }[]>`
        SELECT clip_key AS key, conversation_state AS state, gesture_key, intensity, object_key, sha256,
          starts_neutral, ends_neutral,
          CASE WHEN metadata->>'trim_start_ms' ~ '^[0-9]+$' THEN (metadata->>'trim_start_ms')::integer END AS trim_start_ms,
          CASE WHEN metadata->>'trim_end_ms' ~ '^[0-9]+$' THEN (metadata->>'trim_end_ms')::integer END AS trim_end_ms
        FROM replica_motion_clips WHERE organisation_id=${user.organisationId} AND replica_version_id=${version.id}
        ORDER BY conversation_state, clip_key
      `;
      if (!clips.some((clip) => clip.state === "idle") || !clips.some((clip) => clip.state === "speaking")) {
        return problem("The processed motion manifest is incomplete.", "REPLICA_MANIFEST_INCOMPLETE", 409);
      }
      const speech = await synthesizeSpeech("Hello, I am Thandi's staged photoreal replica preview. Please review my mouth movement and preserved natural motion.", process.env.REPLICA_PREVIEW_VOICE || "marin");
      if (!speech.ok) return problem(speech.message, speech.code, speech.status);
      let replicaId = "";
      const startedAt = Date.now();
      try {
        const prepareForm = new FormData();
        const manifestClips: Array<Record<string, unknown>> = [];
        const sources = new Map<string, Blob>();
        for (const clip of clips) {
          const sourceKey = clip.sha256;
          if (!sources.has(sourceKey)) {
            const capture = await fetch(await createPrivateReplicaDownload(clip.object_key), { cache: "no-store", signal: AbortSignal.timeout(60_000) });
            if (!capture.ok) throw new Error("PRIVATE_CAPTURE_DOWNLOAD_FAILED");
            sources.set(sourceKey, await capture.blob());
          }
          manifestClips.push({ key: clip.key, state: clip.state, gesture_key: clip.gesture_key, intensity: clip.intensity, starts_neutral: clip.starts_neutral, ends_neutral: clip.ends_neutral, source_key: sourceKey, ...(clip.trim_start_ms !== null ? { trim_start_ms: clip.trim_start_ms } : {}), ...(clip.trim_end_ms !== null ? { trim_end_ms: clip.trim_end_ms } : {}) });
        }
        prepareForm.set("manifest_json", JSON.stringify({ clips: manifestClips }));
        for (const [sourceKey, source] of sources) prepareForm.set(`source__${sourceKey}`, source, `${sourceKey}.mp4`);
        const prepared = await fetch(`${workerUrl}/internal/v1/replicas`, { method: "POST", headers: { "x-internal-key": internalKey }, body: prepareForm, signal: AbortSignal.timeout(180_000) });
        if (!prepared.ok) {
          const detail = await prepared.text().catch(() => "");
          let workerMessage = "";
          try {
            const parsed = JSON.parse(detail) as { detail?: unknown };
            if (typeof parsed.detail === "string") workerMessage = parsed.detail.replace(/[\r\n]+/g, " ").slice(0, 500);
          } catch {
            workerMessage = detail.replace(/[\r\n]+/g, " ").slice(0, 500);
          }
          console.error("[replica-preview] GPU preparation failed", { status: prepared.status, detail: workerMessage });
          return problem(
            detail.includes("Video Replica is disabled")
              ? "The GPU worker is reachable, but Video Replica rendering is disabled there. Enable ENABLE_VIDEO_REPLICA on the GPU worker, restart it, and retry Step 11."
              : `The staged GPU worker could not prepare this replica preview.${workerMessage ? ` ${workerMessage}` : ""}`,
            "REPLICA_PREVIEW_PREPARE_FAILED",
            503,
          );
        }
        replicaId = String(((await prepared.json()) as { replica_id?: string }).replica_id || "");
        if (!replicaId) return problem("The GPU worker did not return a prepared replica.", "REPLICA_PREVIEW_PREPARE_FAILED", 502);
        const renderForm = new FormData();
        renderForm.set("replica_id", replicaId);
        renderForm.set("conversation_state", "speaking");
        renderForm.set("audio_file", new Blob([new Uint8Array(speech.data)], { type: "audio/wav" }), "preview.wav");
        const rendered = await fetch(`${workerUrl}/internal/v1/replica-render`, { method: "POST", headers: { "x-internal-key": internalKey }, body: renderForm, signal: AbortSignal.timeout(240_000) });
        if (!rendered.ok) {
          const detail = await rendered.text().catch(() => "");
          let workerMessage = "";
          try {
            const parsed = JSON.parse(detail) as { detail?: unknown };
            if (typeof parsed.detail === "string") workerMessage = parsed.detail.replace(/[\r\n]+/g, " ").slice(0, 500);
          } catch {
            workerMessage = detail.replace(/[\r\n]+/g, " ").slice(0, 500);
          }
          console.error("[replica-preview] GPU render failed", { status: rendered.status, detail: workerMessage });
          return problem(`The GPU worker could not render the staged replica preview.${workerMessage ? ` ${workerMessage}` : ""}`, "REPLICA_PREVIEW_RENDER_FAILED", 502);
        }
        const bytes = await rendered.arrayBuffer();
        return new NextResponse(bytes, { status: 200, headers: { "content-type": rendered.headers.get("content-type") || "video/mp4", "cache-control": "private, no-store", "x-vowhumans-preview-latency-ms": String(Date.now() - startedAt), "x-vowhumans-render-ms": rendered.headers.get("x-vowhumans-render-ms") || "" } });
      } catch (error) {
        console.error("[replica-preview]", error);
        return problem("The staged replica preview could not be generated. Check the private capture connection and GPU worker.", "REPLICA_PREVIEW_FAILED", 502);
      } finally {
        if (replicaId) void fetch(`${workerUrl}/internal/v1/replicas/${replicaId}`, { method: "DELETE", headers: { "x-internal-key": internalKey } }).catch(() => undefined);
      }
    }

    if (action === "upload-intents" && path.length === 2) {
      if (!privateObjectStorageConfigured()) return problem("Private object storage must be configured before biometric capture.", "OBJECT_STORAGE_NOT_CONFIGURED", 503);
      if (!profile.capture_session_id) return problem("No active capture session exists.", "CAPTURE_SESSION_REQUIRED", 409);
      const segmentType = body.segment_type;
      const gestureKey = typeof body.gesture_key === "string" ? body.gesture_key as ReplicaGesture : null;
      const contentType = typeof body.content_type === "string" ? body.content_type : "";
      const fileName = typeof body.file_name === "string" ? body.file_name : "capture.webm";
      const sha256 = typeof body.sha256 === "string" ? body.sha256.toLowerCase() : "";
      const byteSize = Number(body.byte_size);
      if (!isReplicaSegmentType(segmentType) || !VIDEO_TYPES.has(contentType) || !/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > MAX_CAPTURE_BYTES) {
        return problem("A supported video type, SHA-256 hash and valid file size are required.", "VALIDATION_ERROR", 422);
      }
      if (segmentType === "gesture" && (!gestureKey || !GESTURES.has(gestureKey))) return problem("A supported gesture key is required.", "VALIDATION_ERROR", 422);
      const sameOriginUpload = body.transport === "same-origin";
      const chunkedUpload = body.transport === "same-origin-chunked" && privateObjectStorageProvider() === "afrihost";
      if (sameOriginUpload && byteSize > MAX_GUIDED_CAPTURE_BYTES) {
        return problem("Guided captures must be 12 seconds or less. Use the complete-video uploader for larger files.", "CAPTURE_TOO_LARGE", 413);
      }
      const segmentId = randomUUID();
      const extension = safeCaptureExtension(fileName, contentType);
      const upload = sameOriginUpload || chunkedUpload
        ? {
            objectKey: privateReplicaObjectKey({ organisationId: user.organisationId, profileId, captureSessionId: profile.capture_session_id, segmentId, extension }),
            uploadUrl: `/api/v1/replicas/${profileId}/segments/${segmentId}/content`,
            requiredHeaders: { "content-type": contentType, "x-vowhumans-sha256": sha256 },
            expiresInSeconds: 15 * 60,
          }
        : await createPrivateReplicaUpload({ organisationId: user.organisationId, profileId, captureSessionId: profile.capture_session_id, segmentId, extension, contentType, sha256 });
      await sql`
        INSERT INTO replica_capture_segments (
          id, organisation_id, capture_session_id, segment_type, gesture_key,
          object_key, sha256, media_type, byte_size, state
        ) VALUES (
          ${segmentId}, ${user.organisationId}, ${profile.capture_session_id}, ${segmentType}, ${gestureKey},
          ${upload.objectKey}, ${sha256}, ${contentType}, ${byteSize}, 'upload_pending'
        )
      `;
      return ok({
        segment_id: segmentId,
        upload_url: upload.uploadUrl,
        required_headers: upload.requiredHeaders,
        expires_in_seconds: upload.expiresInSeconds,
        upload_transport: sameOriginUpload ? "same-origin" : chunkedUpload ? "same-origin-chunked" : "presigned-put",
        ...(chunkedUpload ? { chunk_size_bytes: PRIVATE_REPLICA_UPLOAD_CHUNK_BYTES, total_parts: Math.ceil(byteSize / PRIVATE_REPLICA_UPLOAD_CHUNK_BYTES) } : {}),
      }, 201);
    }

    if (action === "segments" && path.length === 4 && path[3] === "complete") {
      const segmentId = path[2];
      const rows = await sql<{ object_key: string; byte_size: number; sha256: string; media_type: string }[]>`
        SELECT rseg.object_key, rseg.byte_size, rseg.sha256, rseg.media_type
        FROM replica_capture_segments rseg JOIN replica_capture_sessions rcs ON rcs.id=rseg.capture_session_id
        WHERE rseg.id=${segmentId} AND rseg.organisation_id=${user.organisationId} AND rcs.replica_profile_id=${profileId}
          AND rseg.state='upload_pending' LIMIT 1
      `;
      const segment = rows[0];
      if (!segment) return problem("Pending segment not found.", "NOT_FOUND", 404);
      let verified;
      try {
        if (body.chunked_upload === true) {
          const totalParts = Number(body.total_parts);
          const expectedTotalParts = Math.ceil(Number(segment.byte_size) / PRIVATE_REPLICA_UPLOAD_CHUNK_BYTES);
          if (!Number.isSafeInteger(totalParts) || totalParts !== expectedTotalParts) return problem("Private upload part count did not match the upload intent.", "UPLOAD_PART_MISMATCH", 409);
          await completePrivateReplicaCapture({ objectKey: segment.object_key, contentType: segment.media_type, totalParts, byteSize: Number(segment.byte_size), sha256: segment.sha256 });
        }
        verified = await verifyPrivateReplicaObject(segment.object_key, Number(segment.byte_size), segment.sha256);
      } catch (error) {
        return storageFailure(error);
      }
      if (!verified.byteSizeMatches || !verified.sha256Matches) return problem("Uploaded object did not match its declared size or SHA-256 metadata.", "UPLOAD_INTEGRITY_FAILED", 409);
      const durationMs = Number(body.duration_ms);
      const width = Number(body.width);
      const height = Number(body.height);
      const fps = Number(body.fps);
      await sql`
        UPDATE replica_capture_segments SET state='uploaded',
          duration_ms=${Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs) : null},
          width=${Number.isFinite(width) && width > 0 ? Math.round(width) : null},
          height=${Number.isFinite(height) && height > 0 ? Math.round(height) : null},
          fps=${Number.isFinite(fps) && fps > 0 ? fps : null},
          starts_neutral=${body.starts_neutral === true}, ends_neutral=${body.ends_neutral === true}
        WHERE id=${segmentId} AND organisation_id=${user.organisationId}
      `;
      return ok({ id: segmentId, state: "uploaded", integrity_verified: true });
    }

    if (action === "complete-video" && path.length === 2) {
      if (!profile.capture_session_id) return problem("No active capture session exists.", "CAPTURE_SESSION_REQUIRED", 409);
      const consent = await identityConsentReady(user.organisationId, profile.identity_id);
      if (!consent.ready) return problem("Consent is no longer valid; video mapping is blocked.", "CONSENT_REQUIRED", 409, { missing: consent.missing });
      const sourceSegmentId = typeof body.source_segment_id === "string" ? body.source_segment_id : "";
      const sourceDurationMs = Number(body.source_duration_ms);
      if (body.neutral_boundaries_confirmed !== true || body.authorised_capture_confirmed !== true) {
        return problem("Confirm performer authorisation and neutral chapter boundaries before mapping the video.", "ATTESTATION_REQUIRED", 409);
      }
      const validation = validateCompletePerformanceChapters(body.chapters, sourceDurationMs);
      if (!validation.valid) return problem("The complete video needs five valid, non-overlapping performance chapters.", "CHAPTERS_INVALID", 422, { errors: validation.errors });
      const sources = await sql<{
        id: string; object_key: string; sha256: string; media_type: string; byte_size: number;
        width: number | null; height: number | null; fps: number | null;
      }[]>`
        SELECT rseg.id, rseg.object_key, rseg.sha256, rseg.media_type, rseg.byte_size,
          rseg.width, rseg.height, rseg.fps
        FROM replica_capture_segments rseg JOIN replica_capture_sessions rcs ON rcs.id=rseg.capture_session_id
        WHERE rseg.id=${sourceSegmentId} AND rseg.organisation_id=${user.organisationId}
          AND rcs.replica_profile_id=${profileId} AND rseg.capture_session_id=${profile.capture_session_id}
          AND rseg.segment_type='calibration' AND rseg.state='uploaded' LIMIT 1
      `;
      const source = sources[0];
      if (!source) return problem("The complete source video has not finished its private upload and integrity check.", "SOURCE_VIDEO_REQUIRED", 409);
      await sql.begin(async (transaction) => {
        await transaction`
          UPDATE replica_capture_segments SET state='deleted', deleted_at=now()
          WHERE organisation_id=${user.organisationId} AND capture_session_id=${profile.capture_session_id}
            AND state <> 'deleted' AND metadata->>'source_mode'='complete_performance'
        `;
        await transaction`
          UPDATE replica_capture_segments SET
            duration_ms=${sourceDurationMs},
            metadata=${transaction.json({
              source_mode: "complete_performance_source",
              authorised_capture_confirmed: true,
              neutral_boundaries_confirmed: true,
              chapter_count: validation.chapters.length,
            })}
          WHERE id=${sourceSegmentId} AND organisation_id=${user.organisationId}
        `;
        for (const chapter of validation.chapters) {
          const segmentId = randomUUID();
          await transaction`
            INSERT INTO replica_capture_segments (
              id, organisation_id, capture_session_id, segment_type, gesture_key,
              object_key, sha256, media_type, byte_size, duration_ms, width, height, fps,
              starts_neutral, ends_neutral, state, metadata
            ) VALUES (
              ${segmentId}, ${user.organisationId}, ${profile.capture_session_id}, ${chapter.type}, ${chapter.gesture ?? null},
              ${source.object_key}, ${source.sha256}, ${source.media_type}, ${source.byte_size}, ${chapter.end_ms - chapter.start_ms},
              ${source.width}, ${source.height}, ${source.fps}, true, true, 'uploaded',
              ${transaction.json({
                source_mode: "complete_performance",
                source_segment_id: sourceSegmentId,
                source_duration_ms: sourceDurationMs,
                trim_start_ms: chapter.start_ms,
                trim_end_ms: chapter.end_ms,
              })}
            )
          `;
        }
        await transaction`
          UPDATE replica_capture_sessions SET status='uploaded', capture_settings=capture_settings || ${transaction.json({ source_mode: "complete_performance", source_segment_id: sourceSegmentId })}
          WHERE id=${profile.capture_session_id} AND organisation_id=${user.organisationId}
        `;
      });
      return ok({ source_segment_id: sourceSegmentId, mapped_chapters: validation.chapters.length, next_step: 9 }, 201);
    }

    if (action === "submit" && path.length === 2) {
      const consent = await identityConsentReady(user.organisationId, profile.identity_id);
      if (!consent.ready) return problem("Consent is no longer valid; processing is blocked.", "CONSENT_REQUIRED", 409, { missing: consent.missing });
      const segments = await sql<StoredCaptureSegment[]>`
        SELECT rseg.id AS segment_id, rseg.segment_type, rseg.gesture_key, rseg.object_key,
          rseg.sha256, rseg.state, rseg.starts_neutral, rseg.ends_neutral, rseg.metadata, rseg.created_at,
          rseg.duration_ms, rseg.fps,
          COALESCE(
            CASE WHEN rseg.metadata->>'source_duration_ms' ~ '^[0-9]+$' THEN (rseg.metadata->>'source_duration_ms')::integer END,
            source.duration_ms
          ) AS source_duration_ms
        FROM replica_capture_segments rseg JOIN replica_capture_sessions rcs ON rcs.id=rseg.capture_session_id
        LEFT JOIN replica_capture_segments source
          ON source.id::text=rseg.metadata->>'source_segment_id'
          AND source.organisation_id=rseg.organisation_id
        WHERE rseg.organisation_id=${user.organisationId} AND rcs.replica_profile_id=${profileId}
        ORDER BY rseg.created_at DESC
      `;
      const readiness = replicaCaptureReadiness(segments);
      if (!readiness.ready) return problem("Required performer captures are missing or do not return to neutral.", "CAPTURE_INCOMPLETE", 409, readiness);
      const clips = latestRequiredProcessingClips(segments);
      if (clips.length !== REQUIRED_CAPTURE_SEGMENTS.length) return problem("Exactly five validated performance chapters are required.", "CAPTURE_INCOMPLETE", 409);
      const jobId = randomUUID();
      await sql.begin(async (transaction) => {
        await transaction`UPDATE replica_capture_sessions SET status='accepted', completed_at=now() WHERE id=${profile.capture_session_id} AND organisation_id=${user.organisationId}`;
        await transaction`UPDATE replica_profiles SET status='processing', updated_at=now() WHERE id=${profileId} AND organisation_id=${user.organisationId}`;
        await transaction`
          INSERT INTO replica_processing_jobs (id, organisation_id, replica_profile_id, capture_session_id, status)
          VALUES (${jobId}, ${user.organisationId}, ${profileId}, ${profile.capture_session_id}, 'queued')
        `;
      });
      // Capture validation is an offline, private quality-gate operation. It
      // must be available before the live Video Replica runtime is enabled so
      // an authorised POC can generate the evidence required for approval.
      // ENABLE_VIDEO_REPLICA continues to gate runtime assignment/rendering.
      const providerExecution = Boolean(process.env.REPLICA_PROCESSOR_URL && process.env.VOWHUMANS_INTERNAL_KEY);
      if (providerExecution) after(() => dispatchReplicaProcessing({ jobId, organisationId: user.organisationId, profileId, clips }));
      return ok({ job_id: jobId, status: "queued", provider_execution: providerExecution }, 202);
    }

    if (action === "quality-checks" && path.length === 2) {
      if (!new Set(["owner", "admin", "reviewer"]).has(user.role)) return problem("A reviewer or administrator must record replica evidence.", "FORBIDDEN", 403);
      const code = typeof body.code === "string" ? body.code : "";
      const status = body.status === "passed" || body.status === "failed" ? body.status : "";
      const notes = typeof body.notes === "string" ? body.notes.trim() : "";
      const supportedChecks = profile.renderer_tier === "rigged_3d"
        ? new Set(["metahuman_rig_integrity", "facial_animation_review", "body_motion_review", "pixel_streaming_latency"])
        : new Set(["lip_sync_visual_review", "livekit_latency"]);
      if (!supportedChecks.has(code) || !status || notes.length < 10) {
        return problem("A supported check, pass/fail decision and evidence note are required.", "VALIDATION_ERROR", 422);
      }
      const versions = await sql<{ id: string; state: string }[]>`SELECT id, state FROM replica_versions WHERE organisation_id=${user.organisationId} AND replica_profile_id=${profileId} ORDER BY version DESC LIMIT 1`;
      if (!versions[0]) return problem("Process a replica version before recording review evidence.", "PROCESSING_REQUIRED", 409);
      if (versions[0].state !== "quality_review") return problem("Automated capture quality checks must pass before recording preview evidence.", "AUTOMATED_QUALITY_GATE_FAILED", 409);
      const measured = typeof body.measured_value === "number" && Number.isFinite(body.measured_value) ? body.measured_value : null;
      await sql`
        INSERT INTO replica_quality_checks (organisation_id, replica_profile_id, replica_version_id, check_code, status, measured_value, threshold_value, unit, safe_detail)
        VALUES (${user.organisationId}, ${profileId}, ${versions[0].id}, ${code}, ${status}, ${measured}, ${code === "livekit_latency" || code === "pixel_streaming_latency" ? 1500 : null}, ${code === "livekit_latency" || code === "pixel_streaming_latency" ? "ms" : null}, ${sql.json({ notes, reviewer_id: user.id })})
      `;
      return ok({ code, status, recorded: true, append_only: true }, 201);
    }

    if (action === "approve" && path.length === 2) {
      if (!new Set(["owner", "admin", "reviewer"]).has(user.role)) return problem("A reviewer or administrator must approve a replica.", "FORBIDDEN", 403);
      const consent = await identityConsentReady(user.organisationId, profile.identity_id);
      if (!consent.ready) return problem("Consent is no longer valid; approval is blocked.", "CONSENT_REQUIRED", 409, { missing: consent.missing });
      const versions = await sql<{ id: string; state: string }[]>`
        SELECT id, state FROM replica_versions WHERE organisation_id=${user.organisationId}
          AND replica_profile_id=${profileId} ORDER BY version DESC LIMIT 1
      `;
      const version = versions[0];
      if (!version || version.state !== "quality_review") return problem("A processed version in quality review is required.", "PROCESSING_REQUIRED", 409);
      const latestChecks = await sql<{ check_code: string; status: string }[]>`
        SELECT DISTINCT ON (check_code) check_code, status FROM replica_quality_checks
        WHERE organisation_id=${user.organisationId} AND replica_profile_id=${profileId}
        ORDER BY check_code, checked_at DESC
      `;
      const requiredChecks = profile.renderer_tier === "rigged_3d"
        ? ["metahuman_rig_integrity", "facial_animation_review", "body_motion_review", "pixel_streaming_latency"]
        : ["capture_resolution", "capture_frame_rate", "single_face_continuity", "clip_duration", "lip_sync_visual_review", "livekit_latency"];
      const qualityMissing = requiredChecks.filter((code) => {
        const status = latestChecks.find((check) => check.check_code === code)?.status;
        return status !== "passed" && status !== "warning";
      });
      if (qualityMissing.length > 0) return problem("Every capture, visual and LiveKit quality gate must pass before approval.", "QUALITY_GATE_FAILED", 409, { missing: qualityMissing });
      await sql.begin(async (transaction) => {
        await transaction`UPDATE replica_versions SET state='published', published_at=now() WHERE id=${version.id} AND organisation_id=${user.organisationId}`;
        await transaction`UPDATE replica_profiles SET status='approved', active_version_id=${version.id}, approved_by=${user.id}, approved_at=now(), updated_at=now() WHERE id=${profileId} AND organisation_id=${user.organisationId}`;
      });
      return ok({ id: profileId, version_id: version.id, status: "approved", runtime_enabled: false });
    }

    if (action === "assign" && path.length === 2) {
      if (profile.status !== "approved" || !profile.active_version_id) return problem("Only an approved version can be assigned.", "APPROVAL_REQUIRED", 409);
      const humanSlug = typeof body.human_slug === "string" ? body.human_slug.trim() : "";
      const enabled = body.enabled === true;
      if (!humanSlug) return problem("A Digital Human slug is required.", "VALIDATION_ERROR", 422);
      const featureFlag = profile.renderer_tier === "rigged_3d" ? process.env.ENABLE_RIGGED_3D : process.env.ENABLE_VIDEO_REPLICA;
      if (enabled && featureFlag !== "true") return problem(`Enable the ${profile.renderer_tier === "rigged_3d" ? "Fully Rigged 3D" : "Video Replica"} feature only after the authorised POC passes.`, "FEATURE_DISABLED", 409);
      await sql`
        INSERT INTO human_replica_assignments (organisation_id, human_slug, replica_profile_id, replica_version_id, renderer_tier, quality_mode, enabled)
        SELECT organisation_id, ${humanSlug}, id, active_version_id, renderer_tier, quality_mode, ${enabled}
        FROM replica_profiles WHERE id=${profileId} AND organisation_id=${user.organisationId}
        ON CONFLICT (organisation_id, human_slug) DO UPDATE SET
          replica_profile_id=EXCLUDED.replica_profile_id, replica_version_id=EXCLUDED.replica_version_id,
          renderer_tier=EXCLUDED.renderer_tier, quality_mode=EXCLUDED.quality_mode,
          enabled=EXCLUDED.enabled, assigned_at=now()
      `;
      return ok({ id: profileId, human_slug: humanSlug, enabled, fallback: "portrait" });
    }

    if (action === "revoke" && path.length === 2) {
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (reason.length < 5) return problem("A revocation reason is required.", "VALIDATION_ERROR", 422);
      await sql.begin(async (transaction) => {
        await transaction`UPDATE replica_profiles SET status='revoked', revoked_at=now(), revocation_reason=${reason}, updated_at=now() WHERE id=${profileId} AND organisation_id=${user.organisationId}`;
        await transaction`UPDATE replica_versions SET state='revoked', revoked_at=now() WHERE replica_profile_id=${profileId} AND organisation_id=${user.organisationId}`;
        await transaction`UPDATE human_replica_assignments SET enabled=false WHERE replica_profile_id=${profileId} AND organisation_id=${user.organisationId}`;
      });
      return ok({ id: profileId, status: "revoked", runtime_disabled: true, object_deletion_required: true });
    }

    return problem("Replica route not found.", "NOT_FOUND", 404);
  } catch (error) {
    return databaseFailure(error);
  }
}
