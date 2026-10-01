#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { deriveBusinessPointState } from "../src/lib/business-app/owner-home-signals.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const online = deriveBusinessPointState({
  players: [
    {
      playerId: "p1",
      playerCode: "AL-P-1",
      displayName: "Venue",
      healthStatus: "online",
      secondsSinceHeartbeat: 12,
      locationId: "loc1",
    },
  ],
  locationId: "loc1",
  lastBusinessPlayAt: new Date(Date.now() - 60_000).toISOString(),
});
assert.equal(online.pointState, "healthy");
assert.equal(online.primaryHealthStatus, "online");
assert.equal(online.lastPlayMinutesAgo, 1);

const stale = deriveBusinessPointState({
  players: [
    {
      playerId: "p1",
      playerCode: "AL-P-1",
      displayName: null,
      healthStatus: "stale",
      secondsSinceHeartbeat: 120,
      locationId: "loc1",
    },
  ],
  locationId: "loc1",
});
assert.equal(stale.pointState, "autonomous");

const offline = deriveBusinessPointState({
  players: [
    {
      playerId: "p1",
      playerCode: "AL-P-1",
      displayName: null,
      healthStatus: "offline",
      secondsSinceHeartbeat: 900,
      locationId: "loc1",
    },
  ],
  locationId: "loc1",
});
assert.equal(offline.pointState, "stopped");
assert.equal(offline.stoppedMinutes, 15);

const none = deriveBusinessPointState({ players: [], locationId: "loc1" });
assert.equal(none.pointState, "stopped");
assert.equal(none.primaryHealthStatus, "none");

const mixed = deriveBusinessPointState({
  players: [
    {
      playerId: "a",
      playerCode: "A",
      displayName: null,
      healthStatus: "offline",
      secondsSinceHeartbeat: 999,
      locationId: "loc1",
    },
    {
      playerId: "b",
      playerCode: "B",
      displayName: null,
      healthStatus: "online",
      secondsSinceHeartbeat: 5,
      locationId: "loc1",
    },
  ],
  locationId: "loc1",
});
assert.equal(mixed.pointState, "healthy");

assert.equal(
  existsSync(join(repoRoot, "src/lib/business-app/owner-home-signals.ts")),
  true,
);
assert.equal(
  existsSync(join(repoRoot, "src/lib/business-app/load-owner-home-signals.ts")),
  true,
);

const domain = readFileSync(
  join(repoRoot, "src/lib/business-app/domain.ts"),
  "utf8",
);
assert.match(domain, /loadBusinessOwnerHomeSignals/);
assert.match(domain, /signals/);
assert.doesNotMatch(domain, /BUSINESS_HOME_MOCK/);

const home = readFileSync(
  join(repoRoot, "src/components/business-app/BusinessHomePage.tsx"),
  "utf8",
);
assert.match(home, /domain\.signals/);
assert.match(home, /mockStateOverride/);
assert.doesNotMatch(home, /initialState/);
assert.doesNotMatch(home, /BUSINESS_HOME_MOCK\.stoppedMinutes/);

const page = readFileSync(
  join(repoRoot, "src/app/business-app/page.tsx"),
  "utf8",
);
assert.match(page, /mockStateOverride/);
assert.match(page, /isBusinessPointState/);

const signalsSrc = readFileSync(
  join(repoRoot, "src/lib/business-app/owner-home-signals.ts"),
  "utf8",
);
assert.match(signalsSrc, /deriveBusinessPointState/);
assert.doesNotMatch(signalsSrc, /createClient|createServiceRoleClient/);
assert.doesNotMatch(signalsSrc, /ELIGIBLE|music_rights_grants/);

const loadSrc = readFileSync(
  join(repoRoot, "src/lib/business-app/load-owner-home-signals.ts"),
  "utf8",
);
assert.match(loadSrc, /get_business_player_health/);
assert.match(loadSrc, /playback_usage_facts/);
assert.match(loadSrc, /usage_kind/);
assert.doesNotMatch(loadSrc, /ELIGIBLE|music_rights_grants/);

console.log("business-app-owner-home-signals-unit: ok");
