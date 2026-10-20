#!/usr/bin/env node
/**
 * /articles: standalone neuromusic guides in the directory + client search helpers.
 * No DB, no network.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ARTICLE_SEARCH_PARAM,
  ARTICLE_SEARCH_QUERY_MAX_LENGTH,
  NEUROMUSIC_TOPIC_TITLE,
  buildArticleSearchHref,
  buildArticlesDirectoryJsonLdGraph,
  buildArticlesDirectoryMetadata,
  filterArticleDirectoryCards,
  formatArticleSearchCountLabel,
  isStandaloneArticleDirectoryListed,
  listArticleDefinitions,
  listArticleDirectoryCards,
  listStandaloneArticleDefinitions,
  listStandaloneArticleDirectoryCards,
  loadArticleDirectoryPageData,
  normalizeArticleSearchText,
  resolveArticleSearchUrlSync,
  sanitizeArticleSearchQuery,
  tokenizeArticleSearchQuery,
} from "../src/lib/seo/articles/index.ts";
import { listTopicHubDefinitions } from "../src/lib/seo/topic-hubs/index.ts";
import { STATIC_SITEMAP_PAGES } from "../src/lib/seo/sitemap-data.ts";
import * as suno from "../src/lib/seo/kak-sozdat-muzyku-v-suno/content.ts";
import * as mozhnoLi from "../src/lib/seo/mozhno-li-zarabotat-na-ii-muzyke/content.ts";
import { AI_MUSIC_HUB_PATH } from "../src/lib/seo/ai-music-hub/content.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(join(root, relativePath), "utf8");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const EXPECTED_NEUROMUSIC_PATHS = [
  "/distribyutor-ii-muzyki",
  "/kak-sozdat-ii-muzyku",
  "/kak-vylozhit-ii-muzyku",
  "/v-kakoy-neyroseti-sozdat-muzyku",
  "/kak-sozdat-muzyku-v-suno",
  "/kak-sozdat-pesnyu-s-pomoshchyu-ii",
  "/kak-sozdat-muzyku-po-tekstu-s-pomoshchyu-ii",
  "/kak-sozdat-fonovuyu-muzyku-s-pomoshchyu-ii",
  "/kak-prodat-muzyku-sozdannuyu-ii",
  "/mozhno-li-zarabotat-na-ii-muzyke",
  "/kuda-vykladyvat-muzyku-iz-suno",
  "/kak-zarabotat-na-muzyke-iz-suno",
];

function testNeuromusicGuidesListed() {
  const data = loadArticleDirectoryPageData();
  const hrefs = new Set(data.articles.map((card) => card.href));

  for (const path of EXPECTED_NEUROMUSIC_PATHS) {
    assert(hrefs.has(path), `${path} listed in /articles`);
    assert(!hrefs.has(`/articles${path}`), `${path} not rewritten under /articles`);
  }

  const standalone = listStandaloneArticleDirectoryCards();
  assert(
    standalone.length === EXPECTED_NEUROMUSIC_PATHS.length,
    `exactly ${EXPECTED_NEUROMUSIC_PATHS.length} standalone guides (got ${standalone.length})`,
  );

  for (const card of standalone) {
    assert(card.topicTitle === NEUROMUSIC_TOPIC_TITLE, `${card.href} topic Нейромузыка`);
    assert(card.topicHref === null, `${card.href} no invented topic hub link`);
    assert(card.readingTimeMinutes >= 1, `${card.href} reading time`);
    assert(card.description.length > 40, `${card.href} description`);
    assert(/^\d{4}-\d{2}-\d{2}/.test(card.publishedAt ?? ""), `${card.href} publishedAt`);
  }
}

function testTitlesComeFromPageContent() {
  const cards = listStandaloneArticleDirectoryCards();
  const sunoCard = cards.find((card) => card.href === suno.KAK_SOZDAT_MUZYKU_V_SUNO_PATH);
  assert(sunoCard, "suno guide present");
  assert(sunoCard.title === suno.KAK_SOZDAT_MUZYKU_V_SUNO_PAGE_H1, "suno title = page H1");
  assert(
    sunoCard.description === suno.KAK_SOZDAT_MUZYKU_V_SUNO_SEO_DESCRIPTION,
    "suno description = page meta description",
  );
  assert(
    sunoCard.publishedAt === suno.KAK_SOZDAT_MUZYKU_V_SUNO_DATE_PUBLISHED,
    "suno date = page datePublished",
  );

  const mozhnoCard = cards.find(
    (card) => card.href === mozhnoLi.MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_PATH,
  );
  assert(
    mozhnoCard?.title === mozhnoLi.MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_PAGE_H1,
    "monetisation guide title = page H1",
  );
}

function testNoindexHubNotListed() {
  const data = loadArticleDirectoryPageData();
  assert(
    !data.articles.some((card) => card.href === AI_MUSIC_HUB_PATH),
    "noindex production-test hub stays out of /articles",
  );
  assert(
    !isStandaloneArticleDirectoryListed({
      ...listStandaloneArticleDefinitions()[0],
      indexable: false,
    }),
    "indexable:false excluded",
  );
  assert(
    !isStandaloneArticleDirectoryListed({
      ...listStandaloneArticleDefinitions()[0],
      publishedAt: "not-a-date",
    }),
    "broken date excluded",
  );
  assert(
    !isStandaloneArticleDirectoryListed({
      ...listStandaloneArticleDefinitions()[0],
      path: "/articles",
    }),
    "directory path itself excluded",
  );
}

function testRoutesAndSitemap() {
  const sitemapPaths = new Set(STATIC_SITEMAP_PAGES.map((page) => page.path));

  for (const def of listStandaloneArticleDefinitions()) {
    assert(sitemapPaths.has(def.path), `${def.path} in sitemap`);
    assert(
      existsSync(join(root, "src/app/(platform)/(listener)", def.path.slice(1), "page.tsx")),
      `${def.path} has an app route`,
    );
  }
}

function testDateSortedWithRegistryArticles() {
  const data = loadArticleDirectoryPageData();
  const dated = data.articles.filter((card) => card.publishedAt);
  const datedCount = listArticleDirectoryCards().length + listStandaloneArticleDirectoryCards().length;

  assert(dated.length === datedCount, "all dated cards present once");

  for (let index = 1; index < dated.length; index += 1) {
    assert(
      Date.parse(dated[index - 1].publishedAt) >= Date.parse(dated[index].publishedAt),
      `newest first at ${index}`,
    );
  }

  const firstUndated = data.articles.findIndex((card) => !card.publishedAt);
  assert(
    firstUndated === -1 || data.articles.slice(firstUndated).every((card) => !card.publishedAt),
    "listen pages (undated) still follow dated articles",
  );

  const hrefs = data.articles.map((card) => card.href);
  assert(new Set(hrefs).size === hrefs.length, "no duplicate hrefs");
}

function testEmptyStandaloneKeepsOldBehaviour() {
  const withoutStandalone = loadArticleDirectoryPageData(
    listArticleDefinitions(),
    listTopicHubDefinitions(),
    [],
    [],
  );
  const registryCards = listArticleDirectoryCards();
  assert(
    withoutStandalone.articles.map((card) => card.href).join("|") ===
      registryCards.map((card) => card.href).join("|"),
    "no standalone → registry order unchanged",
  );
}

function testJsonLdIncludesGuides() {
  const data = loadArticleDirectoryPageData();
  const graph = buildArticlesDirectoryJsonLdGraph(data);
  const collection = graph["@graph"].find((node) => node["@type"] === "CollectionPage");
  const urls = new Set(collection.mainEntity.itemListElement.map((item) => item.url));

  for (const path of EXPECTED_NEUROMUSIC_PATHS) {
    assert(urls.has(`https://audiolad.ru${path}`), `ItemList has ${path}`);
  }
}

function testNormalizeAndTokenize() {
  assert(normalizeArticleSearchText("ЁЛКА Ёж") === "елка еж", "ё → е, lowercase");
  assert(normalizeArticleSearchText("ИИ-музыка, Suno!") === "ии музыка suno", "punctuation → space");
  assert(normalizeArticleSearchText("ИИ–музыка") === "ии музыка", "en dash → space");
  assert(tokenizeArticleSearchQuery("  ").length === 0, "blank query → no tokens");
  assert(
    tokenizeArticleSearchQuery("Суно  суно ПЕСНЯ").join(",") === "суно,песня",
    "dedup + lowercase tokens",
  );
  assert(sanitizeArticleSearchQuery(["a", "b"]) === "a", "array param → first");
  assert(sanitizeArticleSearchQuery(undefined) === "", "missing param → empty");
  assert(
    sanitizeArticleSearchQuery("x".repeat(500)).length === ARTICLE_SEARCH_QUERY_MAX_LENGTH,
    "query clamped",
  );
}

function testFilterSemantics() {
  const cards = [
    {
      title: "Как создать песню с помощью ИИ",
      description: "Музыка, текст и вокал.",
      topicTitle: "Нейромузыка",
      searchKeywords: ["Песня с ИИ"],
    },
    {
      title: "Медитация на деньги",
      description: "Как работать с вниманием и денежным настроем.",
      topicTitle: "Деньги",
      searchKeywords: ["Медитация на деньги и изобилие"],
    },
    {
      title: "Как перестать злиться",
      description: "Про обиду и ёмкие практики.",
      topicTitle: null,
    },
  ];

  assert(filterArticleDirectoryCards(cards, "").length === 3, "empty → all");
  assert(filterArticleDirectoryCards(cards, "ПЕСНЮ").length === 1, "case-insensitive");
  assert(filterArticleDirectoryCards(cards, "емкие").length === 1, "е matches ё");
  assert(filterArticleDirectoryCards(cards, "ёмкие").length === 1, "ё matches ё");
  assert(filterArticleDirectoryCards(cards, "вокал").length === 1, "matches description");
  assert(filterArticleDirectoryCards(cards, "нейромузыка").length === 1, "matches topic");
  assert(filterArticleDirectoryCards(cards, "изобилие").length === 1, "matches keywords");
  assert(filterArticleDirectoryCards(cards, "как деньги").length === 1, "multi-word AND");
  assert(filterArticleDirectoryCards(cards, "песню деньги").length === 0, "AND, not OR");
  assert(filterArticleDirectoryCards(cards, "ии песн").length === 1, "hyphen-insensitive");
  assert(filterArticleDirectoryCards(cards, "zzz").length === 0, "no match → empty");
}

function testSearchFindsRealGuides() {
  const data = loadArticleDirectoryPageData();
  const neuro = filterArticleDirectoryCards(data.articles, "нейромузыка");
  for (const path of EXPECTED_NEUROMUSIC_PATHS) {
    assert(neuro.some((card) => card.href === path), `«нейромузыка» finds ${path}`);
  }
  const sunoHits = filterArticleDirectoryCards(data.articles, "суно заработать");
  assert(
    sunoHits.some((card) => card.href === "/kak-zarabotat-na-muzyke-iz-suno"),
    "multi-word query finds suno monetisation guide",
  );
  const all = filterArticleDirectoryCards(data.articles, "   ");
  assert(all.length === data.articles.length, "blank query keeps full list");
}

function testCountLabelAndHref() {
  assert(formatArticleSearchCountLabel(0, 120, false) === "120 материалов", "total label");
  assert(formatArticleSearchCountLabel(1, 121, true) === "Найдено: 1 материал из 121", "1 материал");
  assert(formatArticleSearchCountLabel(3, 120, true) === "Найдено: 3 материала из 120", "3 материала");
  assert(formatArticleSearchCountLabel(12, 120, true) === "Найдено: 12 материалов из 120", "12 материалов");
  assert(formatArticleSearchCountLabel(22, 120, true) === "Найдено: 22 материала из 120", "22 материала");

  assert(buildArticleSearchHref("/articles", "", "") === "/articles", "empty → bare path");
  assert(
    buildArticleSearchHref("/articles", "", "  суно  песня ") ===
      `/articles?${ARTICLE_SEARCH_PARAM}=%D1%81%D1%83%D0%BD%D0%BE+%D0%BF%D0%B5%D1%81%D0%BD%D1%8F`,
    "query encoded into ?q=",
  );
  assert(
    buildArticleSearchHref("/articles", "?q=old&utm_source=x", "") === "/articles?utm_source=x",
    "clearing keeps other params",
  );
}

function testMetadataForSearchUrls() {
  const plain = buildArticlesDirectoryMetadata();
  assert(plain.robots?.index === true, "plain /articles indexable");
  const searched = buildArticlesDirectoryMetadata({ hasSearchQuery: true });
  assert(searched.robots?.index === false, "?q= noindex");
  assert(searched.robots?.follow === true, "?q= follow");
  assert(
    searched.alternates?.canonical === "https://audiolad.ru/articles",
    "?q= canonical stays /articles",
  );
}

function testComponentsWiring() {
  const page = read("src/app/(platform)/(listener)/articles/page.tsx");
  assert(page.includes("searchParams"), "page reads searchParams");
  assert(page.includes("ARTICLE_SEARCH_PARAM"), "page uses ?q= constant");

  const view = read("src/components/articles/ArticleDirectoryPageView.tsx");
  assert(view.includes("<ArticleDirectorySearch"), "view renders search");
  assert(view.includes("articles={data.articles}"), "search gets the full list");

  const search = read("src/components/articles/ArticleDirectorySearch.tsx");
  assert(search.startsWith('"use client";'), "search is a client component");
  assert(search.includes('role="search"'), "search landmark");
  assert(search.includes("<label"), "accessible label");
  assert(search.includes("htmlFor={inputId}"), "label bound to input");
  assert(search.includes('method="get"'), "no-JS GET fallback");
  assert(search.includes('aria-live="polite"'), "count announced");
  assert(search.includes("Ничего не нашлось"), "empty state copy");
  assert(search.includes("Сбросить поиск"), "clear button copy");
  assert(search.includes("history.replaceState"), "query mirrored to URL");
  assert(!search.includes('from "@/lib/seo/articles"'), "client does not import registry barrel");

  const cardLink = read("src/components/articles/ArticleDirectoryCardLink.tsx");
  assert(!cardLink.includes('from "@/lib/seo/articles"'), "card link avoids registry barrel");

  for (const file of [
    "src/components/articles/ArticleDirectorySearch.tsx",
    "src/components/articles/ArticleDirectoryCardLink.tsx",
    "src/lib/seo/articles/directory-search.ts",
    "src/lib/seo/articles/standalone.ts",
  ]) {
    assert(!read(file).includes("\u2014"), `${file} has no em dash`);
  }
}

function testUrlSync() {
  // Own replaceState echo is ignored even if the user already typed further.
  assert(
    resolveArticleSearchUrlSync({ urlQuery: "суно", lastWrittenQuery: "суно", currentQuery: "суно пес" }) === null,
    "own write ignored",
  );
  // Link to bare /articles while a query is typed → reset.
  assert(
    resolveArticleSearchUrlSync({ urlQuery: "", lastWrittenQuery: "суно", currentQuery: "суно" }) === "",
    "navigation to /articles clears the query",
  );
  // Back/Forward or shared link with another ?q= → adopt it.
  assert(
    resolveArticleSearchUrlSync({ urlQuery: "деньги", lastWrittenQuery: null, currentQuery: "" }) === "деньги",
    "external ?q= adopted",
  );
  // Same value (modulo whitespace) → keep input as typed.
  assert(
    resolveArticleSearchUrlSync({ urlQuery: "суно", lastWrittenQuery: null, currentQuery: "суно " }) === null,
    "equal query keeps input",
  );
}

async function testServerRenderedSearch() {
  const React = await import("react");
  const { renderToString } = await import("react-dom/server");
  const { default: ArticleDirectorySearch } = await import(
    "../src/components/articles/ArticleDirectorySearch.tsx"
  );
  const articles = loadArticleDirectoryPageData().articles;

  const full = renderToString(
    React.createElement(ArticleDirectorySearch, { articles, initialQuery: "", action: "/articles" }),
  );
  const fullItems = (full.match(/<li/g) ?? []).length;
  assert(fullItems === articles.length, `SSR without q renders the full list (${fullItems})`);
  assert(full.includes('href="/kak-sozdat-muzyku-v-suno"'), "SSR full list has neuromusic guide");
  assert(full.includes('method="get"') && full.includes('name="q"'), "no-JS GET form");

  const filtered = renderToString(
    React.createElement(ArticleDirectorySearch, {
      articles,
      initialQuery: "НЕЙРОМУЗЫКА",
      action: "/articles",
    }),
  );
  assert((filtered.match(/<li/g) ?? []).length === 12, "SSR with ?q= renders the filtered list");

  const empty = renderToString(
    React.createElement(ArticleDirectorySearch, {
      articles,
      initialQuery: "zzzqqq",
      action: "/articles",
    }),
  );
  assert(empty.includes("Ничего не нашлось"), "SSR empty state");
  assert(empty.includes('href="/articles"'), "no-JS reset link");

  const xss = renderToString(
    React.createElement(ArticleDirectorySearch, {
      articles,
      initialQuery: '"><script>alert(1)</script>',
      action: "/articles",
    }),
  );
  assert(!xss.includes("<script>alert(1)</script>"), "query is escaped");
}

const tests = [
  ["neuromusic guides listed", testNeuromusicGuidesListed],
  ["titles from page content", testTitlesComeFromPageContent],
  ["noindex hub not listed", testNoindexHubNotListed],
  ["routes and sitemap", testRoutesAndSitemap],
  ["date sort with registry", testDateSortedWithRegistryArticles],
  ["empty standalone keeps old behaviour", testEmptyStandaloneKeepsOldBehaviour],
  ["JSON-LD includes guides", testJsonLdIncludesGuides],
  ["normalize and tokenize", testNormalizeAndTokenize],
  ["filter semantics", testFilterSemantics],
  ["search finds real guides", testSearchFindsRealGuides],
  ["count label and href", testCountLabelAndHref],
  ["metadata for search urls", testMetadataForSearchUrls],
  ["components wiring", testComponentsWiring],
  ["url sync", testUrlSync],
  ["server-rendered search", testServerRenderedSearch],
];

let failed = 0;

for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`fail - ${name}: ${error instanceof Error ? error.message : error}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} articles-directory-search test(s) failed`);
  process.exit(1);
}

console.log(`\n${tests.length} articles-directory-search tests passed`);
