-- 20270213120000_business_trial_activity_days (task 253821e0, PR 2)
-- NOT APPLIED. Applying after a backup is Sergey's Human Gate.
-- Note: deploy.sh applies every pending file in supabase/migrations, so merging
-- this file and deploying = applying it. Merge only after Sergey's OK.
--
-- Per-venue daily activity for the admin «Подарочная неделя» stats:
-- music seconds (server-capped), cabinet visits (30-minute sessions), and
-- the host a guest started from. No email, IP, tokens or user agents.
-- The app writes nothing until AUDIOLAD_BUSINESS_TRIAL_ACTIVITY_ENABLED=1.
-- Only service_role can read or write; anon/authenticated get nothing.
-- Functions are SECURITY DEFINER with a fixed search_path, EXECUTE for service_role only.
BEGIN;
-- Fail fast instead of queueing behind live traffic: the ALTER on business_guest_starts
-- and the FK to business_organizations need table locks. 55P03 after 3s rolls the whole
-- file back; deploy can simply retry later.
SET LOCAL lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.business_trial_activity_days (
  organization_id uuid NOT NULL REFERENCES public.business_organizations(id) ON DELETE CASCADE,
  day date NOT NULL,
  listened_seconds integer NOT NULL DEFAULT 0 CHECK (listened_seconds BETWEEN 0 AND 86400),
  cabinet_visits integer NOT NULL DEFAULT 0 CHECK (cabinet_visits BETWEEN 0 AND 100000),
  last_listen_report_at timestamptz,
  last_visit_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, day)
);
CREATE INDEX IF NOT EXISTS business_trial_activity_days_day_idx
  ON public.business_trial_activity_days(day);

ALTER TABLE public.business_trial_activity_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_trial_activity_days FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_trial_activity_days TO service_role;

ALTER TABLE public.business_guest_starts ADD COLUMN IF NOT EXISTS start_host text;
ALTER TABLE public.business_guest_starts DROP CONSTRAINT IF EXISTS business_guest_starts_start_host_check;
ALTER TABLE public.business_guest_starts ADD CONSTRAINT business_guest_starts_start_host_check
  CHECK (start_host IS NULL OR start_host IN ('coffee', 'business'));

