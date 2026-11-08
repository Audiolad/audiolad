// Owner mirror of the hall device (Sergey 2026-11-08, t1283u): the owner «Музыка» tab and the
// owner-phone hall view render what the paired hall device reports – never a second local queue.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { cafeUniqueAhead } from "../src/lib/business-app/cafe-queue/order";
import {
  HALL_MIRROR_PENDING_MS,
  hallMirrorView,
  hallShownView,
  hallUpcomingIds,
  isHallNowPlayingReport,
  parseHallNowPlaying,
} from "../src/lib/business-app/hall-mirror";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tracks = [1, 2, 3, 4, 5, 6].map((n) => ({ audioItemId: id(n), title: `T${n}`, durationSeconds: 200 }));
const titles = (indices: readonly number[]) => indices.map((i) => tracks[i].title);

// Hall side: what it reports as «Дальше в очереди» follows its own play order.
assert.deepEqual(hallUpcomingIds(tracks, [2, 4, 0, 5, 1, 3], 4), [id(1), id(6), id(2), id(4), id(3)]);
assert.deepEqual(hallUpcomingIds(tracks, null, 0, 2), [id(2), id(3)], "catalog order without a queue");
assert.deepEqual(hallUpcomingIds(tracks, [1, 1, 2], 1), [id(3)], "no repeats, never the current track");

// Report validation (route).
assert.equal(isHallNowPlayingReport({ positionMs: 1200, durationMs: 200_000, queue: [id(2)] }), true);
assert.equal(isHallNowPlayingReport({ positionMs: 0, durationMs: null, queue: [] }), true);
assert.equal(isHallNowPlayingReport({ positionMs: -1, durationMs: null, queue: [] }), false);
assert.equal(isHallNowPlayingReport({ positionMs: 1.5, durationMs: null, queue: [] }), false);
assert.equal(isHallNowPlayingReport({ positionMs: 0, durationMs: 0, queue: [] }), false);
assert.equal(isHallNowPlayingReport({ positionMs: 0, durationMs: null, queue: ["x"] }), false);
assert.equal(isHallNowPlayingReport({ positionMs: 0, durationMs: null, queue: Array.from({ length: 21 }, (_, i) => id(i)) }), false);
assert.equal(isHallNowPlayingReport(null), false);

// Owner side answer.
assert.equal(parseHallNowPlaying({ ok: true, hall: null }), null, "no live hall device: local preview");
assert.equal(parseHallNowPlaying({ ok: false }), null);
const hall = parseHallNowPlaying({ ok: true, hall: { state: "playing", audioItemId: id(3), positionSec: 42, durationSec: 210, queue: [id(5), "bad", id(1)], ageSec: 3 } });
assert.ok(hall);
assert.deepEqual(hall.queue, [id(5), id(1)]);

// The screenshots: hall plays T3 with its queue T5, T1; the owner phone had paused T1 with a
// different local queue. The mirror shows the hall's track, state, position and queue.
{
  const local = { status: "paused", message: "x", needsGesture: true, index: 0, currentTime: 0, duration: 0 };
  const mirror = hallMirrorView(hall, tracks, 2);
  assert.ok(mirror);
  assert.equal(tracks[mirror.index].title, "T3");
  assert.equal(mirror.status, "playing");
  assert.equal(mirror.currentTime, 42 + 3 + 2, "a playing hall moves on between snapshots");
  assert.equal(mirror.duration, 210);
  assert.deepEqual(titles(mirror.queueOrder), ["T3", "T5", "T1"]);
  const shown = hallShownView(local, mirror, null, 0);
  assert.equal(shown.status, "playing");
  assert.equal(shown.index, mirror.index);
  assert.equal(shown.needsGesture, false, "no «Включить музыку» for the hall stream on the owner phone");
  // BusinessWorkspace derives «Дальше в очереди» from view.index + queueOrder exactly like this.
  assert.deepEqual(titles(cafeUniqueAhead(tracks, mirror.queueOrder, shown.index)), ["T5", "T1"]);
  // Owner pressed «пауза»: shown at once, until the hall reports or the pending time passes.
  const pending = { status: "paused" as const, until: 1_000 + HALL_MIRROR_PENDING_MS, from: "playing:" + id(3) };
  assert.equal(hallShownView(local, mirror, pending, 1_000).status, "paused");
  assert.equal(hallShownView(local, mirror, pending, 1_000 + HALL_MIRROR_PENDING_MS).status, "playing");
  // No hall: the local preview view is returned untouched.
  assert.equal(hallShownView(local, null, pending, 0), local);
}
{
  const paused = hallMirrorView({ state: "paused", audioItemId: id(2), positionSec: 30, durationSec: null, queue: [], ageSec: 60 }, tracks, 60);
  assert.ok(paused);
  assert.equal(paused.status, "paused");
  assert.equal(paused.currentTime, 30, "a paused hall stays at its position");
  assert.equal(paused.duration, 200, "catalog duration when the hall did not report one");
  assert.deepEqual(paused.queueOrder, [1]);
  const capped = hallMirrorView({ state: "playing", audioItemId: id(2), positionSec: 190, durationSec: 200, queue: [], ageSec: 30 }, tracks, 0);
  assert.equal(capped?.currentTime, 200, "never past the end");
  assert.equal(hallMirrorView({ state: "playing", audioItemId: id(99), positionSec: 0, durationSec: null, queue: [], ageSec: 0 }, tracks), null,
    "a hall track outside this catalog never shows as a wrong track");
  assert.equal(hallMirrorView({ state: "stopped", audioItemId: null, positionSec: 0, durationSec: null, queue: [], ageSec: 0 }, tracks), null);
}

