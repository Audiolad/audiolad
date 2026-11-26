#!/usr/bin/env node
/**
 * Catalog popularity session buckets: listening_key vs shared session_id (album / autoplay).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildListeningSessionKey } from "../src/lib/analytics/dedup.ts";
import {
  countQualifiedListenSessionsByPractice,
  practiceListenSessionBucket,
} from "../src/lib/catalog/sort-metrics-pure.ts";
import {
  resetPlaybackListeningContextForTests,
  resolvePlaybackUsageListeningKey,
} from "../src/lib/analytics/listening-context-store.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  join(root, "supabase/migrations/20271126120000_catalog_listing_qualified_listen_counts.sql"),
  "utf8",
);

const startedAt = 1_700_000_000_000;
const practiceAlbum = "practice-album";
const track1 = "audio-track-1";
const track2 = "audio-track-2";
const sessionId = "11111111-1111-1111-1111-111111111111";

const track1Key = buildListeningSessionKey({
  practiceId: practiceAlbum,
  audioItemId: track1,
  sessionStartedAt: startedAt,
});
const track2Key = buildListeningSessionKey({
  practiceId: practiceAlbum,
  audioItemId: track2,
  sessionStartedAt: startedAt,
});

assert.notEqual(track1Key, track2Key, "track change rotates listening_key within same player session");

resetPlaybackListeningContextForTests();
const firstUsageKey = resolvePlaybackUsageListeningKey({
  practiceId: practiceAlbum,
  audioItemId: track1,
  now: startedAt,
  isPlaying: true,
});
assert.equal(firstUsageKey, track1Key, "usage context starts on first track key");

const secondUsageKey = resolvePlaybackUsageListeningKey({
  practiceId: practiceAlbum,
  audioItemId: track2,
  now: startedAt + 5_000,
  isPlaying: true,
});
assert.match(
  secondUsageKey,
  new RegExp(`^${practiceAlbum}:${track2}:`),
  "usage opens a new listening_key when audio_item_id changes",
);
assert.notEqual(firstUsageKey, secondUsageKey);

const albumQualified = countQualifiedListenSessionsByPractice([
  {
    practiceId: practiceAlbum,
    sessionId,
    listeningKey: track1Key,
    listenedMs: 35_000,
  },
  {
    practiceId: practiceAlbum,
    sessionId,
    listeningKey: track2Key,
    listenedMs: 35_000,
  },
]);

assert.equal(
  albumQualified.get(practiceAlbum),
  1,
  "shared session_id merges album tracks into one qualified product listen",
);

assert.equal(
  countQualifiedListenSessionsByPractice([
    {
      practiceId: practiceAlbum,
      sessionId: null,
      listeningKey: track1Key,
      listenedMs: 30_000,
    },
    {
      practiceId: practiceAlbum,
      sessionId: null,
      listeningKey: track2Key,
      listenedMs: 30_000,
    },
  ]).get(practiceAlbum) ?? 0,
  0,
  "without session_id sub-threshold tracks do not qualify",
);

assert.equal(
  countQualifiedListenSessionsByPractice([
    {
      practiceId: practiceAlbum,
      sessionId: null,
      listeningKey: track1Key,
      listenedMs: 65_000,
    },
    {
      practiceId: practiceAlbum,
      sessionId: null,
      listeningKey: track2Key,
      listenedMs: 65_000,
    },
  ]).get(practiceAlbum),
  2,
  "without session_id each track >60s counts separately",
);

const radioAutoplay = countQualifiedListenSessionsByPractice([
  {
    practiceId: "album-a",
    sessionId,
    listeningKey: "album-a:t1:1",
    listenedMs: 65_000,
  },
  {
    practiceId: "album-b",
    sessionId,
    listeningKey: "album-b:t9:1",
    listenedMs: 65_000,
  },
]);

assert.equal(radioAutoplay.get("album-a"), 1, "radio credits first product");
assert.equal(radioAutoplay.get("album-b"), 1, "radio credits autoplay target product");

assert.equal(
  practiceListenSessionBucket({ sessionId, listeningKey: track1Key }),
  sessionId,
  "bucket prefers session_id",
);

assert.match(
  migration,
  /COALESCE\(f\.session_id::text, f\.listening_key\)/,
  "SQL buckets match methodology",
);

console.log("catalog-sort-listening-session-unit: ok");