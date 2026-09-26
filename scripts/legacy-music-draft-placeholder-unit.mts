import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  LEGACY_MUSIC_DRAFT_SEED_ENDED_AT,
  planLegacyMusicDraftPlaceholderCleanup,
  type LegacyMusicDraftAudioFacts,
  type LegacyMusicDraftDeliverySignals,
  type LegacyMusicDraftPracticeFacts,
} from "../src/lib/author-products/legacy-music-draft-placeholder";

const PRACTICE_CREATED = "2026-09-01T12:00:00.000Z";
const SEED_CREATED = "2026-09-01T12:00:00.400Z";

const productsSource = readFileSync(
  new URL("../src/lib/author-products/products.ts", import.meta.url),
  "utf8",
);
const normalizerSource = readFileSync(
  new URL(
    "../src/lib/author-products/server/normalize-legacy-music-draft-placeholder.ts",
    import.meta.url,
  ),
  "utf8",
);

const detailSource = productsSource.slice(
  productsSource.indexOf("export async function getAuthorProductDetail"),
);
const normalizeAt = detailSource.indexOf("await normalizeLegacyMusicDraftPlaceholder");
const audioSelectAt = detailSource.indexOf('.from("audio_items")');
assert.ok(normalizeAt >= 0, "music draft detail normalizes the legacy slot");
assert.ok(audioSelectAt > normalizeAt, "normalization runs before the form reads tracks");
assert.match(normalizerSource, /music_upload_generation", 0/);
assert.match(normalizerSource, /active_music_delivery_asset_id", null/);
assert.match(normalizerSource, /desired_music_master_asset_id", null/);
assert.doesNotMatch(normalizerSource, /teardown_music_track_delivery|teardownMusicTrackDelivery/);

function emptySignals(): LegacyMusicDraftDeliverySignals {
  return {
    musicAssetCount: 0,
    transcodeJobCount: 0,
    directUploadCount: 0,
    normalizeJobCount: 0,
  };
}

function practice(
  overrides: Partial<LegacyMusicDraftPracticeFacts> = {},
): LegacyMusicDraftPracticeFacts {
  return {
    productKind: "music",
    status: "draft",
    createdAt: PRACTICE_CREATED,
    ...overrides,
  };
}

function seed(
  overrides: Partial<LegacyMusicDraftAudioFacts> = {},
): LegacyMusicDraftAudioFacts {
  return {
    id: "seed",
    title: "Трек 1",
    position: 1,
    status: "draft",
    createdAt: SEED_CREATED,
    audioPath: null,
    durationSeconds: null,
    activeMusicDeliveryAssetId: null,
    desiredMusicMasterAssetId: null,
    desiredProductAudioNormalizeJobId: null,
    musicUploadGeneration: 0,
    originalFileName: null,
    fileSizeBytes: null,
    description: null,
    coverUrl: null,
    coverImage: null,
    isPreview: false,
    previewStartMs: null,
    previewEndMs: null,
    ...overrides,
  };
}

function realTrack(
  index: number,
  overrides: Partial<LegacyMusicDraftAudioFacts> = {},
): LegacyMusicDraftAudioFacts {
  return seed({
    id: `track-${index}`,
    title: `Рассвет ${index}`,
    position: index,
    createdAt: `2026-09-20T12:00:0${index}.000Z`,
    audioPath: `practices/p/audio/track-${index}.mp3`,
    durationSeconds: 180,
    originalFileName: `track-${index}.mp3`,
    fileSizeBytes: 1024,
    musicUploadGeneration: 1,
    ...overrides,
  });
}

function planFor(
  items: LegacyMusicDraftAudioFacts[],
  signals: Array<[string, Partial<LegacyMusicDraftDeliverySignals>]> = [],
  practiceOverrides: Partial<LegacyMusicDraftPracticeFacts> = {},
) {
  const signalsByAudioId = new Map<string, LegacyMusicDraftDeliverySignals>();
  for (const item of items) {
    signalsByAudioId.set(item.id, emptySignals());
  }
  for (const [id, patch] of signals) {
    signalsByAudioId.set(id, { ...emptySignals(), ...signalsByAudioId.get(id), ...patch });
  }
  return planLegacyMusicDraftPlaceholderCleanup({
    practice: practice(practiceOverrides),
    items,
    signalsByAudioId,
  });
}

{
  const plan = planFor([seed()]);
  assert.deepEqual(plan.removeIds, ["seed"]);
  assert.deepEqual(plan.positions, []);
}

{
  const tracks = [1, 2, 3, 4, 5].map((index) =>
    realTrack(index, { position: index + 1 }),
  );
  const plan = planFor([seed({ position: 1 }), ...tracks]);
  assert.deepEqual(plan.removeIds, ["seed"]);
  assert.deepEqual(
    plan.positions.map((item) => item.id),
    ["track-1", "track-2", "track-3", "track-4", "track-5"],
  );
  assert.deepEqual(
    plan.positions.map((item) => item.position),
    [1, 2, 3, 4, 5],
  );
}

{
  const tracks = [1, 2, 3, 4].map((index) => realTrack(index, { position: index }));
  const movedSeed = seed({ position: 5, title: "Аудио 1" });
  const plan = planFor([...tracks, movedSeed]);
  assert.deepEqual(plan.removeIds, ["seed"]);
  assert.deepEqual(
    plan.positions.map((item) => [item.id, item.position]),
    [
      ["track-1", 1],
      ["track-2", 2],
      ["track-3", 3],
      ["track-4", 4],
    ],
  );
}

{
  const namedLikeSeed = seed({
    id: "real",
    title: "Трек 1",
    audioPath: "practices/p/audio/trek-1.mp3",
    durationSeconds: 95,
    originalFileName: "Трек 1.mp3",
    fileSizeBytes: 2048,
    musicUploadGeneration: 2,
  });
  assert.deepEqual(planFor([namedLikeSeed]).removeIds, []);

  const signalKeeps: Array<Partial<LegacyMusicDraftAudioFacts>> = [
    { audioPath: "practices/p/audio/trek-1.mp3" },
    { durationSeconds: 95 },
    { activeMusicDeliveryAssetId: "stream-1" },
    { desiredMusicMasterAssetId: "master-1" },
    { desiredProductAudioNormalizeJobId: "job-1" },
    { musicUploadGeneration: 1 },
    { originalFileName: "Трек 1.mp3" },
    { fileSizeBytes: 2048 },
    { description: "Авторское описание" },
    { coverUrl: "covers/trek-1.webp" },
    { coverImage: { path: "covers/trek-1.webp" } },
    { isPreview: true },
    { previewStartMs: 0, previewEndMs: 30000 },
    { status: "published" },
  ];
  for (const patch of signalKeeps) {
    assert.deepEqual(
      planFor([seed(patch)]).removeIds,
      [],
      JSON.stringify(patch),
    );
  }

  const childKeeps: Array<Partial<LegacyMusicDraftDeliverySignals>> = [
    { musicAssetCount: 1 },
    { transcodeJobCount: 1 },
    { directUploadCount: 1 },
    { normalizeJobCount: 1 },
  ];
  for (const patch of childKeeps) {
    assert.deepEqual(
      planFor([seed()], [["seed", patch]]).removeIds,
      [],
      JSON.stringify(patch),
    );
  }
}

{
  const laterEmpty = seed({
    id: "later",
    title: "Трек 1",
    position: 2,
    createdAt: "2026-09-18T08:00:00.000Z",
  });
  const plan = planFor([seed(), laterEmpty]);
  assert.deepEqual(plan.removeIds, ["seed"]);
  assert.deepEqual(plan.positions, [{ id: "later", position: 1 }]);
}

{
  const onlyLater = seed({
    id: "later",
    createdAt: "2026-09-18T08:00:00.000Z",
  });
  assert.deepEqual(planFor([onlyLater]).removeIds, []);
}

{
  const withoutSignals = planLegacyMusicDraftPlaceholderCleanup({
    practice: practice(),
    items: [seed()],
    signalsByAudioId: new Map(),
  });
  assert.deepEqual(withoutSignals.removeIds, []);
}

{
  assert.deepEqual(
    planFor([seed()], [], { productKind: "practice" }).removeIds,
    [],
  );
  assert.deepEqual(
    planFor([seed()], [], { status: "published" }).removeIds,
    [],
  );
  assert.deepEqual(
    planFor([seed()], [], { createdAt: LEGACY_MUSIC_DRAFT_SEED_ENDED_AT }).removeIds,
    [],
  );
  assert.deepEqual(
    planFor([seed({ title: "Интро" })]).removeIds,
    [],
  );
  assert.deepEqual(planFor([seed()], []).removeIds, ["seed"]);
  assert.equal(
    planFor([seed()], [["seed", emptySignals()]]).removeIds.length,
    1,
  );
}

console.log("legacy-music-draft-placeholder-unit: ok");
