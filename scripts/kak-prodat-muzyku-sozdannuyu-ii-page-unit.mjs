#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  KAK_PRODAT_MUZYKU_SOZDANNUYU_II_FAQ,
  KAK_PRODAT_MUZYKU_SOZDANNUYU_II_PAGE_H1,
  KAK_PRODAT_MUZYKU_SOZDANNUYU_II_PATH,
  KAK_PRODAT_MUZYKU_SOZDANNUYU_II_SEO_DESCRIPTION,
  KAK_PRODAT_MUZYKU_SOZDANNUYU_II_SEO_TITLE,
} from "../src/lib/seo/kak-prodat-muzyku-sozdannuyu-ii/content.ts";
import { buildAiMusicHubPageJsonLd } from "../src/lib/seo/json-ld/index.ts";
import { isBottomNavNeutralPathname } from "../src/lib/navigation/bottom-nav.ts";
import { buildKakProdatMuzykuSozdannuyuIiMetadata, buildSiteCanonicalUrl } from "../src/lib/seo/public-page-metadata.ts";

const view = readFileSync("src/components/kak-prodat-muzyku-sozdannuyu-ii/KakProdatMuzykuSozdannuyuIiPageView.tsx", "utf8");
const page = readFileSync("src/app/(platform)/(listener)/kak-prodat-muzyku-sozdannuyu-ii/page.tsx", "utf8");
const sitemap = readFileSync("src/lib/seo/sitemap-data.ts", "utf8");
const anchors = [...view.matchAll(/<a\b[^>]*>/g)].map((match) => match[0]);
for (const anchor of anchors) {
  assert.match(anchor, /target="_blank"/);
  assert.match(anchor, /rel="noopener noreferrer"/);
}

const metadata = buildKakProdatMuzykuSozdannuyuIiMetadata();
assert.equal(KAK_PRODAT_MUZYKU_SOZDANNUYU_II_PATH, "/kak-prodat-muzyku-sozdannuyu-ii");
assert.equal(KAK_PRODAT_MUZYKU_SOZDANNUYU_II_PAGE_H1, "Как продать музыку, созданную ИИ: где искать покупателей");
assert.equal(KAK_PRODAT_MUZYKU_SOZDANNUYU_II_SEO_TITLE, KAK_PRODAT_MUZYKU_SOZDANNUYU_II_PAGE_H1);
assert.equal(
  KAK_PRODAT_MUZYKU_SOZDANNUYU_II_SEO_DESCRIPTION,
  "Как продать музыку, созданную ИИ: кому нужна нейромузыка, где искать покупателей, как подготовить трек и права, выбрать формат продажи и сделать понятное предложение слушателю, автору контента или бизнесу.",
);
assert.equal(metadata.alternates?.canonical, buildSiteCanonicalUrl(KAK_PRODAT_MUZYKU_SOZDANNUYU_II_PATH));
assert.equal(metadata.alternates?.canonical, "https://audiolad.ru/kak-prodat-muzyku-sozdannuyu-ii");
assert.equal(metadata.robots?.index, true);
assert.equal(metadata.robots?.follow, true);
assert.match(page, /buildAiMusicHubPageJsonLd/);
assert.match(sitemap, /path: "\/kak-prodat-muzyku-sozdannuyu-ii", changeFrequency: "monthly", priority: 0.7/);
assert.equal(isBottomNavNeutralPathname(KAK_PRODAT_MUZYKU_SOZDANNUYU_II_PATH), true);

