#!/usr/bin/env node
// 8dcba9d1 PR 1: Business consents must never be recorded from a platform-owner support session.
// Contract checks + real PostgreSQL scenarios in an EXPLICIT disposable test container only
// (same harness contract as business-rightsholder-onboarding-sql-unit.mjs; never a production URL).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const base = read('supabase/migrations/20270101120000_business_rightsholder_onboarding.sql');
const providers = read('supabase/migrations/20270102120000_business_rightsholder_providers.sql');
const sunoSingleLink = read('supabase/migrations/20270103120000_business_rightsholder_suno_single_link.sql');
const migration = read('supabase/migrations/20270105120000_business_consents_block_support_mode.sql');
const rollback = read('docs/business/consents-support-mode-block-8dcba9d1-rollback.sql');
const clean = migration.replace(/--[^\n]*/g, '');

// ---- Contract: function-only, additive, guard first, body otherwise identical.
assert.match(clean, /^\s*BEGIN;/);
assert.match(clean, /COMMIT;\s*$/);
const outsideFunctions = clean.replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/g, '');
assert.doesNotMatch(outsideFunctions, /\b(ALTER\s+TABLE|DROP\s|INSERT\s+INTO|UPDATE\s|DELETE\s+FROM|TRUNCATE|GRANT\s|CREATE\s+(TABLE|POLICY|TRIGGER|INDEX))/i, 'function-only: no DDL/DML/grants outside function bodies');
const fns = [...clean.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
assert.deepEqual(fns.sort(), ['business_consent_caller_in_support_mode', 'business_onboarding_consents']);
for (const body of clean.matchAll(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/g)) {
  assert.match(body[0], /SECURITY DEFINER/);
  assert.match(body[0], /SET search_path = public, pg_temp/);
}
assert.match(clean, /REVOKE ALL ON FUNCTION public\.business_consent_caller_in_support_mode\(\) FROM PUBLIC, anon, authenticated, service_role;/);
const fnOf = (text) => text.match(/CREATE OR REPLACE FUNCTION public\.business_onboarding_consents\([\s\S]*?\$\$;/)[0];
const guarded = fnOf(migration);
const original = fnOf(base);
const guardBlock = /\n  -- 20270105120000:[^\n]*\n  -- Checked[^\n]*\n  IF public\.business_consent_caller_in_support_mode\(\) THEN\n    RAISE EXCEPTION 'support_mode_consent_forbidden' USING ERRCODE = '42501';\n  END IF;/;
assert.match(guarded, guardBlock, 'guard present');
assert.equal(guarded.replace(guardBlock, ''), original, 'only the guard is added; body identical to 20270101120000');
assert.ok(guarded.indexOf('support_mode_consent_forbidden') < guarded.indexOf('business_program_documents_not_published'), 'guard runs first');
assert.equal(fnOf(rollback), original, 'rollback restores the original body verbatim');
assert.match(rollback, /DROP FUNCTION IF EXISTS public\.business_consent_caller_in_support_mode\(\);/);
const pkg = JSON.parse(read('package.json'));
assert.ok(pkg.scripts['test:support-consent-block'].includes('business-consents-support-mode-sql-unit.mjs'));
assert.match(read('.github/workflows/business-pr-validation.yml'), /npm run test:support-consent-block/);

const stub = read('scripts/lib/business-rights-eligibility-sql-stub.sql') + `
CREATE TABLE public.profiles(id uuid PRIMARY KEY, role text);
CREATE TABLE public.platform_user_roles(user_id uuid, role_code text);
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, metadata jsonb, UNIQUE(bucket_id,name));
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
-- Minimal copy of public.author_support_sessions (20260902120200) for the helper.
CREATE TABLE public.author_support_sessions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_hash text NOT NULL UNIQUE,
  actor_user_id uuid NOT NULL, acting_user_id uuid NOT NULL, acting_author_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, revoked_at timestamptz NULL);
REVOKE ALL ON public.author_support_sessions FROM PUBLIC, anon, authenticated;
`;

const scenario = String.raw`
CREATE SCHEMA scm_test;
CREATE FUNCTION scm_test.expect_error(command text, expected text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN EXECUTE command;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%' || expected || '%' THEN RAISE EXCEPTION 'expected %, got %: %',expected,SQLERRM,command; END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'expected error %, succeeded: %', expected, command;
END $f$;
CREATE FUNCTION scm_test.check_true(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion failed: %', message; END IF; END $f$;
GRANT USAGE ON SCHEMA scm_test TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA scm_test TO authenticated;

-- A = staff member who is ALSO an owner of an author space (e.g. the platform owner's own music);
-- B = another author A is accompanying in support mode; M = moderator.
INSERT INTO auth.users(id) VALUES ('00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-00000000000b'),('00000000-0000-0000-0000-00000000000c');
INSERT INTO public.profiles VALUES ('00000000-0000-0000-0000-00000000000a','listener'),('00000000-0000-0000-0000-00000000000b','listener'),('00000000-0000-0000-0000-00000000000c','platform_admin');
INSERT INTO public.authors(id,slug) VALUES ('10000000-0000-0000-0000-00000000000a','space-a'),('10000000-0000-0000-0000-00000000000b','space-b');
INSERT INTO public.author_members(author_id,user_id,role) VALUES
 ('10000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000a','owner'),
 ('10000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000b','owner');
INSERT INTO public.practices(id,author_id,slug,status) VALUES
 ('20000000-0000-0000-0000-00000000000a','10000000-0000-0000-0000-00000000000a','prod-a','published'),
 ('20000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-00000000000b','prod-b','published');
INSERT INTO public.audio_items(id,practice_id,title) VALUES
 ('30000000-0000-0000-0000-00000000000a','20000000-0000-0000-0000-00000000000a','Track A'),
 ('30000000-0000-0000-0000-00000000000b','20000000-0000-0000-0000-00000000000b','Track B');
-- Test-only fixtures (NOT legal documents).
INSERT INTO public.business_program_document_versions(document_key,version,content_hash,content_text,published_at,is_current)
  VALUES('business_program_terms','test-v1',repeat('c',64),'NOT A LEGAL DOCUMENT',now(),true),
  ('business_music_rights_declaration','test-v1',repeat('d',64),'NOT A LEGAL DOCUMENT',now(),true);

DO $test$
DECLARE v uuid; e1 public.business_verification_evidence; e2 public.business_verification_evidence; s text; sess uuid;
  optin text := 'SELECT public.author_business_product_optin(ARRAY[''20000000-0000-0000-0000-00000000000a'']::uuid[],true,true,''test-v1'',''test-v1'')';
BEGIN
  PERFORM set_config('request.jwt.claim.role','authenticated',false);
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
  SET LOCAL ROLE authenticated;
  -- Helper is internal: not callable by clients.
  PERFORM scm_test.expect_error('SELECT public.business_consent_caller_in_support_mode()','permission denied');
  EXECUTE 'SELECT public.author_business_verification_draft_v2(''20000000-0000-0000-0000-00000000000a'',''30000000-0000-0000-0000-00000000000a'',''suno'',NULL,''Spa'',''https://suno.com/s/abc'',''{"paid_plan":"Pro"}''::jsonb)' INTO v;
  e1 := public.author_business_evidence_reserve(v,'generation','image/png',100,repeat('a',64));
  e2 := public.author_business_evidence_reserve(v,'paid_period','application/pdf',200,repeat('b',64));
  INSERT INTO storage.objects(bucket_id,name,metadata) VALUES
    ('business-rightsholder-evidence',e1.object_path,'{"mimetype":"image/png","size":100}'),
    ('business-rightsholder-evidence',e2.object_path,'{"mimetype":"application/pdf","size":200}');
  s := format('SELECT public.author_business_verification_submit_v2(%L,ARRAY[%L,%L]::uuid[],true,true,''test-v1'',''test-v1'')',v,e1.id,e2.id);
  RESET ROLE;

  -- 1) Open support session (A accompanies B) blocks A's consents, even for A's own space; v1 submit too.
  INSERT INTO public.author_support_sessions(token_hash,actor_user_id,acting_user_id,acting_author_id,expires_at)
    VALUES(repeat('e',64),'00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-00000000000b',now() + interval '1 hour')
    RETURNING id INTO sess;
  SET LOCAL ROLE authenticated;
  PERFORM scm_test.expect_error(s,'support_mode_consent_forbidden');
  PERFORM scm_test.expect_error(replace(s,'submit_v2','submit'),'support_mode_consent_forbidden');
  -- Unticked boxes do not mask the support error (guard runs first).
  PERFORM scm_test.expect_error(replace(s,'true,true','false,false'),'support_mode_consent_forbidden');
  RESET ROLE;
  PERFORM scm_test.check_true((SELECT count(*) = 0 FROM public.business_legal_consents),'no consent recorded in support mode');
  PERFORM scm_test.check_true((SELECT count(*) = 0 FROM public.business_rightsholder_verification_attempts),'no attempt recorded in support mode');
  PERFORM scm_test.check_true((SELECT status = 'draft' FROM public.business_rightsholder_verifications WHERE id = v),'case stays draft');

  -- 2) Revoked session, but the request still carries a support proof (GUC or PostgREST header) → blocked.
  UPDATE public.author_support_sessions SET revoked_at = now() WHERE id = sess;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('audiolad.author_support_token_hash',repeat('e',64),true);
  PERFORM scm_test.expect_error(s,'support_mode_consent_forbidden');
  PERFORM set_config('audiolad.author_support_token_hash','',true);
  PERFORM set_config('request.headers','{"x-audiolad-support-proof":"' || repeat('e',64) || '"}',true);
  PERFORM scm_test.expect_error(s,'support_mode_consent_forbidden');
  PERFORM set_config('request.headers','{}',true);
  RESET ROLE;

  -- 3) Expired session: no longer support mode. The author's own click records consents as the author.
  UPDATE public.author_support_sessions SET revoked_at = NULL, expires_at = now() - interval '1 second', created_at = now() - interval '2 hours' WHERE id = sess;
  SET LOCAL ROLE authenticated;
  EXECUTE s;
  RESET ROLE;
  PERFORM scm_test.check_true((SELECT count(*) = 2 AND bool_and(user_id = '00000000-0000-0000-0000-00000000000a' AND owner_user_id = user_id) FROM public.business_legal_consents),'consents recorded for the real signed-in owner only');

  -- 4) Product opt-in (also a consent path) is blocked while a session is open.
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
  SET LOCAL ROLE authenticated;
  PERFORM public.moderator_business_verification_action(v,'approve','ok',NULL,'Synthetic A','person');
  RESET ROLE;
  INSERT INTO public.author_support_sessions(token_hash,actor_user_id,acting_user_id,acting_author_id,expires_at)
    VALUES(repeat('f',64),'00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000b','10000000-0000-0000-0000-00000000000b',now() + interval '1 hour')
    RETURNING id INTO sess;
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
  SET LOCAL ROLE authenticated;
  PERFORM scm_test.expect_error(optin,'support_mode_consent_forbidden');
  RESET ROLE;
  PERFORM scm_test.check_true((SELECT count(*) = 0 FROM public.business_product_optins),'no opt-in in support mode');
  UPDATE public.author_support_sessions SET revoked_at = now() WHERE id = sess;
  SET LOCAL ROLE authenticated;
  EXECUTE optin;
  RESET ROLE;
  PERFORM scm_test.check_true((SELECT count(*) = 1 FROM public.business_product_optins),'opt-in after the session ended');

  PERFORM scm_test.check_true((SELECT count(*) = 4 FROM public.business_legal_consents),'four consents total');
  -- 5) A session of ANOTHER actor never blocks this user: B is not in support mode while A accompanies B.
  UPDATE public.author_support_sessions SET revoked_at = NULL WHERE id = sess;
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
  PERFORM scm_test.check_true(public.business_consent_caller_in_support_mode() = false,'acting author is not the actor');
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
  PERFORM scm_test.check_true(public.business_consent_caller_in_support_mode() = true,'actor with open session');
  UPDATE public.author_support_sessions SET revoked_at = now() WHERE id = sess;
END $test$;
`;

const container = process.env.AUDIOLAD_ONBOARDING_TEST_CONTAINER;
if (process.env.AUDIOLAD_SKIP_ISOLATED_SQL === '1' || !container) {
  assert.notEqual(process.env.AUDIOLAD_REQUIRE_ONBOARDING_SQL, '1', 'isolated SQL required; provide disposable test container');
  console.log('business-consents-support-mode-sql-unit: contract OK; SQL scenarios SKIPPED (no explicit disposable container)');
} else {
  assert.match(container, /^audiolad-onboarding-test-[a-z0-9-]+$/, 'refusing non-test container');
  const db = `scm_test_${process.pid}_${Date.now()}`;
  const psql = (database, input, stdio = ['pipe', 'pipe', 'inherit']) =>
    execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-q', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'], { input, stdio });
  psql('postgres', `CREATE DATABASE ${db};`);
  try {
    const setup = [stub, read('supabase/migrations/20261205120000_music_rights_foundation.sql'),
      read('supabase/migrations/20261206120200_business_rights_eligibility.sql'), base, providers, sunoSingleLink].join('\n');
    // Applied twice: idempotent.
    psql(db, [setup, migration, migration, scenario].join('\n'));
    // Rollback restores the previous behaviour (no support guard), then re-apply blocks again.
    psql(db, [rollback,
      "SELECT 1 / CASE WHEN to_regprocedure('public.business_consent_caller_in_support_mode()') IS NULL THEN 1 ELSE 0 END;",
      "SELECT 1 / CASE WHEN pg_get_functiondef('public.business_onboarding_consents(uuid,uuid,text,jsonb,jsonb,boolean,boolean,text,text,inet,text)'::regprocedure) NOT LIKE '%support_mode_consent_forbidden%' THEN 1 ELSE 0 END;",
      migration,
      "SELECT 1 / CASE WHEN pg_get_functiondef('public.business_onboarding_consents(uuid,uuid,text,jsonb,jsonb,boolean,boolean,text,text,inet,text)'::regprocedure) LIKE '%support_mode_consent_forbidden%' THEN 1 ELSE 0 END;",
      "SELECT 1 / CASE WHEN count(*) = 4 THEN 1 ELSE 0 END FROM public.business_legal_consents;"].join('\n'));
    console.log('business-consents-support-mode-sql-unit: contract + isolated PostgreSQL scenarios OK');
  } finally {
    psql('postgres', `DROP DATABASE ${db};`);
  }
}
