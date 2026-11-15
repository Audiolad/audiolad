#!/usr/bin/env python3
"""Real up/down SQL in disposable local PG17. No DB URL, TCP, or live DB.
Single-user compile plus Unix-socket RLS; explicit policy fallback if sandboxed.
"""
from pathlib import Path
import os
import re
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
pg = Path(os.environ.get('PG_BIN', '/usr/lib/postgresql/17/bin'))
name = '20270310120000_business_only_practices'
migrations = root / 'supabase/migrations'

def source(file):
    return (migrations / file).read_text()

def function(file, name):
    return re.search(r'CREATE OR REPLACE FUNCTION public\.' + name + r'\(.*?\n\$\$;', source(file), re.S)[0]

def policy(file, name):
    return re.search(r'CREATE POLICY "' + re.escape(name) + r'".*?;', source(file), re.S)[0]

def uid(n):
    return f'00000000-0000-0000-0000-{n:012d}'

schedule = '20261210120000_practice_scheduled_publication.sql'
stubs = """
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('test.uid',true),'')::uuid;
$$;
CREATE FUNCTION public.has_platform_permission(u uuid, p text) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT u='00000000-0000-0000-0000-000000000006' AND p='admin_panel.access'; $$;
CREATE FUNCTION public.is_practice_author_member(p uuid,u uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT u='00000000-0000-0000-0000-000000000005'; $$;
CREATE TABLE public.practices (
 id uuid PRIMARY KEY, status text DEFAULT 'draft', deleted_at timestamptz,
 first_published_at timestamptz, first_publication_date_unknown boolean NOT NULL DEFAULT false, scheduled_publish_at timestamptz,
 published_at timestamptz, catalog_visibility text NOT NULL,
 is_catalog_listed boolean NOT NULL DEFAULT false,
 CHECK(catalog_visibility IN ('listed','unlisted','selected_users')),
 CHECK(is_catalog_listed = (catalog_visibility='listed'))
);
CREATE TABLE public.practice_visibility_users (practice_id uuid REFERENCES practices, user_id uuid);
CREATE TABLE public.user_practices (practice_id uuid REFERENCES practices, user_id uuid, expires_at timestamptz);
CREATE TABLE public.audio_items (id uuid PRIMARY KEY, practice_id uuid REFERENCES practices, status text DEFAULT 'published');
CREATE TABLE public.music_audio_assets (id uuid PRIMARY KEY, audio_item_id uuid REFERENCES audio_items);
CREATE TABLE storage.objects (bucket_id text, name text);
ALTER TABLE practices ENABLE ROW LEVEL SECURITY;
ALTER TABLE audio_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE music_audio_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY author_read ON practices FOR SELECT TO authenticated
 USING(public.is_practice_author_member(id,auth.uid()));
GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA public,storage TO anon,authenticated,service_role;
CREATE POLICY fixture_insert ON practices FOR INSERT TO authenticated,service_role WITH CHECK(true);
CREATE POLICY fixture_update ON practices FOR UPDATE TO authenticated,service_role USING(true) WITH CHECK(true);
CREATE FUNCTION check_test(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
 BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion failed: %',message; END IF; END;
$$;
CREATE FUNCTION expect_error(command text, expected text) RETURNS void LANGUAGE plpgsql AS $$
 BEGIN
   BEGIN EXECUTE command;
   EXCEPTION WHEN OTHERS THEN
     IF SQLSTATE = expected OR position(expected IN SQLERRM)>0 THEN RETURN; END IF;
     RAISE;
   END;
   RAISE EXCEPTION 'expected rejection: %',command;
 END;
$$;
"""
base = function(schedule, 'practice_is_publicly_available') + function(schedule, 'can_current_viewer_read_practice')
base += function('20260901120100_practice_catalog_visibility_modes.sql', 'sync_practice_catalog_visibility')
base += '''CREATE TRIGGER trg_sync_practice_catalog_visibility BEFORE INSERT OR UPDATE ON practices
 FOR EACH ROW EXECUTE FUNCTION sync_practice_catalog_visibility();'''
