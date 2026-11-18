#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { StudioMusicCatalogPublication } from "../src/lib/studio-music/catalog";
import {
  authorizeStudioMusicPreview,
  createSupabaseStudioMusicPreviewStore,
  handleStudioMusicPreview,
  resolveStudioMusicPreviewSource,
  studioMusicPreviewJsonContainsForbiddenFields,
  type StudioMusicPreviewAudioItem,
  type StudioMusicPreviewSource,
  type StudioMusicPreviewStore,
} from "../src/lib/studio-music/preview";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(root, relativePath), "utf8");
}

const publicationId = "11111111-1111-4111-8111-111111111111";
const audioItemId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherAudioId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const publicPractice: StudioMusicCatalogPublication = {
  id: publicationId,
  status: "published",
  deleted_at: null,
  product_kind: "music",
  publication_class: "release",
  music_usage_permission: "platform_reuse_allowed",
  is_free: false,
  price: 500,
  studio_music_pricing_mode: "auto_2x_listener",
  catalog_visibility: "listed",
  is_catalog_listed: true,
  authors: { name: "Анна", slug: "anna", access_status: "commercial_active" },
};

const unpublishedPractice: StudioMusicCatalogPublication = {
  ...publicPractice,
  status: "unpublished",
  music_usage_permission: "listen_only",
  catalog_visibility: "unlisted",
  is_catalog_listed: false,
};

assert.deepEqual(
  authorizeStudioMusicPreview({
    practice: publicPractice,
    audioItem: {
      id: audioItemId,
      practice_id: publicationId,
      audio_path: "secret.mp3",
      status: "published",
    },
    publicationId,
    userId: null,
    canUse: false,
  }),
  { ok: true, access: "preview" },
);

assert.deepEqual(
  authorizeStudioMusicPreview({
    practice: publicPractice,
    audioItem: {
      id: otherAudioId,
      practice_id: "99999999-9999-4999-8999-999999999999",
      audio_path: "other.mp3",
      status: "published",
    },
    publicationId,
    userId: null,
    canUse: false,
  }),
  { ok: false, status: 404, code: "wrong_relation" },
);

assert.deepEqual(
  authorizeStudioMusicPreview({
    practice: unpublishedPractice,
    audioItem: {
      id: audioItemId,
      practice_id: publicationId,
      audio_path: "secret.mp3",
      status: "published",
    },
    publicationId,
    userId: null,
    canUse: false,
  }),
  { ok: false, status: 403, code: "forbidden" },
);

assert.deepEqual(
  authorizeStudioMusicPreview({
    practice: unpublishedPractice,
    audioItem: {
      id: audioItemId,
      practice_id: publicationId,
      audio_path: "secret.mp3",
      status: "published",
    },
    publicationId,
    userId: "user-1",
    canUse: true,
  }),
  { ok: true, access: "full" },
);

function createStore(input: {
  practice: StudioMusicCatalogPublication | null;
  audioItemPracticeId?: string;
  canUse?: boolean;
  audioItem?: Partial<StudioMusicPreviewAudioItem>;
  seen?: { clip?: StudioMusicPreviewSource; full?: StudioMusicPreviewSource };
}): StudioMusicPreviewStore {
  return {
    async loadPractice() {
      return input.practice;
    },
    async loadAudioItem() {
      return {
        id: audioItemId,
        practice_id: input.audioItemPracticeId ?? publicationId,
        audio_path: "hidden/path.mp3",
        status: "published",
        duration_seconds: 120,
        ...input.audioItem,
      };
    },
    async loadCanUse() {
      return input.canUse === true;
    },
    async buildClip({ source }) {
      if (input.seen) input.seen.clip = source;
      return {
        bytes: new Uint8Array([0xff, 0xfb, 0x90, 0x00]),
        startMs: 30000,
        endMs: 90000,
      };
    },
    async streamFullAudio({ rangeHeader, source }) {
      if (input.seen) input.seen.full = source;
      assert.equal(rangeHeader, "bytes=0-");
      return new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00]), {
        status: 206,
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Range": "bytes 0-3/4",
          "Content-Type": "audio/mpeg",
        },
      });
    },
  };
}

