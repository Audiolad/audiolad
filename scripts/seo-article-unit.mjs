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
import { resolveArticleClosingHeading } from "../src/lib/seo/articles/public-heading.ts";
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
    (item) => item.href === "/articles/myshlenie-izobiliya",
  ),
  "abundance reverse-links to abundance-mindset article",
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

const abundanceMeditationArticle = getArticleBySlug("meditatsiya-na-izobilie");
assert(abundanceMeditationArticle, "abundance meditation article registered");
assert(
  abundanceMeditationArticle.title ===
    "Что такое медитация на изобилие и как она помогает изменить отношение к достатку",
  "abundance meditation H1",
);
assert(
  abundanceMeditationArticle.metaTitle.startsWith("Медитация на изобилие"),
  "abundance meditation SEO title keeps primary query",
);
assert(
  abundanceMeditationArticle.metaTitle.includes("АудиоЛад") &&
    !abundanceMeditationArticle.metaTitle.includes("АудиоЛад – АудиоЛад"),
  "abundance meditation SEO title has brand once",
);
assert(
  abundanceMeditationArticle.metaDescription !==
    abundanceMeditationArticle.leadBeforeAudio,
  "abundance meditation metaDescription is not visual lead",
);
assert(
  abundanceMeditationArticle.metaDescription !==
    abundanceArticle.metaDescription,
  "abundance meditation metaDescription differs from state-of-abundance article",
);
assert(
  abundanceMeditationArticle.topicSlug === "izobilie",
  "abundance meditation topic hub",
);
assert(
  abundanceMeditationArticle.topicHref === "/topics/izobilie",
  "abundance meditation topic href",
);
assert(
  abundanceMeditationArticle.primaryPractice.practiceKey === "klyuch-k-izobiliyu",
  "abundance meditation primary practice key",
);
assert(
  abundanceMeditationArticle.primaryPracticeIntro.includes("Ключ к Изобилию"),
  "abundance meditation practice intro",
);
assert(
  abundanceMeditationArticle.leadBeforeAudio ===
    "Иногда ощущение нехватки сохраняется даже тогда, когда в жизни уже многое есть. Несколько спокойных минут помогают замедлиться, заметить свои опоры и посмотреть на происходящее немного шире.",
  "abundance meditation opening body paragraph",
);
assert(
  abundanceMeditationArticle.shortAnswer.startsWith(
    "Медитация на изобилие – это спокойная аудиопрактика",
  ),
  "abundance meditation short answer keeps definition role",
);
assert(
  !abundanceMeditationArticle.leadBeforeAudio.includes(
    "Медитация на изобилие – это",
  ),
  "abundance meditation lead is not a second definition",
);
assert(
  abundanceMeditationArticle.introAfterAudio[0] ===
    "Иногда кажется, что чего-то постоянно не хватает.",
  "abundance meditation intro starts after lead",
);
assert(
  !abundanceMeditationArticle.introAfterAudio.includes(
    abundanceMeditationArticle.leadBeforeAudio,
  ),
  "abundance meditation lead not duplicated in intro",
);
assert(
  abundanceMeditationArticle.captionAfterAudio === "",
  "abundance meditation no artificial caption",
);
assert(
  abundanceMeditationArticle.finalAudioLead === "",
  "abundance meditation no second primary player",
);
assert(abundanceMeditationArticle.faq.length === 3, "abundance meditation faq");
assert(
  abundanceMeditationArticle.afterFinalAudio?.some(
    (item) => item.href === "/p/denezhnyy-potok-9288",
  ),
  "abundance meditation links to playlist as playlist CTA",
);
assert(
  abundanceMeditationArticle.afterFinalAudio?.some((item) =>
    String(item.after ?? "").toLowerCase().includes("плейлист"),
  ),
  "abundance meditation CTA names playlist explicitly",
);
assert(
  abundanceMeditationArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href === "/articles/kak-voyti-v-sostoyanie-izobiliya",
    ),
  ),
  "abundance meditation links to state-of-abundance article",
);
assert(
  abundanceMeditationArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href === "/articles/chto-takoe-denezhnyy-potok",
    ),
  ),
  "abundance meditation links to money flow article",
);
assert(
  abundanceMeditationArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href ===
          "/articles/meditatsiya-na-dengi-kak-rabotat-s-vnimaniem-i-denezhnym-nastroem",
    ),
  ),
  "abundance meditation links to money meditation article",
);
assert(
  abundanceMeditationArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/besplatnye-meditatsii-onlayn",
  ),
  "abundance meditation links to free meditations article",
);
assert(
  !JSON.stringify(abundanceMeditationArticle.afterFinalAudio).includes(
    "/practice/sergey-and-zoya/klyuch-k-izobiliyu",
  ),
  "abundance meditation does not re-link primary practice in CTA",
);
assert(
  Boolean(abundanceMeditationArticle.brandNote?.includes("АудиоЛаде")),
  "abundance meditation brand note",
);
assert(
  abundanceMeditationArticle.seeAlsoLinks.some(
    (item) => item.href === "/topics/izobilie",
  ),
  "abundance meditation see-also includes hub",
);
assert(
  listArticlesByTopicSlug("izobilie").some(
    (item) => item.slug === "meditatsiya-na-izobilie",
  ),
  "izobilie hub lists abundance meditation article",
);
assert(
  listArticlesByTopicSlug("izobilie").some(
    (item) => item.slug === "kak-voyti-v-sostoyanie-izobiliya",
  ),
  "izobilie hub still lists state-of-abundance article",
);
assert(
  !abundanceMeditationArticle.leadBeforeAudio.includes("—") &&
    !abundanceMeditationArticle.shortAnswer.includes("—") &&
    !abundanceMeditationArticle.metaTitle.includes("—"),
  "abundance meditation uses medium dash",
);
assert(
  listArticleSlugs().includes("meditatsiya-na-izobilie"),
  "abundance meditation in slug list",
);

const moneyAttractionArticle = getArticleBySlug(
  "meditatsiya-na-privlechenie-deneg",
);
assert(moneyAttractionArticle, "money attraction article registered");
assert(
  moneyAttractionArticle.title ===
    "Медитация на привлечение денег: что это такое и как она помогает изменить отношение к финансам",
  "money attraction H1",
);
assert(
  moneyAttractionArticle.metaTitle.startsWith(
    "Медитация на привлечение денег",
  ),
  "money attraction SEO title keeps primary query",
);
assert(
  moneyAttractionArticle.metaTitle.includes("АудиоЛад") &&
    !moneyAttractionArticle.metaTitle.includes("АудиоЛад – АудиоЛад"),
  "money attraction SEO title has brand once",
);
assert(
  moneyAttractionArticle.metaDescription !==
    moneyAttractionArticle.leadBeforeAudio,
  "money attraction metaDescription is not visual lead",
);
assert(
  moneyAttractionArticle.metaDescription !== moneyArticle.metaDescription,
  "money attraction metaDescription differs from money meditation article",
);
assert(
  moneyAttractionArticle.topicSlug === "meditatsii-na-dengi",
  "money attraction topic hub",
);
assert(
  moneyAttractionArticle.topicHref === "/topics/meditatsii-na-dengi",
  "money attraction topic href",
);
assert(
  moneyAttractionArticle.primaryPractice.practiceKey === "klyuch-k-izobiliyu",
  "money attraction primary practice key",
);
assert(
  moneyAttractionArticle.primaryPracticeIntro.includes("Ключ к Изобилию"),
  "money attraction practice intro",
);
assert(
  moneyAttractionArticle.leadBeforeAudio ===
    "Когда мысли о деньгах начинают занимать почти всё внимание, становится трудно замечать что-то ещё.",
  "money attraction opening body paragraph",
);
assert(
  moneyAttractionArticle.shortAnswer.startsWith(
    "Медитация на привлечение денег – это спокойная практика",
  ),
  "money attraction short answer keeps definition role",
);
assert(
  !moneyAttractionArticle.leadBeforeAudio.includes(
    "Медитация на привлечение денег – это",
  ),
  "money attraction lead is not a second definition",
);
assert(
  moneyAttractionArticle.introAfterAudio[0] ===
    "Кажется, что любая неожиданная трата становится серьёзной проблемой.",
  "money attraction intro starts after lead",
);
assert(
  !moneyAttractionArticle.introAfterAudio.includes(
    moneyAttractionArticle.leadBeforeAudio,
  ),
  "money attraction lead not duplicated in intro",
);
assert(
  moneyAttractionArticle.captionAfterAudio === "",
  "money attraction no artificial caption",
);
assert(
  moneyAttractionArticle.finalAudioLead === "",
  "money attraction no second primary player",
);
assert(moneyAttractionArticle.faq.length === 3, "money attraction faq");
assert(
  moneyAttractionArticle.afterFinalAudio?.some(
    (item) => item.href === "/p/denezhnyy-potok-9288",
  ),
  "money attraction links to playlist as playlist CTA",
);
assert(
  moneyAttractionArticle.afterFinalAudio?.some((item) =>
    String(item.after ?? "").toLowerCase().includes("плейлист"),
  ),
  "money attraction CTA names playlist explicitly",
);
assert(
  moneyAttractionArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href === "/articles/chto-takoe-denezhnyy-potok",
    ),
  ),
  "money attraction links to money flow article",
);
assert(
  moneyAttractionArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href ===
          "/articles/meditatsiya-na-dengi-kak-rabotat-s-vnimaniem-i-denezhnym-nastroem",
    ),
  ),
  "money attraction links to money meditation article",
);
assert(
  moneyAttractionArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href === "/articles/meditatsiya-na-izobilie",
    ),
  ),
  "money attraction links to abundance meditation article",
);
assert(
  moneyAttractionArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href === "/articles/kak-voyti-v-sostoyanie-izobiliya",
    ),
  ),
  "money attraction links to state-of-abundance article",
);
assert(
  moneyAttractionArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/besplatnye-meditatsii-onlayn",
  ),
  "money attraction links to free meditations article",
);
assert(
  !JSON.stringify(moneyAttractionArticle.afterFinalAudio).includes(
    "/practice/sergey-and-zoya/klyuch-k-izobiliyu",
  ),
  "money attraction does not re-link primary practice in CTA",
);
assert(
  Boolean(moneyAttractionArticle.brandNote?.includes("АудиоЛаде")),
  "money attraction brand note",
);
assert(
  moneyAttractionArticle.seeAlsoLinks.some(
    (item) => item.href === "/topics/meditatsii-na-dengi",
  ),
  "money attraction see-also includes hub",
);
assert(
  listArticlesByTopicSlug("meditatsii-na-dengi").some(
    (item) => item.slug === "meditatsiya-na-privlechenie-deneg",
  ),
  "money hub lists money attraction article",
);
assert(
  !moneyAttractionArticle.leadBeforeAudio.includes("—") &&
    !moneyAttractionArticle.shortAnswer.includes("—") &&
    !moneyAttractionArticle.metaTitle.includes("—"),
  "money attraction uses medium dash",
);
assert(
  listArticleSlugs().includes("meditatsiya-na-privlechenie-deneg"),
  "money attraction in slug list",
);

const howToAttractMoneyArticle = getArticleBySlug(
  "kak-privlech-dengi-v-svoyu-zhizn",
);
assert(howToAttractMoneyArticle, "how-to attract money article registered");
assert(
  howToAttractMoneyArticle.title ===
    "Как привлечь деньги в свою жизнь: что действительно помогает изменить отношение к финансам",
  "how-to attract money H1",
);
assert(
  howToAttractMoneyArticle.metaTitle.startsWith(
    "Как привлечь деньги в свою жизнь",
  ),
  "how-to attract money SEO title keeps primary query",
);
assert(
  howToAttractMoneyArticle.metaTitle.includes("АудиоЛад") &&
    !howToAttractMoneyArticle.metaTitle.includes("АудиоЛад – АудиоЛад"),
  "how-to attract money SEO title has brand once",
);
assert(
  howToAttractMoneyArticle.metaDescription !==
    howToAttractMoneyArticle.leadBeforeAudio,
  "how-to attract money metaDescription is not visual lead",
);
assert(
  howToAttractMoneyArticle.metaDescription !==
    moneyAttractionArticle.metaDescription,
  "how-to attract money metaDescription differs from attraction meditation",
);
assert(
  howToAttractMoneyArticle.topicSlug === "meditatsii-na-dengi",
  "how-to attract money topic hub",
);
assert(
  howToAttractMoneyArticle.topicHref === "/topics/meditatsii-na-dengi",
  "how-to attract money topic href",
);
assert(
  howToAttractMoneyArticle.primaryPractice.practiceKey === "klyuch-k-izobiliyu",
  "how-to attract money primary practice key",
);
assert(
  howToAttractMoneyArticle.primaryPracticeIntro.includes("Ключ к Изобилию"),
  "how-to attract money practice intro",
);
assert(
  !howToAttractMoneyArticle.primaryPracticeIntro.includes(
    "Если для этой темы больше подойдёт",
  ),
  "how-to attract money has no editorial practice fork",
);
assert(
  !JSON.stringify(howToAttractMoneyArticle).includes(
    "Если для этой темы больше подойдёт",
  ),
  "how-to attract money content has no editorial practice fork",
);
assert(
  howToAttractMoneyArticle.leadBeforeAudio.startsWith(
    "Когда финансовые переживания возвращаются каждый день",
  ),
  "how-to attract money opening body paragraph",
);
assert(
  howToAttractMoneyArticle.shortAnswer.startsWith(
    "Привлечение денег в реальной жизни обычно связано не с одним секретным способом",
  ),
  "how-to attract money short answer keeps direct answer role",
);
assert(
  !howToAttractMoneyArticle.leadBeforeAudio.includes(
    "Привлечение денег в реальной жизни обычно связано",
  ),
  "how-to attract money lead is not a second definition",
);
assert(
  howToAttractMoneyArticle.introAfterAudio[0] ===
    "Из-за постоянного напряжения становится сложнее спокойно оценивать ситуацию.",
  "how-to attract money intro starts after lead",
);
assert(
  !howToAttractMoneyArticle.introAfterAudio.includes(
    howToAttractMoneyArticle.leadBeforeAudio,
  ),
  "how-to attract money lead not duplicated in intro",
);
assert(
  howToAttractMoneyArticle.sections.some(
    (section) => section.id === "menyat-finansovye-privychki",
  ),
  "how-to attract money includes habits section",
);
assert(
  howToAttractMoneyArticle.sections.some((section) =>
    section.paragraphs.includes("Понятный план работы с долгами."),
  ),
  "how-to attract money keeps debt-plan wording",
);
assert(
  howToAttractMoneyArticle.sections.some((section) =>
    section.paragraphs.includes(
      "«Какой один небольшой и конкретный шаг я могу сделать в ближайшие сутки?»",
    ),
  ),
  "how-to attract money includes next-day action exercise",
);
assert(
  howToAttractMoneyArticle.captionAfterAudio === "",
  "how-to attract money no artificial caption",
);
assert(
  howToAttractMoneyArticle.finalAudioLead === "",
  "how-to attract money no second primary player",
);
assert(howToAttractMoneyArticle.faq.length === 3, "how-to attract money faq");
assert(
  howToAttractMoneyArticle.afterFinalAudio?.some(
    (item) => item.href === "/p/denezhnyy-potok-9288",
  ),
  "how-to attract money links to playlist as playlist CTA",
);
assert(
  howToAttractMoneyArticle.afterFinalAudio?.some((item) =>
    String(item.after ?? "").toLowerCase().includes("плейлист"),
  ),
  "how-to attract money CTA names playlist explicitly",
);
assert(
  howToAttractMoneyArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href === "/articles/meditatsiya-na-privlechenie-deneg",
    ),
  ),
  "how-to attract money links to attraction meditation article",
);
assert(
  howToAttractMoneyArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href ===
          "/articles/meditatsiya-na-dengi-kak-rabotat-s-vnimaniem-i-denezhnym-nastroem",
    ),
  ),
  "how-to attract money links to money meditation article",
);
assert(
  howToAttractMoneyArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href === "/articles/chto-takoe-denezhnyy-potok",
    ),
  ),
  "how-to attract money links to money flow article",
);
assert(
  howToAttractMoneyArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href === "/articles/kak-voyti-v-sostoyanie-izobiliya",
    ),
  ),
  "how-to attract money links to state-of-abundance article",
);
assert(
  howToAttractMoneyArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href === "/articles/meditatsiya-na-izobilie",
    ),
  ),
  "how-to attract money links to abundance meditation article",
);
assert(
  howToAttractMoneyArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href === "/articles/besplatnye-meditatsii-onlayn",
    ),
  ),
  "how-to attract money links to free meditations article",
);
assert(
  !JSON.stringify(howToAttractMoneyArticle.afterFinalAudio).includes(
    "/practice/sergey-and-zoya/klyuch-k-izobiliyu",
  ),
  "how-to attract money does not re-link primary practice in CTA",
);
assert(
  Boolean(howToAttractMoneyArticle.brandNote?.includes("АудиоЛаде")),
  "how-to attract money brand note",
);
assert(
  howToAttractMoneyArticle.seeAlsoLinks.some(
    (item) => item.href === "/topics/meditatsii-na-dengi",
  ),
  "how-to attract money see-also includes hub",
);
assert(
  listArticlesByTopicSlug("meditatsii-na-dengi").some(
    (item) => item.slug === "kak-privlech-dengi-v-svoyu-zhizn",
  ),
  "money hub lists how-to attract money article",
);
assert(
  !howToAttractMoneyArticle.leadBeforeAudio.includes("—") &&
    !howToAttractMoneyArticle.shortAnswer.includes("—") &&
    !howToAttractMoneyArticle.metaTitle.includes("—"),
  "how-to attract money uses medium dash",
);
assert(
  listArticleSlugs().includes("kak-privlech-dengi-v-svoyu-zhizn"),
  "how-to attract money in slug list",
);
assert(
  listArticleSlugs().filter(
    (slug) => slug === "kak-privlech-dengi-v-svoyu-zhizn",
  ).length === 1,
  "how-to attract money slug unique",
);

const moneyAffirmationsArticle = getArticleBySlug("affirmatsii-na-dengi");
assert(moneyAffirmationsArticle, "money affirmations article registered");
assert(
  moneyAffirmationsArticle.title ===
    "Аффирмации на деньги: помогают ли они изменить отношение к финансам",
  "money affirmations H1",
);
assert(
  moneyAffirmationsArticle.metaTitle.startsWith("Аффирмации на деньги"),
  "money affirmations SEO title keeps primary query",
);
assert(
  moneyAffirmationsArticle.metaTitle.includes("АудиоЛад") &&
    !moneyAffirmationsArticle.metaTitle.includes("АудиоЛад – АудиоЛад"),
  "money affirmations SEO title has brand once",
);
assert(
  moneyAffirmationsArticle.metaDescription !==
    moneyAffirmationsArticle.leadBeforeAudio,
  "money affirmations metaDescription is not visual lead",
);
assert(
  moneyAffirmationsArticle.metaDescription !==
    howToAttractMoneyArticle.metaDescription &&
    moneyAffirmationsArticle.metaDescription !==
      moneyAttractionArticle.metaDescription,
  "money affirmations metaDescription is unique in money cluster",
);
assert(
  moneyAffirmationsArticle.topicSlug === "meditatsii-na-dengi",
  "money affirmations topic hub",
);
assert(
  moneyAffirmationsArticle.topicHref === "/topics/meditatsii-na-dengi",
  "money affirmations topic href",
);
assert(
  moneyAffirmationsArticle.primaryPractice.practiceKey === "klyuch-k-izobiliyu",
  "money affirmations primary practice key",
);
assert(
  moneyAffirmationsArticle.primaryPracticeIntro.includes("Ключ к Изобилию"),
  "money affirmations practice intro",
);
assert(
  !JSON.stringify(moneyAffirmationsArticle).includes(
    "Если для этой темы больше подойдёт",
  ),
  "money affirmations content has no editorial practice fork",
);
assert(
  moneyAffirmationsArticle.leadBeforeAudio.startsWith(
    "Наверняка вы встречали фразы вроде",
  ),
  "money affirmations opening body paragraph",
);
assert(
  moneyAffirmationsArticle.shortAnswer.startsWith(
    "Аффирмации на деньги – это короткие поддерживающие утверждения",
  ),
  "money affirmations short answer keeps definition role",
);
assert(
  !moneyAffirmationsArticle.leadBeforeAudio.includes(
    "Аффирмации на деньги – это",
  ),
  "money affirmations lead is not a second definition",
);
assert(
  moneyAffirmationsArticle.introAfterAudio[0] ===
    "Поэтому возникает закономерный вопрос – действительно ли аффирмации способны помочь или это просто красивые слова?",
  "money affirmations intro starts after lead",
);
assert(
  !moneyAffirmationsArticle.introAfterAudio.includes(
    moneyAffirmationsArticle.leadBeforeAudio,
  ),
  "money affirmations lead not duplicated in intro",
);
assert(
  !moneyAffirmationsArticle.introAfterAudio.some((paragraph) =>
    paragraph.includes("Аффирмации на деньги – это"),
  ),
  "money affirmations intro does not repeat shortAnswer definition",
);
assert(
  moneyAffirmationsArticle.sections.some((section) =>
    section.paragraphs.includes(
      "«Я постепенно учусь принимать более взвешенные финансовые решения.»",
    ),
  ),
  "money affirmations includes reframing exercise",
);
assert(
  moneyAffirmationsArticle.sections.some((section) =>
    section.paragraphs.includes(
      "После этого выберите одно небольшое действие, которое можно сделать в ближайшие сутки.",
    ),
  ),
  "money affirmations includes next-day action exercise",
);
assert(
  moneyAffirmationsArticle.captionAfterAudio === "",
  "money affirmations no artificial caption",
);
assert(
  moneyAffirmationsArticle.finalAudioLead === "",
  "money affirmations no second primary player",
);
assert(moneyAffirmationsArticle.faq.length === 3, "money affirmations faq");
assert(
  moneyAffirmationsArticle.faq[0]?.question ===
    "Аффирмации действительно помогают заработать больше?",
  "money affirmations FAQ earning question",
);
assert(
  !moneyAffirmationsArticle.faq[0]?.answer.toLowerCase().includes("гарант"),
  "money affirmations FAQ avoids guarantee wording",
);
assert(
  moneyAffirmationsArticle.afterFinalAudio?.some(
    (item) => item.href === "/p/denezhnyy-potok-9288",
  ),
  "money affirmations links to playlist as playlist CTA",
);
assert(
  moneyAffirmationsArticle.afterFinalAudio?.some((item) =>
    String(item.after ?? "").toLowerCase().includes("плейлист"),
  ),
  "money affirmations CTA names playlist explicitly",
);
assert(
  !moneyAffirmationsArticle.afterFinalAudio?.some((item) =>
    String(item.after ?? "").includes("как отдельную практику"),
  ),
  "money affirmations does not call playlist a practice",
);
assert(
  moneyAffirmationsArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href === "/articles/kak-privlech-dengi-v-svoyu-zhizn",
    ),
  ),
  "money affirmations links to how-to attract money article",
);
assert(
  moneyAffirmationsArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href ===
          "/articles/meditatsiya-na-dengi-kak-rabotat-s-vnimaniem-i-denezhnym-nastroem",
    ),
  ),
  "money affirmations links to money meditation article",
);
assert(
  moneyAffirmationsArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href === "/articles/chto-takoe-denezhnyy-potok",
    ),
  ),
  "money affirmations links to money flow article",
);
assert(
  !JSON.stringify(moneyAffirmationsArticle.afterFinalAudio).includes(
    "/practice/sergey-and-zoya/klyuch-k-izobiliyu",
  ),
  "money affirmations does not re-link primary practice in CTA",
);
assert(
  Boolean(moneyAffirmationsArticle.brandNote?.includes("АудиоЛаде")),
  "money affirmations brand note",
);
assert(
  moneyAffirmationsArticle.seeAlsoLinks.some(
    (item) => item.href === "/topics/meditatsii-na-dengi",
  ),
  "money affirmations see-also includes hub",
);
assert(
  listArticlesByTopicSlug("meditatsii-na-dengi").some(
    (item) => item.slug === "affirmatsii-na-dengi",
  ),
  "money hub lists money affirmations article",
);
assert(
  !moneyAffirmationsArticle.leadBeforeAudio.includes("—") &&
    !moneyAffirmationsArticle.shortAnswer.includes("—") &&
    !moneyAffirmationsArticle.metaTitle.includes("—"),
  "money affirmations uses medium dash",
);
assert(
  listArticleSlugs().includes("affirmatsii-na-dengi"),
  "money affirmations in slug list",
);
assert(
  listArticleSlugs().filter((slug) => slug === "affirmatsii-na-dengi")
    .length === 1,
  "money affirmations slug unique",
);

const changeMoneyAttitudeArticle = getArticleBySlug(
  "kak-izmenit-otnoshenie-k-dengam",
);
assert(changeMoneyAttitudeArticle, "change money attitude article registered");
assert(
  changeMoneyAttitudeArticle.title ===
    "Как изменить отношение к деньгам: почему это важно и с чего начать",
  "change money attitude H1",
);
assert(
  changeMoneyAttitudeArticle.metaTitle.startsWith(
    "Как изменить отношение к деньгам",
  ),
  "change money attitude SEO title keeps primary query",
);
assert(
  changeMoneyAttitudeArticle.metaTitle.includes("АудиоЛад") &&
    !changeMoneyAttitudeArticle.metaTitle.includes("АудиоЛад – АудиоЛад"),
  "change money attitude SEO title has brand once",
);
assert(
  changeMoneyAttitudeArticle.metaDescription !==
    changeMoneyAttitudeArticle.leadBeforeAudio,
  "change money attitude metaDescription is not visual lead",
);
assert(
  changeMoneyAttitudeArticle.metaDescription !==
    howToAttractMoneyArticle.metaDescription &&
    changeMoneyAttitudeArticle.metaDescription !==
      moneyAffirmationsArticle.metaDescription,
  "change money attitude metaDescription is unique in money cluster",
);
assert(
  changeMoneyAttitudeArticle.topicSlug === "meditatsii-na-dengi",
  "change money attitude topic hub",
);
assert(
  changeMoneyAttitudeArticle.topicHref === "/topics/meditatsii-na-dengi",
  "change money attitude topic href",
);
assert(
  changeMoneyAttitudeArticle.primaryPractice.practiceKey ===
    "klyuch-k-izobiliyu",
  "change money attitude primary practice key",
);
assert(
  changeMoneyAttitudeArticle.primaryPracticeIntro.includes("Ключ к Изобилию"),
  "change money attitude practice intro",
);
assert(
  !JSON.stringify(changeMoneyAttitudeArticle).includes(
    "Если для этой темы больше подойдёт",
  ),
  "change money attitude content has no editorial practice fork",
);
assert(
  changeMoneyAttitudeArticle.leadBeforeAudio.startsWith(
    "Наверное, почти каждый человек хотя бы раз замечал",
  ),
  "change money attitude opening body paragraph",
);
assert(
  changeMoneyAttitudeArticle.shortAnswer.startsWith(
    "Отношение к деньгам складывается из личного опыта",
  ),
  "change money attitude short answer keeps direct answer role",
);
assert(
  !changeMoneyAttitudeArticle.leadBeforeAudio.includes(
    "Отношение к деньгам складывается из личного опыта",
  ),
  "change money attitude lead is not a second definition",
);
assert(
  changeMoneyAttitudeArticle.introAfterAudio[0] ===
    "Изменить это за один день невозможно.",
  "change money attitude intro starts after lead",
);
assert(
  !changeMoneyAttitudeArticle.introAfterAudio.includes(
    changeMoneyAttitudeArticle.leadBeforeAudio,
  ),
  "change money attitude lead not duplicated in intro",
);
assert(
  !changeMoneyAttitudeArticle.introAfterAudio.some((paragraph) =>
    paragraph.includes("Отношение к деньгам складывается из личного опыта"),
  ),
  "change money attitude intro does not repeat shortAnswer",
);
assert(
  changeMoneyAttitudeArticle.sections.some((section) =>
    section.paragraphs.includes("Понятный план работы с долгами."),
  ),
  "change money attitude keeps debt-plan wording",
);
assert(
  changeMoneyAttitudeArticle.sections.some((section) =>
    section.paragraphs.includes(
      "Лучше выберите одно небольшое действие, которое можно выполнить уже сегодня.",
    ),
  ),
  "change money attitude includes today-action exercise",
);
assert(
  changeMoneyAttitudeArticle.captionAfterAudio === "",
  "change money attitude no artificial caption",
);
assert(
  changeMoneyAttitudeArticle.finalAudioLead === "",
  "change money attitude no second primary player",
);
assert(changeMoneyAttitudeArticle.faq.length === 3, "change money attitude faq");
assert(
  changeMoneyAttitudeArticle.faq[0]?.question ===
    "Можно ли изменить своё отношение к деньгам?",
  "change money attitude FAQ first question",
);
assert(
  !changeMoneyAttitudeArticle.faq[0]?.question.includes("полностью"),
  "change money attitude FAQ avoids полностью wording",
);
assert(
  changeMoneyAttitudeArticle.afterFinalAudio?.some(
    (item) => item.href === "/p/denezhnyy-potok-9288",
  ),
  "change money attitude links to playlist as playlist CTA",
);
assert(
  changeMoneyAttitudeArticle.afterFinalAudio?.some((item) =>
    String(item.after ?? "").toLowerCase().includes("плейлист"),
  ),
  "change money attitude CTA names playlist explicitly",
);
assert(
  changeMoneyAttitudeArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href === "/articles/kak-privlech-dengi-v-svoyu-zhizn",
    ),
  ),
  "change money attitude links to how-to attract money article",
);
assert(
  changeMoneyAttitudeArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment && segment.href === "/articles/affirmatsii-na-dengi",
    ),
  ),
  "change money attitude links to money affirmations article",
);
assert(
  changeMoneyAttitudeArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href === "/articles/chto-takoe-denezhnyy-potok",
    ),
  ),
  "change money attitude links to money flow article",
);
assert(
  !JSON.stringify(changeMoneyAttitudeArticle.afterFinalAudio).includes(
    "/practice/sergey-and-zoya/klyuch-k-izobiliyu",
  ),
  "change money attitude does not re-link primary practice in CTA",
);
assert(
  Boolean(changeMoneyAttitudeArticle.brandNote?.includes("АудиоЛаде")),
  "change money attitude brand note",
);
assert(
  changeMoneyAttitudeArticle.seeAlsoLinks.some(
    (item) => item.href === "/topics/meditatsii-na-dengi",
  ),
  "change money attitude see-also includes hub",
);
assert(
  listArticlesByTopicSlug("meditatsii-na-dengi").some(
    (item) => item.slug === "kak-izmenit-otnoshenie-k-dengam",
  ),
  "money hub lists change money attitude article",
);
assert(
  !changeMoneyAttitudeArticle.leadBeforeAudio.includes("—") &&
    !changeMoneyAttitudeArticle.shortAnswer.includes("—") &&
    !changeMoneyAttitudeArticle.metaTitle.includes("—"),
  "change money attitude uses medium dash",
);
assert(
  listArticleSlugs().includes("kak-izmenit-otnoshenie-k-dengam"),
  "change money attitude in slug list",
);
assert(
  listArticleSlugs().filter(
    (slug) => slug === "kak-izmenit-otnoshenie-k-dengam",
  ).length === 1,
  "change money attitude slug unique",
);
assert(
  changeMoneyAttitudeArticle.closingSection.paragraphs.some((paragraph) =>
    paragraph.includes("начинают работать вместе"),
  ),
  "change money attitude closing keeps работать вместе wording",
);

