-- Repair audio_items left in draft status on published practices
-- (legacy unpublish_audio_product v1 side effect).

BEGIN;

UPDATE public.audio_items AS ai
SET
  status = 'published',
  updated_at = now()
FROM public.practices AS p
WHERE ai.practice_id = p.id
  AND p.status = 'published'
  AND ai.status = 'draft'
  AND ai.audio_path IS NOT NULL
  AND btrim(ai.audio_path) <> '';

COMMIT;
