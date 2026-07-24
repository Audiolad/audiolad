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
  "unmapped topic falls back to catalog",
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

const migration = read(
  "supabase/migrations/20260724160000_platform_analytics_topic_hub_events.sql",
);
assert(migration.includes("topic_page_viewed"), "migration adds topic_page_viewed");
assert(migration.includes("topic_product_clicked"), "migration adds topic_product_clicked");
assert(
  migration.includes("NOT applied in this task") ||
    migration.includes("apply only after explicit"),
  "migration marked as not auto-applied",
);

const topicsDoc = read("docs/TOPICS.md");
assert(topicsDoc.includes("/topics/"), "TOPICS.md documents topic hubs");
assert(topicsDoc.includes("lyubov-k-sebe"), "TOPICS.md mentions pilot slug");

console.log("seo-topic-hub-unit: ok");
