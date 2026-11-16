#!/usr/bin/env python3
"""Real A+C migrations in a disposable PG17 cluster. No DB URL or TCP.
Rights/playability are explicitly stubbed; real candidate, sound and passport SQL.
"""
from pathlib import Path
import os
import re
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
migrations = root / 'supabase/migrations'
pg = Path(os.environ.get('PG_BIN') or ([str(p.parent) for p in sorted(Path('/usr/lib/postgresql').glob('*/bin/postgres')) if '/17/' in str(p)] or [str(p.parent) for p in sorted(Path('/usr/lib/postgresql').glob('*/bin/postgres'))] or ['/usr/lib/postgresql/17/bin'])[0])
# Reuse A's schema and original read policies without executing its test runner.
a_path = root / 'scripts/business-only-access-isolated.py'
a = {'__file__': str(a_path)}
exec(compile(a_path.read_text().split("fixtures = ''")[0], str(a_path), 'exec'), a)
stubs, base = a['stubs'], a['base']

def source(name):
    return (migrations / name).read_text()

def fn(file, name):
    text = source(file)
    match = re.search(r'CREATE (?:OR REPLACE )?FUNCTION public\.' + name + r'\s*\(', text, re.I)
    end = text.index('$$;', match.start()) + 3
    return text[match.start():end].replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION', 1)

extra = """
CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY);
CREATE TABLE IF NOT EXISTS authors(id uuid PRIMARY KEY, name text, slug text, access_status text);
ALTER TABLE authors ADD COLUMN IF NOT EXISTS name text, ADD COLUMN IF NOT EXISTS slug text, ADD COLUMN IF NOT EXISTS access_status text;
ALTER TABLE author_members ADD COLUMN IF NOT EXISTS role text DEFAULT 'owner';
ALTER TABLE practices ADD COLUMN IF NOT EXISTS title text, ADD COLUMN IF NOT EXISTS product_kind text, ADD COLUMN IF NOT EXISTS music_usage_permission text, ADD COLUMN IF NOT EXISTS format text,
 ADD COLUMN IF NOT EXISTS currency text, ADD COLUMN IF NOT EXISTS duration_minutes integer, ADD COLUMN IF NOT EXISTS audio_url text,
 ADD COLUMN IF NOT EXISTS moderation_status text DEFAULT 'approved', ADD COLUMN IF NOT EXISTS moderation_attempt integer DEFAULT 0;
ALTER TABLE audio_items ADD COLUMN IF NOT EXISTS title text, ADD COLUMN IF NOT EXISTS duration_seconds integer, ADD COLUMN IF NOT EXISTS audio_path text,
 ADD COLUMN IF NOT EXISTS desired_music_master_asset_id uuid, ADD COLUMN IF NOT EXISTS active_music_delivery_asset_id uuid,
 ADD COLUMN IF NOT EXISTS position integer DEFAULT 0, ADD COLUMN IF NOT EXISTS updated_at timestamptz, ADD COLUMN IF NOT EXISTS analysis jsonb,
 ADD COLUMN IF NOT EXISTS music_track_code text;
ALTER TABLE music_audio_assets ADD COLUMN IF NOT EXISTS asset_role text, ADD COLUMN IF NOT EXISTS lifecycle_state text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS contact_email text, ADD COLUMN IF NOT EXISTS email text;
CREATE TABLE IF NOT EXISTS business_space_admissions(space_id text, audio_item_id uuid, PRIMARY KEY(space_id,audio_item_id));
CREATE TABLE IF NOT EXISTS business_locations(id uuid PRIMARY KEY,business_category text);
CREATE TABLE IF NOT EXISTS business_programs(id uuid PRIMARY KEY,kind text);
CREATE TABLE IF NOT EXISTS business_program_items(program_id uuid,audio_item_id uuid,excluded_at timestamptz);
CREATE TABLE IF NOT EXISTS business_track_eligibility_reviews(id uuid PRIMARY KEY, audio_item_id uuid,decision text,created_at timestamptz);
CREATE FUNCTION public.resolve_business_track_eligibility_v1(uuid,uuid,uuid DEFAULT NULL,text DEFAULT 'business_background_playback',timestamptz DEFAULT now())
 RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"decision":"ELIGIBLE","reason_codes":[]}'::jsonb $$;
CREATE TABLE IF NOT EXISTS starter_practices(practice_id uuid,is_active boolean);
CREATE FUNCTION author_members_can_mutate(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION actor_can_bypass_product_moderation(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION author_access_allows_content_mutations(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION author_access_allows_paid_products(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION assert_practice_moderation_ready(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
-- music_item_effective_publish_duration_seconds: real definition comes from A's base.
-- music_item_has_validated_active_delivery: real definition comes from A's base.
CREATE FUNCTION record_author_support_mutation_audit(uuid,text,text,text,jsonb) RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE TABLE IF NOT EXISTS practice_moderation_events(id uuid DEFAULT gen_random_uuid(),practice_id uuid,author_id uuid,action text,
 from_status text,to_status text,from_moderation_status text,to_moderation_status text,comment text,actor_user_id uuid,
 actor_type text,attempt integer,metadata jsonb,created_at timestamptz);
CREATE TABLE IF NOT EXISTS practice_moderation_email_outbox(event_id uuid,practice_id uuid,author_id uuid,action text,
 recipient_role text,recipient_user_id uuid,recipient_email text,context jsonb,status text,error_code text,error_message text);
CREATE TABLE IF NOT EXISTS scheduled_publish_notification_outbox(id uuid DEFAULT gen_random_uuid(),practice_id uuid UNIQUE,
 author_id uuid,practice_slug text,author_slug text,catalog_visibility text,is_catalog_listed boolean,
 published_at timestamptz,prior_public_count integer);
-- Both admin permissions for the C sound/RBAC fixtures.
CREATE OR REPLACE FUNCTION has_platform_permission(u uuid,p text) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT coalesce(u='00000000-0000-0000-0000-000000000006',false) $$;
GRANT SELECT ON authors TO authenticated;
"""
# A's base contains profiles for its order fixtures.
if 'CREATE TABLE public.profiles' not in stubs + base and 'CREATE TABLE profiles' not in stubs + base:
    extra = 'CREATE TABLE profiles(id uuid);\n' + extra
