import { readFile } from "node:fs/promises";
import postgres from "postgres";

const shouldRun = process.env.VERCEL_ENV === "production" || process.env.RUN_REPLICA_MIGRATIONS === "true";
if (!shouldRun) {
  console.log("[replica-migrate] skipped (production deployment or RUN_REPLICA_MIGRATIONS=true required)");
  process.exit(0);
}

const connectionString =
  process.env.database_DATABASE_URL_UNPOOLED ?? process.env.database_POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.DATABASE_POSTGRES_URL ??
  process.env.database_DATABASE_URL ?? process.env.database_POSTGRES_URL ??
  process.env.database_POSTGRES_URL_NO_SSL ?? "";
if (!connectionString) throw new Error("[replica-migrate] no PostgreSQL connection variable is configured");

let localConnection = false;
try {
  const hostname = new URL(connectionString).hostname.replace(/^\[|\]$/g, "");
  localConnection = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
} catch {
  throw new Error("[replica-migrate] PostgreSQL connection URL is invalid");
}

const migration = await readFile(new URL("../packages/database/migrations/021_photoreal_replicas.sql", import.meta.url), "utf8");
const requiredTables = [
  "replica_profiles", "replica_capture_sessions", "replica_capture_segments",
  "replica_processing_jobs", "replica_versions", "replica_motion_clips",
  "replica_quality_checks", "human_replica_assignments",
];
const sql = postgres(connectionString, { max: 1, idle_timeout: 20, connect_timeout: 15, ssl: localConnection ? false : "require", prepare: false });
const connection = await sql.reserve();
try {
  await connection`SELECT pg_advisory_lock(912_441_021)`;
  console.log("[replica-migrate] applying additive migration 021");
  await connection.unsafe(migration);
  const existing = await connection`
    SELECT tablename FROM pg_catalog.pg_tables
    WHERE schemaname='public' AND tablename=ANY(${requiredTables})
  `;
  const names = new Set(existing.map((row) => String(row.tablename)));
  const missing = requiredTables.filter((name) => !names.has(name));
  if (missing.length) throw new Error(`[replica-migrate] incomplete schema: ${missing.join(", ")}`);
  const forbidden = await connection`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema='public' AND table_name=ANY(${requiredTables}) AND data_type='bytea'
  `;
  if (forbidden.length) throw new Error("[replica-migrate] raw binary media column detected; replicas must store private object references only");
  console.log("[replica-migrate] ready (8 tenant-scoped metadata tables; no bytea media columns)");
} finally {
  await connection`SELECT pg_advisory_unlock(912_441_021)`.catch(() => {});
  connection.release();
  await sql.end({ timeout: 5 });
}
