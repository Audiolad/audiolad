INSERT INTO auth.users VALUES ('11111111-1111-4111-a111-111111111111'), ('22222222-2222-4222-a222-222222222222');
INSERT INTO authors VALUES ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'Artist');
INSERT INTO practices VALUES
 ('bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'Album', 'music', 'published', 'listed', NULL),
 ('bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbb2', 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', 'Practice', 'practice', 'published', 'listed', NULL);
INSERT INTO audio_items(id, practice_id, title, duration_seconds, status, audio_path) VALUES
 ('cccccccc-cccc-4ccc-accc-cccccccccccc', 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb', 'One', 90, 'published', 'one.mp3'),
 ('cccccccc-cccc-4ccc-accc-ccccccccccc2', 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb', 'Two', 120, 'published', 'two.mp3'),
 ('cccccccc-cccc-4ccc-accc-ccccccccccc3', 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbb2', 'Other audio', 120, 'published', 'practice.mp3');
INSERT INTO business_space_admissions VALUES
 ('cafe', 'cccccccc-cccc-4ccc-accc-cccccccccccc'), ('cafe', 'cccccccc-cccc-4ccc-accc-ccccccccccc3');
INSERT INTO business_locations VALUES ('dddddddd-dddd-4ddd-addd-dddddddddddd', 'Кафе'), ('dddddddd-dddd-4ddd-addd-ddddddddddd2', 'Спа');
SET test.uid = '11111111-1111-4111-a111-111111111111';
INSERT INTO business_content_admissions(direction_key, practice_id, allowed, changed_by)
 VALUES ('cafe', 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb', true, '11111111-1111-4111-a111-111111111111');
DO $$ BEGIN
  IF business_manual_content_gate_enabled() THEN RAISE EXCEPTION 'gate default'; END IF;
  IF (resolve_business_track_eligibility('cccccccc-cccc-4ccc-accc-cccccccccccc','dddddddd-dddd-4ddd-addd-dddddddddddd')->>'decision') <> 'ELIGIBLE' THEN RAISE EXCEPTION 'gate off changed rights'; END IF;
END $$;
UPDATE public.business_runtime_flags SET enabled = true WHERE key = 'manual_content_gate';
DO $$ BEGIN
  IF (resolve_business_track_eligibility('cccccccc-cccc-4ccc-accc-cccccccccccc','dddddddd-dddd-4ddd-addd-dddddddddddd')->>'decision') <> 'INELIGIBLE' THEN RAISE EXCEPTION 'unchecked sound admitted'; END IF;
  IF business_sound_track_allowed('cccccccc-cccc-4ccc-accc-cccccccccccc','cafe') THEN RAISE EXCEPTION 'space admission granted playback'; END IF;
END $$;
CREATE TEMP TABLE public_before AS SELECT to_jsonb(a) AS row FROM audio_items a;
CREATE TEMP TABLE practices_before AS SELECT to_jsonb(p) AS row FROM practices p;
INSERT INTO business_programs VALUES ('eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee', 'cafe');
DO $$ BEGIN
  BEGIN INSERT INTO business_program_items VALUES ('eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee','cccccccc-cccc-4ccc-accc-cccccccccccc',NULL);
    RAISE EXCEPTION 'unchecked programme insertion'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

-- Ordinary authenticated users cannot see internal decisions/history or invoke admin RPCs.
SET test.uid = '22222222-2222-4222-a222-222222222222';
SET ROLE authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM business_track_sound_reviews) THEN RAISE EXCEPTION 'RLS leak'; END IF;
  BEGIN PERFORM admin_business_sound_queue(); RAISE EXCEPTION 'queue leak'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM admin_review_business_track_sound('cccccccc-cccc-4ccc-accc-cccccccccccc', 'approved', 'secret', '[]');
    RAISE EXCEPTION 'nonadmin write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO business_track_sound_reviews(audio_item_id,audio_identity) VALUES ('cccccccc-cccc-4ccc-accc-cccccccccccc','[]');
    RAISE EXCEPTION 'direct write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET test.uid = '11111111-1111-4111-a111-111111111111';
SET ROLE authenticated;
DO $$ DECLARE q jsonb; identity text; BEGIN
  q := admin_business_sound_queue();
  IF (q->>'total')::int <> 2 OR (q->'counts'->>'unchecked')::int <> 2 THEN RAISE EXCEPTION 'queue/music/default'; END IF;
  IF (SELECT count(*) FROM business_track_sound_reviews) <> 0 THEN RAISE EXCEPTION 'mass backfill'; END IF;
  IF (admin_business_sound_queue(p_space => 'spa')->>'total')::int <> 0 THEN RAISE EXCEPTION 'space filter'; END IF;
  identity := q->'rows'->0->>'audio_identity';
  BEGIN PERFORM admin_review_business_track_sound('cccccccc-cccc-4ccc-accc-cccccccccccc','both',NULL,identity);
    RAISE EXCEPTION 'invalid status allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM admin_review_business_track_sound('cccccccc-cccc-4ccc-accc-cccccccccccc','approved',NULL,identity);
  IF (admin_business_sound_queue(p_status => 'approved')->>'total')::int <> 1 THEN RAISE EXCEPTION 'status filter'; END IF;
  BEGIN UPDATE business_track_sound_reviews SET status = 'rejected'; RAISE EXCEPTION 'admin direct write'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE business_track_sound_review_history SET reason = 'rewritten'; RAISE EXCEPTION 'mutable audit'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
INSERT INTO business_program_items VALUES ('eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee','cccccccc-cccc-4ccc-accc-cccccccccccc',NULL);
DO $$ DECLARE identity text; BEGIN
  IF NOT business_sound_track_allowed('cccccccc-cccc-4ccc-accc-cccccccccccc','cafe') THEN RAISE EXCEPTION 'approved excluded'; END IF;
  IF business_sound_track_allowed('cccccccc-cccc-4ccc-accc-cccccccccccc','spa') THEN RAISE EXCEPTION 'wrong space'; END IF;
  IF (resolve_business_track_eligibility('cccccccc-cccc-4ccc-accc-cccccccccccc','dddddddd-dddd-4ddd-addd-ddddddddddd2')->>'decision') <> 'INELIGIBLE' THEN RAISE EXCEPTION 'wrong location space'; END IF;
  IF business_sound_track_allowed('cccccccc-cccc-4ccc-accc-ccccccccccc2','cafe') THEN RAISE EXCEPTION 'unchecked included'; END IF;
  IF (resolve_business_track_eligibility('cccccccc-cccc-4ccc-accc-cccccccccccc','dddddddd-dddd-4ddd-addd-dddddddddddd')->>'decision') <> 'ELIGIBLE' THEN RAISE EXCEPTION 'legal eligible'; END IF;
  PERFORM set_config('test.legal_decision', 'UNKNOWN', false);
  IF (resolve_business_track_eligibility('cccccccc-cccc-4ccc-accc-cccccccccccc','dddddddd-dddd-4ddd-addd-dddddddddddd')->>'decision') <> 'UNKNOWN' THEN RAISE EXCEPTION 'weakened legal'; END IF;
  PERFORM set_config('test.legal_decision', 'ELIGIBLE', false);
  SELECT audio_identity INTO identity FROM business_track_sound_reviews WHERE audio_item_id = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
  PERFORM admin_review_business_track_sound('cccccccc-cccc-4ccc-accc-cccccccccccc','rejected','internal only',identity);
  IF (resolve_business_track_eligibility('cccccccc-cccc-4ccc-accc-cccccccccccc','dddddddd-dddd-4ddd-addd-dddddddddddd')->>'decision') <> 'INELIGIBLE' THEN RAISE EXCEPTION 'rejection bypass'; END IF;
  IF resolve_business_track_eligibility('cccccccc-cccc-4ccc-accc-cccccccccccc','dddddddd-dddd-4ddd-addd-dddddddddddd')::text LIKE '%internal only%' THEN RAISE EXCEPTION 'reason leaked'; END IF;
  PERFORM admin_review_business_track_sound('cccccccc-cccc-4ccc-accc-cccccccccccc','approved',NULL,identity);
END $$;
-- Decisions do not change catalogue rows or trigger existing author notification machinery.
DO $$ BEGIN
  IF EXISTS ((SELECT row FROM public_before EXCEPT SELECT to_jsonb(a) FROM audio_items a)
    UNION ALL (SELECT to_jsonb(a) FROM audio_items a EXCEPT SELECT row FROM public_before)) THEN RAISE EXCEPTION 'catalogue modified'; END IF;
  IF EXISTS (SELECT row FROM practices_before EXCEPT SELECT to_jsonb(p) FROM practices p) THEN RAISE EXCEPTION 'album publicity changed'; END IF;
END $$;
UPDATE audio_items SET audio_path = audio_path, analysis = '{"rerun":true}' WHERE id = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
DO $$ BEGIN
  IF NOT business_sound_track_allowed('cccccccc-cccc-4ccc-accc-cccccccccccc','cafe') THEN RAISE EXCEPTION 'reanalysis reset'; END IF;
END $$;
UPDATE audio_items SET audio_path = 'replacement.mp3' WHERE id = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
DO $$ DECLARE old_identity text; BEGIN
  IF business_sound_track_allowed('cccccccc-cccc-4ccc-accc-cccccccccccc','cafe') THEN RAISE EXCEPTION 'replacement retained approval'; END IF;
  IF (SELECT status FROM business_track_sound_reviews WHERE audio_item_id = 'cccccccc-cccc-4ccc-accc-cccccccccccc') <> 'unchecked' THEN RAISE EXCEPTION 'replacement not reset'; END IF;
  SELECT old_audio_identity INTO old_identity FROM business_track_sound_review_history WHERE event = 'audio_replaced';
  BEGIN PERFORM admin_review_business_track_sound('cccccccc-cccc-4ccc-accc-cccccccccccc','approved',NULL,old_identity);
    RAISE EXCEPTION 'stale decision'; EXCEPTION WHEN serialization_failure THEN NULL; END;
  IF (SELECT count(*) FROM business_track_sound_review_history) <> 4 THEN RAISE EXCEPTION 'audit missing'; END IF;
  BEGIN UPDATE business_track_sound_reviews SET status = 'approved,rejected'; RAISE EXCEPTION 'constraint missing'; EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
-- Master and promoted stream pointers also reset approval. Identical pointers and analysis do not.
DO $$ DECLARE identity text; BEGIN
  SELECT business_sound_audio_identity(a) INTO identity FROM audio_items a WHERE id = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
  PERFORM admin_review_business_track_sound('cccccccc-cccc-4ccc-accc-cccccccccccc','approved',NULL,identity);
  UPDATE audio_items SET desired_music_master_asset_id = 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee' WHERE id = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
  IF business_sound_track_allowed('cccccccc-cccc-4ccc-accc-cccccccccccc','cafe') THEN RAISE EXCEPTION 'master reset missing'; END IF;
  SELECT business_sound_audio_identity(a) INTO identity FROM audio_items a WHERE id = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
  PERFORM admin_review_business_track_sound('cccccccc-cccc-4ccc-accc-cccccccccccc','approved',NULL,identity);
  UPDATE audio_items SET active_music_delivery_asset_id = 'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeee2' WHERE id = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
  IF business_sound_track_allowed('cccccccc-cccc-4ccc-accc-cccccccccccc','cafe') THEN RAISE EXCEPTION 'stream reset missing'; END IF;
  SELECT business_sound_audio_identity(a) INTO identity FROM audio_items a WHERE id = 'cccccccc-cccc-4ccc-accc-ccccccccccc2';
  PERFORM admin_review_business_track_sound('cccccccc-cccc-4ccc-accc-ccccccccccc2','approved',NULL,identity);
  IF NOT business_sound_track_allowed('cccccccc-cccc-4ccc-accc-ccccccccccc2','cafe') THEN RAISE EXCEPTION 'album admission did not cover approved sibling'; END IF;
  IF business_sound_track_allowed('cccccccc-cccc-4ccc-accc-ccccccccccc2','spa') THEN RAISE EXCEPTION 'sibling crossed direction'; END IF;
END $$;
SET test.uid = '22222222-2222-4222-a222-222222222222';
SET ROLE authenticated;
DO $$ BEGIN
  IF coalesce(current_setting('test.single_user', true), '') <> 'on' THEN
    IF EXISTS (SELECT 1 FROM business_track_sound_reviews) OR EXISTS (SELECT 1 FROM business_track_sound_review_history) THEN RAISE EXCEPTION 'internal data leak'; END IF;
  END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid IN ('business_track_sound_reviews'::regclass,
    'business_track_sound_review_history'::regclass) AND NOT relrowsecurity) THEN RAISE EXCEPTION 'RLS disabled'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
    AND policyname IN ('business_sound_admin_read','business_sound_history_admin_read')
    AND qual LIKE '%admin_panel.access%' AND qual LIKE '%author_products.moderate%') <> 2 THEN RAISE EXCEPTION 'RLS policy missing'; END IF;
  IF has_table_privilege('anon','business_track_sound_reviews','SELECT')
    OR has_table_privilege('authenticated','business_track_sound_review_history','UPDATE')
    OR has_table_privilege('service_role','business_track_sound_reviews','UPDATE') THEN RAISE EXCEPTION 'ACL leak'; END IF;
END $$;
-- Sound decisions/history must not block the regular catalogue's deletion flow.
DELETE FROM audio_items WHERE id = 'cccccccc-cccc-4ccc-accc-ccccccccccc2';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM business_track_sound_reviews WHERE audio_item_id = 'cccccccc-cccc-4ccc-accc-ccccccccccc2') THEN RAISE EXCEPTION 'deleted catalogue track lost audit decision'; END IF;
END $$;
SELECT 'SOUND_REVIEW_OK';
