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
  listListenDirectoryCards,
  listArticleSlugs,
  loadArticleDirectoryPageData,
  resolveArticleDirectoryDescription,
} from "../src/lib/seo/articles/index.ts";
import { listIndexableListenPageDefinitions } from "../src/lib/seo/listens/index.ts";
import { DENEZHNAYA_MEDITATSIYA_SLUSHAT_ONLAYN_BESPLATNO_PAGE } from "../src/lib/seo/listens/content/denezhnaya-meditatsiya-slushat-onlayn-besplatno.ts";
import { MEDITATSIYA_NA_DENGI_SLUSHAT_ONLAYN_BESPLATNO_PAGE } from "../src/lib/seo/listens/content/meditatsiya-na-dengi-slushat-onlayn-besplatno.ts";
import { MEDITATSIYA_NA_BOGATSTVO_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/meditatsiya-na-bogatstvo-slushat-onlayn.ts";
import { MEDITATSIYA_NA_IZOBILIE_SLUSHAT_ONLAYN_BESPLATNO_PAGE } from "../src/lib/seo/listens/content/meditatsiya-na-izobilie-slushat-onlayn-besplatno.ts";
import { MEDITATSIYA_DLYA_PRIVLECHENIYA_DENEG_BOGATSTVA_I_IZOBILIYA_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-privlecheniya-deneg-bogatstva-i-izobiliya.ts";
import { MEDITATSIYA_NA_DENEZHNYY_POTOK_SLUSHAT_ONLAYN_BESPLATNO_PAGE } from "../src/lib/seo/listens/content/meditatsiya-na-denezhnyy-potok-slushat-onlayn-besplatno.ts";
import { MEDITATSIYA_DLYA_DENEG_I_IZOBILIYA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-deneg-i-izobiliya-slushat-onlayn.ts";
import { MEDITATSIYA_NA_DENGI_I_IZOBILIE_DLYA_ZHENSHCHIN_PAGE } from "../src/lib/seo/listens/content/meditatsiya-na-dengi-i-izobilie-dlya-zhenshchin.ts";
import { UTRENNYAYA_MEDITATSIYA_NA_DENGI_I_IZOBILIE_PAGE } from "../src/lib/seo/listens/content/utrennyaya-meditatsiya-na-dengi-i-izobilie.ts";
import { MEDITATSIYA_IZOBILIYA_I_BOGATSTVA_DLYA_SNA_PAGE } from "../src/lib/seo/listens/content/meditatsiya-izobiliya-i-bogatstva-dlya-sna.ts";
import { SHUM_VODY_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/shum-vody-slushat-onlayn.ts";
import { ZHURCHANIE_VODY_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/zhurchanie-vody-slushat-onlayn.ts";
import { ZVUK_VODOPADA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/zvuk-vodopada-slushat-onlayn.ts";
import { ZVUK_RUCHYA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/zvuk-ruchya-slushat-onlayn.ts";
import { SHUM_VODY_DLYA_SNA_PAGE } from "../src/lib/seo/listens/content/shum-vody-dlya-sna.ts";
import { ZVUK_LYUSHCHEYSYA_VODY_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/zvuk-lyushcheysya-vody-slushat-onlayn.ts";
import { BELYY_SHUM_VODY_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/belyy-shum-vody-slushat-onlayn.ts";
import { SHUM_VODY_DLYA_DETEY_PAGE } from "../src/lib/seo/listens/content/shum-vody-dlya-detey.ts";
import { SHUM_VODY_DLYA_NOVOROZHDENNYH_PAGE } from "../src/lib/seo/listens/content/shum-vody-dlya-novorozhdennyh.ts";
import { SHUM_VODY_IZ_KRANA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/shum-vody-iz-krana-slushat-onlayn.ts";
import { MUZYKA_DLYA_SNA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/muzyka-dlya-sna-slushat-onlayn.ts";
import { USPOKAIVAYUSHCHAYA_MUZYKA_DLYA_SNA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/uspokaivayushchaya-muzyka-dlya-sna-slushat-onlayn.ts";
import { USYPLYAYUSHCHAYA_MUZYKA_DLYA_SNA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/usyplyayushchaya-muzyka-dlya-sna-slushat-onlayn.ts";
import { MUZYKA_DLYA_SNA_BEZ_SLOV_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/muzyka-dlya-sna-bez-slov-slushat-onlayn.ts";
import { MEDITATSIYA_DLYA_SNA_SLUSHAT_ONLAYN_BESPLATNO_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-sna-slushat-onlayn-besplatno.ts";
import { MEDITATSIYA_PERED_SNOM_SLUSHAT_ONLAYN_BESPLATNO_PAGE } from "../src/lib/seo/listens/content/meditatsiya-pered-snom-slushat-onlayn-besplatno.ts";
import { MEDITATSIYA_DLYA_SNA_I_RASSLABLENIYA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-sna-i-rasslableniya-slushat-onlayn.ts";
import { MEDITATSIYA_DLYA_GLUBOKOGO_SNA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-glubokogo-sna-slushat-onlayn.ts";
import { MEDITATSIYA_NA_NOCH_SLUSHAT_PERED_SNOM_PAGE } from "../src/lib/seo/listens/content/meditatsiya-na-noch-slushat-pered-snom.ts";
import { MEDITATSIYA_DLYA_HOROSHEGO_I_SPOKOYNOGO_SNA_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-horoshego-i-spokoynogo-sna.ts";
import { MEDITATSIYA_DLYA_SNA_S_GOLOSOM_SLUSHAT_BESPLATNO_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-sna-s-golosom-slushat-besplatno.ts";
import { MEDITATSIYA_DLYA_SNA_BEZ_GOLOSA_SLUSHAT_ONLAYN_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-sna-bez-golosa-slushat-onlayn.ts";
import { MEDITATSIYA_DLYA_SNA_BEZ_REKLAMY_SLUSHAT_BESPLATNO_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-sna-bez-reklamy-slushat-besplatno.ts";
import { MEDITATSIYA_DLYA_SNA_I_USPOKOENIYA_NERVNOY_SISTEMY_PAGE } from "../src/lib/seo/listens/content/meditatsiya-dlya-sna-i-uspokoeniya-nervnoy-sistemy.ts";
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
  assert(
    directory.includes("listIndexableListenPageDefinitions()"),
    "selector reads listen registry",
  );
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
    itemList.numberOfItems !== 123 || data.articles.length === 123,
    "numberOfItems is not a stale hardcoded 123",
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

function testListenPagesAppearInDirectory() {
  const data = loadArticleDirectoryPageData();
  const listenHref = "/listens/meditatsiya-na-dengi-slushat-onlayn-besplatno";
  const listenCard = data.articles.find((card) => card.href === listenHref);

  assert(listenCard, "indexable listen page is listed");
  assert(
    listenCard.title === "Медитация на деньги: слушать онлайн бесплатно",
    "listen directory title",
  );
  assert(
    listenCard.description === MEDITATSIYA_NA_DENGI_SLUSHAT_ONLAYN_BESPLATNO_PAGE.description,
    "listen directory description",
  );
  assert(listenCard.topicTitle === null, "listen has no invented topic");
  assert(listenCard.publishedAt == null, "listen has no invented publishedAt");
  assert(listenCard.readingTimeMinutes >= 1, "listen reading time from content");
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-na-dengi-slushat-onlayn-besplatno",
    ),
    "no /articles duplicate for listen slug",
  );

  const graph = buildArticlesDirectoryJsonLdGraph(data);
  const collection = graph["@graph"].find((node) => node["@type"] === "CollectionPage");
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${listenHref}`,
    ),
    "directory JSON-LD uses listen href",
  );
  assert(
    !collection.mainEntity.itemListElement.some((item) =>
      item.url.endsWith("/articles/meditatsiya-na-dengi-slushat-onlayn-besplatno"),
    ),
    "directory JSON-LD has no /articles listen duplicate",
  );

  const secondListenHref = "/listens/denezhnaya-meditatsiya-slushat-onlayn-besplatno";
  const secondListenCard = data.articles.find((card) => card.href === secondListenHref);
  assert(secondListenCard, "second indexable listen page is listed");
  assert(
    secondListenCard.title === "Денежная медитация: слушать онлайн бесплатно",
    "second listen directory title",
  );
  assert(
    secondListenCard.description === DENEZHNAYA_MEDITATSIYA_SLUSHAT_ONLAYN_BESPLATNO_PAGE.description,
    "second listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/denezhnaya-meditatsiya-slushat-onlayn-besplatno",
    ),
    "no /articles duplicate for second listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${secondListenHref}`,
    ),
    "directory JSON-LD includes second listen href",
  );

  const thirdListenHref = "/listens/meditatsiya-na-izobilie-slushat-onlayn-besplatno";
  const thirdListenCard = data.articles.find((card) => card.href === thirdListenHref);
  assert(thirdListenCard, "third indexable listen page is listed");
  assert(
    thirdListenCard.title === "Медитация на изобилие: слушать онлайн бесплатно",
    "third listen directory title",
  );
  assert(
    thirdListenCard.description === MEDITATSIYA_NA_IZOBILIE_SLUSHAT_ONLAYN_BESPLATNO_PAGE.description,
    "third listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-na-izobilie-slushat-onlayn-besplatno",
    ),
    "no /articles duplicate for third listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${thirdListenHref}`,
    ),
    "directory JSON-LD includes third listen href",
  );

  const fourthListenHref = "/listens/meditatsiya-na-bogatstvo-slushat-onlayn";
  const fourthListenCard = data.articles.find((card) => card.href === fourthListenHref);
  assert(fourthListenCard, "fourth indexable listen page is listed");
  assert(
    fourthListenCard.title === "Медитация на богатство: слушать онлайн | АудиоЛад",
    "fourth listen directory title",
  );
  assert(
    fourthListenCard.description === MEDITATSIYA_NA_BOGATSTVO_SLUSHAT_ONLAYN_PAGE.description,
    "fourth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-na-bogatstvo-slushat-onlayn",
    ),
    "no /articles duplicate for fourth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fourthListenHref}`,
    ),
    "directory JSON-LD includes fourth listen href",
  );

  const fifthListenHref = "/listens/meditatsiya-dlya-privlecheniya-deneg-bogatstva-i-izobiliya";
  const fifthListenCard = data.articles.find((card) => card.href === fifthListenHref);
  assert(fifthListenCard, "fifth indexable listen page is listed");
  assert(
    fifthListenCard.title === "Медитация для привлечения денег, богатства и изобилия | АудиоЛад",
    "fifth listen directory title",
  );
  assert(
    fifthListenCard.description === MEDITATSIYA_DLYA_PRIVLECHENIYA_DENEG_BOGATSTVA_I_IZOBILIYA_PAGE.description,
    "fifth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-dlya-privlecheniya-deneg-bogatstva-i-izobiliya",
    ),
    "no /articles duplicate for fifth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fifthListenHref}`,
    ),
    "directory JSON-LD includes fifth listen href",
  );

  const sixthListenHref = "/listens/meditatsiya-na-denezhnyy-potok-slushat-onlayn-besplatno";
  const sixthListenCard = data.articles.find((card) => card.href === sixthListenHref);
  assert(sixthListenCard, "sixth indexable listen page is listed");
  assert(
    sixthListenCard.title === "Медитация на денежный поток: слушать онлайн бесплатно | АудиоЛад",
    "sixth listen directory title",
  );
  assert(
    sixthListenCard.description === MEDITATSIYA_NA_DENEZHNYY_POTOK_SLUSHAT_ONLAYN_BESPLATNO_PAGE.description,
    "sixth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-na-denezhnyy-potok-slushat-onlayn-besplatno",
    ),
    "no /articles duplicate for sixth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${sixthListenHref}`,
    ),
    "directory JSON-LD includes sixth listen href",
  );

  const seventhListenHref = "/listens/meditatsiya-dlya-deneg-i-izobiliya-slushat-onlayn";
  const seventhListenCard = data.articles.find((card) => card.href === seventhListenHref);
  assert(seventhListenCard, "seventh indexable listen page is listed");
  assert(
    seventhListenCard.title === "Медитация для денег и изобилия: слушать онлайн | АудиоЛад",
    "seventh listen directory title",
  );
  assert(
    seventhListenCard.description === MEDITATSIYA_DLYA_DENEG_I_IZOBILIYA_SLUSHAT_ONLAYN_PAGE.description,
    "seventh listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-dlya-deneg-i-izobiliya-slushat-onlayn",
    ),
    "no /articles duplicate for seventh listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${seventhListenHref}`,
    ),
    "directory JSON-LD includes seventh listen href",
  );

  const eighthListenHref = "/listens/meditatsiya-na-dengi-i-izobilie-dlya-zhenshchin";
  const eighthListenCard = data.articles.find((card) => card.href === eighthListenHref);
  assert(eighthListenCard, "eighth indexable listen page is listed");
  assert(
    eighthListenCard.title === "Медитация на деньги и изобилие для женщин | АудиоЛад",
    "eighth listen directory title",
  );
  assert(
    eighthListenCard.description === MEDITATSIYA_NA_DENGI_I_IZOBILIE_DLYA_ZHENSHCHIN_PAGE.description,
    "eighth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-na-dengi-i-izobilie-dlya-zhenshchin",
    ),
    "no /articles duplicate for eighth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${eighthListenHref}`,
    ),
    "directory JSON-LD includes eighth listen href",
  );

  const ninthListenHref = "/listens/utrennyaya-meditatsiya-na-dengi-i-izobilie";
  const ninthListenCard = data.articles.find((card) => card.href === ninthListenHref);
  assert(ninthListenCard, "ninth indexable listen page is listed");
  assert(
    ninthListenCard.title === "Утренняя медитация на деньги и изобилие | АудиоЛад",
    "ninth listen directory title",
  );
  assert(
    ninthListenCard.description === UTRENNYAYA_MEDITATSIYA_NA_DENGI_I_IZOBILIE_PAGE.description,
    "ninth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/utrennyaya-meditatsiya-na-dengi-i-izobilie",
    ),
    "no /articles duplicate for ninth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${ninthListenHref}`,
    ),
    "directory JSON-LD includes ninth listen href",
  );

  const tenthListenHref = "/listens/meditatsiya-izobiliya-i-bogatstva-dlya-sna";
  const tenthListenCard = data.articles.find((card) => card.href === tenthListenHref);
  assert(tenthListenCard, "tenth indexable listen page is listed");
  assert(
    tenthListenCard.title === "Медитация изобилия и богатства для сна | АудиоЛад",
    "tenth listen directory title",
  );
  assert(
    tenthListenCard.description === MEDITATSIYA_IZOBILIYA_I_BOGATSTVA_DLYA_SNA_PAGE.description,
    "tenth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-izobiliya-i-bogatstva-dlya-sna",
    ),
    "no /articles duplicate for tenth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${tenthListenHref}`,
    ),
    "directory JSON-LD includes tenth listen href",
  );


  const eleventhListenHref = "/listens/shum-vody-slushat-onlayn";
  const eleventhListenCard = data.articles.find((card) => card.href === eleventhListenHref);
  assert(eleventhListenCard, "eleventh indexable listen page is listed");
  assert(
    eleventhListenCard.title === "Шум воды – слушать звуки воды онлайн бесплатно | АудиоЛад",
    "eleventh listen directory title",
  );
  assert(
    eleventhListenCard.description === SHUM_VODY_SLUSHAT_ONLAYN_PAGE.description,
    "eleventh listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/shum-vody-slushat-onlayn",
    ),
    "no /articles duplicate for eleventh listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${eleventhListenHref}`,
    ),
    "directory JSON-LD includes eleventh listen href",
  );

  const twelfthListenHref = "/listens/zhurchanie-vody-slushat-onlayn";
  const twelfthListenCard = data.articles.find((card) => card.href === twelfthListenHref);
  assert(twelfthListenCard, "twelfth indexable listen page is listed");
  assert(
    twelfthListenCard.title === "Журчание воды – слушать онлайн бесплатно | АудиоЛад",
    "twelfth listen directory title",
  );
  assert(
    twelfthListenCard.description === ZHURCHANIE_VODY_SLUSHAT_ONLAYN_PAGE.description,
    "twelfth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/zhurchanie-vody-slushat-onlayn",
    ),
    "no /articles duplicate for twelfth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${twelfthListenHref}`,
    ),
    "directory JSON-LD includes twelfth listen href",
  );

  const thirteenthListenHref = "/listens/zvuk-vodopada-slushat-onlayn";
  const thirteenthListenCard = data.articles.find((card) => card.href === thirteenthListenHref);
  assert(thirteenthListenCard, "thirteenth indexable listen page is listed");
  assert(
    thirteenthListenCard.title === "Звук водопада – слушать шум водопада онлайн бесплатно | АудиоЛад",
    "thirteenth listen directory title",
  );
  assert(
    thirteenthListenCard.description === ZVUK_VODOPADA_SLUSHAT_ONLAYN_PAGE.description,
    "thirteenth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/zvuk-vodopada-slushat-onlayn",
    ),
    "no /articles duplicate for thirteenth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${thirteenthListenHref}`,
    ),
    "directory JSON-LD includes thirteenth listen href",
  );

  const fourteenthListenHref = "/listens/zvuk-ruchya-slushat-onlayn";
  const fourteenthListenCard = data.articles.find((card) => card.href === fourteenthListenHref);
  assert(fourteenthListenCard, "fourteenth indexable listen page is listed");
  assert(
    fourteenthListenCard.title === "Звук ручья – слушать журчание ручья онлайн бесплатно | АудиоЛад",
    "fourteenth listen directory title",
  );
  assert(
    fourteenthListenCard.description === ZVUK_RUCHYA_SLUSHAT_ONLAYN_PAGE.description,
    "fourteenth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/zvuk-ruchya-slushat-onlayn",
    ),
    "no /articles duplicate for fourteenth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fourteenthListenHref}`,
    ),
    "directory JSON-LD includes fourteenth listen href",
  );

  const fifteenthListenHref = "/listens/shum-vody-dlya-sna";
  const fifteenthListenCard = data.articles.find((card) => card.href === fifteenthListenHref);
  assert(fifteenthListenCard, "fifteenth indexable listen page is listed");
  assert(
    fifteenthListenCard.title === "Шум воды для сна – слушать онлайн бесплатно | АудиоЛад",
    "fifteenth listen directory title",
  );
  assert(
    fifteenthListenCard.description === SHUM_VODY_DLYA_SNA_PAGE.description,
    "fifteenth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/shum-vody-dlya-sna",
    ),
    "no /articles duplicate for fifteenth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${fifteenthListenHref}`,
    ),
    "directory JSON-LD includes fifteenth listen href",
  );

  const sixteenthListenHref = "/listens/zvuk-lyushcheysya-vody-slushat-onlayn";
  const sixteenthListenCard = data.articles.find((card) => card.href === sixteenthListenHref);
  assert(sixteenthListenCard, "sixteenth indexable listen page is listed");
  assert(
    sixteenthListenCard.title === "Звук льющейся воды – слушать шум текущей воды онлайн | АудиоЛад",
    "sixteenth listen directory title",
  );
  assert(
    sixteenthListenCard.description === ZVUK_LYUSHCHEYSYA_VODY_SLUSHAT_ONLAYN_PAGE.description,
    "sixteenth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/zvuk-lyushcheysya-vody-slushat-onlayn",
    ),
    "no /articles duplicate for sixteenth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${sixteenthListenHref}`,
    ),
    "directory JSON-LD includes sixteenth listen href",
  );

  const seventeenthListenHref = "/listens/belyy-shum-vody-slushat-onlayn";
  const seventeenthListenCard = data.articles.find((card) => card.href === seventeenthListenHref);
  assert(seventeenthListenCard, "seventeenth indexable listen page is listed");
  assert(
    seventeenthListenCard.title === "Белый шум воды – слушать онлайн для сна бесплатно | АудиоЛад",
    "seventeenth listen directory title",
  );
  assert(
    seventeenthListenCard.description === BELYY_SHUM_VODY_SLUSHAT_ONLAYN_PAGE.description,
    "seventeenth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/belyy-shum-vody-slushat-onlayn",
    ),
    "no /articles duplicate for seventeenth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${seventeenthListenHref}`,
    ),
    "directory JSON-LD includes seventeenth listen href",
  );

  const eighteenthListenHref = "/listens/shum-vody-dlya-detey";
  const eighteenthListenCard = data.articles.find((card) => card.href === eighteenthListenHref);
  assert(eighteenthListenCard, "eighteenth indexable listen page is listed");
  assert(
    eighteenthListenCard.title === "Шум воды для детей – слушать онлайн для сна | АудиоЛад",
    "eighteenth listen directory title",
  );
  assert(
    eighteenthListenCard.description === SHUM_VODY_DLYA_DETEY_PAGE.description,
    "eighteenth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/shum-vody-dlya-detey",
    ),
    "no /articles duplicate for eighteenth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${eighteenthListenHref}`,
    ),
    "directory JSON-LD includes eighteenth listen href",
  );


  const nineteenthListenHref = "/listens/shum-vody-dlya-novorozhdennyh";
  const nineteenthListenCard = data.articles.find((card) => card.href === nineteenthListenHref);
  assert(nineteenthListenCard, "nineteenth indexable listen page is listed");
  assert(
    nineteenthListenCard.title === "Шум воды для новорождённых – слушать онлайн для сна | АудиоЛад",
    "nineteenth listen directory title",
  );
  assert(
    nineteenthListenCard.description === SHUM_VODY_DLYA_NOVOROZHDENNYH_PAGE.description,
    "nineteenth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/shum-vody-dlya-novorozhdennyh",
    ),
    "no /articles duplicate for nineteenth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${nineteenthListenHref}`,
    ),
    "directory JSON-LD includes nineteenth listen href",
  );

  const twentiethListenHref = "/listens/shum-vody-iz-krana-slushat-onlayn";
  const twentiethListenCard = data.articles.find((card) => card.href === twentiethListenHref);
  assert(twentiethListenCard, "twentieth indexable listen page is listed");
  assert(
    twentiethListenCard.title === "Шум воды из крана – слушать онлайн бесплатно | АудиоЛад",
    "twentieth listen directory title",
  );
  assert(
    twentiethListenCard.description === SHUM_VODY_IZ_KRANA_SLUSHAT_ONLAYN_PAGE.description,
    "twentieth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/shum-vody-iz-krana-slushat-onlayn",
    ),
    "no /articles duplicate for twentieth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${twentiethListenHref}`,
    ),
    "directory JSON-LD includes twentieth listen href",
  );

  const twentyFirstListenHref = "/listens/muzyka-dlya-sna-slushat-onlayn";
  const twentyFirstListenCard = data.articles.find((card) => card.href === twentyFirstListenHref);
  assert(twentyFirstListenCard, "twenty-first indexable listen page is listed");
  assert(
    twentyFirstListenCard.title === "Музыка для сна – слушать онлайн бесплатно | АудиоЛад",
    "twenty-first listen directory title",
  );
  assert(
    twentyFirstListenCard.description === MUZYKA_DLYA_SNA_SLUSHAT_ONLAYN_PAGE.description,
    "twenty-first listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/muzyka-dlya-sna-slushat-onlayn",
    ),
    "no /articles duplicate for twenty-first listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${twentyFirstListenHref}`,
    ),
    "directory JSON-LD includes twenty-first listen href",
  );

  const twentySecondListenHref = "/listens/uspokaivayushchaya-muzyka-dlya-sna-slushat-onlayn";
  const twentySecondListenCard = data.articles.find((card) => card.href === twentySecondListenHref);
  assert(twentySecondListenCard, "twenty-second indexable listen page is listed");
  assert(
    twentySecondListenCard.title === "Успокаивающая музыка для сна – слушать онлайн бесплатно | АудиоЛад",
    "twenty-second listen directory title",
  );
  assert(
    twentySecondListenCard.description === USPOKAIVAYUSHCHAYA_MUZYKA_DLYA_SNA_SLUSHAT_ONLAYN_PAGE.description,
    "twenty-second listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/uspokaivayushchaya-muzyka-dlya-sna-slushat-onlayn",
    ),
    "no /articles duplicate for twenty-second listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${twentySecondListenHref}`,
    ),
    "directory JSON-LD includes twenty-second listen href",
  );

  const twentyThirdListenHref = "/listens/usyplyayushchaya-muzyka-dlya-sna-slushat-onlayn";
  const twentyThirdListenCard = data.articles.find((card) => card.href === twentyThirdListenHref);
  assert(twentyThirdListenCard, "twenty-third indexable listen page is listed");
  assert(
    twentyThirdListenCard.title === "Усыпляющая музыка для сна – слушать онлайн бесплатно | АудиоЛад",
    "twenty-third listen directory title",
  );
  assert(
    twentyThirdListenCard.description === USYPLYAYUSHCHAYA_MUZYKA_DLYA_SNA_SLUSHAT_ONLAYN_PAGE.description,
    "twenty-third listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/usyplyayushchaya-muzyka-dlya-sna-slushat-onlayn",
    ),
    "no /articles duplicate for twenty-third listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${twentyThirdListenHref}`,
    ),
    "directory JSON-LD includes twenty-third listen href",
  );

  const twentyFourthListenHref = "/listens/muzyka-dlya-sna-bez-slov-slushat-onlayn";
  const twentyFourthListenCard = data.articles.find((card) => card.href === twentyFourthListenHref);
  assert(twentyFourthListenCard, "twenty-fourth indexable listen page is listed");
  assert(
    twentyFourthListenCard.title === "Музыка для сна без слов – слушать онлайн бесплатно | АудиоЛад",
    "twenty-fourth listen directory title",
  );
  assert(
    twentyFourthListenCard.description === MUZYKA_DLYA_SNA_BEZ_SLOV_SLUSHAT_ONLAYN_PAGE.description,
    "twenty-fourth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/muzyka-dlya-sna-bez-slov-slushat-onlayn",
    ),
    "no /articles duplicate for twenty-fourth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${twentyFourthListenHref}`,
    ),
    "directory JSON-LD includes twenty-fourth listen href",
  );


  const twentyFifthListenHref = "/listens/meditatsiya-dlya-sna-slushat-onlayn-besplatno";
  const twentyFifthListenCard = data.articles.find((card) => card.href === twentyFifthListenHref);
  assert(twentyFifthListenCard, "twenty-fifth indexable listen page is listed");
  assert(
    twentyFifthListenCard.title === "Медитация для сна – слушать онлайн бесплатно | АудиоЛад",
    "twenty-fifth listen directory title",
  );
  assert(
    twentyFifthListenCard.description === MEDITATSIYA_DLYA_SNA_SLUSHAT_ONLAYN_BESPLATNO_PAGE.description,
    "twenty-fifth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-dlya-sna-slushat-onlayn-besplatno",
    ),
    "no /articles duplicate for twenty-fifth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${twentyFifthListenHref}`,
    ),
    "directory JSON-LD includes twenty-fifth listen href",
  );


  const twentySixthListenHref = "/listens/meditatsiya-pered-snom-slushat-onlayn-besplatno";
  const twentySixthListenCard = data.articles.find((card) => card.href === twentySixthListenHref);
  assert(twentySixthListenCard, "twenty-sixth indexable listen page is listed");
  assert(
    twentySixthListenCard.title === "Медитация перед сном – слушать онлайн бесплатно | АудиоЛад",
    "twenty-sixth listen directory title",
  );
  assert(
    twentySixthListenCard.description === MEDITATSIYA_PERED_SNOM_SLUSHAT_ONLAYN_BESPLATNO_PAGE.description,
    "twenty-sixth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-pered-snom-slushat-onlayn-besplatno",
    ),
    "no /articles duplicate for twenty-sixth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${twentySixthListenHref}`,
    ),
    "directory JSON-LD includes twenty-sixth listen href",
  );


  const twentySeventhListenHref = "/listens/meditatsiya-dlya-sna-i-rasslableniya-slushat-onlayn";
  const twentySeventhListenCard = data.articles.find((card) => card.href === twentySeventhListenHref);
  assert(twentySeventhListenCard, "twenty-seventh indexable listen page is listed");
  assert(
    twentySeventhListenCard.title === "Медитация для сна и расслабления – слушать онлайн | АудиоЛад",
    "twenty-seventh listen directory title",
  );
  assert(
    twentySeventhListenCard.description === MEDITATSIYA_DLYA_SNA_I_RASSLABLENIYA_SLUSHAT_ONLAYN_PAGE.description,
    "twenty-seventh listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-dlya-sna-i-rasslableniya-slushat-onlayn",
    ),
    "no /articles duplicate for twenty-seventh listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${twentySeventhListenHref}`,
    ),
    "directory JSON-LD includes twenty-seventh listen href",
  );


  const twentyEighthListenHref = "/listens/meditatsiya-dlya-glubokogo-sna-slushat-onlayn";
  const twentyEighthListenCard = data.articles.find((card) => card.href === twentyEighthListenHref);
  assert(twentyEighthListenCard, "twenty-eighth indexable listen page is listed");
  assert(
    twentyEighthListenCard.title === "Медитация для глубокого сна – слушать онлайн | АудиоЛад",
    "twenty-eighth listen directory title",
  );
  assert(
    twentyEighthListenCard.description === MEDITATSIYA_DLYA_GLUBOKOGO_SNA_SLUSHAT_ONLAYN_PAGE.description,
    "twenty-eighth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-dlya-glubokogo-sna-slushat-onlayn",
    ),
    "no /articles duplicate for twenty-eighth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${twentyEighthListenHref}`,
    ),
    "directory JSON-LD includes twenty-eighth listen href",
  );


  const twentyNinthListenHref = "/listens/meditatsiya-na-noch-slushat-pered-snom";
  const twentyNinthListenCard = data.articles.find((card) => card.href === twentyNinthListenHref);
  assert(twentyNinthListenCard, "twenty-ninth indexable listen page is listed");
  assert(
    twentyNinthListenCard.title === "Медитация на ночь – слушать перед сном онлайн | АудиоЛад",
    "twenty-ninth listen directory title",
  );
  assert(
    twentyNinthListenCard.description === MEDITATSIYA_NA_NOCH_SLUSHAT_PERED_SNOM_PAGE.description,
    "twenty-ninth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-na-noch-slushat-pered-snom",
    ),
    "no /articles duplicate for twenty-ninth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${twentyNinthListenHref}`,
    ),
    "directory JSON-LD includes twenty-ninth listen href",
  );

  const thirtiethListenHref = "/listens/meditatsiya-dlya-horoshego-i-spokoynogo-sna";
  const thirtiethListenCard = data.articles.find((card) => card.href === thirtiethListenHref);
  assert(thirtiethListenCard, "thirtieth indexable listen page is listed");
  assert(
    thirtiethListenCard.title === "Медитация для хорошего и спокойного сна – слушать онлайн | АудиоЛад",
    "thirtieth listen directory title",
  );
  assert(
    thirtiethListenCard.description === MEDITATSIYA_DLYA_HOROSHEGO_I_SPOKOYNOGO_SNA_PAGE.description,
    "thirtieth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-dlya-horoshego-i-spokoynogo-sna",
    ),
    "no /articles duplicate for thirtieth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${thirtiethListenHref}`,
    ),
    "directory JSON-LD includes thirtieth listen href",
  );

  const thirtyFirstListenHref = "/listens/meditatsiya-dlya-sna-s-golosom-slushat-besplatno";
  const thirtyFirstListenCard = data.articles.find((card) => card.href === thirtyFirstListenHref);
  assert(thirtyFirstListenCard, "thirty-first indexable listen page is listed");
  assert(
    thirtyFirstListenCard.title === "Медитация для сна с голосом – слушать бесплатно | АудиоЛад",
    "thirty-first listen directory title",
  );
  assert(
    thirtyFirstListenCard.description === MEDITATSIYA_DLYA_SNA_S_GOLOSOM_SLUSHAT_BESPLATNO_PAGE.description,
    "thirty-first listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-dlya-sna-s-golosom-slushat-besplatno",
    ),
    "no /articles duplicate for thirty-first listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${thirtyFirstListenHref}`,
    ),
    "directory JSON-LD includes thirty-first listen href",
  );


  const thirtySecondListenHref = "/listens/meditatsiya-dlya-sna-bez-golosa-slushat-onlayn";
  const thirtySecondListenCard = data.articles.find((card) => card.href === thirtySecondListenHref);
  assert(thirtySecondListenCard, "thirty-second indexable listen page is listed");
  assert(
    thirtySecondListenCard.title === "Медитация для сна без голоса – слушать онлайн | АудиоЛад",
    "thirty-second listen directory title",
  );
  assert(
    thirtySecondListenCard.description === MEDITATSIYA_DLYA_SNA_BEZ_GOLOSA_SLUSHAT_ONLAYN_PAGE.description,
    "thirty-second listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-dlya-sna-bez-golosa-slushat-onlayn",
    ),
    "no /articles duplicate for thirty-second listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${thirtySecondListenHref}`,
    ),
    "directory JSON-LD includes thirty-second listen href",
  );




  const thirtyThirdListenHref = "/listens/meditatsiya-dlya-sna-bez-reklamy-slushat-besplatno";
  const thirtyThirdListenCard = data.articles.find((card) => card.href === thirtyThirdListenHref);
  assert(thirtyThirdListenCard, "thirty-third indexable listen page is listed");
  assert(
    thirtyThirdListenCard.title === "Медитация для сна без рекламы – слушать бесплатно | АудиоЛад",
    "thirty-third listen directory title",
  );
  assert(
    thirtyThirdListenCard.description === MEDITATSIYA_DLYA_SNA_BEZ_REKLAMY_SLUSHAT_BESPLATNO_PAGE.description,
    "thirty-third listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-dlya-sna-bez-reklamy-slushat-besplatno",
    ),
    "no /articles duplicate for thirty-third listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${thirtyThirdListenHref}`,
    ),
    "directory JSON-LD includes thirty-third listen href",
  );

  const thirtyFourthListenHref = "/listens/meditatsiya-dlya-sna-i-uspokoeniya-nervnoy-sistemy";
  const thirtyFourthListenCard = data.articles.find((card) => card.href === thirtyFourthListenHref);
  assert(thirtyFourthListenCard, "thirty-fourth indexable listen page is listed");
  assert(
    thirtyFourthListenCard.title === "Медитация для сна и успокоения нервной системы | АудиоЛад",
    "thirty-fourth listen directory title",
  );
  assert(
    thirtyFourthListenCard.description === MEDITATSIYA_DLYA_SNA_I_USPOKOENIYA_NERVNOY_SISTEMY_PAGE.description,
    "thirty-fourth listen directory description",
  );
  assert(
    !data.articles.some(
      (card) => card.href === "/articles/meditatsiya-dlya-sna-i-uspokoeniya-nervnoy-sistemy",
    ),
    "no /articles duplicate for thirty-fourth listen slug",
  );
  assert(
    collection.mainEntity.itemListElement.some(
      (item) => item.url === `https://audiolad.ru${thirtyFourthListenHref}`,
    ),
    "directory JSON-LD includes thirty-fourth listen href",
  );

