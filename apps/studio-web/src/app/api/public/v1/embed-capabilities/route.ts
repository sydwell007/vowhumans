import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

// Lightweight, cacheable capability probe for a partner embed (PlugConnect's
// Interview Practice room). It answers two questions the partner UI needs before
// it renders its mode picker:
//   - portrait: always true for an enabled pairing (live voice + still portrait).
//   - photo_replica: is the lip-synced avatar-video path currently reachable?
//     Mirrors fetchGatewayHealth() in api/v1/[...route] — the gateway's own
//     /api/v1/health reports providers.avatar === "configured" when the avatar
//     participant + GPU worker are wired. Unknown/unreachable => false (never a
//     guessed yes), so the partner degrades to Portrait cleanly.
//   - languages: the SA language codes actually usable on the realtime path today.

export const revalidate = 30;

function parseAllowedOrigins(settings: unknown): string[] {
  const parsed = typeof settings === "string" ? safeJsonParse(settings) : settings;
  const raw = (parsed as { allowed_embed_origins?: unknown } | null)?.allowed_embed_origins;
  return Array.isArray(raw) ? raw.filter((o): o is string => typeof o === "string") : [];
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function requestOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  if (origin) return origin;
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

async function avatarPathReachable(): Promise<boolean> {
  const gatewayBaseUrl = process.env.API_GATEWAY_URL;
  if (!gatewayBaseUrl) return false;
  try {
    const upstream = await fetch(`${gatewayBaseUrl.replace(/\/$/, "")}/api/v1/health`, {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!upstream.ok) return false;
    const body = (await upstream.json().catch(() => null)) as
      | { providers?: { avatar?: string } }
      | null;
    return body?.providers?.avatar === "configured";
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const digitalHumanId = request.nextUrl.searchParams.get("digital_human_id") ?? "";
  const applicationSlug = request.nextUrl.searchParams.get("application_slug") ?? "";
  if (!digitalHumanId || !applicationSlug) {
    return NextResponse.json(
      { success: false, code: "VALIDATION_ERROR", message: "digital_human_id and application_slug are required." },
      { status: 422 },
    );
  }

  const [pairing] = await sql<{ application_settings: unknown }[]>`
    SELECT a.settings AS application_settings
    FROM digital_human_applications dha
    JOIN applications a ON a.id = dha.application_id AND a.organisation_id = dha.organisation_id AND a.status = 'active'
    WHERE dha.digital_human_id = ${digitalHumanId} AND a.slug = ${applicationSlug} AND dha.enabled = true
  `;
  if (!pairing) {
    return NextResponse.json(
      { success: false, code: "NOT_FOUND", message: "This VowHuman is not available for this application." },
      { status: 404 },
    );
  }

  // Read-only capability probe (no session, no cost). Only reject an explicit
  // cross-site browser call from an origin the application hasn't listed; same-
  // origin (the embed page), server-to-server (PlugConnect's own SSR fetch), and
  // an empty list all pass. Mirrors passesEmbedOriginPolicy in embed-sessions.
  const allowedOrigins = parseAllowedOrigins(pairing.application_settings);
  const secFetchSite = request.headers.get("sec-fetch-site");
  const crossSiteBrowserCall = secFetchSite === "cross-site" || secFetchSite === "same-site";
  if (allowedOrigins.length > 0 && crossSiteBrowserCall) {
    const origin = requestOrigin(request);
    if (!origin || !allowedOrigins.includes(origin)) {
      return NextResponse.json(
        { success: false, code: "ORIGIN_NOT_ALLOWED", message: "This application does not allow embedding from this origin." },
        { status: 403 },
      );
    }
  }

  const [photoReplica, languageRows] = await Promise.all([
    avatarPathReachable(),
    sql<{ language_code: string }[]>`
      SELECT language_code FROM language_capabilities
      WHERE capability = 'realtime' AND status IN ('production', 'experimental')
      ORDER BY language_code
    `,
  ]);

  return NextResponse.json(
    {
      success: true,
      data: {
        portrait: true,
        photo_replica: photoReplica,
        languages: [...new Set(languageRows.map((row) => row.language_code))],
      },
      meta: { mode: "live" },
    },
    { headers: { "cache-control": "public, max-age=30" } },
  );
}
