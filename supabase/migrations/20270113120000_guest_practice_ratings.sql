BEGIN;

-- Guest ratings (task f8f5908b). Additive only.
-- Does not alter practice_ratings, practice_rating_events, practice_listen_stats,
-- set_practice_rating, or registered eligibility. No auth.users rows are created.
-- Guest votes stay out of the public aggregate until an explicit owner flag
-- in the application. Copying a guest vote into practice_ratings happens
-- only when claim is called with p_copy_to_account true. The default is
-- false: the guest row is linked to the account and practice_ratings is
-- unchanged. Nothing is deleted.

CREATE OR REPLACE FUNCTION public.guest_rating_listen_threshold_ms(
  p_accessible_ms bigint
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_duration integer;
BEGIN
  IF p_accessible_ms IS NULL OR p_accessible_ms <= 0 OR p_accessible_ms >= 30000 THEN
    RETURN 30000;
  END IF;
  v_duration := p_accessible_ms::integer;
  IF v_duration <= 5000 THEN
    RETURN v_duration;
  END IF;
  RETURN LEAST(
    v_duration,
    GREATEST(5000, CEIL(v_duration * 0.8)::integer)
  );
END;
$$;

COMMENT ON FUNCTION public.guest_rating_listen_threshold_ms(bigint) IS
  'Guest listen threshold. 30000ms, or 80% of a shorter accessible fragment (the whole fragment when it is 5s or less). Never above the fragment length.';

REVOKE ALL ON FUNCTION public.guest_rating_listen_threshold_ms(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guest_rating_listen_threshold_ms(bigint) TO service_role;

CREATE TABLE IF NOT EXISTS public.guest_listen_stats (
  guest_id uuid NOT NULL,
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  real_listened_ms bigint NOT NULL DEFAULT 0,
  rating_eligible_at timestamptz,
  last_audio_item_id uuid,
  last_position_ms bigint NOT NULL DEFAULT 0,
  last_reported_at timestamptz,
  accessible_total_ms bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_listen_stats_pkey PRIMARY KEY (guest_id, practice_id),
  CONSTRAINT guest_listen_stats_real_listened_non_negative_check
    CHECK (real_listened_ms >= 0),
  CONSTRAINT guest_listen_stats_last_position_non_negative_check
    CHECK (last_position_ms >= 0)
);

CREATE TABLE IF NOT EXISTS public.guest_listen_item_credit (
  guest_id uuid NOT NULL,
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  audio_item_id uuid NOT NULL,
  high_water_ms bigint NOT NULL DEFAULT 0,
  item_duration_ms bigint,
  CONSTRAINT guest_listen_item_credit_pkey
    PRIMARY KEY (guest_id, practice_id, audio_item_id),
  CONSTRAINT guest_listen_item_credit_high_water_non_negative_check
    CHECK (high_water_ms >= 0)
);

COMMENT ON TABLE public.guest_listen_stats IS
  'Trusted MEDIA-TIME for an anonymous guest session. guest_id is a random UUID from a signed cookie, not an auth.users id. Replay of an already heard position is not credited. rating_eligible_at is set once.';

COMMENT ON TABLE public.guest_listen_item_credit IS
  'Per-item high water of media positions already credited. Rewind and replay add nothing.';

CREATE TABLE IF NOT EXISTS public.guest_practice_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL,
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  stars smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  verification text NOT NULL,
  ip_hmac text,
  device_id_hmac text,
  captcha_provider text,
  excluded_at timestamptz,
  excluded_reason text,
  claimed_by_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  claimed_at timestamptz,
  superseded_at timestamptz,
  superseded_reason text,
  CONSTRAINT guest_practice_ratings_guest_practice_key UNIQUE (guest_id, practice_id),
  CONSTRAINT guest_practice_ratings_stars_check CHECK (stars >= 1 AND stars <= 5),
  CONSTRAINT guest_practice_ratings_verification_check
    CHECK (verification IN ('listen', 'listen_captcha'))
);

CREATE INDEX IF NOT EXISTS guest_practice_ratings_practice_active_idx
  ON public.guest_practice_ratings (practice_id)
  WHERE excluded_at IS NULL AND superseded_at IS NULL AND claimed_by_user_id IS NULL;

COMMENT ON TABLE public.guest_practice_ratings IS
  'One current guest vote per guest_id×practice. Edits update this row and append an event. A copy-claim sets superseded_at. A link-only claim sets claimed_by_user_id and leaves superseded_at null. Rows are not deleted. Not part of the registered public aggregate unless the application include-flag is on and the row is still unclaimed.';

CREATE TABLE IF NOT EXISTS public.guest_practice_rating_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL,
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  old_stars smallint,
  new_stars smallint NOT NULL,
  action text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_practice_rating_events_action_check
    CHECK (action IN ('first', 'changed', 'claimed', 'superseded', 'linked')),
  CONSTRAINT guest_practice_rating_events_old_stars_check
    CHECK (old_stars IS NULL OR (old_stars >= 1 AND old_stars <= 5)),
  CONSTRAINT guest_practice_rating_events_new_stars_check
    CHECK (new_stars >= 1 AND new_stars <= 5)
);

