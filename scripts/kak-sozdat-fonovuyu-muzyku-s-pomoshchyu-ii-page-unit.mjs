#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_FAQ,
  KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_PAGE_H1,
  KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_PATH,
  KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_SEO_DESCRIPTION,
  KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_SEO_TITLE,
} from "../src/lib/seo/kak-sozdat-fonovuyu-muzyku-s-pomoshchyu-ii/content.ts";
import { buildAiMusicHubPageJsonLd } from "../src/lib/seo/json-ld/index.ts";
import { isBottomNavNeutralPathname } from "../src/lib/navigation/bottom-nav.ts";
import { buildKakSozdatFonovuyuMuzykuSPomoshchyuIiMetadata, buildSiteCanonicalUrl } from "../src/lib/seo/public-page-metadata.ts";

const view = readFileSync("src/components/kak-sozdat-fonovuyu-muzyku-s-pomoshchyu-ii/KakSozdatFonovuyuMuzykuSPomoshchyuIiPageView.tsx", "utf8");
const page = readFileSync("src/app/(platform)/(listener)/kak-sozdat-fonovuyu-muzyku-s-pomoshchyu-ii/page.tsx", "utf8");
const sitemap = readFileSync("src/lib/seo/sitemap-data.ts", "utf8");
const anchors = [...view.matchAll(/<a\b[^>]*>/g)].map((match) => match[0]);
for (const anchor of anchors) {
  assert.match(anchor, /target="_blank"/);
  assert.match(anchor, /rel="noopener noreferrer"/);
}

const metadata = buildKakSozdatFonovuyuMuzykuSPomoshchyuIiMetadata();
assert.equal(KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_PATH, "/kak-sozdat-fonovuyu-muzyku-s-pomoshchyu-ii");
assert.equal(KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_PAGE_H1, "Как создать фоновую музыку с помощью ИИ");
assert.equal(KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_SEO_TITLE, KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_PAGE_H1);
assert.equal(KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_SEO_DESCRIPTION, "Как создать фоновую музыку с помощью ИИ: выбрать задачу, настроение, жанр, темп, инструменты и динамику, сделать музыку без слов, сравнить варианты и подготовить трек для видео, медитации, работы или пространства.");
assert.equal(metadata.alternates?.canonical, buildSiteCanonicalUrl(KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_PATH));
assert.equal(metadata.alternates?.canonical, "https://audiolad.ru/kak-sozdat-fonovuyu-muzyku-s-pomoshchyu-ii");
assert.equal(metadata.robots?.index, true);
assert.equal(metadata.robots?.follow, true);
assert.match(page, /buildAiMusicHubPageJsonLd/);
assert.match(sitemap, /path: "\/kak-sozdat-fonovuyu-muzyku-s-pomoshchyu-ii", changeFrequency: "monthly", priority: 0.7/);
assert.equal(isBottomNavNeutralPathname(KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_PATH), true);

assert.equal(KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_FAQ.length, 8);
assert.deepEqual(KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_FAQ.map(({ question }) => question), [
  "Можно ли создать фоновую музыку с помощью ИИ?",
  "Можно ли сделать фоновую музыку без слов и вокала?",
  "Как правильно описать фоновую музыку для нейросети?",
  "Как создать фоновую музыку для видео или подкаста?",
  "Как создать фоновую музыку для медитации?",
  "Какой ИИ подходит для создания фоновой музыки?",
  "Можно ли создать фоновую музыку бесплатно?",
  "Можно ли использовать созданную ИИ фоновую музыку коммерчески?",
]);
assert.match(view, /ArticleFaqList items=\{KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_FAQ\}/);
assert.ok(view.lastIndexOf('id="faq"') > view.lastIndexOf("<section", view.lastIndexOf('id="faq"')));

