#!/usr/bin/env node
/**
 * Home topic navigation unit checks (no DB).
 */
import { existsSync, readFileSync } from "node:fs";

import { buildCatalogTopicHref } from "../src/lib/catalog/topic-filter.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

/** Mirrors src/lib/home/topic-navigation.ts */
function mapHomeTopicItems(topics) {
  return topics.map((topic) => ({
    key: topic.key,
    title: topic.title,
    href: buildCatalogTopicHref(topic.key),
  }));
}

/** Mirrors src/lib/home/topic-navigation.ts */
function splitHomeTopicsIntoScrollRows(topics) {
  const firstRow = [];
  const secondRow = [];

  topics.forEach((topic, index) => {
    if (index % 2 === 0) {
      firstRow.push(topic);
    } else {
      secondRow.push(topic);
    }
  });

  return { firstRow, secondRow };
}

function shouldWrapHomeTopicChip(title) {
  return title.trim().length > 20;
}

const src = readFileSync("src/components/home/HomeTopicNavigation.tsx", "utf8");
const guestHome = readFileSync("src/components/home/GuestHome.tsx", "utf8");
const personalHome = readFileSync("src/components/home/PersonalHome.tsx", "utf8");
const homePage = readFileSync("src/app/(listener)/(home)/page.tsx", "utf8");
const topicNavLib = readFileSync("src/lib/home/topic-navigation.ts", "utf8");
const topicFilter = readFileSync("src/lib/catalog/topic-filter.ts", "utf8");
const topicsQueries = readFileSync("src/lib/topics/queries.ts", "utf8");

assert(!src.includes("HOME_NEED_ITEMS"), "HomeTopicNavigation has no HOME_NEED_ITEMS");
assert(!guestHome.includes("HOME_NEED_ITEMS"), "GuestHome has no HOME_NEED_ITEMS");
assert(!personalHome.includes("HOME_NEED_ITEMS"), "PersonalHome has no HOME_NEED_ITEMS");
assert(!guestHome.includes("NeedsNavigation"), "GuestHome uses HomeTopicNavigation");
assert(guestHome.includes("HomeTopicNavigation"), "GuestHome wires HomeTopicNavigation");
assert(personalHome.includes("HomeTopicNavigation"), "PersonalHome wires HomeTopicNavigation");
assert(homePage.includes("loadHomeTopicsSafe"), "Home page loads topics on server");
assert(topicNavLib.includes("listHomeTopicsWithCatalogCounts"), "home loader uses listHomeTopicsWithCatalogCounts");

assert(!guestHome.includes("?need="), "GuestHome does not emit need links");
assert(!personalHome.includes("?need="), "PersonalHome does not emit need links");
assert(!src.includes("?need="), "HomeTopicNavigation does not emit need links");

assert(src.includes('from "next/link"'), "HomeTopicNavigation uses Link");
assert(src.includes('aria-label="Темы АудиоЛад"'), "HomeTopicNavigation has aria-label");
assert(!src.includes("onClick"), "HomeTopicNavigation has no onClick");
assert(src.includes("home-needs-track"), "horizontal scroll track class");

assert(
  topicNavLib.includes("index % 2 === 0"),
  "dynamic even/odd row split in source",
);

assert(
  topicsQueries.includes("showOnHome && topic.catalogProductCount > 0"),
  "home topics filter show_on_home and catalog count",
);

const topics = mapHomeTopicItems([
  {
    key: "money",
    title: "Деньги",
    catalogProductCount: 3,
  },
  {
    key: "relationships",
    title: "Отношения",
    catalogProductCount: 2,
  },
]);

assert(topics[0].href === "/catalog?topic=money", "href uses topic key");
assert(topics[0].href === buildCatalogTopicHref("money"), "href matches catalog helper");
assert(!topics[0].href.includes("Деньги"), "href does not use title");

const rows = splitHomeTopicsIntoScrollRows([
  { key: "a", title: "A", href: "/catalog?topic=a" },
  { key: "b", title: "B", href: "/catalog?topic=b" },
  { key: "c", title: "C", href: "/catalog?topic=c" },
  { key: "d", title: "D", href: "/catalog?topic=d" },
  { key: "e", title: "E", href: "/catalog?topic=e" },
]);

assert(rows.firstRow.length === 3 && rows.secondRow.length === 2, "dynamic odd/even split for 5 items");
assert(rows.firstRow[0].key === "a" && rows.secondRow[0].key === "b", "preserves order");

const seven = splitHomeTopicsIntoScrollRows(
  Array.from({ length: 7 }, (_, index) => ({
    key: `t${index}`,
    title: `T${index}`,
    href: `/catalog?topic=t${index}`,
  })),
);
assert(seven.firstRow.length === 4 && seven.secondRow.length === 3, "works for 7 topics not only 8");

const single = splitHomeTopicsIntoScrollRows([
  { key: "only", title: "Only", href: "/catalog?topic=only" },
]);
assert(single.firstRow.length === 1 && single.secondRow.length === 0, "single topic has one row");

assert(
  shouldWrapHomeTopicChip("Уверенность и самоценность"),
  "long title gets wrap helper",
);

assert(topicFilter.includes("LEGACY_NEED_TO_TOPIC_KEY"), "catalog keeps legacy need compatibility");

assert(!existsSync("src/lib/home/needs-navigation.ts"), "needs-navigation.ts removed");
assert(!existsSync("src/components/home/NeedsNavigation.tsx"), "NeedsNavigation.tsx removed");

console.log("home-topic-navigation-unit: ok");
