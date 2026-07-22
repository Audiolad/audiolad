BEGIN;

-- ---------------------------------------------------------------------------
-- Persistent operational email delivery state (direct SMTP, no outbox worker)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.operational_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  dedup_key text NOT NULL,
  message_type text NOT NULL,
  application_id uuid NULL
    REFERENCES public.author_applications (id) ON DELETE SET NULL,
  recipient_email text NOT NULL,

  status text NOT NULL DEFAULT 'pending',

  attempt_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz NULL,
  sent_at timestamptz NULL,
  last_error text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT operational_email_deliveries_dedup_key_unique
    UNIQUE (dedup_key),

  CONSTRAINT operational_email_deliveries_status_check
    CHECK (status IN ('pending', 'sent', 'failed')),

  CONSTRAINT operational_email_deliveries_attempt_count_non_negative_check
    CHECK (attempt_count >= 0),

  CONSTRAINT operational_email_deliveries_recipient_email_length_check
    CHECK (char_length(recipient_email) <= 320),

  CONSTRAINT operational_email_deliveries_last_error_length_check
    CHECK (last_error IS NULL OR char_length(last_error) <= 2000)
);

CREATE INDEX IF NOT EXISTS operational_email_deliveries_application_id_idx
  ON public.operational_email_deliveries (application_id);

CREATE INDEX IF NOT EXISTS operational_email_deliveries_status_idx
  ON public.operational_email_deliveries (status, updated_at DESC);

COMMENT ON TABLE public.operational_email_deliveries IS
  'Direct SMTP operational email attempts with durable deduplication.';

ALTER TABLE public.operational_email_deliveries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'operational_email_deliveries'
      AND policyname = 'Platform staff can select operational email deliveries'
  ) THEN
    CREATE POLICY "Platform staff can select operational email deliveries"
      ON public.operational_email_deliveries
      FOR SELECT
      TO authenticated
      USING (public.is_platform_staff(auth.uid()));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_operational_email_deliveries_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_operational_email_deliveries_updated_at_trigger
  ON public.operational_email_deliveries;

CREATE TRIGGER set_operational_email_deliveries_updated_at_trigger
  BEFORE UPDATE ON public.operational_email_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.set_operational_email_deliveries_updated_at();

COMMIT;
