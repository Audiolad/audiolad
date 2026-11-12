-- t1390u (Sergey 12.11.2026): hall device journal. 11.11 and 12.11 the hall iPhone went quiet at
-- 09:42 MSK and the database only held the LAST state of the device (runtime / playback_state /
-- now_playing are overwritten), so the moment, the page restart and the autoplay refusal could only
-- be reconstructed from nginx logs. This adds an append-only, small event journal written by the
-- point route (service role, device resolved from the point token): page loads (navigation type,
-- «was playing» marker, crash suspicion), element pause / waiting / stalled / error, self-resume,
-- watchdog, autoplay refusals, visibility / wake lock and a periodic snapshot (uptime, tracks since
-- load, buffer size). Additive only: one new table, no data changed or deleted. Diagnostics, not
-- Proof of Play, never shown to venues.
BEGIN;

CREATE TABLE public.business_player_device_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES public.business_players(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.business_organizations(id) ON DELETE CASCADE,
  location_id uuid NULL REFERENCES public.business_locations(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind ~ '^[a-z][a-z_]{1,39}$'),
  client_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  app_version text NULL CHECK (app_version IS NULL OR char_length(app_version) BETWEEN 1 AND 64),
  data jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(data) = 'object' AND pg_column_size(data) <= 4096)
);
CREATE INDEX business_player_device_events_player_idx
  ON public.business_player_device_events (player_id, received_at DESC);
CREATE INDEX business_player_device_events_kind_idx
  ON public.business_player_device_events (kind, received_at DESC);

ALTER TABLE public.business_player_device_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_player_device_events FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.business_player_device_events IS
  'audiolad:business-player-live; t1390u append-only hall device diagnostics journal (page loads, element events, self-resume, autoplay refusals, snapshots). Not Proof of Play, not shown to venues.';

NOTIFY pgrst, 'reload schema';

COMMIT;
