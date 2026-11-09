#!/usr/bin/env npx tsx
/**
 * Hall stale-build reload + app_version contracts (t1325u).
 * No migration: business_player_runtime.app_version already exists.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  HALL_APP_VERSION_MAX,
  HALL_BUILD_RELOAD_STORAGE_KEY,
  HALL_STALE_BUILD_NOTE,
  hallBuildMismatch,
  normalizeHallAppVersion,
  pickHallBuildId,
  readReloadedBuildId,
  rememberReloadedBuildId,
  shouldReloadForNewBuild,
} from "../src/lib/business-app/hall-build-reload";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

assert.equal(normalizeHallAppVersion(SHA_A), SHA_A);
assert.equal(normalizeHallAppVersion(SHA_A.toUpperCase()), SHA_A);
assert.equal(normalizeHallAppVersion("next-build_01"), "next-build_01");
assert.equal(normalizeHallAppVersion(""), null);
assert.equal(normalizeHallAppVersion("x".repeat(HALL_APP_VERSION_MAX + 1)), null);
assert.equal(normalizeHallAppVersion("bad space"), null);
assert.equal(normalizeHallAppVersion(null), null);

assert.equal(hallBuildMismatch(SHA_A, SHA_A), false);
assert.equal(hallBuildMismatch(SHA_A, SHA_B), true);
assert.equal(hallBuildMismatch(null, SHA_B), false, "missing client never mismatches");
assert.equal(hallBuildMismatch(SHA_A, null), false, "missing server never mismatches");

assert.equal(pickHallBuildId({ deployCommit: SHA_A, buildId: "legacy" }), SHA_A);
assert.equal(pickHallBuildId({ deployCommit: null, buildId: "legacy-build" }), "legacy-build");
assert.equal(pickHallBuildId({}), null);

assert.equal(shouldReloadForNewBuild({
  pageVisible: true, musicPaused: true, justChangedTrack: false,
  pendingServerBuild: SHA_B, alreadyReloadedFor: null,
}), true, "paused + visible → reload");

assert.equal(shouldReloadForNewBuild({
  pageVisible: true, musicPaused: false, justChangedTrack: true,
  pendingServerBuild: SHA_B, alreadyReloadedFor: null,
}), true, "track boundary + visible → reload");

assert.equal(shouldReloadForNewBuild({
  pageVisible: true, musicPaused: false, justChangedTrack: false,
  pendingServerBuild: SHA_B, alreadyReloadedFor: null,
}), false, "never mid-track");

assert.equal(shouldReloadForNewBuild({
  pageVisible: false, musicPaused: true, justChangedTrack: false,
  pendingServerBuild: SHA_B, alreadyReloadedFor: null,
}), false, "hidden tab waits");

assert.equal(shouldReloadForNewBuild({
  pageVisible: true, musicPaused: true, justChangedTrack: false,
  pendingServerBuild: SHA_B, alreadyReloadedFor: SHA_B,
}), false, "reload-loop guard");

assert.equal(shouldReloadForNewBuild({
  pageVisible: true, musicPaused: true, justChangedTrack: false,
  pendingServerBuild: null, alreadyReloadedFor: null,
}), false);

const store = new Map<string, string>();
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
};
rememberReloadedBuildId(storage, SHA_B);
assert.equal(readReloadedBuildId(storage), SHA_B);
assert.equal(store.get(HALL_BUILD_RELOAD_STORAGE_KEY), SHA_B);

assert.match(HALL_STALE_BUILD_NOTE, /старой версии/);
assert.equal(HALL_STALE_BUILD_NOTE.includes("—"), false, "en dash only, no em dash");
assert.equal(HALL_STALE_BUILD_NOTE.includes("–"), true, "uses en dash");

const pointRoute = readFileSync(new URL("../src/app/api/business/point/route.ts", import.meta.url), "utf8");
assert.match(pointRoute, /writePlayerAppVersion/);
assert.match(pointRoute, /serverBuildId/);
assert.match(pointRoute, /normalizeHallAppVersion\(body\.appVersion\)/);
assert.match(pointRoute, /business_player_runtime/);
assert.doesNotMatch(pointRoute, /CREATE TABLE|ALTER TABLE/, "no migration in the route");

const client = readFileSync(new URL("../src/lib/business-app/cabinet-player-client.ts", import.meta.url), "utf8");
assert.match(client, /appVersion/);
assert.match(client, /serverBuildId/);

const cabinet = readFileSync(new URL("../src/components/business-app/workspace/BusinessCabinetPlayer.tsx", import.meta.url), "utf8");
assert.match(cabinet, /shouldReloadForNewBuild/);
assert.match(cabinet, /resolveHallClientBuildId/);
assert.match(cabinet, /justChangedTrack/);
assert.match(cabinet, /appVersion:/);

const slots = readFileSync(new URL("../src/components/business-app/BusinessPointSlots.tsx", import.meta.url), "utf8");
assert.match(slots, /HALL_STALE_BUILD_NOTE/);
assert.match(slots, /biz-venue-stale-build-notes/);
assert.match(slots, /Устройства на старой версии/);
assert.equal(slots.includes("—"), false, "slots UI: no em dash");

const loader = readFileSync(new URL("../src/lib/business-app/load-venue-status-dots.server.ts", import.meta.url), "utf8");
assert.match(loader, /business_player_runtime/);
assert.match(loader, /app_version/);
assert.match(loader, /staleBuild/);
assert.match(loader, /unconfirmedPlaying/);
assert.doesNotMatch(loader, /supabase\/migrations/, "no new migration referenced");

const migrations = readFileSync(new URL("../package.json", import.meta.url), "utf8");
assert.match(migrations, /test:business-hall-build-reload/);

console.log("business-hall-build-reload-unit: ok");
