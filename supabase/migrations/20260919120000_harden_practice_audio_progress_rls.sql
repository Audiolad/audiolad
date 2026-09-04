BEGIN;

-- Additive security hardening for practice_audio_progress.
-- Does not delete user progress rows. Does not add rating / listen-stats columns.
-- position_seconds remains the resume cursor only.

DROP POLICY IF EXISTS "Users manage own practice audio progress"
  ON public.practice_audio_progress;

DROP POLICY IF EXISTS "Users select own practice audio progress"
  ON public.practice_audio_progress;

CREATE POLICY "Users select own practice audio progress"
  ON public.practice_audio_progress
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.practice_audio_progress FROM PUBLIC;
REVOKE ALL ON TABLE public.practice_audio_progress FROM anon;
REVOKE ALL ON TABLE public.practice_audio_progress FROM authenticated;
GRANT SELECT ON TABLE public.practice_audio_progress TO authenticated;
GRANT ALL ON TABLE public.practice_audio_progress TO service_role;

COMMENT ON TABLE public.practice_audio_progress IS
  'Per-user listening resume cursor for audio items inside a practice. position_seconds is resume-only. Authenticated SELECT own rows; INSERT/UPDATE/DELETE only via trusted server/service_role after listen access checks.';

COMMIT;
