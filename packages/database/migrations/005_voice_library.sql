-- Voice library: real per-organisation voices (provider-selected or uploaded), and
-- which voice each catalogue digital human currently uses. The digital human
-- catalogue itself stays the static, universal example set every organisation sees
-- (matches Personas/Applications elsewhere in Studio) — only the voice records and
-- assignments are real, tenant-scoped data.
BEGIN;

CREATE TABLE IF NOT EXISTS media_blobs (
  object_key text PRIMARY KEY,
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  mime_type text NOT NULL,
  data bytea NOT NULL,
  size_bytes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_media_blobs_org ON media_blobs(organisation_id);

CREATE TABLE IF NOT EXISTS human_voice_assignments (
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  human_slug text NOT NULL,
  voice_id uuid NOT NULL REFERENCES voices(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, human_slug)
);

ALTER TABLE media_blobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE human_voice_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_media_blobs ON media_blobs USING (organisation_id = nullif(current_setting('app.organisation_id', true),'')::uuid) WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true),'')::uuid);
CREATE POLICY tenant_isolation_human_voice_assignments ON human_voice_assignments USING (organisation_id = nullif(current_setting('app.organisation_id', true),'')::uuid) WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true),'')::uuid);

COMMIT;
