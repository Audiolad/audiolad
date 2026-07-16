BEGIN;

ALTER TABLE public.author_applications
  ADD COLUMN IF NOT EXISTS interested_in_school boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.author_applications.interested_in_school IS
  'Listener is interested in the School of Audio Practices training program.';

COMMIT;
