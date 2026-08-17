-- Studio's own "test this VowHuman live" flow (api/v1/live-sessions) has no
-- consuming external application to attach a session to — only embed calls
-- (api/public/v1/embed-sessions) have one. Relax the FK the same way
-- 006_faces_gestures.sql relaxed face_assets.identity_id rather than inventing a
-- placeholder "system application" row just to satisfy NOT NULL.
BEGIN;

ALTER TABLE sessions ALTER COLUMN application_id DROP NOT NULL;

COMMIT;
