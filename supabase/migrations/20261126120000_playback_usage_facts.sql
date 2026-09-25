BEGIN;

-- Append-only trusted MEDIA-TIME for period analytics.
-- practice_listen_stats stays the cumulative rating-eligibility total and is
-- not a source for these facts. No historical backfill: listening_time_valid_from
-- is the moment this migration is applied in an environment.
--
-- Load (v1, no rollup): one row per heartbeat, including accepted 0, so retries
-- are unique at client_event_id. Cadence stays ~5s. 20 concurrent listeners
-- are about 3.5e5 rows/day. Admin sums use the partial index WHERE listened_ms > 0.
-- A later rollup may be derived; raw facts remain the source of truth.
--
-- listened_ms is a neutral usage fact, not a royalty amount. business_account_id,
-- venue_id, billing_period_start, royalty_eligible_ms and author_id_snapshot are
-- reserved for a future per-account ledger and are not populated as money.

CREATE TABLE IF NOT EXISTS public.playback_usage_settings (
  singleton boolean PRIMARY KEY DEFAULT true,
  listening_time_valid_from timestamptz NOT NULL,
  CONSTRAINT playback_usage_settings_singleton_check CHECK (singleton)
);

INSERT INTO public.playback_usage_settings (singleton, listening_time_valid_from)
VALUES (true, now())
ON CONFLICT (singleton) DO NOTHING;

COMMENT ON TABLE public.playback_usage_settings IS
  'audiolad:playback-usage; listening_time_valid_from is production activation of append-only MEDIA-TIME. Periods before it are unmeasured, not zero.';

CREATE TABLE IF NOT EXISTS public.playback_usage_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listening_key text NOT NULL,
  user_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  anonymous_id text NULL,
  visitor_key text NULL,
  session_id uuid NULL REFERENCES public.analytics_sessions (id) ON DELETE SET NULL,
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  audio_item_id uuid NULL REFERENCES public.audio_items (id) ON DELETE SET NULL,
  last_position_ms bigint NOT NULL DEFAULT 0,
  last_reported_at timestamptz NULL,
  accepted_listened_ms bigint NOT NULL DEFAULT 0,
  last_client_event_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz NULL,
  business_account_id uuid NULL,
  venue_id uuid NULL,
  CONSTRAINT playback_usage_contexts_listening_key_key UNIQUE (listening_key),
  CONSTRAINT playback_usage_contexts_listening_key_length_check
    CHECK (char_length(listening_key) BETWEEN 1 AND 200),
  CONSTRAINT playback_usage_contexts_last_position_check CHECK (last_position_ms >= 0),
  CONSTRAINT playback_usage_contexts_accepted_check CHECK (accepted_listened_ms >= 0)
);

COMMENT ON TABLE public.playback_usage_contexts IS
  'audiolad:playback-usage; baseline for one listening_key. Not an analytics aggregate. Two tabs are two keys.';

CREATE INDEX IF NOT EXISTS playback_usage_contexts_practice_idx
  ON public.playback_usage_contexts (practice_id);

CREATE TABLE IF NOT EXISTS public.playback_usage_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_event_id uuid NOT NULL,
  context_id uuid NOT NULL REFERENCES public.playback_usage_contexts (id) ON DELETE CASCADE,
  listening_key text NOT NULL,
  session_id uuid NULL REFERENCES public.analytics_sessions (id) ON DELETE SET NULL,
  user_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  anonymous_id text NULL,
  visitor_key text NULL,
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  audio_item_id uuid NULL REFERENCES public.audio_items (id) ON DELETE SET NULL,
  listened_ms bigint NOT NULL,
  position_ms bigint NOT NULL,
  prior_position_ms bigint NULL,
  playback_rate numeric NULL,
  phase text NOT NULL,
  reject_reason text NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  author_id_snapshot uuid NULL,
  business_account_id uuid NULL,
  venue_id uuid NULL,
  royalty_eligible_ms bigint NULL,
  billing_period_start date NULL,
  CONSTRAINT playback_usage_facts_client_event_id_key UNIQUE (client_event_id),
  CONSTRAINT playback_usage_facts_listened_ms_check CHECK (listened_ms >= 0),
  CONSTRAINT playback_usage_facts_position_ms_check CHECK (position_ms >= 0),
  CONSTRAINT playback_usage_facts_phase_check CHECK (
    phase IN ('advance', 'seek', 'pause', 'ended', 'track_change')
  ),
  CONSTRAINT playback_usage_facts_royalty_ms_check CHECK (
    royalty_eligible_ms IS NULL OR royalty_eligible_ms >= 0
  )
);