const guestPublic = await handleStudioMusicPreview({
  publicationId,
  audioItemId,
  userId: null,
  store: createStore({ practice: publicPractice }),
});
assert.equal(guestPublic.type, "clip");
if (guestPublic.type === "clip") {
  assert.equal(guestPublic.bytes.byteLength, 4);
}

const guestMineDenied = await handleStudioMusicPreview({
  publicationId,
  audioItemId,
  userId: null,
  store: createStore({ practice: unpublishedPractice, canUse: true }),
});
assert.deepEqual(guestMineDenied, {
  type: "json",
  status: 403,
  body: { error: "forbidden" },
});

const ownedUnpublished = await handleStudioMusicPreview({
  publicationId,
  audioItemId,
  userId: "user-1",
  store: createStore({ practice: unpublishedPractice, canUse: true }),
});
assert.equal(ownedUnpublished.type, "full");

const listenerFreeStudioFixed = await handleStudioMusicPreview({
  publicationId,
  audioItemId,
  userId: null,
  store: createStore({
    practice: {
      ...publicPractice,
      is_free: true,
      price: 0,
      studio_music_pricing_mode: "fixed",
      studio_music_price_minor: 60000,
    },
  }),
});
assert.equal(listenerFreeStudioFixed.type, "clip");

const listenerPaidStudioFree = await handleStudioMusicPreview({
  publicationId,
  audioItemId,
  userId: null,
  store: createStore({
    practice: {
      ...publicPractice,
      studio_music_pricing_mode: "free",
    },
  }),
});
assert.equal(listenerPaidStudioFree.type, "full");
if (listenerPaidStudioFree.type === "full") {
  assert.equal(listenerPaidStudioFree.response.status, 206);
  assert.equal(listenerPaidStudioFree.response.headers.get("Accept-Ranges"), "bytes");
  assert.match(listenerPaidStudioFree.response.headers.get("Content-Range") ?? "", /^bytes /);
}

const wrongRelation = await handleStudioMusicPreview({
  publicationId,
  audioItemId,
  userId: null,
  store: createStore({
    practice: publicPractice,
    audioItemPracticeId: "99999999-9999-4999-8999-999999999999",
  }),
});
assert.deepEqual(wrongRelation, {
  type: "json",
  status: 404,
  body: { error: "wrong_relation" },
});

assert.equal(
  studioMusicPreviewJsonContainsForbiddenFields({ error: "forbidden" }),
  false,
);
assert.equal(
  studioMusicPreviewJsonContainsForbiddenFields({
    error: "ok",
    audio_path: "x",
  }),
  true,
);
assert.equal(
  studioMusicPreviewJsonContainsForbiddenFields({
    url: "https://storage.example/storage/v1/object/sign/practice-audio/full.mp3",
  }),
  true,
);

// t1540u: album tracks from the music pipeline have no legacy audio_path and
// play only through a verified music-streams delivery asset. The Studio
// catalog used to answer 404 audio_missing for them, so the bottom player
// flashed and disappeared.
const verifiedStream = {
  audioItemId,
  assetRole: "stream",
  lifecycleState: "verified",
  storageBucket: "music-streams",
  storagePath: `${audioItemId}/master/mp3-256.mp3`,
};
const freePublicPractice: StudioMusicCatalogPublication = {
  ...publicPractice,
  is_free: true,
  price: 0,
  studio_music_pricing_mode: "free",
};

{
  const seen: { clip?: StudioMusicPreviewSource; full?: StudioMusicPreviewSource } = {};
  const albumTrackFree = await handleStudioMusicPreview({
    publicationId,
    audioItemId,
    userId: "listener-1",
    store: createStore({
      practice: freePublicPractice,
      audioItem: { audio_path: null, active_stream: verifiedStream },
      seen,
    }),
  });
  assert.equal(albumTrackFree.type, "full");
  if (albumTrackFree.type === "full") {
    assert.equal(albumTrackFree.response.status, 206);
  }
  assert.deepEqual(seen.full, {
    bucket: "music-streams",
    path: verifiedStream.storagePath,
  });
}

