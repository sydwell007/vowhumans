-- Real knowledge libraries (documents -> chunks -> embeddings, with citation-backed
-- retrieval) and real personas (versioned conversational/behavioural config), plus
-- which knowledge bases and persona a catalogue digital human currently uses.
-- Knowledge assignment is deliberately many-to-many (a VowHuman can combine several
-- knowledge bases at once) — unlike voice/face/gesture/persona, which stay 1:1.
-- persona_versions.voice_id/face_asset_id/gesture_profile_id stay unused here: they
-- assume a real digital_humans FK relationship that doesn't exist yet, same reason
-- human_slug text-matching was used instead of a real FK for voice/face/gesture
-- assignments in 005/006. knowledge_base_ids (a plain array, no FK dependency) is
-- wired up though, so a persona's test console can retrieve from its own knowledge.
BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE knowledge_chunks ADD COLUMN embedding vector(1536);
CREATE INDEX idx_knowledge_chunks_embedding ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);

-- 'xlsx' for spreadsheet uploads, 'generated' for AI-authored articles.
ALTER TABLE knowledge_documents DROP CONSTRAINT knowledge_documents_source_type_check;
ALTER TABLE knowledge_documents ADD CONSTRAINT knowledge_documents_source_type_check
  CHECK (source_type IN ('text','pdf','docx','xlsx','markdown','website','course','job_context','generated'));

-- Lets the Knowledge page's "Languages" stat tile be computed from real data.
ALTER TABLE knowledge_documents ADD COLUMN language text;

CREATE TABLE IF NOT EXISTS human_knowledge_assignments (
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  human_slug text NOT NULL,
  knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, human_slug, knowledge_base_id)
);

CREATE TABLE IF NOT EXISTS human_persona_assignments (
  organisation_id uuid NOT NULL REFERENCES organisations(id),
  human_slug text NOT NULL,
  persona_version_id uuid NOT NULL REFERENCES persona_versions(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, human_slug)
);

ALTER TABLE human_knowledge_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE human_persona_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_human_knowledge_assignments ON human_knowledge_assignments USING (organisation_id = nullif(current_setting('app.organisation_id', true),'')::uuid) WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true),'')::uuid);
CREATE POLICY tenant_isolation_human_persona_assignments ON human_persona_assignments USING (organisation_id = nullif(current_setting('app.organisation_id', true),'')::uuid) WITH CHECK (organisation_id = nullif(current_setting('app.organisation_id', true),'')::uuid);

COMMIT;
