-- Classica Production v0.1
-- Internal multi-user pipeline. Public pages read classica_public_works.
-- Publication also upserts classical_composers / classical_works.
-- It does not create practices and does not change the existing catalog.

BEGIN;

ALTER TABLE public.platform_roles DROP CONSTRAINT IF EXISTS platform_roles_code_check;
ALTER TABLE public.platform_roles
  ADD CONSTRAINT platform_roles_code_check CHECK (
    code IN (
      'owner',
      'admin',
      'editor',
      'support',
      'analyst',
      'finance',
      'classica_operator',
      'classica_moderator'
    )
  );

INSERT INTO public.platform_permissions (code, description) VALUES
  ('classica.production.access', 'Enter the closed Classica production section'),
  ('classica.production.operate', 'Take and prepare Classica production jobs'),
  ('classica.production.moderate', 'Review Classica production jobs'),
  ('classica.production.admin', 'Create, assign, and publish Classica production jobs')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.platform_roles (code, description) VALUES
  ('classica_operator', 'Classica production operator'),
  ('classica_moderator', 'Classica production moderator')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.platform_role_permissions (role_code, permission_code)
SELECT 'owner', permission.code
FROM public.platform_permissions AS permission
WHERE permission.code LIKE 'classica.production.%'
ON CONFLICT DO NOTHING;

INSERT INTO public.platform_role_permissions (role_code, permission_code)
SELECT 'admin', permission.code
FROM public.platform_permissions AS permission
WHERE permission.code LIKE 'classica.production.%'
ON CONFLICT DO NOTHING;

INSERT INTO public.platform_role_permissions (role_code, permission_code) VALUES
  ('classica_operator', 'classica.production.access'),
  ('classica_operator', 'classica.production.operate'),
  ('classica_moderator', 'classica.production.access'),
  ('classica_moderator', 'classica.production.moderate')
ON CONFLICT DO NOTHING;

CREATE TABLE public.classica_production_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'queued',
  priority integer NOT NULL DEFAULT 3,
  complexity text NOT NULL DEFAULT 'medium',
  task_cost_minor integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'RUB',
  assignee_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  assignee_label text,
  reserved_at timestamptz,
  due_on date,
  first_taken_at timestamptz,
  submitted_at timestamptz,
  submitted_by uuid,
  accepted_at timestamptz,
  accepted_by uuid,
  published_at timestamptz,
  published_by uuid,
  return_count integer NOT NULL DEFAULT 0,
  production_seconds integer,
  composer_name text NOT NULL,
  title text NOT NULL,
  alternative_title text,
  catalogue_system text,
  catalogue_number text,
  musical_key text,
  movement_label text,
  composition_year smallint,
  primary_query text,
  extra_queries text[] NOT NULL DEFAULT '{}',
  seo_title text,
  seo_description text,
  slug text,
  composer_slug text,
  score_source text,
  source_url text,
  source_description text,
  source_type text,
  rights_checked boolean NOT NULL DEFAULT false,
  rights_comment text,
  duration_seconds numeric(10, 3),
  audio_playback_confirmed_at timestamptz,
  audio_playback_confirmed_by uuid,
  heading text,
  subtitle text,
  short_description text,
  body text,
  about_work text,
  about_composer text,
  listening_notes text,
  faq jsonb NOT NULL DEFAULT '[]'::jsonb,
  extra_blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  packaging_prepared_at timestamptz,
  packaging_flags jsonb NOT NULL DEFAULT '{}'::jsonb,
  classical_composer_id uuid REFERENCES public.classical_composers (id) ON DELETE SET NULL,
  classical_work_id uuid REFERENCES public.classical_works (id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT classica_production_jobs_status_check CHECK (
    status IN (
      'queued',
      'in_progress',
      'audio_ready',
      'packaging_ready',
      'in_review',
      'needs_revision',
      'accepted',
      'published'
    )
  ),
  CONSTRAINT classica_production_jobs_priority_check CHECK (priority BETWEEN 0 AND 100),
  CONSTRAINT classica_production_jobs_complexity_check CHECK (
    complexity IN ('low', 'medium', 'high')
  ),
  CONSTRAINT classica_production_jobs_cost_check CHECK (
    task_cost_minor BETWEEN 0 AND 100000000
  ),
  CONSTRAINT classica_production_jobs_currency_check CHECK (currency = 'RUB'),
  CONSTRAINT classica_production_jobs_return_count_check CHECK (return_count >= 0),
  CONSTRAINT classica_production_jobs_composer_check CHECK (
    char_length(btrim(composer_name)) BETWEEN 2 AND 200
  ),
  CONSTRAINT classica_production_jobs_title_check CHECK (
    char_length(btrim(title)) BETWEEN 2 AND 300
  ),
  CONSTRAINT classica_production_jobs_year_check CHECK (
    composition_year IS NULL OR composition_year BETWEEN 1 AND 2100
  ),
  CONSTRAINT classica_production_jobs_source_type_check CHECK (
    source_type IS NULL OR source_type IN ('musicxml', 'midi', 'pdf', 'other')
  ),
  CONSTRAINT classica_production_jobs_slug_check CHECK (
    slug IS NULL OR slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  CONSTRAINT classica_production_jobs_composer_slug_check CHECK (
    composer_slug IS NULL OR composer_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  CONSTRAINT classica_production_jobs_seo_title_check CHECK (
    seo_title IS NULL OR char_length(seo_title) <= 140
  ),
  CONSTRAINT classica_production_jobs_seo_description_check CHECK (
    seo_description IS NULL OR char_length(seo_description) <= 300
  )
);

CREATE INDEX classica_production_jobs_queue_idx
  ON public.classica_production_jobs (status, priority DESC, created_at);
CREATE INDEX classica_production_jobs_assignee_idx
  ON public.classica_production_jobs (assignee_id);
CREATE INDEX classica_production_jobs_composer_idx
  ON public.classica_production_jobs (composer_name);

CREATE TABLE public.classica_production_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.classica_production_jobs (id) ON DELETE CASCADE,
  kind text NOT NULL,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL,
  alt_text text,
  title_text text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT classica_production_assets_kind_check CHECK (
    kind IN ('source_file', 'source_render', 'final_audio', 'cover', 'slider')
  ),
  CONSTRAINT classica_production_assets_bucket_check CHECK (
    storage_bucket IN ('classica-production', 'classica-public')
  ),
  CONSTRAINT classica_production_assets_size_check CHECK (byte_size > 0),
  CONSTRAINT classica_production_assets_path_key UNIQUE (storage_bucket, storage_path)
);

CREATE INDEX classica_production_assets_job_idx
  ON public.classica_production_assets (job_id, kind, sort_order);

CREATE TABLE public.classica_production_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.classica_production_jobs (id) ON DELETE CASCADE,
  actor_id uuid,
  actor_label text,
  action text NOT NULL,
  from_status text,
  to_status text,
  assignee_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX classica_production_events_job_idx
  ON public.classica_production_events (job_id, created_at);
CREATE INDEX classica_production_events_actor_idx
  ON public.classica_production_events (actor_id, created_at);

CREATE TABLE public.classica_production_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.classica_production_jobs (id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL,
  reviewer_label text,
  decision text NOT NULL,
  reason text,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT classica_production_reviews_decision_check CHECK (
    decision IN ('accept', 'return', 'comment')
  ),
  CONSTRAINT classica_production_reviews_return_reason_check CHECK (
    decision <> 'return' OR (
      reason IS NOT NULL AND char_length(btrim(reason)) >= 3
    )
  )
);

CREATE INDEX classica_production_reviews_job_idx
  ON public.classica_production_reviews (job_id, created_at);

CREATE TABLE public.classica_production_prompts (
  code text PRIMARY KEY,
  body text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT classica_production_prompts_body_check CHECK (
    char_length(body) BETWEEN 200 AND 20000
  )
);

CREATE TABLE public.classica_production_accruals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.classica_production_jobs (id) ON DELETE RESTRICT,
  operator_id uuid NOT NULL,
  operator_label text,
  amount_minor integer NOT NULL,
  currency text NOT NULL DEFAULT 'RUB',
  status text NOT NULL DEFAULT 'accrued',
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT classica_production_accruals_status_check CHECK (status IN ('accrued', 'void')),
  CONSTRAINT classica_production_accruals_amount_check CHECK (amount_minor >= 0),
  CONSTRAINT classica_production_accruals_currency_check CHECK (currency = 'RUB'),
  CONSTRAINT classica_production_accruals_reason_check CHECK (reason = 'accepted')
);

