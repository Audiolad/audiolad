import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { SpaLiveEvidence, isSpaLiveReport, sendSpaLiveReport } from "../src/lib/business-app/spa-live-report.ts";
import * as signals from "../src/lib/business-app/owner-home-signals.ts";

const id = "00000000-0000-4000-8000-000000000001";
const evidence = new SpaLiveEvidence();
assert.equal(evidence.report("playing", id, 0).playingConfirmed, false, "load / play promise is not evidence");
evidence.onTimeUpdate(10, 1000);
assert.equal(evidence.report("playing", id, 1000).playingConfirmed, false, "timeupdate without playing is insufficient");
evidence.onPlaying(0);
assert.equal(evidence.report("playing", id, 0).playingConfirmed, false);
for (let second = 1; second <= 45 * 60; second++) {
  evidence.onTimeUpdate(second, second * 1000);
  if (second % 60 === 0) assert.equal(evidence.report("playing", id, second * 1000).playingConfirmed, true, `45 minute track, second ${second}`);
}
assert.equal(evidence.report("playing", id, 2760000).playingConfirmed, false, "stalled currentTime");
evidence.onTimeUpdate(2701, 2761000);
assert.equal(evidence.report("playing", id, 2820000).playingConfirmed, false, "old advancement before stall is not evidence");
evidence.reset();
evidence.onTimeUpdate(100, 3000000);
assert.equal(evidence.report("playing", id, 3000000).playingConfirmed, false, "new load resets playing evidence");
evidence.onPlaying(100);
evidence.onTimeUpdate(101, 3001000);
assert.equal(evidence.report("paused", id, 3001000).playingConfirmed, false);
assert.equal(evidence.report("error", id, 3001000).errorCode, "playback_failed");
assert.equal(evidence.report("stopped", null, 3001000).playingConfirmed, false);
sendSpaLiveReport(() => { throw Error("sync"); }, evidence.report("stopped", null, 0));
sendSpaLiveReport(async () => { throw Error("network"); }, evidence.report("stopped", null, 0));
await new Promise((r) => setTimeout(r, 0));
const valid = { state: "playing", audioItemId: id, playingConfirmed: true, errorCode: null };
assert.equal(isSpaLiveReport(valid), true);
for (const patch of [{ state: "loading" }, { audioItemId: "bad" }, { audioItemId: null }, { playingConfirmed: 1 }, { state: "paused" }, { errorCode: "x".repeat(81) }, { errorCode: "" }, { state: { toString: () => "playing" } }]) {
  assert.equal(isSpaLiveReport({ ...valid, ...patch }), false);
}

const now = Date.parse("2026-10-14T12:00:00Z");
const row = { organization_id: "org", last_seen_at: new Date(now - 300000).toISOString(), playback_state: "playing", playback_confirmed_at: new Date(now - 1000).toISOString(), current_track_title: "Allowed" };
assert.equal(signals.mapOwnerLiveState([row], "org", now).liveConnected, true);
assert.equal(signals.mapOwnerLiveState([row], "org", now + 1).liveConnected, false);
assert.deepEqual(signals.mapOwnerLiveState([row], "org", now).currentTrack, { title: "Allowed" });
assert.equal(signals.mapOwnerLiveState([row], "other", now).currentTrack, null);
assert.equal(signals.mapOwnerLiveState(null, "org", now).lastSeenSeconds, null);
assert.equal(signals.mapOwnerLiveState([{ ...row, last_seen_at: "invalid" }], "org", now).playbackState, null);
assert.equal(signals.mapOwnerLiveState([{ ...row, current_track_title: null }], "org", now).currentTrack, null);

