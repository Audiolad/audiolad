// Business SPA pilot (0e05333f) stage 1: online player controller + access wiring.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { SpaOnlinePlayer } = await import("../src/lib/business-app/spa-online-player.ts");

const item = (n) => ({ audioItemId: `00000000-0000-4000-8000-00000000000${n}`, title: `T${n}`, playableUntil: null });
const flush = () => new Promise((r) => setTimeout(r, 0));

function make({ items = [item(1), item(2), item(3)], signFn, playFn, clock } = {}) {
  const calls = [];
  const audio = {
    src: "",
    currentTime: 0,
    paused: true,
    async play() { if (playFn) await playFn(this.src); this.paused = false; },
    pause() { this.paused = true; },
    removeAttribute() { this.src = ""; },
    load() {},
  };
  const p = new SpaOnlinePlayer(
    { audio, ...(clock ?? {}), sign: async (id) => { calls.push(id); return signFn ? signFn(id) : { ok: true, data: { url: `https://s/${id}?token=x` } }; }, onChange() {} },
    items,
  );
  return { p, audio, calls };
}

// 1. Play starts the first track from a freshly signed URL.
{
  const { p, audio, calls } = make();
  await p.toggle();
  assert.equal(p.status, "playing");
  assert.equal(p.current.title, "T1");
  assert.match(audio.src, /0001/);
  assert.deepEqual(calls, [item(1).audioItemId]);
  // ended -> next, re-signed per track; loops
  await p.onEnded(); assert.equal(p.current.title, "T2");
  await p.onEnded(); await p.onEnded(); assert.equal(p.current.title, "T1");
  assert.equal(calls.length, 4);
  // pause/resume
  await p.toggle(); assert.equal(p.status, "paused"); assert.equal(audio.paused, true);
  await p.toggle(); assert.equal(p.status, "playing");
}

// 2. No access from the server: nothing is played, list is cleared.
{
  const { p, audio } = make({ signFn: () => ({ ok: false, reason: "no_access" }) });
  await p.toggle();
  assert.equal(p.status, "no_access");
  assert.equal(audio.src, "");
  assert.equal(p.items.length, 0);
  await p.toggle(); await p.playIndex(0);
  assert.equal(audio.src, "");
}

// 3. Revoked manifest while playing stops audio immediately.
{
  const { p, audio } = make();
  await p.toggle();
  await p.applyManifest(null);
  assert.equal(p.status, "no_access");
  assert.equal(audio.src, "");
  assert.equal(audio.paused, true);
}

// 4. Current track removed from manifest: stops it and continues with an allowed track.
{
  const { p, audio } = make();
  await p.toggle();
  await p.applyManifest([item(2), item(3)]);
  assert.equal(p.status, "playing");
  assert.equal(p.current.title, "T2");
  assert.doesNotMatch(audio.src, /0001/);
}

// 5. Removed track (not_in_manifest) is skipped; all failing -> error, no endless loop.
{
  const { p } = make({ signFn: (id) => (id.endsWith("1") ? { ok: false, reason: "not_in_manifest" } : { ok: true, data: { url: "u" + id } }) });
  await p.toggle();
  assert.equal(p.current.title, "T2");
  const all = make({ signFn: () => ({ ok: false, reason: "not_in_manifest" }) });
  await all.p.toggle();
  assert.equal(all.p.status, "error");
}

// 6. Stale sign result after a newer click is ignored.
{
  let release;
  const gate = new Promise((r) => (release = r));
  const { p, audio } = make({ signFn: async (id) => { if (id.endsWith("1")) await gate; return { ok: true, data: { url: "u" + id } }; } });
  const first = p.playIndex(0);
  await p.playIndex(1);
  release(); await first; await flush();
  assert.equal(p.current.title, "T2");
  assert.match(audio.src, /0002/);
}

// 7. Autoplay refusal -> paused with a hint, not an error loop.
{
  const { p } = make({ playFn: async () => { throw new Error("NotAllowedError"); } });
  await p.toggle();
  assert.equal(p.status, "paused");
  assert.ok(p.message);
}

// 9. Codex O1 #1: hard stop at playable_until even though the browser already buffered audio;
//    resume after the deadline does not reuse the old URL.
{
  let t = 1_000_000;
  const timers = [];
  const clock = { now: () => t, setTimer: (fn, ms) => { const h = { fn, at: t + ms }; timers.push(h); return h; }, clearTimer: (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); } };
  const advance = async (ms) => { t += ms; for (const h of [...timers]) if (h.at <= t) { timers.splice(timers.indexOf(h), 1); h.fn(); } await flush(); await flush(); };
  const short = { ...item(1), playableUntil: new Date(t + 6100) };
  const { p, audio, calls } = make({ items: [short], clock, signFn: (id) => (t >= short.playableUntil.getTime() ? { ok: false, reason: "expired" } : { ok: true, data: { url: "u" + id } }) });
  await p.toggle();
  assert.equal(p.status, "playing");
  await advance(6200);
  assert.notEqual(p.status, "playing");
  assert.equal(audio.src, "");
  assert.equal(audio.paused, true);
  // pause before deadline, resume after deadline -> no sound, no reuse of old URL
  const s2 = { ...item(2), playableUntil: new Date(t + 5000) };
  const b = make({ items: [s2], clock, signFn: (id) => (t >= s2.playableUntil.getTime() ? { ok: false, reason: "expired" } : { ok: true, data: { url: "u" + id } }) });
  await b.p.toggle(); await b.p.toggle();
  assert.equal(b.p.status, "paused");
  t += 6000;
  await b.p.toggle();
  assert.notEqual(b.p.status, "playing");
  assert.equal(b.audio.paused, true);
  // manifest shortens the window of the playing track -> stop at the new deadline
  const s3 = { ...item(3), playableUntil: null };
  const c = make({ items: [s3], clock });
  await c.p.toggle();
  await c.p.applyManifest([{ ...s3, playableUntil: new Date(t + 1000) }]);
  await advance(1100);
  assert.notEqual(c.p.status, "playing");
  assert.equal(c.audio.paused, true);
  void calls;
}

