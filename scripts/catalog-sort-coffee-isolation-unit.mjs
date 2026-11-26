#!/usr/bin/env node
/**
 * coffee.audiolad.ru (venue B2B) facts must not affect audiolad.ru public catalog counts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  countQualifiedListenSessionsByPractice,
  isPublicCatalogPlaybackFact,
} from "../src/lib/catalog/sort-metrics-pure.ts";
import { PUBLIC_CATALOG_PLAYBACK_USAGE_KIND } from "../src/lib/catalog/sort-constants.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sharedSession = "coffee-venue-session-1";
const publicPractice = "practice-on-both-catalogs";

const migration = readFileSync(
  join(root, "supabase/migrations/20271126140000_catalog_qualified_listen_40s_threshold.sql"),
  "utf8",
);
assert.match(migration, /usage_kind = 'consumer'/, "SQL excludes coffee/B2B facts");

const venuePlayer = readFileSync(
  join(root, "src/components/business-app/VenuePlayerPage.tsx"),
  "utf8",
);
assert.match(
  venuePlayer,
  /apply_business_playback_usage_heartbeat/,
  "coffee venue player writes business usage ledger",
);

assert.equal(PUBLIC_CATALOG_PLAYBACK_USAGE_KIND, "consumer");
assert.equal(isPublicCatalogPlaybackFact({ usageKind: "business" }), false);
assert.equal(isPublicCatalogPlaybackFact({}), true);

const mixed = countQualifiedListenSessionsByPractice([
  {
    practiceId: publicPractice,
    sessionId: sharedSession,
    listeningKey: "business:player:session",
    listenedMs: 120_000,
    usageKind: "business",
  },
  {
    practiceId: publicPractice,
    sessionId: sharedSession,
    listeningKey: "consumer:track:1",
    listenedMs: 45_000,
    usageKind: "consumer",
  },
]);

assert.equal(
  mixed.get(publicPractice),
  1,
  "only consumer session qualifies for public popularity",
);

const radioAutoplay = countQualifiedListenSessionsByPractice([
  {
    practiceId: "album-a",
    sessionId: sharedSession,
    listeningKey: "biz:a",
    listenedMs: 90_000,
    usageKind: "business",
  },
  {
    practiceId: "album-b",
    sessionId: sharedSession,
    listeningKey: "biz:b",
    listenedMs: 90_000,
    usageKind: "business",
  },
  {
    practiceId: "album-a",
    sessionId: sharedSession,
    listeningKey: "pub:a",
    listenedMs: 41_000,
    usageKind: "consumer",
  },
  {
    practiceId: "album-b",
    sessionId: sharedSession,
    listeningKey: "pub:b",
    listenedMs: 41_000,
    usageKind: "consumer",
  },
]);

assert.equal(radioAutoplay.get("album-a"), 1);
assert.equal(radioAutoplay.get("album-b"), 1);

console.log("catalog-sort-coffee-isolation-unit: ok");