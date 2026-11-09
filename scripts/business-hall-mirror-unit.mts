// Owner mirror of the hall device (Sergey 2026-11-08, t1283u): the owner «Музыка» tab and the
// owner-phone hall view render what the paired hall device reports – never a second local queue.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";

import { cafeUniqueAhead, cafeUpcomingMoreCount, cafeUpcomingMoreLabel } from "../src/lib/business-app/cafe-queue/order";
import {
  HALL_MIRROR_PENDING_MS,
  hallMirrorView,
  hallShownView,
  hallUpcomingIds,
  hallUpcomingSnapshot,
  hallQueueAheadCount,
  isHallNowPlayingReport,
  parseHallNowPlaying,
} from "../src/lib/business-app/hall-mirror";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tracks = [1, 2, 3, 4, 5, 6].map((n) => ({ audioItemId: id(n), title: `T${n}`, durationSeconds: 200 }));
const titles = (indices: readonly number[]) => indices.map((i) => tracks[i].title);

// Hall side: what it reports as «Дальше в очереди» follows its own play order.
assert.deepEqual(hallUpcomingIds(tracks, [2, 4, 0, 5, 1, 3], 4), [id(1), id(6), id(2), id(4)]);
assert.deepEqual(hallUpcomingIds(tracks, null, 0, 2), [id(2), id(3)], "catalog order without a queue");
assert.deepEqual(hallUpcomingIds(tracks, [1, 1, 2], 1), [id(3)], "no repeats, never the current track");

// t1289u: 490 unique ahead, only 12 preview ids; owner renders exactly the hall's 487.
{
  const catalog = Array.from({ length: 491 }, (_, i) => ({ audioItemId: id(i + 1), durationSeconds: 200 }));
  const snapshot = hallUpcomingSnapshot(catalog, null, 0);
  assert.equal(snapshot.ids.length, 12);
  assert.equal(snapshot.aheadCount, 490);
  const parsed = parseHallNowPlaying({ ok: true, hall: { state: "playing", audioItemId: id(1), queue: snapshot.ids, aheadCount: snapshot.aheadCount } });
  assert.ok(parsed);
  assert.equal(parsed.aheadCount, 490);
  const mirror = hallMirrorView(parsed, catalog);
  assert.ok(mirror);
  assert.equal(mirror.queueOrder.length, 13);
  assert.equal(mirror.aheadCount, 490);
  const ahead = cafeUniqueAhead(catalog, mirror.queueOrder, mirror.index);
  const aheadTotal = mirror.aheadCount >= ahead.length ? mirror.aheadCount : ahead.length;
  assert.equal(cafeUpcomingMoreCount(aheadTotal), 487);
  assert.equal(cafeUpcomingMoreLabel(cafeUpcomingMoreCount(aheadTotal)), "и ещё 487 треков без повторов");
  assert.deepEqual(ahead.slice(0, 3).map((i) => catalog[i].audioItemId), snapshot.ids.slice(0, 3));
  assert.equal(parseHallNowPlaying({ ok: true, hall: { ...parsed, aheadCount: undefined } })?.aheadCount, 12);
  const shortCatalog = [...tracks, { ...tracks[0] }];
  const short = hallUpcomingSnapshot(shortCatalog, [0, 1, 6, 2, 3], 2);
  assert.deepEqual(short, { ids: [id(4)], aheadCount: 1 }, "already-heard ids never wrap back into the preview");
  assert.deepEqual(hallUpcomingSnapshot(tracks, [0, 1], 1), { ids: [], aheadCount: 0 });
  assert.deepEqual(hallUpcomingSnapshot(tracks, null, 0, 0), { ids: [], aheadCount: 5 });
  assert.equal(hallUpcomingIds(catalog, null, 0, 100).length, 12, "report ids remain capped");
  for (const invalid of [undefined, null, 0, -1, 1.5, 100001, NaN, Infinity, "490"]) {
    assert.equal(hallQueueAheadCount(invalid, 12), 12);
    assert.equal(parseHallNowPlaying({ ok: true, hall: { ...parsed, aheadCount: invalid } })?.aheadCount, 12);
  }
  assert.equal(hallQueueAheadCount(100000, 12), 100000);
}

