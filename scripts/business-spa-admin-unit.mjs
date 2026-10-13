import assert from "node:assert/strict";

import {
  SPA_MAX_EVENT_MS,
  compositionWithout,
  summarizeSpaPlayback,
} from "../src/lib/business-app/spa-admin-report.ts";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";

const s = summarizeSpaPlayback([
  { audio_item_id: A, played_ms: 60000, offline: false, event: "complete", received_at: "2026-10-13T06:00:00Z" },
  { audio_item_id: A, played_ms: 120000, offline: true, event: "complete", received_at: "2026-10-13T07:00:00Z" },
  { audio_item_id: A, played_ms: 999999, offline: true, event: "start", received_at: null },
  { audio_item_id: B, played_ms: "30000", offline: true, event: "skip", received_at: "2026-10-13T05:00:00Z" },
  { audio_item_id: B, played_ms: -5, offline: false, event: "error", received_at: null },
  { audio_item_id: B, played_ms: SPA_MAX_EVENT_MS * 10, offline: false, event: "complete", received_at: null },
]);
assert.equal(s.byTrack.get(A)?.onlineMinutes, 1);
assert.equal(s.byTrack.get(A)?.offlineMinutes, 2, "start events carry no minutes");
assert.equal(s.byTrack.get(A)?.lastReceivedAt, "2026-10-13T07:00:00Z");
assert.equal(s.byTrack.get(B)?.offlineMinutes, 0.5);
assert.equal(s.byTrack.get(B)?.onlineMinutes, 360, "clamped to 6h per event");
assert.equal(s.totalOfflineMinutes, 2.5);
assert.equal(s.totalOnlineMinutes, 361);

assert.deepEqual(compositionWithout([A, B], A), [B]);
assert.throws(() => compositionWithout([B], A), /not_in_program/);

console.log("business-spa-admin-unit: all tests passed");
