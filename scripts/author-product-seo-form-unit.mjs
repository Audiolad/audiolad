#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { productDetailToFormSnapshot } from "../src/lib/author-products/form-merge.ts";
import { parsePracticeSeoContent } from "../src/lib/products/practice-seo-content.ts";

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
  subtitle: null,
  description: null,
  format: null,
  product_kind: "practice",
  publication_class: "practice",
  music_usage_permission: null,
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
  listening_notice_enabled: true,
  listening_notice_title: null,
  listening_notice_text: null,
  seo_primary_query: "медитация для сна",
  seo_secondary_queries: ["практика перед сном"],
  seo_title: null,
  seo_description: null,
  seo_about: null,
  author_recommendations_title: null,
  status: "draft",
  moderation_status: "not_submitted",
  moderation_submitted_at: null,
  moderation_review_comment: null,
  moderation_attempt: 0,
  published_at: null,
  updated_at: null,
};
const oldProduct = { practice, seo_content: seoContent };
const newProduct = {
  practice: { ...practice },
  seo_content: parsePracticeSeoContent({
    usage_items: [{ content: "  Перед сном  " }, { content: "" }],
    faq_items: [
      { question: " Нужны ли наушники? ", answer: " По желанию. " },
      { question: "", answer: "" },
    ],
    related_practice_ids: ["33333333-3333-4333-8333-333333333333", ""],
    related_listen_slugs: [],
  }),
};
assert.deepEqual(newProduct.seo_content, seoContent);
assert.deepEqual(
  productDetailToFormSnapshot(oldProduct),
  productDetailToFormSnapshot(newProduct),
  "legacy seo_content is normalized to the same canonical form as new products",
);

const formSource = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(formSource, /seo_primary_query: form\.seoPrimaryQuery\.trim\(\) \|\| null/);
assert.match(formSource, /seo_secondary_queries: form\.seoSecondaryQueries\.map/);
assert.match(formSource, /seo_content:/);
assert.doesNotMatch(formSource, /wordstat|Wordstat/);

const seoSection = read("src/components/author-dashboard/AuthorProductSeoSection.tsx");
assert.match(seoSection, /Основной поисковый запрос/);
assert.match(seoSection, /Дополнительные поисковые фразы/);
assert.match(seoSection, /Введите одну или несколько фраз/);
assert.doesNotMatch(seoSection, /Wordstat|wordstat|Яндекс|Подобрать похожие/);

console.log("author-product-seo-form-unit: ok");