// Wiring: one provider serves the owner «Музыка» tab and the owner-phone hall view (preview
// mode is the same browser provider), so both read the mirror; the hall device reports it.
{
  const player = readFileSync(new URL("../src/components/business-app/workspace/BusinessCabinetPlayer.tsx", import.meta.url), "utf8");
  assert.match(player, /const hallLocation = !pointReports && open \? \(model\?\.locationId \?\? null\) : null;/, "owner browser only");
  assert.match(player, /action: "hall-now", locationId: hallLocation/);
  assert.match(player, /const shownView: View = hallShownView\(view, mirror, hallPending, hallNow\);/);
  assert.match(player, /view: shownView,/);
  assert.match(player, /toggle: shownToggle,/);
  assert.match(player, /queueOrder: mirror \? mirror\.queueOrder : queueOrder,/);
  assert.match(player, /const track = mirror \? \(model\?\.tracks\[mirror\.index\] \?\? null\)/, "mini bar shows the hall track");
  assert.match(player, /onToggle=\{\(\) => void shownToggle\(\)\}/);
  assert.match(player, /if \(mirror\) return sendHall\("next_track"\);/);
  assert.match(player, /sendHall\(shownView\.status === "playing" \? "pause" : "resume"\)/);
  assert.match(player, /action: "enqueue", id: crypto\.randomUUID\(\), locationId, type/);
  // No second copy of the hall stream on the owner phone.
  assert.match(player, /if \(ctl && \(ctl\.status === "playing" \|\| ctl\.status === "loading"\)\) void toggleRef\.current\(\);\n\s*\}, \[hallMirror\]\);/);
  assert.match(player, /queue: index >= 0 \? hallUpcomingIds\(tracks, playOrderRef\.current, index\) : \[\]/);
  assert.match(player, /\} : null, nowPlaying \}\);/);
  const workspace = readFileSync(new URL("../src/components/business-app/workspace/BusinessWorkspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /const currentIndex = player\.view\.index;/);
  assert.match(workspace, /const playOrder = player\.queueOrder \?\? model\.tracks\.map/);
  assert.match(workspace, /nextDisabled=\{!player\.canNext\}/);
  assert.match(workspace, /export const HALL_NOW_TITLE = "Сейчас играет в зале";/);
  assert.doesNotMatch(workspace, /точк/i);
  const route = readFileSync(new URL("../src/app/api/business/point/route.ts", import.meta.url), "utf8");
  assert.match(route, /"hall-now"/);
  assert.match(route, /isHallNowPlayingReport\(body\.nowPlaying\)/);
  assert.match(route, /report_business_point_now_playing/);
  // t1284u: the RPC error is checked (supabase-js does not throw) and falls back to a
  // service-role upsert of the same row by this device's own session; never fails the report.
  const write = route.slice(route.indexOf("async function writeHallNowPlaying"), route.indexOf("export async function POST"));
  assert.match(write, /const \{ error: rpcError \} = await supabase\.rpc\("report_business_point_now_playing"/);
  assert.match(write, /if \(!rpcError\) return;/);
  assert.match(write, /createServiceRoleClient\(\)/);
  assert.match(write, /\.from\("business_point_sessions"\)[\s\S]*\.eq\("token_hash", `\\\\x\$\{pointTokenHashHex\(token\)\}`\)[\s\S]*\.is\("revoked_at", null\)/);
  assert.match(write, /\.from\("business_player_now_playing"\)\.upsert\(/);
  assert.match(write, /onConflict: "player_id"/);
  for (const col of ["player_id", "organization_id", "location_id", "audio_item_id", "position_ms", "duration_ms", "queue_audio_item_ids", "reported_at"]) {
    assert.match(write, new RegExp(`${col}:`), col);
  }
  assert.match(route, /await writeHallNowPlaying\(supabase, token, report\.audioItemId, body\.nowPlaying\)/);
  assert.match(route, /text\.length > 16384/, "a 12-id queue + usage sample fits the body limit");
  const sql = readFileSync(new URL("../supabase/migrations/20270228120000_business_point_now_playing.sql", import.meta.url), "utf8");
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.business_player_now_playing FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /revoked_at IS NULL/);
}

console.log("business-hall-mirror-unit: ok");
