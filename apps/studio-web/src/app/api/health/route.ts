import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "vowhumans-web-control-plane",
    mode: "development-mock",
    checkedAt: new Date().toISOString(),
    persistence: false,
    capabilities: { staticPortrait: true, studio: true, presenterDraft: true, voice: "adapter-ready", realtime: "disabled", billing: "disabled", email: "disabled", gpu: "disabled" },
    dependencies: { afrihostApi: "not-verified", livekit: "not-configured", objectStorage: "not-configured" },
  });
}
