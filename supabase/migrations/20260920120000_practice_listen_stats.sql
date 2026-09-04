BEGIN;

-- Stage 1 ratings foundation: trusted cumulative MEDIA-TIME / eligibility.
-- Separate from practice_audio_progress (resume cursor only).
-- Does not add real_listened_ms / rating_eligible onto practice_audio_progress.

CREATE TABLE IF NOT EXISTS public.practice_listen_stats (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  real_listened_ms bigint NOT NULL DEFAULT 0,
  rating_eligible_at timestamptz,
  last_audio_item_id uuid REFERENCES public.audio_items (id) ON DELETE SET NULL,
  last_position_ms bigint NOT NULL DEFAULT 0,
  last_reported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_listen_stats_pkey PRIMARY KEY (user_id, practice_id),
  CONSTRAINT practice_listen_stats_real_listened_non_negative_check
    CHECK (real_listened_ms >= 0),
  CONSTRAINT practice_listen_stats_last_position_non_negative_check
    CHECK (last_position_ms >= 0)
);

CREATE INDEX IF NOT EXISTS practice_listen_stats_practice_idx
  ON public.practice_listen_stats (practice_id);

COMMENT ON TABLE public.practice_listen_stats IS
  'Per-user trusted cumulative MEDIA-TIME listening for a practice. real_listened_ms is audio currentTime advancement, not wall-clock. rating_eligible_at is set once at 30000ms under full legal access and is never reset by progress rewind/reset. Distinct from practice_audio_progress (resume cursor). Authenticated SELECT own rows; INSERT/UPDATE/DELETE only via service_role heartbeat RPC after listen access checks.';

COMMENT ON COLUMN public.practice_listen_stats.real_listened_ms IS
  'Cumulative accepted media-time in milliseconds at user+practice grain.';

COMMENT ON COLUMN public.practice_listen_stats.rating_eligible_at IS
  'Set once when real_listened_ms first reaches 30000 under allow_eligibility. Never cleared by progress reset.';

ALTER TABLE public.practice_listen_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own practice listen stats"
  ON public.practice_listen_stats;

CREATE POLICY "Users select own practice listen stats"
  ON public.practice_listen_stats
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.practice_listen_stats FROM PUBLIC;
REVOKE ALL ON TABLE public.practice_listen_stats FROM anon;
REVOKE ALL ON TABLE public.practice_listen_stats FROM authenticated;
GRANT SELECT ON TABLE public.practice_listen_stats TO authenticated;
GRANT ALL ON TABLE public.practice_listen_stats TO service_role;

