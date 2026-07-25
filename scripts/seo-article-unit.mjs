#!/usr/bin/env node
/**
 * SEO article unit checks — no DB, no network.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isPlatformAnalyticsEventName } from "../src/lib/analytics/constants.ts";
import {
  buildAnalyticsConsentBannerBottomOffset,
} from "../src/lib/analytics/consent-banner-layout.ts";
import {
  buildArticleJsonLdGraph,
  buildArticleMetadata,
  buildArticlePath,
  buildCatalogPracticeKeyIndex,
  estimateArticleReadingTimeMinutes,
  getArticleBySlug,
  isValidArticleSlug,
  listArticleSlugs,
  listArticlesByTopicSlug,
  resolveArticlePrimaryPractice,
} from "../src/lib/seo/articles/index.ts";
import { mapArticleDefinitionsToSitemapEntries } from "../src/lib/seo/sitemap-data.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(relPath) {
  return readFileSync(join(ROOT, relPath), "utf8");
}

assert(isValidArticleSlug("kak-razvit-lyubov-k-sebe"), "valid article slug");
assert(!isValidArticleSlug("Любовь"), "rejects cyrillic slug");
assert(
  buildArticlePath("kak-razvit-lyubov-k-sebe") ===
    "/articles/kak-razvit-lyubov-k-sebe",
  "article path",
);

const article = getArticleBySlug("kak-razvit-lyubov-k-sebe");
assert(article, "article registered");
assert(
  article.title === "Как развить любовь к себе: 7 практических шагов",
  "H1 title",
);
assert(article.topicSlug === "lyubov-k-sebe", "topic slug");
assert(article.topicHref === "/topics/lyubov-k-sebe", "topic href");
assert(
  article.primaryPractice.practiceKey === "elixir-molodosti",
  "primary practice key is data-driven slot",
);
assert(
  article.primaryPracticeEyebrow === "Практика по теме статьи",
  "primary practice eyebrow is article-specific",
);
assert(
  article.primaryPracticeIntro.includes("Эликсир Молодости"),
  "primary practice intro frames the practice",
);
assert(
  !article.primaryPracticeIntro.includes("—"),
  "primary practice intro uses medium dash, not em dash",
);
assert(
  article.relatedPractices.every((item) => item.practiceKey && item.blurb),
  "related practices use practiceKey slots",
);
assert(article.faq.length === 5, "faq count");
assert(article.authorLabel === "Редакция АудиоЛада", "editorial author");
assert(
  article.leadBeforeAudio ===
    "Любовь к себе редко начинается с громких обещаний. Иногда достаточно сделать один небольшой шаг навстречу себе.",
  "opening body paragraph kept in leadBeforeAudio field",
);
assert(
  article.introAfterAudio.some((paragraph) =>
    paragraph.includes("когда мы замечаем, что устали"),
  ),
  "full former lead meaning kept in body intro",
);
assert(
  !article.leadBeforeAudio.includes("—"),
  "lead uses medium dash, not em dash",
);
assert(
  article.captionAfterAudio.includes("–") &&
    !article.captionAfterAudio.includes("—"),
  "caption uses medium dash",
);
assert(listArticleSlugs().includes("kak-razvit-lyubov-k-sebe"), "slug list");
assert(
  listArticleSlugs().includes(
    "meditatsiya-na-dengi-kak-rabotat-s-vnimaniem-i-denezhnym-nastroem",
  ),
  "money article slug list",
);

const moneyArticle = getArticleBySlug(
  "meditatsiya-na-dengi-kak-rabotat-s-vnimaniem-i-denezhnym-nastroem",
);
assert(moneyArticle, "money article registered");
assert(
  moneyArticle.title ===
    "Медитация на деньги: как работать с вниманием и денежным настроем",
  "money article H1",
);
assert(moneyArticle.topicSlug === "meditatsii-na-dengi", "money topic slug");
assert(
  moneyArticle.topicHref === "/topics/meditatsii-na-dengi",
  "money topic href",
);
assert(
  moneyArticle.primaryPractice.practiceKey === "energiya-denezhnogo-puti",
  "money primary practice key",
);
assert(
  moneyArticle.primaryPracticeIntro.includes("Энергия Денежного Пути"),
  "money practice intro names practice",
);
assert(
  !moneyArticle.primaryPracticeIntro.includes("—"),
  "money practice intro uses medium dash",
);
assert(moneyArticle.faq.length === 3, "money faq count");
assert(
  moneyArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-razvit-lyubov-k-sebe",
  ),
  "money article links to love article",
);
assert(
  moneyArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-voyti-v-sostoyanie-izobiliya",
  ),
  "money article links to abundance article",
);
assert(
  moneyArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/chto-takoe-denezhnyy-potok",
  ),
  "money article reverse-links to money flow article",
);
assert(
  !JSON.stringify(moneyArticle).includes(
    "/articles/kak-vojti-v-sostoyanie-izobiliya",
  ),
  "no broken typo abundance URL",
);
assert(
  moneyArticle.seeAlsoLinks.some(
    (item) => item.href === "/topics/meditatsii-na-dengi",
  ),
  "money see-also includes hub",
);

const abundanceArticle = getArticleBySlug("kak-voyti-v-sostoyanie-izobiliya");
assert(abundanceArticle, "abundance article registered");
assert(
  abundanceArticle.title.includes("состояние изобилия"),
  "abundance H1",
);
assert(abundanceArticle.topicSlug === "izobilie", "abundance topic slug");
assert(
  abundanceArticle.topicHref === "/topics/izobilie",
  "abundance topic href",
);
assert(
  abundanceArticle.primaryPractice.practiceKey === "klyuch-k-izobiliyu",
  "abundance primary practice",
);
assert(
  abundanceArticle.primaryPracticeIntro.includes("Ключ к Изобилию"),
  "abundance practice intro",
);
assert(
  abundanceArticle.leadBeforeAudio ===
    "Иногда кажется, что жизнь превратилась в бесконечную гонку.",
  "abundance opening body paragraph",
);
assert(
  abundanceArticle.introAfterAudio[0] === "Нужно успеть больше.",
  "abundance intro continues after opening paragraph",
);
assert(
  !abundanceArticle.introAfterAudio.includes(abundanceArticle.leadBeforeAudio),
  "abundance opening paragraph is not duplicated in introAfterAudio",
);
assert(
  abundanceArticle.metaDescription !== abundanceArticle.leadBeforeAudio,
  "abundance SEO description stays separate from body lead",
);
assert(
  abundanceArticle.metaDescription.includes("состояние изобилия"),
  "abundance metaDescription kept for SEO/cards",
);
assert(
  !abundanceArticle.primaryPracticeIntro.includes("—") &&
    !abundanceArticle.shortAnswer.includes("—"),
  "abundance uses medium dash",
);
assert(abundanceArticle.faq.length === 3, "abundance faq count");
assert(
  abundanceArticle.afterFinalAudio?.some(
    (item) =>
      item.href === "/practice/sergey-and-zoya/kod-prityazheniya",
  ),
  "abundance links to Kod Prityazheniya practice",
);
assert(
  abundanceArticle.afterFinalAudio?.some(
    (item) =>
      item.href ===
      "/articles/meditatsiya-na-dengi-kak-rabotat-s-vnimaniem-i-denezhnym-nastroem",
  ),
  "abundance links to money article",
);
assert(
  abundanceArticle.afterFinalAudio?.some(
    (item) =>
      !item.href && item.before.includes("Мышление дефицита"),
  ),
  "deficit-thinking mention stays without live link",
);
assert(
  Boolean(abundanceArticle.brandNote?.includes("АудиоЛаде")),
  "abundance has brand note",
);
assert(
  abundanceArticle.seeAlsoLinks.some((item) => item.href === "/topics/izobilie"),
  "abundance see-also includes hub",
);
assert(
  listArticleSlugs().includes("kak-voyti-v-sostoyanie-izobiliya"),
  "abundance in slug list",
);
assert(
  abundanceArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/besplatnye-meditatsii-onlayn",
  ),
  "abundance reverse-links to free meditations article",
);

const freeMeditationsArticle = getArticleBySlug("besplatnye-meditatsii-onlayn");
assert(freeMeditationsArticle, "free meditations article registered");
assert(
  freeMeditationsArticle.title ===
    "Бесплатные медитации онлайн: как выбрать практику, которая действительно поможет",
  "free meditations H1",
);
assert(
  freeMeditationsArticle.metaTitle.includes("АудиоЛад") &&
    !freeMeditationsArticle.metaTitle.includes("АудиоЛад – АудиоЛад"),
  "free meditations SEO title has brand once",
);
assert(
  freeMeditationsArticle.metaDescription ===
    "Как выбрать бесплатную медитацию онлайн, на что обратить внимание перед прослушиванием и с какой короткой аудиопрактики начать знакомство с медитациями.",
  "free meditations metaDescription",
);
assert(
  freeMeditationsArticle.metaDescription !==
    freeMeditationsArticle.leadBeforeAudio,
  "free meditations metaDescription is not visual lead",
);
assert(
  freeMeditationsArticle.topicSlug === "besplatnye-meditatsii",
  "free meditations topic hub",
);
assert(
  freeMeditationsArticle.topicHref === "/topics/besplatnye-meditatsii",
  "free meditations topic href",
);
assert(
  freeMeditationsArticle.primaryPractice.practiceKey === "elixir-molodosti",
  "free meditations primary practice is Elixir",
);
assert(
  freeMeditationsArticle.primaryPracticeIntro.includes("Эликсир Молодости"),
  "free meditations practice intro",
);
assert(
  freeMeditationsArticle.leadBeforeAudio.startsWith(
    "Бесплатные медитации онлайн могут стать хорошим способом",
  ),
  "free meditations opening body paragraph",
);
assert(
  freeMeditationsArticle.introAfterAudio[0].startsWith(
    "Когда человек ищет бесплатную медитацию",
  ),
  "free meditations intro starts after lead",
);
assert(
  !freeMeditationsArticle.introAfterAudio.includes(
    freeMeditationsArticle.leadBeforeAudio,
  ),
  "free meditations lead not duplicated in intro",
);
assert(freeMeditationsArticle.captionAfterAudio === "", "no artificial caption");
assert(freeMeditationsArticle.finalAudioLead === "", "no second primary player");
assert(freeMeditationsArticle.faq.length === 3, "free meditations faq count");
assert(
  freeMeditationsArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href === "/practice/sergey-and-zoya/klyuch-k-izobiliyu",
    ),
  ),
  "free meditations links to Klyuch practice",
);
assert(
  freeMeditationsArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href === "/practice/sergey-and-zoya/kod-prityazheniya",
    ),
  ),
  "free meditations links to Kod practice",
);
assert(
  freeMeditationsArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-voyti-v-sostoyanie-izobiliya",
  ),
  "free meditations links to abundance article",
);
assert(
  Boolean(freeMeditationsArticle.brandNote?.includes("АудиоЛаде")),
  "free meditations brand note",
);
assert(
  freeMeditationsArticle.seeAlsoLinks.some(
    (item) => item.href === "/topics/besplatnye-meditatsii",
  ),
  "free meditations see-also includes hub",
);
assert(
  listArticlesByTopicSlug("besplatnye-meditatsii").some(
    (item) => item.slug === "besplatnye-meditatsii-onlayn",
  ),
  "free hub lists new article",
);
assert(
  !freeMeditationsArticle.leadBeforeAudio.includes("—") &&
    !freeMeditationsArticle.shortAnswer.includes("—") &&
    !freeMeditationsArticle.metaTitle.includes("—"),
  "free meditations uses medium dash",
);
assert(
  listArticleSlugs().includes("besplatnye-meditatsii-onlayn"),
  "free meditations in slug list",
);

const moneyFlowArticle = getArticleBySlug("chto-takoe-denezhnyy-potok");
assert(moneyFlowArticle, "money flow article registered");
assert(
  moneyFlowArticle.title ===
    "Что такое денежный поток и как изменить своё отношение к деньгам",
  "money flow H1",
);
assert(
  moneyFlowArticle.metaTitle.includes("АудиоЛад") &&
    !moneyFlowArticle.metaTitle.includes("АудиоЛад – АудиоЛад"),
  "money flow SEO title has brand once",
);
assert(
  moneyFlowArticle.metaDescription ===
    "Что обычно понимают под денежным потоком, почему возникает ощущение, что деньги постоянно уходят, и как более спокойно относиться к финансовым вопросам.",
  "money flow metaDescription",
);
assert(
  moneyFlowArticle.metaDescription !== moneyFlowArticle.leadBeforeAudio,
  "money flow metaDescription is not visual lead",
);
assert(
  moneyFlowArticle.topicSlug === "meditatsii-na-dengi",
  "money flow uses money topic hub",
);
assert(
  moneyFlowArticle.topicHref === "/topics/meditatsii-na-dengi",
  "money flow topic href",
);
assert(
  moneyFlowArticle.primaryPractice.practiceKey === "energiya-denezhnogo-puti",
  "money flow primary practice key",
);
assert(
  moneyFlowArticle.primaryPracticeIntro.includes("Энергия Денежного Пути"),
  "money flow practice intro",
);
assert(
  !moneyFlowArticle.primaryPracticeIntro.includes("Денежный Поток»"),
  "money flow does not present playlist as primary practice",
);
assert(
  moneyFlowArticle.leadBeforeAudio.startsWith("Под денежным потоком часто понимают"),
  "money flow opening body paragraph",
);
assert(
  moneyFlowArticle.introAfterAudio[0] === "Вы много работаете.",
  "money flow intro starts after lead",
);
assert(
  !moneyFlowArticle.introAfterAudio.includes(moneyFlowArticle.leadBeforeAudio),
  "money flow lead not duplicated in intro",
);
assert(moneyFlowArticle.captionAfterAudio === "", "money flow no artificial caption");
assert(moneyFlowArticle.finalAudioLead === "", "money flow no second primary player");
assert(moneyFlowArticle.faq.length === 3, "money flow faq count");
assert(
  moneyFlowArticle.afterFinalAudio?.some(
    (item) => item.href === "/practice/sergey-and-zoya/klyuch-k-izobiliyu",
  ),
  "money flow links to Klyuch practice",
);
assert(
  moneyFlowArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href ===
          "/articles/meditatsiya-na-dengi-kak-rabotat-s-vnimaniem-i-denezhnym-nastroem",
    ),
  ),
  "money flow links to money meditation article",
);
assert(
  moneyFlowArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href === "/articles/kak-voyti-v-sostoyanie-izobiliya",
    ),
  ),
  "money flow links to abundance article",
);
assert(
  moneyFlowArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/besplatnye-meditatsii-onlayn",
  ),
  "money flow links to free meditations article",
);
assert(
  moneyFlowArticle.afterFinalAudio?.some(
    (item) => item.href === "/p/denezhnyy-potok-9288",
  ),
  "money flow links to Денежный Поток playlist",
);
assert(
  Boolean(moneyFlowArticle.brandNote?.includes("АудиоЛаде")),
  "money flow brand note",
);
assert(
  moneyFlowArticle.seeAlsoLinks.some(
    (item) => item.href === "/topics/meditatsii-na-dengi",
  ),
  "money flow see-also includes hub",
);
assert(
  listArticlesByTopicSlug("meditatsii-na-dengi").some(
    (item) => item.slug === "chto-takoe-denezhnyy-potok",
  ),
  "money hub lists money flow article",
);
assert(
  !moneyFlowArticle.leadBeforeAudio.includes("—") &&
    !moneyFlowArticle.shortAnswer.includes("—") &&
    !moneyFlowArticle.metaTitle.includes("—"),
  "money flow uses medium dash",
);
assert(
  listArticleSlugs().includes("chto-takoe-denezhnyy-potok"),
  "money flow in slug list",
);
assert(
  abundanceArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/chto-takoe-denezhnyy-potok",
  ),
  "abundance reverse-links to money flow article",
);
assert(
  article.afterFinalAudio?.some(
    (item) =>
      item.href ===
      "/articles/meditatsiya-na-dengi-kak-rabotat-s-vnimaniem-i-denezhnym-nastroem",
  ),
  "love article reverse-links to money article",
);
assert(
  article.seeAlsoLinks.some((item) => item.href === "/topics/lyubov-k-sebe"),
  "love see-also includes hub",
);

const catalogIndex = buildCatalogPracticeKeyIndex([
  {
    id: "p1",
    title: "Эликсир Молодости",
    slug: "elixir-molodosti",
    subtitle: null,
    description: null,
    format: "Квант-Медитация",
    price: 0,
    isFree: true,
    authorName: "Сергей и Зоя",
    authorSlug: "sergey-and-zoya",
    href: "/authors/sergey-and-zoya/elixir-molodosti",
    meta: null,
    statsLabel: "5 мин",
    productTypeLabel: "Квант-Медитация",
    priceLabel: "Бесплатно",
    sortTimestamp: 0,
    coverUrl: null,
    coverImage: null,
    updatedAt: null,
  },
]);
assert(
  resolveArticlePrimaryPractice(article, catalogIndex)?.slug ===
    article.primaryPractice.practiceKey,
  "primary practice resolves via catalog key",
);
assert(
  buildAnalyticsConsentBannerBottomOffset().includes(
    "--global-mini-player-height",
  ),
  "consent banner clears mini-player",
);
assert(
  buildAnalyticsConsentBannerBottomOffset().includes(
    "--bottom-nav-main-height",
  ),
  "consent banner clears BottomNav",
);
const globalsCss = read("src/app/globals.css");
assert(
  globalsCss.includes(".analytics-consent-banner"),
  "consent banner layout class in globals",
);
assert(
  globalsCss.includes("--global-mini-player-height"),
  "globals consent offset uses mini-player var",
);

const readingMinutes = estimateArticleReadingTimeMinutes(article);
assert(readingMinutes >= 5 && readingMinutes <= 20, `reading time ${readingMinutes}`);

const pageData = {
  article,
  path: "/articles/kak-razvit-lyubov-k-sebe",
  canonicalUrl: "https://audiolad.ru/articles/kak-razvit-lyubov-k-sebe",
  readingTimeMinutes: readingMinutes,
  primaryPractice: {
    id: "p1",
    title: "Эликсир Молодости",
    slug: article.primaryPractice.practiceKey,
    subtitle: null,
    description: null,
    format: "Квант-Медитация",
    price: 0,
    isFree: true,
    authorName: "Сергей и Зоя",
    authorSlug: "sergey-and-zoya",
    href: `/authors/sergey-and-zoya/${article.primaryPractice.practiceKey}`,
    meta: null,
    statsLabel: "5 мин",
    productTypeLabel: "Квант-Медитация",
    priceLabel: "Бесплатно",
    sortTimestamp: 0,
    coverUrl: "https://audiolad.ru/covers/elixir-molodosti.jpg",
    coverImage: null,
    updatedAt: null,
  },
  relatedPractices: [],
  libraryAction: "sign_in",
};

const metadata = buildArticleMetadata(pageData);
assert(metadata.alternates?.canonical === pageData.canonicalUrl, "canonical");
assert(metadata.robots?.index === true, "indexable");
assert(
  String(metadata.title).includes("как развить любовь к себе") ||
    String(metadata.title).includes("Как развить любовь к себе"),
  "meta title keeps primary keyword",
);
assert(String(metadata.title).includes("АудиоЛад"), "meta title has brand");
assert(
  String(metadata.description).includes("аудиопрактика"),
  "meta description mentions audio",
);
assert(
  String(metadata.description) === article.metaDescription,
  "article metadata description uses metaDescription field",
);
assert(
  String(metadata.description) !== article.leadBeforeAudio,
  "article metadata description is not the visual body lead",
);
assert(
  String(metadata.openGraph?.description ?? "") === article.metaDescription,
  "Open Graph description uses metaDescription",
);

for (const slug of listArticleSlugs()) {
  const item = getArticleBySlug(slug);
  assert(item, `article ${slug} loads`);
  assert(item.authorLabel === "Редакция АудиоЛада", `${slug} editorial byline`);
  assert(item.leadBeforeAudio.trim().length > 0, `${slug} keeps opening paragraph`);
  assert(
    !item.introAfterAudio.includes(item.leadBeforeAudio),
    `${slug} opening paragraph not duplicated in introAfterAudio`,
  );
  assert(
    item.metaDescription.trim().length > 0 &&
      item.metaDescription !== item.leadBeforeAudio,
    `${slug} keeps separate SEO metaDescription`,
  );
  assert(item.primaryPractice?.practiceKey, `${slug} has primary practice key`);
}

const jsonLd = buildArticleJsonLdGraph(pageData);
const serialized = JSON.stringify(jsonLd);
assert(!serialized.includes("undefined"), "json-ld has no undefined");
assert(!serialized.includes("localhost"), "json-ld has no localhost");
assert(serialized.includes('"@type":"Article"'), "Article schema");
assert(serialized.includes('"@type":"FAQPage"'), "FAQPage schema");
assert(serialized.includes('"@type":"BreadcrumbList"'), "BreadcrumbList schema");
assert(serialized.includes("Редакция АудиоЛада"), "editorial author in json-ld");

const sitemapEntries = mapArticleDefinitionsToSitemapEntries(undefined, "https://audiolad.ru");
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/kak-razvit-lyubov-k-sebe",
  ),
  "article in sitemap mapper",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url ===
      "https://audiolad.ru/articles/meditatsiya-na-dengi-kak-rabotat-s-vnimaniem-i-denezhnym-nastroem",
  ),
  "money article in sitemap mapper",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url ===
      "https://audiolad.ru/articles/kak-voyti-v-sostoyanie-izobiliya",
  ),
  "abundance article in sitemap mapper",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url ===
      "https://audiolad.ru/articles/besplatnye-meditatsii-onlayn",
  ),
  "free meditations article in sitemap mapper",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/chto-takoe-denezhnyy-potok",
  ),
  "money flow article in sitemap mapper",
);
assert(
  sitemapEntries.every((entry) => !String(entry.url).includes("localhost")),
  "sitemap has no localhost",
);

const moneyPageData = {
  article: moneyArticle,
  path: "/articles/meditatsiya-na-dengi-kak-rabotat-s-vnimaniem-i-denezhnym-nastroem",
  canonicalUrl:
    "https://audiolad.ru/articles/meditatsiya-na-dengi-kak-rabotat-s-vnimaniem-i-denezhnym-nastroem",
  readingTimeMinutes: estimateArticleReadingTimeMinutes(moneyArticle),
  primaryPractice: {
    id: "p-money",
    title: "Энергия Денежного Пути",
    slug: moneyArticle.primaryPractice.practiceKey,
    subtitle: null,
    description: null,
    format: "Энергопоток",
    price: 0,
    isFree: true,
    authorName: "Сергей",
    authorSlug: "sergey-petrov",
    href: `/practice/sergey-petrov/${moneyArticle.primaryPractice.practiceKey}`,
    meta: null,
    statsLabel: "5 мин",
    productTypeLabel: "Энергопоток",
    priceLabel: "Бесплатно",
    sortTimestamp: 0,
    coverUrl: "https://audiolad.ru/covers/energiya-denezhnogo-puti.jpg",
    coverImage: null,
    updatedAt: null,
  },
  relatedPractices: [],
  libraryAction: "sign_in",
};
const moneyMetadata = buildArticleMetadata(moneyPageData);
assert(
  moneyMetadata.alternates?.canonical === moneyPageData.canonicalUrl,
  "money canonical",
);
assert(
  String(moneyMetadata.title).includes("Медитация на деньги"),
  "money meta title",
);
const moneyJsonLd = JSON.stringify(buildArticleJsonLdGraph(moneyPageData));
assert(moneyJsonLd.includes('"@type":"Article"'), "money Article schema");
assert(moneyJsonLd.includes('"@type":"FAQPage"'), "money FAQPage schema");
assert(
  moneyJsonLd.includes('"@type":"BreadcrumbList"'),
  "money BreadcrumbList schema",
);
assert(
  moneyJsonLd.includes("Можно ли слушать медитацию каждый день?"),
  "money FAQ in json-ld",
);

const articleEvents = [
  "article_view",
  "article_audio_play",
  "article_practice_open",
  "article_practice_save",
  "article_topic_click",
  "article_related_practice_click",
  "article_toc_click",
  "article_final_audio_click",
];

for (const eventName of articleEvents) {
  assert(
    isPlatformAnalyticsEventName(eventName),
    `${eventName} allowlisted in TS`,
  );
}

const migration = read(
  "supabase/migrations/20260724190000_platform_analytics_article_events.sql",
);
assert(migration.includes("article_view"), "migration adds article_view");
assert(
  migration.includes("article_final_audio_click"),
  "migration adds article_final_audio_click",
);

const pageSource = read("src/app/(listener)/articles/[slug]/page.tsx");
assert(pageSource.includes("ArticlePageView"), "page uses ArticlePageView");
assert(pageSource.includes("force-dynamic"), "article page is dynamic");

const layoutSource = read("src/app/(listener)/articles/layout.tsx");
assert(layoutSource.includes("HomeMobileHeader"), "reuses guest mobile header");
assert(layoutSource.includes("ListenerAppShell") === false, "no parallel shell");

const viewSource = read("src/components/articles/ArticlePageView.tsx");
assert(viewSource.includes("Короткий ответ"), "short answer block");
assert(viewSource.includes("ArticleAudioBlock"), "audio blocks");
assert(viewSource.includes("placement=\"final_audio\""), "final audio placement");
assert(viewSource.includes("Частые вопросы"), "visible FAQ");
assert(viewSource.includes("ArticleFaqList"), "FAQ list component");
assert(
  /<h1[\s\S]*?<\/h1>\s*<p className="mt-2 text-sm/.test(viewSource),
  "byline follows H1 without lead paragraph between them",
);
assert(
  viewSource.includes("[article.leadBeforeAudio, ...article.introAfterAudio]"),
  "leadBeforeAudio renders as first body paragraph after practice block",
);
assert(
  !/<h1[\s\S]*?\{article\.leadBeforeAudio\}[\s\S]*?authorLabel/.test(viewSource),
  "leadBeforeAudio is not rendered under H1 before byline",
);
const practiceBlockIdx = viewSource.indexOf(
  'id="article-primary-practice-heading"',
);
const bodyLeadIdx = viewSource.indexOf(
  "[article.leadBeforeAudio, ...article.introAfterAudio]",
);
const captionIdx = viewSource.indexOf("{article.captionAfterAudio}");
const shortAnswerIdx = viewSource.indexOf("{article.shortAnswer}");
assert(practiceBlockIdx > 0, "practice block present in template");
assert(bodyLeadIdx > practiceBlockIdx, "body opens after practice block");
assert(
  captionIdx > bodyLeadIdx,
  "captionAfterAudio comes after opening body paragraphs",
);
assert(
  shortAnswerIdx > bodyLeadIdx,
  "short answer comes after opening body paragraphs",
);
assert(
  (viewSource.match(/article\.leadBeforeAudio/g) || []).length === 1,
  "leadBeforeAudio referenced exactly once in page view",
);
assert(
  viewSource.includes("article.primaryPracticeEyebrow"),
  "renders article-specific practice eyebrow from data",
);
assert(
  viewSource.includes("article.primaryPracticeIntro"),
  "renders article-specific practice intro from data",
);
assert(
  viewSource.includes('id="article-primary-practice-heading"'),
  "practice intro has accessible heading id",
);
assert(
  viewSource.includes("article.afterFinalAudio"),
  "renders after-final-audio cross-links from data",
);
assert(
  viewSource.includes("item.segments") &&
    viewSource.includes("article.finalAudioLead.trim()"),
  "supports multi-link CTA segments and optional final player",
);
assert(
  viewSource.includes("article.seeAlsoLinks"),
  "see-also links are data-driven",
);
assert(
  viewSource.includes("article.brandNote"),
  "renders optional brand note from data",
);
assert(
  !viewSource.includes("Все практики о любви к себе"),
  "page view does not hardcode love hub see-also label",
);
assert(!viewSource.includes("[Включить аудиопрактику]"), "no text stub player");
assert(!viewSource.includes("bastet-"), "page view has no hard practice slug");
assert(
  !viewSource.includes("Эликсир Молодости"),
  "page view does not hardcode practice title",
);

const audioSource = read("src/components/articles/ArticleAudioBlock.tsx");
assert(audioSource.includes("PlayIcon"), "circular play icon");
assert(audioSource.includes("PauseIcon"), "circular pause icon");
assert(!audioSource.includes("bastet-"), "audio block has no hard practice slug");
assert(
  !audioSource.includes("primaryPracticeEyebrow"),
  "audio block does not own practice intro copy",
);

const consentSource = read("src/components/analytics/AnalyticsConsentBanner.tsx");
assert(
  consentSource.includes("ANALYTICS_CONSENT_BANNER_CLASS"),
  "consent uses chrome-aware layout class",
);
assert(
  consentSource.includes("ANALYTICS_CONSENT_BANNER_Z_INDEX_CLASS") ||
    consentSource.includes("z-40"),
  "consent above mini-player",
);

const playbackSource = read("src/components/articles/ArticlePlaybackProvider.tsx");
assert(
  playbackSource.includes("usePromoPagePlayback"),
  "reuses promo playback / global player",
);
assert(
  playbackSource.includes("suppressListenUrlSync") === false,
  "suppress handled inside usePromoPagePlayback",
);

console.log("seo-article-unit: OK");
