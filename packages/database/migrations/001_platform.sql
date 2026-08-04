BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE lifecycle_state AS ENUM ('draft','active','archived','revoked');
CREATE TYPE persona_state AS ENUM ('draft','published','archived','revoked');
CREATE TYPE session_state AS ENUM ('created','connecting','active','closing','completed','failed','deleted');
CREATE TYPE render_state AS ENUM ('draft','queued','processing','preview_ready','approved','completed','failed','cancelled');
CREATE TYPE consent_state AS ENUM ('pending','approved','expired','revoked','rejected');

CREATE TABLE organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE,
  status lifecycle_state NOT NULL DEFAULT 'active', settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id),
  email text NOT NULL, display_name text NOT NULL, role text NOT NULL CHECK (role IN ('owner','admin','operator','reviewer','viewer')),
  status lifecycle_state NOT NULL DEFAULT 'active', external_subject text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id,email)
);
CREATE TABLE applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id),
  name text NOT NULL, slug text NOT NULL, status lifecycle_state NOT NULL DEFAULT 'active',
  settings jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organisation_id,slug)
);
CREATE TABLE identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id),
  owner_name text NOT NULL, display_name text NOT NULL, provenance jsonb NOT NULL DEFAULT '{}',
  geographic_scope text[] NOT NULL DEFAULT '{}', commercial_use_confirmed boolean NOT NULL DEFAULT false,
  state consent_state NOT NULL DEFAULT 'pending', approved_by uuid REFERENCES users(id), approved_at timestamptz,
  expires_at timestamptz, revoked_at timestamptz, revocation_reason text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE identity_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id),
  identity_id uuid NOT NULL REFERENCES identities(id) ON DELETE CASCADE, consent_type text NOT NULL CHECK (consent_type IN ('written','face','voice','commercial')),
  object_key text NOT NULL, sha256 text NOT NULL, permitted_roles text[] NOT NULL DEFAULT '{}',
  permitted_application_ids uuid[] NOT NULL DEFAULT '{}', state consent_state NOT NULL DEFAULT 'pending',
  signed_at timestamptz, expires_at timestamptz, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE face_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), identity_id uuid NOT NULL REFERENCES identities(id),
  object_key text NOT NULL, sha256 text NOT NULL, media_type text NOT NULL, provenance jsonb NOT NULL DEFAULT '{}',
  detector_provider text, preprocessing_state text NOT NULL DEFAULT 'pending', state lifecycle_state NOT NULL DEFAULT 'draft', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE voice_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), identity_id uuid NOT NULL REFERENCES identities(id),
  object_key text NOT NULL, sha256 text NOT NULL, media_type text NOT NULL, duration_ms integer CHECK (duration_ms >= 0),
  provenance jsonb NOT NULL DEFAULT '{}', state lifecycle_state NOT NULL DEFAULT 'draft', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE voices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), identity_id uuid REFERENCES identities(id),
  name text NOT NULL, provider text NOT NULL, provider_voice_id text, language text NOT NULL, is_custom boolean NOT NULL DEFAULT false,
  state lifecycle_state NOT NULL DEFAULT 'draft', settings jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE gesture_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), name text NOT NULL,
  state lifecycle_state NOT NULL DEFAULT 'draft', state_config jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE digital_humans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), identity_id uuid REFERENCES identities(id),
  name text NOT NULL, role text NOT NULL, disclosure text NOT NULL CHECK (length(disclosure) > 0), default_voice_id uuid REFERENCES voices(id),
  default_face_asset_id uuid REFERENCES face_assets(id), default_gesture_profile_id uuid REFERENCES gesture_profiles(id),
  state lifecycle_state NOT NULL DEFAULT 'draft', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE personas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), name text NOT NULL,
  description text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organisation_id,name)
);
CREATE TABLE knowledge_bases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), name text NOT NULL,
  description text NOT NULL DEFAULT '', state lifecycle_state NOT NULL DEFAULT 'draft', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), persona_id uuid NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  label text NOT NULL, instruction text NOT NULL, priority smallint NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE guardrails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), persona_id uuid NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  code text NOT NULL, instruction text NOT NULL, enforcement text NOT NULL DEFAULT 'prompt', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), persona_id uuid NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  name text NOT NULL, configuration jsonb NOT NULL DEFAULT '{}', enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE persona_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), persona_id uuid NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0), state persona_state NOT NULL DEFAULT 'draft', role text NOT NULL, system_instructions text NOT NULL,
  conversation_style text NOT NULL, opening_message text NOT NULL, language text NOT NULL DEFAULT 'en-ZA', speaking_rate numeric(4,2) NOT NULL DEFAULT 1,
  max_response_words integer NOT NULL DEFAULT 150, voice_id uuid REFERENCES voices(id), face_asset_id uuid REFERENCES face_assets(id),
  gesture_profile_id uuid REFERENCES gesture_profiles(id), knowledge_base_ids uuid[] NOT NULL DEFAULT '{}', application_overrides jsonb NOT NULL DEFAULT '{}',
  published_at timestamptz, created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(persona_id,version)
);
CREATE TABLE digital_human_applications (
  organisation_id uuid NOT NULL REFERENCES organisations(id), digital_human_id uuid NOT NULL REFERENCES digital_humans(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES applications(id) ON DELETE CASCADE, persona_version_id uuid NOT NULL REFERENCES persona_versions(id),
  enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(digital_human_id,application_id)
);
CREATE TABLE knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  title text NOT NULL, source_type text NOT NULL CHECK(source_type IN ('text','pdf','docx','markdown','website','course','job_context')),
  object_key text, approved_url text, sha256 text, version integer NOT NULL DEFAULT 1, access_policy jsonb NOT NULL DEFAULT '{}',
  state lifecycle_state NOT NULL DEFAULT 'draft', deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), document_id uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  ordinal integer NOT NULL, content text NOT NULL, embedding_provider text, embedding_model text, embedding_ref text,
  citation jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(document_id,ordinal)
);
CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), application_id uuid NOT NULL REFERENCES applications(id),
  digital_human_id uuid NOT NULL REFERENCES digital_humans(id), persona_version_id uuid NOT NULL REFERENCES persona_versions(id),
  owner_user_id uuid REFERENCES users(id), owner_external_ref_hash text, practice_mode text, state session_state NOT NULL DEFAULT 'created',
  transport_provider text NOT NULL, avatar_mode text NOT NULL DEFAULT 'audio-only', transcript_consent boolean NOT NULL DEFAULT false,
  recording_consent boolean NOT NULL DEFAULT false, started_at timestamptz, ended_at timestamptz, expires_at timestamptz,
  context jsonb NOT NULL DEFAULT '{}', failure_reason text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  sequence bigint NOT NULL, event_type text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL DEFAULT now(), UNIQUE(session_id,sequence)
);
CREATE TABLE transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  owner_scope text NOT NULL CHECK(owner_scope IN ('candidate','learner','organisation')), object_key text, encrypted_text bytea,
  language text NOT NULL DEFAULT 'en-ZA', retention_until timestamptz, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  object_key text NOT NULL, media_type text NOT NULL, duration_ms integer, retention_until timestamptz, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE presenter_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), application_id uuid REFERENCES applications(id),
  title text NOT NULL, course text, module text, lesson text, script text NOT NULL DEFAULT '', digital_human_id uuid REFERENCES digital_humans(id),
  voice_id uuid REFERENCES voices(id), theme jsonb NOT NULL DEFAULT '{}', output_language text NOT NULL DEFAULT 'en-ZA',
  aspect_ratio text NOT NULL DEFAULT '16:9', state render_state NOT NULL DEFAULT 'draft', created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE presenter_scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), project_id uuid NOT NULL REFERENCES presenter_projects(id) ON DELETE CASCADE,
  ordinal integer NOT NULL, script text NOT NULL, slide_object_key text, background jsonb NOT NULL DEFAULT '{}', duration_ms integer,
  state render_state NOT NULL DEFAULT 'draft', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(project_id,ordinal)
);
CREATE TABLE generated_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), project_id uuid NOT NULL REFERENCES presenter_projects(id),
  render_provider text NOT NULL, output_kind text NOT NULL, object_key text, subtitle_object_key text, thumbnail_object_key text,
  duration_ms integer, state render_state NOT NULL DEFAULT 'queued', failure_reason text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), application_id uuid REFERENCES applications(id),
  name text NOT NULL, prefix text NOT NULL, key_hash text NOT NULL UNIQUE, scopes text[] NOT NULL DEFAULT '{}', status lifecycle_state NOT NULL DEFAULT 'active',
  expires_at timestamptz, last_used_at timestamptz, created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), application_id uuid REFERENCES applications(id),
  endpoint_url text NOT NULL, secret_ciphertext bytea NOT NULL, event_types text[] NOT NULL DEFAULT '{}', status lifecycle_state NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE usage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), application_id uuid REFERENCES applications(id),
  session_id uuid REFERENCES sessions(id), generated_video_id uuid REFERENCES generated_videos(id), provider text NOT NULL, model text,
  unit text NOT NULL, quantity numeric(18,6) NOT NULL CHECK(quantity >= 0), latency_ms integer, estimated_cost_minor bigint NOT NULL DEFAULT 0,
  currency char(3) NOT NULL DEFAULT 'ZAR', recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE billing_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), period_start date NOT NULL, period_end date NOT NULL,
  amount_minor bigint NOT NULL, currency char(3) NOT NULL DEFAULT 'ZAR', status text NOT NULL, breakdown jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE moderation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), session_id uuid REFERENCES sessions(id),
  category text NOT NULL, action text NOT NULL, provider text, detail jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), actor_user_id uuid REFERENCES users(id),
  actor_service_key_id uuid REFERENCES api_keys(id), action text NOT NULL, resource_type text NOT NULL, resource_id uuid, request_id text,
  before_state jsonb, after_state jsonb, ip_hash text, occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organisation_id uuid NOT NULL REFERENCES organisations(id), requester_user_id uuid REFERENCES users(id),
  resource_type text NOT NULL, resource_id uuid NOT NULL, reason text, status text NOT NULL DEFAULT 'queued', requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz, audit_log_id uuid REFERENCES audit_logs(id)
);

