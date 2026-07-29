BEGIN;

-- ---------------------------------------------------------------------------
-- support_requests: foundation for Help Center tickets (no operator UI yet).
-- Inserts go through the controlled server API with service_role only.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  author_id uuid NULL REFERENCES public.authors (id) ON DELETE SET NULL,
  category text NOT NULL,
  subject text NOT NULL,
  message text NOT NULL,
  contact_name text NULL,
  contact_email text NOT NULL,
  source_url text NULL,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_requests_category_check CHECK (
    category IN (
      'account',
      'listening',
      'authoring',
      'personal-materials',
      'promotion',
      'payments',
      'technical',
      'other'
    )
  ),
  CONSTRAINT support_requests_status_check CHECK (
    status IN ('new', 'in_progress', 'answered', 'closed')
  ),
  CONSTRAINT support_requests_subject_len_check CHECK (
    char_length(btrim(subject)) BETWEEN 3 AND 200
  ),
  CONSTRAINT support_requests_message_len_check CHECK (
    char_length(btrim(message)) BETWEEN 10 AND 5000
  ),
  CONSTRAINT support_requests_contact_email_len_check CHECK (
    char_length(btrim(contact_email)) BETWEEN 3 AND 254
  ),
  CONSTRAINT support_requests_contact_name_len_check CHECK (
    contact_name IS NULL OR char_length(contact_name) <= 120
  ),
  CONSTRAINT support_requests_source_url_len_check CHECK (
    source_url IS NULL OR char_length(source_url) <= 500
  )
);

CREATE INDEX IF NOT EXISTS support_requests_created_at_idx
  ON public.support_requests (created_at DESC);

CREATE INDEX IF NOT EXISTS support_requests_status_created_at_idx
  ON public.support_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS support_requests_user_id_idx
  ON public.support_requests (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS support_requests_author_id_idx
  ON public.support_requests (author_id)
  WHERE author_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_support_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_requests_set_updated_at ON public.support_requests;
CREATE TRIGGER support_requests_set_updated_at
  BEFORE UPDATE ON public.support_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_support_requests_updated_at();

ALTER TABLE public.support_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.support_requests FROM PUBLIC;
REVOKE ALL ON TABLE public.support_requests FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.support_requests TO service_role;

COMMENT ON TABLE public.support_requests IS
  'audiolad:help-center; support form tickets; no direct client insert; service_role only';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'support_requests_status_check'
      AND conrelid = 'public.support_requests'::regclass
  ) THEN
    RAISE EXCEPTION 'Post-check failed: support_requests_status_check missing';
  END IF;
END
$$;

COMMIT;