CREATE UNIQUE INDEX classica_production_accruals_one_accepted_idx
  ON public.classica_production_accruals (job_id)
  WHERE status = 'accrued' AND reason = 'accepted';
CREATE INDEX classica_production_accruals_operator_idx
  ON public.classica_production_accruals (operator_id, created_at);

CREATE TABLE public.classica_public_works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL UNIQUE REFERENCES public.classica_production_jobs (id) ON DELETE RESTRICT,
  classical_work_id uuid UNIQUE REFERENCES public.classical_works (id) ON DELETE RESTRICT,
  classical_composer_id uuid REFERENCES public.classical_composers (id) ON DELETE RESTRICT,
  composer_slug text NOT NULL,
  work_slug text NOT NULL,
  composer_name text NOT NULL,
  title text NOT NULL,
  heading text NOT NULL,
  subtitle text,
  short_description text,
  body text NOT NULL,
  about_work text,
  about_composer text,
  listening_notes text,
  faq jsonb NOT NULL DEFAULT '[]'::jsonb,
  extra_blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  seo_title text NOT NULL,
  seo_description text NOT NULL,
  musical_key text,
  catalogue_number text,
  composition_year smallint,
  duration_seconds numeric(10, 3),
  audio_path text NOT NULL,
  cover_path text,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT classica_public_works_slug_key UNIQUE (composer_slug, work_slug),
  CONSTRAINT classica_public_works_composer_slug_check CHECK (
    composer_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  CONSTRAINT classica_public_works_work_slug_check CHECK (
    work_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  )
);

CREATE INDEX classica_public_works_composer_idx
  ON public.classica_public_works (composer_slug, published_at DESC);

CREATE OR REPLACE FUNCTION public.classica_production_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER classica_production_jobs_set_updated_at
  BEFORE UPDATE ON public.classica_production_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.classica_production_set_updated_at();

CREATE OR REPLACE FUNCTION public.classica_production_actor_label(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (
      SELECT COALESCE(NULLIF(btrim(pr.full_name), ''), NULLIF(btrim(pr.email), ''))
      FROM public.profiles AS pr
      WHERE pr.id = p_user_id
    ),
    p_user_id::text
  );
$$;

CREATE OR REPLACE FUNCTION public.classica_production_require(p_permission text)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'classica_auth_required';
  END IF;
  IF NOT public.has_platform_permission(v_actor, p_permission) THEN
    RAISE EXCEPTION 'classica_forbidden';
  END IF;
  RETURN v_actor;
END;
$$;

