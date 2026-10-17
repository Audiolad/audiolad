BEGIN;

-- ---------------------------------------------------------------------------
-- a8240527: AudioLad Business guest coffee cabinet (business.audiolad.ru/guest/coffee)
-- Server-side guest listening meter: 30 minutes of playback per guest, kept across
-- visits (Sergey 17.10.2026 15:32 MSK). Counting does NOT depend on the client:
--
--  * Every stream URL the server issues opens a playback LEASE on the device row
--    (track length known to the server). The next issue settles the previous lease at
--    least(track length, wall-clock since issue), but never less than least(track
--    length, 15 s) - so suppressing client reports or skipping through tracks to
--    harvest URLs is still charged.
--  * Client reports (actual <audio> progress) only ADD to the open lease, cumulatively
--    bounded by least(track length, wall-clock since the lease opened): no per-request
--    slack, replays are idempotent. They make the meter current mid-track and charge
--    the last track of a session.
--  * Identity: device_hash = sha256 of a random httpOnly cookie token (primary);
--    ip_hash = HMAC(server secret, client IP; IPv6 per /64) - a SEPARATE shared counter,
--    independent of the cookie and of client headers. Every charge goes to both.
--    effective used = greatest(device used, ip used - (ip limit - device limit)):
--    one device gets 30 min; clearing / juggling cookies on the same network gets at
--    most ip limit (2 x 30 min) per rolling 30 days. Constants mirror limit.ts.
--
-- Additive only: two new tables + three SECURITY DEFINER functions. No changes to
-- existing tables, rows, grants or policies. No personal data in clear text.
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_guest_listening_device_hash_check
    CHECK (device_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT business_guest_listening_used_seconds_check
    CHECK (used_seconds >= 0 AND used_seconds <= 86400),
  CONSTRAINT business_guest_listening_lease_check
    CHECK (
      (lease_started_at IS NULL AND lease_cap_seconds IS NULL)
      OR (lease_started_at IS NOT NULL AND lease_cap_seconds BETWEEN 1 AND 900)
    ),
  CONSTRAINT business_guest_listening_lease_charged_check
    CHECK (lease_charged_seconds >= 0 AND lease_charged_seconds <= 900)
);

CREATE TABLE IF NOT EXISTS public.business_guest_listening_ip (
  ip_hash text PRIMARY KEY,
  used_seconds integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT business_guest_listening_ip_hash_check
    CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT business_guest_listening_ip_used_seconds_check
    CHECK (used_seconds >= 0 AND used_seconds <= 864000)
);

ALTER TABLE public.business_guest_listening ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_guest_listening_ip ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_guest_listening FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.business_guest_listening_ip FROM PUBLIC, anon, authenticated;

