#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  productDetailToFormSnapshot,
  mergeServerProductIntoForm,
} from "../src/lib/author-products/form-merge.ts";
import {
  PRODUCT_CONTENT_LIMITS,
  validateAuthorRecommendationsTitleLength,
  getProductFieldErrorMessage,
  getProductFieldKeyForError,
} from "../src/lib/author-products/limits.ts";
import { serializeProductEditorBaseline } from "../src/lib/author-products/editor-save-state.ts";
import { normalizeClearableTextField } from "../src/lib/author-products/text-fields.ts";
import { parsePracticeSeoContent } from "../src/lib/products/practice-seo-content.ts";
import {
  DEFAULT_AUTHOR_RECOMMENDATIONS_TITLE,
  AUTHOR_RECOMMENDATIONS_TITLE_MAX_LENGTH,
  normalizeAuthorRecommendationsTitle,
  resolveAuthorRecommendationsTitle,
} from "../src/lib/products/author-recommendations-title.ts";
import {
  MAX_AUTHOR_RECOMMENDATIONS,
  canAddRelatedProductId,
  limitPublicRelatedProducts,
  shouldRejectChangedAuthorRecommendations,
} from "../src/lib/seo/related-product-search.ts";
import { hasPracticePublicIndexNowChanges } from "../src/lib/seo/indexnow/public-fields.ts";
import { hasPracticeYandexRecrawlChanges } from "../src/lib/seo/yandex-webmaster/planner.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function practiceDetail(overrides = {}, seoOverrides = {}) {
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
      seo_primary_query: null,
      seo_title: null,
      seo_description: null,
      seo_about: null,
      author_recommendations_title: null,
      created_at: "2026-08-29T00:00:00.000Z",
      updated_at: "2026-08-29T00:00:00.000Z",
      ...overrides,
    },
    audio_items: [],
    gallery_slides: [],
    seo_content: {
      usageItems: [],
      faqItems: [],
      relatedPracticeIds: ["33333333-3333-4333-8333-333333333333"],
      relatedListenSlugs: [],
      ...seoOverrides,
    },
    contentLockedAfterSale: false,
    deleteLockedAfterPaidPurchase: false,
  };
}

function publicBlock(input) {
  const relatedProducts = limitPublicRelatedProducts(input.relatedProducts ?? []);
  if (!relatedProducts.length) {
    return null;
  }
  return {
    heading: resolveAuthorRecommendationsTitle(
      input.authorRecommendationsTitle,
    ),
    cards: relatedProducts,
  };
}

const MIGRATION = "supabase/migrations/20260911120000_author_recommendations_title.sql";
assert.equal(existsSync(path.join(root, MIGRATION)), true, "DB_MIGRATION exists");
const migration = read(MIGRATION);
assert.match(migration, /ADD COLUMN IF NOT EXISTS author_recommendations_title text/);
assert.match(migration, /practices_author_recommendations_title_length_check/);
assert.match(migration, /char_length\(author_recommendations_title\) <= 80/);
assert.doesNotMatch(migration, /UPDATE\s+public\.practices/i);
assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM public\.practice_related_products/i);
assert.doesNotMatch(migration, /Рекомендации АудиоЛада/);

assert.equal(DEFAULT_AUTHOR_RECOMMENDATIONS_TITLE, "Рекомендации автора");
assert.equal(AUTHOR_RECOMMENDATIONS_TITLE_MAX_LENGTH, 80);
assert.equal(PRODUCT_CONTENT_LIMITS.authorRecommendationsTitle, 80);
assert.equal(MAX_AUTHOR_RECOMMENDATIONS, 5);

// DEFAULT_TITLE_FOR_EXISTING_PRODUCT
const existing = productDetailToFormSnapshot(practiceDetail());
assert.equal(existing.authorRecommendationsTitle, "");
assert.equal(
  resolveAuthorRecommendationsTitle(existing.authorRecommendationsTitle),
  "Рекомендации автора",
  "DEFAULT_TITLE_FOR_EXISTING_PRODUCT",
);
assert.equal(
  resolveAuthorRecommendationsTitle(null),
  "Рекомендации автора",
);

// CUSTOM_TITLE_SAVED
assert.equal(
  normalizeAuthorRecommendationsTitle("Послушайте ещё"),
  "Послушайте ещё",
  "CUSTOM_TITLE_SAVED",
);
assert.equal(
  normalizeClearableTextField("Ещё про сон"),
  "Ещё про сон",
);

