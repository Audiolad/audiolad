#!/usr/bin/env node
/**
 * Catalog mobile chrome: no title/back row, fixed search + spacer, desktop h1 stays.
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
const globals = read("src/app/globals.css");

assert.doesNotMatch(
  layout,
  /CatalogMobileHeader/,
  "mobile catalog no longer mounts the title/back header",
);
assert.doesNotMatch(layout, /Назад/, "mobile catalog chrome has no back control");
assert.match(layout, /MobileCatalogSearch/, "mobile catalog still mounts search");
assert.match(
  layout,
  /listener-catalog-mobile-search/,
  "mobile search keeps its layout hook",
);
assert.match(layout, /fixed top-0 inset-x-0/, "mobile search is a fixed top layer");
assert.doesNotMatch(layout, /sticky/, "mobile search is no longer sticky");
assert.match(layout, /z-30/, "fixed search keeps the chrome stacking layer");
assert.match(layout, /xl:hidden/, "fixed search stays mobile-only");
assert.match(
  layout,
  /listener-catalog-mobile-search-spacer/,
  "fixed search has a matching-height spacer",
);
assert.match(
  layout,
  /listener-catalog-mobile-search-spacer[\s\S]*xl:hidden/,
  "search spacer stays mobile-only",
);
assert.match(
  layout,
  /safe-area-inset-top/,
  "fixed search respects the top safe-area",
);
assert.match(
  layout,
  /CatalogMobileFiltersSlot/,
  "Фильтры sit in the fixed search row",
);
const search = read("src/components/listener/PlatformSearchField.tsx");
assert.match(search, /isCompact \? null/, "compact catalog search has no Найти button");
assert.match(search, />\s*Найти\s*</, "shell search still has Найти");
assert.match(
  globals,
  /--catalog-mobile-search-height/,
  "search height and spacer share one CSS variable",
);
assert.match(
  globals,
  /\.listener-catalog-mobile-search,\s*\n\.listener-catalog-mobile-search-spacer/,
  "search and spacer use the same min-height rule",
);

assert.match(page, /<h1[\s\S]*Каталог[\s\S]*<\/h1>/, "catalog keeps an h1");
assert.match(page, /sr-only/, "mobile h1 is not a visible title");
assert.match(page, /xl:not-sr-only/, "desktop h1 stays visible");
assert.match(page, /xl:block/, "desktop h1 is a block heading");
assert.doesNotMatch(
  page,
  /Опубликованные аудиопродукты авторов платформы/,
  "default catalog no longer shows the intro text",
);
assert.match(page, /showCatalogPromo/, "unfiltered catalog names the promo gate");
assert.match(
  page,
  /!isSearchActive && !isTopicFiltered/,
  "promo is hidden during search and topic filters",
);
assert.match(page, /CatalogPromoCarousel/, "unfiltered catalog mounts the promo carousel");

const promoCarousel = read("src/components/catalog/CatalogPromoCarousel.tsx");
const promoConfig = read("src/lib/catalog/catalog-promo.ts");
assert.match(
  promoCarousel,
  /data-catalog-promo-id/,
  "promo slides expose data-catalog-promo-id",
);
assert.match(
  promoCarousel,
  /data-catalog-promo-position/,
  "promo slides expose data-catalog-promo-position",
);
assert.match(promoConfig, /export type CatalogPromo/, "CatalogPromo is a typed entity");
assert.match(promoConfig, /startsAt\?/, "promo config reserves startsAt");
assert.match(promoConfig, /endsAt\?/, "promo config reserves endsAt");
assert.match(promoConfig, /audience\?/, "promo config reserves audience");
assert.match(promoConfig, /experimentKey\?/, "promo config reserves experimentKey");
assert.doesNotMatch(
  promoConfig,
  /createClient|from\(|supabase/i,
  "promo MVP is typed config, not SQL or API",
);
assert.match(
  page,
  /data-catalog-desktop-filters/,
  "desktop filter chips stay in the page",
);
assert.match(page, /hidden xl:block/, "filter chips are not in the mobile page flow");

assert.doesNotMatch(
  page,
  /buildCatalogPlaySessionUrl|fetchCatalogPlaySession|loadCatalogPlaySession/,
  "catalog page does not change play session wiring",
);
assert.doesNotMatch(
  layout,
  /\/api\/catalog|library_saves|BuyPracticeButton/,
  "catalog layout does not touch API, saves, or checkout",
);

console.log("catalog-mobile-chrome-unit: ok");