// Execute the actual server modules with dependency mocks; no DB connections.
function load(path, imports) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", js)((name) => {
    assert.ok(name in imports, `unexpected dependency ${name}`);
    return imports[name];
  }, mod, mod.exports);
  return mod.exports;
}
let context = null;
const calls = [];
let rpcError = null;
const actions = load("../src/app/business-app/spa/actions.ts", {
  "@/lib/supabase/server": { createClient: async () => ({ rpc: async (...args) => { calls.push(args); return { error: rpcError }; } }) },
  "@/lib/business-app/spa-pilot": { loadSpaPilotContext: async () => context },
  "@/lib/business-app/spa-player-core": {},
  "@/lib/business-app/spa-live-report": { isSpaLiveReport },
});
assert.equal((await actions.reportSpaPlayerLiveState(valid)).reason, "no_access");
context = { playerId: null };
assert.equal((await actions.reportSpaPlayerLiveState(valid)).reason, "no_access");
context = { playerId: id };
assert.equal((await actions.reportSpaPlayerLiveState({ ...valid, state: "bad" })).reason, "invalid_request");
assert.equal(calls.length, 0);
assert.equal((await actions.reportSpaPlayerLiveState(valid)).ok, true);
assert.equal(calls[0][0], "report_business_spa_player_live_state");
assert.equal(calls[0][1].p_player_id, id);
rpcError = { code: "42883" };
assert.equal((await actions.reportSpaPlayerLiveState(valid)).reason, "report_failed");

let liveResult = { data: [row], error: null };
let throwLive = false;
const loader = load("../src/lib/business-app/load-owner-home-signals.ts", {
  "@/lib/business-app/owner-home-signals": signals,
  "@/lib/supabase/server": { createClient: async () => ({
    rpc: async (name) => {
      if (name === "get_business_player_health") return { data: [], error: null };
      assert.equal(name, "get_business_owner_player_live_state");
      if (throwLive) throw Error("network");
      return liveResult;
    },
    from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: null }) }; return q; },
  }) },
  "@/lib/supabase/service-role": { createServiceRoleClient: () => { throw Error("unexpected service read"); } },
});
const input = { organizationId: "org", locationId: "loc", userId: "user" };
assert.deepEqual((await loader.loadBusinessOwnerHomeSignals(input)).currentTrack, { title: "Allowed" });
liveResult = { data: null, error: { code: "42883" } };
assert.equal((await loader.loadBusinessOwnerHomeSignals(input)).lastSeenSeconds, null);
throwLive = true;
assert.equal((await loader.loadBusinessOwnerHomeSignals(input)).playbackState, null);
throwLive = false;
liveResult = { data: [row], error: null };
assert.equal((await loader.loadBusinessOwnerHomeSignals({ ...input, organizationId: "other" })).currentTrack, null);
assert.equal((await loader.loadBusinessOwnerHomeSignals({ ...input, locationId: null })).lastSeenSeconds, null);

const sql = readFileSync(new URL("../supabase/migrations/20261231160000_business_player_live_state.sql", import.meta.url), "utf8");
const activeSql = sql.split("/* Rollback")[0];
assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
assert.match(sql, /REVOKE ALL ON TABLE public.business_player_live_state FROM PUBLIC, anon, authenticated/);
assert.equal((activeSql.match(/SECURITY DEFINER/g) ?? []).length, 2);
assert.match(sql, /NOT public.has_business_pilot_access\(v_org\)/);
assert.match(sql, /NOT public.is_business_organization_member\(p_organization_id, v_user_id\)/);
assert.match(sql, /a.unassigned_at IS NULL AND a.assigned_at <= v_now/);
assert.match(sql, /ON CONFLICT \(player_id\) DO UPDATE/);
assert.doesNotMatch(activeSql, /\b(?:DELETE FROM|DROP TABLE|ALTER TABLE public.business_player_runtime|UPDATE public.business_player_runtime)\b/);
assert.match(sql, /business_spa_track_visible/);
assert.match(sql, /resolve_business_track_eligibility/);
assert.doesNotMatch(activeSql, /audio_path|signedUrl|storage_path/);
console.log("business-spa-live-state-unit: all tests passed");

