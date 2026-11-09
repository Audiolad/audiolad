#!/usr/bin/env npx tsx
/**
 * loadVenueStatusDots + small UI contracts for «Мои точки» status circles (t1309u review).
 * Mocks createServiceRoleClient; no live DB.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";

import {
  applyAccessToVenueDots,
  deriveVenueStatusDot,
  VENUE_STATUS_LEGEND,
} from "../src/lib/business-app/venue-status-dot";
import {
  BUSINESS_LIVE_CONNECTIVITY_SECONDS,
  isPlaybackReportCurrent,
} from "../src/lib/business-app/owner-home-signals";

const FRESH = 75;
const ORG = "org-1";
const LOC_A = "loc-a";
const LOC_B = "loc-b";
const PLAYER_A = "player-a";

assert.equal(deriveVenueStatusDot({
  linked: true, secondsSinceSeen: 10, playbackState: "playing", accessLive: true, freshSeconds: FRESH,
}).color, "green");
assert.equal(deriveVenueStatusDot({
  linked: true, secondsSinceSeen: 120, playbackState: "playing", accessLive: true, freshSeconds: FRESH,
}).color, "yellow", "stale device playing must not stay green");
assert.equal(VENUE_STATUS_LEGEND.length, 4);

assert.equal(isPlaybackReportCurrent({
  playbackState: "playing", reportedAgeSeconds: 20, heartbeatFresh: true,
}), true);
assert.equal(isPlaybackReportCurrent({
  playbackState: "playing", reportedAgeSeconds: BUSINESS_LIVE_CONNECTIVITY_SECONDS + 1, heartbeatFresh: true,
}), false, "stale playing never rides heartbeat");
assert.equal(isPlaybackReportCurrent({
  playbackState: "error",
  reportedAgeSeconds: BUSINESS_LIVE_CONNECTIVITY_SECONDS + 1,
  heartbeatFresh: true,
  errorNeedsFreshReport: true,
}), false, "venue dots: stale error needs fresh report");
assert.equal(isPlaybackReportCurrent({
  playbackState: "error",
  reportedAgeSeconds: BUSINESS_LIVE_CONNECTIVITY_SECONDS + 1,
  heartbeatFresh: true,
}), true, "mapOwnerLiveState: error may ride heartbeat");
assert.equal(isPlaybackReportCurrent({
  playbackState: "paused",
  reportedAgeSeconds: BUSINESS_LIVE_CONNECTIVITY_SECONDS + 1,
  heartbeatFresh: true,
}), true);

assert.equal(applyAccessToVenueDots(
  [{ locationId: "a", color: "green", label: "музыка играет" }],
  false,
)[0]?.color, "red");

type Session = { location_id: string; player_id: string; last_seen_at: string };
type Playback = { player_id: string; playback_state: string; reported_at: string | null };

type LoaderMod = typeof import("../src/lib/business-app/load-venue-status-dots.server");

function loadWithMock(opts: {
  sessions: Session[];
  playback: Playback[];
  sessionError?: { message: string } | null;
}): { mod: LoaderMod; restore: () => void } {
  const require = createRequire(import.meta.url);
  const cached = new Map<string, NodeModule | undefined>();
  const mock = (rel: string, exports: Record<string, unknown>) => {
    const key = require.resolve(rel);
    cached.set(key, require.cache[key]);
    const mod = new Module(key);
    mod.exports = exports;
    mod.loaded = true;
    require.cache[key] = mod;
  };

  mock("server-only", {});
  mock("../src/lib/supabase/service-role.ts", {
    createServiceRoleClient: () => ({
      from(table: string) {
        const state: { players?: string[]; locs?: string[] } = {};
        const result = () => {
          if (table === "business_point_sessions") {
            if (opts.sessionError) return Promise.resolve({ data: null, error: opts.sessionError });
            const rows = opts.sessions.filter((s) => !state.locs || state.locs.includes(s.location_id));
            return Promise.resolve({ data: rows, error: null });
          }
          if (table === "business_player_playback_state") {
            const rows = opts.playback.filter((p) => !state.players || state.players.includes(p.player_id));
            return Promise.resolve({ data: rows, error: null });
          }
          return Promise.resolve({ data: null, error: { message: `unexpected table ${table}` } });
        };
        const q: {
          select: () => typeof q;
          eq: () => typeof q;
          in: (col: string, value: string[]) => typeof q;
          is: () => typeof q;
          order: () => typeof q;
          then: Promise<unknown>["then"];
        } = {
          select: () => q,
          eq: () => q,
          in: (col, value) => {
            if (col === "location_id") state.locs = value;
            if (col === "player_id") state.players = value;
            return q;
          },
          is: () => q,
          order: () => q,
          then: (onFulfilled, onRejected) => result().then(onFulfilled, onRejected),
        };
        return q;
      },
    }),
  });

  const loaderPath = require.resolve("../src/lib/business-app/load-venue-status-dots.server.ts");
  delete require.cache[loaderPath];
  // Also bust owner-home-signals / venue-status-dot if cached under CJS resolve
  const mod = require("../src/lib/business-app/load-venue-status-dots.server.ts") as LoaderMod;
  const restore = () => {
    for (const [key, original] of cached) {
      if (original) require.cache[key] = original;
      else delete require.cache[key];
    }
    delete require.cache[loaderPath];
  };
  return { mod, restore };
}

const nowMs = Date.parse("2026-11-09T10:00:00.000Z");
const isoAgo = (seconds: number) => new Date(nowMs - seconds * 1000).toISOString();

{
  const { mod: { loadVenueStatusDots }, restore } = loadWithMock({
    sessions: [{ location_id: LOC_A, player_id: PLAYER_A, last_seen_at: isoAgo(10) }],
    playback: [{ player_id: PLAYER_A, playback_state: "playing", reported_at: isoAgo(15) }],
  });
  try {
    const rows = await loadVenueStatusDots({ organizationId: ORG, locationIds: [LOC_A], nowMs });
    assert.equal(rows[0]?.color, "green", "fresh playing → green");
    assert.match(rows[0]?.label ?? "", /играет/);
  } finally { restore(); }
}

{
  const { mod: { loadVenueStatusDots }, restore } = loadWithMock({
    sessions: [{ location_id: LOC_A, player_id: PLAYER_A, last_seen_at: isoAgo(10) }],
    playback: [{
      player_id: PLAYER_A,
      playback_state: "playing",
      reported_at: isoAgo(BUSINESS_LIVE_CONNECTIVITY_SECONDS + 30),
    }],
  });
  try {
    const rows = await loadVenueStatusDots({ organizationId: ORG, locationIds: [LOC_A], nowMs });
    assert.equal(rows[0]?.color, "yellow", "stale playing with fresh heartbeat → yellow");
  } finally { restore(); }
}

{
  const { mod: { loadVenueStatusDots }, restore } = loadWithMock({
    sessions: [{ location_id: LOC_A, player_id: PLAYER_A, last_seen_at: isoAgo(5) }],
    playback: [{ player_id: PLAYER_A, playback_state: "error", reported_at: isoAgo(8) }],
  });
  try {
    const rows = await loadVenueStatusDots({ organizationId: ORG, locationIds: [LOC_A], nowMs });
    assert.equal(rows[0]?.color, "red", "fresh error → red");
  } finally { restore(); }
}

{
  const { mod: { loadVenueStatusDots }, restore } = loadWithMock({
    sessions: [{ location_id: LOC_A, player_id: PLAYER_A, last_seen_at: isoAgo(5) }],
    playback: [{
      player_id: PLAYER_A,
      playback_state: "error",
      reported_at: isoAgo(BUSINESS_LIVE_CONNECTIVITY_SECONDS + 60),
    }],
  });
  try {
    const rows = await loadVenueStatusDots({ organizationId: ORG, locationIds: [LOC_A], nowMs });
    assert.equal(rows[0]?.color, "yellow", "stale error → yellow");
  } finally { restore(); }
}

{
  const { mod: { loadVenueStatusDots }, restore } = loadWithMock({ sessions: [], playback: [] });
  try {
    const rows = await loadVenueStatusDots({ organizationId: ORG, locationIds: [LOC_A, LOC_B], nowMs });
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.color, "grey", "no session → grey");
    assert.equal(rows[1]?.color, "grey");
  } finally { restore(); }
}

{
  const { mod: { loadVenueStatusDots }, restore } = loadWithMock({
    sessions: [
      { location_id: LOC_A, player_id: PLAYER_A, last_seen_at: isoAgo(5) },
      { location_id: LOC_A, player_id: "old-player", last_seen_at: isoAgo(40) },
    ],
    playback: [
      { player_id: PLAYER_A, playback_state: "playing", reported_at: isoAgo(5) },
      { player_id: "old-player", playback_state: "error", reported_at: isoAgo(40) },
    ],
  });
  try {
    const rows = await loadVenueStatusDots({ organizationId: ORG, locationIds: [LOC_A], nowMs });
    assert.equal(rows[0]?.color, "green", "freshest session's playback wins");
  } finally { restore(); }
}

const slotsSrc = readFileSync(new URL("../src/components/business-app/BusinessPointSlots.tsx", import.meta.url), "utf8");
const cssSrc = readFileSync(new URL("../src/components/business-app/business-app.css", import.meta.url), "utf8");

assert.match(slotsSrc, /data-testid="biz-venue-status-legend"/, "legend present");
assert.match(slotsSrc, /aria-label="Обозначения статуса точек"/);
assert.match(slotsSrc, /VENUE_STATUS_LEGEND\.map/);
assert.match(slotsSrc, /aria-label=\{ariaLabel\}/);
assert.match(slotsSrc, /\$\{label\} – \$\{status\.label\}/, "aria-label includes status");
assert.match(
  slotsSrc,
  /business-venue-status-dot[\s\S]*?<span>\{label\}<\/span>/,
  "status dot renders before the venue label",
);
assert.match(slotsSrc, /dotKind = status\?\.color \?\? \(slot\.location \? "pending" : null\)/);
assert.match(slotsSrc, /Статус пока неизвестен/);
assert.match(slotsSrc, /business-venue-status-dot--\$\{dotKind\}/);
assert.doesNotMatch(
  slotsSrc,
  /business-venue-status-dot--\$\{status\?\.color \?\? "grey"\}/,
  "pending must not fall back to grey before first poll",
);
assert.match(cssSrc, /\.business-venue-status-dot--pending/, "pending outline style");
assert.match(cssSrc, /\.business-venue-status-btn\s*\{[\s\S]*?justify-content:\s*flex-start/);
assert.match(cssSrc, /\.business-venue-status-legend/);

/* t1323u – dots 2× and clear yellow (not theme ink brown). */
assert.match(cssSrc, /\.business-venue-status-dot\s*\{[\s\S]*?width:\s*1\.3rem/, "dot width 2×");
assert.match(cssSrc, /\.business-venue-status-dot\s*\{[\s\S]*?height:\s*1\.3rem/, "dot height 2×");
assert.doesNotMatch(cssSrc, /\.business-venue-status-dot--yellow\s*\{[\s\S]*?var\(--biz-yellow\)/, "yellow must not use theme ink");
assert.match(cssSrc, /\.business-venue-status-dot--yellow\s*\{[\s\S]*?#FACC15/i, "bright yellow fill");
assert.match(cssSrc, /\.business-venue-status-dot--yellow\s*\{[\s\S]*?#A16207/i, "yellow darker ring");
assert.match(cssSrc, /\.business-venue-status-dot--green\s*\{[\s\S]*?#22c55e/i, "saturated green");
assert.match(cssSrc, /\.business-venue-status-dot--red\s*\{[\s\S]*?#ef4444/i, "saturated red");
assert.match(cssSrc, /\.business-venue-status-dot--grey\s*\{[\s\S]*?#9ca3af/i, "clear grey");
assert.match(cssSrc, /\.business-venue-status-dot--pending\s*\{[\s\S]*?background:\s*transparent/, "pending stays outline");

console.log("business-venue-status-dots-loader-unit: ok");
