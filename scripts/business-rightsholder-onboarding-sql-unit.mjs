#!/usr/bin/env node
// Contract checks + real PostgreSQL scenarios in an EXPLICIT disposable test container only.
// No discovery of supabase-db, no production URL, no install or network in this runner.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const sql = read('supabase/migrations/20270101120000_business_rightsholder_onboarding.sql');
const clean = sql.replace(/--[^\n]*/g, '');
assert.match(clean, /^\s*BEGIN;/);
assert.match(clean, /COMMIT;\s*$/);
assert.doesNotMatch(clean, /(?:INSERT INTO|UPDATE|ALTER TABLE|DELETE FROM)\s+public\.music_rights_grants/i);
assert.doesNotMatch(clean, /CREATE.*FUNCTION public\.resolve_business_track_eligibility/i);
assert.doesNotMatch(clean, /INSERT INTO public\.business_program_document_versions/i);
for (const name of ['business_program_document_versions', 'business_rightsholder_accounts',
  'business_rightsholder_verifications', 'business_verification_evidence', 'business_legal_consents',
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
  PERFORM onboarding_test.expect_error(draft_call,'business_verification_already_active');
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
  -- Rejected applicants cannot start a second initial check, even with another service.
  UPDATE public.business_rightsholder_verifications SET status = 'submitted' WHERE id = v;
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
  SET LOCAL ROLE authenticated;
  PERFORM public.moderator_business_verification_action(v,'reject','Insufficient evidence');
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
  PERFORM onboarding_test.expect_error(draft_call,'business_verification_already_active');
  PERFORM onboarding_test.expect_error(replace(replace(draft_call,'''suno'',NULL','''other'',''Synthetic service'''),'https://suno.com/s/example','https://example.test/track/1'),'business_verification_already_active');
  PERFORM onboarding_test.expect_error(format('SELECT public.moderator_business_verification_action(%L,''reopen'',''Correct evidence'')',v),'business_moderator_required');
  PERFORM onboarding_test.expect_error(format('SELECT public.author_business_evidence_reserve(%L,''generation'',''image/png'',100,%L)',v,repeat('a',64)),'business_evidence_upload_forbidden');
  RESET ROLE;
  -- The unconditional index also protects against direct privileged duplicate inserts.
  PERFORM onboarding_test.expect_error(format('INSERT INTO public.business_rightsholder_verifications(owner_user_id,product_id,audio_item_id,ai_service,service_track_title,service_track_url) SELECT owner_user_id,product_id,audio_item_id,ai_service,service_track_title,service_track_url FROM public.business_rightsholder_verifications WHERE id = %L',v),'duplicate key value violates unique constraint');
  INSERT INTO public.platform_user_roles VALUES('00000000-0000-0000-0000-000000000002','admin');
  SET LOCAL ROLE authenticated;
  PERFORM onboarding_test.expect_error(format('SELECT public.moderator_business_verification_action(%L,''reopen'',''Correct evidence'')',v),'business_self_moderation_forbidden');
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
  PERFORM onboarding_test.expect_error(format('SELECT public.moderator_business_verification_action(%L,''reopen'','' '')',v),'business_moderation_reason_required');
  PERFORM public.moderator_business_verification_action(v,'reopen','Correct evidence');
  PERFORM onboarding_test.check_true((SELECT status = 'needs_info' FROM public.business_rightsholder_verifications WHERE id = v),'reopen keeps the same verification');
  PERFORM onboarding_test.check_true((SELECT count(*) = 1 FROM public.business_rightsholder_moderation_audit
    WHERE verification_id = v AND action = 'reopen' AND previous_status = 'rejected' AND next_status = 'needs_info'
      AND actor_user_id = '00000000-0000-0000-0000-000000000003' AND reason = 'Correct evidence'),'reopen audited');
  PERFORM onboarding_test.expect_error(format('SELECT public.moderator_business_verification_action(%L,''reopen'',''Again'')',v),'business_verification_transition_forbidden');
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
  PERFORM onboarding_test.expect_error(draft_call,'business_verification_already_active');
  e1 := public.author_business_evidence_reserve(v,'generation','image/png',100,repeat('a',64));
  e2 := public.author_business_evidence_reserve(v,'paid_period','application/pdf',200,repeat('b',64));
  INSERT INTO storage.objects(bucket_id,name,metadata) VALUES
    ('business-rightsholder-evidence',e1.object_path,'{"mimetype":"image/png","size":100}'),
    ('business-rightsholder-evidence',e2.object_path,'{"mimetype":"application/pdf","size":200}');
  PERFORM public.author_business_verification_submit(v,ARRAY[e1.id,e2.id],true,true,'test-v1','test-v1');
  PERFORM onboarding_test.check_true((SELECT count(*) = 1 AND bool_and(id = v AND status = 'submitted')
    FROM public.business_rightsholder_verifications WHERE owner_user_id = '00000000-0000-0000-0000-000000000002'),'corrections resubmit the single initial check');
  RESET ROLE;
END $test$;
DROP FUNCTION onboarding_test.expect_error(text,text);
DROP FUNCTION onboarding_test.check_true(boolean,text);
DROP SCHEMA onboarding_test;
`;

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
      read('supabase/migrations/20261206120200_business_rights_eligibility.sql'), sql, sql,
      "SELECT 1 / CASE WHEN count(*) = 0 THEN 1 ELSE 0 END FROM public.business_program_document_versions;",
      read('docs/business/rightsholder-onboarding-8d9cd0af-rollback.sql'),
      "SELECT 1 / CASE WHEN to_regclass('public.business_rightsholder_accounts') IS NULL AND to_regclass('public.music_rights_grants') IS NOT NULL THEN 1 ELSE 0 END;",
      sql, smoke].join('\n'));
    console.log('business-rightsholder-onboarding-sql-unit: contract + isolated PostgreSQL scenarios OK (migration applied twice)');
  } finally {
    psql('postgres', `DROP DATABASE ${db};`);
  }
}
