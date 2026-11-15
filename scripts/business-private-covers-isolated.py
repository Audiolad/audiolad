#!/usr/bin/env python3
"""39a7ef48 PR-D: real A+C+D migrations in a disposable PG17 cluster. No DB URL or TCP.
Reuses the PR-C harness setup (schema stubs, fixtures) and adds a storage.buckets stub
plus a deliberately permissive legacy storage policy to prove the restrictive fences.
"""
from pathlib import Path
import os
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
c_path = root / 'scripts/business-track-passports-isolated.py'
c = {'__file__': str(c_path)}
exec(compile(c_path.read_text().split('checks = """')[0], str(c_path), 'exec'), c)
pre, fixtures, source, pg = c['pre'], c['fixtures'], c['source'], c['pg']

ALBUM = "current_setting('test.album')"
pre_d = """
CREATE TABLE IF NOT EXISTS storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
GRANT SELECT ON storage.buckets TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated, service_role;
-- Simulates an older, too broad storage policy: the fences must still hide the private bucket.
CREATE POLICY legacy_permissive_read ON storage.objects FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY legacy_permissive_insert ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (true);
ALTER TABLE practices ADD COLUMN IF NOT EXISTS publication_class text;
ALTER TABLE practices ADD COLUMN IF NOT EXISTS is_free boolean DEFAULT true;
ALTER TABLE practices ADD COLUMN IF NOT EXISTS price numeric DEFAULT 0;
"""