// CUSTOM_TITLE_LOADED
const loaded = productDetailToFormSnapshot(
  practiceDetail({ author_recommendations_title: "Подарок для вас" }),
);
assert.equal(loaded.authorRecommendationsTitle, "Подарок для вас", "CUSTOM_TITLE_LOADED");

const local = {
  ...loaded,
  authorRecommendationsTitle: "Подарок для вас",
  title: "Локальное название",
};
const merged = mergeServerProductIntoForm(
  local,
  practiceDetail({
    author_recommendations_title: "серверное значение",
    title: "Серверное название",
  }),
);
assert.equal(
  merged.authorRecommendationsTitle,
  "Подарок для вас",
  "custom title is not reset on other saves",
);
assert.deepEqual(
  merged.seoContent.relatedPracticeIds,
  ["33333333-3333-4333-8333-333333333333"],
  "RELATED_PRODUCTS_SELECTION_UNCHANGED",
);

const baseline = serializeProductEditorBaseline(loaded, []);
assert.match(baseline, /"authorRecommendationsTitle":"Подарок для вас"/);
assert.equal(
  serializeProductEditorBaseline(
    { ...loaded, authorRecommendationsTitle: "Другие мои практики" },
    [],
  ) === baseline,
  false,
);

// CUSTOM_TITLE_PUBLIC_RENDER
const customPublic = publicBlock({
  authorRecommendationsTitle: "Что послушать дальше",
  relatedProducts: [{ practiceId: "p1" }],
});
assert.equal(customPublic?.heading, "Что послушать дальше", "CUSTOM_TITLE_PUBLIC_RENDER");

// EMPTY_TITLE_USES_DEFAULT
assert.equal(
  resolveAuthorRecommendationsTitle(""),
  "Рекомендации автора",
  "EMPTY_TITLE_USES_DEFAULT",
);
assert.equal(normalizeAuthorRecommendationsTitle(""), null);
assert.equal(normalizeAuthorRecommendationsTitle(null), null);

// WHITESPACE_TITLE_USES_DEFAULT
assert.equal(
  resolveAuthorRecommendationsTitle("   \n\t  "),
  "Рекомендации автора",
  "WHITESPACE_TITLE_USES_DEFAULT",
);
assert.equal(normalizeAuthorRecommendationsTitle("   "), null);

// TITLE_TRIMMED
assert.equal(
  normalizeAuthorRecommendationsTitle("  Продолжите знакомство  "),
  "Продолжите знакомство",
  "TITLE_TRIMMED",
);

// TITLE_MAX_80_ACCEPTED
const maxTitle = "я".repeat(80);
assert.equal(validateAuthorRecommendationsTitleLength(maxTitle), null, "TITLE_MAX_80_ACCEPTED");
assert.equal(normalizeAuthorRecommendationsTitle(maxTitle), maxTitle);

// TITLE_OVER_80_REJECTED
const overTitle = "я".repeat(81);
assert.equal(
  validateAuthorRecommendationsTitleLength(overTitle),
  "author_recommendations_title_too_long",
  "TITLE_OVER_80_REJECTED",
);
assert.equal(
  getProductFieldKeyForError("author_recommendations_title_too_long"),
  "authorRecommendationsTitle",
);
assert.match(
  getProductFieldErrorMessage("author_recommendations_title_too_long") ?? "",
  /80/,
);

// NO_RECOMMENDATIONS_NO_BLOCK
assert.equal(
  publicBlock({
    authorRecommendationsTitle: null,
    relatedProducts: [],
  }),
  null,
  "NO_RECOMMENDATIONS_NO_BLOCK",
);

const sixPublicCards = [1, 2, 3, 4, 5, 6].map((n) => ({ practiceId: `p${n}` }));
const publicFromLegacy = publicBlock({
  authorRecommendationsTitle: "Рекомендации автора",
  relatedProducts: sixPublicCards,
});
assert.equal(publicFromLegacy?.cards.length, 5, "public first 5 from legacy 6+");
assert.deepEqual(
  publicFromLegacy?.cards.map((item) => item.practiceId),
  ["p1", "p2", "p3", "p4", "p5"],
  "preserve stored order",
);
assert.equal(
  shouldRejectChangedAuthorRecommendations(
    sixPublicCards.map((item) => item.practiceId),
    sixPublicCards.map((item) => item.practiceId),
  ),
  false,
  "unchanged legacy list does not fail save",
);

