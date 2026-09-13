#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_FAQ,
  V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_PAGE_H1,
  V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_PATH,
  V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_SEO_DESCRIPTION,
  V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_SEO_TITLE,
} from "../src/lib/seo/v-kakoy-neyroseti-sozdat-muzyku/content.ts";
import { buildAiMusicHubPageJsonLd } from "../src/lib/seo/json-ld/index.ts";
import { isBottomNavNeutralPathname } from "../src/lib/navigation/bottom-nav.ts";
import {
  buildSiteCanonicalUrl,
  buildVKakoyNeyrosetiSozdatMuzykuMetadata,
} from "../src/lib/seo/public-page-metadata.ts";

const view = readFileSync("src/components/v-kakoy-neyroseti-sozdat-muzyku/VKakoyNeyrosetiSozdatMuzykuPageView.tsx", "utf8");
const page = readFileSync("src/app/(platform)/(listener)/v-kakoy-neyroseti-sozdat-muzyku/page.tsx", "utf8");
const sitemapSource = readFileSync("src/lib/seo/sitemap-data.ts", "utf8");
const contentSource = readFileSync("src/lib/seo/v-kakoy-neyroseti-sozdat-muzyku/content.ts", "utf8");
const introCta = readFileSync("src/components/ai-music/AiMusicIntroCta.tsx", "utf8");

const externalAnchors = [...view.matchAll(/<a\b[^>]*>/g)]
  .map((match) => match[0])
  .filter((anchor) => /\bhref\s*=\s*["']https:\/\/[^"']+["']/.test(anchor));
assert.ok(externalAnchors.length > 0);
for (const anchor of externalAnchors) {
  assert.match(anchor, /\btarget\s*=\s*["_']_blank["_']/);
  assert.match(anchor, /\brel\s*=\s*["']noopener noreferrer["']/);
}

const metadata = buildVKakoyNeyrosetiSozdatMuzykuMetadata();
assert.equal(metadata.title, V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_SEO_TITLE);
assert.equal(metadata.description, V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_SEO_DESCRIPTION);
assert.equal(metadata.alternates?.canonical, buildSiteCanonicalUrl(V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_PATH));
assert.equal(metadata.alternates?.canonical, "https://audiolad.ru/v-kakoy-neyroseti-sozdat-muzyku");
assert.equal(metadata.robots?.index, true);
assert.equal(metadata.robots?.follow, true);
assert.equal(V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_PAGE_H1, V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_SEO_TITLE);
assert.match(page, /buildAiMusicHubPageJsonLd/);

const visualNumbers = [...view.matchAll(/<Visual number="(\d)"/g)].map((match) => match[1]);
assert.deepEqual(visualNumbers, ["1", "2", "3", "4"]);
assert.ok(view.indexOf("<TaskVisual") < view.indexOf('id="korotko"'));
assert.ok(view.indexOf("<SunoUdioVisual") > view.indexOf('id="udio"'));
assert.ok(view.indexOf("<ChoiceVisual") > view.indexOf('id="yandex-neuromusic"'));
assert.ok(view.indexOf("<RightsVisual") > view.indexOf('id="sudba-muzyki"'));
assert.ok(view.indexOf("<AiMusicIntroCta") > view.indexOf("<RightsVisual"));

for (const href of [
  'href="/kak-sozdat-ii-muzyku"',
  'href="/kak-vylozhit-ii-muzyku"',
  'href="/distribyutor-ii-muzyki"',
  'href="/kak-zarabatyvat-na-ii-muzyke-v-audiolad"',
]) assert.match(view, new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

assert.match(view, /Udio – для песен, вариантов и музыкальных экспериментов/);
assert.match(view, /скачивание аудио, видео и стемов отключено/);
assert.match(view, /не даёт коммерческую лицензию задним числом/);
assert.match(view, /самостоятельную музыку на DSP/);
assert.match(view, /бесконечная персонализированная мелодия/);
assert.match(view, /AiMusicIntroCta paragraphs=/);
assert.match(introCta, /href="\/"/);
assert.match(introCta, /href="\/become-author"/);
assert.equal(V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_FAQ.length, 8);
assert.match(view, /ArticleFaqList items=\{V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_FAQ\}/);

const graph = buildAiMusicHubPageJsonLd({
  title: V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_PAGE_H1,
  description: V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_SEO_DESCRIPTION,
  path: V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_PATH,
  faq: V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_FAQ,
}, "https://audiolad.ru")["@graph"];
assert.deepEqual(
  graph.map((node) => node["@type"]).filter((type) =>
    ["WebPage", "Article", "BreadcrumbList", "FAQPage"].includes(type),
  ),
  ["WebPage", "Article", "BreadcrumbList", "FAQPage"],
);
assert.equal(isBottomNavNeutralPathname(V_KAKOY_NEYROSETI_SOZDAT_MUZYKU_PATH), true);
assert.match(sitemapSource, /path: "\/v-kakoy-neyroseti-sozdat-muzyku", changeFrequency: "monthly", priority: 0.7/);
assert.equal(view.includes("—"), false, "Russian content must use medium dash");
assert.equal(contentSource.includes("—"), false, "Russian SEO content must use medium dash");
assert.doesNotMatch(view, /С чего начать|Итоги|Заключение/);

console.log("v-kakoy-neyroseti-sozdat-muzyku-page-unit: ok");
