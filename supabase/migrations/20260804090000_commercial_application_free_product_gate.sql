-- audiolad:commercial-application-free-product-gate:v1
-- First commercial application submit requires a published free zero-price
-- product on the same author workspace. Draft save stays ungated.
-- needs_changes resubmit is exempt (legacy applications may predate the gate).
-- DO NOT edit previously applied migrations; forward-only.

CREATE OR REPLACE FUNCTION public.author_has_published_free_product_for_commercial_gate(
  p_author_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.practices AS p
    WHERE p.author_id = p_author_id
      AND p.deleted_at IS NULL
      AND p.status = 'published'
      AND p.is_free IS TRUE
      AND COALESCE(p.price, 0) = 0
  );
$$;

COMMENT ON FUNCTION public.author_has_published_free_product_for_commercial_gate(uuid) IS
  'audiolad:commercial-application-free-product-gate:v1; true when author has at least one published free zero-price product (any product_kind).';

REVOKE ALL ON FUNCTION public.author_has_published_free_product_for_commercial_gate(uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.author_has_published_free_product_for_commercial_gate(uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.author_has_published_free_product_for_commercial_gate(uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_author_commercial_application(
  p_author_id uuid,
  p_planned_products text,
  p_topics text,
  p_format_plan text,
  p_rights_confirmation boolean,
  p_team_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_access text;
  v_row public.author_commercial_applications%ROWTYPE;
  v_from_status text;
  v_planned text := btrim(coalesce(p_planned_products, ''));
  v_topics text := btrim(coalesce(p_topics, ''));
  v_format text := btrim(coalesce(p_format_plan, ''));
  v_team text := NULLIF(btrim(coalesce(p_team_comment, '')), '');
  v_new_access text;
  v_requires_free_product boolean := true;
BEGIN
  PERFORM public.assert_author_commercial_application_member(p_author_id, v_actor);

  IF char_length(v_planned) < 20 THEN
    RAISE EXCEPTION 'commercial_application_invalid_planned_products' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_topics) < 2 THEN
    RAISE EXCEPTION 'commercial_application_invalid_topics' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_format) < 2 THEN
    RAISE EXCEPTION 'commercial_application_invalid_format_plan' USING ERRCODE = '22023';
  END IF;

  IF coalesce(p_rights_confirmation, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'commercial_application_rights_required' USING ERRCODE = '22023';
  END IF;

  SELECT a.access_status INTO v_access
  FROM public.authors AS a
  WHERE a.id = p_author_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'author_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_access IN (
    'commercial',
    'commercial_active',
    'commercial_onboarding'
  ) THEN
    RAISE EXCEPTION 'commercial_application_not_needed' USING ERRCODE = '22023';
  END IF;

  IF v_access IN ('suspended', 'terminated') THEN
    RAISE EXCEPTION 'author_access_transition_not_allowed' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM public.author_commercial_applications AS aca
  WHERE aca.author_id = p_author_id
    AND aca.status <> 'withdrawn'
  FOR UPDATE;

  IF FOUND THEN
    IF v_row.status NOT IN ('draft', 'needs_changes') THEN
      RAISE EXCEPTION 'commercial_application_already_active' USING ERRCODE = '22023';
    END IF;

    -- Resubmit after needs_changes must not be blocked by the new free-product gate.
    v_requires_free_product := v_row.status IS DISTINCT FROM 'needs_changes';
    v_from_status := v_row.status;

    IF v_requires_free_product
       AND NOT public.author_has_published_free_product_for_commercial_gate(p_author_id) THEN
      RAISE EXCEPTION 'commercial_application_free_product_required' USING ERRCODE = '22023';
    END IF;

    UPDATE public.author_commercial_applications
    SET
      status = 'submitted',
      planned_products = v_planned,
      topics = v_topics,
      format_plan = v_format,
      rights_confirmation = true,
      team_comment = v_team,
      submitted_at = coalesce(submitted_at, now()),
      updated_at = now()
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  ELSE
    IF v_access = 'commercial_pending' THEN
      RAISE EXCEPTION 'commercial_application_legacy_pending' USING ERRCODE = '22023';
    END IF;

    IF NOT public.author_has_published_free_product_for_commercial_gate(p_author_id) THEN
      RAISE EXCEPTION 'commercial_application_free_product_required' USING ERRCODE = '22023';
    END IF;

    v_from_status := NULL;

    INSERT INTO public.author_commercial_applications (
      author_id,
      created_by,
      status,
      planned_products,
      topics,
      format_plan,
      rights_confirmation,
      team_comment,
      submitted_at
    ) VALUES (
      p_author_id,
      v_actor,
      'submitted',
      v_planned,
      v_topics,
      v_format,
      true,
      v_team,
      now()
    )
    RETURNING * INTO v_row;
  END IF;

  PERFORM public.log_author_commercial_application_status_event(
    v_row.id,
    v_from_status,
    'submitted',
    v_actor,
    NULL,
    NULL
  );

  v_new_access := public.set_author_access_status_for_commercial_application(
    p_author_id,
    'commercial_pending',
    v_actor,
    'commercial_application_submitted',
    v_row.id
  );

  RETURN jsonb_build_object(
    'ok', true,
    'application_id', v_row.id,
    'status', v_row.status,
    'access_status', v_new_access
  );
END;
$$;

COMMENT ON FUNCTION public.submit_author_commercial_application(uuid, text, text, text, boolean, text) IS
  'audiolad:commercial-application-free-product-gate:v1; first submit requires published free product; draft save unchanged; needs_changes resubmit exempt.';

REVOKE ALL ON FUNCTION public.submit_author_commercial_application(uuid, text, text, text, boolean, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_author_commercial_application(uuid, text, text, text, boolean, text)
  TO authenticated, service_role;
