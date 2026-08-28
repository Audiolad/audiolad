#!/usr/bin/env node
/**
 * Review regressions for listed / unlisted / selected_users.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyOrdinaryCatalogEligibility,
  GUEST_ORDINARY_CATALOG_VIEWER,
  loadOrdinaryCatalogViewer,
  OrdinaryCatalogViewerLoadError,
} from "../src/lib/catalog/visibility-query.ts";
import {
  canRevealPublicProductPage,
  PRACTICE_UNAVAILABLE_METADATA,
} from "../src/lib/products/publish-preview.ts";
import {
  isOrdinaryCatalogEligible,
  parseCatalogVisibility,
} from "../src/lib/products/catalog-visibility.ts";
import { canAcquirePractice } from "../src/lib/products/access.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

const SELECTED_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LISTED_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const UNLISTED_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const GERMAN_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ID = "22222222-2222-4222-8222-222222222222";

const catalogRows = [
  {
    id: LISTED_ID,
    status: "published",
    catalog_visibility: "listed",
    is_catalog_listed: true,
    title: "Public listed",
  },
  {
    id: SELECTED_ID,
    status: "published",
    catalog_visibility: "selected_users",
    is_catalog_listed: false,
    title: "Personal for German",
  },
  {
    id: UNLISTED_ID,
    status: "published",
    catalog_visibility: "unlisted",
    is_catalog_listed: false,
    title: "Direct link only",
  },
];

function ordinaryCatalogBrowse(rows, viewer) {
  return rows.filter((row) => {
    if (viewer.hiddenPracticeIds.includes(row.id)) {
      return false;
    }

    return isOrdinaryCatalogEligible({
      status: row.status,
      catalogVisibility: row.catalog_visibility,
      isCatalogListed: row.is_catalog_listed,
      allowlisted: viewer.allowlistedPracticeIds.includes(row.id),
    });
  });
}

function germanViewer() {
  return {
    userId: GERMAN_ID,
    allowlistedPracticeIds: [SELECTED_ID],
    entitledPracticeIds: [],
    hiddenPracticeIds: [],
  };
}

function otherViewer() {
  return {
    userId: OTHER_ID,
    allowlistedPracticeIds: [],
    entitledPracticeIds: [],
    hiddenPracticeIds: [],
  };
}

function testOrdinaryBrowseContract() {
  const german = ordinaryCatalogBrowse(catalogRows, germanViewer());
  const other = ordinaryCatalogBrowse(catalogRows, otherViewer());
  const guest = ordinaryCatalogBrowse(catalogRows, GUEST_ORDINARY_CATALOG_VIEWER);

  assert.deepEqual(
    german.map((row) => row.id).sort(),
    [LISTED_ID, SELECTED_ID].sort(),
    "allowlisted German sees listed + selected in ordinary browse",
  );
  assert.deepEqual(
    other.map((row) => row.id),
    [LISTED_ID],
    "other authenticated does not see selected",
  );
  assert.deepEqual(
    guest.map((row) => row.id),
    [LISTED_ID],
    "guest does not see selected",
  );
  assert.equal(
    german.some((row) => row.id === UNLISTED_ID),
    false,
    "unlisted never in ordinary browse",
  );
  assert.equal(
    other.some((row) => row.id === UNLISTED_ID),
    false,
  );
  assert.equal(
    guest.some((row) => row.id === UNLISTED_ID),
    false,
  );
}

function testEligibilityIsNotListedFlag() {
  assert.equal(
    isOrdinaryCatalogEligible({
      status: "published",
      catalogVisibility: "selected_users",
      isCatalogListed: false,
      allowlisted: true,
    }),
    true,
    "selected stays eligible even though is_catalog_listed=false",
  );
}

function testQueryBuilderIncludesSelectedForAllowlist() {
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
    not() {
      return this;
    },
  };

  applyOrdinaryCatalogEligibility(query, germanViewer());
  assert.equal(calls[0][0], "eq");
  assert.equal(calls[1][0], "or");
  assert.match(String(calls[1][1]), /catalog_visibility\.eq\.listed/);
  assert.match(String(calls[1][1]), /selected_users/);
  assert.match(String(calls[1][1]), new RegExp(SELECTED_ID));

  calls.length = 0;
  applyOrdinaryCatalogEligibility(query, GUEST_ORDINARY_CATALOG_VIEWER);
  assert.deepEqual(calls, [
    ["eq", "status", "published"],
    ["eq", "catalog_visibility", "listed"],
  ]);
}

async function testViewerErrorFailClosed() {
  const exploding = {
    from(table) {
      return {
        select() {
          return this;
        },
        eq() {
          if (table === "user_practices") {
            return Promise.resolve({
              data: null,
              error: { message: "user_practices unavailable" },
            });
          }

          return Promise.resolve({ data: [], error: null });
        },
      };
    },
  };

  await assert.rejects(
    () => loadOrdinaryCatalogViewer(exploding, GERMAN_ID),
    (error) =>
      error instanceof OrdinaryCatalogViewerLoadError &&
      String(error.message).includes("user_practices unavailable"),
  );

  const allowlistBoom = {
    from(table) {
      return {
        select() {
          return this;
        },
        eq() {
          if (table === "practice_visibility_users") {
            return Promise.resolve({
              data: [{ practice_id: SELECTED_ID }],
              error: { message: "allowlist unavailable" },
            });
          }

          return Promise.resolve({ data: [], error: null });
        },
      };
    },
  };

  await assert.rejects(
    () => loadOrdinaryCatalogViewer(allowlistBoom, GERMAN_ID),
    OrdinaryCatalogViewerLoadError,
  );
}

function testMetadataGate() {
  const stranger = {
    isAuthorMember: false,
    hasEntitlement: false,
    canSeeSelectedUsers: false,
  };
  const allowlisted = {
    isAuthorMember: false,
    hasEntitlement: false,
    canSeeSelectedUsers: true,
  };

  assert.equal(
    canRevealPublicProductPage({
      practiceStatus: "published",
      access: stranger,
      catalogVisibility: "selected_users",
      isCatalogListed: false,
    }),
    false,
  );
  assert.equal(
    canRevealPublicProductPage({
      practiceStatus: "published",
      access: allowlisted,
      catalogVisibility: "selected_users",
      isCatalogListed: false,
    }),
    true,
  );
  assert.equal(PRACTICE_UNAVAILABLE_METADATA.title, "Аудиопродукт – АудиоЛад");
  assert.deepEqual(PRACTICE_UNAVAILABLE_METADATA.robots, {
    index: false,
    follow: false,
  });
  assert.equal(
    PRACTICE_UNAVAILABLE_METADATA.title.includes("Personal for German"),
    false,
  );

  const page = read(
    "src/app/(platform)/(listener)/practice/[...segments]/page.tsx",
  );
  const metadataFn = page.slice(
    page.indexOf("export async function generateMetadata"),
    page.indexOf("export default async function PracticePage"),
  );
  assert.match(metadataFn, /canRevealPublicProductPage/);
  assert.match(metadataFn, /resolveProductAccess/);
  assert.match(metadataFn, /PRACTICE_UNAVAILABLE_METADATA/);
  assert.match(metadataFn, /auth\.getUser\(\)/);
}

function testListenUsesRealVisibility() {
  assert.equal(parseCatalogVisibility(undefined, false), "unlisted");
  assert.equal(
    parseCatalogVisibility("selected_users", false),
    "selected_users",
  );

  const listen = read("src/lib/listen/load-session-payload.ts");
  assert.match(listen, /catalog_visibility,/);
  assert.match(listen, /resolveProductAccess/);

  const listenPage = read("src/lib/listen/page-shared.tsx");
  const practiceSelect = listenPage.slice(
    listenPage.indexOf('.from("practices")'),
    listenPage.indexOf(".maybeSingle()", listenPage.indexOf('.from("practices")')),
  );
  assert.match(
    practiceSelect,
    /is_catalog_listed,\s+catalog_visibility,\s+guest_access_enabled,/,
    "/listen must pass the stored visibility to resolveProductAccess",
  );

  const listenAccess = read("src/lib/listen/access.ts");
  assert.match(listenAccess, /catalog_visibility\?: string \| null/);

  const selected = {
    id: SELECTED_ID,
    author_id: "author-1",
    is_free: false,
    status: "published",
    is_catalog_listed: false,
    catalog_visibility: "selected_users",
    guest_access_enabled: true,
  };
  assert.equal(
    canAcquirePractice(selected),
    false,
    "selected + guest_access is not commercially public",
  );
  assert.equal(
    canRevealPublicProductPage({
      practiceStatus: "published",
      access: {
        isAuthorMember: false,
        hasEntitlement: false,
        canSeeSelectedUsers: false,
      },
      catalogVisibility: "selected_users",
      isCatalogListed: false,
    }),
    false,
    "guest cannot open selected only because guest_access is on",
  );
  assert.equal(
    canRevealPublicProductPage({
      practiceStatus: "published",
      access: {
        isAuthorMember: false,
        hasEntitlement: true,
        canSeeSelectedUsers: false,
      },
      catalogVisibility: "selected_users",
      isCatalogListed: false,
    }),
    true,
    "entitled viewer can open selected",
  );
}

function testSourceArchitecture() {
  const catalog = read("src/lib/products/catalog.ts");
  assert.match(catalog, /applyOrdinaryCatalogEligibility/);
  assert.match(catalog, /filterPublicPracticeRows/);
  assert.doesNotMatch(catalog, /filterPublicCatalogPracticeRows/);

  const listing = read("src/lib/catalog/listing.ts");
  assert.match(listing, /getPublishedCatalogProducts/);
  assert.match(listing, /searchPublishedCatalogProducts/);
  assert.match(listing, /loadOrdinaryCatalogViewer/);

  const suggest = read("src/app/api/catalog/search/suggest/route.ts");
  assert.match(suggest, /loadOrdinaryCatalogViewer/);
  assert.match(suggest, /resolveCatalogViewerUserId\(supabase\)/);
  assert.match(suggest, /viewer:\s*\{\s*\.\.\.ordinaryViewer,\s*visitorId,\s*userId,/);
  assert.doesNotMatch(suggest, /searchParams\.get\(\s*["']userId["']\s*\)/);
  assert.doesNotMatch(suggest, /searchParams\.get\(\s*["']user_id["']\s*\)/);

  const visibility = read("src/lib/catalog/visibility-query.ts");
  assert.match(visibility, /OrdinaryCatalogViewerLoadError/);
  assert.match(visibility, /allowlistResult\.error/);
  assert.match(visibility, /entitlementResult\.error/);
  assert.match(visibility, /savesResult\.error/);

  const migration = read(
    "supabase/migrations/20260830120100_practice_catalog_visibility_modes.sql",
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.is_practice_author_member\(uuid, uuid\) TO authenticated/,
  );
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.is_practice_author_member\(uuid, uuid\) FROM anon/);
  assert.match(migration, /catalog_visibility = 'listed'/);
  assert.match(migration, /IS DISTINCT FROM 'selected_users'/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /ALTER COLUMN catalog_visibility DROP DEFAULT/);
  assert.match(migration, /SET search_path = public, pg_temp/);
  const allowlistAuthorPolicy = migration.slice(
    migration.indexOf('CREATE POLICY "Author members can view practice visibility rows"'),
    migration.indexOf("-- ---------------------------------------------------------------------------\n-- 4. RLS"),
  );
  assert.match(
    allowlistAuthorPolicy,
    /public\.is_practice_author_member\(\s*practice_id,\s*auth\.uid\(\)\s*\)/,
  );
  assert.doesNotMatch(allowlistAuthorPolicy, /FROM public\.practices/);
  const addVisibilityUser = migration.slice(
    migration.indexOf("CREATE OR REPLACE FUNCTION public.add_practice_visibility_user"),
    migration.indexOf("CREATE OR REPLACE FUNCTION public.remove_practice_visibility_user"),
  );
  assert.match(addVisibilityUser, /pg_advisory_xact_lock/);
  assert.match(addVisibilityUser, /v_recent >= 20/);
  assert.match(addVisibilityUser, /INSERT INTO public\.practice_visibility_lookup_attempts/);

  const publicPlaylist = read("src/lib/playlists/public-detail.ts");
  assert.match(
    publicPlaylist,
    /if \(!practice \|\| practice\.catalog_visibility === "selected_users"\) \{\s*continue;/,
    "public playlist omits inaccessible selected slots rather than creating a placeholder",
  );
  assert.doesNotMatch(
    publicPlaylist,
    /title: "Практика временно недоступна"/,
    "public playlist has no selected-product placeholder",
  );

  const publicPlaylistPolicy = read(
    "supabase/migrations/20260830120300_public_playlist_selected_visibility.sql",
  );
  assert.match(publicPlaylistPolicy, /Public playlist discovery exposes listed published products only/);
  assert.match(publicPlaylistPolicy, /p\.catalog_visibility = 'listed'/);
  assert.match(publicPlaylistPolicy, /p\.id = playlist_items\.practice_id/);

  const hooks = read("src/lib/seo/indexnow/hooks.ts");
  assert.match(
    hooks,
    /not a public-catalog visibility count/,
  );
}

testOrdinaryBrowseContract();
testEligibilityIsNotListedFlag();
testQueryBuilderIncludesSelectedForAllowlist();
await testViewerErrorFailClosed();
testMetadataGate();
testListenUsesRealVisibility();
testSourceArchitecture();

console.log("catalog-visibility-review-unit: ok");