-- One row per venue and Moscow day. p_kind 'listen' adds the real time since the
-- previous listen report of that day, capped at p_max_step_seconds, so parallel
-- or replayed reports cannot inflate minutes. p_kind 'visit' counts a new visit
-- when the previous one was more than p_visit_gap_seconds ago. Rows older than
-- p_retention_days for this venue are deleted on the way.
CREATE OR REPLACE FUNCTION public.record_business_trial_activity(
  p_organization_id uuid,
  p_kind text,
  p_max_step_seconds integer DEFAULT 30,
  p_visit_gap_seconds integer DEFAULT 1800,
  p_retention_days integer DEFAULT 180
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := statement_timestamp();
  v_day date := (statement_timestamp() AT TIME ZONE 'Europe/Moscow')::date;
  v_step integer := least(greatest(coalesce(p_max_step_seconds, 30), 1), 120);
  v_gap integer := least(greatest(coalesce(p_visit_gap_seconds, 1800), 60), 86400);
  v_keep integer := least(greatest(coalesce(p_retention_days, 180), 1), 730);
BEGIN
  IF p_organization_id IS NULL OR p_kind NOT IN ('listen', 'visit') THEN
    RAISE EXCEPTION 'invalid_trial_activity' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.business_organizations o WHERE o.id = p_organization_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.business_trial_activity_days AS d (
    organization_id, day, listened_seconds, cabinet_visits,
    last_listen_report_at, last_visit_at, first_seen_at, last_seen_at
  ) VALUES (
    p_organization_id, v_day, 0,
    CASE WHEN p_kind = 'visit' THEN 1 ELSE 0 END,
    CASE WHEN p_kind = 'listen' THEN v_now END,
    CASE WHEN p_kind = 'visit' THEN v_now END,
    v_now, v_now
  )
  ON CONFLICT (organization_id, day) DO UPDATE SET
    listened_seconds = CASE
      WHEN p_kind = 'listen' AND d.last_listen_report_at IS NOT NULL THEN
        least(86400, d.listened_seconds + least(v_step,
          greatest(0, floor(extract(epoch FROM (v_now - d.last_listen_report_at)))::integer)))
      ELSE d.listened_seconds
    END,
    -- greatest(): a report with an older statement time never moves the marker back.
    last_listen_report_at = CASE WHEN p_kind = 'listen' THEN greatest(d.last_listen_report_at, v_now) ELSE d.last_listen_report_at END,
    cabinet_visits = CASE
      WHEN p_kind = 'visit' AND (d.last_visit_at IS NULL OR v_now - d.last_visit_at > make_interval(secs => v_gap))
        THEN least(100000, d.cabinet_visits + 1)
      ELSE d.cabinet_visits
    END,
    last_visit_at = CASE WHEN p_kind = 'visit' THEN greatest(d.last_visit_at, v_now) ELSE d.last_visit_at END,
    last_seen_at = greatest(d.last_seen_at, v_now);

  DELETE FROM public.business_trial_activity_days
    WHERE organization_id = p_organization_id AND day < v_day - v_keep;
END
$$;

-- Same, for a paired point device: the token is resolved like report_business_point_player.
CREATE OR REPLACE FUNCTION public.record_business_trial_point_listen(
  p_token text,
  p_max_step_seconds integer DEFAULT 30,
  p_retention_days integer DEFAULT 180
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token text := btrim(coalesce(p_token, ''));
  v_org uuid;
BEGIN
  IF v_token !~ '^[0-9a-f]{64}$' THEN
    RETURN;
  END IF;
  SELECT s.organization_id INTO v_org
    FROM public.business_point_sessions s
    WHERE s.token_hash = sha256(convert_to(v_token, 'UTF8')) AND s.revoked_at IS NULL;
  IF v_org IS NULL THEN
    RETURN;
  END IF;
  PERFORM public.record_business_trial_activity(v_org, 'listen', p_max_step_seconds, 1800, p_retention_days);
END
$$;

CREATE OR REPLACE FUNCTION public.purge_business_trial_activity_days(p_retention_days integer DEFAULT 180)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_keep integer := least(greatest(coalesce(p_retention_days, 180), 1), 730);
  v_deleted integer;
BEGIN
  DELETE FROM public.business_trial_activity_days
    WHERE day < (statement_timestamp() AT TIME ZONE 'Europe/Moscow')::date - v_keep;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END
$$;

REVOKE ALL ON FUNCTION public.record_business_trial_activity(uuid, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_business_trial_point_listen(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_business_trial_activity_days(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_business_trial_activity(uuid, text, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_business_trial_point_listen(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_business_trial_activity_days(integer) TO service_role;

COMMIT;

-- Rollback (after a backup and a separate decision). Turn the flag off first:
-- AUDIOLAD_BUSINESS_TRIAL_ACTIVITY_ENABLED unset, redeploy; then the app calls
-- none of these functions. Same SQL is in supabase/rollbacks/ next to this file.
-- BEGIN;
-- SET LOCAL lock_timeout = '3s';
-- DROP FUNCTION IF EXISTS public.purge_business_trial_activity_days(integer);
-- DROP FUNCTION IF EXISTS public.record_business_trial_point_listen(text, integer, integer);
-- DROP FUNCTION IF EXISTS public.record_business_trial_activity(uuid, text, integer, integer, integer);
-- DROP TABLE IF EXISTS public.business_trial_activity_days;
-- ALTER TABLE public.business_guest_starts DROP CONSTRAINT IF EXISTS business_guest_starts_start_host_check;
-- ALTER TABLE public.business_guest_starts DROP COLUMN IF EXISTS start_host;
-- DELETE FROM supabase_migrations.schema_migrations WHERE version = '20270213120000';
-- COMMIT;
