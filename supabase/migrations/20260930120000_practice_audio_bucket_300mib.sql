BEGIN;

-- Raise practice-audio object size limit to at least 300 MiB so the author
-- cabinet can accept a single MP3 via signed upload. Keep the bucket private
-- and do not widen allowed_mime_types: the browser sends audio/mpeg.

UPDATE storage.buckets
SET file_size_limit = GREATEST(COALESCE(file_size_limit, 0), 314572800)
WHERE id = 'practice-audio'
  AND public IS NOT TRUE;

COMMIT;
