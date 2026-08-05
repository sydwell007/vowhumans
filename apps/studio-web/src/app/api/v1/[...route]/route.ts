import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { applications, humans, personas } from "@/data/platform";
import { academyCourses, integrations, templates } from "@/data/commercial";
import { plans } from "@vowhumans/commercial-core";

const allowedResources = new Set(["auth","organisations","workspaces","users","consents","digital-humans","identities","voices","personas","knowledge","sessions","livekit","presenter-projects","renders","applications","integrations","templates","marketplace","academy","partners","notifications","support-requests","sales-requests","demo-requests","contact-requests","signup-requests","signin-requests","partner-requests","investor-requests","trust-requests","billing","plans","analytics","api-keys","webhooks","usage","health"]);

function response(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data, meta: { mode: "development-mock", request_id: randomUUID() } }, { status, headers: { "x-vowhumans-mode": "development-mock" } });
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ route: string[] }> }) {
  const { route } = await params;
  const resource = route[0];
  if (!allowedResources.has(resource)) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
  if (resource === "health") return response({ status: "ok", persistence: false, providers: { afrihost_api: "not-verified", realtime: "mock", avatar: "static", gpu: "disabled", billing: "disabled", email: "disabled" } });
  if (resource === "digital-humans") return response({ items: humans });
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
  const body = await request.json().catch(() => ({}));
  if (resource === "livekit") return NextResponse.json({ success: false, code: "PROVIDER_DISABLED", message: "LiveKit tokens are issued only by the configured server-side API gateway." }, { status: 503 });
  const isPublicRequest=resource.endsWith("-requests") || (resource === "organisations" && !request.headers.get("authorization")) || (resource === "auth" && route[1] === "preview");
  return response({ id: randomUUID(), resource, state: isPublicRequest ? "validated-preview" : "draft", persistent: false, message: "Validated in safe preview. Configure the production API to persist and deliver this request.", received_fields: Object.keys(body as object).filter(key=>!key.toLowerCase().includes("password")), disclosure_required: true }, isPublicRequest ? 202 : 201);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ route: string[] }> }) {
  const { route } = await params;
  if (route[0] !== "sessions") return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
  return response({ id: route[1] ?? null, deletion: "mock-queued", private_content_included: false }, 202);
}
