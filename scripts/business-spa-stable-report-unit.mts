// c02fe282 stable-report: /spa reports via a build-independent route handler, auth unchanged.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { handleSpaReport, handleSpaTrackUrl, isSameOriginJsonRequest, parseSpaReportBody, spaReportHttpStatus } from "../src/lib/business-app/spa-player-report";
import { postSpaReport, fetchSpaTrackUrl, watchSpaBuild } from "../src/lib/business-app/spa-player-client";
import { resolveBusinessProxyAction } from "../src/lib/business-app/proxy-policy";
import { BUSINESS_HOSTNAME } from "../src/lib/business-app/host";

const SESSION_PLAYER = "11111111-1111-4111-8111-111111111111";
const OTHER_PLAYER = "22222222-2222-4222-8222-222222222222";
const TRACK = "33333333-3333-4333-8333-333333333333";
const SECRET = "a".repeat(40);
const playing = { state: "playing", audioItemId: TRACK, playingConfirmed: true, errorCode: null };

function deps(playerId: string | null, error: unknown = null) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  return { calls, d: { loadPlayerId: async () => playerId, rpc: async (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return { error }; } } };
}

// Happy paths: player id comes from the session, RPC names/args unchanged.
{
  const { calls, d } = deps(SESSION_PLAYER);
  assert.deepEqual(await handleSpaReport({ kind: "heartbeat", deviceSecret: SECRET }, d), { ok: true, data: null });
  assert.deepEqual(calls[0], { fn: "report_business_spa_player_heartbeat", args: { p_player_id: SESSION_PLAYER, p_device_secret: SECRET } });
  assert.deepEqual(await handleSpaReport({ kind: "playback", deviceSecret: SECRET, report: playing }, d), { ok: true, data: null });
  assert.deepEqual(calls[1], { fn: "report_business_spa_player_playback", args: {
    p_player_id: SESSION_PLAYER, p_device_secret: SECRET, p_state: "playing", p_audio_item_id: TRACK, p_playing_confirmed: true, p_error_code: null } });
}
// Negative: a body-supplied player id is ignored (cannot fake another device).
{
  const { calls, d } = deps(SESSION_PLAYER);
  await handleSpaReport({ kind: "heartbeat", deviceSecret: SECRET, playerId: OTHER_PLAYER, p_player_id: OTHER_PLAYER }, d);
  await handleSpaReport({ kind: "playback", deviceSecret: SECRET, playerId: OTHER_PLAYER, report: { ...playing, playerId: OTHER_PLAYER } }, d);
  for (const c of calls) assert.equal(c.args.p_player_id, SESSION_PLAYER);
  assert.ok(!JSON.stringify(calls).includes(OTHER_PLAYER));
}
// Negative: no session / no assigned player → no RPC call.
{
  const { calls, d } = deps(null);
  const r = await handleSpaReport({ kind: "heartbeat", deviceSecret: SECRET }, d);
  assert.deepEqual(r, { ok: false, reason: "no_access" });
  assert.equal(spaReportHttpStatus(r), 403);
  assert.equal(calls.length, 0);
}
// Negative: malformed bodies never reach auth or RPC.
for (const bad of [null, [], "x", {}, { kind: "heartbeat" }, { kind: "heartbeat", deviceSecret: "short" }, { kind: "heartbeat", deviceSecret: "a".repeat(129) },
  { kind: "heartbeat", deviceSecret: "a".repeat(39) + "!" }, { kind: "other", deviceSecret: SECRET }, { kind: "playback", deviceSecret: SECRET },
  { kind: "playback", deviceSecret: SECRET, report: { ...playing, state: "paused" } }, { kind: "playback", deviceSecret: SECRET, report: { ...playing, audioItemId: "x" } }]) {
  let loaded = false;
  const r = await handleSpaReport(bad, { loadPlayerId: async () => { loaded = true; return SESSION_PLAYER; }, rpc: async () => { throw Error("must not call"); } });
  assert.deepEqual(r, { ok: false, reason: "invalid_request" }, JSON.stringify(bad));
  assert.equal(spaReportHttpStatus(r), 400);
  assert.equal(loaded, false);
}
assert.equal(parseSpaReportBody({ kind: "heartbeat", deviceSecret: SECRET })?.kind, "heartbeat");
// RPC refusal (e.g. ownership / device secret mismatch) or throw → report_failed, never throws.
assert.deepEqual(await handleSpaReport({ kind: "heartbeat", deviceSecret: SECRET }, deps(SESSION_PLAYER, { code: "42501" }).d), { ok: false, reason: "report_failed" });
assert.deepEqual(await handleSpaReport({ kind: "heartbeat", deviceSecret: SECRET }, { loadPlayerId: async () => { throw Error("db"); }, rpc: async () => ({ error: null }) }), { ok: false, reason: "report_failed" });