CREATE INDEX idx_users_org ON users(organisation_id);
CREATE INDEX idx_identities_org_state ON identities(organisation_id,state);
CREATE INDEX idx_consents_identity_state ON identity_consents(identity_id,state,expires_at);
CREATE INDEX idx_humans_org_state ON digital_humans(organisation_id,state);
CREATE INDEX idx_persona_versions_persona_state ON persona_versions(persona_id,state,version DESC);
CREATE INDEX idx_documents_kb_state ON knowledge_documents(knowledge_base_id,state);
CREATE INDEX idx_chunks_document ON knowledge_chunks(document_id,ordinal);
CREATE INDEX idx_sessions_org_created ON sessions(organisation_id,created_at DESC);
CREATE INDEX idx_sessions_owner ON sessions(organisation_id,owner_external_ref_hash);
CREATE INDEX idx_events_session_time ON session_events(session_id,occurred_at);
CREATE INDEX idx_projects_org_state ON presenter_projects(organisation_id,state);
CREATE INDEX idx_videos_project_state ON generated_videos(project_id,state);
CREATE INDEX idx_usage_org_time ON usage_records(organisation_id,recorded_at DESC);
CREATE INDEX idx_audit_org_time ON audit_logs(organisation_id,occurred_at DESC);
CREATE INDEX idx_deletions_status ON deletion_requests(status,requested_at);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['users','applications','identities','identity_consents','face_assets','voice_assets','voices','gesture_profiles','digital_humans','personas','knowledge_bases','objectives','guardrails','capabilities','persona_versions','digital_human_applications','knowledge_documents','knowledge_chunks','sessions','session_events','transcripts','recordings','presenter_projects','presenter_scenes','generated_videos','api_keys','webhooks','usage_records','billing_records','moderation_events','audit_logs','deletion_requests']
  LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
       EXECUTE format('CREATE POLICY tenant_isolation_%I ON %I USING (organisation_id = nullif(current_setting(''app.organisation_id'', true),'''')::uuid) WITH CHECK (organisation_id = nullif(current_setting(''app.organisation_id'', true),'''')::uuid)',t,t);
  END LOOP;
END $$;
COMMIT;

