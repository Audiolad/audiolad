BEGIN;

-- ---------------------------------------------------------------------------
-- a8240527: AudioLad Business guest coffee cabinet (business.audiolad.ru/guest/coffee)
-- Server-side guest listening meter: 30 minutes of playback per guest, kept across
-- visits (Sergey 17.10.2026 15:32 MSK). Counting does NOT depend on the client:
--
--  * Every stream URL the server issues opens a playback LEASE on the device row,
--    remembering the client network it was issued to and the track length (server-known).
--    Issuing charges least(track length, 15 s) up front to the device AND the network.
--    A lease costs least(track length, wall-clock since issue) in total; it is settled
--    on the device's next issue, and an expired lease (wall clock >= track length) of
--    ANY device is settled by the next issue on the same network.
--  * Before authorising a URL, the network total also includes what every still-open
--    lease issued to that network would cost right now - so fresh cookies with
--    suppressed reports cannot leave unaccounted leases behind.
--  * Client reports (actual <audio> progress) only ADD to the open lease, cumulatively
--    bounded by least(track length, wall-clock since the lease opened): no per-request
--    slack, replays are idempotent.
--  * Identity: device_hash = sha256 of a random httpOnly cookie token (primary);
--    ip_hash = HMAC(server secret, client IP; IPv6 per /64), independent of the cookie
--    and of client headers. Network usage = sum of daily buckets over a ROLLING 30 days.
--    effective used = greatest(device used, network used - (3600 - 1800)): one device
--    gets 30 min; cookie juggling on one network gets at most 2 x 30 min per rolling
--    30 days. Constants mirror src/lib/business-app/guest-coffee/limit.ts.
--
-- Additive only: two new tables + SECURITY DEFINER functions. No changes to existing
-- tables, rows, grants or policies. No personal data in clear text.
-- Access: service_role only (Next.js route handlers). RLS on, no policies.
-- Rollback: docs/business/guest-listening-a8240527-rollback.sql
-- NOT APPLIED TO PRODUCTION without Sergey's separate OK.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.business_guest_listening (
  device_hash text PRIMARY KEY,
  used_seconds integer NOT NULL DEFAULT 0,
  lease_started_at timestamptz NULL,
  lease_cap_seconds integer NULL,
  lease_charged_seconds integer NOT NULL DEFAULT 0,
  lease_ip_hash text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_guest_listening_device_hash_check
    CHECK (device_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT business_guest_listening_lease_ip_hash_check
    CHECK (lease_ip_hash IS NULL OR lease_ip_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT business_guest_listening_used_seconds_check
    CHECK (used_seconds >= 0 AND used_seconds <= 86400),
  CONSTRAINT business_guest_listening_lease_check
    CHECK (
      (lease_started_at IS NULL AND lease_cap_seconds IS NULL AND lease_ip_hash IS NULL)
      OR (lease_started_at IS NOT NULL AND lease_cap_seconds BETWEEN 1 AND 900)
    ),
  CONSTRAINT business_guest_listening_lease_charged_check
    CHECK (lease_charged_seconds >= 0 AND lease_charged_seconds <= 900)
);

CREATE INDEX IF NOT EXISTS business_guest_listening_open_lease_idx
  ON public.business_guest_listening (lease_ip_hash)
  WHERE lease_started_at IS NOT NULL AND lease_ip_hash IS NOT NULL;

-- Per-network usage in daily buckets (rolling 30-day sum).
CREATE TABLE IF NOT EXISTS public.business_guest_listening_ip_day (
  ip_hash text NOT NULL,
  day date NOT NULL,
  used_seconds integer NOT NULL DEFAULT 0,
  PRIMARY KEY (ip_hash, day),
  CONSTRAINT business_guest_listening_ip_day_hash_check
    CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT business_guest_listening_ip_day_used_check
    CHECK (used_seconds >= 0 AND used_seconds <= 864000)
);

ALTER TABLE public.business_guest_listening ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_guest_listening_ip_day ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_guest_listening FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.business_guest_listening_ip_day FROM PUBLIC, anon, authenticated;

-- Internal: validate input, serialise per network (transaction advisory lock), create
-- and lock the device row. Not granted to anyone.
CREATE OR REPLACE FUNCTION public.business_guest_listening_lock_(
  p_device_hash text,
  p_ip_hash text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_device_hash IS NULL OR p_device_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_device_hash' USING ERRCODE = '22023';
  END IF;
  IF p_ip_hash IS NOT NULL AND p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_ip_hash' USING ERRCODE = '22023';
  END IF;
  IF p_ip_hash IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('business_guest_listening:' || p_ip_hash, 0));
  END IF;
  INSERT INTO public.business_guest_listening (device_hash) VALUES (p_device_hash)
  ON CONFLICT (device_hash) DO NOTHING;
  PERFORM 1 FROM public.business_guest_listening WHERE device_hash = p_device_hash FOR UPDATE;
END;
$$;

-- Internal: add seconds to a device and (when known) to today's bucket of a network.
CREATE OR REPLACE FUNCTION public.business_guest_listening_charge_(
  p_device_hash text,
  p_ip_hash text,
  p_seconds integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(p_seconds, 0) <= 0 THEN
    RETURN;
  END IF;
  UPDATE public.business_guest_listening
  SET used_seconds = least(used_seconds + p_seconds, 86400), updated_at = now()
  WHERE device_hash = p_device_hash;
  IF p_ip_hash IS NOT NULL THEN
    INSERT INTO public.business_guest_listening_ip_day AS b (ip_hash, day, used_seconds)
    VALUES (p_ip_hash, current_date, least(p_seconds, 864000))
    ON CONFLICT (ip_hash, day) DO UPDATE
      SET used_seconds = least(b.used_seconds + excluded.used_seconds, 864000);
  END IF;
END;
$$;

-- Internal: what an open lease still owes if settled now.
CREATE OR REPLACE FUNCTION public.business_guest_listening_lease_owed_(
  p_device public.business_guest_listening
)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_device.lease_started_at IS NULL THEN 0
    ELSE greatest(
      0,
      greatest(
        least(p_device.lease_cap_seconds,
              greatest(0, floor(extract(epoch FROM (now() - p_device.lease_started_at))))::integer),
        least(p_device.lease_cap_seconds, 15)
      ) - p_device.lease_charged_seconds
    )
  END;
$$;

-- Internal: network usage over the rolling 30 days, including what every still-open
-- lease issued to that network (other than p_except_device's) would cost now.
CREATE OR REPLACE FUNCTION public.business_guest_listening_network_used_(
  p_ip_hash text,
  p_except_device text
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN p_ip_hash IS NULL THEN 0 ELSE (
    coalesce((
      SELECT sum(b.used_seconds) FROM public.business_guest_listening_ip_day b
      WHERE b.ip_hash = p_ip_hash AND b.day > current_date - 30
    ), 0)
    + coalesce((
      SELECT sum(public.business_guest_listening_lease_owed_(d))
      FROM public.business_guest_listening d
      WHERE d.lease_ip_hash = p_ip_hash
        AND d.lease_started_at IS NOT NULL
        AND d.device_hash IS DISTINCT FROM p_except_device
    ), 0)
  )::integer END;
$$;

-- Internal: effective used seconds (device limit 1800, network limit 3600).
CREATE OR REPLACE FUNCTION public.business_guest_listening_effective_(
  p_device_used integer,
  p_ip_used integer
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT greatest(coalesce(p_device_used, 0), coalesce(p_ip_used, 0) - (3600 - 1800));
$$;

-- Internal: charge what a lease still owes (to its device and the network it was issued
-- to) and close it. The caller holds the device row lock.
CREATE OR REPLACE FUNCTION public.business_guest_listening_settle_(
  p_device_hash text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_device public.business_guest_listening;
BEGIN
  SELECT * INTO v_device FROM public.business_guest_listening WHERE device_hash = p_device_hash;
  IF NOT FOUND OR v_device.lease_started_at IS NULL THEN
    RETURN;
  END IF;
  PERFORM public.business_guest_listening_charge_(
    p_device_hash, v_device.lease_ip_hash, public.business_guest_listening_lease_owed_(v_device));
  UPDATE public.business_guest_listening
  SET lease_started_at = NULL, lease_cap_seconds = NULL, lease_charged_seconds = 0,
      lease_ip_hash = NULL, updated_at = now()
  WHERE device_hash = p_device_hash;
END;
$$;

-- Issue a stream URL: settle this device's previous lease and the expired leases of the
-- network, then open a new lease unless the limit is used up. Returns the effective used
-- seconds BEFORE the new lease's up-front charge; >= 1800 means "refuse the URL".
CREATE OR REPLACE FUNCTION public.business_guest_listening_issue(
  p_device_hash text,
  p_ip_hash text,
  p_track_seconds integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_device public.business_guest_listening;
  v_other text;
  v_cap integer := least(greatest(coalesce(p_track_seconds, 300), 1), 900);
  v_effective integer;
BEGIN
  PERFORM public.business_guest_listening_lock_(p_device_hash, p_ip_hash);
  PERFORM public.business_guest_listening_settle_(p_device_hash);

  IF p_ip_hash IS NOT NULL THEN
    FOR v_other IN
      SELECT d.device_hash FROM public.business_guest_listening d
      WHERE d.lease_ip_hash = p_ip_hash
        AND d.lease_started_at IS NOT NULL
        AND d.device_hash <> p_device_hash
        AND now() - d.lease_started_at >= make_interval(secs => d.lease_cap_seconds)
      FOR UPDATE SKIP LOCKED
    LOOP
      PERFORM public.business_guest_listening_settle_(v_other);
    END LOOP;
    DELETE FROM public.business_guest_listening_ip_day
    WHERE ip_hash = p_ip_hash AND day <= current_date - 31;
  END IF;

  SELECT * INTO v_device FROM public.business_guest_listening WHERE device_hash = p_device_hash;
  v_effective := public.business_guest_listening_effective_(
    v_device.used_seconds,
    public.business_guest_listening_network_used_(p_ip_hash, p_device_hash));

  IF v_effective < 1800 THEN
    UPDATE public.business_guest_listening
    SET lease_started_at = now(),
        lease_cap_seconds = v_cap,
        lease_charged_seconds = least(v_cap, 15),
        lease_ip_hash = p_ip_hash,
        updated_at = now()
    WHERE device_hash = p_device_hash;
    PERFORM public.business_guest_listening_charge_(p_device_hash, p_ip_hash, least(v_cap, 15));
  END IF;
  RETURN v_effective;
END;
$$;

-- Report actual playback of the current lease. Credit is cumulative and bounded by
-- least(track length, wall-clock since the lease opened): replays add nothing.
CREATE OR REPLACE FUNCTION public.business_guest_listening_report(
  p_device_hash text,
  p_ip_hash text,
  p_seconds integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_device public.business_guest_listening;
  v_new integer;
  v_delta integer := 0;
BEGIN
  PERFORM public.business_guest_listening_lock_(p_device_hash, p_ip_hash);
  SELECT * INTO v_device FROM public.business_guest_listening WHERE device_hash = p_device_hash;

  IF v_device.lease_started_at IS NOT NULL THEN
    v_new := least(
      v_device.lease_cap_seconds,
      greatest(0, floor(extract(epoch FROM (now() - v_device.lease_started_at))))::integer,
      v_device.lease_charged_seconds + least(greatest(coalesce(p_seconds, 0), 0), 60)
    );
    v_delta := greatest(0, v_new - v_device.lease_charged_seconds);
    IF v_delta > 0 THEN
      PERFORM public.business_guest_listening_charge_(p_device_hash, v_device.lease_ip_hash, v_delta);
      UPDATE public.business_guest_listening
      SET lease_charged_seconds = lease_charged_seconds + v_delta
      WHERE device_hash = p_device_hash;
    END IF;
  END IF;

  SELECT * INTO v_device FROM public.business_guest_listening WHERE device_hash = p_device_hash;
  RETURN public.business_guest_listening_effective_(
    v_device.used_seconds,
    public.business_guest_listening_network_used_(p_ip_hash, p_device_hash));
END;
$$;

-- Read-only lookup for the first render (creates nothing; includes what open leases
-- would cost if settled now).
CREATE OR REPLACE FUNCTION public.business_guest_listening_peek(
  p_device_hash text,
  p_ip_hash text
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.business_guest_listening_effective_(
    coalesce((
      SELECT d.used_seconds + public.business_guest_listening_lease_owed_(d)
      FROM public.business_guest_listening d
      WHERE d.device_hash = p_device_hash
    ), 0),
    public.business_guest_listening_network_used_(p_ip_hash, p_device_hash)
  );
$$;

REVOKE ALL ON FUNCTION public.business_guest_listening_lock_(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.business_guest_listening_charge_(text, text, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.business_guest_listening_lease_owed_(public.business_guest_listening) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.business_guest_listening_network_used_(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.business_guest_listening_effective_(integer, integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.business_guest_listening_settle_(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.business_guest_listening_issue(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_guest_listening_report(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_guest_listening_peek(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_guest_listening_issue(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.business_guest_listening_report(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.business_guest_listening_peek(text, text) TO service_role;

COMMIT;
