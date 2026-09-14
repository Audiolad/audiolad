#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_FAQ,
  MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_PAGE_H1,
  MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_PATH,
  MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_SEO_DESCRIPTION,
  MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_SEO_TITLE,
} from "../src/lib/seo/mozhno-li-zarabotat-na-ii-muzyke/content.ts";
import { buildAiMusicHubPageJsonLd } from "../src/lib/seo/json-ld/index.ts";
import { isBottomNavNeutralPathname } from "../src/lib/navigation/bottom-nav.ts";
import { buildMozhnoLiZarabotatNaIiMuzykeMetadata, buildSiteCanonicalUrl } from "../src/lib/seo/public-page-metadata.ts";

const view = readFileSync("src/components/mozhno-li-zarabotat-na-ii-muzyke/MozhnoLiZarabotatNaIiMuzykePageView.tsx", "utf8");
const page = readFileSync("src/app/(platform)/(listener)/mozhno-li-zarabotat-na-ii-muzyke/page.tsx", "utf8");
const sitemap = readFileSync("src/lib/seo/sitemap-data.ts", "utf8");
const anchors = [...view.matchAll(/<a\b[^>]*>/g)].map((match) => match[0]);
for (const anchor of anchors) {
  assert.match(anchor, /target="_blank"/);
  assert.match(anchor, /rel="noopener noreferrer"/);
}

const metadata = buildMozhnoLiZarabotatNaIiMuzykeMetadata();
assert.equal(MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_PATH, "/mozhno-li-zarabotat-na-ii-muzyke");
assert.equal(MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_PAGE_H1, "Можно ли заработать на ИИ-музыке: способы монетизации нейромузыки");
assert.equal(MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_SEO_TITLE, MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_PAGE_H1);
assert.equal(
  MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_SEO_DESCRIPTION,
  "Можно ли заработать на ИИ-музыке и какие способы монетизации существуют: продажа треков, лицензирование, музыка на заказ, дистрибуция, работа с авторами контента и публикация музыки на АудиоЛаде.",
);
assert.equal(metadata.alternates?.canonical, buildSiteCanonicalUrl(MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_PATH));
assert.equal(metadata.alternates?.canonical, "https://audiolad.ru/mozhno-li-zarabotat-na-ii-muzyke");
assert.equal(metadata.robots?.index, true);
assert.equal(metadata.robots?.follow, true);
assert.match(page, /buildAiMusicHubPageJsonLd/);
assert.match(sitemap, /path: "\/mozhno-li-zarabotat-na-ii-muzyke", changeFrequency: "monthly", priority: 0.7/);
assert.equal(isBottomNavNeutralPathname(MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_PATH), true);

assert.equal(MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_FAQ.length, 8);
assert.deepEqual(MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_FAQ.map(({ question }) => question), [
  "Можно ли заработать на ИИ-музыке?",
  "Как заработать на музыке, созданной нейросетью?",
  "Сколько можно заработать на ИИ-музыке?",
  "Можно ли зарабатывать на музыке из Суно (Suno)?",
  "Какие способы монетизации ИИ-музыки существуют?",
  "Можно ли продавать один ИИ-трек несколько раз?",
  "Нужны ли авторские права для монетизации ИИ-музыки?",
  "Как начать зарабатывать на ИИ-музыке новичку?",
]);
assert.match(view, /ArticleFaqList items=\{MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_FAQ\}/);
const faqIndex = view.lastIndexOf('id="faq"');
assert.ok(faqIndex > -1);
assert.equal(view.indexOf("<section", faqIndex + 1), -1);

