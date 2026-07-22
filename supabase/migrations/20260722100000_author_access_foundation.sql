BEGIN;

-- ---------------------------------------------------------------------------
-- Author access tiers + application provisioning foundation
-- ---------------------------------------------------------------------------

ALTER TABLE public.authors
  ADD COLUMN IF NOT EXISTS access_status text NULL;

UPDATE public.authors
SET access_status = 'commercial'
WHERE access_status IS NULL;

ALTER TABLE public.authors
  ALTER COLUMN access_status SET DEFAULT 'free';

ALTER TABLE public.authors
  ALTER COLUMN access_status SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'authors_access_status_check'
      AND conrelid = 'public.authors'::regclass
  ) THEN
    ALTER TABLE public.authors
      ADD CONSTRAINT authors_access_status_check
      CHECK (
        access_status IN (
          'free',
          'commercial_pending',
          'commercial',
          'suspended',
          'terminated'
        )
      );
  END IF;
END;
$$;

ALTER TABLE public.authors
  ADD COLUMN IF NOT EXISTS access_status_changed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS access_status_changed_by uuid NULL
    REFERENCES auth.users (id);

COMMENT ON COLUMN public.authors.access_status IS
  'Author workspace access tier: free, commercial_pending, commercial, suspended, terminated.';

-- Application ↔ workspace link
ALTER TABLE public.author_applications
  ADD COLUMN IF NOT EXISTS author_id uuid NULL
    REFERENCES public.authors (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS approved_by uuid NULL
    REFERENCES auth.users (id);

CREATE INDEX IF NOT EXISTS author_applications_author_id_idx
  ON public.author_applications (author_id);

COMMENT ON COLUMN public.author_applications.author_id IS
  'Author workspace created or linked when application is approved.';

-- ---------------------------------------------------------------------------
-- Status event journals
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.author_application_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL
    REFERENCES public.author_applications (id) ON DELETE CASCADE,
  from_status text NULL,
  to_status text NOT NULL,
  changed_by uuid NULL REFERENCES auth.users (id),
  staff_comment text NULL,
  applicant_comment text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT author_application_status_events_staff_comment_length_check
    CHECK (staff_comment IS NULL OR char_length(staff_comment) <= 3000),

  CONSTRAINT author_application_status_events_applicant_comment_length_check
    CHECK (applicant_comment IS NULL OR char_length(applicant_comment) <= 3000)
);

CREATE INDEX IF NOT EXISTS author_application_status_events_application_id_idx
  ON public.author_application_status_events (application_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.author_access_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL
    REFERENCES public.authors (id) ON DELETE CASCADE,
  application_id uuid NULL
    REFERENCES public.author_applications (id) ON DELETE SET NULL,
  from_status text NULL,
  to_status text NOT NULL,
  changed_by uuid NULL REFERENCES auth.users (id),
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT author_access_status_events_reason_length_check
    CHECK (reason IS NULL OR char_length(reason) <= 3000)
);

CREATE INDEX IF NOT EXISTS author_access_status_events_author_id_idx
  ON public.author_access_status_events (author_id, created_at DESC);

ALTER TABLE public.author_application_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.author_access_status_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_application_status_events'
      AND policyname = 'Platform staff can select author application status events'
  ) THEN
    CREATE POLICY "Platform staff can select author application status events"
      ON public.author_application_status_events
      FOR SELECT
      TO authenticated
      USING (public.is_platform_staff(auth.uid()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'author_access_status_events'
      AND policyname = 'Platform staff can select author access status events'
  ) THEN
    CREATE POLICY "Platform staff can select author access status events"
      ON public.author_access_status_events
      FOR SELECT
      TO authenticated
      USING (public.is_platform_staff(auth.uid()));
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.author_access_allows_paid_products(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_status = 'commercial';
$$;

CREATE OR REPLACE FUNCTION public.author_access_allows_content_mutations(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_status IS NOT NULL
    AND p_status NOT IN ('suspended', 'terminated');
$$;

CREATE OR REPLACE FUNCTION public.assert_author_content_mutations_allowed(p_author_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT a.access_status
  INTO v_status
  FROM public.authors AS a
  WHERE a.id = p_author_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'author_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.author_access_allows_content_mutations(v_status) THEN
    RAISE EXCEPTION 'author_content_mutations_blocked'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_author_paid_products_allowed(p_author_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT a.access_status
  INTO v_status
  FROM public.authors AS a
  WHERE a.id = p_author_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'author_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.author_access_allows_paid_products(v_status) THEN
    RAISE EXCEPTION 'paid_products_not_allowed'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.author_access_allows_paid_products(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_access_allows_content_mutations(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_author_content_mutations_allowed(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_author_paid_products_allowed(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.author_access_allows_paid_products(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.author_access_allows_content_mutations(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_author_content_mutations_allowed(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_author_paid_products_allowed(uuid) TO authenticated, service_role;

-- Extend personal materials guard
CREATE OR REPLACE FUNCTION public.personal_materials_assert_author_access(
  p_author_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.author_members AS am
    WHERE am.author_id = p_author_id
      AND am.user_id = p_user_id
      AND am.role IN ('owner', 'editor')
  ) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.assert_author_content_mutations_allowed(p_author_id);
END;
$$;

COMMIT;
