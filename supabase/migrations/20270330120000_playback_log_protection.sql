-- t1578u / t1591u (approved by Sergey 19.11.2026): play-log protection M1–M4.
--   M1  playback_usage_facts is append-only: UPDATE/DELETE/TRUNCATE refused by triggers and revoked
--       from service_role. The only allowed UPDATE is the FK action ON DELETE SET NULL of
--       user_id / session_id / context_id (user, analytics session or context removed); every
--       other column stays as written.
--   M2  Samples a hall recorded without connection keep the offline flag and the device time
--       (client_offline, device_occurred_at). When the device time is plausible (after the
--       session's last accepted sample, not in the future, within 26 h) it is also used as the
--       sample time, so the play lands at the moment it really played and is not cut by the
--       wall-clock cap of the fast replay. Otherwise the old server-time path is used. The hall
--       player is not changed: it already sends `offline: true` and `at`.
--   M3  Hourly SHA-256 chain over the facts (by insert time): playback_usage_fact_seals, sealed by
--       seal_playback_usage_facts() and checkable by verify_playback_usage_fact_seal().
--   M4  evidence_index_versions: registry of fingerprint index versions (hashes, tracks).
-- No data is rewritten. Reads and inserts of the hall path keep working during and after apply.
BEGIN;

-- ---------------------------------------------------------------- M2 columns

ALTER TABLE public.playback_usage_facts
  ADD COLUMN IF NOT EXISTS client_offline boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS device_occurred_at timestamptz NULL;

COMMENT ON COLUMN public.playback_usage_facts.client_offline IS
  'audiolad:playback-usage M2; true when the hall recorded this sample without connection and sent it later.';
COMMENT ON COLUMN public.playback_usage_facts.device_occurred_at IS
  'audiolad:playback-usage M2; device clock of an offline sample as sent by the hall (not trusted as such). occurred_at is the accepted sample time; created_at is the delivery time.';

-- Insert-time order for the hourly seals (M3). ~0.7 M rows on prod: built in about a second.
CREATE INDEX IF NOT EXISTS playback_usage_facts_created_idx
  ON public.playback_usage_facts (created_at, id);

-- ---------------------------------------------------------------- M3 seals table

CREATE TABLE IF NOT EXISTS public.playback_usage_fact_seals (
  period_start timestamptz PRIMARY KEY,
  period_end timestamptz NOT NULL,
  fact_count bigint NOT NULL,
  listened_ms bigint NOT NULL,
  facts_sha256 text NOT NULL,
  prev_chain_sha256 text NOT NULL,
  chain_sha256 text NOT NULL,
  canon_version smallint NOT NULL DEFAULT 1,
  sealed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT playback_usage_fact_seals_period_check CHECK (period_end = period_start + interval '1 hour'),
  CONSTRAINT playback_usage_fact_seals_hash_check CHECK (
    facts_sha256 ~ '^[0-9a-f]{64}$' AND prev_chain_sha256 ~ '^[0-9a-f]{64}$' AND chain_sha256 ~ '^[0-9a-f]{64}$'
  )
);

COMMENT ON TABLE public.playback_usage_fact_seals IS
  'audiolad:playback-usage M3; one row per UTC hour of fact inserts (created_at). facts_sha256 = sha256 of the newline-joined sha256 hex of each fact''s canonical text (playback_usage_fact_canon, ordered by created_at, id). chain_sha256 = sha256(prev_chain_sha256 | period_start | fact_count | listened_ms | facts_sha256). Append-only.';

ALTER TABLE public.playback_usage_fact_seals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.playback_usage_fact_seals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.playback_usage_fact_seals TO service_role;

-- ---------------------------------------------------------------- M1 guard

-- M2: one-shot marks written by apply_business_point_usage_sample_offline() inside its own
-- transaction. A session setting alone could be forged by any caller able to run set_config; the
-- mark is a random nonce in a table nobody else can write, bound to the transaction id.
CREATE TABLE IF NOT EXISTS public.playback_usage_offline_marks (
  txid bigint NOT NULL,
  nonce text NOT NULL,
  device_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (txid, nonce)
);
COMMENT ON TABLE public.playback_usage_offline_marks IS
  'audiolad:playback-usage M2; transient proof that the current transaction is an offline hall sample. Rows are deleted by the same transaction.';
ALTER TABLE public.playback_usage_offline_marks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.playback_usage_offline_marks FROM PUBLIC, anon, authenticated, service_role;

-- SECURITY DEFINER: reads the offline marks whoever inserts (service_role has no access to them).
CREATE OR REPLACE FUNCTION public.playback_usage_facts_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nonce text;
  v_device timestamptz;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Insert time is the server's, never the writer's: the hourly seals rely on it. Wall clock
    -- of the insert itself (not the transaction start), held under a shared barrier lock until
    -- commit, so seal_playback_usage_facts() never seals an hour with a row still in flight.
    PERFORM pg_advisory_xact_lock_shared(hashtext('audiolad.playback_usage_fact_seals.barrier'));
    NEW.created_at := clock_timestamp();
    IF EXISTS (
      SELECT 1 FROM public.playback_usage_fact_seals s
      WHERE s.period_start = date_trunc('hour', NEW.created_at, 'UTC')
    ) THEN
      RAISE EXCEPTION 'playback_usage_period_sealed' USING ERRCODE = '42501';
    END IF;
    NEW.client_offline := false;
    NEW.device_occurred_at := NULL;
    v_nonce := current_setting('audiolad.usage_offline_mark', true);
    IF NEW.usage_kind = 'business' AND coalesce(v_nonce, '') <> '' THEN
      SELECT m.device_at INTO v_device
      FROM public.playback_usage_offline_marks m
      WHERE m.txid = txid_current() AND m.nonce = v_nonce;
      IF FOUND THEN
        NEW.client_offline := true;
        NEW.device_occurred_at := v_device;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'playback_usage_facts_append_only' USING ERRCODE = '42501';
  END IF;

  -- UPDATE: only an FK ON DELETE SET NULL of user_id / session_id / context_id.
  IF (to_jsonb(NEW) - ARRAY['user_id', 'session_id', 'context_id'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['user_id', 'session_id', 'context_id'])
     OR (NEW.user_id IS DISTINCT FROM OLD.user_id AND NEW.user_id IS NOT NULL)
     OR (NEW.session_id IS DISTINCT FROM OLD.session_id AND NEW.session_id IS NOT NULL)
     OR (NEW.context_id IS DISTINCT FROM OLD.context_id AND NEW.context_id IS NOT NULL)
  THEN
    RAISE EXCEPTION 'playback_usage_facts_append_only' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.playback_usage_facts_no_truncate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'playback_usage_facts_append_only' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS playback_usage_facts_guard ON public.playback_usage_facts;
CREATE TRIGGER playback_usage_facts_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.playback_usage_facts
  FOR EACH ROW EXECUTE FUNCTION public.playback_usage_facts_guard();

DROP TRIGGER IF EXISTS playback_usage_facts_no_truncate ON public.playback_usage_facts;
CREATE TRIGGER playback_usage_facts_no_truncate
  BEFORE TRUNCATE ON public.playback_usage_facts
  FOR EACH STATEMENT EXECUTE FUNCTION public.playback_usage_facts_no_truncate();

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.playback_usage_facts FROM service_role;

COMMENT ON TABLE public.playback_usage_facts IS
  'audiolad:playback-usage; append-only server-accepted MEDIA-TIME where listened_ms > 0 (M1: UPDATE/DELETE/TRUNCATE refused by triggers, only FK SET NULL of user_id/session_id/context_id). Not a royalty. UNIQUE(client_event_id) plus context last_sample_seq. practice_id, audio_item_id, and author_id_snapshot are immutable snapshots with no FK, so product deletion cannot erase history. Hourly SHA-256 chain in playback_usage_fact_seals (M3).';

-- ---------------------------------------------------------------- M3 chain

-- Canonical text of one fact: the evidence columns only (not user_id / session_id / context_id,
-- which an FK may null; not personal anonymous_id / visitor_key; not the reserved ledger columns).
CREATE OR REPLACE FUNCTION public.playback_usage_fact_canon(f public.playback_usage_facts)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT concat_ws('|',
    'v1',
    f.id::text,
    f.client_event_id::text,
    f.sample_seq::text,
    f.listening_key,
    f.practice_id::text,
    coalesce(f.audio_item_id::text, ''),
    f.listened_ms::text,
    f.position_ms::text,
    coalesce(f.prior_position_ms::text, ''),
    coalesce(f.playback_rate::text, ''),
    f.phase,
    coalesce(f.reject_reason, ''),
    to_char(f.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    to_char(f.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    coalesce(f.author_id_snapshot::text, ''),
    f.usage_kind,
    coalesce(f.organization_id::text, ''),
    coalesce(f.location_id::text, ''),
    coalesce(f.zone_id::text, ''),
    coalesce(f.player_id::text, ''),
    CASE WHEN f.client_offline THEN '1' ELSE '0' END,
    coalesce(to_char(f.device_occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), '')
  );
$$;

CREATE OR REPLACE FUNCTION public.playback_usage_fact_period_digest(p_start timestamptz)
RETURNS TABLE (fact_count bigint, listened_ms bigint, facts_sha256 text)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    count(*)::bigint,
    coalesce(sum(f.listened_ms), 0)::bigint,
    encode(sha256(convert_to(coalesce(
      string_agg(encode(sha256(convert_to(public.playback_usage_fact_canon(f), 'UTF8')), 'hex'), E'\n'
        ORDER BY f.created_at, f.id),
      ''), 'UTF8')), 'hex')
  FROM public.playback_usage_facts AS f
  WHERE f.created_at >= p_start AND f.created_at < p_start + interval '1 hour';
$$;

-- Seals the next closed hours (ended at least an hour ago) in order, at most p_max_periods.
-- Returns the number of hours sealed. Serialised by an advisory lock; safe to run from cron.
CREATE OR REPLACE FUNCTION public.seal_playback_usage_facts(p_max_periods integer DEFAULT 48)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit timestamptz := date_trunc('hour', now() - interval '1 hour', 'UTC');
  v_last public.playback_usage_fact_seals%ROWTYPE;
  v_start timestamptz;
  v_prev text;
  v_digest record;
  v_chain text;
  v_done integer := 0;
  v_tries integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('audiolad.playback_usage_fact_seals'));
  -- Barrier: every insert holds the shared barrier lock until it commits. Taking (and at once
  -- releasing) the exclusive one proves no insert is in flight; any later insert gets a
  -- created_at after now() - 1 h, outside the hours sealed below. Never queues: the hall path
  -- is not blocked behind a waiting seal; after ~5 s of no gap this run seals nothing.
  LOOP
    EXIT WHEN pg_try_advisory_lock(hashtext('audiolad.playback_usage_fact_seals.barrier'));
    v_tries := v_tries + 1;
    IF v_tries >= 250 THEN
      RETURN 0;
    END IF;
    PERFORM pg_sleep(0.02);
  END LOOP;
  PERFORM pg_advisory_unlock(hashtext('audiolad.playback_usage_fact_seals.barrier'));
  SELECT * INTO v_last FROM public.playback_usage_fact_seals ORDER BY period_start DESC LIMIT 1;
  IF FOUND THEN
    v_start := v_last.period_end;
    v_prev := v_last.chain_sha256;
  ELSE
    SELECT date_trunc('hour', min(f.created_at), 'UTC') INTO v_start FROM public.playback_usage_facts AS f;
    IF v_start IS NULL THEN
      v_start := v_limit;
    END IF;
    v_prev := repeat('0', 64);
  END IF;
  WHILE v_start < v_limit AND v_done < GREATEST(1, LEAST(coalesce(p_max_periods, 48), 24 * 31)) LOOP
    SELECT * INTO v_digest FROM public.playback_usage_fact_period_digest(v_start);
    v_chain := encode(sha256(convert_to(concat_ws('|',
      v_prev,
      to_char(v_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      v_digest.fact_count::text,
      v_digest.listened_ms::text,
      v_digest.facts_sha256), 'UTF8')), 'hex');
    INSERT INTO public.playback_usage_fact_seals (
      period_start, period_end, fact_count, listened_ms, facts_sha256, prev_chain_sha256, chain_sha256, sealed_at
    ) VALUES (
      v_start, v_start + interval '1 hour', v_digest.fact_count, v_digest.listened_ms, v_digest.facts_sha256,
      v_prev, v_chain, clock_timestamp()
    );
    v_prev := v_chain;
    v_start := v_start + interval '1 hour';
    v_done := v_done + 1;
  END LOOP;
  RETURN v_done;
END;
$$;

-- Recomputes one sealed hour and its link: ok = facts and chain still match.
CREATE OR REPLACE FUNCTION public.verify_playback_usage_fact_seal(p_period_start timestamptz)
RETURNS TABLE (period_start timestamptz, ok boolean, fact_count bigint, sealed_fact_count bigint,
  facts_sha256 text, sealed_facts_sha256 text, chain_ok boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_seal public.playback_usage_fact_seals%ROWTYPE;
  v_prev text;
  v_digest record;
  v_chain text;
BEGIN
  SELECT * INTO v_seal FROM public.playback_usage_fact_seals s WHERE s.period_start = p_period_start;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT s.chain_sha256 INTO v_prev FROM public.playback_usage_fact_seals s WHERE s.period_end = v_seal.period_start;
  v_prev := coalesce(v_prev, repeat('0', 64));
  SELECT * INTO v_digest FROM public.playback_usage_fact_period_digest(v_seal.period_start);
  v_chain := encode(sha256(convert_to(concat_ws('|',
    v_seal.prev_chain_sha256,
    to_char(v_seal.period_start AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    v_seal.fact_count::text,
    v_seal.listened_ms::text,
    v_seal.facts_sha256), 'UTF8')), 'hex');
  period_start := v_seal.period_start;
  fact_count := v_digest.fact_count;
  sealed_fact_count := v_seal.fact_count;
  facts_sha256 := v_digest.facts_sha256;
  sealed_facts_sha256 := v_seal.facts_sha256;
  chain_ok := v_chain = v_seal.chain_sha256 AND v_prev = v_seal.prev_chain_sha256;
  ok := chain_ok AND v_digest.facts_sha256 = v_seal.facts_sha256 AND v_digest.fact_count = v_seal.fact_count
    AND v_digest.listened_ms = v_seal.listened_ms;
  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------- M4 index registry

CREATE TABLE IF NOT EXISTS public.evidence_index_versions (
  version text PRIMARY KEY,
  built_at timestamptz NOT NULL,
  engine_version text NOT NULL,
  index_json_sha256 text NOT NULL,
  audfprint_sha256 text NULL,
  olaf_version text NULL,
  catalog_tracks integer NOT NULL,
  control_tracks integer NOT NULL,
  failed_tracks integer NOT NULL,
  tracks jsonb NOT NULL,
  size_bytes bigint NULL,
  registered_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evidence_index_versions_version_check CHECK (version ~ '^[0-9]{8}-[0-9]{6}-[0-9a-f]{8}$'),
  CONSTRAINT evidence_index_versions_hash_check CHECK (
    index_json_sha256 ~ '^[0-9a-f]{64}$' AND (audfprint_sha256 IS NULL OR audfprint_sha256 ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT evidence_index_versions_tracks_check CHECK (jsonb_typeof(tracks) = 'array')
);

COMMENT ON TABLE public.evidence_index_versions IS
  'audiolad:evidence M4; one row per fingerprint index version: which catalog (codes + master sha256) the matcher used at a given date. Append-only.';

ALTER TABLE public.evidence_index_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.evidence_index_versions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.evidence_index_versions TO service_role;

-- Append-only guards for the seal and registry tables.
CREATE OR REPLACE FUNCTION public.evidence_append_only_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION '%_append_only', TG_TABLE_NAME USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS playback_usage_fact_seals_append_only ON public.playback_usage_fact_seals;
CREATE TRIGGER playback_usage_fact_seals_append_only
  BEFORE UPDATE OR DELETE ON public.playback_usage_fact_seals
  FOR EACH ROW EXECUTE FUNCTION public.evidence_append_only_guard();
DROP TRIGGER IF EXISTS playback_usage_fact_seals_no_truncate ON public.playback_usage_fact_seals;
CREATE TRIGGER playback_usage_fact_seals_no_truncate
  BEFORE TRUNCATE ON public.playback_usage_fact_seals
  FOR EACH STATEMENT EXECUTE FUNCTION public.evidence_append_only_guard();

DROP TRIGGER IF EXISTS evidence_index_versions_append_only ON public.evidence_index_versions;
CREATE TRIGGER evidence_index_versions_append_only
  BEFORE UPDATE OR DELETE ON public.evidence_index_versions
  FOR EACH ROW EXECUTE FUNCTION public.evidence_append_only_guard();
DROP TRIGGER IF EXISTS evidence_index_versions_no_truncate ON public.evidence_index_versions;
CREATE TRIGGER evidence_index_versions_no_truncate
  BEFORE TRUNCATE ON public.evidence_index_versions
  FOR EACH STATEMENT EXECUTE FUNCTION public.evidence_append_only_guard();

REVOKE ALL ON FUNCTION public.playback_usage_fact_canon(public.playback_usage_facts) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.playback_usage_fact_period_digest(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seal_playback_usage_facts(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verify_playback_usage_fact_seal(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seal_playback_usage_facts(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_playback_usage_fact_seal(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.playback_usage_fact_period_digest(timestamptz) TO service_role;

-- ---------------------------------------------------------------- M2 offline samples

-- Same as apply_business_player_usage_sample (20270226130000), with the sample time as a
-- parameter. The original function is left untouched, so the live hall path does not change.
CREATE OR REPLACE FUNCTION public.apply_business_player_usage_sample_at(
  p_player_id uuid,
  p_client_event_id uuid,
  p_playback_session_id uuid,
  p_sample_seq bigint,
  p_audio_item_id uuid,
  p_position_ms bigint,
  p_client_media_delta_ms bigint DEFAULT NULL,
  p_playback_rate numeric DEFAULT NULL,
  p_phase text DEFAULT 'advance',
  p_now timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_player_id uuid := p_player_id;
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
  -- M2: the accepted sample time (device time of an offline sample, checked by the caller).
  v_now timestamptz := LEAST(coalesce(p_now, clock_timestamp()), clock_timestamp());
  v_accepted bigint := 0;
  v_duplicate boolean := false;
BEGIN
  IF p_client_event_id IS NULL
     OR p_playback_session_id IS NULL
     OR p_audio_item_id IS NULL
     OR p_sample_seq IS NULL
     OR p_sample_seq < 1
  THEN
    RAISE EXCEPTION 'playback_usage_invalid_args' USING ERRCODE = '22023';
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

REVOKE ALL ON FUNCTION public.apply_business_player_usage_sample_at(uuid, uuid, uuid, bigint, uuid, bigint, bigint, numeric, text, timestamptz) FROM PUBLIC, anon, authenticated;

-- Offline sample of a paired hall device (`kind: "usage"`, `offline: true`). The same session,
-- assignment and eligibility checks as apply_business_point_usage_sample. The device time is used
-- as the sample time only if the session already exists and the time lies after its last accepted
-- sample, not before its start, not in the future and within 26 h; else the server time is used
-- (the old behaviour). Either way the fact is flagged client_offline with the raw device time.
CREATE OR REPLACE FUNCTION public.apply_business_point_usage_sample_offline(
  p_token text, p_client_event_id uuid, p_playback_session_id uuid, p_sample_seq bigint,
  p_audio_item_id uuid, p_position_ms bigint, p_device_at timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_session public.business_point_sessions%ROWTYPE;
  v_player uuid;
  v_now timestamptz := clock_timestamp();
  v_ctx_created timestamptz;
  v_ctx_last timestamptz;
  v_at timestamptz := NULL;
  v_result jsonb;
  v_nonce text;
BEGIN
  IF btrim(coalesce(p_token,'')) !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_point_token' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_session FROM public.business_point_sessions
    WHERE token_hash = public.business_point_sha256(btrim(p_token)) AND revoked_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_point_token' USING ERRCODE = '42501'; END IF;
  SELECT id INTO v_player FROM public.business_players WHERE id = v_session.player_id AND status = 'active' FOR SHARE;
  IF v_player IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.business_player_assignments a
    JOIN public.business_zones z ON z.id = a.zone_id AND z.status = 'active'
    JOIN public.business_locations l ON l.id = z.location_id AND l.status = 'active'
    WHERE a.player_id = v_player AND a.unassigned_at IS NULL
      AND l.id = v_session.location_id AND l.organization_id = v_session.organization_id
  ) THEN RAISE EXCEPTION 'point_assignment_changed' USING ERRCODE = '42501'; END IF;
  IF public.resolve_business_track_eligibility(p_audio_item_id, v_session.location_id, NULL,
    'business_background_playback', v_now)->>'decision' IS DISTINCT FROM 'ELIGIBLE' THEN
    RAISE EXCEPTION 'track_not_eligible' USING ERRCODE = '42501'; END IF;

  IF p_playback_session_id IS NOT NULL AND p_device_at IS NOT NULL THEN
    SELECT c.created_at, c.last_reported_at INTO v_ctx_created, v_ctx_last
    FROM public.playback_usage_contexts c
    WHERE c.listening_key = 'business:' || v_player::text || ':' || p_playback_session_id::text
      AND c.usage_kind = 'business' AND c.player_id = v_player;
    IF FOUND
       AND p_device_at <= v_now
       AND p_device_at >= v_now - interval '26 hours'
       AND p_device_at >= v_ctx_created
       AND (v_ctx_last IS NULL OR p_device_at > v_ctx_last)
    THEN
      v_at := p_device_at;
    END IF;
  END IF;

  -- The mark (and the setting naming it) live only for this call; on any error the whole
  -- transaction rolls back, the mark included.
  v_nonce := gen_random_uuid()::text;
  INSERT INTO public.playback_usage_offline_marks (txid, nonce, device_at) VALUES (txid_current(), v_nonce, p_device_at);
  PERFORM set_config('audiolad.usage_offline_mark', v_nonce, true);
  v_result := public.apply_business_player_usage_sample_at(v_player, p_client_event_id, p_playback_session_id,
    p_sample_seq, p_audio_item_id, p_position_ms, NULL, 1, 'advance', coalesce(v_at, v_now));
  PERFORM set_config('audiolad.usage_offline_mark', '', true);
  DELETE FROM public.playback_usage_offline_marks WHERE txid = txid_current() AND nonce = v_nonce;
  RETURN v_result || jsonb_build_object('device_time_used', v_at IS NOT NULL);
END; $$;
REVOKE ALL ON FUNCTION public.apply_business_point_usage_sample_offline(text, uuid, uuid, bigint, uuid, bigint, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_business_point_usage_sample_offline(text, uuid, uuid, bigint, uuid, bigint, timestamptz) TO anon, authenticated, service_role;

COMMIT;
