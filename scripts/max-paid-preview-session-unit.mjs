import assert from "node:assert/strict";

import {
  buildMaxPlaybackPreviewClip,
  getMaxPlaybackSession,
  setMaxPlaybackDepsForTests,
  signMaxPlaybackAudio,
} from "../src/lib/max/playback.ts";
import { resolveMaxStorefrontPreview } from "../src/lib/max/storefront-preview.ts";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const paidPractice = {
  id: "practice-1",
  author_id: "author-1",
  title: "Утро",
  slug: "product",
  subtitle: null,
  description: "Описание",
  format: "Практика",
  product_kind: "practice",
  publication_class: "audio_product",
  duration_minutes: 10,
  price: 490,
  is_free: false,
  cover_url: null,
  audio_url: null,
  status: "published",
  updated_at: null,
  is_catalog_listed: true,
  catalog_visibility: "listed",
  authors: { id: "author-1", name: "Анна", slug: "author" },
};

const freePractice = { ...paidPractice, price: 0, is_free: true };
const coursePractice = {
  ...paidPractice,
  slug: "course",
  product_kind: "course",
  publication_class: "course",
};
const musicPractice = { ...paidPractice, slug: "music", product_kind: "music" };

const previewTrack = {
  trackId: "preview-1",
  title: "Отрывок",
  position: 1,
  durationSeconds: 60,
  coverUrl: null,
};

const previewOk = {
  ok: true,
  track: previewTrack,
  previewDurationSeconds: 60,
  window: { startMs: 0, endMs: 60_000, durationMs: 60_000, durationSeconds: 60 },
  audioItem: {
    id: "preview-1",
    title: "Отрывок",
    position: 1,
    duration_seconds: 180,
    audio_path: "practices/a.mp3",
    status: "published",
    is_preview: true,
    preview_start_ms: null,
    preview_end_ms: null,
  },
};

function listed(slug = "product") {
  return [{ authorSlug: "author", slug }];
}

function fullSession(tracks) {
  return {
    ok: true,
    session: {
      practiceTitle: "Утро",
      authorName: "Анна",
      format: "Практика",
      tracks,
      coverImageUrl: null,
    },
  };
}

