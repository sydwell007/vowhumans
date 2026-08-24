-- Post-deployment testing and operations for Digital Humans and Digital Colleagues.
-- Extends the canonical workforce tables from migration 017; it deliberately does
-- not create a second task, queue, work-product or approval subsystem.
BEGIN;

ALTER TABLE colleague_deployments DROP CONSTRAINT IF EXISTS colleague_deployments_environment_check;
ALTER TABLE colleague_deployments ADD CONSTRAINT colleague_deployments_environment_check
  CHECK (environment IN ('sandbox','test','pilot','staging','production'));

ALTER TABLE work_items DROP CONSTRAINT IF EXISTS work_items_status_check;
ALTER TABLE work_items ADD CONSTRAINT work_items_status_check CHECK (status IN (
  'queued','preparing','planning','running','in_progress','waiting_for_input',
  'waiting_for_approval','awaiting_review','escalated','completed','failed','cancelled'
));
ALTER TABLE work_items
  ADD COLUMN IF NOT EXISTS deployment_id uuid REFERENCES colleague_deployments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox'
    CHECK (environment IN ('sandbox','test','pilot','staging','production')),
  ADD COLUMN IF NOT EXISTS task_type text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS expected_output text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS model_policy_id uuid REFERENCES workforce_model_policies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'not_required'
    CHECK (approval_status IN ('not_required','pending','approved','changes_requested','rejected')),
  ADD COLUMN IF NOT EXISTS progress smallint NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100);

ALTER TABLE work_products
  ADD COLUMN IF NOT EXISTS assumptions jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS citations jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS tools_used jsonb NOT NULL DEFAULT '[]';

ALTER TABLE work_product_reviews DROP CONSTRAINT IF EXISTS work_product_reviews_decision_check;
ALTER TABLE work_product_reviews ADD CONSTRAINT work_product_reviews_decision_check
  CHECK (decision IN ('approved','approved_with_edits','changes_requested','rejected','rerun','escalated'));
ALTER TABLE work_product_reviews
  ADD COLUMN IF NOT EXISTS edited_content jsonb,
  ADD COLUMN IF NOT EXISTS disposition text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS runtime_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('tr_' || encode(gen_random_bytes(12), 'hex')),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  digital_human_id uuid REFERENCES digital_humans(id) ON DELETE SET NULL,
  digital_colleague_id uuid REFERENCES digital_colleagues(id) ON DELETE SET NULL,
  deployment_id uuid REFERENCES colleague_deployments(id) ON DELETE SET NULL,
  test_suite text NOT NULL CHECK (test_suite IN ('presence','role','work','knowledge','voice','realtime','avatar','guardrail','escalation','tool','workflow','provider')),
  environment text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','test','pilot','staging','production')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','passed','warning','failed','blocked','cancelled')),
  configuration_revision integer,
  deployment_version integer,
  model_provider text,
  model_name text,
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  summary text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (digital_human_id IS NOT NULL OR digital_colleague_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS runtime_test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  test_run_id uuid NOT NULL REFERENCES runtime_test_runs(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  status text NOT NULL CHECK (status IN ('passed','warning','failed','blocked','not_tested')),
  detail text NOT NULL DEFAULT '',
  evidence jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (test_run_id, code)
);

CREATE TABLE IF NOT EXISTS provider_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  capability text NOT NULL,
  status text NOT NULL CHECK (status IN ('healthy','degraded','disabled','not_configured','provider_error','budget_blocked')),
  configured boolean NOT NULL DEFAULT false,
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  error_code text,
  safe_detail jsonb NOT NULL DEFAULT '{}',
  checked_by uuid REFERENCES users(id) ON DELETE SET NULL,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deployment_readiness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  deployment_id uuid NOT NULL REFERENCES colleague_deployments(id) ON DELETE CASCADE,
  configuration_revision integer NOT NULL,
  deployment_version integer NOT NULL,
  configuration_score smallint NOT NULL CHECK (configuration_score BETWEEN 0 AND 100),
  governance_score smallint NOT NULL CHECK (governance_score BETWEEN 0 AND 100),
  runtime_score smallint NOT NULL CHECK (runtime_score BETWEEN 0 AND 100),
  conversation_score smallint NOT NULL CHECK (conversation_score BETWEEN 0 AND 100),
  channel_score smallint NOT NULL CHECK (channel_score BETWEEN 0 AND 100),
  operational_score smallint NOT NULL CHECK (operational_score BETWEEN 0 AND 100),
  categories jsonb NOT NULL DEFAULT '{}',
  blockers jsonb NOT NULL DEFAULT '[]',
  assessed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deployment_id, configuration_revision, deployment_version)
);