// Mount the real component effect with a fake audio element and clock. No browser/DB.
const { SpaOnlinePlayer: Controller } = await import("../src/lib/business-app/spa-online-player.ts");
const { parseSpaManifest } = await import("../src/lib/business-app/spa-manifest.ts");
const liveModule = await import("../src/lib/business-app/spa-live-report.ts");
const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
const events = new EventTarget();
const audio = {
  src: "", currentTime: 0, paused: true, ended: false,
  addEventListener: (...args) => events.addEventListener(...args),
  removeEventListener: (...args) => events.removeEventListener(...args),
  async play() { this.paused = false; events.dispatchEvent(new Event("playing")); },
  pause() { this.paused = true; events.dispatchEvent(new Event("pause")); },
  removeAttribute() { this.src = ""; }, load() { this.currentTime = 0; this.ended = false; },
};
const intervals = new Map();
let intervalId = 0;
let cleanup;
let refs = 0;
let controllerRef;
const reports = [];
const oldWindow = globalThis.window;
globalThis.window = {
  setInterval: (fn) => { intervals.set(++intervalId, fn); return intervalId; },
  clearInterval: (id) => intervals.delete(id), setTimeout, clearTimeout,
};
try {
  const component = load("../src/components/business-app/SpaOnlinePlayer.tsx", {
    "react": {
      useRef: () => { const ref = { current: refs++ === 0 ? audio : null }; if (refs === 2) controllerRef = ref; return ref; },
      useState: (init) => [init(), () => {}],
      useEffect: (effect) => { cleanup = effect(); },
    },
    "react/jsx-runtime": require("react/jsx-runtime"),
    "@/app/business-app/spa/actions": {
      getSpaTrackUrl: async () => ({ ok: true, data: { url: "https://example.test/track" } }),
      refreshSpaManifest: async () => ({ ok: false, reason: "temporary" }),
      reportSpaPlayerLiveState: async (r) => { reports.push(r); throw Error("report transport fails"); },
    },
    "@/lib/business-app/spa-live-report": liveModule,
    "@/lib/business-app/spa-manifest": { parseSpaManifest },
    "@/lib/business-app/spa-online-player": { SpaOnlinePlayer: Controller },
  });
  component.default({ programName: "Test", initialManifest: {
    manifest_version: "business_spa_manifest_v1", program_id: id, location_id: id,
    generated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString(),
    offline_cache_max_seconds: 604800, withheld_count: 0, content_hash: "test",
    items: [{ position: 1, audio_item_id: id, title: "Track", playable_until: null, offline_allowed: false }],
  } });
  assert.equal(reports.at(-1).state, "stopped", "initial heartbeat");
  const ctl = controllerRef.current;
  await ctl.toggle();
  assert.equal(ctl.status, "playing", "report failures do not stop playback");
  assert.equal(reports.at(-1).playingConfirmed, false, "play resolve alone is not confirmed");
  const heartbeat = [...intervals.values()][0];
  for (let minute = 1; minute <= 45; minute++) {
    audio.currentTime = minute * 60;
    events.dispatchEvent(new Event("timeupdate"));
    heartbeat();
    assert.equal(reports.at(-1).playingConfirmed, true);
  }
  heartbeat();
  assert.equal(reports.at(-1).playingConfirmed, false, "stall in real wiring");
  await ctl.toggle();
  assert.equal(reports.at(-1).state, "paused");
  await ctl.toggle();
  for (let retry = 0; retry < 3; retry++) await ctl.onError();
  assert.equal(reports.at(-1).state, "error");
  assert.equal(reports.at(-1).playingConfirmed, false);
  await ctl.playIndex(0);
  ctl.items = [];
  audio.ended = true;
  events.dispatchEvent(new Event("ended"));
  assert.equal(reports.at(-1).state, "stopped", "ended with no next");
  cleanup();
  assert.equal(intervals.size, 0, "heartbeat is cleaned up on unmount");
  const count = reports.length;
  events.dispatchEvent(new Event("playing"));
  assert.equal(reports.length, count, "audio listeners removed");
  await new Promise((r) => setTimeout(r, 0));
} finally {
  globalThis.window = oldWindow;
}
console.log("business-spa-live-state-unit: component wiring passed");
