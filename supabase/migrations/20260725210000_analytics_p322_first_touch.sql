-- P3.2.2: immutable first-touch acquisition SoT (anonymous + user).
-- Does NOT change P3.0 fulfill / P3.1 money / P3.2.1 buy-click path.
-- Does NOT auto-apply historical backfill as exact.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Sessions: add utm_term (rolling-deploy compatible)
-- ---------------------------------------------------------------------------

ALTER TABLE public.analytics_sessions
  ADD COLUMN IF NOT EXISTS utm_term text NULL;

COMMENT ON COLUMN public.analytics_sessions.utm_term IS
  'audiolad:p322; optional UTM term for new sessions; pathname/session-touch only';

-- ---------------------------------------------------------------------------
-- 2) First-touch table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.analytics_first_touches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL,
  anonymous_id text NULL,
  user_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  first_session_id uuid NULL REFERENCES public.analytics_sessions (id) ON DELETE SET NULL,
  first_seen_at timestamptz NOT NULL,
  utm_source text NULL,
  utm_medium text NULL,
  utm_campaign text NULL,
  utm_content text NULL,
  utm_term text NULL,
  referrer_domain text NULL,
  landing_path text NULL,
  source_class text NULL,
  confidence text NOT NULL,
  origin text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT analytics_first_touches_subject_type_check
    CHECK (subject_type IN ('anonymous', 'user')),
  CONSTRAINT analytics_first_touches_confidence_check
    CHECK (confidence IN ('exact', 'strong', 'inferred', 'unknown')),
  CONSTRAINT analytics_first_touches_origin_check
    CHECK (origin IN (
      'session_insert',
      'identity_link',
      'historical_backfill',
      'migration',
      'manual_repair',
      'auth_session'
    )),
  CONSTRAINT analytics_first_touches_source_class_check
    CHECK (
      source_class IS NULL
      OR source_class IN (
        'utm',
        'organic_search',
        'social',
        'messenger',
        'referral',
        'direct_or_unknown',
        'internal',
        'unknown'
      )
    ),
  CONSTRAINT analytics_first_touches_subject_shape_check
    CHECK (
      (subject_type = 'anonymous' AND anonymous_id IS NOT NULL AND user_id IS NULL)
      OR (subject_type = 'user' AND user_id IS NOT NULL)
    ),
  CONSTRAINT analytics_first_touches_anonymous_id_check
    CHECK (
      anonymous_id IS NULL
      OR (
        char_length(btrim(anonymous_id)) > 0
        AND char_length(anonymous_id) <= 128
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS analytics_first_touches_anonymous_uidx
  ON public.analytics_first_touches (anonymous_id)
  WHERE subject_type = 'anonymous' AND anonymous_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS analytics_first_touches_user_uidx
  ON public.analytics_first_touches (user_id)
  WHERE subject_type = 'user' AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS analytics_first_touches_first_seen_at_idx
  ON public.analytics_first_touches (first_seen_at DESC);

CREATE INDEX IF NOT EXISTS analytics_first_touches_source_class_idx
  ON public.analytics_first_touches (source_class)
  WHERE source_class IS NOT NULL;

ALTER TABLE public.analytics_first_touches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.analytics_first_touches FROM PUBLIC;
REVOKE ALL ON public.analytics_first_touches FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytics_first_touches TO service_role;

COMMENT ON TABLE public.analytics_first_touches IS
  'audiolad:p322; immutable first-touch acquisition SoT; not session-touch; not money SoT';

-- ---------------------------------------------------------------------------
-- 3) Sanitizers / source classifier
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sanitize_analytics_utm_value(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    left(
      regexp_replace(btrim(coalesce(p_value, '')), E'[\\x00-\\x1F\\x7F]', '', 'g'),
      128
    ),
    ''
  );
$$;

REVOKE ALL ON FUNCTION public.sanitize_analytics_utm_value(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sanitize_analytics_utm_value(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sanitize_analytics_utm_value(text) TO service_role;

CREATE OR REPLACE FUNCTION public.classify_acquisition_source_class(
  p_utm_source text,
  p_utm_medium text,
  p_utm_campaign text,
  p_referrer_domain text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_src text := lower(coalesce(public.sanitize_analytics_utm_value(p_utm_source), ''));
  v_med text := lower(coalesce(public.sanitize_analytics_utm_value(p_utm_medium), ''));
  v_camp text := lower(coalesce(public.sanitize_analytics_utm_value(p_utm_campaign), ''));
  v_ref text := lower(coalesce(public.sanitize_analytics_utm_value(p_referrer_domain), ''));
BEGIN
  -- Internal never counts as acquisition.
  IF v_ref IN ('audiolad.ru', 'www.audiolad.ru', 'localhost', '127.0.0.1') THEN
    v_ref := '';
  END IF;

  IF v_src <> '' OR v_med <> '' OR v_camp <> '' THEN
    -- Messenger UTM shortcuts still class as messenger when medium/source match.
    IF v_src IN ('telegram', 'tg', 'max', 'vk', 'whatsapp', 'viber')
       OR v_med IN ('messenger', 'messaging', 'messaging_bot', 'social_messenger')
       OR v_src LIKE 'bothelp%'
       OR v_med LIKE '%messenger%' THEN
      RETURN 'messenger';
    END IF;
    IF v_med IN ('social', 'social-network', 'social_media')
       OR v_src IN ('facebook', 'instagram', 'youtube', 'tiktok', 'ok', 'odnoklassniki') THEN
      RETURN 'social';
    END IF;
    RETURN 'utm';
  END IF;

  IF v_ref = '' THEN
    RETURN 'direct_or_unknown';
  END IF;

  IF v_ref LIKE '%google.%'
     OR v_ref LIKE '%yandex.%'
     OR v_ref LIKE '%bing.%'
     OR v_ref LIKE '%duckduckgo.%'
     OR v_ref = 'go.mail.ru'
     OR v_ref LIKE '%search.yahoo.%' THEN
    RETURN 'organic_search';
  END IF;

  IF v_ref LIKE '%t.me%'
     OR v_ref LIKE '%telegram.%'
     OR v_ref LIKE '%max.ru%'
     OR v_ref LIKE '%oneme.ru%'
     OR v_ref LIKE '%whatsapp.%'
     OR v_ref LIKE '%wa.me%' THEN
    RETURN 'messenger';
  END IF;

  IF v_ref LIKE '%vk.com%'
     OR v_ref LIKE '%vk.ru%'
     OR v_ref LIKE '%facebook.%'
     OR v_ref LIKE '%instagram.%'
     OR v_ref LIKE '%youtube.%'
     OR v_ref LIKE '%tiktok.%'
     OR v_ref LIKE '%ok.ru%' THEN
    RETURN 'social';
  END IF;

  RETURN 'referral';
END;
$$;

REVOKE ALL ON FUNCTION public.classify_acquisition_source_class(text, text, text, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.classify_acquisition_source_class(text, text, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.classify_acquisition_source_class(text, text, text, text)
  TO service_role;

COMMENT ON FUNCTION public.classify_acquisition_source_class(text, text, text, text) IS
  'audiolad:p322; centralized acquisition source_class; UTM priority; internal excluded';

-- ---------------------------------------------------------------------------
-- 4) ensure_anonymous_first_touch
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_anonymous_first_touch(
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.analytics_sessions%ROWTYPE;
  v_existing public.analytics_first_touches%ROWTYPE;
  v_id uuid;
  v_landing text;
  v_class text;
BEGIN
  IF p_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session_required');
  END IF;

  SELECT s.* INTO v_session
  FROM public.analytics_sessions AS s
  WHERE s.id = p_session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'session_missing');
  END IF;

  -- Bot/test/staff never create ordinary first-touch from the trigger session.
  IF coalesce(v_session.is_bot, false)
     OR coalesce(v_session.is_test, false)
     OR coalesce(v_session.is_staff, false)
     OR v_session.traffic_class IN ('bot', 'test', 'staff') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'excluded_traffic');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ft:anon:' || v_session.anonymous_id));

  SELECT t.* INTO v_existing
  FROM public.analytics_first_touches AS t
  WHERE t.subject_type = 'anonymous'
    AND t.anonymous_id = v_session.anonymous_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'id', v_existing.id,
      'reason', 'already_exists'
    );
  END IF;

  -- Deterministic earliest eligible human session for this anonymous_id.
  SELECT s.* INTO v_session
  FROM public.analytics_sessions AS s
  WHERE s.anonymous_id = v_session.anonymous_id
    AND coalesce(s.is_bot, false) = false
    AND coalesce(s.is_test, false) = false
    AND coalesce(s.is_staff, false) = false
    AND s.traffic_class = 'human'
  ORDER BY s.started_at ASC, s.created_at ASC, s.id ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_eligible_session');
  END IF;

  v_landing := public.sanitize_checkout_origin_path(v_session.landing_path);
  v_class := public.classify_acquisition_source_class(
    v_session.utm_source,
    v_session.utm_medium,
    v_session.utm_campaign,
    v_session.referrer_domain
  );

  BEGIN
    INSERT INTO public.analytics_first_touches (
      subject_type,
      anonymous_id,
      user_id,
      first_session_id,
      first_seen_at,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      referrer_domain,
      landing_path,
      source_class,
      confidence,
      origin
    )
    VALUES (
      'anonymous',
      v_session.anonymous_id,
      NULL,
      v_session.id,
      v_session.started_at,
      public.sanitize_analytics_utm_value(v_session.utm_source),
      public.sanitize_analytics_utm_value(v_session.utm_medium),
      public.sanitize_analytics_utm_value(v_session.utm_campaign),
      public.sanitize_analytics_utm_value(v_session.utm_content),
      public.sanitize_analytics_utm_value(v_session.utm_term),
      public.sanitize_analytics_utm_value(v_session.referrer_domain),
      v_landing,
      v_class,
      'exact',
      'session_insert'
    )
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT t.id INTO v_id
      FROM public.analytics_first_touches AS t
      WHERE t.subject_type = 'anonymous'
        AND t.anonymous_id = v_session.anonymous_id
      LIMIT 1;

      RETURN jsonb_build_object(
        'ok', true,
        'created', false,
        'id', v_id,
        'reason', 'race_exists'
      );
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'created', true,
    'id', v_id,
    'confidence', 'exact',
    'origin', 'session_insert'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_anonymous_first_touch(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_anonymous_first_touch(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_anonymous_first_touch(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_anonymous_first_touch(uuid) TO postgres;

COMMENT ON FUNCTION public.ensure_anonymous_first_touch(uuid) IS
  'audiolad:p322; idempotent immutable anonymous first-touch from DB session; excludes bot/test/staff';

-- ---------------------------------------------------------------------------
-- 5) resolve_user_first_touch_candidate + ensure_user_first_touch
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_user_first_touch_candidate(
  p_user_id uuid
)
RETURNS TABLE (
  ok boolean,
  reason text,
  first_session_id uuid,
  first_seen_at timestamptz,
  anonymous_id text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  referrer_domain text,
  landing_path text,
  source_class text,
  confidence text,
  origin text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_anon public.analytics_first_touches%ROWTYPE;
  v_session public.analytics_sessions%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN QUERY SELECT
      false, 'user_required'::text,
      NULL::uuid, NULL::timestamptz, NULL::text,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- Prefer earliest exact anonymous first-touch among active identity links.
  SELECT t.*
  INTO v_anon
  FROM public.analytics_first_touches AS t
  JOIN public.analytics_identity_links AS l
    ON l.anonymous_id = t.anonymous_id
   AND l.user_id = p_user_id
   AND l.unlinked_at IS NULL
  WHERE t.subject_type = 'anonymous'
    AND t.confidence = 'exact'
  ORDER BY t.first_seen_at ASC, t.created_at ASC, t.id ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT
      true,
      'from_anonymous_exact'::text,
      v_anon.first_session_id,
      v_anon.first_seen_at,
      v_anon.anonymous_id,
      v_anon.utm_source,
      v_anon.utm_medium,
      v_anon.utm_campaign,
      v_anon.utm_content,
      v_anon.utm_term,
      v_anon.referrer_domain,
      v_anon.landing_path,
      v_anon.source_class,
      'exact'::text,
      'identity_link'::text;
    RETURN;
  END IF;

  -- Fallback: earliest eligible human session for this user (auth session path).
  SELECT s.*
  INTO v_session
  FROM public.analytics_sessions AS s
  WHERE s.user_id = p_user_id
    AND coalesce(s.is_bot, false) = false
    AND coalesce(s.is_test, false) = false
    AND coalesce(s.is_staff, false) = false
    AND s.traffic_class = 'human'
  ORDER BY s.started_at ASC, s.created_at ASC, s.id ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT
      true,
      'from_auth_session'::text,
      v_session.id,
      v_session.started_at,
      v_session.anonymous_id,
      public.sanitize_analytics_utm_value(v_session.utm_source),
      public.sanitize_analytics_utm_value(v_session.utm_medium),
      public.sanitize_analytics_utm_value(v_session.utm_campaign),
      public.sanitize_analytics_utm_value(v_session.utm_content),
      public.sanitize_analytics_utm_value(v_session.utm_term),
      public.sanitize_analytics_utm_value(v_session.referrer_domain),
      public.sanitize_checkout_origin_path(v_session.landing_path),
      public.classify_acquisition_source_class(
        v_session.utm_source,
        v_session.utm_medium,
        v_session.utm_campaign,
        v_session.referrer_domain
      ),
      'exact'::text,
      'auth_session'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    false, 'no_candidate'::text,
    NULL::uuid, NULL::timestamptz, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
    NULL::text, NULL::text, NULL::text, NULL::text, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_user_first_touch_candidate(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_user_first_touch_candidate(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_user_first_touch_candidate(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_user_first_touch_candidate(uuid) TO postgres;

CREATE OR REPLACE FUNCTION public.ensure_user_first_touch(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing public.analytics_first_touches%ROWTYPE;
  v_cand record;
  v_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_required');
  END IF;

  -- Staff/test users: do not create ordinary first-touch.
  IF public.is_platform_staff(p_user_id)
     OR public.is_analytics_test_user(p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'excluded_user');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ft:user:' || p_user_id::text));

  SELECT t.* INTO v_existing
  FROM public.analytics_first_touches AS t
  WHERE t.subject_type = 'user'
    AND t.user_id = p_user_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'created', false,
      'id', v_existing.id,
      'reason', 'already_exists'
    );
  END IF;

  SELECT * INTO v_cand
  FROM public.resolve_user_first_touch_candidate(p_user_id);

  IF NOT v_cand.ok THEN
    RETURN jsonb_build_object('ok', false, 'reason', coalesce(v_cand.reason, 'no_candidate'));
  END IF;

  BEGIN
    INSERT INTO public.analytics_first_touches (
      subject_type,
      anonymous_id,
      user_id,
      first_session_id,
      first_seen_at,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      referrer_domain,
      landing_path,
      source_class,
      confidence,
      origin
    )
    VALUES (
      'user',
      NULL,
      p_user_id,
      v_cand.first_session_id,
      v_cand.first_seen_at,
      v_cand.utm_source,
      v_cand.utm_medium,
      v_cand.utm_campaign,
      v_cand.utm_content,
      v_cand.utm_term,
      v_cand.referrer_domain,
      v_cand.landing_path,
      v_cand.source_class,
      v_cand.confidence,
      v_cand.origin
    )
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT t.id INTO v_id
      FROM public.analytics_first_touches AS t
      WHERE t.subject_type = 'user' AND t.user_id = p_user_id
      LIMIT 1;

      RETURN jsonb_build_object(
        'ok', true,
        'created', false,
        'id', v_id,
        'reason', 'race_exists'
      );
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'created', true,
    'id', v_id,
    'confidence', v_cand.confidence,
    'origin', v_cand.origin,
    'candidate_reason', v_cand.reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_user_first_touch(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_user_first_touch(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_user_first_touch(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_user_first_touch(uuid) TO postgres;

COMMENT ON FUNCTION public.ensure_user_first_touch(uuid) IS
  'audiolad:p322; idempotent immutable user first-touch from earliest linked anonymous exact or auth session';

-- ---------------------------------------------------------------------------
-- 6) Integrity snapshot
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_first_touch_integrity_snapshot(
  p_since timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'critical', (
      SELECT count(*)::integer FROM (
        SELECT anonymous_id
        FROM public.analytics_first_touches
        WHERE subject_type = 'anonymous' AND anonymous_id IS NOT NULL
        GROUP BY anonymous_id HAVING count(*) > 1
        UNION ALL
        SELECT user_id::text
        FROM public.analytics_first_touches
        WHERE subject_type = 'user' AND user_id IS NOT NULL
        GROUP BY user_id HAVING count(*) > 1
        UNION ALL
        SELECT t.id::text
        FROM public.analytics_first_touches AS t
        WHERE t.first_session_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.analytics_sessions AS s WHERE s.id = t.first_session_id
          )
          AND (p_since IS NULL OR t.created_at >= p_since)
        UNION ALL
        SELECT t.id::text
        FROM public.analytics_first_touches AS t
        JOIN public.analytics_sessions AS s ON s.id = t.first_session_id
        WHERE t.subject_type = 'anonymous'
          AND s.anonymous_id IS DISTINCT FROM t.anonymous_id
          AND (p_since IS NULL OR t.created_at >= p_since)
        UNION ALL
        SELECT t.id::text
        FROM public.analytics_first_touches AS t
        WHERE t.confidence = 'exact'
          AND t.origin = 'historical_backfill'
          AND (p_since IS NULL OR t.created_at >= p_since)
        UNION ALL
        SELECT t.id::text
        FROM public.analytics_first_touches AS t
        JOIN public.analytics_sessions AS s ON s.id = t.first_session_id
        WHERE t.confidence = 'exact'
          AND (
            coalesce(s.is_bot, false)
            OR coalesce(s.is_test, false)
            OR coalesce(s.is_staff, false)
          )
          AND (p_since IS NULL OR t.created_at >= p_since)
      ) AS crit
    ),
    'warning', (
      SELECT count(*)::integer FROM (
        SELECT t.id
        FROM public.analytics_first_touches AS t
        JOIN public.analytics_sessions AS s ON s.id = t.first_session_id
        WHERE t.first_seen_at > s.started_at + interval '5 seconds'
          AND (p_since IS NULL OR t.created_at >= p_since)
        UNION ALL
        SELECT t.id
        FROM public.analytics_first_touches AS t
        WHERE t.subject_type = 'user'
          AND t.origin = 'identity_link'
          AND t.confidence = 'exact'
          AND NOT EXISTS (
            SELECT 1
            FROM public.analytics_identity_links AS l
            JOIN public.analytics_first_touches AS a
              ON a.subject_type = 'anonymous'
             AND a.anonymous_id = l.anonymous_id
            WHERE l.user_id = t.user_id
              AND l.unlinked_at IS NULL
              AND a.first_seen_at = t.first_seen_at
          )
          AND (p_since IS NULL OR t.created_at >= p_since)
      ) AS warn
    ),
    'totals', jsonb_build_object(
      'anonymous', (SELECT count(*)::integer FROM public.analytics_first_touches WHERE subject_type='anonymous'),
      'user', (SELECT count(*)::integer FROM public.analytics_first_touches WHERE subject_type='user'),
      'exact', (SELECT count(*)::integer FROM public.analytics_first_touches WHERE confidence='exact'),
      'inferred', (SELECT count(*)::integer FROM public.analytics_first_touches WHERE confidence='inferred'),
      'unknown', (SELECT count(*)::integer FROM public.analytics_first_touches WHERE confidence='unknown')
    )
  );
$$;

REVOKE ALL ON FUNCTION public.admin_first_touch_integrity_snapshot(timestamptz)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_first_touch_integrity_snapshot(timestamptz)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_first_touch_integrity_snapshot(timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.admin_first_touch_integrity_snapshot(timestamptz) IS
  'audiolad:p322; first-touch integrity; critical should stay 0';

-- ---------------------------------------------------------------------------
-- 7) Wire ensure into upsert_analytics_session (+ utm_term)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.upsert_analytics_session(
  uuid, text, text, text, text, text, text, text, text, text, text
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
  p_client_version text DEFAULT NULL,
  p_utm_term text DEFAULT NULL
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

      IF v_user_id IS NOT NULL THEN
        PERFORM public.ensure_user_first_touch(v_user_id);
      END IF;

      RETURN v_session_id;
    END IF;
  END IF;

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

    IF v_user_id IS NOT NULL THEN
      PERFORM public.ensure_user_first_touch(v_user_id);
    END IF;

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
    utm_term,
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
    public.sanitize_analytics_utm_value(p_utm_source),
    public.sanitize_analytics_utm_value(p_utm_medium),
    public.sanitize_analytics_utm_value(p_utm_campaign),
    public.sanitize_analytics_utm_value(p_utm_content),
    public.sanitize_analytics_utm_value(p_utm_term),
    public.sanitize_analytics_utm_value(p_referrer_domain),
    public.sanitize_checkout_origin_path(p_landing_path),
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

  PERFORM public.ensure_anonymous_first_touch(v_session_id);

  IF v_user_id IS NOT NULL THEN
    PERFORM public.ensure_user_first_touch(v_user_id);
  END IF;

  RETURN v_session_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_analytics_session(
  uuid, text, text, text, text, text, text, text, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_analytics_session(
  uuid, text, text, text, text, text, text, text, text, text, text, text
) TO anon;
GRANT EXECUTE ON FUNCTION public.upsert_analytics_session(
  uuid, text, text, text, text, text, text, text, text, text, text, text
) TO authenticated;

COMMENT ON FUNCTION public.upsert_analytics_session(
  uuid, text, text, text, text, text, text, text, text, text, text, text
) IS
  'audiolad:platform-analytics:p322; session upsert + write-time anonymous/user first-touch; utm_term optional';

-- ---------------------------------------------------------------------------
-- 8) Wire ensure into link_analytics_identity
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
  v_ft jsonb;
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

  -- Immutable user first-touch after active identity link.
  v_ft := public.ensure_user_first_touch(v_user_id);

  RETURN jsonb_build_object(
    'ok', true,
    'link_id', v_link_id,
    'closed_prior', v_closed,
    'is_staff', v_staff,
    'is_test', v_test,
    'first_touch', v_ft
  );
END;
$$;

REVOKE ALL ON FUNCTION public.link_analytics_identity(text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_analytics_identity(text, text, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9) Copy utm_term into order attribution snapshot (from DB session only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolve_order_attribution_snapshot(
  p_user_id uuid,
  p_analytics_session_id uuid,
  p_analytics_anonymous_id text,
  p_checkout_origin_path text
)
RETURNS TABLE (
  ok boolean,
  reason text,
  analytics_session_id uuid,
  analytics_anonymous_id text,
  attribution_user_id uuid,
  session_utm_source text,
  session_utm_medium text,
  session_utm_campaign text,
  session_utm_content text,
  session_utm_term text,
  session_referrer_domain text,
  session_landing_path text,
  checkout_origin_path text,
  attribution_confidence text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session public.analytics_sessions%ROWTYPE;
  v_anon text;
  v_origin text;
  v_identity_ok boolean := false;
BEGIN
  v_anon := nullif(btrim(coalesce(p_analytics_anonymous_id, '')), '');
  v_origin := public.sanitize_checkout_origin_path(p_checkout_origin_path);

  IF p_analytics_session_id IS NULL OR v_anon IS NULL THEN
    RETURN QUERY SELECT
      false, 'missing_claims'::text,
      NULL::uuid, NULL::text, NULL::uuid,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
      NULL::text, NULL::text, v_origin, 'unknown'::text;
    RETURN;
  END IF;

  SELECT s.*
  INTO v_session
  FROM public.analytics_sessions AS s
  WHERE s.id = p_analytics_session_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      false, 'session_missing'::text,
      NULL::uuid, NULL::text, NULL::uuid,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
      NULL::text, NULL::text, v_origin, 'unknown'::text;
    RETURN;
  END IF;

  IF v_session.anonymous_id IS DISTINCT FROM v_anon THEN
    RETURN QUERY SELECT
      false, 'anonymous_mismatch'::text,
      NULL::uuid, NULL::text, NULL::uuid,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
      NULL::text, NULL::text, v_origin, 'unknown'::text;
    RETURN;
  END IF;

  IF coalesce(v_session.is_bot, false) THEN
    RETURN QUERY SELECT
      false, 'session_bot'::text,
      NULL::uuid, NULL::text, NULL::uuid,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
      NULL::text, NULL::text, v_origin, 'unknown'::text;
    RETURN;
  END IF;

  IF v_session.last_seen_at < (now() - interval '30 minutes') THEN
    RETURN QUERY SELECT
      false, 'session_stale'::text,
      NULL::uuid, NULL::text, NULL::uuid,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
      NULL::text, NULL::text, v_origin, 'unknown'::text;
    RETURN;
  END IF;

  IF v_session.user_id IS NOT NULL THEN
    v_identity_ok := (v_session.user_id = p_user_id);
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.analytics_identity_links AS l
      WHERE l.anonymous_id = v_session.anonymous_id
        AND l.user_id = p_user_id
        AND l.unlinked_at IS NULL
    )
    INTO v_identity_ok;
  END IF;

  IF NOT v_identity_ok THEN
    RETURN QUERY SELECT
      false, 'identity_mismatch'::text,
      NULL::uuid, NULL::text, NULL::uuid,
      NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
      NULL::text, NULL::text, v_origin, 'unknown'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    true,
    'exact'::text,
    v_session.id,
    v_session.anonymous_id,
    p_user_id,
    left(v_session.utm_source, 128),
    left(v_session.utm_medium, 128),
    left(v_session.utm_campaign, 128),
    left(v_session.utm_content, 128),
    left(v_session.utm_term, 128),
    left(v_session.referrer_domain, 128),
    left(v_session.landing_path, 512),
    v_origin,
    'exact'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_order_attribution_snapshot(uuid, uuid, text, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_order_attribution_snapshot(uuid, uuid, text, text)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_order_attribution_snapshot(uuid, uuid, text, text)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 10) Post-checks
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.analytics_first_touches') IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: analytics_first_touches missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='analytics_sessions' AND column_name='utm_term'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: sessions.utm_term missing';
  END IF;

  IF public.classify_acquisition_source_class('google', 'cpc', 'x', NULL) IS DISTINCT FROM 'utm' THEN
    RAISE EXCEPTION 'Post-check failed: source classifier utm';
  END IF;

  IF public.classify_acquisition_source_class(NULL, NULL, NULL, NULL)
       IS DISTINCT FROM 'direct_or_unknown' THEN
    RAISE EXCEPTION 'Post-check failed: source classifier direct';
  END IF;
END
$$;

COMMIT;
