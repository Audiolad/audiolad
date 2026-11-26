#!/usr/bin/env node
/**
 * Catalog popularity session counting (pure, mirrors SQL threshold).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CATALOG_QUALIFIED_LISTEN_THRESHOLD_MS } from "../src/lib/catalog/sort-constants.ts";
import {
  countQualifiedListenSessions,
  isCatalogQualifiedListenSessionMs,
} from "../src/lib/catalog/sort-metrics-pure.ts";
import {
  decodeCatalogPopularCursor,
  decodeCatalogRatingCursor,
  encodeCatalogPopularCursor,
  encodeCatalogRatingCursor,
  parseCatalogSort,
} from "../src/lib/catalog/listing-contract.ts";
import {
  applyCatalogListingCursor,
  mapCatalogProductToListingItem,
  sortCatalogListingItems,
} from "../src/lib/catalog/listing.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function product(overrides = {}) {
  return {
    id: "p1",
    authorId: "a1",
    title: "Практика",
    slug: "practice",
    subtitle: null,
    description: null,
    format: "Аудиопрактика",
    productKind: "practice",
    price: 900,
    isFree: false,
    coverUrl: "/cover.jpg",
    authorName: "Анна",
    authorSlug: "anna",
    href: "/practice/anna/practice",
    meta: null,
    statsLabel: "12 мин",
    productTypeLabel: "Аудиопрактика",
    priceLabel: "900 ₽",
    sortTimestamp: 1_700_000_000_000,
    audioCount: 1,
    durationSeconds: 720,
    publishedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function candidate(overrides = {}) {
  return {
    ...mapCatalogProductToListingItem(product(overrides.id ? { id: overrides.id } : {})),
    ...overrides,
  };
}

assert.equal(CATALOG_QUALIFIED_LISTEN_THRESHOLD_MS, 40_000);
assert.equal(isCatalogQualifiedListenSessionMs(39_999), false);
assert.equal(isCatalogQualifiedListenSessionMs(40_000), true);
assert.equal(isCatalogQualifiedListenSessionMs(41_000), true);

assert.equal(
  countQualifiedListenSessions([{ listeningKey: "a", listenedMs: 39_000 }]),
  0,
  "39s is not qualified",
);
assert.equal(
  countQualifiedListenSessions([{ listeningKey: "a", listenedMs: 40_000 }]),
  1,
  "exactly 40s qualifies",
);
assert.equal(
  countQualifiedListenSessions([{ listeningKey: "a", listenedMs: 41_000 }]),
  1,
  "41s qualifies",
);

assert.equal(
  countQualifiedListenSessions([
    { listeningKey: "album", listenedMs: 30_000 },
    { listeningKey: "album", listenedMs: 35_000 },
  ]),
  1,
  "pause/resume same session sums to one qualified listen",
);

assert.equal(
  countQualifiedListenSessions([
    { listeningKey: "album", listenedMs: 90_000 },
    { listeningKey: "album:2", listenedMs: 90_000 },
  ]),
  2,
  "separate sessions count separately",
);

assert.equal(parseCatalogSort("popular"), "popular");
assert.equal(parseCatalogSort("rating"), "rating");

const popularSorted = sortCatalogListingItems(
  [
    candidate({ id: "low", popularListenCount: 1, sortTimestamp: 100 }),
    candidate({ id: "high", popularListenCount: 9, sortTimestamp: 50 }),
    candidate({ id: "tie-old", popularListenCount: 5, sortTimestamp: 80 }),
    candidate({ id: "tie-new", popularListenCount: 5, sortTimestamp: 90 }),
  ],
  "popular",
).map((item) => item.publication_id);

assert.deepEqual(popularSorted, ["high", "tie-new", "tie-old", "low"]);

const ratingSorted = sortCatalogListingItems(
  [
    candidate({ id: "r-low", totalStars: 3, sortTimestamp: 100 }),
    candidate({ id: "r-high", totalStars: 12, sortTimestamp: 50 }),
  ],
  "rating",
).map((item) => item.publication_id);

assert.deepEqual(ratingSorted, ["r-high", "r-low"]);

const popularCursor = encodeCatalogPopularCursor(5, 90, "tie-new");
const afterPopular = applyCatalogListingCursor(
  [
    candidate({ id: "high", popularListenCount: 9, sortTimestamp: 50 }),
    candidate({ id: "tie-new", popularListenCount: 5, sortTimestamp: 90 }),
    candidate({ id: "tie-old", popularListenCount: 5, sortTimestamp: 80 }),
  ],
  popularCursor,
  "popular",
).map((item) => item.publication_id);

assert.deepEqual(afterPopular, ["tie-old"], "popular keyset cursor");

const ratingCursor = encodeCatalogRatingCursor(12, 50, "r-high");
assert.deepEqual(decodeCatalogRatingCursor(ratingCursor)?.totalStars, 12);
assert.deepEqual(decodeCatalogPopularCursor(popularCursor)?.popularListenCount, 5);

const migration = readFileSync(
  join(root, "supabase/migrations/20271126140000_catalog_qualified_listen_40s_threshold.sql"),
  "utf8",
);
assert.match(migration, /session_ms >= 40000/, "SQL uses >= 40000 inclusive");
assert.match(migration, /usage_kind = 'consumer'/, "SQL excludes coffee venue facts");

const page = readFileSync(
  join(root, "src/app/(platform)/(listener)/(catalog)/catalog/page.tsx"),
  "utf8",
);
assert.match(page, /CatalogProductSort/, "catalog page mounts sort chips");

const admin = readFileSync(
  join(root, "src/components/admin/AdminCatalogSortMethodology.tsx"),
  "utf8",
);
assert.match(admin, /Методика расчёта популярности и рейтинга/);

console.log("catalog-sort-metrics-unit: ok");