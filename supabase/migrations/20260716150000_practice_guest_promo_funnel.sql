BEGIN;

-- ---------------------------------------------------------------------------
-- Guest promo listening on catalog practices (Telegram / MAX funnel)
-- ---------------------------------------------------------------------------

ALTER TABLE public.practices
  ADD COLUMN IF NOT EXISTS guest_access_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.practices.guest_access_enabled IS
  'When true, published practice is listenable without registration (promo link). Does not require catalog listing or is_free.';

-- ---------------------------------------------------------------------------
-- Minimal analytics events (promo funnel MVP)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  event_name text NOT NULL,

  practice_id uuid NULL
    REFERENCES public.practices (id)
    ON DELETE SET NULL,

  track_id uuid NULL,

  user_id uuid NULL
    REFERENCES auth.users (id)
    ON DELETE SET NULL,

  anonymous_session_id text NULL,

  utm_source text NULL,
  utm_medium text NULL,
  utm_campaign text NULL,
  utm_content text NULL,

  referrer text NULL,

  current_position integer NULL,
  duration integer NULL,

  payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT analytics_events_event_name_check
    CHECK (char_length(btrim(event_name)) > 0 AND char_length(event_name) <= 128),

  CONSTRAINT analytics_events_anonymous_session_id_check
    CHECK (
      anonymous_session_id IS NULL
      OR (
        char_length(btrim(anonymous_session_id)) > 0
        AND char_length(anonymous_session_id) <= 128
      )
    )
);

CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx
  ON public.analytics_events (created_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_event_name_created_at_idx
  ON public.analytics_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_practice_id_created_at_idx
  ON public.analytics_events (practice_id, created_at DESC)
  WHERE practice_id IS NOT NULL;

REVOKE ALL ON public.analytics_events FROM PUBLIC;
REVOKE ALL ON public.analytics_events FROM anon, authenticated;

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Inserts only via SECURITY DEFINER RPC (no direct client writes)

-- ---------------------------------------------------------------------------
-- claim_promo_practice — save guest promo practice to library after signup
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_promo_practice(p_practice_slug text)
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

  IF v_practice.guest_access_enabled IS NOT TRUE
     AND v_practice.is_free IS NOT TRUE THEN
    RAISE EXCEPTION 'practice_not_promo_eligible'
      USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.user_practices (user_id, practice_id, access_source, metadata)
  VALUES (
    v_user_id,
    v_practice.id,
    CASE
      WHEN v_practice.is_free IS TRUE THEN 'free_claim'
      ELSE 'gift'
    END,
    jsonb_build_object('promo_claim', true)
  )
  ON CONFLICT (user_id, practice_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

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
    'in_library', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_promo_practice(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_promo_practice(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_promo_practice(text) TO authenticated;

COMMENT ON FUNCTION public.claim_promo_practice(text) IS
  'audiolad:promo-claim:v1; grants gift/free_claim for guest_access_enabled or free published practices; idempotent; never downgrades access_source';

-- ---------------------------------------------------------------------------
-- insert_analytics_event — validated server-side event insert
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.insert_analytics_event(
  p_event_name text,
  p_practice_id uuid DEFAULT NULL,
  p_track_id uuid DEFAULT NULL,
  p_anonymous_session_id text DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL,
  p_utm_content text DEFAULT NULL,
  p_referrer text DEFAULT NULL,
  p_current_position integer DEFAULT NULL,
  p_duration integer DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_event_id uuid;
  v_allowed boolean;
BEGIN
  v_user_id := auth.uid();

  IF p_event_name IS NULL OR btrim(p_event_name) = '' THEN
    RAISE EXCEPTION 'event_name_required'
      USING ERRCODE = '22023';
  END IF;

  v_allowed := btrim(p_event_name) LIKE 'promo\_%' ESCAPE '\';

  IF v_allowed IS NOT TRUE THEN
    RAISE EXCEPTION 'event_name_not_allowed'
      USING ERRCODE = '22023';
  END IF;

  IF p_practice_id IS NOT NULL THEN
    PERFORM 1 FROM public.practices WHERE id = p_practice_id;
    IF NOT FOUND THEN
      p_practice_id := NULL;
    END IF;
  END IF;

  INSERT INTO public.analytics_events (
    event_name,
    practice_id,
    track_id,
    user_id,
    anonymous_session_id,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    referrer,
    current_position,
    duration,
    payload
  )
  VALUES (
    btrim(p_event_name),
    p_practice_id,
    p_track_id,
    v_user_id,
    NULLIF(btrim(COALESCE(p_anonymous_session_id, '')), ''),
    NULLIF(left(btrim(COALESCE(p_utm_source, '')), 128), ''),
    NULLIF(left(btrim(COALESCE(p_utm_medium, '')), 128), ''),
    NULLIF(left(btrim(COALESCE(p_utm_campaign, '')), 128), ''),
    NULLIF(left(btrim(COALESCE(p_utm_content, '')), 128), ''),
    NULLIF(left(btrim(COALESCE(p_referrer, '')), 512), ''),
    p_current_position,
    p_duration,
    COALESCE(p_payload, '{}'::jsonb)
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_analytics_event(
  text, uuid, uuid, text, text, text, text, text, text, integer, integer, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.insert_analytics_event(
  text, uuid, uuid, text, text, text, text, text, text, integer, integer, jsonb
) TO anon, authenticated;

COMMENT ON FUNCTION public.insert_analytics_event IS
  'audiolad:analytics:v1; inserts promo_* analytics events; practice_id validated when provided';

COMMIT;
