BEGIN;

-- ---------------------------------------------------------------------------
-- User playlists (PR1: schema + RLS only)
--
-- Product model: playlist_items.practice_id references a whole audio product.
-- Playlists never grant entitlement; access stays in user_practices / free rules.
-- Visibility:
--   private — owner only
--   public  — readable by anon + authenticated (publish rules enforced later
--             in API/RPC: free + published + catalog-listed only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.playlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL
    REFERENCES auth.users (id)
    ON DELETE CASCADE,

  title text NOT NULL,

  visibility text NOT NULL DEFAULT 'private',

  slug text NULL,

  published_at timestamptz NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT playlists_visibility_check
    CHECK (visibility IN ('private', 'public')),

  CONSTRAINT playlists_title_length_check
    CHECK (
      char_length(btrim(title)) >= 1
      AND char_length(title) <= 80
    ),

  -- Allowed pairs only:
  --   private + slug NULL
  --   public  + non-blank slug
  -- Rejects private+slug, public+NULL slug, public+blank slug.
  CONSTRAINT playlists_visibility_slug_consistency_check
    CHECK (
      (visibility = 'private' AND slug IS NULL)
      OR (
        visibility = 'public'
        AND slug IS NOT NULL
        AND btrim(slug) <> ''
      )
    ),

  -- Private playlists must not carry a publish timestamp.
  -- Public may keep published_at NULL until a future API/RPC sets it.
  CONSTRAINT playlists_visibility_published_at_consistency_check
    CHECK (
      (visibility = 'private' AND published_at IS NULL)
      OR visibility = 'public'
    )
);

CREATE TABLE IF NOT EXISTS public.playlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  playlist_id uuid NOT NULL
    REFERENCES public.playlists (id)
    ON DELETE CASCADE,

  practice_id uuid NOT NULL
    REFERENCES public.practices (id)
    ON DELETE CASCADE,

  position integer NOT NULL,

  added_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT playlist_items_position_positive_check
    CHECK (position >= 1),

  CONSTRAINT playlist_items_playlist_practice_unique
    UNIQUE (playlist_id, practice_id),

  CONSTRAINT playlist_items_playlist_position_unique
    UNIQUE (playlist_id, position)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- UNIQUE (playlist_id, practice_id) and UNIQUE (playlist_id, position) already
-- cover playlist_id-leading lookups / position sorts — no duplicate indexes.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS playlists_user_id_idx
  ON public.playlists (user_id);

CREATE INDEX IF NOT EXISTS playlists_public_listed_idx
  ON public.playlists (published_at DESC NULLS LAST, created_at DESC)
  WHERE visibility = 'public';

CREATE UNIQUE INDEX IF NOT EXISTS playlists_slug_unique_idx
  ON public.playlists (slug)
  WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS playlist_items_practice_id_idx
  ON public.playlist_items (practice_id);

COMMENT ON TABLE public.playlists IS
  'User-owned audio product playlists. visibility=private|public. Does not grant practice access.';

COMMENT ON COLUMN public.playlists.visibility IS
  'private: owner-only. public: readable by anon/authenticated. Publish eligibility enforced in API/RPC, not by RLS.';

COMMENT ON COLUMN public.playlists.slug IS
  'NULL iff visibility=private. Non-blank and unique when visibility=public (/p/[slug]). No auto-generation in PR1.';

COMMENT ON COLUMN public.playlists.published_at IS
  'NULL when private. For public may stay NULL until server publish sets it; private+published_at is forbidden.';

COMMENT ON TABLE public.playlist_items IS
  'Ordered practice products inside a playlist. One row = one practices.id (not audio_item_id).';

COMMENT ON COLUMN public.playlist_items.practice_id IS
  'Whole audio product. Programs with multiple audio_items remain a single playlist item.';

COMMENT ON COLUMN public.playlist_items.position IS
  '1-based integer order. Compatible with up/down buttons, DnD, two-phase updates, future reorder RPC.';

-- MVP limits (enforced in future API/RPC, not fragile DB triggers):
--   max 50 playlists per user
--   max 100 items per playlist
--   title length 1..80 (enforced above)

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

REVOKE ALL ON TABLE public.playlists FROM PUBLIC;
REVOKE ALL ON TABLE public.playlist_items FROM PUBLIC;

GRANT SELECT ON TABLE public.playlists TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.playlists TO authenticated;
GRANT ALL ON TABLE public.playlists TO service_role;

GRANT SELECT ON TABLE public.playlist_items TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.playlist_items TO authenticated;
GRANT ALL ON TABLE public.playlist_items TO service_role;

-- ---------------------------------------------------------------------------
-- RLS: playlists
-- ---------------------------------------------------------------------------

ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'playlists'
      AND policyname = 'Owners can select own playlists'
  ) THEN
    CREATE POLICY "Owners can select own playlists"
      ON public.playlists
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'playlists'
      AND policyname = 'Anyone can select public playlists'
  ) THEN
    CREATE POLICY "Anyone can select public playlists"
      ON public.playlists
      FOR SELECT
      TO anon, authenticated
      USING (visibility = 'public');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'playlists'
      AND policyname = 'Owners can insert own playlists'
  ) THEN
    CREATE POLICY "Owners can insert own playlists"
      ON public.playlists
      FOR INSERT
      TO authenticated
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'playlists'
      AND policyname = 'Owners can update own playlists'
  ) THEN
    CREATE POLICY "Owners can update own playlists"
      ON public.playlists
      FOR UPDATE
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'playlists'
      AND policyname = 'Owners can delete own playlists'
  ) THEN
    CREATE POLICY "Owners can delete own playlists"
      ON public.playlists
      FOR DELETE
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS: playlist_items
-- Ownership via parent playlists. Public SELECT when parent is public.
-- Entitlement / publish eligibility are NOT enforced here.
-- ---------------------------------------------------------------------------

ALTER TABLE public.playlist_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'playlist_items'
      AND policyname = 'Owners can select own playlist items'
  ) THEN
    CREATE POLICY "Owners can select own playlist items"
      ON public.playlist_items
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.playlists AS p
          WHERE p.id = playlist_items.playlist_id
            AND p.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'playlist_items'
      AND policyname = 'Anyone can select public playlist items'
  ) THEN
    CREATE POLICY "Anyone can select public playlist items"
      ON public.playlist_items
      FOR SELECT
      TO anon, authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.playlists AS p
          WHERE p.id = playlist_items.playlist_id
            AND p.visibility = 'public'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'playlist_items'
      AND policyname = 'Owners can insert own playlist items'
  ) THEN
    CREATE POLICY "Owners can insert own playlist items"
      ON public.playlist_items
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.playlists AS p
          WHERE p.id = playlist_items.playlist_id
            AND p.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'playlist_items'
      AND policyname = 'Owners can update own playlist items'
  ) THEN
    CREATE POLICY "Owners can update own playlist items"
      ON public.playlist_items
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.playlists AS p
          WHERE p.id = playlist_items.playlist_id
            AND p.user_id = auth.uid()
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.playlists AS p
          WHERE p.id = playlist_items.playlist_id
            AND p.user_id = auth.uid()
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'playlist_items'
      AND policyname = 'Owners can delete own playlist items'
  ) THEN
    CREATE POLICY "Owners can delete own playlist items"
      ON public.playlist_items
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.playlists AS p
          WHERE p.id = playlist_items.playlist_id
            AND p.user_id = auth.uid()
        )
      );
  END IF;
END;
$$;

COMMIT;
