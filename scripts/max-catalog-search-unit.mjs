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

assert.match(home, /hidden=\{activeTab !== "catalog"\}/);
assert.match(home, /<MaxCatalogSearch onSelectProduct=\{openCatalogProduct\} \/>/);
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
assert.match(search, /className="relative mt-4 flex h-\[52px\]/);

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
assert.match(search, /JSON\.stringify\(\{ initData, query: normalized \}\)/);
assert.doesNotMatch(search, /user_id|max_user_id|maxAuthenticated/);

assert.match(search, /Результаты поиска/);
assert.match(search, /По запросу „\{resultQuery\}“/);
assert.match(search, /Ищем…/);
assert.match(search, /По запросу „\{resultQuery\}“ ничего не найдено\./);
assert.match(search, /Очистить поиск/);
assert.match(search, /Не удалось выполнить поиск\./);
assert.match(search, /defaultCatalog/);
assert.match(search, /usingSearchResults \? searchItems : defaultCatalog\.status === "ready"/);

assert.match(
  search,
  /<ul className="mt-5 -mx-4 grid grid-cols-2 gap-\[6px\] px-\[6px\]">/,
);
const grid = search.slice(
  search.indexOf('<ul className="mt-5 -mx-4 grid grid-cols-2 gap-[6px] px-[6px]">'),
);
assert.match(grid, /grid-cols-2/);
assert.match(grid, /gap-\[6px\]/);
assert.match(grid, /-mx-4/);
assert.match(grid, /px-\[6px\]/);
assert.match(grid, /onSelectProduct\(product\)/);
assert.match(grid, /!product\.isFree/);
assert.match(grid, /product\.priceLabel/);
assert.doesNotMatch(grid, /Подарок|Бесплатно/);
assert.doesNotMatch(search, /onSelectProduct\(product\)[\s\S]{0,120}clearSearch|clearSearch\(\)[\s\S]{0,80}onSelectProduct/);

const back = home.slice(home.indexOf("← Назад в каталог") - 180, home.indexOf("← Назад в каталог") + 80);
assert.match(back, /setSelected\(null\)/);
assert.doesNotMatch(back, /clearSearch|searchInput|resultQuery|localStorage|sessionStorage/);

const selectFn = home.slice(
  home.indexOf("function selectMaxTab"),
  home.indexOf("const activeTabLabel"),
);
assert.match(selectFn, /setSelected\(null\)/);
assert.doesNotMatch(selectFn, /searchInput|resultQuery|localStorage|sessionStorage|router/);
assert.match(home, /hidden=\{activeTab !== "catalog"\}/);

assert.doesNotMatch(
  search,
  /useRouter|useSearchParams|router\.push|replaceListingSearch|window\.location|openLink|localStorage|sessionStorage|method="get"|\/catalog\?|PlatformCatalogInlineSearch|from "next\/navigation"|from "next\/link"/,
);
assert.doesNotMatch(
  home,
  /useRouter|useSearchParams|router\.push|replaceListingSearch|window\.location|openLink|localStorage|sessionStorage|\/catalog\?/,
);
assert.doesNotMatch(search, /aria-autocomplete|role="listbox"|role="combobox"|search history|недавн/i);
assert.doesNotMatch(search, /CATALOG_SEARCH_SUGGEST_MIN_LENGTH/);

console.log("max-catalog-search-unit: ok");
