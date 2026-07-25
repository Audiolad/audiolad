-- P1: close active identity links on logout (User A → logout → User B safety).

CREATE OR REPLACE FUNCTION public.unlink_analytics_identity()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_closed int := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  UPDATE public.analytics_identity_links AS l
  SET unlinked_at = now()
  WHERE l.user_id = v_user_id
    AND l.unlinked_at IS NULL;

  GET DIAGNOSTICS v_closed = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'closed', v_closed);
END;
$$;

REVOKE ALL ON FUNCTION public.unlink_analytics_identity() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlink_analytics_identity() TO authenticated;
