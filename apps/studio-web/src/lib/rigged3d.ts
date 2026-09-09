import { createHmac } from "node:crypto";

export type Rigged3DGrantClaims = {
  session_id: string;
  organisation_id: string;
  digital_human_id: string;
  replica_version_id: string;
  character_manifest_ref: string;
};

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function validatedServiceUrl(value: string | undefined, environment = process.env.NODE_ENV): URL | null {
  try {
    const url = value ? new URL(value) : null;
    if (!url || url.username || url.password || url.hash) return null;
    if (url.protocol === "https:") return url;
    if (environment !== "production" && url.protocol === "http:" && isLoopback(url.hostname)) return url;
    return null;
  } catch {
    return null;
  }
}

export function validatedPlayerUrl(value: unknown, allowedOrigin: string | undefined, environment = process.env.NODE_ENV): string | null {
  const configuredOrigin = validatedServiceUrl(allowedOrigin, environment)?.origin;
  if (!configuredOrigin || typeof value !== "string" || value.length > 4096) return null;
  try {
    const player = new URL(value);
    if (player.origin !== configuredOrigin || player.username || player.password) return null;
    return player.toString();
  } catch {
    return null;
  }
}

export function mintRigged3DGrant(claims: Rigged3DGrantClaims, secret: string, ttlSeconds = 90): string {
  if (secret.length < 32) throw new Error("RIGGED_3D_RUNTIME_SECRET must contain at least 32 characters");
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ ...claims, scope: "rigged-3d-session", iat: now, exp: now + ttlSeconds }), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
