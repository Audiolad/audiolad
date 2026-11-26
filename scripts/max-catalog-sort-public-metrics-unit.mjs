#!/usr/bin/env -S npx tsx
/**
 * MAX/VK guest catalog: public ▶/★ must match across new, popular, and rating sorts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCatalogPublicMetrics } from "../src/lib/catalog/public-metrics.ts";
import { listMaxPublishedCatalog } from "../src/lib/max/catalog.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

const publicationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const expectedMetrics = buildCatalogPublicMetrics(42, 9);
const expectedPublicMetrics = {
  qualifiedListenCount: 42,
  totalStars: 9,
};

function catalogProduct() {
  return {
    id: publicationId,
    slug: "metric-fixture",
    title: "Metric fixture",
    subtitle: null,
    productKind: "practice",
    publicationClass: "practice",
    format: null,
    price: 0,
    compareAtPrice: null,
    isFree: true,
    coverUrl: null,
    coverImage: null,
    updatedAt: null,
    authorName: "Автор",
    authorSlug: "author",
    href: "/practice/author/metric-fixture",
    meta: null,
    statsLabel: null,
    productTypeLabel: "Аудиопрактика",
    priceLabel: "Бесплатно",
    sortTimestamp: 1_000,
    durationSeconds: 600,
    publishedAt: "2026-01-01T00:00:00.000Z",
    gallery: [],
  };
}

function withRankedMetrics(candidates) {
  return candidates.map((item) => ({
    ...item,
    popularListenCount: 42,
    totalStars: 9,
  }));
}

function baseInput(sort) {
  return {
    sort,
    getServiceClient: () => ({}),
    getCatalogProducts: async () => [catalogProduct()],
    searchCatalogProducts: async () => {
      throw new Error("search must not run");
    },
    rankCatalogListingCandidates: async (_client, candidates) =>
      withRankedMetrics(candidates),
    loadListingPublicMetricsById: async (publicationIds) => {
      assert.deepEqual(publicationIds, [publicationId]);
      return new Map([[publicationId, expectedMetrics]]);
    },
  };
}

for (const sort of ["new", "popular", "rating"]) {
  const listed = await listMaxPublishedCatalog(baseInput(sort));
  assert.equal(listed.ok, true, `${sort}: listing ok`);
  assert.deepEqual(
    listed.items[0]?.publicMetrics,
    expectedPublicMetrics,
    `${sort}: card metrics match canonical public metrics`,
  );
}

const maxCatalogSource = read("src/lib/max/catalog.ts");
assert.match(
  maxCatalogSource,
  /sort === "new"[\s\S]*loadCatalogListingPublicMetricsById/,
  "MAX catalog loads card metrics on default (new) sort",
);

const vkCatalogSource = read("src/lib/vk/catalog.ts");
assert.match(vkCatalogSource, /listMaxPublishedCatalog/);
assert.equal(
  vkCatalogSource.includes("loadMaxPublishedCatalog"),
  false,
  "VK guest catalog reuses canonical MAX loader",
);

console.log("max-catalog-sort-public-metrics-unit: ok");