#!/usr/bin/env node
/**
 * Catalog topic filter unit checks (no DB).
 */
import { readFileSync } from "node:fs";

import {
  buildCatalogHref,
  buildCatalogTopicHref,
  countCatalogFilterGroups,
  getCatalogTopicFilterLabel,
  normalizeCatalogTopicParam,
  parseCatalogTopicFilter,
  parseCatalogTopicFilters,
  parseCatalogTopicKeyList,
  resolveCatalogTopicSearchParam,
  serializeCatalogTopicParam,
  toggleCatalogDraftTopics,
} from "../src/lib/catalog/topic-filter.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const allowedKeys = ["money", "relationships", "calm", "career", "business", "learning"];

assert(parseCatalogTopicFilter(undefined, allowedKeys) === null, "missing param -> all");
assert(parseCatalogTopicFilter("", allowedKeys) === null, "empty param -> all");
assert(parseCatalogTopicFilter("money", allowedKeys) === "money", "valid key");
assert(parseCatalogTopicFilter("MONEY", allowedKeys) === "money", "case insensitive");
assert(parseCatalogTopicFilter("unknown", allowedKeys) === null, "unknown key -> all");
assert(parseCatalogTopicFilter("bad key", allowedKeys) === null, "invalid format -> all");
assert(parseCatalogTopicFilter("self-worth", ["self-worth"]) === "self-worth", "hyphenated key");

assert(buildCatalogTopicHref(null) === "/catalog", "all href");
assert(buildCatalogTopicHref("money") === "/catalog?topic=money", "topic href");
assert(
  buildCatalogTopicHref("self-worth") === "/catalog?topic=self-worth",
  "encoded topic href",
);

assert(normalizeCatalogTopicParam(" Purpose ") === "purpose", "normalize trims");
assert(normalizeCatalogTopicParam("bad key") === null, "normalize rejects spaces");

assert(
  getCatalogTopicFilterLabel("money", [
    { key: "money", title: "Деньги" },
    { key: "calm", title: "Спокойствие" },
  ]) === "Деньги",
  "label lookup",
);
assert(getCatalogTopicFilterLabel(null, []) === null, "no label for all");

assert(
  resolveCatalogTopicSearchParam({ topic: "money" }) === "money",
  "topic param wins",
);
assert(
  resolveCatalogTopicSearchParam({ need: "relationships" }) === "relationships",
  "legacy need maps to topic key",
);
assert(
  resolveCatalogTopicSearchParam({ need: "relax" }) === undefined,
  "unknown legacy need ignored",
);
assert(
  resolveCatalogTopicSearchParam({ topic: "", need: "relationships" }) === "relationships",
  "empty topic falls back to legacy need",
);

assert(
  JSON.stringify(parseCatalogTopicKeyList("money")) === JSON.stringify(["money"]),
  "single topic list",
);
assert(
  JSON.stringify(parseCatalogTopicKeyList("money,sleep,calm")) ===
    JSON.stringify(["money", "sleep", "calm"]),
  "comma topic list",
);
assert(
  JSON.stringify(parseCatalogTopicKeyList("money,,sleep,money,bad key")) ===
    JSON.stringify(["money", "sleep"]),
  "empty values, duplicates, and invalid format dropped",
);
assert(
  JSON.stringify(parseCatalogTopicKeyList("money,sleep,calm,energy")) ===
    JSON.stringify(["money", "sleep", "calm"]),
  "topic list capped at 3",
);
assert(
  JSON.stringify(parseCatalogTopicFilters("money,relationships,unknown", allowedKeys)) ===
    JSON.stringify(["money", "relationships"]),
  "unknown keys dropped against allowed set",
);
assert(
  parseCatalogTopicFilter("money,calm,relationships", allowedKeys) === "money",
  "legacy single parse keeps the first valid key",
);
assert(
  normalizeCatalogTopicParam("MONEY,Sleep,CALM") === "money,sleep,calm",
  "normalize keeps a comma list",
);
assert(
  serializeCatalogTopicParam(["money", "sleep"]) === "money,sleep",
  "serialize joins selected keys",
);
assert(serializeCatalogTopicParam([]) === null, "empty serialize is null");
assert(
  buildCatalogHref({ topic: "money,sleep,calm" }).includes("topic=money"),
  "buildCatalogHref still writes topic=",
);
assert(
  decodeURIComponent(new URL(buildCatalogHref({ topic: "money,sleep,calm" }), "https://audiolad.test").searchParams.get("topic")) ===
    "money,sleep,calm",
  "apply can pass a comma topic string through buildCatalogHref",
);

