#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  KAK_SOZDAT_MUZYKU_V_SUNO_FAQ,
  KAK_SOZDAT_MUZYKU_V_SUNO_PAGE_H1,
  KAK_SOZDAT_MUZYKU_V_SUNO_PATH,
  KAK_SOZDAT_MUZYKU_V_SUNO_SEO_DESCRIPTION,
  KAK_SOZDAT_MUZYKU_V_SUNO_SEO_TITLE,
} from "../src/lib/seo/kak-sozdat-muzyku-v-suno/content.ts";
import { buildAiMusicHubPageJsonLd } from "../src/lib/seo/json-ld/index.ts";
import { isBottomNavNeutralPathname } from "../src/lib/navigation/bottom-nav.ts";
import {
  buildKakSozdatMuzykuVSunoMetadata,
  buildSiteCanonicalUrl,
} from "../src/lib/seo/public-page-metadata.ts";

const view = readFileSync("src/components/kak-sozdat-muzyku-v-suno/KakSozdatMuzykuVSunoPageView.tsx", "utf8");
const page = readFileSync("src/app/(platform)/(listener)/kak-sozdat-muzyku-v-suno/page.tsx", "utf8");
const sitemapSource = readFileSync("src/lib/seo/sitemap-data.ts", "utf8");
const contentSource = readFileSync("src/lib/seo/kak-sozdat-muzyku-v-suno/content.ts", "utf8");
const indexSource = readFileSync("src/lib/seo/kak-sozdat-muzyku-v-suno/index.ts", "utf8");
const introCta = readFileSync("src/components/ai-music/AiMusicIntroCta.tsx", "utf8");
const externalAnchors = [...view.matchAll(/<a\b[^>]*>/g)].map((match) => match[0]);

