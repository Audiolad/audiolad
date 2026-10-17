import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { SpaLiveEvidence, isSpaLiveReport, sendSpaLiveReport } from "../src/lib/business-app/spa-live-report.ts";
import * as signals from "../src/lib/business-app/owner-home-signals.ts";
import * as live from "../src/lib/business-app/spa-live-report.ts";

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

// c02fe282 live-fix: track already playing before reporting started (no "playing" event).
{
  const e = new SpaLiveEvidence();
  e.reset();
  e.onTimeUpdate(300, 1000, false);
  assert.equal(e.report("playing", id, 1000).playingConfirmed, false, "first element sample is only a baseline");
  e.onTimeUpdate(300.25, 1250, false);
  e.onTimeUpdate(301, 2000, false);
  assert.equal(e.report("playing", id, 2000).playingConfirmed, true, "already-playing element with advancing time is confirmed");
  for (let s = 1; s <= 120; s++) e.onTimeUpdate(301 + s, 2000 + s * 1000, false);
  assert.equal(e.report("playing", id, 122000).playingConfirmed, true, "periodic report keeps confirming");
  e.onTimeUpdate(421, 123000, true);
  e.onTimeUpdate(421, 180000, true);
  assert.equal(e.report("playing", id, 180000).playingConfirmed, false, "paused element is never confirmed");
  const f = new SpaLiveEvidence();
  f.onTimeUpdate(50, 1000, false);
  f.onTimeUpdate(50, 60000, false);
  assert.equal(f.report("playing", id, 60000).playingConfirmed, false, "not-paused but stalled currentTime is not confirmed");
}
{
  const d = live.deriveSpaPlaybackState;
  assert.equal(d("paused", { paused: false, ended: false }, true), "playing", "controller says paused, element plays → playing");
  assert.equal(d("playing", { paused: true, ended: false }, true), "paused", "controller says playing, element paused → paused");
  assert.equal(d("playing", { paused: false, ended: true }, true), "stopped");
  assert.equal(d("idle", { paused: true, ended: false }, false), "stopped");
  assert.equal(d("error", { paused: false, ended: false }, true), "error");
  assert.equal(d(undefined, { paused: false, ended: false }, false), "stopped", "no track → never playing");
}
const src = readFileSync(new URL("../src/components/business-app/SpaOnlinePlayer.tsx", import.meta.url), "utf8");
assert.match(src, /deriveSpaPlaybackState\(c\?\.status, audio,/, "periodic report derives state from the audio element");
assert.match(src, /evidence\.onTimeUpdate\(audio\.currentTime, Date\.now\(\), audio\.paused \|\| audio\.ended\)/);
assert.doesNotMatch(src, /c\?\.status === "playing" \? "playing"/, "controller status alone must not decide playing");

const now = Date.parse("2026-10-14T12:00:00Z");
const iso = (ms) => new Date(ms).toISOString();
const row = { organization_id: "org", last_seen_at: iso(now - 300000), playback_state: "playing", playback_reported_at: iso(now - 1000), playing_confirmed_at: iso(now - 1000), current_track_title: "Allowed" };
assert.equal(signals.mapOwnerLiveState([row], "org", now).liveConnected, true);
assert.equal(signals.mapOwnerLiveState([row], "org", now + 1).liveConnected, false);
assert.deepEqual(signals.mapOwnerLiveState([row], "org", now).currentTrack, { title: "Allowed" });
assert.equal(signals.mapOwnerLiveState([row], "other", now).currentTrack, null);
assert.equal(signals.mapOwnerLiveState(null, "org", now).lastSeenSeconds, null);
assert.equal(signals.mapOwnerLiveState([{ ...row, current_track_title: null }], "org", now).currentTrack, null);
// Separation: heartbeat-only row -> connectivity, no playback state, no track.
const hbOnly = signals.mapOwnerLiveState([{ organization_id: "org", last_seen_at: iso(now - 10000), playback_state: null, playback_reported_at: null, playing_confirmed_at: null, current_track_title: null }], "org", now);
assert.equal(hbOnly.liveConnected, true);
assert.equal(hbOnly.playbackState, null);
assert.equal(hbOnly.playbackConfirmedAt, null);
// A stale reported state (> 5 min) with a lost heartbeat is dropped: never shown as current, track hidden.
const staleState = signals.mapOwnerLiveState([{ ...row, last_seen_at: iso(now - 600000), playback_state: "paused", playback_reported_at: iso(now - 301000) }], "org", now);
assert.equal(staleState.playbackState, null);
assert.equal(staleState.currentTrack, null);
// Long pause (> 5 min since report) still reads as paused while the heartbeat is fresh.
const longPause = signals.mapOwnerLiveState([{ ...row, last_seen_at: iso(now - 30000), playback_state: "paused", playback_reported_at: iso(now - 1800000) }], "org", now);
assert.equal(longPause.playbackState, "paused");
// ...but an old "playing" report is never current.
assert.equal(signals.mapOwnerLiveState([{ ...row, last_seen_at: iso(now - 30000), playback_reported_at: iso(now - 1800000) }], "org", now).playbackState, null);
// State without heartbeat: connectivity stays unknown (null), not "online".
assert.equal(signals.mapOwnerLiveState([{ ...row, last_seen_at: null }], "org", now).liveConnected, null);
assert.equal(signals.mapOwnerLiveState([{ ...row, last_seen_at: "invalid" }], "org", now).lastSeenSeconds, null);

// Device session secret: stable per tab, valid format, survives blocked storage.
const store = new Map();
const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
let n = 0;
const rnd = () => `0000000${++n}-aaaa-bbbb-cccc-dddddddddddd`;
const s1 = live.getSpaDeviceSecret(storage, rnd);
assert.match(s1, /^[A-Za-z0-9_-]{32,128}$/);
assert.equal(live.getSpaDeviceSecret(storage, rnd), s1);
const blocked = { getItem: () => { throw Error("blocked"); }, setItem: () => { throw Error("blocked"); } };
assert.match(live.getSpaDeviceSecret(blocked, rnd), /^[A-Za-z0-9_-]{32,128}$/);

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
  // c02fe282 stable-report: actions delegate to the shared handler (also used by the route).
  "@/lib/business-app/spa-player-report": load("../src/lib/business-app/spa-player-report.ts", {
    "@/lib/business-app/spa-live-report": { isSpaLiveReport },
  }),
});
const secret = "s".repeat(40);
assert.equal((await actions.reportSpaPlayerPlayback(secret, valid)).reason, "no_access");
assert.equal((await actions.reportSpaPlayerHeartbeat(secret)).reason, "no_access");
context = { playerId: null };
assert.equal((await actions.reportSpaPlayerPlayback(secret, valid)).reason, "no_access");
context = { playerId: id };
assert.equal((await actions.reportSpaPlayerPlayback(secret, { ...valid, state: "bad" })).reason, "invalid_request");
assert.equal((await actions.reportSpaPlayerPlayback("short", valid)).reason, "invalid_request");
assert.equal((await actions.reportSpaPlayerHeartbeat("bad secret with spaces and long enough!!")).reason, "invalid_request");
assert.equal(calls.length, 0);
assert.equal((await actions.reportSpaPlayerHeartbeat(secret)).ok, true);
assert.equal(calls[0][0], "report_business_spa_player_heartbeat");
assert.deepEqual(calls[0][1], { p_player_id: id, p_device_secret: secret });
assert.equal((await actions.reportSpaPlayerPlayback(secret, valid)).ok, true);
assert.equal(calls[1][0], "report_business_spa_player_playback");
assert.equal(calls[1][1].p_player_id, id);
assert.equal(calls[1][1].p_playing_confirmed, true);
rpcError = { code: "42883" };
assert.equal((await actions.reportSpaPlayerPlayback(secret, valid)).reason, "report_failed");
assert.equal((await actions.reportSpaPlayerHeartbeat(secret)).reason, "report_failed");
rpcError = null;

