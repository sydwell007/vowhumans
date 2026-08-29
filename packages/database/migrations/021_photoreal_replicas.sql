-- Consent-bound captured-video replicas. Large video/frame payloads live only in
-- private object storage; this schema stores references, hashes and evidence.
BEGIN;

CREATE TABLE IF NOT EXISTS replica_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  digital_human_id uuid REFERENCES digital_humans(id) ON DELETE SET NULL,
  human_slug text,
  identity_id uuid NOT NULL REFERENCES identities(id) ON DELETE RESTRICT,
  name text NOT NULL,
  renderer_tier text NOT NULL DEFAULT 'video_replica'
    CHECK (renderer_tier IN ('portrait','video_replica','rigged_3d')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','capturing','processing','quality_review','approval_required','approved','revoked','failed')),
  quality_mode text NOT NULL DEFAULT 'standard'
    CHECK (quality_mode IN ('standard','premium','presenter')),
  provider text NOT NULL DEFAULT 'musetalk-video-replica',
  motion_profile jsonb NOT NULL DEFAULT '{}',
  active_version_id uuid,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (digital_human_id IS NOT NULL OR human_slug IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS replica_capture_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  replica_profile_id uuid NOT NULL REFERENCES replica_profiles(id) ON DELETE CASCADE,
  identity_id uuid NOT NULL REFERENCES identities(id) ON DELETE RESTRICT,
  protocol_version text NOT NULL DEFAULT 'v1',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','consent_verified','capturing','uploaded','quality_review','accepted','rejected','expired','revoked')),
  consent_scope jsonb NOT NULL DEFAULT '{}',
  capture_settings jsonb NOT NULL DEFAULT '{}',
  retention_until timestamptz,
  consent_verified_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS replica_capture_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  capture_session_id uuid NOT NULL REFERENCES replica_capture_sessions(id) ON DELETE CASCADE,
  segment_type text NOT NULL CHECK (segment_type IN (
    'identity_reference','idle','listening','speaking','expression','gesture','calibration'
  )),
  gesture_key text CHECK (gesture_key IS NULL OR gesture_key IN ('acknowledge','explain','emphasise','reassure')),
  expression_key text,
  object_key text NOT NULL,
  sha256 text NOT NULL CHECK (length(sha256) = 64),
  media_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms > 0),
  width integer CHECK (width IS NULL OR width > 0),
  height integer CHECK (height IS NULL OR height > 0),
  fps numeric(6,3) CHECK (fps IS NULL OR fps > 0),
  starts_neutral boolean NOT NULL DEFAULT false,
  ends_neutral boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'uploaded'
    CHECK (state IN ('upload_pending','uploaded','accepted','rejected','deleted')),
  metadata jsonb NOT NULL DEFAULT '{}',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS replica_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  replica_profile_id uuid NOT NULL REFERENCES replica_profiles(id) ON DELETE CASCADE,
  capture_session_id uuid NOT NULL REFERENCES replica_capture_sessions(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'vowhumans-replica-processor',
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','completed','failed','cancelled')),
  progress smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  input_manifest_object_key text,
  output_manifest_object_key text,
  safe_error_code text,
  safe_metrics jsonb NOT NULL DEFAULT '{}',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS replica_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  replica_profile_id uuid NOT NULL REFERENCES replica_profiles(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  provider text NOT NULL,
  state text NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft','processing','quality_review','approved','published','revoked','failed')),
  manifest_object_key text NOT NULL,
  manifest_sha256 text NOT NULL CHECK (length(manifest_sha256) = 64),
  preview_object_key text,
  capability_snapshot jsonb NOT NULL DEFAULT '{}',
  published_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (replica_profile_id, version)
);

ALTER TABLE replica_profiles DROP CONSTRAINT IF EXISTS replica_profiles_active_version_fk;
ALTER TABLE replica_profiles ADD CONSTRAINT replica_profiles_active_version_fk
  FOREIGN KEY (active_version_id) REFERENCES replica_versions(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS replica_motion_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  replica_version_id uuid NOT NULL REFERENCES replica_versions(id) ON DELETE CASCADE,
  source_segment_id uuid REFERENCES replica_capture_segments(id) ON DELETE SET NULL,
  clip_key text NOT NULL,
  conversation_state text NOT NULL
    CHECK (conversation_state IN ('idle','listening','thinking','speaking','interrupted')),
  gesture_key text CHECK (gesture_key IS NULL OR gesture_key IN ('acknowledge','explain','emphasise','reassure')),
  intensity smallint NOT NULL DEFAULT 1 CHECK (intensity BETWEEN 1 AND 3),
  object_key text NOT NULL,
  sha256 text NOT NULL CHECK (length(sha256) = 64),
  duration_ms integer NOT NULL CHECK (duration_ms > 0),
  fps numeric(6,3) NOT NULL CHECK (fps > 0),
  frame_count integer NOT NULL CHECK (frame_count > 0),
  starts_neutral boolean NOT NULL,
  ends_neutral boolean NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (replica_version_id, clip_key)
);

CREATE TABLE IF NOT EXISTS replica_quality_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  replica_profile_id uuid NOT NULL REFERENCES replica_profiles(id) ON DELETE CASCADE,
  replica_version_id uuid REFERENCES replica_versions(id) ON DELETE CASCADE,
  check_code text NOT NULL,
  status text NOT NULL CHECK (status IN ('passed','warning','failed','blocked','not_tested')),
  measured_value numeric,
  threshold_value numeric,
  unit text,
  safe_detail jsonb NOT NULL DEFAULT '{}',
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS human_replica_assignments (
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  human_slug text NOT NULL,
  replica_profile_id uuid NOT NULL REFERENCES replica_profiles(id) ON DELETE CASCADE,
  replica_version_id uuid NOT NULL REFERENCES replica_versions(id) ON DELETE RESTRICT,
  renderer_tier text NOT NULL DEFAULT 'video_replica'
    CHECK (renderer_tier IN ('portrait','video_replica','rigged_3d')),
  quality_mode text NOT NULL DEFAULT 'standard'
    CHECK (quality_mode IN ('standard','premium','presenter')),
  enabled boolean NOT NULL DEFAULT false,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, human_slug)
);

CREATE INDEX IF NOT EXISTS idx_replica_profiles_org ON replica_profiles(organisation_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_replica_profiles_identity ON replica_profiles(identity_id, status);
CREATE INDEX IF NOT EXISTS idx_replica_capture_profile ON replica_capture_sessions(replica_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_replica_segments_session ON replica_capture_segments(capture_session_id, segment_type);
CREATE INDEX IF NOT EXISTS idx_replica_jobs_status ON replica_processing_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_replica_quality_profile ON replica_quality_checks(replica_profile_id, checked_at DESC);

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'replica_profiles','replica_capture_sessions','replica_capture_segments',
    'replica_processing_jobs','replica_versions','replica_motion_clips',
    'replica_quality_checks','human_replica_assignments'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', v_table);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=v_table
        AND policyname=('tenant_isolation_' || v_table)
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I USING (organisation_id = nullif(current_setting(''app.organisation_id'', true), '''')::uuid) WITH CHECK (organisation_id = nullif(current_setting(''app.organisation_id'', true), '''')::uuid)',
        'tenant_isolation_' || v_table, v_table
      );
    END IF;
  END LOOP;
END;
$$;

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'replica_profiles','replica_capture_sessions','replica_processing_jobs',
    'replica_versions','human_replica_assignments'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS control_plane_audit ON %I', v_table);
    EXECUTE format(
      'CREATE TRIGGER control_plane_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION record_control_plane_audit()',
      v_table
    );
  END LOOP;
END;
$$;

-- Revocation must disable runtime selection immediately; media deletion remains
-- an explicit, audited object-storage operation so failures can be retried.
CREATE OR REPLACE FUNCTION revoke_identity_replicas() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.state = 'revoked' AND OLD.state IS DISTINCT FROM NEW.state THEN
    UPDATE replica_profiles
      SET status='revoked', revoked_at=COALESCE(NEW.revoked_at, now()),
          revocation_reason=COALESCE(NEW.revocation_reason, 'Identity consent revoked'), updated_at=now()
      WHERE identity_id=NEW.id AND status <> 'revoked';
    UPDATE replica_versions rv SET state='revoked', revoked_at=now()
      FROM replica_profiles rp WHERE rv.replica_profile_id=rp.id AND rp.identity_id=NEW.id AND rv.state <> 'revoked';
    UPDATE human_replica_assignments hra SET enabled=false
      FROM replica_profiles rp WHERE hra.replica_profile_id=rp.id AND rp.identity_id=NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS identity_replica_revocation ON identities;
CREATE TRIGGER identity_replica_revocation AFTER UPDATE OF state ON identities
  FOR EACH ROW EXECUTE FUNCTION revoke_identity_replicas();

COMMIT;
