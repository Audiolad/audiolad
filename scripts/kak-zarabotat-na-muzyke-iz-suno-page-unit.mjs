#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_FAQ,
  KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_PAGE_H1,
  KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_PATH,
  KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_SEO_DESCRIPTION,
  KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_SEO_TITLE,
} from "../src/lib/seo/kak-zarabotat-na-muzyke-iz-suno/content.ts";
import { buildAiMusicHubPageJsonLd } from "../src/lib/seo/json-ld/index.ts";
import { isBottomNavNeutralPathname } from "../src/lib/navigation/bottom-nav.ts";
import {
  buildKakZarabotatNaMuzykeIzSunoMetadata,
  buildSiteCanonicalUrl,
} from "../src/lib/seo/public-page-metadata.ts";

const view = readFileSync(
  "src/components/kak-zarabotat-na-muzyke-iz-suno/KakZarabotatNaMuzykeIzSunoPageView.tsx",
  "utf8",
);
const page = readFileSync(
  "src/app/(platform)/(listener)/kak-zarabotat-na-muzyke-iz-suno/page.tsx",
  "utf8",
);
const sitemap = readFileSync("src/lib/seo/sitemap-data.ts", "utf8");
const anchors = [...view.matchAll(/<a\b[^>]*>/g)].map((match) => match[0]);
for (const anchor of anchors) {
  assert.match(anchor, /target="_blank"/);
  assert.match(anchor, /rel="noopener noreferrer"/);
}

const metadata = buildKakZarabotatNaMuzykeIzSunoMetadata();
assert.equal(KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_PATH, "/kak-zarabotat-na-muzyke-iz-suno");
assert.equal(
  KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_PAGE_H1,
  "Как заработать на музыке из Суно (Suno): способы продажи и монетизации",
);
assert.equal(KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_SEO_TITLE, KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_PAGE_H1);
assert.match(KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_SEO_TITLE, /Суно \(Suno\)/);
assert.equal(
  KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_SEO_DESCRIPTION,
  "Как заработать на музыке из Суно (Suno): стриминги, продажа треков, музыка на заказ, лицензирование, YouTube, бизнес и АудиоЛад. Что проверить перед монетизацией.",
);
assert.match(KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_SEO_DESCRIPTION, /Суно \(Suno\)/);
assert.equal(
  metadata.alternates?.canonical,
  buildSiteCanonicalUrl(KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_PATH),
);
assert.equal(
  metadata.alternates?.canonical,
  "https://audiolad.ru/kak-zarabotat-na-muzyke-iz-suno",
);
assert.equal(metadata.robots?.index, true);
assert.equal(metadata.robots?.follow, true);
assert.match(page, /buildAiMusicHubPageJsonLd/);
assert.match(
  sitemap,
  /path: "\/kak-zarabotat-na-muzyke-iz-suno", changeFrequency: "monthly", priority: 0.7/,
);
assert.equal(isBottomNavNeutralPathname(KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_PATH), true);

assert.equal(KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_FAQ.length, 6);
assert.deepEqual(
  KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_FAQ.map(({ question }) => question),
  [
    "Можно ли заработать на музыке из Суно (Suno)?",
    "Можно ли продавать музыку из Суно?",
    "Нужна ли платная подписка, чтобы зарабатывать на Суно?",
    "Как заработать на Суно через стриминги?",
    "Сколько можно заработать на музыке из Суно?",
    "С чего начать зарабатывать на Суно новичку?",
  ],
);
assert.match(view, /ArticleFaqList items=\{KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_FAQ\}/);
const faqIndex = view.lastIndexOf('id="faq"');
assert.ok(faqIndex > -1);
assert.equal(view.indexOf("<section", faqIndex + 1), -1);

for (const [number, caption] of [
  [
    "1",
    "Заработок появляется не в момент генерации, а когда у трека есть права, понятная модель монетизации и путь к слушателю или покупателю.",
  ],
  [
    "2",
    "Один каталог музыки из Суно может сочетать несколько моделей, если права и условия площадок это позволяют.",
  ],
  [
    "3",
    "Перед монетизацией проверьте тариф, факт разрешённого скачивания, исходные материалы и правила выбранной площадки.",
  ],
  [
    "4",
    "Новичку проще начать с одной ниши и одной модели, а затем развивать то, что получает реальный отклик.",
  ],
]) {
  assert.match(view, new RegExp(`number="${number}"`));
  assert.match(view, new RegExp(caption.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.equal((view.match(/data-visual-block=/g) ?? []).length, 1);
assert.match(view, /<MonetizationFunnelVisual \/>/);
assert.match(view, /<ModelCardsVisual \/>/);
assert.match(view, /<RightsChecklistVisual \/>/);
assert.match(view, /<StarterPathVisual \/>/);

assert.match(view, /Суно \(Suno\)/);
assert.match(view, /Суно/);
assert.match(view, /\bSuno\b/);
assert.doesNotMatch(view, /Суна/);
assert.doesNotMatch(view, /—/);

const jsonLd = buildAiMusicHubPageJsonLd({
  title: KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_PAGE_H1,
  description: KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_SEO_DESCRIPTION,
  path: KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_PATH,
  datePublished: "2026-09-14",
  faq: KAK_ZARABOTAT_NA_MUZYKE_IZ_SUNO_FAQ,
});
assert.ok(Array.isArray(jsonLd) || typeof jsonLd === "object");

for (const value of [
  "Музыку в Суно (Suno) можно создать за несколько минут",
  "1. Сначала проверьте коммерческие права",
  "2. Доход от прослушиваний и стримингов",
  "3. Продажа готовых композиций",
  "4. Музыка на заказ",
  "5. Лицензирование",
  "6. Собственный YouTube и контент",
  "7. Музыка для бизнеса",
  "8. Публикация в АудиоЛаде",
  "9. Несколько способов заработка сразу",
  "10. Нужно ли создавать много треков",
  "11. Сколько можно заработать",
  "12. Как начать зарабатывать на Суно",
  "13. А можно ли вообще зарабатывать на Суно",
  "/kuda-vykladyvat-muzyku-iz-suno",
  "/distribyutor-ii-muzyki",
  "/kak-prodat-muzyku-sozdannuyu-ii",
  "/mozhno-li-zarabotat-na-ii-muzyke",
  "/kak-zarabatyvat-na-ii-muzyke-v-audiolad",
  "/kak-sozdat-muzyku-v-suno",
  "https://suno.com/terms",
  "https://help.suno.com/en/articles/9601665",
  "https://help.suno.com/en/articles/2425729",
  "https://help.suno.com/en/articles/13876865",
  "не даёт коммерческие права задним числом",
  "20 download credits",
  "60",
  "Доход не гарантирован автоматически",
]) {
  assert.match(view, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

console.log("kak-zarabotat-na-muzyke-iz-suno page unit: ok");
