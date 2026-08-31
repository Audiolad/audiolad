BEGIN;

CREATE TABLE public.audiobook_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.authors(id) ON DELETE RESTRICT,
  title text NOT NULL,
  book_author_name text NULL,
  narrator_name text NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audiobook_projects_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT audiobook_projects_status_check CHECK (status = 'active')
);

CREATE INDEX audiobook_projects_author_updated_idx
  ON public.audiobook_projects (author_id, updated_at DESC, id DESC);

CREATE TABLE public.audiobook_chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.audiobook_projects(id) ON DELETE CASCADE,
  position integer NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audiobook_chapters_position_check CHECK (position >= 1),
  CONSTRAINT audiobook_chapters_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT audiobook_chapters_status_check CHECK (status = 'draft'),
  CONSTRAINT audiobook_chapters_project_position_key UNIQUE (project_id, position) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX audiobook_chapters_project_idx ON public.audiobook_chapters (project_id);
CREATE INDEX audiobook_chapters_project_position_idx
  ON public.audiobook_chapters (project_id, position, id);

CREATE OR REPLACE FUNCTION public.set_audiobook_projects_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER audiobook_projects_set_updated_at
  BEFORE UPDATE ON public.audiobook_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_audiobook_projects_updated_at();

CREATE OR REPLACE FUNCTION public.set_audiobook_chapters_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER audiobook_chapters_set_updated_at
  BEFORE UPDATE ON public.audiobook_chapters
  FOR EACH ROW EXECUTE FUNCTION public.set_audiobook_chapters_updated_at();

CREATE OR REPLACE FUNCTION public.touch_audiobook_project_from_chapter()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.audiobook_projects
  SET updated_at = clock_timestamp()
  WHERE id = COALESCE(NEW.project_id, OLD.project_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audiobook_chapters_touch_project
  AFTER INSERT OR UPDATE OR DELETE ON public.audiobook_chapters
  FOR EACH ROW EXECUTE FUNCTION public.touch_audiobook_project_from_chapter();

ALTER TABLE public.audiobook_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audiobook_chapters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.audiobook_projects FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.audiobook_chapters FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.audiobook_projects TO service_role;
GRANT ALL ON TABLE public.audiobook_chapters TO service_role;

CREATE OR REPLACE FUNCTION public.reorder_audiobook_chapters(
  p_project_id uuid,
  p_chapter_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expected_count integer;
  v_matched_count integer;
BEGIN
  IF p_project_id IS NULL OR p_chapter_ids IS NULL
    OR cardinality(p_chapter_ids) IS NULL THEN
    RAISE EXCEPTION 'invalid_audiobook_chapter_order' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.audiobook_projects
  WHERE id = p_project_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'audiobook_project_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*) INTO v_expected_count
  FROM public.audiobook_chapters WHERE project_id = p_project_id;
  IF v_expected_count <> cardinality(p_chapter_ids)
    OR cardinality(ARRAY(SELECT DISTINCT chapter_id FROM unnest(p_chapter_ids) AS chapter_id))
      <> cardinality(p_chapter_ids) THEN
    RAISE EXCEPTION 'invalid_audiobook_chapter_order' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_matched_count
  FROM public.audiobook_chapters
  WHERE project_id = p_project_id AND id = ANY(p_chapter_ids);
  IF v_matched_count <> v_expected_count THEN
    RAISE EXCEPTION 'invalid_audiobook_chapter_order' USING ERRCODE = '22023';
  END IF;

  SET CONSTRAINTS audiobook_chapters_project_position_key DEFERRED;
  UPDATE public.audiobook_chapters AS chapter
  SET position = ordered.position
  FROM unnest(p_chapter_ids) WITH ORDINALITY AS ordered(id, position)
  WHERE chapter.project_id = p_project_id AND chapter.id = ordered.id;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_audiobook_chapters(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_audiobook_chapters(uuid, uuid[]) TO service_role;

COMMIT;
