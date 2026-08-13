// One-off seed: assigns a real face to the public interview demo's digital human,
// so avatar-participant has something to render. Without this, PUBLIC_DEMO_ORGANISATION_ID
// (apps/studio-web/src/app/api/v1/[...route]/route.ts) has no face_assets rows at all —
// the demo works fine, it just correctly and silently stays audio-only.
//
// Usage: node scripts/seed-demo-face.mjs <path-to-env-file>
// (reads and parses the file itself rather than relying on `node --env-file`,
// which mishandled this project's quoted values pulled via `vercel env pull`)
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import postgres from "postgres";

const ORGANISATION_ID = "00000000-0000-4000-8000-000000000001"; // seeded in 002_seed.sql
const IDENTITY_ID = "20000000-0000-4000-8000-000000000001"; // "Thandi Mokoena", same seed
const HUMAN_SLUG = "thandi-mokoena"; // apps/studio-web/src/data/platform.ts humans[0].id
const IMAGE_PATH = "apps/studio-web/public/humans/thandi.png";

async function loadEnvFile(path) {
  const text = await readFile(path, "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let [, key, value] = match;
    value = value.trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const envFilePath = process.argv[2];
const fileEnv = envFilePath ? await loadEnvFile(envFilePath) : {};
const env = { ...process.env, ...fileEnv };

// Vercel's Neon integration also exposes the connection as discrete PG* fields
// (database_PGHOST/PGUSER/PGPASSWORD/PGDATABASE) alongside the assembled URL —
// preferred here since it sidesteps any URL-encoding mismatch between how the
// pooled connection string escapes special characters and how the URL parser
// postgres.js uses expects them to be escaped.
const host = env.database_PGHOST ?? env.PGHOST;
const user = env.database_PGUSER ?? env.PGUSER;
const password = env.database_PGPASSWORD ?? env.PGPASSWORD;
const database = env.database_PGDATABASE ?? env.PGDATABASE;

let sql;
if (host && user && password && database) {
  sql = postgres({ host, port: 5432, database, user, password, ssl: "require", max: 1 });
} else {
  // Same fallback chain as apps/studio-web/src/lib/db.ts — production's actual
  // variable name has moved around a few times in the Vercel dashboard.
  const connectionString =
    env.DATABASE_URL ?? env.POSTGRES_URL ?? env.DATABASE_POSTGRES_URL ?? env.database_POSTGRES_URL ?? env.database_POSTGRES_URL_NO_SSL;
  if (!connectionString) {
    console.error("No DATABASE_URL-equivalent env var is set. Run with: node scripts/seed-demo-face.mjs <path-to-env-file>");
    process.exit(1);
  }
  sql = postgres(connectionString, { max: 1, ssl: connectionString.includes("localhost") ? false : "require" });
}

try {
  const data = await readFile(IMAGE_PATH);
  const objectKey = `face/${ORGANISATION_ID}/${randomUUID()}.png`;
  const sha256 = createHash("sha256").update(data).digest("hex");

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO media_blobs (object_key, organisation_id, mime_type, data, size_bytes)
      VALUES (${objectKey}, ${ORGANISATION_ID}, 'image/png', ${data}, ${data.length})
    `;
    const [face] = await tx`
      INSERT INTO face_assets (organisation_id, identity_id, object_key, sha256, media_type, provenance, detector_provider, preprocessing_state, state)
      VALUES (${ORGANISATION_ID}, ${IDENTITY_ID}, ${objectKey}, ${sha256}, 'image/png', ${JSON.stringify({ source: "seed-script" })}::jsonb, 'seed-script', 'ready', 'active')
      RETURNING id
    `;
    await tx`
      INSERT INTO human_face_assignments (organisation_id, human_slug, face_asset_id)
      VALUES (${ORGANISATION_ID}, ${HUMAN_SLUG}, ${face.id})
      ON CONFLICT (organisation_id, human_slug) DO UPDATE SET face_asset_id = EXCLUDED.face_asset_id, assigned_at = now()
    `;
    console.log(`Assigned face_assets.id=${face.id} (object_key=${objectKey}) to ${HUMAN_SLUG} under organisation ${ORGANISATION_ID}.`);
  });
} finally {
  await sql.end();
}