assert.ok(externalAnchors.length > 0);
for (const anchor of externalAnchors) {
  assert.match(anchor, /\btarget\s*=\s*["_']_blank["_']/);
  assert.match(anchor, /\brel\s*=\s*["']noopener noreferrer["']/);
}

const metadata = buildKakSozdatMuzykuVSunoMetadata();
assert.equal(metadata.title, KAK_SOZDAT_MUZYKU_V_SUNO_SEO_TITLE);
assert.equal(metadata.description, KAK_SOZDAT_MUZYKU_V_SUNO_SEO_DESCRIPTION);
assert.equal(metadata.alternates?.canonical, buildSiteCanonicalUrl(KAK_SOZDAT_MUZYKU_V_SUNO_PATH));
assert.equal(metadata.alternates?.canonical, "https://audiolad.ru/kak-sozdat-muzyku-v-suno");
assert.equal(metadata.robots?.index, true);
assert.equal(metadata.robots?.follow, true);
assert.equal(KAK_SOZDAT_MUZYKU_V_SUNO_PAGE_H1, KAK_SOZDAT_MUZYKU_V_SUNO_SEO_TITLE);
assert.match(page, /buildAiMusicHubPageJsonLd/);

const visualNumbers = [...view.matchAll(/<\w+Visual\s*\/>/g)].map((match) => match[0]);
assert.deepEqual(visualNumbers, ["<WorkflowVisual />", "<ModesVisual />", "<EditVisual />", "<ProductVisual />"]);
assert.deepEqual([...view.matchAll(/data-visual-block=\{number\}/g)].length, 1);
assert.match(view, />Lyrics \+ Style \+ Instrumental \+ Title</);
for (const caption of [
  "Создание музыки в Suno удобнее воспринимать как последовательность итераций, а не как одну случайную генерацию.",
  "Начинающему удобно сначала почувствовать логику Suno в Simple Mode, а затем переходить к более точной настройке в Custom.",
  "После первой генерации необязательно начинать всё заново – удачный трек можно развивать и редактировать.",
  "Первая задача в Suno – не создать много музыки, а один раз пройти весь путь от идеи до готовой композиции.",
]) assert.match(view, new RegExp(caption.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

assert.equal(KAK_SOZDAT_MUZYKU_V_SUNO_FAQ.length, 8);
assert.deepEqual(KAK_SOZDAT_MUZYKU_V_SUNO_FAQ.map(({ question }) => question), [
  "Можно ли создать музыку в Suno бесплатно?",
  "Как создать музыку в Suno без слов?",
  "Можно ли добавить в Suno свой текст песни?",
  "Какую модель Suno выбрать новичку?",
  "Сколько длится музыка, созданная в Suno?",
  "Можно ли скачать музыку из Suno?",
  "Можно ли продавать музыку из Suno?",
  "Можно ли сначала создать песню бесплатно, а потом купить тариф и продавать её?",
]);
assert.match(view, /ArticleFaqList items=\{KAK_SOZDAT_MUZYKU_V_SUNO_FAQ\}/);
assert.ok(view.lastIndexOf('id="faq"') > view.lastIndexOf("<section"));

const graph = buildAiMusicHubPageJsonLd({
  title: KAK_SOZDAT_MUZYKU_V_SUNO_PAGE_H1,
  description: KAK_SOZDAT_MUZYKU_V_SUNO_SEO_DESCRIPTION,
  path: KAK_SOZDAT_MUZYKU_V_SUNO_PATH,
  faq: KAK_SOZDAT_MUZYKU_V_SUNO_FAQ,
}, "https://audiolad.ru")["@graph"];
assert.deepEqual(graph.map((node) => node["@type"]).filter((type) =>
  ["WebPage", "Article", "BreadcrumbList", "FAQPage"].includes(type),
), ["WebPage", "Article", "BreadcrumbList", "FAQPage"]);
assert.equal(isBottomNavNeutralPathname(KAK_SOZDAT_MUZYKU_V_SUNO_PATH), true);
assert.match(sitemapSource, /path: "\/kak-sozdat-muzyku-v-suno", changeFrequency: "monthly", priority: 0.7/);
assert.match(introCta, /href="\/"/);
assert.match(introCta, /href="\/become-author"/);
const ctaParagraphs = [
  "Когда у вас появится первый удачный трек из Suno, загляните в АудиоЛад. Посмотрите, как оформлены музыкальные продукты, что слушают пользователи и какие возможности есть у авторов музыки.",
  "Можно зарегистрироваться бесплатно, познакомиться с площадкой и заранее увидеть следующий этап – от готовой композиции к собственному музыкальному каталогу.",
];
assert.match(view, new RegExp(`AiMusicIntroCta paragraphs=\\{\\[${ctaParagraphs.map((paragraph) =>
  `"${paragraph.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).join(", ")}\\]\\}`));
for (const href of [
  'href="/v-kakoy-neyroseti-sozdat-muzyku"',
  'href="/kak-vylozhit-ii-muzyku"',
  'href="/distribyutor-ii-muzyki"',
  'href="/kak-zarabatyvat-na-ii-muzyke-v-audiolad"',
]) assert.match(view, new RegExp(href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.match(view, /https:\/\/suno\.com\/terms/);
for (const sourceUrl of [
  "https://help.suno.com/en/articles/13924737",
  "https://help.suno.com/en/articles/13924481",
  "https://help.suno.com/en/articles/2462273",
  "https://help.suno.com/en/articles/3726721",
  "https://help.suno.com/en/articles/2415873",
  "https://help.suno.com/en/articles/13926081",
  "https://help.suno.com/en/articles/13876865",
  "https://help.suno.com/en/articles/9601665",
  "https://help.suno.com/en/articles/2425729",
]) assert.match(view, new RegExp(sourceUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
for (const format of ["MP3", "WAV", "MIDI", "stems"]) {
  assert.match(view, new RegExp(format, "i"));
}
assert.match(view, /сохраняете права и право собственности на эти оригинальные слова/);
assert.match(view, /не расширяет автоматически коммерческие права на всю созданную песню/);
assert.equal(view.includes("—"), false, "Russian content must use medium dash");
assert.equal(contentSource.includes("—"), false, "Russian SEO content must use medium dash");
assert.doesNotMatch(view, /utm_/i);
assert.doesNotMatch(view, /\/(suno-studio|suno-pricing|create-music-with-suno)\b/);
assert.doesNotMatch(view, /<h2[^>]*>С чего начать|<h2[^>]*>Заключение|<h2[^>]*>Итоги/);
assert.match(indexSource, /KAK_SOZDAT_MUZYKU_V_SUNO_PATH/);
assert.match(indexSource, /KAK_SOZDAT_MUZYKU_V_SUNO_FAQ/);

const cyrillicWords = (`${view}\n${contentSource}`.match(/[А-Яа-яЁё]+/g) ?? []).length;
assert.ok(cyrillicWords >= 2200, `Expected at least 2200 Cyrillic words, got ${cyrillicWords}`);
console.log(`kak-sozdat-muzyku-v-suno-page-unit: ok (${cyrillicWords} Cyrillic words in view+content)`);
