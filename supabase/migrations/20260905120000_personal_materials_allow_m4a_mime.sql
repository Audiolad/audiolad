BEGIN;

-- M4A uploads send Content-Type audio/mp4. Append only; keep every existing MIME.
-- Do not overwrite allowed_mime_types with a hardcoded list.
-- Do not clear the MIME allowlist (that would unrestrict the bucket).
UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'audio/mp4')
WHERE id = 'personal-materials'
  AND allowed_mime_types IS NOT NULL
  AND NOT ('audio/mp4' = ANY(allowed_mime_types));

COMMIT;