policy_sources = [
 (schedule, 'Public can read published practices'),
 (schedule, 'Selected users can read allowlisted practices'),
 ('20260731180000_practice_moderation_mvp_schema.sql','Entitled users can read entitled practices'),
 ('20260901120100_practice_catalog_visibility_modes.sql','Public can read published audio item metadata'),
 ('20260714180000_unified_audio_product_foundation.sql','Entitled users can read audio items'),
 ('20260711071529_create_private_practice_audio_bucket.sql','Authenticated users can read entitled practice audio'),
]
base += '\n'.join(policy(f,n) for f,n in policy_sources)
fixtures = ''
# Include deleted/draft/scheduled/expired-grant legacy rows in differential tests.
for i,visibility in enumerate(['selected_users','listed','unlisted','selected_users','listed','selected_users','selected_users','selected_users'],1):
    fixtures += f"INSERT INTO practices(id,status,catalog_visibility) VALUES ('{uid(100+i)}','{'draft' if i in (1,5,8) else 'published'}','{visibility}');\n"
    fixtures += f"INSERT INTO audio_items(id,practice_id) VALUES ('{uid(100+i)}','{uid(100+i)}');\n"
    fixtures += f"INSERT INTO music_audio_assets VALUES ('{uid(100+i)}','{uid(100+i)}');\n"
    fixtures += f"INSERT INTO storage.objects VALUES ('practice-audio','practices/{uid(100+i)}/track.wav');\n"
    fixtures += f"INSERT INTO user_practices VALUES ('{uid(100+i)}','{uid(3)}',NULL);\n"
    fixtures += f"INSERT INTO practice_visibility_users VALUES ('{uid(100+i)}','{uid(4)}');\n"
fixtures += f"UPDATE practices SET deleted_at=now() WHERE id='{uid(106)}'; UPDATE practices SET scheduled_publish_at=now()+interval '1 day' WHERE id='{uid(107)}';"
fixtures += f"UPDATE practices SET first_publication_date_unknown=true WHERE id='{uid(108)}';"
fixtures += f"INSERT INTO user_practices VALUES ('{uid(104)}','{uid(2)}',now()-interval '1 day');"
# Snapshot results under actual roles before applying the migration.
base += '''CREATE TABLE snapshot(person integer, kind text, ids text);
GRANT SELECT,INSERT ON snapshot TO anon,authenticated;
'''
def session(person):
    return f"SET ROLE {'anon' if person==0 else 'authenticated'}; SET test.uid='{'' if person==0 else uid(person)}';\n"

def observations(person, compare=False):
    sql = session(person)
    queries = {
      'helper': "SELECT string_agg(id::text,',' ORDER BY id) FROM practices_fixture WHERE can_current_viewer_read_practice(id)",
      'practices': "SELECT string_agg(id::text,',' ORDER BY id) FROM practices WHERE id <> '"+uid(101)+"'",
      'audio': "SELECT string_agg(id::text,',' ORDER BY id) FROM audio_items WHERE id <> '"+uid(101)+"'",
      'storage': "SELECT string_agg(name,',' ORDER BY name) FROM storage.objects WHERE name NOT LIKE '%"+uid(101)+"%'",
    }
    for kind,q in queries.items():
        if compare:
            sql += f"SELECT check_test(({q}) IS NOT DISTINCT FROM (SELECT ids FROM snapshot WHERE person={person} AND kind='{kind}'),'unchanged {person} {kind}');\n"
        else:
            sql += f"INSERT INTO snapshot SELECT {person},'{kind}',({q});\n"
    return sql+'RESET ROLE;\n'
