#!/usr/bin/env node
// Contract checks + real PostgreSQL scenarios in an EXPLICIT disposable test container only.
// No discovery of supabase-db, no production URL, no install or network in this runner.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const sql = read('supabase/migrations/20270101120000_business_rightsholder_onboarding.sql');
// 20270102120000: provider choice (Suno / MusicGPT / other). Additive; applied after the base migration.
const providers = read('supabase/migrations/20270102120000_business_rightsholder_providers.sql');
// 20270103120000: Suno single link — function-only relax of the generation_refs rule.
const sunoSingleLink = read('supabase/migrations/20270103120000_business_rightsholder_suno_single_link.sql');
const sunoSingleLinkRollback = read('docs/business/rightsholder-suno-single-link-8d9cd0af-rollback.sql');
// 20270111120000: the owner's own unsubmitted 'draft' case can be edited again (functions only).
const draftReuse = read('supabase/migrations/20270111120000_business_verification_draft_reuse.sql');
assert.doesNotMatch(sunoSingleLink.replace(/--[^\n]*/g, ''), /ALTER\s+TABLE|DROP\s|INSERT|UPDATE|DELETE|GRANT|REVOKE/i, 'suno single-link migration is function-only');
assert.doesNotMatch(sunoSingleLink.replace(/--[^\n]*/g, ''), /generation_refs_required/);
assert.match(sunoSingleLinkRollback, /business_suno_generation_refs_required/);
const providersRollback = read('docs/business/rightsholder-providers-8d9cd0af-rollback.sql');
const providersClean = providers.replace(/--[^\n]*/g, '');
assert.match(providersClean, /^\s*BEGIN;/);
assert.match(providersClean, /COMMIT;\s*$/);
assert.doesNotMatch(providersClean, /DROP\s+(TABLE|COLUMN|CONSTRAINT|FUNCTION|POLICY|TRIGGER)/i, 'providers migration is additive');
assert.doesNotMatch(providersClean, /CREATE OR REPLACE FUNCTION public\.(author_business_verification_draft|author_business_verification_submit|business_onboarding_consents|moderator_\w+)\(/, 'existing RPCs are not rewritten');
assert.doesNotMatch(providersClean, /music_rights_grants|resolve_business_track_eligibility/);
assert.doesNotMatch(providersClean, /status = 'verified'|'verified'/, 'no auto verification');
const providerTables = [...providersClean.matchAll(/ALTER TABLE\s+(public\.\w+)/g)].map((m) => m[1]);
assert.ok(providerTables.length > 0 && providerTables.every((t) => t === 'public.business_rightsholder_verifications'));
for (const body of providersClean.matchAll(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/g)) {
  assert.match(body[0], /SET search_path = public, pg_temp/);
}
assert.match(providers, /GRANT EXECUTE ON FUNCTION public\.author_business_verification_draft_v2\([^)]*\) TO authenticated/);
assert.match(providers, /GRANT EXECUTE ON FUNCTION public\.author_business_verification_submit_v2\([^)]*\) TO authenticated/);
assert.doesNotMatch(providers, /GRANT EXECUTE ON FUNCTION public\.business_onboarding_provider_error/);
assert.match(providersRollback, /business_providers_rollback_refuses_data_loss/);
const clean = sql.replace(/--[^\n]*/g, '');
assert.match(clean, /^\s*BEGIN;/);
assert.match(clean, /COMMIT;\s*$/);
assert.doesNotMatch(clean, /(?:INSERT INTO|UPDATE|ALTER TABLE|DELETE FROM)\s+public\.music_rights_grants/i);
assert.doesNotMatch(clean, /CREATE.*FUNCTION public\.resolve_business_track_eligibility/i);
assert.doesNotMatch(clean, /INSERT INTO public\.business_program_document_versions/i);
for (const name of ['business_program_document_versions', 'business_rightsholder_accounts',
  'business_rightsholder_verifications', 'business_rightsholder_verification_attempts', 'business_verification_evidence', 'business_legal_consents',
  'business_product_optins', 'business_onboarding_suspensions', 'business_rightsholder_moderation_audit']) {
  assert.ok(sql.includes(`CREATE TABLE IF NOT EXISTS public.${name}`), name);
}
for (const body of clean.matchAll(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/g)) {
  if (/SECURITY DEFINER/.test(body[0])) assert.match(body[0], /SET search_path = public, pg_temp/);
}
assert.match(sql, /role = 'owner' FOR SHARE/);
assert.match(clean, /CREATE UNIQUE INDEX IF NOT EXISTS business_rightsholder_verifications_owner_uidx\s+ON public\.business_rightsholder_verifications\(owner_user_id\);/);
assert.doesNotMatch(clean, /status <> 'rejected'/);
const productHelper = clean.match(/CREATE OR REPLACE FUNCTION public\.business_onboarding_product\([\s\S]*?\$\$;/)?.[0];
assert.ok(productHelper, 'product helper exists');
assert.match(productHelper, /FROM public\.practices WHERE id = p_product_id FOR UPDATE;/);
assert.match(clean, /WHEN p_action = 'reopen' AND v\.status = 'rejected' THEN 'needs_info'/);
assert.doesNotMatch(clean, /author_members_can_mutate/);
assert.match(sql, /BEFORE UPDATE OR DELETE OR TRUNCATE/);
assert.match(sql, /AS RESTRICTIVE FOR UPDATE/);
assert.match(sql, /AS RESTRICTIVE FOR DELETE/);
assert.match(sql, /ON CONFLICT \(id\) DO NOTHING/);
assert.match(sql, /10485760/);
assert.match(sql, /business_program_documents_not_published/);
const pkg = JSON.parse(read('package.json'));
assert.ok(pkg.scripts['test:business-rightsholder-onboarding']);
for (const name of ['test:database-migrations','test:database-migrations:ci']) {
  assert.ok(pkg.scripts[name].includes('business-rightsholder-onboarding-sql-unit.mjs'), name);
}
assert.match(read('.github/workflows/business-pr-validation.yml'), /npm run test:business-rightsholder-onboarding/);

const stub = read('scripts/lib/business-rights-eligibility-sql-stub.sql') + `
CREATE TABLE public.profiles(id uuid PRIMARY KEY, role text);
CREATE TABLE public.platform_user_roles(user_id uuid, role_code text);
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, metadata jsonb, UNIQUE(bucket_id,name));
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
-- Deliberately broad old policy: restrictive onboarding policies must still protect the bucket.
CREATE POLICY old_broad_policy ON storage.objects FOR ALL TO authenticated USING(true) WITH CHECK(true);
`;

const smoke = String.raw`
CREATE SCHEMA onboarding_test;
CREATE FUNCTION onboarding_test.expect_error(command text, expected text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN
    EXECUTE command;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%' || expected || '%' THEN RAISE EXCEPTION 'expected %, got %: %',expected,SQLERRM,command; END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'expected error %, succeeded: %', expected, command;
END $f$;
CREATE FUNCTION onboarding_test.check_true(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion failed: %', message; END IF; END $f$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA onboarding_test FROM PUBLIC;
GRANT USAGE ON SCHEMA onboarding_test TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA onboarding_test TO authenticated;

INSERT INTO auth.users(id) VALUES
 ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
INSERT INTO public.profiles VALUES ('00000000-0000-0000-0000-000000000001','listener'),('00000000-0000-0000-0000-000000000002','listener'),('00000000-0000-0000-0000-000000000003','platform_admin');
INSERT INTO public.authors(id,slug) VALUES ('10000000-0000-0000-0000-000000000001','owner-space-1'),('10000000-0000-0000-0000-000000000002','foreign'),('10000000-0000-0000-0000-000000000003','owner-space-2');
INSERT INTO public.author_members(author_id,user_id,role) VALUES
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','owner'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','owner'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','editor'),
 ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','owner');
INSERT INTO public.practices(id,author_id,slug,status) VALUES
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','published','published'),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','foreign','published'),
 ('20000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','draft','draft'),
 ('20000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000003','second-space','published');
INSERT INTO public.audio_items(id,practice_id,title) VALUES
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','First'),
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','Foreign'),
 ('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003','Draft'),
 ('30000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000004','Second space');
INSERT INTO public.business_organizations(id,name) VALUES ('40000000-0000-0000-0000-000000000001','Synthetic');
INSERT INTO public.business_locations(id,organization_id,name,business_category,country_code) VALUES
 ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Synthetic','spa','AA');

-- Synthetic AA: supported but grants cover BB only. BB: explicit country-use deny.
INSERT INTO public.business_locations(id,organization_id,name,business_category,country_code) VALUES
 ('50000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','Denied','spa','BB');
DO $fixture$
DECLARE profile_id uuid; context_id uuid; rh uuid; g uuid; layer text; country text;
BEGIN
  INSERT INTO public.music_rightsholders(display_name,entity_type) VALUES('Synthetic fixture','person') RETURNING id INTO rh;
  FOREACH layer IN ARRAY ARRAY['recording','composition'] LOOP
    INSERT INTO public.music_rights_grants(audio_item_id,rightsholder_id,rights_layer,use_type,territory_scope,valid_from,source_type,status)
      VALUES('30000000-0000-0000-0000-000000000001',rh,layer,'business_background_playback','countries',now() - interval '1 day','direct_license','draft') RETURNING id INTO g;
    INSERT INTO public.music_rights_grant_countries(grant_id,country_code,effect) VALUES(g,'BB','include');
    UPDATE public.music_rights_grants SET status = 'verified',verified_at = now() WHERE id = g;
  END LOOP;
  FOREACH country IN ARRAY ARRAY['AA','BB'] LOOP
    INSERT INTO public.music_country_rights_profiles(country_code) VALUES(country) RETURNING id INTO profile_id;
    INSERT INTO public.music_country_rights_profile_rules(profile_id,use_type,service_status,client_requirement)
      VALUES(profile_id,'business_background_playback',CASE country WHEN 'AA' THEN 'supported' ELSE 'unsupported' END,'none');
    UPDATE public.music_country_rights_profiles SET status = 'active',reviewed_at = now() WHERE id = profile_id;
    INSERT INTO public.business_location_rights_contexts(location_id,country_profile_id,country_code_snapshot,business_category_snapshot)
      SELECT id,profile_id,country,'spa' FROM public.business_locations WHERE country_code = country RETURNING id INTO context_id;
    UPDATE public.business_location_rights_contexts SET status = 'active',reviewed_at = now() WHERE id = context_id;
  END LOOP;
END $fixture$;

DO $test$
DECLARE
  p uuid := '20000000-0000-0000-0000-000000000001';
  a uuid := '30000000-0000-0000-0000-000000000001';
  v uuid; e1 public.business_verification_evidence; e2 public.business_verification_evidence;
  draft_call text; submit_call text; optin_call text; before_eligibility jsonb; before_deny jsonb; engine text; grants bigint;
  n bigint; optins uuid[]; location uuid := '50000000-0000-0000-0000-000000000001'; c uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
  PERFORM set_config('request.jwt.claim.role','authenticated',false);
  draft_call := format('SELECT public.author_business_verification_draft(%L,%L,''suno'',NULL,''Example'',''https://suno.com/s/example'')',p,a);
  optin_call := format('SELECT public.author_business_product_optin(ARRAY[%L]::uuid[],true,true,''test-v1'',''test-v1'')',p);
  before_eligibility := public.resolve_business_track_eligibility(a,location);
  before_deny := public.resolve_business_track_eligibility(a,'50000000-0000-0000-0000-000000000002');
  PERFORM onboarding_test.check_true(before_eligibility->>'decision' = 'UNKNOWN','out-of-territory stays UNKNOWN');
  PERFORM onboarding_test.check_true(before_deny->>'decision' = 'INELIGIBLE','unsupported country denies');
  engine := pg_get_functiondef('public.resolve_business_track_eligibility(uuid,uuid,uuid,text,timestamptz)'::regprocedure);
  SELECT count(*) INTO grants FROM public.music_rights_grants;
  UPDATE public.audio_items SET status = 'draft' WHERE id = a;
  SET LOCAL ROLE authenticated;
  PERFORM onboarding_test.expect_error(draft_call,'business_track_not_published');
  RESET ROLE;
  UPDATE public.audio_items SET status = 'published' WHERE id = a;
  SET LOCAL ROLE authenticated;
  -- Foreign product (even editor) and unpublished product.
  PERFORM onboarding_test.expect_error(replace(replace(draft_call,p::text,'20000000-0000-0000-0000-000000000002'),a::text,'30000000-0000-0000-0000-000000000002'),'business_product_not_owned');
  PERFORM onboarding_test.expect_error(replace(replace(draft_call,p::text,'20000000-0000-0000-0000-000000000003'),a::text,'30000000-0000-0000-0000-000000000003'),'business_product_not_published');
  PERFORM onboarding_test.expect_error(replace(draft_call,a::text,'30000000-0000-0000-0000-000000000002'),'business_track_not_in_product');
  PERFORM onboarding_test.expect_error(replace(draft_call,'https://suno.com/s/example','https://suno.com.evil/s/example'),'business_service_link_invalid');
  PERFORM onboarding_test.expect_error(replace(draft_call,'''suno''','''unknown'''),'business_ai_service_invalid');
  PERFORM onboarding_test.expect_error(replace(draft_call,'''suno''','''other'''),'business_ai_service_invalid');
  PERFORM onboarding_test.expect_error(optin_call,'business_account_not_verified');
  EXECUTE draft_call INTO v;
  -- 20270111120000: a 'draft' left by a failed submit is edited again (same case), never a dead end.
  EXECUTE replace(draft_call,'Example','Example draft edit') INTO c;
  PERFORM onboarding_test.check_true(c = v,'draft is editable again with the same case id');
  PERFORM onboarding_test.check_true((SELECT status = 'draft' AND service_track_title = 'Example draft edit' FROM public.business_rightsholder_verifications WHERE id = v),'draft edit stored');
  EXECUTE draft_call INTO c;
  PERFORM onboarding_test.check_true(c = v AND (SELECT count(*) = 1 FROM public.business_rightsholder_verifications WHERE owner_user_id = '00000000-0000-0000-0000-000000000001'),'one case per account');
  PERFORM onboarding_test.expect_error('UPDATE public.business_rightsholder_verifications SET status = ''verified''','permission denied');
  PERFORM onboarding_test.expect_error('INSERT INTO public.business_program_document_versions VALUES (''business_program_terms'',''evil'',''' || repeat('a',64) || ''',''unapproved'',NULL,now(),true)','permission denied');
  e1 := public.author_business_evidence_reserve(v,'generation','image/png',100,repeat('a',64));
  e2 := public.author_business_evidence_reserve(v,'paid_period','application/pdf',200,repeat('b',64));
  PERFORM onboarding_test.expect_error(format('SELECT public.author_business_evidence_reserve(%L,''generation'',''image/png'',10485761,%L)',v,repeat('a',64)),'check constraint');
  PERFORM onboarding_test.expect_error(format('SELECT public.author_business_evidence_reserve(%L,''generation'',''text/plain'',10,%L)',v,repeat('a',64)),'check constraint');
  INSERT INTO storage.objects(bucket_id,name,metadata) VALUES
    ('business-rightsholder-evidence',e1.object_path,'{"mimetype":"image/png","size":100}'),
    ('business-rightsholder-evidence',e2.object_path,'{"mimetype":"application/pdf","size":200}');
  submit_call := format('SELECT public.author_business_verification_submit(%L,ARRAY[%L,%L]::uuid[],true,true,''test-v1'',''test-v1'')',v,e1.id,e2.id);
  PERFORM onboarding_test.expect_error(submit_call,'business_program_documents_not_published');
  RESET ROLE;
  -- Test-only legal fixtures; migration itself MUST leave this table empty.
  INSERT INTO public.business_program_document_versions(document_key,version,content_hash,content_text,published_at,is_current)
    VALUES('business_program_terms','test-v1',repeat('c',64),'NOT A LEGAL DOCUMENT',now(),true),
    ('business_music_rights_declaration','test-v1',repeat('d',64),'NOT A LEGAL DOCUMENT',now(),true);
  SET LOCAL ROLE authenticated;
  PERFORM onboarding_test.expect_error(replace(submit_call,'true,true','false,true'),'business_program_consents_required');
  PERFORM onboarding_test.expect_error(replace(submit_call,'true,true','true,false'),'business_program_consents_required');
  PERFORM onboarding_test.expect_error(replace(submit_call,'true,true','NULL,true'),'business_program_consents_required');
  PERFORM onboarding_test.expect_error(replace(submit_call,'test-v1','stale'),'business_program_document_version_changed');
  EXECUTE submit_call;
  PERFORM onboarding_test.check_true((SELECT count(*) = 2 FROM public.business_legal_consents),'two independent consents');
  -- Object overwrite/delete remain blocked despite old broad storage policy.
  UPDATE storage.objects SET metadata = '{}' WHERE name = e1.object_path;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM onboarding_test.check_true(n = 0,'storage immutable');
  DELETE FROM storage.objects WHERE name = e1.object_path;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM onboarding_test.check_true(n = 0,'storage delete blocked');
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
  PERFORM onboarding_test.check_true((SELECT count(*) = 0 FROM storage.objects),'foreign evidence unreadable');
  PERFORM onboarding_test.check_true((SELECT count(*) = 0 FROM public.business_rightsholder_verifications),'foreign verification unreadable');
  PERFORM onboarding_test.expect_error(format('INSERT INTO storage.objects(bucket_id,name) VALUES (''business-rightsholder-evidence'',%L)',e1.object_path || '/foreign'),'row-level security');
  PERFORM onboarding_test.expect_error(format('SELECT public.moderator_business_verification_action(%L,''approve'',''test'')',v),'business_moderator_required');
  RESET ROLE;
  INSERT INTO public.platform_user_roles VALUES('00000000-0000-0000-0000-000000000001','admin');
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
  SET LOCAL ROLE authenticated;
  PERFORM onboarding_test.expect_error(format('SELECT public.moderator_business_verification_action(%L,''approve'',''test'')',v),'business_self_moderation_forbidden');
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
  PERFORM onboarding_test.check_true((SELECT count(*) = 2 FROM storage.objects),'moderator evidence readable');
  PERFORM onboarding_test.expect_error(format('SELECT public.moderator_business_verification_action(%L,''approve'','' '')',v),'business_moderation_reason_required');
  PERFORM public.moderator_business_verification_action(v,'request_info','Provide clearer evidence');
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
  EXECUTE replace(draft_call,'Example','Clarified') INTO c;
  PERFORM onboarding_test.check_true(c = v,'needs_info edit retains case');
  e2 := public.author_business_evidence_reserve(v,'paid_period','application/pdf',200,repeat('e',64));
  INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('business-rightsholder-evidence',e2.object_path,'{"mimetype":"application/pdf","size":200}');
  submit_call := format('SELECT public.author_business_verification_submit(%L,ARRAY[%L,%L]::uuid[],true,true,''test-v1'',''test-v1'')',v,e1.id,e2.id);
  EXECUTE submit_call;
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
  PERFORM public.moderator_business_verification_action(v,'approve','Owner confirmed',NULL,'Synthetic owner','person');
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
  -- Verified opt-in is still gated by legal publication.
  RESET ROLE;
  UPDATE public.business_program_document_versions SET is_current = false;
  SET LOCAL ROLE authenticated;
  PERFORM onboarding_test.expect_error(optin_call,'business_program_documents_not_published');
  RESET ROLE;
  UPDATE public.business_program_document_versions SET is_current = true;
  SET LOCAL ROLE authenticated;
  PERFORM onboarding_test.expect_error(replace(optin_call,'true,true','false,true'),'business_program_consents_required');
  PERFORM onboarding_test.expect_error(replace(optin_call,p::text,'20000000-0000-0000-0000-000000000002'),'business_product_not_owned');
  PERFORM onboarding_test.expect_error(replace(optin_call,p::text,'20000000-0000-0000-0000-000000000003'),'business_product_not_published');
  EXECUTE optin_call INTO optins;
  EXECUTE replace(optin_call,p::text,'20000000-0000-0000-0000-000000000004') INTO optins;
  PERFORM onboarding_test.check_true((SELECT count(*) = 2 FROM public.business_product_optins),'one verification covers two owner spaces');
  PERFORM onboarding_test.check_true((SELECT count(*) = 4 FROM public.business_legal_consents WHERE context = 'product_optin'),'each product has independent consents');
  PERFORM onboarding_test.expect_error('DELETE FROM public.business_legal_consents','permission denied');
  RESET ROLE;
  PERFORM onboarding_test.check_true((SELECT count(*) = grants FROM public.music_rights_grants),'opt-in never creates grants');
  PERFORM onboarding_test.check_true(public.resolve_business_track_eligibility(a,location) = before_eligibility,'out-of-territory eligibility unchanged');
  PERFORM onboarding_test.check_true(public.resolve_business_track_eligibility(a,'50000000-0000-0000-0000-000000000002') = before_deny,'country deny unchanged');
  PERFORM onboarding_test.check_true(public.resolve_business_track_eligibility('30000000-0000-0000-0000-000000000004',location)->>'decision' = 'UNKNOWN','opted product with no grants stays UNKNOWN');
  PERFORM onboarding_test.check_true(pg_get_functiondef('public.resolve_business_track_eligibility(uuid,uuid,uuid,text,timestamptz)'::regprocedure) = engine,'engine definition unchanged');
  PERFORM onboarding_test.expect_error('UPDATE public.business_legal_consents SET user_agent = ''tamper''','business_onboarding_history_immutable');
  PERFORM onboarding_test.expect_error('DELETE FROM public.business_legal_consents','business_onboarding_history_immutable');
  PERFORM onboarding_test.expect_error('TRUNCATE public.business_rightsholder_moderation_audit','business_onboarding_history_immutable');
  PERFORM onboarding_test.expect_error('UPDATE public.business_program_document_versions SET content_text = ''tamper''','business_program_document_immutable');
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
  PERFORM public.moderator_business_suspend_product(p,a,'Disputed track');
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
  PERFORM onboarding_test.expect_error(optin_call,'business_product_or_track_suspended');
  EXECUTE replace(optin_call,p::text,'20000000-0000-0000-0000-000000000004');
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
  PERFORM public.moderator_business_verification_action(v,'restrict','Investigating');
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
  PERFORM onboarding_test.expect_error(draft_call,'business_verification_already_active');
  PERFORM onboarding_test.expect_error(optin_call,'business_account_not_verified');
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
  PERFORM public.moderator_business_verification_action(v,'revoke','Revoked');
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
  PERFORM onboarding_test.expect_error(optin_call,'business_account_not_verified');
  PERFORM onboarding_test.expect_error(draft_call,'business_verification_already_active');
  RESET ROLE;
  PERFORM onboarding_test.check_true((SELECT count(*) = 4 FROM public.business_rightsholder_moderation_audit),'moderation audit append-only');
  -- Another allowed service on a different owner account.
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
  draft_call := replace(replace(draft_call,p::text,'20000000-0000-0000-0000-000000000002'),a::text,'30000000-0000-0000-0000-000000000002');
  SET LOCAL ROLE authenticated;
  EXECUTE replace(replace(draft_call,'''suno''','''musicgpt'''),'https://suno.com/s/example','https://musicgpt.com/track/example') INTO v;
  RESET ROLE;
  SET LOCAL ROLE authenticated;
  e1 := public.author_business_evidence_reserve(v,'generation','image/png',100,repeat('a',64));
  e2 := public.author_business_evidence_reserve(v,'paid_period','application/pdf',200,repeat('b',64));
  INSERT INTO storage.objects(bucket_id,name,metadata) VALUES
    ('business-rightsholder-evidence',e1.object_path,'{"mimetype":"image/png","size":100}'),
    ('business-rightsholder-evidence',e2.object_path,'{"mimetype":"application/pdf","size":200}');
  submit_call := format('SELECT public.author_business_verification_submit(%L,ARRAY[%L,%L]::uuid[],true,true,''test-v1'',''test-v1'')',v,e1.id,e2.id);
  EXECUTE submit_call;
  -- Each rejection permits corrections on the SAME case, without moderator reopen.
  FOR n IN 1..2 LOOP
    PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
    PERFORM public.moderator_business_verification_action(v,'reject','Insufficient evidence');
    PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
    PERFORM onboarding_test.check_true((SELECT reason = 'Insufficient evidence' FROM public.business_rightsholder_verifications WHERE id = v),'author reads rejection reason');
    EXECUTE replace(draft_call,'Example','Corrected ' || n) INTO c;
    PERFORM onboarding_test.check_true(c = v,'edit retains case ID');
    PERFORM onboarding_test.check_true((SELECT reason = 'Insufficient evidence' FROM public.business_rightsholder_verifications WHERE id = v),'reason survives editing');
    EXECUTE submit_call;
  END LOOP;
  PERFORM onboarding_test.check_true((SELECT count(*) = 3 AND max(attempt_no) = 3 FROM public.business_rightsholder_verification_attempts WHERE verification_id = v),'three preserved submissions');
  PERFORM onboarding_test.check_true((SELECT count(*) = 2 FROM public.business_rightsholder_moderation_audit WHERE verification_id = v AND attempt_id IS NOT NULL AND action = 'reject'),'rejections linked to attempts');
  PERFORM onboarding_test.check_true((SELECT snapshot->'fields'->>'service_track_title' = 'Example' FROM public.business_rightsholder_verification_attempts WHERE verification_id = v AND attempt_no = 1),'original fields preserved');
  PERFORM onboarding_test.expect_error(draft_call,'business_verification_already_active');
  PERFORM onboarding_test.expect_error(submit_call,'business_verification_submit_forbidden');
  PERFORM onboarding_test.expect_error('UPDATE public.business_rightsholder_verification_attempts SET snapshot = ''{}''','permission denied');
  PERFORM onboarding_test.expect_error('UPDATE public.business_rightsholder_verifications SET status = ''verified''','permission denied');
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
  RESET ROLE;
  DELETE FROM public.platform_user_roles WHERE user_id = '00000000-0000-0000-0000-000000000001';
  SET LOCAL ROLE authenticated;
  PERFORM onboarding_test.check_true((SELECT count(*) = 0 FROM public.business_rightsholder_verification_attempts WHERE verification_id = v),'foreign attempts unreadable');
  RESET ROLE;
  PERFORM onboarding_test.expect_error('UPDATE public.business_rightsholder_verification_attempts SET snapshot = ''{}''','business_onboarding_history_immutable');
  PERFORM onboarding_test.expect_error('DELETE FROM public.business_rightsholder_verification_attempts','business_onboarding_history_immutable');
  -- Plain TRUNCATE is stopped by the audit FK; CASCADE reaches the append-only triggers.
  PERFORM onboarding_test.expect_error('TRUNCATE public.business_rightsholder_verification_attempts','cannot truncate a table referenced in a foreign key');
  PERFORM onboarding_test.expect_error('TRUNCATE public.business_rightsholder_verification_attempts CASCADE','business_onboarding_history_immutable');
  PERFORM onboarding_test.expect_error('UPDATE public.business_verification_evidence SET sha256 = repeat(''f'',64)','business_onboarding_history_immutable');
  -- Unconditional owner uniqueness also blocks privileged duplicate active cases.
  PERFORM onboarding_test.expect_error(format('INSERT INTO public.business_rightsholder_verifications(owner_user_id,product_id,audio_item_id,ai_service,service_track_title,service_track_url) SELECT owner_user_id,product_id,audio_item_id,ai_service,service_track_title,service_track_url FROM public.business_rightsholder_verifications WHERE id = %L',v),'duplicate key value violates unique constraint');
  RESET ROLE;
END $test$;
DROP FUNCTION onboarding_test.expect_error(text,text);
DROP FUNCTION onboarding_test.check_true(boolean,text);
DROP SCHEMA onboarding_test;
`;

const providersSmoke = String.raw`
CREATE SCHEMA providers_test;
CREATE FUNCTION providers_test.expect_error(command text, expected text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN EXECUTE command;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%' || expected || '%' THEN RAISE EXCEPTION 'expected %, got %: %',expected,SQLERRM,command; END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'expected error %, succeeded: %', expected, command;
END $f$;
CREATE FUNCTION providers_test.check_true(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'assertion failed: %', message; END IF; END $f$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA providers_test FROM PUBLIC;
GRANT USAGE ON SCHEMA providers_test TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA providers_test TO authenticated;
INSERT INTO auth.users(id) VALUES ('00000000-0000-0000-0000-000000000004'),('00000000-0000-0000-0000-000000000005'),('00000000-0000-0000-0000-000000000006');
INSERT INTO public.profiles VALUES ('00000000-0000-0000-0000-000000000004','listener'),('00000000-0000-0000-0000-000000000005','listener'),('00000000-0000-0000-0000-000000000006','listener');
INSERT INTO public.authors(id,slug) VALUES ('10000000-0000-0000-0000-000000000004','prov-suno'),('10000000-0000-0000-0000-000000000005','prov-musicgpt'),('10000000-0000-0000-0000-000000000006','prov-other');
INSERT INTO public.author_members(author_id,user_id,role) VALUES
 ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000004','owner'),
 ('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000005','owner'),
 ('10000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000006','owner');
INSERT INTO public.practices(id,author_id,slug,status) VALUES
 ('20000000-0000-0000-0000-000000000014','10000000-0000-0000-0000-000000000004','prov-suno','published'),
 ('20000000-0000-0000-0000-000000000015','10000000-0000-0000-0000-000000000005','prov-musicgpt','published'),
 ('20000000-0000-0000-0000-000000000016','10000000-0000-0000-0000-000000000006','prov-other','published');
INSERT INTO public.audio_items(id,practice_id,title) VALUES
 ('30000000-0000-0000-0000-000000000014','20000000-0000-0000-0000-000000000014','Suno track'),
 ('30000000-0000-0000-0000-000000000015','20000000-0000-0000-0000-000000000015','MusicGPT track'),
 ('30000000-0000-0000-0000-000000000016','20000000-0000-0000-0000-000000000016','Studio track');

DO $test$
DECLARE v uuid; e1 public.business_verification_evidence; e2 public.business_verification_evidence;
  d text; s text; n bigint; snap jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.role','authenticated',false);
  -- Existing rows keep working: legacy rows get '{}' and keep their NOT NULL links.
  PERFORM providers_test.check_true((SELECT bool_and(provider_details = '{}'::jsonb AND service_track_url IS NOT NULL) FROM public.business_rightsholder_verifications),'legacy rows untouched');

  -- SUNO: link required (generation refs optional since 20270103120000); two files (generation + paid_period).
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
  SET LOCAL ROLE authenticated;
  d := 'SELECT public.author_business_verification_draft_v2(''20000000-0000-0000-0000-000000000014'',''30000000-0000-0000-0000-000000000014'',''suno'',NULL,''Spa jazz'',''https://suno.com/s/abc'',''{"generation_refs":"https://suno.com/s/abc\nhttps://suno.com/s/def","paid_plan":"Pro"}''::jsonb)';
  PERFORM providers_test.expect_error(replace(d,'https://suno.com/s/abc''','https://evil.example/s/abc'''),'business_service_link_invalid');
  PERFORM providers_test.expect_error(replace(d,',''https://suno.com/s/abc''',',NULL'),'business_service_link_invalid');
  -- 20270103120000: generation_refs no longer required for Suno (one track link is enough).
  -- helper is not granted to authenticated (by design); check it as the owner.
  RESET ROLE;
  PERFORM providers_test.check_true(public.business_onboarding_provider_error('suno',NULL,'https://suno.com/s/abc','{"paid_plan":"Pro"}'::jsonb) IS NULL,'suno without generation_refs is valid');
  PERFORM providers_test.check_true(public.business_onboarding_provider_error('suno',NULL,'https://suno.com/s/abc','{}'::jsonb) IS NULL,'suno with empty details is valid');
  SET LOCAL ROLE authenticated;
  PERFORM providers_test.expect_error(replace(d,'"paid_plan"','"plan_name"'),'business_provider_details_invalid');
  PERFORM providers_test.expect_error(replace(d,'"Pro"','5'),'business_provider_details_invalid');
  PERFORM providers_test.expect_error(regexp_replace(d,'''\{.*\}''::jsonb','''["x"]''::jsonb'),'business_provider_details_invalid');
  EXECUTE replace(d,'Spa jazz','Spa jazz first draft') INTO v;
  -- 20270111120000: the unsubmitted draft is edited again by draft_v2 (same case id).
  PERFORM providers_test.check_true((SELECT count(*) = 1 FROM public.business_rightsholder_verifications WHERE id = v AND status = 'draft'),'first draft');
  PERFORM providers_test.check_true((SELECT public.author_business_verification_draft_v2('20000000-0000-0000-0000-000000000014','30000000-0000-0000-0000-000000000014','suno',NULL,'Spa jazz','https://suno.com/s/abc','{"generation_refs":"https://suno.com/s/abc\nhttps://suno.com/s/def","paid_plan":"Pro"}'::jsonb)) = v,'draft_v2 reuses the draft');
  PERFORM providers_test.check_true((SELECT provider_details->>'paid_plan' = 'Pro' AND ai_service_other IS NULL AND service_track_title = 'Spa jazz' FROM public.business_rightsholder_verifications WHERE id = v),'suno details stored');
  e1 := public.author_business_evidence_reserve(v,'generation','image/png',100,repeat('a',64));
  e2 := public.author_business_evidence_reserve(v,'paid_period','application/pdf',200,repeat('b',64));
  INSERT INTO storage.objects(bucket_id,name,metadata) VALUES
    ('business-rightsholder-evidence',e1.object_path,'{"mimetype":"image/png","size":100}'),
    ('business-rightsholder-evidence',e2.object_path,'{"mimetype":"application/pdf","size":200}');
  s := format('SELECT public.author_business_verification_submit_v2(%L,ARRAY[%L]::uuid[],true,true,''test-v1'',''test-v1'')',v,e1.id);
  PERFORM providers_test.expect_error(s,'business_evidence_files_required');
  PERFORM providers_test.expect_error(replace(s,'true,true','true,false'),'business_evidence_files_required');
  s := format('SELECT public.author_business_verification_submit_v2(%L,ARRAY[%L,%L]::uuid[],true,true,''test-v1'',''test-v1'')',v,e1.id,e2.id);
  PERFORM providers_test.expect_error(replace(s,'true,true','true,false'),'business_program_consents_required');
  EXECUTE s;
  PERFORM providers_test.check_true((SELECT status = 'submitted' FROM public.business_rightsholder_verifications WHERE id = v),'suno submitted, not verified');
  SELECT snapshot INTO snap FROM public.business_rightsholder_verification_attempts WHERE verification_id = v;
  PERFORM providers_test.check_true(snap->'fields'->'provider_details'->>'generation_refs' LIKE '%suno.com/s/def%','attempt snapshot keeps provider details');
  PERFORM providers_test.check_true(snap->'fields'->>'ai_service' = 'suno','attempt snapshot keeps provider');
  PERFORM providers_test.expect_error(d,'business_verification_already_active');
  -- Unlimited resubmission after reject; provider may change.
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
  PERFORM public.moderator_business_verification_action(v,'reject','Paid period does not cover creation date');
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
  EXECUTE replace(d,'Spa jazz','Spa jazz v2') INTO v;
  EXECUTE s;
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
  PERFORM public.moderator_business_verification_action(v,'reject','Again');
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
  EXECUTE replace(d,'Spa jazz','Spa jazz v3') INTO v;
  EXECUTE s;
  PERFORM providers_test.check_true((SELECT count(*) = 3 FROM public.business_rightsholder_verification_attempts WHERE verification_id = v),'three attempts kept');
  PERFORM providers_test.expect_error('UPDATE public.business_rightsholder_verifications SET provider_details = ''{}''','permission denied');

  -- MUSICGPT: plan required; link optional; two files (license/passport + plan details).
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
  d := 'SELECT public.author_business_verification_draft_v2(''20000000-0000-0000-0000-000000000015'',''30000000-0000-0000-0000-000000000015'',''musicgpt'',''ignored'',''Calm piano'',NULL,''{"plan_name":"Pro","license_refs":"LIC-123"}''::jsonb)';
  PERFORM providers_test.expect_error(replace(d,'"plan_name":"Pro",',''),'business_musicgpt_plan_required');
  PERFORM providers_test.expect_error(replace(d,'"plan_name":"Pro"','"plan_name":"  "'),'business_musicgpt_plan_required');
  PERFORM providers_test.expect_error(replace(d,'"license_refs"','"generation_refs"'),'business_provider_details_invalid');
  PERFORM providers_test.expect_error(replace(d,',NULL,',',''http://musicgpt.com/x'','),'business_service_link_invalid');
  EXECUTE d INTO v;
  PERFORM providers_test.check_true((SELECT service_track_url IS NULL AND ai_service_other IS NULL FROM public.business_rightsholder_verifications WHERE id = v),'musicgpt link optional, other name dropped');
  e1 := public.author_business_evidence_reserve(v,'generation','application/pdf',300,repeat('c',64));
  e2 := public.author_business_evidence_reserve(v,'paid_period','image/webp',400,repeat('d',64));
  INSERT INTO storage.objects(bucket_id,name,metadata) VALUES
    ('business-rightsholder-evidence',e1.object_path,'{"mimetype":"application/pdf","size":300}'),
    ('business-rightsholder-evidence',e2.object_path,'{"mimetype":"image/webp","size":400}');
  PERFORM providers_test.expect_error(format('SELECT public.author_business_verification_submit_v2(%L,ARRAY[%L]::uuid[],true,true,''test-v1'',''test-v1'')',v,e2.id),'business_evidence_files_required');
  EXECUTE format('SELECT public.author_business_verification_submit_v2(%L,ARRAY[%L,%L]::uuid[],true,true,''test-v1'',''test-v1'')',v,e1.id,e2.id);
  PERFORM providers_test.check_true((SELECT status = 'submitted' FROM public.business_rightsholder_verifications WHERE id = v),'musicgpt submitted');

  -- OTHER / own studio: name or description required, no link required, 1..2 files, each slot once.
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000006',false);
  d := 'SELECT public.author_business_verification_draft_v2(''20000000-0000-0000-0000-000000000016'',''30000000-0000-0000-0000-000000000016'',''other'',''Своя студия: Ableton Live 12'',''Studio track'',NULL,''{"method_description":"Записано дома"}''::jsonb)';
  PERFORM providers_test.expect_error(replace(d,'''Своя студия: Ableton Live 12''','''  '''),'business_ai_service_invalid');
  PERFORM providers_test.expect_error(replace(d,'''Своя студия: Ableton Live 12''','NULL'),'business_ai_service_invalid');
  PERFORM providers_test.expect_error(replace(d,'''Studio track''','''  '''),'business_service_track_title_invalid');
  PERFORM providers_test.expect_error(replace(d,'"method_description"','"paid_plan"'),'business_provider_details_invalid');
  EXECUTE d INTO v;
  e1 := public.author_business_evidence_reserve(v,'generation','application/pdf',500,repeat('e',64));
  e2 := public.author_business_evidence_reserve(v,'generation','application/pdf',600,repeat('f',64));
  INSERT INTO storage.objects(bucket_id,name,metadata) VALUES
    ('business-rightsholder-evidence',e1.object_path,'{"mimetype":"application/pdf","size":500}'),
    ('business-rightsholder-evidence',e2.object_path,'{"mimetype":"application/pdf","size":600}');
  PERFORM providers_test.expect_error(format('SELECT public.author_business_verification_submit_v2(%L,ARRAY[]::uuid[],true,true,''test-v1'',''test-v1'')',v),'business_evidence_files_required');
  PERFORM providers_test.expect_error(format('SELECT public.author_business_verification_submit_v2(%L,ARRAY[%L,%L]::uuid[],true,true,''test-v1'',''test-v1'')',v,e1.id,e2.id),'business_evidence_files_required');
  -- Legacy submit keeps its stricter two-kind rule.
  PERFORM providers_test.expect_error(format('SELECT public.author_business_verification_submit(%L,ARRAY[%L]::uuid[],true,true,''test-v1'',''test-v1'')',v,e1.id),'business_two_evidence_files_required');
  EXECUTE format('SELECT public.author_business_verification_submit_v2(%L,ARRAY[%L]::uuid[],true,true,''test-v1'',''test-v1'')',v,e1.id);
  PERFORM providers_test.check_true((SELECT status = 'submitted' AND ai_service_other = 'Своя студия: Ableton Live 12' FROM public.business_rightsholder_verifications WHERE id = v),'other submitted');
  -- Foreign owner cannot read or submit.
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
  PERFORM providers_test.check_true((SELECT count(*) = 0 FROM public.business_rightsholder_verifications WHERE id = v),'foreign case unreadable');
  PERFORM providers_test.expect_error(format('SELECT public.author_business_verification_submit_v2(%L,ARRAY[%L]::uuid[],true,true,''test-v1'',''test-v1'')',v,e1.id),'business_verification_submit_forbidden');
  PERFORM providers_test.expect_error('SELECT public.business_onboarding_provider_error(''suno'',NULL,NULL,''{}'')','permission denied');
  RESET ROLE;
  -- Never auto-verified, and onboarding never creates rights grants.
  PERFORM providers_test.check_true((SELECT count(*) = 0 FROM public.business_rightsholder_verifications WHERE owner_user_id IN
    ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000006') AND status = 'verified'),'no auto verified');
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
  SET LOCAL ROLE authenticated;
  PERFORM providers_test.expect_error('SELECT public.author_business_product_optin(ARRAY[''20000000-0000-0000-0000-000000000014'']::uuid[],true,true,''test-v1'',''test-v1'')','business_account_not_verified');
  RESET ROLE;
END $test$;
DROP FUNCTION providers_test.expect_error(text,text);
DROP FUNCTION providers_test.check_true(boolean,text);
DROP SCHEMA providers_test;
`;

const onboardingTables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS public\.(business_\w+)/g)].map((m) => m[1]);
const captureRows = `CREATE TABLE onboarding_before(table_name text, rows jsonb);\n` + onboardingTables.map((t) =>
  `INSERT INTO onboarding_before SELECT '${t}', coalesce(jsonb_agg(row_data ORDER BY row_data::text), '[]'::jsonb) FROM (SELECT to_jsonb(t) row_data FROM public.${t} t) rows;`).join('\n');
