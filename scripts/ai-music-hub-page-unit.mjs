#!/usr/bin/env node
/**
 * Unit checks for /kak-zarabatyvat-na-ii-muzyke-v-audiolad selling landing.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  AI_MUSIC_HUB_AUTHORS_HEADING,
  AI_MUSIC_HUB_CLOSING_HEADING,
  AI_MUSIC_HUB_CLOSING_NOTE,
  AI_MUSIC_HUB_CTA_LABEL,
  AI_MUSIC_HUB_DATE_PUBLISHED,
  AI_MUSIC_HUB_DUAL_INCOME_HEADING,
  AI_MUSIC_HUB_DUAL_INCOME_RECAP_HEADING,
  AI_MUSIC_HUB_ECONOMICS_HEADING,
  AI_MUSIC_HUB_ECONOMICS_INTRO,
  AI_MUSIC_HUB_ECONOMICS_ROWS,
  AI_MUSIC_HUB_INTRO,
  AI_MUSIC_HUB_PAGE_H1,
  AI_MUSIC_HUB_PATH,
  AI_MUSIC_HUB_REPEAT_HEADING,
  AI_MUSIC_HUB_RIGHTS_HEADING,
  AI_MUSIC_HUB_SCREENSHOTS,
  AI_MUSIC_HUB_SEO_DESCRIPTION,
  AI_MUSIC_HUB_SEO_TITLE,
  AI_MUSIC_HUB_STEPS_HEADING,
  AI_MUSIC_HUB_STEPS_LINE,
  AI_MUSIC_HUB_SUBTITLE,
  AI_MUSIC_HUB_SUNO_HEADING,
  AI_MUSIC_HUB_WHAT_IS_HEADING,
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
const OLD_ECONOMICS =
  /2\s*×|двум текущим ценам|цена права использования|420 ₽|4 200 ₽|42 000 ₽|84 000 ₽|210 000 ₽|420 000 ₽|300 ₽|600 ₽|210 ₽|90 ₽|постоянное право|бессрочн|Регистрация бесплатная/;

function read(filePath) {
  return readFileSync(filePath, "utf8");
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
  assert.equal(metadata.twitter?.card, "summary");
  assert.equal(metadata.robots?.index, false);
  assert.equal(metadata.robots?.follow, true);
  assert.equal(
    AI_MUSIC_HUB_PAGE_H1,
    "Как зарабатывать на своей ИИ-музыке в АудиоЛаде",
  );
  assert.equal(AI_MUSIC_HUB_SEO_TITLE, AI_MUSIC_HUB_PAGE_H1);
  assert.equal(AI_MUSIC_HUB_SEO_DESCRIPTION, AI_MUSIC_HUB_SUBTITLE);
}

function testJsonLd() {
  const jsonLd = buildAiMusicHubPageJsonLd(
    {
      title: AI_MUSIC_HUB_PAGE_H1,
      description: AI_MUSIC_HUB_SEO_DESCRIPTION,
      path: AI_MUSIC_HUB_PATH,
      datePublished: AI_MUSIC_HUB_DATE_PUBLISHED,
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
  assert.ok(!types.includes("FAQPage"), "selling landing has no FAQPage");
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
}

function testCopyAndEconomics() {
  const text = collectUserFacingText();
  assert.equal(text.includes(EM_DASH), false, "user-facing copy must use en dash");
  assert.doesNotMatch(text, FORBIDDEN_STATUS);
  assert.doesNotMatch(text, OLD_ECONOMICS);
  assert.doesNotMatch(text, /эксклюзивн/);
  assert.doesNotMatch(text, /без отдельной подписки/);
  assert.doesNotMatch(text, /дополнительных комиссий сверх модели 70\/30/);
  assert.doesNotMatch(text, /Отдельных тарифов, подписок/);
  assert.doesNotMatch(text, /Автором публикации остаётесь вы/);
  assert.doesNotMatch(text, /Частые вопросы/);

  assert.equal(
    AI_MUSIC_HUB_SUBTITLE,
    "Получайте деньги за свою нейромузыку: от слушателей, которые покупают её на АудиоЛаде, и от авторов медитаций, которые используют её в своих проектах.",
  );
  assert.match(AI_MUSIC_HUB_INTRO, /ИИ-музыка, AI-музыка, нейромузыка/);
  assert.equal(
    AI_MUSIC_HUB_CTA_LABEL,
    "Зарегистрироваться бесплатно как автор АудиоЛада",
  );
  assert.equal(AI_MUSIC_HUB_WHAT_IS_HEADING, "Что такое АудиоЛад");
  assert.equal(
    AI_MUSIC_HUB_DUAL_INCOME_HEADING,
    "Один трек – два источника дохода",
  );
  assert.equal(
    AI_MUSIC_HUB_DUAL_INCOME_RECAP_HEADING,
    "Один трек. Два источника дохода.",
  );
  assert.equal(AI_MUSIC_HUB_ECONOMICS_HEADING, "Простая экономика");
  assert.match(AI_MUSIC_HUB_ECONOMICS_INTRO, /500 ₽/);
  assert.deepEqual(
    AI_MUSIC_HUB_ECONOMICS_ROWS.map((row) => `${row.sales} – ${row.amount}`),
    [
      "10 покупок – 5 000 ₽ продаж",
      "100 покупок – 50 000 ₽ продаж",
      "1 000 покупок – 500 000 ₽ продаж",
    ],
  );
  assert.match(text, /Автор музыки получает 70% от продаж/);
  assert.match(text, /30% – комиссия АудиоЛада/);
  assert.equal(AI_MUSIC_HUB_RIGHTS_HEADING, "Права на музыку остаются у вас");
  assert.match(text, /Яндекс Музыке, Spotify, YouTube/);
  assert.equal(AI_MUSIC_HUB_STEPS_HEADING, "Что нужно сделать");
  assert.equal(
    AI_MUSIC_HUB_STEPS_LINE,
    "Зарегистрируйтесь бесплатно → загрузите свою музыку → оформите её → выберите нужные настройки → опубликуйте.",
  );
  assert.equal(
    AI_MUSIC_HUB_REPEAT_HEADING,
    "Загрузите музыку один раз – получайте за неё деньги снова и снова",
  );
  assert.equal(
    AI_MUSIC_HUB_SUNO_HEADING,
    "А если музыка создана в Suno или Udio?",
  );
  assert.match(AI_MUSIC_HUB_AUTHORS_HEADING, /авторы медитаций/);
  assert.equal(AI_MUSIC_HUB_CLOSING_HEADING, "Попробуйте прямо сейчас");
  assert.equal(
    AI_MUSIC_HUB_CLOSING_NOTE,
    "Начать можно с одной музыкальной работы.",
  );
  assert.match(text, /Suno/);
  assert.match(text, /Udio/);
}

function testScreenshots() {
  assert.equal(AI_MUSIC_HUB_SCREENSHOTS.length, 4);
  assert.deepEqual(
    AI_MUSIC_HUB_SCREENSHOTS.map((shot) => shot.id),
    ["home", "product", "studio", "author"],
  );
  assert.equal(
    AI_MUSIC_HUB_SCREENSHOTS[0].caption,
    "АудиоЛад – платформа, где люди находят музыку, медитации и другие аудиопродукты.",
  );
  assert.equal(
    AI_MUSIC_HUB_SCREENSHOTS[1].caption,
    "Ваш трек или альбом становится самостоятельным музыкальным продуктом со своей страницей.",
  );
  assert.equal(
    AI_MUSIC_HUB_SCREENSHOTS[2].caption,
    "В Студии АудиоЛада авторы медитаций и аудиопрактик могут находить музыку для своих проектов.",
  );
  assert.equal(
    AI_MUSIC_HUB_SCREENSHOTS[3].caption,
    "Каждая новая работа становится ещё одним продуктом в вашем музыкальном каталоге.",
  );

  for (const shot of AI_MUSIC_HUB_SCREENSHOTS) {
    assert.ok(shot.width > 0 && shot.height > 0);
    assert.ok(shot.src, `${shot.id} screenshot src is required`);
    const publicPath = path.join("public", shot.src.replace(/^\//, ""));
    assert.equal(
      existsSync(publicPath),
      true,
      `screenshot file missing: ${publicPath}`,
    );
  }
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
  assert.doesNotMatch(page, /AI_MUSIC_HUB_FAQ/);
  assert.doesNotMatch(page, /CreatorPathsCta/);
  assert.doesNotMatch(page, /ArticleDefinition/);
  assert.doesNotMatch(page, /ArticleAudioBlock/);

  assert.match(view, /href=\{BECOME_AUTHOR_HREF\}/);
  assert.match(view, /AI_MUSIC_HUB_CTA_LABEL/);
  assert.match(view, /AI_MUSIC_HUB_CLOSING_NOTE/);
  assert.match(view, /id="ai-music-what-is"/);
  assert.match(view, /id="ai-music-dual-income"/);
  assert.match(view, /id="ai-music-economics"/);
  assert.match(view, /id="ai-music-rights"/);
  assert.match(view, /id="ai-music-repeat"/);
  assert.doesNotMatch(view, /ArticleFaqList/);
  assert.doesNotMatch(view, /Регистрация бесплатная/);
  assert.doesNotMatch(view, /CreatorPathsCta/);
  assert.doesNotMatch(view, /href="\/studio\/meditation"/);
  assert.doesNotMatch(view, /school\.audiolad\.ru/);
  assert.doesNotMatch(view, /href="\/auth\/sign-up"/);
  assert.equal(view.includes(EM_DASH), false);
  assert.doesNotMatch(view, FORBIDDEN_STATUS);
  assert.doesNotMatch(view, OLD_ECONOMICS);

  assert.match(layout, /HomeMobileHeader/);
  assert.match(layout, /LegalFooter/);
  assert.equal(BECOME_AUTHOR_HREF, "/become-author");
}

function testNavigationAndSitemap() {
  assert.equal(isBottomNavNeutralPathname(AI_MUSIC_HUB_PATH), true);

  const sitemapEntry = STATIC_SITEMAP_PAGES.find(
    (page) => page.path === AI_MUSIC_HUB_PATH,
  );
  assert.equal(
    sitemapEntry,
    undefined,
    "AI music landing stays excluded from sitemap",
  );
}

testMetadata();
testJsonLd();
testCopyAndEconomics();
testPageWiring();
testNavigationAndSitemap();
testScreenshots();
console.log("ai-music-hub-page-unit: ok");
