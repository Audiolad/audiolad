-- Render recipe of a completed author MP4 export.
-- The worker writes the recipe it rendered with when it completes a job
-- (e.g. 'cover-audio-indicator-v1' = cover + bottom-right «это аудио» indicator).
-- Jobs completed before this column existed keep NULL: the author cabinet shows
-- them as «Нужно пересоздать» instead of presenting the old MP4 as current.
-- Additive and nullable: no backfill, no re-render, no change to claim, lease,
-- progress, or stale-recovery functions. Old output files stay in storage.

ALTER TABLE public.product_video_render_jobs
  ADD COLUMN IF NOT EXISTS render_recipe text NULL;

ALTER TABLE public.product_video_render_jobs
  DROP CONSTRAINT IF EXISTS product_video_render_jobs_render_recipe_check;

ALTER TABLE public.product_video_render_jobs
  ADD CONSTRAINT product_video_render_jobs_render_recipe_check
  CHECK (render_recipe IS NULL OR render_recipe ~ '^[a-z0-9][a-z0-9-]{0,63}$');

COMMENT ON COLUMN public.product_video_render_jobs.render_recipe IS
  'Render recipe the worker used for this completed MP4. NULL = rendered before recipes were tracked (no audio indicator).';
