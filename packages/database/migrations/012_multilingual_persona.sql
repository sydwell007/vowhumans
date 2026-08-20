-- South African multilingual architecture, part 3 of 5: Persona multilingual
-- config. `persona_versions.language` (001) stays the single "primary/default"
-- language exactly as today; `supported_languages` is additive. Per-language
-- opening/fallback messages key to persona_version_id (not persona_id) because
-- persona_versions already version immutably on every edit — keying to the
-- parent persona would let a translation silently go stale against a newer,
-- different draft.
BEGIN;

ALTER TABLE persona_versions ADD COLUMN supported_languages text[] NOT NULL DEFAULT '{}';
ALTER TABLE persona_versions ADD COLUMN code_switching_policy text NOT NULL DEFAULT 'discouraged'
  CHECK (code_switching_policy IN ('discouraged','allowed','encouraged'));
ALTER TABLE persona_versions ADD COLUMN translation_policy text NOT NULL DEFAULT 'fallback_only'
  CHECK (translation_policy IN ('never','fallback_only','always_offer'));

CREATE TABLE persona_version_language_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  persona_version_id uuid NOT NULL REFERENCES persona_versions(id) ON DELETE CASCADE,
  language_code text NOT NULL REFERENCES languages(code),
  opening_message text NOT NULL DEFAULT '',
  fallback_message text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'human' CHECK (source IN ('human','machine_translated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (persona_version_id, language_code)
);

-- Shared organisation style-guide, not tied to any one persona — company names,
-- SA place names, pronunciation guidance, terms a translator/TTS pipeline must
-- never substitute. Reused across every persona/digital human in the language.
CREATE TABLE terminology_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  language_code text NOT NULL REFERENCES languages(code),
  source_term text NOT NULL,
  preferred_form text NOT NULL,
  phonetic_guidance text NOT NULL DEFAULT '',
  translation text NOT NULL DEFAULT '',
  prohibited_translation text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, language_code, source_term)
);
CREATE INDEX idx_terminology_org_lang ON terminology_entries(organisation_id, language_code);

ALTER TABLE persona_version_language_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE terminology_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_persona_version_language_messages ON persona_version_language_messages USING (organisation_id = nullif(current_setting('app.organisation_id', true),'')::uuid) WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true),'')::uuid);
CREATE POLICY tenant_isolation_terminology_entries ON terminology_entries USING (organisation_id = nullif(current_setting('app.organisation_id', true),'')::uuid) WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true),'')::uuid);

COMMIT;
