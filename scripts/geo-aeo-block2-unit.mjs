#!/usr/bin/env node
/**
 * GEO/AEO Stage 1 Block 2 — dates, /topics, inner-support noindex, sitemap.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatArticleVisibleDate,
  listArticleDefinitions,
  loadArticleDirectoryPageData,
  resolveArticleVisibleDates,
} from "../src/lib/seo/articles/index.ts";
import { buildArticlesDirectoryJsonLdGraph } from "../src/lib/seo/articles/directory-json-ld.ts";
import {
  buildTopicsDirectoryJsonLdGraph,
  buildTopicsDirectoryMetadata,
  listTopicHubDefinitions,
  loadTopicsDirectoryPageData,
} from "../src/lib/seo/topic-hubs/index.ts";
import {
  STATIC_SITEMAP_PAGES,
  mapArticleDefinitionsToSitemapEntries,
  mapListenPageDefinitionsToSitemapEntries,
  mapTopicHubDefinitionsToSitemapEntries,
} from "../src/lib/seo/sitemap-data.ts";
import { PRIVATE_PAGE_ROBOTS } from "../src/lib/seo/private-robots.ts";
import { listIndexableListenPageDefinitions } from "../src/lib/seo/listens/index.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(relPath) {
  return readFileSync(join(ROOT, relPath), "utf8");
}

const sameDay = resolveArticleVisibleDates({
  publishedAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
});
assert(sameDay?.publishedLabel.includes("27"), "published day");
assert(sameDay?.publishedLabel.includes("2026"), "published year");
assert(sameDay?.showUpdated === false, "same calendar day hides updated");

const changed = resolveArticleVisibleDates({
  publishedAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
});
assert(changed?.showUpdated === true, "different day shows updated");
assert(changed?.updatedLabel.includes("2026"), "updated year");
assert(
  formatArticleVisibleDate("not-a-date") === "",
  "invalid date is not invented",
);

const articles = listArticleDefinitions();
assert(articles.length > 0, "article registry loaded");

const practice = articles.find((article) => article.productContinuation?.kind === "practice") ?? articles[0];
const creator = articles.find((article) => article.productContinuation?.kind === "creator_paths");
const practiceDates = resolveArticleVisibleDates(practice);
assert(practiceDates, "practice article has visible published date");
assert(resolveArticleVisibleDates(creator ?? practice), "creator or practice dates resolve");

const viewSource = read("src/components/articles/ArticlePageView.tsx");
assert(viewSource.includes("Опубликовано:"), "visible published label");
assert(viewSource.includes("Обновлено:"), "visible updated label");
assert(viewSource.includes("ArticleBylineDates"), "shared date component");

const listenTypes = read("src/lib/seo/listens/types.ts");
assert(!listenTypes.includes("publishedAt"), "listen model has no publishedAt");
assert(!listenTypes.includes("updatedAt"), "listen model has no updatedAt");
const listenView = read("src/components/listens/ListenPageView.tsx");
assert(!listenView.includes("Опубликовано:"), "listen UI does not invent dates");

const innerSupport = read(
  "src/app/(platform)/program/inner-support/page.tsx",
);
assert(innerSupport.includes("PRIVATE_PAGE_ROBOTS"), "inner-support uses private robots");
assert(PRIVATE_PAGE_ROBOTS.index === false, "private robots noindex");
assert(PRIVATE_PAGE_ROBOTS.follow === false, "private robots nofollow");

const topicsData = loadTopicsDirectoryPageData();
assert(topicsData.hubs.length === listTopicHubDefinitions().length, "topics cards = registry");
const topicsMeta = buildTopicsDirectoryMetadata();
assert(topicsMeta.robots.index === true && topicsMeta.robots.follow === true, "topics index follow");
const topicsGraph = buildTopicsDirectoryJsonLdGraph(topicsData);
const collection = topicsGraph["@graph"].find((node) => node["@type"] === "CollectionPage");
assert(collection.mainEntity.numberOfItems === topicsData.hubs.length, "topics ItemList count");

const topicsOrg = topicsGraph["@graph"].find((node) => node["@type"] === "Organization");
assert(topicsOrg, "topics Organization node");
assert(
  topicsOrg["@id"] === "https://audiolad.ru/#organization",
  "topics Organization @id",
);
assert(topicsOrg.legalName, "topics Organization legalName");
assert(topicsOrg.taxID, "topics Organization taxID");
assert(
  String(topicsOrg.founder?.["@id"] ?? "").includes("/authors/sergey-petrov#author"),
  "topics Organization founder",
);
assert(!Object.hasOwn(topicsOrg, "address"), "topics Organization has no address");
const topicsOrgJson = JSON.stringify(topicsOrg);
assert(!topicsOrgJson.includes("Stavropol"), "topics Organization no Stavropol");
assert(!topicsOrgJson.includes("Ставрополь"), "topics Organization no Stavropol ru");
assert(!Object.hasOwn(topicsOrg, "sameAs"), "topics Organization has no sameAs");

const directoryJsonLdSource = read("src/lib/seo/topic-hubs/directory-json-ld.ts");
assert(
  directoryJsonLdSource.includes("buildOrganizationJsonLd"),
  "directory-json-ld uses buildOrganizationJsonLd",
);
assert(
  !directoryJsonLdSource.includes("SITE_BRAND"),
  "directory-json-ld does not use SITE_BRAND",
);

const directorySource = read("src/lib/seo/topic-hubs/directory.ts");
assert(
  directorySource.includes("Тематические подборки АудиоЛада"),
  "topics meta uses подборки",
);
assert(
  !directorySource.includes("Тематические хабы АудиоЛада"),
  "topics meta does not use хабы",
);

assert(
  STATIC_SITEMAP_PAGES.some((page) => page.path === "/topics"),
  "/topics in STATIC_SITEMAP_PAGES",
);
assert(
  !STATIC_SITEMAP_PAGES.some((page) => page.path === "/program/inner-support"),
  "inner-support stays out of sitemap",
);

const articleEntries = mapArticleDefinitionsToSitemapEntries();
assert(articleEntries.length === articles.length, "sitemap articles = registry");
const listed = loadArticleDirectoryPageData();
const directoryGraph = buildArticlesDirectoryJsonLdGraph(listed);
const directoryList = directoryGraph["@graph"].find(
  (node) => node["@type"] === "CollectionPage",
).mainEntity;
assert(
  directoryList.numberOfItems === listed.articles.length,
  "directory numberOfItems matches listed set",
);

const listenEntries = mapListenPageDefinitionsToSitemapEntries();
assert(
  listenEntries.length === listIndexableListenPageDefinitions().length,
  "listen sitemap count",
);
assert(
  listenEntries.every((entry) => !Object.hasOwn(entry, "lastModified") || entry.lastModified == null),
  "no listen lastmod",
);
const hubEntries = mapTopicHubDefinitionsToSitemapEntries();
assert(
  hubEntries.every((entry) => !Object.hasOwn(entry, "lastModified") || entry.lastModified == null),
  "no hub lastmod",
);

const sitemapSource = read("src/lib/seo/sitemap-data.ts");
assert(
  !/lastModified:\s*new Date\(\s*\)/.test(sitemapSource),
  "no build-time lastModified",
);

// JSON-LD date strings stay the editorial ISO values
const sample = articles.find((article) => article.slug);
assert(sample.publishedAt, "sample publishedAt");

console.log("geo-aeo-block2-unit: ok");
