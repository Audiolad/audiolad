-- Music Analyzer Lab v0.1.
-- Draft migration for a private R&D console. Do not apply until the lab is
-- explicitly accepted. Isolated tables plus one private storage bucket.
-- No catalog, SEO, track-metadata, recommendation, or business-domain changes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.music_lab_experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  version text NOT NULL,
  experiment_type text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL,
  completed_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  source_refs jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  results_snapshot jsonb NULL,
  CONSTRAINT music_lab_experiments_status_check
    CHECK (status IN ('draft', 'open', 'completed')),
  CONSTRAINT music_lab_experiments_type_check
    CHECK (experiment_type IN (
      'human_listening_validation',
      'attention_score',
      'conversation_friendliness',
      'spatial_density',
      'foreground_background',
      'relaxation_pressure',
      'motion_drive',
      'cognitive_load',
      'transition_profile'
    )),
  CONSTRAINT music_lab_experiments_code_check
    CHECK (code ~ '^[a-z0-9][a-z0-9-]{1,63}$')
);

CREATE TABLE IF NOT EXISTS public.music_lab_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL
    REFERENCES public.music_lab_experiments (id) ON DELETE CASCADE,
  external_key text NOT NULL,
  public_code text NOT NULL,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  source_filename text NOT NULL,
  mime_type text NOT NULL,
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT music_lab_items_external_key_unique
    UNIQUE (experiment_id, external_key),
  CONSTRAINT music_lab_items_public_code_unique
    UNIQUE (experiment_id, public_code),
  CONSTRAINT music_lab_items_public_code_check
    CHECK (public_code ~ '^[a-z][a-z0-9]{1,15}$'),
  CONSTRAINT music_lab_items_storage_path_check
    CHECK (storage_path !~ '\.\.' AND storage_path !~ '^/')
);

CREATE TABLE IF NOT EXISTS public.music_lab_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL
    REFERENCES public.music_lab_experiments (id) ON DELETE CASCADE,
  task_type text NOT NULL,
  natural_key text NOT NULL,
  public_code text NOT NULL,
  sort_order integer NOT NULL,
  subject_item_id uuid NOT NULL
    REFERENCES public.music_lab_items (id) ON DELETE RESTRICT,
  definition jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT music_lab_tasks_natural_key_unique
    UNIQUE (experiment_id, natural_key),
  CONSTRAINT music_lab_tasks_public_code_unique
    UNIQUE (experiment_id, public_code),
  CONSTRAINT music_lab_tasks_type_check
    CHECK (task_type IN ('listen', 'similarity', 'bpm_key')),
  CONSTRAINT music_lab_tasks_public_code_check
    CHECK (public_code ~ '^[a-z][a-z0-9]{1,15}$')
);

CREATE TABLE IF NOT EXISTS public.music_lab_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL
    REFERENCES public.music_lab_experiments (id) ON DELETE CASCADE,
  task_id uuid NOT NULL
    REFERENCES public.music_lab_tasks (id) ON DELETE RESTRICT,
  respondent_user_id uuid NOT NULL
    REFERENCES auth.users (id) ON DELETE CASCADE,
  answers jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT music_lab_responses_task_user_unique
    UNIQUE (task_id, respondent_user_id)
);

CREATE INDEX IF NOT EXISTS music_lab_responses_experiment_user_idx
  ON public.music_lab_responses (experiment_id, respondent_user_id);

CREATE TABLE IF NOT EXISTS public.music_lab_blind_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  experiment_id uuid NOT NULL
    REFERENCES public.music_lab_experiments (id) ON DELETE CASCADE,
  task_id uuid NOT NULL
    REFERENCES public.music_lab_tasks (id) ON DELETE CASCADE,
  slot_code text NOT NULL,
  system_code text NOT NULL,
  CONSTRAINT music_lab_blind_assignments_slot_unique
    UNIQUE (task_id, slot_code),
  CONSTRAINT music_lab_blind_assignments_slot_check
    CHECK (slot_code IN ('A', 'B')),
  CONSTRAINT music_lab_blind_assignments_system_check
    CHECK (system_code IN ('clap_native', 'openl3'))
);

COMMENT ON TABLE public.music_lab_experiments IS
  'Private Music Analyzer Lab experiments. Not catalog or Music Passport.';

COMMENT ON TABLE public.music_lab_blind_assignments IS
  'Server-only similarity slot map. Do not select into client payloads before the experiment is completed, and do not send raw system codes to the client.';

CREATE OR REPLACE FUNCTION public.music_lab_reject_locked_response()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status
  INTO v_status
  FROM public.music_lab_experiments
  WHERE id = NEW.experiment_id;

  IF v_status = 'completed' THEN
    RAISE EXCEPTION 'music_lab_responses_locked'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS music_lab_responses_locked_insert ON public.music_lab_responses;
CREATE TRIGGER music_lab_responses_locked_insert
  BEFORE INSERT ON public.music_lab_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.music_lab_reject_locked_response();

DROP TRIGGER IF EXISTS music_lab_responses_locked_update ON public.music_lab_responses;
CREATE TRIGGER music_lab_responses_locked_update
  BEFORE UPDATE ON public.music_lab_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.music_lab_reject_locked_response();

ALTER TABLE public.music_lab_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_lab_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_lab_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_lab_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.music_lab_blind_assignments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.music_lab_experiments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.music_lab_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.music_lab_tasks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.music_lab_responses FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.music_lab_blind_assignments FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.music_lab_experiments TO service_role;
GRANT ALL ON TABLE public.music_lab_items TO service_role;
GRANT ALL ON TABLE public.music_lab_tasks TO service_role;
GRANT ALL ON TABLE public.music_lab_responses TO service_role;
GRANT ALL ON TABLE public.music_lab_blind_assignments TO service_role;

REVOKE ALL ON FUNCTION public.music_lab_reject_locked_response() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.music_lab_reject_locked_response() TO service_role;

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION 'storage.buckets is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'music-analyzer-lab'
  ) THEN
    INSERT INTO storage.buckets (
      id,
      name,
      public,
      file_size_limit,
      allowed_mime_types
    )
    VALUES (
      'music-analyzer-lab',
      'music-analyzer-lab',
      false,
      104857600,
      ARRAY['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/wave']::text[]
    );
  END IF;

  UPDATE storage.buckets
  SET public = false
  WHERE id = 'music-analyzer-lab';
END;
$$;

-- No anon or authenticated storage policies. Signing stays on the service role
-- after the owner/admin application guard.

COMMIT;
