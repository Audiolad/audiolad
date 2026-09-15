import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  collectValidatedActiveMusicDeliveryItemIds,
  hasListenTrackPlayableSource,
  loadValidatedActiveMusicDeliveryItemIds,
  type MusicAudioAssetValidationRow,
} from "../src/lib/listen/validated-active-music-delivery";
import { resolveMusicListenSource } from "../src/lib/listen/music-delivery";
import { MUSIC_STREAMS_BUCKET } from "../src/lib/author-products/music-master-upload-contract";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

function streamAsset(
  overrides: Partial<MusicAudioAssetValidationRow> & {
    id: string;
    audio_item_id: string;
  },
): MusicAudioAssetValidationRow {
  return {
    asset_role: "stream",
    lifecycle_state: "verified",
    storage_bucket: MUSIC_STREAMS_BUCKET,
    storage_path: `${overrides.audio_item_id}/master/mp3-256.mp3`,
    ...overrides,
  };
}

function moderationHasAudioFile(input: {
  audioPath?: string | null;
  hasActiveDelivery?: boolean;
}): boolean {
  return hasListenTrackPlayableSource(input);
}

// 1. legacy MP3
assert.equal(
  moderationHasAudioFile({ audioPath: "authors/a/track.mp3", hasActiveDelivery: false }),
  true,
);

// 2–3. WAV + valid stream, null path
{
  const item = { id: "a1", active_music_delivery_asset_id: "s1", audio_path: null };
  const valid = collectValidatedActiveMusicDeliveryItemIds(
    [item],
    [streamAsset({ id: "s1", audio_item_id: "a1" })],
  );
  assert.equal(valid.has("a1"), true);
  assert.equal(
    moderationHasAudioFile({ audioPath: null, hasActiveDelivery: true }),
    true,
  );
  // UI must not treat as missing
  assert.notEqual(
    moderationHasAudioFile({ audioPath: null, hasActiveDelivery: true }),
    false,
  );
}

// 4. master pointer
{
  const item = { id: "a1", active_music_delivery_asset_id: "m1" };
  const valid = collectValidatedActiveMusicDeliveryItemIds(
    [item],
    [
      streamAsset({
        id: "m1",
        audio_item_id: "a1",
        asset_role: "master",
        storage_bucket: "music-masters",
        storage_path: "a1/master.wav",
      }),
    ],
  );
  assert.equal(valid.has("a1"), false);
  assert.equal(
    moderationHasAudioFile({ audioPath: null, hasActiveDelivery: false }),
    false,
  );
}

// 5. rejected/unverified
{
  const item = { id: "a1", active_music_delivery_asset_id: "s1" };
  const valid = collectValidatedActiveMusicDeliveryItemIds(
    [item],
    [
      streamAsset({
        id: "s1",
        audio_item_id: "a1",
        lifecycle_state: "rejected",
      }),
    ],
  );
  assert.equal(valid.has("a1"), false);
}

// 6. wrong audio_item
{
  const item = { id: "a1", active_music_delivery_asset_id: "s1" };
  const valid = collectValidatedActiveMusicDeliveryItemIds(
    [item],
    [streamAsset({ id: "s1", audio_item_id: "a2" })],
  );
  assert.equal(valid.has("a1"), false);
}

// 7. ready job without active delivery
assert.equal(
  moderationHasAudioFile({ audioPath: null, hasActiveDelivery: false }),
  false,
);

// 8. replacement keeps old active stream
{
  const item = {
    id: "a1",
    audio_path: null as string | null,
    active_music_delivery_asset_id: "stream-old",
  };
  const valid = collectValidatedActiveMusicDeliveryItemIds(
    [item],
    [streamAsset({ id: "stream-old", audio_item_id: "a1" })],
  );
  assert.equal(valid.has("a1"), true);
  assert.equal(
    moderationHasAudioFile({ audioPath: null, hasActiveDelivery: true }),
    true,
  );
}

// 9–10. preview source never masters; no storage_path leakage in moderation DTO
{
  const source = resolveMusicListenSource({
    productKind: "music",
    audioItemId: "a1",
    audioPath: null,
    activeStream: {
      audioItemId: "a1",
      assetRole: "stream",
      lifecycleState: "verified",
      storageBucket: MUSIC_STREAMS_BUCKET,
      storagePath: "a1/master/mp3-256.mp3",
    },
  });
  assert.equal(source.kind, "stream");
  if (source.kind === "stream") {
    assert.equal(source.bucket, MUSIC_STREAMS_BUCKET);
    assert.doesNotMatch(source.bucket, /music-masters/);
  }

  const masterSource = resolveMusicListenSource({
    productKind: "music",
    audioItemId: "a1",
    audioPath: null,
    activeStream: {
      audioItemId: "a1",
      assetRole: "master",
      lifecycleState: "verified",
      storageBucket: "music-masters",
      storagePath: "a1/master.wav",
    },
  });
  assert.equal(masterSource.kind, "missing");
}

// Album of 10 WAV-derived tracks
{
  const rows = Array.from({ length: 10 }, (_, i) => {
    const n = i + 1;
    return {
      id: `audio-${n}`,
      audio_path: null as string | null,
      active_music_delivery_asset_id: `stream-${n}`,
      title: `Track ${n}`,
    };
  });
  const assets = rows.map((row) =>
    streamAsset({
      id: row.active_music_delivery_asset_id,
      audio_item_id: row.id,
    }),
  );
  const serviceRole = {
    from(table: string) {
      assert.equal(table, "music_audio_assets");
      const chain = {
        select() {
          return chain;
        },
        in() {
          return Promise.resolve({ data: assets, error: null });
        },
      };
      return chain;
    },
  } as unknown as SupabaseClient;

  const validated = await loadValidatedActiveMusicDeliveryItemIds(rows, {
    serviceRole,
  });
  assert.equal(validated.size, 10);
  for (const row of rows) {
    assert.equal(
      moderationHasAudioFile({
        audioPath: null,
        hasActiveDelivery: validated.has(row.id),
      }),
      true,
      row.id,
    );
  }
}

// Source wiring
{
  const queries = read("src/lib/admin/product-moderation-queries.ts");
  const preview = read(
    "src/app/api/admin/product-moderation/[id]/audio/[audioId]/preview/route.ts",
  );
  const form = read("src/components/admin/ProductModerationReviewForm.tsx");

  assert.match(queries, /loadValidatedActiveMusicDeliveryItemIds/);
  assert.match(queries, /hasListenTrackPlayableSource/);
  assert.match(queries, /active_music_delivery_asset_id/);
  assert.doesNotMatch(
    queries,
    /hasAudioFile:\s*Boolean\(\s*typeof item\.audio_path/,
  );
  assert.doesNotMatch(queries, /storage_path/);
  assert.doesNotMatch(queries, /activeMusicDeliveryAssetId/);

  assert.match(preview, /resolveMusicListenSource/);
  assert.match(preview, /active_music_delivery_asset_id/);
  assert.doesNotMatch(
    preview,
    /!audioItem\.audio_path\?\.trim\(\)/,
  );
  assert.match(preview, /source\.bucket/);

  assert.match(form, /hasAudioFile \? "файл загружен" : "файл отсутствует"/);
  assert.match(form, /файл не загружен/);
}

console.log("wav-music-moderation-readiness-unit: ok");
