#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUSINESS_PUBLIC_PATH_REWRITES,
  resolveBusinessInternalPath,
} from "../src/lib/business-app/host.ts";
import { resolveBusinessProxyAction } from "../src/lib/business-app/proxy-policy.ts";
import { BUSINESS_HOSTNAME, BUSINESS_SITE_PATH } from "../src/lib/business-app/host.ts";
import {
  BUSINESS_PRIMARY_NAV_ITEMS,
} from "../src/lib/business-app/nav.ts";
import {
  VENUE_PLAYER_APP_VERSION,
  VENUE_PLAYER_DEFAULT_HEARTBEAT_SECONDS,
  VENUE_PLAYER_POP_SAMPLE_INTERVAL_MS,
  VENUE_PLAYER_SLICE_POP_AUDIO_ITEM_ID,
  buildBusinessPopHeartbeatArgs,
  createVenuePlayerUuid,
  getVenuePlayerPilotTrack,
  isVenuePlayerCredential,
  isVenuePlayerUuid,
  resolveHeartbeatIntervalSeconds,
} from "../src/lib/business-app/venue-player.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

assert.equal(isVenuePlayerCredential("a".repeat(64)), true);
assert.equal(isVenuePlayerCredential("A".repeat(64)), false);
assert.equal(isVenuePlayerCredential("short"), false);

assert.equal(resolveHeartbeatIntervalSeconds(30), 30);
assert.equal(resolveHeartbeatIntervalSeconds(1), VENUE_PLAYER_DEFAULT_HEARTBEAT_SECONDS);
assert.equal(resolveHeartbeatIntervalSeconds("45"), 45);

const pilot = getVenuePlayerPilotTrack();
assert.equal(pilot.id, "pilot-tone-v0");
assert.match(pilot.src, /^data:audio\/wav;base64,/);
assert.ok(pilot.src.length > 100);

assert.equal(
  resolveBusinessInternalPath("/player"),
  `${BUSINESS_SITE_PATH}/player`,
);
assert.equal(
  BUSINESS_PUBLIC_PATH_REWRITES["/player"],
  `${BUSINESS_SITE_PATH}/player`,
);

const rewrite = resolveBusinessProxyAction(BUSINESS_HOSTNAME, "/player");
assert.equal(rewrite.action, "rewrite_business_app");
assert.equal(rewrite.pathname, `${BUSINESS_SITE_PATH}/player`);

assert.equal(
  resolveBusinessProxyAction("audiolad.ru", `${BUSINESS_SITE_PATH}/player`).action,
  "not_found",
);

assert.ok(
  BUSINESS_PRIMARY_NAV_ITEMS.some((i) => i.id === "player" && i.available),
  "player nav available",
);

assert.equal(existsSync(join(repoRoot, "src/app/business-app/player/page.tsx")), true);
assert.equal(
  existsSync(join(repoRoot, "src/components/business-app/VenuePlayerPage.tsx")),
  true,
);

const actions = readFileSync(join(repoRoot, "src/app/business-app/actions.ts"), "utf8");
assert.match(actions, /provisionVenuePlayer/);
assert.match(actions, /create_business_player/);
assert.match(actions, /assign_business_player_to_zone/);

const page = readFileSync(
  join(repoRoot, "src/components/business-app/VenuePlayerPage.tsx"),
  "utf8",
);
assert.match(page, /record_business_player_heartbeat/);
assert.match(page, /apply_business_playback_usage_heartbeat/);
assert.match(page, /buildBusinessPopHeartbeatArgs/);
assert.match(page, /getVenuePlayerPilotTrack/);
assert.match(page, /VENUE_PLAYER_APP_VERSION/);
assert.match(page, /BusinessEligibilityProbePanel/);
assert.equal(VENUE_PLAYER_APP_VERSION, "venue-player-v0");

assert.ok(VENUE_PLAYER_POP_SAMPLE_INTERVAL_MS >= 1000);
assert.equal(isVenuePlayerUuid(VENUE_PLAYER_SLICE_POP_AUDIO_ITEM_ID), true);
const sessionId = createVenuePlayerUuid();
const eventId = createVenuePlayerUuid();
assert.equal(isVenuePlayerUuid(sessionId), true);
assert.equal(isVenuePlayerUuid(eventId), true);

const cred = "ab".repeat(32);
const baseline = buildBusinessPopHeartbeatArgs({
  credential: cred,
  clientEventId: eventId,
  playbackSessionId: sessionId,
  sampleSeq: 1,
  positionMs: 0,
  priorPositionMs: null,
  phase: "advance",
});
assert.equal(baseline.p_credential, cred);
assert.equal(baseline.p_sample_seq, 1);
assert.equal(baseline.p_position_ms, 0);
assert.equal(baseline.p_client_media_delta_ms, null);
assert.equal(baseline.p_audio_item_id, VENUE_PLAYER_SLICE_POP_AUDIO_ITEM_ID);
assert.equal(baseline.p_phase, "advance");

const advance = buildBusinessPopHeartbeatArgs({
  credential: cred,
  clientEventId: createVenuePlayerUuid(),
  playbackSessionId: sessionId,
  sampleSeq: 2,
  positionMs: 5000,
  priorPositionMs: 0,
  phase: "advance",
});
assert.equal(advance.p_position_ms, 5000);
assert.equal(advance.p_client_media_delta_ms, 5000);

assert.throws(
  () =>
    buildBusinessPopHeartbeatArgs({
      credential: "short",
      clientEventId: eventId,
      playbackSessionId: sessionId,
      sampleSeq: 1,
      positionMs: 0,
    }),
  /invalid_player_credential/,
);

console.log("business-app-venue-player-unit: ok");
