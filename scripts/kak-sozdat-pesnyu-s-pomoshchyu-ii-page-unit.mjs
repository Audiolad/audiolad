#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_FAQ,
  KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_PAGE_H1,
  KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_PATH,
  KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_SEO_DESCRIPTION,
  KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_SEO_TITLE,
} from "../src/lib/seo/kak-sozdat-pesnyu-s-pomoshchyu-ii/content.ts";
import { buildAiMusicHubPageJsonLd } from "../src/lib/seo/json-ld/index.ts";
import { isBottomNavNeutralPathname } from "../src/lib/navigation/bottom-nav.ts";
import { buildKakSozdatPesnyuSPomoshchyuIiMetadata, buildSiteCanonicalUrl } from "../src/lib/seo/public-page-metadata.ts";

const view = readFileSync("src/components/kak-sozdat-pesnyu-s-pomoshchyu-ii/KakSozdatPesnyuSPomoshchyuIiPageView.tsx", "utf8");
const page = readFileSync("src/app/(platform)/(listener)/kak-sozdat-pesnyu-s-pomoshchyu-ii/page.tsx", "utf8");
const sitemap = readFileSync("src/lib/seo/sitemap-data.ts", "utf8");
const anchors = [...view.matchAll(/<a\b[^>]*>/g)].map((match) => match[0]);
for (const anchor of anchors) {
  assert.match(anchor, /target="_blank"/);
  assert.match(anchor, /rel="noopener noreferrer"/);
}
const metadata = buildKakSozdatPesnyuSPomoshchyuIiMetadata();
assert.equal(metadata.title, KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_SEO_TITLE);
assert.equal(metadata.description, KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_SEO_DESCRIPTION);
assert.equal(metadata.alternates?.canonical, buildSiteCanonicalUrl(KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_PATH));
assert.equal(metadata.alternates?.canonical, "https://audiolad.ru/kak-sozdat-pesnyu-s-pomoshchyu-ii");
assert.equal(metadata.robots?.index, true);
assert.equal(metadata.robots?.follow, true);
assert.equal(KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_PAGE_H1, KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_SEO_TITLE);
assert.match(page, /buildAiMusicHubPageJsonLd/);
assert.equal(KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_FAQ.length, 8);
assert.deepEqual(KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_FAQ.map(({ question }) => question), [
  "Можно ли создать песню с помощью ИИ бесплатно?",
  "Может ли ИИ написать текст песни?",
  "Можно ли использовать свой текст песни?",
  "Можно ли создать песню со своим голосом?",
  "Можно ли сделать песню, если я вообще не умею петь?",
  "Какой ИИ лучше использовать для создания песни?",
  "Можно ли продавать песню, созданную ИИ?",
  "Нужно ли указывать, что песня создана с помощью ИИ?",
]);
assert.match(view, /ArticleFaqList items=\{KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_FAQ\}/);
assert.ok(view.lastIndexOf('id="faq"') > view.lastIndexOf("<section"));
assert.deepEqual([...view.matchAll(/data-visual-block=\{number\}/g)].length, 1);
for (const caption of [
  "ИИ может собрать песню целиком, но результат становится значительно управляемее, когда вы отдельно продумываете текст, музыку и вокал.",
  "Песня становится управляемой, когда вы рассматриваете текст, музыку и голос как три самостоятельных слоя одного произведения.",
  "Не ищите идеальную генерацию. Ищите лучший материал, который стоит развивать.",
  "ИИ ускоряет создание песни, но выбор идеи, смысла и финального варианта всё равно остаётся творческой работой автора.",
]) assert.match(view, new RegExp(caption.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
const graph = buildAiMusicHubPageJsonLd({
  title: KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_PAGE_H1,
  description: KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_SEO_DESCRIPTION,
  path: KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_PATH,
  faq: KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_FAQ,
}, "https://audiolad.ru")["@graph"];
assert.deepEqual(graph.map((node) => node["@type"]).filter((type) => ["WebPage", "Article", "BreadcrumbList", "FAQPage"].includes(type)), ["WebPage", "Article", "BreadcrumbList", "FAQPage"]);
assert.equal(isBottomNavNeutralPathname(KAK_SOZDAT_PESNYU_S_POMOSHCHYU_II_PATH), true);
assert.match(sitemap, /path: "\/kak-sozdat-pesnyu-s-pomoshchyu-ii", changeFrequency: "monthly", priority: 0.7/);
for (const step of [
  "Определите тему и настроение.",
  "Решите, кто пишет текст.",
  "Выберите музыкальный стиль.",
  "Определите характер вокала.",
  "Соберите описание песни.",
  "Создайте несколько вариантов.",
  "Сравните текст, мелодию, вокал и структуру.",
  "Доработайте лучший.",
  "Проверьте права на текст, голос и музыку.",
  "Подготовьте песню к публикации.",
]) assert.match(view, new RegExp(step.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
for (const lock of [
  "идея → текст → музыка → вокал → генерация → выбор → доработка → готовая песня",
  "Сделай красивую поп-песню.",
  "На кухне осталась твоя синяя чашка.",
  "Voice model",
]) assert.match(view, new RegExp(lock.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
for (const url of ["11362369", "13924481", "2415873", "2416769", "9601665", "2746945", "2425729", "12683565"]) assert.match(view, new RegExp(url));
assert.match(view, /Если вам интересно работать с аудиоформатами дальше, загляните в АудиоЛад\./);
assert.match(view, /Можно зарегистрироваться бесплатно, познакомиться с площадкой и посмотреть, какие музыкальные и авторские аудиоформаты вы захотите создавать дальше\./);
assert.doesNotMatch(view, /опубликовать (свою )?песню в АудиоЛаде|продать песню в АудиоЛаде|загрузить песню в АудиоЛад/i);
assert.equal(view.includes("—"), false);
assert.doesNotMatch(view, /utm_/i);
assert.doesNotMatch(view, /noindex/i);
const cyrillicWords = (`${view}\n${readFileSync("src/lib/seo/kak-sozdat-pesnyu-s-pomoshchyu-ii/content.ts", "utf8")}`.match(/[А-Яа-яЁё]+/g) ?? []).length;
assert.ok(cyrillicWords >= 2200, `Expected at least 2200 Cyrillic words, got ${cyrillicWords}`);
console.log(`kak-sozdat-pesnyu-s-pomoshchyu-ii-page-unit: ok (${cyrillicWords} Cyrillic words)`);