CREATE OR REPLACE FUNCTION public.apply_practice_listen_stats_heartbeat(
  p_user_id uuid,
  p_practice_id uuid,
  p_audio_item_id uuid,
  p_position_ms bigint,
  p_allow_eligibility boolean,
  p_client_media_delta_ms bigint DEFAULT NULL,
  p_playback_rate numeric DEFAULT NULL,
  p_now timestamptz DEFAULT now()
)
RETURNS TABLE (
  real_listened_ms bigint,
  rating_eligible_at timestamptz,
  accepted_ms bigint,
  last_position_ms bigint,
  last_audio_item_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := COALESCE(p_now, now());
  v_position bigint := GREATEST(COALESCE(p_position_ms, 0), 0);
  v_accepted bigint := 0;
  v_row public.practice_listen_stats%ROWTYPE;
  v_rate numeric;
  v_elapsed numeric;
  v_slack bigint;
  v_wall_cap bigint;
  v_life_elapsed numeric;
  v_budget bigint;
  v_delta bigint;
  v_total bigint;
BEGIN
  IF p_user_id IS NULL OR p_practice_id IS NULL OR p_audio_item_id IS NULL THEN
    RAISE EXCEPTION 'listen_stats_invalid_args';
  END IF;

  INSERT INTO public.practice_listen_stats (
    user_id,
    practice_id,
    real_listened_ms,
    rating_eligible_at,
    last_audio_item_id,
    last_position_ms,
    last_reported_at,
    created_at,
    updated_at
  ) VALUES (
    p_user_id,
    p_practice_id,
    0,
    NULL,
    p_audio_item_id,
    v_position,
    v_now,
    v_now,
    v_now
  )
  ON CONFLICT (user_id, practice_id) DO NOTHING;

  SELECT *
  INTO STRICT v_row
  FROM public.practice_listen_stats
  WHERE user_id = p_user_id
    AND practice_id = p_practice_id
  FOR UPDATE;

  IF v_row.last_audio_item_id IS NOT DISTINCT FROM p_audio_item_id THEN
    v_delta := v_position - v_row.last_position_ms;

    IF v_delta > 0 AND v_delta <= 20000 THEN
      v_accepted := v_delta;

      IF p_client_media_delta_ms IS NOT NULL AND p_client_media_delta_ms >= 0 THEN
        v_accepted := LEAST(v_accepted, p_client_media_delta_ms);
      END IF;

      v_accepted := LEAST(v_accepted, 15000);

      IF v_row.last_reported_at IS NOT NULL THEN
        v_elapsed := GREATEST(
          0,
          EXTRACT(EPOCH FROM (v_now - v_row.last_reported_at)) * 1000
        );
        v_rate := COALESCE(p_playback_rate, 1);
        IF v_rate < 0.5 THEN
          v_rate := 0.5;
        END IF;
        IF v_rate > 2 THEN
          v_rate := 2;
        END IF;
        IF v_elapsed >= 2500 THEN
          v_slack := 2000;
        ELSE
          v_slack := 0;
        END IF;
        v_wall_cap := FLOOR(v_elapsed * v_rate + v_slack);
        v_accepted := LEAST(v_accepted, v_wall_cap);
      END IF;

      v_life_elapsed := GREATEST(
        0,
        EXTRACT(EPOCH FROM (v_now - v_row.created_at)) * 1000
      );
      v_budget := FLOOR(v_life_elapsed * 2 + 8000 - v_row.real_listened_ms);
      IF v_budget < 0 THEN
        v_budget := 0;
      END IF;
      v_accepted := LEAST(v_accepted, v_budget);
    END IF;
  END IF;

  v_total := v_row.real_listened_ms + v_accepted;

  UPDATE public.practice_listen_stats
  SET
    real_listened_ms = v_total,
    rating_eligible_at = CASE
      WHEN v_row.rating_eligible_at IS NOT NULL THEN v_row.rating_eligible_at
      WHEN p_allow_eligibility AND v_total >= 30000 THEN v_now
      ELSE NULL
    END,
    last_audio_item_id = p_audio_item_id,
    last_position_ms = v_position,
    last_reported_at = v_now,
    updated_at = v_now
  WHERE user_id = p_user_id
    AND practice_id = p_practice_id
  RETURNING
    practice_listen_stats.real_listened_ms,
    practice_listen_stats.rating_eligible_at,
    v_accepted,
    practice_listen_stats.last_position_ms,
    practice_listen_stats.last_audio_item_id
  INTO
    real_listened_ms,
    rating_eligible_at,
    accepted_ms,
    last_position_ms,
    last_audio_item_id;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.apply_practice_listen_stats_heartbeat(
  uuid, uuid, uuid, bigint, boolean, bigint, numeric, timestamptz
) IS
  'Atomic MEDIA-TIME heartbeat. service_role only. Computes accepted ms from stored last_position; does not take an arbitrary increment. rating_eligible_at is set once when allow_eligibility and total >= 30000.';

REVOKE ALL ON FUNCTION public.apply_practice_listen_stats_heartbeat(
  uuid, uuid, uuid, bigint, boolean, bigint, numeric, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_practice_listen_stats_heartbeat(
  uuid, uuid, uuid, bigint, boolean, bigint, numeric, timestamptz
) FROM anon;
REVOKE ALL ON FUNCTION public.apply_practice_listen_stats_heartbeat(
  uuid, uuid, uuid, bigint, boolean, bigint, numeric, timestamptz
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_practice_listen_stats_heartbeat(
  uuid, uuid, uuid, bigint, boolean, bigint, numeric, timestamptz
) TO service_role;

COMMIT;
