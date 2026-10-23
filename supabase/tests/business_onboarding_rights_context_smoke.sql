-- Onboarding auto-creates Location Rights Context v1. Isolated smoke only.
-- Never against production. Synthetic countries AA/BB/CC/DD only.

INSERT INTO auth.users (id, email) VALUES
  ('d0000000-0000-4000-8000-000000000001', 'owner-aa@example.test'),
  ('d0000000-0000-4000-8000-000000000002', 'owner-bb@example.test');

DO $setup$
DECLARE
  v_author uuid := 'a0000000-0000-4000-8000-0000000000a1';
  v_practice uuid := 'a0000000-0000-4000-8000-0000000000a2';
  v_rh uuid := 'c0000000-0000-4000-8000-0000000000a1';
  v_prof uuid;
BEGIN
  INSERT INTO public.authors (id, name, slug) VALUES (v_author, 'A', 'onb-ctx-author');
  INSERT INTO public.practices (id, author_id, title, slug, product_kind)
  VALUES (v_practice, v_author, 'Music', 'onb-ctx-music', 'music');
  INSERT INTO public.audio_items (id, practice_id, title, music_track_code) VALUES
    ('a0000000-0000-4000-8000-0000000000b1', v_practice, 'Confirmed', 'AL-T-ONBCTX001'),
    ('a0000000-0000-4000-8000-0000000000b2', v_practice, 'No grants', 'AL-T-ONBCTX002');
  INSERT INTO public.music_rightsholders (id, display_name, entity_type, status)
  VALUES (v_rh, 'RH', 'organization', 'active');
  INSERT INTO public.music_rights_grants (
    audio_item_id, rightsholder_id, rights_layer, use_type, territory_scope,
    valid_from, source_type, status, version, verified_at
  ) VALUES
    ('a0000000-0000-4000-8000-0000000000b1', v_rh, 'recording', 'business_background_playback', 'worldwide',
     timestamptz '2026-01-01 00:00:00+00', 'direct_license', 'verified', 1, timestamptz '2026-01-01 00:00:00+00'),
    ('a0000000-0000-4000-8000-0000000000b1', v_rh, 'composition', 'business_background_playback', 'worldwide',
     timestamptz '2026-01-01 00:00:00+00', 'direct_license', 'verified', 1, timestamptz '2026-01-01 00:00:00+00');

  -- AA: supported, client_requirement none -> auto-create
  INSERT INTO public.music_country_rights_profiles (country_code, version, status)
  VALUES ('AA', 1, 'draft') RETURNING id INTO v_prof;
  INSERT INTO public.music_country_rights_profile_rules
    (profile_id, use_type, service_status, client_requirement, requires_recording, requires_composition)
  VALUES (v_prof, 'business_background_playback', 'supported', 'none', true, true);
  UPDATE public.music_country_rights_profiles SET reviewed_at = now(), status = 'active' WHERE id = v_prof;

  -- CC: client confirmation required -> never auto-create
  INSERT INTO public.music_country_rights_profiles (country_code, version, status)
  VALUES ('CC', 1, 'draft') RETURNING id INTO v_prof;
  INSERT INTO public.music_country_rights_profile_rules
    (profile_id, use_type, service_status, client_requirement, requires_recording, requires_composition)
  VALUES (v_prof, 'business_background_playback', 'supported', 'required', true, true);
  UPDATE public.music_country_rights_profiles SET reviewed_at = now(), status = 'active' WHERE id = v_prof;

  -- DD: unsupported -> never auto-create
  INSERT INTO public.music_country_rights_profiles (country_code, version, status)
  VALUES ('DD', 1, 'draft') RETURNING id INTO v_prof;
  INSERT INTO public.music_country_rights_profile_rules
    (profile_id, use_type, service_status, client_requirement, requires_recording, requires_composition)
  VALUES (v_prof, 'business_background_playback', 'unsupported', 'none', true, true);
  UPDATE public.music_country_rights_profiles SET reviewed_at = now(), status = 'active' WHERE id = v_prof;
  -- BB: no profile at all
END
$setup$;

CREATE TEMP TABLE onb_ctx_smoke (k text PRIMARY KEY, v uuid);
GRANT ALL ON onb_ctx_smoke TO authenticated;

