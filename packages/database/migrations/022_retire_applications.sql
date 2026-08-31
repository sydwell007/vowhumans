BEGIN;

-- Preserve operational history while removing the duplicate/discontinued
-- applications from every active Studio and embed workflow.
UPDATE digital_human_applications
SET enabled = false
WHERE application_id IN (
  SELECT id FROM applications WHERE slug IN ('goalvow-academies-3e140c', 'vowtools')
);

UPDATE api_keys
SET status = 'revoked'
WHERE application_id IN (
  SELECT id FROM applications WHERE slug IN ('goalvow-academies-3e140c', 'vowtools')
) AND status <> 'revoked';

UPDATE webhooks
SET status = 'revoked'
WHERE application_id IN (
  SELECT id FROM applications WHERE slug IN ('goalvow-academies-3e140c', 'vowtools')
) AND status <> 'revoked';

UPDATE applications
SET status = 'archived',
    settings = settings || jsonb_build_object(
      'retired', true,
      'retired_reason', CASE
        WHEN slug = 'vowtools' THEN 'discontinued'
        ELSE 'duplicate_of_goalvow-academies'
      END
    )
WHERE slug IN ('goalvow-academies-3e140c', 'vowtools');

COMMIT;
