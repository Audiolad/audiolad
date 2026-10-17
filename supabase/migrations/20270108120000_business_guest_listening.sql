BEGIN;

-- ---------------------------------------------------------------------------
-- a8240527: AudioLad Business guest coffee cabinet (business.audiolad.ru/guest/coffee)
-- Server-side guest listening meter: 30 minutes of ACTUAL playback per guest,
-- kept across visits (Sergey 17.10.2026 15:32 MSK).
--
-- Additive only: one new table + one SECURITY DEFINER function. No changes to
-- existing tables, rows, grants or policies. No personal data in clear text:
--   device_hash   = sha256 of a random httpOnly cookie token (primary binding);
--   fallback_hash = HMAC(server secret, IP + "|" + User-Agent) (used only when
--                   the device cookie was cleared, to inherit the used seconds).
-- Access: service_role only (Next.js route handlers). RLS on, no policies.
-- Rollback: docs/business/guest-listening-a8240527-rollback.sql
-- NOT APPLIED TO PRODUCTION without Sergey's separate OK.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.business_guest_listening (
  device_hash text PRIMARY KEY,
  fallback_hash text NULL,
  used_seconds integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_credit_at timestamptz NULL,
  CONSTRAINT business_guest_listening_device_hash_check
    CHECK (device_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT business_guest_listening_fallback_hash_check
    CHECK (fallback_hash IS NULL OR fallback_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT business_guest_listening_used_seconds_check
    CHECK (used_seconds >= 0 AND used_seconds <= 86400)
);

CREATE INDEX IF NOT EXISTS business_guest_listening_fallback_idx
  ON public.business_guest_listening (fallback_hash, updated_at DESC)
  WHERE fallback_hash IS NOT NULL;

ALTER TABLE public.business_guest_listening ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_guest_listening FROM PUBLIC, anon, authenticated;

-- Credits actual playback seconds and returns the guest's total.
--   p_credit_seconds is clamped to [0, 60] and, after the first report, to the
--   wall-clock time since the previous credit (+10 s slack), so a buggy or
--   replayed client cannot inflate or double-count a report.
--   A new device inherits the largest total of the same fallback_hash seen in
--   the last 30 days (cookie cleared → limit kept).
CREATE OR REPLACE FUNCTION public.business_guest_listening_apply(
  p_device_hash text,
  p_fallback_hash text,
  p_credit_seconds integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inherit integer := 0;
  v_credit integer := least(greatest(coalesce(p_credit_seconds, 0), 0), 60);
  v_row public.business_guest_listening;
BEGIN
  IF p_device_hash IS NULL OR p_device_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_device_hash' USING ERRCODE = '22023';
  END IF;
  IF p_fallback_hash IS NOT NULL AND p_fallback_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_fallback_hash' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.business_guest_listening
  WHERE device_hash = p_device_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_fallback_hash IS NOT NULL THEN
      SELECT coalesce(max(used_seconds), 0) INTO v_inherit
      FROM public.business_guest_listening
      WHERE fallback_hash = p_fallback_hash
        AND updated_at > now() - interval '30 days';
    END IF;
    INSERT INTO public.business_guest_listening (device_hash, fallback_hash, used_seconds)
    VALUES (p_device_hash, p_fallback_hash, least(v_inherit, 86400))
    ON CONFLICT (device_hash) DO NOTHING;
    SELECT * INTO v_row FROM public.business_guest_listening
    WHERE device_hash = p_device_hash
    FOR UPDATE;
  END IF;

  IF v_row.last_credit_at IS NOT NULL THEN
    v_credit := least(
      v_credit,
      greatest(0, floor(extract(epoch FROM (now() - v_row.last_credit_at)))::integer + 10)
    );
  END IF;

  UPDATE public.business_guest_listening
  SET used_seconds = least(used_seconds + v_credit, 86400),
      fallback_hash = coalesce(p_fallback_hash, fallback_hash),
      updated_at = now(),
      last_credit_at = CASE WHEN v_credit > 0 THEN now() ELSE last_credit_at END
  WHERE device_hash = p_device_hash
  RETURNING * INTO v_row;

  RETURN v_row.used_seconds;
END;
$$;

-- Read-only lookup for the first render (no row is created).
CREATE OR REPLACE FUNCTION public.business_guest_listening_peek(
  p_device_hash text,
  p_fallback_hash text
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(
    (SELECT used_seconds FROM public.business_guest_listening WHERE device_hash = p_device_hash),
    (SELECT max(used_seconds) FROM public.business_guest_listening
      WHERE p_fallback_hash IS NOT NULL
        AND fallback_hash = p_fallback_hash
        AND updated_at > now() - interval '30 days'),
    0
  );
$$;

REVOKE ALL ON FUNCTION public.business_guest_listening_apply(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.business_guest_listening_peek(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_guest_listening_apply(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.business_guest_listening_peek(text, text) TO service_role;

COMMIT;