-- OnbCtxA: onboarding (as authenticated owner) returns an active v1 context
SELECT set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
SET ROLE authenticated;
DO $a$
DECLARE
  v_json jsonb;
BEGIN
  v_json := public.create_business_organization_with_location('Кафе AA', 'Точка AA', 'cafe', 'AA', 'UTC');
  IF NOT (v_json->>'ok')::boolean OR v_json->>'rights_context_id' IS NULL THEN
    RAISE EXCEPTION 'OnbCtxA expected rights_context_id: %', v_json;
  END IF;
  INSERT INTO onb_ctx_smoke VALUES
    ('loc_aa', (v_json->>'location_id')::uuid),
    ('ctx_aa', (v_json->>'rights_context_id')::uuid),
    ('zone_aa', (v_json->>'zone_id')::uuid);
  RAISE NOTICE 'OnbCtxA ok';
END
$a$;

-- OnbCtxG: RLS/privileges – client roles cannot call ensure directly
DO $g$
BEGIN
  BEGIN
    PERFORM public.business_ensure_location_rights_context((SELECT v FROM onb_ctx_smoke WHERE k = 'loc_aa'));
    RAISE EXCEPTION 'OnbCtxG expected permission denied';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.business_location_rights_contexts) THEN
    RAISE EXCEPTION 'OnbCtxG authenticated must not read rights contexts directly';
  END IF;
  RAISE NOTICE 'OnbCtxG ok';
EXCEPTION WHEN insufficient_privilege THEN
  -- no SELECT grant at all on contexts is also acceptable
  RAISE NOTICE 'OnbCtxG ok';
END
$g$;

-- OnbCtxC: country without profile -> onboarding still ok, no context
SELECT set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000002', false);
DO $c$
DECLARE
  v_json jsonb;
BEGIN
  v_json := public.create_business_organization_with_location('Кафе BB', 'Точка BB', 'cafe', 'BB', 'UTC');
  IF NOT (v_json->>'ok')::boolean OR v_json->>'location_id' IS NULL THEN
    RAISE EXCEPTION 'OnbCtxC onboarding must still succeed: %', v_json;
  END IF;
  IF v_json ? 'rights_context_id' IS NOT TRUE OR v_json->>'rights_context_id' IS NOT NULL THEN
    RAISE EXCEPTION 'OnbCtxC expected null rights_context_id: %', v_json;
  END IF;
  INSERT INTO onb_ctx_smoke VALUES ('loc_bb', (v_json->>'location_id')::uuid);
  v_json := public.create_business_organization_with_location('Кафе CC', 'Точка CC', 'cafe', 'CC', 'UTC');
  IF v_json->>'rights_context_id' IS NOT NULL THEN
    RAISE EXCEPTION 'OnbCtxC client_requirement=required must not auto-create';
  END IF;
  INSERT INTO onb_ctx_smoke VALUES ('loc_cc', (v_json->>'location_id')::uuid);
  v_json := public.create_business_organization_with_location('Кафе DD', 'Точка DD', 'gym', 'DD', 'UTC');
  IF v_json->>'rights_context_id' IS NOT NULL THEN
    RAISE EXCEPTION 'OnbCtxC unsupported must not auto-create';
  END IF;
  RAISE NOTICE 'OnbCtxC ok';
END
$c$;
RESET ROLE;

DO $b$
DECLARE
  v_loc uuid := (SELECT v FROM onb_ctx_smoke WHERE k = 'loc_aa');
  v_ctx uuid := (SELECT v FROM onb_ctx_smoke WHERE k = 'ctx_aa');
  v_again uuid;
  v_row public.business_location_rights_contexts%ROWTYPE;