pre = [stubs, base, extra, source('20270310120000_business_only_practices.sql'), source('20270310120100_business_only_practices_validate.sql'),
       source('20270131120000_business_manual_admissions.sql'), source('20270201120000_business_track_sound_reviews.sql'),
       source('20270202120000_business_artist_sound_auto.sql')]
for file, name in [('20261027120000_product_published_email_context_canonical.sql','log_practice_moderation_event'),
                   ('20261212120000_scheduled_publish_notification_outbox.sql','claim_due_scheduled_practice_publications'),
                   ('20261007180000_music_publish_playable_audio.sql','publish_audio_product')]:
    pre.append(fn(file,name))
fixtures = """
SET test.uid='00000000-0000-0000-0000-000000000006';
INSERT INTO auth.users VALUES('00000000-0000-0000-0000-000000000006');
INSERT INTO authors(id,name,slug,access_status) VALUES('00000000-0000-0000-0000-000000000500','Артист','artist','active') ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, slug=EXCLUDED.slug, access_status=EXCLUDED.access_status;
INSERT INTO author_members(author_id,user_id,role) VALUES('00000000-0000-0000-0000-000000000500','00000000-0000-0000-0000-000000000006','owner');
INSERT INTO business_locations VALUES('00000000-0000-0000-0000-000000000700','cafe');
INSERT INTO practices(id,title,product_kind,status,catalog_visibility,is_catalog_listed)
 SELECT ('00000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'Обычный '||n,'music',
 CASE WHEN n=104 THEN 'draft' ELSE 'published' END,
 CASE WHEN n=102 THEN 'unlisted' WHEN n=103 THEN 'selected_users' ELSE 'listed' END, n NOT IN (102,103)
 FROM generate_series(101,106) n;
UPDATE practices SET deleted_at=now() WHERE id='00000000-0000-0000-0000-000000000105';
INSERT INTO audio_items(id,practice_id,title,audio_path,status)
 SELECT id,id,'Трек','legacy.mp3','published' FROM practices;
INSERT INTO business_content_admissions(direction_key,author_id,allowed,changed_by)
 VALUES('cafe','00000000-0000-0000-0000-000000000500',true,auth.uid());
INSERT INTO business_artist_sound_auto(author_id,enabled) VALUES('00000000-0000-0000-0000-000000000500',true);
CREATE TABLE before_c AS SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') AS value
 FROM business_content_candidate_albums('00000000-0000-0000-0000-000000000700') x;
ALTER TABLE practices ADD COLUMN IF NOT EXISTS cover_url text, ADD COLUMN IF NOT EXISTS cover_image jsonb;
ALTER TABLE audio_items ADD COLUMN IF NOT EXISTS cover_url text, ADD COLUMN IF NOT EXISTS cover_image jsonb;
CREATE TABLE IF NOT EXISTS publication_gallery_slides(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), publication_id uuid NOT NULL, image_url text NOT NULL, image_manifest jsonb NOT NULL);
CREATE TABLE sound_before_c AS SELECT id,business_sound_track_allowed(id,'cafe') AS allowed FROM audio_items;
CREATE TABLE resolver_before_c AS SELECT id,resolve_business_track_eligibility(id,'00000000-0000-0000-0000-000000000700') AS v FROM audio_items;
"""
checks = """
SELECT check_test((SELECT value::text FROM before_c)=(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]')::text
 FROM business_content_candidate_albums('00000000-0000-0000-0000-000000000700') x),'zero-business candidate byte-equivalent JSON');
SELECT check_test(NOT EXISTS(SELECT 1 FROM sound_before_c WHERE allowed IS DISTINCT FROM business_sound_track_allowed(id,'cafe')),'ordinary sound unchanged');
SET ROLE authenticated;
SELECT set_config('test.album',admin_create_business_album('00000000-0000-0000-0000-000000000500','Закрытый альбом')::text,false);
RESET ROLE;
SELECT check_test((SELECT business_only AND catalog_visibility='selected_users' AND NOT is_catalog_listed AND status='draft'
 FROM practices WHERE id=current_setting('test.album')::uuid),'atomic closed draft');
INSERT INTO audio_items(id,practice_id,title,status,audio_path) VALUES('00000000-0000-0000-0000-000000000801',current_setting('test.album')::uuid,'Закрытый трек','draft','master.mp3');
INSERT INTO music_audio_assets(id,audio_item_id,asset_role,lifecycle_state) VALUES('00000000-0000-0000-0000-000000000901','00000000-0000-0000-0000-000000000801','master','verified');
UPDATE audio_items SET desired_music_master_asset_id='00000000-0000-0000-0000-000000000901' WHERE id='00000000-0000-0000-0000-000000000801';
SELECT expect_error(format('UPDATE practices SET cover_url=%L WHERE id=%L','c.webp',current_setting('test.album')),'business_only_cover_upload_blocked');
SELECT expect_error(format('UPDATE practices SET cover_image=%L WHERE id=%L','{}',current_setting('test.album')),'business_only_cover_upload_blocked');
SELECT expect_error('UPDATE audio_items SET cover_url=''t.webp'' WHERE id=''00000000-0000-0000-0000-000000000801''','business_only_cover_upload_blocked');
SELECT expect_error('UPDATE audio_items SET cover_image=''{}'' WHERE id=''00000000-0000-0000-0000-000000000801''','business_only_cover_upload_blocked');
SELECT expect_error(format('INSERT INTO publication_gallery_slides(publication_id,image_url,image_manifest) VALUES(%L,%L,%L)',current_setting('test.album'),'g.webp','{}'),'business_only_cover_upload_blocked');
UPDATE practices SET cover_url=NULL,cover_image=NULL WHERE id=current_setting('test.album')::uuid;
UPDATE practices SET cover_url='ordinary.webp' WHERE id='00000000-0000-0000-0000-000000000101';
UPDATE audio_items SET cover_url='ordinary-track.webp' WHERE practice_id='00000000-0000-0000-0000-000000000101';
INSERT INTO publication_gallery_slides(publication_id,image_url,image_manifest) VALUES('00000000-0000-0000-0000-000000000101','ordinary-g.webp','{}');
SELECT check_test((SELECT cover_url='ordinary.webp' FROM practices WHERE id='00000000-0000-0000-0000-000000000101') AND EXISTS(SELECT 1 FROM publication_gallery_slides WHERE publication_id='00000000-0000-0000-0000-000000000101'),'ordinary covers and gallery unaffected');
SELECT publish_audio_product(current_setting('test.album')::uuid);
SELECT check_test((SELECT catalog_visibility='selected_users' AND NOT is_catalog_listed FROM practices WHERE id=current_setting('test.album')::uuid),'publish keeps selected_users');
SELECT admin_upsert_business_track_passport('00000000-0000-0000-0000-000000000801','{}');
SELECT check_test(NOT business_sound_track_allowed('00000000-0000-0000-0000-000000000801','cafe'),'draft passport sound blocked');
SELECT check_test(NOT EXISTS(SELECT 1 FROM resolver_before_c b WHERE b.v IS DISTINCT FROM resolve_business_track_eligibility(b.id,'00000000-0000-0000-0000-000000000700')),'ordinary resolver unchanged');
SELECT check_test((SELECT v->>'decision'='INELIGIBLE' AND v->'reason_codes' ? 'BUSINESS_TRACK_PASSPORT_REQUIRED' FROM (SELECT resolve_business_track_eligibility('00000000-0000-0000-0000-000000000801','00000000-0000-0000-0000-000000000700') v) x),'draft passport resolver ineligible');
SELECT check_test(NOT EXISTS(SELECT 1 FROM business_content_candidate_albums('00000000-0000-0000-0000-000000000700') WHERE id=current_setting('test.album')::uuid),'draft not candidate');
DO $$ DECLARE full_evidence jsonb; k text; BEGIN
 full_evidence := jsonb_build_object('al_code','AL-T-test','generator_tool','Suno','generator_plan','Pro',
 'generated_at',now(),'generation_ref','manual-generation-id','terms_snapshot_ref','archive/terms',
 'human_contribution','human','human_contribution_details','Человек выбрал и мастерил запись',
 'source_sha256',repeat('a',64),'master_sha256',repeat('b',64),'fingerprint_sha256',repeat('c',64),
 'shazam_checked_at',now(),'shazam_result','not_found','acoustid_checked_at',now(),'acoustid_result','not_found',
 'never_published_checked_at',now(),'evidence_inventory_sha256',repeat('d',64));
 PERFORM set_config('test.evidence',full_evidence::text,false);
 FOR k IN SELECT jsonb_object_keys(full_evidence) LOOP
   PERFORM admin_upsert_business_track_passport('00000000-0000-0000-0000-000000000801',full_evidence||jsonb_build_object(k,NULL));
   PERFORM record_business_master_hash('00000000-0000-0000-0000-000000000801','00000000-0000-0000-0000-000000000901',repeat('b',64),auth.uid());
   PERFORM expect_error('SELECT admin_approve_business_track_passport(''00000000-0000-0000-0000-000000000801'')',k);
 END LOOP;
 PERFORM admin_upsert_business_track_passport('00000000-0000-0000-0000-000000000801',full_evidence);
END $$;
DO $$ DECLARE k text; BEGIN
 FOREACH k IN ARRAY ARRAY['stored_master_asset_id','stored_master_sha256','stored_master_sha256_verified_at'] LOOP
  PERFORM record_business_master_hash('00000000-0000-0000-0000-000000000801','00000000-0000-0000-0000-000000000901',repeat('b',64),auth.uid());
  EXECUTE format('UPDATE business_track_passports SET %I=NULL',k);
  PERFORM expect_error('SELECT admin_approve_business_track_passport(''00000000-0000-0000-0000-000000000801'')',k);
 END LOOP;
END $$;
SELECT record_business_master_hash('00000000-0000-0000-0000-000000000801','00000000-0000-0000-0000-000000000901',repeat('e',64),auth.uid());
SELECT expect_error('SELECT admin_approve_business_track_passport(''00000000-0000-0000-0000-000000000801'')','passport_hash_mismatch');
SELECT record_business_master_hash('00000000-0000-0000-0000-000000000801','00000000-0000-0000-0000-000000000901',repeat('b',64),auth.uid());
SELECT admin_upsert_business_track_passport('00000000-0000-0000-0000-000000000801','{"shazam_result":"match"}');
SELECT expect_error('SELECT admin_approve_business_track_passport(''00000000-0000-0000-0000-000000000801'')','passport_fingerprint_match');
SELECT admin_upsert_business_track_passport('00000000-0000-0000-0000-000000000801','{"shazam_result":"not_found","acoustid_result":"match"}');
SELECT expect_error('SELECT admin_approve_business_track_passport(''00000000-0000-0000-0000-000000000801'')','passport_fingerprint_match');
SELECT admin_upsert_business_track_passport('00000000-0000-0000-0000-000000000801',current_setting('test.evidence')::jsonb);
SET ROLE authenticated;
SELECT admin_approve_business_track_passport('00000000-0000-0000-0000-000000000801');
RESET ROLE;
SELECT check_test(business_sound_track_allowed('00000000-0000-0000-0000-000000000801','cafe'),'approved sound allowed');
SELECT check_test(NOT (resolve_business_track_eligibility('00000000-0000-0000-0000-000000000801','00000000-0000-0000-0000-000000000700')->'reason_codes' ? 'BUSINESS_TRACK_PASSPORT_REQUIRED'),'approved passport passes resolver gate');
SELECT check_test(EXISTS(SELECT 1 FROM business_content_candidate_albums('00000000-0000-0000-0000-000000000700') WHERE id=current_setting('test.album')::uuid),'approved candidate');
SELECT check_test((admin_business_sound_queue()->>'total')::integer>0,'queue accepts closed approved track');
SELECT admin_review_business_track_sound('00000000-0000-0000-0000-000000000801','approved','Проверено',business_sound_audio_identity((SELECT a FROM audio_items a WHERE id='00000000-0000-0000-0000-000000000801')));
SELECT expect_error('SELECT admin_upsert_business_track_passport(''00000000-0000-0000-0000-000000000801'',''{}'')','passport_draft_required');
SELECT log_practice_moderation_event(current_setting('test.album')::uuid,'00000000-0000-0000-0000-000000000500','approved_and_published','draft','published',NULL,'approved',NULL,auth.uid(),'admin',1);
SELECT check_test(NOT EXISTS(SELECT 1 FROM practice_moderation_email_outbox),'no closed publication email');
SELECT log_practice_moderation_event('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000500','approved_and_published','draft','published',NULL,'approved',NULL,auth.uid(),'admin',1);
SELECT check_test((SELECT count(*)=1 FROM practice_moderation_email_outbox),'ordinary publication email unchanged');
UPDATE practices SET published_at=NULL,scheduled_publish_at=now()-interval '1 minute' WHERE id=current_setting('test.album')::uuid;
UPDATE practices SET published_at=NULL,scheduled_publish_at=now()-interval '1 minute' WHERE id='00000000-0000-0000-0000-000000000101';
SELECT claim_due_scheduled_practice_publications();
SELECT check_test((SELECT count(*)=1 FROM scheduled_publish_notification_outbox WHERE practice_id='00000000-0000-0000-0000-000000000101'),'ordinary schedule outbox retained');
SELECT check_test(NOT EXISTS(SELECT 1 FROM scheduled_publish_notification_outbox WHERE practice_id=current_setting('test.album')::uuid),'no closed scheduled release outbox');
SELECT admin_revoke_business_track_passport('00000000-0000-0000-0000-000000000801');
SELECT check_test(NOT business_sound_track_allowed('00000000-0000-0000-0000-000000000801','cafe'),'revocation immediate');
SELECT check_test(resolve_business_track_eligibility('00000000-0000-0000-0000-000000000801','00000000-0000-0000-0000-000000000700')->'reason_codes' ? 'BUSINESS_TRACK_PASSPORT_REQUIRED','revoked passport resolver ineligible');
UPDATE audio_items SET audio_path='replacement.mp3' WHERE id='00000000-0000-0000-0000-000000000801';
SELECT check_test((SELECT status='draft' AND stored_master_sha256 IS NULL FROM business_track_passports),'replacement invalidates verification');
SET test.uid='00000000-0000-0000-0000-000000000002';
SET ROLE authenticated;
SELECT expect_error('SELECT admin_create_business_album(''00000000-0000-0000-0000-000000000500'',''No'')','permission_denied');
SELECT expect_error('SELECT admin_upsert_business_track_passport(''00000000-0000-0000-0000-000000000801'',''{}'')','permission_denied');
SELECT expect_error('SELECT admin_approve_business_track_passport(''00000000-0000-0000-0000-000000000801'')','permission_denied');
SELECT expect_error('SELECT admin_revoke_business_track_passport(''00000000-0000-0000-0000-000000000801'')','permission_denied');
RESET ROLE;
SELECT check_test(NOT has_table_privilege('authenticated','business_track_passports','SELECT'),'no client passport grants');
SELECT check_test(NOT has_function_privilege('authenticated','record_business_master_hash(uuid,uuid,text,uuid)','EXECUTE'),'no client hash write RPC');
SELECT check_test((SELECT relrowsecurity FROM pg_class WHERE oid='business_track_passports'::regclass),'passport RLS enabled');
SELECT check_test(NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='business_track_passports'::regclass),'no client policies');
SELECT 'PASSPORTS_OK';
"""

