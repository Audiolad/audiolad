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
pg = Path(os.environ.get('PG_BIN', '/usr/lib/postgresql/17/bin'))
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
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE authors(id uuid PRIMARY KEY, name text, slug text, access_status text);
ALTER TABLE author_members ADD COLUMN role text DEFAULT 'owner';
ALTER TABLE practices ADD COLUMN title text, ADD COLUMN product_kind text, ADD COLUMN music_usage_permission text, ADD COLUMN format text,
 ADD COLUMN currency text, ADD COLUMN duration_minutes integer, ADD COLUMN audio_url text,
 ADD COLUMN moderation_status text DEFAULT 'approved', ADD COLUMN moderation_attempt integer DEFAULT 0;
ALTER TABLE audio_items ADD COLUMN title text, ADD COLUMN duration_seconds integer, ADD COLUMN audio_path text,
 ADD COLUMN desired_music_master_asset_id uuid, ADD COLUMN active_music_delivery_asset_id uuid,
 ADD COLUMN position integer DEFAULT 0, ADD COLUMN updated_at timestamptz, ADD COLUMN analysis jsonb;
ALTER TABLE music_audio_assets ADD COLUMN asset_role text, ADD COLUMN lifecycle_state text;
ALTER TABLE profiles ADD COLUMN contact_email text, ADD COLUMN email text;
CREATE TABLE business_space_admissions(space_id text, audio_item_id uuid, PRIMARY KEY(space_id,audio_item_id));
CREATE TABLE business_locations(id uuid PRIMARY KEY,business_category text);
CREATE TABLE business_programs(id uuid PRIMARY KEY,kind text);
CREATE TABLE business_program_items(program_id uuid,audio_item_id uuid,excluded_at timestamptz);
CREATE TABLE business_track_eligibility_reviews(id uuid PRIMARY KEY, audio_item_id uuid,decision text,created_at timestamptz);
CREATE FUNCTION public.resolve_business_track_eligibility_v1(uuid,uuid,uuid DEFAULT NULL,text DEFAULT 'business_background_playback',timestamptz DEFAULT now())
 RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"decision":"ELIGIBLE","reason_codes":[]}'::jsonb $$;
CREATE TABLE starter_practices(practice_id uuid,is_active boolean);
CREATE FUNCTION author_members_can_mutate(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION actor_can_bypass_product_moderation(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION author_access_allows_content_mutations(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION author_access_allows_paid_products(text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION assert_practice_moderation_ready(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE FUNCTION music_item_effective_publish_duration_seconds(uuid) RETURNS integer LANGUAGE sql AS $$ SELECT 60 $$;
CREATE FUNCTION music_item_has_validated_active_delivery(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION record_author_support_mutation_audit(uuid,text,text,text,jsonb) RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE TABLE practice_moderation_events(id uuid DEFAULT gen_random_uuid(),practice_id uuid,author_id uuid,action text,
 from_status text,to_status text,from_moderation_status text,to_moderation_status text,comment text,actor_user_id uuid,
 actor_type text,attempt integer,metadata jsonb,created_at timestamptz);
CREATE TABLE practice_moderation_email_outbox(event_id uuid,practice_id uuid,author_id uuid,action text,
 recipient_role text,recipient_user_id uuid,recipient_email text,context jsonb,status text,error_code text,error_message text);
CREATE TABLE scheduled_publish_notification_outbox(id uuid DEFAULT gen_random_uuid(),practice_id uuid UNIQUE,
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
pre = [stubs, base, extra, source('20270310120000_business_only_practices.sql'),
       source('20270131120000_business_manual_admissions.sql'), source('20270201120000_business_track_sound_reviews.sql'),
       source('20270202120000_business_artist_sound_auto.sql')]
for file, name in [('20261027120000_product_published_email_context_canonical.sql','log_practice_moderation_event'),
                   ('20261212120000_scheduled_publish_notification_outbox.sql','claim_due_scheduled_practice_publications'),
                   ('20261007180000_music_publish_playable_audio.sql','publish_audio_product')]:
    pre.append(fn(file,name))
fixtures = """
SET test.uid='00000000-0000-0000-0000-000000000006';
INSERT INTO auth.users VALUES('00000000-0000-0000-0000-000000000006');
INSERT INTO authors VALUES('00000000-0000-0000-0000-000000000500','Артист','artist','active');
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
CREATE TABLE sound_before_c AS SELECT id,business_sound_track_allowed(id,'cafe') AS allowed FROM audio_items;
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
SELECT publish_audio_product(current_setting('test.album')::uuid);
SELECT check_test((SELECT catalog_visibility='selected_users' AND NOT is_catalog_listed FROM practices WHERE id=current_setting('test.album')::uuid),'publish keeps selected_users');
SELECT admin_upsert_business_track_passport('00000000-0000-0000-0000-000000000801','{}');
SELECT check_test(NOT business_sound_track_allowed('00000000-0000-0000-0000-000000000801','cafe'),'draft passport sound blocked');
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
blocks = pre + [fixtures, source('20270311120000_business_track_passports.sql'), checks,
                (root / 'supabase/rollback/20270311120000_business_track_passports.down.sql').read_text(),
                "SELECT 'ROLLBACK_OK';"]
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
    if result.returncode or 'ERROR:' in result.stderr or 'FATAL:' in result.stderr or 'PASSPORTS_OK' not in result.stdout or 'ROLLBACK_OK' not in result.stdout:
        print(result.stdout,result.stderr)
        raise SystemExit(1)
    print(f'business-track-passports-isolated: PASS ({mode}); real A+C + rollback, each missing field, hash, matches, pool snapshots, sound, revoke, replacement, publication side-effects, RBAC')
