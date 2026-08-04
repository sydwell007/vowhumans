import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { applications, humans, personas } from "@/data/platform";

const allowedResources = new Set(["auth","digital-humans","identities","voices","personas","knowledge","sessions","livekit","presenter-projects","renders","applications","webhooks","usage","health"]);

function response(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data, meta: { mode: "development-mock", request_id: randomUUID() } }, { status, headers: { "x-vowhumans-mode": "development-mock" } });
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ route: string[] }> }) {
  const { route } = await params;
  const resource = route[0];
  if (!allowedResources.has(resource)) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
  if (resource === "health") return response({ status: "ok", providers: { realtime: "mock", avatar: "static", gpu: "disabled" } });
  if (resource === "digital-humans") return response({ items: humans });
  if (resource === "personas") return response({ items: personas });
  if (resource === "applications") return response({ items: applications });
  if (resource === "usage") return response({ sessions: 2592, minutes: 18420, estimated_cost_minor: 428600, currency: "ZAR", private_content_included: false });
  return response({ items: [], resource, persistent: false });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ route: string[] }> }) {
  const { route } = await params;
  const resource = route[0];
  if (!allowedResources.has(resource)) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  if (resource === "livekit") return NextResponse.json({ success: false, code: "PROVIDER_DISABLED", message: "LiveKit tokens are issued only by the configured server-side API gateway." }, { status: 503 });
  return response({ id: randomUUID(), resource, state: "draft", persistent: false, received_fields: Object.keys(body as object), disclosure_required: true }, 201);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ route: string[] }> }) {
  const { route } = await params;
  if (route[0] !== "sessions") return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
  return response({ id: route[1] ?? null, deletion: "mock-queued", private_content_included: false }, 202);
}