const wishMeditationArticle = getArticleBySlug(
  "meditatsiya-na-ispolnenie-zhelaniy",
);
assert(wishMeditationArticle, "wish meditation article registered");
assert(
  wishMeditationArticle.title ===
    "Медитация на исполнение желаний: что это такое и чего от неё можно ожидать",
  "wish meditation H1",
);
assert(
  wishMeditationArticle.metaTitle.startsWith(
    "Медитация на исполнение желаний",
  ),
  "wish meditation SEO title keeps primary query",
);
assert(
  wishMeditationArticle.metaTitle.includes("АудиоЛад") &&
    !wishMeditationArticle.metaTitle.includes("АудиоЛад – АудиоЛад"),
  "wish meditation SEO title has brand once",
);
assert(
  wishMeditationArticle.metaDescription !==
    wishMeditationArticle.leadBeforeAudio,
  "wish meditation metaDescription is not visual lead",
);
assert(
  wishMeditationArticle.topicSlug === "besplatnye-meditatsii",
  "wish meditation uses free meditations hub",
);
assert(
  wishMeditationArticle.topicHref === "/topics/besplatnye-meditatsii",
  "wish meditation topic href",
);
assert(
  wishMeditationArticle.topicSlug !== "meditatsii-na-dengi",
  "wish meditation is not forced into money hub",
);
assert(
  wishMeditationArticle.primaryPractice.practiceKey === "klyuch-k-izobiliyu",
  "wish meditation primary practice key",
);
assert(
  wishMeditationArticle.primaryPracticeIntro.includes("Ключ к Изобилию"),
  "wish meditation practice intro",
);
assert(
  !JSON.stringify(wishMeditationArticle).includes(
    "Если для этой темы больше подойдёт",
  ),
  "wish meditation content has no editorial practice fork",
);
assert(
  wishMeditationArticle.leadBeforeAudio.includes(
    "А вдруг существует практика, которая поможет приблизить желаемое?",
  ),
  "wish meditation opening body paragraph",
);
assert(
  wishMeditationArticle.shortAnswer.startsWith(
    "Медитация на исполнение желаний – это спокойная практика",
  ),
  "wish meditation short answer keeps definition role",
);
assert(
  !wishMeditationArticle.leadBeforeAudio.includes(
    "Медитация на исполнение желаний – это",
  ),
  "wish meditation lead is not a second definition",
);
assert(
  wishMeditationArticle.introAfterAudio[0] ===
    "Возникает закономерный вопрос – чего действительно можно ожидать от такой практики?",
  "wish meditation intro starts after lead",
);
assert(
  !wishMeditationArticle.introAfterAudio.includes(
    wishMeditationArticle.leadBeforeAudio,
  ),
  "wish meditation lead not duplicated in intro",
);
assert(
  wishMeditationArticle.sections.some((section) =>
    section.paragraphs.includes(
      "«Какой один небольшой шаг я могу сделать уже сегодня?»",
    ),
  ),
  "wish meditation includes today-action exercise",
);
assert(
  wishMeditationArticle.captionAfterAudio === "",
  "wish meditation no artificial caption",
);
assert(
  wishMeditationArticle.finalAudioLead === "",
  "wish meditation no second primary player",
);
assert(wishMeditationArticle.faq.length === 3, "wish meditation faq");
assert(
  wishMeditationArticle.faq[0]?.answer.startsWith("Нет."),
  "wish meditation FAQ rejects wish-fulfillment guarantee",
);
assert(
  !JSON.stringify(wishMeditationArticle).toLowerCase().includes("вселенн"),
  "wish meditation avoids universe-manifestation wording",
);
assert(
  wishMeditationArticle.afterFinalAudio?.some(
    (item) => item.href === "/topics/besplatnye-meditatsii",
  ),
  "wish meditation links to free meditations hub as collection CTA",
);
assert(
  wishMeditationArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href === "/articles/vizualizatsiya-zhelaniy",
    ),
  ),
  "wish meditation reverse-links to wish visualization article",
);
assert(
  wishMeditationArticle.sections.some((section) =>
    section.paragraphs.some((paragraph) =>
      paragraph.includes("визуализация желаемого результата"),
    ),
  ),
  "wish meditation mentions visualization as clarity tool",
);
assert(
  wishMeditationArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href === "/articles/besplatnye-meditatsii-onlayn",
    ),
  ),
  "wish meditation links to free meditations article",
);
assert(
  !JSON.stringify(wishMeditationArticle.afterFinalAudio).includes(
    "/p/denezhnyy-potok-9288",
  ),
  "wish meditation does not pull money playlist into CTA",
);
assert(
  !JSON.stringify(wishMeditationArticle.afterFinalAudio).includes(
    "/practice/sergey-and-zoya/klyuch-k-izobiliyu",
  ),
  "wish meditation does not re-link primary practice in CTA",
);
assert(
  Boolean(wishMeditationArticle.brandNote?.includes("АудиоЛаде")),
  "wish meditation brand note",
);
assert(
  wishMeditationArticle.seeAlsoLinks.some(
    (item) => item.href === "/topics/besplatnye-meditatsii",
  ),
  "wish meditation see-also includes primary hub",
);
assert(
  listArticlesByTopicSlug("besplatnye-meditatsii").some(
    (item) => item.slug === "meditatsiya-na-ispolnenie-zhelaniy",
  ),
  "free hub lists wish meditation article",
);
assert(
  !wishMeditationArticle.leadBeforeAudio.includes("—") &&
    !wishMeditationArticle.shortAnswer.includes("—") &&
    !wishMeditationArticle.metaTitle.includes("—"),
  "wish meditation uses medium dash",
);
assert(
  listArticleSlugs().includes("meditatsiya-na-ispolnenie-zhelaniy"),
  "wish meditation in slug list",
);
assert(
  listArticleSlugs().filter(
    (slug) => slug === "meditatsiya-na-ispolnenie-zhelaniy",
  ).length === 1,
  "wish meditation slug unique",
);

const wishVisualizationArticle = getArticleBySlug("vizualizatsiya-zhelaniy");
assert(wishVisualizationArticle, "wish visualization article registered");
assert(
  wishVisualizationArticle.title ===
    "Визуализация желаний: что это такое и может ли она быть полезной",
  "wish visualization H1",
);
assert(
  wishVisualizationArticle.metaTitle.startsWith("Визуализация желаний"),
  "wish visualization SEO title keeps primary query",
);
assert(
  wishVisualizationArticle.metaTitle.includes("АудиоЛад") &&
    !wishVisualizationArticle.metaTitle.includes("АудиоЛад – АудиоЛад"),
  "wish visualization SEO title has brand once",
);
assert(
  wishVisualizationArticle.metaDescription !==
    wishVisualizationArticle.leadBeforeAudio,
  "wish visualization metaDescription is not visual lead",
);
assert(
  wishVisualizationArticle.topicSlug === "besplatnye-meditatsii",
  "wish visualization uses free meditations hub",
);
assert(
  wishVisualizationArticle.topicHref === "/topics/besplatnye-meditatsii",
  "wish visualization topic href",
);
assert(
  wishVisualizationArticle.topicSlug !== "meditatsii-na-dengi",
  "wish visualization is not forced into money hub",
);
assert(
  wishVisualizationArticle.primaryPractice.practiceKey === "klyuch-k-izobiliyu",
  "wish visualization primary practice key",
);
assert(
  wishVisualizationArticle.primaryPracticeIntro.includes("Ключ к Изобилию"),
  "wish visualization practice intro",
);
assert(
  !JSON.stringify(wishVisualizationArticle).includes(
    "Перед публикацией стоит проверить",
  ),
  "wish visualization content has no editorial notes",
);
assert(
  wishVisualizationArticle.leadBeforeAudio.includes(
    "представить свою мечту во всех подробностях",
  ),
  "wish visualization opening body paragraph",
);
assert(
  wishVisualizationArticle.shortAnswer.startsWith(
    "Многие используют визуализацию как способ мысленно представить",
  ),
  "wish visualization short answer keeps definition role",
);
assert(
  !wishVisualizationArticle.leadBeforeAudio.includes(
    "Многие используют визуализацию как способ",
  ),
  "wish visualization lead is not a second definition",
);
assert(
  wishVisualizationArticle.introAfterAudio[0] ===
    "Поэтому возникает закономерный вопрос – действительно ли визуализация может быть полезной или это просто красивая идея?",
  "wish visualization intro starts after lead",
);
assert(
  !wishVisualizationArticle.introAfterAudio.includes(
    wishVisualizationArticle.leadBeforeAudio,
  ),
  "wish visualization lead not duplicated in intro",
);
assert(
  wishVisualizationArticle.sections.some((section) =>
    section.paragraphs.includes("«Что я могу сделать уже сегодня?»"),
  ),
  "wish visualization includes today-action prompt",
);
assert(
  wishVisualizationArticle.captionAfterAudio === "",
  "wish visualization no artificial caption",
);
assert(
  wishVisualizationArticle.finalAudioLead === "",
  "wish visualization no second primary player",
);
assert(wishVisualizationArticle.faq.length === 3, "wish visualization faq");
assert(
  wishVisualizationArticle.faq[0]?.answer.startsWith("Нет."),
  "wish visualization FAQ rejects fulfillment guarantee",
);
assert(
  !JSON.stringify(wishVisualizationArticle).toLowerCase().includes("вселенн"),
  "wish visualization avoids universe-manifestation wording",
);
assert(
  !JSON.stringify(wishVisualizationArticle).toLowerCase().includes("закон притяжения"),
  "wish visualization avoids attraction-law framing",
);
assert(
  wishVisualizationArticle.afterFinalAudio?.some(
    (item) => item.href === "/topics/besplatnye-meditatsii",
  ),
  "wish visualization links to free meditations hub as collection CTA",
);
assert(
  wishVisualizationArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href === "/articles/meditatsiya-na-ispolnenie-zhelaniy",
    ),
  ),
  "wish visualization links to wish meditation article",
);
assert(
  wishVisualizationArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href === "/articles/besplatnye-meditatsii-onlayn",
    ),
  ),
  "wish visualization links to free meditations article",
);
assert(
  !JSON.stringify(wishVisualizationArticle.afterFinalAudio).includes(
    "/p/denezhnyy-potok-9288",
  ),
  "wish visualization does not pull money playlist into CTA",
);
assert(
  !JSON.stringify(wishVisualizationArticle.afterFinalAudio).includes(
    "/practice/sergey-and-zoya/klyuch-k-izobiliyu",
  ),
  "wish visualization does not re-link primary practice in CTA",
);
assert(
  Boolean(wishVisualizationArticle.brandNote?.includes("АудиоЛаде")),
  "wish visualization brand note",
);
assert(
  wishVisualizationArticle.seeAlsoLinks.some(
    (item) => item.href === "/topics/besplatnye-meditatsii",
  ),
  "wish visualization see-also includes primary hub",
);
assert(
  listArticlesByTopicSlug("besplatnye-meditatsii").some(
    (item) => item.slug === "vizualizatsiya-zhelaniy",
  ),
  "free hub lists wish visualization article",
);
assert(
  !listArticlesByTopicSlug("meditatsii-na-dengi").some(
    (item) => item.slug === "vizualizatsiya-zhelaniy",
  ),
  "money hub does not list wish visualization article",
);
assert(
  !wishVisualizationArticle.leadBeforeAudio.includes("—") &&
    !wishVisualizationArticle.shortAnswer.includes("—") &&
    !wishVisualizationArticle.metaTitle.includes("—"),
  "wish visualization uses medium dash",
);
assert(
  listArticleSlugs().includes("vizualizatsiya-zhelaniy"),
  "wish visualization in slug list",
);
assert(
  listArticleSlugs().filter((slug) => slug === "vizualizatsiya-zhelaniy")
    .length === 1,
  "wish visualization slug unique",
);
assert(
  wishVisualizationArticle.closingSection.paragraphs.some((paragraph) =>
    paragraph.includes("не способ управлять будущими событиями"),
  ),
  "wish visualization closing rejects future-control framing",
);

const releaseResentmentArticle = getArticleBySlug("kak-otpustit-obidu");
assert(releaseResentmentArticle, "release resentment article registered");
assert(
  releaseResentmentArticle.title ===
    "Как отпустить обиду и перестать снова возвращаться к болезненной ситуации",
  "release resentment H1",
);
assert(
  releaseResentmentArticle.metaTitle.startsWith("Как отпустить обиду"),
  "release resentment SEO title keeps primary query",
);
assert(
  releaseResentmentArticle.metaTitle.includes("АудиоЛад") &&
    !releaseResentmentArticle.metaTitle.includes("АудиоЛад – АудиоЛад"),
  "release resentment SEO title has brand once",
);
assert(
  releaseResentmentArticle.metaDescription !==
    releaseResentmentArticle.leadBeforeAudio,
  "release resentment metaDescription is not visual lead",
);
assert(
  releaseResentmentArticle.topicSlug === "besplatnye-meditatsii",
  "release resentment uses free meditations hub",
);
assert(
  releaseResentmentArticle.topicHref === "/topics/besplatnye-meditatsii",
  "release resentment topic href",
);
assert(
  releaseResentmentArticle.topicSlug !== "meditatsii-na-dengi",
  "release resentment is not forced into money hub",
);
assert(
  releaseResentmentArticle.primaryPractice.practiceKey ===
    "13-shagov-radikalnogo-proscheniya",
  "release resentment primary practice key",
);
assert(
  releaseResentmentArticle.primaryPracticeIntro.includes(
    "13 шагов Радикального прощения",
  ),
  "release resentment practice intro",
);
assert(
  !releaseResentmentArticle.primaryPracticeIntro.includes("мгновенно"),
  "release resentment practice intro avoids instant-result claims",
);
assert(
  releaseResentmentArticle.leadBeforeAudio.includes(
    "внутри продолжает звучать снова и снова",
  ),
  "release resentment opening body paragraph",
);
assert(
  releaseResentmentArticle.shortAnswer.startsWith(
    "Отпустить обиду – не значит признать чужой поступок правильным",
  ),
  "release resentment short answer keeps definition role",
);
assert(
  !releaseResentmentArticle.leadBeforeAudio.includes(
    "Отпустить обиду – не значит признать",
  ),
  "release resentment lead is not a second definition",
);
assert(
  releaseResentmentArticle.introAfterAudio[0] ===
    "Возникает естественный вопрос – как отпустить обиду, если произошедшее по-прежнему кажется несправедливым и продолжает влиять на внутреннее состояние?",
  "release resentment intro starts after lead",
);
assert(
  releaseResentmentArticle.sections.some((section) =>
    section.paragraphs.includes(
      "Можно перестать жить внутри произошедшего и при этом не продолжать отношения.",
    ),
  ),
  "release resentment keeps softened boundary wording",
);
assert(
  !JSON.stringify(releaseResentmentArticle).includes(
    "Можно простить и не продолжать отношения.",
  ),
  "release resentment has no categorical forgive-and-leave wording",
);
assert(
  !JSON.stringify(releaseResentmentArticle).includes(
    "эмоционально незавершённая ситуация",
  ),
  "release resentment FAQ/body avoids unfinished-situation jargon",
);
assert(
  releaseResentmentArticle.captionAfterAudio === "",
  "release resentment no artificial caption",
);
assert(
  releaseResentmentArticle.finalAudioLead === "",
  "release resentment no second primary player",
);
assert(releaseResentmentArticle.faq.length === 4, "release resentment faq");
assert(
  releaseResentmentArticle.faq[3]?.answer.startsWith("Нет."),
  "release resentment FAQ does not require restoring contact",
);
assert(
  releaseResentmentArticle.afterFinalAudio?.some(
    (item) => item.href === "/topics/besplatnye-meditatsii",
  ),
  "release resentment links to free meditations hub as collection CTA",
);
assert(
  releaseResentmentArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/besplatnye-meditatsii-onlayn",
  ),
  "release resentment links to free meditations article",
);
assert(
  releaseResentmentArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-prostit-cheloveka",
  ),
  "release resentment reverse-links to forgive-a-person article",
);
assert(
  releaseResentmentArticle.sections.some((section) =>
    section.paragraphs.some((paragraph) =>
      paragraph.includes(
        "как простить человека без оправдания его поступка и обязательного примирения",
      ),
    ),
  ),
  "release resentment mentions forgive-without-reconcile intent",
);
assert(
  !JSON.stringify(releaseResentmentArticle).includes(
    "/articles/kak-prostit\"",
  ) &&
    !JSON.stringify(releaseResentmentArticle).includes(
      "/articles/kak-prostit'",
    ),
  "release resentment does not link unpublished stub slug kak-prostit",
);
assert(
  Boolean(releaseResentmentArticle.brandNote?.includes("АудиоЛаде")),
  "release resentment brand note",
);
assert(
  releaseResentmentArticle.seeAlsoLinks.some(
    (item) => item.href === "/topics/besplatnye-meditatsii",
  ),
  "release resentment see-also includes primary hub",
);
assert(
  releaseResentmentArticle.updatedAt === "2026-07-27T12:00:00.000Z",
  "release resentment updatedAt bumped for past-release seeAlso",
);
assert(
  releaseResentmentArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/pochemu-my-postoyanno-obizhaemsya",
  ),
  "release resentment see-also includes habitual-offense article",
);
assert(
  releaseResentmentArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-otpustit-proshloe",
  ),
  "release resentment see-also includes past-release article",
);
assert(
  !releaseResentmentArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/pochemu-my-postoyanno-obizhaemsya",
  ) &&
    !releaseResentmentArticle.afterFinalAudio?.some(
      (item) => item.href === "/articles/kak-otpustit-proshloe",
    ),
  "release resentment avoids CTA overload for habitual/past reverse",
);
assert(
  !releaseResentmentArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-prostit-cheloveka",
  ),
  "release resentment seeAlso avoids triple-link for forgive-a-person",
);
assert(
  releaseResentmentArticle.publishedAt === "2026-07-27T00:00:00.000Z",
  "release resentment publishedAt unchanged",
);
assert(
  listArticlesByTopicSlug("besplatnye-meditatsii").some(
    (item) => item.slug === "kak-otpustit-obidu",
  ),
  "free hub lists release resentment article",
);
assert(
  !listArticlesByTopicSlug("meditatsii-na-dengi").some(
    (item) => item.slug === "kak-otpustit-obidu",
  ),
  "money hub does not list release resentment article",
);
assert(
  !releaseResentmentArticle.leadBeforeAudio.includes("—") &&
    !releaseResentmentArticle.shortAnswer.includes("—") &&
    !releaseResentmentArticle.metaTitle.includes("—"),
  "release resentment uses medium dash",
);
assert(
  listArticleSlugs().includes("kak-otpustit-obidu"),
  "release resentment in slug list",
);
assert(
  listArticleSlugs().filter((slug) => slug === "kak-otpustit-obidu").length ===
    1,
  "release resentment slug unique",
);
assert(
  releaseResentmentArticle.sections.some((section) =>
    section.paragraphs.some((paragraph) =>
      paragraph.includes("профессиональной поддержкой"),
    ),
  ),
  "release resentment keeps professional-support safety note",
);

const forgivePersonArticle = getArticleBySlug("kak-prostit-cheloveka");
assert(forgivePersonArticle, "forgive-a-person article registered");
assert(
  forgivePersonArticle.title ===
    "Как простить человека, если обида всё ещё не отпускает",
  "forgive-a-person H1",
);
assert(
  forgivePersonArticle.metaTitle ===
    "Как простить человека без примирения и восстановления доверия – АудиоЛад",
  "forgive-a-person SEO title differs from resentment article and keeps brand once",
);
assert(
  forgivePersonArticle.metaTitle !== releaseResentmentArticle.metaTitle,
  "forgive-a-person and resentment SEO titles differ",
);
assert(
  forgivePersonArticle.metaDescription !==
    forgivePersonArticle.leadBeforeAudio,
  "forgive-a-person metaDescription is not visual lead",
);
assert(
  forgivePersonArticle.metaDescription !==
    releaseResentmentArticle.metaDescription,
  "forgive-a-person and resentment meta descriptions differ",
);
assert(
  forgivePersonArticle.shortAnswer !== releaseResentmentArticle.shortAnswer,
  "forgive-a-person and resentment short answers differ",
);
assert(
  forgivePersonArticle.leadBeforeAudio !==
    releaseResentmentArticle.leadBeforeAudio,
  "forgive-a-person and resentment leads differ",
);
assert(
  forgivePersonArticle.topicSlug === "besplatnye-meditatsii",
  "forgive-a-person uses free meditations hub",
);
assert(
  forgivePersonArticle.topicHref === "/topics/besplatnye-meditatsii",
  "forgive-a-person topic href",
);
assert(
  forgivePersonArticle.topicSlug !== "meditatsii-na-dengi",
  "forgive-a-person is not forced into money hub",
);
assert(
  forgivePersonArticle.primaryPractice.practiceKey ===
    "13-shagov-radikalnogo-proscheniya",
  "forgive-a-person primary practice key",
);
assert(
  forgivePersonArticle.primaryPracticeIntro.includes(
    "13 шагов Радикального прощения",
  ),
  "forgive-a-person practice intro",
);
assert(
  forgivePersonArticle.primaryPracticeIntro.includes(
    "последовательный внутренний процесс",
  ),
  "forgive-a-person practice intro stays catalog-aligned",
);
assert(
  !forgivePersonArticle.primaryPracticeIntro.includes("гарант"),
  "forgive-a-person practice intro avoids guarantees",
);
assert(
  forgivePersonArticle.leadBeforeAudio.includes(
    "устал носить в себе обиду, но простить всё равно не получается",
  ),
  "forgive-a-person opening body paragraph",
);
assert(
  forgivePersonArticle.shortAnswer.startsWith(
    "Простить человека не значит оправдать его поступок",
  ),
  "forgive-a-person short answer keeps definition role",
);
assert(
  !forgivePersonArticle.leadBeforeAudio.includes(
    "Простить человека не значит оправдать",
  ),
  "forgive-a-person lead is not a second definition",
);
assert(
  forgivePersonArticle.introAfterAudio[0] ===
    "В такой ситуации слово «простить» может вызывать сопротивление.",
  "forgive-a-person intro starts after lead",
);
assert(
  forgivePersonArticle.sections.some(
    (section) =>
      section.title ===
      "Прощение, оправдание, примирение и доверие – не одно и то же",
  ),
  "forgive-a-person keeps intent-separating H2",
);
assert(
  forgivePersonArticle.sections.some((section) =>
    section.paragraphs.includes(
      "Можно простить и больше не поддерживать общение.",
    ),
  ),
  "forgive-a-person keeps forgive-without-contact wording",
);
assert(
  forgivePersonArticle.captionAfterAudio === "",
  "forgive-a-person no artificial caption",
);
assert(
  forgivePersonArticle.finalAudioLead === "",
  "forgive-a-person no second primary player",
);
assert(forgivePersonArticle.faq.length === 7, "forgive-a-person faq count");
assert(
  forgivePersonArticle.faq.some((item) =>
    item.question.includes("не доверять"),
  ),
  "forgive-a-person FAQ covers trust separately",
);
assert(
  forgivePersonArticle.faq.some((item) =>
    item.question.includes("продолжает причинять боль"),
  ),
  "forgive-a-person FAQ covers ongoing harm",
);
assert(
  !forgivePersonArticle.faq.some((item) =>
    item.question.includes("отпустить обиду"),
  ),
  "forgive-a-person FAQ does not steal resentment primary intent",
);
assert(
  forgivePersonArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-otpustit-obidu",
  ),
  "forgive-a-person links to release resentment article",
);
assert(
  forgivePersonArticle.afterFinalAudio?.some(
    (item) => item.href === "/topics/besplatnye-meditatsii",
  ),
  "forgive-a-person links to free meditations hub as collection CTA",
);
assert(
  !JSON.stringify(forgivePersonArticle.afterFinalAudio).includes(
    "/p/denezhnyy-potok-9288",
  ),
  "forgive-a-person does not pull money playlist into CTA",
);
assert(
  !JSON.stringify(forgivePersonArticle).includes("/topics/izobilie"),
  "forgive-a-person avoids unrelated abundance hub links",
);
assert(
  Boolean(forgivePersonArticle.brandNote?.includes("АудиоЛаде")),
  "forgive-a-person brand note",
);
assert(
  forgivePersonArticle.sections.some((section) =>
    section.paragraphs.some((paragraph) =>
      paragraph.includes("профессиональной поддержкой"),
    ),
  ),
  "forgive-a-person keeps professional-support safety note",
);
assert(
  forgivePersonArticle.sections.some((section) =>
    section.paragraphs.some((paragraph) =>
      paragraph.includes("насилием") || paragraph.includes("угрозой безопасности"),
    ),
  ),
  "forgive-a-person keeps violence/safety boundary",
);
assert(
  forgivePersonArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-otpustit-obidu",
  ),
  "forgive-a-person see-also includes resentment article",
);
assert(
  listArticlesByTopicSlug("besplatnye-meditatsii").some(
    (item) => item.slug === "kak-prostit-cheloveka",
  ),
  "free hub lists forgive-a-person article",
);
assert(
  !listArticlesByTopicSlug("meditatsii-na-dengi").some(
    (item) => item.slug === "kak-prostit-cheloveka",
  ),
  "money hub does not list forgive-a-person article",
);
assert(
  !forgivePersonArticle.leadBeforeAudio.includes("—") &&
    !forgivePersonArticle.shortAnswer.includes("—") &&
    !forgivePersonArticle.metaTitle.includes("—"),
  "forgive-a-person uses medium dash",
);
assert(
  listArticleSlugs().includes("kak-prostit-cheloveka"),
  "forgive-a-person in slug list",
);
assert(
  listArticleSlugs().filter((slug) => slug === "kak-prostit-cheloveka")
    .length === 1,
  "forgive-a-person slug unique",
);
assert(
  !forgivePersonArticle.metaTitle
    .toLowerCase()
    .includes("отпустить обиду"),
  "forgive-a-person SEO title does not target resentment query",
);
assert(
  forgivePersonArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/pochemu-my-postoyanno-obizhaemsya",
  ),
  "forgive-a-person reverse-links to habitual-offense article",
);
assert(
  !forgivePersonArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/pochemu-my-postoyanno-obizhaemsya",
  ),
  "forgive-a-person seeAlso avoids triple-link for habitual-offense",
);
assert(
  forgivePersonArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-otpustit-proshloe",
  ),
  "forgive-a-person see-also includes past-release article",
);
assert(
  !forgivePersonArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-otpustit-proshloe",
  ),
  "forgive-a-person avoids CTA overload for past-release reverse",
);
assert(
  forgivePersonArticle.updatedAt === "2026-07-27T14:00:00.000Z",
  "forgive-a-person updatedAt bumped for anger reverse-link edit",
);
assert(
  forgivePersonArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-perestat-zlitsya-na-cheloveka",
  ),
  "forgive-a-person reverse-links to anger article",
);
assert(
  forgivePersonArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-prostit-sebya",
  ),
  "forgive-a-person reverse-links to self-forgiveness article",
);
assert(
  forgivePersonArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-prostit-sebya",
  ),
  "forgive-a-person see-also includes self-forgiveness",
);
assert(
  forgivePersonArticle.publishedAt === "2026-07-27T00:00:00.000Z",
  "forgive-a-person publishedAt unchanged",
);