# Helper called against all normal IDs, independent of parent RLS.
base += "CREATE TABLE practices_fixture AS SELECT id FROM practices WITH NO DATA; GRANT SELECT ON practices_fixture TO anon,authenticated;"
fixtures += f"INSERT INTO practices_fixture SELECT id FROM practices WHERE id<>'{uid(101)}';"
before = ''.join(observations(p) for p in [0,2,3,4,5,6])
checks = f"SELECT check_test((SELECT bool_and(NOT business_only) FROM practices),'all existing rows default false');\n"
checks += f"UPDATE practices SET business_only=true WHERE id='{uid(101)}';\n"
checks += ''.join(observations(p,True) for p in [0,2,3,4,5,6])
for p in [0,2,3,4,5,6]:
    checks += session(p)+f"SELECT check_test(can_current_viewer_read_practice('{uid(101)}') IS {'TRUE' if p in (5,6) else 'FALSE'},'business draft helper persona {p}');\nRESET ROLE;\n"
# Publish after designation; even pre-existing grant/allowlist must not grant access.
checks += f"UPDATE practices SET status='published' WHERE id='{uid(101)}';\n"
for p in [0,2,3,4,5,6]:
    checks += session(p)
    for album in [102,103,104]:
        expected = album in (102,103) or p in (3,4,5,6)
        checks += f"SELECT check_test(can_current_viewer_read_practice('{uid(album)}') IS {'TRUE' if expected else 'FALSE'},'normal helper album {album} persona {p}');\n"
        checks += f"SELECT check_test((SELECT count(*)={1 if expected else 0} FROM practices WHERE id='{uid(album)}'),'normal RLS album {album} persona {p}');\n"
    checks += f"SELECT check_test(can_current_viewer_read_practice('{uid(101)}') IS {'TRUE' if p in (5,6) else 'FALSE'},'business helper persona {p}');\n"
    checks += f"SELECT check_test((SELECT count(*)={'1' if p in (5,6) else '0'} FROM practices WHERE id='{uid(101)}'),'business RLS persona {p}');\n"
    if p not in (5,6):
        for table,where in [('audio_items',f"id='{uid(101)}'"),('storage.objects',f"name LIKE '%{uid(101)}%'"),('music_audio_assets','true')]:
            checks += f"SELECT check_test((SELECT count(*)=0 FROM {table} WHERE {where}),'closed {table} persona {p}');\n"
    checks += 'RESET ROLE;\n'

def reject(command, error):
    return f"SELECT expect_error($cmd${command}$cmd$,'{error}');\n"
checks += reject(f"UPDATE practices SET business_only=false WHERE id='{uid(101)}'",'business_only_is_one_way')
for role in ['service_role','authenticated']:
    checks += f"SET ROLE {role}; SET test.uid='{uid(6)}';\n"
    checks += reject(f"UPDATE practices SET business_only=false WHERE id='{uid(101)}'",'business_only_is_one_way') if role=='service_role' else session(5)+reject(f"UPDATE practices SET business_only=false WHERE id='{uid(101)}'",'business_only_is_one_way')
    checks += 'RESET ROLE;\n'
# Catch simultaneous status/date clearing by checking OLD values as well.
checks += reject(f"UPDATE practices SET business_only=true,catalog_visibility='selected_users',status='draft' WHERE id='{uid(102)}'",'business_only_requires_never_published')
checks += f"UPDATE practices SET first_published_at=now() WHERE id='{uid(105)}';\n"
checks += reject(f"UPDATE practices SET business_only=true,first_published_at=NULL,catalog_visibility='selected_users' WHERE id='{uid(105)}'",'business_only_requires_never_published')
for visibility in ['listed','unlisted']:
    checks += reject(f"UPDATE practices SET catalog_visibility='{visibility}' WHERE id='{uid(101)}'",'23514')
    checks += reject(f"INSERT INTO practices(id,business_only,catalog_visibility) VALUES ('{uid(200)}',true,'{visibility}')",'23514')
