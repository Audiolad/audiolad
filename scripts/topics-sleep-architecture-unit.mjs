#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildCatalogTopicHref,
  parseCatalogTopicFilter,
  parseCatalogTopicKeyList,
} from "../src/lib/catalog/topic-filter.ts";
import { resolveTopicPublicHref } from "../src/lib/seo/topic-hubs/public-href.ts";
import { getTopicHubByTopicKey } from "../src/lib/seo/topic-hubs/registry.ts";
import { DEFAULT_AUTHOR_TOPIC_LIMIT } from "../src/lib/topics/limits.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

assert.equal(DEFAULT_AUTHOR_TOPIC_LIMIT, 3, "TOPIC_LIMIT_UNCHANGED");
assert.deepEqual(parseCatalogTopicKeyList("sleep"), ["sleep"]);
assert.equal(
  parseCatalogTopicFilter("sleep", ["calm", "sleep", "money"]),
  "sleep",
);
assert.equal(buildCatalogTopicHref("sleep"), "/catalog?topic=sleep");
assert.equal(getTopicHubByTopicKey("sleep"), null);
assert.equal(resolveTopicPublicHref("sleep"), "/catalog?topic=sleep");
assert.equal(resolveTopicPublicHref("calm"), "/catalog?topic=calm");

const selector = read("src/components/author-products/TopicSelector.tsx");
assert.match(selector, /options\.map/);
assert.doesNotMatch(selector, /key:\s*"money"|key:\s*"calm"|key:\s*"sleep"/);
assert.match(selector, /Выбрано \{activeSelectedCount\} из \{limit\}/);

const topicForm = read("src/lib/author-products/topic-form-data.ts");
assert.match(topicForm, /listActiveTopics\(supabase\)/);
assert.match(topicForm, /resolveAuthorTopicLimit/);

const authorForm = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(authorForm, /TopicSelector/);
assert.match(authorForm, /topicOptions/);

const catalogPage = read(
  "src/app/(platform)/(listener)/(catalog)/catalog/page.tsx",
);
assert.match(catalogPage, /listTopicsWithCatalogCounts/);
assert.match(catalogPage, /parseCatalogTopicFilters/);
assert.match(catalogPage, /TopicFilterBar|filterableTopics/);

const catalogDesktop = read("src/components/catalog/TopicFilterBar.tsx");
assert.match(catalogDesktop, /topic\.key/);
assert.match(catalogDesktop, /topic\.title/);
assert.doesNotMatch(catalogDesktop, /"Сон"|\"calm\"/);

const catalogMobile = read("src/components/catalog/CatalogMobileFiltersSlot.tsx");
assert.match(catalogMobile, /listTopicsWithCatalogCounts/);
const catalogFilters = read("src/components/catalog/CatalogMobileFilters.tsx");
assert.match(catalogFilters, /topic\.key/);
assert.match(catalogFilters, /topic\.title/);
assert.doesNotMatch(catalogFilters, /"sleep"|"calm"|Сон и расслабление/);
const catalogLayout = read(
  "src/app/(platform)/(listener)/(catalog)/catalog/layout.tsx",
);
assert.match(catalogLayout, /CatalogMobileFiltersSlot/);
const desktopShell = read("src/components/listener/ListenerAppShell.tsx");
assert.match(desktopShell, /CatalogMobileFiltersSlot/);

const publicChips = read("src/components/products/ProductTopicLinks.tsx");
assert.match(publicChips, /topic\.title/);
assert.match(publicChips, /resolveTopicPublicHref\(topic\.key\)/);
assert.doesNotMatch(publicChips, /Сон и расслабление|Расслабление/);

const practicePage = read(
  "src/app/(platform)/(listener)/practice/[...segments]/page.tsx",
);
assert.match(practicePage, /loadPublicPracticeTopicsSafe/);

const autofillPrompt = read("src/lib/seo/product-autofill/prompt.ts");
assert.doesNotMatch(autofillPrompt, /topicKey|topics\.key|платформенной темы «Сон»/);

const sleepSql = read("supabase/migrations/20260910120000_topics_sleep.sql");
assert.match(sleepSql, /'sleep'/);
assert.match(sleepSql, /'Сон'/);
assert.match(sleepSql, /35/);
assert.doesNotMatch(sleepSql, /UPDATE\s+public\.practice_topics/i);
assert.doesNotMatch(sleepSql, /UPDATE\s+public\.practices/i);
assert.doesNotMatch(sleepSql, /Сон и расслабление/);

const topicsDocs = read("docs/TOPICS.md");
assert.match(topicsDocs, /`calm` \| Спокойствие \| 30/);
assert.match(topicsDocs, /`sleep` \| Сон \| 35/);
assert.match(topicsDocs, /`body-wellbeing` \| Тело и самочувствие \| 50/);
assert.match(topicsDocs, /`energy` \| Энергия и ресурс \| 60/);

const foundation = read("supabase/migrations/20260717140000_topics_foundation.sql");
assert.match(
  foundation,
  /CHECK \(key ~ '\^\[a-z0-9\]\+\(-\[a-z0-9\]\+\)\*\$'\)/,
  "topics key format accepts sleep",
);
assert.doesNotMatch(
  foundation,
  /key\s+IN\s*\(|topics_key_enum|CREATE TYPE[\s\S]*topic/i,
  "no topic-key enum or closed CHECK list",
);
assert.match(
  foundation,
  /FROM public\.topics AS t\s+WHERE t\.key = v_key\s+AND t\.is_active = true/,
  "set_practice_topics resolves keys from public.topics",
);
assert.doesNotMatch(
  foundation,
  /WHERE t\.key IN \(/,
  "RPC does not allowlist a closed topic-key set",
);

const syncLib = read("src/lib/topics/sync.ts");
assert.match(syncLib, /rpc\("set_practice_topics"/);
assert.doesNotMatch(syncLib, /"sleep"|"spirituality"|"calm"/);

const authorProfilePage = read(
  "src/app/(platform)/author-dashboard/profile/page.tsx",
);
assert.match(authorProfilePage, /listActiveTopics/);
const authorProfile = read("src/components/author-dashboard/AuthorProfileClient.tsx");
assert.match(authorProfile, /TopicSelector/);

const newProductPage = read(
  "src/app/(platform)/author-dashboard/products/new/page.tsx",
);
assert.match(newProductPage, /loadAuthorProductTopicFormData/);
assert.match(authorForm, /productKind/);
assert.match(authorForm, /PRODUCT_KIND\.MUSIC/);

const editorialDetail = read("src/lib/playlists/editorial-workspace-detail.ts");
assert.match(editorialDetail, /listActiveTopics/);
const editorialEditor = read(
  "src/components/playlists/editorial/EditorialPlaylistEditorClient.tsx",
);
assert.match(editorialEditor, /TopicSelector/);

const ownerPlaylist = read("src/app/(platform)/playlists/[id]/page.tsx");
assert.doesNotMatch(ownerPlaylist, /TopicSelector/);
assert.doesNotMatch(ownerPlaylist, /listActiveTopics/);

assert.match(topicsDocs, /\/admin\/topics/);
assert.equal(
  existsSync(path.join(root, "src/app/(platform)/admin/topics")),
  false,
  "admin topics CRUD is not implemented; dictionary stays SQL-seeded",
);

console.log("topics-sleep-architecture-unit: ok");
