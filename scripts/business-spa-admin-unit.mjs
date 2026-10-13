import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  SPA_MAX_EVENT_MS,
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

// Removal goes through the atomic SQL function only (race fix, review 2026-10-13).
const actions = readFileSync(new URL("../src/app/(platform)/admin/business-spa/actions.ts", import.meta.url), "utf8");
const lib = readFileSync(new URL("../src/lib/business-app/spa-admin.ts", import.meta.url), "utf8");
assert.match(actions, /excludeProgramTrack\(programId, audioItemId/);
assert.doesNotMatch(actions, /set_program_items|setProgramTracks|loadActiveProgramTrackIds/);
assert.match(lib, /rpc\("business_spa_exclude_program_item"/);
assert.match(lib, /\.range\(from, from \+ SPA_ADMIN_LOG_PAGE - 1\)/, "log rows are paged");

console.log("business-spa-admin-unit: all tests passed");
