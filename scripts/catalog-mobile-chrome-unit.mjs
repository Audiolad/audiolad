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
assert.doesNotMatch(layout, /xl:fixed/, "desktop search is not fixed");
assert.match(layout, /z-30/, "fixed search keeps the chrome stacking layer");
assert.match(
  layout,
  /xl:sticky xl:top-0 xl:z-20/,
  "xl search sticks in the catalog column, not over the sidebars",
);
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
assert.doesNotMatch(
  page,
  /data-catalog-desktop-filters/,
  "page no longer mounts desktop chip rows",
);
assert.doesNotMatch(page, /TopicFilterBar/, "page no longer mounts TopicFilterBar");
assert.doesNotMatch(
  page,
  /CatalogChipFilterBar/,
  "page no longer mounts CatalogChipFilterBar",
);
assert.doesNotMatch(
  layout,
  /className="lg:hidden"[\s\S]*CatalogMobileFiltersSlot/,
  "filters slot stays visible on lg and xl",
);
const shellSearch = read("src/components/listener/DesktopShellSearch.tsx");
assert.match(shellSearch, /usePathname/, "shell search reads the pathname");
assert.match(
  shellSearch,
  /pathname === ["']\/catalog["'] \|\| pathname\.startsWith\(["']\/catalog["']\)/,
  "shell search hides on /catalog",
);
assert.match(
  shellSearch,
  /if \(isCatalogRoute\) \{\s*return null;/,
  "shell search returns null on catalog",
);
const catalogSearch = read("src/components/listener/MobileCatalogSearch.tsx");
assert.match(
  catalogSearch,
  /PlatformCatalogInlineSearch density="compact"/,
  "catalog search stays compact",
);
assert.match(
  catalogSearch,
  /isCatalogRoute/,
  "catalog search mounts on /catalog at every width",
);
const shell = read("src/components/listener/ListenerAppShell.tsx");
const childrenClassMatch = shell.match(
  /const centerContentClassName = \[([\s\S]*?)\]/,
);
assert.ok(childrenClassMatch, "shell defines centerContentClassName");
const childrenClassBlock = childrenClassMatch[1];
assert.match(
  childrenClassBlock,
  /"min-w-0"/,
  "shell children class string includes min-w-0",
);
assert.doesNotMatch(
  childrenClassBlock,
  /xl:flex-1/,
  "shell children class string does not include xl:flex-1",
);
assert.doesNotMatch(
  childrenClassBlock,
  /overflow-hidden/,
  "shell children class string does not include overflow-hidden",
);
assert.match(
  shell,
  /listener-app-shell__center-scroll[^"]*xl:overflow-y-auto/,
  "center-scroll remains the desktop page scroller",
);
assert.doesNotMatch(
  globals,
  /:has\(\.listener-catalog-content\)/,
  "globals has no catalog :has overflow-hidden rule",
);
assert.doesNotMatch(
  layout,
  /listener-catalog-content[^"]*xl:overflow-hidden/,
  "catalog content does not clip the desktop page scroller",
);
assert.doesNotMatch(
  page,
  /xl:overflow-y-auto/,
  "catalog page has no nested cards scroller",
);
assert.match(
  layout,
  /listener-catalog-mobile-search[^"]*fixed/,
  "mobile search stays a fixed top layer",
);
assert.match(
  layout,
  /listener-catalog-mobile-search[^"]*xl:sticky/,
  "xl search is in-flow in the catalog column instead of a fixed overlay",
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
