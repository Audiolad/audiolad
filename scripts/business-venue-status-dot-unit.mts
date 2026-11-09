#!/usr/bin/env npx tsx
import assert from "node:assert/strict";

import {
  applyAccessToVenueDots,
  deriveVenueStatusDot,
  VENUE_STATUS_LEGEND,
} from "../src/lib/business-app/venue-status-dot.ts";

const FRESH = 75;

assert.equal(deriveVenueStatusDot({
  linked: true, secondsSinceSeen: 10, playbackState: "playing", accessLive: true, freshSeconds: FRESH,
}).color, "green");
assert.match(deriveVenueStatusDot({
  linked: true, secondsSinceSeen: 10, playbackState: "playing", accessLive: true, freshSeconds: FRESH,
}).label, /играет/);

assert.equal(deriveVenueStatusDot({
  linked: true, secondsSinceSeen: 10, playbackState: "paused", accessLive: true, freshSeconds: FRESH,
}).color, "yellow");
assert.equal(deriveVenueStatusDot({
  linked: true, secondsSinceSeen: 10, playbackState: "stopped", accessLive: true, freshSeconds: FRESH,
}).color, "yellow");
assert.equal(deriveVenueStatusDot({
  linked: true, secondsSinceSeen: 10, playbackState: null, accessLive: true, freshSeconds: FRESH,
}).color, "yellow");

assert.equal(deriveVenueStatusDot({
  linked: true, secondsSinceSeen: 120, playbackState: "playing", accessLive: true, freshSeconds: FRESH,
}).color, "yellow", "stale playing must not stay green");
assert.match(deriveVenueStatusDot({
  linked: true, secondsSinceSeen: 120, playbackState: "playing", accessLive: true, freshSeconds: FRESH,
}).label, /связи/);

assert.equal(deriveVenueStatusDot({
  linked: false, secondsSinceSeen: null, playbackState: null, accessLive: true, freshSeconds: FRESH,
}).color, "grey");
assert.equal(deriveVenueStatusDot({
  linked: true, secondsSinceSeen: null, playbackState: null, accessLive: true, freshSeconds: FRESH,
}).color, "grey");

assert.equal(deriveVenueStatusDot({
  linked: true, secondsSinceSeen: 5, playbackState: "error", accessLive: true, freshSeconds: FRESH,
}).color, "red");
assert.equal(deriveVenueStatusDot({
  linked: true, secondsSinceSeen: 5, playbackState: "playing", accessLive: false, freshSeconds: FRESH,
}).color, "red", "ended access beats playing");
assert.equal(deriveVenueStatusDot({
  linked: false, secondsSinceSeen: null, playbackState: null, accessLive: false, freshSeconds: FRESH,
}).color, "red", "ended access beats grey");

// Offline error is not red – device may be off overnight; do not scare.
assert.equal(deriveVenueStatusDot({
  linked: true, secondsSinceSeen: 900, playbackState: "error", accessLive: true, freshSeconds: FRESH,
}).color, "yellow");

const overlaid = applyAccessToVenueDots(
  [{ locationId: "a", color: "green", label: "музыка играет" }],
  false,
);
assert.equal(overlaid[0]?.color, "red");
assert.match(overlaid[0]?.label ?? "", /доступ/);

assert.equal(VENUE_STATUS_LEGEND.length, 4);
assert.deepEqual(VENUE_STATUS_LEGEND.map((item) => item.color), ["green", "yellow", "red", "grey"]);
for (const item of VENUE_STATUS_LEGEND) {
  assert.ok(item.label.length > 0);
  assert.equal(item.label.includes("."), false, "no period punctuation in legend");
  assert.equal(item.label.includes("—"), false, "use en dash only if needed, not em dash");
}

console.log("business-venue-status-dot-unit: ok");