checks += reject(f"UPDATE practices SET is_catalog_listed=true WHERE id='{uid(101)}'",'23514')
for table in ['practice_visibility_users','user_practices']:
    checks += reject(f"INSERT INTO {table}(practice_id,user_id) VALUES ('{uid(101)}','{uid(2)}')",'business_only_listener_access_forbidden')
    checks += reject(f"UPDATE {table} SET practice_id='{uid(101)}' WHERE practice_id='{uid(102)}'",'business_only_listener_access_forbidden')
checks += reject(f"UPDATE practices SET business_only=true,first_publication_date_unknown=false WHERE id='{uid(108)}'",'business_only_requires_never_published')
checks += session(5)
checks += reject(f"UPDATE practices SET business_only=true,catalog_visibility='selected_users' WHERE id='{uid(105)}'",'business_only_requires_admin')
checks += reject(f"INSERT INTO practices(id,business_only,catalog_visibility) VALUES ('{uid(200)}',true,'selected_users')",'business_only_requires_admin')
checks += 'RESET ROLE;\n'
# A SECURITY DEFINER wrapper must not give a non-admin author postgres privileges.
checks += f"CREATE FUNCTION fixture_definer_insert() RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ INSERT INTO practices(id,business_only,catalog_visibility) VALUES ('{uid(200)}',true,'selected_users'); $$;\n"
checks += session(5)+reject('SELECT fixture_definer_insert()','business_only_requires_admin')+'RESET ROLE;\n'
checks += session(6)+f"INSERT INTO practices(id,business_only,catalog_visibility) VALUES ('{uid(200)}',true,'selected_users');\nRESET ROLE;\n"
checks += f"SET ROLE service_role; INSERT INTO practices(id,business_only,catalog_visibility) VALUES ('{uid(201)}',true,'selected_users'); RESET ROLE;\n"
checks += reject(f"INSERT INTO practices(id,business_only,catalog_visibility,status) VALUES ('{uid(202)}',true,'selected_users','published')",'business_only_requires_never_published')
checks += reject(f"INSERT INTO practices(id,business_only,catalog_visibility,first_published_at) VALUES ('{uid(202)}',true,'selected_users',now())",'business_only_requires_never_published')
for table in ['practice_visibility_users','user_practices']:
    checks += f"INSERT INTO {table}(practice_id,user_id) VALUES ('{uid(102)}','{uid(3)}');\n"
