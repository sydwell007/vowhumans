import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { afrihostStorageCanonicalRequest, afrihostStorageConfiguration, headAfrihostObject } from "./afrihostStorage";

describe("Afrihost private storage boundary", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses an unambiguous canonical request for HMAC authentication", () => {
    expect(afrihostStorageCanonicalRequest({
      method: "put",
      action: "put-part",
      timestamp: "1777777777",
      nonce: "11111111-1111-4111-8111-111111111111",
      objectKey: "organisations/a/replicas/b/captures/c/video.webm",
      bodySha256: "f".repeat(64),
    })).toBe(`PUT\nput-part\n1777777777\n11111111-1111-4111-8111-111111111111\norganisations/a/replicas/b/captures/c/video.webm\n${"f".repeat(64)}`);
  });

  it("requires HTTPS and a strong server-side shared secret in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AFRIHOST_PRIVATE_STORAGE_URL", "https://api.vowhumans.com/api/v1/replica-storage/");
    vi.stubEnv("AFRIHOST_PRIVATE_STORAGE_SECRET", "x".repeat(48));
    expect(afrihostStorageConfiguration()).toEqual({
      endpoint: "https://api.vowhumans.com/api/v1/replica-storage",
      secret: "x".repeat(48),
    });
    vi.stubEnv("AFRIHOST_PRIVATE_STORAGE_URL", "http://api.vowhumans.com/api/v1/replica-storage/");
    expect(afrihostStorageConfiguration()).toBeNull();
  });

  it("sends an explicit zero-byte body for signed POST requests", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AFRIHOST_PRIVATE_STORAGE_URL", "https://api.vowhumans.com/api/v1/replica-storage/");
    vi.stubEnv("AFRIHOST_PRIVATE_STORAGE_SECRET", "x".repeat(48));
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      success: true,
      data: { byte_size: 1, sha256: "a".repeat(64), content_type: "video/webm" },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await headAfrihostObject("organisations/a/replicas/b/captures/c/video.webm");

    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "content-type": "application/octet-stream",
      "x-vowhumans-storage-body-sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    });
    expect(Buffer.from(init.body as Uint8Array)).toHaveLength(0);
  });
});
