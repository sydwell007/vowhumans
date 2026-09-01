import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { afrihostStorageCanonicalRequest, afrihostStorageConfiguration } from "./afrihostStorage";

describe("Afrihost private storage boundary", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
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
});
