#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  isProductEditorDirty,
  serializeProductEditorBaseline,
} from "../src/lib/author-products/editor-save-state.ts";
import {
  mergeServerProductIntoForm,
  productDetailToFormSnapshot,
} from "../src/lib/author-products/form-merge.ts";
import {
  getProductFieldErrorMessage,
  getProductFieldKeyForError,
  validateSeoDescriptionLength,
  validateSeoPrimaryQueryLength,
  validateSeoTitleLength,
} from "../src/lib/author-products/limits.ts";
import { normalizeClearableTextField } from "../src/lib/author-products/text-fields.ts";
import {
  hasPracticeSeoContentChanges,
  getPracticeSeoUsageHeading,
  parsePracticeSeoContent,
  withPreservedRelatedListenSlugs,
} from "../src/lib/products/practice-seo-content.ts";
import { validateSeoSecondaryQueries } from "../src/lib/author-products/limits.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function practiceDetail(overrides = {}) {
  return {
    practice: {
      id: "11111111-1111-4111-8111-111111111111",
      author_id: "22222222-2222-4222-8222-222222222222",
      title: "Лавандовый сон",
      slug: "lavandovyy-son",
      subtitle: "Вечерняя практика",
      description: "Мягкая медитация для сна.",
      format: "Медитация",
      product_kind: "practice",
      publication_class: "practice",
      music_usage_permission: null,
      duration_minutes: 12,
      price: 0,
      is_free: true,
      is_catalog_listed: true,
      catalog_visibility: "listed",
      cover_url: null,
      use_shared_cover: true,
      audio_url: null,
      status: "draft",
      moderation_status: "not_submitted",
      moderation_attempt: 0,
      moderation_submitted_at: null,
      moderation_review_comment: null,
      deleted_at: null,
      deleted_by: null,
      deletion_reason: null,
      currency: "RUB",
      published_at: null,
      listening_notice_enabled: true,
      listening_notice_title: "Как слушать",
      listening_notice_text: "В наушниках",
      promo_enabled: false,
      promo_title: null,
      promo_text: null,
      promo_button_text: null,
      promo_url: null,
      promo_open_in_new_tab: false,
      seo_primary_query: "медитация для сна",
      seo_title: null,
      seo_description: "Короткое поисковое описание.",
      created_at: "2026-08-29T00:00:00.000Z",
      updated_at: "2026-08-29T00:00:00.000Z",
      ...overrides,
    },
    audio_items: [],
    gallery_slides: [],
    seo_content: {
      usageItems: [],
      faqItems: [],
      relatedPracticeIds: [],
      relatedListenSlugs: [],
    },
    contentLockedAfterSale: false,
    deleteLockedAfterPaidPurchase: false,
  };
}

const snapshot = productDetailToFormSnapshot(practiceDetail());
assert.equal(snapshot.seoPrimaryQuery, "медитация для сна");
assert.equal(snapshot.seoTitle, "");
assert.equal(snapshot.seoDescription, "Короткое поисковое описание.");
assert.deepEqual(snapshot.seoContent.usageItems, []);

const emptySeo = productDetailToFormSnapshot(
  practiceDetail({
    seo_primary_query: null,
    seo_title: null,
    seo_description: null,
  }),
);
assert.equal(emptySeo.seoPrimaryQuery, "");
assert.equal(emptySeo.seoTitle, "");
assert.equal(emptySeo.seoDescription, "");

const local = {
  ...snapshot,
  seoPrimaryQuery: "медитация перед сном",
  seoTitle: "Свой заголовок",
  seoDescription: "Локальное описание",
};
const merged = mergeServerProductIntoForm(
  local,
  practiceDetail({
    seo_primary_query: "серверное значение",
    seo_title: "серверный title",
    seo_description: "серверное описание",
    cover_url: "https://cdn.example/cover.jpg",
    updated_at: "2026-08-29T01:00:00.000Z",
  }),
);
assert.equal(merged.seoPrimaryQuery, "медитация перед сном");
assert.equal(merged.seoTitle, "Свой заголовок");
assert.equal(merged.seoDescription, "Локальное описание");
assert.equal(merged.coverUrl, "https://cdn.example/cover.jpg");

