import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "vowhumans-studio",
    mode: "mock",
    capabilities: { voice: "adapter-ready", staticPortrait: true, live2d: false, presenter: "mock" },
  });
}

