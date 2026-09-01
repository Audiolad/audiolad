#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUDIO_POST_KIND_LABEL,
  PRODUCT_KIND,
  assertMusicUsagePermissionForKind,
  getProductKindLabel,
  isAudioPostProductKind,
  normalizeProductKind,
} from "../src/lib/author-products/product-kind.ts";
import {
  evaluatePublishReadiness,
  resolveFormatForPublish,
  validateAudioItemsStructure,
} from "../src/lib/author-products/publish.ts";
import { coercePracticeRow } from "../src/lib/author-products/types.ts";
import {
  resolvePublicPromoRecommendation,
  validatePromoRecommendation,
} from "../src/lib/products/promo-recommendation.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function basePractice(overrides = {}) {
  return coercePracticeRow({
    id: "audio-post-1",
    author_id: "author-1",
    title: "Аудиопост",
    slug: "audio-post",
    subtitle: null,
    description: "Описание аудиопоста.",
    format: AUDIO_POST_KIND_LABEL,
    product_kind: PRODUCT_KIND.AUDIO_POST,
    music_usage_permission: null,
    duration_minutes: 2,
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
    promo_enabled: true,
    promo_title: "Продолжите знакомство",
    promo_text: "Откройте следующую практику автора.",
    promo_button_text: "Открыть",
    promo_url: "/practice/author/next",
    promo_open_in_new_tab: false,
    created_at: "2026-08-05T00:00:00.000Z",
    updated_at: "2026-08-05T00:00:00.000Z",
    ...overrides,
  });
}

function audioItem(position, overrides = {}) {
  return {
    id: `audio-${position}`,
    practice_id: "audio-post-1",
    title: "Аудиопост",
    description: null,
    audio_path: "practices/audio-post-1/audio.mp3",
    cover_url: null,
    duration_seconds: 120,
    original_file_name: "audio.mp3",
    file_size_bytes: 1024,
    position,
    is_preview: false,
    status: "draft",
    created_at: "2026-08-05T00:00:00.000Z",
    updated_at: "2026-08-05T00:00:00.000Z",
    ...overrides,
  };
}

assert.equal(normalizeProductKind("audio_post"), PRODUCT_KIND.AUDIO_POST);
assert.equal(isAudioPostProductKind("audio_post"), true);
assert.equal(getProductKindLabel("audio_post"), AUDIO_POST_KIND_LABEL);
assert.equal(resolveFormatForPublish(basePractice()), AUDIO_POST_KIND_LABEL);

const usage = assertMusicUsagePermissionForKind(
  PRODUCT_KIND.AUDIO_POST,
  "listen_only",
);
assert.equal(usage.ok, false);

assert.equal(validateAudioItemsStructure(basePractice(), [audioItem(1)]).ok, true);
assert.equal(
  validateAudioItemsStructure(basePractice(), [audioItem(1), audioItem(2)]).code,
  "audio_post_requires_single_audio",
);

const readiness = evaluatePublishReadiness(basePractice(), [audioItem(1)], {
  activeTopicCount: 1,
});
assert.equal(readiness.ok, true, readiness.firstFailure?.message);

const noDescription = evaluatePublishReadiness(
  basePractice({ description: null }),
  [audioItem(1)],
  { activeTopicCount: 1 },
);
assert.equal(noDescription.ok, true, noDescription.firstFailure?.message);
assert.equal(
  noDescription.requirements.find((item) => item.key === "description")?.ok,
  undefined,
);

const emptyDescription = evaluatePublishReadiness(
  basePractice({ description: "   " }),
  [audioItem(1)],
  { activeTopicCount: 1 },
);
assert.equal(emptyDescription.ok, true, emptyDescription.firstFailure?.message);

const missingTitle = evaluatePublishReadiness(
  basePractice({ title: "" }),
  [audioItem(1)],
  { activeTopicCount: 1 },
);
assert.equal(missingTitle.firstFailure?.code, "missing_title");

const missingAudio = evaluatePublishReadiness(basePractice(), [], {
  activeTopicCount: 1,
});
assert.equal(
  missingAudio.firstFailure?.code,
  "audio_post_requires_single_audio",
);

const incompletePromo = evaluatePublishReadiness(
  basePractice({
    promo_enabled: true,
    promo_title: "",
    promo_text: "Текст",
    promo_button_text: "Кнопка",
    promo_url: "/catalog",
  }),
  [audioItem(1)],
  { activeTopicCount: 1 },
);
assert.equal(incompletePromo.firstFailure?.code, "promo_title_required");

const practiceWithoutDescription = evaluatePublishReadiness(
  basePractice({
    product_kind: PRODUCT_KIND.PRACTICE,
    format: "Медитация",
    description: null,
    promo_enabled: false,
  }),
  [audioItem(1)],
  { activeTopicCount: 1 },
);
assert.equal(practiceWithoutDescription.ok, true);

const musicWithoutDescription = evaluatePublishReadiness(
  basePractice({
    product_kind: PRODUCT_KIND.MUSIC,
    format: "Музыка",
    music_usage_permission: "listen_only",
    description: "",
    promo_enabled: false,
  }),
  [audioItem(1)],
  { activeTopicCount: 1 },
);
assert.equal(musicWithoutDescription.ok, true);

const paidAudioPost = evaluatePublishReadiness(
  basePractice({ is_free: false, price: 99 }),
  [audioItem(1)],
  { activeTopicCount: 1 },
);
assert.equal(paidAudioPost.firstFailure?.code, "audio_post_must_be_free");

assert.equal(
  validatePromoRecommendation({
    promo_enabled: true,
    promo_title: "Заголовок",
    promo_text: "Текст",
    promo_button_text: "Кнопка",
    promo_url: "javascript:alert(1)",
  }).code,
  "promo_url_invalid",
);
assert.equal(
  resolvePublicPromoRecommendation({
    promo_enabled: true,
    promo_title: "Заголовок",
    promo_text: "Текст",
    promo_button_text: "Кнопка",
    promo_url: "/catalog",
    promo_open_in_new_tab: false,
  })?.target.href,
  "/catalog",
);

const migration = readFileSync(
  path.join(
    root,
    "supabase/migrations/20260805120000_practice_product_kind_audio_post.sql",
  ),
  "utf8",
);
assert.match(migration, /'practice', 'music', 'audio_post'/);
assert.match(migration, /audio_post_requires_single_audio/);
assert.match(migration, /audio_post_must_be_free/);
assert.match(migration, /promo_title_required/);
assert.match(migration, /v_product_kind = 'audio_post' THEN 'аудиопост'/);
assert.match(migration, /product_kind IN \('practice', 'music'\)/);

const descriptionMigration = readFileSync(
  path.join(
    root,
    "supabase/migrations/20260805193000_audio_post_optional_description.sql",
  ),
  "utf8",
);
assert.match(
  descriptionMigration,
  /product_kind <> 'audio_post'[\s\S]*missing_description/,
);
assert.match(descriptionMigration, /internal-moderation-readiness:v3/);

console.log("product-kind-audio-post-unit: ok");
