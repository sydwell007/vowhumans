START TRANSACTION;

UPDATE vhm_digital_human_applications
SET enabled = 0
WHERE application_id IN (
  SELECT id FROM vhm_applications WHERE slug IN ('goalvow-academies-3e140c', 'vowtools')
);

UPDATE vhm_api_keys
SET status = 'revoked'
WHERE application_id IN (
  SELECT id FROM vhm_applications WHERE slug IN ('goalvow-academies-3e140c', 'vowtools')
);

UPDATE vhm_applications
SET status = 'archived'
WHERE slug IN ('goalvow-academies-3e140c', 'vowtools');

COMMIT;
