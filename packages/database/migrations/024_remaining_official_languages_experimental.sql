-- Expose the remaining seven South African official languages for controlled
-- OpenAI Realtime experiments. This is not a production-quality promotion:
-- native-speaker review is still required before beta or production status.
BEGIN;

UPDATE language_capabilities
SET status = 'experimental',
    fallback_language_code = 'en-ZA',
    notes = 'Selectable OpenAI Realtime experiment. The live speech path and language lock must be machine-tested; pronunciation, comprehension and naturalness still require native-speaker quality review before beta or production.',
    last_checked_at = now(),
    updated_at = now()
WHERE language_code IN ('nso-ZA', 'tn-ZA', 'st-ZA', 'ts-ZA', 'ss-ZA', 've-ZA', 'nr-ZA')
  AND capability IN ('reasoning', 'realtime')
  AND provider = 'openai'
  AND status = 'unsupported';

COMMIT;
