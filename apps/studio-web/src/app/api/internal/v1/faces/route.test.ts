import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/faces", () => ({
  resolveFaceBytes: vi.fn(),
}));

import { resolveFaceBytes } from "@/lib/faces";
import { GET } from "./route";

function get(headers: Record<string, string>, query = "") {
  const request = new NextRequest(`http://localhost/api/internal/v1/faces${query}`, { headers });
  return GET(request);
}

describe("GET /api/internal/v1/faces", () => {
  beforeEach(() => {
    process.env.VOWHUMANS_INTERNAL_KEY = "test-internal-key";
    vi.mocked(resolveFaceBytes).mockReset();
  });

  it("rejects requests with no internal key", async () => {
    const res = await get({}, "?human_slug=thandi-mokoena");
    expect(res.status).toBe(401);
  });

  it("rejects requests with the wrong internal key", async () => {
    const res = await get({ "x-internal-key": "wrong", "x-organisation-id": "org-1" }, "?human_slug=thandi-mokoena");
    expect(res.status).toBe(401);
  });

  it("rejects requests missing organisation_id or human_slug", async () => {
    const res = await get({ "x-internal-key": "test-internal-key" });
    expect(res.status).toBe(422);
  });

  it("returns 404 when no face is assigned", async () => {
    vi.mocked(resolveFaceBytes).mockResolvedValue(null);
    const res = await get({ "x-internal-key": "test-internal-key", "x-organisation-id": "org-1" }, "?human_slug=thandi-mokoena");
    expect(res.status).toBe(404);
  });

  it("streams the face bytes when one is assigned", async () => {
    vi.mocked(resolveFaceBytes).mockResolvedValue({ data: Buffer.from([1, 2, 3]), mimeType: "image/png" });
    const res = await get({ "x-internal-key": "test-internal-key", "x-organisation-id": "org-1" }, "?human_slug=thandi-mokoena");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const body = Buffer.from(await res.arrayBuffer());
    expect(Array.from(body)).toEqual([1, 2, 3]);
  });
});
