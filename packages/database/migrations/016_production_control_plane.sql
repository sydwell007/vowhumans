BEGIN;

ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'Webhook endpoint';
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS last_delivery_at timestamptz;
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS last_status_code integer;
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0;
ALTER TABLE webhooks ADD COLUMN IF NOT EXISTS paused_at timestamptz;

-- Capture control-plane mutations at the database boundary. The snapshot is
-- intentionally allow-listed so credentials, uploaded media, prompts and private
-- content can never be copied into the audit trail.
CREATE OR REPLACE FUNCTION record_control_plane_audit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  row_data jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  before_data jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  organisation uuid := (row_data ->> 'organisation_id')::uuid;
  record_id uuid := NULLIF(row_data ->> 'id', '')::uuid;
  safe_before jsonb;
  safe_after jsonb;
BEGIN
  IF organisation IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  IF before_data IS NOT NULL THEN
    safe_before := jsonb_strip_nulls(jsonb_build_object(
      'name', before_data ->> 'name',
      'state', before_data ->> 'state',
      'status', before_data ->> 'status',
      'enabled', before_data ->> 'enabled',
      'language_code', before_data ->> 'language_code'
    ));
  END IF;
  IF TG_OP <> 'DELETE' THEN
    safe_after := jsonb_strip_nulls(jsonb_build_object(
      'name', row_data ->> 'name',
      'state', row_data ->> 'state',
      'status', row_data ->> 'status',
      'enabled', row_data ->> 'enabled',
      'language_code', row_data ->> 'language_code'
    ));
  END IF;

  INSERT INTO audit_logs (organisation_id, action, resource_type, resource_id, before_state, after_state)
  VALUES (organisation, lower(TG_TABLE_NAME || '.' || TG_OP), TG_TABLE_NAME, record_id, safe_before, safe_after);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'identities', 'identity_consents', 'digital_humans', 'face_assets', 'voices',
    'gesture_profiles', 'knowledge_bases', 'knowledge_documents', 'personas',
    'persona_versions', 'applications', 'digital_human_applications', 'api_keys',
    'webhooks', 'presenter_projects', 'sessions', 'organisation_languages'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS control_plane_audit ON %I', table_name);
    EXECUTE format(
      'CREATE TRIGGER control_plane_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION record_control_plane_audit()',
      table_name
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_audit_log_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;
CREATE TRIGGER audit_logs_append_only
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

COMMIT;
