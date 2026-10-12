-- Isolated scratch DB only. Synthetic users/tracks; never apply to production.
-- The rights engine is replaced by a scratch stub table so composition logic is tested
-- in isolation; the real engine has its own smoke (business_rights_eligibility_smoke.sql).
\set ON_ERROR_STOP on
BEGIN;
ALTER TABLE public.audio_items ADD COLUMN IF NOT EXISTS music_track_code text;
ALTER TABLE public.audio_items ADD COLUMN IF NOT EXISTS duration_seconds integer;
CREATE TABLE pg_temp.stub_decisions (audio_item_id uuid, use_type text, decision text);
CREATE OR REPLACE FUNCTION public.resolve_business_track_eligibility(
  p_audio_item_id uuid, p_location_id uuid, p_zone_id uuid DEFAULT NULL,
  p_use_type text DEFAULT 'business_background_playback', p_as_of timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('decision', coalesce((SELECT decision FROM pg_temp.stub_decisions d
    WHERE d.audio_item_id = p_audio_item_id AND d.use_type = p_use_type), 'UNKNOWN'), 'use_type', p_use_type);
$$;
DO $$
DECLARE
  user_a uuid := gen_random_uuid();
  user_b uuid := gen_random_uuid();
  org_a uuid := gen_random_uuid();
  org_b uuid := gen_random_uuid();
  loc_a uuid := gen_random_uuid();
  loc_b uuid := gen_random_uuid();
  author_id uuid := gen_random_uuid();
  practice_id uuid := gen_random_uuid();
  t1 uuid := gen_random_uuid();
  t2 uuid := gen_random_uuid();
  t3 uuid := gen_random_uuid();
  t_draft uuid := gen_random_uuid();
  program_a uuid := gen_random_uuid();
  n bigint;
  r record;
  ok boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES (user_a), (user_b);
  INSERT INTO public.authors(id, slug) VALUES (author_id, 'spa-comp-author');
  INSERT INTO public.practices(id, author_id, slug) VALUES (practice_id, author_id, 'spa-comp-track');
  INSERT INTO public.audio_items(id, practice_id, music_track_code, duration_seconds, status) VALUES
    (t1, practice_id, 'AL-T-TEST1', 600, 'published'), (t2, practice_id, 'AL-T-TEST2', 900, 'published'),
    (t3, practice_id, 'AL-T-TEST3', 120, 'published'), (t_draft, practice_id, 'AL-T-TEST4', 60, 'draft');
  INSERT INTO pg_temp.stub_decisions VALUES
    (t1, 'business_background_playback', 'ELIGIBLE'), (t1, 'offline_storage_cache', 'ELIGIBLE'),
    (t2, 'business_background_playback', 'ELIGIBLE'), (t2, 'offline_storage_cache', 'UNKNOWN'),
    (t3, 'business_background_playback', 'DENIED');
  INSERT INTO public.business_organizations(id, name) VALUES (org_a, 'SPA A'), (org_b, 'SPA B');
  INSERT INTO public.business_organization_members(organization_id, user_id, role)
    VALUES (org_a, user_a, 'owner'), (org_b, user_b, 'owner');
  INSERT INTO public.business_locations(id, organization_id, name, business_category, country_code, timezone)
    VALUES (loc_a, org_a, 'A', 'spa', 'AA', 'UTC'), (loc_b, org_b, 'B', 'spa', 'BB', 'UTC');
  INSERT INTO public.business_programs(id, organization_id, name) VALUES (program_a, org_a, 'Pilot');

  -- NoAllowlist: member without allowlist cannot compose or read.
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.business_spa_set_program_items(program_a, ARRAY[t1]);
    RAISE EXCEPTION 'NoAllowlist: compose must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;
  INSERT INTO public.business_pilot_allowlist(user_id, organization_id) VALUES (user_a, org_a), (user_b, org_b);

  -- Compose: ordered, idempotent.
  SET LOCAL ROLE authenticated;
  n := public.business_spa_set_program_items(program_a, ARRAY[t2, t1, t3]);
  IF n <> 3 THEN RAISE EXCEPTION 'Compose: expected 3, got %', n; END IF;
  n := public.business_spa_set_program_items(program_a, ARRAY[t2, t1, t3]);
  SELECT count(*) INTO n FROM public.business_program_items WHERE program_id = program_a;
  IF n <> 3 THEN RAISE EXCEPTION 'Idempotent: duplicate rows %', n; END IF;

  -- Reorder + soft exclusion: t3 removed, t1 first.
  PERFORM public.business_spa_set_program_items(program_a, ARRAY[t1, t2], 'pilot scope');
  SELECT count(*) INTO n FROM public.business_program_items
    WHERE program_id = program_a AND audio_item_id = t3 AND excluded_at IS NOT NULL AND excluded_reason = 'pilot scope';
  IF n <> 1 THEN RAISE EXCEPTION 'SoftExclude: t3 not excluded'; END IF;
  SELECT position INTO n FROM public.business_program_items WHERE program_id = program_a AND audio_item_id = t1;
  IF n <> 1 THEN RAISE EXCEPTION 'Reorder: t1 position %', n; END IF;

  -- Readd restores excluded item.
  PERFORM public.business_spa_set_program_items(program_a, ARRAY[t1, t2, t3]);
  SELECT count(*) INTO n FROM public.business_program_items WHERE program_id = program_a AND excluded_at IS NULL;
  IF n <> 3 THEN RAISE EXCEPTION 'Readd: active %', n; END IF;

  -- InvalidInput: duplicates and unpublished tracks are rejected.
  BEGIN
    PERFORM public.business_spa_set_program_items(program_a, ARRAY[t1, t1]);
    RAISE EXCEPTION 'Duplicates: must fail';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.business_spa_set_program_items(program_a, ARRAY[t_draft]);
    RAISE EXCEPTION 'Unpublished: must fail';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- FailClosed: only ELIGIBLE plays; offline needs both ELIGIBLE; UNKNOWN/DENIED = no.
  FOR r IN SELECT * FROM public.business_spa_program_composition(program_a, loc_a) LOOP
    IF r.audio_item_id = t1 AND NOT (r.playable AND r.offline_cacheable) THEN RAISE EXCEPTION 'FailClosed: t1'; END IF;
    IF r.audio_item_id = t2 AND NOT (r.playable AND NOT r.offline_cacheable) THEN RAISE EXCEPTION 'FailClosed: t2'; END IF;
    IF r.audio_item_id = t3 AND (r.playable OR r.offline_cacheable) THEN RAISE EXCEPTION 'FailClosed: t3'; END IF;
  END LOOP;
  SELECT count(*) INTO n FROM public.business_spa_program_composition(program_a, loc_a);
  IF n <> 3 THEN RAISE EXCEPTION 'Composition: rows %', n; END IF;

  -- LocationScope: foreign location rejected.
  BEGIN
    PERFORM * FROM public.business_spa_program_composition(program_a, loc_b);
    RAISE EXCEPTION 'LocationScope: must fail';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- CrossOrganization: allowlisted user of org B cannot read or compose org A.
  PERFORM set_config('request.jwt.claim.sub', user_b::text, true);
  BEGIN
    PERFORM * FROM public.business_spa_program_composition(program_a, loc_a);
    RAISE EXCEPTION 'CrossOrganization: read must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.business_spa_set_program_items(program_a, ARRAY[t1]);
    RAISE EXCEPTION 'CrossOrganization: compose must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;

  -- NoRightsWrites: composition never created grants or allowlist rows.
  SELECT count(*) INTO n FROM public.business_pilot_allowlist;
  IF n <> 2 THEN RAISE EXCEPTION 'NoRightsWrites: allowlist %', n; END IF;

  -- GainRange: loudness offset bounded.
  BEGIN
    UPDATE public.business_program_items SET gain_db = 12 WHERE program_id = program_a;
    RAISE EXCEPTION 'GainRange: must fail';
  EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE public.business_program_items SET gain_db = -7.5 WHERE program_id = program_a AND audio_item_id = t1;

  -- ArchivedProgram: archived programs are frozen.
  UPDATE public.business_programs SET status = 'archived' WHERE id = program_a;
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  BEGIN
    PERFORM public.business_spa_set_program_items(program_a, ARRAY[t1]);
    RAISE EXCEPTION 'ArchivedProgram: must fail';
  EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE NOTICE 'business_spa_composition_smoke: ok';
END $$;
ROLLBACK;
