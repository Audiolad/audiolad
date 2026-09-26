#!/usr/bin/env node
/**
 * MAX catalog topics stay inside the Mini App and follow the mobile sheet.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relative) {
  return readFileSync(join(repoRoot, relative), "utf8");
}

const search = read("src/components/max/MaxCatalogSearch.tsx");
const sheet = read("src/components/max/MaxCatalogTopicsSheet.tsx");
const home = read("src/components/max/MaxAuthenticatedHome.tsx");
const sections = read("src/components/max/MaxCatalogSections.tsx");

assert.match(sheet, /onClick=\{openSheet\}/);
assert.match(sheet, /aria-haspopup="dialog"/);
assert.match(sheet, /aria-expanded=\{open\}/);
assert.match(sheet, /role="dialog"/);
assert.match(sheet, /aria-modal="true"/);
assert.match(sheet, /data-max-catalog-topics/);
assert.match(sheet, />\s*Темы\s*</);
assert.match(sheet, /countCatalogFilterGroups/);
assert.match(sheet, /data-max-catalog-topics-count/);
assert.match(sheet, /\{activeFilterCount\}/);
assert.match(sheet, /toggleCatalogDraftTopics\(current, topic\.key\)/);
assert.match(sheet, /onApply\(draftTopics, draftAccess, draftClass\)/);
assert.match(sheet, /function resetFilters\(\) \{\s*onReset\(\);/s);
assert.match(sheet, /CATALOG_ACCESS_FILTER_OPTIONS/);
assert.match(sheet, /CATALOG_CLASS_FILTER_OPTIONS/);
assert.match(sheet, /aria-label="Доступ"/);
assert.match(sheet, /aria-label="Тип"/);
assert.match(sheet, /label="Все"/);
assert.match(sheet, /setDraftAccess\(activeAccess\)/);
assert.match(sheet, /setDraftClass\(activeClass\)/);
assert.match(sheet, /MAX_CATALOG_TOPICS_PATH/);
assert.match(sheet, /JSON\.stringify\(\{ initData \}\)/);
assert.match(sheet, /useSheetScrollLock\(open, "max-catalog-topics"\)/);
assert.match(sheet, /createPortal\(sheet, document\.body\)/);
assert.match(sheet, /Сбросить/);
assert.match(sheet, /Закрыть/);
assert.match(sheet, /Применить/);
assert.doesNotMatch(sheet, /CatalogMobileFilters|buildCatalogHref/);
assert.doesNotMatch(
  sheet,
  /useRouter|useSearchParams|router\.push|window\.location|openLink|localStorage|sessionStorage|from "next\/link"|from "next\/navigation"|href="\/catalog"/,
);

const escapeBlock = sheet.slice(
  sheet.indexOf('event.key === "Escape"'),
  sheet.indexOf('event.key !== "Tab"'),
);
assert.match(escapeBlock, /setOpen\(false\)/);
assert.doesNotMatch(escapeBlock, /onApply|onReset/);

const closeFn = sheet.slice(sheet.indexOf("function close()"), sheet.indexOf("function openSheet"));
assert.match(closeFn, /setOpen\(false\)/);
assert.doesNotMatch(closeFn, /onApply|onReset/);
assert.match(sheet, /if \(event\.target === event\.currentTarget\) \{\s*close\(\);/s);

const applyFn = sheet.slice(sheet.indexOf("function applyDraft"), sheet.indexOf("function resetFilters"));
assert.match(applyFn, /onApply\(draftTopics, draftAccess, draftClass\)/);
assert.doesNotMatch(applyFn, /router|window\.location|openLink|href/);

assert.match(search, /topicNavigationRequest/);
assert.match(search, /setSearchInput\(""\)/);
assert.match(search, /searchInputRef\.current = ""/);
assert.match(search, /setActiveSection\(null\)/);
assert.match(search, /activeSectionRef\.current = null/);
assert.match(search, /applyFilters\(\[topicKey\], "all", "all"\)/);
assert.match(home, /function openCatalogTopic\(topicKey: string\)/);
assert.match(home, /setCatalogTopicNavigation/);
assert.match(home, /topicNavigationRequest=\{catalogTopicNavigation\}/);
assert.match(home, /onOpenTopic=\{openCatalogTopic\}/);
assert.match(search, /<MaxCatalogTopicsSheet/);
assert.match(search, /activeTopicKeys=\{activeTopicKeys\}/);
assert.match(search, /activeAccess=\{activeAccess\}/);
assert.match(search, /activeClass=\{activeClass\}/);
assert.match(search, /onApply=\{applyFilters\}/);
assert.match(search, /onReset=\{resetFilters\}/);
assert.match(search, /serializeCatalogTopicParam/);
assert.match(search, /resultSection === activeSection/);
assert.match(search, /resultTopic === activeTopicParam/);
assert.match(search, /resultAccess === activeAccess/);
assert.match(search, /resultClass === activeClass/);
assert.match(search, /hasActiveCatalogFilters/);
assert.match(search, /filterListing\.topic === activeTopicParam/);
assert.match(search, /filterListing\.access === activeAccess/);
assert.match(search, /filterListing\.publicationClass === activeClass/);
assert.match(search, /buildMaxCatalogRequestBody/);
assert.match(search, /body\.access = input\.access/);
assert.match(search, /body\.class = input\.publicationClass/);
assert.match(
  search,
  /<ul className="mt-5 -mx-4 grid grid-cols-2 gap-\[6px\] px-\[6px\]">/,
);
assert.match(search, /<MaxCatalogSections/);
assert.match(sections, /grid grid-cols-4 gap-1/);
assert.doesNotMatch(
  search,
  /localStorage|sessionStorage|useRouter|useSearchParams|router\.push|window\.location|openLink|buildCatalogHref|CatalogMobileFilters/,
);

const apply = search.slice(
  search.indexOf("function applyFilters"),
  search.indexOf("function resetFilters"),
);
assert.match(apply, /serializeCatalogTopicParam\(keys\)/);
assert.match(apply, /activeTopicParamRef\.current = topicParam/);
assert.match(apply, /activeAccessRef\.current = access/);
assert.match(apply, /activeClassRef\.current = publicationClass/);
assert.match(apply, /beginSearch\(normalized, section, topicParam, access, publicationClass\)/);
assert.match(apply, /loadFilteredCatalog\(section, topicParam, access, publicationClass\)/);
assert.doesNotMatch(apply, /setSearchInput\(|setActiveSection\(/);

const reset = search.slice(
  search.indexOf("function resetFilters"),
  search.indexOf("useEffect("),
);
assert.match(reset, /applyFilters\(\[\], "all", "all"\)/);
assert.doesNotMatch(reset, /setSearchInput\(|setActiveSection\(/);

const clear = search.slice(
  search.indexOf("function clearSearch"),
  search.indexOf("function handleInputChange"),
);
assert.match(clear, /activeTopicParamRef\.current/);
assert.match(clear, /activeAccessRef\.current/);
assert.match(clear, /activeClassRef\.current/);
assert.match(clear, /loadFilteredCatalog\(section, topicParam, access, publicationClass\)/);
assert.doesNotMatch(clear, /setActiveTopicKeys\(|setActiveAccess\(|setActiveClass\(|setActiveSection\(/);
assert.ok(
  clear.indexOf("hasActiveCatalogFilters") < clear.indexOf("restoreDefaultCatalog()"),
);

const select = search.slice(
  search.indexOf("function selectSection"),
  search.indexOf("function loadRootCatalog"),
);
assert.match(select, /hasActiveCatalogFilters\(topicParam, access, publicationClass\)/);
assert.match(select, /loadFilteredCatalog\(section, topicParam, access, publicationClass\)/);
assert.doesNotMatch(select, /setActiveTopicKeys\(|setActiveAccess\(|setActiveClass\(/);

const loadFiltered = search.slice(
  search.indexOf("function loadFilteredCatalog"),
  search.indexOf("function reloadUnfilteredScope"),
);
assert.doesNotMatch(loadFiltered, /sectionCacheRef/);
assert.match(loadFiltered, /\+\+requestGenerationRef\.current/);
assert.match(loadFiltered, /abortRef\.current\?\.abort\(\)/);
assert.match(loadFiltered, /buildMaxCatalogRequestBody/);

assert.match(home, /hidden=\{activeTab !== "catalog"\}/);
const back = home.slice(
  home.indexOf("← Назад в каталог") - 240,
  home.indexOf("← Назад в каталог") + 40,
);
assert.doesNotMatch(back, /setActiveTopicKeys|activeTopicKeys|localStorage|sessionStorage/);
const selectTab = home.slice(
  home.indexOf("function selectMaxTab"),
  home.indexOf("const activeTabLabel"),
);
assert.doesNotMatch(selectTab, /setActiveTopicKeys|activeTopicKeys|localStorage|sessionStorage/);

console.log("max-catalog-topics-unit: ok");
