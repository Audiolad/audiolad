BEGIN;

CREATE TABLE IF NOT EXISTS public.practice_audio_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE CASCADE,
  practice_id uuid NOT NULL
    REFERENCES public.practices (id) ON DELETE CASCADE,
  audio_item_id uuid NOT NULL
    REFERENCES public.audio_items (id) ON DELETE CASCADE,
  position_seconds integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT practice_audio_progress_position_non_negative_check
    CHECK (position_seconds >= 0),

  CONSTRAINT practice_audio_progress_user_practice_audio_unique
    UNIQUE (user_id, practice_id, audio_item_id)
);

CREATE INDEX IF NOT EXISTS practice_audio_progress_user_practice_idx
  ON public.practice_audio_progress (user_id, practice_id);

CREATE INDEX IF NOT EXISTS practice_audio_progress_audio_item_idx
  ON public.practice_audio_progress (audio_item_id);

COMMENT ON TABLE public.practice_audio_progress IS
  'Per-user listening progress for audio items inside a practice.';

ALTER TABLE public.practice_audio_progress ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'practice_audio_progress'
      AND policyname = 'Users manage own practice audio progress'
  ) THEN
    CREATE POLICY "Users manage own practice audio progress"
      ON public.practice_audio_progress
      FOR ALL
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END;
$$;

REVOKE ALL ON TABLE public.practice_audio_progress FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.practice_audio_progress TO authenticated;
GRANT ALL ON TABLE public.practice_audio_progress TO service_role;

COMMIT;