const form = {
  authorId: snapshot.authorId,
  title: snapshot.title,
  subtitle: snapshot.subtitle,
  description: snapshot.description,
  productKind: snapshot.productKind,
  publicationClass: snapshot.publicationClass,
  musicUsagePermission: snapshot.musicUsagePermission,
  formatPreset: snapshot.formatPreset,
  customFormat: snapshot.customFormat,
  slug: snapshot.slug,
  isFree: snapshot.isFree,
  price: snapshot.price,
  catalogVisibility: snapshot.catalogVisibility,
  listeningNoticeEnabled: snapshot.listeningNoticeEnabled,
  listeningNoticeTitle: snapshot.listeningNoticeTitle,
  listeningNoticeText: snapshot.listeningNoticeText,
  promoEnabled: snapshot.promoEnabled,
  promoTitle: snapshot.promoTitle,
  promoText: snapshot.promoText,
  promoButtonText: snapshot.promoButtonText,
  promoUrl: snapshot.promoUrl,
  promoOpenInNewTab: snapshot.promoOpenInNewTab,
  seoPrimaryQuery: snapshot.seoPrimaryQuery,
  seoTitle: snapshot.seoTitle,
  seoDescription: snapshot.seoDescription,
};
const audio = [];
const baseline = serializeProductEditorBaseline(form, audio);
assert.match(baseline, /"seoPrimaryQuery":"медитация для сна"/);
assert.match(baseline, /"seoTitle":""/);
assert.match(baseline, /"seoDescription":"Короткое поисковое описание\."/);
assert.equal(isProductEditorDirty(baseline, baseline), false);
assert.equal(
  isProductEditorDirty(
    serializeProductEditorBaseline(
      { ...form, seoPrimaryQuery: "другой запрос" },
      audio,
    ),
    baseline,
  ),
  true,
);
assert.equal(
  isProductEditorDirty(
    serializeProductEditorBaseline({ ...form, seoTitle: "Новый SEO" }, audio),
    baseline,
  ),
  true,
);
assert.equal(
  isProductEditorDirty(
    serializeProductEditorBaseline(
      { ...form, seoDescription: "Новое описание" },
      audio,
    ),
    baseline,
  ),
  true,
);

const reloaded = serializeProductEditorBaseline(
  productDetailToFormSnapshot(practiceDetail()),
  audio,
);
assert.equal(isProductEditorDirty(reloaded, baseline), false);

assert.equal(normalizeClearableTextField(""), null);
assert.equal(normalizeClearableTextField("   "), null);
assert.equal(normalizeClearableTextField("медитация для сна"), "медитация для сна");

assert.equal(validateSeoPrimaryQueryLength("а".repeat(120)), null);
assert.equal(validateSeoPrimaryQueryLength("а".repeat(121)), "seo_primary_query_too_long");
assert.equal(validateSeoTitleLength("а".repeat(140)), null);
assert.equal(validateSeoTitleLength("а".repeat(141)), "seo_title_too_long");
assert.equal(validateSeoDescriptionLength("а".repeat(300)), null);
assert.equal(validateSeoDescriptionLength("а".repeat(301)), "seo_description_too_long");
assert.equal(
  getProductFieldErrorMessage("seo_primary_query_too_long"),
  "Основной поисковый запрос не должен превышать 120 символов.",
);
assert.equal(
  getProductFieldErrorMessage("seo_title_too_long"),
  "Заголовок для поиска не должен превышать 140 символов.",
);
assert.equal(
  getProductFieldErrorMessage("seo_description_too_long"),
  "Описание для поиска не должно превышать 300 символов.",
);
assert.equal(getProductFieldKeyForError("seo_primary_query_too_long"), "seoPrimaryQuery");
assert.equal(getProductFieldKeyForError("seo_title_too_long"), "seoTitle");
assert.equal(getProductFieldKeyForError("seo_description_too_long"), "seoDescription");

