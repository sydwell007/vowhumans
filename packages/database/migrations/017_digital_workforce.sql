-- Canonical PostgreSQL operating model for governed Digital Colleagues.
-- Digital Human (identity) and Persona (behaviour) remain separate, reusable
-- foundations. A Digital Colleague composes them with work, risk and governance.
BEGIN;

CREATE TABLE workforce_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  department text NOT NULL,
  summary text NOT NULL,
  risk_level text NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high','regulated')),
  autonomy_level smallint NOT NULL DEFAULT 1 CHECK (autonomy_level BETWEEN 0 AND 4),
  configuration jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workforce_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  name text NOT NULL,
  purpose text NOT NULL DEFAULT '',
  human_owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, name)
);

CREATE TABLE digital_colleagues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('dc_' || encode(gen_random_bytes(12), 'hex')),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  workforce_team_id uuid REFERENCES workforce_teams(id) ON DELETE SET NULL,
  template_id uuid REFERENCES workforce_templates(id) ON DELETE SET NULL,
  name text NOT NULL,
  role_title text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  team_name text NOT NULL DEFAULT '',
  purpose text NOT NULL DEFAULT '',
  seniority text NOT NULL DEFAULT '',
  digital_human_id uuid REFERENCES digital_humans(id) ON DELETE SET NULL,
  persona_version_id uuid REFERENCES persona_versions(id) ON DELETE SET NULL,
  human_owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  escalation_owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  supported_languages text[] NOT NULL DEFAULT ARRAY['en-ZA']::text[],
  availability jsonb NOT NULL DEFAULT '{"mode":"business-hours","timezone":"Africa/Johannesburg"}',
  risk_level text NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high','regulated')),
  autonomy_level smallint NOT NULL DEFAULT 1 CHECK (autonomy_level BETWEEN 0 AND 4),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','configuring','testing','review','approved','deployed','paused','archived')),
  deployment_status text NOT NULL DEFAULT 'not_deployed' CHECK (deployment_status IN ('not_deployed','pending','deployed','paused','failed','retired')),
  builder_step smallint NOT NULL DEFAULT 1 CHECK (builder_step BETWEEN 1 AND 12),
  configuration jsonb NOT NULL DEFAULT '{}',
  monthly_budget_minor bigint CHECK (monthly_budget_minor IS NULL OR monthly_budget_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'ZAR',
  approved_at timestamptz,
  deployed_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE colleague_functions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  digital_colleague_id uuid NOT NULL REFERENCES digital_colleagues(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  in_scope text[] NOT NULL DEFAULT '{}',
  out_of_scope text[] NOT NULL DEFAULT '{}',
  required_knowledge boolean NOT NULL DEFAULT false,
  required_tools boolean NOT NULL DEFAULT false,
  human_review_required boolean NOT NULL DEFAULT true,
  priority smallint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (digital_colleague_id, name)
);

CREATE TABLE colleague_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  digital_colleague_id uuid NOT NULL REFERENCES digital_colleagues(id) ON DELETE CASCADE,
  name text NOT NULL,
  proficiency text NOT NULL DEFAULT 'guided' CHECK (proficiency IN ('observing','guided','proficient','advanced')),
  evidence text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (digital_colleague_id, name)
);

CREATE TABLE colleague_knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  digital_colleague_id uuid NOT NULL REFERENCES digital_colleagues(id) ON DELETE CASCADE,
  knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  purpose text NOT NULL DEFAULT '',
  required boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (digital_colleague_id, knowledge_base_id)
);

CREATE TABLE workforce_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  integration_installation_id uuid REFERENCES integration_installations(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL,
  description text NOT NULL DEFAULT '',
  tool_type text NOT NULL DEFAULT 'api' CHECK (tool_type IN ('api','database','messaging','calendar','crm','ticketing','internal','manual')),
  risk_level text NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high','regulated')),
  capabilities jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','disabled','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, slug)
);

CREATE TABLE colleague_tool_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  digital_colleague_id uuid NOT NULL REFERENCES digital_colleagues(id) ON DELETE CASCADE,
  workforce_tool_id uuid NOT NULL REFERENCES workforce_tools(id) ON DELETE CASCADE,
  permitted_actions text[] NOT NULL DEFAULT '{}',
  denied_actions text[] NOT NULL DEFAULT '{}',
  data_scope jsonb NOT NULL DEFAULT '{}',
  requires_human_review boolean NOT NULL DEFAULT true,
  required boolean NOT NULL DEFAULT false,
  budget_minor bigint CHECK (budget_minor IS NULL OR budget_minor >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','revoked','expired')),
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (digital_colleague_id, workforce_tool_id)
);

CREATE TABLE colleague_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  digital_colleague_id uuid NOT NULL REFERENCES digital_colleagues(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_type text NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('manual','event','schedule','api','handoff')),
  trigger_config jsonb NOT NULL DEFAULT '{}',
  steps jsonb NOT NULL DEFAULT '[]',
  expected_output text NOT NULL DEFAULT '',
  exception_policy text NOT NULL DEFAULT '',
  human_checkpoint_policy text NOT NULL DEFAULT '',
  max_iterations smallint NOT NULL DEFAULT 1 CHECK (max_iterations BETWEEN 1 AND 10),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (digital_colleague_id, name)
);

