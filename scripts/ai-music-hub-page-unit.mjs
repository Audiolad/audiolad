#!/usr/bin/env node
/**
 * Unit checks for /kak-zarabatyvat-na-ii-muzyke-v-audiolad hub – no DB / network.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  AI_MUSIC_HUB_CTA_LABEL,
  AI_MUSIC_HUB_DATE_PUBLISHED,
  AI_MUSIC_HUB_ECONOMICS_STATS,
  AI_MUSIC_HUB_FAQ,
  AI_MUSIC_HUB_INTRO,
  AI_MUSIC_HUB_ONE_PURCHASE_FORMULA,
  AI_MUSIC_HUB_PAGE_H1,
  AI_MUSIC_HUB_PATH,
  AI_MUSIC_HUB_PRODUCTS_FORMULA,
  AI_MUSIC_HUB_PRODUCTS_HEADING,
  AI_MUSIC_HUB_SCALING_AFTER,
  AI_MUSIC_HUB_SCALING_ROWS,
  AI_MUSIC_HUB_SCENARIOS,
  AI_MUSIC_HUB_SEO_DESCRIPTION,
  AI_MUSIC_HUB_SEO_TITLE,
  AI_MUSIC_HUB_WAYS,
} from "../src/lib/seo/ai-music-hub/content.ts";
import { buildAiMusicHubPageJsonLd } from "../src/lib/seo/json-ld/index.ts";
import {
  buildAiMusicHubMetadata,
  buildSiteCanonicalUrl,
} from "../src/lib/seo/public-page-metadata.ts";
import { STATIC_SITEMAP_PAGES } from "../src/lib/seo/sitemap-data.ts";
import { isBottomNavNeutralPathname } from "../src/lib/navigation/bottom-nav.ts";
import { BECOME_AUTHOR_HREF } from "../src/lib/profile/constants.ts";
import * as hubContent from "../src/lib/seo/ai-music-hub/content.ts";

const ORIGIN = "https://audiolad.ru";
const FORBIDDEN_STATUS =
  /готовится|скоро появится|в разработке|в будущем/;
const EM_DASH = "\u2014";

function read(path) {
  return readFileSync(path, "utf8");
}

function collectUserFacingText() {
  return JSON.stringify(hubContent);
}

function testMetadata() {
  const metadata = buildAiMusicHubMetadata();
  assert.equal(metadata.title, AI_MUSIC_HUB_SEO_TITLE);
  assert.equal(metadata.description, AI_MUSIC_HUB_SEO_DESCRIPTION);
  assert.equal(
    metadata.alternates?.canonical,
    buildSiteCanonicalUrl(AI_MUSIC_HUB_PATH),
  );
  assert.equal(
    metadata.alternates?.canonical,
    `${ORIGIN}${AI_MUSIC_HUB_PATH}`,
  );
  assert.equal(
    metadata.openGraph?.url,
    buildSiteCanonicalUrl(AI_MUSIC_HUB_PATH),
  );
  assert.equal(metadata.openGraph?.type, "article");
  assert.equal(metadata.twitter?.card, "summary");
  assert.equal(metadata.robots?.index, true);
  assert.equal(metadata.robots?.follow, true);
  assert.equal(
    AI_MUSIC_HUB_PAGE_H1,
    "Как зарабатывать на своей ИИ-музыке в АудиоЛаде",
  );
  assert.equal(
    AI_MUSIC_HUB_SEO_TITLE,
    "Как заработать на ИИ-музыке и нейромузыке – монетизация AI-музыки | АудиоЛад",
  );
}

function testJsonLd() {
  const jsonLd = buildAiMusicHubPageJsonLd(
    {
      title: AI_MUSIC_HUB_PAGE_H1,
      description: AI_MUSIC_HUB_SEO_DESCRIPTION,
      path: AI_MUSIC_HUB_PATH,
      datePublished: AI_MUSIC_HUB_DATE_PUBLISHED,
      faq: AI_MUSIC_HUB_FAQ.map((item) => ({
        question: item.question,
        answer: item.answer,
      })),
    },
    ORIGIN,
  );

  assert.equal(jsonLd["@context"], "https://schema.org");
  const graph = jsonLd["@graph"];
  assert.ok(Array.isArray(graph), "graph is array");

  const types = graph.map((node) => node["@type"]);
  assert.ok(types.includes("Organization"), "Organization present");
  assert.ok(types.includes("WebSite"), "WebSite present");
  assert.ok(types.includes("WebPage"), "WebPage present");
  assert.ok(types.includes("Article"), "Article present");
  assert.ok(types.includes("BreadcrumbList"), "BreadcrumbList present");
  assert.ok(types.includes("FAQPage"), "FAQPage present");
  assert.ok(!types.includes("Product"), "no Product");
  assert.ok(!types.includes("Offer"), "no Offer");
  assert.ok(!types.includes("AggregateRating"), "no ratings");

  const webpage = graph.find((node) => node["@type"] === "WebPage");
  assert.equal(webpage.url, `${ORIGIN}${AI_MUSIC_HUB_PATH}`);
  assert.equal(webpage.name, AI_MUSIC_HUB_PAGE_H1);

  const article = graph.find((node) => node["@type"] === "Article");
  assert.equal(article.headline, AI_MUSIC_HUB_PAGE_H1);
  assert.equal(article.datePublished, AI_MUSIC_HUB_DATE_PUBLISHED);
  assert.equal(article.offers, undefined);
  assert.equal(article.aggregateRating, undefined);

  const serialized = JSON.stringify(jsonLd);
  assert.doesNotMatch(serialized, /"price"/);
  assert.doesNotMatch(serialized, /AggregateRating/);

  const breadcrumbs = graph.find((node) => node["@type"] === "BreadcrumbList");
  const crumbNames = breadcrumbs.itemListElement.map((item) => item.name);
  assert.deepEqual(crumbNames, [
    "Главная",
    "Авторам",
    AI_MUSIC_HUB_PAGE_H1,
  ]);

  const faq = graph.find((node) => node["@type"] === "FAQPage");
  assert.equal(faq.mainEntity.length, 7);
  assert.equal(faq.mainEntity[0].name, AI_MUSIC_HUB_FAQ[0].question);
  assert.equal(
    faq.mainEntity[0].acceptedAnswer.text,
    AI_MUSIC_HUB_FAQ[0].answer,
  );
}

function testCopyAndEconomics() {
  const text = collectUserFacingText();
  assert.equal(text.includes(EM_DASH), false, "user-facing copy must use en dash");
  assert.doesNotMatch(text, FORBIDDEN_STATUS);
  assert.doesNotMatch(text, /210 ₽/);
  assert.doesNotMatch(text, /90 ₽/);
  assert.doesNotMatch(text, /постоянное право/);
  assert.doesNotMatch(text, /бессрочн/);
  assert.doesNotMatch(text, /эксклюзивн/);
  assert.doesNotMatch(text, /без отдельной подписки/);
  assert.doesNotMatch(text, /дополнительных комиссий сверх модели 70\/30/);
  assert.doesNotMatch(text, /Отдельных тарифов, подписок/);
  assert.doesNotMatch(text, /Автором публикации остаётесь вы/);
  assert.doesNotMatch(text, /ИИ используется как инструмент/);
  assert.doesNotMatch(text, /как автор делится ссылкой/);

  assert.match(text, /ИИ-музык/);
  assert.match(text, /AI-музык/);
  assert.match(text, /нейромузык/);
  assert.match(AI_MUSIC_HUB_INTRO[0], /Suno, Udio/);
  assert.match(AI_MUSIC_HUB_INTRO[1], /набора MP3-файлов/);

  assert.equal(AI_MUSIC_HUB_WAYS.length, 2);
  assert.match(
    AI_MUSIC_HUB_WAYS[1].description,
    /Автор медитации приобретает право использовать музыкальную публикацию внутри Студии/,
  );
  assert.equal(AI_MUSIC_HUB_ECONOMICS_STATS[0]?.value, "300 ₽");
  assert.equal(AI_MUSIC_HUB_ECONOMICS_STATS[1]?.value, "600 ₽");
  assert.equal(AI_MUSIC_HUB_ECONOMICS_STATS[2]?.value, "420 ₽");
  assert.equal(AI_MUSIC_HUB_ECONOMICS_STATS[3]?.value, "180 ₽");
  assert.deepEqual(
    AI_MUSIC_HUB_SCALING_ROWS.map((row) => row.author),
    [
      "420 ₽",
      "4 200 ₽",
      "42 000 ₽",
      "84 000 ₽",
      "210 000 ₽",
      "420 000 ₽",
    ],
  );
  assert.equal(AI_MUSIC_HUB_SCALING_AFTER.length, 5);
  assert.match(AI_MUSIC_HUB_SCALING_AFTER[0], /не прогноз дохода/);
  assert.match(AI_MUSIC_HUB_SCALING_AFTER[4], /музыкальный каталог/);
  assert.equal(
    AI_MUSIC_HUB_ONE_PURCHASE_FORMULA,
    "420 ₽ – это не доход со всего трека. Это доход с одной покупки права использования.",
  );
  assert.match(
    text,
    /Одна музыкальная работа потенциально может приносить доход из двух источников/,
  );
  assert.equal(
    AI_MUSIC_HUB_PRODUCTS_HEADING,
    "Не просто генерируйте музыку – создавайте музыкальные продукты",
  );
  assert.match(AI_MUSIC_HUB_PRODUCTS_FORMULA, /каталог самостоятельных цифровых продуктов/);
  assert.deepEqual(
    AI_MUSIC_HUB_SCENARIOS.map((row) => row.scene),
    [
      "Медитация",
      "Сон",
      "Йога",
      "Массаж",
      "SPA",
      "Дыхательные практики",
      "Концентрация",
      "Релакс",
    ],
  );
  assert.equal(AI_MUSIC_HUB_SCENARIOS[0].use, "музыка для медитации без слов");
  assert.equal(AI_MUSIC_HUB_FAQ.length, 7);
  assert.equal(
    AI_MUSIC_HUB_CTA_LABEL,
    "Зарегистрироваться как автор АудиоЛада",
  );

  assert.match(text, /2 × текущая цена для слушателя/);
  assert.match(text, /70%/);
  assert.match(text, /30%/);
  assert.match(text, /Исходный музыкальный файл отдельно/);
  assert.match(text, /право использования покрывает всю публикацию/);
  assert.match(text, /Suno/);
  assert.match(text, /Udio/);
  assert.match(text, /Spotify/);
  assert.match(text, /YouTube/);
  assert.match(text, /дополнительный канал/);
  assert.match(text, /проверить актуальные условия/);
}

function testPageWiring() {
  const page = read(
    "src/app/(platform)/(listener)/kak-zarabatyvat-na-ii-muzyke-v-audiolad/page.tsx",
  );
  const view = read("src/components/ai-music-hub/AiMusicHubPageView.tsx");
  const layout = read(
    "src/app/(platform)/(listener)/kak-zarabatyvat-na-ii-muzyke-v-audiolad/layout.tsx",
  );

  assert.match(page, /buildAiMusicHubPageJsonLd/);
  assert.match(page, /buildAiMusicHubMetadata/);
  assert.match(page, /AiMusicHubPageView/);
  assert.doesNotMatch(page, /CreatorPathsCta/);
  assert.doesNotMatch(page, /ArticleDefinition/);
  assert.doesNotMatch(page, /ArticleAudioBlock/);

  assert.match(view, /href=\{BECOME_AUTHOR_HREF\}/);
  assert.match(view, /AI_MUSIC_HUB_CTA_LABEL/);
  assert.match(view, /ArticleFaqList/);
  assert.match(view, /AI_MUSIC_HUB_SCALING_AFTER/);
  assert.match(view, /AI_MUSIC_HUB_ONE_PURCHASE_FORMULA/);
  assert.match(view, /id="ai-music-ways"/);
  assert.match(view, /id="ai-music-economics"/);
  assert.match(view, /id="ai-music-scaling"/);
  assert.match(view, /id="ai-music-dual-income"/);
  assert.match(view, /id="ai-music-scenarios"/);
  assert.match(view, /id="ai-music-faq"/);
  assert.doesNotMatch(view, /CreatorPathsCta/);
  assert.doesNotMatch(view, /href="\/studio\/meditation"/);
  assert.doesNotMatch(view, /school\.audiolad\.ru/);
  assert.doesNotMatch(view, /href="\/auth\/sign-up"/);
  assert.doesNotMatch(view, /ECONOMICS_NOTE/);
  assert.equal(view.includes(EM_DASH), false);
  assert.doesNotMatch(view, FORBIDDEN_STATUS);

  assert.match(layout, /HomeMobileHeader/);
  assert.match(layout, /LegalFooter/);
  assert.equal(BECOME_AUTHOR_HREF, "/become-author");
}

function testNavigationAndSitemap() {
  assert.equal(
    isBottomNavNeutralPathname(AI_MUSIC_HUB_PATH),
    true,
  );

  const sitemapEntry = STATIC_SITEMAP_PAGES.find(
    (page) => page.path === AI_MUSIC_HUB_PATH,
  );
  assert.ok(sitemapEntry, "sitemap includes AI music hub");
  assert.equal(sitemapEntry.changeFrequency, "monthly");
  assert.equal(sitemapEntry.priority, 0.7);
}

testMetadata();
testJsonLd();
testCopyAndEconomics();
testPageWiring();
testNavigationAndSitemap();
console.log("ai-music-hub-page-unit: ok");
