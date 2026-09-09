import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import postgres from "postgres";

// Idempotent seed for PlugConnect's "Interview Practice" digital humans.
//
// Creates (only if absent) an "PlugConnect Interview Practice" application plus
// two disclosed AI digital humans — Thandi Mokoena and Sipho Dlamini — each with
// a face, a built-in OpenAI voice, and a published interview-facilitator persona,
// then pairs both to the application so they can be embedded on plugconnect.co.za.
//
// Run manually against the target database (never wired into a build):
//   node scripts/seed-plugconnect-interview.mjs --org <organisation_id>
// Optional: --app-slug (default plugconnect-interview-practice),
//           --origin (default https://plugconnect.co.za),
//           --database-url (else DATABASE_URL / POSTGRES_URL env).
//
// The per-call role / panel / language briefing is layered at runtime by
// _ground_in_interview() in services/realtime-agent/livekit_agent.py — these
// personas are deliberately generic.

const { values } = parseArgs({
  options: {
    org: { type: "string" },
    "app-slug": { type: "string", default: "plugconnect-interview-practice" },
    origin: { type: "string", default: "https://plugconnect.co.za" },
    "database-url": { type: "string" },
  },
});

const organisationId = values.org;
const appSlug = values["app-slug"];
const origin = values.origin;
if (!organisationId) {
  console.error("Missing --org <organisation_id>");
  process.exit(1);
}

const connectionString =
  values["database-url"] ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.database_DATABASE_URL_UNPOOLED ||
  process.env.database_POSTGRES_URL_NON_POOLING ||
  "";
if (!connectionString) {
  console.error("No database connection string (pass --database-url or set DATABASE_URL)");
  process.exit(1);
}

let localConnection = false;
try {
  const host = new URL(connectionString).hostname.replace(/^\[|\]$/g, "");
  localConnection = host === "localhost" || host === "127.0.0.1" || host === "::1";
} catch {
  console.error("Invalid database connection string");
  process.exit(1);
}

const LANGUAGES = [
  "en-ZA", "zu-ZA", "xh-ZA", "af-ZA", "nso-ZA", "tn-ZA",
  "st-ZA", "ts-ZA", "ss-ZA", "ve-ZA", "nr-ZA",
];

const HUMANS = [
  {
    key: "thandi",
    name: "Thandi Mokoena",
    role: "Talent partner",
    image: "thandi.png",
    voice: process.env.PLUGCONNECT_THANDI_VOICE || "marin",
    style: "Warm, encouraging, and structured. Opens the conversation, puts the candidate at ease, and covers motivation, culture fit, and closing questions.",
  },
  {
    key: "sipho",
    name: "Sipho Dlamini",
    role: "Hiring manager",
    image: "sipho.png",
    voice: process.env.PLUGCONNECT_SIPHO_VOICE || "cedar",
    style: "Direct, professional, and detail-oriented. Probes role capability, behavioural examples, and judgement with focused follow-up questions.",
  },
];

const DISCLOSURE =
  "You are an AI-generated digital human used for private interview practice on PlugConnect. You are not a real person, a recruiter, or a hiring decision-maker.";

function baseInstructions(human) {
  return [
    `You are ${human.name}, a professional interview-practice facilitator for PlugConnect, a South African jobs platform.`,
    `Personality: ${human.style}`,
    "Run a realistic but supportive mock interview. Ask one question at a time and wait for the full answer.",
    "Speak clear, warm South African English unless another active language has been selected for the session.",
    "Never ask about race, age, disability, health, religion, family or pregnancy plans, or politics.",
    "Never promise employment, give a hiring score, or suggest that an employer will see this private practice.",
    "If the candidate struggles, briefly coach them on how to approach the question, then continue.",
    "The session may supply an approved role briefing; when it does, make every question relevant to that role.",
  ].join(" ");
}

const sql = postgres(connectionString, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 15,
  ssl: localConnection ? false : "require",
  prepare: false,
});

