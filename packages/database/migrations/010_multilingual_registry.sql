-- South African multilingual architecture, part 1 of 5: the global capability
-- registry. `languages` and `language_capabilities` carry no organisation_id —
-- there is no real tenant boundary here (whether OpenAI's Whisper documents
-- support for isiZulu is a platform fact, not a per-org opinion), and this repo
-- never actually issues `SET LOCAL app.organisation_id` in practice anyway (every
-- other table's tenant isolation is enforced by explicit `WHERE organisation_id`
-- in application code, not by the RLS session variable actually being set) — so
-- these two tables intentionally get no RLS policy rather than a fake tenant
-- column invented just to fit the pattern.
--
-- Seeded honestly: only en-ZA reaches 'production'/'beta' below (OpenAI's actual
-- documented language coverage), af-ZA seeds 'experimental', and the other 9
-- official languages seed 'unsupported' — none of them have passed any real
-- quality gate yet. See docs/MULTILINGUAL_AUDIT.md and
-- docs/MULTILINGUAL_IMPLEMENTATION_REPORT.md for the full picture. A language's
-- status only ever moves via a deliberate manual UPDATE after real testing
-- (docs/SOUTH_AFRICAN_LANGUAGE_QA.md) — never automatically, and never from this
-- seed data alone.
BEGIN;

CREATE TABLE languages (
  code text PRIMARY KEY,
  english_name text NOT NULL,
  native_name text NOT NULL,
  official boolean NOT NULL DEFAULT true,
  sort_order smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE language_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  language_code text NOT NULL REFERENCES languages(code),
  capability text NOT NULL CHECK (capability IN ('stt','reasoning','tts','realtime','translation')),
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'unsupported'
    CHECK (status IN ('unsupported','experimental','beta','production','degraded','temporarily-unavailable')),
  fallback_language_code text REFERENCES languages(code),
  notes text NOT NULL DEFAULT '',
  last_checked_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (language_code, capability, provider)
);
CREATE INDEX idx_language_capabilities_lookup ON language_capabilities(language_code, capability, status);

INSERT INTO languages (code, english_name, native_name, sort_order) VALUES
  ('en-ZA', 'English (South Africa)', 'English', 0),
  ('zu-ZA', 'isiZulu', 'isiZulu', 1),
  ('xh-ZA', 'isiXhosa', 'isiXhosa', 2),
  ('af-ZA', 'Afrikaans', 'Afrikaans', 3),
  ('nso-ZA', 'Sepedi', 'Sepedi', 4),
  ('tn-ZA', 'Setswana', 'Setswana', 5),
  ('st-ZA', 'Sesotho', 'Sesotho', 6),
  ('ts-ZA', 'Xitsonga', 'Xitsonga', 7),
  ('ss-ZA', 'siSwati', 'siSwati', 8),
  ('ve-ZA', 'Tshivenda', 'Tshivenda', 9),
  ('nr-ZA', 'isiNdebele', 'isiNdebele', 10);

DO $$
DECLARE lang record; cap text;
BEGIN
  FOR lang IN SELECT code FROM languages LOOP
    FOR cap IN SELECT unnest(ARRAY['stt','reasoning','tts','realtime','translation']) LOOP
      INSERT INTO language_capabilities (language_code, capability, provider, status, fallback_language_code, notes)
      VALUES (
        lang.code, cap, 'openai',
        CASE
          WHEN lang.code = 'en-ZA' AND cap IN ('reasoning','tts','realtime') THEN 'production'
          WHEN lang.code = 'en-ZA' THEN 'beta'
          WHEN lang.code = 'af-ZA' THEN 'experimental'
          ELSE 'unsupported'
        END,
        CASE WHEN lang.code != 'en-ZA' THEN 'en-ZA' END,
        CASE
          WHEN lang.code = 'en-ZA' THEN ''
          WHEN lang.code = 'af-ZA' THEN 'Documented in Whisper''s supported-language set; TTS, Realtime and translation quality have not yet been verified against real audio and pass a human quality gate.'
          ELSE 'Not in OpenAI Whisper/TTS/Realtime''s documented supported-language set as of this review. Pending real machine testing and native-speaker review.'
        END
      );
    END LOOP;
    INSERT INTO language_capabilities (language_code, capability, provider, status, notes) VALUES
      (lang.code, 'stt', 'azure-speech', 'unsupported', 'AZURE_SPEECH_KEY not configured in this environment.'),
      (lang.code, 'tts', 'azure-speech', 'unsupported', 'AZURE_SPEECH_KEY not configured in this environment.'),
      (lang.code, 'stt', 'google-speech', 'unsupported', 'GOOGLE_SPEECH_CREDENTIALS_JSON not configured in this environment.'),
      (lang.code, 'tts', 'google-speech', 'unsupported', 'GOOGLE_SPEECH_CREDENTIALS_JSON not configured in this environment.'),
      (lang.code, 'translation', 'azure-translator', 'unsupported', 'AZURE_TRANSLATOR_KEY not configured in this environment.');
  END LOOP;
END $$;

COMMIT;
