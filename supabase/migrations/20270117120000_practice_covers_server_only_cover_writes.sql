-- practice-covers: product and track cover objects are written only by the
-- server (service_role) through the author cover routes, which enforce the
-- cover profile (1:1). The authenticated role keeps write access only to the
-- publication gallery prefix (practices/{id}/gallery/...), which is still
-- written by the gallery routes with the user-scoped client.
--
-- Public read ("Public can read practice covers") is unchanged.
-- Idempotent: safe to apply more than once.
-- Rollback: docs/security/practice-covers-storage-write-policies.md

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RAISE NOTICE 'storage.objects not found; skipping practice-covers policy update';
    RETURN;
  END IF;

  -- Broad author write policies from 20260714191000 (any path under
  -- practices/{id}/, including product and track covers).
  EXECUTE 'DROP POLICY IF EXISTS "Author members can upload practice covers" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Author members can update practice covers" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Author members can delete practice covers" ON storage.objects';

  -- Re-create narrowed policies (drop first so re-runs are clean).
  EXECUTE 'DROP POLICY IF EXISTS "Author members can upload practice gallery images" ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS "Author members can delete practice gallery images" ON storage.objects';

  EXECUTE $policy$
    CREATE POLICY "Author members can upload practice gallery images"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'practice-covers'
        AND split_part(name, '/', 1) = 'practices'
        AND split_part(name, '/', 2) <> ''
        AND split_part(name, '/', 3) = 'gallery'
        AND split_part(name, '/', 4) <> ''
        AND position('..' in name) = 0
        AND EXISTS (
          SELECT 1
          FROM public.practices pr
          JOIN public.author_members am ON am.author_id = pr.author_id
          WHERE pr.id::text = split_part(name, '/', 2)
            AND am.user_id = auth.uid()
            AND am.role IN ('owner', 'editor')
        )
      )
  $policy$;

  EXECUTE $policy$
    CREATE POLICY "Author members can delete practice gallery images"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'practice-covers'
        AND split_part(name, '/', 1) = 'practices'
        AND split_part(name, '/', 2) <> ''
        AND split_part(name, '/', 3) = 'gallery'
        AND split_part(name, '/', 4) <> ''
        AND EXISTS (
          SELECT 1
          FROM public.practices pr
          JOIN public.author_members am ON am.author_id = pr.author_id
          WHERE pr.id::text = split_part(name, '/', 2)
            AND am.user_id = auth.uid()
            AND am.role IN ('owner', 'editor')
        )
      )
  $policy$;
END;
$$;
