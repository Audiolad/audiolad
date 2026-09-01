#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isProductEditorDirty, serializeProductEditorBaseline } from "../src/lib/author-products/editor-save-state.ts";
import { mergeServerProductIntoForm, productDetailToFormSnapshot } from "../src/lib/author-products/form-merge.ts";
import { getProductFieldErrorMessage, getProductFieldKeyForError, validateSeoDescriptionLength, validateSeoPrimaryQueryLength, validateSeoSecondaryQueries, validateSeoTitleLength } from "../src/lib/author-products/limits.ts";
import { normalizeClearableTextField } from "../src/lib/author-products/text-fields.ts";
import { getPracticeSeoUsageHeading, hasPracticeSeoContentChanges, parsePracticeSeoContent, withPreservedRelatedListenSlugs } from "../src/lib/products/practice-seo-content.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const seoContent = {
  usageItems: [{ content: "Перед сном" }],
  faqItems: [{ question: "Нужны ли наушники?", answer: "По желанию." }],
  relatedPracticeIds: ["33333333-3333-4333-8333-333333333333"],
  relatedListenSlugs: [],
};
const practice = {
  id: "11111111-1111-4111-8111-111111111111", author_id: "22222222-2222-4222-8222-222222222222",
  title: "Лавандовый сон", slug: "lavandovyy-son", subtitle: "Вечерняя практика", description: "Мягкая медитация для сна.",
  format: "Медитация", product_kind: "practice", publication_class: "practice", music_usage_permission: null,
  duration_minutes: 12, price: 0, is_free: true, is_catalog_listed: true, catalog_visibility: "listed",
  promo_enabled: false, promo_title: null, promo_text: null, promo_button_text: null, promo_url: null, promo_open_in_new_tab: false,
  cover_url: null, cover_image: null, use_shared_cover: true, audio_url: null,
  listening_notice_enabled: true, listening_notice_title: null, listening_notice_text: null,
  seo_primary_query: "медитация для сна", seo_secondary_queries: ["практика перед сном"], seo_title: null, seo_description: "Короткое поисковое описание.", seo_about: null,
  author_recommendations_title: null, status: "draft", moderation_status: "not_submitted", moderation_submitted_at: null, moderation_review_comment: null, moderation_attempt: 0,
  deleted_at: null, deleted_by: null, deletion_reason: null, currency: "RUB", published_at: null,
  created_at: "2026-08-29T00:00:00.000Z", updated_at: "2026-08-29T00:00:00.000Z",
};
const product = { practice, audio_items: [], gallery_slides: [], seo_content: seoContent, contentLockedAfterSale: false, deleteLockedAfterPaidPurchase: false };
const snapshot = productDetailToFormSnapshot(product);
assert.equal(snapshot.seoPrimaryQuery, "медитация для сна");
assert.deepEqual(snapshot.seoSecondaryQueries, ["практика перед сном"]);
assert.equal(snapshot.seoTitle, "");
assert.equal(snapshot.seoDescription, "Короткое поисковое описание.");
const emptySeo = productDetailToFormSnapshot({ ...product, practice: { ...practice, seo_primary_query: null, seo_secondary_queries: null, seo_title: null, seo_description: null } });
assert.deepEqual([emptySeo.seoPrimaryQuery, emptySeo.seoSecondaryQueries, emptySeo.seoTitle, emptySeo.seoDescription], ["", [], "", ""]);

// A legacy database row and a newly parsed row produce precisely the same canonical form snapshot.
const parsedSeoContent = parsePracticeSeoContent({
  usage_items: [{ content: "  Перед сном  " }, { content: "" }],
  faq_items: [{ question: " Нужны ли наушники? ", answer: " По желанию. " }, { question: "", answer: "" }],
  related_practice_ids: ["33333333-3333-4333-8333-333333333333", ""], related_listen_slugs: [],
});
assert.deepEqual(parsedSeoContent, seoContent);
assert.deepEqual(productDetailToFormSnapshot(product), productDetailToFormSnapshot({ ...product, seo_content: parsedSeoContent }));
assert.equal(hasPracticeSeoContentChanges(parsedSeoContent, seoContent), false);
assert.deepEqual(withPreservedRelatedListenSlugs({ ...seoContent, relatedListenSlugs: [] }, { ...seoContent, relatedListenSlugs: ["legacy-listen"] }).relatedListenSlugs, ["legacy-listen"]);

