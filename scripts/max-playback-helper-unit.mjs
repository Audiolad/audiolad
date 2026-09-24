import assert from "node:assert/strict";

import { signEntitledListenAudio } from "../src/lib/listen/sign-entitled-audio.ts";
import {
  getMaxPlaybackSession,
  setMaxPlaybackDepsForTests,
  signMaxPlaybackAudio,
} from "../src/lib/max/playback.ts";

const listedPractice = {
  id: "practice-1",
  author_id: "author-1",
  title: "Утро",
  slug: "product",
  subtitle: null,
  description: null,
  format: "practice",
  product_kind: "practice",
  publication_class: "audio_product",
  duration_minutes: 10,
  price: 0,
  is_free: true,
  cover_url: null,
  audio_url: null,
  status: "published",
  updated_at: null,
  is_catalog_listed: true,
  catalog_visibility: "listed",
  authors: { id: "author-1", name: "Анна", slug: "author" },
};

const sessionPayload = {
  ok: true,
  session: {
    practiceId: "practice-1",
    authorSlug: "author",
    productSlug: "product",
    practiceTitle: "Утро",
    authorName: "Анна",
    format: "Практика",
    tracks: [
      { id: "track-1", title: "Вступление", position: 1, durationSeconds: 65, coverImageUrl: null },
    ],
    initialProgress: [{ audioItemId: "track-1", positionSeconds: 12, completed: false }],
    listenStats: { listenCount: 9 },
    coverSymbol: "❀",
    coverGradient: "from-a",
    coverImageUrl: "https://cdn.example/cover.jpg",
    isAuthorPreview: false,
  },
};

function catalog() {
  return [{ authorSlug: "author", slug: "product" }];
}

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

