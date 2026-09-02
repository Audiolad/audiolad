#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isProductEditorDirty, serializeProductEditorBaseline } from "../src/lib/author-products/editor-save-state.ts";
import { mergeServerProductIntoForm, productDetailToFormSnapshot } from "../src/lib/author-products/form-merge.ts";
import {
  getProductFieldErrorMessage,
  getProductFieldKeyForError,
  validateSeoDescriptionLength,
  validateSeoPrimaryQueryLength,
  validateSeoSecondaryQueries,
  validateSeoTitleLength,
} from "../src/lib/author-products/limits.ts";
import { normalizeClearableTextField } from "../src/lib/author-products/text-fields.ts";
import {
  getPracticeSeoUsageHeading,
  hasPracticeSeoContentChanges,
  parsePracticeSeoContent,
  withPreservedRelatedListenSlugs,
} from "../src/lib/products/practice-seo-content.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const seoContent = {
  usageItems: [{ content: "Перед сном" }],
  faqItems: [{ question: "Нужны ли наушники?", answer: "По желанию." }],
  relatedPracticeIds: ["33333333-3333-4333-8333-333333333333"],
  relatedListenSlugs: [],
};
const practice = {
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
  promo_enabled: false,
  promo_title: null,
  promo_text: null,
  promo_button_text: null,
  promo_url: null,
  promo_open_in_new_tab: false,
  cover_url: null,
  cover_image: null,
  use_shared_cover: true,
  audio_url: null,
  listening_notice_enabled: true,
  listening_notice_title: null,
  listening_notice_text: null,
  seo_primary_query: "медитация для сна",
  seo_secondary_queries: ["практика перед сном"],
  seo_title: null,
  seo_description: "Короткое поисковое описание.",
  seo_about: null,
  author_recommendations_title: null,
  status: "draft",
  moderation_status: "not_submitted",
  moderation_submitted_at: null,
  moderation_review_comment: null,
  moderation_attempt: 0,
  deleted_at: null,
  deleted_by: null,
  deletion_reason: null,
  currency: "RUB",
  published_at: null,
  created_at: "2026-08-29T00:00:00.000Z",
  updated_at: "2026-08-29T00:00:00.000Z",
};
const product = {
  practice,
  audio_items: [],
  gallery_slides: [],
  seo_content: seoContent,
  contentLockedAfterSale: false,
  deleteLockedAfterPaidPurchase: false,
};
const snapshot = productDetailToFormSnapshot(product);

assert.equal(snapshot.seoPrimaryQuery, "медитация для сна");
assert.deepEqual(snapshot.seoSecondaryQueries, ["практика перед сном"]);
assert.equal(snapshot.seoTitle, "");
assert.equal(snapshot.seoDescription, "Короткое поисковое описание.");

const emptySeo = productDetailToFormSnapshot({
  ...product,
  practice: {
    ...practice,
    seo_primary_query: null,
    seo_secondary_queries: null,
    seo_title: null,
    seo_description: null,
  },
});
assert.deepEqual(
  [emptySeo.seoPrimaryQuery, emptySeo.seoSecondaryQueries, emptySeo.seoTitle, emptySeo.seoDescription],
  ["", [], "", ""],
);

