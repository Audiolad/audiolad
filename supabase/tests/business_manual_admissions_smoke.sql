-- Synthetic fixtures only. This file is run only in the isolated scratch cluster.
INSERT INTO auth.users VALUES ('00000000-0000-0000-0000-000000000001'), ('00000000-0000-0000-0000-000000000002');
INSERT INTO authors VALUES
 ('10000000-0000-0000-0000-000000000001','Aurafon'),
 ('10000000-0000-0000-0000-000000000002','Jazz Relax'),
 ('10000000-0000-0000-0000-000000000003','Ирина Ведянина');
INSERT INTO practices(id,author_id,title) VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','SPA'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Кандидат в кофейни'),
 ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000003','Тихий альбом'),
 ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000003','Активный альбом');
INSERT INTO audio_items SELECT id, id FROM practices;
INSERT INTO business_locations VALUES
 ('30000000-0000-0000-0000-000000000001','Кафе'),
 ('30000000-0000-0000-0000-000000000002','Спа'),
 ('30000000-0000-0000-0000-000000000003','Ресторан'),
 ('30000000-0000-0000-0000-000000000004','Неизвестно');
INSERT INTO test_rights SELECT id, now() + interval '1 day' FROM audio_items;
CREATE FUNCTION public.test_assert(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
 BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF; END;
$$;
SELECT test_assert((SELECT count(*) = 0 FROM business_content_admissions), 'no seeded admissions');
SELECT test_assert(resolve_business_content_admission('20000000-0000-0000-0000-000000000002','cafe')->>'source' = 'unreviewed','candidate is unreviewed');
SELECT test_assert(resolve_business_track_eligibility('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001')->>'decision' = 'INELIGIBLE','rights alone never open access');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
SET ROLE authenticated;
SELECT set_business_content_admissions('spa','artist',ARRAY['10000000-0000-0000-0000-000000000001'::uuid],true);
SELECT set_business_content_admissions('cafe','artist',ARRAY['10000000-0000-0000-0000-000000000001'::uuid],false);
SELECT set_business_content_admissions('restaurant','artist',ARRAY['10000000-0000-0000-0000-000000000001'::uuid],false);
SELECT set_business_content_admissions('spa','artist',ARRAY['10000000-0000-0000-0000-000000000003'::uuid],true);
SELECT set_business_content_admissions('spa','album',ARRAY['20000000-0000-0000-0000-000000000004'::uuid],false);
SELECT set_business_content_admissions('cafe','album',ARRAY['20000000-0000-0000-0000-000000000004'::uuid],true);
RESET ROLE;
SELECT test_assert(resolve_business_content_admission('20000000-0000-0000-0000-000000000003','spa') = '{"allowed":true,"source":"artist"}'::jsonb,'inherit artist');
SELECT test_assert(resolve_business_content_admission('20000000-0000-0000-0000-000000000004','spa') = '{"allowed":false,"source":"album"}'::jsonb,'album exclusion wins');
SELECT test_assert(resolve_business_content_admission('20000000-0000-0000-0000-000000000004','cafe') = '{"allowed":true,"source":"album"}'::jsonb,'album inclusion without artist');
SELECT test_assert(resolve_business_track_eligibility('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002')->>'decision' = 'ELIGIBLE','SPA approved and rights active');
SELECT test_assert(resolve_business_track_eligibility('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001')->>'decision' = 'INELIGIBLE','SPA artist denied cafe');
SELECT test_assert(resolve_business_track_eligibility('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003')->>'decision' = 'INELIGIBLE','SPA artist denied restaurant');
SELECT test_assert(resolve_business_track_eligibility('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004')->>'decision' = 'INELIGIBLE','unknown category denies');
SELECT test_assert((SELECT count(*) = 1 FROM business_content_candidate_albums('30000000-0000-0000-0000-000000000001')), 'candidate pool includes only cafe approval');
SELECT test_assert((SELECT count(*) = 2 FROM business_content_candidate_albums('30000000-0000-0000-0000-000000000002')), 'candidate pool applies inherited + override decisions');
DELETE FROM test_rights WHERE audio_item_id = '20000000-0000-0000-0000-000000000001';
SELECT test_assert(resolve_business_track_eligibility('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002')->>'decision' = 'UNKNOWN','manual approval does not grant rights');
INSERT INTO test_rights VALUES ('20000000-0000-0000-0000-000000000001',now() - interval '1 day');
SELECT test_assert(resolve_business_track_eligibility('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002')->>'decision' = 'UNKNOWN','expired rights deny');
INSERT INTO music_analyzer_runs VALUES (gen_random_uuid(), '{"compatibility":{"spa":1,"cafe":1}}');
UPDATE music_analyzer_runs SET normalized_json = '{"compatibility":{"spa":0,"cafe":1},"rerun":true}';
SELECT test_assert(resolve_business_content_admission('20000000-0000-0000-0000-000000000002','cafe')->>'source' = 'unreviewed','analyzer rerun cannot approve Jazz Relax');
SELECT test_assert(resolve_business_content_admission('20000000-0000-0000-0000-000000000004','spa')->>'allowed' = 'false','rerun preserves exclusion');
SELECT test_assert((SELECT count(*) = 1 FROM list_business_content_admissions('album','Ирина','spa','allowed')),'search + inherited filter');
SELECT test_assert((SELECT count(*) = 1 FROM list_business_content_admissions('album','Ирина','spa','denied')),'search + override filter');
SELECT test_assert((SELECT count(*) = 1 FROM list_business_content_admissions('album','','cafe','allowed',0,1)),'pagination');
SELECT test_assert((SELECT count(*) = 6 FROM business_content_admission_audit WHERE actor_id = auth.uid() AND old_value IS NULL),'audit actor and inserted values');
SET ROLE authenticated;
SELECT set_business_content_admissions('spa','album',ARRAY['20000000-0000-0000-0000-000000000004'::uuid],NULL);
RESET ROLE;
SELECT test_assert(resolve_business_content_admission('20000000-0000-0000-0000-000000000004','spa')->>'source' = 'artist','reset restores inheritance');
SELECT test_assert((SELECT old_value->>'allowed' = 'false' AND new_value->'allowed' = 'null'::jsonb FROM business_content_admission_audit ORDER BY id DESC LIMIT 1),'audit before/after');
SET ROLE authenticated;
SELECT set_business_content_admissions('spa','artist',ARRAY['10000000-0000-0000-0000-000000000001'::uuid,'10000000-0000-0000-0000-000000000003'::uuid],false);
SELECT add_business_content_direction('hotel','Отели',ARRAY['отель']);
SELECT set_business_content_admissions('hotel','album',ARRAY['20000000-0000-0000-0000-000000000003'::uuid],true);
RESET ROLE;
SELECT test_assert(resolve_business_content_admission('20000000-0000-0000-0000-000000000003','hotel')->>'allowed' = 'true','new direction is data');
SELECT test_assert(resolve_business_content_admission('20000000-0000-0000-0000-000000000004','spa')->>'allowed' = 'false','bulk update inherited');
INSERT INTO business_track_eligibility_reviews(audio_item_id,decision) VALUES ('20000000-0000-0000-0000-000000000004','blocked');
SELECT test_assert(resolve_business_track_eligibility('20000000-0000-0000-0000-000000000004','30000000-0000-0000-0000-000000000001')->>'decision' = 'INELIGIBLE','track review still blocks');
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
SET ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM set_business_content_admissions('cafe','album',ARRAY['20000000-0000-0000-0000-000000000002'::uuid],true); RAISE EXCEPTION 'unauthorized allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM add_business_content_direction('bad','Недопустимо',ARRAY['bad']); RAISE EXCEPTION 'unauthorized direction'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE business_content_admissions SET allowed = true; RAISE EXCEPTION 'direct write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE business_content_admission_audit SET entity = 'forged'; RAISE EXCEPTION 'audit mutation allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE service_role;
DO $$ BEGIN
 BEGIN UPDATE business_content_admission_audit SET entity = 'forged'; RAISE EXCEPTION 'service audit mutation allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE business_content_admissions SET allowed = true; RAISE EXCEPTION 'service direct write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
DO $$ BEGIN
 BEGIN
 PERFORM set_business_content_admissions('cafe','album',ARRAY['20000000-0000-0000-0000-000000000002'::uuid,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid],true);
 RAISE EXCEPTION 'invalid bulk accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM = 'invalid bulk accepted' THEN RAISE; END IF; END;
 PERFORM test_assert(resolve_business_content_admission('20000000-0000-0000-0000-000000000002','cafe')->>'source' = 'unreviewed','bulk failure rolls back every item');
END $$;
SELECT 'business manual admissions: PASS' AS result;