CREATE TABLE IF NOT EXISTS runtime_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  digital_colleague_id uuid REFERENCES digital_colleagues(id) ON DELETE SET NULL,
  deployment_id uuid REFERENCES colleague_deployments(id) ON DELETE SET NULL,
  work_item_id uuid REFERENCES work_items(id) ON DELETE SET NULL,
  test_run_id uuid REFERENCES runtime_test_runs(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  actor_type text NOT NULL DEFAULT 'system' CHECK (actor_type IN ('system','user','digital_colleague','provider','tool')),
  actor_id uuid,
  provider text,
  model text,
  provider_request_id text,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('started','completed','warning','failed','blocked')),
  latency_ms integer CHECK (latency_ms IS NULL OR latency_ms >= 0),
  error_code text,
  safe_detail jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runtime_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  digital_colleague_id uuid REFERENCES digital_colleagues(id) ON DELETE SET NULL,
  deployment_id uuid REFERENCES colleague_deployments(id) ON DELETE SET NULL,
  work_item_id uuid REFERENCES work_items(id) ON DELETE SET NULL,
  test_run_id uuid REFERENCES runtime_test_runs(id) ON DELETE SET NULL,
  provider text NOT NULL,
  model text,
  input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cached_tokens integer NOT NULL DEFAULT 0 CHECK (cached_tokens >= 0),
  speech_seconds numeric(18,3) NOT NULL DEFAULT 0 CHECK (speech_seconds >= 0),
  gpu_seconds numeric(18,3) NOT NULL DEFAULT 0 CHECK (gpu_seconds >= 0),
  estimated_cost_minor bigint CHECK (estimated_cost_minor IS NULL OR estimated_cost_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'USD',
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deployment_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  digital_colleague_id uuid NOT NULL REFERENCES digital_colleagues(id) ON DELETE CASCADE,
  source_deployment_id uuid NOT NULL REFERENCES colleague_deployments(id) ON DELETE RESTRICT,
  target_environment text NOT NULL CHECK (target_environment IN ('test','pilot','staging','production')),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','promoted','rejected','blocked','cancelled')),
  readiness_snapshot jsonb NOT NULL DEFAULT '{}',
  rationale text NOT NULL DEFAULT '',
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  promoted_deployment_id uuid REFERENCES colleague_deployments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_test_runs_org_time ON runtime_test_runs(organisation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_test_runs_colleague ON runtime_test_runs(digital_colleague_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_test_results_run ON runtime_test_results(test_run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_provider_health_org_provider ON provider_health(organisation_id, provider, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployment_readiness_deployment ON deployment_readiness(deployment_id, assessed_at DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_events_work_item ON runtime_events(work_item_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_runtime_events_org_time ON runtime_events(organisation_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_runtime_usage_org_time ON runtime_usage(organisation_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_deployment_promotions_org_time ON deployment_promotions(organisation_id, requested_at DESC);

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'runtime_test_runs','runtime_test_results','provider_health','deployment_readiness',
    'runtime_events','runtime_usage','deployment_promotions'
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
    'runtime_test_runs','provider_health','deployment_promotions'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname=('control_plane_audit_' || v_table)) THEN
      EXECUTE format(
        'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION record_control_plane_audit()',
        'control_plane_audit_' || v_table, v_table
      );
    END IF;
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS runtime_test_results_append_only ON runtime_test_results;
CREATE TRIGGER runtime_test_results_append_only BEFORE UPDATE OR DELETE ON runtime_test_results
  FOR EACH ROW EXECUTE FUNCTION prevent_workforce_history_mutation();
DROP TRIGGER IF EXISTS runtime_events_append_only ON runtime_events;
CREATE TRIGGER runtime_events_append_only BEFORE UPDATE OR DELETE ON runtime_events
  FOR EACH ROW EXECUTE FUNCTION prevent_workforce_history_mutation();
DROP TRIGGER IF EXISTS runtime_usage_append_only ON runtime_usage;
CREATE TRIGGER runtime_usage_append_only BEFORE UPDATE OR DELETE ON runtime_usage
  FOR EACH ROW EXECUTE FUNCTION prevent_workforce_history_mutation();

COMMIT;