const habitualOffenseArticle = getArticleBySlug(
  "pochemu-my-postoyanno-obizhaemsya",
);
assert(habitualOffenseArticle, "habitual-offense article registered");
assert(
  habitualOffenseArticle.title ===
    "Почему мы постоянно обижаемся и что с этим делать",
  "habitual-offense H1",
);
assert(
  habitualOffenseArticle.metaTitle ===
    "Почему мы постоянно обижаемся и как реагировать спокойнее – АудиоЛад",
  "habitual-offense SEO title",
);
assert(
  habitualOffenseArticle.metaTitle !== releaseResentmentArticle.metaTitle &&
    habitualOffenseArticle.metaTitle !== forgivePersonArticle.metaTitle,
  "habitual-offense SEO title differs from both siblings",
);
assert(
  habitualOffenseArticle.metaDescription !==
    habitualOffenseArticle.leadBeforeAudio,
  "habitual-offense metaDescription is not visual lead",
);
assert(
  habitualOffenseArticle.metaDescription !==
    releaseResentmentArticle.metaDescription &&
    habitualOffenseArticle.metaDescription !==
      forgivePersonArticle.metaDescription,
  "habitual-offense meta description differs from siblings",
);
assert(
  habitualOffenseArticle.shortAnswer !== releaseResentmentArticle.shortAnswer &&
    habitualOffenseArticle.shortAnswer !== forgivePersonArticle.shortAnswer,
  "habitual-offense short answer differs from siblings",
);
assert(
  habitualOffenseArticle.leadBeforeAudio !==
    releaseResentmentArticle.leadBeforeAudio &&
    habitualOffenseArticle.leadBeforeAudio !==
      forgivePersonArticle.leadBeforeAudio,
  "habitual-offense lead differs from siblings",
);
assert(
  habitualOffenseArticle.topicSlug === "besplatnye-meditatsii",
  "habitual-offense uses free meditations hub",
);
assert(
  habitualOffenseArticle.primaryPractice.practiceKey ===
    "13-shagov-radikalnogo-proscheniya",
  "habitual-offense primary practice key",
);
assert(
  habitualOffenseArticle.primaryPracticeIntro.includes(
    "последовательный внутренний процесс",
  ),
  "habitual-offense practice intro stays catalog-aligned",
);
assert(
  !habitualOffenseArticle.primaryPracticeIntro.includes("ожидан"),
  "habitual-offense practice intro does not invent expectations work",
);
assert(
  habitualOffenseArticle.leadBeforeAudio.includes(
    "устал постоянно обижаться",
  ),
  "habitual-offense opening body paragraph",
);
assert(
  habitualOffenseArticle.shortAnswer.startsWith(
    "Избавиться от привычки постоянно обижаться не значит перестать чувствовать",
  ),
  "habitual-offense short answer keeps definition role",
);
assert(
  !habitualOffenseArticle.leadBeforeAudio.includes(
    "Избавиться от привычки постоянно обижаться",
  ),
  "habitual-offense lead is not a second definition",
);
assert(
  habitualOffenseArticle.introAfterAudio[0]?.includes(
    "привычки постоянно обижаться",
  ),
  "habitual-offense intro starts after lead",
);
assert(
  habitualOffenseArticle.sections.some(
    (section) => section.title === "Почему мелкие обиды могут накапливаться",
  ),
  "habitual-offense keeps accumulation H2",
);
assert(
  habitualOffenseArticle.sections.some(
    (section) =>
      section.title ===
      "Как понять, действительно ли нарушены ваши границы",
  ),
  "habitual-offense keeps boundaries H2",
);
assert(
  habitualOffenseArticle.finalAudioLead === "",
  "habitual-offense no second primary player",
);
assert(habitualOffenseArticle.faq.length === 4, "habitual-offense faq count");
assert(
  habitualOffenseArticle.faq.some((item) =>
    item.question.includes("по мелочам"),
  ),
  "habitual-offense FAQ covers petty offense pattern",
);
assert(
  !habitualOffenseArticle.faq.some((item) =>
    item.question.toLowerCase().includes("простить"),
  ),
  "habitual-offense FAQ does not steal forgive-person intent",
);
assert(
  !habitualOffenseArticle.metaTitle.toLowerCase().includes("отпустить обиду") &&
    !habitualOffenseArticle.metaTitle.toLowerCase().includes("простить человека"),
  "habitual-offense SEO title avoids sibling primary queries",
);
assert(
  habitualOffenseArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-prostit-cheloveka",
  ),
  "habitual-offense links to forgive-a-person article",
);
assert(
  habitualOffenseArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-otpustit-obidu",
  ),
  "habitual-offense links to release resentment article",
);
assert(
  habitualOffenseArticle.afterFinalAudio?.some(
    (item) => item.href === "/topics/besplatnye-meditatsii",
  ),
  "habitual-offense links to free meditations hub",
);
assert(
  !habitualOffenseArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-prostit-cheloveka",
  ) &&
    !habitualOffenseArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/kak-otpustit-obidu",
    ),
  "habitual-offense seeAlso avoids triple-linking siblings",
);
assert(
  Boolean(habitualOffenseArticle.brandNote?.includes("АудиоЛаде")),
  "habitual-offense brand note",
);
assert(
  habitualOffenseArticle.sections.some((section) =>
    section.paragraphs.some((paragraph) =>
      paragraph.includes("профессиональной поддержкой"),
    ),
  ),
  "habitual-offense keeps professional-support safety note",
);
assert(
  listArticlesByTopicSlug("besplatnye-meditatsii").some(
    (item) => item.slug === "pochemu-my-postoyanno-obizhaemsya",
  ),
  "free hub lists habitual-offense article",
);
assert(
  !listArticlesByTopicSlug("meditatsii-na-dengi").some(
    (item) => item.slug === "pochemu-my-postoyanno-obizhaemsya",
  ),
  "money hub does not list habitual-offense article",
);
assert(
  !habitualOffenseArticle.leadBeforeAudio.includes("—") &&
    !habitualOffenseArticle.shortAnswer.includes("—") &&
    !habitualOffenseArticle.metaTitle.includes("—"),
  "habitual-offense uses medium dash",
);
assert(
  listArticleSlugs().includes("pochemu-my-postoyanno-obizhaemsya"),
  "habitual-offense in slug list",
);
assert(
  listArticleSlugs().filter(
    (slug) => slug === "pochemu-my-postoyanno-obizhaemsya",
  ).length === 1,
  "habitual-offense slug unique",
);
assert(
  habitualOffenseArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-otpustit-proshloe",
  ),
  "habitual-offense reverse-links to past-release article",
);
assert(
  habitualOffenseArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-otpustit-proshloe",
  ),
  "habitual-offense see-also includes past-release article",
);
assert(
  habitualOffenseArticle.updatedAt === "2026-07-27T14:00:00.000Z",
  "habitual-offense updatedAt bumped for anger reverse",
);
assert(
  habitualOffenseArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-perestat-zlitsya-na-cheloveka",
  ),
  "habitual-offense reverse-links to anger article",
);
assert(
  habitualOffenseArticle.publishedAt === "2026-07-27T00:00:00.000Z",
  "habitual-offense publishedAt unchanged",
);

const pastReleaseArticle = getArticleBySlug("kak-otpustit-proshloe");
assert(pastReleaseArticle, "past-release article registered");
assert(
  pastReleaseArticle.title ===
    "Как отпустить прошлое и перестать жить воспоминаниями",
  "past-release H1",
);
assert(
  pastReleaseArticle.metaTitle ===
    "Как отпустить прошлое и начать жить настоящим – АудиоЛад",
  "past-release SEO title",
);
assert(
  pastReleaseArticle.metaTitle !== releaseResentmentArticle.metaTitle &&
    pastReleaseArticle.metaTitle !== forgivePersonArticle.metaTitle &&
    pastReleaseArticle.metaTitle !== habitualOffenseArticle.metaTitle,
  "past-release SEO title differs from three siblings",
);
assert(
  !pastReleaseArticle.metaTitle.toLowerCase().includes("отпустить обиду") &&
    !pastReleaseArticle.metaTitle.toLowerCase().includes("простить человека") &&
    !pastReleaseArticle.metaTitle.toLowerCase().includes("постоянно обижаемся"),
  "past-release SEO title avoids sibling primary queries",
);
assert(
  pastReleaseArticle.metaDescription !== pastReleaseArticle.leadBeforeAudio,
  "past-release metaDescription is not visual lead",
);
assert(
  pastReleaseArticle.metaDescription !==
    releaseResentmentArticle.metaDescription &&
    pastReleaseArticle.metaDescription !==
      forgivePersonArticle.metaDescription &&
    pastReleaseArticle.metaDescription !==
      habitualOffenseArticle.metaDescription,
  "past-release meta description differs from siblings",
);
assert(
  pastReleaseArticle.shortAnswer !== releaseResentmentArticle.shortAnswer &&
    pastReleaseArticle.shortAnswer !== forgivePersonArticle.shortAnswer &&
    pastReleaseArticle.shortAnswer !== habitualOffenseArticle.shortAnswer,
  "past-release short answer differs from siblings",
);
assert(
  pastReleaseArticle.leadBeforeAudio !==
    releaseResentmentArticle.leadBeforeAudio &&
    pastReleaseArticle.leadBeforeAudio !==
      forgivePersonArticle.leadBeforeAudio &&
    pastReleaseArticle.leadBeforeAudio !==
      habitualOffenseArticle.leadBeforeAudio,
  "past-release lead differs from siblings",
);
assert(
  pastReleaseArticle.topicSlug === "besplatnye-meditatsii",
  "past-release uses free meditations hub",
);
assert(
  pastReleaseArticle.topicHref === "/topics/besplatnye-meditatsii",
  "past-release topic href",
);
assert(
  pastReleaseArticle.primaryPractice.practiceKey ===
    "13-shagov-radikalnogo-proscheniya",
  "past-release primary practice key",
);
assert(
  pastReleaseArticle.primaryPracticeIntro.includes(
    "13 шагов Радикального прощения",
  ),
  "past-release practice intro",
);
assert(
  pastReleaseArticle.primaryPracticeIntro.includes(
    "последовательный внутренний процесс",
  ),
  "past-release practice intro stays catalog-aligned",
);
assert(
  !pastReleaseArticle.primaryPracticeIntro.includes("утрат") &&
    !pastReleaseArticle.primaryPracticeIntro.includes("несбывш"),
  "past-release practice intro does not invent grief/unlived-life work",
);
assert(
  pastReleaseArticle.leadBeforeAudio.includes(
    "жизнь словно разделилась на две части",
  ),
  "past-release opening body paragraph",
);
assert(
  pastReleaseArticle.shortAnswer.startsWith(
    "Отпустить прошлое не значит стереть воспоминания",
  ),
  "past-release short answer keeps definition role",
);
assert(
  !pastReleaseArticle.leadBeforeAudio.includes(
    "Отпустить прошлое не значит стереть",
  ),
  "past-release lead is not a second definition",
);
assert(
  pastReleaseArticle.introAfterAudio[0] ===
    "Возникает вопрос: можно ли отпустить прошлое, не забывая прожитый опыт и не обесценивая то, что когда-то было по-настоящему важно?",
  "past-release intro starts after lead",
);
assert(
  pastReleaseArticle.sections.some(
    (section) =>
      section.title === "Как отпустить жизнь, которая не сложилась",
  ),
  "past-release keeps unlived-life H2",
);
assert(
  pastReleaseArticle.sections.some(
    (section) =>
      section.title === "Память и жизнь прошлым – не одно и то же",
  ),
  "past-release keeps memory-vs-living-in-past H2",
);
assert(
  pastReleaseArticle.captionAfterAudio === "",
  "past-release no artificial caption",
);
assert(
  pastReleaseArticle.finalAudioLead === "",
  "past-release no second primary player",
);
assert(pastReleaseArticle.faq.length === 4, "past-release faq count");
assert(
  pastReleaseArticle.faq.some((item) =>
    item.question.includes("не забыть"),
  ),
  "past-release FAQ covers remembering while releasing",
);
assert(
  !pastReleaseArticle.faq.some((item) =>
    item.question.toLowerCase().includes("простить"),
  ),
  "past-release FAQ does not steal forgive-person intent",
);
assert(
  pastReleaseArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-otpustit-obidu",
  ),
  "past-release links to release resentment article",
);
assert(
  pastReleaseArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-prostit-cheloveka",
  ),
  "past-release links to forgive-a-person article",
);
assert(
  pastReleaseArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/pochemu-my-postoyanno-obizhaemsya",
  ),
  "past-release links to habitual-offense article",
);
assert(
  pastReleaseArticle.afterFinalAudio?.some(
    (item) => item.href === "/topics/besplatnye-meditatsii",
  ),
  "past-release links to free meditations hub",
);
assert(
  !pastReleaseArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-otpustit-obidu",
  ) &&
    !pastReleaseArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/kak-prostit-cheloveka",
    ) &&
    !pastReleaseArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/pochemu-my-postoyanno-obizhaemsya",
    ),
  "past-release seeAlso avoids triple-linking siblings",
);
assert(
  Boolean(pastReleaseArticle.brandNote?.includes("АудиоЛаде")),
  "past-release brand note",
);
assert(
  pastReleaseArticle.sections.some((section) =>
    section.paragraphs.some((paragraph) =>
      paragraph.includes("профессиональная поддержка"),
    ),
  ),
  "past-release keeps professional-support safety note",
);
assert(
  pastReleaseArticle.sections.some((section) =>
    section.paragraphs.some((paragraph) =>
      paragraph.includes(
        "Как отпустить обиду и перестать снова возвращаться к болезненной ситуации",
      ),
    ),
  ),
  "past-release body mentions one-offense sibling",
);
assert(
  listArticlesByTopicSlug("besplatnye-meditatsii").some(
    (item) => item.slug === "kak-otpustit-proshloe",
  ),
  "free hub lists past-release article",
);
assert(
  !listArticlesByTopicSlug("meditatsii-na-dengi").some(
    (item) => item.slug === "kak-otpustit-proshloe",
  ),
  "money hub does not list past-release article",
);
assert(
  !pastReleaseArticle.leadBeforeAudio.includes("—") &&
    !pastReleaseArticle.shortAnswer.includes("—") &&
    !pastReleaseArticle.metaTitle.includes("—"),
  "past-release uses medium dash",
);
assert(
  listArticleSlugs().includes("kak-otpustit-proshloe"),
  "past-release in slug list",
);
assert(
  listArticleSlugs().filter((slug) => slug === "kak-otpustit-proshloe")
    .length === 1,
  "past-release slug unique",
);
assert(
  pastReleaseArticle.publishedAt === "2026-07-27T00:00:00.000Z",
  "past-release publishedAt set",
);
assert(
  pastReleaseArticle.closingSection.title === "Главное",
  "past-release closing section",
);

const clarifyDesiresArticle = getArticleBySlug("kak-ponyat-chego-ya-hochu");
assert(clarifyDesiresArticle, "clarify-desires article registered");
assert(
  clarifyDesiresArticle.title ===
    "Как понять, чего вы действительно хотите: вопросы для спокойного размышления",
  "clarify-desires H1",
);
assert(
  clarifyDesiresArticle.metaTitle ===
    "Как понять, чего я хочу: вопросы для спокойного размышления – АудиоЛад",
  "clarify-desires SEO title",
);
assert(
  clarifyDesiresArticle.metaDescription !==
    clarifyDesiresArticle.leadBeforeAudio,
  "clarify-desires metaDescription is not visual lead",
);
assert(
  clarifyDesiresArticle.topicSlug === "besplatnye-meditatsii",
  "clarify-desires uses free meditations hub",
);
assert(
  clarifyDesiresArticle.topicHref === "/topics/besplatnye-meditatsii",
  "clarify-desires topic href",
);
assert(
  clarifyDesiresArticle.primaryPractice.practiceKey === "kod-prityazheniya",
  "clarify-desires primary practice key",
);
assert(
  clarifyDesiresArticle.primaryPracticeIntro.includes("Код Притяжения"),
  "clarify-desires practice intro",
);
assert(
  clarifyDesiresArticle.primaryPracticeIntro.includes(
    "сосредоточиться на одном выбранном направлении",
  ),
  "clarify-desires practice intro stays CTA-aligned",
);
assert(
  !clarifyDesiresArticle.primaryPracticeIntro.includes("определяет желания") &&
    !clarifyDesiresArticle.primaryPracticeIntro.includes("найдёт за вас"),
  "clarify-desires practice intro does not invent desire-finding claims",
);
assert(
  clarifyDesiresArticle.leadBeforeAudio.includes(
    "всё меньше понимает, чего на самом деле хочет",
  ),
  "clarify-desires opening body paragraph",
);
assert(
  clarifyDesiresArticle.shortAnswer.includes(
    "не хватает спокойного пространства",
  ),
  "clarify-desires short answer",
);
assert(
  clarifyDesiresArticle.sections.some(
    (section) => section.id === "zhelaniya-mogut-menyatsya",
  ),
  "clarify-desires has desires-can-change section",
);
assert(
  clarifyDesiresArticle.sections.some((section) =>
    section.paragraphs.some((paragraph) =>
      paragraph.includes("как отпустить прошлое и перестать жить воспоминаниями"),
    ),
  ),
  "clarify-desires body mentions past-release sibling",
);
assert(
  clarifyDesiresArticle.sections.some((section) =>
    section.paragraphs.some((paragraph) =>
      paragraph.includes("визуализации желаний"),
    ),
  ),
  "clarify-desires body mentions wish visualization sibling",
);
assert(
  clarifyDesiresArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-otpustit-proshloe",
  ),
  "clarify-desires links to past-release article",
);
assert(
  clarifyDesiresArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/vizualizatsiya-zhelaniy",
  ),
  "clarify-desires links to wish visualization article",
);
assert(
  clarifyDesiresArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/namerenie-chto-eto",
  ),
  "clarify-desires links to intention article",
);
assert(
  clarifyDesiresArticle.afterFinalAudio?.some(
    (item) => item.href === "/topics/besplatnye-meditatsii",
  ),
  "clarify-desires links to free meditations hub",
);
assert(
  Boolean(clarifyDesiresArticle.brandNote?.includes("АудиоЛаде")),
  "clarify-desires brand note",
);
assert(
  clarifyDesiresArticle.seeAlsoLinks.some(
    (item) => item.href === "/topics/besplatnye-meditatsii",
  ),
  "clarify-desires see-also includes hub",
);
assert(
  clarifyDesiresArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-otpustit-proshloe",
  ),
  "clarify-desires see-also includes past-release",
);
assert(
  clarifyDesiresArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/vizualizatsiya-zhelaniy",
  ),
  "clarify-desires see-also includes wish visualization",
);
assert(
  listArticlesByTopicSlug("besplatnye-meditatsii").some(
    (item) => item.slug === "kak-ponyat-chego-ya-hochu",
  ),
  "free hub lists clarify-desires article",
);
assert(
  !listArticlesByTopicSlug("meditatsii-na-dengi").some(
    (item) => item.slug === "kak-ponyat-chego-ya-hochu",
  ),
  "money hub does not list clarify-desires article",
);
assert(
  !clarifyDesiresArticle.leadBeforeAudio.includes("—") &&
    !clarifyDesiresArticle.shortAnswer.includes("—") &&
    !clarifyDesiresArticle.metaTitle.includes("—"),
  "clarify-desires uses medium dash",
);
assert(
  listArticleSlugs().includes("kak-ponyat-chego-ya-hochu"),
  "clarify-desires in slug list",
);
assert(
  listArticleSlugs().filter((slug) => slug === "kak-ponyat-chego-ya-hochu")
    .length === 1,
  "clarify-desires slug unique",
);
assert(
  clarifyDesiresArticle.publishedAt === "2026-07-27T00:00:00.000Z",
  "clarify-desires publishedAt set",
);
assert(
  clarifyDesiresArticle.closingSection.title === "Главное",
  "clarify-desires closing section",
);
assert(
  clarifyDesiresArticle.faq.length === 4,
  "clarify-desires faq count",
);
assert(
  wishVisualizationArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-ponyat-chego-ya-hochu",
  ),
  "wish visualization reverse-links to clarify-desires article",
);
assert(
  wishVisualizationArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-ponyat-chego-ya-hochu",
  ),
  "wish visualization see-also includes clarify-desires",
);
assert(
  wishVisualizationArticle.updatedAt === "2026-07-27T12:00:00.000Z",
  "wish visualization updatedAt bumped for clarify-desires reverse",
);
assert(
  wishVisualizationArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/namerenie-chto-eto",
  ),
  "wish visualization reverse-links to intention article",
);
assert(
  wishVisualizationArticle.publishedAt === "2026-07-25T00:00:00.000Z",
  "wish visualization publishedAt unchanged",
);
assert(
  wishMeditationArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-ponyat-chego-ya-hochu",
  ),
  "wish meditation reverse-links to clarify-desires article",
);
assert(
  wishMeditationArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-ponyat-chego-ya-hochu",
  ),
  "wish meditation see-also includes clarify-desires",
);
assert(
  wishMeditationArticle.updatedAt === "2026-07-27T12:00:00.000Z",
  "wish meditation updatedAt bumped for clarify-desires reverse",
);
assert(
  wishMeditationArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/pochemu-zhelaniya-ne-ispolnyayutsya",
  ),
  "wish meditation reverse-links to why-wishes-fail article",
);
assert(
  wishMeditationArticle.publishedAt === "2026-07-25T00:00:00.000Z",
  "wish meditation publishedAt unchanged",
);

const moneyFearArticle = getArticleBySlug("strah-deneg");
assert(moneyFearArticle, "money-fear article registered");
assert(
  moneyFearArticle.title ===
    "Страх денег: почему финансовые вопросы вызывают напряжение и как с ним справляться",
  "money-fear H1",
);
assert(
  moneyFearArticle.primaryPractice.practiceKey === "energiya-denezhnogo-puti",
  "money-fear primary practice key",
);
assert(
  moneyFearArticle.topicSlug === "meditatsii-na-dengi",
  "money-fear uses money meditations hub",
);
assert(
  moneyFearArticle.finalAudioLead === "",
  "money-fear has one player only",
);
assert(
  moneyFearArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-perestat-perezhivat-iz-za-deneg",
  ),
  "money-fear links to money-anxiety article",
);
assert(
  listArticleSlugs().filter((slug) => slug === "strah-deneg").length === 1,
  "money-fear slug unique",
);

const senseOfSufficiencyArticle = getArticleBySlug("oshchushchenie-dostatka");
assert(senseOfSufficiencyArticle, "sense-of-sufficiency article registered");
assert(
  senseOfSufficiencyArticle.title ===
    "Как перестать жить в постоянной нехватке и развить ощущение достатка",
  "sense-of-sufficiency H1",
);
assert(
  senseOfSufficiencyArticle.metaTitle ===
    "Ощущение достатка: как перестать жить в постоянной нехватке – АудиоЛад",
  "sense-of-sufficiency SEO title",
);
assert(
  senseOfSufficiencyArticle.primaryPractice.practiceKey ===
    "klyuch-k-izobiliyu",
  "sense-of-sufficiency primary practice key",
);
assert(
  senseOfSufficiencyArticle.topicSlug === "izobilie",
  "sense-of-sufficiency uses abundance hub",
);
assert(
  senseOfSufficiencyArticle.finalAudioLead === "",
  "sense-of-sufficiency has one player only",
);
assert(
  senseOfSufficiencyArticle.sections.some(
    (section) => section.id === "audiopraktika",
  ),
  "sense-of-sufficiency practice section enables afterFinalAudio render",
);
assert(
  senseOfSufficiencyArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/myshlenie-izobiliya",
  ),
  "sense-of-sufficiency links to abundance-mindset article",
);
assert(
  senseOfSufficiencyArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-zamechat-vozmozhnosti",
  ),
  "sense-of-sufficiency links to notice-opportunities article",
);
assert(
  listArticleSlugs().filter((slug) => slug === "oshchushchenie-dostatka")
    .length === 1,
  "sense-of-sufficiency slug unique",
);
assert(
  getArticleBySlug("myshlenie-izobiliya")?.afterFinalAudio?.some(
    (item) => item.href === "/articles/oshchushchenie-dostatka",
  ),
  "abundance-mindset reverse-links to sense-of-sufficiency",
);
assert(
  getArticleBySlug("kak-vyyti-iz-sostoyaniya-nehvatki")?.afterFinalAudio?.some(
    (item) => item.href === "/articles/oshchushchenie-dostatka",
  ),
  "scarcity reverse-links to sense-of-sufficiency",
);

const noticeOpportunitiesArticle = getArticleBySlug(
  "kak-zamechat-vozmozhnosti",
);
assert(noticeOpportunitiesArticle, "notice-opportunities article registered");
assert(
  noticeOpportunitiesArticle.title ===
    "Как замечать возможности и не проходить мимо важных перемен",
  "notice-opportunities H1",
);
assert(
  noticeOpportunitiesArticle.metaTitle ===
    "Как замечать возможности и не упускать важные перемены – АудиоЛад",
  "notice-opportunities SEO title",
);
assert(
  noticeOpportunitiesArticle.primaryPractice.practiceKey ===
    "klyuch-k-izobiliyu",
  "notice-opportunities primary practice key",
);
assert(
  noticeOpportunitiesArticle.topicSlug === "izobilie",
  "notice-opportunities uses abundance hub",
);
assert(
  noticeOpportunitiesArticle.finalAudioLead === "",
  "notice-opportunities has one player only",
);
assert(
  noticeOpportunitiesArticle.sections.some(
    (section) => section.id === "audiopraktika",
  ),
  "notice-opportunities practice section enables afterFinalAudio render",
);
assert(
  noticeOpportunitiesArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/myshlenie-izobiliya",
  ),
  "notice-opportunities links to abundance-mindset article",
);
assert(
  noticeOpportunitiesArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-nayti-novye-istochniki-dohoda",
  ),
  "notice-opportunities links to new-income article",
);
assert(
  listArticleSlugs().filter((slug) => slug === "kak-zamechat-vozmozhnosti")
    .length === 1,
  "notice-opportunities slug unique",
);
assert(
  getArticleBySlug("myshlenie-izobiliya")?.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-zamechat-vozmozhnosti",
  ),
  "abundance-mindset reverse-links to notice-opportunities",
);
assert(
  getArticleBySlug("kak-vyyti-iz-sostoyaniya-nehvatki")?.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-zamechat-vozmozhnosti",
  ),
  "scarcity reverse-links to notice-opportunities",
);
assert(
  getArticleBySlug("myshlenie-izobiliya")?.sections.some(
    (section) => section.id === "audiopraktika",
  ),
  "abundance-mindset practice section enables afterFinalAudio render",
);

const formulateDesireArticle = getArticleBySlug(
  "kak-pravilno-sformulirovat-zhelanie",
);
assert(formulateDesireArticle, "formulate-desire article registered");
assert(
  formulateDesireArticle.title ===
    "Как правильно сформулировать желание и перейти от мечты к ясному намерению",
  "formulate-desire H1",
);
assert(
  formulateDesireArticle.metaTitle ===
    "Как правильно сформулировать желание и перейти к действиям – АудиоЛад",
  "formulate-desire SEO title",
);
assert(
  formulateDesireArticle.primaryPractice.practiceKey === "kod-prityazheniya",
  "formulate-desire primary practice key",
);
assert(
  formulateDesireArticle.topicSlug === "besplatnye-meditatsii",
  "formulate-desire uses free meditations hub",
);
assert(
  formulateDesireArticle.finalAudioLead === "",
  "formulate-desire has one player only",
);
assert(
  formulateDesireArticle.sections.some(
    (section) => section.id === "audiopraktika",
  ),
  "formulate-desire practice section enables afterFinalAudio render",
);
assert(
  formulateDesireArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/namerenie-chto-eto",
  ),
  "formulate-desire links to intention article",
);
assert(
  formulateDesireArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-ponyat-chego-ya-hochu",
  ),
  "formulate-desire links to understand-desire article",
);
assert(
  listArticleSlugs().filter(
    (slug) => slug === "kak-pravilno-sformulirovat-zhelanie",
  ).length === 1,
  "formulate-desire slug unique",
);
assert(
  getArticleBySlug("namerenie-chto-eto")?.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-pravilno-sformulirovat-zhelanie",
  ),
  "intention reverse-links to formulate-desire",
);
assert(
  getArticleBySlug("kak-ponyat-chego-ya-hochu")?.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-pravilno-sformulirovat-zhelanie",
  ),
  "understand-desire reverse-links to formulate-desire",
);
assert(
  getArticleBySlug("namerenie-chto-eto")?.sections.some(
    (section) => section.id === "audiopraktika",
  ),
  "intention practice section enables afterFinalAudio render",
);

const askRaiseArticle = getArticleBySlug("kak-poprosit-povyshenie-zarplaty");
assert(askRaiseArticle, "ask-raise article registered");
assert(
  askRaiseArticle.title ===
    "Как попросить повышение зарплаты и спокойно подготовиться к разговору",
  "ask-raise H1",
);
assert(
  askRaiseArticle.metaTitle ===
    "Как попросить повышение зарплаты и подготовиться к разговору – АудиоЛад",
  "ask-raise SEO title",
);
assert(
  askRaiseArticle.primaryPractice.practiceKey === "energiya-denezhnogo-puti",
  "ask-raise primary practice key",
);
assert(
  askRaiseArticle.topicSlug === "meditatsii-na-dengi",
  "ask-raise uses money meditations hub",
);
assert(askRaiseArticle.finalAudioLead === "", "ask-raise has one player only");
assert(
  askRaiseArticle.sections.some((section) => section.id === "audiopraktika"),
  "ask-raise practice section enables afterFinalAudio render",
);
assert(
  askRaiseArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-povysit-dohod",
  ),
  "ask-raise links to raise-income article",
);
assert(
  askRaiseArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-nazvat-tsenu-za-svoyu-rabotu",
  ),
  "ask-raise links to name-price article",
);
assert(
  listArticleSlugs().filter((slug) => slug === "kak-poprosit-povyshenie-zarplaty")
    .length === 1,
  "ask-raise slug unique",
);
assert(
  getArticleBySlug("kak-povysit-dohod")?.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-poprosit-povyshenie-zarplaty",
  ),
  "raise-income reverse-links to ask-raise",
);
assert(
  getArticleBySlug("kak-nazvat-tsenu-za-svoyu-rabotu")?.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-poprosit-povyshenie-zarplaty",
  ),
  "name-price reverse-links to ask-raise",
);
assert(
  getArticleBySlug("kak-nazvat-tsenu-za-svoyu-rabotu")?.sections.some(
    (section) => section.id === "audiopraktika",
  ),
  "name-price practice section enables afterFinalAudio render",
);

