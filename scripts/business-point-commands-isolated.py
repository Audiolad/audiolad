#!/usr/bin/env python3
"""Execute real queue functions + rollback in a fresh local single-user Postgres.
No database URL, sockets, Docker, existing cluster, or production access.
"""
import os
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parent.parent
pg = Path(os.environ.get('PG_BIN', '/usr/lib/postgresql/17/bin'))
if not (pg / 'postgres').exists():
    pg = sorted(Path('/usr/lib/postgresql').glob('*/bin/postgres'),
                key=lambda p: int(p.parent.parent.name))[-1].parent
base = (root / 'supabase/migrations/20270207120000_business_point_commands.sql').read_text()
fix = (root / 'supabase/migrations/20270224120000_business_point_commands_ack_after_apply.sql').read_text()
rollback = '\n'.join(line[3:] for line in fix.split('-- Rollback:', 1)[1].splitlines() if line.startswith('-- '))
rollback = rollback[rollback.index('BEGIN;'):]
stubs = """
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-000000000001'::uuid $$;
CREATE FUNCTION public.is_business_organization_owner(uuid, uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION public.business_point_sha256(text) RETURNS text LANGUAGE sql AS $$ SELECT md5($1) $$;
CREATE TABLE public.business_organizations(id uuid PRIMARY KEY);
CREATE TABLE public.business_locations(id uuid PRIMARY KEY, organization_id uuid, status text);
CREATE TABLE public.business_players(id uuid PRIMARY KEY, organization_id uuid, status text);
CREATE TABLE public.business_zones(id uuid PRIMARY KEY, location_id uuid);
CREATE TABLE public.business_player_assignments(player_id uuid, zone_id uuid, unassigned_at timestamptz, assigned_at timestamptz);
CREATE TABLE public.business_point_sessions(id uuid PRIMARY KEY, location_id uuid, player_id uuid, token_hash text, revoked_at timestamptz, last_seen_at timestamptz);
INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000001');
INSERT INTO public.business_organizations SELECT id FROM auth.users;
INSERT INTO public.business_locations SELECT id, id, 'active' FROM auth.users;
INSERT INTO public.business_players SELECT id, id, 'active' FROM auth.users;
INSERT INTO public.business_point_sessions SELECT id, id, id, md5(repeat('a',64)), null, now() FROM auth.users;
INSERT INTO public.business_point_sessions SELECT '00000000-0000-4000-8000-000000000002', id, id, md5(repeat('b',64)), null, now() FROM auth.users;
INSERT INTO public.business_point_sessions SELECT '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003', id, md5(repeat('c',64)), null, now() FROM auth.users;
CREATE FUNCTION public.check_test(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION '%', message; END IF; END $$;
"""
checks = """
SET ROLE authenticated;
SELECT public.enqueue_business_point_command('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','next_track');
SELECT public.enqueue_business_point_command('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001','pause');
RESET ROLE;
SET ROLE anon;
CREATE TEMP TABLE first_claim AS SELECT * FROM public.claim_business_point_commands(repeat('a',64));
SELECT public.check_test((SELECT count(*)=1 FROM first_claim), 'first claim');
SELECT public.check_test((SELECT count(*)=0 FROM public.claim_business_point_commands(repeat('a',64))), 'same cookie/tab must not double claim or overtake');
SELECT public.check_test((SELECT count(*)=0 FROM public.claim_business_point_commands(repeat('b',64))), 'other session must not double claim');
SELECT public.check_test((SELECT count(*)=0 FROM public.list_business_point_commands(repeat('a',64)) WHERE id IN (SELECT id FROM first_claim)), 'list hides active lease');
RESET ROLE;
SELECT public.check_test((SELECT acked_at IS NULL AND ack_result IS NULL FROM public.business_point_commands WHERE id IN (SELECT id FROM first_claim)), 'claim must not acknowledge');
DO $$ BEGIN
  BEGIN
    PERFORM public.ack_business_point_command(repeat('b',64), id, 'applied', claim_id) FROM first_claim;
    RAISE EXCEPTION 'other session ack accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.ack_business_point_command(repeat('c',64), id, 'applied', claim_id) FROM first_claim;
    RAISE EXCEPTION 'other location ack accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
UPDATE public.business_point_commands SET claimed_at = now() - interval '31 seconds' WHERE id IN (SELECT id FROM first_claim);
DO $$ BEGIN
  BEGIN
    PERFORM public.ack_business_point_command(repeat('a',64), id, 'applied', claim_id) FROM first_claim;
    RAISE EXCEPTION 'expired lease ack accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
CREATE TEMP TABLE retry_claim AS SELECT * FROM public.claim_business_point_commands(repeat('a',64));
GRANT SELECT ON retry_claim TO anon;
SELECT public.check_test((SELECT r.id=f.id AND r.claim_id<>f.claim_id FROM retry_claim r CROSS JOIN first_claim f), 'retry must use a new fence');
DO $$ BEGIN
  BEGIN
    PERFORM public.ack_business_point_command(repeat('a',64), id, 'applied', claim_id) FROM first_claim;
    RAISE EXCEPTION 'stale tab ack accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET ROLE anon;
SELECT public.check_test((SELECT (public.ack_business_point_command(repeat('a',64), id, 'applied', claim_id)->>'already')::boolean=false FROM retry_claim), 'post-apply ack');
SELECT public.check_test((SELECT (public.ack_business_point_command(repeat('a',64), id, 'applied', claim_id)->>'already')::boolean=true FROM retry_claim), 'ack retry idempotent');
RESET ROLE;
SELECT public.check_test((SELECT acked_at IS NOT NULL AND ack_result='applied' FROM public.business_point_commands WHERE id IN (SELECT id FROM first_claim)), 'applied only after ack');
CREATE TEMP TABLE second_claim AS SELECT * FROM public.claim_business_point_commands(repeat('b',64));
SELECT public.check_test((SELECT count(*)=1 FROM second_claim), 'later command follows ack');
UPDATE public.business_point_commands SET expires_at = now() - interval '1 second' WHERE id IN (SELECT id FROM second_claim);
DO $$ BEGIN
  BEGIN
    PERFORM public.ack_business_point_command(repeat('b',64), id, 'applied', claim_id) FROM second_claim;
    RAISE EXCEPTION 'expired command ack accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SELECT public.check_test((SELECT count(*)=0 FROM public.claim_business_point_commands(repeat('b',64))), 'expired command never reclaimed');
SELECT public.check_test((SELECT count(*)=0 FROM public.claim_business_point_commands('invalid')), 'invalid token');
UPDATE public.business_point_sessions SET revoked_at=now() WHERE token_hash=md5(repeat('a',64));
SELECT public.check_test((SELECT count(*)=0 FROM public.claim_business_point_commands(repeat('a',64))), 'revoked session');
DO $$ BEGIN
  BEGIN
    PERFORM public.ack_business_point_command(repeat('a',64), id, 'applied', claim_id) FROM retry_claim;
    RAISE EXCEPTION 'revoked session ack accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT public.check_test(has_function_privilege('anon','public.ack_business_point_command(text,uuid,text,uuid)','EXECUTE'), 'device ack grant');
SELECT public.check_test(NOT has_table_privilege('authenticated','public.business_point_commands','INSERT'), 'owner cannot forge ack via insert');
SELECT public.check_test(NOT has_table_privilege('authenticated','public.business_point_commands','UPDATE'), 'owner cannot ack via update');
SELECT public.check_test(to_regprocedure('public.ack_business_point_command(text,uuid,text)') IS NULL, 'legacy ack removed');
SELECT 'business-point-commands: PASS';
"""
after_rollback = """
SELECT public.check_test((SELECT count(*)=2 FROM public.business_point_commands), 'rollback preserves rows');
SELECT public.check_test(to_regprocedure('public.ack_business_point_command(text,uuid,text)') IS NOT NULL, 'rollback restores old signature');
SELECT public.check_test(NOT EXISTS(SELECT FROM information_schema.columns WHERE table_name='business_point_commands' AND column_name='claim_id'), 'rollback removes new columns');
SELECT 'business-point-commands rollback: PASS';
"""
with tempfile.TemporaryDirectory(prefix='audiolad-command-test-') as tmp:
    data = Path(tmp) / 'data'
    subprocess.run([str(pg / 'initdb'), '-D', str(data), '-A', 'trust', '--locale=C.UTF-8', '--encoding=UTF8'], check=True, capture_output=True)
    blocks = [stubs, base.split('COMMIT;')[0]+'COMMIT;', fix.split('COMMIT;')[0]+'COMMIT;', checks, rollback, after_rollback, fix.split('COMMIT;')[0]+'COMMIT;']
    sql = '\n'.join(' '.join(line for line in block.splitlines() if not line.lstrip().startswith('--')) for block in blocks)+'\n'
    result = subprocess.run([str(pg / 'postgres'), '--single', '-D', str(data), 'postgres'], input=sql, text=True, capture_output=True)
    if result.returncode or 'ERROR:' in result.stderr or 'FATAL:' in result.stderr or 'business-point-commands rollback: PASS' not in result.stdout:
        print(result.stdout, result.stderr)
        raise SystemExit(1)
    print('business-point-commands-isolated: claim/ack, same-cookie polls, competing sessions, lease retry, stale ack, expiration, revocation, RBAC, rollback+reapply: PASS')
