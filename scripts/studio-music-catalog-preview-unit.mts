#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { StudioMusicCatalogPublication } from "../src/lib/studio-music/catalog";
import {
  authorizeStudioMusicPreview,
  handleStudioMusicPreview,
  studioMusicPreviewJsonContainsForbiddenFields,
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
      };
    },
    async loadCanUse() {
      return input.canUse === true;
    },
    async buildClip() {
      return {
        bytes: new Uint8Array([0xff, 0xfb, 0x90, 0x00]),
        startMs: 30000,
        endMs: 90000,
      };
    },
    async streamFullAudio({ rangeHeader }) {
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

const previewSource = read("src/lib/studio-music/preview.ts");
assert.match(previewSource, /buildPracticePreviewClip/);
assert.match(previewSource, /maxDurationMs: 60_000/);
assert.match(previewSource, /isFreePublicStudioMusicInventory/);
assert.match(previewSource, /streamFullAudio/);
assert.match(previewSource, /Range: rangeHeader/);
assert.doesNotMatch(previewSource, /\/api\/catalog\/play/);
assert.doesNotMatch(previewSource, /user_practices/);
assert.doesNotMatch(previewSource, /createSignedUrl/);

const route = read("src/app/api/studio/music/preview/route.ts");
assert.match(route, /handleStudioMusicPreview/);
assert.match(route, /audio\/mpeg|previewClipResponseHeaders/);
assert.match(route, /rangeHeader: request\.headers\.get\("range"\)/);
assert.match(route, /result\.type === "full"/);
assert.match(route, /Cache-Control/);
assert.doesNotMatch(route, /\/api\/catalog\/play/);
assert.doesNotMatch(route, /audio_path/);

console.log("studio-music-catalog-preview-unit: ok");
