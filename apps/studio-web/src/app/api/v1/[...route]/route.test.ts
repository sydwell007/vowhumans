import { NextRequest } from "next/server";
import { describe, expect, it, beforeEach } from "vitest";
import { DELETE, GET, PATCH, POST } from "./route";

function get(resource: string) {
  const request = new NextRequest(`http://localhost/api/v1/${resource}`);
  return GET(request, { params: Promise.resolve({ route: resource.split("/") }) });
}

function post(resource: string, body: unknown) {
  const request = new NextRequest(`http://localhost/api/v1/${resource}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  // Split into real path segments, matching how Next.js's [...route] catch-all
  // actually populates this array — a no-op for the pre-existing single-segment
  // callers ("livekit", "sessions") below, but required for the multi-segment
  // resource paths (e.g. "languages/benchmark") the multilingual tests use.
  return POST(request, { params: Promise.resolve({ route: resource.split("/") }) });
}

function patch(resource: string, body: unknown) {
  const request = new NextRequest(`http://localhost/api/v1/${resource}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return PATCH(request, { params: Promise.resolve({ route: resource.split("/") }) });
}

function remove(resource: string) {
  const request = new NextRequest(`http://localhost/api/v1/${resource}`, { method: "DELETE" });
  return DELETE(request, { params: Promise.resolve({ route: resource.split("/") }) });
}

describe("api/v1 route mock fallback", () => {
  beforeEach(() => {
    delete process.env.API_GATEWAY_URL;
    delete process.env.VOWHUMANS_SERVICE_API_KEY;
  });

  it("falls back to the disabled-provider response when the gateway isn't configured", async () => {
    const res = await post("livekit", { session_id: "11111111-1111-4111-8111-111111111111" });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toMatchObject({ success: false, code: "PROVIDER_DISABLED" });
  });

  it("falls back to the validated-preview mock for a session request when the gateway isn't configured", async () => {
    const res = await post("sessions", { digital_human_id: "thandi-mokoena", mode: "guided", job_context: "Test role", consent: true });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.persistent).toBe(false);
    expect(body.meta.mode).toBe("development-mock");
  });
});

// No session cookie means requireOrganisation() returns null without ever
// reaching the database (readSession() is never called when there's no token
// to look up) — every new multilingual endpoint below is exercised the same
// way the pre-existing tests above already do, without needing a live Postgres
// connection. This intentionally only proves each route is reachable and
// correctly authenticated (i.e. present in allowedResources, not shadowed by
// an earlier generic handler that would also 401 but for the wrong reason) —
// it does not exercise post-auth business logic, which needs real DB access
// this test suite deliberately doesn't set up (see docs/MULTILINGUAL_IMPLEMENTATION_REPORT.md).
describe("multilingual endpoints require a session", () => {
  it("GET languages exposes only the safe English demo option without a session", async () => {
    const res = await get("languages");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toEqual([
      expect.objectContaining({ code: "en-ZA", enabled: true }),
    ]);
  });

  it("POST languages/:code (org language settings)", async () => {
    const res = await post("languages/en-ZA", { enabled: true });
    expect(res.status).toBe(401);
  });

  // Regression guard: languages/benchmark must not be swallowed by the generic
  // "languages/:code" handler (route[1] === "benchmark" would otherwise be
  // treated as a language code) — both correctly 401 before reaching any
  // language-code-specific logic, but this at least proves the resource is
  // registered and reachable as its own route.
  it("POST languages/benchmark", async () => {
    const res = await post("languages/benchmark", { language_code: "zu-ZA", capability: "tts" });
    expect(res.status).toBe(401);
  });

  it("POST digital-human-languages", async () => {
    const res = await post("digital-human-languages", { human_slug: "x", language_code: "zu-ZA" });
    expect(res.status).toBe(401);
  });

  it("POST terminology", async () => {
    const res = await post("terminology", { language_code: "zu-ZA", source_term: "VowHumans", preferred_form: "VowHumans" });
    expect(res.status).toBe(401);
  });

  it("POST language-reviews", async () => {
    const res = await post("language-reviews", { language_code: "zu-ZA", capability: "tts", provider: "openai" });
    expect(res.status).toBe(401);
  });

  it("POST live-sessions/:id/switch-language", async () => {
    const res = await post("live-sessions/11111111-1111-4111-8111-111111111111/switch-language", { target_language: "zu-ZA" });
    expect(res.status).toBe(401);
  });

  it("POST presenter-projects/:id/translate-scene", async () => {
    const res = await post("presenter-projects/11111111-1111-4111-8111-111111111111/translate-scene", { scene_id: "x", target_language: "zu-ZA" });
    expect(res.status).toBe(401);
  });

  it("POST persona-versions/:id/language-messages", async () => {
    const res = await post("persona-versions/11111111-1111-4111-8111-111111111111/language-messages", { language_code: "zu-ZA", opening_message: "Sawubona" });
    expect(res.status).toBe(401);
  });
});

describe("production control-plane endpoints require a session", () => {
  for (const resource of ["dashboard", "identities", "api-keys", "webhooks", "usage", "safety", "audit-logs", "organisations/current"]) {
    it(`GET ${resource}`, async () => expect((await get(resource)).status).toBe(401));
  }

  for (const [resource, body] of [
    ["identities", { owner_name: "Owner" }],
    ["api-keys", { name: "Key" }],
    ["webhooks", { name: "Hook" }],
    ["safety", { description: "A concern" }],
    ["webhooks/11111111-1111-4111-8111-111111111111/test", {}],
  ] as const) {
    it(`POST ${resource}`, async () => expect((await post(resource, body)).status).toBe(401));
  }

  it("PATCH organisations/current", async () => expect((await patch("organisations/current", { name: "Renamed" })).status).toBe(401));
  it("PATCH api-keys/:id", async () => expect((await patch("api-keys/11111111-1111-4111-8111-111111111111", { status: "revoked" })).status).toBe(401));
  it("DELETE webhooks/:id", async () => expect((await remove("webhooks/11111111-1111-4111-8111-111111111111")).status).toBe(401));
});
