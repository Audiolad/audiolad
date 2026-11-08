-- Sergey 2026-11-08 (t1283u): the owner's «Музыка» tab and the owner-phone hall view must show
-- what the paired hall device really plays: track, play/pause, position and the upcoming queue.
-- The hall device already reports state + track (report_business_point_player). This adds a
-- separate, last-value-only snapshot of position and the next tracks. Not history, not Proof of
-- Play. Prepared migration: apply before the owner mirror can light up; until then the route
-- ignores the missing RPC and the owner keeps the local preview player.
BEGIN;

CREATE TABLE public.business_player_now_playing (
  player_id uuid PRIMARY KEY REFERENCES public.business_players(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.business_organizations(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.business_locations(id) ON DELETE CASCADE,
  audio_item_id uuid NULL REFERENCES public.audio_items(id) ON DELETE SET NULL,
  position_ms integer NOT NULL DEFAULT 0 CHECK (position_ms >= 0 AND position_ms <= 86400000),
  duration_ms integer NULL CHECK (duration_ms IS NULL OR (duration_ms > 0 AND duration_ms <= 86400000)),
  queue_audio_item_ids uuid[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(queue_audio_item_ids) <= 20),
  reported_at timestamptz NOT NULL
);
CREATE INDEX business_player_now_playing_location_idx ON public.business_player_now_playing (location_id, reported_at DESC);
CREATE INDEX business_player_now_playing_org_idx ON public.business_player_now_playing (organization_id);

ALTER TABLE public.business_player_now_playing ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_player_now_playing FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.business_player_now_playing IS
  'audiolad:business-player-live; last reported hall position and upcoming queue for the owner mirror. Not history, not Proof of Play.';

CREATE FUNCTION public.report_business_point_now_playing(
  p_token text,
  p_audio_item_id uuid,
  p_position_ms integer,
  p_duration_ms integer,
  p_queue uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token text := btrim(coalesce(p_token, ''));
  v_session public.business_point_sessions%ROWTYPE;
  v_queue uuid[] := coalesce(p_queue, '{}');
BEGIN
  IF v_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_point_token' USING ERRCODE = '42501';
  END IF;
  IF cardinality(v_queue) > 20 OR array_position(v_queue, NULL) IS NOT NULL
    OR coalesce(p_position_ms, -1) < 0 OR p_position_ms > 86400000
    OR (p_duration_ms IS NOT NULL AND (p_duration_ms <= 0 OR p_duration_ms > 86400000)) THEN
    RAISE EXCEPTION 'invalid_now_playing' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_session
  FROM public.business_point_sessions
  WHERE token_hash = public.business_point_sha256(v_token) AND revoked_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_point_token' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.business_player_now_playing AS n (
    player_id, organization_id, location_id, audio_item_id, position_ms, duration_ms, queue_audio_item_ids, reported_at
  ) VALUES (
    v_session.player_id, v_session.organization_id, v_session.location_id,
    p_audio_item_id, p_position_ms, p_duration_ms, v_queue, statement_timestamp()
  )
  ON CONFLICT (player_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    location_id = EXCLUDED.location_id,
    audio_item_id = EXCLUDED.audio_item_id,
    position_ms = EXCLUDED.position_ms,
    duration_ms = EXCLUDED.duration_ms,
    queue_audio_item_ids = EXCLUDED.queue_audio_item_ids,
    reported_at = EXCLUDED.reported_at;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.report_business_point_now_playing(text, uuid, integer, integer, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_business_point_now_playing(text, uuid, integer, integer, uuid[]) TO anon, authenticated, service_role;

COMMIT;
-- Rollback: DROP FUNCTION public.report_business_point_now_playing(text, uuid, integer, integer, uuid[]);
--           DROP TABLE public.business_player_now_playing;