for (const [number, caption] of [
  ["1", "Доход появляется не в момент генерации трека, а когда музыка получает понятную аудиторию, сценарий использования и модель монетизации."],
  ["2", "Один музыкальный каталог может работать с разными типами покупателей, если автор заранее понимает условия каждой модели."],
  ["3", "Музыкальный каталог может монетизироваться несколькими способами одновременно, если права и условия этих способов совместимы."],
  ["4", "Для начала проще проверить одну понятную нишу и несколько способов монетизации, а затем развивать то направление, которое получает реальный отклик."],
]) {
  assert.match(view, new RegExp(`number="${number}"`));
  assert.match(view, new RegExp(caption.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.equal((view.match(/data-visual-block=/g) ?? []).length, 1);
assert.match(view, /<MonetizationFunnelVisual \/>/);
assert.match(view, /<AudienceCardsVisual \/>/);
assert.match(view, /<OneTrackModelsVisual \/>/);
assert.match(view, /<StarterPathVisual \/>/);
assert.ok(view.indexOf("<MonetizationFunnelVisual") < view.indexOf("<AudienceCardsVisual"));
assert.ok(view.indexOf("<AudienceCardsVisual") < view.indexOf("<OneTrackModelsVisual"));
assert.ok(view.indexOf("<OneTrackModelsVisual") < view.indexOf("<StarterPathVisual"));

for (const value of [
  "трек → права → задача → аудитория → модель монетизации → доход",
  "музыка → права → аудитория или покупатель → модель монетизации → публикация / предложение → доход",
  "Продавать музыку слушателям как самостоятельный музыкальный продукт.",
  "Предоставлять лицензии на использование музыки в видео, подкастах, медитациях и других проектах.",
  "Создавать музыку на заказ под конкретную задачу клиента.",
  "Публиковать музыку через дистрибуцию и получать предусмотренные площадками выплаты за прослушивания.",
  "Создавать фоновую музыку для авторов контента и цифровых продуктов.",
  "Работать с бизнесом, если права и условия лицензии допускают нужный сценарий использования.",
  "Формировать каталог музыки под конкретную нишу вместо случайного набора треков.",
  "Использовать несколько моделей монетизации одного каталога, если права на музыку и условия площадок это позволяют.",
  "1. ПРОДАЖА МУЗЫКИ СЛУШАТЕЛЯМ",
  "2. ЛИЦЕНЗИРОВАНИЕ МУЗЫКИ ДЛЯ ЧУЖИХ ПРОЕКТОВ",
  "3. МУЗЫКА НА ЗАКАЗ",
  "4. ДОХОД ОТ ДИСТРИБУЦИИ И ПРОСЛУШИВАНИЙ",
  "5. ФОНОВАЯ МУЗЫКА ДЛЯ КОНТЕНТА",
  "6. МУЗЫКА ДЛЯ БИЗНЕСА",
  "7. ОДИН ТРЕК МОЖЕТ ИМЕТЬ НЕСКОЛЬКО ИСТОЧНИКОВ ДОХОДА",
  "8. КАК ЗАРАБАТЫВАТЬ НА ИИ-МУЗЫКЕ В АУДИОЛАДЕ",
  "9. ЧТО ВЫГОДНЕЕ: ОДИН ХИТ ИЛИ КАТАЛОГ",
  "10. ПОЧЕМУ У ОДНИХ МУЗЫКА МОНЕТИЗИРУЕТСЯ, А У ДРУГИХ НЕТ",
  "СКОЛЬКО МОЖНО ЗАРАБОТАТЬ НА ИИ-МУЗЫКЕ",
  "С ЧЕГО НАЧАТЬ НОВИЧКУ",
  "ПРОВЕРЬТЕ ПРАВА ДО МОНЕТИЗАЦИИ",
  "КАК ВЫБРАТЬ СВОЮ МОДЕЛЬ МОНЕТИЗАЦИИ",
  "продажу экземпляра",
  "лицензию на использование",
  "не даёт автоматически право публичного исполнения",
  "Доход с одного трека",
  "доход каталога",
  "/kak-sozdat-ii-muzyku",
  "/kak-prodat-muzyku-sozdannuyu-ii",
  "/kak-sozdat-fonovuyu-muzyku-s-pomoshchyu-ii",
  "/kak-vylozhit-ii-muzyku",
  "/distribyutor-ii-muzyki",
  "/kak-zarabatyvat-na-ii-muzyke-v-audiolad",
  "/v-kakoy-neyroseti-sozdat-muzyku",
  "Если у вас уже есть ИИ-музыка и вы думаете, как начать на ней зарабатывать, посмотрите, как музыкальные продукты устроены в АудиоЛаде. Здесь можно познакомиться с площадкой, посмотреть оформление музыки и увидеть, какие возможности предусмотрены для авторов.",
  "Можно зарегистрироваться бесплатно, выбрать подходящий формат публикации и постепенно формировать собственный музыкальный каталог.",
  "https://suno.com/terms",
  "https://help.suno.com/en/articles/9601665",
  "https://help.suno.com/en/articles/2425729",
  "не даёт коммерческие права задним числом",
]) {
  assert.match(view, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

assert.doesNotMatch(view, /№11|№12|как опубликовать музыку из Суно|заработ.*Suno.*(статья|гайд)/i);
assert.doesNotMatch(view, /гарантированн(ый|ого) доход|пассивный доход без усилий|можно быстро заработать/i);
assert.doesNotMatch(view, /\$\s*\d+|за 1000 прослушиваний|за тысячу прослушиваний.*\$/i);
assert.doesNotMatch(view, /(?:как|цене|цену|множител\w*)[^\n]{0,40}2x|2×/i);
assert.doesNotMatch(view, /utm_/i);
assert.equal(view.includes("—"), false);

const graph = buildAiMusicHubPageJsonLd({
  title: MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_PAGE_H1,
  description: MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_SEO_DESCRIPTION,
  path: MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_PATH,
  faq: MOZHNO_LI_ZARABOTAT_NA_II_MUZYKE_FAQ,
}, "https://audiolad.ru")["@graph"];
assert.deepEqual(
  graph.map((node) => node["@type"]).filter((type) => ["WebPage", "Article", "BreadcrumbList", "FAQPage"].includes(type)),
  ["WebPage", "Article", "BreadcrumbList", "FAQPage"],
);
const cyrillicWords = (`${view}\n${readFileSync("src/lib/seo/mozhno-li-zarabotat-na-ii-muzyke/content.ts", "utf8")}`.match(/[А-Яа-яЁё]+/g) ?? []).length;
assert.ok(cyrillicWords >= 2200, `Expected at least 2200 Cyrillic words, got ${cyrillicWords}`);
console.log(`mozhno-li-zarabotat-na-ii-muzyke-page-unit: ok (${cyrillicWords} Cyrillic words)`);