-- Internal: lock (creating if needed) both rows, IP row first (fixed lock order), and
-- reset an IP window older than 30 days. Not granted to anyone.
CREATE OR REPLACE FUNCTION public.business_guest_listening_lock_(
  p_device_hash text,
  p_ip_hash text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_window timestamptz;
BEGIN
  IF p_device_hash IS NULL OR p_device_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_device_hash' USING ERRCODE = '22023';
  END IF;
  IF p_ip_hash IS NOT NULL AND p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_ip_hash' USING ERRCODE = '22023';
  END IF;

  IF p_ip_hash IS NOT NULL THEN
    INSERT INTO public.business_guest_listening_ip (ip_hash) VALUES (p_ip_hash)
    ON CONFLICT (ip_hash) DO NOTHING;
    SELECT window_started_at INTO v_window FROM public.business_guest_listening_ip
    WHERE ip_hash = p_ip_hash FOR UPDATE;
    IF v_window < now() - interval '30 days' THEN
      UPDATE public.business_guest_listening_ip
      SET used_seconds = 0, window_started_at = now(), updated_at = now()
      WHERE ip_hash = p_ip_hash;
    END IF;
  END IF;

  INSERT INTO public.business_guest_listening (device_hash) VALUES (p_device_hash)
  ON CONFLICT (device_hash) DO NOTHING;
  PERFORM 1 FROM public.business_guest_listening
  WHERE device_hash = p_device_hash FOR UPDATE;
END;
$$;

-- Internal: add seconds to both counters (already locked by the caller).
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
    UPDATE public.business_guest_listening_ip
    SET used_seconds = least(used_seconds + p_seconds, 864000), updated_at = now()
    WHERE ip_hash = p_ip_hash;
  END IF;
END;
$$;

-- Internal: what the open lease of a device row would cost if settled now.
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

-- Internal: effective used seconds (device limit 1800, IP limit 3600).
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

-- Issue a stream URL: settle the previous lease, then open a new one unless the limit
-- is used up. Returns the effective used seconds; >= 1800 means "refuse the URL".
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
  v_ip public.business_guest_listening_ip;
  v_effective integer;
BEGIN
  PERFORM public.business_guest_listening_lock_(p_device_hash, p_ip_hash);
  SELECT * INTO v_device FROM public.business_guest_listening WHERE device_hash = p_device_hash;
  IF p_ip_hash IS NOT NULL THEN
    SELECT * INTO v_ip FROM public.business_guest_listening_ip WHERE ip_hash = p_ip_hash;
  END IF;

  PERFORM public.business_guest_listening_charge_(
    p_device_hash, p_ip_hash, public.business_guest_listening_lease_owed_(v_device));

  UPDATE public.business_guest_listening
  SET lease_started_at = NULL, lease_cap_seconds = NULL, lease_charged_seconds = 0
  WHERE device_hash = p_device_hash
  RETURNING * INTO v_device;
  IF p_ip_hash IS NOT NULL THEN
    SELECT * INTO v_ip FROM public.business_guest_listening_ip WHERE ip_hash = p_ip_hash;
  END IF;

  v_effective := public.business_guest_listening_effective_(v_device.used_seconds, v_ip.used_seconds);
  IF v_effective < 1800 THEN
    UPDATE public.business_guest_listening
    SET lease_started_at = now(),
        lease_cap_seconds = least(greatest(coalesce(p_track_seconds, 300), 1), 900),
        lease_charged_seconds = 0,
        updated_at = now()
    WHERE device_hash = p_device_hash;
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
  v_ip public.business_guest_listening_ip;
  v_new integer;
  v_delta integer := 0;
BEGIN
  PERFORM public.business_guest_listening_lock_(p_device_hash, p_ip_hash);
  SELECT * INTO v_device FROM public.business_guest_listening WHERE device_hash = p_device_hash;
  IF p_ip_hash IS NOT NULL THEN
    SELECT * INTO v_ip FROM public.business_guest_listening_ip WHERE ip_hash = p_ip_hash;
  END IF;

  IF v_device.lease_started_at IS NOT NULL THEN
    v_new := least(
      v_device.lease_cap_seconds,
      greatest(0, floor(extract(epoch FROM (now() - v_device.lease_started_at))))::integer,
      v_device.lease_charged_seconds + least(greatest(coalesce(p_seconds, 0), 0), 60)
    );
    v_delta := greatest(0, v_new - v_device.lease_charged_seconds);
    IF v_delta > 0 THEN
      PERFORM public.business_guest_listening_charge_(p_device_hash, p_ip_hash, v_delta);
      UPDATE public.business_guest_listening
      SET lease_charged_seconds = lease_charged_seconds + v_delta
      WHERE device_hash = p_device_hash;
    END IF;
  END IF;

  SELECT * INTO v_device FROM public.business_guest_listening WHERE device_hash = p_device_hash;
  IF p_ip_hash IS NOT NULL THEN
    SELECT * INTO v_ip FROM public.business_guest_listening_ip WHERE ip_hash = p_ip_hash;
  END IF;
  RETURN public.business_guest_listening_effective_(v_device.used_seconds, v_ip.used_seconds);
END;
$$;

-- Read-only lookup for the first render (creates nothing; includes what the open
-- lease would cost if settled now).
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
    coalesce((
      SELECT i.used_seconds FROM public.business_guest_listening_ip i
      WHERE p_ip_hash IS NOT NULL
        AND i.ip_hash = p_ip_hash
        AND i.window_started_at >= now() - interval '30 days'
    ), 0)
  );
$$;

REVOKE ALL ON FUNCTION public.business_guest_listening_lock_(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_guest_listening_charge_(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_guest_listening_lease_owed_(public.business_guest_listening) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_guest_listening_effective_(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_guest_listening_issue(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_guest_listening_report(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_guest_listening_peek(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_guest_listening_issue(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.business_guest_listening_report(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.business_guest_listening_peek(text, text) TO service_role;

COMMIT;
