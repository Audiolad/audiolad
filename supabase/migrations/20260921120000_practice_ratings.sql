BEGIN;

-- Stage 2 star ratings: one active row per user×practice + append-only audit.
-- Distinct from practice_audio_progress (resume) and practice_listen_stats
-- (trusted MEDIA-TIME / eligibility). created_at on the active row is the
-- FIRST rating timestamp and stays immutable through later edits.

CREATE TABLE IF NOT EXISTS public.practice_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  stars smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  vote_ip_hmac text,
  device_id_hmac text,
  excluded_at timestamptz,
  excluded_reason text,
  excluded_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT practice_ratings_user_practice_key UNIQUE (user_id, practice_id),
  CONSTRAINT practice_ratings_stars_check CHECK (stars >= 1 AND stars <= 5)
);

CREATE INDEX IF NOT EXISTS practice_ratings_practice_active_idx
  ON public.practice_ratings (practice_id)
  WHERE excluded_at IS NULL;

CREATE INDEX IF NOT EXISTS practice_ratings_practice_created_at_idx
  ON public.practice_ratings (practice_id, created_at)
  WHERE excluded_at IS NULL;

COMMENT ON TABLE public.practice_ratings IS
  'Current active star rating (1-5) per user×practice. One row only. created_at is the first rating time and is immutable on edit; updated_at changes when stars change. Public aggregate is SUM(stars) + COUNT(*) where excluded_at IS NULL. Authenticated SELECT own rows; INSERT/UPDATE/DELETE only via service_role set_practice_rating RPC.';

COMMENT ON COLUMN public.practice_ratings.created_at IS
  'Timestamp of the FIRST rating for this user×practice. Must not change when the user later edits stars. Future 7/30d ranking uses this first-rating time with CURRENT stars.';

COMMENT ON COLUMN public.practice_ratings.updated_at IS
  'Last time stars changed. Identical resubmit must not bump this.';

COMMENT ON COLUMN public.practice_ratings.vote_ip_hmac IS
  'Versioned HMAC of the trusted client IP at first vote. Signal only — never one-IP=one-user. Raw IP is never stored.';

COMMENT ON COLUMN public.practice_ratings.device_id_hmac IS
  'Versioned HMAC of first-party audiolad_anonymous_id at first vote. Not a fingerprint. Raw id is never stored.';

COMMENT ON COLUMN public.practice_ratings.excluded_at IS
  'Moderation hide from public aggregate. NULL means the rating counts.';

CREATE TABLE IF NOT EXISTS public.practice_rating_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  practice_id uuid NOT NULL REFERENCES public.practices (id) ON DELETE CASCADE,
  old_stars smallint,
  new_stars smallint NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practice_rating_events_old_stars_check
    CHECK (old_stars IS NULL OR (old_stars >= 1 AND old_stars <= 5)),
  CONSTRAINT practice_rating_events_new_stars_check
    CHECK (new_stars >= 1 AND new_stars <= 5)
);

CREATE INDEX IF NOT EXISTS practice_rating_events_user_practice_idx
  ON public.practice_rating_events (user_id, practice_id, occurred_at);

COMMENT ON TABLE public.practice_rating_events IS
  'Append-only audit of rating changes. First rating is NULL→N; edits are old→new. Identical resubmit writes no event. No client SELECT/INSERT/UPDATE/DELETE. Not the primary temporal ranking source.';

ALTER TABLE public.practice_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_rating_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own practice ratings"
  ON public.practice_ratings;

CREATE POLICY "Users select own practice ratings"
  ON public.practice_ratings
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON TABLE public.practice_ratings FROM PUBLIC;
REVOKE ALL ON TABLE public.practice_ratings FROM anon;
REVOKE ALL ON TABLE public.practice_ratings FROM authenticated;
GRANT SELECT ON TABLE public.practice_ratings TO authenticated;
GRANT ALL ON TABLE public.practice_ratings TO service_role;

REVOKE ALL ON TABLE public.practice_rating_events FROM PUBLIC;
REVOKE ALL ON TABLE public.practice_rating_events FROM anon;
REVOKE ALL ON TABLE public.practice_rating_events FROM authenticated;
GRANT ALL ON TABLE public.practice_rating_events TO service_role;

CREATE OR REPLACE FUNCTION public.set_practice_rating(
  p_user_id uuid,
  p_practice_id uuid,
  p_stars integer,
  p_vote_ip_hmac text DEFAULT NULL,
  p_device_id_hmac text DEFAULT NULL,
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
  v_row public.practice_ratings%ROWTYPE;
  v_old smallint;
  v_changed boolean := false;
BEGIN
  IF p_user_id IS NULL OR p_practice_id IS NULL THEN
    RAISE EXCEPTION 'rating_invalid_args';
  END IF;

  IF p_stars IS NULL OR p_stars < 1 OR p_stars > 5 THEN
    RAISE EXCEPTION 'rating_invalid_stars';
  END IF;

  SELECT *
  INTO v_row
  FROM public.practice_ratings
  WHERE user_id = p_user_id
    AND practice_id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    BEGIN
      INSERT INTO public.practice_ratings (
        user_id,
        practice_id,
        stars,
        created_at,
        updated_at,
        vote_ip_hmac,
        device_id_hmac
      ) VALUES (
        p_user_id,
        p_practice_id,
        p_stars,
        v_now,
        v_now,
        NULLIF(BTRIM(p_vote_ip_hmac), ''),
        NULLIF(BTRIM(p_device_id_hmac), '')
      )
      RETURNING * INTO v_row;

      INSERT INTO public.practice_rating_events (
        user_id,
        practice_id,
        old_stars,
        new_stars,
        occurred_at
      ) VALUES (
        p_user_id,
        p_practice_id,
        NULL,
        p_stars,
        v_now
      );

      v_changed := true;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT *
        INTO STRICT v_row
        FROM public.practice_ratings
        WHERE user_id = p_user_id
          AND practice_id = p_practice_id
        FOR UPDATE;
    END;
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

    UPDATE public.practice_ratings
    SET
      stars = p_stars,
      updated_at = v_now
    WHERE public.practice_ratings.id = v_row.id
      AND public.practice_ratings.stars IS DISTINCT FROM p_stars
    RETURNING * INTO v_row;

    INSERT INTO public.practice_rating_events (
      user_id,
      practice_id,
      old_stars,
      new_stars,
      occurred_at
    ) VALUES (
      p_user_id,
      p_practice_id,
      v_old,
      p_stars,
      v_now
    );

    v_changed := true;
  END IF;

  id := v_row.id;
  stars := v_row.stars;
  created_at := v_row.created_at;
  updated_at := v_row.updated_at;
  changed := v_changed;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.set_practice_rating(
  uuid, uuid, integer, text, text, timestamptz
) IS
  'Atomic rating write. service_role only. First insert: created_at=now, event NULL→stars. Change: keep created_at, bump updated_at, event old→new. Identical stars: no-op (no event, no updated_at bump). UNIQUE(user_id, practice_id) plus unique_violation retry prevents duplicate active rows.';

REVOKE ALL ON FUNCTION public.set_practice_rating(
  uuid, uuid, integer, text, text, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_practice_rating(
  uuid, uuid, integer, text, text, timestamptz
) FROM anon;
REVOKE ALL ON FUNCTION public.set_practice_rating(
  uuid, uuid, integer, text, text, timestamptz
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_practice_rating(
  uuid, uuid, integer, text, text, timestamptz
) TO service_role;

COMMIT;
