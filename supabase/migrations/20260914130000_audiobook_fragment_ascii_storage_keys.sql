BEGIN;

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
    OR p_source_type NOT IN ('upload', 'recording') THEN
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
    || p_chapter_id::text || '/' || p_fragment_id::text
    || '\.(webm|m4a|mp3|wav|aac)$'
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

COMMIT;
