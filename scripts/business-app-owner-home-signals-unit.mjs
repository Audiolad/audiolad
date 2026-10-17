#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { deriveBusinessPointState, deriveOwnerOverallStatus } from "../src/lib/business-app/owner-home-signals.ts";

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
assert.doesNotMatch(home, /Сейчас играет|progressbar|Пропустить/);
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
assert.equal(copy({ primaryHealthStatus: "stale", secondsSinceHeartbeat: 600 }).kind, "offline");
assert.equal(copy({ primaryHealthStatus: "offline", secondsSinceHeartbeat: 7200 }).kind, "offline");
assert.equal(copy({ primaryHealthStatus: "never_seen", secondsSinceHeartbeat: null }).kind, "no_data");
assert.equal(copy({ primaryHealthStatus: "none", secondsSinceHeartbeat: null }).kind, "no_data");
assert.equal(copy({ primaryHealthStatus: "offline", secondsSinceHeartbeat: null }).kind, "no_data");
assert.equal(copy({ primaryHealthStatus: "stale", secondsSinceHeartbeat: -5 }).kind, "no_data");
for (const c of [copy(null), copy({}), copy({ primaryHealthStatus: "never_seen", secondsSinceHeartbeat: null })]) {
  assert.doesNotMatch(c.title + c.detail, /Всё работает|Музыка играет|остановил/);
}
assert.equal(formatBusinessAge(null), null);
assert.equal(formatBusinessAge(-1), null);
for (const minutes of [0, 0.1, 29 / 60]) assert.equal(formatBusinessAge(minutes), "только что");
for (const minutes of [0.5, 0.75, 59 / 60]) assert.equal(formatBusinessAge(minutes), "меньше минуты назад");
assert.equal(formatBusinessAge(1), "1 мин назад");
assert.equal(formatBusinessAge(NaN), null);
assert.equal(formatBusinessAge(Infinity), null);
assert.equal(formatBusinessAge(5), "5 мин назад");

// Connectivity is measured by heartbeat age, independent of RPC health labels.
for (const status of ["online", "stale", "offline"]) {
  assert.equal(copy({ primaryHealthStatus: status, secondsSinceHeartbeat: 300 }).title, "Плеер на связи");
  const lost = copy({ primaryHealthStatus: status, secondsSinceHeartbeat: 301 });
  assert.equal(lost.title, "Нет связи с плеером");
  assert.equal(lost.tone, "neutral");
  assert.match(lost.detail, /может продолжать играть/);
}
for (const seconds of [null, NaN, Infinity, -1]) {
  assert.equal(copy({ secondsSinceHeartbeat: seconds }).tone, "neutral");
  assert.equal(copy({ secondsSinceHeartbeat: seconds }).title, "Нет данных о плеере");
}
assert.equal(copy({ primaryHealthStatus: "never_seen", secondsSinceHeartbeat: 1 }).title, "Нет данных о плеере");
assert.equal(copy({ primaryHealthStatus: "unknown", secondsSinceHeartbeat: 1 }).title, "Нет данных о плеере");
assert.equal(buildBusinessHomeStatusCopy(base, true).title, "Точка закрыта");
assert.equal(buildBusinessHomeStatusCopy(base, true).tone, "neutral");
assert.equal(buildBusinessHomeStatusCopy(base, false).kind, "online");

const { deriveOwnerPlaybackSignal } = await import("../src/lib/business-app/owner-home-signals.ts");
const nowMs = Date.parse("2026-10-14T12:00:00Z");
const playback = (patch = {}) => deriveOwnerPlaybackSignal({ nowMs, ...patch });
const atAge = (seconds) => new Date(nowMs - seconds * 1000).toISOString();
assert.equal(playback().title, "Воспроизведение не подтверждено");
for (const state of [null, "playing", "error"]) {
  for (const timestamp of [null, "invalid", atAge(-1)]) {
    assert.equal(playback({ playbackState: state, playbackConfirmedAt: timestamp }).kind, "unconfirmed");
  }
  assert.equal(playback({ playbackState: state, playbackConfirmedAt: atAge(301) }).kind, "stale");
  assert.equal(playback({ playbackState: state, playbackConfirmedAt: atAge(301) }).tone, "neutral");
}
for (const seconds of [0, 299, 300]) {
  const confirmed = playback({ playbackState: "playing", playbackConfirmedAt: atAge(seconds) });
  assert.equal(confirmed.title, "Воспроизведение подтверждено");
  assert.equal(confirmed.kind, "confirmed");
}
// Paused/stopped are fresh reported states (mapper drops stale ones), independent of confirmation.
for (const state of ["paused", "stopped"]) {
  for (const timestamp of [null, atAge(30), atAge(3000)]) {
    assert.equal(playback({ playbackState: state, playbackConfirmedAt: timestamp }).kind, state);
    assert.doesNotMatch(playback({ playbackState: state, playbackConfirmedAt: timestamp }).title, /подтверждено/);
  }
  assert.equal(playback({ playbackState: state, playbackConfirmedAt: atAge(30) }).kind, state);
  assert.equal(playback({ playbackState: state, playbackConfirmedAt: atAge(30) }).tone, "neutral");
}
for (const state of [null, "error"]) {
  assert.equal(playback({ playbackState: state, playbackConfirmedAt: atAge(30) }).kind, "unconfirmed");
}
assert.equal(playback({ errorConfirmed: true }).tone, "error");
assert.equal(playback({ playbackState: "playing", playbackConfirmedAt: atAge(0), errorConfirmed: true }).kind, "error");
assert.equal(playback({ playbackState: "error", errorConfirmed: false }).tone, "neutral");
// A 45-minute track still playing: periodic confirmation stays fresh regardless of track start.
const trackStartedAt = atAge(45 * 60);
assert.equal((nowMs - Date.parse(trackStartedAt)) / 60_000, 45);
assert.equal(playback({ playbackState: "playing", playbackConfirmedAt: atAge(30) }).kind, "confirmed");
assert.equal(playback({ playbackState: "playing", playbackConfirmedAt: trackStartedAt }).kind, "stale");
assert.equal(playback({ playbackState: "playing", playbackConfirmedAt: trackStartedAt }).tone, "neutral");
// Overall priority and truthfulness across every independent signal combination.
for (const connectivity of [copy(null), copy({}), copy({ secondsSinceHeartbeat: 301 }), buildBusinessHomeStatusCopy(base, true)]) {
  for (const sound of [playback(), playback({ playbackConfirmedAt: atAge(301) }), ...["playing", "paused", "stopped", "error"].map(playbackState => playback({ playbackState, playbackConfirmedAt: atAge(0) })), playback({ errorConfirmed: true })]) {
    const overall = deriveOwnerOverallStatus(connectivity, sound);
    assert.equal(overall.tone === "error", sound.tone === "error");
    assert.equal(overall.title.includes("Музыка играет"), sound.kind === "confirmed");
    assert.equal(overall.title, sound.tone === "error" ? sound.title : sound.kind === "confirmed" ? "Музыка играет – воспроизведение подтверждено" : connectivity.title);
    assert.deepEqual(deriveOwnerOverallStatus(connectivity, sound), overall);
  }
}
console.log("business-app-owner-home-signals-unit: ok");