const startSavingArticle = getArticleBySlug("kak-nachat-kopit-dengi");
assert(startSavingArticle, "start-saving article registered");
assert(
  startSavingArticle.title ===
    "Как начать копить деньги: почему это не получается и как превратить накопления в привычку",
  "start-saving H1",
);
assert(
  startSavingArticle.metaTitle ===
    "Как начать копить деньги и превратить накопления в привычку – АудиоЛад",
  "start-saving SEO title",
);
assert(
  startSavingArticle.primaryPractice.practiceKey === "energiya-denezhnogo-puti",
  "start-saving primary practice key",
);
assert(
  startSavingArticle.topicSlug === "meditatsii-na-dengi",
  "start-saving uses money meditations hub",
);
assert(
  startSavingArticle.finalAudioLead === "",
  "start-saving has one player only",
);
assert(
  startSavingArticle.sections.some((section) => section.id === "audiopraktika"),
  "start-saving practice section enables afterFinalAudio render",
);
assert(
  getArticleBySlug("nastroy-na-dengi")?.sections.some(
    (section) => section.id === "audiopraktika",
  ),
  "money-mindset practice section enables afterFinalAudio render",
);
assert(
  startSavingArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-umenshit-impulsivnye-pokupki",
  ),
  "start-saving links to impulse-buying article",
);
assert(
  startSavingArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-nayti-novye-istochniki-dohoda",
  ),
  "start-saving links to new-income article",
);
assert(
  listArticleSlugs().filter((slug) => slug === "kak-nachat-kopit-dengi")
    .length === 1,
  "start-saving slug unique",
);
assert(
  getArticleBySlug("kak-umenshit-impulsivnye-pokupki")?.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-nachat-kopit-dengi",
  ),
  "impulse-buying reverse-links to start-saving",
);
assert(
  getArticleBySlug("nastroy-na-dengi")?.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-nachat-kopit-dengi",
  ),
  "money-mindset reverse-links to start-saving",
);

const moneyMindsetArticle = getArticleBySlug("nastroy-na-dengi");
assert(moneyMindsetArticle, "money-mindset article registered");
assert(
  moneyMindsetArticle.title ===
    "Настрой на деньги: как изменить внутреннее отношение к финансам и действовать спокойнее",
  "money-mindset H1",
);
assert(
  moneyMindsetArticle.metaTitle ===
    "Настрой на деньги: как изменить внутреннее отношение к финансам – АудиоЛад",
  "money-mindset SEO title",
);
assert(
  moneyMindsetArticle.primaryPractice.practiceKey === "energiya-denezhnogo-puti",
  "money-mindset primary practice key",
);
assert(
  moneyMindsetArticle.topicSlug === "meditatsii-na-dengi",
  "money-mindset uses money meditations hub",
);
assert(
  moneyMindsetArticle.finalAudioLead === "",
  "money-mindset has one player only",
);
assert(
  moneyMindsetArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/denezhnoe-myshlenie",
  ),
  "money-mindset links to money-thinking article",
);
assert(
  moneyMindsetArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-nazvat-tsenu-za-svoyu-rabotu",
  ),
  "money-mindset links to name-price article",
);
assert(
  listArticleSlugs().filter((slug) => slug === "nastroy-na-dengi").length === 1,
  "money-mindset slug unique",
);
assert(
  getArticleBySlug(
    "meditatsiya-na-dengi-kak-rabotat-s-vnimaniem-i-denezhnym-nastroem",
  )?.afterFinalAudio?.some((item) => item.href === "/articles/nastroy-na-dengi"),
  "money-meditation reverse-links to money-mindset",
);
assert(
  getArticleBySlug("denezhnoe-myshlenie")?.afterFinalAudio?.some(
    (item) => item.href === "/articles/nastroy-na-dengi",
  ),
  "money-thinking reverse-links to money-mindset",
);

const namePriceArticle = getArticleBySlug("kak-nazvat-tsenu-za-svoyu-rabotu");
assert(namePriceArticle, "name-price article registered");
assert(
  namePriceArticle.title ===
    "Как назвать цену за свою работу и перестать бояться говорить о стоимости",
  "name-price H1",
);
assert(
  namePriceArticle.metaTitle ===
    "Как назвать цену за свою работу и говорить о стоимости спокойно – АудиоЛад",
  "name-price SEO title",
);
assert(
  namePriceArticle.primaryPractice.practiceKey === "energiya-denezhnogo-puti",
  "name-price primary practice key",
);
assert(
  namePriceArticle.topicSlug === "meditatsii-na-dengi",
  "name-price uses money meditations hub",
);
assert(namePriceArticle.finalAudioLead === "", "name-price has one player only");
assert(
  namePriceArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/strah-deneg",
  ),
  "name-price links to money-fear article",
);
assert(
  namePriceArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-prinimat-dengi",
  ),
  "name-price links to accept-money article",
);
assert(
  listArticleSlugs().filter((slug) => slug === "kak-nazvat-tsenu-za-svoyu-rabotu")
    .length === 1,
  "name-price slug unique",
);
assert(
  getArticleBySlug("strah-deneg")?.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-nazvat-tsenu-za-svoyu-rabotu",
  ),
  "money-fear reverse-links to name-price",
);
assert(
  getArticleBySlug("zhenskaya-samotsennost-i-dengi")?.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-nazvat-tsenu-za-svoyu-rabotu",
  ),
  "self-worth reverse-links to name-price",
);

const abundanceMindsetArticle = getArticleBySlug("myshlenie-izobiliya");
assert(abundanceMindsetArticle, "abundance-mindset article registered");
assert(
  abundanceMindsetArticle.title ===
    "Мышление изобилия: что это такое и как оно влияет на нашу жизнь",
  "abundance-mindset H1",
);
assert(
  abundanceMindsetArticle.metaTitle ===
    "Мышление изобилия: что это такое и как его развивать – АудиоЛад",
  "abundance-mindset SEO title",
);
assert(
  abundanceMindsetArticle.primaryPractice.practiceKey === "klyuch-k-izobiliyu",
  "abundance-mindset primary practice key",
);
assert(
  abundanceMindsetArticle.topicSlug === "izobilie",
  "abundance-mindset uses abundance hub",
);
assert(
  abundanceMindsetArticle.finalAudioLead === "",
  "abundance-mindset has one player only",
);
assert(
  abundanceMindsetArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-voyti-v-sostoyanie-izobiliya",
  ),
  "abundance-mindset links to abundance-state article",
);
assert(
  abundanceMindsetArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-vyyti-iz-sostoyaniya-nehvatki",
  ),
  "abundance-mindset links to scarcity-state article",
);
assert(
  listArticleSlugs().filter((slug) => slug === "myshlenie-izobiliya").length ===
    1,
  "abundance-mindset slug unique",
);
assert(
  getArticleBySlug("kak-vyyti-iz-sostoyaniya-nehvatki")?.afterFinalAudio?.some(
    (item) => item.href === "/articles/myshlenie-izobiliya",
  ),
  "scarcity-state reverse-links to abundance-mindset",
);
assert(
  getArticleBySlug("denezhnoe-myshlenie")?.afterFinalAudio?.some(
    (item) => item.href === "/articles/myshlenie-izobiliya",
  ),
  "money-thinking reverse-links to abundance-mindset",
);

const selfForgivenessArticle = getArticleBySlug("kak-prostit-sebya");
assert(selfForgivenessArticle, "self-forgiveness article registered");
assert(
  selfForgivenessArticle.title ===
    "Как простить себя за прошлые ошибки и начать относиться к себе бережнее",
  "self-forgiveness H1",
);
assert(
  selfForgivenessArticle.metaTitle ===
    "Как простить себя за прошлые ошибки – АудиоЛад",
  "self-forgiveness SEO title",
);
assert(
  selfForgivenessArticle.metaDescription !==
    selfForgivenessArticle.leadBeforeAudio,
  "self-forgiveness metaDescription is not visual lead",
);
assert(
  selfForgivenessArticle.topicSlug === "besplatnye-meditatsii",
  "self-forgiveness uses free meditations hub",
);
assert(
  selfForgivenessArticle.primaryPractice.practiceKey ===
    "13-shagov-radikalnogo-proscheniya",
  "self-forgiveness primary practice key",
);
assert(
  selfForgivenessArticle.primaryPracticeIntro.includes(
    "13 шагов Радикального прощения",
  ),
  "self-forgiveness practice intro",
);
assert(
  selfForgivenessArticle.primaryPracticeIntro.includes(
    "перестать обвинять себя",
  ),
  "self-forgiveness practice intro stays CTA-aligned",
);
assert(
  selfForgivenessArticle.shortAnswer.includes(
    "не значит объявить любой свой поступок правильным",
  ),
  "self-forgiveness short answer",
);
assert(
  selfForgivenessArticle.sections.some(
    (section) => section.id === "dopolnitelnaya-podderzhka",
  ),
  "self-forgiveness keeps professional-support section",
);
assert(
  selfForgivenessArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-otpustit-proshloe",
  ),
  "self-forgiveness links to past-release article",
);
assert(
  selfForgivenessArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-prostit-cheloveka",
  ),
  "self-forgiveness links to forgive-a-person article",
);
assert(
  selfForgivenessArticle.afterFinalAudio?.some(
    (item) => item.href === "/topics/besplatnye-meditatsii",
  ),
  "self-forgiveness links to free meditations hub",
);
assert(
  Boolean(selfForgivenessArticle.brandNote?.includes("АудиоЛаде")),
  "self-forgiveness brand note",
);
assert(
  listArticlesByTopicSlug("besplatnye-meditatsii").some(
    (item) => item.slug === "kak-prostit-sebya",
  ),
  "free hub lists self-forgiveness article",
);
assert(
  !selfForgivenessArticle.leadBeforeAudio.includes("—") &&
    !selfForgivenessArticle.shortAnswer.includes("—") &&
    !selfForgivenessArticle.metaTitle.includes("—"),
  "self-forgiveness uses medium dash",
);
assert(
  listArticleSlugs().includes("kak-prostit-sebya"),
  "self-forgiveness in slug list",
);
assert(
  listArticleSlugs().filter((slug) => slug === "kak-prostit-sebya").length ===
    1,
  "self-forgiveness slug unique",
);
assert(
  selfForgivenessArticle.publishedAt === "2026-07-27T00:00:00.000Z",
  "self-forgiveness publishedAt set",
);
assert(
  selfForgivenessArticle.faq.length === 4,
  "self-forgiveness faq count",
);
assert(
  pastReleaseArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-prostit-sebya",
  ),
  "past-release reverse-links to self-forgiveness article",
);
assert(
  pastReleaseArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-prostit-sebya",
  ),
  "past-release see-also includes self-forgiveness",
);
assert(
  pastReleaseArticle.sections.some((section) =>
    section.paragraphs.some((paragraph) =>
      paragraph.includes("Как простить себя"),
    ),
  ),
  "past-release body mentions self-forgiveness sibling",
);
assert(
  pastReleaseArticle.updatedAt === "2026-07-27T14:00:00.000Z",
  "past-release updatedAt bumped for anger reverse",
);
assert(
  pastReleaseArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-perestat-zlitsya-na-cheloveka",
  ),
  "past-release see-also includes anger article",
);

const angerAtPersonArticle = getArticleBySlug(
  "kak-perestat-zlitsya-na-cheloveka",
);
assert(angerAtPersonArticle, "anger-at-person article registered");
assert(
  angerAtPersonArticle.title ===
    "Как перестать постоянно злиться на человека и вернуть себе внутреннее спокойствие",
  "anger-at-person H1",
);
assert(
  angerAtPersonArticle.metaTitle ===
    "Как перестать злиться на человека и вернуть спокойствие – АудиоЛад",
  "anger-at-person SEO title",
);
assert(
  angerAtPersonArticle.topicSlug === "besplatnye-meditatsii",
  "anger-at-person hub",
);
assert(
  angerAtPersonArticle.primaryPractice.practiceKey ===
    "13-shagov-radikalnogo-proscheniya",
  "anger-at-person practice",
);
assert(
  angerAtPersonArticle.primaryPracticeIntro.includes(
    "не требует оправдывать",
  ) === false &&
    angerAtPersonArticle.sections
      .find((section) => section.id === "audiopraktika")
      ?.paragraphs.some((paragraph) =>
        paragraph.includes("не требует оправдывать чужое поведение"),
      ),
  "anger-at-person practice disclaimer present",
);
assert(
  angerAtPersonArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/pochemu-my-postoyanno-obizhaemsya",
  ),
  "anger-at-person links to habitual-offense",
);
assert(
  angerAtPersonArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-prostit-cheloveka",
  ),
  "anger-at-person links to forgive-a-person",
);
assert(
  angerAtPersonArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-otpustit-proshloe",
  ),
  "anger-at-person links to past-release",
);
assert(
  listArticleSlugs().includes("kak-perestat-zlitsya-na-cheloveka"),
  "anger-at-person in slug list",
);
assert(
  !angerAtPersonArticle.metaTitle.includes("—"),
  "anger-at-person uses medium dash",
);
assert(
  angerAtPersonArticle.publishedAt === "2026-07-27T00:00:00.000Z",
  "anger-at-person publishedAt",
);
assert(
  pastReleaseArticle.publishedAt === "2026-07-27T00:00:00.000Z",
  "past-release publishedAt unchanged",
);

const allowYourselfMoneyArticle = getArticleBySlug(
  "kak-zhenshchine-razreshit-sebe-dengi",
);
assert(allowYourselfMoneyArticle, "allow-yourself-money article registered");
assert(
  allowYourselfMoneyArticle.title === "Как женщине разрешить себе деньги",
  "allow-yourself-money H1",
);
assert(
  allowYourselfMoneyArticle.metaTitle ===
    "Как женщине разрешить себе деньги – АудиоЛад",
  "allow-yourself-money SEO title",
);
assert(
  allowYourselfMoneyArticle.topicSlug === "besplatnye-meditatsii",
  "allow-yourself-money hub",
);
assert(
  allowYourselfMoneyArticle.primaryPractice.practiceKey === "zhenskie-dengi",
  "allow-yourself-money practice",
);
assert(
  allowYourselfMoneyArticle.primaryPracticeIntro.includes("Женские деньги"),
  "allow-yourself-money practice intro",
);
assert(
  allowYourselfMoneyArticle.sections
    .find((section) => section.id === "audiopraktika")
    ?.paragraphs.some((paragraph) =>
      paragraph.includes("не гарантирует роста дохода"),
    ),
  "allow-yourself-money practice disclaimer",
);
assert(
  allowYourselfMoneyArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-izmenit-otnoshenie-k-dengam",
  ),
  "allow-yourself-money links to change money attitude",
);
assert(
  listArticleSlugs().includes("kak-zhenshchine-razreshit-sebe-dengi"),
  "allow-yourself-money in slug list",
);
assert(
  !allowYourselfMoneyArticle.metaTitle.includes("—"),
  "allow-yourself-money uses medium dash",
);
assert(
  changeMoneyAttitudeArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-zhenshchine-razreshit-sebe-dengi",
  ),
  "change money attitude reverse-links to allow-yourself-money",
);
assert(
  moneyFlowArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-zhenshchine-razreshit-sebe-dengi",
  ),
  "money flow see-also includes allow-yourself-money",
);
assert(
  moneyArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-zhenshchine-razreshit-sebe-dengi",
  ),
  "money meditation see-also includes allow-yourself-money",
);

const femaleSelfWorthMoneyArticle = getArticleBySlug(
  "zhenskaya-samotsennost-i-dengi",
);
assert(femaleSelfWorthMoneyArticle, "female-self-worth-money article registered");
assert(
  femaleSelfWorthMoneyArticle.title ===
    "Женская самоценность и деньги: как уважение к себе влияет на финансовые решения",
  "female-self-worth-money H1",
);
assert(
  femaleSelfWorthMoneyArticle.metaTitle ===
    "Женская самоценность и деньги: как они связаны – АудиоЛад",
  "female-self-worth-money SEO title",
);
assert(
  femaleSelfWorthMoneyArticle.topicSlug === "besplatnye-meditatsii",
  "female-self-worth-money hub",
);
assert(
  femaleSelfWorthMoneyArticle.primaryPractice.practiceKey === "zhenskie-dengi",
  "female-self-worth-money practice",
);
assert(
  femaleSelfWorthMoneyArticle.primaryPracticeIntro.includes("Женские деньги"),
  "female-self-worth-money practice intro",
);
assert(
  femaleSelfWorthMoneyArticle.sections
    .find((section) => section.id === "audiopraktika")
    ?.paragraphs.some((paragraph) =>
      paragraph.includes("не гарантирует повышения дохода"),
    ),
  "female-self-worth-money practice disclaimer",
);
assert(
  femaleSelfWorthMoneyArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-zhenshchine-razreshit-sebe-dengi",
  ),
  "female-self-worth-money links to allow-yourself-money",
);
assert(
  femaleSelfWorthMoneyArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/chto-takoe-denezhnyy-potok",
  ),
  "female-self-worth-money see-also includes money flow",
);
assert(
  listArticleSlugs().includes("zhenskaya-samotsennost-i-dengi"),
  "female-self-worth-money in slug list",
);
assert(
  !femaleSelfWorthMoneyArticle.metaTitle.includes("—"),
  "female-self-worth-money uses medium dash",
);
assert(
  allowYourselfMoneyArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhenskaya-samotsennost-i-dengi",
  ),
  "allow-yourself-money reverse-links to female-self-worth-money",
);
assert(
  changeMoneyAttitudeArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/zhenskaya-samotsennost-i-dengi",
  ),
  "change money attitude see-also includes female-self-worth-money",
);
assert(
  moneyArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/zhenskaya-samotsennost-i-dengi",
  ),
  "money meditation see-also includes female-self-worth-money",
);

const fearSpendOnSelfArticle = getArticleBySlug("strah-tratit-dengi-na-sebya");
assert(fearSpendOnSelfArticle, "fear-spend-on-self article registered");
assert(
  fearSpendOnSelfArticle.title ===
    "Страх тратить деньги на себя: почему он возникает и как относиться к своим расходам спокойнее",
  "fear-spend-on-self H1",
);
assert(
  fearSpendOnSelfArticle.metaTitle ===
    "Страх тратить деньги на себя: причины и что делать – АудиоЛад",
  "fear-spend-on-self SEO title",
);
assert(
  fearSpendOnSelfArticle.topicSlug === "besplatnye-meditatsii",
  "fear-spend-on-self hub",
);
assert(
  fearSpendOnSelfArticle.primaryPractice.practiceKey === "zhenskie-dengi",
  "fear-spend-on-self practice",
);
assert(
  fearSpendOnSelfArticle.primaryPracticeIntro.includes("Женские деньги"),
  "fear-spend-on-self practice intro",
);
assert(
  fearSpendOnSelfArticle.sections
    .find((section) => section.id === "audiopraktika")
    ?.paragraphs.some((paragraph) =>
      paragraph.includes("не заменяет бюджет, финансовый резерв"),
    ),
  "fear-spend-on-self practice disclaimer",
);
assert(
  fearSpendOnSelfArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhenskaya-samotsennost-i-dengi",
  ),
  "fear-spend-on-self links to female-self-worth-money",
);
assert(
  fearSpendOnSelfArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-zhenshchine-razreshit-sebe-dengi",
  ),
  "fear-spend-on-self links to allow-yourself-money",
);
assert(
  listArticleSlugs().includes("strah-tratit-dengi-na-sebya"),
  "fear-spend-on-self in slug list",
);
assert(
  !fearSpendOnSelfArticle.metaTitle.includes("—"),
  "fear-spend-on-self uses medium dash",
);
assert(
  femaleSelfWorthMoneyArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/strah-tratit-dengi-na-sebya",
  ),
  "female-self-worth-money reverse-links to fear-spend-on-self",
);
assert(
  allowYourselfMoneyArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/strah-tratit-dengi-na-sebya",
  ),
  "allow-yourself-money see-also includes fear-spend-on-self",
);
assert(
  changeMoneyAttitudeArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/strah-tratit-dengi-na-sebya",
  ),
  "change money attitude see-also includes fear-spend-on-self",
);

const stopSavingOnSelfArticle = getArticleBySlug(
  "kak-perestat-ekonomit-na-sebe",
);
assert(stopSavingOnSelfArticle, "stop-saving-on-self article registered");
assert(
  stopSavingOnSelfArticle.title ===
    "Как перестать экономить на себе и начать учитывать собственные потребности",
  "stop-saving-on-self H1",
);
assert(
  stopSavingOnSelfArticle.metaTitle ===
    "Как перестать экономить на себе – спокойный и практичный подход | АудиоЛад",
  "stop-saving-on-self SEO title",
);
assert(
  stopSavingOnSelfArticle.topicSlug === "besplatnye-meditatsii",
  "stop-saving-on-self hub",
);
assert(
  stopSavingOnSelfArticle.primaryPractice.practiceKey === "zhenskie-dengi",
  "stop-saving-on-self practice",
);
assert(
  stopSavingOnSelfArticle.primaryPracticeIntro.includes("Женские деньги"),
  "stop-saving-on-self practice intro",
);
assert(
  stopSavingOnSelfArticle.sections
    .find((section) => section.id === "audiopraktika")
    ?.paragraphs.some((paragraph) =>
      paragraph.includes("не заменяет бюджет, накопления"),
    ),
  "stop-saving-on-self practice disclaimer",
);
assert(
  stopSavingOnSelfArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/strah-tratit-dengi-na-sebya",
  ),
  "stop-saving-on-self links to fear-spend-on-self",
);
assert(
  stopSavingOnSelfArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhenskaya-samotsennost-i-dengi",
  ),
  "stop-saving-on-self links to female-self-worth-money",
);
assert(
  listArticleSlugs().includes("kak-perestat-ekonomit-na-sebe"),
  "stop-saving-on-self in slug list",
);
assert(
  !stopSavingOnSelfArticle.metaTitle.includes("—"),
  "stop-saving-on-self uses medium dash",
);
assert(
  fearSpendOnSelfArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-perestat-ekonomit-na-sebe",
  ),
  "fear-spend-on-self reverse-links to stop-saving-on-self",
);
assert(
  femaleSelfWorthMoneyArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-perestat-ekonomit-na-sebe",
  ),
  "female-self-worth-money see-also includes stop-saving-on-self",
);
assert(
  allowYourselfMoneyArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-perestat-ekonomit-na-sebe",
  ),
  "allow-yourself-money see-also includes stop-saving-on-self",
);
assert(
  changeMoneyAttitudeArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-perestat-ekonomit-na-sebe",
  ),
  "change money attitude see-also includes stop-saving-on-self",
);

const acceptMoneyArticle = getArticleBySlug("kak-prinimat-dengi");
assert(acceptMoneyArticle, "accept-money article registered");
assert(
  acceptMoneyArticle.title ===
    "Как принимать деньги без чувства вины и неловкости",
  "accept-money H1",
);
assert(
  acceptMoneyArticle.metaTitle ===
    "Как принимать деньги без чувства вины – АудиоЛад",
  "accept-money SEO title",
);
assert(
  acceptMoneyArticle.topicSlug === "besplatnye-meditatsii",
  "accept-money hub",
);
assert(
  acceptMoneyArticle.primaryPractice.practiceKey === "zhenskie-dengi",
  "accept-money practice",
);
assert(
  acceptMoneyArticle.primaryPracticeIntro.includes("Женские деньги"),
  "accept-money practice intro",
);
assert(
  acceptMoneyArticle.sections
    .find((section) => section.id === "audiopraktika")
    ?.paragraphs.some((paragraph) =>
      paragraph.includes("не гарантирует увеличения дохода"),
    ),
  "accept-money practice disclaimer",
);
assert(
  acceptMoneyArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-zhenshchine-razreshit-sebe-dengi",
  ),
  "accept-money links to allow-yourself-money",
);
assert(
  acceptMoneyArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhenskaya-samotsennost-i-dengi",
  ),
  "accept-money links to female-self-worth-money",
);
assert(
  listArticleSlugs().includes("kak-prinimat-dengi"),
  "accept-money in slug list",
);
assert(
  !acceptMoneyArticle.metaTitle.includes("—"),
  "accept-money uses medium dash",
);
assert(
  allowYourselfMoneyArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-prinimat-dengi",
  ),
  "allow-yourself-money reverse-links to accept-money",
);
assert(
  femaleSelfWorthMoneyArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-prinimat-dengi",
  ),
  "female-self-worth-money see-also includes accept-money",
);
assert(
  stopSavingOnSelfArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-prinimat-dengi",
  ),
  "stop-saving-on-self see-also includes accept-money",
);
assert(
  fearSpendOnSelfArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-prinimat-dengi",
  ),
  "fear-spend-on-self see-also includes accept-money",
);
assert(
  changeMoneyAttitudeArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-prinimat-dengi",
  ),
  "change money attitude see-also includes accept-money",
);

const moneyBeliefsArticle = getArticleBySlug("denezhnye-ustanovki");
assert(moneyBeliefsArticle, "money-beliefs article registered");
assert(
  moneyBeliefsArticle.title ===
    "Денежные установки: что это такое и как они влияют на отношение к деньгам",
  "money-beliefs H1",
);
assert(
  moneyBeliefsArticle.metaTitle ===
    "Денежные установки: что это такое и как они влияют на деньги | АудиоЛад",
  "money-beliefs SEO title",
);
assert(
  moneyBeliefsArticle.topicSlug === "besplatnye-meditatsii",
  "money-beliefs hub",
);
assert(
  moneyBeliefsArticle.primaryPractice.practiceKey ===
    "energiya-denezhnogo-puti",
  "money-beliefs practice",
);
assert(
  moneyBeliefsArticle.primaryPracticeIntro.includes(
    "Энергия Денежного Пути",
  ),
  "money-beliefs practice intro",
);
assert(
  moneyBeliefsArticle.sections
    .find((section) => section.id === "audiopraktika")
    ?.paragraphs.some((paragraph) =>
      paragraph.includes("не гарантирует увеличения дохода"),
    ),
  "money-beliefs practice disclaimer",
);
assert(
  moneyBeliefsArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/chto-takoe-denezhnyy-potok",
  ),
  "money-beliefs links to money flow",
);
assert(
  moneyBeliefsArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-izmenit-otnoshenie-k-dengam",
  ),
  "money-beliefs links to change money attitude",
);
assert(
  listArticleSlugs().includes("denezhnye-ustanovki"),
  "money-beliefs in slug list",
);
assert(
  !moneyBeliefsArticle.metaTitle.includes("—"),
  "money-beliefs uses medium dash",
);
assert(
  changeMoneyAttitudeArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/denezhnye-ustanovki",
  ),
  "change money attitude reverse-links to money-beliefs",
);
assert(
  moneyFlowArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/denezhnye-ustanovki",
  ),
  "money flow see-also includes money-beliefs",
);
assert(
  acceptMoneyArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/denezhnye-ustanovki",
  ),
  "accept-money see-also includes money-beliefs",
);
assert(
  femaleSelfWorthMoneyArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/denezhnye-ustanovki",
  ),
  "female-self-worth-money see-also includes money-beliefs",
);

const fearBigMoneyArticle = getArticleBySlug(
  "kak-perestat-boyatsya-bolshih-deneg",
);
assert(fearBigMoneyArticle, "fear-big-money article registered");
assert(
  fearBigMoneyArticle.title ===
    "Как перестать бояться больших денег и спокойнее относиться к росту дохода",
  "fear-big-money H1",
);
assert(
  fearBigMoneyArticle.metaTitle ===
    "Как перестать бояться больших денег – причины и спокойный подход | АудиоЛад",
  "fear-big-money SEO title",
);
assert(
  fearBigMoneyArticle.topicSlug === "besplatnye-meditatsii",
  "fear-big-money hub",
);
assert(
  fearBigMoneyArticle.primaryPractice.practiceKey ===
    "energiya-denezhnogo-puti",
  "fear-big-money practice",
);
assert(
  fearBigMoneyArticle.primaryPracticeIntro.includes(
    "Энергия Денежного Пути",
  ),
  "fear-big-money practice intro",
);
assert(
  fearBigMoneyArticle.sections
    .find((section) => section.id === "audiopraktika")
    ?.paragraphs.some((paragraph) =>
      paragraph.includes("не гарантирует высокого дохода"),
    ),
  "fear-big-money practice disclaimer",
);
assert(
  fearBigMoneyArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/denezhnye-ustanovki",
  ),
  "fear-big-money links to money-beliefs",
);
assert(
  fearBigMoneyArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-izmenit-otnoshenie-k-dengam",
  ),
  "fear-big-money links to change money attitude",
);
assert(
  listArticleSlugs().includes("kak-perestat-boyatsya-bolshih-deneg"),
  "fear-big-money in slug list",
);
assert(
  !fearBigMoneyArticle.metaTitle.includes("—"),
  "fear-big-money uses medium dash",
);
assert(
  changeMoneyAttitudeArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-perestat-boyatsya-bolshih-deneg",
  ),
  "change money attitude reverse-links to fear-big-money",
);
assert(
  moneyBeliefsArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-perestat-boyatsya-bolshih-deneg",
  ),
  "money-beliefs see-also includes fear-big-money",
);
assert(
  acceptMoneyArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-perestat-boyatsya-bolshih-deneg",
  ),
  "accept-money see-also includes fear-big-money",
);
assert(
  femaleSelfWorthMoneyArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-perestat-boyatsya-bolshih-deneg",
  ),
  "female-self-worth-money reverse-links to fear-big-money",
);
assert(
  fearSpendOnSelfArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-perestat-boyatsya-bolshih-deneg",
  ),
  "fear-spend-on-self see-also includes fear-big-money",
);
assert(
  moneyFlowArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-perestat-boyatsya-bolshih-deneg",
  ),
  "money flow see-also includes fear-big-money",
);