COMMENT ON TABLE public.playback_usage_facts IS
  'audiolad:playback-usage; append-only server-accepted MEDIA-TIME. listened_ms is usage, not a royalty. Idempotency is UNIQUE(client_event_id). author_id_snapshot is the product author at accept time for a future closed ledger; admin analytics still join the current practice author.';

COMMENT ON COLUMN public.playback_usage_facts.listened_ms IS
  'Server-accepted advance of media currentTime in milliseconds. Zero rows exist so a retry cannot be applied twice. Not wall-clock.';

COMMENT ON COLUMN public.playback_usage_facts.royalty_eligible_ms IS
  'Reserved. Not written in v1. Future per business account/venue royalty must not reuse listened_ms as money.';

CREATE INDEX IF NOT EXISTS playback_usage_facts_positive_occurred_idx
  ON public.playback_usage_facts (occurred_at)
  WHERE listened_ms > 0;

CREATE INDEX IF NOT EXISTS playback_usage_facts_positive_practice_occurred_idx
  ON public.playback_usage_facts (practice_id, occurred_at)
  WHERE listened_ms > 0;

CREATE INDEX IF NOT EXISTS playback_usage_facts_session_idx
  ON public.playback_usage_facts (session_id)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS playback_usage_facts_listening_key_idx
  ON public.playback_usage_facts (listening_key);

ALTER TABLE public.playback_usage_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playback_usage_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playback_usage_facts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.playback_usage_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.playback_usage_contexts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.playback_usage_facts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.playback_usage_settings TO service_role;
GRANT ALL ON TABLE public.playback_usage_contexts TO service_role;
GRANT ALL ON TABLE public.playback_usage_facts TO service_role;

