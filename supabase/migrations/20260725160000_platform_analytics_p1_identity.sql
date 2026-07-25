BEGIN;

-- =============================================================================
-- Platform analytics P1: identity, staff/test/bot classification, idempotency
-- Additive + CREATE OR REPLACE. Preserves historical rows.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Columns on sessions / events
-- ---------------------------------------------------------------------------

ALTER TABLE public.analytics_sessions
  ADD COLUMN IF NOT EXISTS is_staff boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS traffic_class text NOT NULL DEFAULT 'human',
  ADD COLUMN IF NOT EXISTS classification_reason text NULL,
  ADD COLUMN IF NOT EXISTS user_agent text NULL,
  ADD COLUMN IF NOT EXISTS client_version text NULL;

ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS is_staff boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_bot boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS traffic_class text NOT NULL DEFAULT 'human',
  ADD COLUMN IF NOT EXISTS classification_reason text NULL,
  ADD COLUMN IF NOT EXISTS client_event_id uuid NULL,
  ADD COLUMN IF NOT EXISTS user_agent text NULL,
  ADD COLUMN IF NOT EXISTS client_version text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'analytics_sessions_traffic_class_check'
  ) THEN
    ALTER TABLE public.analytics_sessions
      ADD CONSTRAINT analytics_sessions_traffic_class_check
      CHECK (traffic_class IN ('human', 'staff', 'test', 'bot'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'analytics_events_traffic_class_check'
  ) THEN
    ALTER TABLE public.analytics_events
      ADD CONSTRAINT analytics_events_traffic_class_check
      CHECK (traffic_class IN ('human', 'staff', 'test', 'bot'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS analytics_events_client_event_id_uidx
  ON public.analytics_events (client_event_id)
  WHERE client_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS analytics_sessions_anon_last_seen_idx
  ON public.analytics_sessions (anonymous_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS analytics_sessions_traffic_started_idx
  ON public.analytics_sessions (started_at DESC)
  WHERE NOT (is_staff OR is_test OR is_bot);

CREATE INDEX IF NOT EXISTS analytics_events_traffic_occurred_idx
  ON public.analytics_events (occurred_at DESC)
  WHERE NOT (is_staff OR is_test OR is_bot);

-- ---------------------------------------------------------------------------
-- Test accounts registry (no emails in analytics events)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.analytics_test_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT analytics_test_accounts_label_check
    CHECK (char_length(label) <= 128)
);

ALTER TABLE public.analytics_test_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_test_accounts FROM PUBLIC;
REVOKE ALL ON public.analytics_test_accounts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytics_test_accounts TO service_role;

COMMENT ON TABLE public.analytics_test_accounts IS
  'audiolad:platform-analytics:p1; authenticated users whose traffic is marked is_test';

INSERT INTO public.analytics_test_accounts (user_id, label)
SELECT u.id, 'primary_test_account'
FROM auth.users AS u
WHERE lower(u.email) = 'audiolad@mail.ru'
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Identity links with time intervals (User A logout → User B safe)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.analytics_identity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  linked_at timestamptz NOT NULL DEFAULT now(),
  unlinked_at timestamptz NULL,
  source text NOT NULL DEFAULT 'login',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analytics_identity_links_anonymous_id_check
    CHECK (
      char_length(btrim(anonymous_id)) > 0
      AND char_length(anonymous_id) <= 128
    ),
  CONSTRAINT analytics_identity_links_source_check
    CHECK (source IN ('login', 'signup', 'session_link', 'staff_retro')),
  CONSTRAINT analytics_identity_links_interval_check
    CHECK (unlinked_at IS NULL OR unlinked_at >= linked_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS analytics_identity_links_active_anon_uidx
  ON public.analytics_identity_links (anonymous_id)
  WHERE unlinked_at IS NULL;

CREATE INDEX IF NOT EXISTS analytics_identity_links_user_idx
  ON public.analytics_identity_links (user_id, linked_at DESC);

CREATE INDEX IF NOT EXISTS analytics_identity_links_anon_interval_idx
  ON public.analytics_identity_links (anonymous_id, linked_at, unlinked_at);

ALTER TABLE public.analytics_identity_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_identity_links FROM PUBLIC;
REVOKE ALL ON public.analytics_identity_links FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytics_identity_links TO service_role;

COMMENT ON TABLE public.analytics_identity_links IS
  'audiolad:platform-analytics:p1; timed anonymous_id ↔ user_id links; unlinked_at closes prior ownership';

-- ---------------------------------------------------------------------------
-- Classification helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_analytics_test_user(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.analytics_test_accounts AS t
      WHERE t.user_id = p_user_id
    );
$$;

CREATE OR REPLACE FUNCTION public.classify_analytics_bot(p_user_agent text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_user_agent IS NULL OR btrim(p_user_agent) = '' THEN false
    WHEN lower(p_user_agent) ~ '(bot|crawler|spider|slurp|bingpreview|facebookexternalhit|twitterbot|linkedinbot|discordbot|telegrambot|whatsapp|preview|uptimerobot|pingdom|statuscake|headlesschrome|phantomjs|selenium|puppeteer|playwright|curl/|wget/|python-requests|go-http-client|libwww-perl)'
      THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_analytics_traffic_flags(
  p_user_id uuid,
  p_anonymous_id text,
  p_utm_campaign text,
  p_user_agent text
)
RETURNS TABLE (
  is_staff boolean,
  is_test boolean,
  is_bot boolean,
  traffic_class text,
  classification_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff boolean := false;
  v_test boolean := false;
  v_bot boolean := false;
  v_reason text := NULL;
BEGIN
  v_bot := public.classify_analytics_bot(p_user_agent);

  IF p_user_id IS NOT NULL AND public.is_platform_staff(p_user_id) THEN
    v_staff := true;
  END IF;

  IF p_user_id IS NOT NULL AND public.is_analytics_test_user(p_user_id) THEN
    v_test := true;
  ELSIF public.is_test_analytics_session(p_utm_campaign, p_anonymous_id) THEN
    v_test := true;
  END IF;

  IF v_bot THEN
    v_reason := 'user_agent_bot';
    RETURN QUERY SELECT v_staff, v_test, true, 'bot'::text, v_reason;
    RETURN;
  END IF;

  IF v_staff THEN
    v_reason := 'platform_staff';
    RETURN QUERY SELECT true, v_test, false, 'staff'::text, v_reason;
    RETURN;
  END IF;

  IF v_test THEN
    v_reason := CASE
      WHEN p_user_id IS NOT NULL AND public.is_analytics_test_user(p_user_id)
        THEN 'test_account'
      ELSE 'test_campaign_or_anonymous_prefix'
    END;
    RETURN QUERY SELECT false, true, false, 'test'::text, v_reason;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, false, false, 'human'::text, NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_analytics_visitor_key(
  p_user_id uuid,
  p_anonymous_id text,
  p_at timestamptz DEFAULT now()
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_user_id IS NOT NULL THEN p_user_id::text
    WHEN nullif(btrim(coalesce(p_anonymous_id, '')), '') IS NULL THEN NULL
    ELSE coalesce(
      (
        SELECT l.user_id::text
        FROM public.analytics_identity_links AS l
        WHERE l.anonymous_id = btrim(p_anonymous_id)
          AND l.linked_at <= p_at
          AND (l.unlinked_at IS NULL OR l.unlinked_at > p_at)
        ORDER BY l.linked_at DESC
        LIMIT 1
      ),
      btrim(p_anonymous_id)
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.is_analytics_test_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classify_analytics_bot(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_analytics_traffic_flags(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_analytics_visitor_key(uuid, text, timestamptz) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_analytics_test_user(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.classify_analytics_bot(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_analytics_traffic_flags(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_analytics_visitor_key(uuid, text, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- Identity link RPC (close prior active link on same anonymous_id)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.link_analytics_identity(
  p_anonymous_id text,
  p_source text DEFAULT 'login',
  p_retro_staff_hours integer DEFAULT 24
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_source text := coalesce(nullif(btrim(p_source), ''), 'login');
  v_link_id uuid;
  v_closed int := 0;
  v_staff boolean := false;
  v_test boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF p_anonymous_id IS NULL OR btrim(p_anonymous_id) = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'anonymous_id_required');
  END IF;

  IF v_source NOT IN ('login', 'signup', 'session_link', 'staff_retro') THEN
    v_source := 'login';
  END IF;

  v_staff := public.is_platform_staff(v_user_id);
  v_test := public.is_analytics_test_user(v_user_id);

  UPDATE public.analytics_identity_links AS l
  SET unlinked_at = v_now
  WHERE l.anonymous_id = btrim(p_anonymous_id)
    AND l.unlinked_at IS NULL
    AND l.user_id IS DISTINCT FROM v_user_id;

  GET DIAGNOSTICS v_closed = ROW_COUNT;

  SELECT l.id INTO v_link_id
  FROM public.analytics_identity_links AS l
  WHERE l.anonymous_id = btrim(p_anonymous_id)
    AND l.unlinked_at IS NULL
    AND l.user_id = v_user_id
  LIMIT 1;

  IF v_link_id IS NULL THEN
    INSERT INTO public.analytics_identity_links (
      anonymous_id, user_id, linked_at, source
    )
    VALUES (btrim(p_anonymous_id), v_user_id, v_now, v_source)
    RETURNING id INTO v_link_id;
  END IF;

  -- Retro mark recent anonymous sessions for staff/test (safe lookback).
  IF v_staff OR v_test THEN
    UPDATE public.analytics_sessions AS s
    SET
      is_staff = s.is_staff OR v_staff,
      is_test = s.is_test OR v_test,
      traffic_class = CASE
        WHEN s.is_bot THEN 'bot'
        WHEN v_staff OR s.is_staff THEN 'staff'
        WHEN v_test OR s.is_test THEN 'test'
        ELSE s.traffic_class
      END,
      classification_reason = coalesce(
        s.classification_reason,
        CASE
          WHEN v_staff THEN 'staff_retro_link'
          ELSE 'test_retro_link'
        END
      )
    WHERE s.anonymous_id = btrim(p_anonymous_id)
      AND s.started_at >= v_now - make_interval(hours => greatest(coalesce(p_retro_staff_hours, 24), 0))
      AND (s.user_id IS NULL OR s.user_id = v_user_id);

    UPDATE public.analytics_events AS e
    SET
      is_staff = e.is_staff OR v_staff,
      is_test = e.is_test OR v_test,
      traffic_class = CASE
        WHEN e.is_bot THEN 'bot'
        WHEN v_staff OR e.is_staff THEN 'staff'
        WHEN v_test OR e.is_test THEN 'test'
        ELSE e.traffic_class
      END,
      classification_reason = coalesce(
        e.classification_reason,
        CASE
          WHEN v_staff THEN 'staff_retro_link'
          ELSE 'test_retro_link'
        END
      )
    WHERE e.anonymous_session_id = btrim(p_anonymous_id)
      AND e.occurred_at >= v_now - make_interval(hours => greatest(coalesce(p_retro_staff_hours, 24), 0))
      AND (e.user_id IS NULL OR e.user_id = v_user_id);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'link_id', v_link_id,
    'closed_prior', v_closed,
    'is_staff', v_staff,
    'is_test', v_test
  );
END;
$$;

REVOKE ALL ON FUNCTION public.link_analytics_identity(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_analytics_identity(text, text, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- upsert_analytics_session — resume by anonymous_id + classification
-- Drop legacy overload so PostgREST binds a single signature.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.upsert_analytics_session(
  uuid, text, text, text, text, text, text, text, text
);

CREATE OR REPLACE FUNCTION public.upsert_analytics_session(
  p_session_id uuid DEFAULT NULL,
  p_anonymous_id text DEFAULT NULL,
  p_landing_path text DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_utm_medium text DEFAULT NULL,
  p_utm_campaign text DEFAULT NULL,
  p_utm_content text DEFAULT NULL,
  p_referrer_domain text DEFAULT NULL,
  p_device_type text DEFAULT 'desktop',
  p_user_agent text DEFAULT NULL,
  p_client_version text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_session_id uuid;
  v_now timestamptz := now();
  v_timeout interval := interval '30 minutes';
  v_device text;
  v_flags record;
BEGIN
  v_user_id := auth.uid();

  IF p_anonymous_id IS NULL OR btrim(p_anonymous_id) = '' THEN
    RAISE EXCEPTION 'anonymous_id_required'
      USING ERRCODE = '22023';
  END IF;

  v_device := CASE
    WHEN p_device_type IN ('mobile', 'tablet', 'desktop') THEN p_device_type
    ELSE 'desktop'
  END;

  SELECT * INTO v_flags
  FROM public.resolve_analytics_traffic_flags(
    v_user_id,
    btrim(p_anonymous_id),
    p_utm_campaign,
    p_user_agent
  );

  IF p_session_id IS NOT NULL THEN
    SELECT s.id
    INTO v_session_id
    FROM public.analytics_sessions AS s
    WHERE s.id = p_session_id
      AND s.anonymous_id = btrim(p_anonymous_id)
      AND s.last_seen_at >= v_now - v_timeout;

    IF FOUND THEN
      UPDATE public.analytics_sessions AS s
      SET
        last_seen_at = v_now,
        user_id = COALESCE(v_user_id, s.user_id),
        is_staff = s.is_staff OR v_flags.is_staff,
        is_test = s.is_test OR v_flags.is_test,
        is_bot = s.is_bot OR v_flags.is_bot,
        traffic_class = CASE
          WHEN s.is_bot OR v_flags.is_bot THEN 'bot'
          WHEN s.is_staff OR v_flags.is_staff THEN 'staff'
          WHEN s.is_test OR v_flags.is_test THEN 'test'
          ELSE 'human'
        END,
        classification_reason = coalesce(s.classification_reason, v_flags.classification_reason),
        user_agent = coalesce(s.user_agent, nullif(left(btrim(coalesce(p_user_agent, '')), 512), '')),
        client_version = coalesce(s.client_version, nullif(left(btrim(coalesce(p_client_version, '')), 32), ''))
      WHERE s.id = v_session_id;

      RETURN v_session_id;
    END IF;
  END IF;

  -- Cross-tab / reload resume: active session for same anonymous_id.
  SELECT s.id
  INTO v_session_id
  FROM public.analytics_sessions AS s
  WHERE s.anonymous_id = btrim(p_anonymous_id)
    AND s.last_seen_at >= v_now - v_timeout
  ORDER BY s.last_seen_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.analytics_sessions AS s
    SET
      last_seen_at = v_now,
      user_id = COALESCE(v_user_id, s.user_id),
      is_staff = s.is_staff OR v_flags.is_staff,
      is_test = s.is_test OR v_flags.is_test,
      is_bot = s.is_bot OR v_flags.is_bot,
      traffic_class = CASE
        WHEN s.is_bot OR v_flags.is_bot THEN 'bot'
        WHEN s.is_staff OR v_flags.is_staff THEN 'staff'
        WHEN s.is_test OR v_flags.is_test THEN 'test'
        ELSE 'human'
      END,
      classification_reason = coalesce(s.classification_reason, v_flags.classification_reason),
      user_agent = coalesce(s.user_agent, nullif(left(btrim(coalesce(p_user_agent, '')), 512), '')),
      client_version = coalesce(s.client_version, nullif(left(btrim(coalesce(p_client_version, '')), 32), ''))
    WHERE s.id = v_session_id;

    RETURN v_session_id;
  END IF;

  INSERT INTO public.analytics_sessions (
    anonymous_id,
    user_id,
    started_at,
    last_seen_at,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    referrer_domain,
    landing_path,
    device_type,
    is_staff,
    is_test,
    is_bot,
    traffic_class,
    classification_reason,
    user_agent,
    client_version
  )
  VALUES (
    btrim(p_anonymous_id),
    v_user_id,
    v_now,
    v_now,
    NULLIF(left(btrim(COALESCE(p_utm_source, '')), 128), ''),
    NULLIF(left(btrim(COALESCE(p_utm_medium, '')), 128), ''),
    NULLIF(left(btrim(COALESCE(p_utm_campaign, '')), 128), ''),
    NULLIF(left(btrim(COALESCE(p_utm_content, '')), 128), ''),
    NULLIF(left(btrim(COALESCE(p_referrer_domain, '')), 128), ''),
    NULLIF(left(btrim(COALESCE(p_landing_path, '')), 512), ''),
    v_device,
    v_flags.is_staff,
    v_flags.is_test,
    v_flags.is_bot,
    v_flags.traffic_class,
    v_flags.classification_reason,
    NULLIF(left(btrim(COALESCE(p_user_agent, '')), 512), ''),
    NULLIF(left(btrim(COALESCE(p_client_version, '')), 32), '')
  )
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;

-- Keep grants for expanded signature
REVOKE ALL ON FUNCTION public.upsert_analytics_session(
  uuid, text, text, text, text, text, text, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_analytics_session(
  uuid, text, text, text, text, text, text, text, text, text, text
) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- link_analytics_session_user — also identity link
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.link_analytics_session_user(
  p_session_id uuid,
  p_anonymous_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid;
  v_updated int := 0;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_session_id IS NULL OR p_anonymous_id IS NULL OR btrim(p_anonymous_id) = '' THEN
    RETURN false;
  END IF;

  UPDATE public.analytics_sessions AS s
  SET
    user_id = v_user_id,
    is_staff = s.is_staff OR public.is_platform_staff(v_user_id),
    is_test = s.is_test OR public.is_analytics_test_user(v_user_id),
    traffic_class = CASE
      WHEN s.is_bot THEN 'bot'
      WHEN s.is_staff OR public.is_platform_staff(v_user_id) THEN 'staff'
      WHEN s.is_test OR public.is_analytics_test_user(v_user_id) THEN 'test'
      ELSE 'human'
    END
  WHERE s.id = p_session_id
    AND s.anonymous_id = btrim(p_anonymous_id);

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  UPDATE public.analytics_events AS e
  SET user_id = v_user_id
  WHERE e.session_id = p_session_id
    AND e.user_id IS NULL;

  PERFORM public.link_analytics_identity(btrim(p_anonymous_id), 'session_link', 24);

  RETURN v_updated > 0;
END;
$$;

-- ---------------------------------------------------------------------------
-- insert_platform_analytics_event — client_event_id idempotency + flags
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.insert_platform_analytics_event(
  uuid, text, text, text, uuid, uuid, jsonb
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
  p_client_version text DEFAULT NULL
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
      v_user_id,
      btrim(p_anonymous_id),
      p_session_id,
      NULLIF(left(btrim(COALESCE(p_path, '')), 512), ''),
      COALESCE(p_properties, '{}'::jsonb),
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
  uuid, text, text, text, uuid, uuid, jsonb, uuid, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_platform_analytics_event(
  uuid, text, text, text, uuid, uuid, jsonb, uuid, text, text
) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Historical backfill (high confidence only)
-- ---------------------------------------------------------------------------

UPDATE public.analytics_sessions AS s
SET
  is_staff = true,
  traffic_class = CASE WHEN s.is_bot THEN 'bot' ELSE 'staff' END,
  classification_reason = coalesce(s.classification_reason, 'backfill_platform_staff')
WHERE s.user_id IS NOT NULL
  AND public.is_platform_staff(s.user_id)
  AND NOT s.is_staff;

UPDATE public.analytics_events AS e
SET
  is_staff = true,
  traffic_class = CASE WHEN e.is_bot THEN 'bot' ELSE 'staff' END,
  classification_reason = coalesce(e.classification_reason, 'backfill_platform_staff')
WHERE e.user_id IS NOT NULL
  AND public.is_platform_staff(e.user_id)
  AND NOT e.is_staff;

UPDATE public.analytics_sessions AS s
SET
  is_test = true,
  traffic_class = CASE
    WHEN s.is_bot THEN 'bot'
    WHEN s.is_staff THEN 'staff'
    ELSE 'test'
  END,
  classification_reason = coalesce(s.classification_reason, 'backfill_test_account')
WHERE s.user_id IS NOT NULL
  AND public.is_analytics_test_user(s.user_id)
  AND NOT s.is_test;

UPDATE public.analytics_events AS e
SET
  is_test = true,
  traffic_class = CASE
    WHEN e.is_bot THEN 'bot'
    WHEN e.is_staff THEN 'staff'
    ELSE 'test'
  END,
  classification_reason = coalesce(e.classification_reason, 'backfill_test_account')
WHERE e.user_id IS NOT NULL
  AND public.is_analytics_test_user(e.user_id)
  AND NOT e.is_test;

UPDATE public.analytics_sessions AS s
SET
  is_test = true,
  traffic_class = CASE
    WHEN s.is_bot THEN 'bot'
    WHEN s.is_staff THEN 'staff'
    ELSE 'test'
  END,
  classification_reason = coalesce(s.classification_reason, 'backfill_test_utm_or_anon')
WHERE NOT s.is_test
  AND public.is_test_analytics_session(s.utm_campaign, s.anonymous_id);

COMMIT;
