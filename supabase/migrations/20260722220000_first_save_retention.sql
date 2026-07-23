BEGIN;

-- ---------------------------------------------------------------------------
-- First-save retention: profile state + atomic gate in claim_free_practice
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_save_retention_seen_at timestamptz NULL;

COMMENT ON COLUMN public.profiles.first_save_retention_seen_at IS
  'When the first manual library-save retention card was shown (server gate; one row per user).';

-- ---------------------------------------------------------------------------
-- Platform analytics allowlist — first-save retention events
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_platform_analytics_event(p_event_name text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(COALESCE(p_event_name, '')) IN (
    'page_view',
    'practice_view',
    'listen_page_view',
    'audio_play_started',
    'audio_progress_25',
    'audio_progress_50',
    'audio_progress_75',
    'audio_progress_90',
    'audio_completed',
    'signup_started',
    'signup_completed',
    'author_application_started',
    'author_application_submitted',
    'first_manual_library_save',
    'first_save_retention_prompt_shown',
    'first_save_retention_prompt_library_clicked',
    'first_save_retention_prompt_dismissed'
  );
$$;

-- ---------------------------------------------------------------------------
-- claim_free_practice — add atomic first-save retention gate
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_free_practice(p_practice_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_practice public.practices%ROWTYPE;
  v_inserted_count integer;
  v_access_source text;
  v_retention_profile_id uuid;
  v_show_first_save_prompt boolean := false;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF p_practice_slug IS NULL OR btrim(p_practice_slug) = '' THEN
    RAISE EXCEPTION 'practice_slug_required'
      USING ERRCODE = '22023';
  END IF;

  SELECT p.*
  INTO v_practice
  FROM public.practices AS p
  WHERE p.slug = btrim(p_practice_slug);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'practice_not_published'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.is_catalog_listed IS NOT TRUE THEN
    RAISE EXCEPTION 'practice_not_listed'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.is_free IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'practice_not_free'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.price IS NOT NULL AND v_practice.price > 0 THEN
    RAISE EXCEPTION 'practice_not_free'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.user_practices (user_id, practice_id, access_source)
  VALUES (v_user_id, v_practice.id, 'free_claim')
  ON CONFLICT (user_id, practice_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  IF v_inserted_count = 1 THEN
    UPDATE public.profiles AS pr
    SET first_save_retention_seen_at = now()
    WHERE pr.id = v_user_id
      AND pr.first_save_retention_seen_at IS NULL
    RETURNING pr.id INTO v_retention_profile_id;

    IF v_retention_profile_id IS NOT NULL THEN
      v_show_first_save_prompt := true;

      INSERT INTO public.analytics_events (
        event_name,
        practice_id,
        user_id,
        payload
      )
      VALUES (
        'first_manual_library_save',
        v_practice.id,
        v_user_id,
        '{}'::jsonb
      );
    END IF;
  END IF;

  SELECT up.access_source
  INTO v_access_source
  FROM public.user_practices AS up
  WHERE up.user_id = v_user_id
    AND up.practice_id = v_practice.id
    AND (up.expires_at IS NULL OR up.expires_at > now());

  IF v_access_source IS NULL THEN
    RAISE EXCEPTION 'library_row_missing'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'practice_id', v_practice.id,
    'practice_slug', v_practice.slug,
    'inserted', v_inserted_count = 1,
    'access_source', v_access_source,
    'in_library', true,
    'show_first_save_prompt', v_show_first_save_prompt
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_free_practice(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_free_practice(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_free_practice(text) TO authenticated;

COMMENT ON FUNCTION public.claim_free_practice(text) IS
  'audiolad:library-claim:v2; grants free_claim for published catalog-listed free zero-price practices; idempotent; atomic first-save retention gate via profiles.first_save_retention_seen_at';

-- ---------------------------------------------------------------------------
-- Post-checks
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regprocedure('public.claim_free_practice(text)') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: claim_free_practice was not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'first_save_retention_seen_at'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: profiles.first_save_retention_seen_at missing';
  END IF;

  IF public.is_platform_analytics_event('first_manual_library_save') IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: first_manual_library_save not allowlisted';
  END IF;

  IF public.is_platform_analytics_event('first_save_retention_prompt_shown') IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: first_save_retention_prompt_shown not allowlisted';
  END IF;
END;
$$;

COMMIT;
