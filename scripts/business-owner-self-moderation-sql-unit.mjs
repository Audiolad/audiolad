#!/usr/bin/env node
// 8d9cd0af P0: the platform owner may moderate the Business case / products of his OWN author spaces;
// regular admins still may not self-moderate; others' cases and support mode are unchanged.
// Contract checks + real PostgreSQL scenarios in an EXPLICIT disposable test container only
// (same harness contract as business-consents-support-mode-sql-unit.mjs; never a production URL).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const base = read('supabase/migrations/20270101120000_business_rightsholder_onboarding.sql');
const providers = read('supabase/migrations/20270102120000_business_rightsholder_providers.sql');
const sunoSingleLink = read('supabase/migrations/20270103120000_business_rightsholder_suno_single_link.sql');
const supportBlock = read('supabase/migrations/20270105120000_business_consents_block_support_mode.sql');
const migration = read('supabase/migrations/20270107120000_business_owner_self_moderation.sql');
const rollback = read('docs/business/owner-self-moderation-8d9cd0af-rollback.sql');
const rbac = read('supabase/migrations/20260725120000_platform_rbac_foundation.sql');
const clean = migration.replace(/--[^\n]*/g, '');

// ---- Contract: function-only, additive, one guard changed per RPC, bodies otherwise identical.
assert.match(clean, /^\s*BEGIN;/);
assert.match(clean, /COMMIT;\s*$/);
const outsideFunctions = clean.replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/g, '');
assert.doesNotMatch(outsideFunctions, /\b(ALTER\s|DROP\s|INSERT\s+INTO|UPDATE\s|DELETE\s+FROM|TRUNCATE|GRANT\s|CREATE\s+(TABLE|POLICY|TRIGGER|INDEX|ROLE))/i, 'function-only: no DDL/DML/grants outside function bodies');
const fns = [...clean.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
assert.deepEqual(fns.sort(), ['business_moderation_owner_self_allowed', 'moderator_business_suspend_product', 'moderator_business_verification_action']);
for (const forbidden of ['business_onboarding_is_moderator', 'business_onboarding_consents', 'business_consent_caller_in_support_mode', 'is_platform_owner', 'business_onboarding_storage_access']) {
  assert.doesNotMatch(clean, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${forbidden}\\(`), `${forbidden} untouched`);
}
for (const body of clean.matchAll(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/g)) {
  assert.match(body[0], /SECURITY DEFINER/);
  assert.match(body[0], /SET search_path = public, pg_temp/);
}
assert.match(clean, /REVOKE ALL ON FUNCTION public\.business_moderation_owner_self_allowed\(\) FROM PUBLIC, anon, authenticated, service_role;/);
const helper = clean.match(/CREATE OR REPLACE FUNCTION public\.business_moderation_owner_self_allowed\(\)[\s\S]*?\$\$;/)[0];
assert.match(helper, /public\.is_platform_owner\(auth\.uid\(\)\)/, 'owner identity = existing is_platform_owner');
assert.match(helper, /NOT coalesce\(public\.business_consent_caller_in_support_mode\(\), true\)/, 'fail-closed outside support mode');
assert.doesNotMatch(helper, /'admin'|platform_admin/, 'regular admins never qualify');

const fnOf = (text, name) => text.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`))[0];
const vaOld = "  IF v_owner = auth.uid() THEN RAISE EXCEPTION 'business_self_moderation_forbidden' USING ERRCODE = '42501'; END IF;";
const vaNew = "  -- 20270107120000: self-moderation stays forbidden, except for the platform owner outside support mode.\n  IF v_owner = auth.uid() AND NOT public.business_moderation_owner_self_allowed() THEN\n    RAISE EXCEPTION 'business_self_moderation_forbidden' USING ERRCODE = '42501';\n  END IF;";
const spOld = "  IF EXISTS (SELECT 1 FROM public.author_members WHERE author_id = v_author AND user_id = auth.uid() AND role = 'owner') THEN\n";
const spNew = "  -- 20270107120000: self-moderation stays forbidden, except for the platform owner outside support mode.\n  IF EXISTS (SELECT 1 FROM public.author_members WHERE author_id = v_author AND user_id = auth.uid() AND role = 'owner')\n    AND NOT public.business_moderation_owner_self_allowed() THEN\n";
for (const [name, oldGuard, newGuard] of [
  ['moderator_business_verification_action', vaOld, vaNew],
  ['moderator_business_suspend_product', spOld, spNew],
]) {
  const original = fnOf(base, name);
  const changed = fnOf(migration, name);
  assert.ok(original.includes(oldGuard), `${name}: original guard found`);
  assert.equal(changed, original.replace(oldGuard, newGuard), `${name}: only the self-moderation guard changed`);
  assert.ok(changed.indexOf('business_moderator_required') < changed.indexOf('business_self_moderation_forbidden'), `${name}: moderator check still first`);
  assert.ok(changed.indexOf('business_moderation_reason_required') < changed.indexOf('business_self_moderation_forbidden'), `${name}: reason still required`);
  assert.match(changed, /business_moderation_reason_required/);
  assert.equal(fnOf(rollback, name), original, `${name}: rollback restores the original body verbatim`);
}
assert.match(fnOf(migration, 'moderator_business_verification_action'), /INSERT INTO public\.business_rightsholder_moderation_audit/, 'audit row kept');
assert.match(rollback, /DROP FUNCTION IF EXISTS public\.business_moderation_owner_self_allowed\(\);/);
const pkg = JSON.parse(read('package.json'));
assert.ok(pkg.scripts['test:business-owner-self-moderation'].includes('business-owner-self-moderation-sql-unit.mjs'));
assert.match(read('.github/workflows/business-pr-validation.yml'), /npm run test:business-owner-self-moderation/);

const isPlatformOwner = rbac.match(/CREATE OR REPLACE FUNCTION public\.is_platform_owner\([\s\S]*?\$\$;/)[0];
const stub = read('scripts/lib/business-rights-eligibility-sql-stub.sql') + `
CREATE TABLE public.profiles(id uuid PRIMARY KEY, role text);
CREATE TABLE public.platform_user_roles(user_id uuid, role_code text);
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, metadata jsonb, UNIQUE(bucket_id,name));
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
-- Minimal copy of public.author_support_sessions (20260902120200) for the support-mode helper.
CREATE TABLE public.author_support_sessions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token_hash text NOT NULL UNIQUE,
  actor_user_id uuid NOT NULL, acting_user_id uuid NOT NULL, acting_author_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, revoked_at timestamptz NULL);
REVOKE ALL ON public.author_support_sessions FROM PUBLIC, anon, authenticated;
-- Real platform-owner identity (20260725120000), unchanged.
${isPlatformOwner}
`;

// O = platform owner via RBAC 'owner' (like Sergey: owner of Jazz Relax / Аурафон spaces);
// L = platform owner via legacy profiles.role only; A = regular RBAC admin; P = legacy platform_admin;
// E = editor (not a Business moderator); B = ordinary author.
const U = (c) => `00000000-0000-0000-0000-00000000000${c}`;
const S = (c) => `10000000-0000-0000-0000-00000000000${c}`;
const P = (c) => `20000000-0000-0000-0000-00000000000${c}`;
const T = (c) => `30000000-0000-0000-0000-00000000000${c}`;
const people = ['a', 'b', 'c', 'd', 'e', 'f'];
const [O, L, A, PA, E, B] = people;
const scenario = String.raw`
CREATE SCHEMA osm_test;
CREATE FUNCTION osm_test.expect_error(command text, expected text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN EXECUTE command;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%' || expected || '%' THEN RAISE EXCEPTION 'expected %, got %: %',expected,SQLERRM,command; END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'expected error %, succeeded: %', expected, command;
END $f$;
CREATE FUNCTION osm_test.check_true(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion failed: %', message; END IF; END $f$;
CREATE FUNCTION osm_test.as_user(u text) RETURNS void LANGUAGE sql AS $f$
  SELECT set_config('request.jwt.claim.role','authenticated',false), set_config('request.jwt.claim.sub',u,false);
$f$;
-- Applicant flow as the CURRENT authenticated user: draft → two evidence files → submit (with consents).
CREATE FUNCTION osm_test.submit(p uuid, a uuid) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v uuid; e1 public.business_verification_evidence; e2 public.business_verification_evidence;
BEGIN
  v := public.author_business_verification_draft_v2(p,a,'suno',NULL,'Spa','https://suno.com/s/abc','{"paid_plan":"Pro"}'::jsonb);
  e1 := public.author_business_evidence_reserve(v,'generation','image/png',100,repeat('a',64));
  e2 := public.author_business_evidence_reserve(v,'paid_period','application/pdf',200,repeat('b',64));
  INSERT INTO storage.objects(bucket_id,name,metadata) VALUES
    ('business-rightsholder-evidence',e1.object_path,'{"mimetype":"image/png","size":100}'),
    ('business-rightsholder-evidence',e2.object_path,'{"mimetype":"application/pdf","size":200}');
  PERFORM public.author_business_verification_submit_v2(v,ARRAY[e1.id,e2.id],true,true,'test-v1','test-v1');
  RETURN v;
END $f$;
GRANT USAGE ON SCHEMA osm_test TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA osm_test TO authenticated;

INSERT INTO auth.users(id) VALUES ${people.map((c) => `('${U(c)}')`).join(',')};
INSERT INTO public.profiles VALUES ('${U(O)}','platform_owner'),('${U(L)}','platform_owner'),('${U(A)}','listener'),
  ('${U(PA)}','platform_admin'),('${U(E)}','listener'),('${U(B)}','listener');
-- O has the RBAC owner role; L is a legacy-only owner (profiles.role) and has NO RBAC row.
DELETE FROM public.profiles WHERE id = '${U(O)}'; INSERT INTO public.profiles VALUES ('${U(O)}','listener');
INSERT INTO public.platform_user_roles VALUES ('${U(O)}','owner'),('${U(A)}','admin'),('${U(E)}','editor');
INSERT INTO public.authors(id,slug) VALUES ${people.map((c) => `('${S(c)}','space-${c}')`).join(',')};
INSERT INTO public.author_members(author_id,user_id,role) VALUES ${people.map((c) => `('${S(c)}','${U(c)}','owner')`).join(',')};
INSERT INTO public.practices(id,author_id,slug,status) VALUES ${people.map((c) => `('${P(c)}','${S(c)}','prod-${c}','published')`).join(',')};
INSERT INTO public.audio_items(id,practice_id,title) VALUES ${people.map((c) => `('${T(c)}','${P(c)}','Track ${c}')`).join(',')};
-- Test-only fixtures (NOT legal documents).
INSERT INTO public.business_program_document_versions(document_key,version,content_hash,content_text,published_at,is_current)
  VALUES('business_program_terms','test-v1',repeat('c',64),'NOT A LEGAL DOCUMENT',now(),true),
  ('business_music_rights_declaration','test-v1',repeat('d',64),'NOT A LEGAL DOCUMENT',now(),true);

DO $test$
DECLARE vo uuid; va uuid; vb uuid; sess uuid; n_audit int;
BEGIN
  -- Applicants: O (owner), A (regular admin), B (ordinary author) each submit one case.
  PERFORM osm_test.as_user('${U(O)}'); SET LOCAL ROLE authenticated; vo := osm_test.submit('${P(O)}','${T(O)}'); RESET ROLE;
  PERFORM osm_test.as_user('${U(A)}'); SET LOCAL ROLE authenticated; va := osm_test.submit('${P(A)}','${T(A)}'); RESET ROLE;
  PERFORM osm_test.as_user('${U(B)}'); SET LOCAL ROLE authenticated; vb := osm_test.submit('${P(B)}','${T(B)}'); RESET ROLE;

  -- 0) The helper is internal: not callable by clients.
  PERFORM osm_test.as_user('${U(O)}'); SET LOCAL ROLE authenticated;
  PERFORM osm_test.expect_error('SELECT public.business_moderation_owner_self_allowed()','permission denied');

  -- 1) PASS: platform owner moderates his OWN case. Reason is still required; audit row is written as O.
  PERFORM osm_test.expect_error(format('SELECT public.moderator_business_verification_action(%L,''approve'','' '',NULL,''Owner'',''person'')',vo),'business_moderation_reason_required');
  PERFORM public.moderator_business_verification_action(vo,'approve','Own catalog: evidence checked',NULL,'Synthetic Owner','person');
  PERFORM public.moderator_business_verification_action(vo,'restrict','Own catalog: temporary restriction');
  RESET ROLE;
  PERFORM osm_test.check_true((SELECT status = 'restricted' FROM public.business_rightsholder_verifications WHERE id = vo),'owner self-moderation applied');
  PERFORM osm_test.check_true((SELECT count(*) = 2 AND bool_and(actor_user_id = '${U(O)}') FROM public.business_rightsholder_moderation_audit WHERE verification_id = vo),'self-moderation audited under the owner');

  -- 2) PASS: platform owner suspends his OWN product/track (reason still required).
  SET LOCAL ROLE authenticated;
  PERFORM osm_test.expect_error('SELECT public.moderator_business_suspend_product(''${P(O)}'',''${T(O)}'','''')','business_moderation_reason_required');
  PERFORM public.moderator_business_suspend_product('${P(O)}','${T(O)}','Own catalog: disputed track');
  PERFORM osm_test.expect_error('SELECT public.moderator_business_suspend_product(''${P(O)}'',''${T(B)}'',''x'')','business_track_not_in_product');
  RESET ROLE;
  PERFORM osm_test.check_true((SELECT count(*) = 1 FROM public.business_onboarding_suspensions WHERE product_id = '${P(O)}' AND actor_user_id = '${U(O)}'),'owner self-suspension recorded');

  -- 3) PASS: legacy-only owner (profiles.role = platform_owner) is the same identity (is_platform_owner).
  PERFORM osm_test.as_user('${U(L)}'); SET LOCAL ROLE authenticated;
  PERFORM public.moderator_business_suspend_product('${P(L)}',NULL,'Own catalog (legacy owner)');
  RESET ROLE;

  -- 4) FAIL: regular admin (RBAC 'admin') cannot moderate own case or own product.
  PERFORM osm_test.as_user('${U(A)}'); SET LOCAL ROLE authenticated;
  PERFORM osm_test.expect_error(format('SELECT public.moderator_business_verification_action(%L,''approve'',''self'',NULL,''Admin'',''person'')',va),'business_self_moderation_forbidden');
  PERFORM osm_test.expect_error(format('SELECT public.moderator_business_verification_action(%L,''reject'',''self'')',va),'business_self_moderation_forbidden');
  PERFORM osm_test.expect_error('SELECT public.moderator_business_suspend_product(''${P(A)}'',NULL,''self'')','business_self_moderation_forbidden');
  RESET ROLE;
  -- FAIL: legacy platform_admin cannot self-suspend either.
  PERFORM osm_test.as_user('${U(PA)}'); SET LOCAL ROLE authenticated;
  PERFORM osm_test.expect_error('SELECT public.moderator_business_suspend_product(''${P(PA)}'',NULL,''self'')','business_self_moderation_forbidden');
  RESET ROLE;
  PERFORM osm_test.check_true((SELECT status = 'submitted' FROM public.business_rightsholder_verifications WHERE id = va),'admin self-moderation not applied');

  -- 5) Unchanged: non-moderators (editor, ordinary author) are refused before any self check.
  PERFORM osm_test.as_user('${U(E)}'); SET LOCAL ROLE authenticated;
  PERFORM osm_test.expect_error('SELECT public.moderator_business_suspend_product(''${P(E)}'',NULL,''self'')','business_moderator_required');
  PERFORM osm_test.expect_error(format('SELECT public.moderator_business_verification_action(%L,''approve'',''x'',NULL,''B'',''person'')',vb),'business_moderator_required');
  RESET ROLE;
  PERFORM osm_test.as_user('${U(B)}'); SET LOCAL ROLE authenticated;
  PERFORM osm_test.expect_error(format('SELECT public.moderator_business_verification_action(%L,''approve'',''x'',NULL,''B'',''person'')',vb),'business_moderator_required');
  RESET ROLE;

  -- 6) Unchanged: others' cases/products. Admin moderates B; owner moderates A.
  PERFORM osm_test.as_user('${U(A)}'); SET LOCAL ROLE authenticated;
  PERFORM public.moderator_business_verification_action(vb,'request_info','Need clearer screenshot');
  PERFORM public.moderator_business_suspend_product('${P(B)}',NULL,'Claim received');
  RESET ROLE;
  PERFORM osm_test.as_user('${U(O)}'); SET LOCAL ROLE authenticated;
  PERFORM public.moderator_business_verification_action(va,'approve','Admin case checked by owner',NULL,'Synthetic Admin','person');
  RESET ROLE;
  PERFORM osm_test.check_true((SELECT status = 'verified' FROM public.business_rightsholder_verifications WHERE id = va),'owner moderates others');
  PERFORM osm_test.check_true((SELECT status = 'needs_info' FROM public.business_rightsholder_verifications WHERE id = vb),'admin moderates others');

  -- 7) Support mode: while O has an open support session, his self-moderation is refused (fail-closed) ...
  INSERT INTO public.author_support_sessions(token_hash,actor_user_id,acting_user_id,acting_author_id,expires_at)
    VALUES(repeat('e',64),'${U(O)}','${U(B)}','${S(B)}',now() + interval '1 hour') RETURNING id INTO sess;
  SELECT count(*) INTO n_audit FROM public.business_rightsholder_moderation_audit;
  PERFORM osm_test.as_user('${U(O)}'); SET LOCAL ROLE authenticated;
  PERFORM osm_test.expect_error(format('SELECT public.moderator_business_verification_action(%L,''revoke'',''in support'')',vo),'business_self_moderation_forbidden');
  PERFORM osm_test.expect_error('SELECT public.moderator_business_suspend_product(''${P(O)}'',NULL,''in support'')','business_self_moderation_forbidden');
  -- ... while moderating OTHERS from a support session behaves exactly as before (allowed).
  PERFORM public.moderator_business_suspend_product('${P(B)}','${T(B)}','Other author, during support');
  RESET ROLE;
  -- Consents stay blocked in support mode (20270105120000, unchanged): A (verified) with an open session cannot opt in.
  INSERT INTO public.author_support_sessions(token_hash,actor_user_id,acting_user_id,acting_author_id,expires_at)
    VALUES(repeat('9',64),'${U(A)}','${U(B)}','${S(B)}',now() + interval '1 hour');
  PERFORM osm_test.as_user('${U(A)}'); SET LOCAL ROLE authenticated;
  PERFORM osm_test.expect_error('SELECT public.author_business_product_optin(ARRAY[''${P(A)}'']::uuid[],true,true,''test-v1'',''test-v1'')','support_mode_consent_forbidden');
  RESET ROLE;
  UPDATE public.author_support_sessions SET revoked_at = now() WHERE token_hash = repeat('9',64);
  PERFORM osm_test.check_true((SELECT count(*) = 0 FROM public.business_product_optins),'no opt-in in support mode');
  PERFORM osm_test.as_user('${U(O)}');
  -- A support proof on the request (GUC / header) also blocks owner self-moderation, even with the session revoked.
  UPDATE public.author_support_sessions SET revoked_at = now() WHERE id = sess;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('audiolad.author_support_token_hash',repeat('e',64),true);
  PERFORM osm_test.expect_error('SELECT public.moderator_business_suspend_product(''${P(O)}'',NULL,''proof'')','business_self_moderation_forbidden');
  PERFORM set_config('audiolad.author_support_token_hash','',true);
  PERFORM set_config('request.headers','{"x-audiolad-support-proof":"' || repeat('e',64) || '"}',true);
  PERFORM osm_test.expect_error('SELECT public.moderator_business_suspend_product(''${P(O)}'',NULL,''proof'')','business_self_moderation_forbidden');
  PERFORM set_config('request.headers','{}',true);
  -- Session ended, no proof: owner self-moderation works again.
  PERFORM public.moderator_business_verification_action(vo,'revoke','Own catalog: revoked after support session');
  RESET ROLE;
  PERFORM osm_test.check_true((SELECT count(*) = n_audit + 1 FROM public.business_rightsholder_moderation_audit),'exactly one audited action after support session');
  PERFORM osm_test.check_true((SELECT status = 'revoked' FROM public.business_rightsholder_verifications WHERE id = vo),'owner revoke applied');

  -- 8) Append-only audit unchanged: nobody can edit or delete audit / suspensions.
  PERFORM osm_test.expect_error('DELETE FROM public.business_rightsholder_moderation_audit','');
  PERFORM osm_test.expect_error('DELETE FROM public.business_onboarding_suspensions','');
END $test$;
`;

const container = process.env.AUDIOLAD_ONBOARDING_TEST_CONTAINER;
if (process.env.AUDIOLAD_SKIP_ISOLATED_SQL === '1' || !container) {
  assert.notEqual(process.env.AUDIOLAD_REQUIRE_ONBOARDING_SQL, '1', 'isolated SQL required; provide disposable test container');
  console.log('business-owner-self-moderation-sql-unit: contract OK; SQL scenarios SKIPPED (no explicit disposable container)');
} else {
  assert.match(container, /^audiolad-onboarding-test-[a-z0-9-]+$/, 'refusing non-test container');
  const db = `osm_test_${process.pid}_${Date.now()}`;
  const psql = (database, input, stdio = ['pipe', 'pipe', 'inherit']) =>
    execFileSync('docker', ['exec', '-i', container, 'psql', '-X', '-q', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'], { input, stdio });
  psql('postgres', `CREATE DATABASE ${db};`);
  try {
    const setup = [stub, read('supabase/migrations/20261205120000_music_rights_foundation.sql'),
      read('supabase/migrations/20261206120200_business_rights_eligibility.sql'), base, providers, sunoSingleLink, supportBlock].join('\n');
    const grantsBefore = "SELECT p.proname || ':' || coalesce(array_to_string(p.proacl,','),'') FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('moderator_business_verification_action','moderator_business_suspend_product') ORDER BY 1;";
    const before = psql(db, [setup, grantsBefore].join('\n')).toString();
    // Applied twice: idempotent. Grants on the RPCs are preserved by CREATE OR REPLACE.
    const after = psql(db, [migration, migration, grantsBefore].join('\n')).toString();
    assert.equal(after, before, 'RPC grants unchanged');
    assert.match(after, /authenticated=X/);
    psql(db, scenario);
    // Rollback restores the strict ban (owner self-moderation refused again), then re-apply allows it again.
    psql(db, [rollback,
      "SELECT 1 / CASE WHEN to_regprocedure('public.business_moderation_owner_self_allowed()') IS NULL THEN 1 ELSE 0 END;",
      String.raw`DO $r$ BEGIN
        PERFORM set_config('request.jwt.claim.role','authenticated',false);
        PERFORM set_config('request.jwt.claim.sub','${U(O)}',false);
        SET LOCAL ROLE authenticated;
        PERFORM osm_test.expect_error('SELECT public.moderator_business_suspend_product(''${P(O)}'',NULL,''after rollback'')','business_self_moderation_forbidden');
        RESET ROLE;
      END $r$;`,
      migration,
      String.raw`DO $r$ BEGIN
        PERFORM set_config('request.jwt.claim.role','authenticated',false);
        PERFORM set_config('request.jwt.claim.sub','${U(O)}',false);
        SET LOCAL ROLE authenticated;
        PERFORM public.moderator_business_suspend_product('${P(O)}',NULL,'after re-apply');
        RESET ROLE;
      END $r$;`].join('\n'));
    console.log('business-owner-self-moderation-sql-unit: contract + isolated PostgreSQL scenarios OK');
  } finally {
    psql('postgres', `DROP DATABASE ${db};`);
  }
}
