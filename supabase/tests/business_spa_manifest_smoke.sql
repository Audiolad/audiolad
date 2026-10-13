-- Isolated smoke for 20261230120000 (task 0e05333f, Business SPA PR3 manifest). Rolls back.
-- Runs after the full disposable replay. The rights engine is replaced by a transaction-local
-- stub (decision + cited grant ids) so manifest logic is tested in isolation; real grants rows
-- carry valid_until. The real engine has its own smoke (business_rights_eligibility_smoke.sql).
\set ON_ERROR_STOP on
BEGIN;
-- Disposable replay auth stub lacks this column; profile trigger reads it (rolled back).
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz;
-- Same contract as Supabase auth.role(); only created when the disposable replay lacks it.
DO $$ BEGIN
  IF to_regprocedure('auth.role()') IS NULL THEN
    EXECUTE $f$CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS
      'SELECT NULLIF(current_setting(''request.jwt.claim.role'', true), '''')'$f$;
    EXECUTE 'GRANT EXECUTE ON FUNCTION auth.role() TO PUBLIC';
  END IF;
END $$;
CREATE TABLE pg_temp.stub_decisions (audio_item_id uuid, use_type text, decision text, grant_ids jsonb DEFAULT '[]');
CREATE OR REPLACE FUNCTION public.resolve_business_track_eligibility(
  p_audio_item_id uuid, p_location_id uuid, p_zone_id uuid DEFAULT NULL,
  p_use_type text DEFAULT 'business_background_playback', p_as_of timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object(
    'decision', coalesce((SELECT decision FROM pg_temp.stub_decisions d
      WHERE d.audio_item_id = p_audio_item_id AND d.use_type = p_use_type), 'UNKNOWN'),
    'recording_grant_ids', coalesce((SELECT grant_ids FROM pg_temp.stub_decisions d
      WHERE d.audio_item_id = p_audio_item_id AND d.use_type = p_use_type), '[]'::jsonb),
    'composition_grant_ids', '[]'::jsonb,
    'use_type', p_use_type);
$$;
DO $$
DECLARE
  user_a uuid := gen_random_uuid(); user_b uuid := gen_random_uuid(); user_x uuid := gen_random_uuid();
  org_a uuid := gen_random_uuid(); org_b uuid := gen_random_uuid();
  loc_a uuid := gen_random_uuid(); loc_b uuid := gen_random_uuid();
  author_id uuid := gen_random_uuid(); practice_id uuid := gen_random_uuid();
  holder uuid := gen_random_uuid();
  t_full uuid := gen_random_uuid();   -- play + offline, open-ended grants -> cache 7 days
  t_short uuid := gen_random_uuid();  -- offline grant ends in 3 days -> cache 3 days
  t_play uuid := gen_random_uuid();   -- play only, offline UNKNOWN
  t_unk uuid := gen_random_uuid();    -- playback UNKNOWN -> withheld
  t_inel uuid := gen_random_uuid();   -- INELIGIBLE -> withheld
  t_cond uuid := gen_random_uuid();   -- CONDITIONAL -> withheld
  t_exp uuid := gen_random_uuid();    -- ELIGIBLE but cited playback grant already expired -> withheld
  t_unpub uuid := gen_random_uuid();  -- unpublished after composition -> withheld
  t_excl uuid := gen_random_uuid();   -- softly excluded -> not counted
  g_open uuid := gen_random_uuid(); g_short uuid := gen_random_uuid(); g_exp uuid := gen_random_uuid();
  g_play2d uuid := gen_random_uuid(); t_play2d uuid := gen_random_uuid();
  t_nocite uuid := gen_random_uuid(); -- ELIGIBLE offline but no cited grant -> online only
  t_hidden uuid := gen_random_uuid(); -- parent practice becomes selected_users -> withheld
  hidden_practice uuid := gen_random_uuid();
  program_a uuid := gen_random_uuid();
  m jsonb; m2 jsonb; it jsonb; n bigint; ts timestamptz;
BEGIN
  INSERT INTO auth.users(id, email) VALUES (user_a, 'm-a@test.invalid'), (user_b, 'm-b@test.invalid'), (user_x, 'm-x@test.invalid');
  INSERT INTO public.authors(id, name, slug) VALUES (author_id, 'Манифест', 'spa-manifest-author');
  PERFORM set_config('audiolad.allow_practice_publish', 'on', true);
  INSERT INTO public.practices(id, author_id, title, slug, status, is_free, price, product_kind, publication_class, cover_url, catalog_visibility)
    VALUES (practice_id, author_id, 'Manifest release', 'spa-manifest-release', 'published', true, 0, 'music', 'release', 'https://example.test/m.webp', 'listed'),
           (hidden_practice, author_id, 'Hidden release', 'spa-manifest-hidden', 'published', true, 0, 'music', 'release', 'https://example.test/h.webp', 'listed');
  INSERT INTO public.audio_items(id, practice_id, title, position, music_track_code, duration_seconds, status)
  SELECT t, practice_id, 'T' || ord, ord, 'AL-T-9' || lpad(ord::text, 8, '0'), 300, 'published'
  FROM unnest(ARRAY[t_full, t_short, t_play, t_unk, t_inel, t_cond, t_exp, t_unpub, t_excl, t_play2d, t_nocite]) WITH ORDINALITY AS x(t, ord);
  INSERT INTO public.audio_items(id, practice_id, title, position, music_track_code, duration_seconds, status)
    VALUES (t_hidden, hidden_practice, 'Secret', 1, 'AL-T-999999999', 300, 'published');

  INSERT INTO public.music_rightsholders(id, display_name, entity_type) VALUES (holder, 'Manifest holder', 'person');
  INSERT INTO public.music_rights_grants(id, audio_item_id, rightsholder_id, rights_layer, use_type, territory_scope,
      valid_from, valid_until, source_type, status, verified_at) VALUES
    (g_open, t_full, holder, 'recording', 'offline_storage_cache', 'worldwide', now() - interval '1 year', NULL, 'direct_license', 'verified', now()),
    (g_short, t_short, holder, 'recording', 'offline_storage_cache', 'worldwide', now() - interval '1 year', now() + interval '3 days', 'direct_license', 'verified', now()),
    (g_exp, t_exp, holder, 'recording', 'business_background_playback', 'worldwide', now() - interval '1 year', now() - interval '1 day', 'direct_license', 'verified', now()),
    (g_play2d, t_play2d, holder, 'recording', 'business_background_playback', 'worldwide', now() - interval '1 year', now() + interval '2 days', 'direct_license', 'verified', now());
  INSERT INTO pg_temp.stub_decisions VALUES
    (t_full, 'business_background_playback', 'ELIGIBLE', '[]'), (t_full, 'offline_storage_cache', 'ELIGIBLE', jsonb_build_array(g_open)),
    (t_short, 'business_background_playback', 'ELIGIBLE', '[]'), (t_short, 'offline_storage_cache', 'ELIGIBLE', jsonb_build_array(g_short)),
    (t_play, 'business_background_playback', 'ELIGIBLE', '[]'),
    (t_inel, 'business_background_playback', 'INELIGIBLE', '[]'), (t_inel, 'offline_storage_cache', 'ELIGIBLE', '[]'),
    (t_cond, 'business_background_playback', 'CONDITIONAL', '[]'),
    (t_exp, 'business_background_playback', 'ELIGIBLE', jsonb_build_array(g_exp)), (t_exp, 'offline_storage_cache', 'ELIGIBLE', '[]'),
    (t_unpub, 'business_background_playback', 'ELIGIBLE', '[]'),
    (t_excl, 'business_background_playback', 'ELIGIBLE', '[]'),
    (t_play2d, 'business_background_playback', 'ELIGIBLE', jsonb_build_array(g_play2d)), (t_play2d, 'offline_storage_cache', 'ELIGIBLE', jsonb_build_array(g_play2d)),
    (t_nocite, 'business_background_playback', 'ELIGIBLE', '[]'), (t_nocite, 'offline_storage_cache', 'ELIGIBLE', '[]'),
    (t_hidden, 'business_background_playback', 'ELIGIBLE', '[]'), (t_hidden, 'offline_storage_cache', 'ELIGIBLE', jsonb_build_array(g_open));

  INSERT INTO public.business_organizations(id, name) VALUES (org_a, 'SPA A'), (org_b, 'SPA B');
  INSERT INTO public.business_organization_members(organization_id, user_id, role)
    VALUES (org_a, user_a, 'owner'), (org_b, user_b, 'owner'), (org_a, user_x, 'manager');
  INSERT INTO public.business_locations(id, organization_id, name, business_category, country_code, timezone)
    VALUES (loc_a, org_a, 'A', 'spa', 'RU', 'Europe/Moscow'), (loc_b, org_b, 'B', 'spa', 'RU', 'Europe/Moscow');
  INSERT INTO public.business_programs(id, organization_id, name, status) VALUES (program_a, org_a, 'Pilot', 'active');
  INSERT INTO public.business_program_items(program_id, audio_item_id, position)
  SELECT program_a, t, ord FROM unnest(ARRAY[t_full, t_short, t_play, t_unk, t_inel, t_cond, t_exp, t_unpub, t_excl, t_play2d, t_nocite, t_hidden]) WITH ORDINALITY AS x(t, ord);
  -- Stored reference whose parent practice later becomes restricted.
  UPDATE public.practices SET catalog_visibility = 'selected_users' WHERE id = hidden_practice;
  UPDATE public.business_program_items SET excluded_at = now(), excluded_reason = 'pilot scope' WHERE audio_item_id = t_excl;
  UPDATE public.business_program_items SET gain_db = -7.5 WHERE audio_item_id = t_full;
  UPDATE public.audio_items SET status = 'draft' WHERE id = t_unpub;
  INSERT INTO public.business_pilot_allowlist(user_id, organization_id) VALUES (user_a, org_a), (user_b, org_b);

  -- NoAllowlist: organization member without pilot allowlist is denied.
  PERFORM set_config('request.jwt.claim.sub', user_x::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.business_spa_program_manifest(program_a, loc_a);
    RAISE EXCEPTION 'NoAllowlist: must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- EngineNotCallable: authenticated cannot call the rights engine or grant helper directly.
  BEGIN
    PERFORM public.business_spa_grants_valid_until('{}'::jsonb);
    RAISE EXCEPTION 'GrantHelperPrivate: must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- EligibleOnly: allowlisted owner gets exactly the ELIGIBLE playable tracks, in order.
  PERFORM set_config('request.jwt.claim.sub', user_a::text, true);
  m := public.business_spa_program_manifest(program_a, loc_a);
  IF m->>'manifest_version' <> 'business_spa_manifest_v1' THEN RAISE EXCEPTION 'Version: %', m->>'manifest_version'; END IF;
  IF jsonb_array_length(m->'items') <> 5 OR NOT (SELECT array_agg((e->>'audio_item_id')::uuid ORDER BY (e->>'position')::int) = ARRAY[t_full, t_short, t_play, t_play2d, t_nocite] FROM jsonb_array_elements(m->'items') e)
    THEN RAISE EXCEPTION 'EligibleOnly: %', m->'items'; END IF;
  -- WithheldCount: unknown, ineligible, conditional, expired grant, unpublished, hidden practice (excluded not counted).
  IF (m->>'withheld_count')::int <> 6 THEN RAISE EXCEPTION 'WithheldCount: %', m->>'withheld_count'; END IF;
  -- HiddenPractice: restricted parent practice -> no id/title/code in manifest.
  IF m::text LIKE '%' || t_hidden || '%' OR m::text LIKE '%Secret%' OR m::text LIKE '%AL-T-999999999%' THEN
    RAISE EXCEPTION 'HiddenPractice: metadata leaked'; END IF;
  IF m::text LIKE '%' || t_unk || '%' OR m::text LIKE '%' || t_inel || '%' OR m::text LIKE '%reason%' THEN
    RAISE EXCEPTION 'NoLeak: withheld track or reason codes in manifest'; END IF;

  ts := (m->>'generated_at')::timestamptz;
  IF (m->>'offline_cache_max_seconds')::int <> 604800 THEN RAISE EXCEPTION 'CacheMax: %', m->>'offline_cache_max_seconds'; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(m->'items') LOOP
    -- OfflineCap7d: open-ended grant -> exactly 7 days.
    IF (it->>'audio_item_id')::uuid = t_full AND NOT ((it->>'offline_allowed')::boolean
        AND (it->>'offline_cache_until')::timestamptz = ts + interval '7 days' AND (it->>'gain_db')::numeric = -7.5) THEN
      RAISE EXCEPTION 'OfflineCap7d: %', it; END IF;
    -- OfflineGrantBound: grant ending in 3 days caps cache at grant end.
    IF (it->>'audio_item_id')::uuid = t_short AND NOT ((it->>'offline_allowed')::boolean
        AND (it->>'offline_cache_until')::timestamptz = ts + interval '3 days') THEN
      RAISE EXCEPTION 'OfflineGrantBound: %', it; END IF;
    -- PlayOnlineOnly: offline UNKNOWN -> no offline.
    IF (it->>'audio_item_id')::uuid = t_play AND ((it->>'offline_allowed')::boolean OR it->>'offline_cache_until' IS NOT NULL) THEN
      RAISE EXCEPTION 'PlayOnlineOnly: %', it; END IF;
    -- PlaybackGrantBound: offline cannot outlive playback grant (2 days).
    IF (it->>'audio_item_id')::uuid = t_play2d AND NOT ((it->>'offline_cache_until')::timestamptz = ts + interval '2 days'
        AND (it->>'playable_until')::timestamptz = ts + interval '2 days') THEN
      RAISE EXCEPTION 'PlaybackGrantBound: %', it; END IF;
    -- OfflineNeedsCitedGrant: ELIGIBLE offline without any cited grant -> no offline (no least(cap, NULL)).
    IF (it->>'audio_item_id')::uuid = t_nocite AND ((it->>'offline_allowed')::boolean OR it->>'offline_cache_until' IS NOT NULL) THEN
      RAISE EXCEPTION 'OfflineNeedsCitedGrant: %', it; END IF;
  END LOOP;
  -- ManifestExpiry: refresh no later than earliest playback grant end, never beyond 7 days.
  IF (m->>'expires_at')::timestamptz <> ts + interval '2 days' THEN RAISE EXCEPTION 'ManifestExpiry: %', m->>'expires_at'; END IF;

  -- StableHash: same composition -> same hash; composition change -> different hash.
  m2 := public.business_spa_program_manifest(program_a, loc_a);
  IF m2->>'content_hash' <> m->>'content_hash' THEN RAISE EXCEPTION 'StableHash: differs'; END IF;

  -- LocationScope: foreign location rejected.
  BEGIN
    PERFORM public.business_spa_program_manifest(program_a, loc_b);
    RAISE EXCEPTION 'LocationScope: must fail';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- CrossOrganization: allowlisted owner of org B cannot read org A.
  PERFORM set_config('request.jwt.claim.sub', user_b::text, true);
  BEGIN
    PERFORM public.business_spa_program_manifest(program_a, loc_a);
    RAISE EXCEPTION 'CrossOrganization: must fail';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  RESET ROLE;

  -- Revocation: engine decision changes -> track disappears on next manifest (no stale grant).
  UPDATE pg_temp.stub_decisions SET decision = 'UNKNOWN' WHERE audio_item_id = t_short AND use_type = 'business_background_playback';
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  m2 := public.business_spa_program_manifest(program_a, loc_a);
  IF jsonb_array_length(m2->'items') <> 4 OR m2->>'content_hash' = m->>'content_hash' THEN RAISE EXCEPTION 'Revocation: %', m2; END IF;

  -- ReadOnly: manifest wrote nothing to rights, allowlist or usage tables.
  SELECT count(*) INTO n FROM public.music_rights_grants WHERE rightsholder_id = holder;
  IF n <> 4 THEN RAISE EXCEPTION 'ReadOnly: grants %', n; END IF;
  SELECT count(*) INTO n FROM public.business_pilot_allowlist WHERE organization_id IN (org_a, org_b);
  IF n <> 2 THEN RAISE EXCEPTION 'ReadOnly: allowlist %', n; END IF;
  SELECT count(*) INTO n FROM public.playback_usage_facts WHERE organization_id = org_a;
  IF n <> 0 THEN RAISE EXCEPTION 'ReadOnly: usage facts %', n; END IF;

  -- ArchivedProgram: archived programs deliver nothing.
  UPDATE public.business_programs SET status = 'archived' WHERE id = program_a;
  BEGIN
    PERFORM public.business_spa_program_manifest(program_a, loc_a);
    RAISE EXCEPTION 'ArchivedProgram: must fail';
  EXCEPTION WHEN check_violation THEN NULL; END;
  RAISE NOTICE 'business_spa_manifest_smoke: ok';
END $$;
ROLLBACK;