try {
  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => listed(),
    getPractice: async () => ({ practice: paidPractice, error: false }),
    loadSession: async () => ({ ok: false, reason: "unavailable" }),
    resolvePreview: async () => previewOk,
  });
  const paidPreview = await getMaxPlaybackSession(userId, "author", "product");
  assert.equal(paidPreview.ok, true);
  assert.equal(paidPreview.playbackMode, "preview");
  assert.equal(paidPreview.previewDurationSeconds, 60);
  assert.equal(paidPreview.session.tracks.length, 1);
  assert.equal(paidPreview.session.tracks[0].trackId, "preview-1");
  assert.equal(paidPreview.session.tracks[0].durationSeconds, 60);
  assert.equal(JSON.stringify(paidPreview.session).includes("audio_path"), false);
  assert.equal(JSON.stringify(paidPreview.session).includes("practice-audio"), false);

  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => listed(),
    getPractice: async () => ({ practice: freePractice, error: false }),
    loadSession: async () =>
      fullSession([
        { id: "track-1", title: "Трек", position: 1, durationSeconds: 65, coverImageUrl: null },
        { id: "track-2", title: "Второй", position: 2, durationSeconds: 80, coverImageUrl: null },
      ]),
    resolvePreview: async () => {
      throw new Error("free entitled product must not fall back to preview");
    },
  });
  const freeFull = await getMaxPlaybackSession(userId, "author", "product");
  assert.equal(freeFull.ok, true);
  assert.equal(freeFull.playbackMode, "full");
  assert.equal(freeFull.session.tracks.length, 2);

  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => listed(),
    getPractice: async () => ({ practice: paidPractice, error: false }),
    loadSession: async () =>
      fullSession([
        { id: "track-1", title: "Трек", position: 1, durationSeconds: 180, coverImageUrl: null },
      ]),
    resolvePreview: async () => {
      throw new Error("purchased paid product must stay full");
    },
  });
  const purchased = await getMaxPlaybackSession(userId, "author", "product");
  assert.equal(purchased.ok, true);
  assert.equal(purchased.playbackMode, "full");
  assert.equal(purchased.session.tracks[0].durationSeconds, 180);

  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => [],
    getPractice: async () => ({
      practice: { ...paidPractice, status: "draft", catalog_visibility: "unlisted", is_catalog_listed: false },
      error: false,
    }),
    resolveAccess: async () => ({
      canListen: false,
      isAuthorMember: false,
      hasEntitlement: false,
      canSeeSelectedUsers: false,
    }),
    loadSession: async () => {
      throw new Error("draft must not load");
    },
    resolvePreview: async () => {
      throw new Error("draft must not preview");
    },
  });
  const draftHidden = await getMaxPlaybackSession(userId, "author", "product");
  assert.deepEqual(draftHidden, { ok: false, reason: "not_found" });

  const thirty = await resolveMaxStorefrontPreview(paidPractice, {}, {
    listAudioItems: async () => [
      {
        id: "track-1",
        title: "Утро",
        position: 1,
        duration_seconds: 180,
        audio_path: "practices/a.mp3",
        status: "published",
        is_preview: true,
        preview_start_ms: 10_000,
        preview_end_ms: 40_000,
      },
      {
        id: "track-2",
        title: "Другой",
        position: 2,
        duration_seconds: 200,
        audio_path: "practices/b.mp3",
        status: "published",
      },
    ],
    filterPlayable: async (rows) => rows,
  });
  assert.equal(thirty.ok, true);
  assert.equal(thirty.track.trackId, "track-1");
  assert.equal(thirty.previewDurationSeconds, 30);
  assert.equal(thirty.window.endMs - thirty.window.startMs, 30_000);

  const fallback60 = await resolveMaxStorefrontPreview(paidPractice, {}, {
    listAudioItems: async () => [
      {
        id: "track-1",
        title: "Утро",
        position: 1,
        duration_seconds: 180,
        audio_path: "practices/a.mp3",
        status: "published",
        is_preview: false,
        preview_start_ms: null,
        preview_end_ms: null,
      },
    ],
    filterPlayable: async (rows) => rows,
  });
  assert.equal(fallback60.ok, true);
  assert.equal(fallback60.previewDurationSeconds, 60);
  assert.equal(fallback60.window.startMs, 0);
  assert.equal(fallback60.window.endMs, 60_000);

  const clipped90 = await resolveMaxStorefrontPreview(paidPractice, {}, {
    listAudioItems: async () => [
      {
        id: "track-1",
        title: "Утро",
        position: 1,
        duration_seconds: 180,
        audio_path: "practices/a.mp3",
        status: "published",
        preview_start_ms: 20_000,
        preview_end_ms: 110_000,
      },
    ],
    filterPlayable: async (rows) => rows,
  });
  assert.equal(clipped90.ok, true);
  assert.equal(clipped90.window.startMs, 20_000);
  assert.equal(clipped90.window.endMs, 80_000);
  assert.equal(clipped90.previewDurationSeconds, 60);

  const short40 = await resolveMaxStorefrontPreview(paidPractice, {}, {
    listAudioItems: async () => [
      {
        id: "track-1",
        title: "Короткий",
        position: 1,
        duration_seconds: 40,
        audio_path: "practices/a.mp3",
        status: "published",
        preview_start_ms: null,
        preview_end_ms: null,
      },
    ],
    filterPlayable: async (rows) => rows,
  });
  assert.equal(short40.ok, true);
  assert.equal(short40.previewDurationSeconds, 40);

  const courseL1 = await resolveMaxStorefrontPreview(coursePractice, {}, {
    listAudioItems: async () => [
      {
        id: "lesson-1",
        title: "Урок 1",
        position: 1,
        duration_seconds: 200,
        audio_path: "courses/l1.mp3",
        status: "published",
        preview_start_ms: 15_000,
        preview_end_ms: 75_000,
      },
      {
        id: "lesson-2",
        title: "Урок 2",
        position: 2,
        duration_seconds: 200,
        audio_path: "courses/l2.mp3",
        status: "published",
        preview_start_ms: 0,
        preview_end_ms: 60_000,
      },
    ],
    filterPlayable: async (rows) => rows,
    listCoursePreviewIds: async () => new Set(["lesson-1"]),
  });
  assert.equal(courseL1.ok, true);
  assert.equal(courseL1.track.trackId, "lesson-1");
  assert.equal(courseL1.previewDurationSeconds, 60);

  const courseLocked = await resolveMaxStorefrontPreview(coursePractice, {}, {
    listAudioItems: async () => [
      {
        id: "lesson-2",
        title: "Урок 2",
        position: 2,
        duration_seconds: 200,
        audio_path: "courses/l2.mp3",
        status: "published",
        preview_start_ms: 0,
        preview_end_ms: 60_000,
      },
    ],
    filterPlayable: async (rows) => rows,
    listCoursePreviewIds: async () => new Set(["lesson-1"]),
  });
  assert.deepEqual(courseLocked, { ok: false, reason: "preview_unavailable" });

  const courseNoWindow = await resolveMaxStorefrontPreview(coursePractice, {}, {
    listAudioItems: async () => [
      {
        id: "lesson-1",
        title: "Урок 1",
        position: 1,
        duration_seconds: 200,
        audio_path: "courses/l1.mp3",
        status: "published",
        preview_start_ms: null,
        preview_end_ms: null,
      },
    ],
    filterPlayable: async (rows) => rows,
    listCoursePreviewIds: async () => new Set(["lesson-1"]),
  });
  assert.deepEqual(courseNoWindow, { ok: false, reason: "preview_unavailable" });

  const musicClip = await resolveMaxStorefrontPreview(musicPractice, {}, {
    listAudioItems: async () => [
      {
        id: "music-1",
        title: "Трек",
        position: 1,
        duration_seconds: 200,
        audio_path: null,
        status: "published",
        active_music_delivery_asset_id: "asset-1",
      },
    ],
    filterPlayable: async (rows) => rows,
    loadActiveStream: async () => ({
      audioItemId: "music-1",
      assetRole: "stream",
      lifecycleState: "verified",
      storageBucket: "music-streams",
      storagePath: "streams/music-1.mp3",
    }),
  });
  assert.equal(musicClip.ok, true);
  assert.ok(musicClip.previewDurationSeconds <= 60);
  assert.equal(JSON.stringify(musicClip.track).includes("music-streams"), false);
  assert.equal(JSON.stringify(musicClip.track).includes("streams/music-1.mp3"), false);

  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => listed(),
    getPractice: async () => ({ practice: paidPractice, error: false }),
    buildPreviewClip: async ({ trackId }) => {
      assert.equal(trackId, "preview-1");
      return { ok: true, bytes: new Uint8Array([1, 2, 3]), startMs: 0, endMs: 60_000 };
    },
  });
  const clip = await buildMaxPlaybackPreviewClip("author", "product", "preview-1");
  assert.equal(clip.ok, true);
  assert.deepEqual([...clip.bytes], [1, 2, 3]);
  assert.equal(JSON.stringify(clip).includes("signed"), false);

  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => listed(),
    getPractice: async () => ({ practice: paidPractice, error: false }),
    preview: {
      listAudioItems: async () => [previewOk.audioItem],
      filterPlayable: async (rows) => rows,
    },
  });
  const otherTrack = await buildMaxPlaybackPreviewClip("author", "product", "track-other");
  assert.equal(otherTrack.ok, false);
  assert.equal(otherTrack.reason, "preview_unavailable");

  const track1 = "11111111-1111-4111-8111-111111111111";
  const track2 = "22222222-2222-4222-8222-222222222222";
  const foreignId = "33333333-3333-4333-8333-333333333333";
  const lesson1 = "44444444-4444-4444-8444-444444444444";
  const lesson2 = "55555555-5555-4555-8555-555555555555";
  const paidRows = [
    {
      id: track1,
      title: "Первый",
      position: 1,
      duration_seconds: 180,
      audio_path: "practices/a.mp3",
      status: "published",
      is_preview: true,
      preview_start_ms: 0,
      preview_end_ms: 60_000,
    },
    {
      id: track2,
      title: "Второй",
      position: 2,
      duration_seconds: 200,
      audio_path: "practices/b.mp3",
      status: "published",
      is_preview: false,
      preview_start_ms: 5_000,
      preview_end_ms: 50_000,
    },
  ];
  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => listed(),
    getPractice: async () => ({ practice: paidPractice, error: false }),
    loadSession: async () => ({ ok: false, reason: "unavailable" }),
    preview: {
      listAudioItems: async () => paidRows,
      filterPlayable: async (rows) => rows,
    },
  });
  const canonicalPreview = await getMaxPlaybackSession(userId, "author", "product");
  assert.equal(canonicalPreview.ok, true);
  assert.equal(canonicalPreview.playbackMode, "preview");
  assert.equal(canonicalPreview.session.tracks.length, 1);
  assert.equal(canonicalPreview.session.tracks[0].trackId, track1);
  const playlistTrack = await getMaxPlaybackSession(
    userId,
    "author",
    "product",
    undefined,
    track2,
  );
  assert.equal(playlistTrack.ok, true);
  assert.equal(playlistTrack.playbackMode, "preview");
  assert.equal(playlistTrack.session.tracks.length, 1);
  assert.equal(playlistTrack.session.tracks[0].trackId, track2);
  assert.equal(JSON.stringify(playlistTrack.session).includes(track1), false);
  assert.equal(JSON.stringify(playlistTrack).includes("audio_path"), false);
  const foreignPreview = await getMaxPlaybackSession(
    userId,
    "author",
    "product",
    undefined,
    foreignId,
  );
  assert.deepEqual(foreignPreview, { ok: false, reason: "preview_unavailable" });

  const courseRows = [
    {
      id: lesson1,
      title: "Урок 1",
      position: 1,
      duration_seconds: 200,
      audio_path: "courses/l1.mp3",
      status: "published",
      preview_start_ms: 0,
      preview_end_ms: 60_000,
    },
    {
      id: lesson2,
      title: "Урок 2",
      position: 2,
      duration_seconds: 200,
      audio_path: "courses/l2.mp3",
      status: "published",
      preview_start_ms: 0,
      preview_end_ms: 60_000,
    },
  ];
  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => listed("course"),
    getPractice: async () => ({ practice: coursePractice, error: false }),
    loadSession: async () => ({ ok: false, reason: "unavailable" }),
    preview: {
      listAudioItems: async () => courseRows,
      filterPlayable: async (rows) => rows,
      listCoursePreviewIds: async () => new Set([lesson1]),
    },
  });
  const courseCanonical = await getMaxPlaybackSession(userId, "author", "course");
  assert.equal(courseCanonical.ok, true);
  assert.equal(courseCanonical.session.tracks.length, 1);
  assert.equal(courseCanonical.session.tracks[0].trackId, lesson1);
  const courseSelected = await getMaxPlaybackSession(
    userId,
    "author",
    "course",
    undefined,
    lesson1,
  );
  assert.equal(courseSelected.ok, true);
  assert.equal(courseSelected.session.tracks[0].trackId, lesson1);
  const courseOutsideAllowList = await getMaxPlaybackSession(
    userId,
    "author",
    "course",
    undefined,
    lesson2,
  );
  assert.deepEqual(courseOutsideAllowList, { ok: false, reason: "preview_unavailable" });
  const courseForeign = await getMaxPlaybackSession(
    userId,
    "author",
    "course",
    undefined,
    foreignId,
  );
  assert.deepEqual(courseForeign, { ok: false, reason: "preview_unavailable" });
  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => listed("course"),
    getPractice: async () => ({ practice: coursePractice, error: false }),
    loadSession: async () => ({ ok: false, reason: "unavailable" }),
    preview: {
      listAudioItems: async () => [
        {
          id: lesson1,
          title: "Урок 1",
          position: 1,
          duration_seconds: 200,
          audio_path: "courses/l1.mp3",
          status: "published",
          preview_start_ms: null,
          preview_end_ms: null,
        },
      ],
      filterPlayable: async (rows) => rows,
      listCoursePreviewIds: async () => new Set([lesson1]),
    },
  });
  const courseAllowedWithoutWindow = await getMaxPlaybackSession(
    userId,
    "author",
    "course",
    undefined,
    lesson1,
  );
  assert.deepEqual(courseAllowedWithoutWindow, {
    ok: false,
    reason: "preview_unavailable",
  });

  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => listed("other"),
    getPractice: async () => ({ practice: { ...paidPractice, slug: "other" }, error: false }),
    buildPreviewClip: async () => {
      throw new Error("other product track must not clip");
    },
  });
  const otherProduct = await buildMaxPlaybackPreviewClip("author", "product", "preview-1");
  assert.deepEqual(otherProduct, { ok: false, reason: "not_found" });

  setMaxPlaybackDepsForTests({
    createClient: () => ({}),
    listCatalog: async () => listed(),
    getPractice: async () => ({ practice: paidPractice, error: false }),
    signAudio: async () => ({ ok: false, reason: "access_required" }),
  });
  const fullDenied = await signMaxPlaybackAudio(userId, "author", "product", "preview-1");
  assert.deepEqual(fullDenied, { ok: false, reason: "access_required" });
} finally {
  setMaxPlaybackDepsForTests(null);
}

console.log("max-paid-preview-session-unit: ok");