CREATE TABLE colleague_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  digital_colleague_id uuid NOT NULL REFERENCES digital_colleagues(id) ON DELETE CASCADE,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  target_date date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','met','missed','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE colleague_kpis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  digital_colleague_id uuid NOT NULL REFERENCES digital_colleagues(id) ON DELETE CASCADE,
  objective_id uuid REFERENCES colleague_objectives(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit text NOT NULL,
  direction text NOT NULL DEFAULT 'increase' CHECK (direction IN ('increase','decrease','maintain')),
  target_value numeric(18,4),
  current_value numeric(18,4),
  measurement_policy text NOT NULL DEFAULT '',
  last_measured_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE colleague_guardrails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  digital_colleague_id uuid NOT NULL REFERENCES digital_colleagues(id) ON DELETE CASCADE,
  code text NOT NULL,
  instruction text NOT NULL,
  enforcement text NOT NULL DEFAULT 'hard' CHECK (enforcement IN ('prompt','policy','hard','human_review')),
  action_on_violation text NOT NULL DEFAULT 'escalate' CHECK (action_on_violation IN ('warn','review','escalate','block')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (digital_colleague_id, code)
);

CREATE TABLE colleague_collaboration_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  digital_colleague_id uuid NOT NULL REFERENCES digital_colleagues(id) ON DELETE CASCADE,
  route_type text NOT NULL CHECK (route_type IN ('human_owner','human_escalation','digital_colleague_handoff')),
  target_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  target_digital_colleague_id uuid REFERENCES digital_colleagues(id) ON DELETE SET NULL,
  condition text NOT NULL,
  service_level_minutes integer CHECK (service_level_minutes IS NULL OR service_level_minutes > 0),
  channel text NOT NULL DEFAULT 'work_queue',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE colleague_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  digital_colleague_id uuid NOT NULL REFERENCES digital_colleagues(id) ON DELETE CASCADE,
  test_code text NOT NULL,
  name text NOT NULL,
  test_type text NOT NULL DEFAULT 'readiness' CHECK (test_type IN ('readiness','safety','knowledge','tool','workflow','adversarial')),
  input_fixture jsonb NOT NULL DEFAULT '{}',
  expected_policy jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'not_run' CHECK (status IN ('not_run','running','passed','failed','blocked')),
  result jsonb NOT NULL DEFAULT '{}',
  run_by uuid REFERENCES users(id) ON DELETE SET NULL,
  run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (digital_colleague_id, test_code)
);

CREATE TABLE colleague_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  digital_colleague_id uuid NOT NULL REFERENCES digital_colleagues(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('approved','rejected','revoked')),
  scope text NOT NULL DEFAULT 'deployment',
  snapshot jsonb NOT NULL,
  rationale text NOT NULL,
  approved_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE colleague_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  digital_colleague_id uuid NOT NULL REFERENCES digital_colleagues(id) ON DELETE CASCADE,
  approval_id uuid NOT NULL REFERENCES colleague_approvals(id),
  environment text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','pilot','production')),
  channels text[] NOT NULL DEFAULT '{}',
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','deployed','paused','failed','retired')),
  configuration_snapshot jsonb NOT NULL,
  deployed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  deployed_at timestamptz,
  paused_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (digital_colleague_id, environment, version)
);

CREATE TABLE work_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE DEFAULT ('wi_' || encode(gen_random_bytes(12), 'hex')),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL,
  digital_colleague_id uuid NOT NULL REFERENCES digital_colleagues(id) ON DELETE RESTRICT,
  function_id uuid REFERENCES colleague_functions(id) ON DELETE SET NULL,
  workflow_id uuid REFERENCES colleague_workflows(id) ON DELETE SET NULL,
  title text NOT NULL,
  request text NOT NULL,
  input_data jsonb NOT NULL DEFAULT '{}',
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  risk_level text NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high','regulated')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','planning','awaiting_review','in_progress','completed','failed','escalated','cancelled')),
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  due_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE work_item_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  work_item_id uuid NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_type text NOT NULL DEFAULT 'system' CHECK (actor_type IN ('system','user','digital_colleague','provider')),
  actor_id uuid,
  safe_detail jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE work_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  work_item_id uuid NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  digital_colleague_id uuid NOT NULL REFERENCES digital_colleagues(id) ON DELETE RESTRICT,
  product_type text NOT NULL DEFAULT 'review_brief',
  title text NOT NULL,
  content jsonb NOT NULL,
  source_refs jsonb NOT NULL DEFAULT '[]',
  model_provider text,
  model_name text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','awaiting_review','approved','rejected','released')),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_item_id, version)
);