// Report validation (route).
for (const aheadCount of [1, 490, 100000, undefined]) {
  assert.equal(isHallNowPlayingReport({ positionMs: 0, durationMs: null, queue: [id(2)], aheadCount }), true);
}
for (const aheadCount of [-1, 0, 1.5, 100001, Number.MAX_SAFE_INTEGER + 1, null, "490", NaN, Infinity]) {
  assert.equal(isHallNowPlayingReport({ positionMs: 0, durationMs: null, queue: [id(2)], aheadCount }), false);
}
assert.equal(isHallNowPlayingReport({ positionMs: 0, durationMs: null, queue: [], aheadCount: 0 }), true);
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
assert.equal(hall.aheadCount, 2);

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
  const paused = hallMirrorView({ state: "paused", audioItemId: id(2), positionSec: 30, durationSec: null, queue: [], aheadCount: 0, ageSec: 60 }, tracks, 60);
  assert.ok(paused);
  assert.equal(paused.status, "paused");
  assert.equal(paused.currentTime, 30, "a paused hall stays at its position");
  assert.equal(paused.duration, 200, "catalog duration when the hall did not report one");
  assert.deepEqual(paused.queueOrder, [1]);
  const capped = hallMirrorView({ state: "playing", audioItemId: id(2), positionSec: 190, durationSec: 200, queue: [], aheadCount: 0, ageSec: 30 }, tracks, 0);
  assert.equal(capped?.currentTime, 200, "never past the end");
  assert.equal(hallMirrorView({ state: "playing", audioItemId: id(99), positionSec: 0, durationSec: null, queue: [], aheadCount: 0, ageSec: 0 }, tracks), null,
    "a hall track outside this catalog never shows as a wrong track");
  assert.equal(hallMirrorView({ state: "stopped", audioItemId: null, positionSec: 0, durationSec: null, queue: [], aheadCount: 0, ageSec: 0 }, tracks), null);
}