try {
  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => catalog(),
    getPractice: async () => ({ practice: listedPractice, error: false }),
    loadSession: async (_supabase, author, slug, linkedUserId) => {
      assert.equal(linkedUserId, userId);
      assert.equal(author, "author");
      assert.equal(slug, "product");
      return sessionPayload;
    },
  });

  const allowed = await getMaxPlaybackSession(userId, "author", "product");
  assert.equal(allowed.ok, true);
  assert.equal(allowed.session.tracks[0].trackId, "track-1");
  assert.equal(allowed.session.practiceId, undefined);
  assert.equal(JSON.stringify(allowed.session).includes(userId), false);
  assert.equal(JSON.stringify(allowed.session).includes("audio_path"), false);
  assert.equal(JSON.stringify(allowed.session).includes("listenCount"), false);

  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => [],
    getPractice: async () => ({ practice: listedPractice, error: false }),
    loadSession: async () => {
      throw new Error("session should not load unlisted product");
    },
  });
  const hidden = await getMaxPlaybackSession(userId, "author", "product");
  assert.deepEqual(hidden, { ok: false, reason: "not_found" });

  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => catalog(),
    getPractice: async () => ({ practice: listedPractice, error: false }),
    loadSession: async () => ({ ok: false, reason: "unavailable" }),
  });
  const denied = await getMaxPlaybackSession(userId, "author", "product");
  assert.deepEqual(denied, { ok: false, reason: "access_required" });

  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => catalog(),
    getPractice: async () => ({ practice: listedPractice, error: false }),
    loadSession: async () => ({ ok: false, reason: "no_audio" }),
  });
  const empty = await getMaxPlaybackSession(userId, "author", "product");
  assert.deepEqual(empty, { ok: false, reason: "no_audio" });

  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => catalog(),
    getPractice: async () => ({ practice: listedPractice, error: false }),
    signAudio: async (input) => {
      assert.equal(input.userId, userId);
      assert.equal(input.audioId, "track-1");
      assert.equal(input.practice.id, "practice-1");
      return { ok: true, url: "https://cdn.example/sign", expiresIn: 3600 };
    },
  });
  const signed = await signMaxPlaybackAudio(userId, "author", "product", "track-1");
  assert.equal(signed.ok, true);
  assert.equal(signed.url.includes("storage_path"), false);

  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => catalog(),
    getPractice: async () => ({ practice: listedPractice, error: false }),
    signAudio: async () => ({ ok: false, reason: "not_found" }),
  });
  const otherTrack = await signMaxPlaybackAudio(userId, "author", "product", "other-product-track");
  assert.deepEqual(otherTrack, { ok: false, reason: "not_found" });

  const signedCourse = await signEntitledListenAudio(
    { userId, authorSlug: "author", productSlug: "course", audioId: "lesson-2" },
    {
      createClient: () => ({
        from() {
          throw new Error("unexpected default table access");
        },
      }),
      getPractice: async () => ({
        practice: {
          ...listedPractice,
          product_kind: "course",
          publication_class: "course",
        },
        error: false,
      }),
      resolveAccess: async () => null,
      canPlayCourse: async () => {
        throw new Error("course play must not run without access");
      },
    },
  );
  assert.deepEqual(signedCourse, { ok: false, reason: "access_required" });

  const publishedPractice = await signEntitledListenAudio(
    { userId, authorSlug: "author", productSlug: "product", audioId: "track-1" },
    {
      createClient: () => ({
        from() {
          return {
            select() { return this; },
            eq() { return this; },
            maybeSingle: async () => ({
              data: {
                id: "track-1",
                practice_id: "practice-1",
                audio_path: "practices/a.mp3",
                status: "published",
                active_music_delivery_asset_id: null,
              },
              error: null,
            }),
          };
        },
      }),
      getPractice: async () => ({ practice: listedPractice, error: false }),
      resolveAccess: async () => ({ mode: "entitled" }),
      signPath: async (bucket, path) => {
        assert.equal(bucket, "practice-audio");
        assert.equal(path, "practices/a.mp3");
        return { url: "https://cdn.example/practice.mp3" };
      },
    },
  );
  assert.equal(publishedPractice.ok, true);

  const music = await signEntitledListenAudio(
    { userId, authorSlug: "author", productSlug: "music", audioId: "music-1" },
    {
      createClient: () => ({
        from() {
          return {
            select() { return this; },
            eq() { return this; },
            maybeSingle: async () => ({
              data: {
                id: "music-1",
                practice_id: "practice-1",
                audio_path: null,
                status: "published",
                active_music_delivery_asset_id: "asset-1",
              },
              error: null,
            }),
          };
        },
      }),
      getPractice: async () => ({
        practice: { ...listedPractice, product_kind: "music" },
        error: false,
      }),
      resolveAccess: async () => ({ mode: "entitled" }),
      loadActiveStream: async () => ({
        audioItemId: "music-1",
        assetRole: "stream",
        lifecycleState: "verified",
        storageBucket: "music-streams",
        storagePath: "streams/music-1.mp3",
      }),
      signPath: async (bucket, path) => {
        assert.equal(bucket, "music-streams");
        assert.equal(path, "streams/music-1.mp3");
        return { url: "https://cdn.example/music.mp3" };
      },
    },
  );
  assert.equal(music.ok, true);

  const unpublished = await signEntitledListenAudio(
    { userId, authorSlug: "author", productSlug: "product", audioId: "draft-1" },
    {
      createClient: () => ({
        from() {
          return {
            select() { return this; },
            eq() { return this; },
            maybeSingle: async () => ({
              data: {
                id: "draft-1",
                practice_id: "practice-1",
                audio_path: "practices/draft.mp3",
                status: "draft",
                active_music_delivery_asset_id: null,
              },
              error: null,
            }),
          };
        },
      }),
      getPractice: async () => ({ practice: listedPractice, error: false }),
      resolveAccess: async () => ({ mode: "entitled" }),
      signPath: async () => {
        throw new Error("draft track must not be signed");
      },
    },
  );
  assert.deepEqual(unpublished, { ok: false, reason: "forbidden" });

  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => [{ authorSlug: "author", slug: "course" }],
    getPractice: async () => ({
      practice: { ...listedPractice, product_kind: "course", publication_class: "course" },
      error: false,
    }),
    loadSession: async () => ({
      ok: true,
      session: {
        practiceTitle: "Курс",
        authorName: "Анна",
        format: "Курс",
        tracks: [
          { id: "lesson-1", title: "Открытый урок", position: 1, durationSeconds: 80, coverImageUrl: null },
        ],
        coverImageUrl: null,
      },
    }),
  });
  const courseSession = await getMaxPlaybackSession(userId, "author", "course");
  assert.equal(courseSession.ok, true);
  assert.deepEqual(courseSession.session.tracks.map((track) => track.trackId), ["lesson-1"]);

  const courseForbidden = await signEntitledListenAudio(
    { userId, authorSlug: "author", productSlug: "course", audioId: "lesson-locked" },
    {
      createClient: () => ({
        from() {
          throw new Error("inaccessible course track must not load audio");
        },
      }),
      getPractice: async () => ({
        practice: { ...listedPractice, product_kind: "course", publication_class: "course" },
        error: false,
      }),
      resolveAccess: async () => ({ mode: "entitled" }),
      canPlayCourse: async () => false,
      signPath: async () => {
        throw new Error("inaccessible course track must not be signed");
      },
    },
  );
  assert.deepEqual(courseForbidden, { ok: false, reason: "forbidden" });

  setMaxPlaybackDepsForTests({
    createClient: () => {
      throw new Error("service client exploded");
    },
  });
  const sessionThrow = await getMaxPlaybackSession(userId, "author", "product");
  assert.deepEqual(sessionThrow, { ok: false, reason: "storage_unavailable" });

  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => [{ authorSlug: "author", slug: "product" }],
    getPractice: async () => ({ practice: listedPractice, error: false }),
    signAudio: async () => {
      throw new Error("sign exploded");
    },
  });
  const signThrow = await signMaxPlaybackAudio(userId, "author", "product", "track-1");
  assert.deepEqual(signThrow, { ok: false, reason: "storage_unavailable" });
} finally {
  setMaxPlaybackDepsForTests(null);
}

console.log("max-playback-helper-unit: ok");
