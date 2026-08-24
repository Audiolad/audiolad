#!/usr/bin/env node
/**
 * Catalog mobile filters: sheet next to search, desktop chips stay, same hrefs.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

const layout = read(
  "src/app/(platform)/(listener)/(catalog)/catalog/layout.tsx",
);
const page = read("src/app/(platform)/(listener)/(catalog)/catalog/page.tsx");
const filters = read("src/components/catalog/CatalogMobileFilters.tsx");
const filterUi = read("src/lib/catalog/catalog-filter-ui.ts");
const href = read("src/lib/catalog/topic-filter.ts");
const play = read("src/components/products/CatalogProductPlayButton.tsx");
const heart = read("src/components/products/CatalogProductHeartButton.tsx");
const listingApi = read("src/app/api/catalog/route.ts");

assert.match(layout, /CatalogMobileFiltersSlot/, "sticky chrome mounts filters");
assert.match(layout, /MobileCatalogSearch/, "search stays next to filters");
assert.match(layout, /Фильтры|CatalogMobileFilters/, "filters sit in the search row");

assert.match(page, /data-catalog-desktop-filters/, "desktop chips stay on the page");
assert.match(page, /hidden xl:block/, "page chips are desktop-only");
assert.match(page, /TopicFilterBar/, "desktop still has topic chips");
assert.match(page, /CatalogChipFilterBar/, "desktop still has access/kind chips");
assert.match(page, /buildCatalogHref/, "desktop chips still use buildCatalogHref");

assert.match(filters, /data-catalog-mobile-filters-button/, "Фильтры button is marked");
assert.match(filters, /data-catalog-mobile-filters-sheet/, "sheet is marked");
assert.match(filters, /AddToPlaylistSheet|role="dialog"/, "sheet is a dialog");
assert.match(filters, /Тематика/, "sheet has topic group");
assert.match(filters, /Доступ/, "sheet has access group");
assert.match(filters, /Тип/, "sheet has kind group");
assert.match(filters, /CATALOG_ACCESS_FILTER_OPTIONS/, "sheet uses shared access options");
assert.match(filters, /CATALOG_KIND_FILTER_OPTIONS/, "sheet uses shared kind options");
assert.match(filterUi, /Подарки/, "access includes gifts");
assert.match(filterUi, /Продукты/, "access includes paid");
assert.match(filterUi, /Практики/, "kind includes practices");
assert.match(filterUi, /Музыка/, "kind includes music");
assert.match(filterUi, /Посты/, "kind includes posts");
assert.match(filters, /buildCatalogHref/, "sheet options use buildCatalogHref");
assert.match(filters, /q: searchQuery/, "sheet keeps the current search query");
assert.doesNotMatch(filters, /buildCatalogHref\s*=/, "sheet does not redefine hrefs");
assert.doesNotMatch(filters, /from "next\/link"/, "sheet chips are not links");
assert.doesNotMatch(filters, /onNavigate/, "chips do not close or navigate on tap");
assert.doesNotMatch(
  filters,
  /href=\{buildCatalogHref/,
  "chips do not navigate via href",
);
assert.match(filters, /setDraftTopic|draftTopic/, "topic chips update draft only");
assert.match(filters, /grid-rows-2/, "topics stay in two visual rows");
assert.match(filters, /grid-flow-col/, "topics flow sideways in columns");
assert.match(filters, /overflow-x-auto/, "topics scroll horizontally");
assert.match(filters, /Применить/, "Apply button exists");
assert.match(
  filters,
  /router\.replace\(\s*buildCatalogHref/,
  "Apply uses buildCatalogHref in one replace",
);
assert.match(
  filters,
  /function close\(\) \{\s*setOpen\(false\);\s*\}/,
  "close discards draft without applying",
);
assert.doesNotMatch(
  filters,
  /event\.key === "Escape"[\s\S]{0,200}router\./,
  "Escape does not apply draft",
);
assert.doesNotMatch(
  filters,
  /event\.target === event\.currentTarget[\s\S]{0,200}router\./,
  "overlay close does not apply draft",
);

assert.match(href, /function buildCatalogHref/, "href helper is unchanged in place");
assert.match(href, /params.set\("topic"/, "topic query is still topic=");
assert.match(href, /params.set\("access"/, "access query is still access=");
assert.match(href, /params.set\("kind"/, "kind query is still kind=");
assert.match(href, /params.set\("q"/, "search query is still q=");

assert.match(play, /fetchCatalogPlaySession/, "Play still loads the catalog session");
assert.doesNotMatch(play, /href=["']\/listen/, "Play still does not go to /listen");
assert.match(heart, /useCatalogLibrarySave/, "Heart still uses the library save hook");
assert.match(
  read("src/lib/library/use-catalog-library-save.ts"),
  /\/api\/library\/saves/,
  "Heart save hook still posts to library_saves",
);
assert.doesNotMatch(
  listingApi,
  /playbackMode|entrySurface|previewStartMs/,
  "GET /api/catalog stays unchanged",
);

console.log("catalog-mobile-filters-unit: ok");