checks = f"""
SELECT check_test((SELECT public IS FALSE FROM storage.buckets WHERE id='business-private-covers'),'private bucket created, not public');
SET ROLE authenticated;
SELECT set_config('test.album',admin_create_business_album('00000000-0000-0000-0000-000000000500','Закрытый с обложкой')::text,false);
SELECT set_config('test.bare',admin_create_business_album('00000000-0000-0000-0000-000000000500','Закрытый без обложки')::text,false);
RESET ROLE;
SELECT set_config('test.ref','business-private-cover:practices/'||{ALBUM}||'/variants/v1/md.webp',false);
INSERT INTO storage.objects VALUES('business-private-covers','practices/'||{ALBUM}||'/variants/v1/md.webp');
INSERT INTO storage.objects VALUES('practice-covers','practices/ordinary/variants/v1/md.webp');

-- Storage: nobody but the server (service role) reads or writes the private bucket.
SET ROLE anon; SET test.uid='';
SELECT check_test((SELECT count(*)=0 FROM storage.objects WHERE bucket_id='business-private-covers'),'anon cannot read private covers');
SELECT check_test((SELECT count(*)>0 FROM storage.objects WHERE bucket_id='practice-covers'),'fence is bucket-scoped (public covers unchanged)');
SELECT expect_error('INSERT INTO storage.objects VALUES(''business-private-covers'',''x/anon.webp'')','row-level security');
RESET ROLE;
SET test.uid='00000000-0000-0000-0000-000000000002'; SET ROLE authenticated;
SELECT check_test((SELECT count(*)=0 FROM storage.objects WHERE bucket_id='business-private-covers'),'listener cannot read private covers');
SELECT expect_error('INSERT INTO storage.objects VALUES(''business-private-covers'',''x/listener.webp'')','row-level security');
UPDATE storage.objects SET name='y' WHERE bucket_id='business-private-covers';
DELETE FROM storage.objects WHERE bucket_id='business-private-covers';
RESET ROLE;
SET test.uid='00000000-0000-0000-0000-000000000003'; SET ROLE authenticated;
SELECT check_test((SELECT count(*)=0 FROM storage.objects WHERE bucket_id='business-private-covers'),'other author cannot read private covers');
RESET ROLE;
SET test.uid='00000000-0000-0000-0000-000000000006'; SET ROLE authenticated;
SELECT check_test((SELECT count(*)=0 FROM storage.objects WHERE bucket_id='business-private-covers'),'even the album editor reads only via the server preview');
RESET ROLE;
SET ROLE service_role;
SELECT check_test((SELECT count(*)=1 FROM storage.objects WHERE bucket_id='business-private-covers' AND name='practices/'||current_setting('test.album')||'/variants/v1/md.webp'),'server (hall/owner signing) can read private covers; client update/delete had no effect');
RESET ROLE;
SET test.uid='00000000-0000-0000-0000-000000000006';
SELECT check_test(NOT has_function_privilege('authenticated','business_private_cover_ref_ok(text,uuid,uuid)','EXECUTE'),'no client ref helper');

-- Album cover column: only this album's private reference, no manifest.
SELECT expect_error(format('UPDATE practices SET cover_url=%L WHERE id=%L','https://x.supabase.co/storage/v1/object/public/practice-covers/a.webp',{ALBUM}),'business_only_cover_must_be_private');
SELECT expect_error(format('UPDATE practices SET cover_url=%L WHERE id=%L','business-private-cover:practices/00000000-0000-0000-0000-000000000101/variants/v1/md.webp',{ALBUM}),'business_only_cover_must_be_private');
SELECT expect_error(format('UPDATE practices SET cover_url=%L WHERE id=%L','business-private-cover:practices/'||{ALBUM}||'/variants/../../x/md.webp',{ALBUM}),'business_only_cover_must_be_private');
SELECT expect_error(format('UPDATE practices SET cover_image=%L WHERE id=%L','{{}}',{ALBUM}),'business_only_cover_must_be_private');
UPDATE practices SET cover_url=current_setting('test.ref') WHERE id={ALBUM}::uuid;
SELECT check_test((SELECT cover_url=current_setting('test.ref') AND cover_image IS NULL FROM practices WHERE id={ALBUM}::uuid),'closed album stores private reference');
SELECT expect_error('UPDATE practices SET cover_url=''business-private-cover:practices/00000000-0000-0000-0000-000000000101/variants/v1/md.webp'' WHERE id=''00000000-0000-0000-0000-000000000101''','private_cover_requires_business_only');
UPDATE practices SET cover_url='https://x.supabase.co/storage/v1/object/public/practice-covers/ordinary.webp', author_id='00000000-0000-0000-0000-000000000500' WHERE id IN ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000104');
SELECT check_test((SELECT count(*)=2 FROM practices WHERE cover_url LIKE 'https://%ordinary.webp'),'ordinary public covers unchanged');

-- Track covers.
INSERT INTO audio_items(id,practice_id,title,status,audio_path,duration_seconds) VALUES('00000000-0000-0000-0000-000000000811',{ALBUM}::uuid,'Закрытый трек','draft','m.mp3',120);
INSERT INTO audio_items(id,practice_id,title,status,audio_path,duration_seconds) VALUES('00000000-0000-0000-0000-000000000812',current_setting('test.bare')::uuid,'Трек без обложки','draft','m.mp3',120);
UPDATE audio_items SET cover_url='business-private-cover:practices/'||practice_id||'/track-covers/'||id||'/variants/v1/md.webp' WHERE id='00000000-0000-0000-0000-000000000811';
SELECT check_test((SELECT cover_url LIKE 'business-private-cover:%/track-covers/00000000-0000-0000-0000-000000000811/%' FROM audio_items WHERE id='00000000-0000-0000-0000-000000000811'),'closed track stores private reference');
SELECT expect_error('UPDATE audio_items SET cover_url=current_setting(''test.ref'') WHERE id=''00000000-0000-0000-0000-000000000811''','business_only_cover_must_be_private');
SELECT expect_error('UPDATE audio_items SET cover_url=''https://x/public.webp'' WHERE id=''00000000-0000-0000-0000-000000000811''','business_only_cover_must_be_private');
SELECT expect_error('UPDATE audio_items SET cover_image=''{{}}'' WHERE id=''00000000-0000-0000-0000-000000000811''','business_only_cover_must_be_private');
SELECT expect_error('UPDATE audio_items SET cover_url=''business-private-cover:practices/00000000-0000-0000-0000-000000000101/track-covers/00000000-0000-0000-0000-000000000101/variants/v1/md.webp'' WHERE id=''00000000-0000-0000-0000-000000000101''','private_cover_requires_business_only');
UPDATE audio_items SET cover_url='https://x/ordinary-track.webp', duration_seconds=120 WHERE practice_id IN ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000104');
SELECT check_test((SELECT cover_url='https://x/ordinary-track.webp' FROM audio_items WHERE id='00000000-0000-0000-0000-000000000101'),'ordinary track cover unchanged');
SELECT expect_error(format('INSERT INTO publication_gallery_slides(publication_id,image_url,image_manifest) VALUES(%L,%L,%L)',{ALBUM},'g.webp','{{}}'),'business_only_cover_upload_blocked');

-- Readiness / publish.
SELECT publish_audio_product({ALBUM}::uuid);
SELECT check_test((SELECT status='published' AND catalog_visibility='selected_users' AND NOT is_catalog_listed AND business_only FROM practices WHERE id={ALBUM}::uuid),'closed album with private cover publishes and stays closed');
SELECT expect_error(format('SELECT publish_audio_product(%L)',current_setting('test.bare')),'product_not_ready');
DO $$ DECLARE d text; BEGIN
  ALTER TABLE practices DISABLE TRIGGER guard_business_only_practice_cover;
  UPDATE practices SET cover_url='https://x/public.webp' WHERE id=current_setting('test.bare')::uuid;
  UPDATE practices SET cover_url='business-private-cover:practices/00000000-0000-0000-0000-000000000105/variants/v1/md.webp' WHERE id='00000000-0000-0000-0000-000000000105';
  ALTER TABLE practices ENABLE TRIGGER guard_business_only_practice_cover;
  BEGIN PERFORM assert_practice_moderation_ready(current_setting('test.bare')::uuid); d := 'none';
  EXCEPTION WHEN SQLSTATE '22023' THEN GET STACKED DIAGNOSTICS d = PG_EXCEPTION_DETAIL; END;
  PERFORM check_test(d='business_only_cover_not_private','readiness rejects a public cover on a closed album');
  UPDATE practices SET deleted_at=NULL, author_id='00000000-0000-0000-0000-000000000500' WHERE id='00000000-0000-0000-0000-000000000105';
  UPDATE audio_items SET duration_seconds=120 WHERE practice_id='00000000-0000-0000-0000-000000000105';
  BEGIN PERFORM assert_practice_moderation_ready('00000000-0000-0000-0000-000000000105'); d := 'none';
  EXCEPTION WHEN SQLSTATE '22023' THEN GET STACKED DIAGNOSTICS d = PG_EXCEPTION_DETAIL; END;
  PERFORM check_test(d='private_cover_on_public_product','readiness rejects a private reference on an ordinary album');
END $$;
SELECT assert_practice_moderation_ready('00000000-0000-0000-0000-000000000104');
SELECT publish_audio_product('00000000-0000-0000-0000-000000000104');
SELECT check_test((SELECT status='published' AND catalog_visibility='listed' FROM practices WHERE id='00000000-0000-0000-0000-000000000104'),'ordinary album publish unchanged');
SELECT check_test(obj_description('assert_practice_moderation_ready(uuid)'::regprocedure) LIKE 'audiolad:internal-moderation-readiness:v9%','readiness v9');
SELECT 'PRIVATE_COVERS_OK';
DELETE FROM storage.objects WHERE bucket_id='business-private-covers';
"""
after_down = """
SELECT check_test(NOT EXISTS(SELECT 1 FROM practices WHERE cover_url LIKE 'business-private-cover:%') AND NOT EXISTS(SELECT 1 FROM audio_items WHERE cover_url LIKE 'business-private-cover:%'),'rollback clears private references');
SELECT check_test(NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='business-private-covers'),'rollback drops empty bucket');
SELECT check_test(NOT EXISTS(SELECT 1 FROM pg_policy WHERE polname LIKE 'business_private_covers_%'),'rollback drops fences');
SELECT check_test(to_regprocedure('business_private_cover_ref_ok(text,uuid,uuid)') IS NULL,'rollback drops ref helper');
SELECT check_test(obj_description('assert_practice_moderation_ready(uuid)'::regprocedure) LIKE 'audiolad:internal-moderation-readiness:v8%','rollback restores readiness v8');
SELECT expect_error(format('UPDATE practices SET cover_url=%L WHERE id=%L','business-private-cover:practices/'||current_setting('test.album')||'/variants/v1/md.webp',current_setting('test.album')),'business_only_cover_upload_blocked');
SELECT 'ROLLBACK_OK';
"""
blocks = pre + [fixtures, source('20270311120000_business_track_passports.sql'), pre_d,
                source('20270312120000_business_only_private_covers.sql'), checks,
                (root / 'supabase/rollback/20270312120000_business_only_private_covers.down.sql').read_text(), after_down]
