import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import sql from "./db";
import { SESSION_COOKIE_NAME } from "./session-cookie";

export { SESSION_COOKIE_NAME };

const scrypt = promisify(scryptCallback);
const SCRYPT_KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, SCRYPT_KEYLEN)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = (await scrypt(password, salt, expected.length)) as Buffer;
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const SESSION_RENEW_THRESHOLD_SECONDS = 15 * 24 * 60 * 60; // renew once under 15 days left
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

function tokenHash(token: string): string {
  // AUTH_SECRET peppers the stored hash so a leaked DB alone can't be used to forge sessions.
  return createHmac("sha256", process.env.AUTH_SECRET ?? "").update(token).digest("hex");
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sessionCookieOptions(maxAgeSeconds = SESSION_TTL_SECONDS) {
  const domain = process.env.SESSION_COOKIE_DOMAIN;
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
    ...(domain && domain !== "localhost" ? { domain } : {}),
  };
}

export type SessionUser = {
  id: string;
  organisationId: string;
  organisationName: string;
  organisationSlug: string;
  email: string;
  displayName: string;
  role: string;
};

export async function createSession(userId: string, organisationId: string, userAgent: string | null): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await sql`INSERT INTO web_sessions (user_id, organisation_id, token_hash, expires_at, user_agent) VALUES (${userId}, ${organisationId}, ${tokenHash(token)}, ${expiresAt}, ${userAgent})`;
  return token;
}

export async function readSession(token: string): Promise<SessionUser | null> {
  const rows = await sql<{
    id: string; organisation_id: string; organisation_name: string; organisation_slug: string;
    email: string; display_name: string; role: string; expires_at: Date;
  }[]>`
    SELECT u.id, u.organisation_id, o.name AS organisation_name, o.slug AS organisation_slug, u.email, u.display_name, u.role, s.expires_at
    FROM web_sessions s JOIN users u ON u.id = s.user_id JOIN organisations o ON o.id = u.organisation_id
    WHERE s.token_hash = ${tokenHash(token)} AND s.expires_at > now()
  `;
  const row = rows[0];
  if (!row) return null;

  const remainingSeconds = (new Date(row.expires_at).getTime() - Date.now()) / 1000;
  const newExpiresAt = remainingSeconds < SESSION_RENEW_THRESHOLD_SECONDS ? new Date(Date.now() + SESSION_TTL_SECONDS * 1000) : undefined;
  await sql`UPDATE web_sessions SET last_seen_at = now()${newExpiresAt ? sql`, expires_at = ${newExpiresAt}` : sql``} WHERE token_hash = ${tokenHash(token)}`;

  return {
    id: row.id,
    organisationId: row.organisation_id,
    organisationName: row.organisation_name,
    organisationSlug: row.organisation_slug,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
  };
}

export async function destroySession(token: string): Promise<void> {
  await sql`DELETE FROM web_sessions WHERE token_hash = ${tokenHash(token)}`;
}

export async function isLockedOut(userId: string): Promise<boolean> {
  const rows = await sql<{ locked_until: Date | null }[]>`SELECT locked_until FROM users WHERE id = ${userId}`;
  const lockedUntil = rows[0]?.locked_until;
  return Boolean(lockedUntil && new Date(lockedUntil).getTime() > Date.now());
}

export async function recordFailedLogin(userId: string): Promise<void> {
  const lockUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
  await sql`
    UPDATE users SET failed_login_attempts = failed_login_attempts + 1,
      locked_until = CASE WHEN failed_login_attempts + 1 >= ${MAX_FAILED_ATTEMPTS} THEN ${lockUntil} ELSE locked_until END
    WHERE id = ${userId}
  `;
}

export async function resetFailedLogins(userId: string): Promise<void> {
  await sql`UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = ${userId}`;
}
