#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateDatabaseModerationReady } from "../src/lib/author-products/database-moderation-ready.ts";
import { evaluatePublishReadiness } from "../src/lib/author-products/publish.ts";
import { coercePracticeRow } from "../src/lib/author-products/types.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function practice(overrides = {}) {
  return coercePracticeRow({
    id: "product-1",
    author_id: "author-1",
    title: "Минимальный продукт",
    slug: null,
    subtitle: null,
    description: null,
    format: null,
    product_kind: "practice",
    publication_class: "audio_product",
    music_usage_permission: null,
    duration_minutes: null,
    price: 0,
    is_free: true,
    cover_url: null,
    use_shared_cover: false,
    audio_url: null,
    status: "draft",
    moderation_status: "not_submitted",
    currency: null,
    published_at: null,
    listening_notice_enabled: false,
    listening_notice_title: null,
    listening_notice_text: null,
    promo_enabled: false,
    promo_title: null,
    promo_text: null,
    promo_button_text: null,
    promo_url: null,
    promo_open_in_new_tab: false,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  });
}

function audio(position, overrides = {}) {
  return {
    id: `audio-${position}`,
    practice_id: "product-1",
    title: "",
    description: "   ",
    audio_path: `practices/product-1/${position}.mp3`,
    cover_url: null,
    duration_seconds: 60,
    original_file_name: `${position}.mp3`,
    file_size_bytes: 1024,
    position,
    is_preview: false,
    status: "draft",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

for (const description of [null, "", "   "]) {
  const minimal = practice({ description });
  const tracks = [audio(1), audio(2, { description })];

  const readiness = evaluatePublishReadiness(minimal, tracks, {
    activeTopicCount: 0,
  });
  assert.equal(readiness.ok, true, readiness.firstFailure?.message);

  const dbReadiness = evaluateDatabaseModerationReady({
    practice: minimal,
    audioItems: tracks,
    accessStatus: "free",
    activeTopicCount: 0,
  });
  assert.equal(dbReadiness.ok, true, dbReadiness.firstFailure?.message);
}

assert.equal(
  evaluatePublishReadiness(practice({ title: "  " }), [audio(1)], {
    activeTopicCount: 0,
  }).firstFailure?.code,
  "missing_title",
);
assert.equal(
  evaluatePublishReadiness(practice(), [], { activeTopicCount: 0 }).firstFailure
    ?.code,
  "missing_audio",
);
assert.equal(
  evaluatePublishReadiness(practice(), [audio(1, { audio_path: null })], {
    activeTopicCount: 0,
  }).firstFailure?.code,
  "missing_audio_file",
);

const migration = readFileSync(
  path.join(
    root,
    "supabase/migrations/20260913120000_minimal_product_moderation_readiness.sql",
  ),
  "utf8",
);
assert.match(migration, /CREATE OR REPLACE FUNCTION public\.assert_practice_moderation_ready/);
assert.match(migration, /DETAIL = 'missing_title'/);
assert.match(migration, /DETAIL = 'missing_audio'/);
assert.match(migration, /DETAIL = 'incomplete_audio'/);
assert.doesNotMatch(migration, /missing_description|missing_cover|slug_required|topic_min_required/);

console.log("author-product-minimal-moderation-readiness-unit: ok");
