import { describe, expect, it } from "vitest";
import { mintRigged3DGrant, validatedPlayerUrl, validatedServiceUrl } from "./rigged3d";

describe("rigged 3D runtime boundary", () => {
  it("allows HTTPS services and development loopback only", () => {
    expect(validatedServiceUrl("https://runtime.vowhumans.com", "production")?.hostname).toBe("runtime.vowhumans.com");
    expect(validatedServiceUrl("http://127.0.0.1:8787", "development")?.port).toBe("8787");
    expect(validatedServiceUrl("http://runtime.example.com", "development")).toBeNull();
    expect(validatedServiceUrl("http://127.0.0.1:8787", "production")).toBeNull();
  });

  it("accepts a player URL only on the configured origin", () => {
    expect(validatedPlayerUrl("https://stream.vowhumans.com/?StreamerId=abc", "https://stream.vowhumans.com", "production"))
      .toBe("https://stream.vowhumans.com/?StreamerId=abc");
    expect(validatedPlayerUrl("https://evil.example/?StreamerId=abc", "https://stream.vowhumans.com", "production")).toBeNull();
    expect(validatedPlayerUrl("javascript:alert(1)", "https://stream.vowhumans.com", "production")).toBeNull();
  });

  it("mints a scoped, expiring HMAC grant without exposing the secret", () => {
    const secret = "test-secret-that-is-at-least-32-characters";
    const token = mintRigged3DGrant({
      session_id: "session-id",
      organisation_id: "organisation-id",
      digital_human_id: "human-id",
      replica_version_id: "version-id",
      character_manifest_ref: "metahumans/ada/manifest.json",
    }, secret);
    const [encoded, signature] = token.split(".");
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    expect(payload.scope).toBe("rigged-3d-session");
    expect(payload.exp).toBeGreaterThan(payload.iat);
    expect(signature).toBeTruthy();
    expect(token).not.toContain(secret);
  });
});
