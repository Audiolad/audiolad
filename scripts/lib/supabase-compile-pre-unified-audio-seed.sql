-- Disposable CI data fixture for 20260714180000_unified_audio_product_foundation.
-- Restores the historical production data state missing from migration history:
-- its earlier seed creates first-audio-course with a NULL URL and price 990,
-- while this migration's own post-check requires the legacy URL and price 99.
-- This establishes that strict precondition without skipping the migration or
-- modifying production data.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.practices
    WHERE id = 'a8f4c2e1-9b3d-4f6a-8c7e-1d2f3a4b5c6d'
      AND slug = 'first-audio-course'
      AND audio_url IS NULL
      AND price = 990
      AND status = 'published'
      AND is_free = false
  ) THEN
    RAISE EXCEPTION 'expected first-audio-course legacy precondition is absent';
  END IF;
END
$$;

UPDATE public.practices
SET
  audio_url = 'practices/a8f4c2e1-9b3d-4f6a-8c7e-1d2f3a4b5c6d/audio.mp3',
  price = 99
WHERE id = 'a8f4c2e1-9b3d-4f6a-8c7e-1d2f3a4b5c6d';
