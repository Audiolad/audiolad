BEGIN;

-- ---------------------------------------------------------------------------
-- Shared access-grant module for tasks ba344b7f and 1e008ee8.
-- One gift of 30*24 hours of the business music workspace, once per email hash
-- and once per user id. No card, no charge, no mailings.
--
-- Additive: new tables only. No changes to existing tables, rows, grants or
-- policies. No seed rows. Email is stored only as sha256. There is no foreign
-- key to auth.users, so deleting an account does not remove the grant and a
-- later registration of the same address cannot start a second gift.
--
-- business_space_admissions is the seam for task 28d2b5bb. This file inserts
-- no admission rows. An empty whitelist plays nothing.
--
-- NOT APPLIED TO PRODUCTION without Sergey's separate OK.
-- Rollback is documented in docs/business/access-grants.md and is not in this file.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.access_grants (
  email_hash text NOT NULL,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_grants_email_hash_check CHECK (email_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT access_grants_kind_check CHECK (kind = 'business_new_client'),
  CONSTRAINT access_grants_source_check CHECK (source = 'trial'),
  CONSTRAINT access_grants_period_check CHECK (ends_at > starts_at),
  CONSTRAINT access_grants_email_kind_key UNIQUE (email_hash, kind),
  CONSTRAINT access_grants_user_kind_key UNIQUE (user_id, kind)
);

CREATE TABLE IF NOT EXISTS public.access_paid_periods (
  email_hash text NOT NULL,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  paid_until timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email_hash, kind),
  CONSTRAINT access_paid_periods_email_hash_check CHECK (email_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT access_paid_periods_kind_check CHECK (kind = 'business_new_client')
);

CREATE TABLE IF NOT EXISTS public.access_grant_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email_hash text NOT NULL,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  event_name text NOT NULL,
  occurred_at timestamptz NOT NULL,
  CONSTRAINT access_grant_events_email_hash_check CHECK (email_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT access_grant_events_kind_check CHECK (kind = 'business_new_client'),
  CONSTRAINT access_grant_events_name_check CHECK (event_name IN (
    'trial_started',
    'first_useful_action',
    'activity_day_7',
    'activity_day_14',
    'activity_day_30',
    'subscription_offer_shown',
    'subscription_go_to_payment',
    'subscription_renewed'
  ))
);

CREATE UNIQUE INDEX IF NOT EXISTS access_grant_events_unique_idx
  ON public.access_grant_events (email_hash, kind, event_name)
  WHERE event_name <> 'subscription_go_to_payment';

CREATE TABLE IF NOT EXISTS public.business_space_admissions (
  space_id text NOT NULL,
  audio_item_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, audio_item_id),
  CONSTRAINT business_space_admissions_space_check
    CHECK (space_id IN ('cafe', 'spa', 'retail', 'fitness'))
);

COMMENT ON TABLE public.business_space_admissions IS
  'Whitelist seam for task 28d2b5bb. This migration inserts no rows. Empty means the workspace plays nothing.';

CREATE TABLE IF NOT EXISTS public.business_workspace_playback (
  user_id uuid NOT NULL,
  space_id text NOT NULL,
  track_index integer NOT NULL,
  position_seconds double precision NOT NULL,
  volume double precision NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, space_id),
  CONSTRAINT business_workspace_playback_space_check
    CHECK (space_id IN ('cafe', 'spa', 'retail', 'fitness')),
  CONSTRAINT business_workspace_playback_index_check CHECK (track_index >= 0),
  CONSTRAINT business_workspace_playback_position_check CHECK (position_seconds >= 0),
  CONSTRAINT business_workspace_playback_volume_check CHECK (volume >= 0 AND volume <= 1)
);

ALTER TABLE public.access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_paid_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_grant_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_space_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_workspace_playback ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.access_grants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.access_paid_periods FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.access_grant_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.business_space_admissions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.business_workspace_playback FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.access_grants TO service_role;
GRANT ALL ON TABLE public.access_paid_periods TO service_role;
GRANT ALL ON TABLE public.access_grant_events TO service_role;
GRANT ALL ON TABLE public.business_space_admissions TO service_role;
GRANT ALL ON TABLE public.business_workspace_playback TO service_role;

-- Retain every consumed identity, including re-registered accounts and changed emails.
CREATE TABLE IF NOT EXISTS public.access_grant_identities (
  email_hash text NOT NULL CHECK (email_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind = 'business_new_client'),
  PRIMARY KEY (email_hash, user_id, kind)
);
CREATE INDEX IF NOT EXISTS access_grant_identities_user_idx
  ON public.access_grant_identities (user_id, kind);
ALTER TABLE public.access_grant_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.access_grant_identities FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.access_grant_identities TO service_role;

-- A transaction lock serializes graph changes and issuance, including collisions
-- discovered through different identities. Old original windows remain immutable.
CREATE OR REPLACE FUNCTION public.resolve_access_grant(
  p_email_hash text, p_user_id uuid, p_kind text
) RETURNS SETOF public.access_grants
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('access_grants:' || p_kind, 0));
  INSERT INTO public.access_grant_identities (email_hash, user_id, kind)
    VALUES (p_email_hash, p_user_id, p_kind) ON CONFLICT DO NOTHING;
  RETURN QUERY
    WITH RECURSIVE edges AS (
      SELECT i.email_hash, i.user_id FROM public.access_grant_identities i WHERE i.kind = p_kind
      UNION
      SELECT g.email_hash, g.user_id FROM public.access_grants g WHERE g.kind = p_kind
    ), identities (identity) AS (
      SELECT 'email:' || p_email_hash
      UNION
      SELECT CASE WHEN n.identity = 'email:' || e.email_hash
        THEN 'user:' || e.user_id::text ELSE 'email:' || e.email_hash END
      FROM identities n JOIN edges e
        ON n.identity = 'email:' || e.email_hash OR n.identity = 'user:' || e.user_id::text
    )
    SELECT g.* FROM public.access_grants g
    WHERE g.kind = p_kind AND (
      'email:' || g.email_hash IN (SELECT identity FROM identities)
      OR 'user:' || g.user_id::text IN (SELECT identity FROM identities)
    )
    ORDER BY g.starts_at, g.ends_at, g.email_hash LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.insert_access_grant(
  p_email_hash text, p_user_id uuid, p_kind text,
  p_starts_at timestamptz, p_ends_at timestamptz
) RETURNS boolean
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  existing public.access_grants;
  inserted_count integer;
BEGIN
  -- resolve takes the same transaction lock and records the binding before reading.
  SELECT * INTO existing FROM public.resolve_access_grant(p_email_hash, p_user_id, p_kind);
  IF FOUND THEN RETURN false; END IF;
  INSERT INTO public.access_grants (email_hash, user_id, kind, starts_at, ends_at, source)
    VALUES (p_email_hash, p_user_id, p_kind, p_starts_at, p_ends_at, 'trial')
    ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_access_grant(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.insert_access_grant(text, uuid, text, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_access_grant(text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.insert_access_grant(text, uuid, text, timestamptz, timestamptz) TO service_role;

COMMIT;