shazam_checks = """
RESET ROLE;
CREATE FUNCTION pg_temp.seg(matched boolean, err text DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('label','t30','offset_seconds',30,'duration_seconds',15,'matched',matched,'error',err,
  'title',CASE WHEN matched THEN 'Чужая песня' END,'artist',CASE WHEN matched THEN 'Кто-то' END,'timeskew',0.0002,'frequencyskew',0.0001) $$;
INSERT INTO audio_items(id,practice_id,title,status,audio_path,music_track_code) VALUES('00000000-0000-0000-0000-000000000802',current_setting('test.album')::uuid,'Шазам трек','draft','m2.mp3','AL-T-000000802');
INSERT INTO music_audio_assets(id,audio_item_id,asset_role,lifecycle_state) VALUES('00000000-0000-0000-0000-000000000902','00000000-0000-0000-0000-000000000802','master','uploading');
UPDATE audio_items SET desired_music_master_asset_id='00000000-0000-0000-0000-000000000902' WHERE id='00000000-0000-0000-0000-000000000802';
SELECT check_test(NOT EXISTS(SELECT 1 FROM business_passport_shazam_checks WHERE audio_item_id='00000000-0000-0000-0000-000000000802'),'shazam: unverified master not queued');
UPDATE music_audio_assets SET lifecycle_state='verified' WHERE id='00000000-0000-0000-0000-000000000902';
SELECT check_test((SELECT count(*)=1 AND bool_and(status='pending' AND reason='master_verified') FROM business_passport_shazam_checks WHERE audio_item_id='00000000-0000-0000-0000-000000000802'),'shazam: verified master queued once');
SELECT check_test(enqueue_business_shazam_check('00000000-0000-0000-0000-000000000802','autofill')=(SELECT id FROM business_passport_shazam_checks WHERE audio_item_id='00000000-0000-0000-0000-000000000802'),'shazam: autofill reuses active job');
SELECT check_test(enqueue_business_shazam_check('00000000-0000-0000-0000-000000000101','autofill') IS NULL,'shazam: ordinary track never queued');
SELECT check_test((SELECT count(*)=1 FROM claim_business_shazam_check('w1')),'shazam: claim');
SELECT check_test((SELECT count(*)=0 FROM claim_business_shazam_check('w2')),'shazam: one claim at a time');
SELECT set_config('test.job',(SELECT id::text FROM business_passport_shazam_checks WHERE audio_item_id='00000000-0000-0000-0000-000000000802' AND status='running'),false);
SELECT expect_error(format('SELECT complete_business_shazam_check(%L,%L,%L,%L,%L,NULL)',current_setting('test.job'),'w2','no_match',jsonb_build_array(pg_temp.seg(false),pg_temp.seg(false),pg_temp.seg(false)),'0.9.0'),'shazam_check_not_owned');
SELECT expect_error(format('SELECT complete_business_shazam_check(%L,%L,%L,%L,%L,NULL)',current_setting('test.job'),'w1','no_match',jsonb_build_array(pg_temp.seg(false),pg_temp.seg(false)),'0.9.0'),'shazam_no_match_requires_three_clean_segments');
SELECT expect_error(format('SELECT complete_business_shazam_check(%L,%L,%L,%L,%L,NULL)',current_setting('test.job'),'w1','no_match',jsonb_build_array(pg_temp.seg(false),pg_temp.seg(false),pg_temp.seg(false,'timeout')),'0.9.0'),'shazam_no_match_requires_three_clean_segments');
SELECT expect_error(format('SELECT complete_business_shazam_check(%L,%L,%L,%L,%L,NULL)',current_setting('test.job'),'w1','match',jsonb_build_array(pg_temp.seg(false),pg_temp.seg(false),pg_temp.seg(false)),'0.9.0'),'shazam_match_requires_matched_segment');
SELECT complete_business_shazam_check(current_setting('test.job')::uuid,'w1','match',jsonb_build_array(pg_temp.seg(false),pg_temp.seg(true),pg_temp.seg(false)),'0.9.0',NULL);
SELECT check_test((SELECT status='match' AND NOT passport_written AND library_version='0.9.0' AND finished_at IS NOT NULL FROM business_passport_shazam_checks WHERE id=current_setting('test.job')::uuid),'shazam: match recorded');
SELECT check_test(NOT EXISTS(SELECT 1 FROM business_track_passports WHERE audio_item_id='00000000-0000-0000-0000-000000000802' AND shazam_result IS NOT NULL),'shazam: match never writes passport');
SELECT check_test(enqueue_business_shazam_check('00000000-0000-0000-0000-000000000802','autofill')=current_setting('test.job')::uuid,'shazam: autofill keeps match answer');
INSERT INTO music_audio_assets(id,audio_item_id,asset_role,lifecycle_state) VALUES('00000000-0000-0000-0000-000000000903','00000000-0000-0000-0000-000000000802','master','verified');
UPDATE audio_items SET desired_music_master_asset_id='00000000-0000-0000-0000-000000000903' WHERE id='00000000-0000-0000-0000-000000000802';
SELECT check_test((SELECT count(*)=1 FROM business_passport_shazam_checks WHERE audio_item_id='00000000-0000-0000-0000-000000000802' AND status='pending' AND master_asset_id='00000000-0000-0000-0000-000000000903'),'shazam: new master queued');
SELECT set_config('test.job',(SELECT id::text FROM claim_business_shazam_check('w1')),false);
SELECT complete_business_shazam_check(current_setting('test.job')::uuid,'w1','retry','[]','0.9.0','rate_limited',120);
SELECT check_test((SELECT status='pending' AND available_at>now()+interval '100 seconds' AND locked_by IS NULL FROM business_passport_shazam_checks WHERE id=current_setting('test.job')::uuid),'shazam: retry backs off');
SELECT check_test((SELECT count(*)=0 FROM claim_business_shazam_check('w1')),'shazam: retry not claimable early');
UPDATE business_passport_shazam_checks SET available_at=now()-interval '1 second' WHERE id=current_setting('test.job')::uuid;
SELECT check_test((SELECT attempts=2 FROM claim_business_shazam_check('w1')),'shazam: retry claimed again');
SELECT complete_business_shazam_check(current_setting('test.job')::uuid,'w1','no_match',jsonb_build_array(pg_temp.seg(false),pg_temp.seg(false),pg_temp.seg(false)),'0.9.0',NULL);
SELECT check_test((SELECT status='draft' AND shazam_result='not_found' AND shazam_checked_at IS NOT NULL AND al_code='AL-T-000000802' AND approved_at IS NULL FROM business_track_passports WHERE audio_item_id='00000000-0000-0000-0000-000000000802'),'shazam: clean result writes not_found, stays draft');
SELECT check_test((SELECT passport_written FROM business_passport_shazam_checks WHERE id=current_setting('test.job')::uuid),'shazam: write logged');
SELECT check_test(enqueue_business_shazam_check('00000000-0000-0000-0000-000000000802','autofill')=current_setting('test.job')::uuid,'shazam: autofill keeps clean answer');
UPDATE business_track_passports SET shazam_result='match' WHERE audio_item_id='00000000-0000-0000-0000-000000000802';
SELECT check_test(enqueue_business_shazam_check('00000000-0000-0000-0000-000000000802','autofill')<>current_setting('test.job')::uuid,'shazam: autofill re-checks when passport differs');
SELECT set_config('test.job',(SELECT id::text FROM claim_business_shazam_check('w1')),false);
SELECT complete_business_shazam_check(current_setting('test.job')::uuid,'w1','no_match',jsonb_build_array(pg_temp.seg(false),pg_temp.seg(false),pg_temp.seg(false)),'0.9.0',NULL);
SELECT check_test((SELECT shazam_result='match' FROM business_track_passports WHERE audio_item_id='00000000-0000-0000-0000-000000000802') AND (SELECT error='manual_match_kept' AND NOT passport_written FROM business_passport_shazam_checks WHERE id=current_setting('test.job')::uuid),'shazam: manual match kept');
UPDATE business_track_passports SET shazam_result=NULL, shazam_checked_at=NULL WHERE audio_item_id='00000000-0000-0000-0000-000000000802';
SELECT set_config('test.job',enqueue_business_shazam_check('00000000-0000-0000-0000-000000000802','autofill')::text,false);
SELECT check_test((SELECT count(*)=1 FROM claim_business_shazam_check('w1')),'shazam: claim before replacement');
INSERT INTO music_audio_assets(id,audio_item_id,asset_role,lifecycle_state) VALUES('00000000-0000-0000-0000-000000000904','00000000-0000-0000-0000-000000000802','master','verified');
UPDATE audio_items SET desired_music_master_asset_id='00000000-0000-0000-0000-000000000904' WHERE id='00000000-0000-0000-0000-000000000802';
SELECT complete_business_shazam_check(current_setting('test.job')::uuid,'w1','no_match',jsonb_build_array(pg_temp.seg(false),pg_temp.seg(false),pg_temp.seg(false)),'0.9.0',NULL);
SELECT check_test((SELECT status='skipped' AND error='master_replaced' FROM business_passport_shazam_checks WHERE id=current_setting('test.job')::uuid),'shazam: stale master skipped');
SELECT check_test((SELECT shazam_result IS NULL FROM business_track_passports WHERE audio_item_id='00000000-0000-0000-0000-000000000802'),'shazam: stale master never writes');
SELECT check_test(EXISTS(SELECT 1 FROM business_passport_shazam_checks WHERE audio_item_id='00000000-0000-0000-0000-000000000802' AND status='pending' AND master_asset_id='00000000-0000-0000-0000-000000000904'),'shazam: replacement re-queued');
UPDATE business_passport_shazam_checks SET status='running',locked_by='dead',locked_at=now()-interval '31 minutes' WHERE audio_item_id='00000000-0000-0000-0000-000000000802' AND status='pending';
SELECT check_test((SELECT locked_by='w3' FROM claim_business_shazam_check('w3')),'shazam: crashed job reclaimed');
-- t1485u review fix 4: lease heartbeat.
SET test.uid='00000000-0000-0000-0000-000000000006';
SELECT set_config('test.job',(SELECT id::text FROM business_passport_shazam_checks WHERE audio_item_id='00000000-0000-0000-0000-000000000802' AND status='running'),false);
UPDATE business_passport_shazam_checks SET locked_at=now()-interval '29 minutes' WHERE id=current_setting('test.job')::uuid;
SELECT check_test(heartbeat_business_shazam_check(current_setting('test.job')::uuid,'w3'),'shazam: heartbeat by owner');
SELECT check_test((SELECT locked_at>now()-interval '1 minute' FROM business_passport_shazam_checks WHERE id=current_setting('test.job')::uuid),'shazam: heartbeat renews lease');
SELECT check_test((SELECT count(*)=0 FROM claim_business_shazam_check('w4')),'shazam: renewed lease not reclaimed');
SELECT check_test(NOT heartbeat_business_shazam_check(current_setting('test.job')::uuid,'w1'),'shazam: heartbeat refused for foreign worker');
-- t1485u review fix 1a: approval gate on the latest check of the current master.
SELECT admin_upsert_business_track_passport('00000000-0000-0000-0000-000000000802',current_setting('test.evidence')::jsonb||'{"al_code":"AL-T-000000802"}');
SELECT record_business_master_hash('00000000-0000-0000-0000-000000000802','00000000-0000-0000-0000-000000000904',repeat('b',64),auth.uid());
SELECT expect_error('SELECT admin_approve_business_track_passport(''00000000-0000-0000-0000-000000000802'')','passport_shazam_pending');
SELECT complete_business_shazam_check(current_setting('test.job')::uuid,'w3','match',jsonb_build_array(pg_temp.seg(false),pg_temp.seg(true),pg_temp.seg(false)),'0.9.0',NULL);
SELECT check_test((SELECT shazam_result='not_found' FROM business_track_passports WHERE audio_item_id='00000000-0000-0000-0000-000000000802'),'shazam: earlier manual not_found still in passport');
SELECT expect_error('SELECT admin_approve_business_track_passport(''00000000-0000-0000-0000-000000000802'')','passport_shazam_match');
SELECT admin_upsert_business_track_passport('00000000-0000-0000-0000-000000000802',jsonb_build_object('shazam_result','not_found','shazam_checked_at',clock_timestamp()));
SELECT admin_approve_business_track_passport('00000000-0000-0000-0000-000000000802');
SELECT check_test((SELECT status='approved' FROM business_track_passports WHERE audio_item_id='00000000-0000-0000-0000-000000000802'),'shazam: manual not_found after the match allows approval');
-- t1485u review fix 1b: master change keeps a manual value, clears an automatic one.
INSERT INTO music_audio_assets(id,audio_item_id,asset_role,lifecycle_state) VALUES('00000000-0000-0000-0000-000000000905','00000000-0000-0000-0000-000000000802','master','verified');
UPDATE audio_items SET desired_music_master_asset_id='00000000-0000-0000-0000-000000000905' WHERE id='00000000-0000-0000-0000-000000000802';
SELECT check_test((SELECT status='draft' AND shazam_result='not_found' AND shazam_checked_at IS NOT NULL FROM business_track_passports WHERE audio_item_id='00000000-0000-0000-0000-000000000802'),'shazam: manual not_found kept on master change');
SELECT record_business_master_hash('00000000-0000-0000-0000-000000000802','00000000-0000-0000-0000-000000000905',repeat('b',64),auth.uid());
SELECT expect_error('SELECT admin_approve_business_track_passport(''00000000-0000-0000-0000-000000000802'')','passport_shazam_pending');
SELECT set_config('test.job',(SELECT id::text FROM claim_business_shazam_check('w1')),false);
SELECT check_test(heartbeat_business_shazam_check(current_setting('test.job')::uuid,'w1'),'shazam: heartbeat on new job');
SELECT complete_business_shazam_check(current_setting('test.job')::uuid,'w1','no_match',jsonb_build_array(pg_temp.seg(false),pg_temp.seg(false),pg_temp.seg(false)),'0.9.0',NULL);
SELECT check_test((SELECT c.passport_written AND c.passport_checked_at=b.shazam_checked_at FROM business_passport_shazam_checks c JOIN business_track_passports b USING(audio_item_id) WHERE c.id=current_setting('test.job')::uuid),'shazam: automatic write marked');
SELECT check_test(business_passport_auto_shazam_master('00000000-0000-0000-0000-000000000802')='00000000-0000-0000-0000-000000000905','shazam: auto marker points at its master');
SELECT admin_upsert_business_track_passport('00000000-0000-0000-0000-000000000802','{"notes":"правка без полей Shazam"}');
SELECT check_test((SELECT shazam_result='not_found' FROM business_track_passports WHERE audio_item_id='00000000-0000-0000-0000-000000000802') AND business_passport_auto_shazam_master('00000000-0000-0000-0000-000000000802') IS NOT NULL,'shazam: save without Shazam keys keeps auto value');
CREATE TEMP TABLE auto_marker AS SELECT shazam_result, shazam_checked_at FROM business_track_passports WHERE audio_item_id='00000000-0000-0000-0000-000000000802';
INSERT INTO music_audio_assets(id,audio_item_id,asset_role,lifecycle_state) VALUES('00000000-0000-0000-0000-000000000906','00000000-0000-0000-0000-000000000802','master','verified');
UPDATE audio_items SET desired_music_master_asset_id='00000000-0000-0000-0000-000000000906' WHERE id='00000000-0000-0000-0000-000000000802';
SELECT check_test((SELECT shazam_result IS NULL AND shazam_checked_at IS NULL AND status='draft' FROM business_track_passports WHERE audio_item_id='00000000-0000-0000-0000-000000000802'),'shazam: auto not_found cleared on master change');
SELECT check_test(EXISTS(SELECT 1 FROM business_passport_shazam_checks WHERE audio_item_id='00000000-0000-0000-0000-000000000802' AND status='pending' AND master_asset_id='00000000-0000-0000-0000-000000000906'),'shazam: new master queued after clear');
-- Belt and braces: even if an old automatic value were back in the passport, approval refuses it.
UPDATE business_passport_shazam_checks SET status='error', finished_at=now() WHERE audio_item_id='00000000-0000-0000-0000-000000000802' AND status='pending';
UPDATE business_track_passports b SET shazam_result=m.shazam_result, shazam_checked_at=m.shazam_checked_at FROM auto_marker m WHERE b.audio_item_id='00000000-0000-0000-0000-000000000802';
SELECT record_business_master_hash('00000000-0000-0000-0000-000000000802','00000000-0000-0000-0000-000000000906',repeat('b',64),auth.uid());
SELECT expect_error('SELECT admin_approve_business_track_passport(''00000000-0000-0000-0000-000000000802'')','passport_shazam_stale');
SELECT admin_upsert_business_track_passport('00000000-0000-0000-0000-000000000802',jsonb_build_object('shazam_checked_at',clock_timestamp()));
SELECT admin_approve_business_track_passport('00000000-0000-0000-0000-000000000802');
SELECT check_test((SELECT status='approved' FROM business_track_passports WHERE audio_item_id='00000000-0000-0000-0000-000000000802'),'shazam: manual decision after a failed check allows approval');
SELECT check_test(NOT EXISTS(SELECT 1 FROM business_passport_shazam_checks c JOIN business_track_passports b USING(audio_item_id) WHERE b.status='approved' AND c.finished_at>b.approved_at),'shazam: worker never approves');
SELECT check_test(NOT has_table_privilege('authenticated','business_passport_shazam_checks','SELECT') AND NOT has_table_privilege('anon','business_passport_shazam_checks','SELECT'),'shazam: no client table grants');
SELECT check_test(NOT has_table_privilege('service_role','business_passport_shazam_checks','INSERT') AND has_table_privilege('service_role','business_passport_shazam_checks','SELECT'),'shazam: service reads, writes via RPC only');
SELECT check_test(NOT has_function_privilege('authenticated','complete_business_shazam_check(uuid,text,text,jsonb,text,text,integer)','EXECUTE') AND NOT has_function_privilege('authenticated','enqueue_business_shazam_check(uuid,text)','EXECUTE') AND NOT has_function_privilege('anon','claim_business_shazam_check(text)','EXECUTE'),'shazam: no client RPC');
SELECT check_test(has_function_privilege('service_role','complete_business_shazam_check(uuid,text,text,jsonb,text,text,integer)','EXECUTE'),'shazam: worker RPC granted');
SELECT check_test(has_function_privilege('service_role','heartbeat_business_shazam_check(uuid,text)','EXECUTE') AND NOT has_function_privilege('authenticated','heartbeat_business_shazam_check(uuid,text)','EXECUTE') AND NOT has_function_privilege('authenticated','business_passport_auto_shazam_master(uuid)','EXECUTE'),'shazam: heartbeat service-only, marker not exposed');
SELECT check_test(has_function_privilege('authenticated','admin_approve_business_track_passport(uuid)','EXECUTE') AND NOT has_function_privilege('anon','admin_approve_business_track_passport(uuid)','EXECUTE'),'shazam: approve grants unchanged');
SELECT check_test((SELECT relrowsecurity FROM pg_class WHERE oid='business_passport_shazam_checks'::regclass),'shazam: RLS enabled');
SELECT 'SHAZAM_OK';
"""
blocks = pre + [fixtures, source('20270311120000_business_track_passports.sql'), checks,
                source('20270313120000_business_passport_shazam_checks.sql'), shazam_checks,
                (root / 'supabase/rollback/20270313120000_business_passport_shazam_checks.down.sql').read_text(),
                "SELECT check_test(to_regclass('public.business_passport_shazam_checks') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname LIKE 'enqueue_business_shazam_%' OR tgname='reset_business_passport_shazam_on_master_change') AND to_regprocedure('public.heartbeat_business_shazam_check(uuid,text)') IS NULL AND to_regprocedure('public.business_passport_auto_shazam_master(uuid)') IS NULL,'shazam rollback drops queue');\nSELECT check_test((SELECT prosrc NOT LIKE '%passport_shazam%' AND prosrc LIKE '%passport_fingerprint_match%' FROM pg_proc WHERE oid='public.admin_approve_business_track_passport(uuid)'::regprocedure) AND has_function_privilege('authenticated','admin_approve_business_track_passport(uuid)','EXECUTE'),'shazam rollback restores approval RPC');\n",
                (root / 'supabase/rollback/20270311120000_business_track_passports.down.sql').read_text(),
                "SELECT check_test(NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname LIKE 'guard_business_only_%'),'rollback drops cover guards');\nSELECT 'ROLLBACK_OK';"]