async function main() {
  const [org] = await sql`SELECT id FROM organisations WHERE id = ${organisationId}`;
  if (!org) throw new Error(`Organisation ${organisationId} not found`);

  await sql`SELECT pg_advisory_lock(hashtext('seed-plugconnect-interview'))`;
  try {
    // 1. Application
    let [application] = await sql`
      SELECT id, settings FROM applications WHERE organisation_id = ${organisationId} AND slug = ${appSlug}
    `;
    if (!application) {
      [application] = await sql`
        INSERT INTO applications (organisation_id, name, slug, status, settings)
        VALUES (${organisationId}, 'PlugConnect Interview Practice', ${appSlug}, 'active',
          ${sql.json({ allowed_embed_origins: [origin] })})
        RETURNING id, settings
      `;
      console.log(`  + application ${appSlug} (${application.id})`);
    } else {
      const origins = new Set([
        ...(Array.isArray(application.settings?.allowed_embed_origins)
          ? application.settings.allowed_embed_origins
          : []),
        origin,
      ]);
      await sql`
        UPDATE applications
        SET status = 'active',
            settings = settings || ${sql.json({ allowed_embed_origins: [...origins] })}
        WHERE id = ${application.id}
      `;
      console.log(`  = application ${appSlug} (${application.id})`);
    }

    const digitalHumanIds = {};

    for (const human of HUMANS) {
      // 2. Identity (disclosed placeholder)
      let [identity] = await sql`
        SELECT id FROM identities WHERE organisation_id = ${organisationId} AND display_name = ${human.name}
      `;
      if (!identity) {
        [identity] = await sql`
          INSERT INTO identities (organisation_id, owner_name, display_name, provenance, commercial_use_confirmed, state)
          VALUES (${organisationId}, 'GoalVow original placeholder', ${human.name},
            ${sql.json({ kind: "ai_generated", note: "PlugConnect interview practice persona" })}, true, 'approved')
          RETURNING id
        `;
      }

      // 3. Face asset (bytes -> media_blobs -> face_assets)
      const objectKey = `plugconnect-interview/${human.key}.png`;
      const bytes = await readFile(
        new URL(`../apps/studio-web/public/humans/${human.image}`, import.meta.url),
      );
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      await sql`
        INSERT INTO media_blobs (object_key, organisation_id, mime_type, data, size_bytes)
        VALUES (${objectKey}, ${organisationId}, 'image/png', ${bytes}, ${bytes.length})
        ON CONFLICT (object_key) DO NOTHING
      `;
      let [face] = await sql`
        SELECT id FROM face_assets WHERE organisation_id = ${organisationId} AND object_key = ${objectKey}
      `;
      if (!face) {
        // identity_id stays NULL on the face/voice assets on purpose: these are
        // disclosed AI-generated likenesses, not a real person's, so there is no
        // consent chain to enforce. embed-sessions only runs its identity-consent
        // gate when face_assets.identity_id / voices.identity_id are set.
        [face] = await sql`
          INSERT INTO face_assets (organisation_id, object_key, sha256, media_type, preprocessing_state, state)
          VALUES (${organisationId}, ${objectKey}, ${sha256}, 'image/png', 'ready', 'active')
          RETURNING id
        `;
      }

      // 4. Voice (built-in OpenAI)
      let [voice] = await sql`
        SELECT id FROM voices WHERE organisation_id = ${organisationId} AND name = ${`${human.name} (interview)`}
      `;
      if (!voice) {
        [voice] = await sql`
          INSERT INTO voices (organisation_id, name, provider, provider_voice_id, language, is_custom, state)
          VALUES (${organisationId}, ${`${human.name} (interview)`}, 'openai',
            ${human.voice}, 'en-ZA', false, 'active')
          RETURNING id
        `;
      }

      // 5. Persona + published version 1
      let [persona] = await sql`
        SELECT id FROM personas WHERE organisation_id = ${organisationId} AND name = ${`${human.name} — Interview Practice`}
      `;
      if (!persona) {
        [persona] = await sql`
          INSERT INTO personas (organisation_id, name, description)
          VALUES (${organisationId}, ${`${human.name} — Interview Practice`},
            'PlugConnect private interview-practice facilitator.')
          RETURNING id
        `;
      }
      let [version] = await sql`
        SELECT id FROM persona_versions WHERE persona_id = ${persona.id} AND version = 1
      `;
      if (!version) {
        [version] = await sql`
          INSERT INTO persona_versions (
            organisation_id, persona_id, version, state, role, system_instructions,
            conversation_style, opening_message, language, max_response_words,
            voice_id, face_asset_id, supported_languages, published_at)
          VALUES (
            ${organisationId}, ${persona.id}, 1, 'published', ${human.role},
            ${baseInstructions(human)},
            ${human.style},
            ${`Hello, I am ${human.name}. I will help you practise for your interview today.`},
            'en-ZA', 90, ${voice.id}, ${face.id}, ${LANGUAGES}, now())
          RETURNING id
        `;
      } else {
        await sql`
          UPDATE persona_versions
          SET state = 'published', published_at = COALESCE(published_at, now()),
              voice_id = ${voice.id}, face_asset_id = ${face.id},
              system_instructions = ${baseInstructions(human)},
              supported_languages = ${LANGUAGES}
          WHERE id = ${version.id}
        `;
      }

      // 6. Digital human
      let [dh] = await sql`
        SELECT id FROM digital_humans WHERE organisation_id = ${organisationId} AND name = ${human.name}
      `;
      if (!dh) {
        [dh] = await sql`
          INSERT INTO digital_humans (
            organisation_id, identity_id, name, role, disclosure,
            default_voice_id, default_face_asset_id, default_language_code, state)
          VALUES (${organisationId}, ${identity.id}, ${human.name}, ${human.role}, ${DISCLOSURE},
            ${voice.id}, ${face.id}, 'en-ZA', 'active')
          RETURNING id
        `;
      } else {
        await sql`
          UPDATE digital_humans
          SET state = 'active', default_voice_id = ${voice.id},
              default_face_asset_id = ${face.id}, disclosure = ${DISCLOSURE}, updated_at = now()
          WHERE id = ${dh.id}
        `;
      }
      digitalHumanIds[human.key] = dh.id;
      const slug = String(dh.id);

      // 7. Assignments (keyed by the digital human's own id, as text)
      await sql`
        INSERT INTO human_face_assignments (organisation_id, human_slug, face_asset_id)
        VALUES (${organisationId}, ${slug}, ${face.id})
        ON CONFLICT (organisation_id, human_slug) DO UPDATE SET face_asset_id = EXCLUDED.face_asset_id
      `;
      await sql`
        INSERT INTO human_voice_assignments (organisation_id, human_slug, voice_id)
        VALUES (${organisationId}, ${slug}, ${voice.id})
        ON CONFLICT (organisation_id, human_slug) DO UPDATE SET voice_id = EXCLUDED.voice_id
      `;
      await sql`
        INSERT INTO human_persona_assignments (organisation_id, human_slug, persona_version_id)
        VALUES (${organisationId}, ${slug}, ${version.id})
        ON CONFLICT (organisation_id, human_slug) DO UPDATE SET persona_version_id = EXCLUDED.persona_version_id
      `;

      // 8. Pair to the application
      await sql`
        INSERT INTO digital_human_applications (organisation_id, digital_human_id, application_id, persona_version_id, enabled)
        VALUES (${organisationId}, ${dh.id}, ${application.id}, ${version.id}, true)
        ON CONFLICT (digital_human_id, application_id)
        DO UPDATE SET enabled = true, persona_version_id = EXCLUDED.persona_version_id
      `;
      console.log(`  = digital human ${human.name} (${dh.id})`);
    }

    console.log("\nDone. PlugConnect env vars:");
    console.log(`  VOWHUMANS_INTERVIEW_APPLICATION_SLUG=${appSlug}`);
    console.log(`  VOWHUMANS_THANDI_DIGITAL_HUMAN_ID=${digitalHumanIds.thandi}`);
    console.log(`  VOWHUMANS_SIPHO_DIGITAL_HUMAN_ID=${digitalHumanIds.sipho}`);
  } finally {
    await sql`SELECT pg_advisory_unlock(hashtext('seed-plugconnect-interview'))`.catch(() => {});
  }
}

main()
  .then(() => sql.end({ timeout: 5 }))
  .catch(async (error) => {
    console.error(error);
    await sql.end({ timeout: 5 });
    process.exit(1);
  });
