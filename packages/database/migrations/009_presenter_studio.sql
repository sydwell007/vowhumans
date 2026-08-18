-- generated_videos was schema'd for project-level "here's a render take" rows.
-- Presenter Studio's real pipeline renders one scene at a time (see
-- api/v1/[...route]/route.ts's render-next-scene branch) — a nullable scene_id
-- lets this same table double as the per-scene render-artifact record now
-- (scene_id set, output_kind 'scene-clip'/'scene-audio') while staying the
-- right home for a future whole-project scene_id IS NULL, output_kind
-- 'full-assembly' row once server-side concatenation exists.
BEGIN;

ALTER TABLE generated_videos ADD COLUMN scene_id uuid REFERENCES presenter_scenes(id) ON DELETE CASCADE;

COMMIT;