// CUSTOM_TITLE_WITH_NO_RECOMMENDATIONS_NO_BLOCK
assert.equal(
  publicBlock({
    authorRecommendationsTitle: "Послушайте ещё",
    relatedProducts: [],
  }),
  null,
  "CUSTOM_TITLE_WITH_NO_RECOMMENDATIONS_NO_BLOCK",
);

const parsedSeo = parsePracticeSeoContent({
  usage_items: [],
  faq_items: [],
  related_practice_ids: ["33333333-3333-4333-8333-333333333333"],
});
assert.deepEqual(parsedSeo?.relatedPracticeIds, [
  "33333333-3333-4333-8333-333333333333",
]);
assert.equal("authorRecommendationsTitle" in (parsedSeo ?? {}), false);
assert.deepEqual(
  canAddRelatedProductId("44444444-4444-4444-8444-444444444444", [
    "33333333-3333-4333-8333-333333333333",
  ]),
  {
    ok: true,
    next: [
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
    ],
  },
);

const publicSections = read("src/components/products/PracticeSeoContentSections.tsx");
assert.match(publicSections, /content\.relatedProducts\.length \?/);
assert.match(publicSections, /content\.authorRecommendationsTitle/);
assert.doesNotMatch(
  publicSections,
  /Связанные продукты/,
  "PUBLIC_DEFAULT_HEADING_NO_LONGER_CONNECTED_PRODUCTS",
);
assert.match(
  read("src/components/products/practice-page/PracticePageMobile.tsx"),
  /PracticeSeoContentSections content=\{seoContent\}/,
);
assert.match(
  read("src/components/products/practice-page/PracticePageDesktop.tsx"),
  /PracticeSeoContentSections content=\{seoContent\}/,
);

const loader = read("src/lib/products/practice-seo-content.ts");
assert.match(loader, /catalog_visibility", "listed"/);
assert.match(loader, /is_catalog_listed", true/);
assert.match(loader, /status", "published"/);
assert.match(loader, /deleted_at", null/);
assert.match(loader, /p_related_practice_ids: content\.relatedPracticeIds/);
assert.match(loader, /resolveAuthorRecommendationsTitle/);
assert.doesNotMatch(
  loader,
  /export function resolveAuthorRecommendationsTitle/,
);

const patch = read("src/app/api/author/products/[id]/route.ts");
assert.match(patch, /author_recommendations_title/);
assert.match(patch, /validateAuthorRecommendationsTitleLength/);
assert.match(patch, /applyClearableTextField/);
assert.match(patch, /requirePracticeMutationAccess\(id\)/);
assert.match(patch, /validateRelatedPracticeTargets/);
assert.doesNotMatch(patch, /Рекомендации АудиоЛада/);

const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(form, /author_recommendations_title: form\.authorRecommendationsTitle/);
assert.match(form, /authorRecommendationsTitle=\{form\.authorRecommendationsTitle\}/);

const seoSection = read("src/components/author-dashboard/AuthorProductSeoSection.tsx");
assert.match(seoSection, /Рекомендации автора/);
assert.match(seoSection, /Заголовок блока/);
assert.match(seoSection, /placeholder="Рекомендации автора"/);
assert.match(
  seoSection,
  /Можно оставить стандартный заголовок или написать свой/,
);
assert.match(seoSection, /Найти продукт/);
assert.doesNotMatch(seoSection, /Связанные продукты/);
assert.doesNotMatch(seoSection, /Рекомендации АудиоЛада/);

const lookup = read("src/lib/products/lookup.ts");
assert.match(lookup, /author_recommendations_title/);

const page = read("src/app/(platform)/(listener)/practice/[...segments]/page.tsx");
assert.match(page, /practice\.author_recommendations_title/);
assert.match(page, /export const dynamic = "force-dynamic"/);

assert.equal(
  hasPracticePublicIndexNowChanges({
    author_recommendations_title: "Послушайте ещё",
  }),
  true,
  "CACHE_REVALIDATION_OK via existing IndexNow public-field list",
);
assert.equal(
  hasPracticeYandexRecrawlChanges({
    author_recommendations_title: "Послушайте ещё",
  }),
  false,
  "does not add a second Yandex Webmaster path",
);

const access = read("scripts/author-product-save-access-unit.mts");
assert.match(access, /Ordinary author cannot take another author's product/);
assert.match(patch, /requirePracticeMutationAccess\(id\)/);

const productsSelect = read("src/lib/author-products/products.ts");
assert.match(productsSelect, /author_recommendations_title/);

console.log("author-product-recommendations-title-unit: ok");
