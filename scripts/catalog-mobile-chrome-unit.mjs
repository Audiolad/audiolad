#!/usr/bin/env node
/**
 * Catalog mobile chrome: no title/back row, fixed search + spacer, SEO h1 stays hidden.
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
  /--catalog-mobile-search-height:\s*calc\(max\(0\.25rem,\s*env\(safe-area-inset-top,\s*0px\)\)\s*\+\s*52px\)/,
  "search spacer is safe-area + 52px field only",
);
assert.doesNotMatch(
  globals,
  /--catalog-mobile-search-height:[^;]*52px\s*\+/,
  "search height has no rem tail after the 52px field",
);
assert.match(
  layout,
  /pt-\[max\(0\.25rem,env\(safe-area-inset-top,0px\)\)\]/,
  "search padding-top floor is 0.25rem so Android is not flush",
);
assert.match(
  layout,
  /pt-\[max\(0\.25rem,env\(safe-area-inset-top,0px\)\)\] pb-0/,
  "search chrome drops the extra bottom padding",
);
assert.doesNotMatch(
  layout,
  /pt-\[max\(0\.75rem/,
  "old 0.75rem top floor is gone",
);
assert.doesNotMatch(
  layout,
  /listener-catalog-mobile-search[\s\S]*pb-1(?:\s|"|')/,
  "old pb-1 search tail is gone",
);
assert.match(
  globals,
  /\.listener-catalog-mobile-search,\s*\n\.listener-catalog-mobile-search-spacer/,
  "search and spacer use the same min-height rule",
);

assert.match(page, /<h1[\s\S]*Каталог[\s\S]*<\/h1>/, "catalog keeps an h1");
assert.match(page, /sr-only/, "catalog h1 stays visually hidden for SEO");
assert.doesNotMatch(page, /xl:not-sr-only/, "desktop h1 is no longer visually shown");
assert.doesNotMatch(
  page,
  /<h1[^>]*xl:block/,
  "desktop h1 is not a visible block heading",
);
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
assert.doesNotMatch(
  page,
  /AuthorListCard|searchPublishedCatalogAuthors|catalog-search-authors-heading/,
  "catalog page search does not fetch or render authors",
);
assert.doesNotMatch(
  page,
  />\s*Авторы\s*</,
  "catalog page has no Авторы section heading",
);
assert.doesNotMatch(
  page,
  /isSearchActive && authors\.length/,
  "empty catalog search depends only on hasAnyProducts",
);

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
assert.match(
  promoCarousel,
  /mt-0 xl:mt-1\.5/,
  "promo has no mobile top slack above the 4.8:1 slide",
);
assert.doesNotMatch(
  promoCarousel,
  /mt-1 xl:mt-1\.5/,
  "old mt-1 mobile promo slack is gone",
);
assert.match(promoCarousel, /aspect-\[4\.8\/1\]/, "promo slide ratio stays 4.8:1");
assert.match(promoCarousel, /object-contain/, "promo images stay contain");
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
assert.match(page, /hidden lg:block/, "filter chips appear from lg");
assert.match(
  page,
  /className="hidden lg:block xl:shrink-0" data-catalog-desktop-filters/,
  "desktop filters wrapper is hidden below lg and does not shrink at xl",
);
assert.match(
  layout,
  /className="lg:hidden"[\s\S]*CatalogMobileFiltersSlot/,
  "mobile filters slot is hidden from lg",
);
assert.match(
  layout,
  /listener-catalog-content[^"]*xl:min-h-0/,
  "catalog content can shrink in the desktop center column",
);
assert.match(
  layout,
  /listener-catalog-content[^"]*xl:overflow-hidden/,
  "catalog content does not become the desktop page scroller",
);
assert.match(
  layout,
  /listener-catalog-content[^"]*xl:flex-1/,
  "catalog content fills the remaining desktop center column",
);
assert.match(
  page,
  /className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto"/,
  "product grid and empty state share a desktop-only cards scroller",
);
assert.match(
  globals,
  /\.listener-app-shell__center-scroll:has\(\.listener-catalog-content\)\s*\{\s*overflow:\s*hidden;/,
  "center-scroll stops being the page scroller when it contains catalog",
);
assert.match(
  layout,
  /listener-catalog-mobile-search[^"]*fixed/,
  "mobile search stays a fixed top layer",
);
assert.match(
  layout,
  /listener-catalog-mobile-search[^"]*xl:hidden/,
  "fixed search remains hidden from xl",
);
const shell = read("src/components/listener/ListenerAppShell.tsx");
assert.match(
  shell,
  /centerColumnClassName,\s*"min-w-0 xl:flex xl:min-h-0 xl:flex-1 xl:flex-col"/,
  "shell children still pass catalog height to the center column",
);
assert.doesNotMatch(
  shell,
  /centerColumnClassName,[\s\S]{0,120}overflow-hidden/,
  "ListenerAppShell children class string does not include overflow-hidden",
);
assert.match(
  layout,
  /listener-catalog-content[^"]*xl:overflow-hidden/,
  "catalog content still clamps overflow at xl",
);
assert.match(
  page,
  /xl:shrink-0" data-catalog-desktop-filters/,
  "filters wrapper includes xl:shrink-0",
);

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
