#!/usr/bin/env node
/**
 * selected_users allowlist search: name / email / uuid autocomplete.
 * Search resolves user_id only. It must not grant or write user_practices.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  VISIBILITY_SEARCH_DEBOUNCE_MS,
  VISIBILITY_SEARCH_LIMIT,
  VISIBILITY_SEARCH_MIN_QUERY_LENGTH,
  VISIBILITY_SEARCH_PUBLIC_KEYS,
  formatVisibilityUserPrimaryLabel,
  isVisibilityUserAlreadySelected,
  maskVisibilityEmail,
  profileMatchesVisibilitySearchQuery,
  sanitizeVisibilitySearchHit,
  searchVisibilityProfiles,
  shouldSearchVisibilityUsers,
  validateVisibilityLookupQuery,
  validateVisibilitySearchQuery,
  visibilityJsonHasRawEmail,
  visibilitySearchHitHasPrivateFields,
} from "../src/lib/author-products/visibility-users.ts";
import {
  DEFAULT_ALLOWED_DATABASE,
  hasIsolatedOrTestToken,
  parseAllowedDatabaseName,
  parseAllowedDatabaseUrl,
} from "./catalog-visibility-user-search-isolated.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

const GERMAN_ID = "11111111-1111-4111-8111-111111111111";
const ANNA_ID = "22222222-2222-4222-8222-222222222222";
const ANNA_OTHER_ID = "33333333-3333-4333-8333-333333333333";
const PETR_ID = "44444444-4444-4444-8444-444444444444";

const profiles = [
  {
    userId: GERMAN_ID,
    fullName: "Герман Иванов",
    email: "german@example.com",
  },
  {
    userId: ANNA_ID,
    fullName: "Анна Иванова",
    email: "anna.ivanova@example.com",
  },
  {
    userId: ANNA_OTHER_ID,
    fullName: "Анна Иванова",
    email: "anna.other@example.com",
  },
  {
    userId: PETR_ID,
    fullName: "Пётр Петров",
    email: "petr@example.com",
  },
  ...Array.from({ length: 12 }, (_, index) => ({
    userId: `55555555-5555-4555-8555-${String(index + 1).padStart(12, "0")}`,
    fullName: `Тест Пользователь ${index + 1}`,
    email: `test${index + 1}@example.com`,
  })),
];

function testNameSearch() {
  const hits = searchVisibilityProfiles(profiles, "Герман");
  assert.equal(hits.length, 1, "1 first name");
  assert.equal(hits[0]?.userId, GERMAN_ID);
  assert.equal(hits[0]?.displayName, "Герман Иванов");
}

function testLastNameSearch() {
  const hits = searchVisibilityProfiles(profiles, "Иванов");
  assert.ok(
    hits.some((hit) => hit.userId === GERMAN_ID),
    "2 last name",
  );
}

function testFirstAndLastSearch() {
  const hits = searchVisibilityProfiles(profiles, "Герман Иванов");
  assert.deepEqual(
    hits.map((hit) => hit.userId),
    [GERMAN_ID],
    "3 first+last",
  );
}

function testCaseInsensitiveSearch() {
  assert.equal(
    profileMatchesVisibilitySearchQuery(profiles[0], "герман"),
    true,
    "4 case-insensitive lower",
  );
  assert.equal(
    profileMatchesVisibilitySearchQuery(profiles[0], "ГЕРМАН"),
    true,
    "4 case-insensitive upper",
  );
  assert.deepEqual(
    searchVisibilityProfiles(profiles, "герман").map((hit) => hit.userId),
    [GERMAN_ID],
  );
}

function testExactEmailSearch() {
  const hits = searchVisibilityProfiles(profiles, "german@example.com");
  assert.equal(hits.length, 1, "5 exact email uniquely resolves");
  assert.equal(hits[0]?.userId, GERMAN_ID);
  assert.equal(hits[0]?.maskedEmail, "ge***an@example.com");
}

function testPartialEmailDoesNotMatch() {
  for (const query of ["gmail.com", "@example.com", "german@", "man@example"]) {
    assert.deepEqual(
      searchVisibilityProfiles(profiles, query),
      [],
      `partial email must not match: ${query}`,
    );
    assert.equal(
      profileMatchesVisibilitySearchQuery(profiles[0], query),
      false,
      `partial email must not match profile: ${query}`,
    );
  }
}

function testUuidSearch() {
  const hits = searchVisibilityProfiles(profiles, GERMAN_ID);
  assert.equal(hits.length, 1, "6 UUID");
  assert.equal(hits[0]?.userId, GERMAN_ID);
}

function testShortQueryDoesNotSearch() {
  assert.equal(VISIBILITY_SEARCH_MIN_QUERY_LENGTH, 2);
  assert.equal(shouldSearchVisibilityUsers(""), false);
  assert.equal(shouldSearchVisibilityUsers("Г"), false);
  assert.equal(shouldSearchVisibilityUsers("a"), false);
  assert.equal(validateVisibilitySearchQuery("Г"), "Введите имя, фамилию, email или UUID");
  assert.deepEqual(
    searchVisibilityProfiles(profiles, "Г"),
    [],
    "7 query < 2 does not search",
  );
  assert.equal(validateVisibilityLookupQuery("german"), "Введите точный email или UUID");
}

function testResultCap() {
  const hits = searchVisibilityProfiles(profiles, "Тест");
  assert.equal(hits.length, VISIBILITY_SEARCH_LIMIT, "8 result cap");
  assert.equal(VISIBILITY_SEARCH_LIMIT, 10);
}

function testAuthAndPrivacySourceGuards() {
  const lookupRoute = read(
    "src/app/api/author/products/[id]/visibility-users/lookup/route.ts",
  );
  const listRoute = read(
    "src/app/api/author/products/[id]/visibility-users/route.ts",
  );
  const editor = read(
    "src/components/author-dashboard/PracticeVisibilityUsersEditor.tsx",
  );
  const helpers = read("src/lib/author-products/visibility-users.ts");
  const migration = read(
    "supabase/migrations/20260903120000_search_practice_visibility_users.sql",
  );
  const addMigration = read(
    "supabase/migrations/20260901120100_practice_catalog_visibility_modes.sql",
  );

  assert.match(lookupRoute, /requirePracticeMutationAccess/);
  assert.match(lookupRoute, /search_practice_visibility_users/);
  assert.match(lookupRoute, /lookup_practice_visibility_user/);
  assert.match(lookupRoute, /shouldSearchVisibilityUsers/);
  assert.match(lookupRoute, /callAuthorUserRpc/);
  assert.doesNotMatch(lookupRoute, /createServiceRoleClient/);
  assert.doesNotMatch(lookupRoute, /searchAudioladProfiles/);
  assert.doesNotMatch(lookupRoute, /from\("profiles"\)/);
  assert.doesNotMatch(lookupRoute, /from\("user_practices"\)/);

  const searchFn = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.search_practice_visibility_users"),
    migration.indexOf("COMMENT ON FUNCTION public.search_practice_visibility_users"),
  );
  assert.match(searchFn, /v_actor := auth\.uid\(\)/);
  assert.match(searchFn, /IF v_actor IS NULL THEN/);
  assert.match(searchFn, /actor_can_manage_practice_as_author/);
  assert.match(searchFn, /is_practice_author_member/);
  assert.match(searchFn, /RAISE EXCEPTION 'not_authenticated'/);
  assert.match(searchFn, /RAISE EXCEPTION 'not_authorized'/);
  assert.match(searchFn, /char_length\(v_query\) < 2/);
  assert.match(searchFn, /RETURN;/);
  assert.match(searchFn, /practice_visibility_search_attempts/);
  assert.match(searchFn, /window_started_at/);
  assert.match(searchFn, /attempt_count/);
  assert.match(searchFn, /v_count >= 60/);
  assert.match(searchFn, /LIMIT 10/);
  assert.match(searchFn, /v_is_email/);
  assert.match(searchFn, /lower\(btrim\(pr\.email\)\) = v_query/);
  assert.doesNotMatch(searchFn, /strpos\(lower\(btrim\(pr\.email\)\)/);
  assert.doesNotMatch(searchFn, /INSERT INTO public\.user_practices/);
  assert.doesNotMatch(searchFn, /INSERT INTO public\.practice_visibility_users/);
  assert.doesNotMatch(searchFn, /phone/);
  assert.doesNotMatch(searchFn, /raw_user_meta_data/);
  assert.match(searchFn, /masked_email/);
  assert.match(searchFn, /mask_practice_visibility_email/);
  assert.match(
    migration,
    /user_id uuid PRIMARY KEY/,
    "rate limit storage is one row per actor",
  );
  assert.doesNotMatch(
    migration,
    /id bigint GENERATED ALWAYS AS IDENTITY/,
    "rate limit table is not append-only",
  );
  assert.match(lookupRoute, /checkAnalyticsRateLimit/);
  assert.doesNotMatch(lookupRoute, /email:\s*\n/);
  assert.doesNotMatch(lookupRoute, /email:\s+isVisibilityLookupEmail/);
  assert.doesNotMatch(
    lookupRoute,
    /user:\s*\{[\s\S]*email:/,
    "lookup JSON must not include an email field",
  );

  const beforeScan = searchFn.slice(0, searchFn.indexOf("FROM public.profiles"));
  assert.match(
    beforeScan,
    /char_length\(v_query\) < 2/,
    "7 short query returns before profiles scan",
  );
  assert.match(
    lookupRoute,
    /if \(!shouldSearchVisibilityUsers\(trimmed\)\)/,
    "7 route does not search short queries",
  );

  assert.match(
    lookupRoute,
    /requirePracticeMutationAccess/,
    "9 unauthenticated cannot search",
  );
  assert.match(
    searchFn,
    /not_authenticated/,
    "9 RPC rejects missing auth.uid",
  );
  assert.match(
    searchFn,
    /actor_can_manage_practice_as_author/,
    "10 other author cannot use the endpoint; support mode uses the same gate",
  );
  assert.match(
    searchFn,
    /is_practice_author_member/,
    "10 isolated apply without support mode still fail-closes on membership",
  );
  assert.match(
    searchFn,
    /not_authorized/,
    "10 other author is fail-closed",
  );
  assert.doesNotMatch(
    lookupRoute,
    /GRANT EXECUTE[\s\S]*TO anon/,
  );
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.search_practice_visibility_users\(uuid, text\) FROM anon/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.search_practice_visibility_users\(uuid, text\) TO authenticated/);
  assert.match(
    migration,
    /search_practice_visibility_users_with_support_proof/,
    "support-mode search uses the same proof wrapper pattern as lookup",
  );
  assert.match(
    migration,
    /list_practice_visibility_users_with_support_proof/,
    "list support wrapper is restamped to the masked list columns",
  );

  assert.match(listRoute, /add_practice_visibility_user/);
  assert.match(editor, /visibility-users\/lookup/);
  assert.match(
    editor,
    /body: JSON\.stringify\(\{ user_id: userId \}\)/,
    "12 selected user persists via existing visibility POST",
  );
  assert.match(
    addMigration,
    /INSERT INTO public\.practice_visibility_users/,
    "12 existing add RPC writes practice_visibility_users",
  );
  assert.doesNotMatch(editor, /from\("user_practices"\)/);
  assert.doesNotMatch(editor, /user_practices/);
  assert.doesNotMatch(
    migration,
    /INSERT INTO public\.user_practices/,
    "13 search does not create user_practices",
  );
  assert.match(
    migration,
    /never writes user_practices/,
  );
  assert.doesNotMatch(helpers, /from\("profiles"\)/);
}

function testRateLimitSqlQualifiesUserId() {
  const migration = read(
    "supabase/migrations/20260903120000_search_practice_visibility_users.sql",
  );
  const searchFn = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.search_practice_visibility_users"),
    migration.indexOf("COMMENT ON FUNCTION public.search_practice_visibility_users"),
  );
  const listFn = migration.slice(
    migration.indexOf("CREATE FUNCTION public.list_practice_visibility_users("),
    migration.indexOf("COMMENT ON FUNCTION public.list_practice_visibility_users"),
  );

  assert.doesNotMatch(
    searchFn,
    /WHERE\s+user_id\s*=/,
    "RETURNS TABLE user_id is an out-variable; qualify attempts.user_id in WHERE",
  );
  assert.doesNotMatch(
    searchFn,
    /SET\s+user_id\b/,
    "must not SET bare user_id against the attempts table",
  );
  assert.match(
    searchFn,
    /WHERE a\.user_id = v_actor/,
    "rate-limit SELECT/UPDATE must use alias a.user_id",
  );
  assert.match(
    searchFn,
    /UPDATE public\.practice_visibility_search_attempts AS a/,
    "rate-limit UPDATE must alias the attempts table",
  );
  assert.doesNotMatch(
    listFn,
    /WHERE\s+user_id\s*=/,
    "list RPC must not use bare user_id in WHERE",
  );
  assert.doesNotMatch(
    listFn,
    /SET\s+user_id\b/,
    "list RPC must not SET bare user_id",
  );
}

function testDuplicateSelectedUser() {
  const selected = [{ userId: GERMAN_ID, displayName: "Герман Иванов" }];
  assert.equal(
    isVisibilityUserAlreadySelected(selected, GERMAN_ID),
    true,
    "11 duplicate selected user not added",
  );
  assert.equal(isVisibilityUserAlreadySelected(selected, ANNA_ID), false);

  const editor = read(
    "src/components/author-dashboard/PracticeVisibilityUsersEditor.tsx",
  );
  assert.match(editor, /isVisibilityUserAlreadySelected/);
  assert.match(editor, /Этот пользователь уже добавлен/);
}

function testSelectedListUsesMaskedIdentity() {
  const editor = read(
    "src/components/author-dashboard/PracticeVisibilityUsersEditor.tsx",
  );
  assert.match(editor, /formatVisibilityUserPrimaryLabel/);
  assert.match(editor, /maskedEmail/);
  assert.match(editor, /Имя, фамилия, email или UUID/);
  assert.match(editor, /Найдите пользователя по имени, фамилии или email/);
  assert.match(editor, /Пользователи не найдены/);
  assert.match(editor, /VISIBILITY_SEARCH_DEBOUNCE_MS/);
  assert.equal(VISIBILITY_SEARCH_DEBOUNCE_MS, 300);

  const german = sanitizeVisibilitySearchHit({
    user_id: GERMAN_ID,
    display_name: "Герман Иванов",
    email: "german@example.com",
    phone: "+79990001122",
    role: "service_role",
    raw_user_meta_data: { admin: true },
  });
  assert.ok(german);
  assert.equal(formatVisibilityUserPrimaryLabel(german), "Герман Иванов");
  assert.equal(german.maskedEmail, "ge***an@example.com");
  assert.deepEqual(
    Object.keys(german).sort(),
    [...VISIBILITY_SEARCH_PUBLIC_KEYS].sort(),
    "14 response has no extra private fields",
  );
  assert.equal(visibilitySearchHitHasPrivateFields(german), false);
  assert.ok(!("email" in german));
  assert.ok(!("phone" in german));
  assert.ok(!("raw_user_meta_data" in german));
  assert.ok(!("role" in german));

  const twoAnnas = searchVisibilityProfiles(profiles, "Анна Иванова");
  assert.equal(twoAnnas.length, 2);
  assert.deepEqual(
    new Set(twoAnnas.map((hit) => hit.maskedEmail)),
    new Set(["an***va@example.com", "an***er@example.com"]),
  );
  assert.notEqual(twoAnnas[0]?.maskedEmail, twoAnnas[1]?.maskedEmail);
  assert.notEqual(twoAnnas[0]?.userId, twoAnnas[1]?.userId);

  assert.equal(
    formatVisibilityUserPrimaryLabel({
      userId: GERMAN_ID,
      displayName: GERMAN_ID,
    }),
    GERMAN_ID,
    "UUID only if the profile has no name",
  );
  assert.equal(maskVisibilityEmail("anna.ivanova@example.com"), "an***va@example.com");
  assert.equal(maskVisibilityEmail("anna.other@example.com"), "an***er@example.com");
  assert.equal(maskVisibilityEmail("german@example.com"), "ge***an@example.com");
  assert.equal(maskVisibilityEmail("a@example.com"), "***@example.com");
  assert.equal(maskVisibilityEmail("ab@example.com"), "a***@example.com");
  assert.equal(maskVisibilityEmail("abcd@example.com"), "a***d@example.com");
  assert.notEqual(
    maskVisibilityEmail("anna.ivanova@example.com"),
    maskVisibilityEmail("anna.other@example.com"),
  );
}

function testLookupJsonNeverIncludesRawEmail() {
  const lookupFixture = {
    user: {
      userId: GERMAN_ID,
      displayName: "Герман Иванов",
      firstName: "Герман",
      lastName: "Иванов",
      maskedEmail: maskVisibilityEmail("german@example.com"),
    },
    users: [
      {
        userId: GERMAN_ID,
        displayName: "Герман Иванов",
        firstName: "Герман",
        lastName: "Иванов",
        maskedEmail: maskVisibilityEmail("german@example.com"),
      },
    ],
  };
  assert.equal(visibilityJsonHasRawEmail(lookupFixture), false);
  assert.equal(
    visibilityJsonHasRawEmail({
      user: { userId: GERMAN_ID, email: "german@example.com" },
    }),
    true,
  );
  assert.equal(
    visibilityJsonHasRawEmail({
      users: [{ userId: GERMAN_ID, maskedEmail: "german@example.com" }],
    }),
    true,
  );

  const listFixture = {
    users: [
      {
        userId: GERMAN_ID,
        displayName: "Герман Иванов",
        firstName: "Герман",
        lastName: "Иванов",
        maskedEmail: "ge***an@example.com",
        createdAt: "2026-08-28T00:00:00.000Z",
      },
    ],
  };
  assert.equal(visibilityJsonHasRawEmail(listFixture), false);
}

function testExactLookupStaysExact() {
  assert.equal(validateVisibilityLookupQuery("Герман"), "Введите точный email или UUID");
  assert.equal(validateVisibilityLookupQuery("german@example.com"), null);
  assert.equal(validateVisibilityLookupQuery(GERMAN_ID), null);
  assert.equal(shouldSearchVisibilityUsers("Герман"), true);
}

function testIsolatedHarnessGuards() {
  const safeUrl = `postgresql://reader:secret@localhost:5432/${DEFAULT_ALLOWED_DATABASE}`;
  assert.equal(hasIsolatedOrTestToken(DEFAULT_ALLOWED_DATABASE), true);
  assert.equal(hasIsolatedOrTestToken("audiolad"), false);
  assert.equal(hasIsolatedOrTestToken("audiolad_production"), false);
  assert.equal(parseAllowedDatabaseUrl(undefined).ok, false);
  assert.equal(parseAllowedDatabaseUrl(safeUrl).ok, true);
  assert.match(
    parseAllowedDatabaseUrl("postgresql://host/postgres").reason,
    /unsafe database name: postgres/,
  );
  assert.match(
    parseAllowedDatabaseUrl("postgresql://host/supabase").reason,
    /unsafe database name: supabase/,
  );
  assert.match(
    parseAllowedDatabaseUrl("postgresql://host/audiolad").reason,
    /isolated or test token/,
  );
  assert.match(
    parseAllowedDatabaseUrl("postgresql://host/audiolad_production").reason,
    /production-looking/,
  );
  assert.equal(
    parseAllowedDatabaseName("audiolad_other_isolated").ok,
    false,
    "non-default isolated names still require explicit allow",
  );
  assert.equal(
    parseAllowedDatabaseName(
      "audiolad_other_isolated",
      "audiolad_other_isolated",
    ).ok,
    true,
  );

  const runner = read("scripts/catalog-visibility-user-search-isolated.mjs");
  const fixture = read("supabase/tests/catalog_visibility_user_search_isolated.sql");
  assert.match(runner, /AUDIOLAD_VISIBILITY_USER_SEARCH_DATABASE_URL/);
  assert.match(runner, /AUDIOLAD_VISIBILITY_USER_SEARCH_TRANSPORT/);
  assert.match(runner, /20260903120000_search_practice_visibility_users\.sql/);
  assert.match(runner, /catalog_visibility_user_search_isolated\.sql/);
  assert.match(fixture, /^BEGIN;$/m);
  assert.match(fixture, /^ROLLBACK;$/m);
  assert.match(fixture, /SET LOCAL ROLE authenticated/);
  assert.match(fixture, /SET LOCAL ROLE anon/);
  assert.match(fixture, /not_authorized/);
  assert.match(fixture, /gmail\.com/);
  assert.match(fixture, /user_practices/);
  assert.match(fixture, /list_practice_visibility_users/);
  assert.match(
    fixture,
    /WHERE s\.user_id = v_german_id/,
    "name-search fixture asserts membership of the fixture user, not LIMIT 1",
  );
  assert.doesNotMatch(
    fixture,
    /did not resolve the expected profile/,
    "clone DBs may have other first-name matches ahead of the fixture",
  );
  assert.doesNotMatch(runner, /\|\|\s*true/);
}

testNameSearch();
testLastNameSearch();
testFirstAndLastSearch();
testCaseInsensitiveSearch();
testExactEmailSearch();
testPartialEmailDoesNotMatch();
testUuidSearch();
testShortQueryDoesNotSearch();
testResultCap();
testAuthAndPrivacySourceGuards();
testRateLimitSqlQualifiesUserId();
testDuplicateSelectedUser();
testSelectedListUsesMaskedIdentity();
testLookupJsonNeverIncludesRawEmail();
testExactLookupStaysExact();
testIsolatedHarnessGuards();

console.log("catalog-visibility-user-search-unit: ok");
