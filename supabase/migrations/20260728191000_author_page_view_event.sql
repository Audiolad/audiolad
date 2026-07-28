BEGIN;

-- ---------------------------------------------------------------------------
-- author_page_view: first-party public author page views
-- Adds analytics_events.author_id + allowlist + insert_platform_analytics_event
-- support. Client claim is validated: author row must exist.
-- ---------------------------------------------------------------------------

ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS author_id uuid NULL
    REFERENCES public.authors (id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS analytics_events_author_event_occurred_idx
  ON public.analytics_events (author_id, event_name, occurred_at DESC)
  WHERE author_id IS NOT NULL;

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
    'first_save_retention_prompt_install_clicked',
    'first_save_retention_prompt_dismissed',
    'topic_page_viewed',
    'topic_product_clicked',
    'article_view',
    'article_audio_play',
    'article_practice_open',
    'article_practice_save',
    'article_topic_click',
    'article_related_practice_click',
    'article_toc_click',
    'article_final_audio_click',
    'buy_clicked',
    'author_page_view'
  );
$$;

COMMENT ON FUNCTION public.is_platform_analytics_event IS
  'audiolad:platform-analytics:v1; allowlisted platform event names including author_page_view';

DO $$
BEGIN
  IF public.is_platform_analytics_event('author_page_view') IS NOT TRUE THEN
    RAISE EXCEPTION 'Post-check failed: author_page_view not allowlisted';
  END IF;
END
$$;

-- Replace insert RPC with optional p_author_id
DROP FUNCTION IF EXISTS public.insert_platform_analytics_event(
  uuid, text, text, text, uuid, uuid, jsonb, uuid, text, text
);

