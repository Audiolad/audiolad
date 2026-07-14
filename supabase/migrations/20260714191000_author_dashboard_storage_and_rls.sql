-- Author dashboard: nullable audio paths for drafts, author RLS, cover bucket, storage writes.
-- Idempotent. No transaction wrapper (managed externally).

-- Draft audio items may exist before MP3 upload.
ALTER TABLE public.audio_items
  ALTER COLUMN audio_path DROP NOT NULL;

-- ---------------------------------------------------------------------------
-- practices: author member access
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'practices'
      AND policyname = 'Author members can read author practices'
  ) THEN
    CREATE POLICY "Author members can read author practices"
      ON public.practices
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.author_members AS am
          WHERE am.author_id = practices.author_id
            AND am.user_id = auth.uid()
            AND am.role IN ('owner', 'editor')
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'practices'
      AND policyname = 'Author members can insert practices'
  ) THEN
    CREATE POLICY "Author members can insert practices"
      ON public.practices
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.author_members AS am
          WHERE am.author_id = practices.author_id
            AND am.user_id = auth.uid()
            AND am.role IN ('owner', 'editor')
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'practices'
      AND policyname = 'Author members can update practices'
  ) THEN
    CREATE POLICY "Author members can update practices"
      ON public.practices
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.author_members AS am
          WHERE am.author_id = practices.author_id
            AND am.user_id = auth.uid()
            AND am.role IN ('owner', 'editor')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.author_members AS am
          WHERE am.author_id = practices.author_id
            AND am.user_id = auth.uid()
            AND am.role IN ('owner', 'editor')
        )
      );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- practice-covers bucket (public read for published covers)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
SELECT
  'practice-covers',
  'practice-covers',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
WHERE NOT EXISTS (
  SELECT 1
  FROM storage.buckets
  WHERE id = 'practice-covers'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public can read practice covers'
  ) THEN
    CREATE POLICY "Public can read practice covers"
      ON storage.objects
      FOR SELECT
      TO anon, authenticated
      USING (bucket_id = 'practice-covers');
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Author members can upload practice covers'
  ) THEN
    CREATE POLICY "Author members can upload practice covers"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'practice-covers'
        AND split_part(name, '/', 1) = 'practices'
        AND split_part(name, '/', 2) <> ''
        AND EXISTS (
          SELECT 1
          FROM public.practices AS pr
          INNER JOIN public.author_members AS am
            ON am.author_id = pr.author_id
          WHERE pr.id::text = split_part(name, '/', 2)
            AND am.user_id = auth.uid()
            AND am.role IN ('owner', 'editor')
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Author members can update practice covers'
  ) THEN
    CREATE POLICY "Author members can update practice covers"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'practice-covers'
        AND split_part(name, '/', 1) = 'practices'
        AND split_part(name, '/', 2) <> ''
        AND EXISTS (
          SELECT 1
          FROM public.practices AS pr
          INNER JOIN public.author_members AS am
            ON am.author_id = pr.author_id
          WHERE pr.id::text = split_part(name, '/', 2)
            AND am.user_id = auth.uid()
            AND am.role IN ('owner', 'editor')
        )
      )
      WITH CHECK (
        bucket_id = 'practice-covers'
        AND split_part(name, '/', 1) = 'practices'
        AND split_part(name, '/', 2) <> ''
        AND EXISTS (
          SELECT 1
          FROM public.practices AS pr
          INNER JOIN public.author_members AS am
            ON am.author_id = pr.author_id
          WHERE pr.id::text = split_part(name, '/', 2)
            AND am.user_id = auth.uid()
            AND am.role IN ('owner', 'editor')
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Author members can delete practice covers'
  ) THEN
    CREATE POLICY "Author members can delete practice covers"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'practice-covers'
        AND split_part(name, '/', 1) = 'practices'
        AND split_part(name, '/', 2) <> ''
        AND EXISTS (
          SELECT 1
          FROM public.practices AS pr
          INNER JOIN public.author_members AS am
            ON am.author_id = pr.author_id
          WHERE pr.id::text = split_part(name, '/', 2)
            AND am.user_id = auth.uid()
            AND am.role IN ('owner', 'editor')
        )
      );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- practice-audio: author member write access (legacy + audio item paths)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Author members can upload practice audio'
  ) THEN
    CREATE POLICY "Author members can upload practice audio"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'practice-audio'
        AND split_part(name, '/', 1) = 'practices'
        AND split_part(name, '/', 2) <> ''
        AND split_part(name, '/', 3) <> ''
        AND EXISTS (
          SELECT 1
          FROM public.practices AS pr
          INNER JOIN public.author_members AS am
            ON am.author_id = pr.author_id
          WHERE pr.id::text = split_part(name, '/', 2)
            AND am.user_id = auth.uid()
            AND am.role IN ('owner', 'editor')
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Author members can update practice audio'
  ) THEN
    CREATE POLICY "Author members can update practice audio"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'practice-audio'
        AND split_part(name, '/', 1) = 'practices'
        AND split_part(name, '/', 2) <> ''
        AND split_part(name, '/', 3) <> ''
        AND EXISTS (
          SELECT 1
          FROM public.practices AS pr
          INNER JOIN public.author_members AS am
            ON am.author_id = pr.author_id
          WHERE pr.id::text = split_part(name, '/', 2)
            AND am.user_id = auth.uid()
            AND am.role IN ('owner', 'editor')
        )
      )
      WITH CHECK (
        bucket_id = 'practice-audio'
        AND split_part(name, '/', 1) = 'practices'
        AND split_part(name, '/', 2) <> ''
        AND split_part(name, '/', 3) <> ''
        AND EXISTS (
          SELECT 1
          FROM public.practices AS pr
          INNER JOIN public.author_members AS am
            ON am.author_id = pr.author_id
          WHERE pr.id::text = split_part(name, '/', 2)
            AND am.user_id = auth.uid()
            AND am.role IN ('owner', 'editor')
        )
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Author members can delete practice audio'
  ) THEN
    CREATE POLICY "Author members can delete practice audio"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'practice-audio'
        AND split_part(name, '/', 1) = 'practices'
        AND split_part(name, '/', 2) <> ''
        AND split_part(name, '/', 3) <> ''
        AND EXISTS (
          SELECT 1
          FROM public.practices AS pr
          INNER JOIN public.author_members AS am
            ON am.author_id = pr.author_id
          WHERE pr.id::text = split_part(name, '/', 2)
            AND am.user_id = auth.uid()
            AND am.role IN ('owner', 'editor')
        )
      );
  END IF;
END;
$$;
