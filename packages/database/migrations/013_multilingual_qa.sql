-- South African multilingual architecture, part 4 of 5: the non-sensitive test
-- corpus and the human quality-gate review workflow (docs/SOUTH_AFRICAN_LANGUAGE_QA.md).
-- Ships with zero seed rows in language_quality_reviews on purpose — no
-- native-speaker review has actually happened yet for any of the 11 languages,
-- and this table must never imply otherwise. A language's status in
-- language_capabilities only ever moves via a separate, deliberate manual UPDATE
-- after real formal_qa reviews exist here — this table records evidence, it does
-- not itself flip any status.
--
-- No RLS on either table: language_test_corpus is shared platform-level QA
-- content (like a shared style guide, not tenant data), and
-- language_quality_reviews' organisation_id is attribution-only (who ran an
-- admin_benchmark, if anyone), not a tenant-isolation boundary — formal_qa rows
-- in particular are expected to have no organisation_id at all.
BEGIN;

CREATE TABLE language_test_corpus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  language_code text NOT NULL REFERENCES languages(code),
  category text NOT NULL CHECK (category IN (
    'greeting','introduction','question','customer_support','education','recruitment',
    'direction','number','date','price','email_address','phone_number','name','place',
    'formal_speech','informal_speech','code_switching','interruption','noisy_condition'
  )),
  source_text text NOT NULL,
  audio_object_key text REFERENCES media_blobs(object_key),
  machine_validated boolean NOT NULL DEFAULT false,
  human_validated boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_language_test_corpus_lang ON language_test_corpus(language_code, category);

CREATE TABLE language_quality_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid REFERENCES organisations(id),
  language_code text NOT NULL REFERENCES languages(code),
  capability text NOT NULL CHECK (capability IN ('stt','reasoning','tts','realtime','translation')),
  provider text NOT NULL,
  review_type text NOT NULL CHECK (review_type IN ('formal_qa','admin_benchmark')),
  test_corpus_id uuid REFERENCES language_test_corpus(id),
  sample_object_key text REFERENCES media_blobs(object_key),
  reviewer_name text,
  reviewer_contact text,
  score smallint CHECK (score BETWEEN 1 AND 5),
  verdict text CHECK (verdict IN ('pass','fail','needs_review')),
  notes text NOT NULL DEFAULT '',
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_language_quality_reviews_lang ON language_quality_reviews(language_code, capability, provider);

COMMIT;
