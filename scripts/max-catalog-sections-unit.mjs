#!/usr/bin/env node
/**
 * MAX catalog section cards are in-app toggles over the canonical public sections.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relative) {
  return readFileSync(join(repoRoot, relative), "utf8");
}

const sectionsSource = read("src/lib/catalog/catalog-sections.ts");
const ui = read("src/components/max/MaxCatalogSections.tsx");
const search = read("src/components/max/MaxCatalogSearch.tsx");
const home = read("src/components/max/MaxAuthenticatedHome.tsx");
const ordinary = read("src/components/catalog/CatalogSectionCards.tsx");

const cardsStart = sectionsSource.indexOf(
  "export const PUBLIC_CATALOG_SECTION_CARDS = [",
);
const cardsEnd = sectionsSource.indexOf("] as const;", cardsStart);
const cardsBlock = sectionsSource.slice(cardsStart, cardsEnd);
assert.ok(cardsStart !== -1 && cardsEnd > cardsStart);

const expectedCards = [
  { value: "music", label: "Музыка", asset: "music" },
  { value: "meditations", label: "Практики", asset: "practices" },
  { value: "education", label: "Обучение", asset: "education" },
  { value: "stories", label: "Истории", asset: "stories" },
];
assert.equal(cardsBlock.match(/value:/g).length, 4);
for (const card of expectedCards) {
  assert.match(
    cardsBlock,
    new RegExp(
      `value: "${card.value}", label: "${card.label}", asset: "${card.asset}"`,
    ),
  );
  assert.ok(
    existsSync(
      join(
        repoRoot,
        `public/images/catalog-sections/catalog-section-${card.asset}-mobile.webp`,
      ),
    ),
    card.asset,
  );
}
assert.doesNotMatch(cardsBlock, /books/);

assert.match(ui, /PUBLIC_CATALOG_SECTION_CARDS/);
assert.match(ui, /PUBLIC_CATALOG_SECTION_CARDS\.map\(\(section\)/);
assert.equal(ui.split("<button").length - 1, 1);
assert.match(ui, /type="button"/);
assert.match(ui, /aria-pressed=\{isActive\}/);
assert.match(ui, /aria-label=\{section\.label\}/);
assert.match(ui, /data-catalog-section=\{section\.value\}/);
assert.match(ui, /onSelectSection\(isActive \? null : section\.value\)/);
assert.match(ui, /grid grid-cols-4 gap-1/);
assert.match(ui, /aspect-square/);
assert.match(ui, /rounded-\[10px\]/);
assert.match(ui, /isActive \? "ring-2 ring-\[#7042c5\]"/);
assert.match(
  ui,
  /\/images\/catalog-sections\/catalog-section-\$\{section\.asset\}-mobile\.webp/,
);
assert.match(ui, /className="mt-4"/);
assert.doesNotMatch(ui, /desktop\.webp|overflow-x-auto|grid-cols-2|sm:grid-cols/);
assert.doesNotMatch(ui, /Музыка|Практики|Обучение|Истории/);
assert.doesNotMatch(
  ui,
  /<a |<Link|href=|useRouter|useSearchParams|buildCatalogHref|router\.push|window\.location|openLink|next\/link|next\/navigation|localStorage|sessionStorage|CatalogSectionCards/,
);
assert.doesNotMatch(ordinary, /MaxCatalogSections/);

assert.match(
  search,
  /import MaxCatalogSections from "@\/components\/max\/MaxCatalogSections"/,
);
assert.match(search, /activeSection=\{activeSection\}/);
assert.match(search, /onSelectSection=\{selectSection\}/);
assert.doesNotMatch(search, /CatalogSectionCards|buildCatalogHref/);

const rowAt = search.indexOf("data-max-catalog-search-row");
const formEnd = search.indexOf("</form>");
const topicsAt = search.indexOf("data-max-catalog-topics");
const sectionsAt = search.indexOf("<MaxCatalogSections");
const gridAt = search.indexOf("<CatalogGrid");
assert.ok(
  rowAt !== -1 &&
    rowAt < formEnd &&
    formEnd < topicsAt &&
    topicsAt < sectionsAt &&
    sectionsAt < gridAt,
);
const topics = search.slice(search.lastIndexOf("<button", topicsAt), sectionsAt);
assert.match(topics, /type="button"/);
assert.match(topics, /aria-label="Темы"/);
assert.match(topics, />\s*Темы\s*</);
assert.doesNotMatch(
  topics,
  /<Link|<a[\s>]|href=|onClick|router\.push|window\.location|openLink|useRouter|useSearchParams/,
);
const between = search.slice(sectionsAt, gridAt);
assert.doesNotMatch(between, /<h1|Аудиопрактики, музыка и курсы АудиоЛада|AudioladHorizontalLogo|Результаты поиска/);
assert.doesNotMatch(search, /AudioladHorizontalLogo/);
assert.doesNotMatch(search, /<h1/);
assert.doesNotMatch(search, /Аудиопрактики, музыка и курсы АудиоЛада/);

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

const select = search.slice(
  search.indexOf("function selectSection"),
  search.indexOf("function loadRootCatalog"),
);
assert.doesNotMatch(select, /setTimeout|MAX_CATALOG_SEARCH_DEBOUNCE_MS/);
assert.match(select, /beginSearch\(normalized, section\)/);
assert.match(select, /loadSectionCatalog\(section\)/);
assert.match(select, /normalizeCatalogSearchQuery\(searchInputRef\.current\)/);
assert.doesNotMatch(select, /setSearchInput\(/);
assert.match(
  select,
  /section === null && defaultCatalogRef\.current\.status === "ready"/,
);
const readyAt = select.indexOf(
  'section === null && defaultCatalogRef.current.status === "ready"',
);
const restoreAt = select.indexOf("restoreDefaultCatalog()");
const refetchRootAt = select.indexOf("loadRootCatalog()");
assert.ok(readyAt !== -1 && readyAt < restoreAt && restoreAt < refetchRootAt);
assert.match(select, /sectionCacheRef\.current\.get\(section\)/);
assert.match(select, /setSectionListing\(\s*cached/);
assert.match(select, /\? \{ status: "ready", section, items: cached \}/);
assert.match(select, /: \{ status: "idle" \}/);
const queryBranch = select.slice(0, select.indexOf("if (section === null"));
assert.ok(queryBranch.indexOf("setSectionListing(") < queryBranch.indexOf("beginSearch(normalized, section)"));
assert.match(select, /window\.clearTimeout\(debounceRef\.current\)/);
assert.doesNotMatch(select, /localStorage|sessionStorage|router|useSearchParams/);

const clear = search.slice(
  search.indexOf("function clearSearch"),
  search.indexOf("function handleInputChange"),
);
assert.match(clear, /setSearchInput\(""\)/);
assert.match(clear, /activeSectionRef\.current/);
assert.doesNotMatch(clear, /setActiveSection\(/);
assert.match(clear, /restoreDefaultCatalog\(\)/);
assert.match(clear, /loadSectionCatalog\(section\)/);

const loadSection = search.slice(
  search.indexOf("function loadSectionCatalog"),
  search.indexOf("useEffect("),
);
const generationGuard =
  "requestId !== requestGenerationRef.current || controller.signal.aborted";
const jsonAt = loadSection.indexOf("await response.json");
const guardAfterJson = loadSection.indexOf(generationGuard, jsonAt);
const cacheWriteAt = loadSection.indexOf("sectionCacheRef.current.set");
assert.ok(jsonAt !== -1 && guardAfterJson > jsonAt && guardAfterJson < cacheWriteAt);
assert.match(loadSection, /JSON\.stringify\(\{ initData, section \}\)/);
assert.doesNotMatch(loadSection, /setTimeout/);

const begin = search.slice(
  search.indexOf("function beginSearch"),
  search.indexOf("function scheduleSearch"),
);
const beginJsonAt = begin.indexOf("await response.json");
const beginGuardAt = begin.indexOf(generationGuard, beginJsonAt);
const beginApplyAt = begin.indexOf("setSearchItems(items)");
assert.ok(beginGuardAt !== -1 && beginGuardAt < beginApplyAt);
assert.match(begin, /JSON\.stringify\(\{ initData, query: normalized, section \}\)/);
assert.match(begin, /JSON\.stringify\(\{ initData, query: normalized \}\)/);
assert.match(begin, /setResultSection\(section\)/);
assert.doesNotMatch(begin, /setSearchItems\(null\)/);
assert.match(begin, /setSearchStatus\("searching"\)/);
assert.match(begin, /setSearchStatus\("error"\)/);
const searchingAt = begin.indexOf('setSearchStatus("searching")');
const applyItemsAt = begin.indexOf("setSearchItems(items)");
assert.ok(searchingAt !== -1 && searchingAt < applyItemsAt);
assert.equal(begin.slice(searchingAt, applyItemsAt).includes("setSearchItems"), false);

const gridChoice = search.slice(
  search.indexOf("const usingSearchResults ="),
  search.indexOf("const showSearchEmpty"),
);
assert.match(
  gridChoice,
  /searchItems !== null && searchStatus !== "idle" && resultSection === activeSection/,
);
assert.match(
  gridChoice,
  /usingSearchResults \? searchItems : defaultCatalog\.status === "ready"/,
);
assert.match(
  gridChoice,
  /sectionListing\.status === "ready" && sectionListing\.section === activeSection/,
);
assert.match(gridChoice, /usingSearchResults\s*\?\s*searchItems\s*:\s*sectionScopeItems/);
assert.match(gridChoice, /: rootOrSearchItems/);
assert.doesNotMatch(
  gridChoice,
  /searchStatus === "searching" \|\| searchStatus === "error"\s*\?\s*\[\]/,
);

const restore = search.slice(
  search.indexOf("function restoreDefaultCatalog"),
  search.indexOf("function beginSearch"),
);
assert.doesNotMatch(restore, /fetch\(|MAX_CATALOG_PATH|setActiveSection\(/);
assert.match(search, /В разделе пока нет аудиопродуктов\./);
assert.match(search, /По запросу „\{resultQuery\}“ ничего не найдено\./);

assert.match(home, /hidden=\{activeTab !== "catalog"\}/);
assert.match(home, /<MaxCatalogSearch onSelectProduct=\{openCatalogProduct\} \/>/);
assert.match(home, /activeTab === "catalog" \? null : \(/);
const catalogPane = home.slice(
  home.indexOf('hidden={activeTab !== "catalog"}'),
  home.indexOf("<MaxTabPlaceholder"),
);
assert.doesNotMatch(catalogPane, /AudioladHorizontalLogo/);
const catalogHeader = home.slice(
  home.indexOf('activeTab === "catalog" ? null'),
  home.indexOf('hidden={activeTab !== "catalog"}'),
);
assert.match(catalogHeader, /<AudioladHorizontalLogo/);
assert.doesNotMatch(home, /activeTab === "catalog" \?[\s\S]{0,120}<MaxCatalogSearch/);
const back = home.slice(
  home.indexOf("← Назад в каталог") - 220,
  home.indexOf("← Назад в каталог") + 40,
);
assert.match(back, /setSelected\(null\)/);
assert.doesNotMatch(back, /setActiveSection|activeSection|localStorage|sessionStorage/);
const selectTab = home.slice(
  home.indexOf("function selectMaxTab"),
  home.indexOf("const activeTabLabel"),
);
assert.match(selectTab, /setSelected\(null\)/);
assert.doesNotMatch(
  selectTab,
  /setActiveSection|activeSection|localStorage|sessionStorage|router/,
);
assert.doesNotMatch(
  search,
  /useRouter|useSearchParams|router\.push|window\.location|openLink|localStorage|sessionStorage|from "next\/navigation"|from "next\/link"|href="\/catalog"/,
);

console.log("max-catalog-sections-unit: ok");