{
  const seen: { clip?: StudioMusicPreviewSource; full?: StudioMusicPreviewSource } = {};
  const albumTrackPaidGuest = await handleStudioMusicPreview({
    publicationId,
    audioItemId,
    userId: null,
    store: createStore({
      practice: publicPractice,
      audioItem: { audio_path: "", active_stream: verifiedStream },
      seen,
    }),
  });
  assert.equal(albumTrackPaidGuest.type, "clip");
  assert.deepEqual(seen.clip, {
    bucket: "music-streams",
    path: verifiedStream.storagePath,
  });
}

{
  const seen: { clip?: StudioMusicPreviewSource; full?: StudioMusicPreviewSource } = {};
  await handleStudioMusicPreview({
    publicationId,
    audioItemId,
    userId: null,
    store: createStore({ practice: freePublicPractice, seen }),
  });
  assert.deepEqual(seen.full, {
    bucket: "practice-audio",
    path: "hidden/path.mp3",
  });
}

for (const badStream of [
  null,
  { ...verifiedStream, lifecycleState: "processing" },
  { ...verifiedStream, assetRole: "master" },
  { ...verifiedStream, storageBucket: "practice-audio" },
  { ...verifiedStream, audioItemId: otherAudioId },
]) {
  const missing = await handleStudioMusicPreview({
    publicationId,
    audioItemId,
    userId: null,
    store: createStore({
      practice: freePublicPractice,
      audioItem: { audio_path: null, active_stream: badStream },
    }),
  });
  assert.deepEqual(missing, {
    type: "json",
    status: 404,
    body: { error: "audio_missing" },
  });
}

assert.equal(
  resolveStudioMusicPreviewSource({
    productKind: "practice",
    audioItem: { id: audioItemId, audio_path: null, status: "published", active_stream: verifiedStream },
    access: "full",
  }),
  null,
);
assert.deepEqual(
  resolveStudioMusicPreviewSource({
    productKind: "music",
    audioItem: { id: audioItemId, audio_path: "legacy.mp3", status: "published", active_stream: verifiedStream },
    access: "preview",
  }),
  { bucket: "practice-audio", path: "legacy.mp3" },
);
assert.deepEqual(
  resolveStudioMusicPreviewSource({
    productKind: "music",
    audioItem: { id: audioItemId, audio_path: "legacy.mp3", status: "published", active_stream: verifiedStream },
    access: "full",
  }),
  { bucket: "music-streams", path: verifiedStream.storagePath },
);

// t1540u (part 2): the real store must load the source author's status,
// otherwise listeners who have not added the music get 403 before «Добавить».
function createFakePracticeClient(row: Record<string, unknown> | null) {
  const seen: { selects: string[] } = { selects: [] };
  const chain = {
    select(columns: string) {
      seen.selects.push(columns);
      return chain;
    },
    eq() {
      return chain;
    },
    async maybeSingle() {
      return { data: row, error: null };
    },
  };
  const client = { from: () => chain } as unknown as Parameters<
    typeof createSupabaseStudioMusicPreviewStore
  >[0];
  return { client, seen };
}

async function previewWithRealPracticeLoader(
  row: Record<string, unknown> | null,
  userId: string | null = null,
) {
  const fake = createFakePracticeClient(row);
  const real = createSupabaseStudioMusicPreviewStore(fake.client);
  const mock = createStore({ practice: null });
  const result = await handleStudioMusicPreview({
    publicationId,
    audioItemId,
    userId,
    store: { ...mock, loadPractice: real.loadPractice, loadCanUse: async () => false },
  });
  return { result, selects: fake.seen.selects };
}

const dbFreeRow = {
  ...freePublicPractice,
  business_only: false,
  published_at: "2026-09-01T00:00:00Z",
  scheduled_publish_at: null,
  authors: { access_status: "commercial_active" },
};

