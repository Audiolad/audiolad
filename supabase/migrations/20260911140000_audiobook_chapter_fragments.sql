BEGIN;

CREATE TABLE public.audiobook_fragments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid NOT NULL REFERENCES public.audiobook_chapters(id) ON DELETE CASCADE,
  position integer NOT NULL,
  storage_path text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  duration_seconds numeric NULL,
  source_type text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audiobook_fragments_position_check CHECK (position >= 1),
  CONSTRAINT audiobook_fragments_size_check CHECK (size_bytes > 0 AND size_bytes <= 209715200),
  CONSTRAINT audiobook_fragments_mime_check CHECK (mime_type IN ('audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/x-wav','audio/aac')),
  CONSTRAINT audiobook_fragments_source_check CHECK (source_type = 'upload'),
  CONSTRAINT audiobook_fragments_status_check CHECK (status IN ('uploading','active')),
  CONSTRAINT audiobook_fragments_chapter_position_key UNIQUE (chapter_id, position) DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX audiobook_fragments_chapter_position_idx
  ON public.audiobook_fragments(chapter_id, position, id);

ALTER TABLE public.audiobook_fragments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.audiobook_fragments FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.audiobook_fragments TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audiobook-fragments',
  'audiobook-fragments',
  false,
  209715200,
  ARRAY['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac']
)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.audiobook_touch_chapter_from_fragment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.audiobook_chapters
  SET updated_at = clock_timestamp()
  WHERE id = COALESCE(NEW.chapter_id, OLD.chapter_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER audiobook_fragments_touch_chapter
  AFTER INSERT OR UPDATE OR DELETE ON public.audiobook_fragments
  FOR EACH ROW EXECUTE FUNCTION public.audiobook_touch_chapter_from_fragment();

CREATE OR REPLACE FUNCTION public.reserve_audiobook_fragment(
  p_project_id uuid,
  p_chapter_id uuid,
  p_fragment_id uuid,
  p_storage_path text,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_source_type text
)
RETURNS public.audiobook_fragments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_author_id uuid;
  v_position integer;
  v_fragment public.audiobook_fragments;
  v_total bigint;
BEGIN
  IF p_fragment_id IS NULL
    OR p_storage_path IS NULL
    OR p_original_name IS NULL
    OR p_mime_type IS NULL
    OR p_size_bytes IS NULL
    OR p_size_bytes <= 0
    OR p_source_type <> 'upload' THEN
    RAISE EXCEPTION 'invalid_audiobook_fragment' USING ERRCODE = '22023';
  END IF;

  SELECT author_id INTO v_author_id
  FROM public.audiobook_projects
  WHERE id = p_project_id AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'audiobook_project_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1
  FROM public.audiobook_chapters
  WHERE id = p_chapter_id AND project_id = p_project_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'audiobook_chapter_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_storage_path !~ (
    '^audiobooks/' || v_author_id::text || '/' || p_project_id::text || '/'
    || p_chapter_id::text || '/' || p_fragment_id::text || '/[A-Za-zА-Яа-я0-9._-]+$'
  ) THEN
    RAISE EXCEPTION 'invalid_audiobook_fragment' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(sum(fragment.size_bytes), 0) INTO v_total
  FROM public.audiobook_fragments AS fragment
  JOIN public.audiobook_chapters AS chapter ON chapter.id = fragment.chapter_id
  WHERE chapter.project_id = p_project_id
    AND fragment.status IN ('uploading', 'active');
  IF v_total + p_size_bytes > 5368709120 THEN
    RAISE EXCEPTION 'audiobook_project_quota_exceeded' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(max(position), 0) + 1 INTO v_position
  FROM public.audiobook_fragments
  WHERE chapter_id = p_chapter_id;

  INSERT INTO public.audiobook_fragments (
    id, chapter_id, position, storage_path, original_name, mime_type,
    size_bytes, source_type, status
  )
  VALUES (
    p_fragment_id, p_chapter_id, v_position, p_storage_path, p_original_name,
    p_mime_type, p_size_bytes, p_source_type, 'uploading'
  )
  RETURNING * INTO v_fragment;
  RETURN v_fragment;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_audiobook_fragment(
  p_project_id uuid,
  p_chapter_id uuid,
  p_fragment_id uuid
)
RETURNS public.audiobook_fragments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fragment public.audiobook_fragments;
BEGIN
  UPDATE public.audiobook_fragments AS fragment
  SET status = 'active'
  FROM public.audiobook_chapters AS chapter
  WHERE fragment.id = p_fragment_id
    AND fragment.chapter_id = p_chapter_id
    AND chapter.id = fragment.chapter_id
    AND chapter.project_id = p_project_id
    AND fragment.status = 'uploading'
  RETURNING fragment.* INTO v_fragment;

  IF NOT FOUND THEN
    SELECT fragment.* INTO v_fragment
    FROM public.audiobook_fragments AS fragment
    JOIN public.audiobook_chapters AS chapter ON chapter.id = fragment.chapter_id
    WHERE fragment.id = p_fragment_id
      AND fragment.chapter_id = p_chapter_id
      AND chapter.project_id = p_project_id
      AND fragment.status = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'audiobook_fragment_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN v_fragment;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_audiobook_fragment(
  p_project_id uuid,
  p_chapter_id uuid,
  p_fragment_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_path text;
BEGIN
  PERFORM 1 FROM public.audiobook_projects
  WHERE id = p_project_id AND status = 'active'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'audiobook_project_not_found' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.audiobook_fragments AS fragment
  USING public.audiobook_chapters AS chapter
  WHERE fragment.id = p_fragment_id
    AND fragment.chapter_id = p_chapter_id
    AND chapter.id = fragment.chapter_id
    AND chapter.project_id = p_project_id
  RETURNING fragment.storage_path INTO v_path;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'audiobook_fragment_not_found' USING ERRCODE = 'P0002';
  END IF;

  SET CONSTRAINTS audiobook_fragments_chapter_position_key DEFERRED;
  WITH numbered AS (
    SELECT id, row_number() OVER (ORDER BY position, id)::integer AS position
    FROM public.audiobook_fragments
    WHERE chapter_id = p_chapter_id
  )
  UPDATE public.audiobook_fragments AS fragment
  SET position = numbered.position
  FROM numbered
  WHERE fragment.id = numbered.id;

  RETURN v_path;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_audiobook_fragment(uuid, uuid, uuid, text, text, text, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_audiobook_fragment(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_audiobook_fragment(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_audiobook_fragment(uuid, uuid, uuid, text, text, text, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_audiobook_fragment(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_audiobook_fragment(uuid, uuid, uuid) TO service_role;

COMMIT;
