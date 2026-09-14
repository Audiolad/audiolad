import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateDatabaseModerationReady } from "../src/lib/author-products/database-moderation-ready";
import {
  evaluatePublishReadiness,
  validateAudioItemsStructure,
} from "../src/lib/author-products/publish";
import { coercePracticeRow, type AudioItemRow } from "../src/lib/author-products/types";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

function practice(overrides: Record<string, unknown> = {}) {
  return coercePracticeRow({
    id: "music-1",
    author_id: "author-1",
    title: "Музыкальный релиз",
    slug: "",
    subtitle: null,
    description: null,
    format: null,
    product_kind: "music",
    publication_class: "release",
    music_usage_permission: null,
    duration_minutes: null,
    price: 0,
    is_free: true,
    cover_url: null,
    use_shared_cover: false,
    audio_url: null,
    status: "draft",
    moderation_status: "not_submitted",
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
    created_at: "2026-09-14T00:00:00.000Z",
    updated_at: "2026-09-14T00:00:00.000Z",
    ...overrides,
  });
}

function track(overrides: Partial<AudioItemRow> = {}): AudioItemRow {
  return {
    id: "audio-1",
    practice_id: "music-1",
    title: "Трек 1",
    description: null,
    audio_path: null,
    cover_url: null,
    duration_seconds: null,
    original_file_name: null,
    file_size_bytes: null,
    position: 1,
    is_preview: false,
    status: "draft",
    created_at: "2026-09-14T00:00:00.000Z",
    updated_at: "2026-09-14T00:00:00.000Z",
    active_music_delivery_asset_id: null,
    desired_music_master_asset_id: null,
    music_master: null,
    ...overrides,
  };
}

const music = practice();
const nonMusic = practice({ product_kind: "practice", publication_class: "audio_product", id: "practice-1" });

// 1. direct MP3 PASS
{
  const item = track({ audio_path: "practices/music-1/a.mp3", duration_seconds: 120 });
  assert.equal(validateAudioItemsStructure(music, [item]).ok, true);
  assert.equal(evaluatePublishReadiness(music, [item], { activeTopicCount: 0 }).ok, true);
}

// 2. active verified WAV stream, path NULL PASS
{
  const item = track({
    audio_path: null,
    active_music_delivery_asset_id: "stream-1",
    duration_seconds: 42,
    music_master: {
      assetId: "master-1",
      lifecycleState: "verified",
      transcodeStatus: "ready",
      hasActiveDelivery: true,
    },
  });
  assert.equal(validateAudioItemsStructure(music, [item]).ok, true);
  assert.equal(evaluatePublishReadiness(music, [item], { activeTopicCount: 0 }).ok, true);
  assert.equal(
    evaluateDatabaseModerationReady({
      practice: music,
      audioItems: [item],
      accessStatus: "full",
      activeTopicCount: 0,
    }).ok,
    true,
  );
}

// 3. first WAV processing FAIL
{
  const item = track({
    music_master: {
      assetId: "master-1",
      lifecycleState: "verified",
      transcodeStatus: "processing",
      hasActiveDelivery: false,
    },
  });
  const result = validateAudioItemsStructure(music, [item]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "missing_audio_file");
    assert.match(result.message, /Загрузите аудио для трека 1/);
    assert.doesNotMatch(result.message, /MP3-файл/);
  }
}

// 4. ready job without active FAIL
{
  const item = track({
    music_master: {
      assetId: "master-1",
      lifecycleState: "verified",
      transcodeStatus: "ready",
      hasActiveDelivery: false,
    },
  });
  assert.equal(validateAudioItemsStructure(music, [item]).ok, false);
}

// 5. replacement WAV processing + old active PASS
{
  const item = track({
    active_music_delivery_asset_id: "stream-old",
    duration_seconds: 40,
    music_master: {
      assetId: "master-new",
      lifecycleState: "verified",
      transcodeStatus: "processing",
      hasActiveDelivery: true,
    },
  });
  assert.equal(validateAudioItemsStructure(music, [item]).ok, true);
}

// 6. replacement WAV processing + old direct MP3 PASS
{
  const item = track({
    audio_path: "practices/music-1/old.mp3",
    duration_seconds: 55,
    music_master: {
      assetId: "master-new",
      lifecycleState: "verified",
      transcodeStatus: "processing",
      hasActiveDelivery: false,
    },
  });
  assert.equal(validateAudioItemsStructure(music, [item]).ok, true);
}

// 7. no path, no active FAIL
{
  const item = track({ audio_path: null, active_music_delivery_asset_id: null, duration_seconds: 10 });
  assert.equal(validateAudioItemsStructure(music, [item]).ok, false);
}

// 7b. bare pointer without validated delivery FAIL
{
  const item = track({
    audio_path: null,
    active_music_delivery_asset_id: "stream-1",
    duration_seconds: 42,
    music_master: {
      assetId: "master-1",
      lifecycleState: "verified",
      transcodeStatus: "ready",
      hasActiveDelivery: false,
    },
  });
  const result = validateAudioItemsStructure(music, [item]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "missing_audio_file");
  }
  assert.equal(
    evaluateDatabaseModerationReady({
      practice: music,
      audioItems: [item],
      accessStatus: "full",
      activeTopicCount: 0,
    }).ok,
    false,
  );
}

// 8. non-music MP3 unchanged
{
  const item = track({
    practice_id: "practice-1",
    audio_path: null,
    duration_seconds: 10,
    active_music_delivery_asset_id: "stream-1",
    music_master: {
      assetId: "m",
      lifecycleState: "verified",
      transcodeStatus: "ready",
      hasActiveDelivery: true,
    },
  });
  const result = validateAudioItemsStructure(nonMusic, [item]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /Загрузите MP3-файл для аудио 1/);
  }
}

// 9. active WAV duration PASS already covered; missing duration FAIL
{
  const item = track({
    active_music_delivery_asset_id: "stream-1",
    duration_seconds: null,
    music_master: {
      assetId: "master-1",
      lifecycleState: "verified",
      transcodeStatus: "ready",
      hasActiveDelivery: true,
    },
  });
  const result = validateAudioItemsStructure(music, [item]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "missing_audio_duration");
    assert.match(result.message, /длительность трека 1/);
    assert.doesNotMatch(result.message, /MP3/);
  }
}

// 11. no MP3 wording in music readiness failure
{
  const message =
    evaluatePublishReadiness(music, [track()], { activeTopicCount: 0 }).firstFailure
      ?.message ?? "";
  assert.doesNotMatch(message, /Загрузите MP3-файл/);
}

const publish = read("src/lib/author-products/publish.ts");
assert.match(publish, /hasValidatedMusicPublishSource/);
assert.match(publish, /Загрузите аудио для трека/);
assert.match(publish, /active_music_delivery_asset_id/);
assert.match(publish, /itemsWithPlayableDuration/);

const mig = read("supabase/migrations/20261007170000_music_publish_playable_audio.sql");
assert.match(mig, /assert_practice_moderation_ready/);
assert.match(mig, /publish_audio_product/);
assert.match(mig, /promote_music_item_delivery/);
assert.match(mig, /duration_seconds = CASE/);

const submit = read("src/app/api/author/products/[id]/submit-for-moderation/route.ts");
const publishRoute = read("src/app/api/author/products/[id]/publish/route.ts");
assert.match(submit, /evaluatePublishReadiness/);
assert.match(publishRoute, /evaluatePublishReadiness/);
assert.match(publish, /publish_audio_product/);

process.stdout.write("music-publish-readiness-unit: ok\n");