CREATE INDEX IF NOT EXISTS guest_practice_rating_events_guest_idx
  ON public.guest_practice_rating_events (guest_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.guest_captcha_tokens (
  token_hash text PRIMARY KEY,
  guest_id uuid NOT NULL,
  provider text NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.guest_captcha_tokens IS
  'SHA-256 of a consumed one-time captcha token. The raw token is never stored.';

CREATE TABLE IF NOT EXISTS public.guest_rating_activity (
  guest_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  vote_count integer NOT NULL DEFAULT 0,
  last_vote_at timestamptz,
  captcha_failures integer NOT NULL DEFAULT 0,
  last_captcha_failure_at timestamptz,
  CONSTRAINT guest_rating_activity_counts_non_negative_check
    CHECK (vote_count >= 0 AND captcha_failures >= 0)
);

CREATE TABLE IF NOT EXISTS public.guest_rating_network_guests (
  ip_hmac text NOT NULL,
  guest_id uuid NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_rating_network_guests_pkey PRIMARY KEY (ip_hmac, guest_id)
);

COMMENT ON TABLE public.guest_rating_network_guests IS
  'HMAC of a network signal to guest_id. Raw IP is never stored. A high count only triggers CAPTCHA. It is not a block list.';

CREATE INDEX IF NOT EXISTS guest_rating_network_guests_seen_idx
  ON public.guest_rating_network_guests (ip_hmac, first_seen_at);

ALTER TABLE public.guest_listen_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_listen_item_credit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_practice_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_practice_rating_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_captcha_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_rating_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_rating_network_guests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.guest_listen_stats FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.guest_listen_item_credit FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.guest_practice_ratings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.guest_practice_rating_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.guest_captcha_tokens FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.guest_rating_activity FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.guest_rating_network_guests FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.guest_listen_stats TO service_role;
GRANT ALL ON TABLE public.guest_listen_item_credit TO service_role;
GRANT ALL ON TABLE public.guest_practice_ratings TO service_role;
GRANT ALL ON TABLE public.guest_practice_rating_events TO service_role;
GRANT ALL ON TABLE public.guest_captcha_tokens TO service_role;
GRANT ALL ON TABLE public.guest_rating_activity TO service_role;
GRANT ALL ON TABLE public.guest_rating_network_guests TO service_role;

CREATE OR REPLACE FUNCTION public.apply_guest_listen_stats_heartbeat(
  p_guest_id uuid,
  p_practice_id uuid,
  p_audio_item_id uuid,
  p_position_ms bigint,
  p_allow_eligibility boolean,
  p_accessible_total_ms bigint DEFAULT NULL,
  p_item_duration_ms bigint DEFAULT NULL,
  p_client_media_delta_ms bigint DEFAULT NULL,
  p_now timestamptz DEFAULT now()
)
RETURNS TABLE (
  real_listened_ms bigint,
  rating_eligible_at timestamptz,
  accepted_ms bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := COALESCE(p_now, now());
  v_position bigint := GREATEST(COALESCE(p_position_ms, 0), 0);
  v_accepted bigint := 0;
  v_row public.guest_listen_stats%ROWTYPE;
  v_elapsed numeric := 0;
  v_gap_ok boolean := true;
  v_wall_cap bigint;
  v_life_elapsed numeric;
  v_lifetime_cap bigint;
  v_budget bigint;
  v_delta bigint;
  v_total bigint;
  v_high bigint := 0;
  v_item_duration bigint;
  v_unheard bigint;
  v_heard_until bigint;
  v_accessible bigint;
  v_threshold integer;
  v_found boolean;
BEGIN
  IF p_guest_id IS NULL OR p_practice_id IS NULL OR p_audio_item_id IS NULL THEN
    RAISE EXCEPTION 'guest_listen_invalid_args';
  END IF;

  INSERT INTO public.guest_listen_stats (
    guest_id, practice_id, real_listened_ms, rating_eligible_at,
    last_audio_item_id, last_position_ms, last_reported_at,
    accessible_total_ms, created_at, updated_at
  ) VALUES (
    p_guest_id, p_practice_id, 0, NULL,
    p_audio_item_id, v_position, v_now,
    CASE
      WHEN p_accessible_total_ms IS NOT NULL AND p_accessible_total_ms > 0
        THEN p_accessible_total_ms
      ELSE NULL
    END,
    v_now, v_now
  )
  ON CONFLICT (guest_id, practice_id) DO NOTHING;

  SELECT * INTO STRICT v_row
  FROM public.guest_listen_stats
  WHERE guest_id = p_guest_id AND practice_id = p_practice_id
  FOR UPDATE;

  v_accessible := v_row.accessible_total_ms;
  IF p_accessible_total_ms IS NOT NULL AND p_accessible_total_ms > 0 THEN
    IF v_accessible IS NULL OR p_accessible_total_ms < v_accessible THEN
      v_accessible := p_accessible_total_ms;
    END IF;
  END IF;

  IF v_row.last_reported_at IS NOT NULL THEN
    v_elapsed := GREATEST(
      0,
      EXTRACT(EPOCH FROM (v_now - v_row.last_reported_at)) * 1000
    );
    IF v_elapsed > 20000 THEN
      v_gap_ok := false;
    END IF;
  END IF;

  IF v_gap_ok
    AND v_row.last_audio_item_id IS NOT DISTINCT FROM p_audio_item_id
    AND v_row.last_reported_at IS NOT NULL THEN
    v_delta := v_position - v_row.last_position_ms;
    IF v_delta > 0 AND v_delta <= 20000 THEN
      v_accepted := v_delta;
      IF p_client_media_delta_ms IS NOT NULL AND p_client_media_delta_ms >= 0 THEN
        v_accepted := LEAST(v_accepted, p_client_media_delta_ms);
      END IF;
      v_accepted := LEAST(v_accepted, 15000);
      v_wall_cap := FLOOR(v_elapsed * 1.5);
      v_accepted := LEAST(v_accepted, v_wall_cap);
      v_life_elapsed := GREATEST(
        0,
        EXTRACT(EPOCH FROM (v_now - v_row.created_at)) * 1000
      );
      v_lifetime_cap := FLOOR(v_life_elapsed * 1.5);
      v_budget := v_lifetime_cap - v_row.real_listened_ms;
      IF v_budget < 0 THEN
        v_budget := 0;
      END IF;
      v_accepted := LEAST(v_accepted, v_budget);
    END IF;
  END IF;

  SELECT c.high_water_ms, c.item_duration_ms
  INTO v_high, v_item_duration
  FROM public.guest_listen_item_credit AS c
  WHERE c.guest_id = p_guest_id
    AND c.practice_id = p_practice_id
    AND c.audio_item_id = p_audio_item_id
  FOR UPDATE;
  v_found := FOUND;
  IF NOT v_found THEN
    v_high := 0;
    v_item_duration := NULL;
  END IF;

  IF p_item_duration_ms IS NOT NULL AND p_item_duration_ms > 0 THEN
    IF v_item_duration IS NULL OR p_item_duration_ms < v_item_duration THEN
      v_item_duration := p_item_duration_ms;
    END IF;
  END IF;

  IF v_accepted > 0 THEN
    v_heard_until := GREATEST(v_row.last_position_ms, v_high);
    v_unheard := GREATEST(0, v_position - v_heard_until);
    v_accepted := LEAST(v_accepted, v_unheard);
    IF v_item_duration IS NOT NULL THEN
      v_accepted := LEAST(v_accepted, GREATEST(0, v_item_duration - v_high));
    END IF;
    IF v_accessible IS NOT NULL THEN
      v_accepted := LEAST(v_accepted, GREATEST(0, v_accessible - v_row.real_listened_ms));
    END IF;
    IF v_accepted > 0 THEN
      v_high := GREATEST(v_high, v_heard_until + v_accepted);
    END IF;
  END IF;

  IF v_found THEN
    UPDATE public.guest_listen_item_credit
    SET high_water_ms = v_high, item_duration_ms = v_item_duration
    WHERE guest_id = p_guest_id
      AND practice_id = p_practice_id
      AND audio_item_id = p_audio_item_id;
  ELSE
    INSERT INTO public.guest_listen_item_credit (
      guest_id, practice_id, audio_item_id, high_water_ms, item_duration_ms
    ) VALUES (
      p_guest_id, p_practice_id, p_audio_item_id, v_high, v_item_duration
    );
  END IF;

  v_total := v_row.real_listened_ms + v_accepted;
  v_threshold := public.guest_rating_listen_threshold_ms(v_accessible);

  UPDATE public.guest_listen_stats
  SET
    real_listened_ms = v_total,
    rating_eligible_at = CASE
      WHEN v_row.rating_eligible_at IS NOT NULL THEN v_row.rating_eligible_at
      WHEN p_allow_eligibility AND v_total >= v_threshold THEN v_now
      ELSE NULL
    END,
    last_audio_item_id = p_audio_item_id,
    last_position_ms = v_position,
    last_reported_at = v_now,
    accessible_total_ms = v_accessible,
    updated_at = v_now
  WHERE guest_id = p_guest_id AND practice_id = p_practice_id
  RETURNING
    guest_listen_stats.real_listened_ms,
    guest_listen_stats.rating_eligible_at,
    v_accepted
  INTO real_listened_ms, rating_eligible_at, accepted_ms;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_guest_listen_stats_heartbeat(
  uuid, uuid, uuid, bigint, boolean, bigint, bigint, bigint, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_guest_listen_stats_heartbeat(
  uuid, uuid, uuid, bigint, boolean, bigint, bigint, bigint, timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION public.set_guest_practice_rating(
  p_guest_id uuid,
  p_practice_id uuid,
  p_stars integer,
  p_verification text,
  p_ip_hmac text DEFAULT NULL,
  p_device_id_hmac text DEFAULT NULL,
  p_captcha_provider text DEFAULT NULL,
  p_now timestamptz DEFAULT now()
)
RETURNS TABLE (
  id uuid,
  stars smallint,
  created_at timestamptz,
  updated_at timestamptz,
  changed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := COALESCE(p_now, now());
  v_row public.guest_practice_ratings%ROWTYPE;
  v_old smallint;
  v_changed boolean := false;
BEGIN
  IF p_guest_id IS NULL OR p_practice_id IS NULL THEN
    RAISE EXCEPTION 'guest_rating_invalid_args';
  END IF;
  IF p_stars IS NULL OR p_stars < 1 OR p_stars > 5 THEN
    RAISE EXCEPTION 'guest_rating_invalid_stars';
  END IF;
  IF p_verification IS NULL OR p_verification NOT IN ('listen', 'listen_captcha') THEN
    RAISE EXCEPTION 'guest_rating_invalid_verification';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.guest_listen_stats AS s
    WHERE s.guest_id = p_guest_id
      AND s.practice_id = p_practice_id
      AND s.rating_eligible_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'guest_rating_not_eligible';
  END IF;

  SELECT * INTO v_row
  FROM public.guest_practice_ratings
  WHERE guest_id = p_guest_id AND practice_id = p_practice_id
  FOR UPDATE;

  IF FOUND AND v_row.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION 'guest_rating_claimed';
  END IF;

  IF NOT FOUND THEN
    BEGIN
      INSERT INTO public.guest_practice_ratings (
        guest_id, practice_id, stars, created_at, updated_at, verification,
        ip_hmac, device_id_hmac, captcha_provider
      ) VALUES (
        p_guest_id, p_practice_id, p_stars, v_now, v_now, p_verification,
        NULLIF(BTRIM(p_ip_hmac), ''),
        NULLIF(BTRIM(p_device_id_hmac), ''),
        NULLIF(BTRIM(p_captcha_provider), '')
      )
      RETURNING * INTO v_row;

      INSERT INTO public.guest_practice_rating_events (
        guest_id, practice_id, old_stars, new_stars, action, occurred_at
      ) VALUES (
        p_guest_id, p_practice_id, NULL, p_stars, 'first', v_now
      );
      v_changed := true;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT * INTO STRICT v_row
        FROM public.guest_practice_ratings
        WHERE guest_id = p_guest_id AND practice_id = p_practice_id
        FOR UPDATE;
    END;
  END IF;

  IF FOUND AND v_row.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION 'guest_rating_claimed';
  END IF;

  IF NOT v_changed THEN
    IF v_row.stars = p_stars THEN
      id := v_row.id;
      stars := v_row.stars;
      created_at := v_row.created_at;
      updated_at := v_row.updated_at;
      changed := false;
      RETURN NEXT;
      RETURN;
    END IF;

    v_old := v_row.stars;
    UPDATE public.guest_practice_ratings
    SET stars = p_stars, updated_at = v_now
    WHERE public.guest_practice_ratings.id = v_row.id
      AND public.guest_practice_ratings.stars IS DISTINCT FROM p_stars
    RETURNING * INTO v_row;

    INSERT INTO public.guest_practice_rating_events (
      guest_id, practice_id, old_stars, new_stars, action, occurred_at
    ) VALUES (
      p_guest_id, p_practice_id, v_old, p_stars, 'changed', v_now
    );
    v_changed := true;
  END IF;

  INSERT INTO public.guest_rating_activity (guest_id, created_at, vote_count, last_vote_at)
  VALUES (p_guest_id, v_now, 1, v_now)
  ON CONFLICT (guest_id) DO UPDATE
  SET vote_count = public.guest_rating_activity.vote_count + 1,
      last_vote_at = EXCLUDED.last_vote_at;

  id := v_row.id;
  stars := v_row.stars;
  created_at := v_row.created_at;
  updated_at := v_row.updated_at;
  changed := v_changed;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.set_guest_practice_rating(
  uuid, uuid, integer, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_guest_practice_rating(
  uuid, uuid, integer, text, text, text, text, timestamptz
) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_guest_practice_ratings(
  p_guest_id uuid,
  p_user_id uuid,
  p_now timestamptz DEFAULT now(),
  p_copy_to_account boolean DEFAULT false
)
RETURNS TABLE (
  practice_id uuid,
  action text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := COALESCE(p_now, now());
  v_guest public.guest_practice_ratings%ROWTYPE;
  v_account_stars smallint;
BEGIN
  IF p_guest_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'guest_claim_invalid_args';
  END IF;

  FOR v_guest IN
    SELECT *
    FROM public.guest_practice_ratings
    WHERE guest_id = p_guest_id
      AND superseded_at IS NULL
      AND claimed_by_user_id IS NULL
    ORDER BY created_at
    FOR UPDATE
  LOOP
    SELECT r.stars INTO v_account_stars
    FROM public.practice_ratings AS r
    WHERE r.user_id = p_user_id
      AND r.practice_id = v_guest.practice_id;

    IF FOUND THEN
      UPDATE public.guest_practice_ratings
      SET
        claimed_by_user_id = p_user_id,
        claimed_at = v_now,
        superseded_at = v_now,
        superseded_reason = 'account_vote'
      WHERE id = v_guest.id;

      INSERT INTO public.guest_practice_rating_events (
        guest_id, practice_id, old_stars, new_stars, action, occurred_at
      ) VALUES (
        p_guest_id, v_guest.practice_id, v_guest.stars, v_account_stars,
        'superseded', v_now
      );

      practice_id := v_guest.practice_id;
      action := 'superseded';
      RETURN NEXT;
    ELSIF COALESCE(p_copy_to_account, false) THEN
      PERFORM public.set_practice_rating(
        p_user_id,
        v_guest.practice_id,
        v_guest.stars,
        v_guest.ip_hmac,
        v_guest.device_id_hmac,
        v_now
      );

      UPDATE public.guest_practice_ratings
      SET
        claimed_by_user_id = p_user_id,
        claimed_at = v_now,
        superseded_at = v_now,
        superseded_reason = 'claimed_to_account'
      WHERE id = v_guest.id;

      INSERT INTO public.guest_practice_rating_events (
        guest_id, practice_id, old_stars, new_stars, action, occurred_at
      ) VALUES (
        p_guest_id, v_guest.practice_id, v_guest.stars, v_guest.stars,
        'claimed', v_now
      );

      practice_id := v_guest.practice_id;
      action := 'claimed';
      RETURN NEXT;
    ELSE
      UPDATE public.guest_practice_ratings
      SET
        claimed_by_user_id = p_user_id,
        claimed_at = v_now
      WHERE id = v_guest.id;

      INSERT INTO public.guest_practice_rating_events (
        guest_id, practice_id, old_stars, new_stars, action, occurred_at
      ) VALUES (
        p_guest_id, v_guest.practice_id, v_guest.stars, v_guest.stars,
        'linked', v_now
      );

      practice_id := v_guest.practice_id;
      action := 'linked';
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.claim_guest_practice_ratings(uuid, uuid, timestamptz, boolean) IS
  'Binds guest votes to an account. Existing account stars win and the guest row is superseded without rewriting practice_ratings. When p_copy_to_account is true and the account has no vote, set_practice_rating copies the stars once and the guest row is superseded. Otherwise the guest row is only linked and practice_ratings is not written. Already linked rows are left as they are. Nothing is deleted.';

REVOKE ALL ON FUNCTION public.claim_guest_practice_ratings(uuid, uuid, timestamptz, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_guest_practice_ratings(uuid, uuid, timestamptz, boolean)
  TO service_role;

CREATE OR REPLACE FUNCTION public.record_guest_captcha_failure(
  p_guest_id uuid,
  p_now timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_failures integer;
BEGIN
  IF p_guest_id IS NULL THEN
    RAISE EXCEPTION 'guest_captcha_failure_invalid_args';
  END IF;

  INSERT INTO public.guest_rating_activity (
    guest_id, captcha_failures, last_captcha_failure_at
  ) VALUES (
    p_guest_id, 1, COALESCE(p_now, now())
  )
  ON CONFLICT (guest_id) DO UPDATE
  SET captcha_failures = public.guest_rating_activity.captcha_failures + 1,
      last_captcha_failure_at = EXCLUDED.last_captcha_failure_at
  RETURNING captcha_failures INTO v_failures;

  RETURN v_failures;
END;
$$;

COMMENT ON FUNCTION public.record_guest_captcha_failure(uuid, timestamptz) IS
  'Atomically increments captcha_failures for one guest session and stores the failure time.';

REVOKE ALL ON FUNCTION public.record_guest_captcha_failure(uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_guest_captcha_failure(uuid, timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.reset_guest_captcha_failures(
  p_guest_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_guest_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.guest_rating_activity
  SET
    captcha_failures = 0,
    last_captcha_failure_at = NULL
  WHERE guest_id = p_guest_id;
END;
$$;

COMMENT ON FUNCTION public.reset_guest_captcha_failures(uuid) IS
  'Clears a guest captcha failure streak after a successful vote.';

REVOKE ALL ON FUNCTION public.reset_guest_captcha_failures(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_guest_captcha_failures(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.admin_ratings_guest_listeners(
  p_search text DEFAULT NULL,
  p_sort text DEFAULT 'last_activity',
  p_sort_dir text DEFAULT 'desc',
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(nullif(p_limit, 0), 50), 100));
  v_offset integer := greatest(0, least(coalesce(p_offset, 0), 100000));
  v_q text := nullif(btrim(coalesce(p_search, '')), '');
  v_sort text := coalesce(nullif(btrim(p_sort), ''), 'last_activity');
  v_dir text := CASE WHEN lower(coalesce(p_sort_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  v_total integer;
  v_rows jsonb;
  v_music_stars bigint;
  v_music_count integer;
  v_practice_stars bigint;
  v_practice_count integer;
BEGIN
  IF v_sort NOT IN ('rating_count', 'last_activity', 'average') THEN
    v_sort := 'last_activity';
  END IF;
  IF v_q IS NOT NULL THEN
    v_q := left(v_q, 36);
    IF v_q !~ '^[0-9a-fA-F-]{4,36}$' THEN
      v_q := NULL;
    END IF;
  END IF;

  WITH per_guest AS (
    SELECT
      r.guest_id,
      count(*)::integer AS rating_count,
      count(*) FILTER (
        WHERE r.excluded_at IS NULL AND r.superseded_at IS NULL AND r.claimed_by_user_id IS NULL
      )::integer AS active_count,
      count(*) FILTER (WHERE r.superseded_at IS NOT NULL)::integer AS superseded_count,
      count(*) FILTER (WHERE r.excluded_at IS NOT NULL)::integer AS excluded_count,
      coalesce(sum(r.stars) FILTER (
        WHERE r.excluded_at IS NULL AND r.superseded_at IS NULL AND r.claimed_by_user_id IS NULL
      ), 0)::bigint AS active_stars,
      min(r.created_at) AS first_rated_at,
      max(greatest(r.created_at, r.updated_at)) AS last_activity_at
    FROM public.guest_practice_ratings AS r
    GROUP BY r.guest_id
  ),
  filtered AS (
    SELECT g.*
    FROM per_guest AS g
    WHERE v_q IS NULL OR g.guest_id::text ILIKE '%' || v_q || '%'
  ),
  keyed AS (
    SELECT
      f.*,
      CASE
        WHEN f.active_count <= 0 THEN NULL
        ELSE f.active_stars::numeric / f.active_count::numeric
      END AS average,
      CASE v_sort
        WHEN 'rating_count' THEN f.rating_count::numeric
        WHEN 'average' THEN
          CASE WHEN f.active_count <= 0 THEN NULL
            ELSE f.active_stars::numeric / f.active_count::numeric END
        ELSE extract(epoch FROM f.last_activity_at)::numeric
      END AS sort_key
    FROM filtered AS f
  )
  SELECT
    (SELECT count(*)::integer FROM keyed),
    coalesce((
      SELECT jsonb_agg(page.row_json ORDER BY page.ord)
      FROM (
        SELECT
          row_number() OVER (
            ORDER BY
              CASE WHEN v_dir = 'asc' THEN k.sort_key END ASC NULLS LAST,
              CASE WHEN v_dir = 'desc' THEN k.sort_key END DESC NULLS LAST,
              k.guest_id ASC
          ) AS ord,
          jsonb_build_object(
            'guest_id', k.guest_id,
            'rating_count', k.rating_count,
            'active_count', k.active_count,
            'superseded_count', k.superseded_count,
            'excluded_count', k.excluded_count,
            'average', k.average,
            'first_rated_at', k.first_rated_at,
            'last_activity_at', k.last_activity_at
          ) AS row_json
        FROM keyed AS k
        ORDER BY
          CASE WHEN v_dir = 'asc' THEN k.sort_key END ASC NULLS LAST,
          CASE WHEN v_dir = 'desc' THEN k.sort_key END DESC NULLS LAST,
          k.guest_id ASC
        LIMIT v_limit OFFSET v_offset
      ) AS page
    ), '[]'::jsonb)
  INTO v_total, v_rows;

  SELECT
    coalesce(sum(r.stars) FILTER (WHERE p.product_kind = 'music'), 0)::bigint,
    count(*) FILTER (WHERE p.product_kind = 'music')::integer,
    coalesce(sum(r.stars) FILTER (WHERE p.product_kind IS DISTINCT FROM 'music'), 0)::bigint,
    count(*) FILTER (WHERE p.product_kind IS DISTINCT FROM 'music')::integer
  INTO v_music_stars, v_music_count, v_practice_stars, v_practice_count
  FROM public.guest_practice_ratings AS r
  JOIN public.practices AS p ON p.id = r.practice_id
  WHERE r.excluded_at IS NULL
    AND r.superseded_at IS NULL
    AND r.claimed_by_user_id IS NULL;

  RETURN jsonb_build_object(
    'total', coalesce(v_total, 0),
    'limit', v_limit,
    'offset', v_offset,
    'sort', v_sort,
    'sort_dir', v_dir,
    'rows', coalesce(v_rows, '[]'::jsonb),
    'segments', jsonb_build_object(
      'music', jsonb_build_object(
        'total_stars', coalesce(v_music_stars, 0),
        'rating_count', coalesce(v_music_count, 0)
      ),
      'practice', jsonb_build_object(
        'total_stars', coalesce(v_practice_stars, 0),
        'rating_count', coalesce(v_practice_count, 0)
      )
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_ratings_guest_listeners(text, text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ratings_guest_listeners(text, text, text, integer, integer)
  TO service_role;

COMMENT ON FUNCTION public.admin_ratings_guest_listeners(text, text, text, integer, integer) IS
  'Read-only guest listeners. Anonymous guest_id only. No name, email, IP or HMAC. Music and practice segments are counted separately. service_role only.';

CREATE OR REPLACE FUNCTION public.admin_ratings_guest_listener_detail(
  p_guest_id uuid,
  p_limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := greatest(1, least(coalesce(nullif(p_limit, 0), 200), 500));
  v_ratings jsonb;
  v_events jsonb;
  v_rating_total integer;
  v_event_total integer;
  v_failures integer := 0;
  v_votes integer := 0;
  v_other_guests integer := 0;
BEGIN
  IF p_guest_id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.guest_practice_ratings WHERE guest_id = p_guest_id
  ) THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT count(*)::integer INTO v_rating_total
  FROM public.guest_practice_ratings WHERE guest_id = p_guest_id;
  SELECT count(*)::integer INTO v_event_total
  FROM public.guest_practice_rating_events WHERE guest_id = p_guest_id;

  SELECT coalesce(a.captcha_failures, 0), coalesce(a.vote_count, 0)
  INTO v_failures, v_votes
  FROM public.guest_rating_activity AS a
  WHERE a.guest_id = p_guest_id;

  SELECT count(DISTINCT other.guest_id)::integer INTO v_other_guests
  FROM public.guest_rating_network_guests AS own
  JOIN public.guest_rating_network_guests AS other
    ON other.ip_hmac = own.ip_hmac
   AND other.guest_id <> own.guest_id
  WHERE own.guest_id = p_guest_id;

  SELECT coalesce(jsonb_agg(page.row_json ORDER BY page.created_at DESC, page.id DESC), '[]'::jsonb)
  INTO v_ratings
  FROM (
    SELECT
      r.id,
      r.created_at,
      jsonb_build_object(
        'rating_id', r.id,
        'practice_id', r.practice_id,
        'title', coalesce(nullif(btrim(p.title), ''), 'Практика'),
        'product_kind', p.product_kind,
        'stars', r.stars,
        'created_at', r.created_at,
        'updated_at', r.updated_at,
        'excluded', r.excluded_at IS NOT NULL,
        'superseded', r.superseded_at IS NOT NULL,
        'verification', r.verification,
        'rating_eligible_at', s.rating_eligible_at,
        'real_listened_ms', s.real_listened_ms
      ) AS row_json
    FROM public.guest_practice_ratings AS r
    JOIN public.practices AS p ON p.id = r.practice_id
    LEFT JOIN public.guest_listen_stats AS s
      ON s.guest_id = r.guest_id AND s.practice_id = r.practice_id
    WHERE r.guest_id = p_guest_id
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT v_limit
  ) AS page;

  SELECT coalesce(jsonb_agg(page.row_json ORDER BY page.occurred_at DESC, page.id DESC), '[]'::jsonb)
  INTO v_events
  FROM (
    SELECT
      e.id,
      e.occurred_at,
      jsonb_build_object(
        'id', e.id,
        'practice_id', e.practice_id,
        'title', coalesce(nullif(btrim(p.title), ''), 'Практика'),
        'old_stars', e.old_stars,
        'new_stars', e.new_stars,
        'action', e.action,
        'occurred_at', e.occurred_at
      ) AS row_json
    FROM public.guest_practice_rating_events AS e
    JOIN public.practices AS p ON p.id = e.practice_id
    WHERE e.guest_id = p_guest_id
    ORDER BY e.occurred_at DESC, e.id DESC
    LIMIT v_limit
  ) AS page;

  RETURN jsonb_build_object(
    'found', true,
    'guest_id', p_guest_id,
    'rating_total', coalesce(v_rating_total, 0),
    'event_total', coalesce(v_event_total, 0),
    'limit', v_limit,
    'ratings', coalesce(v_ratings, '[]'::jsonb),
    'events', coalesce(v_events, '[]'::jsonb),
    'signals', jsonb_build_object(
      'captcha_failures', coalesce(v_failures, 0),
      'vote_count', coalesce(v_votes, 0),
      'other_guests_on_network', coalesce(v_other_guests, 0)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_ratings_guest_listener_detail(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ratings_guest_listener_detail(uuid, integer)
  TO service_role;

COMMENT ON FUNCTION public.admin_ratings_guest_listener_detail(uuid, integer) IS
  'Guest listener history. Anonymous id, vote journal, neutral signal counts. No name, email, raw IP or HMAC. service_role only.';

COMMIT;
