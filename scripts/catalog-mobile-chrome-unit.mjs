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
const mobileTopChrome = read("src/components/listener/MobileTopChrome.tsx");
const mobileTopChromeLib = read("src/lib/listener/mobile-top-chrome.ts");

assert.doesNotMatch(
  layout,
  /CatalogMobileHeader/,
  "mobile catalog no longer mounts the title/back header",
);
assert.doesNotMatch(layout, /Назад/, "mobile catalog chrome has no back control");
assert.match(layout, /MobileCatalogSearch/, "mobile catalog still mounts search");
assert.match(
  layout,
  /<MobileTopChrome variant=["']catalog["']/,
  "catalog layout uses the shared MobileTopChrome primitive",
);
assert.doesNotMatch(layout, /sticky/, "mobile search is no longer sticky");
assert.doesNotMatch(layout, /xl:sticky/, "catalog layout does not use xl:sticky");
assert.match(
  mobileTopChrome,
  /fixed top-0 inset-x-0/,
  "shared chrome is a fixed top layer",
);
assert.match(
  mobileTopChrome,
  /z-30/,
  "fixed search keeps the chrome stacking layer",
);
assert.match(
  mobileTopChrome,
  /xl:hidden/,
  "shared chrome is mobile-only at xl",
);
assert.match(
  mobileTopChrome,
  /catalog: "px-5 /,
  "catalog chrome stays px-5",
);
const contentClassMatch = layout.match(
  /className="listener-catalog-content[^"]*"/,
);
assert.ok(contentClassMatch, "catalog content has a className");
assert.match(
  contentClassMatch[0],
  /px-2\.5/,
  "catalog content uses 10px mobile padding",
);
assert.match(
  contentClassMatch[0],
  /md:px-5/,
  "catalog content restores 20px from md",
);
assert.match(
  contentClassMatch[0],
  /lg:px-10/,
  "lg catalog content padding stays 40px",
);
assert.match(
  contentClassMatch[0],
  /xl:px-6/,
  "xl catalog content padding stays 24px",
);
assert.doesNotMatch(
  contentClassMatch[0],
  /(?:^|[\s"])px-5(?:[\s"]|$)/,
  "catalog content has no bare mobile px-5",
);
assert.doesNotMatch(
  layout,
  /xl:static|xl:inset-auto|xl:z-auto/,
  "xl search is not in-flow inside catalog children",
);
assert.match(
  mobileTopChrome,
  /data-mobile-top-chrome-spacer/,
  "fixed search has a matching-height spacer",
);
assert.match(
  mobileTopChrome,
  /mobile-top-chrome-spacer[^"]*xl:hidden/,
  "search spacer stays mobile-only",
);
assert.match(
  mobileTopChrome,
  /safe-area-inset-top/,
  "fixed search respects the top safe-area",
);
assert.match(
  mobileTopChrome,
  /ResizeObserver/,
  "spacer height is measured from the rendered chrome",
);
assert.match(
  mobileTopChromeLib,
  /function spacerStyleFromChromeHeight/,
  "measurement writes px onto the spacer only",
);
assert.match(
  mobileTopChrome,
  /data-mobile-top-chrome-spacer[\s\S]*style=\{spacerStyleFromChromeHeight\(spacerHeightPx\)\}/,
  "measured px is applied to the spacer, not the chrome",
);
assert.doesNotMatch(
  mobileTopChrome,
  /data-mobile-top-chrome=\{variant\}[\s\S]{0,180}style=/,
  "chrome node does not take the measured spacer style",
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
  search,
  /isCompact[\s\S]{0,40}text-base/,
  "compact catalog search input is at least 16px on mobile",
);
assert.match(
  search,
  /text-base xl:text-\[15px\]/,
  "desktop shell search may stay 15px at xl",
);
assert.match(
  globals,
  /--mobile-top-chrome-fallback-catalog:\s*calc\(\s*max\(0\.75rem,\s*env\(safe-area-inset-top,\s*0px\)\)\s*\+\s*52px\s*\+\s*0\.75rem\s*\)/,
  "catalog spacer fallback matches the catalog chrome padding + 52px field",
);
assert.doesNotMatch(
  globals,
  /--catalog-mobile-search-height/,
  "shared live --catalog-mobile-search-height contract is gone",
);
assert.match(
  mobileTopChrome,
  /catalog: "px-5 pt-\[max\(0\.75rem,env\(safe-area-inset-top,0px\)\)\] pb-3"/,
  "catalog chrome keeps the accepted 0.75rem / pb-3 padding",
);
assert.match(
  globals,
  /\.mobile-top-chrome-spacer\[data-mobile-top-chrome-variant="catalog"\] \{\s*\n\s*min-height:\s*var\(--mobile-top-chrome-fallback-catalog\);/,
  "catalog fallback min-height is spacer-only",
);
assert.doesNotMatch(
  globals,
  /\.mobile-top-chrome,\s*\n\.mobile-top-chrome-spacer/,
  "measured chrome does not share a min-height rule with the spacer",
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
  "shell search detects /catalog",
);
assert.doesNotMatch(
  shellSearch,
  /if \(isCatalogRoute\) \{\s*return null;/,
  "shell search does not return null on catalog",
);
assert.match(
  shellSearch,
  /PlatformCatalogInlineSearch density="compact"/,
  "desktop catalog chrome uses compact search",
);
assert.match(
  shellSearch,
  /CatalogMobileFiltersSlot/,
  "desktop catalog chrome names CatalogMobileFiltersSlot",
);
assert.match(
  shellSearch,
  /catalogFilters/,
  "desktop catalog chrome renders the filters slot",
);
assert.match(
  shellSearch,
  /PlatformSearchCombobox/,
  "non-catalog routes keep the shell combobox",
);
assert.match(
  shellSearch,
  /<MyPracticesLibraryChrome surface=["']desktop["']/,
  "desktop Audioteka chrome uses the same shell slot as catalog",
);
assert.doesNotMatch(
  shellSearch,
  /if \(isMyPracticesRoute\) \{\s*return null;/,
  "shell search does not return null on /my-practices",
);
const catalogSearch = read("src/components/listener/MobileCatalogSearch.tsx");
assert.match(
  catalogSearch,
  /PlatformCatalogInlineSearch density="compact"/,
  "catalog search stays compact",
);
assert.match(
  catalogSearch,
  /if \(!mounted \|\| isDesktop\) \{\s*return null;/,
  "mobile catalog search unmounts at desktop",
);
assert.doesNotMatch(
  catalogSearch,
  /isCatalogRoute/,
  "mobile catalog search no longer force-mounts on desktop catalog",
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
assert.match(
  shell,
  /<DesktopShellSearch[\s\S]*listener-app-shell__center-scroll/,
  "DesktopShellSearch wrapper is a sibling before center-scroll",
);
assert.doesNotMatch(
  shell,
  /listener-app-shell__center-scroll[\s\S]*<DesktopShellSearch/,
  "DesktopShellSearch is not inside center-scroll",
);
assert.match(
  shell,
  /catalogFilters=\{<CatalogMobileFiltersSlot/,
  "shell passes CatalogMobileFiltersSlot into desktop chrome",
);
assert.match(
  shell,
  /hidden shrink-0 xl:block xl:px-6/,
  "desktop search chrome is shrink-0 above the scroller",
);
const bottomNav = read("src/components/BottomNav.tsx");
assert.match(
  bottomNav,
  /createPortal\(nav, document\.body\)/,
  "BottomNav still portals to document.body",
);
assert.match(
  globals,
  /\.bottom-nav \{\s*position:\s*fixed;/,
  "BottomNav stays position:fixed",
);
assert.match(
  globals,
  /html\.catalog-sheet-lock,\s*\nhtml\.catalog-sheet-lock body \{\s*\n\s*overflow:\s*hidden;/,
  "catalog sheet lock is an html class, not inline overflow",
);
assert.match(
  globals,
  /@media \(min-width:\s*1280px\) \{[\s\S]*html:has\(\.listener-app-shell\),\s*\n\s*html:has\(\.listener-app-shell\) body \{\s*\n\s*height:\s*100dvh;\s*\n\s*overflow:\s*hidden;/,
  "xl listener shell locks html/body so center-scroll stays the scrollport",
);
const shellLockIndex = globals.indexOf("html:has(.listener-app-shell)");
assert.ok(shellLockIndex !== -1, "globals names html:has(.listener-app-shell)");
const lastMin1280BeforeLock = globals.lastIndexOf(
  "@media (min-width: 1280px)",
  shellLockIndex,
);
const lastMax1279BeforeLock = globals.lastIndexOf(
  "@media (max-width: 1279px)",
  shellLockIndex,
);
assert.ok(
  lastMin1280BeforeLock > lastMax1279BeforeLock,
  "listener html/body overflow lock stays inside xl, not below 1280px",
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
  mobileTopChrome,
  /mobile-top-chrome[^"]*fixed top-0 inset-x-0 z-30/,
  "mobile search stays a fixed top layer",
);
assert.match(
  mobileTopChrome,
  /xl:hidden/,
  "mobile search stays hidden at xl so shell chrome owns desktop",
);
assert.doesNotMatch(
  mobileTopChrome,
  /xl:static|xl:sticky|xl:inset-auto|xl:z-auto/,
  "shared chrome has no desktop in-flow overrides",
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
