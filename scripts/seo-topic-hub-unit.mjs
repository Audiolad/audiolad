#!/usr/bin/env node
/**
 * SEO topic hub unit checks — no DB, no network.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildTopicHubJsonLdGraph,
  buildTopicHubMetadata,
  buildTopicHubPath,
  getTopicHubBySlug,
  getTopicHubByTopicKey,
  isValidTopicHubSlug,
  listTopicHubSlugs,
  resolveTopicPublicHref,
  selectTopicHubProducts,
} from "../src/lib/seo/topic-hubs/index.ts";
import { mapTopicHubDefinitionsToSitemapEntries } from "../src/lib/seo/sitemap-data.ts";
import { isPlatformAnalyticsEventName } from "../src/lib/analytics/constants.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(relPath) {
  return readFileSync(join(ROOT, relPath), "utf8");
}

assert(isValidTopicHubSlug("lyubov-k-sebe"), "valid hub slug");
assert(!isValidTopicHubSlug("Любовь"), "rejects cyrillic slug");
assert(
  buildTopicHubPath("lyubov-k-sebe") === "/topics/lyubov-k-sebe",
  "hub path",
);

const hub = getTopicHubBySlug("lyubov-k-sebe");
assert(hub?.topicKey === "self-worth", "maps SEO hub to platform topic key");
assert(hub?.title === "Любовь к себе", "editorial title");
assert(getTopicHubByTopicKey("self-worth")?.slug === "lyubov-k-sebe", "reverse map");
assert(listTopicHubSlugs().includes("lyubov-k-sebe"), "slug list");

assert(
  resolveTopicPublicHref("self-worth") === "/topics/lyubov-k-sebe",
  "self-worth prefers primary SEO hub",
);
assert(
  resolveTopicPublicHref("money") === "/catalog?topic=money",
  "money chips stay on catalog while money hub has resolveTopicChips=false",
);

const femaleHub = getTopicHubBySlug("zhenskaya-energiya");
assert(femaleHub?.topicKey === "self-worth", "female hub uses factual self-worth key");
assert(femaleHub?.resolveTopicChips === false, "female hub does not steal topic chips");
assert(
  Array.isArray(femaleHub?.practiceSlugAllowlist) &&
    femaleHub.practiceSlugAllowlist.length >= 4,
  "female hub has editorial allowlist",
);
assert(femaleHub?.title === "Женская энергия", "female hub H1");
assert(
  !String(femaleHub?.metaDescription || "").includes("любовь к себе"),
  "female meta is not a copy of love hub",
);
assert(
  listTopicHubSlugs().includes("zhenskaya-energiya"),
  "female hub slug registered",
);
assert(
  getTopicHubByTopicKey("self-worth")?.slug === "lyubov-k-sebe",
  "primary reverse map stays love hub",
);
assert(
  femaleHub?.relatedLinks?.some((link) => link.href === "/topics/lyubov-k-sebe"),
  "female hub links to love hub",
);
assert(
  hub?.relatedLinks?.some((link) => link.href === "/topics/zhenskaya-energiya"),
  "love hub links to female hub",
);

const pageData = {
  hub,
  path: "/topics/lyubov-k-sebe",
  canonicalUrl: "https://audiolad.ru/topics/lyubov-k-sebe",
  products: [
    {
      id: "p1",
      title: "Практика",
      slug: "praktika",
      subtitle: null,
      description: null,
      format: null,
      price: 0,
      isFree: true,
      authorName: "Автор",
      authorSlug: "author",
      href: "/practice/author/praktika",
      meta: null,
      statsLabel: null,
      productTypeLabel: "Аудиопрактика",
      priceLabel: "Бесплатно",
      sortTimestamp: 1,
      coverUrl: null,
      coverImage: null,
      updatedAt: null,
    },
  ],
  freeProducts: [],
  paidProducts: [],
  platformTopicTitle: "Уверенность и самоценность",
};

const metadata = buildTopicHubMetadata(pageData);
assert(
  metadata.alternates?.canonical === "https://audiolad.ru/topics/lyubov-k-sebe",
  "canonical in metadata",
);
assert(String(metadata.title).includes("Любовь к себе"), "title includes hub name");
assert(metadata.openGraph?.url === metadata.alternates?.canonical, "og url = canonical");

const jsonLd = buildTopicHubJsonLdGraph(pageData, "https://audiolad.ru");
assert(jsonLd["@context"] === "https://schema.org", "json-ld context");
const graph = jsonLd["@graph"];
assert(Array.isArray(graph), "json-ld graph");
assert(
  graph.some((node) => node["@type"] === "CollectionPage"),
  "CollectionPage present",
);
assert(
  graph.some((node) => node["@type"] === "BreadcrumbList"),
  "BreadcrumbList present",
);
assert(graph.some((node) => node["@type"] === "FAQPage"), "FAQPage present");

const sitemapEntries = mapTopicHubDefinitionsToSitemapEntries();
assert(
  sitemapEntries.some((entry) =>
    entry.url.endsWith("/topics/lyubov-k-sebe"),
  ),
  "sitemap includes love hub",
);
assert(
  sitemapEntries.some((entry) =>
    entry.url.endsWith("/topics/zhenskaya-energiya"),
  ),
  "sitemap includes female hub",
);

const femalePageData = {
  hub: femaleHub,
  path: "/topics/zhenskaya-energiya",
  canonicalUrl: "https://audiolad.ru/topics/zhenskaya-energiya",
  products: pageData.products,
  freeProducts: [],
  paidProducts: [],
  platformTopicTitle: "Уверенность и самоценность",
};
const femaleMeta = buildTopicHubMetadata(femalePageData);
assert(
  femaleMeta.alternates?.canonical ===
    "https://audiolad.ru/topics/zhenskaya-energiya",
  "female canonical",
);
assert(String(femaleMeta.title).includes("Женская энергия"), "female title");
const femaleJsonLd = buildTopicHubJsonLdGraph(
  femalePageData,
  "https://audiolad.ru",
);
assert(
  Array.isArray(femaleJsonLd["@graph"]) &&
    femaleJsonLd["@graph"].some((node) => node["@type"] === "FAQPage"),
  "female FAQ JSON-LD",
);

assert(isPlatformAnalyticsEventName("topic_page_viewed"), "topic_page_viewed allowlisted in TS");
assert(
  isPlatformAnalyticsEventName("topic_product_clicked"),
  "topic_product_clicked allowlisted in TS",
);

const pageSource = read("src/app/(listener)/topics/[slug]/page.tsx");
assert(pageSource.includes("loadTopicHubPageData"), "page loads hub data");
assert(pageSource.includes("buildTopicHubMetadata"), "page metadata builder");

const viewSource = read("src/components/topics/TopicHubPageView.tsx");
assert(viewSource.includes("JsonLdScript"), "renders JSON-LD");
assert(viewSource.includes("TopicHubViewTracker"), "view tracker");
assert(viewSource.includes("Хлебные крошки"), "breadcrumbs");
assert(viewSource.includes("Частые вопросы"), "FAQ section");

const viewTracker = read("src/components/topics/TopicHubViewTracker.tsx");
const clickTracker = read(
  "src/components/topics/TopicHubProductClickTracker.tsx",
);
assert(viewTracker.includes("topic_slug: hubSlug"), "view sends topic_slug");
assert(clickTracker.includes("topic_slug: hubSlug"), "click sends topic_slug");
assert(viewTracker.includes("hub_slug: hubSlug"), "view keeps hub_slug");
assert(clickTracker.includes("hub_slug: hubSlug"), "click keeps hub_slug");
assert(
  viewTracker.includes("normalizedTopicKey") &&
    viewTracker.includes("properties.topic_key"),
  "view sends topic_key only when present",
);

const freeHub = getTopicHubBySlug("besplatnye-meditatsii");
assert(freeHub?.freeOnly === true, "free hub freeOnly");
assert(!freeHub?.topicKey, "free hub has no fake topicKey");
assert(freeHub?.resolveTopicChips === false, "free hub does not steal chips");
assert(
  freeHub?.practiceSlugAllowlist?.length === 10,
  "free hub editorial allowlist of 10",
);
assert(freeHub?.title === "Бесплатные медитации", "free hub H1");
assert(
  listTopicHubSlugs().includes("besplatnye-meditatsii"),
  "free hub registered",
);
assert(
  sitemapEntries.some((entry) =>
    entry.url.endsWith("/topics/besplatnye-meditatsii"),
  ),
  "sitemap includes free hub",
);
assert(
  getTopicHubByTopicKey("self-worth")?.slug === "lyubov-k-sebe",
  "regression: self-worth still maps to love hub",
);
assert(
  resolveTopicPublicHref("self-worth") === "/topics/lyubov-k-sebe",
  "regression: chips still go to love hub",
);

const freeOrdered = selectTopicHubProducts(
  [
    {
      id: "2",
      title: "B",
      slug: "velikie-zhenschiny-mira",
      isFree: true,
      sortTimestamp: 9,
    },
    {
      id: "1",
      title: "A",
      slug: "kod-prityazheniya",
      isFree: true,
      sortTimestamp: 1,
    },
    {
      id: "3",
      title: "Paid",
      slug: "sila-zhenstvennosti",
      isFree: false,
      sortTimestamp: 5,
    },
  ],
  freeHub,
);
assert(
  freeOrdered.map((p) => p.slug).join(",") ===
    "kod-prityazheniya,velikie-zhenschiny-mira",
  "freeOnly + allowlist order; paid excluded",
);

const freePageData = {
  hub: freeHub,
  path: "/topics/besplatnye-meditatsii",
  canonicalUrl: "https://audiolad.ru/topics/besplatnye-meditatsii",
  products: pageData.products,
  freeProducts: pageData.products,
  paidProducts: [],
  platformTopicTitle: null,
};
const freeMeta = buildTopicHubMetadata(freePageData);
assert(
  freeMeta.alternates?.canonical ===
    "https://audiolad.ru/topics/besplatnye-meditatsii",
  "free canonical",
);
assert(String(freeMeta.title).includes("Бесплатные медитации"), "free title");

const migration = read(
  "supabase/migrations/20260724160000_platform_analytics_topic_hub_events.sql",
);
assert(migration.includes("topic_page_viewed"), "migration adds topic_page_viewed");
assert(migration.includes("topic_product_clicked"), "migration adds topic_product_clicked");

const topicsDoc = read("docs/TOPICS.md");
assert(topicsDoc.includes("/topics/"), "TOPICS.md documents topic hubs");
assert(topicsDoc.includes("lyubov-k-sebe"), "TOPICS.md mentions pilot slug");
assert(
  topicsDoc.includes("besplatnye-meditatsii"),
  "TOPICS.md mentions free hub",
);
assert(
  topicsDoc.includes("meditatsii-na-dengi"),
  "TOPICS.md mentions money hub",
);

const moneyHub = getTopicHubBySlug("meditatsii-na-dengi");
assert(moneyHub?.topicKey === "money", "money hub honest topicKey");
assert(moneyHub?.resolveTopicChips === false, "money hub does not steal chips");
assert(
  moneyHub?.practiceSlugAllowlist?.length === 7,
  "money hub editorial allowlist of 7",
);
assert(moneyHub?.title === "Медитации на деньги", "money hub H1");
assert(
  !String(moneyHub?.metaDescription || "").includes("гарант"),
  "money meta avoids guarantee wording",
);
assert(
  listTopicHubSlugs().includes("meditatsii-na-dengi"),
  "money hub registered",
);
assert(
  sitemapEntries.some((entry) =>
    entry.url.endsWith("/topics/meditatsii-na-dengi"),
  ),
  "sitemap includes money hub",
);
assert(
  getTopicHubByTopicKey("money") === null,
  "money topicKey does not reverse-map to hub chips",
);
assert(
  moneyHub?.relatedLinks?.some(
    (link) => link.href === "/topics/besplatnye-meditatsii",
  ),
  "money hub links to free hub",
);
assert(
  freeHub?.relatedLinks?.some(
    (link) => link.href === "/topics/meditatsii-na-dengi",
  ),
  "free hub links to money hub",
);
assert(
  !moneyHub?.practiceSlugAllowlist?.includes("klyuch-k-izobiliyu") &&
    !moneyHub?.practiceSlugAllowlist?.includes("koding-izobiliya") &&
    !moneyHub?.practiceSlugAllowlist?.includes("aktivatsiya-kanala-izobiliya"),
  "abundance practices reserved for future izobilie hub",
);

const moneyOrdered = selectTopicHubProducts(
  [
    {
      id: "m3",
      title: "Paid deep",
      slug: "energiya-deneg",
      isFree: false,
      sortTimestamp: 9,
    },
    {
      id: "m1",
      title: "Free entry",
      slug: "dengi-prihodyat-segodnya",
      isFree: true,
      sortTimestamp: 1,
    },
    {
      id: "m2",
      title: "Abundance out",
      slug: "klyuch-k-izobiliyu",
      isFree: true,
      sortTimestamp: 5,
    },
    {
      id: "m4",
      title: "Attraction",
      slug: "prityanut-dengi-legko",
      isFree: true,
      sortTimestamp: 3,
    },
  ],
  moneyHub,
);
assert(
  moneyOrdered.map((p) => p.slug).join(",") ===
    "dengi-prihodyat-segodnya,prityanut-dengi-legko,energiya-deneg",
  "money allowlist order; abundance slug excluded",
);

const moneyPageData = {
  hub: moneyHub,
  path: "/topics/meditatsii-na-dengi",
  canonicalUrl: "https://audiolad.ru/topics/meditatsii-na-dengi",
  products: pageData.products,
  freeProducts: pageData.products,
  paidProducts: [],
  platformTopicTitle: "Деньги",
};
const moneyMeta = buildTopicHubMetadata(moneyPageData);
assert(
  moneyMeta.alternates?.canonical ===
    "https://audiolad.ru/topics/meditatsii-na-dengi",
  "money canonical",
);
assert(String(moneyMeta.title).includes("Медитации на деньги"), "money title");

const moneyJson = JSON.stringify(buildTopicHubJsonLdGraph(moneyPageData));
assert(moneyJson.includes("CollectionPage"), "money JSON-LD CollectionPage");
assert(moneyJson.includes("ItemList"), "money JSON-LD ItemList");
assert(moneyJson.includes("FAQPage"), "money JSON-LD FAQPage");
assert(moneyJson.includes("BreadcrumbList"), "money JSON-LD BreadcrumbList");

assert(
  getTopicHubByTopicKey("self-worth")?.slug === "lyubov-k-sebe",
  "regression after money hub: self-worth -> love",
);
assert(
  getTopicHubBySlug("lyubov-k-sebe")?.practiceSlugAllowlist == null,
  "regression: love hub still topic-wide",
);
assert(
  getTopicHubBySlug("zhenskaya-energiya")?.practiceSlugAllowlist?.length === 6,
  "regression: female allowlist unchanged",
);
assert(
  getTopicHubBySlug("besplatnye-meditatsii")?.freeOnly === true &&
    getTopicHubBySlug("besplatnye-meditatsii")?.practiceSlugAllowlist
      ?.length === 10,
  "regression: free hub unchanged",
);

console.log("seo-topic-hub-unit: ok");
