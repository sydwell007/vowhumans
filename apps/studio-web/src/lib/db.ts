import path from "node:path";
import postgres from "postgres";

// .env.local etc. live at the monorepo root, not this app's own directory. next.config.ts
// also loads them via @next/env, but that mutation doesn't reliably reach the separate
// worker Turbopack dev uses to execute route handlers — so load here too, directly in
// whichever process actually reads process.env.DATABASE_URL. Cheap, idempotent, and a
// no-op in production (Vercel injects these directly; no .env files exist there to find).
if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require("@next/env") as typeof import("@next/env")).loadEnvConfig(path.resolve(process.cwd(), "../.."));
  } catch {
    // Not fatal — see comment above.
  }
}

// Vercel Postgres injects POSTGRES_URL; local/dev uses DATABASE_URL (see docker-compose.yml).
// Deliberately not validated here: this module is imported by route/layout modules that
// Next.js evaluates during build-time page-data collection, even for routes that never
// run at build time. postgres.js connects lazily, so an empty/missing string only
// surfaces as a real error the first time a query actually runs (i.e. at request time).
const connectionString = process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";

// A fresh module-scope singleton per server instance. max:1 matches postgres.js's own
// guidance for serverless environments, where each invocation should hold at most one
// connection rather than maintaining a large idle pool.
const sql = postgres(connectionString, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: connectionString.includes("localhost") ? false : "require",
});

export default sql;
