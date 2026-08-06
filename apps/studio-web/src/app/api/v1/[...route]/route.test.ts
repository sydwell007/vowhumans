import { NextRequest } from "next/server";
import { describe, expect, it, beforeEach } from "vitest";
import { POST } from "./route";

function post(resource: string, body: unknown) {
  const request = new NextRequest(`http://localhost/api/v1/${resource}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(request, { params: Promise.resolve({ route: [resource] }) });
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