CREATE TABLE work_product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  work_product_id uuid NOT NULL REFERENCES work_products(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('approved','changes_requested','rejected')),
  notes text NOT NULL DEFAULT '',
  reviewed_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE colleague_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  digital_colleague_id uuid NOT NULL REFERENCES digital_colleagues(id) ON DELETE CASCADE,
  work_item_id uuid REFERENCES work_items(id) ON DELETE SET NULL,
  reason_code text NOT NULL,
  summary text NOT NULL,
  assigned_to_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','dismissed')),
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE colleague_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  digital_colleague_id uuid NOT NULL REFERENCES digital_colleagues(id) ON DELETE CASCADE,
  work_item_id uuid REFERENCES work_items(id) ON DELETE SET NULL,
  provider text NOT NULL,
  model text,
  unit text NOT NULL,
  quantity numeric(18,6) NOT NULL CHECK (quantity >= 0),
  amount_minor bigint NOT NULL DEFAULT 0 CHECK (amount_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'ZAR',
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workforce_scheduled_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  digital_colleague_id uuid NOT NULL REFERENCES digital_colleagues(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES colleague_workflows(id) ON DELETE CASCADE,
  schedule_expression text NOT NULL,
  timezone text NOT NULL DEFAULT 'Africa/Johannesburg',
  input_template jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'disabled' CHECK (status IN ('disabled','active','paused')),
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workforce_model_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  digital_colleague_id uuid REFERENCES digital_colleagues(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  fallback_provider text,
  fallback_model text,
  max_output_tokens integer NOT NULL DEFAULT 1200 CHECK (max_output_tokens BETWEEN 100 AND 16000),
  allow_memory boolean NOT NULL DEFAULT false,
  allow_tool_calls boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'disabled' CHECK (status IN ('disabled','approved','paused')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, digital_colleague_id, purpose)
);

CREATE INDEX idx_digital_colleagues_org_status ON digital_colleagues(organisation_id, status, updated_at DESC);
CREATE INDEX idx_digital_colleagues_org_team ON digital_colleagues(organisation_id, workforce_team_id);
CREATE INDEX idx_colleague_functions_colleague ON colleague_functions(digital_colleague_id, priority);
CREATE INDEX idx_colleague_workflows_colleague ON colleague_workflows(digital_colleague_id, status);
CREATE INDEX idx_colleague_tests_colleague ON colleague_tests(digital_colleague_id, status);
CREATE INDEX idx_colleague_approvals_colleague ON colleague_approvals(digital_colleague_id, created_at DESC);
CREATE INDEX idx_colleague_deployments_colleague ON colleague_deployments(digital_colleague_id, created_at DESC);
CREATE INDEX idx_work_items_org_status ON work_items(organisation_id, status, created_at DESC);
CREATE INDEX idx_work_items_colleague ON work_items(digital_colleague_id, created_at DESC);
CREATE INDEX idx_work_item_events_item ON work_item_events(work_item_id, occurred_at);
CREATE INDEX idx_work_products_item ON work_products(work_item_id, version DESC);
CREATE INDEX idx_escalations_org_status ON colleague_escalations(organisation_id, status, created_at DESC);
CREATE INDEX idx_colleague_costs_org_time ON colleague_costs(organisation_id, recorded_at DESC);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'workforce_teams','digital_colleagues','colleague_functions','colleague_skills',
    'colleague_knowledge_sources','workforce_tools','colleague_tool_permissions',
    'colleague_workflows','colleague_objectives','colleague_kpis','colleague_guardrails',
    'colleague_collaboration_routes','colleague_tests','colleague_approvals',
    'colleague_deployments','work_items','work_item_events','work_products',
    'work_product_reviews','colleague_escalations','colleague_costs',
    'workforce_scheduled_jobs','workforce_model_policies'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%I ON %I USING (organisation_id = nullif(current_setting(''app.organisation_id'', true), '''')::uuid) WITH CHECK (organisation_id = nullif(current_setting(''app.organisation_id'', true), '''')::uuid)',
      table_name, table_name
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION touch_workforce_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'workforce_templates','workforce_teams','digital_colleagues','colleague_functions',
    'workforce_tools','colleague_workflows','colleague_objectives','work_items'
  ] LOOP
    EXECUTE format('CREATE TRIGGER touch_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_workforce_updated_at()', table_name);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_workforce_history_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER colleague_approvals_append_only BEFORE UPDATE OR DELETE ON colleague_approvals FOR EACH ROW EXECUTE FUNCTION prevent_workforce_history_mutation();
CREATE TRIGGER work_item_events_append_only BEFORE UPDATE OR DELETE ON work_item_events FOR EACH ROW EXECUTE FUNCTION prevent_workforce_history_mutation();
CREATE TRIGGER work_product_reviews_append_only BEFORE UPDATE OR DELETE ON work_product_reviews FOR EACH ROW EXECUTE FUNCTION prevent_workforce_history_mutation();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'workforce_teams','digital_colleagues','colleague_functions','colleague_skills',
    'colleague_knowledge_sources','workforce_tools','colleague_tool_permissions',
    'colleague_workflows','colleague_objectives','colleague_kpis','colleague_guardrails',
    'colleague_collaboration_routes','colleague_tests','colleague_approvals',
    'colleague_deployments','work_items','work_products','colleague_escalations',
    'workforce_scheduled_jobs','workforce_model_policies'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER control_plane_audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION record_control_plane_audit()',
      table_name
    );
  END LOOP;
END;
$$;

COMMIT;
