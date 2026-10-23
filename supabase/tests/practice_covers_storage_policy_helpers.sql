-- Helpers for practice-covers storage policy smoke tests (scratch DB only).
CREATE OR REPLACE FUNCTION public.t_pc_try_insert(p_name text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO storage.objects (bucket_id, name) VALUES ('practice-covers', p_name);
  RETURN true;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.t_pc_try_update(p_name text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE storage.objects
  SET owner = auth.uid()
  WHERE bucket_id = 'practice-covers' AND name = p_name;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN -1;
END;
$$;

CREATE OR REPLACE FUNCTION public.t_pc_try_delete(p_name text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id = 'practice-covers' AND name = p_name;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN -1;
END;
$$;

CREATE OR REPLACE FUNCTION public.t_pc_visible(p_name text)
RETURNS integer
LANGUAGE sql
AS $$
  SELECT count(*)::integer
  FROM storage.objects
  WHERE bucket_id = 'practice-covers' AND name = p_name
$$;

CREATE OR REPLACE FUNCTION public.t_pc_expect(p_ok boolean, p_label text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT coalesce(p_ok, false) THEN
    RAISE EXCEPTION 'practice-covers policy check failed: %', p_label;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.t_pc_try_insert(text),
  public.t_pc_try_update(text),
  public.t_pc_try_delete(text),
  public.t_pc_visible(text),
  public.t_pc_expect(boolean, text)
TO anon, authenticated, service_role;

-- Seed objects (as the table owner, RLS not applied).
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('practice-covers', 'practices/11111111-1111-4111-8111-111111111111/variants/v0/md.webp'),
  ('practice-covers', 'practices/11111111-1111-4111-8111-111111111111/cover.jpg'),
  ('practice-covers', 'practices/11111111-1111-4111-8111-111111111111/track-covers/a0/variants/v0/md.webp'),
  ('practice-covers', 'practices/11111111-1111-4111-8111-111111111111/track-covers/a0.png'),
  ('practice-covers', 'practices/11111111-1111-4111-8111-111111111111/gallery/s0/variants/v0/md.webp'),
  ('practice-covers', 'practices/11111111-1111-4111-8111-111111111111/gallery/s9/variants/v0/md.webp')
ON CONFLICT (bucket_id, name) DO NOTHING;
