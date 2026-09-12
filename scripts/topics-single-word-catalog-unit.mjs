#!/usr/bin/env node
/**
 * Single-word practice topic catalog: order, split, save, max-3, migration map.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertPublishedTopicMinimum,
  assertTopicCountWithinLimit,
  DEFAULT_AUTHOR_TOPIC_LIMIT,
} from "../src/lib/topics/limits.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

const EXPECTED_CATALOG = [
  { key: "money", title: "Деньги", sortOrder: 10 },
  { key: "abundance", title: "Изобилие", sortOrder: 20 },
  { key: "love", title: "Любовь", sortOrder: 30 },
  { key: "relationships", title: "Отношения", sortOrder: 40 },
  { key: "calm", title: "Спокойствие", sortOrder: 50 },
  { key: "sleep", title: "Сон", sortOrder: 60 },
  { key: "self-worth", title: "Уверенность", sortOrder: 70 },
  { key: "self-esteem", title: "Самооценка", sortOrder: 80 },
  { key: "body-wellbeing", title: "Самочувствие", sortOrder: 90 },
  { key: "energy", title: "Энергия", sortOrder: 100 },
  { key: "purpose", title: "Предназначение", sortOrder: 110 },
  { key: "career", title: "Карьера", sortOrder: 120 },
  { key: "business", title: "Бизнес", sortOrder: 130 },
  { key: "learning", title: "Обучение", sortOrder: 140 },
  { key: "spirituality", title: "Духовность", sortOrder: 150 },
];

const OLD_COMPOUND_TITLES = [
  "Уверенность и самоценность",
  "Уверенность и самооценка",
  "Тело и самочувствие",
  "Энергия и ресурс",
];

const COMPOUND_TITLE_MAP = {
  "Уверенность и самоценность": { key: "self-worth", title: "Уверенность" },
  "Уверенность и самооценка": { key: "self-worth", title: "Уверенность" },
  "Тело и самочувствие": { key: "body-wellbeing", title: "Самочувствие" },
  "Энергия и ресурс": { key: "energy", title: "Энергия" },
};

function mapCompoundTopicTitle(title) {
  return COMPOUND_TITLE_MAP[title] ?? null;
}

function applyTitleRename(topics) {
  return topics.map((topic) => {
    const mapped = mapCompoundTopicTitle(topic.title);
    if (!mapped) {
      return topic;
    }
    return { ...topic, key: mapped.key, title: mapped.title };
  });
}

function countActiveSelected(value, options) {
  const optionKeys = new Set(options.map((option) => option.key));
  return value.filter((key) => optionKeys.has(key)).length;
}

function toggleTopic(value, key, options, limit) {
  if (value.includes(key)) {
    return value.filter((item) => item !== key);
  }
  if (countActiveSelected(value, options) >= limit) {
    return value;
  }
  return [...value, key];
}

assert.equal(EXPECTED_CATALOG.length, 15, "15 topics in order");
assert.deepEqual(
  EXPECTED_CATALOG.map((topic) => topic.title),
  [
    "Деньги",
    "Изобилие",
    "Любовь",
    "Отношения",
    "Спокойствие",
    "Сон",
    "Уверенность",
    "Самооценка",
    "Самочувствие",
    "Энергия",
    "Предназначение",
    "Карьера",
    "Бизнес",
    "Обучение",
    "Духовность",
  ],
  "UI titles match the product order",
);

const byKey = new Map(EXPECTED_CATALOG.map((topic) => [topic.key, topic]));
assert.equal(byKey.get("abundance")?.title, "Изобилие", "Изобилие selectable");
assert.equal(byKey.get("love")?.title, "Любовь", "Любовь selectable");
assert.equal(byKey.get("self-worth")?.title, "Уверенность");
assert.equal(byKey.get("self-esteem")?.title, "Самооценка");
assert.notEqual(
  byKey.get("self-worth")?.key,
  byKey.get("self-esteem")?.key,
  "Уверенность and Самооценка are independent keys",
);

assert.equal(mapCompoundTopicTitle("Уверенность и самооценка")?.title, "Уверенность");
assert.equal(mapCompoundTopicTitle("Уверенность и самоценность")?.title, "Уверенность");
assert.equal(mapCompoundTopicTitle("Уверенность и самооценка")?.key, "self-worth");
assert.notEqual(
  mapCompoundTopicTitle("Уверенность и самооценка")?.title,
  "Самооценка",
  "split does not auto-assign Самооценка",
);
assert.equal(mapCompoundTopicTitle("Тело и самочувствие")?.title, "Самочувствие");
assert.equal(mapCompoundTopicTitle("Энергия и ресурс")?.title, "Энергия");

const beforeRename = [
  { key: "self-worth", title: "Уверенность и самоценность" },
  { key: "body-wellbeing", title: "Тело и самочувствие" },
  { key: "energy", title: "Энергия и ресурс" },
];
const afterRename = applyTitleRename(beforeRename);
assert.deepEqual(
  afterRename.map((topic) => topic.title),
  ["Уверенность", "Самочувствие", "Энергия"],
);
assert.equal(
  afterRename.filter((topic) => topic.key === "self-esteem").length,
  0,
  "rename keeps existing self-worth assignment only",
);
assert.equal(
  afterRename.filter((topic) => OLD_COMPOUND_TITLES.includes(topic.title)).length,
  0,
  "no product left on old compound titles after mapping",
);

const options = EXPECTED_CATALOG.map((topic) => ({
  key: topic.key,
  title: topic.title,
  isActive: true,
}));
assert.ok(options.some((topic) => topic.key === "abundance" && topic.title === "Изобилие"));
assert.ok(options.some((topic) => topic.key === "love" && topic.title === "Любовь"));
assert.ok(
  options.some((topic) => topic.key === "self-worth" && topic.title === "Уверенность"),
);
assert.ok(
  options.some((topic) => topic.key === "self-esteem" && topic.title === "Самооценка"),
);
assert.ok(
  options.some((topic) => topic.key === "body-wellbeing" && topic.title === "Самочувствие"),
);
assert.ok(options.some((topic) => topic.key === "energy" && topic.title === "Энергия"));
assert.equal(
  options.filter((topic) => OLD_COMPOUND_TITLES.includes(topic.title)).length,
  0,
  "old compound labels are not offered in UI source",
);

assert.equal(DEFAULT_AUTHOR_TOPIC_LIMIT, 3, "author limit remains 3");
let selected = [];
selected = toggleTopic(selected, "self-worth", options, DEFAULT_AUTHOR_TOPIC_LIMIT);
selected = toggleTopic(selected, "self-esteem", options, DEFAULT_AUTHOR_TOPIC_LIMIT);
assert.deepEqual(selected, ["self-worth", "self-esteem"], "can select both independently");
selected = toggleTopic(selected, "body-wellbeing", options, DEFAULT_AUTHOR_TOPIC_LIMIT);
selected = toggleTopic(selected, "energy", options, DEFAULT_AUTHOR_TOPIC_LIMIT);
assert.deepEqual(
  selected,
  ["self-worth", "self-esteem", "body-wellbeing"],
  "Самочувствие saves; fourth topic blocked",
);
assert.equal(
  toggleTopic(selected, "energy", options, DEFAULT_AUTHOR_TOPIC_LIMIT).includes("energy"),
  false,
  "max 3 still blocks Энергия as a fourth topic",
);
selected = toggleTopic(selected, "self-esteem", options, DEFAULT_AUTHOR_TOPIC_LIMIT);
selected = toggleTopic(selected, "energy", options, DEFAULT_AUTHOR_TOPIC_LIMIT);
assert.ok(selected.includes("energy"), "Энергия saves when a slot is free");
assert.equal(assertTopicCountWithinLimit(3, 3).ok, true);
assert.equal(assertTopicCountWithinLimit(4, 3).ok, false);
assert.equal(assertPublishedTopicMinimum(0).ok, false);
assert.equal(assertPublishedTopicMinimum(1).ok, true);

const migration = read("supabase/migrations/20261006120100_topics_single_word_catalog.sql");
const selector = read("src/components/author-products/TopicSelector.tsx");
const topicForm = read("src/lib/author-products/topic-form-data.ts");
const catalogFilter = read("src/components/catalog/TopicFilterBar.tsx");
const homeNav = read("src/components/home/HomeTopicNavigation.tsx");
const playlistFilter = read(
  "src/components/playlists/catalog/PlaylistCatalogTopicFilter.tsx",
);
const limits = read("src/lib/topics/limits.ts");

assert.match(selector, /options\.map/);
assert.doesNotMatch(selector, /key:\s*"(money|abundance|love|self-worth)"/);
assert.doesNotMatch(topicForm, /key:\s*"money"/);
assert.match(topicForm, /listActiveTopics\(supabase\)/);
assert.match(catalogFilter, /topic\.title/);
assert.match(homeNav, /topic\.title/);
assert.match(playlistFilter, /topic\.title/);

for (const title of OLD_COMPOUND_TITLES) {
  assert.equal(selector.includes(title), false, `TopicSelector does not offer ${title}`);
  assert.equal(catalogFilter.includes(title), false, `catalog filter does not offer ${title}`);
  assert.equal(homeNav.includes(title), false, `home nav does not offer ${title}`);
  assert.equal(
    playlistFilter.includes(title),
    false,
    `playlist filter does not offer ${title}`,
  );
}

assert.match(limits, /DEFAULT_AUTHOR_TOPIC_LIMIT = 3/);
assert.match(migration, /does NOT/);
assert.match(migration, /auto-assign «Самооценка»/);
assert.doesNotMatch(migration, /INSERT INTO public\.practice_topics/);
assert.match(
  migration,
  /practice_topics rows still reference old compound titles/,
);

console.log("topics-single-word-catalog-unit: ok");
