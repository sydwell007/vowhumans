-- Afrihost/MySQL adapter mirror of PostgreSQL migration 023.
-- Run once after 001-008. Existing Digital Humans retain English as default.
ALTER TABLE vhm_digital_humans
  ADD COLUMN default_language_code VARCHAR(20) NOT NULL DEFAULT 'en-ZA' AFTER default_gesture_ref;
