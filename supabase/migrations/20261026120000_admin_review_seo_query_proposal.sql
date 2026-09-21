-- Atomic admin review of author SEO query proposals:
-- approve → analyzed + active 7-day reservation for proposer;
-- reject → not_applicable, no reservation;
-- reconcile → reserve when already analyzed but unreserved.
-- Ordinary admin queries without a proposal keep the existing analyze PUT path.
-- service_role only. No new tables/columns.

CREATE OR REPLACE FUNCTION public.admin_review_seo_query_proposal(
  p_proposal_id uuid,
  p_decision text,
  p_intent text DEFAULT NULL,
  p_recommended_format text DEFAULT NULL,
  p_audio_fit text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.seo_query_proposals%ROWTYPE;
  v_query public.seo_queries%ROWTYPE;
  v_reservation public.seo_query_reservations%ROWTYPE;
  v_existing public.seo_query_reservations%ROWTYPE;
  v_active_count integer;
  v_decision text;
  v_reconcile boolean := false;
BEGIN
  IF p_proposal_id IS NULL THEN
    RAISE EXCEPTION 'seo_proposal_required' USING ERRCODE = '22023';
  END IF;

  v_decision := lower(btrim(COALESCE(p_decision, '')));
  IF v_decision NOT IN ('analyzed', 'not_applicable') THEN
    RAISE EXCEPTION 'seo_proposal_decision_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_proposal
  FROM public.seo_query_proposals
  WHERE id = p_proposal_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_proposal_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_proposal.author_id::text, 73051));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_proposal.query_id::text, 73062));

  SELECT * INTO v_query
  FROM public.seo_queries
  WHERE id = v_proposal.query_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_query_not_found' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.expire_seo_query_reservation(v_query.id, NULL);
  PERFORM public.expire_seo_query_reservation(NULL, v_proposal.author_id);

  IF v_decision = 'not_applicable' THEN
    IF v_query.analysis_status = 'not_applicable' THEN
      RETURN jsonb_build_object(
        'proposal_id', v_proposal.id,
        'query_id', v_query.id,
        'query_text', v_query.query_text,
        'frequency', v_query.frequency,
        'analysis_status', v_query.analysis_status,
        'reservation_id', NULL,
        'decision', 'not_applicable',
        'idempotent', true,
        'reconciled', false
      );
    END IF;

    IF v_query.analysis_status = 'analyzed' THEN
      RAISE EXCEPTION 'seo_proposal_already_analyzed' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.seo_queries
    SET
      intent = COALESCE(NULLIF(btrim(p_intent), ''), intent),
      recommended_format = COALESCE(NULLIF(btrim(p_recommended_format), ''), recommended_format),
      audio_fit = COALESCE(NULLIF(btrim(p_audio_fit), ''), audio_fit),
      analysis_status = 'not_applicable',
      updated_at = now()
    WHERE id = v_query.id
    RETURNING * INTO v_query;

    RETURN jsonb_build_object(
      'proposal_id', v_proposal.id,
      'query_id', v_query.id,
      'query_text', v_query.query_text,
      'frequency', v_query.frequency,
      'analysis_status', v_query.analysis_status,
      'reservation_id', NULL,
      'decision', 'not_applicable',
      'idempotent', false,
      'reconciled', false
    );
  END IF;

  -- decision = analyzed (approve or reconcile)
  SELECT * INTO v_existing
  FROM public.seo_query_reservations
  WHERE query_id = v_query.id
    AND status IN ('active', 'used')
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.author_id IS NOT DISTINCT FROM v_proposal.author_id
       AND v_existing.status = 'active'
       AND v_existing.product_id IS NULL THEN
      IF v_query.analysis_status IS DISTINCT FROM 'analyzed' THEN
        UPDATE public.seo_queries
        SET
          intent = COALESCE(NULLIF(btrim(p_intent), ''), intent),
          recommended_format = COALESCE(NULLIF(btrim(p_recommended_format), ''), recommended_format),
          audio_fit = COALESCE(NULLIF(btrim(p_audio_fit), ''), audio_fit),
          analysis_status = 'analyzed',
          updated_at = now()
        WHERE id = v_query.id
        RETURNING * INTO v_query;
      END IF;
      RETURN jsonb_build_object(
        'proposal_id', v_proposal.id,
        'query_id', v_query.id,
        'query_text', v_query.query_text,
        'frequency', v_query.frequency,
        'analysis_status', v_query.analysis_status,
        'reservation_id', v_existing.id,
        'author_id', v_existing.author_id,
        'expires_at', v_existing.expires_at,
        'decision', 'analyzed',
        'idempotent', true,
        'reconciled', false
      );
    END IF;

    IF v_existing.status = 'used' THEN
      RAISE EXCEPTION 'seo_query_already_used' USING ERRCODE = 'P0001';
    END IF;
    RAISE EXCEPTION 'seo_query_already_reserved' USING ERRCODE = 'P0001';
  END IF;

  IF v_query.analysis_status = 'analyzed' THEN
    v_reconcile := true;
  ELSIF v_query.analysis_status = 'not_applicable' THEN
    RAISE EXCEPTION 'seo_proposal_not_applicable' USING ERRCODE = 'P0001';
  ELSIF v_query.analysis_status <> 'not_analyzed' THEN
    RAISE EXCEPTION 'seo_proposal_status_conflict' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_active_count
  FROM public.seo_query_reservations
  WHERE author_id = v_proposal.author_id AND status = 'active';
  IF v_active_count >= 5 THEN
    RAISE EXCEPTION 'seo_reservation_limit_reached' USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_reconcile THEN
    UPDATE public.seo_queries
    SET
      intent = COALESCE(NULLIF(btrim(p_intent), ''), intent),
      recommended_format = COALESCE(NULLIF(btrim(p_recommended_format), ''), recommended_format),
      audio_fit = COALESCE(NULLIF(btrim(p_audio_fit), ''), audio_fit),
      analysis_status = 'analyzed',
      updated_at = now()
    WHERE id = v_query.id
    RETURNING * INTO v_query;
  END IF;

  INSERT INTO public.seo_query_reservations (
    query_id,
    author_id,
    product_id,
    reserved_at,
    expires_at,
    status
  ) VALUES (
    v_query.id,
    v_proposal.author_id,
    NULL,
    now(),
    now() + interval '7 days',
    'active'
  )
  RETURNING * INTO v_reservation;

  RETURN jsonb_build_object(
    'proposal_id', v_proposal.id,
    'query_id', v_query.id,
    'query_text', v_query.query_text,
    'frequency', v_query.frequency,
    'analysis_status', v_query.analysis_status,
    'reservation_id', v_reservation.id,
    'author_id', v_reservation.author_id,
    'expires_at', v_reservation.expires_at,
    'decision', 'analyzed',
    'idempotent', false,
    'reconciled', v_reconcile
  );
END;
$$;

COMMENT ON FUNCTION public.admin_review_seo_query_proposal(uuid, text, text, text, text) IS
  'audiolad:seo-proposal-review:v1; service_role only; approve reserves proposer 7d; reject sets not_applicable; reconcile reserves already-analyzed unreserved proposals';

REVOKE ALL ON FUNCTION public.admin_review_seo_query_proposal(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_review_seo_query_proposal(uuid, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_review_seo_query_proposal(uuid, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_seo_query_proposal(uuid, text, text, text, text) TO service_role;
