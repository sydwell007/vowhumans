import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { retrieveChunks } from "@/lib/ingest";

// Same x-internal-key convention as api/internal/v1/faces/route.ts. Called
// per-turn by realtime-agent's search_knowledge_base function tool, so this stays
// a thin wrapper around the existing retrieveChunks() rather than anything new —
// latency here is directly felt as silence in a live voice call.
function requireInternalKey(request: NextRequest): boolean {
  const expected = process.env.VOWHUMANS_INTERNAL_KEY;
  const provided = request.headers.get("x-internal-key");
  if (!expected || !provided) return false;
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
}

export async function POST(request: NextRequest) {
  if (!requireInternalKey(request)) {
    return NextResponse.json({ success: false, code: "UNAUTHENTICATED" }, { status: 401 });
  }

  const organisationId = request.headers.get("x-organisation-id");
  if (!organisationId) {
    return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "x-organisation-id header is required." }, { status: 422 });
  }

  const body = await request.json().catch(() => ({}));
  const knowledgeBaseIds = Array.isArray(body.knowledge_base_ids) ? body.knowledge_base_ids.filter((id: unknown): id is string => typeof id === "string") : [];
  const query = typeof body.query === "string" ? body.query : "";

  const chunks = await retrieveChunks(organisationId, knowledgeBaseIds, query, 4);
  return NextResponse.json({
    success: true,
    data: { chunks: chunks.map((c) => ({ document_title: c.documentTitle, content: c.content.slice(0, 500), similarity: c.similarity })) },
  });
}