const articleCards = listArticleDirectoryCards();
  const articleHrefs = new Set(articleCards.map((card) => card.href));
  for (const card of articleCards) {
    assert(
      data.articles.some((item) => item.href === card.href),
      `existing article ${card.slug} remains listed`,
    );
  }

  const noindex = {
    ...MEDITATSIYA_NA_DENGI_SLUSHAT_ONLAYN_BESPLATNO_PAGE,
    slug: "noindex-listen-directory-fixture",
    indexable: false,
  };
  const future = {
    ...MEDITATSIYA_NA_DENGI_SLUSHAT_ONLAYN_BESPLATNO_PAGE,
    slug: "future-listen-directory-fixture",
    title: "Будущая listen-страница",
    description: "Описание будущей listen-страницы для каталога.",
  };
  const mixed = loadArticleDirectoryPageData(
    listArticleDefinitions(),
    listTopicHubDefinitions(),
    [...listIndexableListenPageDefinitions(), noindex, future],
  );

  assert(
    mixed.articles.some((card) => card.href === "/listens/future-listen-directory-fixture"),
    "new indexable listen appears automatically",
  );
  assert(
    !mixed.articles.some((card) => card.href === "/listens/noindex-listen-directory-fixture"),
    "indexable:false listen is excluded",
  );
  assert(
    mixed.articles.filter((card) => card.href === listenHref).length === 1,
    "listen href is unique",
  );
  assert(
    articleHrefs.size === articleCards.length,
    "article href set size matches article cards",
  );

  const listenOnly = listListenDirectoryCards([future, noindex]);
  assert(listenOnly.length === 1, "listen selector excludes noindex");
  assert(listenOnly[0].href === "/listens/future-listen-directory-fixture", "listen href namespace");
}

function testEmptyState() {
  const empty = loadArticleDirectoryPageData([], listTopicHubDefinitions(), []);
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
  ["listen pages in directory", testListenPagesAppearInDirectory],
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