assert.deepEqual(
  parsePracticeSeoContent({
    usage_items: [{ content: "Слушайте в спокойном месте" }],
    faq_items: [{ question: "Нужны ли наушники?", answer: "По желанию." }],
    related_practice_ids: ["33333333-3333-4333-8333-333333333333"],
    related_listen_slugs: ["meditatsiya-na-dengi-slushat-onlayn-besplatno"],
  }),
  {
    usageItems: [{ content: "Слушайте в спокойном месте" }],
    faqItems: [{ question: "Нужны ли наушники?", answer: "По желанию." }],
    relatedPracticeIds: ["33333333-3333-4333-8333-333333333333"],
    relatedListenSlugs: ["meditatsiya-na-dengi-slushat-onlayn-besplatno"],
  },
);
assert.equal(
  parsePracticeSeoContent({
    usage_items: [],
    faq_items: [],
    related_practice_ids: ["11111111-1111-4111-8111-111111111111", "11111111-1111-4111-8111-111111111111"],
    related_listen_slugs: [],
  }),
  null,
);
const canonicalSeoContent = parsePracticeSeoContent({
  usage_items: [{ content: "  Слушайте в спокойном месте  " }, { content: "" }],
  faq_items: [
    { question: "Нужны ли наушники?", answer: "По желанию." },
    { question: "", answer: "" },
  ],
  related_practice_ids: ["33333333-3333-4333-8333-333333333333", ""],
  related_listen_slugs: ["meditatsiya-na-dengi-slushat-onlayn-besplatno", ""],
});
assert.deepEqual(canonicalSeoContent, {
  usageItems: [{ content: "Слушайте в спокойном месте" }],
  faqItems: [{ question: "Нужны ли наушники?", answer: "По желанию." }],
  relatedPracticeIds: ["33333333-3333-4333-8333-333333333333"],
  relatedListenSlugs: ["meditatsiya-na-dengi-slushat-onlayn-besplatno"],
});
assert.equal(hasPracticeSeoContentChanges(canonicalSeoContent, canonicalSeoContent), false);
assert.equal(getPracticeSeoUsageHeading("practice"), "Как использовать практику");
assert.equal(getPracticeSeoUsageHeading("music"), "Как слушать музыку");
assert.equal(getPracticeSeoUsageHeading("audio_post"), "Как использовать");
assert.equal(validateSeoSecondaryQueries(["сон", "СОН"]), "seo_secondary_queries_invalid");
assert.equal(validateSeoSecondaryQueries(["сон", "отдых"]), null);
assert.equal(
  parsePracticeSeoContent({
    usage_items: [],
    faq_items: [],
    related_practice_ids: [],
    related_listen_slugs: ["meditatsiya-na-dengi-slushat-onlayn-besplatno", "meditatsiya-na-dengi-slushat-onlayn-besplatno"],
  }),
  null,
);
assert.deepEqual(
  parsePracticeSeoContent({
    usage_items: [],
    faq_items: [],
    related_practice_ids: ["33333333-3333-4333-8333-333333333333"],
  }),
  {
    usageItems: [],
    faqItems: [],
    relatedPracticeIds: ["33333333-3333-4333-8333-333333333333"],
    relatedListenSlugs: [],
  },
);
assert.deepEqual(
  withPreservedRelatedListenSlugs(
    {
      usageItems: [],
      faqItems: [],
      relatedPracticeIds: ["33333333-3333-4333-8333-333333333333"],
      relatedListenSlugs: [],
    },
    {
      usageItems: [],
      faqItems: [],
      relatedPracticeIds: ["33333333-3333-4333-8333-333333333333"],
      relatedListenSlugs: ["meditatsiya-na-dengi-slushat-onlayn-besplatno"],
    },
  ).relatedListenSlugs,
  ["meditatsiya-na-dengi-slushat-onlayn-besplatno"],
);

const formSource = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(formSource, /AUTHOR_DESCRIPTION_LABEL/);
assert.match(formSource, /AUTHOR_DESCRIPTION_HELPER/);
assert.match(formSource, /AuthorProductSeoSection/);
assert.match(formSource, /seo_primary_query: form\.seoPrimaryQuery\.trim\(\) \|\| null/);
assert.match(formSource, /seo_title: form\.seoTitle\.trim\(\) \|\| null/);
assert.match(formSource, /seo_description: form\.seoDescription\.trim\(\) \|\| null/);
assert.doesNotMatch(formSource, /seo_about: form\.seoAbout/);
assert.doesNotMatch(formSource, /Короткое описание продукта/);
assert.match(formSource, /seo_content:/);
assert.match(read("src/lib/products/product-copy.ts"), /export const AUTHOR_DESCRIPTION_LABEL = "О продукте"/);
assert.match(read("src/lib/author-products/limits.ts"), /description: 1000/);

