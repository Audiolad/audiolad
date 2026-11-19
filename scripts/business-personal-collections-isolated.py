#!/usr/bin/env python3
"""Compile/test the real additive migration in a disposable PostgreSQL cluster.
No production URL, no Docker, no TCP. Existing catalog gates are explicit stubs.
"""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
pg = Path('/usr/lib/postgresql/17/bin')
migration = (root / 'supabase/migrations/20270402120000_business_personal_collections.sql').read_text()
rollback = (root / 'supabase/rollbacks/20270402120000_business_personal_collections.rollback.sql').read_text()
base = """
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE practices(id uuid PRIMARY KEY, title text, business_only boolean, product_kind text,
 status text, deleted_at timestamptz, cover_url text);
CREATE TABLE audio_items(id uuid PRIMARY KEY, practice_id uuid REFERENCES practices(id), title text,
 duration_seconds integer, status text, position integer);
CREATE TABLE business_track_eligibility_reviews(id uuid PRIMARY KEY, audio_item_id uuid, decision text, created_at timestamptz);
CREATE TABLE test_gates(id uuid PRIMARY KEY, passport boolean DEFAULT true, sound boolean DEFAULT true);
CREATE FUNCTION business_track_passport_approved(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT passport FROM test_gates WHERE id=$1 $$;
CREATE FUNCTION business_sound_track_allowed(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT sound AND $2='cafe' FROM test_gates WHERE id=$1 $$;
CREATE FUNCTION test_id(integer) RETURNS uuid LANGUAGE sql AS $$ SELECT ('00000000-0000-4000-8000-'||lpad($1::text,12,'0'))::uuid $$;
CREATE TABLE access_grants(id uuid PRIMARY KEY);
CREATE TABLE business_organizations(id uuid PRIMARY KEY);
CREATE TABLE business_organization_members(organization_id uuid REFERENCES business_organizations(id), user_id uuid REFERENCES auth.users(id), role text);
CREATE TABLE business_locations(id uuid PRIMARY KEY, organization_id uuid REFERENCES business_organizations(id), business_category text);
CREATE TABLE business_content_categories(category text PRIMARY KEY, direction_key text);
INSERT INTO business_content_categories VALUES ('cafe','cafe'),('кофейня','cafe'),('spa','spa');
CREATE FUNCTION check_test(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
 BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; END $$;
CREATE FUNCTION expect_denied(command text) RETURNS void LANGUAGE plpgsql AS $$
 BEGIN BEGIN EXECUTE command; EXCEPTION WHEN check_violation THEN RETURN; END;
 RAISE EXCEPTION 'expected invalid collection'; END $$;
INSERT INTO auth.users VALUES(test_id(1)),(test_id(2));
INSERT INTO practices SELECT test_id(n), 'Альбом '||n, true, 'music', 'published', NULL, NULL FROM generate_series(1,10) n;
INSERT INTO audio_items SELECT test_id(100+n), test_id(1+(n-1)/10), 'Трек '||n, 180, 'published', (n-1)%10 FROM generate_series(1,100) n;
INSERT INTO test_gates(id) SELECT id FROM audio_items;
INSERT INTO business_organizations VALUES(test_id(401)),(test_id(402)),(test_id(403));
INSERT INTO business_organization_members VALUES(test_id(401),test_id(1),'owner'),(test_id(402),test_id(2),'owner'),(test_id(403),test_id(1),'manager');
INSERT INTO business_locations VALUES(test_id(501),test_id(401),'cafe'),(test_id(510),test_id(402),'cafe'),(test_id(511),test_id(401),'spa'),(test_id(512),test_id(403),'cafe');
"""
checks = """
SELECT check_test((SELECT count(*)=100 FROM business_personal_collection_tracks(NULL)), 'catalog candidates');
SELECT set_config('test.collection',create_business_personal_collection('Кофейня Евгения',repeat('a',64),test_id(1),
 ARRAY(SELECT test_id(n) FROM generate_series(101,150) n))::text,false);
SELECT set_config('test.other',create_business_personal_collection('Другая подборка',repeat('b',64),test_id(1),
 ARRAY(SELECT test_id(n) FROM generate_series(151,200) n))::text,false);
SELECT check_test((SELECT count(*)=50 AND count(DISTINCT album_id)=5 FROM business_personal_collection_tracks(current_setting('test.collection')::uuid)), '5 albums / 50 tracks');
SELECT check_test((SELECT count(*)=100 FROM audio_items), 'no audio copies');
SELECT check_test((SELECT count(*)=0 FROM access_grants), 'preview never grants trial');
SELECT check_test(NOT EXISTS(SELECT 1 FROM business_personal_collection_tracks(current_setting('test.collection')::uuid) WHERE audio_item_id=test_id(151)), 'no other collection track');
SELECT check_test((SELECT array_agg(audio_item_id ORDER BY position)=ARRAY(SELECT test_id(n) FROM generate_series(101,150) n) FROM business_personal_collection_items WHERE collection_id=current_setting('test.collection')::uuid), 'stable sequential snapshot');
SELECT expect_denied('SELECT create_business_personal_collection(''bad'',repeat(''c'',64),test_id(1),ARRAY[test_id(101),test_id(101)])');
SELECT expect_denied('SELECT create_business_personal_collection(''bad'',repeat(''c'',64),test_id(1),ARRAY[test_id(999)])');
SELECT expect_denied('SELECT create_business_personal_collection(''bad'',repeat(''c'',64),test_id(1),ARRAY[]::uuid[])');
UPDATE test_gates SET passport=false WHERE id=test_id(101);
UPDATE test_gates SET sound=false WHERE id=test_id(102);
INSERT INTO business_track_eligibility_reviews VALUES(test_id(999),test_id(103),'blocked',now());
SELECT check_test((SELECT count(*)=47 FROM business_personal_collection_tracks(current_setting('test.collection')::uuid)), 'live passport/sound/legal revocation');
SELECT expect_denied('SELECT create_business_personal_collection(''bad'',repeat(''c'',64),test_id(1),ARRAY[test_id(101)])');
INSERT INTO business_personal_collection_accounts VALUES(test_id(1),current_setting('test.collection')::uuid,now());
SELECT check_test((SELECT count(*)=1 FROM business_personal_collection_accounts WHERE user_id=test_id(1)), 'owner handoff persists');
SELECT check_test((SELECT count(*)=0 FROM business_personal_collection_accounts WHERE user_id=test_id(2)), 'no foreign account assignment');
SELECT check_test((SELECT count(*)=0 FROM access_grants), 'account assignment never grants gift');
SELECT check_test((SELECT collection_id=current_setting('test.collection')::uuid FROM business_personal_collection_locations WHERE location_id=test_id(501)), 'guest-start existing venue attached');
SELECT check_test((SELECT count(*)=47 FROM business_personal_collection_location_tracks(test_id(501))), 'venue returns only selected eligible tracks');
SELECT check_test((SELECT count(*)=0 FROM business_personal_collection_location_tracks(test_id(510))), 'ordinary owner without collection has no personal restriction');
UPDATE test_gates SET sound=false WHERE id IN(SELECT audio_item_id FROM business_personal_collection_items WHERE collection_id=current_setting('test.collection')::uuid);
SELECT check_test((SELECT count(*)=0 FROM business_personal_collection_location_tracks(test_id(501))), 'no remaining eligible personal tracks yields empty restriction for fallback');
UPDATE test_gates SET sound=true WHERE id IN(SELECT audio_item_id FROM business_personal_collection_items WHERE collection_id=current_setting('test.collection')::uuid) AND id<>test_id(102);
SELECT check_test(NOT EXISTS(SELECT 1 FROM business_personal_collection_location_tracks(test_id(501)) WHERE audio_item_id=test_id(151)), 'venue does not return full catalog');
SELECT check_test((SELECT count(*)=0 FROM business_personal_collection_locations WHERE location_id IN(test_id(510),test_id(511),test_id(512))), 'foreign/spa/manager venues not attached');
INSERT INTO business_locations VALUES(test_id(502),test_id(401),'кофейня');
SELECT check_test((SELECT count(*)=47 FROM business_personal_collection_location_tracks(test_id(502))), 'new cafe venue inherits collection');
INSERT INTO business_personal_collection_accounts VALUES(test_id(1),current_setting('test.other')::uuid,now());
UPDATE business_personal_collection_locations SET collection_id=current_setting('test.other')::uuid WHERE location_id=test_id(502);
UPDATE business_personal_collection_accounts SET selected_at=now() WHERE collection_id=current_setting('test.collection')::uuid;
SELECT check_test((SELECT count(*)=50 FROM business_personal_collection_location_tracks(test_id(502))), 'different venue choice not overwritten');
UPDATE business_organization_members SET role='manager' WHERE organization_id=test_id(401);
SELECT check_test((SELECT count(*)=0 FROM business_personal_collection_location_tracks(test_id(501))), 'current ownership required');
UPDATE business_organization_members SET role='owner' WHERE organization_id=test_id(401);
UPDATE audio_items SET status='draft' WHERE id=test_id(104);
UPDATE practices SET business_only=false WHERE id=test_id(2);
SELECT check_test((SELECT count(*)=36 FROM business_personal_collection_location_tracks(test_id(501))), 'venue applies live publication and closed-catalog gates');
UPDATE audio_items SET status='published' WHERE id=test_id(104);
UPDATE practices SET business_only=true WHERE id=test_id(2);
UPDATE business_personal_collections SET token_hash=repeat('c',64) WHERE id=current_setting('test.collection')::uuid;
SELECT check_test(NOT EXISTS(SELECT 1 FROM business_personal_collections WHERE token_hash=repeat('a',64) AND revoked_at IS NULL), 'rotated token invalid immediately');
SELECT check_test(EXISTS(SELECT 1 FROM business_personal_collections WHERE token_hash=repeat('c',64) AND revoked_at IS NULL), 'new token valid');
SELECT check_test((SELECT count(*)=47 FROM business_personal_collection_location_tracks(test_id(501))), 'rotation preserves venue playlist');
SELECT check_test((SELECT count(*)=0 FROM access_grants), 'inheritance never grants extra gift');
UPDATE business_personal_collections SET revoked_at=now() WHERE id=current_setting('test.collection')::uuid;
SELECT check_test((SELECT count(*)=0 FROM business_personal_collection_location_tracks(test_id(501))), 'revoke removes personal venue pool');
SELECT check_test((SELECT count(*)=50 FROM business_personal_collection_location_tracks(test_id(502))), 'different venue choice remains live');
SELECT check_test((SELECT count(*)=0 FROM business_personal_collection_tracks(current_setting('test.collection')::uuid)), 'revoked collection closed');
SELECT check_test((SELECT count(*)=50 FROM business_personal_collection_tracks(current_setting('test.other')::uuid)), 'other collection unchanged');
DO $$ DECLARE r text; t text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  FOREACH t IN ARRAY ARRAY['business_personal_collections','business_personal_collection_items','business_personal_collection_accounts','business_personal_collection_locations'] LOOP
   PERFORM check_test(NOT has_table_privilege(r,t,'SELECT,INSERT,UPDATE,DELETE'),r||' cannot access '||t);
   PERFORM check_test((SELECT relrowsecurity FROM pg_class WHERE oid=t::regclass),t||' RLS enabled');
  END LOOP;
  PERFORM check_test(NOT has_function_privilege(r,'business_personal_collection_location_tracks(uuid)','EXECUTE'),r||' no venue pool RPC');
  PERFORM check_test(NOT has_function_privilege(r,'business_personal_collection_tracks(uuid)','EXECUTE'),r||' no catalog RPC');
  PERFORM check_test(NOT has_function_privilege(r,'create_business_personal_collection(text,text,uuid,uuid[])','EXECUTE'),r||' no create RPC');
 END LOOP;
END $$;
SELECT check_test(has_function_privilege('service_role','business_personal_collection_tracks(uuid)','EXECUTE'),'server RPC allowed');
"""
after = """
SELECT check_test(NOT has_function_privilege('service_role','business_personal_collection_tracks(uuid)','EXECUTE'),'rollback disables new feature');
SELECT check_test((SELECT count(*)=2 FROM business_personal_collections),'rollback retains collections');
SELECT check_test((SELECT count(*)=100 FROM audio_items),'rollback retains audio');
SELECT check_test((SELECT count(*)=2 FROM business_personal_collection_accounts),'rollback retains account links');
SELECT check_test((SELECT count(*)=2 FROM business_personal_collection_locations),'rollback retains venue assignments');
SELECT check_test(NOT has_function_privilege('service_role','business_personal_collection_location_tracks(uuid)','EXECUTE'),'rollback disables venue pool');
SELECT check_test((SELECT tgenabled='D' FROM pg_trigger WHERE tgname='business_personal_collection_location_inherit'),'rollback disables inheritance');
SELECT check_test((SELECT tgenabled='D' FROM pg_trigger WHERE tgname='business_personal_collection_account_attach'),'rollback disables attachment');
INSERT INTO business_locations VALUES(test_id(503),test_id(401),'cafe');
SELECT check_test(NOT EXISTS(SELECT 1 FROM business_personal_collection_locations WHERE location_id=test_id(503)), 'rollback leaves ordinary venue creation working');
SELECT 'personal-collections-sql: PASS';
"""
with tempfile.TemporaryDirectory(prefix='personal-collections-pg-') as directory:
    data = Path(directory) / 'data'
    subprocess.run([str(pg / 'initdb'), '-D', str(data), '-A', 'trust', '-U', 'postgres', '--no-locale'], check=True, capture_output=True)
    # Single-user server needs no socket permission. Privilege/RLS metadata are checked
    # explicitly; actual PostgREST and Auth integration still require the test stand.
    blocks = [base, migration, checks, rollback, after]
    sql = '\n'.join(' '.join(line for line in block.splitlines() if not line.lstrip().startswith('--')) for block in blocks) + '\n'
    result = subprocess.run([str(pg / 'postgres'), '--single', '-D', str(data), 'postgres'], input=sql, text=True, capture_output=True)
    if result.returncode or 'ERROR:' in result.stderr or 'FATAL:' in result.stderr or 'personal-collections-sql: PASS' not in result.stdout:
        print(result.stdout, result.stderr)
        raise SystemExit(1)
    print('personal-collections-sql: PASS – real migration, 5 albums / 50 tracks, live gates, account/venue inheritance and isolation, live gates, rotation/revoke, RLS/grants, non-destructive rollback (catalog gates stubbed)')