// The loader reads the real clock (Date.now), so its fixture must be relative to the real clock,
// not the fixed `now` used for the pure mapOwnerLiveState checks above.
const liveNow = Date.now();
const liveRow = { ...row, last_seen_at: iso(liveNow - 1000), playback_reported_at: iso(liveNow - 1000), playing_confirmed_at: iso(liveNow - 1000) };
let liveResult = { data: [liveRow], error: null };
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
liveResult = { data: [liveRow], error: null };
assert.equal((await loader.loadBusinessOwnerHomeSignals({ ...input, organizationId: "other" })).currentTrack, null);
assert.equal((await loader.loadBusinessOwnerHomeSignals({ ...input, locationId: null })).lastSeenSeconds, null);

const sql = readFileSync(new URL("../supabase/migrations/20261231160000_business_player_live_state.sql", import.meta.url), "utf8");
const activeSql = sql.split("/* Rollback")[0];
assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
for (const t of ["business_player_device_heartbeat", "business_player_playback_state", "business_player_listening_history"]) {
  assert.match(sql, new RegExp(`REVOKE ALL ON TABLE public.${t} FROM PUBLIC, anon, authenticated`));
  assert.match(sql, new RegExp(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`));
}
assert.equal((activeSql.match(/SECURITY DEFINER/g) ?? []).length, 5);
assert.match(sql, /REVOKE ALL ON FUNCTION public.business_spa_session_player\(timestamptz\) FROM PUBLIC, anon, authenticated/);
assert.match(sql, /v_player IS DISTINCT FROM p_player_id/);
assert.match(sql, /REVOKE ALL ON FUNCTION public.business_player_live_claim\(uuid, text, timestamptz\) FROM PUBLIC, anon, authenticated/);
assert.match(sql, /device_session_conflict/);
// Rollback keeps data: no DROP anywhere in the rollback plan, only REVOKE.
const rollback = sql.split("/* Rollback")[1];
assert.doesNotMatch(rollback, /DROP TABLE|DROP FUNCTION|TRUNCATE|DELETE FROM/);
assert.match(rollback, /REVOKE EXECUTE/);
assert.match(sql, /public.has_business_pilot_access\(al.organization_id\)/);
assert.match(sql, /NOT public.is_business_organization_member\(v_org, v_user_id\)/);
assert.match(sql, /a.unassigned_at IS NULL AND a.assigned_at <= p_now/);
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
let heartbeats = 0;
const oldWindow = globalThis.window;
globalThis.window = {
  setInterval: (fn) => { intervals.set(++intervalId, fn); return intervalId; },
  clearInterval: (id) => intervals.delete(id), setTimeout, clearTimeout,
};
try {
  const component = load("../src/components/business-app/SpaOnlinePlayer.tsx", {
    "react": {
      useRef: () => { const ref = { current: refs++ === 0 ? audio : null }; if (refs === 2) controllerRef = ref; return ref; },
      useState: (init) => [typeof init === "function" ? init() : init, () => {}],
      useEffect: (effect) => { cleanup = effect(); },
    },
    "react/jsx-runtime": require("react/jsx-runtime"),
    // a8240527: shared transport controls (presentational) of the Business player.
    "@/components/business-app/BusinessPlayerControls": { default: () => null },
    // c02fe282 stable-report: the player uses build-independent route handlers, not server actions.
    "@/lib/business-app/spa-player-client": {
      fetchSpaTrackUrl: async () => ({ ok: true, data: { url: "https://example.test/track" } }),
      fetchSpaManifest: async () => ({ ok: false, reason: "temporary" }),
      postSpaReport: async (p) => {
        if (p.kind === "heartbeat") { heartbeats++; throw Error("heartbeat transport fails"); }
        reports.push(p.report); throw Error("report transport fails");
      },
      watchSpaBuild: () => () => {},
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
  // Separation: opening the page sends a connectivity heartbeat only, no playback state.
  assert.equal(heartbeats, 1, "initial heartbeat");
  assert.equal(reports.length, 0, "no playback state before anything plays");
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
  assert.ok(heartbeats >= 47, "heartbeat keeps going every minute, independent of playback");
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
