SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS vhm_organisations (
  id CHAR(36) NOT NULL, name VARCHAR(180) NOT NULL, slug VARCHAR(120) NOT NULL,
  status ENUM('active','suspended','archived') NOT NULL DEFAULT 'active', settings_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_vhm_org_slug(slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_applications (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, name VARCHAR(180) NOT NULL, slug VARCHAR(120) NOT NULL,
  status ENUM('active','sandbox','archived') NOT NULL DEFAULT 'active', settings_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_vhm_app_org_slug(organisation_id,slug), KEY idx_vhm_app_org(organisation_id),
  CONSTRAINT fk_vhm_app_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_identities (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, owner_name VARCHAR(180) NOT NULL, display_name VARCHAR(180) NOT NULL,
  source_provenance TEXT NOT NULL, geographic_scope VARCHAR(300) NOT NULL, commercial_use_confirmed TINYINT(1) NOT NULL DEFAULT 0,
  consent_complete TINYINT(1) NOT NULL DEFAULT 0, consent_status ENUM('pending','approved','expired','revoked','rejected') NOT NULL DEFAULT 'pending',
  approved_by VARCHAR(180) NULL, approved_at DATETIME NULL, expires_at DATETIME NULL, revoked_at DATETIME NULL, revocation_reason VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_vhm_identity_org_status(organisation_id,consent_status,expires_at),
  CONSTRAINT fk_vhm_identity_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_identity_consents (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, identity_id CHAR(36) NOT NULL,
  consent_type ENUM('written','face','voice','commercial') NOT NULL, object_key VARCHAR(700) NOT NULL, sha256 CHAR(64) NOT NULL,
  permitted_roles_json JSON NOT NULL, permitted_applications_json JSON NOT NULL,
  status ENUM('pending','approved','expired','revoked','rejected') NOT NULL DEFAULT 'pending', signed_at DATETIME NULL, expires_at DATETIME NULL, revoked_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_vhm_consent_identity(identity_id,status,expires_at), KEY idx_vhm_consent_org(organisation_id),
  CONSTRAINT fk_vhm_consent_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_consent_identity FOREIGN KEY(identity_id) REFERENCES vhm_identities(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_digital_humans (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, identity_id CHAR(36) NULL,
  name VARCHAR(180) NOT NULL, role VARCHAR(180) NOT NULL, disclosure VARCHAR(500) NOT NULL,
  default_voice_ref VARCHAR(180) NULL, default_face_ref VARCHAR(180) NULL, default_gesture_ref VARCHAR(180) NULL,
  status ENUM('draft','active','archived','revoked') NOT NULL DEFAULT 'draft', created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_vhm_human_org_status(organisation_id,status), KEY idx_vhm_human_identity(identity_id),
  CONSTRAINT fk_vhm_human_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_human_identity FOREIGN KEY(identity_id) REFERENCES vhm_identities(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_personas (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, name VARCHAR(180) NOT NULL, description TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_vhm_persona_org_name(organisation_id,name),
  CONSTRAINT fk_vhm_persona_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_persona_versions (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, persona_id CHAR(36) NOT NULL, version INT UNSIGNED NOT NULL,
  status ENUM('draft','published','archived','revoked') NOT NULL DEFAULT 'draft', role VARCHAR(180) NOT NULL,
  system_instructions MEDIUMTEXT NOT NULL, conversation_style VARCHAR(500) NOT NULL, opening_message TEXT NOT NULL,
  language VARCHAR(24) NOT NULL DEFAULT 'en-ZA', speaking_rate DECIMAL(4,2) NOT NULL DEFAULT 1.00, max_response_words SMALLINT UNSIGNED NOT NULL DEFAULT 150,
  objectives_json JSON NOT NULL, guardrails_json JSON NOT NULL, capabilities_json JSON NOT NULL, application_overrides_json JSON NOT NULL,
  published_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_vhm_persona_version(persona_id,version), KEY idx_vhm_persona_version_org(organisation_id,status),
  CONSTRAINT fk_vhm_persona_version_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_persona_version_persona FOREIGN KEY(persona_id) REFERENCES vhm_personas(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_digital_human_applications (
  organisation_id CHAR(36) NOT NULL, digital_human_id CHAR(36) NOT NULL, application_id CHAR(36) NOT NULL, persona_version_id CHAR(36) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(digital_human_id,application_id), KEY idx_vhm_human_app_org(organisation_id),
  CONSTRAINT fk_vhm_human_app_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_human_app_human FOREIGN KEY(digital_human_id) REFERENCES vhm_digital_humans(id),
  CONSTRAINT fk_vhm_human_app_app FOREIGN KEY(application_id) REFERENCES vhm_applications(id),
  CONSTRAINT fk_vhm_human_app_persona FOREIGN KEY(persona_version_id) REFERENCES vhm_persona_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_knowledge_documents (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, title VARCHAR(300) NOT NULL,
  source_type ENUM('text','pdf','docx','markdown','website','course','job_context') NOT NULL, object_key VARCHAR(700) NULL,
  approved_url VARCHAR(1500) NULL, sha256 CHAR(64) NULL, version INT UNSIGNED NOT NULL DEFAULT 1,
  access_policy_json JSON NOT NULL, status ENUM('draft','active','archived','revoked') NOT NULL DEFAULT 'draft', deleted_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_vhm_knowledge_org_status(organisation_id,status),
  CONSTRAINT fk_vhm_knowledge_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_sessions (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, application_id CHAR(36) NOT NULL, digital_human_id CHAR(36) NOT NULL,
  owner_reference_hash CHAR(64) NOT NULL, practice_mode ENUM('realistic','guided','quick','confidence') NULL,
  status ENUM('created','connecting','active','closing','completed','failed','deleted') NOT NULL DEFAULT 'created',
  avatar_mode ENUM('audio-only','static-portrait','pre-rendered-loop','musetalk','musetalk-liveportrait') NOT NULL DEFAULT 'audio-only',
  transcript_consent TINYINT(1) NOT NULL DEFAULT 0, recording_consent TINYINT(1) NOT NULL DEFAULT 0,
  started_at DATETIME NULL, ended_at DATETIME NULL, deleted_at DATETIME NULL, failure_reason VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_vhm_session_org_created(organisation_id,created_at), KEY idx_vhm_session_app(application_id,status), KEY idx_vhm_session_owner(owner_reference_hash),
  CONSTRAINT fk_vhm_session_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_session_app FOREIGN KEY(application_id) REFERENCES vhm_applications(id),
  CONSTRAINT fk_vhm_session_human FOREIGN KEY(digital_human_id) REFERENCES vhm_digital_humans(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_transcript_refs (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, session_id CHAR(36) NOT NULL,
  owner_scope ENUM('candidate','learner','organisation') NOT NULL, encrypted_object_key VARCHAR(700) NULL,
  retention_until DATETIME NULL, deleted_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_vhm_transcript_session(session_id), KEY idx_vhm_transcript_org(organisation_id),
  CONSTRAINT fk_vhm_transcript_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_transcript_session FOREIGN KEY(session_id) REFERENCES vhm_sessions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_presenter_projects (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, application_id CHAR(36) NULL, digital_human_id CHAR(36) NOT NULL,
  title VARCHAR(180) NOT NULL, course VARCHAR(180) NOT NULL DEFAULT '', module VARCHAR(180) NOT NULL DEFAULT '', lesson VARCHAR(180) NOT NULL DEFAULT '',
  script MEDIUMTEXT NOT NULL, aspect_ratio ENUM('16:9','9:16','1:1','audio') NOT NULL DEFAULT '16:9', output_language VARCHAR(24) NOT NULL DEFAULT 'en-ZA',
  status ENUM('draft','queued','processing','preview_ready','approved','completed','failed','cancelled') NOT NULL DEFAULT 'draft',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_vhm_project_org_status(organisation_id,status),
  CONSTRAINT fk_vhm_project_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_project_app FOREIGN KEY(application_id) REFERENCES vhm_applications(id),
  CONSTRAINT fk_vhm_project_human FOREIGN KEY(digital_human_id) REFERENCES vhm_digital_humans(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_api_keys (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, application_id CHAR(36) NULL,
  name VARCHAR(180) NOT NULL, key_prefix VARCHAR(32) NOT NULL, key_hash CHAR(64) NOT NULL, scopes_json JSON NOT NULL,
  status ENUM('active','archived','revoked') NOT NULL DEFAULT 'active', expires_at DATETIME NULL, last_used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_vhm_api_key_hash(key_hash), KEY idx_vhm_api_key_org_status(organisation_id,status),
  CONSTRAINT fk_vhm_api_key_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_api_key_app FOREIGN KEY(application_id) REFERENCES vhm_applications(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_usage_records (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, application_id CHAR(36) NULL, session_id CHAR(36) NULL,
  provider VARCHAR(120) NOT NULL, model VARCHAR(160) NULL, unit VARCHAR(80) NOT NULL, quantity DECIMAL(18,6) NOT NULL,
  latency_ms INT UNSIGNED NULL, estimated_cost_minor BIGINT UNSIGNED NOT NULL DEFAULT 0, currency CHAR(3) NOT NULL DEFAULT 'ZAR',
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_vhm_usage_org_time(organisation_id,recorded_at), KEY idx_vhm_usage_app(application_id,recorded_at),
  CONSTRAINT fk_vhm_usage_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_usage_app FOREIGN KEY(application_id) REFERENCES vhm_applications(id),
  CONSTRAINT fk_vhm_usage_session FOREIGN KEY(session_id) REFERENCES vhm_sessions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_audit_logs (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, api_key_id CHAR(36) NULL, action VARCHAR(180) NOT NULL,
  resource_type VARCHAR(120) NOT NULL, resource_id CHAR(36) NULL, request_id VARCHAR(80) NOT NULL, detail_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_vhm_audit_org_time(organisation_id,created_at), KEY idx_vhm_audit_resource(resource_type,resource_id),
  CONSTRAINT fk_vhm_audit_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_audit_key FOREIGN KEY(api_key_id) REFERENCES vhm_api_keys(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_rate_limits (
  bucket_key CHAR(64) NOT NULL, window_start DATETIME NOT NULL, hits INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY(bucket_key,window_start), KEY idx_vhm_rate_window(window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_webhook_events (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, event_type VARCHAR(180) NOT NULL, payload_json JSON NOT NULL,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_vhm_webhook_org_time(organisation_id,received_at),
  CONSTRAINT fk_vhm_webhook_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

