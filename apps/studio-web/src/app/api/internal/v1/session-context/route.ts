import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

function requireInternalKey(request: NextRequest): boolean {
  const expected = process.env.VOWHUMANS_INTERNAL_KEY;
  const provided = request.headers.get("x-internal-key");
  if (!expected || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

export async function GET(request: NextRequest) {
  if (!requireInternalKey(request)) {
    return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const organisationId = request.headers.get("x-organisation-id");
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!organisationId || !sessionId) {
    return NextResponse.json(
      { success: false, code: "VALIDATION_ERROR" },
      { status: 422 },
    );
  }

  const [row] = await sql<{ context: unknown }[]>`
    SELECT context FROM sessions
    WHERE id = ${sessionId} AND organisation_id = ${organisationId}
  `;
  if (!row) {
    return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
  }

  const context = typeof row.context === "string" ? JSON.parse(row.context) : row.context;
  const lesson =
    context && typeof context === "object" && "lesson" in context
      ? (context as { lesson?: unknown }).lesson
      : null;

  return NextResponse.json({ success: true, data: { lesson } });
}
