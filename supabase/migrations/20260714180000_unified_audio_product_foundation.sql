BEGIN;

-- ---------------------------------------------------------------------------
-- Unified audio product foundation (Stage 2)
--
-- Evolves public.practices as the single "Аудиопродукт" entity.
-- Adds child audio_items, author_members, practice metadata fields.
-- Backfills legacy single-file products without touching audio_url.
--
-- Idempotent where practical: IF NOT EXISTS, guarded backfill, ON CONFLICT.
-- Non-destructive: no DROP of columns/tables, no file moves.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 2.1 Extend practices
-- ---------------------------------------------------------------------------

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS subtitle text,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.practices
SET currency = 'RUB'
WHERE currency IS NULL;

UPDATE public.practices
SET updated_at = COALESCE(updated_at, created_at, now())
WHERE updated_at IS NULL;

ALTER TABLE public.practices
  ALTER COLUMN currency SET DEFAULT 'RUB',
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'practices_currency_rub_check'
      AND conrelid = 'public.practices'::regclass
  ) THEN
    ALTER TABLE public.practices
      ADD CONSTRAINT practices_currency_rub_check
      CHECK (currency = 'RUB');
  END IF;
END;
$$;

-- Use created_at for published products: preserves historical publication timing
-- without inventing a new timestamp at migration time.
UPDATE public.practices
SET published_at = created_at
WHERE status = 'published'
  AND published_at IS NULL
  AND created_at IS NOT NULL;

UPDATE public.practices
SET published_at = now()
WHERE status = 'published'
  AND published_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2.2 audio_items
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL
    REFERENCES public.practices (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  audio_path text NOT NULL,
  duration_seconds integer,
  position integer NOT NULL,
  is_preview boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'published',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT audio_items_duration_seconds_non_negative_check
    CHECK (duration_seconds IS NULL OR duration_seconds >= 0),

  CONSTRAINT audio_items_position_positive_check
    CHECK (position >= 1),

  CONSTRAINT audio_items_status_check
    CHECK (status IN ('draft', 'published', 'archived')),

  CONSTRAINT audio_items_practice_position_unique
    UNIQUE (practice_id, position)
);

CREATE INDEX IF NOT EXISTS audio_items_practice_id_idx
  ON public.audio_items (practice_id);

CREATE INDEX IF NOT EXISTS audio_items_practice_id_position_idx
  ON public.audio_items (practice_id, position);

CREATE INDEX IF NOT EXISTS audio_items_status_idx
  ON public.audio_items (status);

COMMENT ON TABLE public.audio_items IS
  'Audio materials inside a practice (unified audio product). One or many per product.';

COMMENT ON COLUMN public.audio_items.audio_path IS
  'Storage path relative to bucket practice-audio. Legacy: practices/{practice_id}/audio.mp3. New: practices/{practice_id}/audio/{audio_item_id}.mp3';

-- ---------------------------------------------------------------------------
-- 2.3 author_members
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.author_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL
    REFERENCES public.authors (id) ON DELETE CASCADE,
  user_id uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'editor',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT author_members_role_check
    CHECK (role IN ('owner', 'editor')),

  CONSTRAINT author_members_author_user_unique
    UNIQUE (author_id, user_id)
);

CREATE INDEX IF NOT EXISTS author_members_author_id_idx
  ON public.author_members (author_id);

CREATE INDEX IF NOT EXISTS author_members_user_id_idx
  ON public.author_members (user_id);

COMMENT ON TABLE public.author_members IS
  'Membership linking user accounts to author workspaces. One user may belong to many authors.';

-- ---------------------------------------------------------------------------
-- 2.4 Author workspaces
-- ---------------------------------------------------------------------------

UPDATE public.authors
SET name = 'Сергей и Зоя Петровы'
WHERE slug = 'sergey-and-zoya'
  AND name IS DISTINCT FROM 'Сергей и Зоя Петровы';

INSERT INTO public.authors (id, name, slug)
VALUES
  (
    '7f3a9c12-4b8e-4d21-9c6a-1e2f4d6b8a0c',
    'Сергей Петров',
    'sergey-petrov'
  ),
  (
    '8e4b0d23-5c9f-4e32-ad7b-2f35e7c9b1d0',
    'Зоя Петрова',
    'zoya-petrova'
  )
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2.5 Backfill audio_items from legacy practices.audio_url
-- ---------------------------------------------------------------------------

INSERT INTO public.audio_items (
  practice_id,
  title,
  audio_path,
  position,
  status,
  duration_seconds
)
SELECT
  p.id,
  p.title,
  btrim(p.audio_url),
  1,
  CASE
    WHEN p.status = 'published' THEN 'published'
    ELSE 'draft'
  END,
  CASE
    WHEN p.slug = 'first-audio-course' THEN 688
    WHEN p.duration_minutes IS NOT NULL THEN p.duration_minutes * 60
    ELSE NULL
  END
FROM public.practices AS p
WHERE p.audio_url IS NOT NULL
  AND btrim(p.audio_url) <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM public.audio_items AS ai
    WHERE ai.practice_id = p.id
  );

-- ---------------------------------------------------------------------------
-- 3. RLS: audio_items
-- ---------------------------------------------------------------------------

