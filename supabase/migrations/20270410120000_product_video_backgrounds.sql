BEGIN;

-- Optional moving backgrounds for author product MP4 exports.
-- Covers remain independent and keep their existing meaning as static export
-- sources or HTML posters. Existing rows and render jobs remain valid.

ALTER TABLE public.product_video_assets
  ADD COLUMN IF NOT EXISTS landscape_background_path text NULL,
  ADD COLUMN IF NOT EXISTS portrait_background_path text NULL;

ALTER TABLE public.product_video_assets
  DROP CONSTRAINT IF EXISTS product_video_assets_landscape_background_path_check,
  DROP CONSTRAINT IF EXISTS product_video_assets_portrait_background_path_check;

ALTER TABLE public.product_video_assets
  ADD CONSTRAINT product_video_assets_landscape_background_path_check
    CHECK (
      landscape_background_path IS NULL
      OR landscape_background_path ~*
        '^practices/[0-9a-f-]{36}/video-backgrounds/landscape_16_9/[0-9a-f-]{36}[.](mp4|mov|webm)$'
    ),
  ADD CONSTRAINT product_video_assets_portrait_background_path_check
    CHECK (
      portrait_background_path IS NULL
      OR portrait_background_path ~*
        '^practices/[0-9a-f-]{36}/video-backgrounds/portrait_9_16/[0-9a-f-]{36}[.](mp4|mov|webm)$'
    );

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm'
]::text[]
WHERE id = 'product-video-assets';

COMMIT;
