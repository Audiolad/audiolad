-- Helpers for the cover columns smoke test (scratch DB only).
-- t_cc_try runs one statement as the current role and reports:
--   'ok:<rows>'             statement ran, <rows> rows affected
--   'denied:<message>'      insufficient_privilege (trigger, RLS check, grant)
--   'error:<sqlstate>'      anything else
CREATE OR REPLACE FUNCTION public.t_cc_try(p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN 'ok:' || v_count;
EXCEPTION
  WHEN insufficient_privilege THEN
    RETURN 'denied:' || SQLERRM;
  WHEN OTHERS THEN
    RETURN 'error:' || SQLSTATE;
END;
$$;

CREATE OR REPLACE FUNCTION public.t_cc_expect(p_actual text, p_expected text, p_label text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_actual IS NULL OR p_actual NOT LIKE p_expected THEN
    RAISE EXCEPTION 'cover columns check failed: % (got %, want %)', p_label, p_actual, p_expected;
  END IF;
END;
$$;

-- Stands in for a SECURITY DEFINER RPC / migration path (runs as owner).
CREATE OR REPLACE FUNCTION public.t_cc_definer_set_cover(p_practice_id uuid, p_url text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.practices SET cover_url = p_url WHERE id = p_practice_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.t_cc_try(text),
  public.t_cc_expect(text, text, text),
  public.t_cc_definer_set_cover(uuid, text)
TO anon, authenticated, service_role;

-- Storage seed: a gallery object and an object whose name contains '..'.
INSERT INTO storage.objects (bucket_id, name) VALUES
  ('practice-covers', 'practices/11111111-1111-4111-8111-111111111111/gallery/s7/variants/v0/md.webp'),
  ('practice-covers', 'practices/11111111-1111-4111-8111-111111111111/gallery/s8/../../variants/v0/md.webp')
ON CONFLICT (bucket_id, name) DO NOTHING;