// Server read: existing rows/clients and missing migration keep the preview, but never
// attach a previous track's queue/count to the new playback-state track.
{
  const require = createRequire(import.meta.url);
  const cached = new Map<string, NodeModule | undefined>();
  const mock = (path: string, exports: unknown) => {
    const key = require.resolve(path);
    cached.set(key, require.cache[key]);
    const mod = new Module(key);
    mod.exports = exports;
    mod.loaded = true;
    require.cache[key] = mod;
  };
  const preview = Array.from({ length: 12 }, (_, i) => id(i + 2));
  let total: unknown = 490;
  let sameTrack = true;
  let missingColumn: string | null = null;
  let legacyReads = 0;
  const at = Date.now();
  mock("server-only", {});
  mock("../src/lib/supabase/service-role.ts", { createServiceRoleClient: () => ({
    from(table: string) {
      let columns = "";
      const q = {
        select(value: string) { columns = value; return q; },
        eq() { return q; }, is() { return q; }, order() { return q; }, limit() { return q; },
        async maybeSingle() {
          if (table === "business_point_sessions") return { data: { player_id: id(1), last_seen_at: new Date(at).toISOString() }, error: null };
          if (table === "business_player_playback_state") return { data: { playback_state: "playing", audio_item_id: id(1), reported_at: new Date(at).toISOString() }, error: null };
          assert.equal(table, "business_player_now_playing");
          if (missingColumn && columns.includes("queue_ahead_count")) return { data: null, error: { code: missingColumn } };
          if (!columns.includes("queue_ahead_count")) legacyReads++;
          return { data: { audio_item_id: sameTrack ? id(1) : id(99), position_ms: 42000, duration_ms: 200000, queue_audio_item_ids: preview,
            ...(columns.includes("queue_ahead_count") ? { queue_ahead_count: total } : {}), reported_at: new Date(at).toISOString() }, error: null };
        },
      };
      return q;
    },
  }) });
  try {
    const { loadHallNowPlaying } = require("../src/lib/business-app/hall-now-playing.server.ts") as typeof import("../src/lib/business-app/hall-now-playing.server");
    const input = { organizationId: id(1), locationId: id(1) };
    assert.equal((await loadHallNowPlaying(input, at))?.aheadCount, 490);
    for (const value of [undefined, null, 0, -1, 11, 1.5, 100001, "490"]) {
      total = value;
      assert.equal((await loadHallNowPlaying(input, at))?.aheadCount, 12);
    }
    for (const code of ["42703", "PGRST204"]) {
      missingColumn = code;
      const legacy = await loadHallNowPlaying(input, at);
      assert.equal(legacy?.aheadCount, 12);
      assert.deepEqual(legacy?.queue, preview);
    }
    assert.equal(legacyReads, 2);
    missingColumn = null;
    total = 490;
    sameTrack = false;
    const mismatch = await loadHallNowPlaying(input, at);
    assert.deepEqual(mismatch?.queue, []);
    assert.equal(mismatch?.aheadCount, 0);
    assert.equal(mismatch?.positionSec, 0);
  } finally {
    for (const [key, original] of cached) {
      if (original) require.cache[key] = original;
      else delete require.cache[key];
    }
    delete require.cache[require.resolve("../src/lib/business-app/hall-now-playing.server.ts")];
  }
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
  assert.match(player, /const upcoming = index >= 0 \? hallUpcomingSnapshot\(tracks, playOrderRef\.current, index\) : \{ ids: \[\], aheadCount: 0 \}/);
  assert.match(player, /queue: upcoming\.ids,[\s\S]*aheadCount: upcoming\.aheadCount,/);
  assert.match(player, /queueAheadCount: number \| null/);
  assert.match(player, /queueAheadCount: mirror \? mirror\.aheadCount : null,/);
  // t1331u: the sample is built first (offline samples queue ahead of it), then sent with nowPlaying.
  assert.match(player, /sample: backlog \? null : sample, nowPlaying \}\)/);
  const workspace = readFileSync(new URL("../src/components/business-app/workspace/BusinessWorkspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /const currentIndex = player\.view\.index;/);
  assert.match(workspace, /const playOrder = player\.queueOrder \?\? model\.tracks\.map/);
  assert.match(workspace, /const aheadTotal = typeof player\.queueAheadCount === "number" && player\.queueAheadCount >= ahead\.length \? player\.queueAheadCount : ahead\.length;/);
  assert.match(workspace, /cafeUpcomingMoreLabel\(cafeUpcomingMoreCount\(aheadTotal\)\)/);
  assert.match(workspace, /nextDisabled=\{!player\.canNext\}/);
  assert.match(workspace, /export const HALL_NOW_TITLE = "Сейчас играет в зале";/);
  assert.doesNotMatch(workspace, /точк/i);
  const route = readFileSync(new URL("../src/app/api/business/point/route.ts", import.meta.url), "utf8");
  assert.match(route, /"hall-now"/);
  assert.match(route, /const hall = await loadHallNowPlaying[\s\S]*return json\(\{ ok: true, hall \}\)/, "hall-now serializes aheadCount along with the snapshot");
  const loader = readFileSync(new URL("../src/lib/business-app/hall-now-playing.server.ts", import.meta.url), "utf8");
  assert.match(loader, /readSnapshot\(`\$\{columns\}, queue_ahead_count`\)/);
  assert.match(loader, /snapshot\.error\?\.code === "42703" \|\| snapshot\.error\?\.code === "PGRST204"/);
  assert.match(loader, /snapshot = await readSnapshot\(columns\)/, "missing column keeps the preview available");
  assert.match(loader, /const queue = sameTrack && Array\.isArray\(now\.queue_audio_item_ids\)/);
  assert.match(loader, /aheadCount: sameTrack \? hallQueueAheadCount\(now\.queue_ahead_count, queue\.length\) : 0/);
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
  assert.match(write, /p_queue_ahead: nowPlaying\.aheadCount \?\? nowPlaying\.queue\.length/);
  assert.match(write, /queue_ahead_count: nowPlaying\.aheadCount \?\? nowPlaying\.queue\.length/);
  assert.match(write, /onConflict: "player_id"/);
  for (const col of ["player_id", "organization_id", "location_id", "audio_item_id", "position_ms", "duration_ms", "queue_audio_item_ids", "queue_ahead_count", "reported_at"]) {
    assert.match(write, new RegExp(`${col}:`), col);
  }
  assert.match(route, /await writeHallNowPlaying\(supabase, token, report\.audioItemId, body\.nowPlaying\)/);
  assert.match(route, /text\.length > 16384/, "a 12-id queue + usage sample fits the body limit");
  const sql = readFileSync(new URL("../supabase/migrations/20270228120000_business_point_now_playing.sql", import.meta.url), "utf8");
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.business_player_now_playing FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /revoked_at IS NULL/);
  assert.match(sql, /CHECK \(cardinality\(queue_audio_item_ids\) <= 20\)/);
  const migration = readFileSync(new URL("../supabase/migrations/20270229120000_business_point_now_playing_ahead_count.sql", import.meta.url), "utf8");
  assert.match(migration, /ADD COLUMN queue_ahead_count integer NOT NULL DEFAULT 0/);
  assert.match(migration, /CHECK \(queue_ahead_count >= 0 AND queue_ahead_count <= 100000\)/);
  assert.match(migration, /DROP FUNCTION public\.report_business_point_now_playing\(text, uuid, integer, integer, uuid\[\]\);[\s\S]*CREATE FUNCTION/);
  assert.match(migration, /p_queue_ahead integer DEFAULT 0/);
  assert.match(migration, /queue_ahead_count = EXCLUDED\.queue_ahead_count/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.report_business_point_now_playing\(text, uuid, integer, integer, uuid\[\], integer\) FROM PUBLIC/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.report_business_point_now_playing\(text, uuid, integer, integer, uuid\[\], integer\) TO anon, authenticated, service_role/);
  assert.match(migration, /NOTIFY pgrst, 'reload schema';/);
  assert.match(migration, /revoked_at IS NULL/);
  assert.match(migration, /cardinality\(v_queue\) > 20/);
  assert.doesNotMatch(migration, /ALTER[^;]*queue_audio_item_ids/);

}

console.log("business-hall-mirror-unit: ok");
