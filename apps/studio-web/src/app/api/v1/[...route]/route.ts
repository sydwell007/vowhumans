import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { applications, humans, personas } from "@/data/platform";
import { academyCourses, integrations, templates } from "@/data/commercial";
import { plans } from "@vowhumans/commercial-core";
import sql from "@/lib/db";
import { SESSION_COOKIE_NAME, createSession, destroySession, hashPassword, isLockedOut, readSession, recordFailedLogin, resetFailedLogins, sessionCookieOptions, verifyPassword } from "@/lib/auth";

const allowedResources = new Set(["auth","organisations","workspaces","users","consents","digital-humans","identities","voices","personas","knowledge","sessions","livekit","presenter-projects","renders","applications","integrations","templates","marketplace","academy","partners","notifications","support-requests","sales-requests","demo-requests","contact-requests","signup-requests","signin-requests","partner-requests","investor-requests","trust-requests","billing","plans","analytics","api-keys","webhooks","usage","health"]);

// Gives proxyToGateway's 40s upstream timeout room to actually complete instead of
// Vercel's own function timeout cutting it off first (Hobby default is 10s).
export const maxDuration = 45;

function response(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data, meta: { mode: "development-mock", request_id: randomUUID() } }, { status, headers: { "x-vowhumans-mode": "development-mock" } });
}