const moneyThinkingArticle = getArticleBySlug("denezhnoe-myshlenie");
assert(moneyThinkingArticle, "money-thinking article registered");
assert(
  moneyThinkingArticle.title ===
    "Денежное мышление: что это такое и как оно проявляется в жизни",
  "money-thinking H1",
);
assert(
  moneyThinkingArticle.metaTitle ===
    "Денежное мышление: что это такое и как оно влияет на отношение к деньгам | АудиоЛад",
  "money-thinking SEO title",
);
assert(
  moneyThinkingArticle.topicSlug === "besplatnye-meditatsii",
  "money-thinking hub",
);
assert(
  moneyThinkingArticle.primaryPractice.practiceKey ===
    "energiya-denezhnogo-puti",
  "money-thinking practice",
);
assert(
  moneyThinkingArticle.primaryPracticeIntro.includes(
    "Энергия Денежного Пути",
  ),
  "money-thinking practice intro",
);
assert(
  moneyThinkingArticle.sections
    .find((section) => section.id === "audiopraktika")
    ?.paragraphs.some((paragraph) =>
      paragraph.includes("не гарантирует роста дохода"),
    ),
  "money-thinking practice disclaimer",
);
assert(
  moneyThinkingArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/denezhnye-ustanovki",
  ),
  "money-thinking links to money-beliefs",
);
assert(
  moneyThinkingArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-perestat-boyatsya-bolshih-deneg",
  ),
  "money-thinking links to fear-big-money",
);
assert(
  listArticleSlugs().includes("denezhnoe-myshlenie"),
  "money-thinking in slug list",
);
assert(
  !moneyThinkingArticle.metaTitle.includes("—"),
  "money-thinking uses medium dash",
);
assert(
  moneyBeliefsArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/denezhnoe-myshlenie",
  ),
  "money-beliefs see-also includes money-thinking",
);
assert(
  changeMoneyAttitudeArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/denezhnoe-myshlenie",
  ),
  "change money attitude see-also includes money-thinking",
);
assert(
  moneyFlowArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/denezhnoe-myshlenie",
  ) ||
    moneyFlowArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/denezhnoe-myshlenie",
    ),
  "money flow reverse-links to money-thinking",
);
assert(
  fearBigMoneyArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/denezhnoe-myshlenie",
  ),
  "fear-big-money see-also includes money-thinking",
);
assert(
  acceptMoneyArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/denezhnoe-myshlenie",
  ),
  "accept-money see-also includes money-thinking",
);
assert(
  fearSpendOnSelfArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/denezhnoe-myshlenie",
  ),
  "fear-spend-on-self see-also includes money-thinking",
);


const moneyWorryArticle = getArticleBySlug(
  "kak-perestat-perezhivat-iz-za-deneg",
);
assert(moneyWorryArticle, "money-worry article registered");
assert(
  moneyWorryArticle.title ===
    "Как перестать постоянно переживать из-за денег и вернуть ощущение опоры",
  "money-worry H1",
);
assert(
  moneyWorryArticle.metaTitle ===
    "Как перестать переживать из-за денег – спокойный и практичный подход | АудиоЛад",
  "money-worry SEO title",
);
assert(
  moneyWorryArticle.topicSlug === "besplatnye-meditatsii",
  "money-worry hub",
);
assert(
  moneyWorryArticle.primaryPractice.practiceKey ===
    "energiya-denezhnogo-puti",
  "money-worry practice",
);
assert(
  moneyWorryArticle.primaryPracticeIntro.includes(
    "Энергия Денежного Пути",
  ),
  "money-worry practice intro",
);
assert(
  moneyWorryArticle.sections
    .find((section) => section.id === "audiopraktika")
    ?.paragraphs.some((paragraph) =>
      paragraph.includes("не гарантирует финансового благополучия"),
    ),
  "money-worry practice disclaimer",
);
assert(
  moneyWorryArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/denezhnoe-myshlenie",
  ),
  "money-worry links to money-thinking",
);
assert(
  moneyWorryArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/denezhnye-ustanovki",
  ),
  "money-worry links to money-beliefs",
);
assert(
  listArticleSlugs().includes("kak-perestat-perezhivat-iz-za-deneg"),
  "money-worry in slug list",
);
assert(
  !moneyWorryArticle.metaTitle.includes("—"),
  "money-worry uses medium dash",
);
assert(
  moneyThinkingArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-perestat-perezhivat-iz-za-deneg",
  ),
  "money-thinking see-also includes money-worry",
);
assert(
  moneyBeliefsArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-perestat-perezhivat-iz-za-deneg",
  ),
  "money-beliefs see-also includes money-worry",
);
assert(
  fearSpendOnSelfArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-perestat-perezhivat-iz-za-deneg",
  ) ||
    fearSpendOnSelfArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/kak-perestat-perezhivat-iz-za-deneg",
    ),
  "fear-spend reverse-links to money-worry",
);

const impulseBuyingArticle = getArticleBySlug(
  "kak-umenshit-impulsivnye-pokupki",
);
assert(impulseBuyingArticle, "impulse-buying article registered");
assert(
  impulseBuyingArticle.title ===
    "Как уменьшить импульсивные покупки и выбирать более осознанно",
  "impulse-buying H1",
);
assert(
  impulseBuyingArticle.metaTitle ===
    "Как уменьшить импульсивные покупки и покупать осознаннее | АудиоЛад",
  "impulse-buying SEO title",
);
assert(
  impulseBuyingArticle.topicSlug === "besplatnye-meditatsii",
  "impulse-buying hub",
);
assert(
  impulseBuyingArticle.primaryPractice.practiceKey ===
    "energiya-denezhnogo-puti",
  "impulse-buying practice",
);
assert(
  impulseBuyingArticle.primaryPracticeIntro.includes(
    "Энергия Денежного Пути",
  ),
  "impulse-buying practice intro",
);
assert(
  impulseBuyingArticle.sections
    .find((section) => section.id === "audiopraktika")
    ?.paragraphs.some((paragraph) =>
      paragraph.includes("не гарантирует улучшения материального положения"),
    ),
  "impulse-buying practice disclaimer",
);
assert(
  impulseBuyingArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/denezhnoe-myshlenie",
  ),
  "impulse-buying links to money-thinking",
);
assert(
  impulseBuyingArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/denezhnye-ustanovki",
  ),
  "impulse-buying links to money-beliefs",
);
assert(
  impulseBuyingArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-perestat-perezhivat-iz-za-deneg",
  ),
  "impulse-buying links to money-worry",
);
assert(
  listArticleSlugs().includes("kak-umenshit-impulsivnye-pokupki"),
  "impulse-buying in slug list",
);
assert(
  !impulseBuyingArticle.metaTitle.includes("—"),
  "impulse-buying uses medium dash",
);
assert(
  moneyThinkingArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-umenshit-impulsivnye-pokupki",
  ),
  "money-thinking see-also includes impulse-buying",
);
assert(
  moneyBeliefsArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-umenshit-impulsivnye-pokupki",
  ),
  "money-beliefs see-also includes impulse-buying",
);
assert(
  moneyWorryArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-umenshit-impulsivnye-pokupki",
  ),
  "money-worry reverse-links to impulse-buying",
);
assert(
  fearSpendOnSelfArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-umenshit-impulsivnye-pokupki",
  ) ||
    fearSpendOnSelfArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/kak-umenshit-impulsivnye-pokupki",
    ),
  "fear-spend reverse-links to impulse-buying",
);
assert(
  moneyFlowArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-umenshit-impulsivnye-pokupki",
  ),
  "money flow see-also includes impulse-buying",
);

const raiseIncomeArticle = getArticleBySlug("kak-povysit-dohod");
assert(raiseIncomeArticle, "raise-income article registered");
assert(
  raiseIncomeArticle.title ===
    "Как повысить доход: реалистичные способы и практические шаги",
  "raise-income H1",
);
assert(
  raiseIncomeArticle.metaTitle ===
    "Как повысить доход: реалистичные способы увеличить заработок | АудиоЛад",
  "raise-income SEO title",
);
assert(
  raiseIncomeArticle.topicSlug === "besplatnye-meditatsii",
  "raise-income hub",
);
assert(
  raiseIncomeArticle.primaryPractice.practiceKey === "prityanut-dengi-legko",
  "raise-income practice",
);
assert(
  raiseIncomeArticle.primaryPracticeIntro.includes("Притянуть деньги легко"),
  "raise-income practice intro",
);
assert(
  raiseIncomeArticle.sections
    .find((section) => section.id === "audiopraktika")
    ?.paragraphs.some((paragraph) =>
      paragraph.includes("не гарантирует увеличение дохода"),
    ),
  "raise-income practice disclaimer",
);
assert(
  raiseIncomeArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/denezhnoe-myshlenie",
  ),
  "raise-income links to money-thinking",
);
assert(
  raiseIncomeArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-perestat-boyatsya-bolshih-deneg",
  ),
  "raise-income links to fear-big-money",
);
assert(
  listArticleSlugs().includes("kak-povysit-dohod"),
  "raise-income in slug list",
);
assert(
  !raiseIncomeArticle.metaTitle.includes("—"),
  "raise-income uses medium dash",
);
assert(
  moneyThinkingArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-povysit-dohod",
  ) ||
    moneyThinkingArticle.afterFinalAudio?.some(
      (item) => item.href === "/articles/kak-povysit-dohod",
    ),
  "money-thinking reverse-links to raise-income",
);
assert(
  fearBigMoneyArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-povysit-dohod",
  ) ||
    fearBigMoneyArticle.afterFinalAudio?.some(
      (item) => item.href === "/articles/kak-povysit-dohod",
    ),
  "fear-big-money reverse-links to raise-income",
);
assert(
  moneyBeliefsArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-povysit-dohod",
  ),
  "money-beliefs see-also includes raise-income",
);

const newIncomeSourcesArticle = getArticleBySlug(
  "kak-nayti-novye-istochniki-dohoda",
);
assert(newIncomeSourcesArticle, "new-income-sources article registered");
assert(
  newIncomeSourcesArticle.title ===
    "Как найти новые источники дохода: реалистичные направления и первые шаги",
  "new-income-sources H1",
);
assert(
  newIncomeSourcesArticle.metaTitle ===
    "Как найти новые источники дохода – идеи и первые шаги | АудиоЛад",
  "new-income-sources SEO title",
);
assert(
  newIncomeSourcesArticle.topicSlug === "besplatnye-meditatsii",
  "new-income-sources hub",
);
assert(
  newIncomeSourcesArticle.primaryPractice.practiceKey ===
    "energiya-denezhnogo-puti",
  "new-income-sources practice",
);
assert(
  newIncomeSourcesArticle.primaryPracticeIntro.includes(
    "Энергия Денежного Пути",
  ),
  "new-income-sources practice intro",
);
assert(
  newIncomeSourcesArticle.sections
    .find((section) => section.id === "audiopraktika")
    ?.paragraphs.some((paragraph) =>
      paragraph.includes("не гарантирует появление нового источника дохода"),
    ),
  "new-income-sources practice disclaimer",
);
assert(
  newIncomeSourcesArticle.afterFinalAudio?.[0]?.href ===
    "/articles/kak-povysit-dohod",
  "new-income-sources priority link to raise-income",
);
assert(
  newIncomeSourcesArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/denezhnoe-myshlenie",
  ),
  "new-income-sources links to money-thinking",
);
assert(
  listArticleSlugs().includes("kak-nayti-novye-istochniki-dohoda"),
  "new-income-sources in slug list",
);
assert(
  !newIncomeSourcesArticle.metaTitle.includes("—"),
  "new-income-sources uses medium dash",
);
assert(
  raiseIncomeArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-nayti-novye-istochniki-dohoda",
  ) ||
    raiseIncomeArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/kak-nayti-novye-istochniki-dohoda",
    ),
  "raise-income reverse-links to new-income-sources",
);
assert(
  moneyThinkingArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-nayti-novye-istochniki-dohoda",
  ) ||
    moneyThinkingArticle.afterFinalAudio?.some(
      (item) => item.href === "/articles/kak-nayti-novye-istochniki-dohoda",
    ),
  "money-thinking reverse-links to new-income-sources",
);

const scarcityStateArticle = getArticleBySlug(
  "kak-vyyti-iz-sostoyaniya-nehvatki",
);
assert(scarcityStateArticle, "scarcity-state article registered");
assert(
  scarcityStateArticle.title ===
    "Как выйти из состояния нехватки и вернуть ощущение опоры",
  "scarcity-state H1",
);
assert(
  scarcityStateArticle.metaTitle ===
    "Как выйти из состояния нехватки и вернуть ощущение опоры | АудиоЛад",
  "scarcity-state SEO title",
);
assert(
  scarcityStateArticle.topicSlug === "besplatnye-meditatsii",
  "scarcity-state hub",
);
assert(
  scarcityStateArticle.primaryPractice.practiceKey === "klyuch-k-izobiliyu",
  "scarcity-state practice",
);
assert(
  scarcityStateArticle.primaryPracticeIntro.includes("Ключ к Изобилию"),
  "scarcity-state practice intro",
);
assert(
  scarcityStateArticle.sections
    .find((section) => section.id === "audiopraktika")
    ?.paragraphs.some((paragraph) =>
      paragraph.includes("не гарантирует увеличение дохода"),
    ),
  "scarcity-state practice disclaimer",
);
assert(
  scarcityStateArticle.afterFinalAudio?.[0]?.href ===
    "/articles/kak-voyti-v-sostoyanie-izobiliya",
  "scarcity-state priority link to abundance-state",
);
assert(
  scarcityStateArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-perestat-perezhivat-iz-za-deneg",
  ),
  "scarcity-state links to money-worry",
);
assert(
  scarcityStateArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/denezhnoe-myshlenie",
  ),
  "scarcity-state links to money-thinking",
);
assert(
  scarcityStateArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/strah-tratit-dengi-na-sebya",
  ),
  "scarcity-state links to fear-spend",
);
assert(
  listArticleSlugs().includes("kak-vyyti-iz-sostoyaniya-nehvatki"),
  "scarcity-state in slug list",
);
assert(
  !scarcityStateArticle.metaTitle.includes("—"),
  "scarcity-state uses medium dash",
);
assert(
  abundanceArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-vyyti-iz-sostoyaniya-nehvatki",
  ) ||
    abundanceArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/kak-vyyti-iz-sostoyaniya-nehvatki",
    ),
  "abundance reverse-links to scarcity-state",
);
assert(
  moneyWorryArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-vyyti-iz-sostoyaniya-nehvatki",
  ) ||
    moneyWorryArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/kak-vyyti-iz-sostoyaniya-nehvatki",
    ),
  "money-worry reverse-links to scarcity-state",
);
assert(
  moneyThinkingArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/kak-vyyti-iz-sostoyaniya-nehvatki",
  ) ||
    moneyThinkingArticle.afterFinalAudio?.some(
      (item) => item.href === "/articles/kak-vyyti-iz-sostoyaniya-nehvatki",
    ),
  "money-thinking reverse-links to scarcity-state",
);
assert(
  fearSpendOnSelfArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-vyyti-iz-sostoyaniya-nehvatki",
  ) ||
    fearSpendOnSelfArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/kak-vyyti-iz-sostoyaniya-nehvatki",
    ),
  "fear-spend reverse-links to scarcity-state",
);

const gratitudeAbundanceArticle = getArticleBySlug("blagodarnost-i-izobilie");
assert(gratitudeAbundanceArticle, "gratitude-abundance article registered");
assert(
  gratitudeAbundanceArticle.title ===
    "Благодарность и изобилие: как замечать опоры, не отрицая трудности",
  "gratitude-abundance H1",
);
assert(
  gratitudeAbundanceArticle.metaTitle ===
    "Благодарность и изобилие – как замечать опоры без самообмана | АудиоЛад",
  "gratitude-abundance SEO title",
);
assert(
  gratitudeAbundanceArticle.topicSlug === "besplatnye-meditatsii",
  "gratitude-abundance hub",
);
assert(
  gratitudeAbundanceArticle.primaryPractice.practiceKey === "klyuch-k-izobiliyu",
  "gratitude-abundance practice",
);
assert(
  gratitudeAbundanceArticle.primaryPracticeIntro.includes("Ключ к Изобилию"),
  "gratitude-abundance practice intro",
);
assert(
  gratitudeAbundanceArticle.sections
    .find((section) => section.id === "audiopraktika")
    ?.paragraphs.some((paragraph) =>
      paragraph.includes("не гарантирует деньги"),
    ),
  "gratitude-abundance practice disclaimer",
);
assert(
  gratitudeAbundanceArticle.afterFinalAudio?.[0]?.href ===
    "/articles/kak-voyti-v-sostoyanie-izobiliya",
  "gratitude-abundance priority link to abundance-state",
);
assert(
  gratitudeAbundanceArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-vyyti-iz-sostoyaniya-nehvatki",
  ),
  "gratitude-abundance links to scarcity-state",
);
assert(
  gratitudeAbundanceArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-perestat-perezhivat-iz-za-deneg",
  ),
  "gratitude-abundance links to money-worry",
);
assert(
  listArticleSlugs().includes("blagodarnost-i-izobilie"),
  "gratitude-abundance in slug list",
);
assert(
  !gratitudeAbundanceArticle.metaTitle.includes("—"),
  "gratitude-abundance uses medium dash",
);
assert(
  abundanceArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/blagodarnost-i-izobilie",
  ) ||
    abundanceArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/blagodarnost-i-izobilie",
    ),
  "abundance reverse-links to gratitude-abundance",
);
assert(
  scarcityStateArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/blagodarnost-i-izobilie",
  ) ||
    scarcityStateArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/blagodarnost-i-izobilie",
    ),
  "scarcity-state reverse-links to gratitude-abundance",
);
assert(
  moneyThinkingArticle.seeAlsoLinks.some(
    (item) => item.href === "/articles/blagodarnost-i-izobilie",
  ) ||
    moneyThinkingArticle.afterFinalAudio?.some(
      (item) => item.href === "/articles/blagodarnost-i-izobilie",
    ),
  "money-thinking reverse-links to gratitude-abundance",
);

assert(
  abundanceArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/chto-takoe-denezhnyy-potok",
  ),
  "abundance reverse-links to money flow article",
);
assert(
  abundanceArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/meditatsiya-na-izobilie",
  ),
  "abundance reverse-links to abundance meditation article",
);
assert(
  moneyArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/meditatsiya-na-izobilie",
  ),
  "money article reverse-links to abundance meditation article",
);
assert(
  moneyArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/meditatsiya-na-privlechenie-deneg",
  ),
  "money article reverse-links to money attraction article",
);
assert(
  moneyFlowArticle.afterFinalAudio?.some((item) =>
    item.segments?.some(
      (segment) =>
        "href" in segment &&
        segment.href === "/articles/meditatsiya-na-privlechenie-deneg",
    ),
  ),
  "money flow reverse-links to money attraction article",
);
assert(
  moneyAttractionArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-privlech-dengi-v-svoyu-zhizn",
  ),
  "attraction meditation reverse-links to how-to attract money article",
);
assert(
  howToAttractMoneyArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/affirmatsii-na-dengi",
  ),
  "how-to attract money reverse-links to money affirmations article",
);
assert(
  moneyAffirmationsArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-izmenit-otnoshenie-k-dengam",
  ),
  "money affirmations reverse-links to change money attitude article",
);
assert(
  abundanceMeditationArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/meditatsiya-na-ispolnenie-zhelaniy",
  ),
  "abundance meditation reverse-links to wish meditation article",
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
  article.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-otpustit-obidu",
  ),
  "love article reverse-links to release resentment article",
);
assert(
  article.sections.some((section) =>
    section.paragraphs.some((paragraph) =>
      paragraph.includes("более ясный разговор об обиде"),
    ),
  ),
  "love article mentions resentment as adjacent theme",
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
    !item.leadBeforeAudio.startsWith("# "),
    `${slug} does not duplicate Markdown H1 in article body`,
  );
  assert(
    !item.introAfterAudio.includes(item.leadBeforeAudio),
    `${slug} opening paragraph not duplicated in introAfterAudio`,
  );
  assert(
    item.metaDescription.trim().length > 0 &&
      item.metaDescription !== item.leadBeforeAudio,
    `${slug} keeps separate SEO metaDescription`,
  );
  switch (item.productContinuation.kind) {
    case "creator_paths":
      assert(
        ["balanced", "studio", "school"].includes(item.productContinuation.emphasis),
        `${slug} has a supported creator paths emphasis`,
      );
      assert(
        item.shortAnswer === undefined || item.shortAnswer.trim().length > 0,
        `${slug} omits or keeps a non-empty short answer`,
      );
      for (const field of [
        "captionAfterAudio",
        "primaryPracticeEyebrow",
        "primaryPracticeIntro",
        "primaryPractice",
        "relatedPractices",
        "finalAudioLead",
        "afterFinalAudio",
        "brandNote",
      ]) {
        assert(
          !(field in item),
          `${slug} creator article excludes practice field ${field}`,
        );
      }
      break;

    case "practice":
      assert(
        item.shortAnswer.trim().length > 0,
        `${slug} keeps a non-empty short answer`,
      );
      assert(item.primaryPractice.practiceKey, `${slug} has primary practice key`);
      assert(
        Array.isArray(item.relatedPractices),
        `${slug} has related practice configuration`,
      );
      break;

    default:
      throw new Error(`${slug} has unsupported article continuation`);
  }
}

const creatorPathsArticle = getArticleBySlug("kak-sozdat-svoyu-meditatsiyu");
assert(creatorPathsArticle, "creator paths article registered");
assert(
  creatorPathsArticle.productContinuation.kind === "creator_paths",
  "creator paths article uses creator continuation",
);
assert(
  creatorPathsArticle.productContinuation.emphasis === "balanced",
  "creator paths article uses balanced emphasis",
);
assert(
  !("primaryPractice" in creatorPathsArticle),
  "creator paths article does not require a catalog practice",
);
assert(
  creatorPathsArticle.title ===
    "Как создать свою медитацию: от идеи до готовой аудиозаписи",
  "creator paths article keeps the approved H1",
);
assert(
  creatorPathsArticle.metaTitle ===
    "Как сделать медитацию самому: пошаговое руководство",
  "creator paths article keeps the approved meta title",
);
assert(
  creatorPathsArticle.metaDescription ===
    "Как сделать медитацию самому: запишите голос, добавьте музыку и соберите готовую аудиопрактику в браузере. Пошаговое руководство для начинающих.",
  "creator paths article keeps the approved meta description",
);
assert(
  creatorPathsArticle.shortAnswer === undefined,
  "creator paths article does not add unapproved summary copy",
);
assert(
  creatorPathsArticle.seeAlsoLinks.length === 0,
  "creator paths article does not add unapproved product links",
);
assert(
  creatorPathsArticle.faq.length === 8,
  "creator paths article keeps the approved FAQ set",
);

const recordingCreatorArticle = getArticleBySlug(
  "kak-zapisat-meditatsiyu-samostoyatelno",
);
assert(recordingCreatorArticle, "recording creator article registered");
assert(
  recordingCreatorArticle.productContinuation.kind === "creator_paths",
  "recording creator article uses creator continuation",
);
assert(
  recordingCreatorArticle.productContinuation.emphasis === "balanced",
  "recording creator article uses balanced emphasis",
);
assert(
  !("primaryPractice" in recordingCreatorArticle),
  "recording creator article does not require a catalog practice",
);
assert(
  recordingCreatorArticle.title ===
    "Как записать медитацию самостоятельно: пошаговая инструкция",
  "recording creator article keeps the approved H1",
);
assert(
  recordingCreatorArticle.metaTitle ===
    "Как записать медитацию самостоятельно: пошаговая инструкция",
  "recording creator article keeps the approved meta title",
);
assert(
  recordingCreatorArticle.metaDescription ===
    "Как записать медитацию самостоятельно дома: подготовить помещение, телефон или микрофон, голос, сделать тестовую запись и обработать результат.",
  "recording creator article keeps the approved meta description",
);
assert(
  recordingCreatorArticle.shortAnswer === undefined,
  "recording creator article does not add unapproved summary copy",
);
assert(
  recordingCreatorArticle.seeAlsoLinks.length === 0,
  "recording creator article does not add unapproved product links",
);
assert(
  recordingCreatorArticle.faq.length === 8,
  "recording creator article keeps the approved FAQ set",
);
assert(
  JSON.stringify(recordingCreatorArticle).includes(
    "https://audiolad.ru/articles/kak-sozdat-svoyu-meditatsiyu",
  ),
  "recording creator article keeps the parent creator article link",
);
const recordingCreatorPageData = {
  article: recordingCreatorArticle,
  path: "/articles/kak-zapisat-meditatsiyu-samostoyatelno",
  canonicalUrl:
    "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-samostoyatelno",
  readingTimeMinutes: estimateArticleReadingTimeMinutes(recordingCreatorArticle),
};
const recordingCreatorMetadata = buildArticleMetadata(recordingCreatorPageData);
assert(
  !recordingCreatorMetadata.openGraph?.images,
  "recording creator metadata omits practice OG image",
);
assert(
  !JSON.stringify(buildArticleJsonLdGraph(recordingCreatorPageData)).includes(
    '"image"',
  ),
  "recording creator json-ld omits practice image",
);

const musicCreatorArticle = getArticleBySlug(
  "kak-zapisat-meditatsiyu-s-muzykoy-samostoyatelno",
);
assert(musicCreatorArticle, "music creator article registered");
assert(
  musicCreatorArticle.productContinuation.kind === "creator_paths",
  "music creator article uses creator continuation",
);
assert(
  musicCreatorArticle.productContinuation.emphasis === "balanced",
  "music creator article uses balanced emphasis",
);
assert(
  !("primaryPractice" in musicCreatorArticle),
  "music creator article does not require a catalog practice",
);
assert(
  musicCreatorArticle.title ===
    "Как записать медитацию с музыкой самостоятельно: пошаговое руководство",
  "music creator article keeps the approved H1",
);
assert(
  musicCreatorArticle.metaTitle ===
    "Как записать медитацию с музыкой самостоятельно",
  "music creator article keeps the approved meta title",
);
assert(
  musicCreatorArticle.metaDescription ===
    "Как записать медитацию с музыкой самостоятельно: выбрать подходящий фон, соединить голос и музыку, настроить громкость и плавные переходы.",
  "music creator article keeps the approved meta description",
);
assert(
  musicCreatorArticle.shortAnswer === undefined,
  "music creator article does not add unapproved summary copy",
);
assert(
  musicCreatorArticle.seeAlsoLinks.length === 0,
  "music creator article does not add unapproved product links",
);
assert(
  musicCreatorArticle.faq.length === 8,
  "music creator article keeps the approved FAQ set",
);
assert(
  JSON.stringify(musicCreatorArticle).includes(
    "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-samostoyatelno",
  ) &&
    JSON.stringify(musicCreatorArticle).includes(
      "https://audiolad.ru/articles/kak-sozdat-svoyu-meditatsiyu",
    ),
  "music creator article keeps both previous creator article links",
);
const musicCreatorPageData = {
  article: musicCreatorArticle,
  path: "/articles/kak-zapisat-meditatsiyu-s-muzykoy-samostoyatelno",
  canonicalUrl:
    "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-s-muzykoy-samostoyatelno",
  readingTimeMinutes: estimateArticleReadingTimeMinutes(musicCreatorArticle),
};
const musicCreatorMetadata = buildArticleMetadata(musicCreatorPageData);
assert(
  !musicCreatorMetadata.openGraph?.images,
  "music creator metadata omits practice OG image",
);
assert(
  !JSON.stringify(buildArticleJsonLdGraph(musicCreatorPageData)).includes(
    '"image"',
  ),
  "music creator json-ld omits practice image",
);

const scriptCreatorArticle = getArticleBySlug("kak-napisat-tekst-meditatsii");
assert(scriptCreatorArticle, "script creator article registered");
assert(
  scriptCreatorArticle.productContinuation.kind === "creator_paths",
  "script creator article uses creator continuation",
);
assert(
  scriptCreatorArticle.productContinuation.emphasis === "balanced",
  "script creator article uses balanced emphasis",
);
assert(
  !("primaryPractice" in scriptCreatorArticle),
  "script creator article does not require a catalog practice",
);
assert(
  scriptCreatorArticle.title ===
    "Как написать текст медитации: структура, сценарий и примеры",
  "script creator article keeps the approved H1",
);
assert(
  scriptCreatorArticle.metaTitle ===
    "Как написать текст медитации: структура и примеры",
  "script creator article keeps the approved meta title",
);
assert(
  scriptCreatorArticle.metaDescription ===
    "Как написать текст медитации: определить задачу, выстроить структуру и сценарий, подобрать фразы, расставить паузы и проверить текст голосом.",
  "script creator article keeps the approved meta description",
);
assert(
  scriptCreatorArticle.shortAnswer === undefined,
  "script creator article does not add unapproved summary copy",
);
assert(
  scriptCreatorArticle.seeAlsoLinks.length === 0,
  "script creator article does not add unapproved product links",
);
assert(
  scriptCreatorArticle.faq.length === 8,
  "script creator article keeps the approved FAQ set",
);
assert(
  JSON.stringify(scriptCreatorArticle).includes(
    "https://audiolad.ru/articles/kak-sozdat-svoyu-meditatsiyu",
  ) &&
    JSON.stringify(scriptCreatorArticle).includes(
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-samostoyatelno",
    ),
  "script creator article keeps both approved creator article links",
);
const scriptCreatorPageData = {
  article: scriptCreatorArticle,
  path: "/articles/kak-napisat-tekst-meditatsii",
  canonicalUrl: "https://audiolad.ru/articles/kak-napisat-tekst-meditatsii",
  readingTimeMinutes: estimateArticleReadingTimeMinutes(scriptCreatorArticle),
};
const scriptCreatorMetadata = buildArticleMetadata(scriptCreatorPageData);
assert(
  scriptCreatorMetadata.robots?.index === true &&
    scriptCreatorMetadata.robots?.follow === true,
  "script creator metadata stays indexable",
);
assert(
  !scriptCreatorMetadata.openGraph?.images,
  "script creator metadata omits practice OG image",
);
assert(
  !JSON.stringify(buildArticleJsonLdGraph(scriptCreatorPageData)).includes(
    '"image"',
  ),
  "script creator json-ld omits practice image",
);