{
  const { result, selects } = await previewWithRealPracticeLoader(dbFreeRow);
  assert.equal(result.type, "full", "guest preview of free studio music");
  assert.match(selects[0] ?? "", /authors!practices_author_id_fkey\s*\(\s*access_status\s*\)/);
  assert.match(selects[0] ?? "", /published_at/);
  assert.match(selects[0] ?? "", /scheduled_publish_at/);
  assert.match(selects[0] ?? "", /music_usage_permission/);
  assert.match(selects[0] ?? "", /cover_image/);
}
{
  const { result } = await previewWithRealPracticeLoader(dbFreeRow, "listener-without-entitlement");
  assert.equal(result.type, "full", "logged-in listener before «Добавить»");
}
{
  const { result } = await previewWithRealPracticeLoader({
    ...dbFreeRow,
    authors: [{ access_status: "commercial" }],
  });
  assert.equal(result.type, "full", "legacy commercial status, array join shape");
}
{
  const { result } = await previewWithRealPracticeLoader({
    ...publicPractice,
    published_at: "2026-09-01T00:00:00Z",
    authors: { access_status: "commercial_active" },
  });
  assert.equal(result.type, "clip", "paid studio music keeps the 60-second clip");
}
for (const denied of [
  { ...dbFreeRow, authors: { access_status: "basic" } },
  { ...dbFreeRow, authors: null },
  { ...dbFreeRow, music_usage_permission: "listen_only" },
  { ...dbFreeRow, status: "unpublished" },
  { ...dbFreeRow, published_at: null, scheduled_publish_at: "2099-01-01T00:00:00Z" },
  { ...dbFreeRow, product_kind: "practice", publication_class: "practice" },
  { ...dbFreeRow, catalog_visibility: "hidden", is_catalog_listed: false },
  { ...dbFreeRow, deleted_at: "2026-10-01T00:00:00Z" },
  {
    ...dbFreeRow,
    cover_image: {
      _audiolad_fixture: { test_fixture: true, namespace: "t", run_id: "r" },
    },
  },
]) {
  const { result } = await previewWithRealPracticeLoader(denied);
  assert.deepEqual(
    result,
    { type: "json", status: 403, body: { error: "forbidden" } },
    JSON.stringify(denied),
  );
}

{
  const fixtureRow = {
    ...dbFreeRow,
    cover_image: {
      _audiolad_fixture: { test_fixture: true, namespace: "t", run_id: "r" },
    },
  } as StudioMusicCatalogPublication;
  const base = {
    practice: fixtureRow,
    audioItem: { id: audioItemId, practice_id: publicationId, audio_path: "x.mp3", status: "published" },
    publicationId,
  };
  assert.deepEqual(
    authorizeStudioMusicPreview({ ...base, userId: "owner", canUse: true }),
    { ok: true, access: "full" },
    "entitled user keeps access to a fixture-marked publication",
  );
  assert.deepEqual(
    authorizeStudioMusicPreview({ ...base, userId: null, canUse: false }),
    { ok: false, status: 403, code: "forbidden" },
  );
}

const previewSource = read("src/lib/studio-music/preview.ts");
assert.match(previewSource, /active_music_delivery_asset_id/);
assert.match(previewSource, /music_audio_assets/);
assert.match(previewSource, /buildPracticePreviewClip/);
assert.match(previewSource, /maxDurationMs: 60_000/);
assert.match(previewSource, /isFreePublicStudioMusicInventory/);
assert.match(previewSource, /streamFullAudio/);
assert.match(previewSource, /Range: rangeHeader/);
assert.doesNotMatch(previewSource, /\/api\/catalog\/play/);
assert.doesNotMatch(previewSource, /user_practices/);
assert.match(previewSource, /\.createSignedUrl\(audioPath, 60\)/);
assert.match(previewSource, /return new Response\(upstream\.body, \{ status: 206, headers \}\)/);

const route = read("src/app/api/studio/music/preview/route.ts");
assert.match(route, /handleStudioMusicPreview/);
assert.match(route, /audio\/mpeg|previewClipResponseHeaders/);
assert.match(route, /rangeHeader: request\.headers\.get\("range"\)/);
assert.match(route, /result\.type === "full"/);
assert.match(route, /Cache-Control/);
assert.doesNotMatch(route, /\/api\/catalog\/play/);
assert.doesNotMatch(route, /audio_path/);

console.log("studio-music-catalog-preview-unit: ok");
