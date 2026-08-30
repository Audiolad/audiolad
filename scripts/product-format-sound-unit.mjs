#!/usr/bin/env node
/**
 * Ordinary product format «Звук».
 * Stored as the Russian display label (same convention as «Медитация»).
 * Not a product_kind, not music, not a separate cabinet.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { adaptLegacyCatalogSourceToCard } from "../src/lib/catalog/legacy-adapter.ts";
import { evaluateDatabaseModerationReady } from "../src/lib/author-products/database-moderation-ready.ts";
import {
  CUSTOM_FORMAT_VALUE,
  getDisplayFormat,
  isPresetFormat,
  MUSIC_PRESET_FORMATS,
  parsePracticeFormat,
  PRODUCT_PRESET_FORMATS,
  resolveFormatForStorage,
} from "../src/lib/author-products/format.ts";
import { productDetailToFormSnapshot } from "../src/lib/author-products/form-merge.ts";
import { validateStoredFormatLength } from "../src/lib/author-products/limits.ts";
import {
  MUSIC_KIND_LABEL,
  PRODUCT_KIND,
} from "../src/lib/author-products/product-kind.ts";
import {
  resolveFormatForPublish,
  validatePublishRequirements,
} from "../src/lib/author-products/publish.ts";
import { coercePracticeRow } from "../src/lib/author-products/types.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOUND_FORMAT = "Звук";

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function practiceDetail(overrides = {}) {
  return {
    practice: {
      id: "11111111-1111-4111-8111-111111111111",
      author_id: "22222222-2222-4222-8222-222222222222",
      title: "Звук дождя для сна",
      slug: "zvuk-dozhdya-dlya-sna",
      subtitle: "Спокойный режим",
      description: "Фоновый звук дождя для вечернего прослушивания.",
      format: SOUND_FORMAT,
      product_kind: PRODUCT_KIND.PRACTICE,
      publication_class: "practice",
      music_usage_permission: null,
      duration_minutes: 30,
      price: 0,
      is_free: true,
      is_catalog_listed: true,
      catalog_visibility: "listed",
      cover_url: "https://example.com/cover.jpg",
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
      seo_secondary_queries: null,
      seo_title: null,
      seo_description: null,
      seo_about: null,
      author_recommendations_title: null,
      created_at: "2026-08-30T00:00:00.000Z",
      updated_at: "2026-08-30T00:00:00.000Z",
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

function basePractice(overrides = {}) {
  return coercePracticeRow({
    id: "p1",
    author_id: "a1",
    title: "Звук дождя для сна",
    slug: "zvuk-dozhdya-dlya-sna",
    subtitle: null,
    description: "Фоновый звук дождя для вечернего прослушивания.",
    format: SOUND_FORMAT,
    product_kind: PRODUCT_KIND.PRACTICE,
    music_usage_permission: null,
    duration_minutes: 30,
    price: 0,
    is_free: true,
    cover_url: "https://example.com/cover.jpg",
    use_shared_cover: true,
    audio_url: null,
    status: "draft",
    currency: "RUB",
    published_at: null,
    listening_notice_enabled: false,
    listening_notice_title: "",
    listening_notice_text: "",
    created_at: "2026-08-30T00:00:00.000Z",
    updated_at: "2026-08-30T00:00:00.000Z",
    ...overrides,
  });
}

function audioItem(position, overrides = {}) {
  return {
    id: `audio-${position}`,
    practice_id: "p1",
    title: `Аудио ${position}`,
    description: null,
    audio_path: `practices/p1/audio/audio-${position}.mp3`,
    cover_url: null,
    duration_seconds: 120,
    original_file_name: `track-${position}.mp3`,
    file_size_bytes: 1024,
    position,
    is_preview: false,
    status: "draft",
    created_at: "2026-08-30T00:00:00.000Z",
    updated_at: "2026-08-30T00:00:00.000Z",
    ...overrides,
  };
}

const EXISTING_PRODUCT_PRESETS = [
  "Аудиопрактика",
  "Медитация",
  "Энергетическая практика",
  "Визуализация",
  "Авторский аудиоподкаст",
  "Лекция",
  "Программа аудиопрактик",
  "Аудиокурс",
  "Цикл практик",
  "Сборник",
  "Аудиокнига",
];

const EXISTING_MUSIC_PRESETS = [
  "Музыкальный трек",
  "Музыкальный альбом",
  "Медитативная музыка",
];

assert.equal(
  PRODUCT_PRESET_FORMATS.includes(SOUND_FORMAT),
  true,
  "picker presets include Звук",
);
assert.equal(SOUND_FORMAT, "Звук");
assert.notEqual(SOUND_FORMAT, "Звуки");
assert.notEqual(SOUND_FORMAT, "Белый шум");
assert.notEqual(SOUND_FORMAT, "Фоновый звук");
assert.notEqual(SOUND_FORMAT, "sound");

for (const format of EXISTING_PRODUCT_PRESETS) {
  assert.equal(
    PRODUCT_PRESET_FORMATS.includes(format),
    true,
    `existing product format still present: ${format}`,
  );
}

for (const format of EXISTING_MUSIC_PRESETS) {
  assert.equal(
    MUSIC_PRESET_FORMATS.includes(format),
    true,
    `existing music format still present: ${format}`,
  );
}

assert.equal(
  MUSIC_PRESET_FORMATS.includes(SOUND_FORMAT),
  false,
  "Звук is not a music preset",
);
assert.equal(MUSIC_KIND_LABEL, "Музыка");
assert.equal(PRODUCT_KIND.MUSIC, "music");
assert.equal(PRODUCT_KIND.PRACTICE, "practice");
assert.equal("SOUND" in PRODUCT_KIND, false);
assert.equal("sound" in PRODUCT_KIND, false);

assert.equal(isPresetFormat(SOUND_FORMAT), true);
assert.equal(isPresetFormat("sound"), false);
assert.equal(isPresetFormat("Звуки"), false);
assert.equal(isPresetFormat("Белый шум"), false);

const stored = resolveFormatForStorage(SOUND_FORMAT, "");
assert.equal(stored, SOUND_FORMAT);
assert.equal(validateStoredFormatLength(stored), null);

const parsed = parsePracticeFormat(stored);
assert.deepEqual(parsed, { preset: SOUND_FORMAT, customFormat: "" });

const snapshot = productDetailToFormSnapshot(practiceDetail());
assert.equal(snapshot.formatPreset, SOUND_FORMAT);
assert.equal(snapshot.customFormat, "");
assert.equal(snapshot.productKind, PRODUCT_KIND.PRACTICE);
assert.equal(snapshot.musicUsagePermission, null);
assert.equal(
  resolveFormatForStorage(snapshot.formatPreset, snapshot.customFormat),
  SOUND_FORMAT,
);

const customParsed = parsePracticeFormat("Белый шум");
assert.deepEqual(customParsed, {
  preset: CUSTOM_FORMAT_VALUE,
  customFormat: "Белый шум",
});

assert.equal(getDisplayFormat(SOUND_FORMAT), SOUND_FORMAT);
assert.equal(getDisplayFormat(`  ${SOUND_FORMAT}  `), SOUND_FORMAT);

const catalogCard = adaptLegacyCatalogSourceToCard({
  id: "sound-1",
  slug: "zvuk-dozhdya-dlya-sna",
  title: "Звук дождя для сна",
  format: SOUND_FORMAT,
  productKind: "practice",
  price: 0,
  isFree: true,
  coverUrl: "/cover.jpg",
  authorName: "Анна",
  authorSlug: "anna",
  href: "/practice/anna/zvuk-dozhdya-dlya-sna",
});
assert.equal(catalogCard?.display_label, SOUND_FORMAT);
assert.equal(catalogCard?.class, "practice");

const catalogModule = read("src/lib/products/catalog.ts");
assert.match(catalogModule, /CATALOG_PROGRAM_FORMATS = new Set\(\[/);
assert.doesNotMatch(
  catalogModule,
  /CATALOG_PROGRAM_FORMATS = new Set\(\[[^\]]*Звук/,
  "Звук is not a computed program format",
);

assert.equal(
  resolveFormatForPublish(basePractice()),
  SOUND_FORMAT,
);
assert.equal(
  resolveFormatForPublish(
    basePractice({
      product_kind: PRODUCT_KIND.MUSIC,
      music_usage_permission: "listen_only",
      format: SOUND_FORMAT,
    }),
  ),
  MUSIC_KIND_LABEL,
  "music kind still stores/shows Музыка even if format is Звук",
);

{
  const result = validatePublishRequirements(
    basePractice(),
    [audioItem(1)],
    undefined,
    1,
  );
  assert.equal(result.ok, true, result.message);
}

{
  const result = validatePublishRequirements(
    basePractice({
      product_kind: PRODUCT_KIND.MUSIC,
      music_usage_permission: "listen_only",
      format: SOUND_FORMAT,
    }),
    [audioItem(1)],
    undefined,
    1,
  );
  assert.equal(result.ok, true, result.message);
}

{
  const ready = evaluateDatabaseModerationReady({
    practice: basePractice(),
    audioItems: [audioItem(1)],
    accessStatus: "free",
    activeTopicCount: 1,
  });
  const formatCheck = ready.checks.find((item) => item.code === "invalid_format");
  assert.equal(formatCheck?.ok, true, formatCheck?.message ?? "format check missing");
}

{
  const musicReady = evaluateDatabaseModerationReady({
    practice: basePractice({
      product_kind: PRODUCT_KIND.MUSIC,
      music_usage_permission: "listen_only",
      format: MUSIC_KIND_LABEL,
    }),
    audioItems: [audioItem(1)],
    accessStatus: "free",
    activeTopicCount: 1,
  });
  const formatCheck = musicReady.checks.find(
    (item) => item.code === "invalid_format",
  );
  assert.equal(formatCheck?.ok, true, formatCheck?.message ?? "music format check missing");
}

const formatModule = read("src/lib/author-products/format.ts");
assert.match(formatModule, /"Звук"/);
assert.doesNotMatch(formatModule, /"sound"/);
assert.doesNotMatch(formatModule, /"Звуки"/);
assert.doesNotMatch(formatModule, /"Белый шум"/);
assert.match(formatModule, /MUSIC_PRESET_FORMATS = \[/);

const productForm = read("src/components/author-dashboard/AuthorProductForm.tsx");
assert.match(productForm, /PRODUCT_PRESET_FORMATS\.map/);
assert.match(
  productForm,
  /form\.productKind === PRODUCT_KIND\.PRACTICE \? \(/,
);
assert.match(
  productForm,
  /form\.productKind === PRODUCT_KIND\.MUSIC\s*\n\s*\? MUSIC_KIND_LABEL/,
);
assert.doesNotMatch(productForm, /product_kind\s*[:=]\s*["']sound["']/);
assert.doesNotMatch(productForm, /SOUND_KIND/);

const productKind = read("src/lib/author-products/product-kind.ts");
assert.match(productKind, /MUSIC: "music"/);
assert.match(productKind, /PRACTICE: "practice"/);
assert.doesNotMatch(productKind, /SOUND/);
assert.match(productKind, /MUSIC_KIND_LABEL = "Музыка"/);

console.log("product-format-sound-unit: ok");