const toolCreatorArticle = getArticleBySlug("prilozhenie-dlya-zapisi-meditatsiy");
assert(toolCreatorArticle, "tool creator article registered");
assert(
  toolCreatorArticle.productContinuation.kind === "creator_paths",
  "tool creator article uses creator continuation",
);
assert(
  toolCreatorArticle.productContinuation.emphasis === "balanced",
  "tool creator article uses balanced emphasis",
);
assert(
  !("primaryPractice" in toolCreatorArticle),
  "tool creator article does not require a catalog practice",
);
assert(
  toolCreatorArticle.title ===
    "Приложение для записи медитаций: как записать практику онлайн",
  "tool creator article keeps the approved H1",
);
assert(
  toolCreatorArticle.metaTitle === "Приложение для записи медитаций онлайн",
  "tool creator article keeps the approved meta title",
);
assert(
  toolCreatorArticle.metaDescription ===
    "Приложение для записи медитаций: запишите или загрузите голос, добавьте музыку, настройте дорожки и создайте готовую аудиопрактику онлайн.",
  "tool creator article keeps the approved meta description",
);
assert(
  toolCreatorArticle.shortAnswer === undefined,
  "tool creator article does not add unapproved summary copy",
);
assert(
  toolCreatorArticle.seeAlsoLinks.length === 0,
  "tool creator article does not add unapproved product links",
);
assert(
  toolCreatorArticle.faq.length === 8,
  "tool creator article keeps the approved FAQ set",
);
const toolCreatorSerialized = JSON.stringify(toolCreatorArticle);
assert(
  toolCreatorSerialized.includes(
    "https://audiolad.ru/articles/kak-sozdat-svoyu-meditatsiyu",
  ) &&
    toolCreatorSerialized.includes(
      "https://audiolad.ru/articles/kak-napisat-tekst-meditatsii",
    ) &&
    toolCreatorSerialized.includes(
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-samostoyatelno",
    ) &&
    toolCreatorSerialized.includes(
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-s-muzykoy-samostoyatelno",
    ),
  "tool creator article keeps all approved creator article links",
);
const toolCreatorPageData = {
  article: toolCreatorArticle,
  path: "/articles/prilozhenie-dlya-zapisi-meditatsiy",
  canonicalUrl: "https://audiolad.ru/articles/prilozhenie-dlya-zapisi-meditatsiy",
  readingTimeMinutes: estimateArticleReadingTimeMinutes(toolCreatorArticle),
};
const toolCreatorMetadata = buildArticleMetadata(toolCreatorPageData);
assert(
  toolCreatorMetadata.robots?.index === true &&
    toolCreatorMetadata.robots?.follow === true,
  "tool creator metadata stays indexable",
);
assert(
  !toolCreatorMetadata.openGraph?.images,
  "tool creator metadata omits practice OG image",
);
assert(
  !JSON.stringify(buildArticleJsonLdGraph(toolCreatorPageData)).includes(
    '"image"',
  ),
  "tool creator json-ld omits practice image",
);

const trainingCreatorArticle = getArticleBySlug(
  "obuchenie-sozdaniyu-meditatsiy",
);
assert(trainingCreatorArticle, "training creator article registered");
assert(
  trainingCreatorArticle.productContinuation.kind === "creator_paths",
  "training creator article uses creator continuation",
);
assert(
  trainingCreatorArticle.productContinuation.emphasis === "balanced",
  "training creator article uses balanced emphasis",
);
assert(
  !("primaryPractice" in trainingCreatorArticle),
  "training creator article does not require a catalog practice",
);
assert(
  trainingCreatorArticle.title ===
    "Обучение созданию медитаций: как научиться создавать свои аудиопрактики",
  "training creator article keeps the approved H1",
);
assert(
  trainingCreatorArticle.metaTitle ===
    "Обучение созданию медитаций и аудиопрактик",
  "training creator article keeps the approved meta title",
);
assert(
  trainingCreatorArticle.metaDescription ===
    "Обучение созданию медитаций: сценарий, текст, голос, запись и музыка. Как освоить создание собственных аудиопрактик с нуля и пройти весь путь системно.",
  "training creator article keeps the approved meta description",
);
assert(
  trainingCreatorArticle.shortAnswer === undefined,
  "training creator article does not add unapproved summary copy",
);
assert(
  trainingCreatorArticle.seeAlsoLinks.length === 0,
  "training creator article does not add unapproved product links",
);
assert(
  trainingCreatorArticle.faq.length === 8,
  "training creator article keeps the approved FAQ set",
);
const trainingCreatorSerialized = JSON.stringify(trainingCreatorArticle);
assert(
  trainingCreatorSerialized.includes(
    "https://audiolad.ru/articles/kak-sozdat-svoyu-meditatsiyu",
  ) &&
    trainingCreatorSerialized.includes(
      "https://audiolad.ru/articles/kak-napisat-tekst-meditatsii",
    ) &&
    trainingCreatorSerialized.includes(
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-samostoyatelno",
    ) &&
    trainingCreatorSerialized.includes(
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-s-muzykoy-samostoyatelno",
    ),
  "training creator article keeps all approved creator article links",
);
const trainingCreatorPageData = {
  article: trainingCreatorArticle,
  path: "/articles/obuchenie-sozdaniyu-meditatsiy",
  canonicalUrl: "https://audiolad.ru/articles/obuchenie-sozdaniyu-meditatsiy",
  readingTimeMinutes: estimateArticleReadingTimeMinutes(trainingCreatorArticle),
};
const trainingCreatorMetadata = buildArticleMetadata(trainingCreatorPageData);
assert(
  trainingCreatorMetadata.robots?.index === true &&
    trainingCreatorMetadata.robots?.follow === true,
  "training creator metadata stays indexable",
);
assert(
  !trainingCreatorMetadata.openGraph?.images,
  "training creator metadata omits practice OG image",
);
assert(
  !JSON.stringify(buildArticleJsonLdGraph(trainingCreatorPageData)).includes(
    '"image"',
  ),
  "training creator json-ld omits practice image",
);

const musicCreationCreatorArticle = getArticleBySlug(
  "sozdanie-muzyki-dlya-meditatsiy",
);
assert(musicCreationCreatorArticle, "music creation creator article registered");
assert(
  musicCreationCreatorArticle.productContinuation.kind === "creator_paths",
  "music creation creator article uses creator continuation",
);
assert(
  musicCreationCreatorArticle.productContinuation.emphasis === "balanced",
  "music creation creator article uses balanced emphasis",
);
assert(
  !("primaryPractice" in musicCreationCreatorArticle),
  "music creation creator article does not require a catalog practice",
);
assert(
  musicCreationCreatorArticle.title ===
    "Создание музыки для медитаций: как сделать музыкальное сопровождение для практики",
  "music creation creator article keeps the approved H1",
);
assert(
  musicCreationCreatorArticle.metaTitle ===
    "Создание музыки для медитаций: как сделать сопровождение",
  "music creation creator article keeps the approved meta title",
);
assert(
  musicCreationCreatorArticle.metaDescription ===
    "Как создать музыку для медитации самостоятельно: выбрать характер звучания, собрать музыкальную основу, подготовить её под голос и проверить права.",
  "music creation creator article keeps the approved meta description",
);
assert(
  musicCreationCreatorArticle.shortAnswer === undefined,
  "music creation creator article does not add unapproved summary copy",
);
assert(
  musicCreationCreatorArticle.seeAlsoLinks.length === 0,
  "music creation creator article does not add unapproved product links",
);
assert(
  musicCreationCreatorArticle.faq.length === 8,
  "music creation creator article keeps the approved FAQ set",
);
assert(
  JSON.stringify(musicCreationCreatorArticle).includes(
    "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-s-muzykoy-samostoyatelno",
  ),
  "music creation creator article keeps the approved music assembly link",
);
const musicCreationCreatorPageData = {
  article: musicCreationCreatorArticle,
  path: "/articles/sozdanie-muzyki-dlya-meditatsiy",
  canonicalUrl: "https://audiolad.ru/articles/sozdanie-muzyki-dlya-meditatsiy",
  readingTimeMinutes: estimateArticleReadingTimeMinutes(
    musicCreationCreatorArticle,
  ),
};
const musicCreationCreatorMetadata = buildArticleMetadata(
  musicCreationCreatorPageData,
);
assert(
  musicCreationCreatorMetadata.robots?.index === true &&
    musicCreationCreatorMetadata.robots?.follow === true,
  "music creation creator metadata stays indexable",
);
assert(
  !musicCreationCreatorMetadata.openGraph?.images,
  "music creation creator metadata omits practice OG image",
);
assert(
  !JSON.stringify(buildArticleJsonLdGraph(musicCreationCreatorPageData)).includes(
    '"image"',
  ),
  "music creation creator json-ld omits practice image",
);

const psychologistCreatorArticle = getArticleBySlug(
  "kak-psikhologu-nayti-klientov",
);
assert(psychologistCreatorArticle, "psychologist creator article registered");
assert(
  psychologistCreatorArticle.productContinuation.kind === "creator_paths",
  "psychologist creator article uses creator continuation",
);
assert(
  psychologistCreatorArticle.productContinuation.emphasis === "balanced",
  "psychologist creator article uses balanced emphasis",
);
assert(
  !("primaryPractice" in psychologistCreatorArticle),
  "psychologist creator article does not require a catalog practice",
);
assert(
  psychologistCreatorArticle.title ===
    "Как психологу найти клиентов: способы привлечения клиентов в частную практику",
  "psychologist creator article keeps the approved H1",
);
assert(
  psychologistCreatorArticle.metaTitle ===
    "Как психологу найти клиентов в частную практику",
  "psychologist creator article keeps the approved meta title",
);
assert(
  psychologistCreatorArticle.metaDescription ===
    "Как психологу найти клиентов: рекомендации, блог, поисковый трафик, соцсети, партнёрства и другие способы выстроить систему привлечения в частную практику.",
  "psychologist creator article keeps the approved meta description",
);
assert(
  psychologistCreatorArticle.shortAnswer === undefined,
  "psychologist creator article does not add unapproved summary copy",
);
assert(
  psychologistCreatorArticle.seeAlsoLinks.length === 0,
  "psychologist creator article does not add unapproved product links",
);
assert(
  psychologistCreatorArticle.faq.length === 8,
  "psychologist creator article keeps the approved FAQ set",
);
const psychologistCreatorSerialized = JSON.stringify(psychologistCreatorArticle);
assert(
  psychologistCreatorSerialized.includes(
    "https://audiolad.ru/articles/kak-sozdat-svoyu-meditatsiyu",
  ) &&
    psychologistCreatorSerialized.includes(
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-samostoyatelno",
    ),
  "psychologist creator article keeps the approved creator article links",
);
const psychologistCreatorPageData = {
  article: psychologistCreatorArticle,
  path: "/articles/kak-psikhologu-nayti-klientov",
  canonicalUrl: "https://audiolad.ru/articles/kak-psikhologu-nayti-klientov",
  readingTimeMinutes: estimateArticleReadingTimeMinutes(
    psychologistCreatorArticle,
  ),
};
const psychologistCreatorMetadata = buildArticleMetadata(
  psychologistCreatorPageData,
);
assert(
  psychologistCreatorMetadata.robots?.index === true &&
    psychologistCreatorMetadata.robots?.follow === true,
  "psychologist creator metadata stays indexable",
);
assert(
  !psychologistCreatorMetadata.openGraph?.images,
  "psychologist creator metadata omits practice OG image",
);
assert(
  !JSON.stringify(buildArticleJsonLdGraph(psychologistCreatorPageData)).includes(
    '"image"',
  ),
  "psychologist creator json-ld omits practice image",
);

const promotionCreatorArticle = getArticleBySlug("prodvizhenie-psikhologa");
assert(promotionCreatorArticle, "promotion creator article registered");
assert(
  promotionCreatorArticle.productContinuation.kind === "creator_paths",
  "promotion creator article uses creator continuation",
);
assert(
  promotionCreatorArticle.productContinuation.emphasis === "balanced",
  "promotion creator article uses balanced emphasis",
);
assert(
  !("primaryPractice" in promotionCreatorArticle),
  "promotion creator article does not require a catalog practice",
);
assert(
  promotionCreatorArticle.title ===
    "Продвижение психолога: как продвигать себя и свои услуги",
  "promotion creator article keeps the approved H1",
);
assert(
  promotionCreatorArticle.metaTitle ===
    "Продвижение психолога: как продвигать себя и услуги",
  "promotion creator article keeps the approved meta title",
);
assert(
  promotionCreatorArticle.metaDescription ===
    "Продвижение психолога: как выстроить позиционирование, контент, сайт, поиск, рекомендации, рекламу и систему продвижения своих услуг.",
  "promotion creator article keeps the approved meta description",
);
assert(
  promotionCreatorArticle.shortAnswer === undefined,
  "promotion creator article does not add unapproved summary copy",
);
assert(
  promotionCreatorArticle.seeAlsoLinks.length === 0,
  "promotion creator article does not add unapproved product links",
);
assert(
  promotionCreatorArticle.faq.length === 8,
  "promotion creator article keeps the approved FAQ set",
);
const promotionCreatorSerialized = JSON.stringify(promotionCreatorArticle);
assert(
  promotionCreatorSerialized.includes(
    "https://audiolad.ru/articles/kak-psikhologu-nayti-klientov",
  ) &&
    promotionCreatorSerialized.includes(
      "https://audiolad.ru/articles/kak-sozdat-svoyu-meditatsiyu",
    ) &&
    promotionCreatorSerialized.includes(
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-samostoyatelno",
    ),
  "promotion creator article keeps the approved creator article links",
);
const promotionCreatorPageData = {
  article: promotionCreatorArticle,
  path: "/articles/prodvizhenie-psikhologa",
  canonicalUrl: "https://audiolad.ru/articles/prodvizhenie-psikhologa",
  readingTimeMinutes: estimateArticleReadingTimeMinutes(promotionCreatorArticle),
};
const promotionCreatorMetadata = buildArticleMetadata(promotionCreatorPageData);
assert(
  promotionCreatorMetadata.robots?.index === true &&
    promotionCreatorMetadata.robots?.follow === true,
  "promotion creator metadata stays indexable",
);
assert(
  !promotionCreatorMetadata.openGraph?.images,
  "promotion creator metadata omits practice OG image",
);
assert(
  !JSON.stringify(buildArticleJsonLdGraph(promotionCreatorPageData)).includes(
    '"image"',
  ),
  "promotion creator json-ld omits practice image",
);

const advertisingCreatorArticle = getArticleBySlug("reklama-psikhologa");
assert(advertisingCreatorArticle, "advertising creator article registered");
assert(
  advertisingCreatorArticle.productContinuation.kind === "creator_paths",
  "advertising creator article uses creator continuation",
);
assert(
  advertisingCreatorArticle.productContinuation.emphasis === "balanced",
  "advertising creator article uses balanced emphasis",
);
assert(
  !("primaryPractice" in advertisingCreatorArticle),
  "advertising creator article does not require a catalog practice",
);
assert(
  advertisingCreatorArticle.title ===
    "Реклама психолога: где и как рекламировать свои услуги",
  "advertising creator article keeps the approved H1",
);
assert(
  advertisingCreatorArticle.metaTitle ===
    "Реклама психолога: где и как рекламировать услуги",
  "advertising creator article keeps the approved meta title",
);
assert(
  advertisingCreatorArticle.metaDescription ===
    "Реклама психолога: где рекламировать услуги, куда вести аудиторию, как написать объявление, избежать ошибок и оценивать реальные обращения.",
  "advertising creator article keeps the approved meta description",
);
assert(
  advertisingCreatorArticle.shortAnswer === undefined,
  "advertising creator article does not add unapproved summary copy",
);
assert(
  advertisingCreatorArticle.seeAlsoLinks.length === 0,
  "advertising creator article does not add unapproved product links",
);
assert(
  advertisingCreatorArticle.faq.length === 8,
  "advertising creator article keeps the approved FAQ set",
);
const advertisingCreatorSerialized = JSON.stringify(advertisingCreatorArticle);
assert(
  advertisingCreatorSerialized.includes(
    "https://audiolad.ru/articles/prodvizhenie-psikhologa",
  ) &&
    advertisingCreatorSerialized.includes(
      "https://audiolad.ru/articles/kak-psikhologu-nayti-klientov",
    ) &&
    advertisingCreatorSerialized.includes(
      "https://audiolad.ru/articles/kak-sozdat-svoyu-meditatsiyu",
    ) &&
    advertisingCreatorSerialized.includes(
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-samostoyatelno",
    ),
  "advertising creator article keeps the approved creator article links",
);
const advertisingCreatorPageData = {
  article: advertisingCreatorArticle,
  path: "/articles/reklama-psikhologa",
  canonicalUrl: "https://audiolad.ru/articles/reklama-psikhologa",
  readingTimeMinutes: estimateArticleReadingTimeMinutes(
    advertisingCreatorArticle,
  ),
};
const advertisingCreatorMetadata = buildArticleMetadata(
  advertisingCreatorPageData,
);
assert(
  advertisingCreatorMetadata.robots?.index === true &&
    advertisingCreatorMetadata.robots?.follow === true,
  "advertising creator metadata stays indexable",
);
assert(
  !advertisingCreatorMetadata.openGraph?.images,
  "advertising creator metadata omits practice OG image",
);
assert(
  !JSON.stringify(buildArticleJsonLdGraph(advertisingCreatorPageData)).includes(
    '"image"',
  ),
  "advertising creator json-ld omits practice image",
);

const beginnerCreatorArticle = getArticleBySlug(
  "kak-nachinayushchemu-psikhologu-nayti-pervykh-klientov",
);
assert(beginnerCreatorArticle, "beginner creator article registered");
assert(
  beginnerCreatorArticle.productContinuation.kind === "creator_paths",
  "beginner creator article uses creator continuation",
);
assert(
  beginnerCreatorArticle.productContinuation.emphasis === "balanced",
  "beginner creator article uses balanced emphasis",
);
assert(
  !("primaryPractice" in beginnerCreatorArticle),
  "beginner creator article does not require a catalog practice",
);
assert(
  beginnerCreatorArticle.title ===
    "Как начинающему психологу найти первых клиентов",
  "beginner creator article keeps the approved H1",
);
assert(
  beginnerCreatorArticle.metaTitle ===
    "Как начинающему психологу найти первых клиентов",
  "beginner creator article keeps the approved meta title",
);
assert(
  beginnerCreatorArticle.metaDescription ===
    "Как начинающему психологу найти первых клиентов: где искать первые обращения, как сформировать доверие, начать без большой аудитории и выстроить простую систему.",
  "beginner creator article keeps the approved meta description",
);
assert(
  beginnerCreatorArticle.shortAnswer === undefined,
  "beginner creator article does not add unapproved summary copy",
);
assert(
  beginnerCreatorArticle.seeAlsoLinks.length === 0,
  "beginner creator article does not add unapproved product links",
);
assert(
  beginnerCreatorArticle.faq.length === 8,
  "beginner creator article keeps the approved FAQ set",
);
const beginnerCreatorSerialized = JSON.stringify(beginnerCreatorArticle);
assert(
  beginnerCreatorSerialized.includes(
    "https://audiolad.ru/articles/kak-psikhologu-nayti-klientov",
  ) &&
    beginnerCreatorSerialized.includes(
      "https://audiolad.ru/articles/reklama-psikhologa",
    ) &&
    beginnerCreatorSerialized.includes(
      "https://audiolad.ru/articles/prodvizhenie-psikhologa",
    ) &&
    beginnerCreatorSerialized.includes(
      "https://audiolad.ru/articles/kak-sozdat-svoyu-meditatsiyu",
    ) &&
    beginnerCreatorSerialized.includes(
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-samostoyatelno",
    ),
  "beginner creator article keeps the approved creator article links",
);
const beginnerCreatorPageData = {
  article: beginnerCreatorArticle,
  path: "/articles/kak-nachinayushchemu-psikhologu-nayti-pervykh-klientov",
  canonicalUrl:
    "https://audiolad.ru/articles/kak-nachinayushchemu-psikhologu-nayti-pervykh-klientov",
  readingTimeMinutes: estimateArticleReadingTimeMinutes(beginnerCreatorArticle),
};
const beginnerCreatorMetadata = buildArticleMetadata(beginnerCreatorPageData);
assert(
  beginnerCreatorMetadata.robots?.index === true &&
    beginnerCreatorMetadata.robots?.follow === true,
  "beginner creator metadata stays indexable",
);
assert(
  !beginnerCreatorMetadata.openGraph?.images,
  "beginner creator metadata omits practice OG image",
);
assert(
  !JSON.stringify(buildArticleJsonLdGraph(beginnerCreatorPageData)).includes(
    '"image"',
  ),
  "beginner creator json-ld omits practice image",
);

