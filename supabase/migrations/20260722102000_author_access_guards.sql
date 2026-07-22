BEGIN;

-- ---------------------------------------------------------------------------
-- DB guards: paid products + suspended content mutations
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_practices_author_access()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_author_id uuid;
  v_status text;
BEGIN
  v_author_id := COALESCE(NEW.author_id, OLD.author_id);

  IF v_author_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT a.access_status
  INTO v_status
  FROM public.authors AS a
  WHERE a.id = v_author_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF NOT public.author_access_allows_content_mutations(v_status) THEN
      RAISE EXCEPTION 'author_content_mutations_blocked'
        USING ERRCODE = '42501';
    END IF;

    RETURN OLD;
  END IF;

  IF NOT public.author_access_allows_content_mutations(v_status) THEN
    RAISE EXCEPTION 'author_content_mutations_blocked'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.author_access_allows_paid_products(v_status) THEN
    IF COALESCE(NEW.is_free, false) = false OR COALESCE(NEW.price, 0) > 0 THEN
      RAISE EXCEPTION 'paid_products_not_allowed'
        USING ERRCODE = '42501';
    END IF;

    NEW.is_free := true;
    NEW.price := 0;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_practices_author_access_trigger ON public.practices;

CREATE TRIGGER guard_practices_author_access_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON public.practices
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_practices_author_access();

CREATE OR REPLACE FUNCTION public.guard_authors_profile_mutations()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_staff(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF OLD.access_status IN ('suspended', 'terminated') THEN
    RAISE EXCEPTION 'author_content_mutations_blocked'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_authors_profile_mutations_trigger ON public.authors;

CREATE TRIGGER guard_authors_profile_mutations_trigger
  BEFORE UPDATE ON public.authors
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_authors_profile_mutations();

CREATE OR REPLACE FUNCTION public.guard_audio_items_author_access()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice_id uuid;
  v_author_id uuid;
  v_status text;
BEGIN
  v_practice_id := COALESCE(NEW.practice_id, OLD.practice_id);

  SELECT p.author_id
  INTO v_author_id
  FROM public.practices AS p
  WHERE p.id = v_practice_id;

  IF v_author_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;

    RETURN NEW;
  END IF;

  SELECT a.access_status
  INTO v_status
  FROM public.authors AS a
  WHERE a.id = v_author_id;

  IF NOT public.author_access_allows_content_mutations(v_status) THEN
    RAISE EXCEPTION 'author_content_mutations_blocked'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_audio_items_author_access_trigger ON public.audio_items;

CREATE TRIGGER guard_audio_items_author_access_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON public.audio_items
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_audio_items_author_access();

-- ---------------------------------------------------------------------------
-- publish_audio_product v5: access_status checks
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.publish_audio_product(
  p_practice_id uuid,
  p_published_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_practice public.practices%ROWTYPE;
  v_first_audio_path text;
  v_total_seconds bigint;
  v_duration_minutes integer;
  v_access_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated'
      USING ERRCODE = '28000';
  END IF;

  SELECT *
  INTO v_practice
  FROM public.practices AS p
  WHERE p.id = p_practice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'practice_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_practice.status = 'archived' THEN
    RAISE EXCEPTION 'practice_archived'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.author_members AS am
    WHERE am.author_id = v_practice.author_id
      AND am.user_id = auth.uid()
      AND am.role IN ('owner', 'editor')
  ) THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  SELECT a.access_status
  INTO v_access_status
  FROM public.authors AS a
  WHERE a.id = v_practice.author_id;

  IF NOT public.author_access_allows_content_mutations(v_access_status) THEN
    RAISE EXCEPTION 'author_content_mutations_blocked'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.author_access_allows_paid_products(v_access_status) THEN
    IF COALESCE(v_practice.is_free, false) = false OR COALESCE(v_practice.price, 0) > 0 THEN
      RAISE EXCEPTION 'paid_products_not_allowed'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.practice_topics AS pt
    INNER JOIN public.topics AS t
      ON t.id = pt.topic_id
    WHERE pt.practice_id = p_practice_id
      AND t.is_active = true
  ) THEN
    RAISE EXCEPTION 'topic_min_required'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.audio_items AS ai
  SET
    status = 'published',
    updated_at = now()
  WHERE ai.practice_id = p_practice_id;

  SELECT ai.audio_path
  INTO v_first_audio_path
  FROM public.audio_items AS ai
  WHERE ai.practice_id = p_practice_id
    AND ai.audio_path IS NOT NULL
    AND btrim(ai.audio_path) <> ''
  ORDER BY ai.position ASC
  LIMIT 1;

  SELECT COALESCE(SUM(ai.duration_seconds), 0)
  INTO v_total_seconds
  FROM public.audio_items AS ai
  WHERE ai.practice_id = p_practice_id
    AND ai.audio_path IS NOT NULL
    AND btrim(ai.audio_path) <> '';

  IF v_total_seconds > 0 THEN
    v_duration_minutes := GREATEST(1, CEIL(v_total_seconds::numeric / 60)::integer);
  ELSE
    v_duration_minutes := NULL;
  END IF;

  UPDATE public.practices AS p
  SET
    status = 'published',
    is_catalog_listed = true,
    published_at = COALESCE(p.published_at, p_published_at),
    audio_url = v_first_audio_path,
    duration_minutes = v_duration_minutes,
    updated_at = now()
  WHERE p.id = p_practice_id;
END;
$$;

COMMENT ON FUNCTION public.publish_audio_product(uuid, timestamptz) IS
  'audiolad:publish-audio-product:v5; publishes practice; requires >=1 active topic; enforces author access_status';

COMMIT;
