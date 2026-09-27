BEGIN;

-- Foundation A3: B2B Playback Attribution into existing playback_usage_facts.
-- Single ledger. usage_kind consumer|business. Evidence only — not Qualified Usage / Royalty.
-- Expand-only. No second ledger. No Business UI. No Music Passport. No Rights.

-- ---------------------------------------------------------------------------
-- Schema: discriminator + canonical B2B snapshot columns (no destructive FK)
-- ---------------------------------------------------------------------------

ALTER TABLE public.playback_usage_contexts
  ADD COLUMN IF NOT EXISTS usage_kind text NOT NULL DEFAULT 'consumer',
  ADD COLUMN IF NOT EXISTS organization_id uuid NULL,
  ADD COLUMN IF NOT EXISTS location_id uuid NULL,
  ADD COLUMN IF NOT EXISTS zone_id uuid NULL,
  ADD COLUMN IF NOT EXISTS player_id uuid NULL;

ALTER TABLE public.playback_usage_facts
  ADD COLUMN IF NOT EXISTS usage_kind text NOT NULL DEFAULT 'consumer',
  ADD COLUMN IF NOT EXISTS organization_id uuid NULL,
  ADD COLUMN IF NOT EXISTS location_id uuid NULL,
  ADD COLUMN IF NOT EXISTS zone_id uuid NULL,
  ADD COLUMN IF NOT EXISTS player_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'playback_usage_contexts_usage_kind_check'
      AND conrelid = 'public.playback_usage_contexts'::regclass
  ) THEN
    ALTER TABLE public.playback_usage_contexts
      ADD CONSTRAINT playback_usage_contexts_usage_kind_check
      CHECK (usage_kind IN ('consumer', 'business'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'playback_usage_contexts_usage_kind_attribution_check'
      AND conrelid = 'public.playback_usage_contexts'::regclass
  ) THEN
    ALTER TABLE public.playback_usage_contexts
      ADD CONSTRAINT playback_usage_contexts_usage_kind_attribution_check
      CHECK (
        (
          usage_kind = 'consumer'
          AND organization_id IS NULL
          AND location_id IS NULL
          AND zone_id IS NULL
          AND player_id IS NULL
        )
        OR (
          usage_kind = 'business'
          AND organization_id IS NOT NULL
          AND location_id IS NOT NULL
          AND zone_id IS NOT NULL
          AND player_id IS NOT NULL
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'playback_usage_facts_usage_kind_check'
      AND conrelid = 'public.playback_usage_facts'::regclass
  ) THEN
    ALTER TABLE public.playback_usage_facts
      ADD CONSTRAINT playback_usage_facts_usage_kind_check
      CHECK (usage_kind IN ('consumer', 'business'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'playback_usage_facts_usage_kind_attribution_check'
      AND conrelid = 'public.playback_usage_facts'::regclass
  ) THEN
    ALTER TABLE public.playback_usage_facts
      ADD CONSTRAINT playback_usage_facts_usage_kind_attribution_check
      CHECK (
        (
          usage_kind = 'consumer'
          AND organization_id IS NULL
          AND location_id IS NULL
          AND zone_id IS NULL
          AND player_id IS NULL
        )
        OR (
          usage_kind = 'business'
          AND organization_id IS NOT NULL
          AND location_id IS NOT NULL
          AND zone_id IS NOT NULL
          AND player_id IS NOT NULL
        )
      );
  END IF;
END
$$;

COMMENT ON COLUMN public.playback_usage_facts.usage_kind IS
  'audiolad:playback-usage; consumer vs business discriminator. Existing rows default consumer. Not inferred from user_id.';

COMMENT ON COLUMN public.playback_usage_facts.organization_id IS
  'audiolad:playback-usage; B2B Organization snapshot at accept. No FK — historical Proof of Play survives org changes.';

COMMENT ON COLUMN public.playback_usage_facts.location_id IS
  'audiolad:playback-usage; B2B Location snapshot at accept. No FK.';

COMMENT ON COLUMN public.playback_usage_facts.zone_id IS
  'audiolad:playback-usage; B2B Zone snapshot at accept. No FK.';

COMMENT ON COLUMN public.playback_usage_facts.player_id IS
  'audiolad:playback-usage; B2B Player snapshot at accept. No FK.';

COMMENT ON COLUMN public.playback_usage_facts.business_account_id IS
  'Reserved legacy/compatibility. Not canonical B2B attribution. A3 does not populate.';

COMMENT ON COLUMN public.playback_usage_facts.venue_id IS
  'Reserved legacy/compatibility. Not canonical B2B attribution. A3 does not populate.';

CREATE INDEX IF NOT EXISTS playback_usage_facts_business_org_occurred_idx
  ON public.playback_usage_facts (organization_id, occurred_at)
  WHERE usage_kind = 'business' AND listened_ms > 0;

CREATE INDEX IF NOT EXISTS playback_usage_facts_business_player_occurred_idx
  ON public.playback_usage_facts (player_id, occurred_at)
  WHERE usage_kind = 'business' AND listened_ms > 0;

-- ---------------------------------------------------------------------------
-- Consumer analytics isolation: filter usage_kind = consumer
-- ---------------------------------------------------------------------------

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
  user_id uuid,
  author_id_snapshot uuid
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
    f.user_id,
    coalesce(f.author_id_snapshot, pr.author_id)
  FROM public.playback_usage_facts AS f
  LEFT JOIN public.practices AS pr ON pr.id = f.practice_id
  LEFT JOIN public.analytics_sessions AS s ON s.id = f.session_id
  WHERE f.listened_ms > 0
    AND f.usage_kind = 'consumer'
    AND (p_from IS NULL OR f.occurred_at >= p_from)
    AND (p_to IS NULL OR f.occurred_at < p_to)
    AND (
      p_author_id IS NULL
      OR coalesce(f.author_id_snapshot, pr.author_id) = p_author_id
    )
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
        WHERE am.author_id = coalesce(f.author_id_snapshot, pr.author_id)
          AND am.user_id = f.user_id
      )
    );
$$;

COMMENT ON FUNCTION public.playback_usage_admin_facts(
  timestamptz, timestamptz, boolean, uuid, uuid, text, text
) IS
  'audiolad:playback-usage; consumer-only positive facts for admin period analytics. Excludes usage_kind=business.';

CREATE OR REPLACE FUNCTION public.author_stats_listening_facts(
  p_author_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
RETURNS TABLE (
  practice_id uuid,
  listened_ms bigint,
  occurred_at timestamptz,
  listening_day date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    f.practice_id,
    f.listened_ms,
    f.occurred_at,
    (f.occurred_at AT TIME ZONE 'Europe/Moscow')::date
  FROM public.playback_usage_facts AS f
  LEFT JOIN public.analytics_sessions AS s ON s.id = f.session_id
  WHERE f.listened_ms > 0
    AND f.usage_kind = 'consumer'
    AND f.author_id_snapshot = p_author_id
    AND (p_from IS NULL OR f.occurred_at >= p_from)
    AND (p_to IS NULL OR f.occurred_at < p_to)
    AND NOT (
      coalesce(public.is_test_anonymous_id(f.anonymous_id), false)
      OR coalesce(public.is_test_anonymous_id(s.anonymous_id), false)
      OR (f.user_id IS NOT NULL AND coalesce(public.is_platform_staff(f.user_id), false))
      OR (f.user_id IS NOT NULL AND coalesce(public.is_analytics_test_user(f.user_id), false))
      OR coalesce(s.is_staff, false)
      OR coalesce(s.is_test, false)
      OR coalesce(s.is_bot, false)
      OR coalesce(s.traffic_class, 'human') <> 'human'
      OR coalesce(
        public.is_test_analytics_session(
          s.utm_campaign,
          coalesce(s.anonymous_id, f.anonymous_id)
        ),
        false
      )
    )
    AND (
      f.user_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.author_members AS am
        WHERE am.author_id = p_author_id
          AND am.user_id = f.user_id
      )
    );
$$;

COMMENT ON FUNCTION public.author_stats_listening_facts(uuid, timestamptz, timestamptz) IS
  'audiolad:author-stats; consumer-only listened_ms for one author_id_snapshot. Excludes usage_kind=business.';


-- ---------------------------------------------------------------------------
-- apply_playback_usage_heartbeat: copy attribution from context; identity-safe duplicate
-- Consumer signature and media-time acceptance unchanged.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_playback_usage_heartbeat(
  p_client_event_id uuid,
  p_listening_key text,
  p_sample_seq bigint,
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
  v_existing_kind text;
  v_existing_player uuid;
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
    OR p_sample_seq IS NULL
    OR p_sample_seq < 1
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

  IF p_playback_rate IS NOT NULL AND p_playback_rate > 0 AND p_playback_rate <= 4 THEN
    v_rate := p_playback_rate;
  END IF;

  SELECT pr.author_id
  INTO v_author
  FROM public.practices AS pr
  WHERE pr.id = p_practice_id;

  v_visitor := public.admin_analytics_visitor_key(p_user_id, v_anonymous, v_now);

  -- Consumer contexts only; B2B wrapper pre-upserts business context with attribution.
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
    updated_at,
    usage_kind
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
    v_now,
    'consumer'
  )
  ON CONFLICT (listening_key) DO NOTHING;

  SELECT *
  INTO STRICT v_row
  FROM public.playback_usage_contexts
  WHERE listening_key = p_listening_key
  FOR UPDATE;

  SELECT f.listened_ms, f.usage_kind, f.player_id
  INTO v_existing, v_existing_kind, v_existing_player
  FROM public.playback_usage_facts AS f
  WHERE f.client_event_id = p_client_event_id;

  IF FOUND THEN
    IF v_row.usage_kind = 'business' THEN
      IF v_existing_kind IS DISTINCT FROM 'business'
         OR v_existing_player IS DISTINCT FROM v_row.player_id THEN
        RAISE EXCEPTION 'client_event_identity_conflict' USING ERRCODE = '42501';
      END IF;
    ELSE
      IF v_existing_kind IS DISTINCT FROM 'consumer' THEN
        RAISE EXCEPTION 'client_event_identity_conflict' USING ERRCODE = '42501';
      END IF;
    END IF;
    accepted_ms := v_existing;
    duplicate := true;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_row.last_client_event_id = p_client_event_id
    OR p_sample_seq <= v_row.last_sample_seq
  THEN
    accepted_ms := 0;
    duplicate := v_row.last_client_event_id = p_client_event_id;
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

  IF v_accepted > 0 THEN
    BEGIN
      INSERT INTO public.playback_usage_facts (
        client_event_id,
        sample_seq,
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
        author_id_snapshot,
        usage_kind,
        organization_id,
        location_id,
        zone_id,
        player_id
      ) VALUES (
        p_client_event_id,
        p_sample_seq,
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
        v_author,
        v_row.usage_kind,
        v_row.organization_id,
        v_row.location_id,
        v_row.zone_id,
        v_row.player_id
      );

      UPDATE public.playback_usage_contexts
      SET
        user_id = COALESCE(p_user_id, user_id),
        anonymous_id = COALESCE(v_anonymous, anonymous_id),
        visitor_key = COALESCE(v_visitor, visitor_key),
        session_id = COALESCE(v_session_id, session_id),
        audio_item_id = p_audio_item_id,
        practice_id = p_practice_id,
        last_position_ms = v_position,
        last_reported_at = v_now,
        accepted_listened_ms = accepted_listened_ms + v_accepted,
        last_client_event_id = p_client_event_id,
        last_sample_seq = p_sample_seq,
        updated_at = v_now,
        ended_at = CASE WHEN p_phase = 'ended' THEN v_now ELSE ended_at END
      WHERE id = v_row.id;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT f.listened_ms, f.usage_kind, f.player_id
        INTO v_existing, v_existing_kind, v_existing_player
        FROM public.playback_usage_facts AS f
        WHERE f.client_event_id = p_client_event_id;

        IF v_row.usage_kind = 'business' THEN
          IF v_existing_kind IS DISTINCT FROM 'business'
             OR v_existing_player IS DISTINCT FROM v_row.player_id THEN
            RAISE EXCEPTION 'client_event_identity_conflict' USING ERRCODE = '42501';
          END IF;
        ELSE
          IF v_existing_kind IS DISTINCT FROM 'consumer' THEN
            RAISE EXCEPTION 'client_event_identity_conflict' USING ERRCODE = '42501';
          END IF;
        END IF;

        v_accepted := COALESCE(v_existing, 0);
        v_duplicate := true;
    END;
  ELSE
    UPDATE public.playback_usage_contexts
    SET
      user_id = COALESCE(p_user_id, user_id),
      anonymous_id = COALESCE(v_anonymous, anonymous_id),
      visitor_key = COALESCE(v_visitor, visitor_key),
      session_id = COALESCE(v_session_id, session_id),
      audio_item_id = p_audio_item_id,
      practice_id = p_practice_id,
      last_position_ms = v_position,
      last_reported_at = v_now,
      last_client_event_id = p_client_event_id,
      last_sample_seq = p_sample_seq,
      updated_at = v_now,
      ended_at = CASE WHEN p_phase = 'ended' THEN v_now ELSE ended_at END
    WHERE id = v_row.id;
  END IF;

  accepted_ms := v_accepted;
  duplicate := v_duplicate;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.apply_playback_usage_heartbeat(
  uuid, text, bigint, uuid, text, uuid, uuid, uuid, bigint, bigint, numeric, text, timestamptz
) IS
  'audiolad:playback-usage; atomic MEDIA-TIME accept. Copies usage_kind and B2B attribution snapshots from context. Identity-safe client_event_id duplicates. service_role only for consumer path.';

REVOKE ALL ON FUNCTION public.apply_playback_usage_heartbeat(
  uuid, text, bigint, uuid, text, uuid, uuid, uuid, bigint, bigint, numeric, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_playback_usage_heartbeat(
  uuid, text, bigint, uuid, text, uuid, uuid, uuid, bigint, bigint, numeric, text, timestamptz
) TO service_role;


-- ---------------------------------------------------------------------------
-- apply_business_playback_usage_heartbeat (machine credential; media-time)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_business_playback_usage_heartbeat(
  p_credential text,
  p_client_event_id uuid,
  p_playback_session_id uuid,
  p_sample_seq bigint,
  p_audio_item_id uuid,
  p_position_ms bigint,
  p_client_media_delta_ms bigint DEFAULT NULL,
  p_playback_rate numeric DEFAULT NULL,
  p_phase text DEFAULT 'advance'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cred text := btrim(coalesce(p_credential, ''));
  v_hash bytea;
  v_player_id uuid;
  v_player_status text;
  v_player_org uuid;
  v_zone_id uuid;
  v_location_id uuid;
  v_location_org uuid;
  v_org_id uuid;
  v_practice_id uuid;
  v_product_kind text;
  v_author uuid;
  v_listening_key text;
  v_now timestamptz := clock_timestamp();
  v_accepted bigint := 0;
  v_duplicate boolean := false;
BEGIN
  IF v_cred !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_player_credential' USING ERRCODE = '42501';
  END IF;

  IF p_client_event_id IS NULL
     OR p_playback_session_id IS NULL
     OR p_audio_item_id IS NULL
     OR p_sample_seq IS NULL
     OR p_sample_seq < 1
  THEN
    RAISE EXCEPTION 'playback_usage_invalid_args' USING ERRCODE = '22023';
  END IF;

  v_hash := public.business_player_hash_credential(v_cred);

  SELECT c.player_id INTO v_player_id
  FROM public.business_player_credentials AS c
  WHERE c.credential_hash = v_hash;

  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'invalid_player_credential' USING ERRCODE = '42501';
  END IF;

  -- Serialize vs assign reassignment: share lock on Player row.
  SELECT p.status, p.organization_id
  INTO v_player_status, v_player_org
  FROM public.business_players AS p
  WHERE p.id = v_player_id
  FOR SHARE;

  IF v_player_status IS NULL THEN
    RAISE EXCEPTION 'invalid_player_credential' USING ERRCODE = '42501';
  END IF;

  IF v_player_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'player_not_active' USING ERRCODE = '22023';
  END IF;

  SELECT a.zone_id, z.location_id, l.organization_id, l.organization_id
  INTO v_zone_id, v_location_id, v_location_org, v_org_id
  FROM public.business_player_assignments AS a
  JOIN public.business_zones AS z ON z.id = a.zone_id
  JOIN public.business_locations AS l ON l.id = z.location_id
  WHERE a.player_id = v_player_id
    AND a.unassigned_at IS NULL;

  IF v_zone_id IS NULL THEN
    RAISE EXCEPTION 'player_not_assigned' USING ERRCODE = 'P0002';
  END IF;

  IF v_org_id IS DISTINCT FROM v_player_org OR v_location_org IS DISTINCT FROM v_player_org THEN
    RAISE EXCEPTION 'cross_organization_assignment' USING ERRCODE = '22023';
  END IF;

  SELECT ai.practice_id, pr.product_kind, pr.author_id
  INTO v_practice_id, v_product_kind, v_author
  FROM public.audio_items AS ai
  JOIN public.practices AS pr ON pr.id = ai.practice_id
  WHERE ai.id = p_audio_item_id;

  IF v_practice_id IS NULL THEN
    RAISE EXCEPTION 'audio_item_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_product_kind IS DISTINCT FROM 'music' THEN
    RAISE EXCEPTION 'audio_item_not_music' USING ERRCODE = '22023';
  END IF;

  v_listening_key := 'business:' || v_player_id::text || ':' || p_playback_session_id::text;

  IF char_length(v_listening_key) > 200 THEN
    RAISE EXCEPTION 'playback_usage_invalid_args' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.playback_usage_contexts c
    WHERE c.listening_key = v_listening_key
      AND (
        c.usage_kind IS DISTINCT FROM 'business'
        OR c.player_id IS DISTINCT FROM v_player_id
      )
  ) THEN
    RAISE EXCEPTION 'listening_key_identity_conflict' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.playback_usage_contexts (
    listening_key,
    practice_id,
    audio_item_id,
    last_position_ms,
    accepted_listened_ms,
    created_at,
    updated_at,
    usage_kind,
    organization_id,
    location_id,
    zone_id,
    player_id
  ) VALUES (
    v_listening_key,
    v_practice_id,
    p_audio_item_id,
    0,
    0,
    v_now,
    v_now,
    'business',
    v_org_id,
    v_location_id,
    v_zone_id,
    v_player_id
  )
  ON CONFLICT (listening_key) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    location_id = EXCLUDED.location_id,
    zone_id = EXCLUDED.zone_id,
    player_id = EXCLUDED.player_id,
    -- Attribution boundary: interval started under Zone A must not credit Zone B.
    -- Clear last_reported_at so the first sample after reassignment is a media-time baseline (+0).
    -- Keep last_sample_seq (monotonic) and accepted_listened_ms (lifetime budget within session).
    last_reported_at = CASE
      WHEN public.playback_usage_contexts.organization_id IS DISTINCT FROM EXCLUDED.organization_id
        OR public.playback_usage_contexts.location_id IS DISTINCT FROM EXCLUDED.location_id
        OR public.playback_usage_contexts.zone_id IS DISTINCT FROM EXCLUDED.zone_id
        OR public.playback_usage_contexts.player_id IS DISTINCT FROM EXCLUDED.player_id
      THEN NULL
      ELSE public.playback_usage_contexts.last_reported_at
    END,
    last_position_ms = CASE
      WHEN public.playback_usage_contexts.organization_id IS DISTINCT FROM EXCLUDED.organization_id
        OR public.playback_usage_contexts.location_id IS DISTINCT FROM EXCLUDED.location_id
        OR public.playback_usage_contexts.zone_id IS DISTINCT FROM EXCLUDED.zone_id
        OR public.playback_usage_contexts.player_id IS DISTINCT FROM EXCLUDED.player_id
      THEN 0
      ELSE public.playback_usage_contexts.last_position_ms
    END,
    updated_at = v_now;

  SELECT a.accepted_ms, a.duplicate
  INTO v_accepted, v_duplicate
  FROM public.apply_playback_usage_heartbeat(
    p_client_event_id,
    v_listening_key,
    p_sample_seq,
    NULL,           -- no consumer user
    NULL,           -- no anonymous
    NULL,           -- no analytics session
    v_practice_id,
    p_audio_item_id,
    p_position_ms,
    p_client_media_delta_ms,
    p_playback_rate,
    COALESCE(p_phase, 'advance'),
    v_now
  ) AS a;

  RETURN jsonb_build_object(
    'ok', true,
    'accepted_ms', COALESCE(v_accepted, 0),
    'duplicate', COALESCE(v_duplicate, false),
    'server_time', v_now
  );
END;
$$;

COMMENT ON FUNCTION public.apply_business_playback_usage_heartbeat(
  text, uuid, uuid, bigint, uuid, bigint, bigint, numeric, text
) IS
  'audiolad:business-playback; online Evidence only into playback_usage_facts. Credential identity; server-derived Player/Zone/Location/Organization and practice/author. occurred_at is canonical playback event time (online A3: sample processing time on server); created_at is ledger write time. Attribution change re-baselines media-time (+0). royalty_eligible_ms stays NULL. No offline path in A3.';

REVOKE ALL ON FUNCTION public.apply_business_playback_usage_heartbeat(
  text, uuid, uuid, bigint, uuid, bigint, bigint, numeric, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_business_playback_usage_heartbeat(
  text, uuid, uuid, bigint, uuid, bigint, bigint, numeric, text
) TO anon;
GRANT EXECUTE ON FUNCTION public.apply_business_playback_usage_heartbeat(
  text, uuid, uuid, bigint, uuid, bigint, bigint, numeric, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_business_playback_usage_heartbeat(
  text, uuid, uuid, bigint, uuid, bigint, bigint, numeric, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- Post-checks
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'playback_usage_facts'
      AND column_name = 'usage_kind'
  ) THEN
    RAISE EXCEPTION 'Post-check failed: usage_kind missing on facts';
  END IF;

  IF to_regprocedure(
    'public.apply_business_playback_usage_heartbeat(text,uuid,uuid,bigint,uuid,bigint,bigint,numeric,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Post-check failed: business playback RPC missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'playback_usage_facts'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name IN ('organization_id', 'location_id', 'zone_id', 'player_id')
  ) THEN
    RAISE EXCEPTION 'Post-check failed: destructive FK on B2B snapshot columns';
  END IF;

  IF has_table_privilege('anon', 'public.playback_usage_facts', 'SELECT')
     OR has_table_privilege('authenticated', 'public.playback_usage_facts', 'SELECT') THEN
    RAISE EXCEPTION 'Post-check failed: browser roles must not SELECT facts';
  END IF;
END
$$;

COMMIT;
