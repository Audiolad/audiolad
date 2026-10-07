-- Fix product_video_* path CHECK regexes.
-- Migration 20261220125000 used '\\.' inside ordinary string literals.
-- With standard_conforming_strings=on that stores two backslashes, so the
-- regex requires a literal '\' before the extension and rejects real
-- ".../<uuid>.webp" / ".../<uuid>.mp4" paths written by the app.
-- Symptom: Storage upload 200, then product_video_cover_update_error /
-- product_video_assets_landscape_path_check → HTTP 500.
-- Use [.] so no escape gymnastics are needed.

ALTER TABLE public.product_video_assets
  DROP CONSTRAINT IF EXISTS product_video_assets_landscape_path_check,
  DROP CONSTRAINT IF EXISTS product_video_assets_portrait_path_check;

ALTER TABLE public.product_video_assets
  ADD CONSTRAINT product_video_assets_landscape_path_check
    CHECK (
      landscape_cover_path IS NULL
      OR landscape_cover_path ~*
        '^practices/[0-9a-f-]{36}/video-covers/landscape_16_9/[0-9a-f-]{36}[.]webp$'
    ),
  ADD CONSTRAINT product_video_assets_portrait_path_check
    CHECK (
      portrait_cover_path IS NULL
      OR portrait_cover_path ~*
        '^practices/[0-9a-f-]{36}/video-covers/portrait_9_16/[0-9a-f-]{36}[.]webp$'
    );

ALTER TABLE public.product_video_render_jobs
  DROP CONSTRAINT IF EXISTS product_video_render_jobs_output_path_check;

ALTER TABLE public.product_video_render_jobs
  ADD CONSTRAINT product_video_render_jobs_output_path_check
    CHECK (
      output_storage_path ~*
        '^practices/[0-9a-f-]{36}/video/[0-9a-f-]{36}/(landscape_16_9|portrait_9_16)/[0-9a-f-]{36}[.]mp4$'
    );
