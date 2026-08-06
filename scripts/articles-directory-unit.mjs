#!/usr/bin/env node
/**
 * Public /articles directory unit checks — no DB, no network.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARTICLES_DIRECTORY_H1,
  ARTICLES_DIRECTORY_INTRO,
  ARTICLES_DIRECTORY_META_DESCRIPTION,
  ARTICLES_DIRECTORY_PATH,
  ARTICLES_DIRECTORY_SEO_TITLE,
  buildArticlesDirectoryJsonLdGraph,
  buildArticlesDirectoryMetadata,
  buildArticlePath,
  compareArticlesByPublishedAtDesc,
  getArticleBySlug,
  isArticleDirectoryListed,
  listArticleDefinitions,
  listArticleDirectoryCards,
  listArticleDirectoryTopicHubs,
  listArticleSlugs,
  loadArticleDirectoryPageData,
  resolveArticleDirectoryDescription,
} from "../src/lib/seo/articles/index.ts";
import { listTopicHubDefinitions } from "../src/lib/seo/topic-hubs/index.ts";
import { STATIC_SITEMAP_PAGES } from "../src/lib/seo/sitemap-data.ts";
import { PUBLIC_FOOTER_LINKS } from "../src/lib/navigation/public-footer-links.ts";
import { KAK_RAZVIT_LYUBOV_K_SEBE_ARTICLE } from "../src/lib/seo/articles/content/kak-razvit-lyubov-k-sebe.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(relPath) {
  return readFileSync(join(ROOT, relPath), "utf8");
}

function testRouteExists() {
  const page = read("src/app/(platform)/(listener)/articles/page.tsx");
  assert(page.includes("ArticleDirectoryPageView"), "directory page uses view");
  assert(page.includes("loadArticleDirectoryPageData"), "directory page loads selector data");
  assert(page.includes("buildArticlesDirectoryMetadata"), "directory page sets metadata");
  assert(!page.includes("ARTICLE_DEFINITIONS"), "page does not embed a second registry");
}

function testH1AndCopy() {
  const data = loadArticleDirectoryPageData();
  assert(data.h1 === "Полезные материалы", "H1 copy");
  assert(data.h1 === ARTICLES_DIRECTORY_H1, "H1 constant");
  assert(data.intro.includes("медитациях"), "intro mentions meditations");
  assert(data.intro === ARTICLES_DIRECTORY_INTRO, "intro constant");
  assert(data.path === "/articles", "directory path");
  assert(data.path === ARTICLES_DIRECTORY_PATH, "path constant");

  const view = read("src/components/articles/ArticleDirectoryPageView.tsx");
  assert(view.includes("{data.h1}"), "view renders H1 from data");
  assert(view.includes('aria-labelledby="articles-list-heading"'), "articles section labelled");
  assert(view.includes("<ul"), "semantic article list");
}

function testMetadata() {
  const metadata = buildArticlesDirectoryMetadata();
  assert(metadata.title === ARTICLES_DIRECTORY_SEO_TITLE, "SEO title");
  assert(
    metadata.description === ARTICLES_DIRECTORY_META_DESCRIPTION,
    "meta description",
  );
  assert(
    metadata.alternates?.canonical === "https://audiolad.ru/articles",
    "self-referencing canonical",
  );
  assert(metadata.robots?.index === true, "indexable");
  assert(metadata.robots?.follow === true, "follow");
  assert(metadata.openGraph?.url === "https://audiolad.ru/articles", "OG url");
  assert(metadata.openGraph?.type === "website", "OG type website, not article");
}

function testRegistryIsSingleSource() {
  const registry = read("src/lib/seo/articles/registry.ts");
  const directory = read("src/lib/seo/articles/directory.ts");
  const page = read("src/app/(platform)/(listener)/articles/page.tsx");

  assert(registry.includes("ARTICLE_DEFINITIONS"), "central registry exists");
  assert(directory.includes("listArticleDefinitions()"), "selector reads registry");
  assert(!directory.includes("ARTICLE_DEFINITIONS ="), "selector has no second array");
  assert(!page.includes('slug: "'), "page has no hardcoded article slugs");

  const cards = listArticleDirectoryCards();
  const registrySlugs = new Set(listArticleSlugs());

  for (const card of cards) {
    assert(registrySlugs.has(card.slug), `card ${card.slug} comes from registry`);
  }

  assert(
    cards.length === listArticleDefinitions().filter(isArticleDirectoryListed).length,
    "card count matches listed registry rows",
  );
}

function testOnlyListedArticlesShown() {
  const base = getArticleBySlug("kak-razvit-lyubov-k-sebe");
  assert(base, "base article exists");

  const draft = { ...base, slug: "draft-future-article", status: "draft" };
  const noindex = {
    ...base,
    slug: "noindex-future-article",
    indexable: false,
  };
  const broken = {
    ...base,
    slug: "broken article!!",
    title: "",
    publishedAt: "not-a-date",
  };

  assert(!isArticleDirectoryListed(draft), "draft excluded");
  assert(!isArticleDirectoryListed(noindex), "noindex excluded");
  assert(!isArticleDirectoryListed(broken), "broken entry excluded");

  const cards = listArticleDirectoryCards([base, draft, noindex, broken]);
  assert(cards.length === 1, "only listed article remains");
  assert(cards[0].slug === base.slug, "listed slug preserved");
}

function testSortNewestFirst() {
  const older = {
    ...KAK_RAZVIT_LYUBOV_K_SEBE_ARTICLE,
    slug: "older-article-sort-fixture",
    publishedAt: "2026-07-01T00:00:00.000Z",
  };
  const newer = {
    ...KAK_RAZVIT_LYUBOV_K_SEBE_ARTICLE,
    slug: "newer-article-sort-fixture",
    publishedAt: "2026-07-20T00:00:00.000Z",
  };

  assert(
    compareArticlesByPublishedAtDesc(newer, older) < 0,
    "newer sorts before older",
  );

  const cards = listArticleDirectoryCards([older, newer]);
  assert(cards[0].slug === "newer-article-sort-fixture", "newest first in selector");
  assert(cards[1].slug === "older-article-sort-fixture", "older second");
}

function testNewArticleAppearsAutomatically() {
  const existing = listArticleDirectoryCards();
  const existingSlugs = new Set(existing.map((card) => card.slug));
  const synthetic = {
    ...KAK_RAZVIT_LYUBOV_K_SEBE_ARTICLE,
    slug: "auto-listed-new-article-fixture",
    title: "Новая статья для каталога",
    publishedAt: "2099-01-01T00:00:00.000Z",
    metaDescription: "Короткое описание новой статьи для проверки каталога.",
  };

  assert(!existingSlugs.has(synthetic.slug), "fixture not in production registry");

  const withNew = listArticleDirectoryCards([
    ...listArticleDefinitions(),
    synthetic,
  ]);

  assert(
    withNew.some((card) => card.slug === synthetic.slug),
    "new published registry article appears automatically",
  );
  assert(withNew[0].slug === synthetic.slug, "newest synthetic article sorts first");
  assert(
    withNew.length === existing.length + 1,
    "selector grows without page edits",
  );
}

function testCardsHaveValidHrefsAndNoDuplicateSlugs() {
  const cards = listArticleDirectoryCards();
  assert(cards.length >= 1, "at least one published article");

  const seen = new Set();

  for (const card of cards) {
    assert(card.href === buildArticlePath(card.slug), `href for ${card.slug}`);
    assert(card.href.startsWith("/articles/"), `public href for ${card.slug}`);
    assert(card.title.trim().length > 0, `title for ${card.slug}`);
    assert(card.description.trim().length > 0, `description for ${card.slug}`);
    assert(card.readingTimeMinutes >= 1, `reading time for ${card.slug}`);
    assert(!seen.has(card.slug), `no duplicate slug ${card.slug}`);
    seen.add(card.slug);
  }
}

function testDescriptionFallback() {
  const withMeta = resolveArticleDirectoryDescription({
    title: "Заголовок",
    metaDescription: "Мета описание статьи.",
    shortAnswer: "Короткий ответ длиннее и не должен выиграть.",
    leadBeforeAudio: "Лид.",
  });
  assert(withMeta === "Мета описание статьи.", "metaDescription preferred");

  const withShort = resolveArticleDirectoryDescription({
    title: "Заголовок",
    metaDescription: "   ",
    shortAnswer: "Короткий подходящий ответ.",
    leadBeforeAudio: "Лид не нужен.",
  });
  assert(withShort === "Короткий подходящий ответ.", "shortAnswer fallback");

  const withLead = resolveArticleDirectoryDescription({
    title: "Заголовок",
    metaDescription: "",
    shortAnswer: "A".repeat(300),
    leadBeforeAudio:
      "Это достаточно длинный лид статьи, который должен стать безопасным fallback описанием карточки без полного текста.",
  });
  assert(withLead.includes("длинный лид"), "lead fallback used");
  assert(withLead.length < 200, "lead fallback truncated");
  assert(!withLead.includes("A".repeat(50)), "oversized shortAnswer skipped");

  const titleOnly = resolveArticleDirectoryDescription({
    title: "Только заголовок",
    metaDescription: "",
    shortAnswer: "",
    leadBeforeAudio: "",
  });
  assert(
    titleOnly.includes("Только заголовок"),
    "title-based safe fallback",
  );
}

function testTopicHubsFromRegistry() {
  const hubs = listArticleDirectoryTopicHubs();
  const registrySlugs = new Set(
    listTopicHubDefinitions().map((hub) => hub.slug),
  );

  assert(hubs.length === listTopicHubDefinitions().length, "all public hubs listed");

  for (const hub of hubs) {
    assert(registrySlugs.has(hub.slug), `hub ${hub.slug} from registry`);
    assert(hub.href === `/topics/${hub.slug}`, `hub href ${hub.slug}`);
    assert(hub.title.trim().length > 0, `hub title ${hub.slug}`);
  }

  const pageSource = read("src/components/articles/ArticleDirectoryPageView.tsx");
  assert(pageSource.includes("Темы"), "topics block heading");
  assert(!pageSource.includes("Популярные темы"), "no false popularity claim");
}

function testFooterContainsArticlesOnce() {
  const footer = read("src/components/LegalFooter.tsx");
  assert(footer.includes("PUBLIC_FOOTER_LINKS"), "footer uses public links module");
  assert(footer.includes('aria-label="Разделы платформы"'), "public nav label");

  const articlesLinks = PUBLIC_FOOTER_LINKS.filter(
    (item) => item.href === "/articles",
  );
  assert(articlesLinks.length === 1, "exactly one /articles footer link");
  assert(articlesLinks[0].title === "Статьи", "footer label Статьи");

  const helpLinks = PUBLIC_FOOTER_LINKS.filter((item) => item.href === "/help");
  assert(helpLinks.length === 1, "exactly one /help footer link");
  assert(
    helpLinks[0].title === "Помощь и поддержка",
    "footer label Помощь и поддержка",
  );
  assert(
    PUBLIC_FOOTER_LINKS.findIndex((item) => item.href === "/for-authors") <
      PUBLIC_FOOTER_LINKS.findIndex((item) => item.href === "/articles") &&
      PUBLIC_FOOTER_LINKS.findIndex((item) => item.href === "/articles") <
        PUBLIC_FOOTER_LINKS.findIndex((item) => item.href === "/help"),
    "footer order keeps for-authors before articles before help",
  );

  const hrefs = PUBLIC_FOOTER_LINKS.map((item) => item.href);
  assert(new Set(hrefs).size === hrefs.length, "no duplicate footer hrefs");

  const matches = footer.match(/\/articles/g) ?? [];
  assert(matches.length === 0, "LegalFooter has no hardcoded /articles string");
}

function testSitemapContainsDirectory() {
  assert(
    STATIC_SITEMAP_PAGES.some((page) => page.path === "/articles"),
    "/articles in STATIC_SITEMAP_PAGES",
  );

  const sitemapSource = read("src/lib/seo/sitemap-data.ts");
  const articlesStaticCount = (sitemapSource.match(/path: "\/articles"/g) ?? [])
    .length;
  assert(articlesStaticCount === 1, "no duplicate /articles static sitemap entry");
}

function testStructuredData() {
  const data = loadArticleDirectoryPageData();
  const graph = buildArticlesDirectoryJsonLdGraph(data);
  assert(graph["@context"] === "https://schema.org", "schema context");

  const nodes = graph["@graph"];
  assert(Array.isArray(nodes), "graph array");

  const collection = nodes.find((node) => node["@type"] === "CollectionPage");
  assert(collection, "CollectionPage present");
  assert(collection.url === "https://audiolad.ru/articles", "collection url");

  const itemList = collection.mainEntity;
  assert(itemList?.["@type"] === "ItemList", "ItemList present");
  assert(
    itemList.numberOfItems === data.articles.length,
    "ItemList count matches visible cards",
  );
  assert(
    itemList.itemListElement.length === data.articles.length,
    "ItemList elements match visible cards",
  );

  for (const [index, item] of itemList.itemListElement.entries()) {
    assert(item.position === index + 1, `ItemList position ${index + 1}`);
    assert(
      item.url === `https://audiolad.ru${data.articles[index].href}`,
      `ItemList url ${index + 1}`,
    );
    assert(item.name === data.articles[index].title, `ItemList name ${index + 1}`);
  }

  const breadcrumbs = nodes.find((node) => node["@type"] === "BreadcrumbList");
  assert(breadcrumbs, "BreadcrumbList present");
  assert(
    !nodes.some((node) => node["@type"] === "Article"),
    "no Article schema on directory page",
  );
}

function testEmptyState() {
  const empty = loadArticleDirectoryPageData([], listTopicHubDefinitions());
  assert(empty.articles.length === 0, "empty articles");
  assert(empty.hubs.length > 0, "hubs still available when articles empty");

  const view = read("src/components/articles/ArticleDirectoryPageView.tsx");
  assert(view.includes("опубликованных материалов ещё нет"), "empty state copy");
}

function testIndividualArticlesStillWork() {
  assert(
    getArticleBySlug("kak-razvit-lyubov-k-sebe")?.title.includes("любовь к себе"),
    "individual article still resolvable",
  );
  assert(
    listArticleSlugs().includes("kak-privlech-dengi-v-svoyu-zhizn"),
    "latest known article still registered",
  );

  const articlePage = read("src/app/(platform)/(listener)/articles/[slug]/page.tsx");
  assert(articlePage.includes("ArticlePageView"), "article detail route intact");
}

const tests = [
  ["route exists", testRouteExists],
  ["H1 and copy", testH1AndCopy],
  ["metadata", testMetadata],
  ["registry single source", testRegistryIsSingleSource],
  ["only listed articles", testOnlyListedArticlesShown],
  ["sort newest first", testSortNewestFirst],
  ["new article auto-listed", testNewArticleAppearsAutomatically],
  ["cards hrefs and unique slugs", testCardsHaveValidHrefsAndNoDuplicateSlugs],
  ["description fallback", testDescriptionFallback],
  ["topic hubs from registry", testTopicHubsFromRegistry],
  ["footer /articles once", testFooterContainsArticlesOnce],
  ["sitemap /articles", testSitemapContainsDirectory],
  ["structured data", testStructuredData],
  ["empty state", testEmptyState],
  ["individual articles still work", testIndividualArticlesStillWork],
];

let failed = 0;

for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`fail - ${name}: ${error instanceof Error ? error.message : error}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} articles-directory test(s) failed`);
  process.exit(1);
}

console.log(`\n${tests.length} articles-directory tests passed`);