CREATE OR REPLACE FUNCTION public.insert_platform_analytics_event(
  p_session_id uuid,
  p_anonymous_id text,
  p_event_name text,
  p_path text DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_audio_item_id uuid DEFAULT NULL,
  p_properties jsonb DEFAULT '{}'::jsonb,
  p_client_event_id uuid DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_client_version text DEFAULT NULL,
  p_author_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_event_id uuid;
  v_session_anonymous text;
  v_flags record;
  v_session analytics_sessions%ROWTYPE;
  v_author_id uuid := p_author_id;
  v_payload jsonb := COALESCE(p_properties, '{}'::jsonb);
BEGIN
  v_user_id := auth.uid();

  IF NOT public.is_platform_analytics_event(p_event_name) THEN
    RAISE EXCEPTION 'event_name_not_allowed'
      USING ERRCODE = '22023';
  END IF;

  IF p_session_id IS NULL OR p_anonymous_id IS NULL OR btrim(p_anonymous_id) = '' THEN
    RAISE EXCEPTION 'session_required'
      USING ERRCODE = '22023';
  END IF;

  IF p_client_event_id IS NOT NULL THEN
    SELECT e.id INTO v_event_id
    FROM public.analytics_events AS e
    WHERE e.client_event_id = p_client_event_id;

    IF FOUND THEN
      RETURN v_event_id;
    END IF;
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.analytics_sessions AS s
  WHERE s.id = p_session_id;

  IF NOT FOUND OR v_session.anonymous_id IS DISTINCT FROM btrim(p_anonymous_id) THEN
    RAISE EXCEPTION 'session_mismatch'
      USING ERRCODE = '22023';
  END IF;

  v_session_anonymous := v_session.anonymous_id;

  IF p_practice_id IS NOT NULL THEN
    PERFORM 1 FROM public.practices WHERE id = p_practice_id;
    IF NOT FOUND THEN
      p_practice_id := NULL;
    END IF;
  END IF;

  -- Resolve author_id: explicit arg, else payload claim for author_page_view.
  IF v_author_id IS NULL
     AND btrim(p_event_name) = 'author_page_view'
     AND jsonb_typeof(v_payload -> 'author_id') = 'string'
  THEN
    BEGIN
      v_author_id := (v_payload ->> 'author_id')::uuid;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_author_id := NULL;
    END;
  END IF;

  IF v_author_id IS NOT NULL THEN
    PERFORM 1 FROM public.authors WHERE id = v_author_id;
    IF NOT FOUND THEN
      IF btrim(p_event_name) = 'author_page_view' THEN
        RAISE EXCEPTION 'author_not_found'
          USING ERRCODE = '22023';
      END IF;
      v_author_id := NULL;
    END IF;
  END IF;

  IF btrim(p_event_name) = 'author_page_view' AND v_author_id IS NULL THEN
    RAISE EXCEPTION 'author_required'
      USING ERRCODE = '22023';
  END IF;

  -- Do not trust client author_id inside payload as a free-form field once column set.
  IF v_payload ? 'author_id' THEN
    v_payload := v_payload - 'author_id';
  END IF;

  SELECT * INTO v_flags
  FROM public.resolve_analytics_traffic_flags(
    v_user_id,
    btrim(p_anonymous_id),
    v_session.utm_campaign,
    coalesce(p_user_agent, v_session.user_agent)
  );

  UPDATE public.analytics_sessions AS s
  SET
    last_seen_at = now(),
    user_id = COALESCE(v_user_id, s.user_id),
    is_staff = s.is_staff OR v_flags.is_staff,
    is_test = s.is_test OR v_flags.is_test,
    is_bot = s.is_bot OR v_flags.is_bot,
    traffic_class = CASE
      WHEN s.is_bot OR v_flags.is_bot THEN 'bot'
      WHEN s.is_staff OR v_flags.is_staff THEN 'staff'
      WHEN s.is_test OR v_flags.is_test THEN 'test'
      ELSE 'human'
    END
  WHERE s.id = p_session_id;

  BEGIN
    INSERT INTO public.analytics_events (
      event_name,
      practice_id,
      track_id,
      author_id,
      user_id,
      anonymous_session_id,
      session_id,
      path,
      payload,
      occurred_at,
      is_staff,
      is_test,
      is_bot,
      traffic_class,
      classification_reason,
      client_event_id,
      user_agent,
      client_version
    )
    VALUES (
      btrim(p_event_name),
      p_practice_id,
      p_audio_item_id,
      v_author_id,
      v_user_id,
      btrim(p_anonymous_id),
      p_session_id,
      NULLIF(left(btrim(COALESCE(p_path, '')), 512), ''),
      v_payload,
      now(),
      v_flags.is_staff OR v_session.is_staff,
      v_flags.is_test OR v_session.is_test,
      v_flags.is_bot OR v_session.is_bot,
      CASE
        WHEN v_flags.is_bot OR v_session.is_bot THEN 'bot'
        WHEN v_flags.is_staff OR v_session.is_staff THEN 'staff'
        WHEN v_flags.is_test OR v_session.is_test THEN 'test'
        ELSE 'human'
      END,
      coalesce(v_flags.classification_reason, v_session.classification_reason),
      p_client_event_id,
      NULLIF(left(btrim(COALESCE(p_user_agent, '')), 512), ''),
      NULLIF(left(btrim(COALESCE(p_client_version, '')), 32), '')
    )
    RETURNING id INTO v_event_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT e.id INTO v_event_id
      FROM public.analytics_events AS e
      WHERE e.client_event_id = p_client_event_id;
      RETURN v_event_id;
  END;

  RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_platform_analytics_event(
  uuid, text, text, text, uuid, uuid, jsonb, uuid, text, text, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_platform_analytics_event(
  uuid, text, text, text, uuid, uuid, jsonb, uuid, text, text, uuid
) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.insert_platform_analytics_event(
  uuid, text, text, text, uuid, uuid, jsonb, uuid, text, text, uuid
) IS
  'audiolad:platform-analytics:v1; insert platform event; author_page_view requires existing author_id';

COMMIT;