CREATE OR REPLACE FUNCTION public.classica_production_optional_text(
  p_value text,
  p_max integer
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_text text := NULLIF(btrim(COALESCE(p_value, '')), '');
BEGIN
  IF v_text IS NULL THEN
    RETURN NULL;
  END IF;
  IF char_length(v_text) > p_max THEN
    RAISE EXCEPTION 'classica_invalid_field';
  END IF;
  RETURN v_text;
END;
$$;

CREATE OR REPLACE FUNCTION public.classica_production_required_text(
  p_value text,
  p_min integer,
  p_max integer
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_text text := NULLIF(btrim(COALESCE(p_value, '')), '');
BEGIN
  IF v_text IS NULL OR char_length(v_text) < p_min OR char_length(v_text) > p_max THEN
    RAISE EXCEPTION 'classica_invalid_field';
  END IF;
  RETURN v_text;
END;
$$;

CREATE OR REPLACE FUNCTION public.classica_production_clean_faq(p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item jsonb;
  v_result jsonb := '[]'::jsonb;
  v_question text;
  v_answer text;
BEGIN
  IF p_value IS NULL OR jsonb_typeof(p_value) <> 'array' OR jsonb_array_length(p_value) > 8 THEN
    RAISE EXCEPTION 'classica_invalid_field';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_value) AS value
  LOOP
    v_question := btrim(COALESCE(v_item->>'question', ''));
    v_answer := btrim(COALESCE(v_item->>'answer', ''));
    IF v_question = '' AND v_answer = '' THEN
      CONTINUE;
    END IF;
    IF char_length(v_question) < 2 OR char_length(v_question) > 300
      OR char_length(v_answer) < 2 OR char_length(v_answer) > 2000 THEN
      RAISE EXCEPTION 'classica_invalid_field';
    END IF;
    v_result := v_result || jsonb_build_array(
      jsonb_build_object('question', v_question, 'answer', v_answer)
    );
  END LOOP;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.classica_production_clean_blocks(p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item jsonb;
  v_result jsonb := '[]'::jsonb;
  v_heading text;
  v_body text;
BEGIN
  IF p_value IS NULL OR jsonb_typeof(p_value) <> 'array' OR jsonb_array_length(p_value) > 6 THEN
    RAISE EXCEPTION 'classica_invalid_field';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_value) AS value
  LOOP
    v_heading := btrim(COALESCE(v_item->>'heading', ''));
    v_body := btrim(COALESCE(v_item->>'body', ''));
    IF v_heading = '' AND v_body = '' THEN
      CONTINUE;
    END IF;
    IF char_length(v_heading) < 2 OR char_length(v_heading) > 200
      OR char_length(v_body) < 2 OR char_length(v_body) > 4000 THEN
      RAISE EXCEPTION 'classica_invalid_field';
    END IF;
    v_result := v_result || jsonb_build_array(
      jsonb_build_object('heading', v_heading, 'body', v_body)
    );
  END LOOP;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.classica_production_log(
  p_job_id uuid,
  p_actor uuid,
  p_action text,
  p_from text,
  p_to text,
  p_assignee uuid,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.classica_production_events (
    job_id, actor_id, actor_label, action, from_status, to_status, assignee_id, payload
  ) VALUES (
    p_job_id,
    p_actor,
    public.classica_production_actor_label(p_actor),
    p_action,
    p_from,
    p_to,
    p_assignee,
    COALESCE(p_payload, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.classica_production_actor_can_edit(
  p_job public.classica_production_jobs,
  p_actor uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (
    public.has_platform_permission(p_actor, 'classica.production.admin')
    AND p_job.status <> 'published'
  ) OR (
    public.has_platform_permission(p_actor, 'classica.production.operate')
    AND p_job.assignee_id = p_actor
    AND p_job.status IN ('in_progress', 'audio_ready', 'packaging_ready', 'needs_revision')
  );
$$;

CREATE OR REPLACE FUNCTION public.classica_production_storage_can_write(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.classica_production_jobs AS job
    WHERE job.id::text = split_part(p_name, '/', 1)
      AND public.classica_production_actor_can_edit(job, auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.classica_production_checklist_gaps(
  p_job public.classica_production_jobs
)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_gaps text[] := ARRAY[]::text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.classica_production_assets AS asset
    WHERE asset.job_id = p_job.id AND asset.kind = 'final_audio'
  ) THEN
    v_gaps := array_append(v_gaps, 'audio');
  END IF;
  IF p_job.audio_playback_confirmed_at IS NULL
    OR p_job.duration_seconds IS NULL
    OR p_job.duration_seconds <= 0 THEN
    v_gaps := array_append(v_gaps, 'playback');
  END IF;
  IF p_job.composer_name IS NULL OR char_length(btrim(p_job.composer_name)) < 2 THEN
    v_gaps := array_append(v_gaps, 'composer');
  END IF;
  IF p_job.title IS NULL OR char_length(btrim(p_job.title)) < 2 THEN
    v_gaps := array_append(v_gaps, 'title');
  END IF;
  IF p_job.score_source IS NULL OR char_length(btrim(p_job.score_source)) < 2 THEN
    v_gaps := array_append(v_gaps, 'score');
  END IF;
  IF p_job.rights_checked IS DISTINCT FROM true THEN
    v_gaps := array_append(v_gaps, 'rights');
  END IF;
  IF p_job.seo_title IS NULL OR char_length(btrim(p_job.seo_title)) < 1
    OR char_length(btrim(p_job.seo_title)) > 140
    OR btrim(p_job.seo_title) = 'Требуется проверка: недостаточно подтверждённых данных.' THEN
    v_gaps := array_append(v_gaps, 'seo_title');
  END IF;
  IF p_job.seo_description IS NULL OR char_length(btrim(p_job.seo_description)) < 1
    OR char_length(btrim(p_job.seo_description)) > 300
    OR btrim(p_job.seo_description) = 'Требуется проверка: недостаточно подтверждённых данных.' THEN
    v_gaps := array_append(v_gaps, 'seo_description');
  END IF;
  IF p_job.body IS NULL OR char_length(btrim(p_job.body)) < 20
    OR btrim(p_job.body) = 'Требуется проверка: недостаточно подтверждённых данных.' THEN
    v_gaps := array_append(v_gaps, 'body');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.classica_production_assets AS asset
    WHERE asset.job_id = p_job.id AND asset.kind = 'cover'
  ) THEN
    v_gaps := array_append(v_gaps, 'cover');
  END IF;
  IF p_job.slug IS NULL OR p_job.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    v_gaps := array_append(v_gaps, 'slug');
  END IF;
  RETURN v_gaps;
END;
$$;

CREATE OR REPLACE FUNCTION public.classica_production_lock(p_job_id uuid)
RETURNS public.classica_production_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job public.classica_production_jobs;
BEGIN
  SELECT * INTO v_job
  FROM public.classica_production_jobs
  WHERE id = p_job_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'classica_job_not_found';
  END IF;
  RETURN v_job;
END;
$$;

CREATE OR REPLACE FUNCTION public.classica_production_create_job(p_patch jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_id uuid;
  v_priority integer := COALESCE((p_patch->>'priority')::integer, 3);
  v_cost integer := COALESCE((p_patch->>'task_cost_minor')::integer, 0);
  v_complexity text := COALESCE(NULLIF(btrim(p_patch->>'complexity'), ''), 'medium');
  v_due date;
BEGIN
  v_actor := public.classica_production_require('classica.production.admin');
  IF v_priority < 0 OR v_priority > 100 OR v_cost < 0 OR v_cost > 100000000
    OR v_complexity NOT IN ('low', 'medium', 'high') THEN
    RAISE EXCEPTION 'classica_invalid_field';
  END IF;
  IF NULLIF(btrim(COALESCE(p_patch->>'due_on', '')), '') IS NULL THEN
    v_due := NULL;
  ELSIF p_patch->>'due_on' ~ '^\d{4}-\d{2}-\d{2}$' THEN
    v_due := (p_patch->>'due_on')::date;
  ELSE
    RAISE EXCEPTION 'classica_invalid_field';
  END IF;

  INSERT INTO public.classica_production_jobs (
    composer_name, title, alternative_title, catalogue_system, catalogue_number,
    musical_key, movement_label, composition_year, primary_query, priority,
    complexity, task_cost_minor, due_on, created_by
  ) VALUES (
    public.classica_production_required_text(p_patch->>'composer_name', 2, 200),
    public.classica_production_required_text(p_patch->>'title', 2, 300),
    public.classica_production_optional_text(p_patch->>'alternative_title', 300),
    public.classica_production_optional_text(p_patch->>'catalogue_system', 40),
    public.classica_production_optional_text(p_patch->>'catalogue_number', 80),
    public.classica_production_optional_text(p_patch->>'musical_key', 40),
    public.classica_production_optional_text(p_patch->>'movement_label', 120),
    CASE
      WHEN NULLIF(btrim(COALESCE(p_patch->>'composition_year', '')), '') IS NULL THEN NULL
      ELSE (p_patch->>'composition_year')::smallint
    END,
    public.classica_production_optional_text(p_patch->>'primary_query', 200),
    v_priority,
    v_complexity,
    v_cost,
    v_due,
    v_actor
  )
  RETURNING id INTO v_id;

  PERFORM public.classica_production_log(
    v_id, v_actor, 'created', NULL, 'queued', NULL, '{}'::jsonb
  );
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.classica_production_save_card(
  p_job_id uuid,
  p_patch jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_job public.classica_production_jobs;
  v_queries text[] := NULL;
  v_flags jsonb;
  v_priority integer;
  v_cost integer;
  v_year smallint;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'classica_auth_required';
  END IF;
  v_job := public.classica_production_lock(p_job_id);
  IF NOT public.classica_production_actor_can_edit(v_job, v_actor) THEN
    RAISE EXCEPTION 'classica_forbidden';
  END IF;
  v_flags := COALESCE(v_job.packaging_flags, '{}'::jsonb);

  IF p_patch ? 'composer_name' THEN
    v_job.composer_name := public.classica_production_required_text(p_patch->>'composer_name', 2, 200);
  END IF;
  IF p_patch ? 'title' THEN
    v_job.title := public.classica_production_required_text(p_patch->>'title', 2, 300);
  END IF;
  IF p_patch ? 'alternative_title' THEN
    v_job.alternative_title := public.classica_production_optional_text(p_patch->>'alternative_title', 300);
  END IF;
  IF p_patch ? 'catalogue_system' THEN
    v_job.catalogue_system := public.classica_production_optional_text(p_patch->>'catalogue_system', 40);
  END IF;
  IF p_patch ? 'catalogue_number' THEN
    v_job.catalogue_number := public.classica_production_optional_text(p_patch->>'catalogue_number', 80);
  END IF;
  IF p_patch ? 'musical_key' THEN
    v_job.musical_key := public.classica_production_optional_text(p_patch->>'musical_key', 40);
  END IF;
  IF p_patch ? 'movement_label' THEN
    v_job.movement_label := public.classica_production_optional_text(p_patch->>'movement_label', 120);
  END IF;
  IF p_patch ? 'composition_year' THEN
    IF NULLIF(btrim(COALESCE(p_patch->>'composition_year', '')), '') IS NULL THEN
      v_year := NULL;
    ELSE
      v_year := (p_patch->>'composition_year')::smallint;
      IF v_year < 1 OR v_year > 2100 THEN
        RAISE EXCEPTION 'classica_invalid_field';
      END IF;
    END IF;
    v_job.composition_year := v_year;
  END IF;
  IF p_patch ? 'primary_query' THEN
    v_job.primary_query := public.classica_production_optional_text(p_patch->>'primary_query', 200);
  END IF;
  IF p_patch ? 'extra_queries' THEN
    IF jsonb_typeof(p_patch->'extra_queries') <> 'array'
      OR jsonb_array_length(p_patch->'extra_queries') > 20 THEN
      RAISE EXCEPTION 'classica_invalid_field';
    END IF;
    SELECT COALESCE(array_agg(item.query_text), '{}'::text[])
    INTO v_queries
    FROM (
      SELECT btrim(value) AS query_text
      FROM jsonb_array_elements_text(p_patch->'extra_queries') AS value
      WHERE btrim(value) <> ''
    ) AS item;
    IF EXISTS (
      SELECT 1 FROM unnest(v_queries) AS query_text
      WHERE char_length(query_text) > 200
    ) THEN
      RAISE EXCEPTION 'classica_invalid_field';
    END IF;
    v_job.extra_queries := v_queries;
  END IF;
  IF p_patch ? 'seo_title' THEN
    v_job.seo_title := public.classica_production_optional_text(p_patch->>'seo_title', 140);
    v_flags := v_flags - 'seo_title';
  END IF;
  IF p_patch ? 'seo_description' THEN
    v_job.seo_description := public.classica_production_optional_text(p_patch->>'seo_description', 300);
    v_flags := v_flags - 'seo_description';
  END IF;
  IF p_patch ? 'slug' THEN
    v_job.slug := public.classica_production_optional_text(p_patch->>'slug', 120);
    IF v_job.slug IS NOT NULL AND v_job.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
      RAISE EXCEPTION 'classica_invalid_slug';
    END IF;
  END IF;
  IF p_patch ? 'composer_slug' THEN
    v_job.composer_slug := public.classica_production_optional_text(p_patch->>'composer_slug', 120);
    IF v_job.composer_slug IS NOT NULL AND v_job.composer_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
      RAISE EXCEPTION 'classica_invalid_composer_slug';
    END IF;
  END IF;
  IF p_patch ? 'score_source' THEN
    v_job.score_source := public.classica_production_optional_text(p_patch->>'score_source', 500);
  END IF;
  IF p_patch ? 'source_url' THEN
    v_job.source_url := public.classica_production_optional_text(p_patch->>'source_url', 500);
  END IF;
  IF p_patch ? 'source_description' THEN
    v_job.source_description := public.classica_production_optional_text(p_patch->>'source_description', 2000);
  END IF;
  IF p_patch ? 'source_type' THEN
    v_job.source_type := public.classica_production_optional_text(p_patch->>'source_type', 20);
    IF v_job.source_type IS NOT NULL
      AND v_job.source_type NOT IN ('musicxml', 'midi', 'pdf', 'other') THEN
      RAISE EXCEPTION 'classica_invalid_field';
    END IF;
  END IF;
  IF p_patch ? 'rights_checked' THEN
    IF jsonb_typeof(p_patch->'rights_checked') <> 'boolean' THEN
      RAISE EXCEPTION 'classica_invalid_field';
    END IF;
    v_job.rights_checked := (p_patch->>'rights_checked')::boolean;
  END IF;
  IF p_patch ? 'rights_comment' THEN
    v_job.rights_comment := public.classica_production_optional_text(p_patch->>'rights_comment', 2000);
  END IF;
  IF p_patch ? 'heading' THEN
    v_job.heading := public.classica_production_optional_text(p_patch->>'heading', 180);
    v_flags := v_flags - 'heading';
  END IF;
  IF p_patch ? 'subtitle' THEN
    v_job.subtitle := public.classica_production_optional_text(p_patch->>'subtitle', 240);
    v_flags := v_flags - 'subtitle';
  END IF;
  IF p_patch ? 'short_description' THEN
    v_job.short_description := public.classica_production_optional_text(p_patch->>'short_description', 500);
    v_flags := v_flags - 'short_description';
  END IF;
  IF p_patch ? 'body' THEN
    v_job.body := public.classica_production_optional_text(p_patch->>'body', 8000);
    v_flags := v_flags - 'body';
  END IF;
  IF p_patch ? 'about_work' THEN
    v_job.about_work := public.classica_production_optional_text(p_patch->>'about_work', 8000);
    v_flags := v_flags - 'about_work';
  END IF;
  IF p_patch ? 'about_composer' THEN
    v_job.about_composer := public.classica_production_optional_text(p_patch->>'about_composer', 8000);
    v_flags := v_flags - 'about_composer';
  END IF;
  IF p_patch ? 'listening_notes' THEN
    v_job.listening_notes := public.classica_production_optional_text(p_patch->>'listening_notes', 8000);
    v_flags := v_flags - 'listening_notes';
  END IF;
  IF p_patch ? 'faq' THEN
    v_job.faq := public.classica_production_clean_faq(p_patch->'faq');
  END IF;
  IF p_patch ? 'extra_blocks' THEN
    v_job.extra_blocks := public.classica_production_clean_blocks(p_patch->'extra_blocks');
  END IF;
  IF p_patch ? 'priority' THEN
    v_priority := (p_patch->>'priority')::integer;
    IF v_priority < 0 OR v_priority > 100 THEN
      RAISE EXCEPTION 'classica_invalid_field';
    END IF;
    v_job.priority := v_priority;
  END IF;
  IF p_patch ? 'complexity' THEN
    IF p_patch->>'complexity' NOT IN ('low', 'medium', 'high') THEN
      RAISE EXCEPTION 'classica_invalid_field';
    END IF;
    v_job.complexity := p_patch->>'complexity';
  END IF;
  IF p_patch ? 'task_cost_minor' THEN
    v_cost := (p_patch->>'task_cost_minor')::integer;
    IF v_cost < 0 OR v_cost > 100000000 THEN
      RAISE EXCEPTION 'classica_invalid_field';
    END IF;
    v_job.task_cost_minor := v_cost;
  END IF;
  IF p_patch ? 'due_on' THEN
    IF NULLIF(btrim(COALESCE(p_patch->>'due_on', '')), '') IS NULL THEN
      v_job.due_on := NULL;
    ELSIF p_patch->>'due_on' ~ '^\d{4}-\d{2}-\d{2}$' THEN
      v_job.due_on := (p_patch->>'due_on')::date;
    ELSE
      RAISE EXCEPTION 'classica_invalid_field';
    END IF;
  END IF;

  UPDATE public.classica_production_jobs
  SET
    composer_name = v_job.composer_name,
    title = v_job.title,
    alternative_title = v_job.alternative_title,
    catalogue_system = v_job.catalogue_system,
    catalogue_number = v_job.catalogue_number,
    musical_key = v_job.musical_key,
    movement_label = v_job.movement_label,
    composition_year = v_job.composition_year,
    primary_query = v_job.primary_query,
    extra_queries = v_job.extra_queries,
    seo_title = v_job.seo_title,
    seo_description = v_job.seo_description,
    slug = v_job.slug,
    composer_slug = v_job.composer_slug,
    score_source = v_job.score_source,
    source_url = v_job.source_url,
    source_description = v_job.source_description,
    source_type = v_job.source_type,
    rights_checked = v_job.rights_checked,
    rights_comment = v_job.rights_comment,
    heading = v_job.heading,
    subtitle = v_job.subtitle,
    short_description = v_job.short_description,
    body = v_job.body,
    about_work = v_job.about_work,
    about_composer = v_job.about_composer,
    listening_notes = v_job.listening_notes,
    faq = v_job.faq,
    extra_blocks = v_job.extra_blocks,
    priority = v_job.priority,
    complexity = v_job.complexity,
    task_cost_minor = v_job.task_cost_minor,
    due_on = v_job.due_on,
    packaging_flags = v_flags
  WHERE id = p_job_id;

  PERFORM public.classica_production_log(
    p_job_id, v_actor, 'card_saved', v_job.status, v_job.status, v_job.assignee_id,
    jsonb_build_object('fields', (
      SELECT COALESCE(jsonb_agg(key), '[]'::jsonb)
      FROM jsonb_object_keys(p_patch) AS key
    ))
  );
  RETURN p_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.classica_production_apply_packaging(
  p_job_id uuid,
  p_fields jsonb,
  p_flags jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_job public.classica_production_jobs;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'classica_auth_required';
  END IF;
  v_job := public.classica_production_lock(p_job_id);
  IF NOT public.classica_production_actor_can_edit(v_job, v_actor) THEN
    RAISE EXCEPTION 'classica_forbidden';
  END IF;
  IF p_flags IS NULL OR jsonb_typeof(p_flags) <> 'object' THEN
    RAISE EXCEPTION 'classica_invalid_field';
  END IF;

  UPDATE public.classica_production_jobs
  SET
    heading = public.classica_production_optional_text(p_fields->>'heading', 180),
    subtitle = public.classica_production_optional_text(p_fields->>'subtitle', 240),
    short_description = public.classica_production_optional_text(p_fields->>'short_description', 500),
    body = public.classica_production_optional_text(p_fields->>'body', 8000),
    about_work = public.classica_production_optional_text(p_fields->>'about_work', 8000),
    about_composer = public.classica_production_optional_text(p_fields->>'about_composer', 8000),
    listening_notes = public.classica_production_optional_text(p_fields->>'listening_notes', 8000),
    seo_title = public.classica_production_optional_text(p_fields->>'seo_title', 140),
    seo_description = public.classica_production_optional_text(p_fields->>'seo_description', 300),
    packaging_flags = p_flags,
    packaging_prepared_at = now()
  WHERE id = p_job_id;

  PERFORM public.classica_production_log(
    p_job_id, v_actor, 'packaging_prepared', v_job.status, v_job.status, v_job.assignee_id, p_flags
  );
  RETURN p_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.classica_production_take(p_job_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_job public.classica_production_jobs;
  v_label text;
BEGIN
  v_actor := public.classica_production_require('classica.production.operate');
  v_job := public.classica_production_lock(p_job_id);
  IF v_job.status <> 'queued' OR v_job.assignee_id IS NOT NULL THEN
    RAISE EXCEPTION 'classica_already_reserved';
  END IF;
  v_label := public.classica_production_actor_label(v_actor);
  UPDATE public.classica_production_jobs
  SET
    status = 'in_progress',
    assignee_id = v_actor,
    assignee_label = v_label,
    reserved_at = now(),
    first_taken_at = COALESCE(first_taken_at, now())
  WHERE id = p_job_id;
  PERFORM public.classica_production_log(
    p_job_id, v_actor, 'taken', 'queued', 'in_progress', v_actor, '{}'::jsonb
  );
  RETURN p_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.classica_production_release(
  p_job_id uuid,
  p_action text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_job public.classica_production_jobs;
BEGIN
  v_actor := public.classica_production_require('classica.production.admin');
  IF p_action NOT IN ('unreserved', 'returned_to_queue') THEN
    RAISE EXCEPTION 'classica_invalid_field';
  END IF;
  v_job := public.classica_production_lock(p_job_id);
  IF v_job.status NOT IN (
    'in_progress', 'audio_ready', 'packaging_ready', 'needs_revision', 'in_review'
  ) THEN
    RAISE EXCEPTION 'classica_status_locked';
  END IF;
  UPDATE public.classica_production_jobs
  SET status = 'queued', assignee_id = NULL, assignee_label = NULL, reserved_at = NULL
  WHERE id = p_job_id;
  PERFORM public.classica_production_log(
    p_job_id, v_actor, p_action, v_job.status, 'queued', NULL,
    jsonb_build_object('previous_assignee_id', v_job.assignee_id)
  );
  RETURN p_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.classica_production_reassign(
  p_job_id uuid,
  p_assignee uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_job public.classica_production_jobs;
BEGIN
  v_actor := public.classica_production_require('classica.production.admin');
  v_job := public.classica_production_lock(p_job_id);
  IF v_job.status NOT IN (
    'in_progress', 'audio_ready', 'packaging_ready', 'needs_revision', 'in_review'
  ) THEN
    RAISE EXCEPTION 'classica_status_locked';
  END IF;
  IF p_assignee IS NULL OR NOT (
    public.has_platform_permission(p_assignee, 'classica.production.operate')
    OR public.has_platform_permission(p_assignee, 'classica.production.admin')
  ) THEN
    RAISE EXCEPTION 'classica_assignee_not_operator';
  END IF;
  UPDATE public.classica_production_jobs
  SET
    assignee_id = p_assignee,
    assignee_label = public.classica_production_actor_label(p_assignee),
    reserved_at = now(),
    first_taken_at = COALESCE(first_taken_at, now())
  WHERE id = p_job_id;
  PERFORM public.classica_production_log(
    p_job_id, v_actor, 'reassigned', v_job.status, v_job.status, p_assignee,
    jsonb_build_object('previous_assignee_id', v_job.assignee_id)
  );
  RETURN p_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.classica_production_mark_status(
  p_job_id uuid,
  p_status text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_job public.classica_production_jobs;
  v_allowed boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'classica_auth_required';
  END IF;
  v_job := public.classica_production_lock(p_job_id);
  IF NOT (
    (public.has_platform_permission(v_actor, 'classica.production.admin'))
    OR (
      public.has_platform_permission(v_actor, 'classica.production.operate')
      AND v_job.assignee_id = v_actor
    )
  ) THEN
    RAISE EXCEPTION 'classica_forbidden';
  END IF;
  v_allowed := (
    (v_job.status = 'in_progress' AND p_status IN ('audio_ready', 'packaging_ready'))
    OR (v_job.status = 'audio_ready' AND p_status IN ('in_progress', 'packaging_ready'))
    OR (v_job.status = 'packaging_ready' AND p_status IN ('in_progress', 'audio_ready'))
    OR (v_job.status = 'needs_revision' AND p_status IN ('in_progress', 'audio_ready', 'packaging_ready'))
  );
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'classica_status_locked';
  END IF;
  UPDATE public.classica_production_jobs SET status = p_status WHERE id = p_job_id;
  PERFORM public.classica_production_log(
    p_job_id, v_actor, 'status_changed', v_job.status, p_status, v_job.assignee_id, '{}'::jsonb
  );
  RETURN p_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.classica_production_submit(p_job_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_job public.classica_production_jobs;
  v_gaps text[];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'classica_auth_required';
  END IF;
  v_job := public.classica_production_lock(p_job_id);
  IF NOT (
    public.has_platform_permission(v_actor, 'classica.production.admin')
    OR (
      public.has_platform_permission(v_actor, 'classica.production.operate')
      AND v_job.assignee_id = v_actor
    )
  ) THEN
    RAISE EXCEPTION 'classica_forbidden';
  END IF;
  IF v_job.assignee_id IS NULL
    OR v_job.status NOT IN ('in_progress', 'audio_ready', 'packaging_ready', 'needs_revision') THEN
    RAISE EXCEPTION 'classica_status_locked';
  END IF;
  v_gaps := public.classica_production_checklist_gaps(v_job);
  IF cardinality(v_gaps) > 0 THEN
    RAISE EXCEPTION 'classica_checklist_failed:%', array_to_string(v_gaps, ',');
  END IF;
  UPDATE public.classica_production_jobs
  SET status = 'in_review', submitted_at = now(), submitted_by = v_actor
  WHERE id = p_job_id;
  PERFORM public.classica_production_log(
    p_job_id, v_actor, 'submitted', v_job.status, 'in_review', v_job.assignee_id,
    jsonb_build_object('operator_id', v_job.assignee_id)
  );
  RETURN p_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.classica_production_review(
  p_job_id uuid,
  p_decision text,
  p_reason text,
  p_comment text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_job public.classica_production_jobs;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_comment text := NULLIF(btrim(COALESCE(p_comment, '')), '');
  v_seconds integer;
BEGIN
  v_actor := public.classica_production_require('classica.production.moderate');
  IF p_decision NOT IN ('accept', 'return', 'comment') THEN
    RAISE EXCEPTION 'classica_invalid_field';
  END IF;
  v_job := public.classica_production_lock(p_job_id);
  IF v_job.status <> 'in_review' THEN
    RAISE EXCEPTION 'classica_status_locked';
  END IF;
  IF p_decision = 'return' AND (v_reason IS NULL OR char_length(v_reason) < 3) THEN
    RAISE EXCEPTION 'classica_return_reason_required';
  END IF;
  IF p_decision = 'comment' AND (v_comment IS NULL OR char_length(v_comment) < 2) THEN
    RAISE EXCEPTION 'classica_comment_required';
  END IF;
  IF v_reason IS NOT NULL AND char_length(v_reason) > 2000 THEN
    RAISE EXCEPTION 'classica_invalid_field';
  END IF;
  IF v_comment IS NOT NULL AND char_length(v_comment) > 2000 THEN
    RAISE EXCEPTION 'classica_invalid_field';
  END IF;

  INSERT INTO public.classica_production_reviews (
    job_id, reviewer_id, reviewer_label, decision, reason, comment
  ) VALUES (
    p_job_id, v_actor, public.classica_production_actor_label(v_actor),
    p_decision, v_reason, v_comment
  );

  IF p_decision = 'comment' THEN
    PERFORM public.classica_production_log(
      p_job_id, v_actor, 'commented', v_job.status, v_job.status, v_job.assignee_id,
      jsonb_build_object('operator_id', v_job.assignee_id)
    );
    RETURN p_job_id;
  END IF;

  IF p_decision = 'return' THEN
    UPDATE public.classica_production_jobs
    SET status = 'needs_revision', return_count = return_count + 1
    WHERE id = p_job_id;
    PERFORM public.classica_production_log(
      p_job_id, v_actor, 'returned', 'in_review', 'needs_revision', v_job.assignee_id,
      jsonb_build_object(
        'operator_id', v_job.assignee_id,
        'return_count', v_job.return_count + 1,
        'reason', v_reason
      )
    );
    RETURN p_job_id;
  END IF;

  IF v_job.assignee_id IS NULL THEN
    RAISE EXCEPTION 'classica_status_locked';
  END IF;
  v_seconds := CASE
    WHEN v_job.first_taken_at IS NULL THEN NULL
    ELSE GREATEST(0, floor(extract(epoch FROM (now() - v_job.first_taken_at))))::integer
  END;
  UPDATE public.classica_production_jobs
  SET
    status = 'accepted',
    accepted_at = now(),
    accepted_by = v_actor,
    production_seconds = v_seconds
  WHERE id = p_job_id;
  INSERT INTO public.classica_production_accruals (
    job_id, operator_id, operator_label, amount_minor, currency, status, reason
  ) VALUES (
    p_job_id,
    v_job.assignee_id,
    COALESCE(v_job.assignee_label, public.classica_production_actor_label(v_job.assignee_id)),
    v_job.task_cost_minor,
    'RUB',
    'accrued',
    'accepted'
  );
  PERFORM public.classica_production_log(
    p_job_id, v_actor, 'accepted', 'in_review', 'accepted', v_job.assignee_id,
    jsonb_build_object(
      'operator_id', v_job.assignee_id,
      'return_count', v_job.return_count,
      'amount_minor', v_job.task_cost_minor
    )
  );
  RETURN p_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.classica_production_publish(
  p_job_id uuid,
  p_composer_slug text,
  p_audio_path text,
  p_cover_path text,
  p_images jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_job public.classica_production_jobs;
  v_gaps text[];
  v_composer_id uuid;
  v_work_id uuid;
  v_public_id uuid;
  v_image jsonb;
  v_path text;
BEGIN
  v_actor := public.classica_production_require('classica.production.admin');
  v_job := public.classica_production_lock(p_job_id);
  IF v_job.status <> 'accepted' THEN
    RAISE EXCEPTION 'classica_status_locked';
  END IF;
  v_gaps := public.classica_production_checklist_gaps(v_job);
  IF cardinality(v_gaps) > 0 THEN
    RAISE EXCEPTION 'classica_checklist_failed:%', array_to_string(v_gaps, ',');
  END IF;
  IF p_composer_slug IS NULL OR p_composer_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'classica_invalid_composer_slug';
  END IF;
  IF p_audio_path IS NULL
    OR p_audio_path !~ ('^works/' || p_job_id::text || '/audio/[A-Za-z0-9._-]+$')
    OR p_cover_path IS NULL
    OR p_cover_path !~ ('^works/' || p_job_id::text || '/cover/[A-Za-z0-9._-]+$')
    OR p_images IS NULL
    OR jsonb_typeof(p_images) <> 'array' THEN
    RAISE EXCEPTION 'classica_publish_incomplete';
  END IF;
  FOR v_image IN SELECT value FROM jsonb_array_elements(p_images) AS value
  LOOP
    v_path := v_image->>'path';
    IF v_path IS NULL
      OR v_path !~ ('^works/' || p_job_id::text || '/slider/[A-Za-z0-9._-]+$') THEN
      RAISE EXCEPTION 'classica_publish_incomplete';
    END IF;
  END LOOP;

  SELECT composer.id INTO v_composer_id
  FROM public.classical_composers AS composer
  WHERE composer.slug = p_composer_slug;
  IF NOT FOUND THEN
    INSERT INTO public.classical_composers (
      slug, name_ru, bio, seo_title, seo_description, editorial_status
    ) VALUES (
      p_composer_slug,
      v_job.composer_name,
      v_job.about_composer,
      left(v_job.composer_name, 140),
      left(COALESCE(v_job.about_composer, v_job.composer_name), 300),
      'published'
    )
    RETURNING id INTO v_composer_id;
  END IF;

  SELECT work.id INTO v_work_id
  FROM public.classical_works AS work
  WHERE work.composer_id = v_composer_id AND work.slug = v_job.slug;
  IF FOUND AND v_job.classical_work_id IS DISTINCT FROM v_work_id THEN
    RAISE EXCEPTION 'classica_slug_taken';
  END IF;
  IF NOT FOUND THEN
    INSERT INTO public.classical_works (
      composer_id, slug, title_ru, title_original, common_title, catalogue_number,
      musical_key, composition_year, description, seo_title, seo_description, editorial_status
    ) VALUES (
      v_composer_id,
      v_job.slug,
      v_job.title,
      v_job.alternative_title,
      v_job.alternative_title,
      v_job.catalogue_number,
      v_job.musical_key,
      v_job.composition_year,
      left(COALESCE(v_job.short_description, v_job.body), 4000),
      v_job.seo_title,
      v_job.seo_description,
      'published'
    )
    RETURNING id INTO v_work_id;
  ELSE
    UPDATE public.classical_works
    SET
      title_ru = v_job.title,
      title_original = v_job.alternative_title,
      common_title = v_job.alternative_title,
      catalogue_number = v_job.catalogue_number,
      musical_key = v_job.musical_key,
      composition_year = v_job.composition_year,
      description = left(COALESCE(v_job.short_description, v_job.body), 4000),
      seo_title = v_job.seo_title,
      seo_description = v_job.seo_description,
      editorial_status = 'published'
    WHERE id = v_work_id;
  END IF;

  INSERT INTO public.classica_public_works (
    job_id, classical_work_id, classical_composer_id, composer_slug, work_slug,
    composer_name, title, heading, subtitle, short_description, body, about_work,
    about_composer, listening_notes, faq, extra_blocks, seo_title, seo_description,
    musical_key, catalogue_number, composition_year, duration_seconds, audio_path,
    cover_path, images
  ) VALUES (
    p_job_id, v_work_id, v_composer_id, p_composer_slug, v_job.slug,
    v_job.composer_name, v_job.title, COALESCE(v_job.heading, v_job.title),
    v_job.subtitle, v_job.short_description, v_job.body, v_job.about_work,
    v_job.about_composer, v_job.listening_notes, v_job.faq, v_job.extra_blocks,
    v_job.seo_title, v_job.seo_description, v_job.musical_key, v_job.catalogue_number,
    v_job.composition_year, v_job.duration_seconds, p_audio_path, p_cover_path, p_images
  )
  RETURNING id INTO v_public_id;

  UPDATE public.classica_production_jobs
  SET
    status = 'published',
    published_at = now(),
    published_by = v_actor,
    composer_slug = p_composer_slug,
    classical_composer_id = v_composer_id,
    classical_work_id = v_work_id
  WHERE id = p_job_id;

  PERFORM public.classica_production_log(
    p_job_id, v_actor, 'published', 'accepted', 'published', v_job.assignee_id,
    jsonb_build_object('public_id', v_public_id, 'composer_slug', p_composer_slug, 'work_slug', v_job.slug)
  );
  RETURN v_public_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.classica_production_register_asset(
  p_job_id uuid,
  p_kind text,
  p_bucket text,
  p_path text,
  p_mime text,
  p_bytes bigint,
  p_alt text,
  p_title text,
  p_sort integer
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_job public.classica_production_jobs;
  v_replaced text[] := ARRAY[]::text[];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'classica_auth_required';
  END IF;
  IF p_kind NOT IN ('source_file', 'source_render', 'final_audio', 'cover', 'slider')
    OR p_bucket <> 'classica-production'
    OR p_path IS NULL
    OR p_path !~ ('^' || p_job_id::text || '/' || p_kind || '/[A-Za-z0-9._-]+$')
    OR p_bytes IS NULL OR p_bytes <= 0 OR p_bytes > 52428800
    OR p_mime IS NULL OR char_length(p_mime) > 120 THEN
    RAISE EXCEPTION 'classica_asset_invalid';
  END IF;
  v_job := public.classica_production_lock(p_job_id);
  IF NOT public.classica_production_actor_can_edit(v_job, v_actor) THEN
    RAISE EXCEPTION 'classica_forbidden';
  END IF;
  IF p_kind IN ('source_file', 'source_render', 'final_audio', 'cover') THEN
    SELECT COALESCE(array_agg(asset.storage_path), ARRAY[]::text[])
    INTO v_replaced
    FROM public.classica_production_assets AS asset
    WHERE asset.job_id = p_job_id AND asset.kind = p_kind AND asset.storage_bucket = p_bucket;
    DELETE FROM public.classica_production_assets
    WHERE job_id = p_job_id AND kind = p_kind AND storage_bucket = p_bucket;
  END IF;
  INSERT INTO public.classica_production_assets (
    job_id, kind, storage_bucket, storage_path, mime_type, byte_size, alt_text, title_text, sort_order, created_by
  ) VALUES (
    p_job_id, p_kind, p_bucket, p_path, p_mime, p_bytes,
    public.classica_production_optional_text(p_alt, 200),
    public.classica_production_optional_text(p_title, 200),
    COALESCE(p_sort, 0),
    v_actor
  );
  IF p_kind = 'final_audio' THEN
    UPDATE public.classica_production_jobs
    SET audio_playback_confirmed_at = NULL, audio_playback_confirmed_by = NULL, duration_seconds = NULL
    WHERE id = p_job_id;
  END IF;
  PERFORM public.classica_production_log(
    p_job_id, v_actor, 'asset_added', v_job.status, v_job.status, v_job.assignee_id,
    jsonb_build_object('kind', p_kind)
  );
  RETURN v_replaced;
END;
$$;

CREATE OR REPLACE FUNCTION public.classica_production_remove_asset(p_asset_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_asset public.classica_production_assets;
  v_job public.classica_production_jobs;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'classica_auth_required';
  END IF;
  SELECT * INTO v_asset FROM public.classica_production_assets WHERE id = p_asset_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'classica_job_not_found';
  END IF;
  v_job := public.classica_production_lock(v_asset.job_id);
  IF NOT public.classica_production_actor_can_edit(v_job, v_actor) THEN
    RAISE EXCEPTION 'classica_forbidden';
  END IF;
  DELETE FROM public.classica_production_assets WHERE id = p_asset_id;
  IF v_asset.kind = 'final_audio' THEN
    UPDATE public.classica_production_jobs
    SET audio_playback_confirmed_at = NULL, audio_playback_confirmed_by = NULL, duration_seconds = NULL
    WHERE id = v_asset.job_id;
  END IF;
  PERFORM public.classica_production_log(
    v_asset.job_id, v_actor, 'asset_removed', v_job.status, v_job.status, v_job.assignee_id,
    jsonb_build_object('kind', v_asset.kind)
  );
  RETURN v_asset.storage_path;
END;
$$;

CREATE OR REPLACE FUNCTION public.classica_production_confirm_playback(
  p_job_id uuid,
  p_duration numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_job public.classica_production_jobs;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'classica_auth_required';
  END IF;
  IF p_duration IS NULL OR p_duration <= 0 OR p_duration > 86400 THEN
    RAISE EXCEPTION 'classica_playback_required';
  END IF;
  v_job := public.classica_production_lock(p_job_id);
  IF NOT public.classica_production_actor_can_edit(v_job, v_actor) THEN
    RAISE EXCEPTION 'classica_forbidden';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.classica_production_assets AS asset
    WHERE asset.job_id = p_job_id AND asset.kind = 'final_audio'
  ) THEN
    RAISE EXCEPTION 'classica_playback_required';
  END IF;
  UPDATE public.classica_production_jobs
  SET
    duration_seconds = p_duration,
    audio_playback_confirmed_at = now(),
    audio_playback_confirmed_by = v_actor
  WHERE id = p_job_id;
  PERFORM public.classica_production_log(
    p_job_id, v_actor, 'playback_confirmed', v_job.status, v_job.status, v_job.assignee_id,
    jsonb_build_object('duration_seconds', p_duration)
  );
  RETURN p_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.classica_production_save_prompt(p_body text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_body text := btrim(COALESCE(p_body, ''));
BEGIN
  v_actor := public.classica_production_require('classica.production.admin');
  IF char_length(v_body) < 200 OR char_length(v_body) > 20000 THEN
    RAISE EXCEPTION 'classica_prompt_invalid';
  END IF;
  UPDATE public.classica_production_prompts
  SET body = v_body, updated_at = now(), updated_by = v_actor
  WHERE code = 'packaging_master';
END;
$$;

CREATE OR REPLACE FUNCTION public.classica_production_grant_role(
  p_email text,
  p_role text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
  v_user uuid;
  v_count integer;
BEGIN
  v_actor := public.classica_production_require('classica.production.admin');
  IF p_role NOT IN ('classica_operator', 'classica_moderator') THEN
    RAISE EXCEPTION 'classica_invalid_field';
  END IF;
  SELECT count(*)::integer INTO v_count
  FROM auth.users AS users
  WHERE lower(users.email) = lower(btrim(COALESCE(p_email, '')));
  IF v_count = 0 THEN
    RAISE EXCEPTION 'classica_user_not_found';
  END IF;
  IF v_count > 1 THEN
    RAISE EXCEPTION 'classica_user_ambiguous';
  END IF;
  SELECT users.id INTO v_user
  FROM auth.users AS users
  WHERE lower(users.email) = lower(btrim(p_email));
  INSERT INTO public.platform_user_roles (user_id, role_code, granted_by)
  VALUES (v_user, p_role, v_actor)
  ON CONFLICT (user_id, role_code) DO NOTHING;
  RETURN v_user;
END;
$$;

CREATE OR REPLACE FUNCTION public.classica_production_revoke_role(
  p_user_id uuid,
  p_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid;
BEGIN
  v_actor := public.classica_production_require('classica.production.admin');
  IF p_role NOT IN ('classica_operator', 'classica_moderator') THEN
    RAISE EXCEPTION 'classica_invalid_field';
  END IF;
  DELETE FROM public.platform_user_roles
  WHERE user_id = p_user_id AND role_code = p_role;
  PERFORM v_actor;
END;
$$;

CREATE OR REPLACE FUNCTION public.classica_production_role_holders()
RETURNS TABLE (user_id uuid, label text, role_code text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.classica_production_require('classica.production.admin');
  RETURN QUERY
  SELECT roles.user_id, public.classica_production_actor_label(roles.user_id), roles.role_code
  FROM public.platform_user_roles AS roles
  WHERE roles.role_code IN ('classica_operator', 'classica_moderator')
  ORDER BY roles.role_code, 2;
END;
$$;

CREATE OR REPLACE FUNCTION public.classica_production_operator_options()
RETURNS TABLE (user_id uuid, label text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.classica_production_require('classica.production.admin');
  RETURN QUERY
  SELECT profiles.id, public.classica_production_actor_label(profiles.id)
  FROM public.profiles AS profiles
  WHERE public.has_platform_permission(profiles.id, 'classica.production.operate')
    OR public.has_platform_permission(profiles.id, 'classica.production.admin')
  ORDER BY 2;
END;
$$;

INSERT INTO public.classica_production_prompts (code, body)
VALUES (
  'packaging_master',
  $prompt$
Ты редактор раздела АудиоЛад Classica. По фактической карточке одного произведения подготовь текст публичной страницы и поля SEO.

Заполни девять полей: heading, subtitle, short_description, body, about_work, about_composer, listening_notes, seo_title, seo_description.
Каждое поле — объект с ключами text, doubtful и note.

Пиши по-русски, спокойно и точно. Без рекламного тона, без призыва купить ноты и без упоминания, что текст подготовлен моделью.
SEO title — не длиннее 140 символов. SEO description — не длиннее 300 символов.
Основной поисковый запрос используй естественно, не списком ключей.

Если во входных данных нет года, истории создания, каталожного номера, тональности или биографического факта, не достраивай их.
В таком поле поставь doubtful=true, в note коротко напиши, какого факта не хватает, а в text дословно напиши: «Требуется проверка: недостаточно подтверждённых данных.»
Не добавляй FAQ и не придумывай связанные произведения.
$prompt$
);

ALTER TABLE public.classica_production_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classica_production_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classica_production_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classica_production_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classica_production_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classica_production_accruals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classica_public_works ENABLE ROW LEVEL SECURITY;

CREATE POLICY classica_production_jobs_select
  ON public.classica_production_jobs
  FOR SELECT TO authenticated
  USING (public.has_platform_permission(auth.uid(), 'classica.production.access'));

CREATE POLICY classica_production_assets_select
  ON public.classica_production_assets
  FOR SELECT TO authenticated
  USING (public.has_platform_permission(auth.uid(), 'classica.production.access'));

CREATE POLICY classica_production_events_select
  ON public.classica_production_events
  FOR SELECT TO authenticated
  USING (public.has_platform_permission(auth.uid(), 'classica.production.access'));

CREATE POLICY classica_production_reviews_select
  ON public.classica_production_reviews
  FOR SELECT TO authenticated
  USING (public.has_platform_permission(auth.uid(), 'classica.production.access'));

CREATE POLICY classica_production_prompts_select
  ON public.classica_production_prompts
  FOR SELECT TO authenticated
  USING (public.has_platform_permission(auth.uid(), 'classica.production.admin'));

CREATE POLICY classica_production_accruals_select
  ON public.classica_production_accruals
  FOR SELECT TO authenticated
  USING (
    public.has_platform_permission(auth.uid(), 'classica.production.admin')
    OR (
      public.has_platform_permission(auth.uid(), 'classica.production.access')
      AND operator_id = auth.uid()
    )
  );

CREATE POLICY classica_public_works_select
  ON public.classica_public_works
  FOR SELECT TO anon, authenticated
  USING (true);

GRANT SELECT ON public.classica_production_jobs TO authenticated, service_role;
GRANT SELECT ON public.classica_production_assets TO authenticated, service_role;
GRANT SELECT ON public.classica_production_events TO authenticated, service_role;
GRANT SELECT ON public.classica_production_reviews TO authenticated, service_role;
GRANT SELECT ON public.classica_production_prompts TO authenticated, service_role;
GRANT SELECT ON public.classica_production_accruals TO authenticated, service_role;
GRANT ALL ON public.classica_production_jobs TO service_role;
GRANT ALL ON public.classica_production_assets TO service_role;
GRANT ALL ON public.classica_production_events TO service_role;
GRANT ALL ON public.classica_production_reviews TO service_role;
GRANT ALL ON public.classica_production_prompts TO service_role;
GRANT ALL ON public.classica_production_accruals TO service_role;
GRANT SELECT ON public.classica_public_works TO anon, authenticated, service_role;
GRANT ALL ON public.classica_public_works TO service_role;

REVOKE ALL ON FUNCTION public.classica_production_set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_actor_label(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_require(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_optional_text(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_required_text(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_clean_faq(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_clean_blocks(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_log(uuid, uuid, text, text, text, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_actor_can_edit(public.classica_production_jobs, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_storage_can_write(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_checklist_gaps(public.classica_production_jobs) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_lock(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_create_job(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_save_card(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_apply_packaging(uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_take(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_release(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_reassign(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_mark_status(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_submit(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_review(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_publish(uuid, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_register_asset(uuid, text, text, text, text, bigint, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_remove_asset(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_confirm_playback(uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_save_prompt(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_grant_role(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_revoke_role(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_role_holders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.classica_production_operator_options() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.classica_production_create_job(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classica_production_save_card(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classica_production_apply_packaging(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classica_production_take(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classica_production_release(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classica_production_reassign(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classica_production_mark_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classica_production_submit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classica_production_review(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classica_production_publish(uuid, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classica_production_register_asset(uuid, text, text, text, text, bigint, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classica_production_remove_asset(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classica_production_confirm_playback(uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classica_production_save_prompt(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classica_production_grant_role(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classica_production_revoke_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.classica_production_role_holders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.classica_production_operator_options() TO authenticated;
GRANT EXECUTE ON FUNCTION public.classica_production_storage_can_write(text) TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'classica-production',
    'classica-production',
    false,
    52428800,
    ARRAY[
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/ogg',
      'audio/mp4', 'audio/aac', 'audio/midi', 'audio/mid',
      'image/jpeg', 'image/png', 'image/webp',
      'application/pdf', 'application/xml', 'text/xml', 'text/plain',
      'application/octet-stream', 'application/zip'
    ]::text[]
  ),
  (
    'classica-public',
    'classica-public',
    true,
    52428800,
    ARRAY[
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/flac', 'audio/ogg',
      'audio/mp4', 'audio/aac', 'image/jpeg', 'image/png', 'image/webp'
    ]::text[]
  )
ON CONFLICT (id) DO NOTHING;

CREATE POLICY classica_production_storage_read
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'classica-production'
    AND public.has_platform_permission(auth.uid(), 'classica.production.access')
  );

CREATE POLICY classica_production_storage_insert
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'classica-production'
    AND public.classica_production_storage_can_write(name)
  );

CREATE POLICY classica_production_storage_update
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'classica-production'
    AND public.classica_production_storage_can_write(name)
  )
  WITH CHECK (
    bucket_id = 'classica-production'
    AND public.classica_production_storage_can_write(name)
  );

CREATE POLICY classica_production_storage_delete
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'classica-production'
    AND public.classica_production_storage_can_write(name)
  );

CREATE POLICY classica_public_storage_insert
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'classica-public'
    AND public.has_platform_permission(auth.uid(), 'classica.production.admin')
  );

CREATE POLICY classica_public_storage_update
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'classica-public'
    AND public.has_platform_permission(auth.uid(), 'classica.production.admin')
  )
  WITH CHECK (
    bucket_id = 'classica-public'
    AND public.has_platform_permission(auth.uid(), 'classica.production.admin')
  );

CREATE POLICY classica_public_storage_delete
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'classica-public'
    AND public.has_platform_permission(auth.uid(), 'classica.production.admin')
  );

COMMENT ON TABLE public.classica_production_jobs IS
  'Classica production v0.1 work cards. Drafts stay here; published pages read classica_public_works.';
COMMENT ON TABLE public.classica_public_works IS
  'Published Classica pages for /classica/{composer}/{work}. Not a generated encyclopedia.';

COMMIT;
