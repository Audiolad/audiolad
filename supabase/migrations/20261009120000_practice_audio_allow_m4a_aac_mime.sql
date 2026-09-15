BEGIN;

-- Append M4A/AAC source MIME types for private practice-audio.
-- Keep existing entries (audio/mpeg). Do not overwrite the array.
-- Do not change public, file_size_limit, or RLS.
-- application/octet-stream is intentionally NOT added: signed uploads use
-- canonical MIME per source format (audio/mpeg|audio/mp4|audio/aac).

UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'audio/mp4')
WHERE id = 'practice-audio'
  AND allowed_mime_types IS NOT NULL
  AND NOT ('audio/mp4' = ANY(allowed_mime_types));

UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'audio/x-m4a')
WHERE id = 'practice-audio'
  AND allowed_mime_types IS NOT NULL
  AND NOT ('audio/x-m4a' = ANY(allowed_mime_types));

UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'audio/m4a')
WHERE id = 'practice-audio'
  AND allowed_mime_types IS NOT NULL
  AND NOT ('audio/m4a' = ANY(allowed_mime_types));

UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'audio/aac')
WHERE id = 'practice-audio'
  AND allowed_mime_types IS NOT NULL
  AND NOT ('audio/aac' = ANY(allowed_mime_types));

UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'audio/x-aac')
WHERE id = 'practice-audio'
  AND allowed_mime_types IS NOT NULL
  AND NOT ('audio/x-aac' = ANY(allowed_mime_types));

COMMIT;
