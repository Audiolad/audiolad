-- Member-private onboarding collapse timestamps.
-- Stores only epoch completion / hide moments. Presentation is derived, never persisted.
-- DO NOT apply to production without explicit approval.

BEGIN;

CREATE TABLE IF NOT EXISTS public.author_onboarding_ui_state (
  author_id uuid PRIMARY KEY
    REFERENCES public.authors (id) ON DELETE CASCADE,
  free_completed_at timestamptz NULL,
  free_hidden_at timestamptz NULL,
  commercial_completed_at timestamptz NULL,
  commercial_hidden_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.author_onboarding_ui_state IS
  'Per-author onboarding checklist UI epochs. completed_at is first 100% of the current epoch; hidden_at is «Скрыть сейчас». No show/expand preference.';

COMMENT ON COLUMN public.author_onboarding_ui_state.free_completed_at IS
  'Server now() of the first GET that saw free.complete in this epoch. Never overwritten while complete.';

COMMENT ON COLUMN public.author_onboarding_ui_state.free_hidden_at IS
  'Server now() when the author hid the completed free checklist. Cleared when free becomes incomplete.';

COMMENT ON COLUMN public.author_onboarding_ui_state.commercial_completed_at IS
  'Server now() of the first GET that saw commercial.complete in this epoch. Never overwritten while complete.';

COMMENT ON COLUMN public.author_onboarding_ui_state.commercial_hidden_at IS
  'Server now() when the author hid the completed commercial checklist. Cleared when commercial becomes incomplete.';

CREATE OR REPLACE FUNCTION public.set_author_onboarding_ui_state_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS author_onboarding_ui_state_set_updated_at
  ON public.author_onboarding_ui_state;
CREATE TRIGGER author_onboarding_ui_state_set_updated_at
  BEFORE UPDATE ON public.author_onboarding_ui_state
  FOR EACH ROW
  EXECUTE FUNCTION public.set_author_onboarding_ui_state_updated_at();

ALTER TABLE public.author_onboarding_ui_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.author_onboarding_ui_state FROM PUBLIC;
REVOKE ALL ON TABLE public.author_onboarding_ui_state FROM anon;
REVOKE ALL ON TABLE public.author_onboarding_ui_state FROM authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.author_onboarding_ui_state TO authenticated;
GRANT ALL ON TABLE public.author_onboarding_ui_state TO service_role;

DROP POLICY IF EXISTS "Author members can read onboarding ui state"
  ON public.author_onboarding_ui_state;
CREATE POLICY "Author members can read onboarding ui state"
  ON public.author_onboarding_ui_state
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = author_onboarding_ui_state.author_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS "Author members can insert onboarding ui state"
  ON public.author_onboarding_ui_state;
CREATE POLICY "Author members can insert onboarding ui state"
  ON public.author_onboarding_ui_state
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = author_onboarding_ui_state.author_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS "Author members can update onboarding ui state"
  ON public.author_onboarding_ui_state;
CREATE POLICY "Author members can update onboarding ui state"
  ON public.author_onboarding_ui_state
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = author_onboarding_ui_state.author_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.author_members AS am
      WHERE am.author_id = author_onboarding_ui_state.author_id
        AND am.user_id = auth.uid()
        AND am.role IN ('owner', 'editor')
    )
  );

-- Stamp / clear epochs with Postgres now(). Service role only: Next.js APIs
-- authorize via requireAuthorMembership, then write through service role.
CREATE OR REPLACE FUNCTION public.sync_author_onboarding_ui_completion(
  p_author_id uuid,
  p_free_complete boolean,
  p_commercial_complete boolean
)
RETURNS public.author_onboarding_ui_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.author_onboarding_ui_state;
BEGIN
  IF p_author_id IS NULL THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.author_onboarding_ui_state (author_id)
  VALUES (p_author_id)
  ON CONFLICT (author_id) DO NOTHING;

  UPDATE public.author_onboarding_ui_state
  SET
    free_completed_at = CASE
      WHEN p_free_complete THEN COALESCE(free_completed_at, now())
      ELSE NULL
    END,
    free_hidden_at = CASE
      WHEN p_free_complete THEN free_hidden_at
      ELSE NULL
    END,
    commercial_completed_at = CASE
      WHEN p_commercial_complete THEN COALESCE(commercial_completed_at, now())
      ELSE NULL
    END,
    commercial_hidden_at = CASE
      WHEN p_commercial_complete THEN commercial_hidden_at
      ELSE NULL
    END
  WHERE author_id = p_author_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.hide_author_onboarding_checklist(
  p_author_id uuid,
  p_checklist text
)
RETURNS public.author_onboarding_ui_state
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.author_onboarding_ui_state;
BEGIN
  IF p_author_id IS NULL OR p_checklist NOT IN ('free', 'commercial') THEN
    RAISE EXCEPTION 'invalid_request' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.author_onboarding_ui_state (author_id)
  VALUES (p_author_id)
  ON CONFLICT (author_id) DO NOTHING;

  UPDATE public.author_onboarding_ui_state
  SET
    free_hidden_at = CASE
      WHEN p_checklist = 'free' THEN COALESCE(free_hidden_at, now())
      ELSE free_hidden_at
    END,
    commercial_hidden_at = CASE
      WHEN p_checklist = 'commercial' THEN COALESCE(commercial_hidden_at, now())
      ELSE commercial_hidden_at
    END
  WHERE author_id = p_author_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_author_onboarding_ui_completion(uuid, boolean, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_author_onboarding_ui_completion(uuid, boolean, boolean)
  TO service_role;

REVOKE ALL ON FUNCTION public.hide_author_onboarding_checklist(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hide_author_onboarding_checklist(uuid, text)
  TO service_role;

COMMIT;