assert.equal(KAK_PRODAT_MUZYKU_SOZDANNUYU_II_FAQ.length, 8);
assert.deepEqual(KAK_PRODAT_MUZYKU_SOZDANNUYU_II_FAQ.map(({ question }) => question), [
  "Можно ли продавать музыку, созданную ИИ?",
  "Где можно продать музыку, созданную ИИ?",
  "Кто покупает ИИ-музыку?",
  "Можно ли продавать музыку из Suno?",
  "Нужно ли иметь авторские права, чтобы продавать ИИ-музыку?",
  "Можно ли продавать один и тот же трек нескольким покупателям?",
  "Как определить цену на ИИ-музыку?",
  "Как найти первого покупателя для своей музыки?",
]);
assert.match(view, /ArticleFaqList items=\{KAK_PRODAT_MUZYKU_SOZDANNUYU_II_FAQ\}/);
const faqIndex = view.lastIndexOf('id="faq"');
assert.ok(faqIndex > -1);
assert.equal(view.indexOf("<section", faqIndex + 1), -1);

for (const [number, caption] of [
  ["1", "Готовая музыка становится товаром или лицензируемым продуктом только тогда, когда покупателю понятно, для чего она подходит и что именно он получает после оплаты."],
  ["2", "Покупателю нужна не абстрактная «хорошая музыка», а музыка, которая решает его конкретную задачу."],
  ["3", "У одного музыкального произведения могут быть разные модели продажи, но права и условия каждой сделки должны быть понятны отдельно."],
  ["4", "Чем понятнее покупателю задача, цена и разрешённый способ использования музыки, тем проще принять решение о покупке."],
]) {
  assert.match(view, new RegExp(`number="${number}"`));
  assert.match(view, new RegExp(caption.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.equal((view.match(/data-visual-block=/g) ?? []).length, 1);
assert.match(view, /<SaleFunnelVisual \/>/);
assert.match(view, /<BuyerCardsVisual \/>/);
assert.match(view, /<SaleModelsVisual \/>/);
assert.match(view, /<PurchasePathVisual \/>/);

const saleFunnelPos = view.indexOf("<SaleFunnelVisual");
const buyerPos = view.indexOf("<BuyerCardsVisual");
const modelsPos = view.indexOf("<SaleModelsVisual");
const purchasePos = view.indexOf("<PurchasePathVisual");
assert.ok(saleFunnelPos < buyerPos && buyerPos < modelsPos && modelsPos < purchasePos);

for (const value of [
  "трек → права → покупатель → формат продажи → упаковка → предложение → сделка",
  "Проверьте права на созданный трек и исходные материалы.",
  "Определите, что именно вы хотите продавать: прослушивание, файл, лицензию или индивидуальную работу.",
  "Выберите конкретный тип покупателя.",
  "Опишите, для какой задачи подходит музыка.",
  "Подготовьте название, обложку, описание и короткое превью.",
  "Сформулируйте понятные условия использования.",
  "Разместите музыку там, где её может найти нужная аудитория.",
  "Предлагайте трек конкретным покупателям и сценариям использования.",
  "После сделки сохраняйте информацию о предоставленных правах и условиях.",
  "1. СНАЧАЛА ПРОВЕРЬТЕ, МОЖЕТЕ ЛИ ВЫ ПРОДАВАТЬ ЭТОТ ТРЕК",
  "2. РЕШИТЕ, ЧТО ИМЕННО ВЫ ПРОДАЁТЕ",
  "3. ОПРЕДЕЛИТЕ, КОМУ НУЖНА ИМЕННО ВАША МУЗЫКА",
  "4. НЕ ПРОДАВАЙТЕ «ПРОСТО MP3» – ПРОДАВАЙТЕ ПОНЯТНУЮ ЗАДАЧУ",
  "5. ПОДГОТОВЬТЕ МУЗЫКУ К ПРОДАЖЕ",
  "6. ГДЕ ИСКАТЬ ПОКУПАТЕЛЕЙ ИИ-МУЗЫКИ",
  "7. КАК СФОРМУЛИРОВАТЬ ПРЕДЛОЖЕНИЕ ПОКУПАТЕЛЮ",
  "8. КАК ОПРЕДЕЛИТЬ ЦЕНУ",
  "9. ЧТО ЗАФИКСИРОВАТЬ ПОСЛЕ ПРОДАЖИ",
  "КАК ПРОДАВАТЬ ИИ-МУЗЫКУ В АУДИОЛАДЕ",
  "ЧЕМ ПРОДАЖА ОТЛИЧАЕТСЯ ОТ ДИСТРИБУЦИИ",
  "ЧТО ДЕЛАТЬ, ЕСЛИ ПОКУПАТЕЛЕЙ ПОКА НЕТ",
  "Продажа экземпляра или доступа",
  "лицензия на использование",
  "СЛУШАТЕЛЬ",
  "АВТОР КОНТЕНТА",
  "БИЗНЕС",
  "ЗАКАЗЧИК",
  "ПОКУПКА СЛУШАТЕЛЕМ",
  "ЛИЦЕНЗИЯ ДЛЯ ПРОЕКТА",
  "ИНДИВИДУАЛЬНЫЙ ЗАКАЗ",
  "не даёт автоматически право публичного исполнения",
  "гарантирован",
  "/kak-sozdat-ii-muzyku",
  "/kak-sozdat-fonovuyu-muzyku-s-pomoshchyu-ii",
  "/kak-vylozhit-ii-muzyku",
  "/distribyutor-ii-muzyki",
  "/v-kakoy-neyroseti-sozdat-muzyku",
  "/kak-zarabatyvat-na-ii-muzyke-v-audiolad",
  "Если у вас уже есть готовая ИИ-музыка и вы думаете, как найти для неё покупателей, посмотрите, как музыкальные продукты устроены в АудиоЛаде. Здесь можно увидеть, как оформляется музыка, как её находят слушатели и какие возможности предусмотрены для авторов.",
  "Можно зарегистрироваться бесплатно, познакомиться с площадкой и подготовить свои музыкальные продукты к публикации, когда вы будете готовы.",
  "https://suno.com/terms",
  "https://help.suno.com/en/articles/9601665",
  "https://help.suno.com/en/articles/2425729",
  "Покупка платной подписки после создания трека на Free по умолчанию не даёт ему коммерческие права задним числом.",
  "Цена файла",
  "цена лицензии",
]) {
  assert.match(view, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

assert.doesNotMatch(view, /№10|№11|№12|заработать на ИИ-музыке: способы|музык[уи] из Suno.*(заработ|публикац)/i);
assert.doesNotMatch(view, /гарантированн(ый|ого) доход|автоматическ(ую|ая) продаж/i);
assert.doesNotMatch(view, /(?:как|цене|цену|множител\w*)[^\n]{0,40}2x|2×/i);

const graph = buildAiMusicHubPageJsonLd({
  title: KAK_PRODAT_MUZYKU_SOZDANNUYU_II_PAGE_H1,
  description: KAK_PRODAT_MUZYKU_SOZDANNUYU_II_SEO_DESCRIPTION,
  path: KAK_PRODAT_MUZYKU_SOZDANNUYU_II_PATH,
  faq: KAK_PRODAT_MUZYKU_SOZDANNUYU_II_FAQ,
}, "https://audiolad.ru")["@graph"];
assert.deepEqual(
  graph.map((node) => node["@type"]).filter((type) => ["WebPage", "Article", "BreadcrumbList", "FAQPage"].includes(type)),
  ["WebPage", "Article", "BreadcrumbList", "FAQPage"],
);
assert.equal(view.includes("—"), false);
assert.doesNotMatch(view, /utm_/i);
const cyrillicWords = (`${view}\n${readFileSync("src/lib/seo/kak-prodat-muzyku-sozdannuyu-ii/content.ts", "utf8")}`.match(/[А-Яа-яЁё]+/g) ?? []).length;
assert.ok(cyrillicWords >= 2200, `Expected at least 2200 Cyrillic words, got ${cyrillicWords}`);
console.log(`kak-prodat-muzyku-sozdannuyu-ii-page-unit: ok (${cyrillicWords} Cyrillic words)`);
