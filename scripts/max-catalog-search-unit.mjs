#!/usr/bin/env node
/**
 * MAX catalog search UI stays inside the Mini App and reuses the catalog grid.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relative) {
  return readFileSync(join(repoRoot, relative), "utf8");
}

const home = read("src/components/max/MaxAuthenticatedHome.tsx");
const search = read("src/components/max/MaxCatalogSearch.tsx");
const placeholder = read("src/components/max/MaxTabPlaceholder.tsx");
const platformSearch = read("src/lib/catalog/platform-search.ts");

assert.match(platformSearch, /PLATFORM_SEARCH_CATALOG_URL_DEBOUNCE_MS = 300/);
assert.match(search, /MAX_CATALOG_SEARCH_DEBOUNCE_MS = 300/);
assert.match(search, /setTimeout\(\(\) => \{[\s\S]*?\}, MAX_CATALOG_SEARCH_DEBOUNCE_MS\)/);

assert.match(home, /hidden=\{activeTab !== "catalog" \|\| Boolean\(promoTarget\)\}/);
assert.match(home, /<MaxCatalogSearch[\s\S]*onSelectProduct=\{openCatalogProduct\}/);
assert.doesNotMatch(placeholder, /MaxCatalogSearch|Поиск по каталогу/);
assert.match(search, /placeholder="Поиск по каталогу"/);
assert.match(search, /role="search"/);
assert.match(search, /aria-label="Поиск аудиопродуктов в каталоге"/);
assert.match(search, /type="search"/);
assert.match(search, /enterKeyHint="search"/);
assert.match(search, /maxLength=\{CATALOG_SEARCH_MAX_LENGTH\}/);
assert.match(search, /h-\[52px\]/);
assert.match(search, /rounded-\[18px\]/);
assert.match(search, /border border-\[#ded1f1\]/);
assert.match(search, /bg-white/);
assert.match(search, /data-max-catalog-search-row/);
assert.match(search, /data-max-catalog-search-row[\s\S]{0,80}className="flex items-start gap-2"/);
assert.match(search, /className="relative flex h-\[52px\]/);

assert.match(search, /normalizedInput\.length > 0/);
assert.match(search, /aria-label="Очистить поиск"/);
assert.match(search, /min-h-11 min-w-11/);

const schedule = search.slice(
  search.indexOf("function scheduleSearch"),
  search.indexOf("function submitSearch"),
);
assert.match(schedule, /if \(!normalized\)/);
assert.match(schedule, /restoreDefaultCatalog\(\)/);
assert.doesNotMatch(schedule, /fetch\(/);
assert.ok(schedule.indexOf("if (!normalized)") < schedule.indexOf("beginSearch"));
assert.match(schedule, /window\.clearTimeout\(debounceRef\.current\)/);
assert.match(schedule, /abortRef\.current\?\.abort\(\)/);
assert.match(schedule, /requestGenerationRef\.current \+= 1/);

const submit = search.slice(
  search.indexOf("function submitSearch"),
  search.indexOf("function clearSearch"),
);
assert.match(submit, /event\.preventDefault\(\)/);
assert.match(submit, /window\.clearTimeout\(debounceRef\.current\)/);
assert.match(submit, /beginSearch\(normalized\)/);
assert.doesNotMatch(submit, /setTimeout/);

const restore = search.slice(
  search.indexOf("function restoreDefaultCatalog"),
  search.indexOf("function beginSearch"),
);
assert.match(restore, /cancelPendingSearch\(\)/);
assert.match(restore, /setSearchStatus\("idle"\)/);
assert.match(restore, /setSearchItems\(null\)/);
assert.match(restore, /setResultQuery\(""\)/);
assert.doesNotMatch(restore, /fetch\(|MAX_CATALOG_PATH/);

const clear = search.slice(
  search.indexOf("function clearSearch"),
  search.indexOf("function handleInputChange"),
);
assert.match(clear, /setSearchInput\(""\)/);
assert.match(clear, /restoreDefaultCatalog\(\)/);

assert.match(search, /new AbortController\(\)/);
assert.match(search, /abortRef\.current\?\.abort\(\)/);
assert.match(search, /requestId !== requestGenerationRef\.current \|\| controller\.signal\.aborted/);
assert.match(search, /JSON\.stringify\(\{ initData \}\)/);
assert.match(
  search,
  /buildMaxCatalogRequestBody\(\{[\s\S]*initData,[\s\S]*query: normalized/,
);
assert.doesNotMatch(search, /user_id|max_user_id|maxAuthenticated/);

assert.doesNotMatch(search, /AudioladHorizontalLogo/);
assert.doesNotMatch(search, /<h1/);
assert.doesNotMatch(search, /Результаты поиска/);
assert.doesNotMatch(search, /Аудиопрактики, музыка и курсы АудиоЛада/);
const topicsAt = search.indexOf("<MaxCatalogTopicsSheet");
const sectionsAt = search.indexOf("<MaxCatalogSections");
const gridAt = search.indexOf("<CatalogGrid");
const chromeAt = search.indexOf("data-max-catalog-sticky-chrome");
assert.ok(chromeAt !== -1, "data-max-catalog-sticky-chrome exists");
const chromeClass = search.slice(
  search.indexOf("className=", chromeAt),
  search.indexOf(">", chromeAt),
);
assert.match(chromeClass, /\bsticky\b/, "chrome contains sticky");
assert.match(chromeClass, /\btop-0\b/);
assert.match(chromeClass, /bg-\[#faf8ff\]/, "opaque catalog background");
assert.doesNotMatch(chromeClass, /bg-transparent|bg-white\/|backdrop-blur/);
const stickyZ = Number(chromeClass.match(/z-\[(\d+)\]/)?.[1]);
assert.ok(Number.isInteger(stickyZ), "sticky chrome declares a numeric z-index");

const rowAt = search.indexOf("data-max-catalog-search-row");
assert.ok(chromeAt < rowAt && rowAt < topicsAt, "search row and Topics are inside sticky chrome");
const chromeOpen = search.lastIndexOf("<div", chromeAt);
const chromeBeforeSections = search.slice(chromeOpen, sectionsAt);
const chromeOpens = chromeBeforeSections.match(/<div\b/g)?.length ?? 0;
const chromeCloses = chromeBeforeSections.match(/<\/div>/g)?.length ?? 0;
assert.equal(
  chromeOpens,
  chromeCloses,
  "sticky wrapper closes before MaxCatalogSections",
);
assert.ok(topicsAt < sectionsAt && sectionsAt < gridAt);
assert.doesNotMatch(
  search.slice(sectionsAt, sectionsAt + 180),
  /\bsticky\b/,
  "catalog sections stay in the scrolling flow",
);

const productOverlay = home.slice(
  home.indexOf('activeTab === "catalog" && selected && !promoTarget'),
  home.indexOf("← Назад в каталог"),
);
const productZ = Number(productOverlay.match(/\bz-(\d+)\b/)?.[1]);
assert.ok(Number.isInteger(productZ), "product detail overlay declares a z-index");
const topicsSheet = read("src/components/max/MaxCatalogTopicsSheet.tsx");
const topicsZ = Number(
  topicsSheet.match(/fixed inset-0 z-(\d+)/)?.[1],
);
assert.ok(Number.isInteger(topicsZ), "Topics sheet declares a z-index");
assert.ok(
  stickyZ < productZ,
  `sticky z-index ${stickyZ} stays below product detail overlay z-${productZ}`,
);
assert.ok(
  stickyZ < topicsZ,
  `sticky z-index ${stickyZ} stays below Topics sheet z-${topicsZ}`,
);

assert.ok(search.indexOf("data-max-catalog-search-row") < topicsAt);
assert.match(search, /onApply=\{applyFilters\}/);
assert.doesNotMatch(
  search,
  /CatalogMobileFilters|buildCatalogHref|<Link|<a[\s>]|router\.push|window\.location|openLink/,
);
assert.match(search, /Ищем…/);
assert.match(search, /По запросу „\{resultQuery\}“ ничего не найдено\./);
assert.match(search, /Очистить поиск/);
assert.match(search, /Не удалось выполнить поиск\./);
assert.match(search, /defaultCatalog/);
assert.match(
  search,
  /usingSearchResults\s*\?\s*searchItems\s*:\s*defaultCatalog\.status === "ready"/,
);
assert.match(
  search,
  /searchItems !== null &&\s*searchStatus !== "idle" &&\s*resultSection === activeSection/,
);
assert.doesNotMatch(
  search,
  /searchStatus === "searching" \|\| searchStatus === "error"\s*\?\s*\[\]/,
);
const gridChoice = search.slice(
  search.indexOf("const gridItems = hasActiveFilters"),
  search.indexOf("const showSearchEmpty"),
);
assert.match(gridChoice, /usingSearchResults\s*\?\s*searchItems\s*:\s*sectionScopeItems/);
assert.match(gridChoice, /: rootOrSearchItems/);
assert.match(
  search,
  /sectionListing\.status === "ready" && sectionListing\.section === activeSection/,
);

assert.match(
  search,
  /<ul className="mt-5 -mx-4 grid grid-cols-2 gap-\[6px\] px-\[6px\]">/,
);
const card = read("src/components/max/MaxCatalogProductCard.tsx");
const grid = `${search.slice(
  search.indexOf('<ul className="mt-5 -mx-4 grid grid-cols-2 gap-[6px] px-[6px]">'),
)}\n${card}`;
assert.match(grid, /grid-cols-2/);
assert.match(grid, /gap-\[6px\]/);
assert.match(grid, /-mx-4/);
assert.match(grid, /px-\[6px\]/);
assert.match(grid, /onSelectProduct\(product\)/);
assert.match(grid, /!product\.isFree/);
assert.match(grid, /product\.priceLabel/);
assert.doesNotMatch(grid, /Подарок|Бесплатно/);
assert.doesNotMatch(search, /onSelectProduct\(product\)[\s\S]{0,120}clearSearch|clearSearch\(\)[\s\S]{0,80}onSelectProduct/);

const back = home.slice(home.indexOf("← Назад в каталог") - 220, home.indexOf("← Назад в каталог") + 80);
assert.match(back, /closeProductDetail/);
const closeDetail = home.slice(
  home.indexOf("function closeProductDetail"),
  home.indexOf("function closePromoLanding"),
);
assert.match(closeDetail, /setSelected\(null\)/);
assert.doesNotMatch(back, /clearSearch|searchInput|resultQuery|localStorage|sessionStorage/);

const selectFn = home.slice(
  home.indexOf("function selectMaxTab"),
  home.indexOf("const activeTabLabel"),
);
assert.match(selectFn, /setSelected\(null\)/);
assert.doesNotMatch(selectFn, /searchInput|resultQuery|localStorage|sessionStorage|router/);
assert.match(home, /hidden=\{activeTab !== "catalog" \|\| Boolean\(promoTarget\)\}/);

assert.doesNotMatch(
  search,
  /useRouter|useSearchParams|router\.push|replaceListingSearch|window\.location|openLink|localStorage|sessionStorage|method="get"|\/catalog\?|PlatformCatalogInlineSearch|from "next\/navigation"|from "next\/link"/,
);
assert.doesNotMatch(
  home,
  /useRouter|useSearchParams|router\.push|replaceListingSearch|window\.location\s*=|openLink|localStorage|sessionStorage|\/catalog\?/,
);
assert.doesNotMatch(search, /aria-autocomplete|role="listbox"|role="combobox"|search history|недавн/i);
assert.doesNotMatch(search, /CATALOG_SEARCH_SUGGEST_MIN_LENGTH/);

console.log("max-catalog-search-unit: ok");
