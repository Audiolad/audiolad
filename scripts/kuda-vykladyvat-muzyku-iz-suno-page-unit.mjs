#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_FAQ,
  KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_PAGE_H1,
  KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_PATH,
  KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_SEO_DESCRIPTION,
  KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_SEO_TITLE,
} from "../src/lib/seo/kuda-vykladyvat-muzyku-iz-suno/content.ts";
import { buildAiMusicHubPageJsonLd } from "../src/lib/seo/json-ld/index.ts";
import { isBottomNavNeutralPathname } from "../src/lib/navigation/bottom-nav.ts";
import {
  buildKudaVykladyvatMuzykuIzSunoMetadata,
  buildSiteCanonicalUrl,
} from "../src/lib/seo/public-page-metadata.ts";

const view = readFileSync(
  "src/components/kuda-vykladyvat-muzyku-iz-suno/KudaVykladyvatMuzykuIzSunoPageView.tsx",
  "utf8",
);
const page = readFileSync(
  "src/app/(platform)/(listener)/kuda-vykladyvat-muzyku-iz-suno/page.tsx",
  "utf8",
);
const sitemap = readFileSync("src/lib/seo/sitemap-data.ts", "utf8");
const anchors = [...view.matchAll(/<a\b[^>]*>/g)].map((match) => match[0]);
for (const anchor of anchors) {
  assert.match(anchor, /target="_blank"/);
  assert.match(anchor, /rel="noopener noreferrer"/);
}

const metadata = buildKudaVykladyvatMuzykuIzSunoMetadata();
assert.equal(KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_PATH, "/kuda-vykladyvat-muzyku-iz-suno");
assert.equal(
  KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_PAGE_H1,
  "Куда выкладывать музыку из Суно (Suno): площадки для публикации и продажи",
);
assert.equal(KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_SEO_TITLE, KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_PAGE_H1);
assert.equal(
  KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_SEO_DESCRIPTION,
  "Куда выкладывать музыку из Суно (Suno) после создания трека: АудиоЛад, стриминговые сервисы, YouTube, соцсети и прямые продажи. Как выбрать площадку и проверить коммерческие права.",
);
assert.equal(
  metadata.alternates?.canonical,
  buildSiteCanonicalUrl(KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_PATH),
);
assert.equal(
  metadata.alternates?.canonical,
  "https://audiolad.ru/kuda-vykladyvat-muzyku-iz-suno",
);
assert.equal(metadata.robots?.index, true);
assert.equal(metadata.robots?.follow, true);
assert.match(page, /buildAiMusicHubPageJsonLd/);
assert.match(
  sitemap,
  /path: "\/kuda-vykladyvat-muzyku-iz-suno", changeFrequency: "monthly", priority: 0.7/,
);
assert.equal(isBottomNavNeutralPathname(KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_PATH), true);

assert.equal(KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_FAQ.length, 6);
assert.deepEqual(
  KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_FAQ.map(({ question }) => question),
  [
    "Можно ли выкладывать музыку из Суно (Suno) на Spotify?",
    "Можно ли выкладывать музыку из Суно на YouTube?",
    "Можно ли продавать музыку из Суно?",
    "Куда лучше загрузить музыку из Суно новичку?",
    "Можно ли одну композицию выложить сразу на несколько площадок?",
    "Можно ли монетизировать трек, созданный на бесплатном Суно?",
  ],
);
assert.match(view, /ArticleFaqList items=\{KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_FAQ\}/);
const faqIndex = view.lastIndexOf('id="faq"');
assert.ok(faqIndex > -1);
assert.equal(view.indexOf("<section", faqIndex + 1), -1);

for (const [number, caption] of [
  [
    "1",
    "Одной универсальной площадки нет: сначала выберите цель публикации, затем маршрут и площадку.",
  ],
  [
    "2",
    "Куда публиковать музыку из Суно зависит от цели: прослушивания, продажи, лицензирование, продвижение или работа с бизнесом.",
  ],
  [
    "3",
    "Перед тем как выкладывать музыку из Суно, проверьте права, исходники и правила выбранной площадки.",
  ],
  [
    "4",
    "Короткий маршрут после создания трека: проверить права, упаковать продукт, выбрать площадку, опубликовать и привести аудиторию.",
  ],
]) {
  assert.match(view, new RegExp(`number="${number}"`));
  assert.match(view, new RegExp(caption.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.equal((view.match(/data-visual-block=/g) ?? []).length, 1);
assert.match(view, /<GoalFunnelVisual \/>/);
assert.match(view, /<PlatformCardsVisual \/>/);
assert.match(view, /<PrePublishChecklistVisual \/>/);
assert.match(view, /<ShortRouteVisual \/>/);
assert.ok(view.indexOf("<GoalFunnelVisual") < view.indexOf("<PrePublishChecklistVisual"));
assert.ok(view.indexOf("<PrePublishChecklistVisual") < view.indexOf("<PlatformCardsVisual"));
assert.ok(view.indexOf("<PlatformCardsVisual") < view.indexOf("<ShortRouteVisual"));

const jsonLd = buildAiMusicHubPageJsonLd({
  title: KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_PAGE_H1,
  description: KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_SEO_DESCRIPTION,
  path: KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_PATH,
  datePublished: "2026-09-14",
  faq: KUDA_VYKLADYVAT_MUZYKU_IZ_SUNO_FAQ,
});
assert.ok(Array.isArray(jsonLd) || typeof jsonLd === "object");

for (const value of [
  "Сначала проверьте, можно ли коммерчески использовать музыку из Суно",
  "1. АудиоЛад – публикация музыки как самостоятельного продукта",
  "2. Spotify, Apple Music и другие стриминги – через дистрибьютора",
  "3. YouTube и видеоплатформы",
  "4. Социальные сети и короткие видео",
  "5. Прямая продажа музыки",
  "6. Лицензирование для авторов контента",
  "7. Музыка для бизнеса",
  "Где лучше публиковать музыку из Суно",
  "Как выложить музыку из Суно: короткий маршрут",
  "Нужно ли указывать, что музыка создана в Суно",
  "Можно ли выложить музыку из Суно бесплатно",
  "Куда двигаться дальше",
  "/kak-sozdat-muzyku-v-suno",
  "/kak-vylozhit-ii-muzyku",
  "/distribyutor-ii-muzyki",
  "/kak-prodat-muzyku-sozdannuyu-ii",
  "/mozhno-li-zarabotat-na-ii-muzyke",
  "/kak-zarabatyvat-na-ii-muzyke-v-audiolad",
  "/kak-sozdat-fonovuyu-muzyku-s-pomoshchyu-ii",
  "https://suno.com/terms",
  "https://help.suno.com/en/articles/9601665",
  "https://help.suno.com/en/articles/2425729",
  "не даёт коммерческие права задним числом",
  "fingerprint, watermark или metadata",
  "Если музыка уже создана, её можно оформить в АудиоЛаде как полноценный музыкальный продукт",
  "Можно зарегистрироваться бесплатно и начать с первого музыкального продукта, когда будете готовы.",
]) {
  assert.match(view, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

assert.doesNotMatch(view, /—/);
assert.doesNotMatch(view, /гарантированн(?:ый|ого|ая|ые) (?:доход|заработ)/i);
console.log("kuda-vykladyvat-muzyku-iz-suno page unit: ok");
