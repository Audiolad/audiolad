BEGIN;

-- ---------------------------------------------------------------------------
-- 1. User library: access rights separate from financial purchases
-- ---------------------------------------------------------------------------

CREATE TABLE public.user_practices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL
    REFERENCES auth.users (id)
    ON DELETE CASCADE,

  practice_id uuid NOT NULL
    REFERENCES public.practices (id)
    ON DELETE CASCADE,

  access_source text NOT NULL,

  granted_at timestamptz NOT NULL DEFAULT now(),

  expires_at timestamptz NULL,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT user_practices_user_practice_unique
    UNIQUE (user_id, practice_id),

  CONSTRAINT user_practices_access_source_check
    CHECK (access_source IN (
      'starter',
      'free_claim',
      'purchase',
      'gift',
      'subscription',
      'program',
      'admin'
    )),

  CONSTRAINT user_practices_expires_after_granted_check
    CHECK (expires_at IS NULL OR expires_at > granted_at)
);

CREATE INDEX user_practices_user_id_granted_at_idx
  ON public.user_practices (user_id, granted_at DESC);

CREATE INDEX user_practices_practice_id_idx
  ON public.user_practices (practice_id);

REVOKE ALL ON public.user_practices FROM PUBLIC;
REVOKE ALL ON public.user_practices FROM anon, authenticated;

GRANT SELECT ON public.user_practices TO authenticated;

ALTER TABLE public.user_practices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own library"
  ON public.user_practices
  FOR SELECT
  USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. Starter bundle configuration (platform-curated, not hardcoded UUIDs)
-- ---------------------------------------------------------------------------

CREATE TABLE public.starter_practices (
  practice_id uuid PRIMARY KEY
    REFERENCES public.practices (id)
    ON DELETE CASCADE,

  sort_order integer NOT NULL,

  is_active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT starter_practices_sort_order_unique
    UNIQUE (sort_order),

  CONSTRAINT starter_practices_sort_order_positive_check
    CHECK (sort_order > 0)
);

CREATE INDEX starter_practices_active_sort_idx
  ON public.starter_practices (sort_order)
  WHERE is_active = true;

REVOKE ALL ON public.starter_practices FROM PUBLIC;
REVOKE ALL ON public.starter_practices FROM anon, authenticated;

ALTER TABLE public.starter_practices ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3. Starter configuration validation
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.validate_starter_practice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  practice_status text;
  practice_is_free boolean;
BEGIN
  IF NEW.is_active IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  SELECT p.status, p.is_free
  INTO practice_status, practice_is_free
  FROM public.practices AS p
  WHERE p.id = NEW.practice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Starter practice must reference an existing practice';
  END IF;

  IF practice_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'Starter practice must be published';
  END IF;

  IF practice_is_free IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Starter practice must be free';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_starter_practice_before_write
  BEFORE INSERT OR UPDATE OF practice_id, is_active
  ON public.starter_practices
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_starter_practice();

REVOKE EXECUTE ON FUNCTION public.validate_starter_practice()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Idempotent starter grant (for registration trigger and admin backfill)
-- ---------------------------------------------------------------------------

CREATE FUNCTION public.grant_active_starter_practices(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  inserted_count integer;
BEGIN
  INSERT INTO public.user_practices (user_id, practice_id, access_source)
  SELECT
    p_user_id,
    sp.practice_id,
    'starter'
  FROM public.starter_practices AS sp
  INNER JOIN public.practices AS p ON p.id = sp.practice_id
  WHERE sp.is_active = true
    AND p.status = 'published'
    AND p.is_free = true
  ON CONFLICT (user_id, practice_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_active_starter_practices(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_active_starter_practices(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.grant_active_starter_practices(uuid) FROM authenticated;

-- ---------------------------------------------------------------------------
-- 5. Documentation comments
-- ---------------------------------------------------------------------------

COMMENT ON TABLE public.user_practices IS
  'Per-user access rights to practices. Separate from financial purchases.';

COMMENT ON COLUMN public.user_practices.access_source IS
  'How access was granted: starter, free_claim, purchase, gift, subscription, program, or admin.';

COMMENT ON COLUMN public.user_practices.expires_at IS
  'Optional access expiry. NULL means permanent access for the current entitlement model.';

COMMENT ON TABLE public.starter_practices IS
  'Platform-curated starter bundle. New users receive active entries at registration time.';

COMMENT ON FUNCTION public.grant_active_starter_practices(uuid) IS
  'Grants all active starter practices to one user. Idempotent via ON CONFLICT DO NOTHING. Returns inserted row count.';

COMMIT;
