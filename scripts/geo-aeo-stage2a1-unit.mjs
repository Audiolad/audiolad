#!/usr/bin/env node
/**
 * GEO/AEO Stage 2A-1 — Topic Graph Foundation. No DB, no network.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { listArticlesByTopicSlug } from "../src/lib/seo/articles/index.ts";
import {
  buildListenPagePath,
  listIndexableListenPagesByTopicSlug,
  listListenPageDefinitions,
  listTopicHubListenCards,
  parseListenPageDefinition,
  resolveListenEditorialTopic,
} from "../src/lib/seo/listens/index.ts";
import {
  buildTopicHubJsonLdGraph,
  getTopicHubBySlug,
  listTopicHubSlugs,
} from "../src/lib/seo/topic-hubs/index.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORIGIN = "https://audiolad.ru";

const MONEY_LISTEN_SLUGS = [
  "meditatsiya-na-dengi-slushat-onlayn-besplatno",
  "denezhnaya-meditatsiya-slushat-onlayn-besplatno",
  "meditatsiya-na-bogatstvo-slushat-onlayn",
  "meditatsiya-dlya-privlecheniya-deneg-bogatstva-i-izobiliya",
  "meditatsiya-na-denezhnyy-potok-slushat-onlayn-besplatno",
  "meditatsiya-dlya-deneg-i-izobiliya-slushat-onlayn",
  "meditatsiya-na-dengi-i-izobilie-dlya-zhenshchin",
  "utrennyaya-meditatsiya-na-dengi-i-izobilie",
];

const IZOBILIE_LISTEN_SLUGS = [
  "meditatsiya-na-izobilie-slushat-onlayn-besplatno",
];

const NAMED_SLEEP_LISTEN_SLUGS = [
  "meditatsiya-dlya-zasypaniya-slushat-onlayn",
  "meditatsiya-dlya-sna-ot-stressa-i-trevogi",
  "meditatsiya-dlya-sna-i-vosstanovleniya-sil",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(relPath) {
  return readFileSync(join(ROOT, relPath), "utf8");
}

function slugSet(pages) {
  return [...pages].map((page) => page.slug).sort();
}

function validListenDraft(overrides = {}) {
  return {
    type: "listen",
    slug: "stage2a1-listen-draft",
    title: "Stage 2A-1 draft",
    description: "Stage 2A-1 draft",
    h1: "Stage 2A-1 draft",
    intro: ["Intro"],
    playlistSlug: "editorial-playlist-slug",
    sections: [],
    faq: [],
    ...overrides,
  };
}

function testTopicSlugOptional() {
  const parsed = parseListenPageDefinition(validListenDraft());
  assert(parsed.ok, "topicSlug is optional");
  assert(parsed.definition.topicSlug === undefined, "absent topicSlug stays undefined");
}

function testUnknownAndCatalogKeysRejected() {
  const unknown = parseListenPageDefinition(
    validListenDraft({ topicSlug: "unknown-editorial-hub" }),
  );
  assert(!unknown.ok && unknown.reason === "unknown_topic_slug", "unknown topic rejected");

  for (const catalogKey of ["money", "self-worth", "calm"]) {
    const parsed = parseListenPageDefinition(validListenDraft({ topicSlug: catalogKey }));
    assert(
      !parsed.ok && parsed.reason === "unknown_topic_slug",
      `catalog key ${catalogKey} rejected`,
    );
  }

  const futureSleep = parseListenPageDefinition(
    validListenDraft({ topicSlug: "meditatsii-dlya-sna" }),
  );
  assert(
    !futureSleep.ok && futureSleep.reason === "unknown_topic_slug",
    "future meditatsii-dlya-sna rejected until registered",
  );
}

function testRegisteredTopicAccepted() {
  const parsed = parseListenPageDefinition(
    validListenDraft({ topicSlug: "meditatsii-na-dengi" }),
  );
  assert(parsed.ok, "registered hub slug accepted");
  assert(parsed.definition.topicSlug === "meditatsii-na-dengi", "accepted topicSlug kept");
}

function testMoneyAndIzobilieMapping() {
  const money = listIndexableListenPagesByTopicSlug("meditatsii-na-dengi");
  assert(money.length === 8, "money mapping = 8");
  assert(
    slugSet(money).join(",") === [...MONEY_LISTEN_SLUGS].sort().join(","),
    "money mapping slugs match editorial list",
  );

  const izobilie = listIndexableListenPagesByTopicSlug("izobilie");
  assert(izobilie.length === 1, "izobilie mapping = 1");
  assert(izobilie[0]?.slug === IZOBILIE_LISTEN_SLUGS[0], "izobilie listen slug");
}

function testSleepListensUnmapped() {
  const pages = listListenPageDefinitions();
  const sleepMapped = pages.filter(
    (page) =>
      NAMED_SLEEP_LISTEN_SLUGS.includes(page.slug) && Boolean(page.topicSlug),
  );
  assert(sleepMapped.length === 0, "named sleep listens have no topicSlug");

  const mappedToExisting = pages.filter((page) => {
    const topicSlug = page.topicSlug?.trim().toLowerCase();
    if (!topicSlug) {
      return false;
    }

    const looksLikeSleep =
      page.slug.includes("sna") ||
      page.slug.includes("snom") ||
      page.slug.includes("zasypaniya") ||
      page.slug.includes("shum-vody") ||
      page.slug.includes("muzyka-dlya-sna") ||
      page.slug.includes("zhurchanie") ||
      page.slug.includes("vodopada") ||
      page.slug.includes("ruchya") ||
      page.slug.includes("lyushcheysya") ||
      page.slug.includes("belyy-shum");

    return looksLikeSleep && Boolean(getTopicHubBySlug(topicSlug));
  });
  assert(
    mappedToExisting.length === 0,
    "sleep listens mapped to existing topics = 0",
  );

  assert(
    pages.every((page) => page.topicSlug !== "besplatnye-meditatsii"),
    "no listen attached to besplatnye-meditatsii",
  );
  assert(
    pages.every((page) => page.topicSlug !== "calm" && page.topicSlug !== "money"),
    "no listen attached to catalog topic keys",
  );
}

function testPublicListenUrls() {
  const moneyCards = listTopicHubListenCards("meditatsii-na-dengi");
  assert(moneyCards.length === 8, "money hub cards = 8");
  assert(
    moneyCards.every((card) => card.href === buildListenPagePath(card.slug)),
    "listen cards use /listens/{slug}",
  );
  assert(
    moneyCards.every((card) => card.href.startsWith("/listens/")),
    "public listen URL stays /listens/...",
  );
  assert(
    moneyCards.every((card) => !card.href.startsWith("/listen/")),
    "private /listen/ does not appear in topic graph cards",
  );

  const view = read("src/components/topics/TopicHubPageView.tsx");
  const listenBlock = view.slice(
    view.indexOf("Слушать по теме"),
    view.indexOf("Статьи по теме"),
  );
  assert(listenBlock.includes("listen.href"), "hub listen cards render listen.href");
  assert(!listenBlock.includes("/listen/"), "private /listen/ absent from hub listen block");

  const listenView = read("src/components/listens/ListenPageView.tsx");
  assert(listenView.includes("Тема:"), "listen page shows topic label");
  assert(
    listenView.includes("resolveListenEditorialTopic"),
    "listen page resolves editorial topic",
  );
  assert(
    !listenView.includes('href="/listen/'),
    "listen page topic link is not private /listen/",
  );

  const moneyPage = listListenPageDefinitions().find(
    (page) => page.slug === "meditatsiya-na-dengi-slushat-onlayn-besplatno",
  );
  const topicLink = resolveListenEditorialTopic(moneyPage);
  assert(topicLink?.href === "/topics/meditatsii-na-dengi", "listen → topic uses hub path");
  assert(topicLink?.title === "Медитации на деньги", "listen → topic uses hub title");
}

function testHubReceivesOnlyOwnListens() {
  const loveCards = listTopicHubListenCards("lyubov-k-sebe");
  const femaleCards = listTopicHubListenCards("zhenskaya-energiya");
  const freeCards = listTopicHubListenCards("besplatnye-meditatsii");
  const moneyCards = listTopicHubListenCards("meditatsii-na-dengi");
  const izobilieCards = listTopicHubListenCards("izobilie");

  assert(loveCards.length === 0, "love hub has no listens");
  assert(femaleCards.length === 0, "female hub has no listens");
  assert(freeCards.length === 0, "free hub has no listens");
  assert(
    moneyCards.every((card) => MONEY_LISTEN_SLUGS.includes(card.slug)),
    "money hub receives only money listens",
  );
  assert(
    izobilieCards.every((card) => IZOBILIE_LISTEN_SLUGS.includes(card.slug)),
    "izobilie hub receives only its listen",
  );
  assert(
    !moneyCards.some((card) => IZOBILIE_LISTEN_SLUGS.includes(card.slug)),
    "money hub does not receive izobilie listen",
  );
}

function testEmptyListenBlockHidden() {
  const view = read("src/components/topics/TopicHubPageView.tsx");
  assert(view.includes("Слушать по теме"), "listen block heading exists");
  assert(
    view.includes("data.listens.length > 0"),
    "hub without listens does not render empty block",
  );
  assert(
    !view.includes("Слушать по теме") || view.includes("data.listens.length > 0"),
    "empty listen section is gated",
  );
}

function testArticlesAndPracticesStaySeparate() {
  const load = read("src/lib/seo/topic-hubs/load.ts");
  assert(load.includes("listArticlesByTopicSlug"), "hub still loads articles");
  assert(load.includes("listTopicHubListenCards"), "hub loads listens separately");
  assert(load.includes("selectTopicHubProducts"), "hub still selects practices");

  const view = read("src/components/topics/TopicHubPageView.tsx");
  assert(view.includes("Бесплатные практики"), "practice blocks remain");
  assert(view.includes("Статьи по теме"), "article block remains");
  assert(view.includes("Слушать по теме"), "listen block is separate");

  const moneyArticles = listArticlesByTopicSlug("meditatsii-na-dengi");
  assert(moneyArticles.length > 0, "money articles continue to resolve");
}

function testBreadcrumbsUseTopics() {
  const view = read("src/components/topics/TopicHubPageView.tsx");
  assert(view.includes('href="/topics"'), "visible breadcrumbs link to /topics");
  assert(view.includes("Темы"), "visible breadcrumbs use Темы");

  const breadcrumbNav = view.slice(
    view.indexOf('aria-label="Хлебные крошки"'),
    view.indexOf("<header"),
  );
  assert(breadcrumbNav.includes('href="/topics"'), "crumb parent is /topics");
  assert(!breadcrumbNav.includes('href="/catalog"'), "hub crumbs are not catalog");

  const hub = getTopicHubBySlug("meditatsii-na-dengi");
  const jsonLd = buildTopicHubJsonLdGraph(
    {
      hub,
      path: "/topics/meditatsii-na-dengi",
      canonicalUrl: `${ORIGIN}/topics/meditatsii-na-dengi`,
      products: [],
      freeProducts: [],
      paidProducts: [],
      articles: [],
      listens: listTopicHubListenCards("meditatsii-na-dengi"),
      platformTopicTitle: "Деньги",
    },
    ORIGIN,
  );
  const breadcrumbs = jsonLd["@graph"].find((node) => node["@type"] === "BreadcrumbList");
  assert(breadcrumbs, "BreadcrumbList present");
  assert(
    breadcrumbs.itemListElement[1]?.name === "Темы",
    "BreadcrumbList uses Темы",
  );
  assert(
    breadcrumbs.itemListElement[1]?.item === `${ORIGIN}/topics`,
    "BreadcrumbList uses /topics",
  );

  const collection = jsonLd["@graph"].find((node) => node["@type"] === "CollectionPage");
  const itemList = collection?.mainEntity;
  assert(itemList?.["@type"] === "ItemList", "CollectionPage still has practice ItemList");
  assert(
    !JSON.stringify(itemList).includes("/listens/"),
    "schema is not expanded with Listen items",
  );
}

function testFutureHubsNotCreated() {
  const slugs = listTopicHubSlugs();
  assert(!slugs.includes("meditatsii-dlya-sna"), "sleep hub is not created yet");
  assert(
    !slugs.some((slug) => slug.includes("razvod") || slug.includes("divorce")),
    "divorce hubs are not created yet",
  );
}

const tests = [
  ["topicSlug optional", testTopicSlugOptional],
  ["unknown and catalog keys rejected", testUnknownAndCatalogKeysRejected],
  ["registered topic accepted", testRegisteredTopicAccepted],
  ["money and izobilie mapping", testMoneyAndIzobilieMapping],
  ["sleep listens unmapped", testSleepListensUnmapped],
  ["public listen URLs", testPublicListenUrls],
  ["hub receives only own listens", testHubReceivesOnlyOwnListens],
  ["empty listen block hidden", testEmptyListenBlockHidden],
  ["articles and practices stay separate", testArticlesAndPracticesStaySeparate],
  ["breadcrumbs use /topics", testBreadcrumbsUseTopics],
  ["future hubs not created", testFutureHubsNotCreated],
];

for (const [name, fn] of tests) {
  fn();
  console.log(`ok: ${name}`);
}

console.log(`geo-aeo-stage2a1-unit: ${tests.length} checks passed`);
