#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  DISTRIBYUTOR_II_MUZYKI_FAQ,
  DISTRIBYUTOR_II_MUZYKI_HUB_HREF,
  DISTRIBYUTOR_II_MUZYKI_PAGE_H1,
  DISTRIBYUTOR_II_MUZYKI_PATH,
  DISTRIBYUTOR_II_MUZYKI_SEO_DESCRIPTION,
  DISTRIBYUTOR_II_MUZYKI_SEO_TITLE,
} from "../src/lib/seo/distribyutor-ii-muzyki/content.ts";
import { buildAiMusicHubPageJsonLd } from "../src/lib/seo/json-ld/index.ts";
import { isBottomNavNeutralPathname } from "../src/lib/navigation/bottom-nav.ts";
import {
  buildDistribyutorIiMuzykiMetadata,
  buildSiteCanonicalUrl,
} from "../src/lib/seo/public-page-metadata.ts";

const view = readFileSync("src/components/distribyutor-ii-muzyki/DistribyutorIiMuzykiPageView.tsx", "utf8");
const page = readFileSync("src/app/(platform)/(listener)/distribyutor-ii-muzyki/page.tsx", "utf8");
const sitemapSource = readFileSync("src/lib/seo/sitemap-data.ts", "utf8");
const contentSource = readFileSync("src/lib/seo/distribyutor-ii-muzyki/content.ts", "utf8");
const introCta = readFileSync("src/components/ai-music/AiMusicIntroCta.tsx", "utf8");
const externalAnchors = [...view.matchAll(/<a\b[^>]*>/g)]
  .map((match) => match[0])
  .filter((anchor) => /\bhref\s*=\s*["']https:\/\/[^"']+["']/.test(anchor));

for (const anchor of externalAnchors) {
  assert.match(anchor, /\btarget\s*=\s*["_']_blank["_']/);
  assert.match(anchor, /\brel\s*=\s*["']noopener noreferrer["']/);
}

const metadata = buildDistribyutorIiMuzykiMetadata();
assert.equal(metadata.title, DISTRIBYUTOR_II_MUZYKI_SEO_TITLE);
assert.equal(metadata.description, DISTRIBYUTOR_II_MUZYKI_SEO_DESCRIPTION);
assert.equal(metadata.alternates?.canonical, buildSiteCanonicalUrl(DISTRIBYUTOR_II_MUZYKI_PATH));
assert.equal(metadata.alternates?.canonical, "https://audiolad.ru/distribyutor-ii-muzyki");
assert.equal(metadata.robots?.index, true);
assert.equal(metadata.robots?.follow, true);
assert.equal(DISTRIBYUTOR_II_MUZYKI_PAGE_H1, DISTRIBYUTOR_II_MUZYKI_SEO_TITLE);
assert.match(view, /DISTRIBYUTOR_II_MUZYKI_PAGE_H1/);
assert.equal((view.match(/DISTRIBYUTOR_II_MUZYKI_HUB_LABEL/g) ?? []).length >= 2, true);
assert.match(view, /AiMusicIntroCta/);
assert.match(introCta, /Посмотрите, как устроен АудиоЛад/);
assert.match(introCta, /href="\/"/);
assert.match(introCta, /href="\/become-author"/);
assert.match(introCta, /flex-col gap-3 sm:flex-row/);
assert.match(introCta, /overflow-hidden/);
assert.equal(
  DISTRIBYUTOR_II_MUZYKI_HUB_HREF,
  "/kak-zarabatyvat-na-ii-muzyke-v-audiolad",
);
assert.equal((view.match(/<Visual number=/g) ?? []).length, 4);
assert.doesNotMatch(view, /<FlowVisuals\s*\/>/);
assert.ok(
  view.indexOf("<DistributorWarehouseVisual") >
    view.indexOf('id="chto-takoe"'),
);
assert.ok(
  view.indexOf("<DistributionChannelsVisual") >
    view.indexOf('id="gde-publikovat"'),
);
assert.ok(
  view.indexOf("<ShortTracksVisual") >
    view.indexOf('id="dlinnyy-trek"'),
);
assert.match(view, /10–15 хороших композиций/);
assert.match(view, /Музыка для дыхательных практик – около 20 минут/i);
assert.match(view, /Не нужно ждать, пока накопится большой альбом/i);
assert.match(view, /10 треков × примерно 6 минут/);
assert.match(view, /Первое – музыку покупают слушатели/);
assert.match(view, /50 музыкальных работ/);
assert.match(view, /Здесь самое интересное/);
assert.match(view, /<li>jazz ambience;<\/li>/);
assert.match(view, /Мне нужна именно эта музыка/);
assert.match(view, /если человек раньше не слышал этот трек/);
assert.match(view, /альбом из десяти музыкальных композиций/);
assert.equal(view.includes("—"), false, "Russian content must use medium dash");
assert.equal(view.includes("♫"), false, "visuals must not use music-note emoji");
assert.equal(contentSource.includes("—"), false, "Russian SEO content must use medium dash");
assert.match(contentSource, /Дистрибьютор ИИ-музыки/);
assert.equal(DISTRIBYUTOR_II_MUZYKI_FAQ.length, 8);
assert.deepEqual(
  DISTRIBYUTOR_II_MUZYKI_FAQ.map((item) => item.question),
  [
    "Что такое дистрибьютор ИИ-музыки?",
    "Какие музыкальные дистрибьюторы существуют?",
    "Можно ли загрузить ИИ-музыку через DistroKid?",
    "Можно ли загрузить музыку из Suno на стриминговые сервисы?",
    "Обязательно ли делать один трек на 30 или 60 минут?",
    "Где можно продавать музыку, созданную ИИ?",
    "Нужно ли создавать целый альбом?",
    "Можно ли размещать одну и ту же музыку на разных площадках?",
  ],
);
for (const destination of [
  "Яндекс Музыка",
  "VK Музыка",
  "Spotify",
  "Apple Music",
  "YouTube Music",
]) assert.match(view, new RegExp(destination));
assert.match(view, /ArticleFaqList/);
assert.match(page, /buildAiMusicHubPageJsonLd/);
const graph = buildAiMusicHubPageJsonLd({ title: DISTRIBYUTOR_II_MUZYKI_PAGE_H1, description: DISTRIBYUTOR_II_MUZYKI_SEO_DESCRIPTION, path: DISTRIBYUTOR_II_MUZYKI_PATH, faq: DISTRIBYUTOR_II_MUZYKI_FAQ }, "https://audiolad.ru")["@graph"];
assert.deepEqual(graph.map((node) => node["@type"]).filter((type) => ["WebPage", "Article", "BreadcrumbList", "FAQPage"].includes(type)), ["WebPage", "Article", "BreadcrumbList", "FAQPage"]);
assert.equal(isBottomNavNeutralPathname(DISTRIBYUTOR_II_MUZYKI_PATH), true);
assert.match(sitemapSource, /path: "\/distribyutor-ii-muzyki", changeFrequency: "monthly", priority: 0.7/);
console.log("distribyutor-ii-muzyki-page-unit: ok");