BEGIN
  -- OnbCtxA (cont.): snapshot shape
  SELECT * INTO v_row FROM public.business_location_rights_contexts WHERE id = v_ctx;
  IF v_row.status <> 'active' OR v_row.version <> 1 OR v_row.country_code_snapshot <> 'AA'
     OR v_row.business_category_snapshot <> 'cafe' OR v_row.reviewed_at IS NULL
     OR v_row.activated_at IS NULL OR v_row.location_id <> v_loc THEN
    RAISE EXCEPTION 'OnbCtxA unexpected context row';
  END IF;

  -- OnbCtxB: retry is idempotent – same id, no duplicate
  v_again := public.business_ensure_location_rights_context(v_loc);
  v_again := public.business_ensure_location_rights_context(v_loc);
  IF v_again IS DISTINCT FROM v_ctx THEN
    RAISE EXCEPTION 'OnbCtxB retry returned another context';
  END IF;
  IF (SELECT count(*) FROM public.business_location_rights_contexts WHERE location_id = v_loc) <> 1 THEN
    RAISE EXCEPTION 'OnbCtxB duplicate context on retry';
  END IF;
  RAISE NOTICE 'OnbCtxB ok';

  -- OnbCtxD: no profile -> NULL; nothing written; later profile -> created by retry
  IF public.business_ensure_location_rights_context((SELECT v FROM onb_ctx_smoke WHERE k = 'loc_bb')) IS NOT NULL THEN
    RAISE EXCEPTION 'OnbCtxD expected NULL without profile';
  END IF;
  IF EXISTS (SELECT 1 FROM public.business_location_rights_contexts
             WHERE location_id IN (SELECT v FROM onb_ctx_smoke WHERE k IN ('loc_bb', 'loc_cc'))) THEN
    RAISE EXCEPTION 'OnbCtxD fail-closed locations must have no context';
  END IF;
  IF public.business_ensure_location_rights_context(NULL) IS NOT NULL
     OR public.business_ensure_location_rights_context(gen_random_uuid()) IS NOT NULL THEN
    RAISE EXCEPTION 'OnbCtxD unknown location must be NULL';
  END IF;
  RAISE NOTICE 'OnbCtxD ok';

  -- OnbCtxE: existing history (superseded) is never auto-replaced
  UPDATE public.business_location_rights_contexts SET status = 'superseded' WHERE id = v_ctx;
  IF public.business_ensure_location_rights_context(v_loc) IS NOT NULL THEN
    RAISE EXCEPTION 'OnbCtxE must not recreate after history';
  END IF;
  IF (SELECT count(*) FROM public.business_location_rights_contexts WHERE location_id = v_loc) <> 1 THEN
    RAISE EXCEPTION 'OnbCtxE history must stay untouched';
  END IF;
  RAISE NOTICE 'OnbCtxE ok';
END
$b$;

-- OnbCtxF: new AA venue – rights-confirmed track ELIGIBLE, ungranted track UNKNOWN
-- (separate transaction: resolver as_of must be after clock_timestamp activation)
SELECT set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000001', false);
SET ROLE authenticated;
DO $f1$
DECLARE
  v_json jsonb;
BEGIN
  v_json := public.create_business_organization_with_location('Кафе AA 2', 'Точка AA 2', 'cafe', 'AA', 'UTC');
  INSERT INTO onb_ctx_smoke VALUES ('loc_aa2', (v_json->>'location_id')::uuid);
END
$f1$;
RESET ROLE;

DO $f2$
DECLARE
  v_loc uuid := (SELECT v FROM onb_ctx_smoke WHERE k = 'loc_aa2');
  v_out jsonb;
BEGIN
  v_out := public.resolve_business_track_eligibility('a0000000-0000-4000-8000-0000000000b1', v_loc);
  IF v_out->>'decision' <> 'ELIGIBLE' THEN
    RAISE EXCEPTION 'OnbCtxF confirmed track expected ELIGIBLE: %', v_out->'reason_codes';
  END IF;
  v_out := public.resolve_business_track_eligibility('a0000000-0000-4000-8000-0000000000b2', v_loc);
  IF v_out->>'decision' = 'ELIGIBLE' THEN
    RAISE EXCEPTION 'OnbCtxF ungranted track must not be ELIGIBLE';
  END IF;
  v_out := public.resolve_business_track_eligibility('a0000000-0000-4000-8000-0000000000b1', (SELECT v FROM onb_ctx_smoke WHERE k = 'loc_bb'));
  IF v_out->>'decision' = 'ELIGIBLE' THEN
    RAISE EXCEPTION 'OnbCtxF venue without context must stay fail-closed';
  END IF;
  RAISE NOTICE 'OnbCtxF ok';
END
$f2$;