const practiceCreatorArticle = getArticleBySlug("chastnaya-praktika-psikhologa");
assert(practiceCreatorArticle, "private practice creator article registered");
assert(
  practiceCreatorArticle.productContinuation.kind === "creator_paths",
  "private practice creator article uses creator continuation",
);
assert(
  practiceCreatorArticle.productContinuation.emphasis === "balanced",
  "private practice creator article uses balanced emphasis",
);
assert(
  !("primaryPractice" in practiceCreatorArticle),
  "private practice creator article does not require a catalog practice",
);
assert(
  practiceCreatorArticle.title ===
    "Частная практика психолога: как начать и развивать своё дело",
  "private practice creator article keeps the approved H1",
);
assert(
  practiceCreatorArticle.metaTitle ===
    "Частная практика психолога: как начать и развивать",
  "private practice creator article keeps the approved meta title",
);
assert(
  practiceCreatorArticle.metaDescription ===
    "Частная практика психолога: как начать работать на себя, организовать консультации, привлечение клиентов, доход и развитие собственной практики.",
  "private practice creator article keeps the approved meta description",
);
assert(
  practiceCreatorArticle.shortAnswer === undefined,
  "private practice creator article does not add unapproved summary copy",
);
assert(
  practiceCreatorArticle.seeAlsoLinks.length === 0,
  "private practice creator article does not add unapproved product links",
);
assert(
  practiceCreatorArticle.faq.length === 8,
  "private practice creator article keeps the approved FAQ set",
);
const practiceCreatorSerialized = JSON.stringify(practiceCreatorArticle);
assert(
  practiceCreatorSerialized.includes(
    "https://audiolad.ru/articles/kak-nachinayushchemu-psikhologu-nayti-pervykh-klientov",
  ) &&
    practiceCreatorSerialized.includes(
      "https://audiolad.ru/articles/kak-psikhologu-nayti-klientov",
    ) &&
    practiceCreatorSerialized.includes(
      "https://audiolad.ru/articles/prodvizhenie-psikhologa",
    ) &&
    practiceCreatorSerialized.includes(
      "https://audiolad.ru/articles/reklama-psikhologa",
    ),
  "private practice creator article keeps the approved creator article links",
);
const practiceCreatorPageData = {
  article: practiceCreatorArticle,
  path: "/articles/chastnaya-praktika-psikhologa",
  canonicalUrl: "https://audiolad.ru/articles/chastnaya-praktika-psikhologa",
  readingTimeMinutes: estimateArticleReadingTimeMinutes(practiceCreatorArticle),
};
const practiceCreatorMetadata = buildArticleMetadata(practiceCreatorPageData);
assert(
  practiceCreatorMetadata.robots?.index === true &&
    practiceCreatorMetadata.robots?.follow === true,
  "private practice creator metadata stays indexable",
);
assert(
  !practiceCreatorMetadata.openGraph?.images,
  "private practice creator metadata omits practice OG image",
);
assert(
  !JSON.stringify(buildArticleJsonLdGraph(practiceCreatorPageData)).includes(
    '"image"',
  ),
  "private practice creator json-ld omits practice image",
);
const blogCreatorArticle = getArticleBySlug("blog-psikhologa");
assert(blogCreatorArticle, "blog creator article registered");
assert(
  blogCreatorArticle.productContinuation.kind === "creator_paths",
  "blog creator article uses creator continuation",
);
assert(
  blogCreatorArticle.productContinuation.emphasis === "balanced",
  "blog creator article uses balanced emphasis",
);
assert(
  !("primaryPractice" in blogCreatorArticle),
  "blog creator article does not require a catalog practice",
);
assert(
  blogCreatorArticle.title ===
    "Блог психолога: как вести блог, который помогает находить клиентов",
  "blog creator article keeps the approved H1",
);
assert(
  blogCreatorArticle.metaTitle ===
    "Блог психолога: как вести блог и находить клиентов",
  "blog creator article keeps the approved meta title",
);
assert(
  blogCreatorArticle.metaDescription ===
    "Блог психолога: как выбрать темы, вести блог регулярно, формировать доверие, находить клиентов и превращать накопленный контент в полезные материалы.",
  "blog creator article keeps the approved meta description",
);
assert(
  blogCreatorArticle.shortAnswer === undefined,
  "blog creator article does not add unapproved summary copy",
);
assert(
  blogCreatorArticle.seeAlsoLinks.length === 0,
  "blog creator article does not add unapproved product links",
);
assert(
  blogCreatorArticle.faq.length === 8,
  "blog creator article keeps the approved FAQ set",
);
const blogCreatorSerialized = JSON.stringify(blogCreatorArticle);
assert(
  blogCreatorSerialized.includes(
    "https://audiolad.ru/articles/kak-nachinayushchemu-psikhologu-nayti-pervykh-klientov",
  ) &&
    blogCreatorSerialized.includes(
      "https://audiolad.ru/articles/kak-psikhologu-nayti-klientov",
    ) &&
    blogCreatorSerialized.includes(
      "https://audiolad.ru/articles/prodvizhenie-psikhologa",
    ) &&
    blogCreatorSerialized.includes(
      "https://audiolad.ru/articles/chastnaya-praktika-psikhologa",
    ),
  "blog creator article keeps the approved creator article links",
);
const blogCreatorPageData = {
  article: blogCreatorArticle,
  path: "/articles/blog-psikhologa",
  canonicalUrl: "https://audiolad.ru/articles/blog-psikhologa",
  readingTimeMinutes: estimateArticleReadingTimeMinutes(blogCreatorArticle),
};
const blogCreatorMetadata = buildArticleMetadata(blogCreatorPageData);
assert(
  blogCreatorMetadata.robots?.index === true &&
    blogCreatorMetadata.robots?.follow === true,
  "blog creator metadata stays indexable",
);
assert(
  !blogCreatorMetadata.openGraph?.images,
  "blog creator metadata omits practice OG image",
);
assert(
  !JSON.stringify(buildArticleJsonLdGraph(blogCreatorPageData)).includes(
    '"image"',
  ),
  "blog creator json-ld omits practice image",
);
const salesCreatorArticle = getArticleBySlug("prodazhi-psikhologa");
assert(salesCreatorArticle, "sales creator article registered");
assert(
  salesCreatorArticle.productContinuation.kind === "creator_paths",
  "sales creator article uses creator continuation",
);
assert(
  salesCreatorArticle.productContinuation.emphasis === "balanced",
  "sales creator article uses balanced emphasis",
);
assert(
  !("primaryPractice" in salesCreatorArticle),
  "sales creator article does not require a catalog practice",
);
assert(
  salesCreatorArticle.title ===
    "Продажи психолога: как продавать консультации и свои услуги",
  "sales creator article keeps the approved H1",
);
assert(
  salesCreatorArticle.metaTitle ===
    "Продажи психолога: как продавать консультации и услуги",
  "sales creator article keeps the approved meta title",
);
assert(
  salesCreatorArticle.metaDescription ===
    "Продажи психолога: как продавать консультации и услуги без давления, выстроить понятное предложение, воронку и путь от интереса к записи.",
  "sales creator article keeps the approved meta description",
);
assert(
  salesCreatorArticle.shortAnswer === undefined,
  "sales creator article does not add unapproved summary copy",
);
assert(
  salesCreatorArticle.seeAlsoLinks.length === 0,
  "sales creator article does not add unapproved product links",
);
assert(
  salesCreatorArticle.faq.length === 8,
  "sales creator article keeps the approved FAQ set",
);
const salesCreatorSerialized = JSON.stringify(salesCreatorArticle);
assert(
  salesCreatorSerialized.includes(
    "https://audiolad.ru/articles/kak-psikhologu-nayti-klientov",
  ) &&
    salesCreatorSerialized.includes(
      "https://audiolad.ru/articles/prodvizhenie-psikhologa",
    ) &&
    salesCreatorSerialized.includes(
      "https://audiolad.ru/articles/blog-psikhologa",
    ) &&
    salesCreatorSerialized.includes(
      "https://audiolad.ru/articles/reklama-psikhologa",
    ) &&
    salesCreatorSerialized.includes(
      "https://audiolad.ru/articles/chastnaya-praktika-psikhologa",
    ),
  "sales creator article keeps the approved creator article links",
);
const salesCreatorPageData = {
  article: salesCreatorArticle,
  path: "/articles/prodazhi-psikhologa",
  canonicalUrl: "https://audiolad.ru/articles/prodazhi-psikhologa",
  readingTimeMinutes: estimateArticleReadingTimeMinutes(salesCreatorArticle),
};
const salesCreatorMetadata = buildArticleMetadata(salesCreatorPageData);
assert(
  salesCreatorMetadata.robots?.index === true &&
    salesCreatorMetadata.robots?.follow === true,
  "sales creator metadata stays indexable",
);
assert(
  !salesCreatorMetadata.openGraph?.images,
  "sales creator metadata omits practice OG image",
);
assert(
  !JSON.stringify(buildArticleJsonLdGraph(salesCreatorPageData)).includes(
    '"image"',
  ),
  "sales creator json-ld omits practice image",
);
const incomeCreatorArticle = getArticleBySlug("kak-psikhologu-zarabotat");
assert(incomeCreatorArticle, "income creator article registered");
assert(
  incomeCreatorArticle.productContinuation.kind === "creator_paths",
  "income creator article uses creator continuation",
);
assert(
  incomeCreatorArticle.productContinuation.emphasis === "balanced",
  "income creator article uses balanced emphasis",
);
assert(
  !("primaryPractice" in incomeCreatorArticle),
  "income creator article does not require a catalog practice",
);
assert(
  incomeCreatorArticle.title ===
    "Как психологу заработать: способы увеличить доход и монетизировать опыт",
  "income creator article keeps the approved H1",
);
assert(
  incomeCreatorArticle.metaTitle ===
    "Как психологу заработать: способы увеличить доход",
  "income creator article keeps the approved meta title",
);
assert(
  incomeCreatorArticle.metaDescription ===
    "Как психологу заработать: консультации, группы, цифровые материалы и аудиопродукты. Как увеличить доход и монетизировать профессиональный опыт.",
  "income creator article keeps the approved meta description",
);
assert(
  incomeCreatorArticle.shortAnswer === undefined,
  "income creator article does not add unapproved summary copy",
);
assert(
  incomeCreatorArticle.seeAlsoLinks.length === 0,
  "income creator article does not add unapproved product links",
);
assert(
  incomeCreatorArticle.faq.length === 8,
  "income creator article keeps the approved FAQ set",
);
const incomeCreatorSerialized = JSON.stringify(incomeCreatorArticle);
assert(
  incomeCreatorSerialized.includes(
    "https://audiolad.ru/articles/chastnaya-praktika-psikhologa",
  ) &&
    incomeCreatorSerialized.includes(
      "https://audiolad.ru/articles/kak-psikhologu-nayti-klientov",
    ) &&
    incomeCreatorSerialized.includes(
      "https://audiolad.ru/articles/kak-nachinayushchemu-psikhologu-nayti-pervykh-klientov",
    ) &&
    incomeCreatorSerialized.includes(
      "https://audiolad.ru/articles/blog-psikhologa",
    ) &&
    incomeCreatorSerialized.includes(
      "https://audiolad.ru/articles/prodvizhenie-psikhologa",
    ) &&
    incomeCreatorSerialized.includes(
      "https://audiolad.ru/articles/prodazhi-psikhologa",
    ),
  "income creator article keeps the approved creator article links",
);
const incomeCreatorPageData = {
  article: incomeCreatorArticle,
  path: "/articles/kak-psikhologu-zarabotat",
  canonicalUrl: "https://audiolad.ru/articles/kak-psikhologu-zarabotat",
  readingTimeMinutes: estimateArticleReadingTimeMinutes(incomeCreatorArticle),
};
const incomeCreatorMetadata = buildArticleMetadata(incomeCreatorPageData);
assert(
  incomeCreatorMetadata.robots?.index === true &&
    incomeCreatorMetadata.robots?.follow === true,
  "income creator metadata stays indexable",
);
assert(
  !incomeCreatorMetadata.openGraph?.images,
  "income creator metadata omits practice OG image",
);
assert(
  !JSON.stringify(buildArticleJsonLdGraph(incomeCreatorPageData)).includes(
    '"image"',
  ),
  "income creator json-ld omits practice image",
);
const productsCreatorArticle = getArticleBySlug("produkty-psikhologa");
assert(productsCreatorArticle, "products creator article registered");
assert(
  productsCreatorArticle.productContinuation.kind === "creator_paths",
  "products creator article uses creator continuation",
);
assert(
  productsCreatorArticle.productContinuation.emphasis === "balanced",
  "products creator article uses balanced emphasis",
);
assert(
  !("primaryPractice" in productsCreatorArticle),
  "products creator article does not require a catalog practice",
);
assert(
  productsCreatorArticle.title ===
    "Продукты психолога: что можно создать кроме консультаций",
  "products creator article keeps the approved H1",
);
assert(
  productsCreatorArticle.metaTitle ===
    "Продукты психолога: что создать кроме консультаций",
  "products creator article keeps the approved meta title",
);
assert(
  productsCreatorArticle.metaDescription ===
    "Продукты психолога: какие форматы можно создать кроме консультаций, как выбрать первый продукт, собрать онлайн-продукт и выстроить продуктовую линейку.",
  "products creator article keeps the approved meta description",
);
assert(
  productsCreatorArticle.leadBeforeAudio ===
    "Продукты психолога – это не обязательно большой онлайн-курс. Профессиональные знания, упражнения и методические материалы можно превращать в небольшие самостоятельные форматы, которые решают одну понятную задачу.",
  "products creator article keeps the approved lead",
);
assert(
  productsCreatorArticle.shortAnswer === undefined,
  "products creator article does not add unapproved summary copy",
);
assert(
  productsCreatorArticle.seeAlsoLinks.length === 0,
  "products creator article does not add unapproved product links",
);
assert(
  productsCreatorArticle.faq.length === 8,
  "products creator article keeps the approved FAQ set",
);
const productsCreatorSerialized = JSON.stringify(productsCreatorArticle);
assert(
  productsCreatorSerialized.includes(
    "https://audiolad.ru/articles/kak-psikhologu-zarabotat",
  ) &&
    productsCreatorSerialized.includes(
      "https://audiolad.ru/articles/blog-psikhologa",
    ) &&
    productsCreatorSerialized.includes(
      "https://audiolad.ru/articles/prodazhi-psikhologa",
    ) &&
    productsCreatorSerialized.includes(
      "https://audiolad.ru/articles/chastnaya-praktika-psikhologa",
    ) &&
    productsCreatorSerialized.includes(
      "https://audiolad.ru/articles/prodvizhenie-psikhologa",
    ),
  "products creator article keeps the approved creator article links",
);
const productsCreatorPageData = {
  article: productsCreatorArticle,
  path: "/articles/produkty-psikhologa",
  canonicalUrl: "https://audiolad.ru/articles/produkty-psikhologa",
  readingTimeMinutes: estimateArticleReadingTimeMinutes(productsCreatorArticle),
};
const productsCreatorMetadata = buildArticleMetadata(productsCreatorPageData);
assert(
  productsCreatorMetadata.robots?.index === true &&
    productsCreatorMetadata.robots?.follow === true,
  "products creator metadata stays indexable",
);
assert(
  !productsCreatorMetadata.openGraph?.images,
  "products creator metadata omits practice OG image",
);
assert(
  !JSON.stringify(buildArticleJsonLdGraph(productsCreatorPageData)).includes(
    '"image"',
  ),
  "products creator json-ld omits practice image",
);
const contentCreatorArticle = getArticleBySlug("kontent-dlya-psikhologa");
assert(contentCreatorArticle, "content creator article registered");
assert(
  contentCreatorArticle.productContinuation.kind === "creator_paths",
  "content creator article uses creator continuation",
);
assert(
  contentCreatorArticle.productContinuation.emphasis === "balanced",
  "content creator article uses balanced emphasis",
);
assert(
  !("primaryPractice" in contentCreatorArticle),
  "content creator article does not require a catalog practice",
);
assert(
  contentCreatorArticle.title ===
    "Контент для психолога: темы и контент-план для блога",
  "content creator article keeps the approved H1",
);
assert(
  contentCreatorArticle.metaTitle ===
    "Контент для психолога: темы и контент-план",
  "content creator article keeps the approved meta title",
);
assert(
  contentCreatorArticle.metaDescription ===
    "Контент для психолога: где брать темы, какие рубрики использовать, как составить контент-план для блога и превращать сильные темы в разные форматы.",
  "content creator article keeps the approved meta description",
);
assert(
  contentCreatorArticle.leadBeforeAudio ===
    "Контент для психолога проще создавать, когда не приходится каждый раз начинать с вопроса «что сегодня написать?». Вместо случайных идей полезнее собрать несколько тематических направлений, реальные вопросы аудитории и повторяющиеся рубрики.",
  "content creator article keeps the approved lead",
);
assert(
  contentCreatorArticle.shortAnswer === undefined,
  "content creator article does not add unapproved summary copy",
);
assert(
  contentCreatorArticle.seeAlsoLinks.length === 0,
  "content creator article does not add unapproved product links",
);
assert(
  contentCreatorArticle.faq.length === 8,
  "content creator article keeps the approved FAQ set",
);
const contentCreatorSerialized = JSON.stringify(contentCreatorArticle);
assert(
  contentCreatorSerialized.includes(
    "https://audiolad.ru/articles/blog-psikhologa",
  ) &&
    contentCreatorSerialized.includes(
      "https://audiolad.ru/articles/kak-psikhologu-nayti-klientov",
    ) &&
    contentCreatorSerialized.includes(
      "https://audiolad.ru/articles/prodvizhenie-psikhologa",
    ) &&
    contentCreatorSerialized.includes(
      "https://audiolad.ru/articles/produkty-psikhologa",
    ),
  "content creator article keeps the approved creator article links",
);
const contentCreatorPageData = {
  article: contentCreatorArticle,
  path: "/articles/kontent-dlya-psikhologa",
  canonicalUrl: "https://audiolad.ru/articles/kontent-dlya-psikhologa",
  readingTimeMinutes: estimateArticleReadingTimeMinutes(contentCreatorArticle),
};
const contentCreatorMetadata = buildArticleMetadata(contentCreatorPageData);
assert(
  contentCreatorMetadata.robots?.index === true &&
    contentCreatorMetadata.robots?.follow === true,
  "content creator metadata stays indexable",
);
assert(
  !contentCreatorMetadata.openGraph?.images,
  "content creator metadata omits practice OG image",
);
assert(
  !JSON.stringify(buildArticleJsonLdGraph(contentCreatorPageData)).includes(
    '"image"',
  ),
  "content creator json-ld omits practice image",
);
const creatorPageData = {
  article: creatorPathsArticle,
  path: "/articles/kak-sozdat-svoyu-meditatsiyu",
  canonicalUrl: "https://audiolad.ru/articles/kak-sozdat-svoyu-meditatsiyu",
  readingTimeMinutes: estimateArticleReadingTimeMinutes(creatorPathsArticle),
};
const creatorMetadata = buildArticleMetadata(creatorPageData);
assert(
  !creatorMetadata.openGraph?.images,
  "creator paths metadata omits practice OG image",
);
assert(
  !JSON.stringify(buildArticleJsonLdGraph(creatorPageData)).includes('"image"'),
  "creator paths json-ld omits practice image",
);

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
      entry.url ===
      "https://audiolad.ru/articles/prilozhenie-dlya-zapisi-meditatsiy",
  ),
  "tool creator article in sitemap mapper",
);
assert(
  sitemapEntries.filter(
    (entry) =>
      entry.url ===
      "https://audiolad.ru/articles/prilozhenie-dlya-zapisi-meditatsiy",
  ).length === 1,
  "tool creator article has a single sitemap URL",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/obuchenie-sozdaniyu-meditatsiy",
  ),
  "training creator article in sitemap mapper",
);
assert(
  sitemapEntries.filter(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/obuchenie-sozdaniyu-meditatsiy",
  ).length === 1,
  "training creator article has a single sitemap URL",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/sozdanie-muzyki-dlya-meditatsiy",
  ),
  "music creation creator article in sitemap mapper",
);
assert(
  sitemapEntries.filter(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/sozdanie-muzyki-dlya-meditatsiy",
  ).length === 1,
  "music creation creator article has a single sitemap URL",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/kak-psikhologu-nayti-klientov",
  ),
  "psychologist creator article in sitemap mapper",
);
assert(
  sitemapEntries.filter(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/kak-psikhologu-nayti-klientov",
  ).length === 1,
  "psychologist creator article has a single sitemap URL",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/prodvizhenie-psikhologa",
  ),
  "promotion creator article in sitemap mapper",
);
assert(
  sitemapEntries.filter(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/prodvizhenie-psikhologa",
  ).length === 1,
  "promotion creator article has a single sitemap URL",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/reklama-psikhologa",
  ),
  "advertising creator article in sitemap mapper",
);
assert(
  sitemapEntries.filter(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/reklama-psikhologa",
  ).length === 1,
  "advertising creator article has a single sitemap URL",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url ===
      "https://audiolad.ru/articles/kak-nachinayushchemu-psikhologu-nayti-pervykh-klientov",
  ),
  "beginner creator article in sitemap mapper",
);
assert(
  sitemapEntries.filter(
    (entry) =>
      entry.url ===
      "https://audiolad.ru/articles/kak-nachinayushchemu-psikhologu-nayti-pervykh-klientov",
  ).length === 1,
  "beginner creator article has a single sitemap URL",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/chastnaya-praktika-psikhologa",
  ),
  "private practice creator article in sitemap mapper",
);
assert(
  sitemapEntries.filter(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/chastnaya-praktika-psikhologa",
  ).length === 1,
  "private practice creator article has a single sitemap URL",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/blog-psikhologa",
  ),
  "blog creator article in sitemap mapper",
);
assert(
  sitemapEntries.filter(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/blog-psikhologa",
  ).length === 1,
  "blog creator article has a single sitemap URL",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/prodazhi-psikhologa",
  ),
  "sales creator article in sitemap mapper",
);
assert(
  sitemapEntries.filter(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/prodazhi-psikhologa",
  ).length === 1,
  "sales creator article has a single sitemap URL",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/kak-psikhologu-zarabotat",
  ),
  "income creator article in sitemap mapper",
);
assert(
  sitemapEntries.filter(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/kak-psikhologu-zarabotat",
  ).length === 1,
  "income creator article has a single sitemap URL",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/produkty-psikhologa",
  ),
  "products creator article in sitemap mapper",
);
assert(
  sitemapEntries.filter(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/produkty-psikhologa",
  ).length === 1,
  "products creator article has a single sitemap URL",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/kontent-dlya-psikhologa",
  ),
  "content creator article in sitemap mapper",
);
assert(
  sitemapEntries.filter(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/kontent-dlya-psikhologa",
  ).length === 1,
  "content creator article has a single sitemap URL",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/kak-napisat-tekst-meditatsii",
  ),
  "script creator article in sitemap mapper",
);
assert(
  sitemapEntries.filter(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/kak-napisat-tekst-meditatsii",
  ).length === 1,
  "script creator article has a single sitemap URL",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url ===
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-s-muzykoy-samostoyatelno",
  ),
  "music creator article in sitemap mapper",
);
assert(
  sitemapEntries.filter(
    (entry) =>
      entry.url ===
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-s-muzykoy-samostoyatelno",
  ).length === 1,
  "music creator article has a single sitemap URL",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url ===
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-samostoyatelno",
  ),
  "recording creator article in sitemap mapper",
);
assert(
  sitemapEntries.filter(
    (entry) =>
      entry.url ===
      "https://audiolad.ru/articles/kak-zapisat-meditatsiyu-samostoyatelno",
  ).length === 1,
  "recording creator article has a single sitemap URL",
);
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
  sitemapEntries.some(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/meditatsiya-na-izobilie",
  ),
  "abundance meditation article in sitemap mapper",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url ===
      "https://audiolad.ru/articles/meditatsiya-na-privlechenie-deneg",
  ),
  "money attraction article in sitemap mapper",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url ===
      "https://audiolad.ru/articles/kak-privlech-dengi-v-svoyu-zhizn",
  ),
  "how-to attract money article in sitemap mapper",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/affirmatsii-na-dengi",
  ),
  "money affirmations article in sitemap mapper",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url ===
      "https://audiolad.ru/articles/kak-izmenit-otnoshenie-k-dengam",
  ),
  "change money attitude article in sitemap mapper",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url ===
      "https://audiolad.ru/articles/meditatsiya-na-ispolnenie-zhelaniy",
  ),
  "wish meditation article in sitemap mapper",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/vizualizatsiya-zhelaniy",
  ),
  "wish visualization article in sitemap mapper",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/kak-otpustit-obidu",
  ),
  "release resentment article in sitemap mapper",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url === "https://audiolad.ru/articles/kak-prostit-cheloveka",
  ),
  "forgive-a-person article in sitemap mapper",
);
assert(
  sitemapEntries.some(
    (entry) =>
      entry.url ===
      "https://audiolad.ru/articles/pochemu-my-postoyanno-obizhaemsya",
  ),
  "habitual-offense article in sitemap mapper",
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

const pageSource = read("src/app/(platform)/(listener)/articles/[slug]/page.tsx");
assert(pageSource.includes("ArticlePageView"), "page uses ArticlePageView");
assert(pageSource.includes("force-dynamic"), "article page is dynamic");

const layoutSource = read("src/app/(platform)/(listener)/articles/layout.tsx");
assert(layoutSource.includes("HomeMobileHeader"), "reuses guest mobile header");
assert(layoutSource.includes("ListenerAppShell") === false, "no parallel shell");

const fullViewSource = read("src/components/articles/ArticlePageView.tsx");
assert(
  fullViewSource.includes("CreatorPathsCta"),
  "creator paths CTA is rendered by article view",
);
const articleTopicLinkSource = read(
  "src/components/articles/ArticleTopicLink.tsx",
);
assert(
  !articleTopicLinkSource.includes("useArticlePlayback"),
  "topic links do not require the practice playback provider",
);
assert(
  articleTopicLinkSource.includes('event_name: "article_topic_click"'),
  "topic links preserve article topic click analytics",
);
const articleTocSource = read("src/components/articles/ArticleToc.tsx");
assert(
  !articleTocSource.includes("useArticlePlayback"),
  "table of contents does not require the practice playback provider",
);
assert(
  articleTocSource.includes('event_name: "article_toc_click"'),
  "table of contents preserves article click analytics",
);
const creatorPathsCtaSource = read(
  "src/components/articles/CreatorPathsCta.tsx",
);
assert(
  creatorPathsCtaSource.includes(
    'const STUDIO_HREF = "https://audiolad.ru/studio/meditation"',
  ),
  "creator paths CTA links Studio directly to meditation studio",
);
assert(
  creatorPathsCtaSource.includes('import { SCHOOL_ORIGIN }'),
  "creator paths CTA uses the configured School production origin",
);
assert(
  creatorPathsCtaSource.includes("Посмотреть Школу Аудиопрактик") &&
    !creatorPathsCtaSource.includes("sm:hidden"),
  "creator paths CTA uses the full School label on every viewport",
);
assert(
  creatorPathsCtaSource.includes('target="_blank"') &&
    creatorPathsCtaSource.includes('rel="noopener noreferrer"'),
  "creator paths CTA preserves the article in a new tab",
);
assert(
  creatorPathsCtaSource.includes("Уже готовы записать свою медитацию?") &&
    creatorPathsCtaSource.includes(
      "без специальных навыков и сложных программ.",
    ),
  "creator paths CTA uses the balanced Studio copy",
);
const viewSource = fullViewSource.slice(
  fullViewSource.indexOf("function PracticeArticlePageView"),
);
const creatorViewSource = fullViewSource.slice(
  fullViewSource.indexOf("function CreatorPathsArticlePageView"),
  fullViewSource.indexOf("function PracticeArticlePageView"),
);
assert(
  creatorViewSource.includes("CreatorPathsCta"),
  "creator article renders CreatorPathsCta",
);
assert(
  !creatorViewSource.includes("ArticlePlaybackProvider"),
  "creator article excludes playback provider",
);
assert(
  !creatorViewSource.includes("ArticleAudioBlock"),
  "creator article excludes practice player blocks",
);
assert(
  creatorViewSource.includes("openCreatorProductLinksInNewTab") &&
    fullViewSource.includes("shouldOpenCreatorProductLinkInNewTab") &&
    fullViewSource.includes('rel: "noopener noreferrer"'),
  "creator article opens only Studio and School product links in a new tab",
);
assert(
  !viewSource.includes("CreatorPathsCta"),
  "practice article excludes creator CTA",
);
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

const femaleEnergyArticle = getArticleBySlug("kak-napolnitsya-zhenskoy-energiey");
assert(femaleEnergyArticle, "female-energy article registered");
assert(
  femaleEnergyArticle.title ===
    "Как наполниться женской энергией и вернуть ощущение внутренней живости",
  "female-energy H1",
);
assert(
  femaleEnergyArticle.topicSlug === "besplatnye-meditatsii",
  "female-energy free hub",
);
assert(
  femaleEnergyArticle.primaryPractice.practiceKey ===
    "bastet-boginya-radosti-lyubvi-i-zhenskoy-sily",
  "female-energy practice bastet",
);
assert(
  femaleEnergyArticle.sections
    .find((section) => section.id === "audiopraktika")
    ?.paragraphs.some((paragraph) => paragraph.includes("не гарантирует")),
  "female-energy audiopraktika disclaimer",
);
assert(
  femaleEnergyArticle.faq.length === 4,
  "female-energy faq count",
);
assert(
  femaleEnergyArticle.faq[0]?.question.startsWith("### "),
  "female-energy faq first question uses ### prefix",
);
assert(
  femaleEnergyArticle.afterFinalAudio?.[0]?.href ===
    "/articles/kak-razvit-lyubov-k-sebe",
  "female-energy priority link to love-to-self",
);
assert(
  femaleEnergyArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhenskaya-sila",
  ) &&
    femaleEnergyArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/zhenskaya-sila",
    ),
  "female-energy reverse-links to zhenskaya-sila",
);
assert(
  listArticleSlugs().includes("kak-napolnitsya-zhenskoy-energiey"),
  "female-energy in slug list",
);
assert(
  !JSON.stringify(femaleEnergyArticle).includes("—"),
  "female-energy uses medium dash not em dash",
);
assert(
  article.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-napolnitsya-zhenskoy-energiey",
  ) ||
    article.seeAlsoLinks.some(
      (item) => item.href === "/articles/kak-napolnitsya-zhenskoy-energiey",
    ),
  "love-to-self reverse-links to female-energy",
);
assert(
  gratitudeAbundanceArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-napolnitsya-zhenskoy-energiey",
  ) ||
    gratitudeAbundanceArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/kak-napolnitsya-zhenskoy-energiey",
    ),
  "gratitude-abundance reverse-links to female-energy",
);
assert(
  scarcityStateArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-napolnitsya-zhenskoy-energiey",
  ) ||
    scarcityStateArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/kak-napolnitsya-zhenskoy-energiey",
    ),
  "scarcity-state reverse-links to female-energy",
);

const ageAcceptanceArticle = getArticleBySlug("kak-prinyat-svoy-vozrast");
assert(ageAcceptanceArticle, "age-acceptance article registered");
assert(
  ageAcceptanceArticle.title ===
    "Как принять свой возраст и спокойнее относиться к возрастным изменениям",
  "age-acceptance H1",
);
assert(
  ageAcceptanceArticle.topicSlug === "besplatnye-meditatsii",
  "age-acceptance free hub",
);
assert(
  ageAcceptanceArticle.primaryPractice.practiceKey === "elixir-molodosti",
  "age-acceptance practice elixir",
);
assert(
  ageAcceptanceArticle.sections
    .find((section) => section.id === "audiopraktika")
    ?.paragraphs.some(
      (paragraph) =>
        paragraph.includes("не предназначена") &&
        paragraph.includes("омоложения"),
    ),
  "age-acceptance audiopraktika non-rejuvenation disclaimer",
);
assert(ageAcceptanceArticle.faq.length === 4, "age-acceptance faq count");
assert(
  ageAcceptanceArticle.faq[0]?.question.startsWith("### "),
  "age-acceptance faq first question uses ### prefix",
);
assert(
  ageAcceptanceArticle.afterFinalAudio?.[0]?.href ===
    "/articles/kak-razvit-lyubov-k-sebe",
  "age-acceptance priority link to love-to-self",
);
assert(
  ageAcceptanceArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhenskaya-sila",
  ) &&
    ageAcceptanceArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/zhenskaya-sila",
    ),
  "age-acceptance reverse-links to zhenskaya-sila",
);
assert(
  listArticleSlugs().includes("kak-prinyat-svoy-vozrast"),
  "age-acceptance in slug list",
);
assert(
  !JSON.stringify(ageAcceptanceArticle).includes("—"),
  "age-acceptance uses medium dash not em dash",
);
assert(
  article.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-prinyat-svoy-vozrast",
  ) ||
    article.seeAlsoLinks.some(
      (item) => item.href === "/articles/kak-prinyat-svoy-vozrast",
    ),
  "love-to-self reverse-links to age-acceptance",
);
assert(
  gratitudeAbundanceArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-prinyat-svoy-vozrast",
  ) ||
    gratitudeAbundanceArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/kak-prinyat-svoy-vozrast",
    ),
  "gratitude-abundance reverse-links to age-acceptance",
);
assert(
  scarcityStateArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-prinyat-svoy-vozrast",
  ) ||
    scarcityStateArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/kak-prinyat-svoy-vozrast",
    ),
  "scarcity-state reverse-links to age-acceptance",
);

const womanMoneyPsychologyArticle = getArticleBySlug(
  "zhenshchina-i-dengi-psihologiya",
);
assert(womanMoneyPsychologyArticle, "woman-money-psychology article registered");
assert(
  womanMoneyPsychologyArticle.title ===
    "Женщина и деньги: психология отношения к финансам и финансовым решениям",
  "woman-money-psychology H1",
);
assert(
  womanMoneyPsychologyArticle.breadcrumbTitle === "Женщина и деньги",
  "woman-money-psychology breadcrumb",
);
assert(
  womanMoneyPsychologyArticle.metaTitle ===
    "Женщина и деньги – психология отношения к финансам | АудиоЛад",
  "woman-money-psychology SEO title",
);
assert(
  womanMoneyPsychologyArticle.topicSlug === "besplatnye-meditatsii",
  "woman-money-psychology free hub",
);
assert(
  womanMoneyPsychologyArticle.primaryPractice.practiceKey === "zhenskie-dengi",
  "woman-money-psychology practice zhenskie-dengi",
);
assert(
  womanMoneyPsychologyArticle.primaryPracticeIntro.includes("Женские деньги"),
  "woman-money-psychology practice intro",
);
assert(
  womanMoneyPsychologyArticle.sections
    .find((section) => section.id === "audiopraktika")
    ?.paragraphs.some((paragraph) =>
      paragraph.includes("не увеличивает доход автоматически"),
    ),
  "woman-money-psychology practice disclaimer",
);
assert(
  womanMoneyPsychologyArticle.brandNote?.includes("финансовую грамотность"),
  "woman-money-psychology brand note",
);
assert(womanMoneyPsychologyArticle.faq.length === 4, "woman-money-psychology faq count");
assert(
  womanMoneyPsychologyArticle.faq[0]?.question.startsWith("### "),
  "woman-money-psychology faq first question uses ### prefix",
);
assert(
  womanMoneyPsychologyArticle.afterFinalAudio?.[0]?.href ===
    "/articles/denezhnoe-myshlenie",
  "woman-money-psychology priority link to money-thinking",
);
assert(
  womanMoneyPsychologyArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/denezhnye-ustanovki",
  ),
  "woman-money-psychology links to money-beliefs",
);
assert(
  womanMoneyPsychologyArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-prinimat-dengi",
  ),
  "woman-money-psychology links to accept-money",
);
assert(
  womanMoneyPsychologyArticle.seeAlsoLinks.some(
    (item) => item.href === "/topics/besplatnye-meditatsii",
  ),
  "woman-money-psychology see-also includes hub",
);
assert(
  listArticleSlugs().includes("zhenshchina-i-dengi-psihologiya"),
  "woman-money-psychology in slug list",
);
assert(
  !JSON.stringify(womanMoneyPsychologyArticle).includes("—"),
  "woman-money-psychology uses medium dash not em dash",
);
assert(
  moneyThinkingArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhenshchina-i-dengi-psihologiya",
  ),
  "money-thinking reverse-links to woman-money-psychology",
);
assert(
  getArticleBySlug("denezhnye-ustanovki")?.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhenshchina-i-dengi-psihologiya",
  ),
  "money-beliefs reverse-links to woman-money-psychology",
);
assert(
  getArticleBySlug("kak-izmenit-otnoshenie-k-dengam")?.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhenshchina-i-dengi-psihologiya",
  ),
  "change-money-attitude reverse-links to woman-money-psychology",
);
assert(
  fearSpendOnSelfArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhenshchina-i-dengi-psihologiya",
  ),
  "fear-spend reverse-links to woman-money-psychology",
);
assert(
  acceptMoneyArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhenshchina-i-dengi-psihologiya",
  ),
  "accept-money reverse-links to woman-money-psychology",
);
assert(
  moneyWorryArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhenshchina-i-dengi-psihologiya",
  ),
  "money-worry reverse-links to woman-money-psychology",
);
assert(
  getArticleBySlug("kak-perestat-ekonomit-na-sebe")?.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhenshchina-i-dengi-psihologiya",
  ),
  "stop-saving-on-self reverse-links to woman-money-psychology",
);

