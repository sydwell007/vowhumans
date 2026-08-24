import path from "node:path";
import { existsSync } from "node:fs";
import { loadEnvConfig } from "@next/env";
import postgres from "postgres";

// .env.local etc. live at the monorepo root, not this app's own directory. next.config.ts
// also loads them via @next/env, but that mutation doesn't reliably reach the separate
// worker Turbopack dev uses to execute route handlers. Load the complete root env in the
// worker too, even when DATABASE_URL was supplied directly, so independent secrets such
// as AUTH_SECRET and ENCRYPTION_KEY are not silently absent during local development.
// Vercel injects variables directly and has no repository .env file to load.
if (!process.env.VERCEL) {
  try {
    const repositoryRoot = existsSync(
      path.join(process.cwd(), "apps", "studio-web"),
    )
      ? process.cwd()
      : path.resolve(process.cwd(), "../..");
    loadEnvConfig(
      repositoryRoot,
      process.env.NODE_ENV !== "production",
      console,
      true,
    );
  } catch {
    // Not fatal — see comment above.
  }
}

// local/dev uses DATABASE_URL (see docker-compose.yml). Production's actual variable name
// has moved around a few times while getting the Neon integration wired up in the Vercel
// dashboard, so check every name it's realistically ended up under rather than requiring
// one more manual rename in the dashboard. Validate before constructing the client because
// Next.js evaluates route modules during build-time page-data collection, including routes
// that never query PostgreSQL, and postgres.js rejects malformed placeholders immediately.
const configuredConnectionString =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.DATABASE_POSTGRES_URL ??
  process.env.database_DATABASE_URL ??
  process.env.database_POSTGRES_URL ??
  process.env.database_POSTGRES_URL_NO_SSL ??
  "";

let localConnection = false;
let connectionString = "";
try {
  const parsed = new URL(configuredConnectionString);
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("Unsupported database protocol");
  }
  connectionString = configuredConnectionString;
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  localConnection =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
} catch {
  // Route handlers expose the configuration-required response at request time.
  // Keep module evaluation/build safe when a local placeholder is malformed.
}

export const databaseConfigured = connectionString.length > 0;

// A fresh module-scope singleton per server instance. max:1 matches postgres.js's own
// guidance for serverless environments, where each invocation should hold at most one
// connection rather than maintaining a large idle pool.
const sql = postgres(
  connectionString || "postgresql://unconfigured:unconfigured@127.0.0.1:1/unconfigured",
  {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: localConnection ? false : "require",
  // Neon's connection string (and most managed Postgres in front of PgBouncer-style
  // transaction pooling) doesn't reliably support server-side prepared statements across
  // requests — a later query can land on a different pooled backend than the one that
  // prepared it. postgres.js defaults to using them; disable explicitly. Harmless locally
  // too (docker-compose is a direct connection with no pooler).
    prepare: false,
  },
);

export default sql;
