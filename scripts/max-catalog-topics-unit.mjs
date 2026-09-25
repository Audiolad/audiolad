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
assert.match(sheet, /activeTopicKeys\.length > 0/);
assert.match(sheet, /data-max-catalog-topics-count/);
assert.match(sheet, /\{activeTopicKeys\.length\}/);
assert.match(sheet, /toggleCatalogDraftTopics\(current, topic\.key\)/);
assert.match(sheet, /onApply\(draftTopics\)/);
assert.match(sheet, /function resetTopics\(\) \{\s*onReset\(\);/s);
assert.match(sheet, /MAX_CATALOG_TOPICS_PATH/);
assert.match(sheet, /JSON\.stringify\(\{ initData \}\)/);
assert.match(sheet, /useSheetScrollLock\(open, "max-catalog-topics"\)/);
assert.match(sheet, /createPortal\(sheet, document\.body\)/);
assert.match(sheet, /Сбросить/);
assert.match(sheet, /Закрыть/);
assert.match(sheet, /Применить/);
assert.doesNotMatch(sheet, /Доступ|Тип|CatalogMobileFilters|buildCatalogHref/);
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

const applyFn = sheet.slice(sheet.indexOf("function applyDraft"), sheet.indexOf("function resetTopics"));
assert.match(applyFn, /onApply\(draftTopics\)/);
assert.doesNotMatch(applyFn, /router|window\.location|openLink|href/);

assert.match(search, /<MaxCatalogTopicsSheet/);
assert.match(search, /activeTopicKeys=\{activeTopicKeys\}/);
assert.match(search, /onApply=\{applyTopicKeys\}/);
assert.match(search, /onReset=\{resetTopicKeys\}/);
assert.match(search, /serializeCatalogTopicParam/);
assert.match(
  search,
  /searchItems !== null && searchStatus !== "idle" && resultSection === activeSection && resultTopic === activeTopicParam/,
);
assert.match(
  search,
  /activeTopicParam\s*\?\s*usingSearchResults\s*\?\s*searchItems\s*:\s*topicScopeItems/,
);
assert.match(search, /topicListing\.topic === activeTopicParam/);
assert.match(search, /JSON\.stringify\(\{ initData, topic: topicParam \}\)/);
assert.match(search, /JSON\.stringify\(\{ initData, section, topic: topicParam \}\)/);
assert.match(search, /JSON\.stringify\(\{ initData, query: normalized, topic: topicParam \}\)/);
assert.match(search, /JSON\.stringify\(\{ initData, query: normalized, section, topic: topicParam \}\)/);
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
  search.indexOf("function applyTopicKeys"),
  search.indexOf("function resetTopicKeys"),
);
assert.match(apply, /serializeCatalogTopicParam\(keys\)/);
assert.match(apply, /activeTopicParamRef\.current = topicParam/);
assert.match(apply, /beginSearch\(normalized, section, topicParam\)/);
assert.match(apply, /loadTopicCatalog\(section, topicParam\)/);
assert.doesNotMatch(apply, /setSearchInput\(|setActiveSection\(/);

const reset = search.slice(
  search.indexOf("function resetTopicKeys"),
  search.indexOf("useEffect("),
);
assert.match(reset, /applyTopicKeys\(\[\]\)/);
assert.doesNotMatch(reset, /setSearchInput\(|setActiveSection\(/);

const clear = search.slice(
  search.indexOf("function clearSearch"),
  search.indexOf("function handleInputChange"),
);
assert.match(clear, /activeTopicParamRef\.current/);
assert.match(clear, /loadTopicCatalog\(section, topicParam\)/);
assert.doesNotMatch(clear, /setActiveTopicKeys\(|setActiveSection\(/);
assert.ok(clear.indexOf("if (topicParam)") < clear.indexOf("restoreDefaultCatalog()"));

const select = search.slice(
  search.indexOf("function selectSection"),
  search.indexOf("function loadRootCatalog"),
);
const zeroTopicSearch = select.indexOf("beginSearch(normalized, section);");
const afterZeroTopicSearch = select.slice(zeroTopicSearch);
assert.ok(
  afterZeroTopicSearch.indexOf("loadTopicCatalog(section, topicParam)") <
    afterZeroTopicSearch.indexOf("sectionCacheRef.current.get(section)"),
);
assert.doesNotMatch(select, /setActiveTopicKeys\(/);

const loadTopic = search.slice(
  search.indexOf("function loadTopicCatalog"),
  search.indexOf("function reloadUnfilteredScope"),
);
assert.doesNotMatch(loadTopic, /sectionCacheRef/);
assert.match(loadTopic, /\+\+requestGenerationRef\.current/);
assert.match(loadTopic, /abortRef\.current\?\.abort\(\)/);

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