rollback = (root / 'supabase/rollback' / (name+'.down.sql')).read_text()
after = "SELECT check_test(NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='practices' AND column_name='business_only'),'rollback drops column');"
after += ''.join(observations(p,True) for p in [0,2,3,4,5,6])
# Extra rows are excluded from normal snapshots after checking the rollback column.
after = after.replace("SELECT check_test(NOT EXISTS", "DELETE FROM practices WHERE id IN ('"+uid(200)+"','"+uid(201)+"'); SELECT check_test(NOT EXISTS",1)
after += "SELECT 'business-only-access: PASS';"
with tempfile.TemporaryDirectory(prefix='audiolad-business-only-') as tmp:
    data = Path(tmp) / 'data'
    subprocess.run([str(pg/'initdb'),'-U','postgres','-D',str(data),'-A','trust','--locale=C.UTF-8','--encoding=UTF8'],check=True,capture_output=True)
    blocks = [stubs,base,fixtures,before,(migrations/(name+'.sql')).read_text(),checks,rollback,after]
    # Single-user mode compiles real up/down, but internally bypasses RLS.
    compile_blocks = [stubs,base,fixtures,(migrations/(name+'.sql')).read_text(),rollback]
    sql = '\n'.join(' '.join(line for line in block.splitlines() if not line.lstrip().startswith('--')) for block in compile_blocks)+'\n'
    result = subprocess.run([str(pg/'postgres'),'--single','-D',str(data),'postgres'],input=sql,text=True,capture_output=True)
    if result.returncode or 'ERROR:' in result.stderr or 'FATAL:' in result.stderr:
        print(result.stdout,result.stderr)
        raise SystemExit(1)
    # Where sockets are allowed (CI), also exercise the real RLS executor.
    socket = Path(tmp) / 'socket'
    socket.mkdir()
    start_result = subprocess.run([str(pg/'pg_ctl'),'-D',str(data),'-l',str(Path(tmp)/'server.log'),
                    '-o',f"-c listen_addresses='' -k {socket}",'-w','start'],capture_output=True)
    reset = 'DROP SCHEMA public,auth,storage CASCADE; CREATE SCHEMA public; DROP ROLE anon,authenticated,service_role;\n'
    if start_result.returncode:
        log = (Path(tmp)/'server.log').read_text()
        if 'Operation not permitted' not in log:
            print(log)
            raise SystemExit(1)
        # PostgreSQL single-user always bypasses its RLS executor. Evaluate the
        # actual compiled pg_policy USING trees under each role in that sandbox.
        # CI MUST use the socket branch; never silently skip actual RLS in CI.
        if os.environ.get('CI'):
            raise SystemExit('CI requires Unix sockets for real RLS SELECT checks')
        evaluator = """
CREATE FUNCTION test_policy_allows(t regclass, row_data jsonb) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE predicates text; result boolean;
BEGIN
 SELECT string_agg('(' || pg_get_expr(polqual,polrelid) || ')',' OR ')
 INTO predicates FROM pg_policy
 WHERE polrelid=t AND polcmd IN ('r','*') AND polpermissive
 AND (0=ANY(polroles) OR EXISTS(SELECT 1 FROM unnest(polroles) r WHERE r<>0 AND pg_has_role(current_user,r,'MEMBER')));
 IF predicates IS NULL THEN RETURN false; END IF;
 EXECUTE format('SELECT (%s) FROM jsonb_populate_record(NULL::%s,$1) AS %I', predicates,t,
   (SELECT relname FROM pg_class WHERE oid=t)) INTO result USING row_data;
 RETURN coalesce(result,false);
END;
$$;
"""
        def explicit_policies(block):
            for table,alias in [('practices','practices'),('audio_items','audio_items'),('storage.objects','objects'),('music_audio_assets','music_audio_assets')]:
                block = block.replace('FROM '+table+' WHERE',
                    f"FROM {table} WHERE test_policy_allows('{table}',to_jsonb({alias})) AND")
            return block.replace("DELETE FROM practices WHERE test_policy_allows('practices',to_jsonb(practices)) AND", "DELETE FROM practices WHERE")
        fallback = [stubs,base,fixtures,evaluator,explicit_policies(before),
                    (migrations/(name+'.sql')).read_text(),explicit_policies(checks),rollback,explicit_policies(after)]
        sql = reset+'\n'.join(' '.join(line for line in b.splitlines() if not line.lstrip().startswith('--')) for b in fallback)+'\n'
        result = subprocess.run([str(pg/'postgres'),'--single','-D',str(data),'postgres'],input=sql,text=True,capture_output=True)
        mode = 'single-user compiled policy predicates (socket denied; actual RLS runs in CI)'
    else:
        try:
            result = subprocess.run([str(pg/'psql'),'-X','-h',str(socket),'-U','postgres','-d','postgres',
                                     '-v','ON_ERROR_STOP=1','-q'],input=reset+'\n'.join(blocks),text=True,capture_output=True)
        finally:
            subprocess.run([str(pg/'pg_ctl'),'-D',str(data),'-m','immediate','-w','stop'],check=True,capture_output=True)
        mode = 'actual RLS SELECT via Unix socket, TCP disabled'
    if result.returncode or 'ERROR:' in result.stderr or 'FATAL:' in result.stderr or 'business-only-access: PASS' not in result.stdout:
        print(result.stdout,result.stderr)
        raise SystemExit(1)
    print('business-only-access-isolated: real migration + rollback, 6 personas, legacy equivalence, grants/allowlist, one-way/admin/publication guards, sync CHECK, audio/storage RLS: PASS')
    print('RLS verification: '+mode)
