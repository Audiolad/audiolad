BEGIN;

-- ---------------------------------------------------------------------------
-- Catalog foundation (Phase 1): library_saves + audio_items preview window
--
-- library_saves = bookmark into Аудиотека. Save ≠ listen entitlement.
-- Does not add access_source=saved, claim, or purchase changes.
-- preview_*_ms prepare a 30–90s window on existing audio_items.is_preview.
-- Existing rows stay valid: both preview columns default to NULL.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. library_saves
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.library_saves (
  user_id uuid NOT NULL
    REFERENCES auth.users (id)
    ON DELETE CASCADE,
  practice_id uuid NOT NULL
    REFERENCES public.practices (id)
    ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT library_saves_user_practice_unique
    UNIQUE (user_id, practice_id)
);

CREATE INDEX IF NOT EXISTS library_saves_user_id_created_at_idx
  ON public.library_saves (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS library_saves_practice_id_idx
  ON public.library_saves (practice_id);

COMMENT ON TABLE public.library_saves IS
  'User bookmark of a catalog product into Аудиотека. Save is not listen entitlement; purchase remains the access grant.';

COMMENT ON COLUMN public.library_saves.user_id IS
  'Owner of the save. RLS: a user may only see and mutate their own rows.';

COMMENT ON COLUMN public.library_saves.practice_id IS
  'Saved product. Does not grant playback rights.';

ALTER TABLE public.library_saves ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.library_saves FROM PUBLIC;
REVOKE ALL ON TABLE public.library_saves FROM anon;
REVOKE ALL ON TABLE public.library_saves FROM authenticated;

GRANT SELECT, INSERT, DELETE ON TABLE public.library_saves TO authenticated;
GRANT ALL ON TABLE public.library_saves TO service_role;

DROP POLICY IF EXISTS "Users can view own library saves" ON public.library_saves;
CREATE POLICY "Users can view own library saves"
  ON public.library_saves
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own library saves" ON public.library_saves;
CREATE POLICY "Users can insert own library saves"
  ON public.library_saves
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own library saves" ON public.library_saves;
CREATE POLICY "Users can delete own library saves"
  ON public.library_saves
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. audio_items preview window (milliseconds)
-- ---------------------------------------------------------------------------

ALTER TABLE public.audio_items
  ADD COLUMN IF NOT EXISTS preview_start_ms integer,
  ADD COLUMN IF NOT EXISTS preview_end_ms integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audio_items_preview_window_check'
      AND conrelid = 'public.audio_items'::regclass
  ) THEN
    ALTER TABLE public.audio_items
      ADD CONSTRAINT audio_items_preview_window_check
      CHECK (
        (preview_start_ms IS NULL AND preview_end_ms IS NULL)
        OR (
          preview_start_ms IS NOT NULL
          AND preview_end_ms IS NOT NULL
          AND preview_start_ms >= 0
          AND preview_end_ms > preview_start_ms
          AND (preview_end_ms - preview_start_ms) BETWEEN 30000 AND 90000
        )
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.audio_items.preview_start_ms IS
  'Optional preview window start in integer milliseconds. NULL with preview_end_ms NULL means no window yet.';

COMMENT ON COLUMN public.audio_items.preview_end_ms IS
  'Optional preview window end in integer milliseconds. When both ends are set, duration must be 30–90 seconds.';

COMMIT;
