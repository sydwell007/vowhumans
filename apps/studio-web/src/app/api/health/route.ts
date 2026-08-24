import { NextResponse } from "next/server";
import sql, { databaseConfigured } from "@/lib/db";

export const runtime = "nodejs";

type SchemaState = {
  control_plane_ready: boolean;
  workforce_ready: boolean;
  audit_ready: boolean;
};

export async function GET() {
  let database: "not-configured" | "reachable" | "unreachable" = databaseConfigured ? "unreachable" : "not-configured";
  let schema: SchemaState = { control_plane_ready: false, workforce_ready: false, audit_ready: false };

  if (databaseConfigured) {
    try {
      const [row] = await sql<SchemaState[]>`
        SELECT
          to_regclass('public.organisations') IS NOT NULL
            AND to_regclass('public.digital_humans') IS NOT NULL AS control_plane_ready,
          to_regclass('public.digital_colleagues') IS NOT NULL
            AND to_regclass('public.workforce_templates') IS NOT NULL
            AND to_regclass('public.workforce_tools') IS NOT NULL AS workforce_ready,
          to_regprocedure('public.record_control_plane_audit()') IS NOT NULL AS audit_ready
      `;
      database = "reachable";
      schema = row ?? schema;
    } catch (error) {
      console.error("[health] database probe failed", {
        code: error && typeof error === "object" && "code" in error ? String(error.code) : "UNKNOWN",
      });
    }
  }

  const operational = database === "reachable" && schema.control_plane_ready && schema.workforce_ready && schema.audit_ready;
  return NextResponse.json({
    status: operational ? "ok" : "degraded",
    service: "vowhumans-web-control-plane",
    mode: "live",
    checkedAt: new Date().toISOString(),
    persistence: database === "reachable",
    capabilities: { staticPortrait: true, studio: true, presenterDraft: true, voice: "adapter-ready", realtime: "disabled", billing: "disabled", email: "disabled", gpu: "disabled" },
    dependencies: { database, schema, afrihostApi: "not-verified", livekit: "not-configured", objectStorage: "not-configured" },
  }, {
    status: operational ? 200 : 503,
    headers: { "cache-control": "no-store", "x-vowhumans-mode": "live" },
  });
}