const seoSection = read(
  "src/components/author-dashboard/AuthorProductSeoSection.tsx",
);
const seoAutofillUi = read("src/lib/seo/product-autofill/ui.ts");
const wordstatPicker = read(
  "src/components/author-dashboard/AuthorProductSeoWordstatPicker.tsx",
);
assert.match(seoSection, /useState\(false\)/);
assert.match(seoSection, /aria-expanded=\{isOpen\}/);
assert.match(seoSection, /PRODUCT_SEO_ACCORDION_TITLE/);
assert.match(seoAutofillUi, /SEO и продвижение/);
assert.doesNotMatch(seoSection, /необязательно/);
assert.doesNotMatch(seoAutofillUi, /необязательно/);
assert.doesNotMatch(seoSection, /SEO можно не заполнять|можете пропустить/i);
assert.doesNotMatch(seoAutofillUi, /SEO можно не заполнять|можете пропустить/i);
assert.match(seoAutofillUi, /Яндексе и Google/);
assert.match(seoAutofillUi, /Заполните этот раздел/);
assert.match(seoAutofillUi, /Начните с поискового запроса/);
assert.match(seoAutofillUi, /Подобрать основной запрос/);
assert.match(seoAutofillUi, /Сгенерировать SEO для продукта/);
assert.match(seoAutofillUi, /Рекомендуем заполнить для продвижения/);
assert.match(seoAutofillUi, /SEO заполнено частично/);
assert.match(seoAutofillUi, /SEO готово к продвижению/);
assert.match(seoAutofillUi, /Чем полнее заполнен раздел/);
assert.match(seoAutofillUi, /Мы можем подготовить SEO за вас/);
assert.match(seoAutofillUi, /\+ Добавить свой вопрос/);
assert.match(seoSection, /SEO-готовность/);
assert.match(seoSection, /PRODUCT_SEO_READINESS_HINT/);
assert.match(seoSection, /PRODUCT_SEO_SELLING_COPY/);
assert.match(seoSection, /PRODUCT_SEO_PICK_PRIMARY_CTA/);
assert.match(seoSection, /PRODUCT_SEO_GENERATE_CTA/);
assert.match(seoSection, /AuthorProductSeoStyleControls/);
assert.match(seoSection, /styleProfile/);
assert.match(seoSection, /sanitizeProductSeoStyleProfile/);
const afterPrimaryBlock = seoSection.slice(
  seoSection.indexOf("PRODUCT_SEO_AFTER_PRIMARY_COPY"),
);
assert.ok(
  afterPrimaryBlock.indexOf("<AuthorProductSeoStyleControls") <
    afterPrimaryBlock.lastIndexOf("PRODUCT_SEO_GENERATE_CTA"),
  "style selector sits before generate CTA",
);
assert.match(seoAutofillUi, /Стиль текста/);
assert.match(seoAutofillUi, /Настроить стиль/);
assert.match(seoAutofillUi, /Разнообразие текстов/);
assert.match(seoAutofillUi, /мало подходящих дополнительных фраз/);
assert.match(seoAutofillUi, /Дополнительные поисковые фразы не удалось подобрать/);
assert.match(
  read("src/components/author-dashboard/AuthorProductSeoStyleControls.tsx"),
  /useState\(false\)/,
);
assert.doesNotMatch(seoSection, /localStorage|Пример моего стиля/);
assert.match(seoSection, /requestGenerateProductSeo/);
assert.match(seoSection, /api\/author\/seo\/product-autofill/);
assert.match(seoSection, /hasFilledGeneratedSeoFields/);
assert.match(seoSection, /Часть SEO уже заполнена|PRODUCT_SEO_OVERWRITE_CONFIRM/);
assert.doesNotMatch(seoSection, /method: "PATCH"|\/api\/author\/products\//);
assert.doesNotMatch(seoSection, /OpenAI|ChatGPT|GPT-4/i);
assert.doesNotMatch(seoAutofillUi, /OpenAI|ChatGPT|GPT-4/i);
assert.doesNotMatch(seoSection, /Как заполнить SEO/);
const openMarkup = seoSection.slice(seoSection.indexOf("{isOpen ? <>"));
assert.ok(
  openMarkup.includes("{PRODUCT_SEO_SELLING_COPY}"),
  "selling copy is rendered only after the accordion opens",
);
assert.ok(
  openMarkup.indexOf("{PRODUCT_SEO_SELLING_COPY}") <
    openMarkup.indexOf("SEO-готовность"),
  "selling copy comes before readiness",
);
assert.ok(
  openMarkup.indexOf("SEO-готовность") <
    openMarkup.indexOf("Основной поисковый запрос"),
  "readiness comes before primary query",
);
assert.ok(
  openMarkup.indexOf("Основной поисковый запрос") <
    openMarkup.indexOf("Дополнительные поисковые фразы"),
  "primary query comes before secondary phrases",
);
assert.ok(
  openMarkup.indexOf("Дополнительные поисковые фразы") <
    openMarkup.indexOf("Заголовок для поиска"),
  "secondary phrases come before search title",
);
assert.ok(
  openMarkup.indexOf("Заголовок для поиска") <
    openMarkup.indexOf("Описание для поиска"),
  "search title comes before search description",
);
assert.ok(
  openMarkup.indexOf("Описание для поиска") <
    openMarkup.indexOf("{getPracticeSeoUsageHeading(productKind)}"),
  "search description comes before usage",
);
assert.equal(
  openMarkup.includes("SEO_ABOUT_LABEL") ||
    openMarkup.includes("Подробнее о продукте"),
  false,
  "SEO editor no longer shows seoAbout",
);
assert.ok(
  openMarkup.indexOf("{getPracticeSeoUsageHeading(productKind)}") <
    openMarkup.indexOf("Вопросы и ответы"),
  "usage comes before FAQ",
);
assert.ok(
  openMarkup.indexOf("Вопросы и ответы") <
    openMarkup.indexOf("Рекомендации автора"),
  "FAQ comes before author recommendations",
);
assert.ok(
  openMarkup.indexOf("Рекомендации автора") <
    openMarkup.indexOf("Заголовок блока"),
  "recommendations heading comes before block title field",
);
assert.ok(
  openMarkup.indexOf("Заголовок блока") <
    openMarkup.indexOf("{preview.displayUrl}"),
  "recommendations title field comes before search preview",
);
assert.equal(
  openMarkup.includes("Связанные продукты"),
  false,
  "user-facing related-products label is replaced",
);
assert.equal(
  openMarkup.includes("Связанные страницы «Слушать»"),
  false,
  "related Listen selector is not shown",
);
assert.match(seoSection, /PRODUCT_SEO_START_HEADING/);
assert.match(seoSection, /PRODUCT_SEO_AFTER_PRIMARY_COPY/);
assert.doesNotMatch(seoSection, /suggestPrimaryQuerySeeds/);
assert.match(seoSection, /shouldAutoSearchOnPrimaryCta\(seoPrimaryQuery\)/);
assert.match(seoSection, /void submitWordstat\(seed\)/);
assert.match(seoSection, /Например: медитация для сна/);
assert.match(read("src/lib/seo/wordstat/ui.ts"), /Помочь подобрать запрос/);
assert.match(read("src/lib/seo/wordstat/ui.ts"), /Подобрать похожие/);
assert.match(seoSection, /getWordstatPrimaryCtaLabel\(seoPrimaryQuery\)/);
assert.match(seoSection, /onChange=\{\(event\) =>\s+onChange\(\{ seoPrimaryQuery: event\.target\.value \}\)/s);
assert.match(seoSection, /disabled=\{disabled\}/);
assert.match(seoSection, /wordstatLoading/);
assert.match(wordstatPicker, /Ищем запросы в Яндексе/);
assert.match(wordstatPicker, /Подбор поискового запроса/);
assert.match(wordstatPicker, /Что ищем/);
assert.match(wordstatPicker, /Подобрать в Яндексе/);
assert.match(wordstatPicker, /Россия · все устройства/);
assert.match(wordstatPicker, /50–1000 запросов за 30 дней/);
assert.match(wordstatPicker, /подходит для старта/);
assert.match(wordstatPicker, /стоит оценить внимательнее/);
assert.match(wordstatPicker, /лучше поискать[\s\S]*другой вариант/);
assert.match(wordstatPicker, /Частотность показывает поисковый спрос, а не гарантирует позицию/);
assert.match(wordstatPicker, /Запросы по теме/);
assert.match(wordstatPicker, /Похожие запросы/);
assert.match(wordstatPicker, /Выбрать основным/);
assert.match(wordstatPicker, /\+ В дополнительные/);
assert.match(wordstatPicker, /Основной/);
assert.match(wordstatPicker, /Добавлено/);
assert.match(wordstatPicker, /aria-label=\{ariaLabel\}/);
assert.match(wordstatPicker, /wordstatColorClasses/);
assert.match(read("src/lib/seo/wordstat/ui.ts"), /запросов за последние 30 дней/);
assert.match(wordstatPicker, /запросов за последние[\s\S]*30 дней/);
assert.match(wordstatPicker, /общая оценка темы, а не частота самой фразы/);
assert.doesNotMatch(wordstatPicker, /конкуренция низкая|TOP-3|TOP-5|results\[|associations\[|totalCount/);
assert.match(seoSection, /canAddSecondaryQuery/);
assert.match(seoSection, /parseSeoSecondaryQueryList/);
assert.match(seoSection, /Добавить фразы/);
assert.match(
  seoSection,
  /Введите одну или несколько фраз через запятую или с новой строки/,
);
assert.doesNotMatch(seoSection, /event\.key !== "Enter"/);
assert.match(seoSection, /clipSeoQuery/);
assert.match(seoSection, /WORDSTAT_ERROR_MESSAGES/);
assert.match(seoSection, /Подбор запросов временно недоступен|UPSTREAM_ERROR|NO_RESULTS/);
assert.doesNotMatch(seoSection, /нельзя опубликовать|обязательно для публикации|publication gate/i);
assert.match(seoSection, /maxLength=\{PRODUCT_CONTENT_LIMITS\.seoTitle\}/);
assert.match(seoSection, /maxLength=\{PRODUCT_CONTENT_LIMITS\.seoDescription\}/);
assert.doesNotMatch(seoSection, /maxLength=\{PRODUCT_CONTENT_LIMITS\.seoAbout\}/);
assert.doesNotMatch(seoSection, /Подробнее о продукте|seoAbout|SEO_ABOUT_/);
assert.match(seoSection, /maxLength=\{PRODUCT_CONTENT_LIMITS\.seoPrimaryQuery\}/);
assert.match(seoSection, /evaluateProductSeoReadiness/);
assert.match(seoSection, /buildProductSeoPreview/);
assert.match(seoSection, /preview\.title/);
assert.match(seoSection, /preview\.displayUrl/);
assert.match(seoSection, /preview\.description/);
assert.match(seoSection, /Ориентир: около 50–70 символов/);
assert.match(seoSection, /Ориентир: 120–180 символов/);
assert.doesNotMatch(seoSection, /Ориентир: 500–1500 символов/);
assert.match(seoSection, /Когда лучше слушать/);
assert.match(seoSection, /Выберите 2–4 продукта/);
assert.match(seoSection, /Найти продукт/);
assert.match(seoSection, /Введите название или слово из названия/);
assert.doesNotMatch(seoSection, /близкие по теме статьи АудиоЛада/);
assert.doesNotMatch(seoSection, /Связанные страницы «Слушать»/);
assert.doesNotMatch(seoSection, /Связанные статьи|Связанные Listen/);
assert.doesNotMatch(seoSection, /SEO score|keyword-density|100%/i);
assert.doesNotMatch(seoSection, /FAQPage|QAPage/);
assert.match(seoSection, /disabled\?: boolean/);
assert.ok(
  [...seoSection.matchAll(/disabled=\{disabled\}/g)].length >= 3,
  "all SEO inputs must honor the moderation lock",
);
assert.match(seoSection, /disabled:cursor-not-allowed disabled:opacity-60/);
assert.doesNotMatch(seoSection, /api\/author\/seo\/listen-options/);
assert.match(seoSection, /api\/author\/seo\/related-product-options/);
assert.match(seoSection, /RELATED_PRODUCT_SEARCH_DEBOUNCE_MS/);
assert.match(seoSection, /shouldSearchRelatedProducts/);
assert.match(seoSection, /shouldListDefaultAuthorProducts/);
assert.match(seoSection, /canAddRelatedProductId/);
assert.match(seoSection, /MAX_AUTHOR_RECOMMENDATIONS/);
assert.match(seoSection, /Добавлено/);
assert.match(seoSection, /overflow-y-auto/);
assert.match(seoSection, /buildWordstatSuggestionsRequest\(phrase\)/);
assert.match(
  read("src/lib/seo/wordstat/ui.ts"),
  /api\/author\/seo\/wordstat\/suggestions/,
);
assert.doesNotMatch(seoSection, /YANDEX_SEARCH_API_KEY|YANDEX_SEARCH_FOLDER_ID/);
assert.match(seoSection, /relatedProductSourceId/);
assert.match(seoSection, /Найти продукт/);
assert.match(seoSection, /Удалить фразу/);
assert.doesNotMatch(seoSection, /listListenPageDefinitions/);
assert.doesNotMatch(seoSection, /relatedListenSlugs/);
assert.match(seoSection, /moveItem/);
assert.doesNotMatch(seoSection, /relatedListenUrl|listen_url/i);
assert.match(formSource, /related_listen_slugs: form\.seoContent\.relatedListenSlugs/);
assert.match(formSource, /disabled=\{!canEditPublicFields \|\| busy\}/);
assert.doesNotMatch(formSource, /wordstat|Wordstat/);

const patch = read("src/app/api/author/products/[id]/route.ts");
assert.match(patch, /withPreservedRelatedListenSlugs/);
assert.match(patch, /seo_primary_query/);
assert.match(patch, /validateSeoPrimaryQueryLength/);
assert.match(patch, /validateSeoTitleLength/);
assert.match(patch, /validateSeoDescriptionLength/);
assert.doesNotMatch(patch, /api\/author\/products\/\[id\]\/seo/);
assert.match(patch, /replacePracticeSeoContent/);
assert.match(patch, /validateRelatedPracticeTargets/);
assert.match(patch, /shouldRejectChangedAuthorRecommendations/);
assert.match(patch, /hasPracticeSeoContentChanges/);
assert.match(patch, /seoContentChanged/);
assert.match(patch, /scalarUpdates/);
assert.match(patch, /const currentProduct = await getAuthorProductDetail/);
assert.match(patch, /const currentPractice = currentProduct\.practice/);
assert.match(patch, /if \(hasChanges\) \{\s+await syncPracticeAudioCompatibility/s);
assert.match(patch, /if \(hasChanges\) \{\s+await recordAuthorSupportAudit/s);

const seoContentSource = read("src/lib/products/practice-seo-content.ts");
assert.match(seoContentSource, /\.rpc\("replace_practice_seo_content"/);
assert.doesNotMatch(seoContentSource, /for \(const table of tables\)/);
const migration = read("supabase/migrations/20260908120000_product_seo_v2.sql");
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.replace_practice_seo_content/);
assert.match(migration, /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.practice_seo_usage_items FROM authenticated/);
assert.match(migration, /is_catalog_listed IS TRUE/);
const hardeningMigration = read(
  "supabase/migrations/20260909090000_harden_product_seo_v2.sql",
);
assert.match(hardeningMigration, /SECURITY DEFINER/);
assert.match(hardeningMigration, /SET search_path = pg_catalog, pg_temp/);
assert.match(hardeningMigration, /practice_seo_not_authenticated/);
assert.match(hardeningMigration, /NOT public\.can_manage_practice_seo/);
assert.match(hardeningMigration, /REVOKE INSERT, UPDATE, DELETE ON TABLE/);
assert.match(hardeningMigration, /count\(DISTINCT lower\(btrim\(value\)\)\)/);
const relatedOptionsRoute = read(
  "src/app/api/author/seo/related-product-options/route.ts",
);
assert.match(relatedOptionsRoute, /requirePracticeAccess\(sourcePracticeId\)/);
assert.match(relatedOptionsRoute, /admin_panel\.access/);
assert.match(relatedOptionsRoute, /\.limit\(MAX_RESULTS\)/);
assert.match(relatedOptionsRoute, /RELATED_PRODUCT_SEARCH_LIMIT/);
assert.match(relatedOptionsRoute, /shouldSearchRelatedProducts/);
assert.match(relatedOptionsRoute, /shouldListDefaultAuthorProducts/);
assert.match(relatedOptionsRoute, /toRelatedProductOrFilter/);
assert.match(relatedOptionsRoute, /parseRelatedProductIdsParam/);
assert.match(relatedOptionsRoute, /options: \[\]/);
assert.match(relatedOptionsRoute, /— \$\{authorName\}/);
assert.match(relatedOptionsRoute, /RELATED_PRODUCT_DEFAULT_AUTHOR_LIST_LIMIT/);
assert.match(relatedOptionsRoute, /published_at/);
assert.doesNotMatch(relatedOptionsRoute, /author_id.*searchParams/);

console.log("author-product-seo-form-unit: ok");
