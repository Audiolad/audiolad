#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildSupportDiagnostics,
  deriveSupportIssues,
  formatHeartbeatAgeRu,
  mapSupportHealthRpcRows,
} from "../src/lib/business-app/support-diagnostics.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const mapped = mapSupportHealthRpcRows([
  {
    player_id: "p1",
    player_code: "AL-P-000000001",
    display_name: "Venue",
    player_status: "active",
    health_status: "online",
    seconds_since_heartbeat: 12,
    last_heartbeat_at: "2026-10-01T12:00:00Z",
    location_id: "loc1",
    zone_id: "zone1",
  },
]);
assert.equal(mapped.length, 1);
assert.equal(mapped[0].playerCode, "AL-P-000000001");
assert.equal(mapped[0].healthStatus, "online");
assert.equal(mapped[0].zoneId, "zone1");

const onlineDiag = buildSupportDiagnostics({
  hasUser: true,
  organizationId: "org1",
  organizationName: "Пилот Slice",
  location: {
    id: "loc1",
    name: "Точка 1",
    timezone: "Europe/Moscow",
    countryCode: "RU",
    status: "active",
    defaultZoneId: "zone1",
  },
  players: mapped,
  lastPlay: {
    occurredAt: new Date(Date.now() - 60_000).toISOString(),
    audioItemId: "audio1",
    playerId: "p1",
    locationId: "loc1",
    minutesAgo: null,
  },
});
assert.equal(onlineDiag.overall, "ok");
assert.equal(onlineDiag.lastPlay?.minutesAgo, 1);
assert.equal(onlineDiag.issues.length, 0);

const offlineIssues = deriveSupportIssues({
  hasUser: true,
  organizationId: "org1",
  locationId: "loc1",
  players: [
    {
      playerId: "p1",
      playerCode: "AL-P-1",
      displayName: null,
      playerStatus: "active",
      healthStatus: "offline",
      secondsSinceHeartbeat: 900,
      lastHeartbeatAt: null,
      locationId: "loc1",
      zoneId: "zone1",
    },
  ],
  lastPlay: null,
});
assert.ok(offlineIssues.some((i) => i.code === "PLAYER_OFFLINE"));
assert.ok(offlineIssues.some((i) => i.code === "NO_BUSINESS_PLAY"));

const noPlayer = deriveSupportIssues({
  hasUser: true,
  organizationId: "org1",
  locationId: "loc1",
  players: [],
  lastPlay: null,
});
assert.ok(noPlayer.some((i) => i.code === "NO_PLAYER"));

assert.equal(formatHeartbeatAgeRu(12), "12 с назад");
assert.equal(formatHeartbeatAgeRu(120), "2 мин назад");
assert.equal(formatHeartbeatAgeRu(null), "нет данных");

assert.equal(
  existsSync(join(repoRoot, "src/lib/business-app/support-diagnostics.ts")),
  true,
);
assert.equal(
  existsSync(join(repoRoot, "src/lib/business-app/load-support-diagnostics.ts")),
  true,
);
assert.equal(
  existsSync(
    join(
      repoRoot,
      "src/components/business-app/BusinessSupportDiagnosticPage.tsx",
    ),
  ),
  true,
);

const help = readFileSync(
  join(repoRoot, "src/app/business-app/help/page.tsx"),
  "utf8",
);
assert.match(help, /loadBusinessSupportDiagnostics/);
assert.match(help, /BusinessSupportDiagnosticPage/);
assert.doesNotMatch(help, /BusinessEmptySection/);

const loadSrc = readFileSync(
  join(repoRoot, "src/lib/business-app/load-support-diagnostics.ts"),
  "utf8",
);
assert.match(loadSrc, /get_business_player_health/);
assert.match(loadSrc, /playback_usage_facts/);
assert.match(loadSrc, /usage_kind/);
assert.doesNotMatch(loadSrc, /ELIGIBLE|music_rights_grants/);

const pureSrc = readFileSync(
  join(repoRoot, "src/lib/business-app/support-diagnostics.ts"),
  "utf8",
);
assert.doesNotMatch(pureSrc, /createClient|createServiceRoleClient/);
assert.doesNotMatch(pureSrc, /ELIGIBLE|music_rights_grants/);

const nav = readFileSync(join(repoRoot, "src/lib/business-app/nav.ts"), "utf8");
assert.match(nav, /id: "help"[\s\S]*?available: true/);

const home = readFileSync(
  join(repoRoot, "src/components/business-app/BusinessHomePage.tsx"),
  "utf8",
);
assert.match(home, /href="\/help"/);
assert.doesNotMatch(home, /Диагностика расширится в P1-07/);

console.log("business-app-support-diagnostics-unit: ok");