const merged = mergeServerProductIntoForm({ ...snapshot, seoPrimaryQuery: "локальный запрос", seoSecondaryQueries: ["локальная фраза"], seoTitle: "Свой заголовок", seoDescription: "Своё описание" }, { ...product, practice: { ...practice, seo_primary_query: "серверный запрос", seo_secondary_queries: ["серверная фраза"], seo_title: "серверный title", seo_description: "серверное описание", cover_url: "https://cdn.example/cover.jpg" } });
assert.equal(merged.seoPrimaryQuery, "локальный запрос");
assert.deepEqual(merged.seoSecondaryQueries, ["локальная фраза"]);
assert.equal(merged.seoTitle, "Свой заголовок");
assert.equal(merged.coverUrl, "https://cdn.example/cover.jpg");
const baseline = serializeProductEditorBaseline(snapshot, []);
assert.equal(isProductEditorDirty(baseline, baseline), false);
assert.equal(isProductEditorDirty(serializeProductEditorBaseline({ ...snapshot, seoSecondaryQueries: ["другая фраза"] }, []), baseline), true);
assert.equal(normalizeClearableTextField("   "), null);

assert.equal(validateSeoPrimaryQueryLength("а".repeat(120)), null);
assert.equal(validateSeoPrimaryQueryLength("а".repeat(121)), "seo_primary_query_too_long");
assert.equal(validateSeoTitleLength("а".repeat(141)), "seo_title_too_long");
assert.equal(validateSeoDescriptionLength("а".repeat(301)), "seo_description_too_long");
assert.equal(validateSeoSecondaryQueries(["сон", "СОН"]), "seo_secondary_queries_invalid");
assert.equal(validateSeoSecondaryQueries(["сон", "отдых"]), null);
assert.equal(getProductFieldErrorMessage("seo_primary_query_too_long"), "Основной поисковый запрос не должен превышать 120 символов.");
assert.equal(getProductFieldKeyForError("seo_title_too_long"), "seoTitle");
assert.equal(getPracticeSeoUsageHeading("practice"), "Как использовать практику");
assert.equal(getPracticeSeoUsageHeading("music"), "Как слушать музыку");

// Form/API source assertions guard the approved manual architecture and existing persistence safeguards.
const formSource = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(formSource, /AuthorProductSeoSection/);
assert.match(formSource, /seo_primary_query: form\.seoPrimaryQuery\.trim\(\) \|\| null/);
assert.match(formSource, /seo_secondary_queries: form\.seoSecondaryQueries\.map/);
assert.match(formSource, /seo_content:/);
assert.doesNotMatch(formSource, /wordstat|Wordstat/);
const section = read("src/components/author-dashboard/AuthorProductSeoSection.tsx");
assert.match(section, /Основной поисковый запрос/);
assert.match(section, /Дополнительные поисковые фразы/);
assert.match(section, /parseSeoSecondaryQueryList/);
assert.match(section, /api\/author\/seo\/product-autofill/);
assert.doesNotMatch(section, /Wordstat|wordstat|Подобрать похожие|api\/author\/seo\/wordstat/);
assert.match(section, /disabled\?: boolean/);
assert.match(section, /relatedProductSourceId/);
const patch = read("src/app/api/author/products/[id]/route.ts");
assert.match(patch, /withPreservedRelatedListenSlugs/);
assert.match(patch, /validateSeoSecondaryQueries/);
assert.match(patch, /replacePracticeSeoContent/);
console.log("author-product-seo-form-unit: ok");