// 10. Codex O1 #2: repeated mid-stream errors on one track do not loop forever.
{
  const { p, calls } = make({ items: [item(1), item(2)] });
  await p.toggle();
  for (let k = 0; k < 8; k++) await p.onError();
  assert.equal(p.status, "error");
  assert.ok(calls.length <= 4, `signs=${calls.length}`);
  // a fresh track (user press) gets its own retry budget
  await p.playIndex(1);
  assert.equal(p.status, "playing");
}

// 11. Codex O2 #1: window shortened while play() is pending -> stop at the NEW deadline.
{
  let t = 5_000_000;
  const timers = [];
  const clock = { now: () => t, setTimer: (fn, ms) => { const h = { fn, at: t + ms }; timers.push(h); return h; }, clearTimer: (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); } };
  const advance = async (ms) => { t += ms; for (const h of [...timers]) if (h.at <= t) { timers.splice(timers.indexOf(h), 1); h.fn(); } await flush(); await flush(); };
  let releasePlay;
  const it = { ...item(1), playableUntil: null };
  const { p, audio } = make({ items: [it], clock, playFn: () => new Promise((r) => (releasePlay = r)) });
  const pending = p.toggle();
  await flush();
  await p.applyManifest([{ ...it, playableUntil: new Date(t + 1000) }]);
  releasePlay(); await pending; await flush();
  assert.equal(p.status, "playing");
  assert.equal(timers.length, 1, "deadline armed from the fresh manifest");
  await advance(1100);
  assert.notEqual(p.status, "playing");
  assert.equal(audio.paused, true);
  // deadline already passed when play() resolves -> immediate stop
  let rel2;
  const it2 = { ...item(2), playableUntil: null };
  const b = make({ items: [it2], clock, playFn: () => new Promise((r) => (rel2 = r)) });
  const pend2 = b.p.toggle();
  await flush();
  await b.p.applyManifest([{ ...it2, playableUntil: new Date(t + 500) }]);
  t += 1000;
  rel2(); await pend2; await flush();
  assert.notEqual(b.p.status, "playing");
  assert.equal(b.audio.paused, true);
}

// 12. Codex O2 #2: a refresh with an expired window never un-pauses the player.
{
  let t = 9_000_000;
  const clock = { now: () => t, setTimer: () => ({}), clearTimer: () => {} };
  const a = { ...item(1), playableUntil: new Date(t + 1000) };
  const { p, audio, calls } = make({ items: [a, item(2)], clock });
  await p.toggle(); await p.toggle();
  assert.equal(p.status, "paused");
  const n = calls.length;
  t += 2500;
  await p.applyManifest([a, item(2)]);
  assert.equal(p.status, "paused");
  assert.equal(audio.paused, true);
  assert.equal(calls.length, n, "no new track started");
}

// 8. Wiring: online page uses the online player; no cache / download / offline sign.
{
  const page = readFileSync(new URL("../src/app/business-app/spa/page.tsx", import.meta.url), "utf8");
  assert.match(page, /SpaOnlinePlayer/);
  assert.doesNotMatch(page, /<SpaPilotPlayer/);
  const comp = readFileSync(new URL("../src/components/business-app/SpaOnlinePlayer.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(comp, /caches\.|localStorage|indexedDB|"offline"|spa-player-engine|downloadAll/);
  assert.match(comp, /getSpaTrackUrl\(id, "stream"\)/);
  const actions = readFileSync(new URL("../src/app/business-app/spa/actions.ts", import.meta.url), "utf8");
  assert.match(actions, /const SPA_OFFLINE_ENABLED = false;/);
  assert.match(actions, /purpose === "offline" && !SPA_OFFLINE_ENABLED\) return \{ ok: false, reason: "offline_not_allowed" \}/);
  // access check precedes signing
  const fn = actions.slice(actions.indexOf("export async function getSpaTrackUrl"));
  assert.ok(fn.indexOf("loadSpaPilotContext()") < fn.indexOf("signSpaTrack("));
  assert.match(fn, /if \(!ctx\) return \{ ok: false, reason: "no_access" \}/);
  const pilot = readFileSync(new URL("../src/lib/business-app/spa-pilot.ts", import.meta.url), "utf8");
  assert.match(pilot, /if \(!item\) throw new Error\("business_spa_track_not_in_manifest"\)/);
}

console.log("business-spa-online-player-unit: all tests passed");