// Legacy DB row and newly parsed row produce the same canonical form snapshot.
const parsedSeoContent = parsePracticeSeoContent({
  usage_items: [{ content: "  Перед сном  " }, { content: "" }],
  faq_items: [
    { question: " Нужны ли наушники? ", answer: " По желанию. " },
    { question: "", answer: "" },
  ],
  related_practice_ids: ["33333333-3333-4333-8333-333333333333", ""],
  related_listen_slugs: [],
});
assert.deepEqual(parsedSeoContent, seoContent);
assert.deepEqual(
  productDetailToFormSnapshot(product),
  productDetailToFormSnapshot({ ...product, seo_content: parsedSeoContent }),
);
assert.equal(hasPracticeSeoContentChanges(parsedSeoContent, seoContent), false);
assert.deepEqual(
  withPreservedRelatedListenSlugs(
    { ...seoContent, relatedListenSlugs: [] },
    { ...seoContent, relatedListenSlugs: ["legacy-listen"] },
  ).relatedListenSlugs,
  ["legacy-listen"],
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
assert.equal(
  parsePracticeSeoContent({
    usage_items: [],
    faq_items: [],
    related_practice_ids: [],
    related_listen_slugs: [
      "meditatsiya-na-dengi-slushat-onlayn-besplatno",
      "meditatsiya-na-dengi-slushat-onlayn-besplatno",
    ],
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

const merged = mergeServerProductIntoForm(
  {
    ...snapshot,
    seoPrimaryQuery: "локальный запрос",
    seoSecondaryQueries: ["локальная фраза"],
    seoTitle: "Свой заголовок",
    seoDescription: "Своё описание",
  },
  {
    ...product,
    practice: {
      ...practice,
      seo_primary_query: "серверный запрос",
      seo_secondary_queries: ["серверная фраза"],
      seo_title: "серверный title",
      seo_description: "серверное описание",
      cover_url: "https://cdn.example/cover.jpg",
    },
  },
);
assert.equal(merged.seoPrimaryQuery, "локальный запрос");
assert.deepEqual(merged.seoSecondaryQueries, ["локальная фраза"]);
assert.equal(merged.seoTitle, "Свой заголовок");
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
  seoSecondaryQueries: snapshot.seoSecondaryQueries,
  seoTitle: snapshot.seoTitle,
  seoDescription: snapshot.seoDescription,
  seoContent: snapshot.seoContent,
};
const audio = [];
const baseline = serializeProductEditorBaseline(form, audio);
assert.match(baseline, /"seoPrimaryQuery":"медитация для сна"/);
assert.match(baseline, /"seoTitle":""/);
assert.match(baseline, /"seoDescription":"Короткое поисковое описание\."/);
assert.equal(isProductEditorDirty(baseline, baseline), false);
assert.equal(
  isProductEditorDirty(
    serializeProductEditorBaseline({ ...form, seoPrimaryQuery: "другой запрос" }, audio),
    baseline,
  ),
  true,
);
assert.equal(
  isProductEditorDirty(serializeProductEditorBaseline({ ...form, seoTitle: "Новый SEO" }, audio), baseline),
  true,
);
assert.equal(
  isProductEditorDirty(
    serializeProductEditorBaseline({ ...form, seoDescription: "Новое описание" }, audio),
    baseline,
  ),
  true,
);
assert.equal(
  isProductEditorDirty(
    serializeProductEditorBaseline({ ...form, seoSecondaryQueries: ["другая фраза"] }, audio),
    baseline,
  ),
  true,
);
const reloaded = serializeProductEditorBaseline(productDetailToFormSnapshot(product), audio);
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
assert.equal(validateSeoSecondaryQueries(["сон", "СОН"]), "seo_secondary_queries_invalid");
assert.equal(validateSeoSecondaryQueries(["сон", "отдых"]), null);
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
assert.equal(getPracticeSeoUsageHeading("practice"), "Как использовать практику");
assert.equal(getPracticeSeoUsageHeading("music"), "Как слушать музыку");
assert.equal(getPracticeSeoUsageHeading("audio_post"), "Как использовать");

const formSource = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(formSource, /AUTHOR_DESCRIPTION_LABEL/);
assert.match(formSource, /AUTHOR_DESCRIPTION_HELPER/);
assert.match(formSource, /AuthorProductSeoSection/);
assert.match(formSource, /seo_primary_query: form\.seoPrimaryQuery\.trim\(\) \|\| null/);
assert.match(formSource, /seo_secondary_queries: form\.seoSecondaryQueries\.map/);
assert.match(formSource, /seo_title: form\.seoTitle\.trim\(\) \|\| null/);
assert.match(formSource, /seo_description: form\.seoDescription\.trim\(\) \|\| null/);
assert.doesNotMatch(formSource, /seo_about: form\.seoAbout/);
assert.match(formSource, /seo_content:/);
assert.match(formSource, /related_listen_slugs: form\.seoContent\.relatedListenSlugs/);
assert.match(formSource, /disabled=\{!canEditPublicFields \|\| busy\}/);
assert.doesNotMatch(formSource, /wordstat|Wordstat/);
assert.equal([...formSource.matchAll(/<AuthorProductSeoSection/g)].length, 1);
assert.ok(
  formSource.indexOf("<AuthorProductSeoSection") <
    formSource.indexOf('className="flex flex-col gap-3 sm:flex-row sm:flex-wrap"'),
);
assert.match(read("src/lib/products/product-copy.ts"), /export const AUTHOR_DESCRIPTION_LABEL = "О продукте"/);
assert.match(read("src/lib/author-products/limits.ts"), /description: 1000/);

const section = read("src/components/author-dashboard/AuthorProductSeoSection.tsx");
assert.match(section, /useState\(false\)/);
assert.match(section, /aria-expanded=\{isOpen\}/);
assert.match(section, /PRODUCT_SEO_ACCORDION_TITLE/);
assert.match(section, /PRODUCT_SEO_SELLING_COPY/);
assert.match(section, /AuthorProductSeoStyleControls/);
assert.match(section, /styleProfile/);
assert.match(section, /sanitizeProductSeoStyleProfile/);
assert.match(section, /requestGenerateProductSeo/);
assert.match(section, /hasFilledGeneratedSeoFields/);
assert.match(section, /getProductSeoSecondaryUsage/);
assert.match(section, /secondaryUsageByQuery/);
assert.match(section, /api\/author\/seo\/product-autofill/);
assert.match(section, /parseSeoSecondaryQueryList/);
assert.match(section, /Основной поисковый запрос/);
assert.match(section, /Дополнительные поисковые фразы/);
assert.match(section, /evaluateProductSeoReadiness/);
assert.match(section, /buildProductSeoPreview/);
assert.match(section, /preview\.title/);
assert.match(section, /preview\.displayUrl/);
assert.match(section, /preview\.description/);
assert.match(section, /maxLength=\{PRODUCT_CONTENT_LIMITS\.seoTitle\}/);
assert.match(section, /maxLength=\{PRODUCT_CONTENT_LIMITS\.seoDescription\}/);
assert.match(section, /maxLength=\{PRODUCT_CONTENT_LIMITS\.seoPrimaryQuery\}/);
assert.doesNotMatch(section, /maxLength=\{PRODUCT_CONTENT_LIMITS\.seoAbout\}/);
assert.match(section, /api\/author\/seo\/related-product-options/);
assert.match(section, /RELATED_PRODUCT_SEARCH_DEBOUNCE_MS/);
assert.match(section, /Найти продукт/);
assert.match(section, /moveItem/);
assert.match(section, /disabled\?: boolean/);
assert.ok([...section.matchAll(/disabled=\{disabled\}/g)].length >= 3);
assert.match(section, /disabled:cursor-not-allowed disabled:opacity-60/);
assert.doesNotMatch(section, /Wordstat|wordstat|Подобрать похожие|api\/author\/seo\/wordstat/);
assert.doesNotMatch(section, /seoAbout|SEO_ABOUT_/);
assert.equal((section.match(/Основной поисковый запрос/g) ?? []).length, 1);
assert.equal((section.match(/Дополнительные поисковые фразы/g) ?? []).length, 1);
assert.equal((section.match(/Заголовок для поиска/g) ?? []).length, 1);
assert.equal((section.match(/Описание для поиска/g) ?? []).length, 1);
assert.match(section, /Поле необязательное\. Напишите понятный заголовок результата поиска\./);

const openMarkup = section.slice(section.indexOf("{isOpen ? <>"));
assert.ok(openMarkup.indexOf("{PRODUCT_SEO_SELLING_COPY}") < openMarkup.indexOf("Основной поисковый запрос"));
assert.ok(
  openMarkup.indexOf("Основной поисковый запрос") <
    openMarkup.indexOf("Дополнительные поисковые фразы"),
);
assert.ok(
  openMarkup.indexOf("Дополнительные поисковые фразы") <
    openMarkup.indexOf("<AuthorProductSeoStyleControls"),
);
assert.ok(
  openMarkup.indexOf("<AuthorProductSeoStyleControls") <
    openMarkup.indexOf("PRODUCT_SEO_GENERATE_CTA"),
);
assert.ok(
  openMarkup.indexOf("PRODUCT_SEO_GENERATE_CTA") <
    openMarkup.indexOf("PRODUCT_SEO_OVERWRITE_CONFIRM"),
);
assert.ok(
  openMarkup.indexOf("PRODUCT_SEO_OVERWRITE_CONFIRM") <
    openMarkup.indexOf("SEO-готовность"),
);
assert.ok(
  openMarkup.indexOf("SEO-готовность") <
    openMarkup.indexOf("Заголовок для поиска"),
);
assert.ok(
  openMarkup.indexOf("Заголовок для поиска") < openMarkup.indexOf("Описание для поиска"),
);
assert.ok(
  openMarkup.indexOf("Описание для поиска") <
    openMarkup.indexOf("{getPracticeSeoUsageHeading(productKind)}"),
);
assert.ok(
  openMarkup.indexOf("{getPracticeSeoUsageHeading(productKind)}") <
    openMarkup.indexOf("Вопросы и ответы"),
);
assert.ok(openMarkup.indexOf("Вопросы и ответы") < openMarkup.indexOf("Рекомендации автора"));

const patch = read("src/app/api/author/products/[id]/route.ts");
assert.match(patch, /withPreservedRelatedListenSlugs/);
assert.match(patch, /seo_primary_query/);
assert.match(patch, /validateSeoPrimaryQueryLength/);
assert.match(patch, /validateSeoTitleLength/);
assert.match(patch, /validateSeoDescriptionLength/);
assert.match(patch, /validateSeoSecondaryQueries/);
assert.match(patch, /replacePracticeSeoContent/);
assert.match(patch, /validateRelatedPracticeTargets/);
assert.match(patch, /shouldRejectChangedAuthorRecommendations/);
assert.match(patch, /hasPracticeSeoContentChanges/);
assert.match(patch, /seoContentChanged/);
assert.match(patch, /scalarUpdates/);
assert.match(patch, /const currentProduct = await getAuthorProductDetail/);
assert.match(patch, /if \(hasChanges\) \{\s+await syncPracticeAudioCompatibility/s);
assert.match(patch, /if \(hasChanges\) \{\s+await recordAuthorSupportAudit/s);
assert.doesNotMatch(patch, /api\/author\/products\/\[id\]\/seo/);

const seoContentSource = read("src/lib/products/practice-seo-content.ts");
assert.match(seoContentSource, /\.rpc\("replace_practice_seo_content"/);
assert.doesNotMatch(seoContentSource, /for \(const table of tables\)/);
const migration = read("supabase/migrations/20260908120000_product_seo_v2.sql");
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.replace_practice_seo_content/);
assert.match(
  migration,
  /REVOKE INSERT, UPDATE, DELETE ON TABLE public\.practice_seo_usage_items FROM authenticated/,
);
const hardeningMigration = read("supabase/migrations/20260909090000_harden_product_seo_v2.sql");
assert.match(hardeningMigration, /SECURITY DEFINER/);
assert.match(hardeningMigration, /SET search_path = pg_catalog, pg_temp/);
assert.match(hardeningMigration, /practice_seo_not_authenticated/);
assert.match(hardeningMigration, /NOT public\.can_manage_practice_seo/);
assert.match(hardeningMigration, /count\(DISTINCT lower\(btrim\(value\)\)\)/);

const relatedOptionsRoute = read("src/app/api/author/seo/related-product-options/route.ts");
assert.match(relatedOptionsRoute, /requirePracticeAccess\(sourcePracticeId\)/);
assert.match(relatedOptionsRoute, /admin_panel\.access/);
assert.match(relatedOptionsRoute, /\.limit\(MAX_RESULTS\)/);
assert.match(relatedOptionsRoute, /RELATED_PRODUCT_SEARCH_LIMIT/);
assert.match(relatedOptionsRoute, /shouldSearchRelatedProducts/);
assert.match(relatedOptionsRoute, /shouldListDefaultAuthorProducts/);
assert.match(relatedOptionsRoute, /toRelatedProductOrFilter/);
assert.match(relatedOptionsRoute, /parseRelatedProductIdsParam/);
assert.match(relatedOptionsRoute, /options: \[\]/);
assert.match(relatedOptionsRoute, /published_at/);
assert.doesNotMatch(relatedOptionsRoute, /author_id.*searchParams/);

console.log("author-product-seo-form-unit: ok");
