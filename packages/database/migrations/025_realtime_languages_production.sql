-- Promote the Digital Human Realtime speech path for all eleven South African
-- official languages after customer acceptance testing. This deliberately does
-- not promote standalone STT, TTS, reasoning, or translation capabilities.
BEGIN;

UPDATE language_capabilities
SET status = 'production',
    fallback_language_code = CASE WHEN language_code = 'en-ZA' THEN NULL ELSE 'en-ZA' END,
    notes = CASE
      WHEN language_code = 'en-ZA' THEN 'Production Digital Human Realtime language.'
      ELSE 'Production Digital Human Realtime language after customer acceptance testing. English remains the disclosed fallback if the provider cannot complete a turn.'
    END,
    last_checked_at = now(),
    updated_at = now()
WHERE language_code IN ('en-ZA', 'zu-ZA', 'xh-ZA', 'af-ZA', 'nso-ZA', 'tn-ZA', 'st-ZA', 'ts-ZA', 'ss-ZA', 've-ZA', 'nr-ZA')
  AND capability = 'realtime'
  AND provider = 'openai';

COMMIT;
