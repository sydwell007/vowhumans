-- South African multilingual architecture, part 5 of 5: Presenter Studio
-- translation-as-a-version, and transcript language/encoding fields.
--
-- presenter_scene_translations never overwrites presenter_scenes.script — the
-- source script is the one thing this feature must never silently touch. Every
-- translation is its own explicit, reviewable row.
--
-- The 4 new transcripts columns are additive schema only. No code anywhere in
-- this repo currently writes a transcripts row at all (encrypted_text has no
-- INSERT path yet) — these columns exist so that whenever that pipeline is
-- actually built, detected/requested/original/translated language never has to
-- share one column and silently overwrite each other. See
-- docs/MULTILINGUAL_IMPLEMENTATION_REPORT.md for this honest scoping note.
BEGIN;

CREATE TABLE presenter_scene_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  scene_id uuid NOT NULL REFERENCES presenter_scenes(id) ON DELETE CASCADE,
  language_code text NOT NULL REFERENCES languages(code),
  translated_script text NOT NULL,
  translation_provider text NOT NULL DEFAULT 'openai-chat',
  translation_status text NOT NULL DEFAULT 'machine_draft'
    CHECK (translation_status IN ('machine_draft','human_reviewed','approved','rejected')),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scene_id, language_code)
);

ALTER TABLE transcripts ADD COLUMN detected_language text;
ALTER TABLE transcripts ADD COLUMN requested_language text;
ALTER TABLE transcripts ADD COLUMN translated_language text;
ALTER TABLE transcripts ADD COLUMN translated_encrypted_text bytea;

ALTER TABLE presenter_scene_translations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_presenter_scene_translations ON presenter_scene_translations USING (organisation_id = nullif(current_setting('app.organisation_id', true),'')::uuid) WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true),'')::uuid);

COMMIT;
