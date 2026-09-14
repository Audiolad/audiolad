#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  KAK_SOZDAT_MUZYKU_PO_TEKSTU_S_POMOSHCHYU_II_FAQ,
  KAK_SOZDAT_MUZYKU_PO_TEKSTU_S_POMOSHCHYU_II_PAGE_H1,
  KAK_SOZDAT_MUZYKU_PO_TEKSTU_S_POMOSHCHYU_II_PATH,
  KAK_SOZDAT_MUZYKU_PO_TEKSTU_S_POMOSHCHYU_II_SEO_DESCRIPTION,
  KAK_SOZDAT_MUZYKU_PO_TEKSTU_S_POMOSHCHYU_II_SEO_TITLE,
} from "../src/lib/seo/kak-sozdat-muzyku-po-tekstu-s-pomoshchyu-ii/content.ts";
import { buildAiMusicHubPageJsonLd } from "../src/lib/seo/json-ld/index.ts";
import { isBottomNavNeutralPathname } from "../src/lib/navigation/bottom-nav.ts";
import { buildKakSozdatMuzykuPoTekstuSPomoshchyuIiMetadata, buildSiteCanonicalUrl } from "../src/lib/seo/public-page-metadata.ts";

const view = readFileSync("src/components/kak-sozdat-muzyku-po-tekstu-s-pomoshchyu-ii/KakSozdatMuzykuPoTekstuSPomoshchyuIiPageView.tsx", "utf8");
const page = readFileSync("src/app/(platform)/(listener)/kak-sozdat-muzyku-po-tekstu-s-pomoshchyu-ii/page.tsx", "utf8");
const sitemap = readFileSync("src/lib/seo/sitemap-data.ts", "utf8");
const anchors = [...view.matchAll(/<a\b[^>]*>/g)].map((match) => match[0]);
const visual1 = view.match(/function TextTypesVisual\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
const visual3 = view.match(/function LyricsVisual\(\) \{[\s\S]*?\n\}/)?.[0] ?? "";
for (const anchor of anchors) {
  assert.match(anchor, /target="_blank"/);
  assert.match(anchor, /rel="noopener noreferrer"/);
}

const metadata = buildKakSozdatMuzykuPoTekstuSPomoshchyuIiMetadata();
assert.equal(KAK_SOZDAT_MUZYKU_PO_TEKSTU_S_POMOSHCHYU_II_PAGE_H1, "Как создать музыку по тексту с помощью ИИ");
assert.equal(KAK_SOZDAT_MUZYKU_PO_TEKSTU_S_POMOSHCHYU_II_SEO_TITLE, KAK_SOZDAT_MUZYKU_PO_TEKSTU_S_POMOSHCHYU_II_PAGE_H1);
assert.equal(KAK_SOZDAT_MUZYKU_PO_TEKSTU_S_POMOSHCHYU_II_SEO_DESCRIPTION, "Как создать музыку по тексту с помощью ИИ: превратить текстовое описание или готовые слова песни в музыку, подобрать стиль, темп, инструменты и вокал, сделать несколько вариантов и доработать готовый трек.");
assert.equal(metadata.title, KAK_SOZDAT_MUZYKU_PO_TEKSTU_S_POMOSHCHYU_II_SEO_TITLE);
assert.equal(metadata.description, KAK_SOZDAT_MUZYKU_PO_TEKSTU_S_POMOSHCHYU_II_SEO_DESCRIPTION);
assert.equal(metadata.alternates?.canonical, buildSiteCanonicalUrl(KAK_SOZDAT_MUZYKU_PO_TEKSTU_S_POMOSHCHYU_II_PATH));
assert.equal(metadata.alternates?.canonical, "https://audiolad.ru/kak-sozdat-muzyku-po-tekstu-s-pomoshchyu-ii");
assert.equal(metadata.robots?.index, true);
assert.equal(metadata.robots?.follow, true);
assert.match(page, /buildAiMusicHubPageJsonLd/);
assert.match(sitemap, /path: "\/kak-sozdat-muzyku-po-tekstu-s-pomoshchyu-ii", changeFrequency: "monthly", priority: 0.7/);
assert.equal(isBottomNavNeutralPathname(KAK_SOZDAT_MUZYKU_PO_TEKSTU_S_POMOSHCHYU_II_PATH), true);

assert.equal(KAK_SOZDAT_MUZYKU_PO_TEKSTU_S_POMOSHCHYU_II_FAQ.length, 8);
assert.deepEqual(KAK_SOZDAT_MUZYKU_PO_TEKSTU_S_POMOSHCHYU_II_FAQ.map(({ question }) => question), [
  "Можно ли создать музыку по тексту с помощью ИИ?",
  "Чем текстовое описание музыки отличается от текста песни?",
  "Можно ли загрузить свой текст песни и создать к нему музыку?",
  "Можно ли создать по тексту музыку без вокала?",
  "Как правильно написать текстовый запрос для генерации музыки?",
  "Можно ли создать музыку по тексту бесплатно?",
  "Можно ли использовать созданную ИИ-музыку коммерчески?",
  "Какой ИИ лучше подходит для создания музыки по тексту?",
]);
assert.match(view, /ArticleFaqList items=\{KAK_SOZDAT_MUZYKU_PO_TEKSTU_S_POMOSHCHYU_II_FAQ\}/);
assert.ok(view.lastIndexOf('id="faq"') > view.lastIndexOf("<section", view.lastIndexOf('id="faq"')));
assert.equal((visual1.match(/>ТЕКСТ</g) ?? []).length, 1);
for (const value of ["Описание музыки", "Стиль + настроение + инструменты", "Инструментальный трек или песня", "Готовые слова", "Текст песни + музыкальное направление", "Музыка под текст", "sm:grid-cols-2"]) assert.match(visual1, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
for (const value of ["СЛОВА", "Что должно быть спето?", "МУЗЫКАЛЬНОЕ НАПРАВЛЕНИЕ", "Как это должно звучать?", "ВОКАЛ", "Как это должно быть исполнено?", "НЕСКОЛЬКО ВАРИАНТОВ ПЕСНИ"]) assert.match(visual3, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.doesNotMatch(visual3, /МУЗЫКАЛЬНОЕ НАПРАВЛЕНИЕ<\/b><br \/>ВОКАЛ/);

for (const value of [
  'number="1"', 'number="2"', 'number="3"', 'number="4"',
  "Сначала определите, что именно является вашим текстом: описание будущего звучания или уже готовые слова песни.",
  "Хороший текстовый запрос описывает не абстрактную «красивую музыку», а несколько конкретных музыкальных характеристик.",
  "Если слова уже написаны, текст песни лучше отделять от описания музыкального стиля и характера исполнения.",
  "Лучший результат обычно появляется не из самого длинного запроса, а из нескольких последовательных уточнений после прослушивания.",
  "текст → музыкальная задача → несколько вариантов → выбор → уточнение → готовый трек",
  "КАК СОЗДАТЬ ИНСТРУМЕНТАЛЬНУЮ МУЗЫКУ ПО ОПИСАНИЮ",
  "КАК СОЗДАТЬ МУЗЫКУ ПОД ГОТОВЫЙ ТЕКСТ ПЕСНИ",
  "ПРОВЕРЬТЕ ПРАВА ДО КОММЕРЧЕСКОГО ИСПОЛЬЗОВАНИЯ",
  "ЧТО ДЕЛАТЬ С ГОТОВОЙ МУЗЫКОЙ ДАЛЬШЕ",
  "https://help.suno.com/en/articles/2415873",
  "Стандартная генерация Суно v6 создаёт две песни общей стоимостью 10 credits.",
  "Покупка платной подписки после создания трека на Free по умолчанию не даёт ему коммерческие права задним числом.",
  "Когда у вас получится первый удачный трек по текстовому описанию, загляните в АудиоЛад. Послушайте музыку и аудиопрактики, посмотрите, как оформлены продукты и какие возможности есть у авторов.",
  "Можно зарегистрироваться бесплатно, познакомиться с площадкой и понять, какие музыкальные и авторские аудиоформаты вы захотите создавать и развивать дальше.",
  "/kak-sozdat-ii-muzyku", "/kak-sozdat-pesnyu-s-pomoshchyu-ii", "/kak-vylozhit-ii-muzyku", "/distribyutor-ii-muzyki", "/kak-zarabatyvat-na-ii-muzyke-v-audiolad", "/kak-sozdat-muzyku-v-suno", "/v-kakoy-neyroseti-sozdat-muzyku",
]) assert.match(view, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.doesNotMatch(view, /если это остаётся текущим режимом/);

for (const step of [
  "Определите, что у вас есть: описание музыки или готовый текст песни.",
  "Сформулируйте музыкальную задачу.",
  "Укажите настроение и жанр.",
  "Добавьте темп, инструменты и характер звучания.",
  "Решите, нужен ли вокал.",
  "Если у вас есть свои слова, внесите их отдельно от описания стиля.",
  "Создайте несколько вариантов.",
  "Доработайте лучший результат.",
  "Перед публикацией или коммерческим использованием проверьте права и условия выбранного сервиса.",
]) assert.match(view, new RegExp(step.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

const graph = buildAiMusicHubPageJsonLd({
  title: KAK_SOZDAT_MUZYKU_PO_TEKSTU_S_POMOSHCHYU_II_PAGE_H1,
  description: KAK_SOZDAT_MUZYKU_PO_TEKSTU_S_POMOSHCHYU_II_SEO_DESCRIPTION,
  path: KAK_SOZDAT_MUZYKU_PO_TEKSTU_S_POMOSHCHYU_II_PATH,
  faq: KAK_SOZDAT_MUZYKU_PO_TEKSTU_S_POMOSHCHYU_II_FAQ,
}, "https://audiolad.ru")["@graph"];
assert.deepEqual(graph.map((node) => node["@type"]).filter((type) => ["WebPage", "Article", "BreadcrumbList", "FAQPage"].includes(type)), ["WebPage", "Article", "BreadcrumbList", "FAQPage"]);
assert.equal(view.includes("—"), false);
assert.doesNotMatch(view, /utm_/i);
assert.doesNotMatch(view, /опубликовать (свою )?(музыку|песню) в АудиоЛаде|продать (музыку|песню) в АудиоЛаде|загрузить (музыку|песню) в АудиоЛад/i);
const cyrillicWords = (`${view}\n${readFileSync("src/lib/seo/kak-sozdat-muzyku-po-tekstu-s-pomoshchyu-ii/content.ts", "utf8")}`.match(/[А-Яа-яЁё]+/g) ?? []).length;
assert.ok(cyrillicWords >= 2200, `Expected at least 2200 Cyrillic words, got ${cyrillicWords}`);
console.log(`kak-sozdat-muzyku-po-tekstu-s-pomoshchyu-ii-page-unit: ok (${cyrillicWords} Cyrillic words)`);
