// Deliberately dependency-free (no node:crypto, no postgres.js) so it can be imported
// from Edge-runtime code (middleware.ts) without pulling in Node-only APIs.
export const SESSION_COOKIE_NAME = "vh_session";
