#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  KAK_SOZDAT_II_MUZYKU_FAQ,
  KAK_SOZDAT_II_MUZYKU_PAGE_H1,
  KAK_SOZDAT_II_MUZYKU_PATH,
  KAK_SOZDAT_II_MUZYKU_SEO_DESCRIPTION,
  KAK_SOZDAT_II_MUZYKU_SEO_TITLE,
} from "../src/lib/seo/kak-sozdat-ii-muzyku/content.ts";
import { buildAiMusicHubPageJsonLd } from "../src/lib/seo/json-ld/index.ts";
import { isBottomNavNeutralPathname } from "../src/lib/navigation/bottom-nav.ts";
import {
  buildKakSozdatIiMuzykuMetadata,
  buildSiteCanonicalUrl,
} from "../src/lib/seo/public-page-metadata.ts";

const view = readFileSync("src/components/kak-sozdat-ii-muzyku/KakSozdatIiMuzykuPageView.tsx", "utf8");
const page = readFileSync("src/app/(platform)/(listener)/kak-sozdat-ii-muzyku/page.tsx", "utf8");
const sitemapSource = readFileSync("src/lib/seo/sitemap-data.ts", "utf8");
const contentSource = readFileSync("src/lib/seo/kak-sozdat-ii-muzyku/content.ts", "utf8");
const introCta = readFileSync("src/components/ai-music/AiMusicIntroCta.tsx", "utf8");
const externalAnchors = [...view.matchAll(/<a\b[^>]*>/g)]
  .map((match) => match[0])
  .filter((anchor) => /\bhref\s*=\s*["']https:\/\/[^"']+["']/.test(anchor));

for (const anchor of externalAnchors) {
  assert.match(anchor, /\btarget\s*=\s*["_']_blank["_']/);
  assert.match(anchor, /\brel\s*=\s*["']noopener noreferrer["']/);
}

const metadata = buildKakSozdatIiMuzykuMetadata();
assert.equal(metadata.title, KAK_SOZDAT_II_MUZYKU_SEO_TITLE);
assert.equal(metadata.description, KAK_SOZDAT_II_MUZYKU_SEO_DESCRIPTION);
assert.equal(metadata.alternates?.canonical, buildSiteCanonicalUrl(KAK_SOZDAT_II_MUZYKU_PATH));
assert.equal(metadata.alternates?.canonical, "https://audiolad.ru/kak-sozdat-ii-muzyku");
assert.equal(metadata.robots?.index, true);
assert.equal(metadata.robots?.follow, true);
assert.equal(KAK_SOZDAT_II_MUZYKU_PAGE_H1, KAK_SOZDAT_II_MUZYKU_SEO_TITLE);
assert.match(view, /KAK_SOZDAT_II_MUZYKU_PAGE_H1/);
assert.match(view, /AiMusicIntroCta/);
assert.match(introCta, /Посмотрите, как устроен АудиоЛад/);
assert.match(introCta, /href="\/"/);
assert.match(introCta, /href="\/become-author"/);

const visualNumbers = [...view.matchAll(/<Visual number="(\d)"/g)].map((match) => match[1]);
assert.deepEqual(visualNumbers, ["1", "2", "3", "4"]);
assert.ok(view.indexOf("<CreationFlowVisual") < view.indexOf('id="korotko"'));
assert.ok(view.indexOf("<PromptVisual") > view.indexOf('id="shag-3"'));
assert.ok(view.indexOf("<VariantsVisual") > view.indexOf('id="shag-5"'));
assert.ok(view.indexOf("<HourVisual") > view.indexOf('id="shag-6"'));
assert.ok(view.indexOf("<AiMusicIntroCta") > view.indexOf('id="shag-7"'));
assert.ok(view.indexOf("<AiMusicIntroCta") < view.indexOf('id="besplatno"'));

for (const href of [
  'href="/"',
  'href="/become-author"',
  'href="/distribyutor-ii-muzyki"',
  'href="/kak-zarabatyvat-na-ii-muzyke-v-audiolad"',
]) assert.match(view + introCta, new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(view, /Дистрибьютор ИИ-музыки: где публиковать и продавать нейромузыку/);
assert.match(view, /Как зарабатывать на своей ИИ-музыке в АудиоЛаде/);
assert.match(view, /Спокойная инструментальная музыка для массажа/);
assert.match(view, /10 треков примерно по 6 минут = около часа музыки/);
assert.match(view, /личного некоммерческого использования/);
for (const variant of ["Вариант 1", "Вариант 2", "Вариант 3", "Вариант 4"]) {
  assert.match(view, new RegExp(variant));
}
assert.match(view, /Вариант 4"[^]*Выбран лучший/);
assert.doesNotMatch(view, />and</);
assert.equal(view.includes("—"), false, "Russian content must use medium dash");
assert.equal(contentSource.includes("—"), false, "Russian SEO content must use medium dash");
assert.equal(KAK_SOZDAT_II_MUZYKU_FAQ.length, 8);
assert.match(view, /ArticleFaqList items=\{KAK_SOZDAT_II_MUZYKU_FAQ\}/);
assert.match(page, /buildAiMusicHubPageJsonLd/);
const graph = buildAiMusicHubPageJsonLd({
  title: KAK_SOZDAT_II_MUZYKU_PAGE_H1,
  description: KAK_SOZDAT_II_MUZYKU_SEO_DESCRIPTION,
  path: KAK_SOZDAT_II_MUZYKU_PATH,
  faq: KAK_SOZDAT_II_MUZYKU_FAQ,
}, "https://audiolad.ru")["@graph"];
assert.deepEqual(
  graph.map((node) => node["@type"]).filter((type) =>
    ["WebPage", "Article", "BreadcrumbList", "FAQPage"].includes(type),
  ),
  ["WebPage", "Article", "BreadcrumbList", "FAQPage"],
);
assert.equal(isBottomNavNeutralPathname(KAK_SOZDAT_II_MUZYKU_PATH), true);
assert.match(sitemapSource, /path: "\/kak-sozdat-ii-muzyku", changeFrequency: "monthly", priority: 0.7/);
console.log("kak-sozdat-ii-muzyku-page-unit: ok");
