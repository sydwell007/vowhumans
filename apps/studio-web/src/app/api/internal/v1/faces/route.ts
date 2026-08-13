import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { resolveFaceBytes } from "@/lib/faces";

// Separate from the /api/v1/[...route] catch-all deliberately: every branch in that file
// trusts a browser session cookie, but this route's caller (the avatar-participant
// LiveKit worker) has no browser and no cookie — it authenticates with the same shared
// x-internal-key convention avatar-worker and realtime-agent already use.
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

  const face = await resolveFaceBytes(organisationId, humanSlug);
  if (!face) {
    return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(face.data), { headers: { "content-type": face.mimeType, "cache-control": "private, max-age=300" } });
}