// CSRF / same-origin guard.
const h = (o: Record<string, string>) => new Headers(o);
assert.equal(isSameOriginJsonRequest(h({ "content-type": "application/json", "sec-fetch-site": "same-origin" })), true);
assert.equal(isSameOriginJsonRequest(h({ "content-type": "application/json", "sec-fetch-site": "cross-site" })), false);
assert.equal(isSameOriginJsonRequest(h({ "content-type": "application/json", "sec-fetch-site": "same-site" })), false);
assert.equal(isSameOriginJsonRequest(h({ "content-type": "text/plain", "sec-fetch-site": "same-origin" })), false, "simple-form CSRF");
assert.equal(isSameOriginJsonRequest(h({ "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" })), false);
assert.equal(isSameOriginJsonRequest(h({ "content-type": "application/json", origin: "https://b.audiolad.ru", host: "b.audiolad.ru" })), true);
assert.equal(isSameOriginJsonRequest(h({ "content-type": "application/json", origin: "https://evil.example", host: "b.audiolad.ru" })), false);
assert.equal(isSameOriginJsonRequest(h({ "content-type": "application/json", host: "b.audiolad.ru" })), false, "no origin, no fetch metadata");

// Track URL: stream only, auth from server context.
{
  let purposeCtx: unknown;
  const ok = await handleSpaTrackUrl({ audioItemId: TRACK, purpose: "offline" }, { loadContext: async () => ({ p: 1 }), sign: async (ctx, id) => { purposeCtx = ctx; return { url: `u/${id}` }; } });
  assert.deepEqual(ok, { ok: true, data: { url: `u/${TRACK}` } });
  assert.deepEqual(purposeCtx, { p: 1 });
  assert.deepEqual(await handleSpaTrackUrl({ audioItemId: TRACK }, { loadContext: async () => null, sign: async () => { throw Error("no"); } }), { ok: false, reason: "no_access" });
  assert.deepEqual(await handleSpaTrackUrl({ audioItemId: "x" }, { loadContext: async () => ({}), sign: async () => ({ url: "" }) }), { ok: false, reason: "invalid_request" });
  assert.deepEqual(await handleSpaTrackUrl({ audioItemId: TRACK }, { loadContext: async () => ({}), sign: async () => { throw Error("business_spa_track_not_in_manifest"); } }), { ok: false, reason: "not_in_manifest" });
  const route = readFileSync("src/app/api/business/player/track-url/route.ts", "utf8");
  assert.match(route, /signSpaTrack\(ctx, id, "stream"\)/);
  assert.doesNotMatch(route, /"offline"/);
}

// Business host must route the new endpoints (else the stable URL would 404 on b.* too).
for (const p of ["/api/business/player/report", "/api/business/player/track-url", "/api/business/player/manifest"]) {
  assert.equal(resolveBusinessProxyAction(BUSINESS_HOSTNAME, p).action, "pass_through", p);
  assert.ok(existsSync(`src/app${p}/route.ts`), p);
}
assert.equal(resolveBusinessProxyAction(BUSINESS_HOSTNAME, "/api/business/player/other").action, "not_found");

// Client: stable URLs, JSON, same-origin credentials; network failure does not throw for signing.
{
  const seen: Array<[string, RequestInit | undefined]> = [];
  const f = (async (u: string, init?: RequestInit) => { seen.push([u, init]); return new Response(JSON.stringify({ ok: true, data: null })); }) as typeof fetch;
  await postSpaReport({ kind: "heartbeat", deviceSecret: SECRET }, f);
  assert.equal(seen[0][0], "/api/business/player/report");
  assert.equal(seen[0][1]?.method, "POST");
  assert.equal((seen[0][1]?.headers as Record<string, string>)["Content-Type"], "application/json");
  assert.equal(seen[0][1]?.credentials, "same-origin");
  assert.deepEqual(await fetchSpaTrackUrl(TRACK, (async () => { throw Error("offline"); }) as typeof fetch), { ok: false, reason: "network" });
  assert.deepEqual(await fetchSpaTrackUrl(TRACK, (async () => new Response("<html>404", { status: 404 })) as typeof fetch), { ok: false, reason: "network" });
}

// New build detection: hint once, never reload.
{
  const commits = ["a".repeat(40), "a".repeat(40), "b".repeat(40), "c".repeat(40)];
  let tick: () => void = () => {};
  let hits = 0;
  const f = (async () => new Response(JSON.stringify({ deployCommit: commits.shift() }))) as typeof fetch;
  const stop = watchSpaBuild(() => hits++, { f, setInterval: (fn) => { tick = fn; return 1; }, clearInterval: () => {} });
  const flush = () => new Promise((r) => setTimeout(r, 0));
  await flush(); tick(); await flush(); assert.equal(hits, 0);
  tick(); await flush(); assert.equal(hits, 1);
  tick(); await flush(); assert.equal(hits, 1, "only once");
  stop();
}

// The /spa player no longer depends on build-specific server actions and never auto-reloads.
const player = readFileSync("src/components/business-app/SpaOnlinePlayer.tsx", "utf8");
assert.doesNotMatch(player, /spa\/actions/);
assert.doesNotMatch(player, /location\.reload|router\.refresh|location\.href\s*=/);
const client = readFileSync("src/lib/business-app/spa-player-client.ts", "utf8");
assert.doesNotMatch(client, /reload\(|location\.href\s*=/);
// Route handlers keep server-side auth (session context + user-session supabase client).
const reportRoute = readFileSync("src/app/api/business/player/report/route.ts", "utf8");
assert.match(reportRoute, /loadSpaPilotContext\(\)\)\?\.playerId/);
assert.match(reportRoute, /isSameOriginJsonRequest/);
assert.match(reportRoute, /isCabinetReportSource/);
assert.doesNotMatch(reportRoute, /service-role|createServiceRoleClient/);

console.log("business-spa-stable-report-unit: OK");
