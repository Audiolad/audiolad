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
// c02fe282 P0-1: no URL override, no fake track, no unverified claims.
assert.doesNotMatch(home, /mockStateOverride|mockState/);
assert.doesNotMatch(home, /BUSINESS_HOME_MOCK|mock-data/);
assert.doesNotMatch(home, /Всё работает|Лицензия активна|Документы в порядке|Всё под контролем/);
assert.doesNotMatch(home, /Интернет работает|Соединение стабильно|Музыка остановилась/);
assert.doesNotMatch(home, /Сейчас играет|progressbar|Пропустить|Больше такого/);
assert.match(home, /Лицензия: нет подтверждённых данных/);
assert.match(home, /buildBusinessHomeStatusCopy/);
assert.doesNotMatch(home, /useState/);
assert.doesNotMatch(home, /initialState/);
assert.doesNotMatch(home, /BUSINESS_HOME_MOCK\.stoppedMinutes/);

const page = readFileSync(
  join(repoRoot, "src/app/business-app/page.tsx"),
  "utf8",
);
assert.doesNotMatch(page, /mockStateOverride|isBusinessPointState|BUSINESS_MOCK_STATE_QUERY|searchParams/);

const greetingSrc = readFileSync(
  join(repoRoot, "src/lib/business-app/greeting.ts"),
  "utf8",
);
assert.doesNotMatch(greetingSrc, /Всё отлично|играет как запланировано|работает автономно/);

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

// c02fe282 P0-1: behavioural status copy.
const { buildBusinessHomeStatusCopy, formatBusinessAge } = await import(
  "../src/lib/business-app/owner-home-status-copy.ts"
);
const base = {
  pointState: "stopped",
  playerCount: 1,
  primaryHealthStatus: "online",
  secondsSinceHeartbeat: 30,
  stoppedMinutes: null,
  lastBusinessPlayAt: null,
  lastPlayMinutesAgo: null,
  source: "player_health",
};
const copy = (patch) =>
  patch === null ? buildBusinessHomeStatusCopy(null) : buildBusinessHomeStatusCopy({ ...base, ...patch });
assert.equal(copy(null).kind, "no_data");
assert.equal(copy({ playerCount: 0 }).kind, "no_data");
const onlineCopy = copy({});
assert.equal(onlineCopy.kind, "online");
assert.match(onlineCopy.detail, /не подтверждает, что музыка звучит/);
assert.equal(copy({ primaryHealthStatus: "stale", secondsSinceHeartbeat: 600 }).kind, "stale");
assert.equal(copy({ primaryHealthStatus: "offline", secondsSinceHeartbeat: 7200 }).kind, "offline");
assert.equal(copy({ primaryHealthStatus: "never_seen", secondsSinceHeartbeat: null }).kind, "unknown");
assert.equal(copy({ primaryHealthStatus: "none", secondsSinceHeartbeat: null }).kind, "unknown");
assert.equal(copy({ primaryHealthStatus: "offline", secondsSinceHeartbeat: null }).kind, "unknown");
assert.equal(copy({ primaryHealthStatus: "stale", secondsSinceHeartbeat: -5 }).kind, "unknown");
for (const c of [copy(null), copy({}), copy({ primaryHealthStatus: "never_seen", secondsSinceHeartbeat: null })]) {
  assert.doesNotMatch(c.title + c.detail, /Всё работает|Музыка играет|остановил/);
}
assert.equal(formatBusinessAge(null), null);
assert.equal(formatBusinessAge(-1), null);
assert.equal(formatBusinessAge(5), "5 мин назад");

console.log("business-app-owner-home-signals-unit: ok");
