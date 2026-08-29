#!/usr/bin/env node
/**
 * Personal product visibility MVP — helpers, catalog filter, PDP, SEO, form.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyOrdinaryCatalogEligibility,
  GUEST_ORDINARY_CATALOG_VIEWER,
  postgrestInList,
} from "../src/lib/catalog/visibility-query.ts";
import {
  adaptLegacyCatalogSourceToCard,
} from "../src/lib/catalog/legacy-adapter.ts";
import {
  canAcquirePractice,
} from "../src/lib/products/access.ts";
import {
  canRevealPublicProductPage,
  resolvePracticePageRobots,
  shouldFollowPracticePage,
  shouldIndexPracticePage,
} from "../src/lib/products/publish-preview.ts";
import {
  catalogVisibilityToListedFlag,
  isOrdinaryCatalogEligible,
  listedFlagToCatalogVisibility,
  parseCatalogVisibility,
  shouldNotifyIndexNowByVisibility,
} from "../src/lib/products/catalog-visibility.ts";
import { shouldEmitPracticeJsonLd } from "../src/lib/seo/json-ld/builders.ts";
import { hasPracticePublicIndexNowChanges } from "../src/lib/seo/indexnow/public-fields.ts";
import { validateVisibilityLookupQuery } from "../src/lib/author-products/visibility-users.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function testParseAndSync() {
  assert.equal(parseCatalogVisibility("listed", false), "listed");
  assert.equal(parseCatalogVisibility("unlisted", true), "unlisted");
  assert.equal(parseCatalogVisibility("selected_users", true), "selected_users");
  assert.equal(parseCatalogVisibility(null, true), "listed");
  assert.equal(parseCatalogVisibility(null, false), "unlisted");
  assert.equal(parseCatalogVisibility(undefined, undefined), "listed");
  assert.equal(listedFlagToCatalogVisibility(true), "listed");
  assert.equal(listedFlagToCatalogVisibility(false), "unlisted");
  assert.equal(catalogVisibilityToListedFlag("listed"), true);
  assert.equal(catalogVisibilityToListedFlag("unlisted"), false);
  assert.equal(catalogVisibilityToListedFlag("selected_users"), false);
}

function testCatalogEligibility() {
  assert.equal(
    isOrdinaryCatalogEligible({
      status: "published",
      catalogVisibility: "listed",
    }),
    true,
  );
  assert.equal(
    isOrdinaryCatalogEligible({
      status: "published",
      catalogVisibility: "unlisted",
    }),
    false,
  );
  assert.equal(
    isOrdinaryCatalogEligible({
      status: "published",
      catalogVisibility: "selected_users",
      allowlisted: true,
    }),
    true,
  );
  assert.equal(
    isOrdinaryCatalogEligible({
      status: "published",
      catalogVisibility: "selected_users",
      allowlisted: false,
    }),
    false,
  );
  assert.equal(
    isOrdinaryCatalogEligible({
      status: "draft",
      catalogVisibility: "listed",
    }),
    false,
  );
}

function testAcquireAndReveal() {
  const listed = {
    id: "p1",
    author_id: "a1",
    is_free: false,
    status: "published",
    is_catalog_listed: true,
    catalog_visibility: "listed",
  };
  const unlisted = { ...listed, is_catalog_listed: false, catalog_visibility: "unlisted" };
  const selected = {
    ...listed,
    is_catalog_listed: false,
    catalog_visibility: "selected_users",
  };

  assert.equal(canAcquirePractice(listed), true, "listed paid is buyable");
  assert.equal(canAcquirePractice(unlisted), true, "unlisted paid is buyable by direct link");
  assert.equal(
    canAcquirePractice(selected),
    false,
    "selected_users stranger cannot buy",
  );
  assert.equal(
    canAcquirePractice(selected, { canSeeSelectedUsers: true }),
    true,
    "allowlisted viewer can buy selected_users",
  );

  const stranger = { isAuthorMember: false, hasEntitlement: false, canSeeSelectedUsers: false };
  const allowlisted = { isAuthorMember: false, hasEntitlement: false, canSeeSelectedUsers: true };
  const entitled = { isAuthorMember: false, hasEntitlement: true, canSeeSelectedUsers: false };
  const author = { isAuthorMember: true, hasEntitlement: false, canSeeSelectedUsers: true };

  assert.equal(
    canRevealPublicProductPage({
      practiceStatus: "published",
      access: stranger,
      catalogVisibility: "listed",
    }),
    true,
  );
  assert.equal(
    canRevealPublicProductPage({
      practiceStatus: "published",
      access: stranger,
      catalogVisibility: "unlisted",
    }),
    true,
  );
  assert.equal(
    canRevealPublicProductPage({
      practiceStatus: "published",
      access: stranger,
      catalogVisibility: "selected_users",
      isCatalogListed: false,
    }),
    false,
    "stranger selected_users PDP is hidden",
  );
  assert.equal(
    canRevealPublicProductPage({
      practiceStatus: "published",
      access: allowlisted,
      catalogVisibility: "selected_users",
    }),
    true,
  );
  assert.equal(
    canRevealPublicProductPage({
      practiceStatus: "published",
      access: entitled,
      catalogVisibility: "selected_users",
    }),
    true,
    "entitlement keeps PDP after allowlist removal",
  );
  assert.equal(
    canRevealPublicProductPage({
      practiceStatus: "published",
      access: author,
      catalogVisibility: "selected_users",
    }),
    true,
  );
  assert.equal(
    canRevealPublicProductPage({
      practiceStatus: "draft",
      access: stranger,
    }),
    false,
  );
}

function testSeo() {
  assert.equal(shouldIndexPracticePage("published", true, "listed"), true);
  assert.equal(shouldIndexPracticePage("published", false, "unlisted"), false);
  assert.equal(shouldIndexPracticePage("published", false, "selected_users"), false);
  assert.equal(shouldFollowPracticePage("published", false, "unlisted"), true);
  assert.equal(shouldFollowPracticePage("published", false, "selected_users"), false);
  assert.deepEqual(
    resolvePracticePageRobots("published", false, "unlisted"),
    { index: false, follow: true },
  );
  assert.deepEqual(
    resolvePracticePageRobots("published", false, "selected_users"),
    { index: false, follow: false },
  );
  assert.equal(
    shouldEmitPracticeJsonLd({
      status: "published",
      isFixtureMarked: false,
      isCatalogListed: false,
      catalogVisibility: "unlisted",
    }),
    false,
  );
  assert.equal(
    shouldEmitPracticeJsonLd({
      status: "published",
      isFixtureMarked: false,
      isCatalogListed: false,
      catalogVisibility: "selected_users",
    }),
    false,
  );
  assert.equal(shouldNotifyIndexNowByVisibility("listed", true), true);
  assert.equal(shouldNotifyIndexNowByVisibility("unlisted", false), false);
  assert.equal(shouldNotifyIndexNowByVisibility("selected_users", false), false);
  assert.equal(
    hasPracticePublicIndexNowChanges({ catalog_visibility: "unlisted" }),
    true,
  );
  assert.equal(
    hasPracticePublicIndexNowChanges({ is_catalog_listed: false }),
    true,
  );
}

function testCatalogQueryBuilder() {
  const calls = [];
  const query = {
    eq(column, value) {
      calls.push(["eq", column, value]);
      return this;
    },
    or(filters) {
      calls.push(["or", filters]);
      return this;
    },
    not(column, operator, value) {
      calls.push(["not", column, operator, value]);
      return this;
    },
  };

  applyOrdinaryCatalogEligibility(query, GUEST_ORDINARY_CATALOG_VIEWER);
  assert.deepEqual(calls, [
    ["eq", "status", "published"],
    ["eq", "catalog_visibility", "listed"],
  ]);

  calls.length = 0;
  const allowId = "11111111-1111-4111-8111-111111111111";
  const hiddenId = "22222222-2222-4222-8222-222222222222";
  applyOrdinaryCatalogEligibility(query, {
    userId: allowId,
    allowlistedPracticeIds: [allowId],
    entitledPracticeIds: [hiddenId],
    hiddenPracticeIds: [hiddenId],
  });
  assert.equal(calls[0][0], "eq");
  assert.equal(calls[1][0], "or");
  assert.match(String(calls[1][1]), /catalog_visibility\.eq\.listed/);
  assert.match(String(calls[1][1]), /selected_users/);
  assert.equal(calls[2][0], "not");
  assert.equal(calls[2][3], postgrestInList([hiddenId]));
}

function testHasGrantAdapter() {
  const card = adaptLegacyCatalogSourceToCard({
    id: "pub-1",
    slug: "morning",
    title: "Утро",
    productKind: "practice",
    price: 490,
    isFree: false,
    coverUrl: "/cover.jpg",
    authorName: "Анна",
    authorSlug: "anna",
    href: "/practice/anna/morning",
    hasGrant: true,
  });
  assert.equal(card?.viewer.has_grant, true);
  assert.equal(card?.viewer.can_listen, true);

  const unpaid = adaptLegacyCatalogSourceToCard({
    id: "pub-2",
    slug: "evening",
    title: "Вечер",
    productKind: "practice",
    price: 490,
    isFree: false,
    coverUrl: "/cover.jpg",
    authorName: "Анна",
    authorSlug: "anna",
    href: "/practice/anna/evening",
    hasGrant: false,
  });
  assert.equal(unpaid?.viewer.has_grant, false);
}

function testLookupValidation() {
  assert.equal(validateVisibilityLookupQuery(""), "Введите email или UUID пользователя");
  assert.equal(validateVisibilityLookupQuery("german"), "Введите точный email или UUID");
  assert.equal(validateVisibilityLookupQuery("german@example.com"), null);
  assert.equal(
    validateVisibilityLookupQuery("11111111-1111-4111-8111-111111111111"),
    null,
  );
}

function testSourceGuards() {
  const listing = read("src/lib/catalog/listing.ts");
  assert.match(listing, /loadOrdinaryCatalogViewer/);
  assert.match(listing, /applyCatalogListingGrantState/);
  assert.doesNotMatch(listing, /searchAudioladProfiles/);

  const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
  assert.match(form, /Кому показывать продукт\?/);
  assert.match(form, /Только выбранным пользователям/);
  assert.match(form, /PracticeVisibilityUsersEditor/);
  assert.doesNotMatch(form, /\/api\/editorial\/users\/search/);

  const lookupRoute = read(
    "src/app/api/author/products/[id]/visibility-users/lookup/route.ts",
  );
  assert.match(lookupRoute, /lookup_practice_visibility_user/);
  assert.match(lookupRoute, /search_practice_visibility_users/);
  assert.match(lookupRoute, /requirePracticeMutationAccess/);
  assert.doesNotMatch(lookupRoute, /searchAudioladProfiles/);
  assert.doesNotMatch(lookupRoute, /createServiceRoleClient/);

  const similar = read("src/lib/authors/similar-authors.ts");
  assert.match(similar, /\.eq\("is_catalog_listed", true\)/);

  const catalog = read("src/lib/products/catalog.ts");
  assert.match(catalog, /applyOrdinaryCatalogEligibility/);
  assert.match(catalog, /filterPublicPracticeRows/);
  assert.doesNotMatch(catalog, /filterPublicCatalogPracticeRows/);

  const suggest = read("src/app/api/catalog/search/suggest/route.ts");
  assert.match(suggest, /loadOrdinaryCatalogViewer/);
  assert.match(suggest, /resolveCatalogViewerUserId/);
  assert.match(suggest, /viewer/);
  assert.doesNotMatch(suggest, /searchParams\.get\(\s*["']userId["']\s*\)/);

  const practicePage = read(
    "src/app/(platform)/(listener)/practice/[...segments]/page.tsx",
  );
  const metadataFn = practicePage.slice(
    practicePage.indexOf("export async function generateMetadata"),
    practicePage.indexOf("export default async function PracticePage"),
  );
  assert.match(metadataFn, /canRevealPublicProductPage/);
  assert.match(metadataFn, /resolveProductAccess/);
  assert.match(metadataFn, /PRACTICE_UNAVAILABLE_METADATA/);

  const listen = read("src/lib/listen/load-session-payload.ts");
  assert.match(listen, /catalog_visibility/);

  const access = read("src/lib/products/access.ts");
  assert.match(access, /guest_access_enabled === true/);
  assert.match(access, /canSeeProduct/);
  assert.doesNotMatch(access, /from\("user_practices"\)[\s\S]*visibility/);

  const claim = read(
    "supabase/migrations/20260901120100_practice_catalog_visibility_modes.sql",
  );
  assert.match(claim, /viewer_can_commercially_access_practice/);
  assert.match(claim, /claim_free_practice/);
  assert.doesNotMatch(
    claim,
    /INSERT INTO public\.user_practices[\s\S]{0,400}practice_visibility_users/,
  );
  assert.match(
    claim,
    /Allowlist for selected_users visibility[\s\S]*Never write user_practices from this table/,
  );

  const order = read(
    "supabase/migrations/20260901120200_create_practice_order_visibility.sql",
  );
  assert.match(order, /viewer_can_commercially_access_practice/);

  const hooks = read("src/lib/seo/indexnow/hooks.ts");
  const planner = read("src/lib/seo/indexnow/planner.ts");
  assert.match(hooks, /from "@\/lib\/seo\/indexnow\/planner"/);
  assert.match(planner, /shouldNotifyIndexNowByVisibility/);
  assert.match(planner, /catalogVisibility/);
}

testParseAndSync();
testCatalogEligibility();
testAcquireAndReveal();
testSeo();
testCatalogQueryBuilder();
testHasGrantAdapter();
testLookupValidation();
testSourceGuards();

console.log("catalog-visibility-mvp-unit: ok");
