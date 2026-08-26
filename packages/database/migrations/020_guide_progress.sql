-- Per-user progress through the guided-onboarding engine (coach marks / Follow
-- Along Mode) introduced to make Studio's existing Digital Human and Digital
-- Workforce functionality easier to discover and learn. Guide *definitions*
-- (steps, copy, real UI targets) live in code
-- (apps/studio-web/src/lib/guides.ts) and ship via normal review, the same way
-- workforce_templates' structure does; only per-user *progress* through them
-- needs to persist here. A single table is deliberately sufficient for Phase 1
-- completion-rate/drop-off visibility via status/current_step_id/started_at/
-- completed_at — a separate granular event-log table is deferred until real
-- usage shows the extra resolution is needed (see
-- docs/GUIDED_STUDIO_ADDITIONAL_RECOMMENDATIONS.md).
--
-- No control_plane_audit trigger on either table below (unlike several
-- migration-019 tables) — this is UX/learning state, not compliance evidence;
-- recording "which onboarding step a user is on" in the same audit trail as
-- identity/persona/consent changes would misleadingly imply it needs the same
-- scrutiny. guide_progress is also deliberately NOT append-only (unlike
-- runtime_test_results/runtime_events/runtime_usage) — its whole purpose is to
-- be updated in place as the user advances.
BEGIN;

CREATE TABLE IF NOT EXISTS guide_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guide_id text NOT NULL,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','skipped','dismissed')),
  current_step_id text NOT NULL DEFAULT '',
  completed_step_ids jsonb NOT NULL DEFAULT '[]',
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (user_id, guide_id)
);

CREATE TABLE IF NOT EXISTS studio_user_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  guided_mode boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guide_progress_org_user ON guide_progress(organisation_id, user_id);
CREATE INDEX IF NOT EXISTS idx_guide_progress_guide ON guide_progress(guide_id, status);

DO $$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['guide_progress','studio_user_preferences'] LOOP
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

COMMIT;
