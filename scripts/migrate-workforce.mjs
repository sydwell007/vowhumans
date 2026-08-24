import { readFile } from "node:fs/promises";
import postgres from "postgres";

const shouldRun =
  process.env.VERCEL_ENV === "production" ||
  process.env.RUN_WORKFORCE_MIGRATIONS === "true";

if (!shouldRun) {
  console.log(
    "[workforce-migrate] skipped (production deployment or RUN_WORKFORCE_MIGRATIONS=true required)",
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
  throw new Error(
    "[workforce-migrate] no PostgreSQL connection variable is configured",
  );
}

let localConnection = false;
try {
  const hostname = new URL(connectionString).hostname.replace(/^\[|\]$/g, "");
  localConnection =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
} catch {
  throw new Error("[workforce-migrate] PostgreSQL connection URL is invalid");
}

const migration017 = await readFile(
  new URL(
    "../packages/database/migrations/017_digital_workforce.sql",
    import.meta.url,
  ),
  "utf8",
);
const migration018 = await readFile(
  new URL(
    "../packages/database/migrations/018_digital_workforce_seed_templates.sql",
    import.meta.url,
  ),
  "utf8",
);
const migration019 = await readFile(
  new URL(
    "../packages/database/migrations/019_post_deployment_runtime.sql",
    import.meta.url,
  ),
  "utf8",
);

const requiredTables = [
  "workforce_templates",
  "workforce_teams",
  "digital_colleagues",
  "colleague_functions",
  "colleague_skills",
  "colleague_knowledge_sources",
  "workforce_tools",
  "colleague_tool_permissions",
  "colleague_workflows",
  "colleague_objectives",
  "colleague_kpis",
  "colleague_guardrails",
  "colleague_collaboration_routes",
  "colleague_tests",
  "colleague_approvals",
  "colleague_deployments",
  "work_items",
  "work_item_events",
  "work_products",
  "work_product_reviews",
  "colleague_escalations",
  "colleague_costs",
  "workforce_scheduled_jobs",
  "workforce_model_policies",
  "runtime_test_runs",
  "runtime_test_results",
  "provider_health",
  "deployment_readiness",
  "runtime_events",
  "runtime_usage",
  "deployment_promotions",
];

const sql = postgres(connectionString, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 15,
  ssl: localConnection ? false : "require",
  prepare: false,
});
const connection = await sql.reserve();

try {
  // A stable, application-specific advisory lock prevents two production builds
  // from racing the same schema change.
  await connection`SELECT pg_advisory_lock(912_441_017)`;

  const [state] = await connection`
    SELECT to_regclass('public.workforce_templates') IS NOT NULL AS installed
  `;

  if (!state?.installed) {
    console.log("[workforce-migrate] applying migration 017");
    await connection.unsafe(migration017);
  }

  // Migration 018 is an idempotent upsert. Re-running it keeps the bounded role
  // catalogue current without creating duplicate templates.
  console.log("[workforce-migrate] applying migration 018 seed catalogue");
  await connection.unsafe(migration018);

  // Migration 019 is deliberately idempotent. Always apply it so a deployment
  // safely completes an earlier interrupted/partial SQL-editor run as well as
  // adding newly introduced columns to an existing workforce schema.
  console.log("[workforce-migrate] applying migration 019 post-deployment runtime");
  await connection.unsafe(migration019);

  const existing = await connection`
    SELECT tablename
    FROM pg_catalog.pg_tables
    WHERE schemaname = 'public' AND tablename = ANY(${requiredTables})
  `;
  const existingNames = new Set(existing.map((row) => String(row.tablename)));
  const missing = requiredTables.filter((name) => !existingNames.has(name));
  if (missing.length > 0) {
    throw new Error(
      `[workforce-migrate] incomplete schema after migration: ${missing.join(", ")}`,
    );
  }

  const [catalogue] = await connection`
    SELECT count(*)::int AS count
    FROM workforce_templates
    WHERE status = 'published'
  `;
  if (Number(catalogue?.count ?? 0) < 25) {
    throw new Error(
      "[workforce-migrate] role catalogue verification failed (expected at least 25 published templates)",
    );
  }

  console.log(
    `[workforce-migrate] ready (${catalogue.count} published templates)`,
  );
} finally {
  await connection`SELECT pg_advisory_unlock(912_441_017)`.catch(() => {});
  connection.release();
  await sql.end({ timeout: 5 });
}
