import { describe, expect, it } from "vitest";
import { objectStorageEndpointUsable } from "./storageConfiguration";

describe("private object storage endpoint readiness", () => {
  it("allows the AWS SDK regional endpoint when no custom endpoint is configured", () => {
    expect(objectStorageEndpointUsable(undefined, true)).toBe(true);
  });

  it("allows local MinIO only outside production", () => {
    expect(objectStorageEndpointUsable("http://127.0.0.1:9000", false)).toBe(true);
    expect(objectStorageEndpointUsable("http://localhost:9000", true)).toBe(false);
    expect(objectStorageEndpointUsable("https://127.0.0.1:9000", true)).toBe(false);
  });

  it("requires a public HTTPS endpoint in production", () => {
    expect(objectStorageEndpointUsable("http://objects.example.com", true)).toBe(false);
    expect(objectStorageEndpointUsable("https://objects.example.com", true)).toBe(true);
    expect(objectStorageEndpointUsable("not-a-url", true)).toBe(false);
  });
});
