#!/usr/bin/env node
/**
 * Unit tests for music product_kind helpers and publish validation.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  MUSIC_USAGE_PERMISSION,
  PRODUCT_KIND,
  PRODUCT_KIND_LOCKED_AFTER_PUBLISH,
  assertMusicUsagePermissionForKind,
  canChangeProductKind,
  getMusicProductTypeLabel,
  getMusicReleaseLabel,
  getMusicUsagePermissionDescription,
  getMusicUsagePermissionLabel,
  normalizeProductKind,
} from "../src/lib/author-products/product-kind.ts";
import {
  evaluatePublishReadiness,
  resolveFormatForPublish,
  validatePublishRequirements,
} from "../src/lib/author-products/publish.ts";
import { coercePracticeRow } from "../src/lib/author-products/types.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function basePractice(overrides = {}) {
  return coercePracticeRow({
    id: "p1",
    author_id: "a1",
    title: "Test music",
    slug: "test-music",
    subtitle: null,
    description: "Описание музыкального продукта для публикации.",
    format: "Музыкальный трек",
    product_kind: PRODUCT_KIND.MUSIC,
    music_usage_permission: MUSIC_USAGE_PERMISSION.LISTEN_ONLY,
    duration_minutes: 5,
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
    created_at: "2026-07-29T00:00:00.000Z",
    updated_at: "2026-07-29T00:00:00.000Z",
    ...overrides,
  });
}

function audioItem(position, overrides = {}) {
  return {
    id: `audio-${position}`,
    practice_id: "p1",
    title: `Трек ${position}`,
    description: null,
    audio_path: `practices/p1/audio/audio-${position}.mp3`,
    cover_url: null,
    duration_seconds: 120,
    original_file_name: `track-${position}.mp3`,
    file_size_bytes: 1024,
    position,
    is_preview: false,
    status: "draft",
    created_at: "2026-07-29T00:00:00.000Z",
    updated_at: "2026-07-29T00:00:00.000Z",
    ...overrides,
  };
}

// 1. Existing product without explicit kind → practice
assert.equal(normalizeProductKind(null), PRODUCT_KIND.PRACTICE);
assert.equal(normalizeProductKind(undefined), PRODUCT_KIND.PRACTICE);
assert.equal(normalizeProductKind(""), PRODUCT_KIND.PRACTICE);
assert.equal(coercePracticeRow({
  ...basePractice({ product_kind: null, music_usage_permission: null }),
}).product_kind, PRODUCT_KIND.PRACTICE);

// 2–3. Draft kind switching helpers
assert.equal(canChangeProductKind(null), true);
assert.equal(canChangeProductKind(undefined), true);
assert.equal(canChangeProductKind("2026-07-01T00:00:00.000Z"), false);

// 4. Lock constant used by API
assert.equal(PRODUCT_KIND_LOCKED_AFTER_PUBLISH, "PRODUCT_KIND_LOCKED_AFTER_PUBLISH");

// 5–6. Release labels from audio count
assert.equal(getMusicReleaseLabel(1), "Музыкальный трек");
assert.equal(getMusicReleaseLabel(2), "Музыкальный альбом");
assert.equal(getMusicProductTypeLabel(), "Музыка");

assert.equal(
  getMusicUsagePermissionLabel(MUSIC_USAGE_PERMISSION.LISTEN_ONLY),
  "Только для прослушивания",
);
assert.equal(
  getMusicUsagePermissionLabel(MUSIC_USAGE_PERMISSION.PLATFORM_REUSE_ALLOWED),
  "Для прослушивания и использования авторами",
);
assert.match(
  getMusicUsagePermissionDescription(MUSIC_USAGE_PERMISSION.LISTEN_ONLY) ?? "",
  /при создании аудиопродуктов других авторов/,
);
assert.match(
  getMusicUsagePermissionDescription(
    MUSIC_USAGE_PERMISSION.PLATFORM_REUSE_ALLOWED,
  ) ?? "",
  /добавлять поверх неё голос/,
);

// 7. Music publish requires usage permission
{
  const practice = basePractice({ music_usage_permission: null });
  const result = validatePublishRequirements(
    practice,
    [audioItem(1)],
    undefined,
    1,
  );
  assert.equal(result.ok, false);
  assert.equal(result.code, "missing_music_usage_permission");
}

// 8. Practice cannot have music_usage_permission
{
  const check = assertMusicUsagePermissionForKind(
    PRODUCT_KIND.PRACTICE,
    MUSIC_USAGE_PERMISSION.LISTEN_ONLY,
  );
  assert.equal(check.ok, false);
  assert.equal(check.code, "music_usage_not_allowed_for_practice");
}

// Publish music with one track
{
  const readiness = evaluatePublishReadiness(
    basePractice(),
    [audioItem(1)],
    { activeTopicCount: 1 },
  );
  assert.equal(readiness.ok, true, readiness.firstFailure?.message);
}

// Publish music with several tracks (no author format required)
{
  const practice = basePractice({ format: null });
  const readiness = evaluatePublishReadiness(
    practice,
    [audioItem(1), audioItem(2), audioItem(3)],
    { activeTopicCount: 1 },
  );
  assert.equal(readiness.ok, true, readiness.firstFailure?.message);
  assert.equal(resolveFormatForPublish(practice), "Музыка");
}

// Music format is always the system label «Музыка»
assert.equal(
  resolveFormatForPublish(basePractice({ format: "Медитативная музыка" })),
  "Музыка",
);
assert.equal(
  resolveFormatForPublish(basePractice({ format: null })),
  "Музыка",
);

// Legacy practice still publishes without music_usage requirement
{
  const practice = basePractice({
    product_kind: PRODUCT_KIND.PRACTICE,
    music_usage_permission: null,
    format: "Медитация",
    title: "Практика",
  });
  const readiness = evaluatePublishReadiness(
    practice,
    [audioItem(1, { title: "Аудио 1" })],
    { activeTopicCount: 1 },
  );
  assert.equal(readiness.ok, true, readiness.firstFailure?.message);
  assert.equal(
    readiness.requirements.some((item) => item.key === "music_usage"),
    false,
  );
}

// Migration + API wiring smoke (source)
const migration = read(
  "supabase/migrations/20260729200000_practice_product_kind_music.sql",
);
assert.match(migration, /product_kind/);
assert.match(migration, /music_usage_permission/);
assert.match(migration, /PRODUCT_KIND_LOCKED_AFTER_PUBLISH/);
assert.match(migration, /listen_only/);
assert.match(migration, /platform_reuse_allowed/);

const patchRoute = read("src/app/api/author/products/[id]/route.ts");
assert.match(patchRoute, /product_kind/);
assert.match(patchRoute, /music_usage_permission/);
assert.match(patchRoute, /PRODUCT_KIND_LOCKED_AFTER_PUBLISH/);

const createRoute = read("src/app/api/author/products/route.ts");
assert.match(createRoute, /product_kind/);

const topicHubs = read("src/lib/seo/topic-hubs/load.ts");
assert.match(topicHubs, /PRODUCT_KIND\.PRACTICE/);

const articles = read("src/lib/seo/articles/load.ts");
assert.match(articles, /PRODUCT_KIND\.PRACTICE/);

console.log("product-kind-music-unit: ok");
