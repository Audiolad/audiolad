INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
INSERT INTO authors VALUES ('10000000-0000-0000-0000-000000000001','Jazz'), ('10000000-0000-0000-0000-000000000002','Spa');
INSERT INTO practices(id,author_id,title) VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Cafe album'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Spa album');
INSERT INTO audio_items SELECT id, id FROM practices;
INSERT INTO business_locations VALUES
 ('30000000-0000-0000-0000-000000000001','Кафе'),
 ('30000000-0000-0000-0000-000000000002','Спа'),
 ('30000000-0000-0000-0000-000000000003','Ресторан'),
 ('30000000-0000-0000-0000-000000000004','Фитнес-клуб');
INSERT INTO test_rights SELECT id, now() + interval '1 day' FROM audio_items;
CREATE FUNCTION public.test_assert(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
 BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; END;
$$;
SELECT test_assert((SELECT array_agg(key ORDER BY sort_order) FROM business_content_directions WHERE active) = ARRAY['cafe','spa','retail','fitness'], 'sector order');
SELECT test_assert((SELECT name FROM business_content_directions WHERE key = 'cafe') = 'Кафе, кофейни, рестораны', 'cafe name');
SELECT test_assert((SELECT name FROM business_content_directions WHERE key = 'spa') = 'Спа и массаж', 'spa name');
SELECT test_assert(NOT (SELECT active FROM business_content_directions WHERE key = 'restaurant'), 'restaurant inactive');
SELECT test_assert((SELECT direction_key FROM business_content_categories WHERE category = 'ресторан') = 'cafe', 'restaurant category is cafe');
SELECT test_assert((SELECT direction_key FROM business_content_categories WHERE category = 'массаж') = 'spa', 'massage is spa');
SELECT test_assert((SELECT direction_key FROM business_content_categories WHERE category = 'барбершоп') = 'retail', 'barber is retail');
SELECT test_assert((SELECT direction_key FROM business_content_categories WHERE category = 'фитнес-клуб') = 'fitness', 'fitness club');
SELECT test_assert((SELECT count(*) = 0 FROM business_content_admissions WHERE direction_key IN ('retail','fitness')), 'no seeded retail or fitness decisions');
UPDATE public.business_runtime_flags SET enabled = true WHERE key = 'manual_content_gate';
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SET ROLE authenticated;
SELECT set_business_content_admissions('cafe','artist',ARRAY['10000000-0000-0000-0000-000000000001'::uuid],true);
SELECT set_business_content_admissions('spa','artist',ARRAY['10000000-0000-0000-0000-000000000002'::uuid],true);
RESET ROLE;
SELECT test_assert(resolve_business_track_eligibility('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001')->>'decision' = 'ELIGIBLE', 'cafe venue stays eligible');
SELECT test_assert(resolve_business_track_eligibility('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002')->>'decision' = 'ELIGIBLE', 'spa venue stays eligible');
SELECT test_assert(resolve_business_track_eligibility('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003')->>'decision' = 'ELIGIBLE', 'restaurant venue resolves to cafe');
SELECT test_assert(resolve_business_track_eligibility('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003')->>'content_direction' = 'cafe', 'restaurant direction key is cafe');
SELECT test_assert(resolve_business_track_eligibility('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004')->>'decision' = 'INELIGIBLE', 'fitness has no decision');
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM set_business_content_admissions('restaurant','artist',ARRAY['10000000-0000-0000-0000-000000000001'::uuid],true); RAISE EXCEPTION 'inactive direction allowed'; EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'inactive direction allowed' THEN RAISE; END IF; END;
END $$;
SELECT set_business_artist_admission_hidden('10000000-0000-0000-0000-000000000001', true);
SELECT set_business_artist_admission_hidden('10000000-0000-0000-0000-000000000001', true);
RESET ROLE;
SELECT test_assert((SELECT count(*) = 1 FROM business_admission_hidden_artists), 'artist hidden');
SELECT test_assert((SELECT count(*) = 1 FROM business_admission_hidden_artists_audit), 'hide audit is idempotent');
SET ROLE authenticated;
SELECT set_business_artist_admission_hidden('10000000-0000-0000-0000-000000000001', false);
RESET ROLE;
SELECT test_assert((SELECT count(*) = 0 FROM business_admission_hidden_artists), 'artist returned');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM set_business_artist_admission_hidden('10000000-0000-0000-0000-000000000002', true); RAISE EXCEPTION 'unauthorized hide'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT 'business four sectors: PASS';
