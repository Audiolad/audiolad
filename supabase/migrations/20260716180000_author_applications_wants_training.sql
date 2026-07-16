BEGIN;

ALTER TABLE public.author_applications
  ADD COLUMN IF NOT EXISTS wants_training boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.author_applications.wants_training IS
  'Listener wants training to create audio practices (School of Audio Practices interest).';

COMMIT;