with tempfile.TemporaryDirectory(prefix='audiolad-private-covers-') as scratch:
    data = Path(scratch) / 'data'
    subprocess.run([str(pg/'initdb'),'-U','postgres','-D',str(data),'-A','trust','--locale=C.UTF-8','--encoding=UTF8'],check=True,capture_output=True)
    start = subprocess.run([str(pg/'pg_ctl'),'-D',str(data),'-l',str(Path(scratch)/'log'),
        '-o',f"-k {scratch} -c listen_addresses=''",'-w','start'],capture_output=True)
    if start.returncode:
        log = (Path(scratch)/'log').read_text()
        if 'Operation not permitted' not in log or os.environ.get('CI'):
            raise SystemExit(log)
        print('business-private-covers-isolated: SKIP real RLS (no Unix socket here); CI runs it')
        raise SystemExit(0)
    try:
        result = subprocess.run([str(pg/'psql'),'-X','-h',scratch,'-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],input='\n'.join(blocks),text=True,capture_output=True)
    finally:
        subprocess.run([str(pg/'pg_ctl'),'-D',str(data),'-m','fast','-w','stop'],check=True,capture_output=True)
    if result.returncode or 'ERROR:' in result.stderr or 'PRIVATE_COVERS_OK' not in result.stdout or 'ROLLBACK_OK' not in result.stdout:
        print(result.stdout[-4000:], result.stderr[-4000:])
        raise SystemExit(1)
    print('business-private-covers-isolated: PASS (private Unix socket, real RLS); real A+C+D + rollback: '
          'private bucket fenced for anon/listener/other author/editor even with a permissive legacy policy, '
          'server reads; album/track references only, no manifest, no ref on ordinary albums, gallery blocked; '
          'publish with private cover, readiness v9 details, ordinary publish unchanged; rollback v8 + C guard')
