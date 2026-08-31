-- Persist the language a Digital Human should use when a new conversation starts.
-- Session-level language changes remain in session context/events and never rewrite
-- this configured default merely because one visitor asks to switch mid-call.
BEGIN;

ALTER TABLE digital_humans
  ADD COLUMN IF NOT EXISTS default_language_code text REFERENCES languages(code) DEFAULT 'en-ZA';

UPDATE digital_humans SET default_language_code = 'en-ZA' WHERE default_language_code IS NULL;
ALTER TABLE digital_humans ALTER COLUMN default_language_code SET DEFAULT 'en-ZA';
ALTER TABLE digital_humans ALTER COLUMN default_language_code SET NOT NULL;

-- Live isiZulu/isiXhosa speech has been observed working, but formal native-speaker
-- QA is still outstanding. Enable the reasoning/realtime route as experimental,
-- never production, so selection works without overstating its quality status.
UPDATE language_capabilities
SET status = 'experimental', fallback_language_code = 'en-ZA',
    notes = 'Selectable preview language. Realtime speech observed working; native-speaker quality review is still required.',
    updated_at = now()
WHERE language_code IN ('zu-ZA', 'xh-ZA')
  AND capability IN ('reasoning', 'realtime')
  AND status = 'unsupported';

COMMIT;
