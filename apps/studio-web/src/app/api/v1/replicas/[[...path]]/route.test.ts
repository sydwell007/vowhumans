import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PUT } from "./route";

const { readSessionMock, sqlMock, storeCaptureMock } = vi.hoisted(() => ({
  readSessionMock: vi.fn(),
  sqlMock: vi.fn(),
  storeCaptureMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  SESSION_COOKIE_NAME: "vh_session",
  readSession: readSessionMock,
}));

vi.mock("@/lib/db", () => ({
  databaseConfigured: true,
  default: sqlMock,
}));

vi.mock("@/lib/objectStorage", () => ({
  createPrivateReplicaDownload: vi.fn(),
  createPrivateReplicaUpload: vi.fn(),
  privateObjectStorageConfigured: vi.fn(() => true),
  privateReplicaObjectKey: vi.fn(),
  storePrivateReplicaCapture: storeCaptureMock,
  storePrivateReplicaManifest: vi.fn(),
  verifyPrivateReplicaObject: vi.fn(),
}));

function context(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

describe("Photoreal Replica capture upload boundary", () => {
  const profileId = "11111111-1111-4111-8111-111111111111";
  const segmentId = "22222222-2222-4222-8222-222222222222";
  const bytes = new Uint8Array([1, 2, 3]);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  beforeEach(() => {
    vi.clearAllMocks();
    readSessionMock.mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      organisationId: "44444444-4444-4444-8444-444444444444",
      organisationName: "VowHumans",
      organisationSlug: "vowhumans",
      email: "audit@example.com",
      displayName: "Audit",
      role: "owner",
    });
    sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");
      if (query.includes("FROM replica_profiles")) {
        return [{ id: profileId, identity_id: "identity-1", status: "capturing", active_version_id: null, capture_session_id: "capture-1", capture_status: "capturing" }];
      }
      if (query.includes("SELECT rseg.object_key, rseg.byte_size")) {
        return [{ object_key: "private/capture.webm", byte_size: bytes.byteLength, sha256, media_type: "video/webm" }];
      }
      return [];
    });
  });

  it("protects the same-origin biometric capture endpoint", async () => {
    const response = await PUT(
      new NextRequest(`http://localhost/api/v1/replicas/${profileId}/segments/${segmentId}/content`, {
        method: "PUT",
        headers: { "content-type": "video/webm" },
        body: new Uint8Array([1, 2, 3]),
      }),
      context([profileId, "segments", segmentId, "content"]),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ success: false, code: "UNAUTHORISED" });
  });

  it("verifies and stores an authenticated guided capture without browser-to-bucket CORS", async () => {
    const response = await PUT(
      new NextRequest(`http://localhost/api/v1/replicas/${profileId}/segments/${segmentId}/content`, {
        method: "PUT",
        headers: {
          cookie: "vh_session=test-session",
          "content-type": "video/webm",
          "x-vowhumans-sha256": sha256,
        },
        body: bytes,
      }),
      context([profileId, "segments", segmentId, "content"]),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: { id: segmentId, state: "stored", integrity_verified: true },
    });
    expect(storeCaptureMock).toHaveBeenCalledWith(expect.objectContaining({
      objectKey: "private/capture.webm",
      contentType: "video/webm",
      sha256,
      body: expect.any(Uint8Array),
    }));
  });

  it("rejects changed capture bytes before private storage", async () => {
    const response = await PUT(
      new NextRequest(`http://localhost/api/v1/replicas/${profileId}/segments/${segmentId}/content`, {
        method: "PUT",
        headers: { cookie: "vh_session=test-session", "content-type": "video/webm", "x-vowhumans-sha256": sha256 },
        body: new Uint8Array([9, 9, 9]),
      }),
      context([profileId, "segments", segmentId, "content"]),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ success: false, code: "UPLOAD_INTEGRITY_FAILED" });
    expect(storeCaptureMock).not.toHaveBeenCalled();
  });
});
