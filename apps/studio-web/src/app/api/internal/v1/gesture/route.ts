import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { resolveGestureOverlay } from "@/lib/gesture";

// Same shared x-internal-key convention as api/internal/v1/faces/route.ts —
// this route's callers (services/avatar-participant for live calls, and
// api/v1/[...route].ts's render-next-scene for Presenter Studio) both send
// this alongside the audio/face to avatar-worker's /internal/v1/render so it
// can apply the human's actual configured head-motion range.
function requireInternalKey(request: NextRequest): boolean {
  const expected = process.env.VOWHUMANS_INTERNAL_KEY;
  const provided = request.headers.get("x-internal-key");
  if (!expected || !provided) return false;
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
}

export async function GET(request: NextRequest) {
  if (!requireInternalKey(request)) {
    return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const organisationId = request.headers.get("x-organisation-id");
  const humanSlug = request.nextUrl.searchParams.get("human_slug");
  if (!organisationId || !humanSlug) {
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "x-organisation-id header and human_slug query param are required." }, { status: 422 });
  }

  // Never a 404 — no assignment just means the neutral (all-disabled)
  // overlay, the same "render exactly as before" behaviour a caller gets by
  // omitting this field entirely.
  const overlay = await resolveGestureOverlay(organisationId, humanSlug);
  return NextResponse.json({ success: true, data: overlay });
}
