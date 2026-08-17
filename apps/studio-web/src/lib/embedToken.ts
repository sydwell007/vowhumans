import { createHmac } from "node:crypto";

// Short-lived, HMAC-signed credential minted server-side by studio-web only and
// verified by services/api-gateway/main.py's auth_context() (Python-side
// counterpart of this signing scheme lives there — keep both in sync). Unlike
// VOWHUMANS_SERVICE_API_KEYS (one hand-maintained static key per organisation) or
// the legacy shared VOWHUMANS_SERVICE_API_KEY + trusted-header mode (also held by
// the less-trusted Afrihost PHP adapter, see docs/LIVE_VOICE_DEPLOYMENT.md), this
// token is minted fresh per public embed call and never leaves this process — the
// browser only ever receives the final room-scoped, short-lived LiveKit token.
const EMBED_TOKEN_SCOPE = "embed";

function secret(): string {
  const value = process.env.VOWHUMANS_EMBED_TOKEN_SECRET;
  if (!value) throw new Error("VOWHUMANS_EMBED_TOKEN_SECRET is not configured");
  return value;
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", secret()).update(encodedPayload).digest("base64url");
}

export function mintEmbedToken(organisationId: string, ttlSeconds = 60): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({ organisation_id: organisationId, scope: EMBED_TOKEN_SCOPE, iat: now, exp: now + ttlSeconds });
  const encodedPayload = Buffer.from(payload, "utf8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload)}`;
}