with tempfile.TemporaryDirectory(prefix='audiolad-passports-') as scratch:
    data = Path(scratch) / 'data'
    subprocess.run([str(pg/'initdb'),'-U','postgres','-D',str(data),'-A','trust','--locale=C.UTF-8','--encoding=UTF8'],check=True,capture_output=True)
    start = subprocess.run([str(pg/'pg_ctl'),'-D',str(data),'-l',str(Path(scratch)/'log'),
        '-o',f"-k {scratch} -c listen_addresses=''",'-w','start'],capture_output=True)
    if start.returncode:
        log = (Path(scratch)/'log').read_text()
        if 'Operation not permitted' not in log or os.environ.get('CI'):
            raise SystemExit(log)
        sql = '\n'.join(' '.join(line for line in block.splitlines() if not line.lstrip().startswith('--')) for block in blocks)+'\n'
        result = subprocess.run([str(pg/'postgres'),'--single','-D',str(data),'postgres'],input=sql,text=True,capture_output=True)
        mode = 'single-user; RLS/ACL catalog assertions, actual RLS requires CI socket'
    else:
        try:
            result = subprocess.run([str(pg/'psql'),'-X','-h',scratch,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input='\n'.join(blocks),text=True,capture_output=True)
        finally:
            subprocess.run([str(pg/'pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],check=True,capture_output=True)
        mode = 'private Unix socket, TCP disabled'
    if result.returncode or 'ERROR:' in result.stderr or 'FATAL:' in result.stderr or 'PASSPORTS_OK' not in result.stdout or 'SHAZAM_OK' not in result.stdout or 'ROLLBACK_OK' not in result.stdout:
        print(result.stdout,result.stderr)
        raise SystemExit(1)
    print(f'business-track-passports-isolated: PASS ({mode}); real A+C + rollback, each missing field, hash, matches, pool snapshots, resolver passport gate, business-only cover/gallery guard, sound, revoke, replacement, publication side-effects, RBAC, automatic Shazam queue')
