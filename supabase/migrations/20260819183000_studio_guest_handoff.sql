BEGIN;

CREATE TABLE public.studio_guest_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  guest_session_id uuid NOT NULL
    REFERENCES public.studio_guest_sessions (id) ON DELETE CASCADE,
  project_id uuid NOT NULL
    REFERENCES public.studio_projects (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  CONSTRAINT studio_guest_handoffs_token_hash_len_check
    CHECK (char_length(token_hash) = 64)
);

CREATE INDEX studio_guest_handoffs_token_hash_idx
  ON public.studio_guest_handoffs (token_hash);

CREATE INDEX studio_guest_handoffs_expires_at_idx
  ON public.studio_guest_handoffs (expires_at);

ALTER TABLE public.studio_guest_handoffs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.studio_guest_handoffs IS
  'audiolad:studio-guest-handoff:v1; one-time hashed transfer tokens; service role only';

COMMIT;