const femaleStrengthArticle = getArticleBySlug("zhenskaya-sila");
assert(femaleStrengthArticle, "female-strength article registered");
assert(
  femaleStrengthArticle.title ===
    "Женская сила: что обычно понимают под этим понятием и как она проявляется в жизни",
  "female-strength H1",
);
assert(
  femaleStrengthArticle.breadcrumbTitle === "Женская сила",
  "female-strength breadcrumb",
);
assert(
  femaleStrengthArticle.metaTitle ===
    "Женская сила – что это такое и как она проявляется | АудиоЛад",
  "female-strength SEO title",
);
assert(
  femaleStrengthArticle.topicSlug === "besplatnye-meditatsii",
  "female-strength free hub",
);
assert(
  femaleStrengthArticle.primaryPractice.practiceKey === "zhenskaya-energiya",
  "female-strength practice zhenskaya-energiya",
);
assert(
  femaleStrengthArticle.primaryPracticeIntro.includes("Женская энергия"),
  "female-strength practice intro",
);
assert(
  femaleStrengthArticle.sections
    .find((section) => section.id === "audiopraktika")
    ?.paragraphs.some((paragraph) =>
      paragraph.includes("не гарантирует успеха"),
    ),
  "female-strength audiopraktika disclaimer",
);
assert(femaleStrengthArticle.faq.length === 4, "female-strength faq count");
assert(
  femaleStrengthArticle.faq[0]?.question.startsWith("### "),
  "female-strength faq first question uses ### prefix",
);
assert(
  femaleStrengthArticle.afterFinalAudio?.[0]?.href ===
    "/articles/kak-razvit-lyubov-k-sebe",
  "female-strength priority link to love-to-self",
);
assert(
  femaleStrengthArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-napolnitsya-zhenskoy-energiey",
  ),
  "female-strength links to female-energy article",
);
assert(
  femaleStrengthArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/blagodarnost-i-izobilie",
  ),
  "female-strength links to gratitude-abundance",
);
assert(
  femaleStrengthArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-vyyti-iz-sostoyaniya-nehvatki",
  ),
  "female-strength links to scarcity-state",
);
assert(
  !femaleStrengthArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhenskaya-energiya",
  ) &&
    !femaleStrengthArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/zhenskaya-energiya",
    ),
  "female-strength has no links to unpublished zhenskaya-energiya article",
);
assert(
  femaleStrengthArticle.seeAlsoLinks.some(
    (item) => item.href === "/topics/besplatnye-meditatsii",
  ),
  "female-strength see-also includes hub",
);
assert(
  listArticleSlugs().includes("zhenskaya-sila"),
  "female-strength in slug list",
);
assert(
  !JSON.stringify(femaleStrengthArticle).includes("—"),
  "female-strength uses medium dash not em dash",
);
assert(
  article.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhenskaya-sila",
  ) ||
    article.seeAlsoLinks.some(
      (item) => item.href === "/articles/zhenskaya-sila",
    ),
  "love-to-self reverse-links to female-strength",
);
assert(
  gratitudeAbundanceArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhenskaya-sila",
  ) ||
    gratitudeAbundanceArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/zhenskaya-sila",
    ),
  "gratitude-abundance reverse-links to female-strength",
);

const femaleEnergyMeditationArticle = getArticleBySlug(
  "meditatsiya-na-zhenskuyu-energiyu",
);
assert(
  femaleEnergyMeditationArticle,
  "female-energy-meditation article registered",
);
assert(
  femaleEnergyMeditationArticle.title ===
    "Медитация на женскую энергию: как провести практику спокойно и без завышенных ожиданий",
  "female-energy-meditation H1",
);
assert(
  femaleEnergyMeditationArticle.breadcrumbTitle ===
    "Медитация на женскую энергию",
  "female-energy-meditation breadcrumb",
);
assert(
  femaleEnergyMeditationArticle.metaTitle ===
    "Медитация на женскую энергию – как выполнять практику | АудиоЛад",
  "female-energy-meditation SEO title",
);
assert(
  femaleEnergyMeditationArticle.topicSlug === "besplatnye-meditatsii",
  "female-energy-meditation free hub",
);
assert(
  femaleEnergyMeditationArticle.primaryPractice.practiceKey ===
    "zhenskaya-energiya",
  "female-energy-meditation practice zhenskaya-energiya",
);
assert(
  femaleEnergyMeditationArticle.primaryPracticeIntro.includes("Женская энергия"),
  "female-energy-meditation practice intro",
);
assert(
  femaleEnergyMeditationArticle.sections
    .find((section) => section.id === "audiopraktika")
    ?.paragraphs.some((paragraph) =>
      paragraph.includes("не гарантирует улучшения"),
    ),
  "female-energy-meditation audiopraktika disclaimer",
);
assert(
  femaleEnergyMeditationArticle.faq.length === 5,
  "female-energy-meditation faq count",
);
assert(
  femaleEnergyMeditationArticle.faq[0]?.question.startsWith("### "),
  "female-energy-meditation faq first question uses ### prefix",
);
assert(
  femaleEnergyMeditationArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-napolnitsya-zhenskoy-energiey",
  ),
  "female-energy-meditation links to female-energy article",
);
assert(
  femaleEnergyMeditationArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhenskaya-sila",
  ),
  "female-energy-meditation links to female-strength",
);
assert(
  femaleEnergyMeditationArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-razvit-lyubov-k-sebe",
  ),
  "female-energy-meditation links to love-to-self",
);
assert(
  !femaleEnergyMeditationArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhenskaya-energiya",
  ) &&
    !femaleEnergyMeditationArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/zhenskaya-energiya",
    ),
  "female-energy-meditation has no links to unpublished zhenskaya-energiya article",
);
assert(
  femaleEnergyMeditationArticle.seeAlsoLinks.some(
    (item) => item.href === "/topics/besplatnye-meditatsii",
  ),
  "female-energy-meditation see-also includes hub",
);
assert(
  listArticleSlugs().includes("meditatsiya-na-zhenskuyu-energiyu"),
  "female-energy-meditation in slug list",
);
assert(
  !JSON.stringify(femaleEnergyMeditationArticle).includes("—"),
  "female-energy-meditation uses medium dash not em dash",
);
assert(
  femaleEnergyArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/meditatsiya-na-zhenskuyu-energiyu",
  ) ||
    femaleEnergyArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/meditatsiya-na-zhenskuyu-energiyu",
    ),
  "female-energy reverse-links to female-energy-meditation",
);
assert(
  femaleStrengthArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/meditatsiya-na-zhenskuyu-energiyu",
  ) ||
    femaleStrengthArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/meditatsiya-na-zhenskuyu-energiyu",
    ),
  "female-strength reverse-links to female-energy-meditation",
);
assert(
  article.afterFinalAudio?.some(
    (item) => item.href === "/articles/meditatsiya-na-zhenskuyu-energiyu",
  ) ||
    article.seeAlsoLinks.some(
      (item) => item.href === "/articles/meditatsiya-na-zhenskuyu-energiyu",
    ),
  "love-to-self reverse-links to female-energy-meditation",
);

const femaleEnergyWhatIsArticle = getArticleBySlug("zhenskaya-energiya-chto-eto");
assert(femaleEnergyWhatIsArticle, "female-energy-what-is article registered");
assert(
  femaleEnergyWhatIsArticle.title ===
    "Женская энергия: что обычно понимают под этим выражением",
  "female-energy-what-is H1",
);
assert(
  femaleEnergyWhatIsArticle.breadcrumbTitle === "Женская энергия",
  "female-energy-what-is breadcrumb",
);
assert(
  femaleEnergyWhatIsArticle.metaTitle ===
    "Женская энергия – что это такое простыми словами | АудиоЛад",
  "female-energy-what-is SEO title",
);
assert(
  femaleEnergyWhatIsArticle.topicSlug === "besplatnye-meditatsii",
  "female-energy-what-is free hub",
);
assert(
  femaleEnergyWhatIsArticle.primaryPractice.practiceKey === "zhenskaya-energiya",
  "female-energy-what-is practice zhenskaya-energiya",
);
assert(
  femaleEnergyWhatIsArticle.primaryPracticeIntro.includes("Женская энергия"),
  "female-energy-what-is practice intro",
);
assert(
  femaleEnergyWhatIsArticle.sections
    .find((section) => section.id === "audiopraktika")
    ?.paragraphs.some((paragraph) =>
      paragraph.includes("не создаёт гарантированного результата"),
    ),
  "female-energy-what-is audiopraktika disclaimer",
);
assert(femaleEnergyWhatIsArticle.faq.length === 6, "female-energy-what-is faq count");
assert(
  femaleEnergyWhatIsArticle.faq[0]?.question.startsWith("### "),
  "female-energy-what-is faq first question uses ### prefix",
);
assert(
  femaleEnergyWhatIsArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/meditatsiya-na-zhenskuyu-energiyu",
  ),
  "female-energy-what-is links to female-energy-meditation",
);
assert(
  femaleEnergyWhatIsArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-napolnitsya-zhenskoy-energiey",
  ),
  "female-energy-what-is links to how-to-fill female-energy",
);
assert(
  femaleEnergyWhatIsArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhenskaya-sila",
  ),
  "female-energy-what-is links to female-strength",
);
assert(
  femaleEnergyWhatIsArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-razvit-lyubov-k-sebe",
  ),
  "female-energy-what-is links to love-to-self",
);
assert(
  !femaleEnergyWhatIsArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhenskaya-energiya",
  ) &&
    !femaleEnergyWhatIsArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/zhenskaya-energiya",
    ),
  "female-energy-what-is has no links to bare unpublished zhenskaya-energiya slug",
);
assert(
  femaleEnergyWhatIsArticle.seeAlsoLinks.some(
    (item) => item.href === "/topics/besplatnye-meditatsii",
  ),
  "female-energy-what-is see-also includes hub",
);
assert(
  listArticleSlugs().includes("zhenskaya-energiya-chto-eto"),
  "female-energy-what-is in slug list",
);
assert(
  !JSON.stringify(femaleEnergyWhatIsArticle).includes("—"),
  "female-energy-what-is uses medium dash not em dash",
);
assert(
  femaleEnergyMeditationArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhenskaya-energiya-chto-eto",
  ) ||
    femaleEnergyMeditationArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/zhenskaya-energiya-chto-eto",
    ),
  "female-energy-meditation reverse-links to female-energy-what-is",
);
assert(
  femaleEnergyArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhenskaya-energiya-chto-eto",
  ) ||
    femaleEnergyArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/zhenskaya-energiya-chto-eto",
    ),
  "female-energy reverse-links to female-energy-what-is",
);
assert(
  femaleStrengthArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhenskaya-energiya-chto-eto",
  ) ||
    femaleStrengthArticle.seeAlsoLinks.some(
      (item) => item.href === "/articles/zhenskaya-energiya-chto-eto",
    ),
  "female-strength reverse-links to female-energy-what-is",
);
assert(
  article.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhenskaya-energiya-chto-eto",
  ) ||
    article.seeAlsoLinks.some(
      (item) => item.href === "/articles/zhenskaya-energiya-chto-eto",
    ),
  "love-to-self reverse-links to female-energy-what-is",
);

const divorceChildArticle = getArticleBySlug("rebenok-i-razvod-roditeley");
assert(divorceChildArticle, "divorce-child article registered");
assert(
  divorceChildArticle.title ===
    "Ребёнок и развод родителей: как помочь ему пройти через перемены",
  "divorce-child H1",
);
assert(
  divorceChildArticle.metaTitle ===
    "Ребёнок и развод родителей: как помочь пережить перемены – АудиоЛад",
  "divorce-child meta title",
);
assert(
  divorceChildArticle.metaDescription ===
    "Как ребёнок переживает развод родителей, почему может винить себя, что помогает сохранить чувство безопасности и когда стоит обратиться за профессиональной помощью.",
  "divorce-child meta description",
);
assert(
  divorceChildArticle.primaryPractice.practiceKey ===
    "razvod-yasnost-i-spokoystvie",
  "divorce-child primary practice",
);
assert(
  divorceChildArticle.relatedPractices.length === 0,
  "divorce-child has one practice",
);
assert(
  divorceChildArticle.finalAudioLead === "" &&
    !divorceChildArticle.sections.some((section) => section.id === "audiopraktika"),
  "divorce-child renders one player",
);
assert(
  divorceChildArticle.topicSlug === "pending-hub-reconciliation" &&
    divorceChildArticle.topicHref === "/articles",
  "divorce-child leaves hub pending without a new hub",
);
assert(
  divorceChildArticle.faq.length === 6,
  "divorce-child FAQ",
);
assert(
  divorceChildArticle.sections.some((section) =>
    section.links?.some(
      (item) => item.href === "/articles/kak-skazat-rebenku-o-razvode-roditeley",
    ),
  ) &&
    divorceChildArticle.sections.some((section) =>
      section.links?.some(
        (item) => item.href === "/articles/kak-pomoch-rebenku-perezhit-razvod-roditeley",
      ),
    ) &&
    divorceChildArticle.sections
      .find((section) => section.id === "praktika-razvod-yasnost-i-spokoystvie")
      ?.links?.some(
        (item) =>
          item.href ===
          "/practice/sergey-and-zoya/razvod-yasnost-i-spokoystvie",
      ),
  "divorce-child renders approved article and canonical practice links in sections",
);
assert(
  JSON.stringify(divorceChildArticle).includes(
    "Ребёнок не является причиной развода",
  ) &&
    JSON.stringify(divorceChildArticle).includes(
      "При насилии или угрозах приоритетом должна быть безопасность",
    ) &&
    JSON.stringify(divorceChildArticle).includes(
      "Практика не меняет состояние ребёнка напрямую",
    ),
  "divorce-child preserves required safety boundaries",
);

const divorceDecisionArticle = getArticleBySlug("kak-reshitsya-na-razvod");
assert(divorceDecisionArticle, "divorce-decision article registered");
assert(
  divorceDecisionArticle.title ===
    "Как решиться на развод, если страшно изменить жизнь",
  "divorce-decision H1",
);
assert(
  divorceDecisionArticle.metaTitle ===
    "Как решиться на развод, если страшно изменить жизнь – АудиоЛад",
  "divorce-decision meta title",
);
assert(
  divorceDecisionArticle.metaDescription ===
    "Как решиться на развод, если мешают страх, вина и неопределённость: как оценить отношения, последствия решения и определить следующий безопасный шаг.",
  "divorce-decision meta description",
);
assert(
  divorceDecisionArticle.primaryPractice.practiceKey ===
    "razvod-yasnost-i-spokoystvie",
  "divorce-decision canonical practice key",
);
assert(
  divorceDecisionArticle.relatedPractices.length === 0 &&
    divorceDecisionArticle.finalAudioLead === "",
  "divorce-decision renders one player",
);
assert(
  divorceDecisionArticle.topicSlug === "pending-hub-reconciliation" &&
    divorceDecisionArticle.topicHref === "/articles",
  "divorce-decision leaves hub pending without a new hub",
);
assert(
  divorceDecisionArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/rebenok-i-razvod-roditeley",
  ),
  "divorce-decision links to child divorce article",
);
assert(
  divorceDecisionArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-ponyat-chto-pora-razvoditsya",
  ),
  "divorce-decision links to divorce assessment article",
);
assert(divorceDecisionArticle.faq.length === 6, "divorce-decision FAQ");
assert(
  JSON.stringify(divorceDecisionArticle).includes(
    "Практика не определяет, нужно ли сохранять брак или завершать его",
  ) &&
    JSON.stringify(divorceDecisionArticle).includes(
      "приоритетом становится безопасность",
    ),
  "divorce-decision preserves decision and safety boundaries",
);

const divorceAssessmentArticle = getArticleBySlug(
  "kak-ponyat-chto-pora-razvoditsya",
);
assert(divorceAssessmentArticle, "divorce-assessment article registered");
assert(
  divorceAssessmentArticle.title ===
    "Как понять, что пора разводиться: вопросы, которые помогут увидеть ситуацию яснее",
  "divorce-assessment H1",
);
assert(
  divorceAssessmentArticle.metaTitle ===
    "Как понять, что пора разводиться с мужем или женой – АудиоЛад",
  "divorce-assessment meta title",
);
assert(
  divorceAssessmentArticle.primaryPractice.practiceKey ===
    "razvod-yasnost-i-spokoystvie",
  "divorce-assessment canonical practice",
);
assert(
  divorceAssessmentArticle.relatedPractices.length === 0 &&
    divorceAssessmentArticle.finalAudioLead === "",
  "divorce-assessment renders one player",
);
assert(
  divorceAssessmentArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-reshitsya-na-razvod",
  ) &&
    divorceAssessmentArticle.afterFinalAudio?.some(
      (item) => item.href === "/articles/rebenok-i-razvod-roditeley",
    ),
  "divorce-assessment has approved article links",
);
assert(
  divorceAssessmentArticle.topicSlug === "pending-hub-reconciliation" &&
    divorceAssessmentArticle.topicHref === "/articles" &&
    divorceAssessmentArticle.faq.length === 6,
  "divorce-assessment keeps pending hub and FAQ",
);

const childConversationArticle = getArticleBySlug(
  "kak-skazat-rebenku-o-razvode-roditeley",
);
assert(childConversationArticle, "child-conversation article registered");
assert(
  childConversationArticle.title ===
    "Как сказать ребёнку о разводе родителей: что и как говорить",
  "child-conversation H1",
);
assert(
  childConversationArticle.metaTitle ===
    "Как сказать ребёнку о разводе родителей – что и как говорить – АудиоЛад",
  "child-conversation meta title",
);
assert(
  childConversationArticle.primaryPractice.practiceKey ===
    "razvod-yasnost-i-spokoystvie" &&
    childConversationArticle.relatedPractices.length === 0 &&
    childConversationArticle.finalAudioLead === "",
  "child-conversation has canonical practice and one player",
);
assert(
  childConversationArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/rebenok-i-razvod-roditeley",
  ) &&
    childConversationArticle.faq.length === 8,
  "child-conversation has approved link and FAQ",
);
assert(
  divorceChildArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-skazat-rebenku-o-razvode-roditeley",
  ),
  "child-divorce article links to child-conversation article",
);

const childSupportArticle = getArticleBySlug(
  "kak-pomoch-rebenku-perezhit-razvod-roditeley",
);
assert(childSupportArticle, "child-support article registered");
assert(
  childSupportArticle.title ===
    "Как помочь ребёнку пережить развод родителей",
  "child-support H1",
);
assert(
  childSupportArticle.metaTitle ===
    "Как помочь ребёнку пережить развод родителей – АудиоЛад",
  "child-support meta title",
);
assert(
  childSupportArticle.primaryPractice.practiceKey ===
    "razvod-yasnost-i-spokoystvie" &&
    childSupportArticle.relatedPractices.length === 0 &&
    childSupportArticle.finalAudioLead === "",
  "child-support has canonical practice and one player",
);
assert(
  childSupportArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/rebenok-i-razvod-roditeley",
  ) &&
    childSupportArticle.afterFinalAudio?.some(
      (item) =>
        item.href === "/articles/kak-skazat-rebenku-o-razvode-roditeley",
    ) &&
    childSupportArticle.faq.length === 7,
  "child-support has approved links and FAQ",
);
assert(
  childSupportArticle.topicSlug === "pending-hub-reconciliation" &&
    childSupportArticle.topicHref === "/articles",
  "child-support keeps pending hub",
);

const lifeAfterDivorceArticle = getArticleBySlug("zhizn-posle-razvoda");
assert(lifeAfterDivorceArticle, "life-after-divorce article registered");
assert(
  lifeAfterDivorceArticle.title ===
    "Жизнь после развода: как принять перемены и двигаться дальше",
  "life-after-divorce H1",
);
assert(
  lifeAfterDivorceArticle.metaTitle ===
    "Жизнь после развода: как привыкнуть к переменам и жить дальше – АудиоЛад",
  "life-after-divorce meta title",
);
assert(
  lifeAfterDivorceArticle.primaryPractice.practiceKey ===
    "vozvraschenie-k-sebe-posle-razvoda" &&
    lifeAfterDivorceArticle.relatedPractices.length === 0 &&
    lifeAfterDivorceArticle.finalAudioLead === "",
  "life-after-divorce has canonical practice and one player",
);
assert(
  lifeAfterDivorceArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-reshitsya-na-razvod",
  ) &&
    lifeAfterDivorceArticle.afterFinalAudio?.some(
      (item) => item.href === "/articles/kak-otpustit-proshloe",
    ) &&
    lifeAfterDivorceArticle.faq.length === 7,
  "life-after-divorce has approved links and FAQ",
);
assert(
  lifeAfterDivorceArticle.topicSlug === "pending-hub-reconciliation" &&
    lifeAfterDivorceArticle.topicHref === "/articles",
  "life-after-divorce keeps pending hub",
);

const surviveDivorceArticle = getArticleBySlug("kak-perezhit-razvod");
assert(surviveDivorceArticle, "survive-divorce article registered");
assert(
  surviveDivorceArticle.title ===
    "Как пережить развод и постепенно вернуться к себе",
  "survive-divorce H1",
);
assert(
  surviveDivorceArticle.metaTitle ===
    "Как пережить развод и постепенно вернуться к себе – АудиоЛад",
  "survive-divorce meta title",
);
assert(
  surviveDivorceArticle.primaryPractice.practiceKey ===
    "vozvraschenie-k-sebe-posle-razvoda" &&
    surviveDivorceArticle.relatedPractices.length === 0 &&
    surviveDivorceArticle.finalAudioLead === "",
  "survive-divorce has canonical practice and one player",
);
assert(
  surviveDivorceArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhizn-posle-razvoda",
  ) &&
    surviveDivorceArticle.afterFinalAudio?.some(
      (item) => item.href === "/articles/kak-otpustit-proshloe",
    ) &&
    !surviveDivorceArticle.afterFinalAudio?.some(
      (item) => item.href === "/articles/kak-reshitsya-na-razvod",
    ) &&
    surviveDivorceArticle.faq.length === 7,
  "survive-divorce has approved live links without forced decision link",
);
assert(
  surviveDivorceArticle.topicSlug === "pending-hub-reconciliation" &&
    surviveDivorceArticle.topicHref === "/articles",
  "survive-divorce keeps pending hub",
);

const surviveDivorceHusbandArticle = getArticleBySlug(
  "kak-perezhit-razvod-s-muzhem",
);
assert(surviveDivorceHusbandArticle, "survive-divorce-husband article registered");
assert(
  surviveDivorceHusbandArticle.title ===
    "Как пережить развод с мужем, которого всё ещё любишь",
  "survive-divorce-husband H1",
);
assert(
  surviveDivorceHusbandArticle.metaTitle ===
    "Как пережить развод с мужем, которого всё ещё любишь – АудиоЛад",
  "survive-divorce-husband meta title",
);
assert(
  surviveDivorceHusbandArticle.primaryPractice.practiceKey ===
    "vozvraschenie-k-sebe-posle-razvoda" &&
    surviveDivorceHusbandArticle.relatedPractices.length === 0 &&
    surviveDivorceHusbandArticle.finalAudioLead === "",
  "survive-divorce-husband has canonical practice and one player",
);
assert(
  surviveDivorceHusbandArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/zhizn-posle-razvoda",
  ) &&
    surviveDivorceHusbandArticle.afterFinalAudio?.some(
      (item) => item.href === "/articles/kak-perezhit-razvod",
    ) &&
    surviveDivorceHusbandArticle.faq.length === 7,
  "survive-divorce-husband has approved recovery links and FAQ",
);

const newLifeAfterDivorceArticle = getArticleBySlug(
  "novaya-zhizn-posle-razvoda",
);
assert(newLifeAfterDivorceArticle, "new-life-after-divorce article registered");
assert(
  newLifeAfterDivorceArticle.title ===
    "Новая жизнь после развода: как начать следующий этап",
  "new-life-after-divorce H1",
);
assert(
  newLifeAfterDivorceArticle.metaTitle ===
    "Новая жизнь после развода: как начать следующий этап – АудиоЛад",
  "new-life-after-divorce meta title",
);
assert(
  newLifeAfterDivorceArticle.primaryPractice.practiceKey ===
    "vozvraschenie-k-sebe-posle-razvoda" &&
    newLifeAfterDivorceArticle.relatedPractices.length === 0 &&
    newLifeAfterDivorceArticle.finalAudioLead === "",
  "new-life-after-divorce has canonical practice and one player",
);
assert(
  newLifeAfterDivorceArticle.afterFinalAudio?.some(
    (item) => item.href === "/articles/kak-perezhit-razvod",
  ) &&
    newLifeAfterDivorceArticle.afterFinalAudio?.some(
      (item) => item.href === "/articles/zhizn-posle-razvoda",
    ) &&
    newLifeAfterDivorceArticle.faq.length === 7,
  "new-life-after-divorce has approved recovery links and FAQ",
);
const newRelationshipsAfterDivorceArticle = getArticleBySlug(
  "novye-otnosheniya-posle-razvoda",
);
assert(
  newRelationshipsAfterDivorceArticle?.title ===
    "Новые отношения после развода: когда и как начинать",
  "new-relationships-after-divorce H1",
);
assert(
  newRelationshipsAfterDivorceArticle?.primaryPractice.practiceKey ===
    "vozvraschenie-k-sebe-posle-razvoda" &&
    newRelationshipsAfterDivorceArticle.afterFinalAudio?.some(
      (item) => item.href === "/articles/novaya-zhizn-posle-razvoda",
    ) &&
    newRelationshipsAfterDivorceArticle.afterFinalAudio?.some(
      (item) => item.href === "/articles/kak-perezhit-razvod",
    ) &&
    newRelationshipsAfterDivorceArticle.faq.length === 8,
  "new-relationships-after-divorce keeps canonical practice and approved links",
);
assert(
  surviveDivorceHusbandArticle.topicSlug === "pending-hub-reconciliation" &&
    surviveDivorceHusbandArticle.topicHref === "/articles",
  "survive-divorce-husband keeps pending hub",
);

const exSpouseAfterDivorceArticle = getArticleBySlug(
  "otnosheniya-s-byvshim-posle-razvoda",
);
assert(exSpouseAfterDivorceArticle, "ex-spouse-after-divorce article registered");
assert(
  exSpouseAfterDivorceArticle.title ===
    "Отношения с бывшим супругом после развода: как общаться и сохранить границы",
  "ex-spouse-after-divorce H1",
);
assert(
  exSpouseAfterDivorceArticle.leadBeforeAudio ===
    "После развода супружеские отношения заканчиваются, но взаимодействие иногда продолжается. Могут оставаться общие дети, документы, имущество, финансовые и бытовые вопросы или другие причины периодически общаться." &&
    exSpouseAfterDivorceArticle.shortAnswer.length > 0 &&
    !exSpouseAfterDivorceArticle.leadBeforeAudio.startsWith("#") &&
    !exSpouseAfterDivorceArticle.shortAnswer.startsWith("#") &&
    !exSpouseAfterDivorceArticle.introAfterAudio.includes(
      exSpouseAfterDivorceArticle.leadBeforeAudio,
    ),
  "ex-spouse-after-divorce keeps one lead and a non-empty non-Markdown short answer",
);
assert(
  exSpouseAfterDivorceArticle.primaryPractice.practiceKey ===
    "vozvraschenie-k-sebe-posle-razvoda" &&
    exSpouseAfterDivorceArticle.relatedPractices.length === 0 &&
    exSpouseAfterDivorceArticle.finalAudioLead === "" &&
    exSpouseAfterDivorceArticle.afterFinalAudio?.some(
      (item) => item.href === "/articles/rebenok-i-razvod-roditeley",
    ) &&
    exSpouseAfterDivorceArticle.afterFinalAudio?.some(
      (item) => item.href === "/articles/kak-otpustit-byvshego-muzha",
    ) &&
    exSpouseAfterDivorceArticle.faq.length === 7,
  "ex-spouse-after-divorce has one player, approved links, and FAQ",
);
assert(
  exSpouseAfterDivorceArticle.closingSection.title === "Финальный CTA" &&
    exSpouseAfterDivorceArticle.closingSection.paragraphs[0] ===
      "Если перед разговором с бывшим супругом вы заранее чувствуете напряжение и внутри уже начинается старый спор, можно сначала обратиться к практике «Возвращение к себе после развода».",
  "ex-spouse-after-divorce keeps its final block content",
);
assert(
  ["Финальный CTA", "Final CTA", "afterFinalAudio", "after final audio"].every(
    (technicalTitle) =>
      resolveArticleClosingHeading(technicalTitle) === "Главное",
  ) && resolveArticleClosingHeading("Итог") === "Итог",
  "technical closing titles never reach public article headings",
);
const maleLifeAfterDivorceArticle = getArticleBySlug(
  "zhizn-muzhchiny-posle-razvoda",
);
assert(maleLifeAfterDivorceArticle, "male-life-after-divorce article registered");
assert(
  maleLifeAfterDivorceArticle.title ===
    "Жизнь мужчины после развода: как перестроиться и идти дальше" &&
    maleLifeAfterDivorceArticle.metaTitle ===
      "Жизнь мужчины после развода: как жить дальше – АудиоЛад" &&
    maleLifeAfterDivorceArticle.shortAnswer ===
      "Жизнь мужчины после развода постепенно перестраивается вокруг нового быта, свободного времени, отношений с детьми, друзей, работы и собственных планов. Не нужно устраивать всю жизнь сразу – устойчивый новый ритм обычно складывается из небольших практических изменений.",
  "male-life-after-divorce keeps approved SEO metadata and short answer",
);
assert(
  maleLifeAfterDivorceArticle.primaryPractice.practiceKey ===
    "vozvraschenie-k-sebe-posle-razvoda" &&
    maleLifeAfterDivorceArticle.relatedPractices.length === 0 &&
    maleLifeAfterDivorceArticle.finalAudioLead === "" &&
    maleLifeAfterDivorceArticle.introAfterAudioLinks?.some(
      (item) => item.href === "/articles/kak-perezhit-razvod-muzhchine",
    ) &&
    [
      "/articles/rebenok-i-razvod-roditeley",
      "/articles/novye-otnosheniya-posle-razvoda",
      "/articles/novaya-zhizn-posle-razvoda",
    ].every((href) =>
      maleLifeAfterDivorceArticle.sections.some((section) =>
        section.links?.some((item) => item.href === href),
      ),
    ) &&
    maleLifeAfterDivorceArticle.sections.some(
      (section) =>
        section.id === "audiopraktika" &&
        section.titleHref ===
          "/practice/sergey-and-zoya/vozvraschenie-k-sebe-posle-razvoda",
    ),
  "male-life-after-divorce has canonical practice and approved links",
);
assert(
  maleLifeAfterDivorceArticle.faq.length === 7 &&
    maleLifeAfterDivorceArticle.closingSection.title === "Главное",
  "male-life-after-divorce keeps FAQ and public closing heading",
);
const articlePageViewSource = read("src/components/articles/ArticlePageView.tsx");
assert(
  articlePageViewSource.includes("resolveArticleClosingHeading") &&
    !articlePageViewSource.includes("{article.closingSection.title}"),
  "article renderer uses public closing heading",
);
assert(
  articlePageViewSource.includes("introAfterAudioLinks") &&
    articlePageViewSource.includes("section.titleHref"),
  "article renderer supports introductory and section-heading links",
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