CREATE OR REPLACE FUNCTION public.apply_playback_usage_heartbeat(
  p_client_event_id uuid,
  p_listening_key text,
  p_user_id uuid,
  p_anonymous_id text,
  p_session_id uuid,
  p_practice_id uuid,
  p_audio_item_id uuid,
  p_position_ms bigint,
  p_client_media_delta_ms bigint DEFAULT NULL,
  p_playback_rate numeric DEFAULT NULL,
  p_phase text DEFAULT 'advance',
  p_now timestamptz DEFAULT now()
)
RETURNS TABLE (
  accepted_ms bigint,
  duplicate boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := COALESCE(p_now, now());
  v_position bigint := GREATEST(COALESCE(p_position_ms, 0), 0);
  v_anonymous text := nullif(btrim(coalesce(p_anonymous_id, '')), '');
  v_session_id uuid := p_session_id;
  v_session_anonymous text;
  v_visitor text;
  v_author uuid;
  v_row public.playback_usage_contexts%ROWTYPE;
  v_accepted bigint := 0;
  v_reason text := NULL;
  v_elapsed_ms bigint := 0;
  v_wall_cap bigint := 0;
  v_candidate bigint := 0;
  v_life_ms bigint := 0;
  v_life_cap bigint := 0;
  v_budget bigint := 0;
  v_delta bigint := 0;
  v_existing bigint;
  v_prior bigint := 0;
  v_duplicate boolean := false;
  v_rate numeric := NULL;
BEGIN
  IF p_client_event_id IS NULL
    OR p_listening_key IS NULL
    OR btrim(p_listening_key) = ''
    OR char_length(p_listening_key) > 200
    OR p_practice_id IS NULL
    OR p_audio_item_id IS NULL
  THEN
    RAISE EXCEPTION 'playback_usage_invalid_args';
  END IF;

  IF p_phase IS NULL OR p_phase NOT IN ('advance', 'seek', 'pause', 'ended', 'track_change') THEN
    RAISE EXCEPTION 'playback_usage_invalid_phase';
  END IF;

  IF v_anonymous IS NOT NULL AND char_length(v_anonymous) > 128 THEN
    v_anonymous := NULL;
  END IF;

  IF v_session_id IS NOT NULL THEN
    SELECT s.anonymous_id
    INTO v_session_anonymous
    FROM public.analytics_sessions AS s
    WHERE s.id = v_session_id;

    IF NOT FOUND OR v_anonymous IS NULL OR v_session_anonymous IS DISTINCT FROM v_anonymous THEN
      v_session_id := NULL;
    END IF;
  END IF;

  -- Telemetry only. The wall cap below is always 1.5, never this value.
  IF p_playback_rate IS NOT NULL AND p_playback_rate > 0 AND p_playback_rate <= 4 THEN
    v_rate := p_playback_rate;
  END IF;

  SELECT f.listened_ms
  INTO v_existing
  FROM public.playback_usage_facts AS f
  WHERE f.client_event_id = p_client_event_id;

  IF FOUND THEN
    accepted_ms := v_existing;
    duplicate := true;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT pr.author_id
  INTO v_author
  FROM public.practices AS pr
  WHERE pr.id = p_practice_id;

  v_visitor := public.admin_analytics_visitor_key(p_user_id, v_anonymous, v_now);

  INSERT INTO public.playback_usage_contexts (
    listening_key,
    user_id,
    anonymous_id,
    visitor_key,
    session_id,
    practice_id,
    audio_item_id,
    last_position_ms,
    last_reported_at,
    accepted_listened_ms,
    created_at,
    updated_at
  ) VALUES (
    p_listening_key,
    p_user_id,
    v_anonymous,
    v_visitor,
    v_session_id,
    p_practice_id,
    p_audio_item_id,
    0,
    NULL,
    0,
    v_now,
    v_now
  )
  ON CONFLICT (listening_key) DO NOTHING;

  SELECT *
  INTO STRICT v_row
  FROM public.playback_usage_contexts
  WHERE listening_key = p_listening_key
  FOR UPDATE;

  SELECT f.listened_ms
  INTO v_existing
  FROM public.playback_usage_facts AS f
  WHERE f.client_event_id = p_client_event_id;

  IF FOUND THEN
    accepted_ms := v_existing;
    duplicate := true;
    RETURN NEXT;
    RETURN;
  END IF;

  v_prior := v_row.last_position_ms;

  IF v_row.last_reported_at IS NULL THEN
    v_accepted := 0;
    v_reason := 'baseline';
  ELSIF p_phase = 'seek' THEN
    v_accepted := 0;
    v_reason := 'seek';
  ELSIF p_phase = 'track_change' OR v_row.audio_item_id IS DISTINCT FROM p_audio_item_id THEN
    v_accepted := 0;
    v_reason := 'track_change';
  ELSE
    v_delta := v_position - v_row.last_position_ms;

    IF v_delta <= 0 THEN
      v_accepted := 0;
      v_reason := 'non_positive';
    ELSE
      v_elapsed_ms := GREATEST(
        0,
        FLOOR(EXTRACT(EPOCH FROM (v_now - v_row.last_reported_at)) * 1000)
      )::bigint;
      v_wall_cap := FLOOR(v_elapsed_ms * 1.5)::bigint;
      v_candidate := v_delta;

      IF p_client_media_delta_ms IS NOT NULL AND p_client_media_delta_ms >= 0 THEN
        v_candidate := LEAST(v_candidate, p_client_media_delta_ms);
      END IF;

      -- Clearly impossible jump: do not cap-credit a seek. Adopt the new position.
      IF v_candidate > v_wall_cap + 2000 AND v_candidate > v_wall_cap * 2 THEN
        v_accepted := 0;
        v_reason := 'impossible';
      ELSE
        v_accepted := LEAST(v_candidate, v_wall_cap);
        v_life_ms := GREATEST(
          0,
          FLOOR(EXTRACT(EPOCH FROM (v_now - v_row.created_at)) * 1000)
        )::bigint;
        v_life_cap := FLOOR(v_life_ms * 1.5)::bigint;
        v_budget := v_life_cap - v_row.accepted_listened_ms;

        IF v_budget < 0 THEN
          v_budget := 0;
        END IF;

        v_accepted := LEAST(v_accepted, v_budget);

        IF v_accepted < 0 THEN
          v_accepted := 0;
        END IF;

        IF v_accepted = 0 THEN
          v_reason := 'non_positive';
        END IF;
      END IF;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.playback_usage_facts (
      client_event_id,
      context_id,
      listening_key,
      session_id,
      user_id,
      anonymous_id,
      visitor_key,
      practice_id,
      audio_item_id,
      listened_ms,
      position_ms,
      prior_position_ms,
      playback_rate,
      phase,
      reject_reason,
      occurred_at,
      author_id_snapshot
    ) VALUES (
      p_client_event_id,
      v_row.id,
      p_listening_key,
      v_session_id,
      p_user_id,
      v_anonymous,
      v_visitor,
      p_practice_id,
      p_audio_item_id,
      v_accepted,
      v_position,
      v_prior,
      v_rate,
      p_phase,
      v_reason,
      v_now,
      v_author
    );

    UPDATE public.playback_usage_contexts
    SET
      user_id = COALESCE(p_user_id, user_id),
      anonymous_id = COALESCE(v_anonymous, anonymous_id),
      visitor_key = COALESCE(v_visitor, visitor_key),
      session_id = COALESCE(v_session_id, session_id),
      audio_item_id = p_audio_item_id,
      last_position_ms = v_position,
      last_reported_at = v_now,
      accepted_listened_ms = accepted_listened_ms + v_accepted,
      last_client_event_id = p_client_event_id,
      updated_at = v_now,
      ended_at = CASE WHEN p_phase = 'ended' THEN v_now ELSE ended_at END
    WHERE id = v_row.id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT f.listened_ms
      INTO v_existing
      FROM public.playback_usage_facts AS f
      WHERE f.client_event_id = p_client_event_id;

      v_accepted := COALESCE(v_existing, 0);
      v_duplicate := true;
  END;

  accepted_ms := v_accepted;
  duplicate := v_duplicate;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.apply_playback_usage_heartbeat(
  uuid, text, uuid, text, uuid, uuid, uuid, bigint, bigint, numeric, text, timestamptz
) IS
  'audiolad:playback-usage; atomic MEDIA-TIME accept. service_role only. Does not update practice_listen_stats. Client playback_rate cannot raise the 1.5x wall or lifetime cap. Gaps are not awarded as wall-clock; only currentTime advance within the cap counts. Seek and impossible jumps accept +0 and move the baseline. UNIQUE(client_event_id) makes retries idempotent.';

REVOKE ALL ON FUNCTION public.apply_playback_usage_heartbeat(
  uuid, text, uuid, text, uuid, uuid, uuid, bigint, bigint, numeric, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_playback_usage_heartbeat(
  uuid, text, uuid, text, uuid, uuid, uuid, bigint, bigint, numeric, text, timestamptz
) TO service_role;

-- Filtered positive facts for admin period analytics.
-- Author filter uses the current practice author. UTM and device use the linked
-- analytics session (session-touch), the same predicate as product events.
CREATE OR REPLACE FUNCTION public.playback_usage_admin_facts(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_device_type text DEFAULT NULL
)
RETURNS TABLE (
  practice_id uuid,
  audio_item_id uuid,
  listened_ms bigint,
  occurred_at timestamptz,
  visitor_key text,
  session_id uuid,
  user_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    f.practice_id,
    f.audio_item_id,
    f.listened_ms,
    f.occurred_at,
    public.admin_analytics_visitor_key(
      f.user_id,
      coalesce(s.anonymous_id, f.anonymous_id),
      f.occurred_at
    ),
    f.session_id,
    f.user_id
  FROM public.playback_usage_facts AS f
  JOIN public.practices AS pr ON pr.id = f.practice_id
  LEFT JOIN public.analytics_sessions AS s ON s.id = f.session_id
  WHERE f.listened_ms > 0
    AND (p_from IS NULL OR f.occurred_at >= p_from)
    AND (p_to IS NULL OR f.occurred_at < p_to)
    AND (p_author_id IS NULL OR pr.author_id = p_author_id)
    AND (p_practice_id IS NULL OR f.practice_id = p_practice_id)
    AND public.admin_analytics_p2_utm_matches(p_utm_source, s.utm_source)
    AND (
      nullif(btrim(coalesce(p_device_type, '')), '') IS NULL
      OR s.device_type = nullif(btrim(coalesce(p_device_type, '')), '')
    )
    AND (
      coalesce(p_include_test, false)
      OR NOT (
        coalesce(public.is_test_anonymous_id(f.anonymous_id), false)
        OR coalesce(public.is_test_anonymous_id(s.anonymous_id), false)
        OR (f.user_id IS NOT NULL AND coalesce(public.is_platform_staff(f.user_id), false))
        OR (f.user_id IS NOT NULL AND coalesce(public.is_analytics_test_user(f.user_id), false))
        OR coalesce(s.is_staff, false)
        OR coalesce(s.is_test, false)
        OR coalesce(s.is_bot, false)
        OR coalesce(s.traffic_class, 'human') <> 'human'
        OR coalesce(public.is_test_analytics_session(s.utm_campaign, coalesce(s.anonymous_id, f.anonymous_id)), false)
      )
    )
    AND (
      f.user_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.author_members AS am
        WHERE am.author_id = pr.author_id
          AND am.user_id = f.user_id
      )
    );
$$;

COMMENT ON FUNCTION public.playback_usage_admin_facts(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) IS
  'audiolad:playback-usage; positive listened_ms facts with the existing admin session-touch and self-traffic filters.';

REVOKE ALL ON FUNCTION public.playback_usage_admin_facts(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.playback_usage_admin_facts(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_analytics_listening_time(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_device_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_valid_from timestamptz;
  v_unmeasured boolean := false;
  v_partial boolean := false;
  v_listened bigint := 0;
BEGIN
  SELECT s.listening_time_valid_from
  INTO v_valid_from
  FROM public.playback_usage_settings AS s
  WHERE s.singleton;

  v_unmeasured := p_to IS NOT NULL AND v_valid_from IS NOT NULL AND p_to <= v_valid_from;
  v_partial := NOT v_unmeasured
    AND v_valid_from IS NOT NULL
    AND (p_from IS NULL OR p_from < v_valid_from);

  IF NOT v_unmeasured THEN
    SELECT coalesce(sum(f.listened_ms), 0)::bigint
    INTO v_listened
    FROM public.playback_usage_admin_facts(
      p_from, p_to, p_include_test, p_author_id, p_practice_id, p_utm_source, p_device_type
    ) AS f;
  END IF;

  RETURN jsonb_build_object(
    'listened_ms', CASE WHEN v_unmeasured THEN NULL ELSE v_listened END,
    'valid_from', v_valid_from,
    'partial', v_partial,
    'unmeasured', v_unmeasured
  );
END;
$$;

COMMENT ON FUNCTION public.admin_analytics_listening_time(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) IS
  'audiolad:playback-usage; SUM(listened_ms) for the admin activity cards. Null when the whole window is before listening_time_valid_from.';

REVOKE ALL ON FUNCTION public.admin_analytics_listening_time(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_listening_time(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) TO service_role;

-- Bucket policy matches admin_analytics_p2_timeseries: Europe/Moscow,
-- day when the span is <= 120 days, otherwise week, at most 400 recent points.
CREATE OR REPLACE FUNCTION public.admin_analytics_listening_time_timeseries(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_device_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tz constant text := 'Europe/Moscow';
  v_max_points constant int := 400;
  v_include_test boolean := coalesce(p_include_test, false);
  v_from timestamptz;
  v_to timestamptz;
  v_earliest timestamptz;
  v_span_days numeric;
  v_granularity text;
  v_step interval;
  v_start_local timestamp;
  v_end_local timestamp;
  v_points int;
  v_data_from timestamptz;
  v_valid_from timestamptz;
  v_result jsonb;
BEGIN
  SELECT s.listening_time_valid_from
  INTO v_valid_from
  FROM public.playback_usage_settings AS s
  WHERE s.singleton;

  v_to := coalesce(p_to, now());

  IF p_from IS NOT NULL THEN
    v_from := p_from;
  ELSE
    SELECT least(
      (SELECT min(s.started_at) FROM public.analytics_sessions AS s WHERE s.started_at < v_to),
      (SELECT min(e.occurred_at) FROM public.analytics_events AS e WHERE e.occurred_at < v_to)
    )
    INTO v_earliest;

    v_from := coalesce(v_earliest, v_to - interval '29 days');
  END IF;

  IF v_from >= v_to THEN
    v_from := v_to - interval '1 day';
  END IF;

  v_span_days := extract(epoch FROM (v_to - v_from)) / 86400.0;

  IF v_span_days > 120 THEN
    v_granularity := 'week';
    v_step := interval '7 days';
  ELSE
    v_granularity := 'day';
    v_step := interval '1 day';
  END IF;

  v_start_local := date_trunc(v_granularity, (v_from AT TIME ZONE v_tz));
  v_end_local := date_trunc(
    v_granularity,
    ((v_to - interval '1 microsecond') AT TIME ZONE v_tz)
  );

  IF v_end_local < v_start_local THEN
    v_end_local := v_start_local;
  END IF;

  v_points := 1 + floor(
    extract(epoch FROM (v_end_local - v_start_local)) / extract(epoch FROM v_step)
  )::int;

  IF v_points > v_max_points THEN
    v_start_local := v_end_local - (v_step * (v_max_points - 1));
    v_points := v_max_points;
  END IF;

  v_data_from := greatest(v_start_local AT TIME ZONE v_tz, v_from);

  WITH buckets AS (
    SELECT g AS bucket_local
    FROM generate_series(v_start_local, v_end_local, v_step) AS g
  ),
  usage_points AS (
    SELECT
      date_trunc(v_granularity, f.occurred_at AT TIME ZONE v_tz) AS bucket_local,
      sum(f.listened_ms)::bigint AS listened_ms
    FROM public.playback_usage_admin_facts(
      v_data_from, v_to, v_include_test, p_author_id, p_practice_id, p_utm_source, p_device_type
    ) AS f
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'granularity', v_granularity,
    'valid_from', v_valid_from,
    'points', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'bucket', to_char(b.bucket_local, 'YYYY-MM-DD'),
          'listened_ms', CASE
            WHEN v_valid_from IS NOT NULL
              AND ((b.bucket_local + v_step) AT TIME ZONE v_tz) <= v_valid_from
              THEN NULL
            ELSE coalesce(up.listened_ms, 0)
          END
        )
        ORDER BY b.bucket_local
      )
      FROM buckets AS b
      LEFT JOIN usage_points AS up ON up.bucket_local = b.bucket_local
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN coalesce(
    v_result,
    jsonb_build_object('granularity', v_granularity, 'valid_from', v_valid_from, 'points', '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.admin_analytics_listening_time_timeseries(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) IS
  'audiolad:playback-usage; listening time buckets aligned with admin_analytics_p2_timeseries. Buckets that end before listening_time_valid_from are JSON null, not zero.';

REVOKE ALL ON FUNCTION public.admin_analytics_listening_time_timeseries(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_analytics_listening_time_timeseries(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) TO service_role;

-- Additive listened_ms on the existing practices breakdown. Other sort keys
-- and event counts are unchanged. listened_ms sorts on the server for Top N.
CREATE OR REPLACE FUNCTION public.admin_analytics_p2_practices(
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_author_id uuid DEFAULT NULL,
  p_practice_id uuid DEFAULT NULL,
  p_utm_source text DEFAULT NULL,
  p_device_type text DEFAULT NULL,
  p_sort text DEFAULT 'play_starts',
  p_sort_dir text DEFAULT 'desc',
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_include_test boolean := coalesce(p_include_test, false);
  v_device text := nullif(btrim(coalesce(p_device_type, '')), '');
  v_sort text := lower(btrim(coalesce(p_sort, '')));
  v_dir text := lower(btrim(coalesce(p_sort_dir, '')));
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_valid_from timestamptz;
  v_partial boolean := false;
  v_unmeasured boolean := false;
  v_result jsonb;
BEGIN
  IF v_sort NOT IN (
    'views', 'play_starts', 'listeners', 'completions', 'saves',
    'view_to_play', 'play_to_complete', 'listened_ms'
  ) THEN
    v_sort := 'play_starts';
  END IF;

  IF v_dir NOT IN ('asc', 'desc') THEN
    v_dir := 'desc';
  END IF;

  SELECT s.listening_time_valid_from
  INTO v_valid_from
  FROM public.playback_usage_settings AS s
  WHERE s.singleton;

  v_unmeasured := p_to IS NOT NULL AND v_valid_from IS NOT NULL AND p_to <= v_valid_from;
  v_partial := NOT v_unmeasured
    AND v_valid_from IS NOT NULL
    AND (p_from IS NULL OR p_from < v_valid_from);

  WITH included_events AS (
    SELECT practice_id, event_name, visitor_key
    FROM public.analytics_product_event_facts(
      p_from, p_to, p_author_id, p_practice_id, v_include_test
    )
    WHERE practice_id IS NOT NULL
      AND public.admin_analytics_p2_utm_matches(p_utm_source, utm_source)
      AND (v_device IS NULL OR device_type = v_device)
  ),
  usage_by_practice AS (
    SELECT practice_id, coalesce(sum(listened_ms), 0)::bigint AS listened_ms
    FROM public.playback_usage_admin_facts(
      p_from, p_to, v_include_test, p_author_id, p_practice_id, p_utm_source, p_device_type
    )
    GROUP BY practice_id
  ),
  practice_ids AS (
    SELECT practice_id FROM included_events
    UNION
    SELECT practice_id FROM usage_by_practice
  ),
  practice_stats AS (
    SELECT
      ids.practice_id,
      count(*) FILTER (WHERE e.event_name = 'practice_view')::int AS views,
      count(DISTINCT e.visitor_key) FILTER (
        WHERE e.event_name = 'practice_view' AND e.visitor_key IS NOT NULL
      )::int AS unique_visitors,
      count(*) FILTER (WHERE e.event_name = 'audio_play_started')::int AS play_starts,
      count(DISTINCT e.visitor_key) FILTER (
        WHERE e.event_name = 'audio_play_started' AND e.visitor_key IS NOT NULL
      )::int AS unique_listeners,
      count(*) FILTER (WHERE e.event_name = 'audio_completed')::int AS completions,
      count(DISTINCT e.visitor_key) FILTER (
        WHERE e.event_name = 'audio_completed' AND e.visitor_key IS NOT NULL
      )::int AS unique_completers,
      count(*) FILTER (WHERE e.event_name = 'first_manual_library_save')::int AS saves,
      count(DISTINCT e.visitor_key) FILTER (
        WHERE e.event_name = 'first_manual_library_save' AND e.visitor_key IS NOT NULL
      )::int AS unique_savers,
      coalesce(max(u.listened_ms), 0)::bigint AS listened_ms
    FROM practice_ids AS ids
    LEFT JOIN included_events AS e ON e.practice_id = ids.practice_id
    LEFT JOIN usage_by_practice AS u ON u.practice_id = ids.practice_id
    GROUP BY ids.practice_id
  ),
  ranked AS (
    SELECT
      ps.*,
      CASE v_sort
        WHEN 'views' THEN ps.views::numeric
        WHEN 'play_starts' THEN ps.play_starts::numeric
        WHEN 'listeners' THEN ps.unique_listeners::numeric
        WHEN 'completions' THEN ps.completions::numeric
        WHEN 'saves' THEN ps.saves::numeric
        WHEN 'view_to_play'
          THEN coalesce(ps.play_starts::numeric / nullif(ps.views, 0)::numeric, 0)
        WHEN 'play_to_complete'
          THEN coalesce(ps.completions::numeric / nullif(ps.play_starts, 0)::numeric, 0)
        WHEN 'listened_ms' THEN ps.listened_ms::numeric
        ELSE ps.play_starts::numeric
      END AS sort_value
    FROM practice_stats AS ps
  ),
  page AS (
    SELECT *
    FROM ranked
    ORDER BY
      CASE WHEN v_dir = 'asc' THEN sort_value END ASC NULLS LAST,
      CASE WHEN v_dir = 'desc' THEN sort_value END DESC NULLS LAST,
      play_starts DESC,
      views DESC,
      practice_id ASC
    LIMIT v_limit OFFSET v_offset
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*)::int FROM practice_stats),
    'listeningTimeValidFrom', v_valid_from,
    'listeningTimePartial', v_partial,
    'listeningTimeUnmeasured', v_unmeasured,
    'rows', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'practiceId', pg.practice_id,
          'title', coalesce(nullif(btrim(pr.title), ''), 'Практика'),
          'authorId', pr.author_id,
          'authorName', coalesce(nullif(btrim(a.name), ''), 'Автор'),
          'authorSlug', a.slug,
          'practiceSlug', pr.slug,
          'href', CASE
            WHEN nullif(btrim(coalesce(a.slug, '')), '') IS NOT NULL
              AND nullif(btrim(coalesce(pr.slug, '')), '') IS NOT NULL
              THEN '/practice/' || btrim(a.slug) || '/' || btrim(pr.slug)
            ELSE NULL
          END,
          'views', pg.views,
          'uniqueVisitors', pg.unique_visitors,
          'playStarts', pg.play_starts,
          'uniqueListeners', pg.unique_listeners,
          'completions', pg.completions,
          'uniqueCompleters', pg.unique_completers,
          'saves', pg.saves,
          'uniqueSavers', pg.unique_savers,
          'listenedMs', CASE WHEN v_unmeasured THEN NULL ELSE pg.listened_ms END
        )
        ORDER BY
          CASE WHEN v_dir = 'asc' THEN pg.sort_value END ASC NULLS LAST,
          CASE WHEN v_dir = 'desc' THEN pg.sort_value END DESC NULLS LAST,
          pg.play_starts DESC,
          pg.views DESC,
          pg.practice_id ASC
      )
      FROM page AS pg
      LEFT JOIN public.practices AS pr ON pr.id = pg.practice_id
      LEFT JOIN public.authors AS a ON a.id = pr.author_id
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN coalesce(v_result, jsonb_build_object('total', 0, 'rows', '[]'::jsonb));
END;
$$;

COMMENT ON FUNCTION public.admin_analytics_p2_practices(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text, text, text, int, int
) IS
  'audiolad:platform-analytics:p2; per-practice aggregates. Event counts are unchanged. listened_ms is additive trusted MEDIA-TIME and a server sort key. Pagination applies to aggregated practice rows; total is the number of matching practices.';

COMMIT;
