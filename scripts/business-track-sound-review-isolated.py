"""Fresh PostgreSQL under /tmp, private Unix socket only; no external DB/host."""
import os
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
pg = Path(os.environ.get('PG_BIN', '/usr/lib/postgresql/17/bin'))
setup = """
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
-- Match Supabase's permissive default grants: the migration must explicitly revoke them.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
CREATE FUNCTION public.has_platform_permission(id uuid, permission text) RETURNS boolean
 LANGUAGE sql STABLE AS $$ SELECT id = '11111111-1111-4111-a111-111111111111'::uuid $$;
CREATE TABLE authors(id uuid PRIMARY KEY, name text);
CREATE TABLE practices(id uuid PRIMARY KEY, author_id uuid REFERENCES authors(id), title text,
 product_kind text, status text, catalog_visibility text, deleted_at timestamptz);
CREATE TABLE audio_items(id uuid PRIMARY KEY, practice_id uuid REFERENCES practices(id), title text,
 duration_seconds integer, status text, audio_path text, desired_music_master_asset_id uuid,
 active_music_delivery_asset_id uuid, analysis jsonb);
CREATE TABLE business_space_admissions(space_id text, audio_item_id uuid, PRIMARY KEY(space_id, audio_item_id));
CREATE TABLE business_locations(id uuid PRIMARY KEY, business_category text);
CREATE TABLE business_programs(id uuid PRIMARY KEY, kind text);
CREATE TABLE business_program_items(program_id uuid, audio_item_id uuid, excluded_at timestamptz);
CREATE TABLE public.business_track_eligibility_reviews(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 audio_item_id uuid, decision text, created_at timestamptz DEFAULT now());
CREATE FUNCTION public.resolve_business_track_eligibility_v1(p_audio_item_id uuid, p_location_id uuid,
 p_zone_id uuid DEFAULT NULL, p_use_type text DEFAULT 'business_background_playback', p_as_of timestamptz DEFAULT now())
 RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('audio_item_id', p_audio_item_id,
 'decision', coalesce(nullif(current_setting('test.legal_decision', true), ''), 'ELIGIBLE'),
 'reason_codes', jsonb_build_array('LEGAL_STUB')) $$;
GRANT SELECT ON audio_items, practices TO anon, authenticated;
"""
admissions = (root / 'supabase/migrations/20270131120000_business_manual_admissions.sql').read_text()
migration = (root / 'supabase/migrations/20270201120000_business_track_sound_reviews.sql').read_text()
smoke = (root / 'supabase/tests/business_track_sound_reviews_smoke.sql').read_text()
with tempfile.TemporaryDirectory(prefix='audiolad-sound-review-') as scratch:
    data = Path(scratch) / 'data'
    subprocess.run([str(pg / 'initdb'), '-D', str(data), '-A', 'trust', '--locale=C.UTF-8', '--encoding=UTF8'],
                   check=True, capture_output=True)
    # Single-user mode bypasses RLS, so use a private socket, with TCP disabled.
    started = subprocess.run([str(pg / 'pg_ctl'), '-D', str(data), '-l', str(Path(scratch) / 'log'),
                    '-o', f"-k {scratch} -c listen_addresses='' -p 55496", '-w', 'start'], capture_output=True, text=True)
    if started.returncode:
        log = (Path(scratch) / 'log').read_text()
        if 'Operation not permitted' not in log:
            print(log)
            raise SystemExit(1)
        # Restricted Codex sandboxes disallow even Unix sockets. Still execute all
        # SQL and RPC authorization tests; RLS visibility needs the socket mode.
        texts = [setup, admissions, migration, migration, "SET test.single_user = 'on';", smoke]
        sql = '\n'.join(' '.join(line for line in text.splitlines() if not line.lstrip().startswith('--'))
                        for text in texts) + '\n'
        result = subprocess.run([str(pg / 'postgres'), '--single', '-D', str(data), 'postgres'],
                                input=sql, text=True, capture_output=True)
        mode = 'single-user fallback: RLS policy/ACL assertions only (socket forbidden)'
    else:
        try:
            result = subprocess.run([str(pg / 'psql'), '-X', '-h', scratch, '-p', '55496', '-d', 'postgres',
                                     '-v', 'ON_ERROR_STOP=1'], input='\n'.join([setup, admissions, migration, migration, smoke]), text=True, capture_output=True)
        finally:
            subprocess.run([str(pg / 'pg_ctl'), '-D', str(data), '-m', 'fast', '-w', 'stop'], check=True, capture_output=True)
        mode = 'private Unix socket: full RLS visibility tests'
    if result.returncode or 'ERROR:' in result.stderr or 'SOUND_REVIEW_OK' not in result.stdout:
        print(result.stdout, result.stderr)
        raise SystemExit(1)
    print(f'PASS ({mode}): migration twice, RBAC, audit, queue, gates, replacement, reanalysis, public catalogue.')