let draft = [];
draft = toggleCatalogDraftTopics(draft, "money");
assert(JSON.stringify(draft) === JSON.stringify(["money"]), "select first topic");
draft = toggleCatalogDraftTopics(draft, "sleep");
assert(JSON.stringify(draft) === JSON.stringify(["money", "sleep"]), "second topic stays with first");
draft = toggleCatalogDraftTopics(draft, "calm");
assert(JSON.stringify(draft) === JSON.stringify(["money", "sleep", "calm"]), "third topic stays with first two");
draft = toggleCatalogDraftTopics(draft, "energy");
assert(JSON.stringify(draft) === JSON.stringify(["money", "sleep", "calm"]), "fourth topic does not replace");
draft = toggleCatalogDraftTopics(draft, "sleep");
assert(JSON.stringify(draft) === JSON.stringify(["money", "calm"]), "deselect one of three");
draft = toggleCatalogDraftTopics(draft, "energy");
assert(JSON.stringify(draft) === JSON.stringify(["money", "calm", "energy"]), "can select another after deselect");

assert(
  countCatalogFilterGroups({ topicKeys: ["money", "sleep", "calm"], access: "all", kind: "all" }) === 1,
  "3 topics = 1 group",
);
assert(
  countCatalogFilterGroups({ topicKeys: ["money", "sleep", "calm"], access: "paid", kind: "all" }) === 2,
  "3 topics + access = 2",
);
assert(
  countCatalogFilterGroups({
    topicKeys: ["money", "sleep", "calm"],
    access: "paid",
    kind: "practice",
  }) === 3,
  "3 topics + access + kind = 3",
);
assert(
  countCatalogFilterGroups({ topicKeys: [], access: "all", kind: "all" }) === 0,
  "reset groups = 0",
);
assert(
  getCatalogTopicFilterLabel("money,calm", [
    { key: "money", title: "Деньги" },
    { key: "calm", title: "Спокойствие" },
  ]) === "Деньги, Спокойствие",
  "multi-topic intro labels",
);

assert(
  parseCatalogTopicFilter("career", allowedKeys) === "career",
  "career topic key",
);
assert(
  parseCatalogTopicFilter("business", allowedKeys) === "business",
  "business topic key",
);
assert(
  parseCatalogTopicFilter("learning", allowedKeys) === "learning",
  "learning topic key is not a publication class",
);
assert(
  getCatalogTopicFilterLabel("career,business,learning", [
    { key: "career", title: "Карьера" },
    { key: "business", title: "Бизнес" },
    { key: "learning", title: "Обучение" },
  ]) === "Карьера, Бизнес, Обучение",
  "new topic titles resolve in filter labels",
);

const topicSeed = readFileSync(
  "supabase/migrations/20260825120000_topics_career_business_learning.sql",
  "utf8",
);
const catalogFilterUi = readFileSync("src/lib/catalog/catalog-filter-ui.ts", "utf8");
const listingContract = readFileSync("src/lib/catalog/listing-contract.ts", "utf8");
const catalogDto = readFileSync("src/lib/catalog/dto.ts", "utf8");
const topicQueries = readFileSync("src/lib/topics/queries.ts", "utf8");

assert(topicSeed.includes("'career'"), "seed has career key");
assert(topicSeed.includes("'business'"), "seed has business key");
assert(topicSeed.includes("'learning'"), "seed has learning key");
assert(topicSeed.includes("'Карьера'"), "seed has Карьера title");
assert(topicSeed.includes("'Бизнес'"), "seed has Бизнес title");
assert(topicSeed.includes("'Обучение'"), "seed has Обучение title");
assert(topicSeed.includes("ON CONFLICT (key) DO NOTHING"), "seed is insert-if-not-exists");
assert(
  topicSeed.includes("INSERT INTO public.topics") &&
    !topicSeed.includes("product_kind") &&
    !topicSeed.includes("CREATE TABLE") &&
    !topicSeed.includes("ALTER TABLE"),
  "seed only inserts topics and does not add a content class",
);

assert(
  topicQueries.includes('from("topics")') && topicQueries.includes("listActiveTopics"),
  "filters and cabinet still load topics from the directory table",
);
assert(
  !catalogFilterUi.includes("Карьера") &&
    !catalogFilterUi.includes("Бизнес") &&
    !catalogFilterUi.includes("Обучение"),
  "catalog-filter-ui does not hardcode the new topic titles",
);
assert(
  !listingContract.includes('"learning"') &&
    !listingContract.includes('"career"') &&
    !listingContract.includes('"business"'),
  "listing class filters stay independent of the new topic keys",
);
assert(
  catalogDto.includes('"course"') &&
    !catalogDto.includes('"learning"') &&
    !catalogDto.includes('"career"') &&
    !catalogDto.includes('"business"'),
  "Freeze v2 publication classes unchanged; learning is not a class",
);
assert(
  catalogFilterUi.includes('value: "course"') &&
    !catalogFilterUi.includes('value: "learning"'),
  "class chip Курсы stays course; Обучение is not a class option",
);

console.log("catalog-topic-filter-unit: ok");
