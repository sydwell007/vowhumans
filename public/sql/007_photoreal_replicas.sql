-- Afrihost MySQL control-plane mirror for consent-bound Photoreal Replicas.
-- Large capture video MUST remain in private object storage; never store it here.
SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS vhm_replica_profiles (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, digital_human_id CHAR(36) NOT NULL,
  identity_id CHAR(36) NOT NULL, name VARCHAR(180) NOT NULL,
  renderer_tier ENUM('portrait','video_replica','rigged_3d') NOT NULL DEFAULT 'video_replica',
  status ENUM('draft','capturing','processing','quality_review','approval_required','approved','revoked','failed') NOT NULL DEFAULT 'draft',
  quality_mode ENUM('standard','premium','presenter') NOT NULL DEFAULT 'standard',
  provider VARCHAR(120) NOT NULL DEFAULT 'musetalk-video-replica', motion_profile_json JSON NOT NULL,
  active_version_id CHAR(36) NULL, approved_by_api_key_id CHAR(36) NULL, approved_at DATETIME NULL,
  revoked_at DATETIME NULL, revocation_reason VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_vhm_replica_org(organisation_id,updated_at), KEY idx_vhm_replica_identity(identity_id,status),
  CONSTRAINT fk_vhm_replica_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_replica_human FOREIGN KEY(digital_human_id) REFERENCES vhm_digital_humans(id),
  CONSTRAINT fk_vhm_replica_identity FOREIGN KEY(identity_id) REFERENCES vhm_identities(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_replica_capture_sessions (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, replica_profile_id CHAR(36) NOT NULL,
  identity_id CHAR(36) NOT NULL, protocol_version VARCHAR(20) NOT NULL DEFAULT 'v1',
  status ENUM('draft','consent_verified','capturing','uploaded','quality_review','accepted','rejected','expired','revoked') NOT NULL DEFAULT 'draft',
  consent_scope_json JSON NOT NULL, capture_settings_json JSON NOT NULL, retention_until DATETIME NULL,
  consent_verified_at DATETIME NULL, completed_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_vhm_replica_capture_profile(replica_profile_id,created_at), KEY idx_vhm_replica_capture_org(organisation_id),
  CONSTRAINT fk_vhm_replica_capture_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_replica_capture_profile FOREIGN KEY(replica_profile_id) REFERENCES vhm_replica_profiles(id),
  CONSTRAINT fk_vhm_replica_capture_identity FOREIGN KEY(identity_id) REFERENCES vhm_identities(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_replica_capture_segments (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, capture_session_id CHAR(36) NOT NULL,
  segment_type ENUM('identity_reference','idle','listening','speaking','expression','gesture','calibration') NOT NULL,
  gesture_key ENUM('acknowledge','explain','emphasise','reassure') NULL, expression_key VARCHAR(80) NULL,
  object_key VARCHAR(900) NOT NULL, sha256 CHAR(64) NOT NULL, media_type VARCHAR(100) NOT NULL,
  byte_size BIGINT UNSIGNED NOT NULL, duration_ms INT UNSIGNED NULL, width INT UNSIGNED NULL,
  height INT UNSIGNED NULL, fps DECIMAL(6,3) NULL, starts_neutral TINYINT(1) NOT NULL DEFAULT 0,
  ends_neutral TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('upload_pending','uploaded','accepted','rejected','deleted') NOT NULL DEFAULT 'uploaded',
  metadata_json JSON NOT NULL, deleted_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_vhm_replica_segment_session(capture_session_id,segment_type), KEY idx_vhm_replica_segment_org(organisation_id),
  CONSTRAINT fk_vhm_replica_segment_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_replica_segment_session FOREIGN KEY(capture_session_id) REFERENCES vhm_replica_capture_sessions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_replica_processing_jobs (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, replica_profile_id CHAR(36) NOT NULL,
  capture_session_id CHAR(36) NOT NULL, provider VARCHAR(120) NOT NULL DEFAULT 'vowhumans-replica-processor',
  status ENUM('queued','running','completed','failed','cancelled') NOT NULL DEFAULT 'queued',
  progress TINYINT UNSIGNED NOT NULL DEFAULT 0, input_manifest_object_key VARCHAR(900) NULL,
  output_manifest_object_key VARCHAR(900) NULL, safe_error_code VARCHAR(120) NULL, safe_metrics_json JSON NOT NULL,
  started_at DATETIME NULL, completed_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_vhm_replica_job_status(status,created_at), KEY idx_vhm_replica_job_org(organisation_id),
  CONSTRAINT fk_vhm_replica_job_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_replica_job_profile FOREIGN KEY(replica_profile_id) REFERENCES vhm_replica_profiles(id),
  CONSTRAINT fk_vhm_replica_job_capture FOREIGN KEY(capture_session_id) REFERENCES vhm_replica_capture_sessions(id),
  CONSTRAINT chk_vhm_replica_job_progress CHECK (progress BETWEEN 0 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_replica_versions (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, replica_profile_id CHAR(36) NOT NULL,
  version INT UNSIGNED NOT NULL, provider VARCHAR(120) NOT NULL,
  status ENUM('draft','processing','quality_review','approved','published','revoked','failed') NOT NULL DEFAULT 'draft',
  manifest_object_key VARCHAR(900) NOT NULL, manifest_sha256 CHAR(64) NOT NULL,
  preview_object_key VARCHAR(900) NULL, capability_snapshot_json JSON NOT NULL,
  published_at DATETIME NULL, revoked_at DATETIME NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), UNIQUE KEY uq_vhm_replica_version(replica_profile_id,version), KEY idx_vhm_replica_version_org(organisation_id,status),
  CONSTRAINT fk_vhm_replica_version_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_replica_version_profile FOREIGN KEY(replica_profile_id) REFERENCES vhm_replica_profiles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_replica_quality_checks (
  id CHAR(36) NOT NULL, organisation_id CHAR(36) NOT NULL, replica_profile_id CHAR(36) NOT NULL,
  replica_version_id CHAR(36) NULL, check_code VARCHAR(120) NOT NULL,
  status ENUM('passed','warning','failed','blocked','not_tested') NOT NULL,
  measured_value DECIMAL(18,6) NULL, threshold_value DECIMAL(18,6) NULL, unit VARCHAR(40) NULL,
  safe_detail_json JSON NOT NULL, checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id), KEY idx_vhm_replica_quality_profile(replica_profile_id,checked_at), KEY idx_vhm_replica_quality_org(organisation_id),
  CONSTRAINT fk_vhm_replica_quality_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_replica_quality_profile FOREIGN KEY(replica_profile_id) REFERENCES vhm_replica_profiles(id),
  CONSTRAINT fk_vhm_replica_quality_version FOREIGN KEY(replica_version_id) REFERENCES vhm_replica_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vhm_human_replica_assignments (
  organisation_id CHAR(36) NOT NULL, digital_human_id CHAR(36) NOT NULL, replica_profile_id CHAR(36) NOT NULL,
  replica_version_id CHAR(36) NOT NULL, renderer_tier ENUM('portrait','video_replica','rigged_3d') NOT NULL DEFAULT 'video_replica',
  quality_mode ENUM('standard','premium','presenter') NOT NULL DEFAULT 'standard', enabled TINYINT(1) NOT NULL DEFAULT 0,
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(organisation_id,digital_human_id),
  CONSTRAINT fk_vhm_replica_assignment_org FOREIGN KEY(organisation_id) REFERENCES vhm_organisations(id),
  CONSTRAINT fk_vhm_replica_assignment_human FOREIGN KEY(digital_human_id) REFERENCES vhm_digital_humans(id),
  CONSTRAINT fk_vhm_replica_assignment_profile FOREIGN KEY(replica_profile_id) REFERENCES vhm_replica_profiles(id),
  CONSTRAINT fk_vhm_replica_assignment_version FOREIGN KEY(replica_version_id) REFERENCES vhm_replica_versions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
