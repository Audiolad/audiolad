#!/usr/bin/env -S npx tsx
/**
 * Public catalog metrics: DTO, listing attach, format, UI hooks.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCatalogPublicMetrics,
  formatCatalogPublicMetricCount,
} from "../src/lib/catalog/public-metrics.ts";
import {
  paginateCatalogListingItems,
  attachPublicMetricsToListingResult,
} from "../src/lib/catalog/listing.ts";
import { adaptLegacyCatalogSourceToCard } from "../src/lib/catalog/legacy-adapter.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

assert.equal(formatCatalogPublicMetricCount(1245), "1 245");
assert.deepEqual(buildCatalogPublicMetrics(12, 7), {
  qualified_listen_count: 12,
  total_stars: 7,
});

const card = adaptLegacyCatalogSourceToCard({
  id: "p1",
  slug: "slug",
  title: "Title",
  href: "/practice/a/slug",
  authorName: "Author",
  authorSlug: "a",
  format: "Practice",
  productKind: "practice",
  publicationClass: "practice",
  price: 0,
  isFree: true,
  coverUrl: null,
  gallery: [],
});
assert.ok(card);
assert.deepEqual(card.public_metrics, {
  qualified_listen_count: 0,
  total_stars: 0,
});

const listingCandidate = {
  ...card,
  sortTimestamp: 10,
  popularListenCount: 42,
  totalStars: 9,
};

const popularPage = paginateCatalogListingItems([listingCandidate], {
  cursor: null,
  limit: 20,
  sort: "popular",
});
assert.deepEqual(popularPage.items[0]?.public_metrics, {
  qualified_listen_count: 42,
  total_stars: 9,
});

const freshCandidate = {
  ...listingCandidate,
  popularListenCount: 0,
  totalStars: 0,
};
const newPage = paginateCatalogListingItems([freshCandidate], {
  cursor: null,
  limit: 20,
  sort: "new",
});
assert.deepEqual(newPage.items[0]?.public_metrics, {
  qualified_listen_count: 0,
  total_stars: 0,
});

const enrichedPopular = await attachPublicMetricsToListingResult(
  popularPage,
  "popular",
  [listingCandidate],
);
assert.deepEqual(enrichedPopular.items[0]?.public_metrics, {
  qualified_listen_count: 42,
  total_stars: 9,
});

const shell = read("src/components/catalog/cards/CatalogCardShell.tsx");
assert.match(shell, /CatalogCardPublicMetrics/);
assert.match(
  shell,
  /data-catalog-card-format[\s\S]{0,220}CatalogCardPublicMetrics/,
  "metrics sit on the format row",
);
const authorIdx = shell.indexOf("card.author.name");
assert.doesNotMatch(
  shell.slice(authorIdx, authorIdx + 180),
  /CatalogCardPublicMetrics/,
  "metrics not on author row",
);

const dto = read("src/lib/catalog/dto.ts");
assert.match(dto, /public_metrics: CatalogPublicMetrics/);

const methodology = read("src/lib/admin/catalog-sort-methodology.ts");
assert.match(methodology, /Публичное отображение/);

console.log("catalog-public-metrics-unit: ok");