for (const [number, caption] of [
  ["1", "Фоновая музыка начинается не с жанра, а с понимания того, что человек будет делать, пока она звучит."],
  ["2", "Хороший фон поддерживает основное действие: его можно заметить, но он не обязан постоянно требовать внимания."],
  ["3", "Один и тот же генератор можно использовать для разных фоновых задач, если сначала описать контекст, в котором будет звучать музыка."],
  ["4", "Фоновую музыку лучше оценивать вместе с той деятельностью, речью или пространством, для которых она создаётся."],
]) {
  assert.match(view, new RegExp(`number="${number}"`));
  assert.match(view, new RegExp(caption.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.equal((view.match(/data-visual-block=/g) ?? []).length, 1);
for (const value of [
  "задача → настроение → темп → инструменты → динамика → несколько вариантов → проверка в контексте → готовый фон",
  "Определите, где и для чего будет звучать музыка.",
  "Решите, нужен ли вокал или лучше оставить трек инструментальным.",
  "Выберите настроение и жанровое направление.",
  "Задайте темп и основные инструменты.",
  "Опишите плотность и динамику звучания.",
  "Сформулируйте короткий и конкретный запрос.",
  "Создайте несколько вариантов.",
  "Послушайте лучший вариант в реальном контексте и доработайте его.",
  "Перед публикацией или коммерческим использованием проверьте лицензию и условия выбранного сервиса.",
  "СНАЧАЛА ОПРЕДЕЛИТЕ, ДЛЯ ЧЕГО НУЖНА МУЗЫКА",
  "ДЛЯ ФОНА ЧАСТО ЛУЧШЕ НАЧИНАТЬ С МУЗЫКИ БЕЗ СЛОВ",
  "ОПИШИТЕ НАСТРОЕНИЕ, А НЕ ПРОСТО «КРАСИВУЮ МУЗЫКУ»",
  "ЗАДАЙТЕ ТЕМП, ИНСТРУМЕНТЫ И ДИНАМИКУ",
  "СОБЕРИТЕ ПРОСТОЙ ТЕКСТОВЫЙ ЗАПРОС",
  "СОЗДАВАЙТЕ НЕСКОЛЬКО ВАРИАНТОВ",
  "СЛУШАЙТЕ ФОНОВУЮ МУЗЫКУ В ТОМ КОНТЕКСТЕ, ДЛЯ КОТОРОГО ОНА СОЗДАНА",
  "ДОРАБОТАЙТЕ ЛУЧШИЙ ВАРИАНТ",
  "ПРИМЕРЫ ЗАПРОСОВ ДЛЯ ФОНОВОЙ МУЗЫКИ",
  "ФОНОВАЯ МУЗЫКА ДЛЯ МЕДИТАЦИИ И АУДИОПРАКТИК",
  "ФОНОВАЯ МУЗЫКА ДЛЯ КАФЕ, РЕСТОРАНА И ДРУГИХ ПРОСТРАНСТВ",
  "КАКОЙ ИИ МОЖНО ИСПОЛЬЗОВАТЬ ДЛЯ ФОНОВОЙ МУЗЫКИ",
  "ПРОВЕРЬТЕ ПРАВА ДО ПУБЛИКАЦИИ И КОММЕРЧЕСКОГО ИСПОЛЬЗОВАНИЯ",
  "ЧТО ДЕЛАТЬ С ГОТОВОЙ ФОНОВОЙ МУЗЫКОЙ ДАЛЬШЕ",
  "/kak-sozdat-ii-muzyku", "/kak-sozdat-muzyku-po-tekstu-s-pomoshchyu-ii", "/kak-sozdat-muzyku-v-suno", "/v-kakoy-neyroseti-sozdat-muzyku", "/kak-vylozhit-ii-muzyku", "/distribyutor-ii-muzyki", "/kak-zarabatyvat-na-ii-muzyke-v-audiolad",
  "Если вы создаёте фоновую ИИ-музыку для медитаций, чтения, отдыха или других аудиоформатов, загляните в АудиоЛад. Послушайте музыку и аудиопрактики, посмотрите, как оформлены продукты и какие возможности есть у авторов.",
  "Можно зарегистрироваться бесплатно, познакомиться с площадкой и понять, какие музыкальные и авторские аудиоформаты вы хотите создавать и развивать дальше.",
  "Покупка платной подписки после создания трека на Free по умолчанию не даёт ему коммерческие права задним числом.",
]) assert.match(view, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

const graph = buildAiMusicHubPageJsonLd({
  title: KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_PAGE_H1,
  description: KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_SEO_DESCRIPTION,
  path: KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_PATH,
  faq: KAK_SOZDAT_FONOVUYU_MUZYKU_S_POMOSHCHYU_II_FAQ,
}, "https://audiolad.ru")["@graph"];
assert.deepEqual(graph.map((node) => node["@type"]).filter((type) => ["WebPage", "Article", "BreadcrumbList", "FAQPage"].includes(type)), ["WebPage", "Article", "BreadcrumbList", "FAQPage"]);
assert.equal(view.includes("—"), false);
assert.doesNotMatch(view, /utm_/i);
assert.doesNotMatch(view, /опубликовать (свою )?(музыку|песню) в АудиоЛаде|продать (музыку|песню) в АудиоЛаде|загрузить (музыку|песню) в АудиоЛад/i);
const cyrillicWords = (`${view}\n${readFileSync("src/lib/seo/kak-sozdat-fonovuyu-muzyku-s-pomoshchyu-ii/content.ts", "utf8")}`.match(/[А-Яа-яЁё]+/g) ?? []).length;
assert.ok(cyrillicWords >= 2200, `Expected at least 2200 Cyrillic words, got ${cyrillicWords}`);
console.log(`kak-sozdat-fonovuyu-muzyku-s-pomoshchyu-ii-page-unit: ok (${cyrillicWords} Cyrillic words)`);
