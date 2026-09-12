#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  KAK_VYLOZHIT_II_MUZYKU_FAQ,
  KAK_VYLOZHIT_II_MUZYKU_PAGE_H1,
  KAK_VYLOZHIT_II_MUZYKU_PATH,
  KAK_VYLOZHIT_II_MUZYKU_SEO_DESCRIPTION,
  KAK_VYLOZHIT_II_MUZYKU_SEO_TITLE,
} from "../src/lib/seo/kak-vylozhit-ii-muzyku/content.ts";
import { buildAiMusicHubPageJsonLd } from "../src/lib/seo/json-ld/index.ts";
import { isBottomNavNeutralPathname } from "../src/lib/navigation/bottom-nav.ts";
import {
  buildKakVylozhitIiMuzykuMetadata,
  buildSiteCanonicalUrl,
} from "../src/lib/seo/public-page-metadata.ts";

const view = readFileSync("src/components/kak-vylozhit-ii-muzyku/KakVylozhitIiMuzykuPageView.tsx", "utf8");
const page = readFileSync("src/app/(platform)/(listener)/kak-vylozhit-ii-muzyku/page.tsx", "utf8");
const sitemapSource = readFileSync("src/lib/seo/sitemap-data.ts", "utf8");
const contentSource = readFileSync("src/lib/seo/kak-vylozhit-ii-muzyku/content.ts", "utf8");
const introCta = readFileSync("src/components/ai-music/AiMusicIntroCta.tsx", "utf8");

const externalAnchors = [...view.matchAll(/<a\b[^>]*>/g)]
  .map((match) => match[0])
  .filter((anchor) => /\bhref\s*=\s*["']https:\/\/[^"']+["']/.test(anchor));

assert.ok(externalAnchors.length > 0);
for (const anchor of externalAnchors) {
  assert.match(anchor, /\btarget\s*=\s*["_']_blank["_']/);
  assert.match(anchor, /\brel\s*=\s*["']noopener noreferrer["']/);
}

const internalLinks = [...view.matchAll(/<Link\b[^>]*>/g)]
  .map((match) => match[0])
  .filter((link) => /\bhref\s*=\s*["']\/[^"']*["']/.test(link));
assert.ok(internalLinks.length > 0);
for (const link of internalLinks) {
  assert.doesNotMatch(link, /\btarget\s*=\s*["_']_blank["_']/);
}

const metadata = buildKakVylozhitIiMuzykuMetadata();
assert.equal(metadata.title, KAK_VYLOZHIT_II_MUZYKU_SEO_TITLE);
assert.equal(metadata.description, KAK_VYLOZHIT_II_MUZYKU_SEO_DESCRIPTION);
assert.equal(metadata.alternates?.canonical, buildSiteCanonicalUrl(KAK_VYLOZHIT_II_MUZYKU_PATH));
assert.equal(metadata.alternates?.canonical, "https://audiolad.ru/kak-vylozhit-ii-muzyku");
assert.equal(metadata.robots?.index, true);
assert.equal(metadata.robots?.follow, true);
assert.equal(KAK_VYLOZHIT_II_MUZYKU_PAGE_H1, KAK_VYLOZHIT_II_MUZYKU_SEO_TITLE);
assert.match(view, /KAK_VYLOZHIT_II_MUZYKU_PAGE_H1/);
assert.match(page, /buildAiMusicHubPageJsonLd/);

const visualNumbers = [...view.matchAll(/<Visual number="(\d)"/g)].map((match) => match[1]);
assert.deepEqual(visualNumbers, ["1", "2", "3", "4"]);
assert.ok(view.indexOf("<PublicationFlowVisual") < view.indexOf('id="korotko"'));
assert.ok(view.indexOf("<ReleaseKitVisual") > view.indexOf('id="shag-2"'));
assert.ok(view.indexOf("<ChannelsVisual") > view.indexOf('id="shag-3"'));
assert.ok(view.indexOf("<FormatsVisual") > view.indexOf('id="shag-5"'));
assert.ok(view.indexOf("<AiMusicIntroCta") > view.indexOf('id="shag-7"'));

assert.match(view, /AiMusicIntroCta paragraphs=/);
assert.match(introCta, /href="\/"/);
assert.match(introCta, /href="\/become-author"/);
for (const href of [
  'href="/kak-sozdat-ii-muzyku"',
  'href="/distribyutor-ii-muzyki"',
  'href="/kak-zarabatyvat-na-ii-muzyke-v-audiolad"',
]) assert.match(view, new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

assert.equal(KAK_VYLOZHIT_II_MUZYKU_FAQ.length, 8);
assert.match(view, /ArticleFaqList items=\{KAK_VYLOZHIT_II_MUZYKU_FAQ\}/);
const graph = buildAiMusicHubPageJsonLd({
  title: KAK_VYLOZHIT_II_MUZYKU_PAGE_H1,
  description: KAK_VYLOZHIT_II_MUZYKU_SEO_DESCRIPTION,
  path: KAK_VYLOZHIT_II_MUZYKU_PATH,
  faq: KAK_VYLOZHIT_II_MUZYKU_FAQ,
}, "https://audiolad.ru")["@graph"];
assert.deepEqual(
  graph.map((node) => node["@type"]).filter((type) =>
    ["WebPage", "Article", "BreadcrumbList", "FAQPage"].includes(type),
  ),
  ["WebPage", "Article", "BreadcrumbList", "FAQPage"],
);
assert.equal(isBottomNavNeutralPathname(KAK_VYLOZHIT_II_MUZYKU_PATH), true);
assert.match(sitemapSource, /path: "\/kak-vylozhit-ii-muzyku", changeFrequency: "monthly", priority: 0.7/);
assert.equal(KAK_VYLOZHIT_II_MUZYKU_FAQ[0].question, "Куда загрузить музыку, созданную ИИ?");
assert.match(view, /личная библиотека/);
assert.match(view, /публичный музыкальный релиз доставляется через дистрибьютора/);
assert.match(view, /Где лучше выложить первую ИИ-композицию/);
assert.equal(view.includes("—"), false, "Russian content must use medium dash");
assert.equal(contentSource.includes("—"), false, "Russian SEO content must use medium dash");
assert.doesNotMatch(view, /С чего начать/);
assert.ok(view.lastIndexOf('id="faq"') > view.lastIndexOf("<section"));

console.log("kak-vylozhit-ii-muzyku-page-unit: ok");