// Local human catalogue entries use readable slug ids (e.g. "thandi-mokoena"), but the
// gateway's contract requires a real UUID. Derive a stable, deterministic one per slug
// rather than adding a second id field to every catalogue entry.
function slugToUuid(slug: string): string {
  const bytes = createHash("sha256").update(slug).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Fixed public-demo organisation. Unauthenticated demo traffic (no end-user account
// system exists yet) is scoped to this one organisation id, which must be bound to
// VOWHUMANS_SERVICE_API_KEY in the gateway's VOWHUMANS_SERVICE_API_KEYS registry.
const PUBLIC_DEMO_ORGANISATION_ID = "00000000-0000-4000-8000-000000000001";

// Proxies to the real FastAPI gateway when configured; returns null on any failure
// (not configured, unreachable, timeout, non-2xx) so callers can fall back to the
// existing honest mock response rather than surfacing a raw error.
async function proxyToGateway(path: string, body: unknown): Promise<{ status: number; data: unknown } | null> {
  const baseUrl = process.env.API_GATEWAY_URL;
  const apiKey = process.env.VOWHUMANS_SERVICE_API_KEY;
  if (!baseUrl || !apiKey) return null;
  try {
    const upstream = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "x-organisation-id": PUBLIC_DEMO_ORGANISATION_ID },
      body: JSON.stringify(body),
      // The gateway can run on a free instance that spins down after inactivity and
      // takes up to ~50s to wake on the next request — a short timeout here would
      // misreport a slow-but-working gateway as unreachable and fall back to mock mode.
      signal: AbortSignal.timeout(40000),
    });
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok || data === null) return null;
    return { status: upstream.status, data };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ route: string[] }> }) {
  const { route } = await params;
  const resource = route[0];
  if (!allowedResources.has(resource)) return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
  if (resource === "auth" && route[1] === "session") {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const user = token ? await readSession(token) : null;
    if (!user) return response({ authenticated: false });
    return response({ authenticated: true, user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role }, organisation: { id: user.organisationId, name: user.organisationName, slug: user.organisationSlug } });
  }
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
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (resource === "auth" && route[1] === "register") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const displayName = typeof body.name === "string" ? body.name.trim() : "";
    const organisationName = typeof body.organisation === "string" ? body.organisation.trim() : "";
    if (!email || password.length < 8 || !displayName || !organisationName) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Provide a work email, a password of at least 8 characters, your name and a workspace name." }, { status: 422 });
    }
    const baseSlug = organisationName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
    const passwordHash = await hashPassword(password);
    try {
      const result = await sql.begin(async (tx) => {
        let organisation: { id: string; name: string; slug: string } | undefined;
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomUUID().slice(0, 6)}`;
          try {
            [organisation] = await tx`INSERT INTO organisations (name, slug) VALUES (${organisationName}, ${slug}) RETURNING id, name, slug`;
            break;
          } catch (error) {
            if (!(error instanceof Error) || !("code" in error) || (error as { code?: string }).code !== "23505") throw error;
          }
        }
        if (!organisation) throw new Error("Could not allocate a unique workspace slug.");
        const [user] = await tx`INSERT INTO users (organisation_id, email, display_name, role, password_hash) VALUES (${organisation.id}, ${email}, ${displayName}, 'owner', ${passwordHash}) RETURNING id`;
        return { organisationId: organisation.id as string, userId: user.id as string };
      });
      const token = await createSession(result.userId, result.organisationId, request.headers.get("user-agent"));
      const res = NextResponse.json({ success: true, data: { redirect: "/studio" }, meta: { mode: "live", request_id: randomUUID() } }, { status: 201 });
      res.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
      return res;
    } catch (error) {
      console.error("[auth/register]", error);
      return NextResponse.json({ success: false, code: "REGISTRATION_FAILED", message: "Registration could not be completed. Try again shortly." }, { status: 500 });
    }
  }

  if (resource === "auth" && route[1] === "login") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) {
      return NextResponse.json({ success: false, code: "VALIDATION_ERROR", message: "Enter your email and password." }, { status: 422 });
    }
    // Runs before any organisation context is known, so this relies on the app's DB role
    // having BYPASSRLS — tenant isolation elsewhere is enforced by explicit organisation_id
    // filters, not RLS, for exactly this reason. Same email can exist under multiple
    // organisations (schema allows it); the most recently active match wins.
    const candidates = await sql<{ id: string; organisation_id: string; password_hash: string | null }[]>`
      SELECT id, organisation_id, password_hash FROM users WHERE email = ${email} ORDER BY last_login_at DESC NULLS LAST, created_at DESC
    `;
    const candidate = candidates[0];
    if (!candidate || !candidate.password_hash) {
      return NextResponse.json({ success: false, code: "INVALID_CREDENTIALS", message: "Incorrect email or password." }, { status: 401 });
    }
    if (await isLockedOut(candidate.id)) {
      return NextResponse.json({ success: false, code: "ACCOUNT_LOCKED", message: "Too many failed attempts. Try again in a few minutes." }, { status: 423 });
    }
    const valid = await verifyPassword(password, candidate.password_hash);
    if (!valid) {
      await recordFailedLogin(candidate.id);
      return NextResponse.json({ success: false, code: "INVALID_CREDENTIALS", message: "Incorrect email or password." }, { status: 401 });
    }
    await resetFailedLogins(candidate.id);
    const token = await createSession(candidate.id, candidate.organisation_id, request.headers.get("user-agent"));
    const res = NextResponse.json({ success: true, data: { redirect: "/studio" }, meta: { mode: "live", request_id: randomUUID() } });
    res.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    return res;
  }

  if (resource === "auth" && route[1] === "logout") {
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (token) await destroySession(token);
    const res = NextResponse.json({ success: true, data: { redirect: "/" }, meta: { mode: "live", request_id: randomUUID() } });
    res.cookies.set(SESSION_COOKIE_NAME, "", sessionCookieOptions(0));
    return res;
  }

  if (resource === "sessions" && !route[1] && typeof body.digital_human_id === "string") {
    const proxied = await proxyToGateway("/api/v1/sessions/interview-practice", {
      candidate_reference: randomUUID(),
      digital_human_id: slugToUuid(body.digital_human_id),
      mode: body.mode ?? "guided",
      job_context: body.job_context ?? body.context,
      transcript_consent: Boolean(body.transcript_consent ?? body.consent),
      recording_consent: Boolean(body.recording_consent ?? body.consent),
    });
    if (proxied) return NextResponse.json({ success: true, data: proxied.data, meta: { mode: "live", request_id: randomUUID() } }, { status: proxied.status, headers: { "x-vowhumans-mode": "live" } });
  }

  if (resource === "livekit") {
    const proxied = await proxyToGateway("/api/v1/livekit/token", {
      session_id: body.session_id,
      participant_identity: body.participant_identity ?? `guest-${randomUUID().slice(0, 8)}`,
    });
    if (proxied) return NextResponse.json({ success: true, data: proxied.data, meta: { mode: "live", request_id: randomUUID() } }, { status: proxied.status, headers: { "x-vowhumans-mode": "live" } });
    return NextResponse.json({ success: false, code: "PROVIDER_DISABLED", message: "LiveKit tokens are issued only by the configured server-side API gateway." }, { status: 503 });
  }

  const isPublicRequest=resource.endsWith("-requests") || (resource === "organisations" && !request.headers.get("authorization"));
  return response({ id: randomUUID(), resource, state: isPublicRequest ? "validated-preview" : "draft", persistent: false, message: "Validated in safe preview. Configure the production API to persist and deliver this request.", received_fields: Object.keys(body as object).filter(key=>!key.toLowerCase().includes("password")), disclosure_required: true }, isPublicRequest ? 202 : 201);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ route: string[] }> }) {
  const { route } = await params;
  if (route[0] !== "sessions") return NextResponse.json({ success: false, code: "NOT_FOUND" }, { status: 404 });
  return response({ id: route[1] ?? null, deletion: "mock-queued", private_content_included: false }, 202);
}
