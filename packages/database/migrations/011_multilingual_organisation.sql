-- South African multilingual architecture, part 2 of 5: per-organisation language
-- enablement and per-digital-human voice overrides. Deliberately separate from
-- `language_capabilities` (010) — an organisation can enable a language it wants
-- to use, but that never changes the platform-level capability status. An org
-- admin enabling isiZulu does not make isiZulu "production"; it only means this
-- org wants it available where it's usable, honestly badged either way.
BEGIN;

CREATE TABLE organisation_languages (
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  language_code text NOT NULL REFERENCES languages(code),
  enabled boolean NOT NULL DEFAULT false,
  default_voice_id uuid REFERENCES voices(id),
  preferred_stt_provider text,
  preferred_tts_provider text,
  preferred_realtime_provider text,
  fallback_language_code text REFERENCES languages(code) DEFAULT 'en-ZA',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, language_code)
);

-- Mirrors human_voice_assignments' existing 1:1-per-human composite-PK pattern
-- (005_voice_library.sql), just extended by language — a digital human may use a
-- different voice per language while keeping one identity.
CREATE TABLE digital_human_language_voices (
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  human_slug text NOT NULL,
  language_code text NOT NULL REFERENCES languages(code),
  voice_id uuid REFERENCES voices(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, human_slug, language_code)
);
CREATE INDEX idx_digital_human_language_voices_human ON digital_human_language_voices(organisation_id, human_slug);

ALTER TABLE organisation_languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE digital_human_language_voices ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_organisation_languages ON organisation_languages USING (organisation_id = nullif(current_setting('app.organisation_id', true),'')::uuid) WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true),'')::uuid);
CREATE POLICY tenant_isolation_digital_human_language_voices ON digital_human_language_voices USING (organisation_id = nullif(current_setting('app.organisation_id', true),'')::uuid) WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true),'')::uuid);

COMMIT;
