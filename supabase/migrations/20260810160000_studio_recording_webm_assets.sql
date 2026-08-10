BEGIN;

-- Chrome Studio recordings use audio/webm;codecs=opus. The API stores the
-- normalized base MIME type, so Storage only needs audio/webm.
UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'audio/webm')
WHERE id = 'studio-draft-assets'
  AND NOT ('audio/webm' = ANY(allowed_mime_types));

COMMIT;
