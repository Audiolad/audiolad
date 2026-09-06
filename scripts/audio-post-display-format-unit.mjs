#!/usr/bin/env node
/**
 * Audio-post author-facing display type (Аудиопост / Аудиоэфир / custom).
 * Stored in practices.format. Does not change product_kind or publication_class.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { adaptLegacyCatalogSourceToCard } from "../src/lib/catalog/legacy-adapter.ts";
import {
  AUDIO_POST_CUSTOM_TYPE_FIELD_LABEL,
  AUDIO_POST_CUSTOM_TYPE_LABEL,
  AUDIO_POST_CUSTOM_TYPE_PLACEHOLDER,
  AUDIO_POST_PRESET_FORMATS,
  CUSTOM_FORMAT_VALUE,
  getAudioPostDisplayLabel,
  normalizeAudioPostStoredFormat,
  parseAudioPostFormat,
  parsePracticeFormat,
  PRODUCT_PRESET_FORMATS,
  resolveAudioPostFormatForStorage,
} from "../src/lib/author-products/format.ts";
import { productDetailToFormSnapshot } from "../src/lib/author-products/form-merge.ts";
import { AUDIO_POST_KIND_LABEL, PRODUCT_KIND } from "../src/lib/author-products/product-kind.ts";
import { getAuthorProductTypeLabel } from "../src/lib/authors/public-page.ts";
import { resolveFormatForPublish } from "../src/lib/author-products/publish.ts";
import { coercePracticeRow } from "../src/lib/author-products/types.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function practiceDetail(overrides = {}) {
  return {
    practice: {
      id: "11111111-1111-4111-8111-111111111111",
      author_id: "22222222-2222-4222-2222-222222222222",
      title: "Вечерний разговор",
      slug: "vecherniy-razgovor",
      subtitle: null,
      description: null,
      format: AUDIO_POST_KIND_LABEL,
      product_kind: PRODUCT_KIND.AUDIO_POST,
      publication_class: "post",
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
      listening_notice_enabled: false,
      listening_notice_title: "",
      listening_notice_text: "",
      promo_enabled: false,
      promo_title: null,
      promo_text: null,
      promo_button_text: null,
      promo_url: null,
      promo_open_in_new_tab: false,
      seo_primary_query: null,
      seo_secondary_queries: null,
      seo_title: null,
      seo_description: null,
      seo_about: null,
      author_recommendations_title: null,
      listener_appreciation_override: null,
      created_at: "2026-09-06T00:00:00.000Z",
      updated_at: "2026-09-06T00:00:00.000Z",
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

function audioPostPractice(overrides = {}) {
  return coercePracticeRow({
    id: "audio-post-1",
    author_id: "author-1",
    title: "Вечерний разговор",
    slug: "vecherniy-razgovor",
    subtitle: null,
    description: null,
    format: AUDIO_POST_KIND_LABEL,
    product_kind: PRODUCT_KIND.AUDIO_POST,
    publication_class: "post",
    music_usage_permission: null,
    duration_minutes: 12,
    price: 0,
    is_free: true,
    cover_url: null,
    use_shared_cover: true,
    audio_url: null,
    status: "draft",
    currency: "RUB",
    published_at: null,
    listening_notice_enabled: false,
    listening_notice_title: "",
    listening_notice_text: "",
    promo_enabled: false,
    created_at: "2026-09-06T00:00:00.000Z",
    updated_at: "2026-09-06T00:00:00.000Z",
    ...overrides,
  });
}

assert.deepEqual([...AUDIO_POST_PRESET_FORMATS], ["Аудиопост", "Аудиоэфир"]);
assert.equal(AUDIO_POST_CUSTOM_TYPE_LABEL, "Другое");
assert.equal(AUDIO_POST_CUSTOM_TYPE_FIELD_LABEL, "Название типа продукта");
assert.match(AUDIO_POST_CUSTOM_TYPE_PLACEHOLDER, /Аудиолекция/);
assert.ok(
  !PRODUCT_PRESET_FORMATS.includes("Аудиопост"),
  "audio-post presets must not appear in the practice format list",
);
assert.ok(!PRODUCT_PRESET_FORMATS.includes("Аудиоэфир"));

assert.deepEqual(parseAudioPostFormat(null), {
  preset: AUDIO_POST_KIND_LABEL,
  customFormat: "",
});
assert.deepEqual(parseAudioPostFormat(""), {
  preset: AUDIO_POST_KIND_LABEL,
  customFormat: "",
});
assert.deepEqual(parseAudioPostFormat("Аудиопост"), {
  preset: "Аудиопост",
  customFormat: "",
});
assert.deepEqual(parseAudioPostFormat("Аудиоэфир"), {
  preset: "Аудиоэфир",
  customFormat: "",
});
assert.deepEqual(parseAudioPostFormat("Мастер-класс"), {
  preset: CUSTOM_FORMAT_VALUE,
  customFormat: "Мастер-класс",
});
assert.deepEqual(parseAudioPostFormat("Другое"), {
  preset: CUSTOM_FORMAT_VALUE,
  customFormat: "",
});

assert.deepEqual(parsePracticeFormat("Аудиопост"), {
  preset: CUSTOM_FORMAT_VALUE,
  customFormat: "Аудиопост",
});

assert.deepEqual(resolveAudioPostFormatForStorage("", ""), {
  ok: true,
  format: AUDIO_POST_KIND_LABEL,
});
assert.deepEqual(resolveAudioPostFormatForStorage("Аудиопост", ""), {
  ok: true,
  format: "Аудиопост",
});
assert.deepEqual(resolveAudioPostFormatForStorage("Аудиоэфир", ""), {
  ok: true,
  format: "Аудиоэфир",
});
assert.deepEqual(
  resolveAudioPostFormatForStorage(CUSTOM_FORMAT_VALUE, "  Мастер-класс  "),
  { ok: true, format: "Мастер-класс" },
);
assert.deepEqual(resolveAudioPostFormatForStorage(CUSTOM_FORMAT_VALUE, "   "), {
  ok: false,
  error: "missing_custom_format",
});
assert.deepEqual(resolveAudioPostFormatForStorage(CUSTOM_FORMAT_VALUE, "Другое"), {
  ok: false,
  error: "missing_custom_format",
});
assert.deepEqual(
  resolveAudioPostFormatForStorage(CUSTOM_FORMAT_VALUE, "<b>Лекция</b>"),
  { ok: true, format: "Лекция" },
);
assert.deepEqual(
  resolveAudioPostFormatForStorage(CUSTOM_FORMAT_VALUE, "<b></b>"),
  { ok: false, error: "missing_custom_format" },
);
assert.deepEqual(
  resolveAudioPostFormatForStorage(CUSTOM_FORMAT_VALUE, "<script>alert(1)</script>"),
  { ok: true, format: "alert(1)" },
);
assert.equal(
  resolveAudioPostFormatForStorage(
    CUSTOM_FORMAT_VALUE,
    "x".repeat(61),
  ).ok,
  false,
);

assert.deepEqual(normalizeAudioPostStoredFormat("Другое"), {
  ok: false,
  error: "missing_custom_format",
});
assert.deepEqual(normalizeAudioPostStoredFormat("  Аудиоэфир  "), {
  ok: true,
  format: "Аудиоэфир",
});
assert.deepEqual(normalizeAudioPostStoredFormat(null), {
  ok: true,
  format: null,
});

assert.equal(getAudioPostDisplayLabel(null), "Аудиопост");
assert.equal(getAudioPostDisplayLabel(""), "Аудиопост");
assert.equal(getAudioPostDisplayLabel("Другое"), "Аудиопост");
assert.equal(getAudioPostDisplayLabel("Аудиоэфир"), "Аудиоэфир");
assert.equal(getAudioPostDisplayLabel("Мастер-класс"), "Мастер-класс");

assert.equal(getAuthorProductTypeLabel(null, "audio_post"), "Аудиопост");
assert.equal(getAuthorProductTypeLabel("Аудиоэфир", "audio_post"), "Аудиоэфир");
assert.equal(
  getAuthorProductTypeLabel("Разбор", "audio_post"),
  "Разбор",
);
assert.equal(
  getAuthorProductTypeLabel("Аудиоэфир", "practice"),
  "Аудиоэфир",
);
assert.equal(getAuthorProductTypeLabel(null, "music"), "Музыка");

assert.equal(
  resolveFormatForPublish(audioPostPractice()),
  AUDIO_POST_KIND_LABEL,
);
assert.equal(
  resolveFormatForPublish(audioPostPractice({ format: "Аудиоэфир" })),
  "Аудиоэфир",
);
assert.equal(
  resolveFormatForPublish(audioPostPractice({ format: "Мастер-класс" })),
  "Мастер-класс",
);
assert.equal(
  resolveFormatForPublish(audioPostPractice({ format: null })),
  AUDIO_POST_KIND_LABEL,
);

const defaultSnapshot = productDetailToFormSnapshot(practiceDetail());
assert.equal(defaultSnapshot.productKind, PRODUCT_KIND.AUDIO_POST);
assert.equal(defaultSnapshot.publicationClass, "post");
assert.equal(defaultSnapshot.formatPreset, "Аудиопост");
assert.equal(defaultSnapshot.customFormat, "");

const etherSnapshot = productDetailToFormSnapshot(
  practiceDetail({ format: "Аудиоэфир" }),
);
assert.equal(etherSnapshot.formatPreset, "Аудиоэфир");
assert.equal(etherSnapshot.customFormat, "");

const customSnapshot = productDetailToFormSnapshot(
  practiceDetail({ format: "Мастер-класс" }),
);
assert.equal(customSnapshot.formatPreset, CUSTOM_FORMAT_VALUE);
assert.equal(customSnapshot.customFormat, "Мастер-класс");

const legacySnapshot = productDetailToFormSnapshot(
  practiceDetail({ format: null }),
);
assert.equal(legacySnapshot.formatPreset, "Аудиопост");
assert.equal(legacySnapshot.customFormat, "");

const catalogDefault = adaptLegacyCatalogSourceToCard({
  id: "p1",
  slug: "post",
  title: "Разговор",
  format: "",
  productKind: "audio_post",
  publicationClass: "post",
  isFree: true,
  price: 0,
  coverUrl: "/cover.jpg",
  authorName: "Анна",
  authorSlug: "anna",
  href: "/practice/anna/post",
});
assert.equal(catalogDefault?.class, "post");
assert.equal(catalogDefault?.display_label, "Аудиопост");

const catalogCustom = adaptLegacyCatalogSourceToCard({
  id: "p2",
  slug: "master",
  title: "Разбор",
  format: "Мастер-класс",
  productKind: "audio_post",
  publicationClass: "post",
  isFree: true,
  price: 0,
  coverUrl: "/cover.jpg",
  authorName: "Анна",
  authorSlug: "anna",
  href: "/practice/anna/master",
});
assert.equal(catalogCustom?.class, "post");
assert.equal(catalogCustom?.display_label, "Мастер-класс");

const form = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(form, /AudioPostTypePicker/);
assert.match(form, /AUDIO_POST_CUSTOM_TYPE_LABEL/);
assert.match(form, /resolveAudioPostFormatForStorage/);
assert.doesNotMatch(
  form,
  /productKind === PRODUCT_KIND\.AUDIO_POST\s*\n\s*\? "Аудиопост"/,
);
assert.match(form, /Укажите название типа продукта/);

const api = read("src/app/api/author/products/[id]/route.ts");
assert.match(api, /normalizeAudioPostStoredFormat/);

const audioPostPage = read("src/components/products/audio-post/AudioPostPage.tsx");
assert.match(audioPostPage, /productTypeLabel \?\? AUDIO_POST_KIND_LABEL/);

const practicePage = read(
  "src/app/(platform)/(listener)/practice/[...segments]/page.tsx",
);
assert.match(practicePage, /getAudioPostDisplayLabel\(practice\.format\)/);

const catalog = read("src/lib/products/catalog.ts");
assert.match(catalog, /getAudioPostDisplayLabel\(practice\.format\)/);

console.log("audio-post-display-format-unit: ok");
