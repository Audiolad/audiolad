#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parseSpaManifest } from "../src/lib/business-app/spa-manifest.ts";
import {
  SPA_LOG_QUEUE_MAX,
  spaSignedUrlTtlSeconds,
  ackLog,
  enqueueLog,
  formatOfflineLabel,
  isLogEvent,
  nextIndex,
  offlineUntil,
  parseLogQueue,
  parseResume,
  resolveResume,
} from "../src/lib/business-app/spa-player-core.ts";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const DAY = 86400000;

// queue loops back-to-back
assert.equal(nextIndex(12, 0), 1);
assert.equal(nextIndex(12, 11), 0);
assert.equal(nextIndex(0, 0), -1);

// resume
const items = [1, 2, 3].map((n) => ({ audioItemId: id(n), durationSeconds: 600 }));
assert.deepEqual(resolveResume(items, null), { index: 0, positionSec: 0 });
assert.deepEqual(resolveResume(items, { audioItemId: id(2), positionSec: 123.5, savedAt: 1 }), { index: 1, positionSec: 123.5 });
assert.deepEqual(resolveResume(items, { audioItemId: id(3), positionSec: 599, savedAt: 1 }), { index: 0, positionSec: 0 });
// removed track -> next surviving one from the old order
assert.deepEqual(
  resolveResume([items[0], items[2]], { audioItemId: id(2), positionSec: 50, savedAt: 1 }, [id(1), id(2), id(3)]),
  { index: 1, positionSec: 0 },
);
assert.equal(parseResume("{bad"), null);
assert.deepEqual(parseResume(JSON.stringify({ audioItemId: id(1), positionSec: 3, savedAt: 9 })), { audioItemId: id(1), positionSec: 3, savedAt: 9 });

// offline deadline: fixture manifest with ELIGIBLE grants (offline 10d from server is capped to 7d)
const gen = new Date("2026-10-13T06:00:00Z");
const m = parseSpaManifest({
  manifest_version: "business_spa_manifest_v1",
  program_id: id(100),
  location_id: id(101),
  generated_at: gen.toISOString(),
  expires_at: new Date(gen.getTime() + 7 * DAY).toISOString(),
  offline_cache_max_seconds: 7 * 86400,
  withheld_count: 0,
  content_hash: "x",
  items: [
    { position: 1, audio_item_id: id(1), title: "A", duration_seconds: 600, gain_db: -6, playable_until: null, offline_allowed: true, offline_cache_until: new Date(gen.getTime() + 10 * DAY).toISOString() },
    { position: 2, audio_item_id: id(2), title: "B", duration_seconds: 600, gain_db: null, playable_until: null, offline_allowed: true, offline_cache_until: new Date(gen.getTime() + 3 * DAY).toISOString() },
    { position: 3, audio_item_id: id(3), title: "C", duration_seconds: 600, gain_db: null, playable_until: null, offline_allowed: false, offline_cache_until: null },
  ],
});
assert.equal(offlineUntil(m, new Map()), null);
const u1 = offlineUntil(m, new Map([[id(1), gen]]));
assert.ok(u1 && u1.getTime() <= gen.getTime() + 7 * DAY, "never beyond 7 days");
assert.equal(offlineUntil(m, new Map([[id(1), gen], [id(2), gen]])).getTime(), gen.getTime() + 3 * DAY, "earliest deadline wins");
assert.equal(offlineUntil(m, new Map([[id(3), gen]])), null, "non-offline track never counts");
assert.match(formatOfflineLabel(new Date("2026-10-20T06:00:00Z")), /^Без интернета до 20\.10\.2026/);
assert.match(formatOfflineLabel(null), /недоступно/);

// log queue
const ev = (n, extra = {}) => ({
  client_event_id: id(n), player_id: id(900), zone_id: id(901), audio_item_id: id(1), event: "complete",
  started_at: "2026-10-13T06:00:00Z", ended_at: "2026-10-13T06:10:00Z", played_ms: 600000, offline: true, ...extra,
});
let q = enqueueLog([], ev(1));
q = enqueueLog(q, ev(1));
assert.equal(q.length, 1, "dedupe");
q = enqueueLog(q, ev(2));
assert.deepEqual(ackLog(q, [id(1)]).map((e) => e.client_event_id), [id(2)]);
assert.equal(isLogEvent(ev(3, { ended_at: "2026-10-13T05:00:00Z" })), false, "end before start");
assert.equal(isLogEvent(ev(3, { event: "start" })), false);
assert.equal(isLogEvent(ev(3, { played_ms: -1 })), false);
assert.equal(parseLogQueue(JSON.stringify([ev(5), { junk: 1 }])).length, 1);
let big = [];
for (let i = 0; i < SPA_LOG_QUEUE_MAX + 3; i++) big = enqueueLog(big, ev(i + 10));
assert.equal(big.length, SPA_LOG_QUEUE_MAX);

// Event context is bound at creation: events without player/zone are rejected.
assert.equal(isLogEvent(ev(3, { player_id: undefined })), false, "player bound at creation");
assert.equal(isLogEvent(ev(3, { zone_id: "x" })), false);

// Signed URL TTL never outlives playable_until / manifest expiry / offline deadline.
const now = new Date("2026-10-13T06:00:00Z");
const far = new Date(now.getTime() + 7 * DAY);
assert.equal(spaSignedUrlTtlSeconds({ playableUntil: null, manifestExpiresAt: far }, now), 3600);
assert.equal(spaSignedUrlTtlSeconds({ playableUntil: new Date(now.getTime() + 60000), manifestExpiresAt: far }, now), 60, "grant ends in 1 min");
assert.equal(spaSignedUrlTtlSeconds({ playableUntil: new Date(now.getTime() - 1), manifestExpiresAt: far }, now), 0, "expired -> refuse");
assert.equal(spaSignedUrlTtlSeconds({ playableUntil: null, manifestExpiresAt: new Date(now.getTime() + 120000) }, now), 120);
assert.equal(spaSignedUrlTtlSeconds({ playableUntil: null, manifestExpiresAt: far, offlineCacheUntil: null }, now), 0, "offline without permission");
assert.equal(spaSignedUrlTtlSeconds({ playableUntil: null, manifestExpiresAt: far, offlineCacheUntil: new Date(now.getTime() + 30000) }, now), 30);

// Server: sync uses the event's bound player/zone, never the current assignment; signing is TTL-bounded.
const actionsSrc = readFileSync(new URL("../src/app/business-app/spa/actions.ts", import.meta.url), "utf8");
assert.match(actionsSrc, /player_id: e\.player_id/);
assert.doesNotMatch(actionsSrc, /player_id: ctx\.playerId/);
const pilotSrc = readFileSync(new URL("../src/lib/business-app/spa-pilot.ts", import.meta.url), "utf8");
assert.match(pilotSrc, /createSignedUrl\(source\.path, ttl\)/);
assert.match(pilotSrc, /business_spa_offline_not_allowed/);

console.log("business-spa-player-core-unit: all tests passed");