const assertRowsUnchanged = onboardingTables.map((t) =>
  `DO $$ BEGIN IF (SELECT rows FROM onboarding_before WHERE table_name = '${t}') IS DISTINCT FROM (SELECT coalesce(jsonb_agg(row_data ORDER BY row_data::text), '[]'::jsonb) FROM (SELECT to_jsonb(t) row_data FROM public.${t} t) rows) THEN RAISE EXCEPTION 'migration changed ${t}'; END IF; END $$;`).join('\n');
const unrelatedCheck = "SELECT 1 / CASE WHEN count(*) = 1 AND min(value) = 'keep me' THEN 1 ELSE 0 END FROM public.unrelated_existing;";
const rollback = read('docs/business/rightsholder-onboarding-8d9cd0af-rollback.sql');

const container = process.env.AUDIOLAD_ONBOARDING_TEST_CONTAINER;
if (process.env.AUDIOLAD_SKIP_ISOLATED_SQL === '1' || !container) {
  assert.notEqual(process.env.AUDIOLAD_REQUIRE_ONBOARDING_SQL, '1', 'isolated SQL required; provide disposable test container');
  console.log('business-rightsholder-onboarding-sql-unit: contract OK; SQL scenarios SKIPPED (no explicit disposable container)');
} else {
  assert.match(container, /^audiolad-onboarding-test-[a-z0-9-]+$/, 'refusing non-test container');
  const db = `onboarding_test_${process.pid}_${Date.now()}`;
  const psql = (database, input) => execFileSync('docker', ['exec','-i',container,'psql','-X','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'], {input, stdio:['pipe','pipe','inherit']});
  psql('postgres', `CREATE DATABASE ${db};`);
  try {
    psql(db, [stub, read('supabase/migrations/20261205120000_music_rights_foundation.sql'),
      read('supabase/migrations/20261206120200_business_rights_eligibility.sql'),
      "CREATE TABLE public.unrelated_existing(value text); INSERT INTO public.unrelated_existing VALUES ('keep me');",
      sql, sql, providers, providers, sunoSingleLink, sunoSingleLinkRollback, sunoSingleLink, draftReuse, draftReuse,
      "SELECT 1 / CASE WHEN count(*) = 0 THEN 1 ELSE 0 END FROM public.business_program_document_versions;",
      smoke].join('\n'));
    // Two independent PG sessions race to submit the same needs_info case.
    psql(db, `SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
      SET ROLE authenticated;
      SELECT public.moderator_business_verification_action(id,'request_info','Concurrent submission test')
      FROM public.business_rightsholder_verifications WHERE owner_user_id = '00000000-0000-0000-0000-000000000002';`);
    const concurrentSubmit = `BEGIN;
      SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
      SET LOCAL ROLE authenticated;
      SELECT public.author_business_verification_submit(v.id,
        ARRAY(SELECT e.id FROM public.business_verification_evidence e WHERE e.verification_id = v.id),
        true,true,'test-v1','test-v1') FROM public.business_rightsholder_verifications v
        WHERE owner_user_id = '00000000-0000-0000-0000-000000000002';
      SELECT pg_sleep(0.5); COMMIT;`;
    const runConcurrent = () => new Promise((resolve, reject) => {
      const child = spawn('docker', ['exec','-i',container,'psql','-X','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1']);
      let stderr = '';
      child.stdout.resume();
      child.stderr.on('data', (data) => { stderr += data; });
      child.on('error', reject);
      child.on('close', (code) => resolve({code, stderr}));
      child.stdin.end(concurrentSubmit);
    });
    const races = await Promise.all([runConcurrent(), runConcurrent()]);
    assert.equal(races.filter((r) => r.code === 0).length, 1, 'exactly one concurrent submission succeeds');
    assert.match(races.find((r) => r.code !== 0).stderr, /business_verification_submit_forbidden/);
    psql(db, `SELECT 1 / CASE WHEN count(*) = 4 THEN 1 ELSE 0 END
      FROM public.business_rightsholder_verification_attempts a JOIN public.business_rightsholder_verifications v ON v.id = a.verification_id
      WHERE v.owner_user_id = '00000000-0000-0000-0000-000000000002';`);
    psql(db, providersSmoke);
    // Re-run twice WITH history and compare complete rows, including row counts.
    psql(db, [captureRows, sql, sql, providers, providers, sunoSingleLink, sunoSingleLinkRollback, sunoSingleLink, draftReuse, draftReuse, assertRowsUnchanged, unrelatedCheck].join('\n'));
    // Providers rollback refuses to drop provider data and leaves every row intact.
    assert.throws(() => execFileSync('docker', ['exec','-i',container,'psql','-X','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1'],
      {input: providersRollback, stdio:['pipe','pipe','pipe']}), (err) => {
      assert.match(err.stderr.toString(), /business_providers_rollback_refuses_data_loss/);
      return true;
    });
    psql(db, [assertRowsUnchanged, unrelatedCheck].join('\n'));
    assert.throws(() => execFileSync('docker', ['exec','-i',container,'psql','-X','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1'],
      {input: rollback, stdio:['pipe','pipe','pipe']}), (err) => {
      assert.match(err.stderr.toString(), /business_onboarding_rollback_refuses_data_loss/);
      return true;
    });
    // The failed transaction must preserve all onboarding history and unrelated rows.
    psql(db, [assertRowsUnchanged, unrelatedCheck].join('\n'));

    // Separate DB: only unrelated data, empty onboarding. Rollback and re-apply must succeed.
    const emptyDb = `${db}_empty`;
    psql('postgres', `CREATE DATABASE ${emptyDb};`);
    try {
      psql(emptyDb, [stub, read('supabase/migrations/20261205120000_music_rights_foundation.sql'),
        read('supabase/migrations/20261206120200_business_rights_eligibility.sql'),
        "CREATE TABLE public.unrelated_existing(value text); INSERT INTO public.unrelated_existing VALUES ('keep me');",
        sql, providers, providersRollback,
        "SELECT 1 / CASE WHEN NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_rightsholder_verifications' AND column_name = 'provider_details') AND to_regprocedure('public.author_business_verification_submit_v2(uuid,uuid[],boolean,boolean,text,text,inet,text)') IS NULL THEN 1 ELSE 0 END;",
        providers, rollback, unrelatedCheck,
        "SELECT 1 / CASE WHEN to_regclass('public.business_rightsholder_accounts') IS NULL AND to_regclass('public.business_rightsholder_verification_attempts') IS NULL AND to_regclass('public.music_rights_grants') IS NOT NULL THEN 1 ELSE 0 END;",
        sql, providers, unrelatedCheck].join('\n'));
    } finally {
      psql('postgres', `DROP DATABASE ${emptyDb};`);
    }
    console.log('business-rightsholder-onboarding-sql-unit: contract + isolated PostgreSQL scenarios OK (migration applied twice)');
  } finally {
    psql('postgres', `DROP DATABASE ${db};`);
  }
}
