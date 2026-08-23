-- VowHumans Digital Workforce adapter schema (MariaDB 10.6+/MySQL 8.0).
-- Apply after 003_commercial_expansion.sql. Additive only; no DROP statements.
-- PostgreSQL remains the canonical Studio control-plane database. These vhm_*
-- tables support organisation-scoped Afrihost API uploads and integrations.
SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS vhm_workforce_templates (
  id CHAR(36) NOT NULL, slug VARCHAR(120) NOT NULL, name VARCHAR(180) NOT NULL,
  department VARCHAR(120) NOT NULL, summary TEXT NOT NULL,
  risk_level ENUM('low','medium','high','regulated') NOT NULL DEFAULT 'medium',
  autonomy_level TINYINT UNSIGNED NOT NULL DEFAULT 1, configuration_json JSON NOT NULL,
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'published',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_vhm_workforce_template_slug(slug), KEY idx_vhm_workforce_template_status(status,department)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_workforce_teams (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, workspace_id CHAR(36) NULL,
  name VARCHAR(180) NOT NULL, purpose TEXT NOT NULL, human_owner_user_id CHAR(36) NULL,
  status ENUM('active','paused','archived') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_vhm_workforce_team_org_name(organisation_id,name), KEY idx_vhm_workforce_team_org(organisation_id,status),
  CONSTRAINT fk_vhm_workforce_team_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_digital_colleagues (
  id CHAR(36) NOT NULL, public_id VARCHAR(40) NOT NULL, organisation_id CHAR(36) NOT NULL,
  workspace_id CHAR(36) NULL, workforce_team_id CHAR(36) NULL, template_id CHAR(36) NULL,
  name VARCHAR(180) NOT NULL, role_title VARCHAR(180) NOT NULL, department VARCHAR(120) NOT NULL,
  team_name VARCHAR(180) NOT NULL DEFAULT '', purpose TEXT NOT NULL, seniority VARCHAR(80) NOT NULL DEFAULT '',
  digital_human_id CHAR(36) NULL, persona_version_id CHAR(36) NULL,
  human_owner_user_id CHAR(36) NULL, escalation_owner_user_id CHAR(36) NULL,
  supported_languages_json JSON NOT NULL, availability_json JSON NOT NULL,
  risk_level ENUM('low','medium','high','regulated') NOT NULL DEFAULT 'medium',
  autonomy_level TINYINT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('draft','configuring','testing','review','approved','deployed','paused','archived') NOT NULL DEFAULT 'draft',
  deployment_status ENUM('not_deployed','pending','deployed','paused','failed','retired') NOT NULL DEFAULT 'not_deployed',
  builder_step TINYINT UNSIGNED NOT NULL DEFAULT 1, configuration_json JSON NOT NULL,
  monthly_budget_minor BIGINT UNSIGNED NULL, currency CHAR(3) NOT NULL DEFAULT 'ZAR',
  approved_at DATETIME NULL, deployed_at DATETIME NULL, created_by_api_key_id CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_vhm_colleague_public(public_id), KEY idx_vhm_colleague_org_status(organisation_id,status,updated_at),
  CONSTRAINT fk_vhm_colleague_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_colleague_template FOREIGN KEY(template_id) REFERENCES vhm_workforce_templates(id),
  CONSTRAINT fk_vhm_colleague_human FOREIGN KEY(digital_human_id) REFERENCES vhm_digital_humans(id),
  CONSTRAINT fk_vhm_colleague_persona FOREIGN KEY(persona_version_id) REFERENCES vhm_persona_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_colleague_functions (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, digital_colleague_id CHAR(36) NOT NULL,
  name VARCHAR(180) NOT NULL, description TEXT NOT NULL, in_scope_json JSON NOT NULL, out_of_scope_json JSON NOT NULL,
  required_knowledge TINYINT(1) NOT NULL DEFAULT 0, required_tools TINYINT(1) NOT NULL DEFAULT 0,
  human_review_required TINYINT(1) NOT NULL DEFAULT 1, priority SMALLINT NOT NULL DEFAULT 0,
  status ENUM('active','paused','archived') NOT NULL DEFAULT 'active', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_vhm_colleague_function(digital_colleague_id,name), KEY idx_vhm_colleague_function_org(organisation_id,digital_colleague_id),
  CONSTRAINT fk_vhm_colleague_function_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_colleague_function_colleague FOREIGN KEY(digital_colleague_id) REFERENCES vhm_digital_colleagues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_colleague_skills (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, digital_colleague_id CHAR(36) NOT NULL,
  name VARCHAR(180) NOT NULL, proficiency ENUM('observing','guided','proficient','advanced') NOT NULL DEFAULT 'guided',
  evidence TEXT NOT NULL, status ENUM('active','paused','archived') NOT NULL DEFAULT 'active', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_vhm_colleague_skill(digital_colleague_id,name), KEY idx_vhm_colleague_skill_org(organisation_id,digital_colleague_id),
  CONSTRAINT fk_vhm_colleague_skill_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_colleague_skill_colleague FOREIGN KEY(digital_colleague_id) REFERENCES vhm_digital_colleagues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_colleague_knowledge_sources (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, digital_colleague_id CHAR(36) NOT NULL,
  knowledge_base_id CHAR(36) NOT NULL, purpose TEXT NOT NULL, required TINYINT(1) NOT NULL DEFAULT 1,
  status ENUM('active','paused','archived') NOT NULL DEFAULT 'active', assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_vhm_colleague_knowledge(digital_colleague_id,knowledge_base_id), KEY idx_vhm_colleague_knowledge_org(organisation_id,digital_colleague_id),
  CONSTRAINT fk_vhm_colleague_knowledge_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_colleague_knowledge_colleague FOREIGN KEY(digital_colleague_id) REFERENCES vhm_digital_colleagues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_workforce_tools (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, integration_installation_id CHAR(36) NULL,
  name VARCHAR(180) NOT NULL, slug VARCHAR(120) NOT NULL, description TEXT NOT NULL,
  tool_type ENUM('api','database','messaging','calendar','crm','ticketing','internal','manual') NOT NULL DEFAULT 'api',
  risk_level ENUM('low','medium','high','regulated') NOT NULL DEFAULT 'medium', capabilities_json JSON NOT NULL,
  status ENUM('draft','approved','disabled','archived') NOT NULL DEFAULT 'draft', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_vhm_workforce_tool_org_slug(organisation_id,slug), KEY idx_vhm_workforce_tool_org(organisation_id,status),
  CONSTRAINT fk_vhm_workforce_tool_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_colleague_tool_permissions (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, digital_colleague_id CHAR(36) NOT NULL, workforce_tool_id CHAR(36) NOT NULL,
  permitted_actions_json JSON NOT NULL, denied_actions_json JSON NOT NULL, data_scope_json JSON NOT NULL,
  requires_human_review TINYINT(1) NOT NULL DEFAULT 1, required TINYINT(1) NOT NULL DEFAULT 0,
  budget_minor BIGINT UNSIGNED NULL, status ENUM('pending','approved','revoked','expired') NOT NULL DEFAULT 'pending',
  approved_by_api_key_id CHAR(36) NULL, approved_at DATETIME NULL, expires_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_vhm_colleague_tool(digital_colleague_id,workforce_tool_id), KEY idx_vhm_colleague_tool_org(organisation_id,status),
  CONSTRAINT fk_vhm_colleague_tool_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_colleague_tool_colleague FOREIGN KEY(digital_colleague_id) REFERENCES vhm_digital_colleagues(id) ON DELETE CASCADE,
  CONSTRAINT fk_vhm_colleague_tool_tool FOREIGN KEY(workforce_tool_id) REFERENCES vhm_workforce_tools(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_colleague_workflows (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, digital_colleague_id CHAR(36) NOT NULL,
  name VARCHAR(180) NOT NULL, trigger_type ENUM('manual','event','schedule','api','handoff') NOT NULL DEFAULT 'manual',
  trigger_config_json JSON NOT NULL, steps_json JSON NOT NULL, expected_output TEXT NOT NULL,
  exception_policy TEXT NOT NULL, human_checkpoint_policy TEXT NOT NULL, max_iterations TINYINT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('draft','active','paused','archived') NOT NULL DEFAULT 'draft', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_vhm_colleague_workflow(digital_colleague_id,name), KEY idx_vhm_colleague_workflow_org(organisation_id,status),
  CONSTRAINT fk_vhm_colleague_workflow_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_colleague_workflow_colleague FOREIGN KEY(digital_colleague_id) REFERENCES vhm_digital_colleagues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_colleague_objectives (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, digital_colleague_id CHAR(36) NOT NULL,
  label VARCHAR(255) NOT NULL, description TEXT NOT NULL, owner_user_id CHAR(36) NULL, target_date DATE NULL,
  status ENUM('draft','active','met','missed','archived') NOT NULL DEFAULT 'active', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_vhm_colleague_objective_org(organisation_id,digital_colleague_id,status),
  CONSTRAINT fk_vhm_colleague_objective_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_colleague_objective_colleague FOREIGN KEY(digital_colleague_id) REFERENCES vhm_digital_colleagues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_colleague_kpis (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, digital_colleague_id CHAR(36) NOT NULL, objective_id CHAR(36) NULL,
  name VARCHAR(180) NOT NULL, unit VARCHAR(80) NOT NULL, direction ENUM('increase','decrease','maintain') NOT NULL DEFAULT 'increase',
  target_value DECIMAL(18,4) NULL, current_value DECIMAL(18,4) NULL, measurement_policy TEXT NOT NULL,
  last_measured_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_vhm_colleague_kpi_org(organisation_id,digital_colleague_id),
  CONSTRAINT fk_vhm_colleague_kpi_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_colleague_kpi_colleague FOREIGN KEY(digital_colleague_id) REFERENCES vhm_digital_colleagues(id) ON DELETE CASCADE,
  CONSTRAINT fk_vhm_colleague_kpi_objective FOREIGN KEY(objective_id) REFERENCES vhm_colleague_objectives(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_colleague_guardrails (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, digital_colleague_id CHAR(36) NOT NULL,
  code VARCHAR(100) NOT NULL, instruction TEXT NOT NULL, enforcement ENUM('prompt','policy','hard','human_review') NOT NULL DEFAULT 'hard',
  action_on_violation ENUM('warn','review','escalate','block') NOT NULL DEFAULT 'escalate',
  status ENUM('active','paused','archived') NOT NULL DEFAULT 'active', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_vhm_colleague_guardrail(digital_colleague_id,code), KEY idx_vhm_colleague_guardrail_org(organisation_id,status),
  CONSTRAINT fk_vhm_colleague_guardrail_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_colleague_guardrail_colleague FOREIGN KEY(digital_colleague_id) REFERENCES vhm_digital_colleagues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_colleague_collaboration_routes (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, digital_colleague_id CHAR(36) NOT NULL,
  route_type ENUM('human_owner','human_escalation','digital_colleague_handoff') NOT NULL,
  target_user_id CHAR(36) NULL, target_digital_colleague_id CHAR(36) NULL, condition_text TEXT NOT NULL,
  service_level_minutes INT UNSIGNED NULL, channel VARCHAR(80) NOT NULL DEFAULT 'work_queue',
  status ENUM('active','paused','archived') NOT NULL DEFAULT 'active', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_vhm_colleague_route_org(organisation_id,digital_colleague_id,status),
  CONSTRAINT fk_vhm_colleague_route_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_colleague_route_colleague FOREIGN KEY(digital_colleague_id) REFERENCES vhm_digital_colleagues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_colleague_tests (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, digital_colleague_id CHAR(36) NOT NULL,
  test_code VARCHAR(100) NOT NULL, name VARCHAR(180) NOT NULL,
  test_type ENUM('readiness','safety','knowledge','tool','workflow','adversarial') NOT NULL DEFAULT 'readiness',
  input_fixture_json JSON NOT NULL, expected_policy_json JSON NOT NULL,
  status ENUM('not_run','running','passed','failed','blocked') NOT NULL DEFAULT 'not_run', result_json JSON NOT NULL,
  run_by_api_key_id CHAR(36) NULL, run_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_vhm_colleague_test(digital_colleague_id,test_code), KEY idx_vhm_colleague_test_org(organisation_id,status),
  CONSTRAINT fk_vhm_colleague_test_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_colleague_test_colleague FOREIGN KEY(digital_colleague_id) REFERENCES vhm_digital_colleagues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Approval, event and review rows are append-only through the supplied API.
CREATE TABLE IF NOT EXISTS vhm_colleague_approvals (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, digital_colleague_id CHAR(36) NOT NULL,
  decision ENUM('approved','rejected','revoked') NOT NULL, scope_code VARCHAR(80) NOT NULL DEFAULT 'deployment',
  snapshot_json JSON NOT NULL, rationale TEXT NOT NULL, approved_by_api_key_id CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_vhm_colleague_approval_org(organisation_id,digital_colleague_id,created_at),
  CONSTRAINT fk_vhm_colleague_approval_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_colleague_approval_colleague FOREIGN KEY(digital_colleague_id) REFERENCES vhm_digital_colleagues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_colleague_deployments (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, digital_colleague_id CHAR(36) NOT NULL, approval_id CHAR(36) NOT NULL,
  environment ENUM('sandbox','pilot','production') NOT NULL DEFAULT 'sandbox', channels_json JSON NOT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1, status ENUM('pending','deployed','paused','failed','retired') NOT NULL DEFAULT 'pending',
  configuration_snapshot_json JSON NOT NULL, deployed_by_api_key_id CHAR(36) NULL,
  deployed_at DATETIME NULL, paused_at DATETIME NULL, failure_reason TEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_vhm_colleague_deployment(digital_colleague_id,environment,version), KEY idx_vhm_colleague_deployment_org(organisation_id,status),
  CONSTRAINT fk_vhm_colleague_deployment_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_colleague_deployment_colleague FOREIGN KEY(digital_colleague_id) REFERENCES vhm_digital_colleagues(id),
  CONSTRAINT fk_vhm_colleague_deployment_approval FOREIGN KEY(approval_id) REFERENCES vhm_colleague_approvals(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_work_items (
  id CHAR(36) NOT NULL, public_id VARCHAR(40) NOT NULL, organisation_id CHAR(36) NOT NULL, workspace_id CHAR(36) NULL,
  digital_colleague_id CHAR(36) NOT NULL, function_id CHAR(36) NULL, workflow_id CHAR(36) NULL,
  title VARCHAR(255) NOT NULL, request_text MEDIUMTEXT NOT NULL, input_data_json JSON NOT NULL,
  priority ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal', risk_level ENUM('low','medium','high','regulated') NOT NULL DEFAULT 'medium',
  status ENUM('queued','planning','awaiting_review','in_progress','completed','failed','escalated','cancelled') NOT NULL DEFAULT 'queued',
  assigned_by_api_key_id CHAR(36) NULL, due_at DATETIME NULL, started_at DATETIME NULL, completed_at DATETIME NULL,
  failure_reason TEXT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_vhm_work_item_public(public_id), KEY idx_vhm_work_item_org(organisation_id,status,created_at), KEY idx_vhm_work_item_colleague(digital_colleague_id,created_at),
  CONSTRAINT fk_vhm_work_item_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_work_item_colleague FOREIGN KEY(digital_colleague_id) REFERENCES vhm_digital_colleagues(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_work_item_events (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, work_item_id CHAR(36) NOT NULL,
  event_type VARCHAR(100) NOT NULL, actor_type ENUM('system','api_key','digital_colleague','provider') NOT NULL DEFAULT 'system',
  actor_id CHAR(36) NULL, safe_detail_json JSON NOT NULL, occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_vhm_work_item_event_org(organisation_id,work_item_id,occurred_at),
  CONSTRAINT fk_vhm_work_item_event_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_work_item_event_item FOREIGN KEY(work_item_id) REFERENCES vhm_work_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_work_products (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, work_item_id CHAR(36) NOT NULL, digital_colleague_id CHAR(36) NOT NULL,
  product_type VARCHAR(80) NOT NULL DEFAULT 'review_brief', title VARCHAR(255) NOT NULL, content_json JSON NOT NULL,
  source_refs_json JSON NOT NULL, model_provider VARCHAR(120) NULL, model_name VARCHAR(160) NULL,
  status ENUM('draft','awaiting_review','approved','rejected','released') NOT NULL DEFAULT 'draft', version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_vhm_work_product_version(work_item_id,version), KEY idx_vhm_work_product_org(organisation_id,status),
  CONSTRAINT fk_vhm_work_product_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_work_product_item FOREIGN KEY(work_item_id) REFERENCES vhm_work_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_vhm_work_product_colleague FOREIGN KEY(digital_colleague_id) REFERENCES vhm_digital_colleagues(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_work_product_reviews (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, work_product_id CHAR(36) NOT NULL,
  decision ENUM('approved','changes_requested','rejected') NOT NULL, notes TEXT NOT NULL,
  reviewed_by_api_key_id CHAR(36) NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_vhm_work_product_review_org(organisation_id,work_product_id,created_at),
  CONSTRAINT fk_vhm_work_product_review_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_work_product_review_product FOREIGN KEY(work_product_id) REFERENCES vhm_work_products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_colleague_escalations (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, digital_colleague_id CHAR(36) NOT NULL, work_item_id CHAR(36) NULL,
  reason_code VARCHAR(100) NOT NULL, summary TEXT NOT NULL, assigned_to_user_id CHAR(36) NULL,
  status ENUM('open','acknowledged','resolved','dismissed') NOT NULL DEFAULT 'open', resolution TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, resolved_at DATETIME NULL,
  PRIMARY KEY(id), KEY idx_vhm_colleague_escalation_org(organisation_id,status,created_at),
  CONSTRAINT fk_vhm_colleague_escalation_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_colleague_escalation_colleague FOREIGN KEY(digital_colleague_id) REFERENCES vhm_digital_colleagues(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_colleague_costs (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, digital_colleague_id CHAR(36) NOT NULL, work_item_id CHAR(36) NULL,
  provider VARCHAR(120) NOT NULL, model VARCHAR(160) NULL, unit VARCHAR(80) NOT NULL,
  quantity DECIMAL(18,6) NOT NULL, amount_minor BIGINT UNSIGNED NOT NULL DEFAULT 0, currency CHAR(3) NOT NULL DEFAULT 'ZAR',
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_vhm_colleague_cost_org(organisation_id,recorded_at),
  CONSTRAINT fk_vhm_colleague_cost_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_colleague_cost_colleague FOREIGN KEY(digital_colleague_id) REFERENCES vhm_digital_colleagues(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_workforce_scheduled_jobs (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, digital_colleague_id CHAR(36) NOT NULL, workflow_id CHAR(36) NOT NULL,
  schedule_expression VARCHAR(180) NOT NULL, timezone VARCHAR(80) NOT NULL DEFAULT 'Africa/Johannesburg', input_template_json JSON NOT NULL,
  status ENUM('disabled','active','paused') NOT NULL DEFAULT 'disabled', next_run_at DATETIME NULL, last_run_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_vhm_workforce_schedule_org(organisation_id,status,next_run_at),
  CONSTRAINT fk_vhm_workforce_schedule_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_workforce_schedule_colleague FOREIGN KEY(digital_colleague_id) REFERENCES vhm_digital_colleagues(id),
  CONSTRAINT fk_vhm_workforce_schedule_workflow FOREIGN KEY(workflow_id) REFERENCES vhm_colleague_workflows(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_workforce_model_policies (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, digital_colleague_id CHAR(36) NULL,
  purpose VARCHAR(120) NOT NULL, provider VARCHAR(120) NOT NULL, model VARCHAR(160) NOT NULL,
  fallback_provider VARCHAR(120) NULL, fallback_model VARCHAR(160) NULL, max_output_tokens INT UNSIGNED NOT NULL DEFAULT 1200,
  allow_memory TINYINT(1) NOT NULL DEFAULT 0, allow_tool_calls TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('disabled','approved','paused') NOT NULL DEFAULT 'disabled', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_vhm_workforce_model_policy(organisation_id,digital_colleague_id,purpose), KEY idx_vhm_workforce_model_policy_org(organisation_id,status),
  CONSTRAINT fk_vhm_workforce_model_policy_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_workforce_model_policy_colleague FOREIGN KEY(digital_colleague_id) REFERENCES vhm_digital_colleagues(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO vhm_feature_flags(flag_key,enabled,scope_type,metadata_json) VALUES
('ENABLE_DIGITAL_WORKFORCE',1,'global',JSON_OBJECT('boundary','control-plane')),
('ENABLE_DIGITAL_COLLEAGUES',1,'global',JSON_OBJECT('boundary','control-plane')),
('ENABLE_WORKFORCE_AI_GENERATION',0,'global',JSON_OBJECT('requires','approved provider')),
('ENABLE_WORKFORCE_MODEL_EXECUTION',0,'global',JSON_OBJECT('requires','approved provider and model policy')),
('ENABLE_WORKFORCE_TOOL_EXECUTION',0,'global',JSON_OBJECT('requires','approved integration and permission')),
('ENABLE_WORKFORCE_SCHEDULES',0,'global',JSON_OBJECT('requires','durable worker'))
ON DUPLICATE KEY UPDATE metadata_json=VALUES(metadata_json);

INSERT INTO vhm_role_definitions(code,label,permissions_json,is_system) VALUES
('owner','Owner',JSON_ARRAY('organisation:manage','billing:manage','audit:read','workforce:create','workforce:configure','workforce:test','workforce:approve','workforce:deploy','workforce:assign','workforce:review','workforce:analytics'),1),
('org_admin','Organisation admin',JSON_ARRAY('organisation:manage','human:create','persona:publish','workforce:create','workforce:configure','workforce:test','workforce:approve','workforce:deploy','workforce:assign','workforce:review','workforce:analytics'),1),
('creator','Creator',JSON_ARRAY('human:create','workforce:create','workforce:configure','workforce:test'),1),
('security_reviewer','Security reviewer',JSON_ARRAY('security:review','audit:read','workforce:test','workforce:approve','workforce:review'),1),
('viewer','Viewer',JSON_ARRAY(),1)
ON DUPLICATE KEY UPDATE label=VALUES(label),permissions_json=VALUES(permissions_json),is_system=VALUES(is_system);
