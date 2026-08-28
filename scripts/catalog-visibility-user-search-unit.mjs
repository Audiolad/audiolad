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
  visibilitySearchHitHasPrivateFields,
} from "../src/lib/author-products/visibility-users.ts";

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
  assert.equal(hits[0]?.maskedEmail, "g***@example.com");
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
  assert.match(searchFn, /is_practice_author_member/);
  assert.match(searchFn, /RAISE EXCEPTION 'not_authenticated'/);
  assert.match(searchFn, /RAISE EXCEPTION 'not_authorized'/);
  assert.match(searchFn, /char_length\(v_query\) < 2/);
  assert.match(searchFn, /RETURN;/);
  assert.match(searchFn, /practice_visibility_search_attempts/);
  assert.match(searchFn, /v_recent >= 60/);
  assert.match(searchFn, /LIMIT 10/);
  assert.doesNotMatch(searchFn, /INSERT INTO public\.user_practices/);
  assert.doesNotMatch(searchFn, /INSERT INTO public\.practice_visibility_users/);
  assert.doesNotMatch(searchFn, /phone/);
  assert.doesNotMatch(searchFn, /raw_user_meta_data/);
  assert.match(searchFn, /masked_email/);
  assert.match(
    searchFn,
    /left\(btrim\(pr\.email\), 1\) \|\| '\*\*\*'/,
    "search masks emails in SQL",
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
    /is_practice_author_member/,
    "10 other author cannot use the endpoint",
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
  assert.equal(german.maskedEmail, "g***@example.com");
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
    new Set(["a***@example.com", "a***@example.com"]),
  );
  assert.notEqual(twoAnnas[0]?.userId, twoAnnas[1]?.userId);

  assert.equal(
    formatVisibilityUserPrimaryLabel({
      userId: GERMAN_ID,
      displayName: GERMAN_ID,
    }),
    GERMAN_ID,
    "UUID only if the profile has no name",
  );
  assert.equal(maskVisibilityEmail("anna.other@example.com"), "a***@example.com");
}

function testExactLookupStaysExact() {
  assert.equal(validateVisibilityLookupQuery("Герман"), "Введите точный email или UUID");
  assert.equal(validateVisibilityLookupQuery("german@example.com"), null);
  assert.equal(validateVisibilityLookupQuery(GERMAN_ID), null);
  assert.equal(shouldSearchVisibilityUsers("Герман"), true);
}

testNameSearch();
testLastNameSearch();
testFirstAndLastSearch();
testCaseInsensitiveSearch();
testExactEmailSearch();
testUuidSearch();
testShortQueryDoesNotSearch();
testResultCap();
testAuthAndPrivacySourceGuards();
testDuplicateSelectedUser();
testSelectedListUsesMaskedIdentity();
testExactLookupStaysExact();

console.log("catalog-visibility-user-search-unit: ok");