ALTER TABLE public.audio_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'audio_items'
      AND policyname = 'Public can read published audio item metadata'
  ) THEN
    CREATE POLICY "Public can read published audio item metadata"
      ON public.audio_items
      FOR SELECT
      TO anon, authenticated
      USING (
        status = 'published'
        AND EXISTS (
          SELECT 1
          FROM public.practices AS pr
          WHERE pr.id = audio_items.practice_id
            AND pr.status = 'published'
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
      AND tablename = 'audio_items'
      AND policyname = 'Entitled users can read audio items'
  ) THEN
    CREATE POLICY "Entitled users can read audio items"
      ON public.audio_items
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.user_practices AS up
          WHERE up.user_id = auth.uid()
            AND up.practice_id = audio_items.practice_id
            AND (
              up.expires_at IS NULL
              OR up.expires_at > now()
            )
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
      AND tablename = 'audio_items'
      AND policyname = 'Author members can read audio items'
  ) THEN
    CREATE POLICY "Author members can read audio items"
      ON public.audio_items
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.practices AS pr
          INNER JOIN public.author_members AS am
            ON am.author_id = pr.author_id
          WHERE pr.id = audio_items.practice_id
            AND am.user_id = auth.uid()
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
      AND tablename = 'audio_items'
      AND policyname = 'Author members can insert audio items'
  ) THEN
    CREATE POLICY "Author members can insert audio items"
      ON public.audio_items
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.practices AS pr
          INNER JOIN public.author_members AS am
            ON am.author_id = pr.author_id
          WHERE pr.id = audio_items.practice_id
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
      AND tablename = 'audio_items'
      AND policyname = 'Author members can update audio items'
  ) THEN
    CREATE POLICY "Author members can update audio items"
      ON public.audio_items
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.practices AS pr
          INNER JOIN public.author_members AS am
            ON am.author_id = pr.author_id
          WHERE pr.id = audio_items.practice_id
            AND am.user_id = auth.uid()
            AND am.role IN ('owner', 'editor')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.practices AS pr
          INNER JOIN public.author_members AS am
            ON am.author_id = pr.author_id
          WHERE pr.id = audio_items.practice_id
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
      AND tablename = 'audio_items'
      AND policyname = 'Author members can delete audio items'
  ) THEN
    CREATE POLICY "Author members can delete audio items"
      ON public.audio_items
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.practices AS pr
          INNER JOIN public.author_members AS am
            ON am.author_id = pr.author_id
          WHERE pr.id = audio_items.practice_id
            AND am.user_id = auth.uid()
            AND am.role IN ('owner', 'editor')
        )
      );
  END IF;
END;
$$;

REVOKE ALL ON TABLE public.audio_items FROM PUBLIC;
GRANT SELECT ON TABLE public.audio_items TO anon, authenticated;
GRANT ALL ON TABLE public.audio_items TO service_role;

-- ---------------------------------------------------------------------------
-- 3. RLS: author_members
-- ---------------------------------------------------------------------------

ALTER TABLE public.author_members ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_members'
      AND policyname = 'Users can view own author memberships'
  ) THEN
    CREATE POLICY "Users can view own author memberships"
      ON public.author_members
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END;
$$;

REVOKE ALL ON TABLE public.author_members FROM PUBLIC;
REVOKE ALL ON TABLE public.author_members FROM anon;
GRANT SELECT ON TABLE public.author_members TO authenticated;
GRANT ALL ON TABLE public.author_members TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Storage RLS compatibility (legacy + future audio item paths)
-- Existing entitled-user policy remains unchanged.
-- Add author-member read access without opening the bucket publicly.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Author members can read practice audio'
  ) THEN
    CREATE POLICY "Author members can read practice audio"
      ON storage.objects
      FOR SELECT
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
        )
      );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Post-checks
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_author_count integer;
  v_audio_item_count integer;
  v_first_audio_count integer;
BEGIN
  SELECT count(*)
  INTO v_author_count
  FROM public.authors
  WHERE slug IN ('sergey-petrov', 'zoya-petrova', 'sergey-and-zoya');

  IF v_author_count <> 3 THEN
    RAISE EXCEPTION 'Post-check failed: expected 3 author workspaces, found %', v_author_count;
  END IF;

  SELECT count(*)
  INTO v_audio_item_count
  FROM public.audio_items;

  IF v_audio_item_count < 2 THEN
    RAISE EXCEPTION 'Post-check failed: expected at least 2 backfilled audio_items, found %', v_audio_item_count;
  END IF;

  SELECT count(*)
  INTO v_first_audio_count
  FROM public.audio_items AS ai
  INNER JOIN public.practices AS p ON p.id = ai.practice_id
  WHERE p.slug = 'first-audio-course';

  IF v_first_audio_count <> 1 THEN
    RAISE EXCEPTION 'Post-check failed: first-audio-course must have exactly 1 audio_item, found %', v_first_audio_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.audio_items AS ai
    INNER JOIN public.practices AS p ON p.id = ai.practice_id
    WHERE p.slug = 'first-audio-course'
      AND ai.position = 1
      AND ai.duration_seconds = 688
      AND ai.audio_path = 'practices/a8f4c2e1-9b3d-4f6a-8c7e-1d2f3a4b5c6d/audio.mp3'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: first-audio-course audio_item backfill is incorrect';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.practices
    WHERE slug = 'first-audio-course'
      AND price = 99
      AND audio_url = 'practices/a8f4c2e1-9b3d-4f6a-8c7e-1d2f3a4b5c6d/audio.mp3'
      AND status = 'published'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: first-audio-course practice integrity check failed';
  END IF;
END;
$$;

COMMIT;
