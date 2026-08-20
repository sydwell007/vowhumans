-- South African multilingual architecture, part 6 of 6 (small follow-up to
-- 010-014): usage_records needs a language_code so Settings -> Languages can show
-- real per-language average latency / recent failures instead of inventing a
-- separate metering table. Nullable and additive — every existing usage_records
-- write path is untouched and keeps writing language_code = NULL.
BEGIN;

ALTER TABLE usage_records ADD COLUMN language_code text REFERENCES languages(code);
CREATE INDEX idx_usage_records_language ON usage_records(language_code, recorded_at DESC) WHERE language_code IS NOT NULL;

COMMIT;
