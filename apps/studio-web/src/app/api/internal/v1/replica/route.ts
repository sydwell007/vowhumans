import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sql, { databaseConfigured } from "@/lib/db";
import { createPrivateReplicaDownload, privateObjectStorageConfigured } from "@/lib/objectStorage";

export const runtime = "nodejs";

function authorised(provided: string | null) {
  const expected = process.env.VOWHUMANS_INTERNAL_KEY ?? "";
  if (!expected || !provided) return false;
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: NextRequest) {
  if (!authorised(request.headers.get("x-internal-key"))) return NextResponse.json({ message: "Internal service key required" }, { status: 401 });
  if (process.env.ENABLE_VIDEO_REPLICA !== "true") return NextResponse.json({ message: "Video Replica is disabled" }, { status: 404 });
  if (!databaseConfigured || !privateObjectStorageConfigured()) return NextResponse.json({ message: "Replica storage is not configured" }, { status: 503 });
  const organisationId = request.headers.get("x-organisation-id") ?? "";
  const humanSlug = request.nextUrl.searchParams.get("human_slug") ?? "";
  if (!organisationId || !humanSlug) return NextResponse.json({ message: "Organisation and human slug are required" }, { status: 422 });

  try {
    const assignments = await sql<{
      replica_id: string; version_id: string; identity_id: string; provider: string;
      quality_mode: string; manifest_sha256: string;
    }[]>`
      SELECT rp.id AS replica_id, rv.id AS version_id, rp.identity_id, rv.provider,
        hra.quality_mode, rv.manifest_sha256
      FROM human_replica_assignments hra
      JOIN replica_profiles rp ON rp.id=hra.replica_profile_id AND rp.organisation_id=hra.organisation_id
      JOIN replica_versions rv ON rv.id=hra.replica_version_id AND rv.organisation_id=hra.organisation_id
      JOIN identities i ON i.id=rp.identity_id AND i.organisation_id=rp.organisation_id
      WHERE hra.organisation_id=${organisationId} AND hra.human_slug=${humanSlug} AND hra.enabled=true
        AND hra.renderer_tier='video_replica' AND rp.status='approved' AND rv.state='published'
        AND i.state='approved' AND i.revoked_at IS NULL AND i.commercial_use_confirmed=true
        AND EXISTS (
          SELECT 1 FROM identity_consents ic WHERE ic.organisation_id=hra.organisation_id
            AND ic.identity_id=i.id AND ic.consent_type='face' AND ic.state='approved'
            AND ic.revoked_at IS NULL AND (ic.expires_at IS NULL OR ic.expires_at>now())
        )
        AND EXISTS (
          SELECT 1 FROM identity_consents ic WHERE ic.organisation_id=hra.organisation_id
            AND ic.identity_id=i.id AND ic.consent_type='commercial' AND ic.state='approved'
            AND ic.revoked_at IS NULL AND (ic.expires_at IS NULL OR ic.expires_at>now())
        )
      LIMIT 1
    `;
    const assignment = assignments[0];
    if (!assignment) return NextResponse.json({ message: "No approved replica assignment" }, { status: 404 });
    const clips = await sql<{
      key: string; state: string; gesture_key: string | null; intensity: number;
      object_key: string; starts_neutral: boolean; ends_neutral: boolean;
    }[]>`
      SELECT clip_key AS key, conversation_state AS state, gesture_key, intensity,
        object_key, starts_neutral, ends_neutral
      FROM replica_motion_clips WHERE organisation_id=${organisationId}
        AND replica_version_id=${assignment.version_id} ORDER BY conversation_state, clip_key
    `;
    if (!clips.some((clip) => clip.state === "idle") || !clips.some((clip) => clip.state === "speaking")) {
      return NextResponse.json({ message: "Replica motion manifest is incomplete" }, { status: 409 });
    }
    const signedClips = await Promise.all(clips.map(async (clip) => ({
      key: clip.key, state: clip.state, gesture_key: clip.gesture_key,
      intensity: clip.intensity, starts_neutral: clip.starts_neutral,
      ends_neutral: clip.ends_neutral, url: await createPrivateReplicaDownload(clip.object_key),
    })));
    return NextResponse.json({
      success: true,
      data: {
        replica_id: assignment.replica_id,
        version_id: assignment.version_id,
        provider: assignment.provider,
        quality_mode: assignment.quality_mode,
        motion_source: "captured-video",
        dynamic_region: "mouth-only",
        clips: signedClips,
      },
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    console.error("[internal-replica]", error);
    return NextResponse.json({ message: "Replica runtime manifest unavailable" }, { status: 503 });
  }
}
