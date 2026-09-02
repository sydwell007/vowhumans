import { readFile } from "node:fs/promises";
import postgres from "postgres";

// Confirmed, targeted fixes for production schema drift — each one verified
// as an actual gap (not a speculative "maybe missing"), applied the same
// idempotent, advisory-locked way scripts/migrate-workforce.mjs already
// proves works for this project's deploy pipeline. Add to this file only
// once a real symptom has confirmed a specific gap; this is not a general
// "reapply everything" script.

const shouldRun =
  process.env.VERCEL_ENV === "production" ||
  process.env.RUN_WORKFORCE_MIGRATIONS === "true";

if (!shouldRun) {
  console.log(
    "[schema-fixes] skipped (production deployment or RUN_WORKFORCE_MIGRATIONS=true required)",
  );
  process.exit(0);
}

const connectionString =
  process.env.database_DATABASE_URL_UNPOOLED ??
  process.env.database_POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.DATABASE_POSTGRES_URL ??
  process.env.database_DATABASE_URL ??
  process.env.database_POSTGRES_URL ??
  process.env.database_POSTGRES_URL_NO_SSL ??
  "";

if (!connectionString) {
  throw new Error("[schema-fixes] no PostgreSQL connection variable is configured");
}

let localConnection = false;
try {
  const hostname = new URL(connectionString).hostname.replace(/^\[|\]$/g, "");
  localConnection = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
} catch {
  throw new Error("[schema-fixes] PostgreSQL connection URL is invalid");
}

const migration020 = await readFile(
  new URL("../packages/database/migrations/020_guide_progress.sql", import.meta.url),
  "utf8",
);
const migration022 = await readFile(
  new URL("../packages/database/migrations/022_retire_applications.sql", import.meta.url),
  "utf8",
);
const migration023 = await readFile(
  new URL("../packages/database/migrations/023_digital_human_default_language.sql", import.meta.url),
  "utf8",
);
const migration024 = await readFile(
  new URL("../packages/database/migrations/024_remaining_official_languages_experimental.sql", import.meta.url),
  "utf8",
);

const sql = postgres(connectionString, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 15,
  ssl: localConnection ? false : "require",
  prepare: false,
});
const connection = await sql.reserve();

try {
  // A distinct advisory lock from migrate-workforce.mjs's — Vercel runs
  // prebuild scripts sequentially today, but there's no reason for two
  // unrelated schema fixes to ever contend for the same lock number.
  await connection`SELECT pg_advisory_lock(912_441_018)`;

  // Confirmed live 2026-08-27: a real "Start live test call" attempt on
  // Digital Humans failed with `null value in column "application_id" of
  // relation "sessions" violates not-null constraint". Migration
  // 008_live_sessions.sql already declares `ALTER TABLE sessions ALTER
  // COLUMN application_id DROP NOT NULL` (Studio's own live-test-call flow
  // has always intentionally passed NULL here — there's no consuming
  // application for a Studio test call) — production's schema never
  // actually received that statement. DROP NOT NULL is a no-op, not an
  // error, when the column is already nullable, so this is safe to run on
  // every deploy regardless of the current state.
  const [sessionsColumn] = await connection`
    SELECT is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sessions' AND column_name = 'application_id'
  `;
  if (sessionsColumn && sessionsColumn.is_nullable === "NO") {
    console.log("[schema-fixes] sessions.application_id is NOT NULL in production — applying migration 008's fix");
    await connection`ALTER TABLE sessions ALTER COLUMN application_id DROP NOT NULL`;
  } else {
    console.log("[schema-fixes] sessions.application_id is already nullable");
  }

  // guide_progress / studio_user_preferences (migration 020, guided Studio
  // navigation) are not covered by migrate-workforce.mjs's narrower check —
  // verify and apply idempotently here too, since the discovery above shows
  // this deployment's migration history can't be assumed current.
  const [guideProgressState] = await connection`
    SELECT to_regclass('public.guide_progress') IS NOT NULL AS installed
  `;
  if (!guideProgressState?.installed) {
    console.log("[schema-fixes] guide_progress is missing — applying migration 020");
    await connection.unsafe(migration020);
  } else {
    console.log("[schema-fixes] guide_progress already installed");
  }

  // Retire two exact application records without deleting session history:
  // one duplicate GoalVow Academies slug and the discontinued VowTools app.
  // The migration is intentionally idempotent and safe on every production build.
  console.log("[schema-fixes] enforcing retired application catalogue entries");
  await connection.unsafe(migration022);

  console.log("[schema-fixes] enforcing Digital Human default conversation language");
  await connection.unsafe(migration023);

  console.log("[schema-fixes] exposing remaining official languages as controlled experiments");
  await connection.unsafe(migration024);

  console.log("[schema-fixes] done");
} finally {
  await connection`SELECT pg_advisory_unlock(912_441_018)`.catch(() => {});
  connection.release();
  await sql.end({ timeout: 5 });
}
