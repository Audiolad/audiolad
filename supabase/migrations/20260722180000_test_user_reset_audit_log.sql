BEGIN;

-- ---------------------------------------------------------------------------
-- Admin operation audit log (owner actions such as test user reset)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_operation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation text NOT NULL,
  actor_user_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  target_auth_user_id uuid NULL,
  target_email_hash text NOT NULL,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL,
  error_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT admin_operation_log_status_check
    CHECK (status IN ('success', 'partial', 'failed'))
);

CREATE INDEX IF NOT EXISTS admin_operation_log_operation_created_at_idx
  ON public.admin_operation_log (operation, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_operation_log_actor_created_at_idx
  ON public.admin_operation_log (actor_user_id, created_at DESC);

COMMENT ON TABLE public.admin_operation_log IS
  'Append-only audit trail for privileged admin operations. No secrets or confirmation phrases.';

COMMENT ON COLUMN public.admin_operation_log.target_email_hash IS
  'sha256 hex of normalized allowlisted email or fixed target marker for test reset.';

ALTER TABLE public.admin_operation_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_operation_log FROM PUBLIC;
REVOKE ALL ON TABLE public.admin_operation_log FROM anon;
REVOKE ALL ON TABLE public.admin_operation_log FROM authenticated;
GRANT ALL ON TABLE public.admin_operation_log TO service_role;

COMMIT;
