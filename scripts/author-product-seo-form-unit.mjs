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
    contentLockedAfterSale: false,
    deleteLockedAfterPaidPurchase: false,
  };
}

const snapshot = productDetailToFormSnapshot(practiceDetail());
assert.equal(snapshot.seoPrimaryQuery, "медитация для сна");
assert.equal(snapshot.seoTitle, "");
assert.equal(snapshot.seoDescription, "Короткое поисковое описание.");

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

const formSource = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(formSource, /AuthorProductSeoSection/);
assert.match(formSource, /seo_primary_query: form\.seoPrimaryQuery\.trim\(\) \|\| null/);
assert.match(formSource, /seo_title: form\.seoTitle\.trim\(\) \|\| null/);
assert.match(formSource, /seo_description: form\.seoDescription\.trim\(\) \|\| null/);

const seoSection = read(
  "src/components/author-dashboard/AuthorProductSeoSection.tsx",
);
assert.match(seoSection, /Поиск в Яндексе/);
assert.match(seoSection, /SEO-готовность/);
assert.doesNotMatch(seoSection, /SEO score|keyword-density|100%/i);
assert.match(seoSection, /disabled\?: boolean/);
assert.equal(
  [...seoSection.matchAll(/disabled=\{disabled\}/g)].length,
  3,
  "all three SEO inputs must honor the moderation lock",
);
assert.match(seoSection, /disabled:cursor-not-allowed disabled:opacity-60/);
assert.match(formSource, /disabled=\{!canEditPublicFields \|\| busy\}/);

const patch = read("src/app/api/author/products/[id]/route.ts");
assert.match(patch, /seo_primary_query/);
assert.match(patch, /validateSeoPrimaryQueryLength/);
assert.match(patch, /validateSeoTitleLength/);
assert.match(patch, /validateSeoDescriptionLength/);
assert.doesNotMatch(patch, /api\/author\/products\/\[id\]\/seo/);

console.log("author-product-seo-form-unit: ok");
