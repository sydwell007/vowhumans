-- Real per-organisation face assets and gesture profiles, plus which one each
-- catalogue digital human currently uses — same pattern as 005_voice_library.sql.
-- face_assets.identity_id was NOT NULL, which would force building the full
-- identity/consent workflow just to upload a face; relax it to match voices.identity_id
-- (nullable) and keep this pass scoped to what was actually asked for.
BEGIN;

ALTER TABLE face_assets ALTER COLUMN identity_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS human_face_assignments (
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  human_slug text NOT NULL,
  face_asset_id uuid NOT NULL REFERENCES face_assets(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, human_slug)
);

CREATE TABLE IF NOT EXISTS human_gesture_assignments (
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  human_slug text NOT NULL,
  gesture_profile_id uuid NOT NULL REFERENCES gesture_profiles(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, human_slug)
);

ALTER TABLE human_face_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE human_gesture_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_human_face_assignments ON human_face_assignments USING (organisation_id = nullif(current_setting('app.organisation_id', true),'')::uuid) WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true),'')::uuid);
CREATE POLICY tenant_isolation_human_gesture_assignments ON human_gesture_assignments USING (organisation_id = nullif(current_setting('app.organisation_id', true),'')::uuid) WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true),'')::uuid);

COMMIT;
