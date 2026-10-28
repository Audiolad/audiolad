-- Runs after business_track_sound_reviews_smoke.sql. Auto is off unless Sergey enables it.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.business_artist_sound_auto) THEN RAISE EXCEPTION 'auto seeded'; END IF;
  IF public.business_artist_sound_auto_enabled('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa') THEN RAISE EXCEPTION 'auto default on'; END IF;
END $$;
SET test.uid = '22222222-2222-4222-a222-222222222222';
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM set_business_artist_sound_auto('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', true);
    RAISE EXCEPTION 'nonadmin auto'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF coalesce(current_setting('test.single_user', true), '') <> 'on'
    AND EXISTS (SELECT 1 FROM business_artist_sound_auto) THEN RAISE EXCEPTION 'auto rls leak'; END IF;
END $$;
RESET ROLE;
SET test.uid = '11111111-1111-4111-a111-111111111111';
SELECT set_business_artist_sound_auto('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', true);
SELECT set_business_artist_sound_auto('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', true);
DO $$ DECLARE identity text; decision text; q jsonb; BEGIN
  IF (SELECT count(*) FROM business_artist_sound_auto_audit) <> 1 THEN RAISE EXCEPTION 'auto audit not idempotent'; END IF;
  IF NOT business_sound_track_allowed('cccccccc-cccc-4ccc-accc-cccccccccccc', 'cafe') THEN RAISE EXCEPTION 'auto on not allowed'; END IF;
  decision := resolve_business_track_eligibility('cccccccc-cccc-4ccc-accc-cccccccccccc','dddddddd-dddd-4ddd-addd-dddddddddddd')->>'decision';
  IF decision <> 'ELIGIBLE' THEN RAISE EXCEPTION 'auto on not eligible: %', decision; END IF;
  SELECT business_sound_audio_identity(a) INTO identity FROM audio_items a WHERE id = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
  PERFORM admin_review_business_track_sound('cccccccc-cccc-4ccc-accc-cccccccccccc','rejected','явный отказ',identity);
  IF business_sound_track_allowed('cccccccc-cccc-4ccc-accc-cccccccccccc', 'cafe') THEN RAISE EXCEPTION 'explicit reject lost'; END IF;
  IF (resolve_business_track_eligibility('cccccccc-cccc-4ccc-accc-cccccccccccc','dddddddd-dddd-4ddd-addd-dddddddddddd')->>'decision') <> 'INELIGIBLE' THEN RAISE EXCEPTION 'explicit reject still eligible'; END IF;
  UPDATE business_content_admissions SET allowed = false WHERE practice_id = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
  IF business_sound_track_allowed('cccccccc-cccc-4ccc-accc-ccccccccccc2', 'cafe') THEN RAISE EXCEPTION 'direction skipped'; END IF;
  IF (resolve_business_track_eligibility('cccccccc-cccc-4ccc-accc-ccccccccccc2','dddddddd-dddd-4ddd-addd-dddddddddddd')->>'decision') <> 'INELIGIBLE' THEN RAISE EXCEPTION 'direction still eligible'; END IF;
  UPDATE business_content_admissions SET allowed = true WHERE practice_id = 'bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
  PERFORM set_business_artist_sound_auto('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', false);
  PERFORM admin_review_business_track_sound('cccccccc-cccc-4ccc-accc-cccccccccccc','unchecked',NULL,identity);
  IF business_sound_track_allowed('cccccccc-cccc-4ccc-accc-cccccccccccc', 'cafe') THEN RAISE EXCEPTION 'auto off skipped review'; END IF;
  IF (resolve_business_track_eligibility('cccccccc-cccc-4ccc-accc-cccccccccccc','dddddddd-dddd-4ddd-addd-dddddddddddd')->>'decision') <> 'INELIGIBLE' THEN RAISE EXCEPTION 'auto off still eligible'; END IF;
  PERFORM admin_review_business_track_sound('cccccccc-cccc-4ccc-accc-cccccccccccc','approved',NULL,identity);
  IF NOT business_sound_track_allowed('cccccccc-cccc-4ccc-accc-cccccccccccc', 'cafe') THEN RAISE EXCEPTION 'manual approval lost'; END IF;
  PERFORM set_business_artist_sound_auto('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', true);
  q := admin_business_sound_queue();
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(q->'rows') row WHERE row->>'id' = 'cccccccc-cccc-4ccc-accc-cccccccccccc' AND (row->>'sound_auto')::boolean) THEN
    RAISE EXCEPTION 'queue auto label missing';
  END IF;
  PERFORM admin_review_business_track_sound('cccccccc-cccc-4ccc-accc-cccccccccccc','rejected',NULL,identity);
  q := admin_business_sound_queue();
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(q->'rows') row WHERE row->>'id' = 'cccccccc-cccc-4ccc-accc-cccccccccccc' AND (row->>'sound_auto')::boolean) THEN
    RAISE EXCEPTION 'rejected still auto';
  END IF;
END $$;
SELECT 'ARTIST_SOUND_AUTO_OK';
