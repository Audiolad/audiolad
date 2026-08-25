import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { PLAYLIST_CATALOG_UI_HOMES } from "../src/lib/playlists/catalog-ui-homes";
import {
  PLAYLIST_CATALOG_PATH,
  buildPlaylistCatalogHref,
  resolvePlaylistCatalogActiveTopicKey,
} from "../src/lib/playlists/listing-filters";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

const pageSource = read(
  "src/app/(platform)/(listener)/(playlists)/playlists/catalog/page.tsx",
);
const filterSource = read(PLAYLIST_CATALOG_UI_HOMES.topicFilter);
const searchUiSource = read(PLAYLIST_CATALOG_UI_HOMES.searchUi);
const sortUiSource = read(PLAYLIST_CATALOG_UI_HOMES.sortUi);
const filtersSource = read(PLAYLIST_CATALOG_UI_HOMES.filters);
const cardSource = read(PLAYLIST_CATALOG_UI_HOMES.card);
const gridSource = read(PLAYLIST_CATALOG_UI_HOMES.grid);
const catalogPageLoader = read("src/lib/playlists/catalog-page.ts");
const productCatalogPage = read(
  "src/app/(platform)/(listener)/(catalog)/catalog/page.tsx",
);
const topicFilterBar = read("src/components/catalog/TopicFilterBar.tsx");
const catalogMobileFilters = read(
  "src/components/catalog/CatalogMobileFilters.tsx",
);

assert.equal(existsSync(join(repoRoot, PLAYLIST_CATALOG_UI_HOMES.topicFilter)), true);
assert.equal(existsSync(join(repoRoot, PLAYLIST_CATALOG_UI_HOMES.filterUi)), false);

assert.equal(PLAYLIST_CATALOG_PATH, "/playlists/catalog");
assert.equal(
  resolvePlaylistCatalogActiveTopicKey("calm,sleep"),
  "calm",
  "catalog UI is single-select",
);
assert.equal(resolvePlaylistCatalogActiveTopicKey(null), null);

assert.equal(
  buildPlaylistCatalogHref({
    q: "sleep",
    sort: "popular",
    topic: "calm",
  }),
  "/playlists/catalog?q=sleep&sort=popular&topic=calm",
  "q + sort + topic stay together",
);
assert.equal(
  buildPlaylistCatalogHref({
    q: "sleep",
    sort: "popular",
    topic: null,
  }),
  "/playlists/catalog?q=sleep&sort=popular",
  "Все removes only topic",
);
assert.equal(
  buildPlaylistCatalogHref({ topic: "calm" }),
  "/playlists/catalog?topic=calm",
);
assert.doesNotMatch(
  buildPlaylistCatalogHref({ q: "sleep", sort: "popular" }),
  /topic=/,
);
assert.doesNotMatch(
  buildPlaylistCatalogHref({ q: "sleep", sort: "popular", topic: "calm" }),
  /access=|cursor=/,
);

assert.doesNotMatch(pageSource, /PlaylistCatalogTopicFilter/);
assert.match(pageSource, /PlaylistCatalogSearch/);
assert.doesNotMatch(pageSource, /PlaylistCatalogSort/);
assert.match(pageSource, /В этой теме пока нет плейлистов\./);
assert.match(pageSource, /Ничего не нашлось/);
assert.match(pageSource, /Пока нет плейлистов в витрине\./);
assert.match(pageSource, /activeTopicKey/);
assert.doesNotMatch(pageSource, /PlaylistCatalogFilters|TopicFilterBar/);
assert.doesNotMatch(pageSource, /CatalogMobileFilters/);
assert.doesNotMatch(pageSource, /\/topics\/\[slug\]/);
assert.doesNotMatch(pageSource, /Apply|multi-select|topicCount/i);

assert.match(filterSource, /topics:\s*PlaylistCatalogTopicOption\[\]/);
assert.match(filterSource, /activeTopicKey/);
assert.match(filterSource, /buildHref/);
assert.match(filterSource, /buildPlaylistCatalogHref/);
assert.match(filterSource, /Темы/);
assert.match(filterSource, /Все/);
assert.match(filterSource, /Закрыть/);
assert.match(filterSource, /role="dialog"/);
assert.match(filterSource, /\{topic\.title\}/);
assert.match(filterSource, /activeTitle \?\? "Темы"/);
assert.doesNotMatch(filterSource, />\s*\{topic\.key\}\s*</);
assert.doesNotMatch(filterSource, /Применить|Apply/);
assert.doesNotMatch(filterSource, /toggleCatalogDraftTopics|CATALOG_TOPIC_FILTER_MAX/);
assert.doesNotMatch(
  filterSource,
  /from ["']@\/components\/catalog\/(TopicFilterBar|CatalogMobileFilters)["']/,
);
assert.doesNotMatch(
  filterSource,
  /from ["']@\/components\/author-products\/TopicSelector["']/,
);

assert.match(searchUiSource, /topic/);
assert.match(searchUiSource, /buildPlaylistCatalogHref\(\{ q: nextQuery, sort, topic \}\)/);
assert.match(sortUiSource, /topic/);
assert.match(sortUiSource, /buildPlaylistCatalogHref/);
assert.match(filtersSource, /params\.set\("topic"/);

assert.match(catalogPageLoader, /listActiveTopics/);
assert.match(catalogPageLoader, /title: topic\.title/);

assert.doesNotMatch(cardSource, /item\.topics/);
assert.doesNotMatch(cardSource, /topic\.title|Темы/);
assert.doesNotMatch(gridSource, /item\.topics/);

assert.doesNotMatch(productCatalogPage, /PlaylistCatalogTopicFilter/);
assert.match(topicFilterBar, /TopicFilterBar/);
assert.match(catalogMobileFilters, /CatalogMobileFilters/);

console.log("playlist-catalog-topic-filter-unit: ok");
