// AudioLad Business Stage 1B P0-3: the hall recovers from a network drop on its own.
// Real SpaOnlinePlayer class with a fake <audio>, a fake clock and a fake sign endpoint.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  PRESIGN_MAX_AGE_MS,
  PRESIGN_REFRESH_AGE_MS,
  PRESIGN_RETRY_MS,
  RECONNECTING_MESSAGE,
  RECOVERY_MAX_MS,
  RECOVERY_RESUME_WINDOW_MS,
  RECOVERY_STALL_MS,
  SpaOnlinePlayer,
  type OnlineSignResult,
} from "../src/lib/business-app/spa-online-player";
import type { SpaManifestItem } from "../src/lib/business-app/spa-manifest";

type Item = SpaManifestItem;
const item = (n: number): Item => ({
  position: n,
  audioItemId: `track-${n}`,
  trackCode: null,
  title: `T${n}`,
  durationSeconds: null,
  gainDb: null,
  playableUntil: null,
  offlineAllowed: false,
  offlineCacheUntil: null,
});
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

function world(opts: {
  items?: Item[];
  sign?: (id: string) => OnlineSignResult | Promise<OnlineSignResult>;
  play?: (src: string) => Promise<void> | void;
  online?: () => boolean;
} = {}) {
  let t = 1_000_000;
  const timers: { fn: () => void; at: number; ms: number }[] = [];
  const signs: string[] = [];
  let net = true;
  const audio = {
    src: "",
    currentTime: 0,
    paused: true,
    async play() {
      if (opts.play) await opts.play(this.src);
      this.paused = false;
    },
    pause() { this.paused = true; },
    removeAttribute() { this.src = ""; this.currentTime = 0; },
    load() {},
  };
  const p = new SpaOnlinePlayer(
    {
      audio,
      now: () => t,
      random: () => 0.5,
      isOnline: opts.online ?? (() => net),
      setTimer: (fn, ms) => { const h = { fn, at: t + ms, ms }; timers.push(h); return h; },
      clearTimer: (h) => { const i = timers.indexOf(h as (typeof timers)[number]); if (i >= 0) timers.splice(i, 1); },
      sign: async (id) => {
        signs.push(id);
        if (!net) return { ok: false, reason: "network" };
        return opts.sign ? opts.sign(id) : { ok: true, data: { url: `https://s/${id}?sig=${signs.length}` } };
      },
      onChange() {},
    },
    opts.items ?? [item(1), item(2), item(3)],
  );
  const advance = async (ms: number) => {
    const end = t + ms;
    for (;;) {
      const due = timers.filter((h) => h.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      t = due.at;
      timers.splice(timers.indexOf(due), 1);
      due.fn();
      await flush();
    }
    t = end;
    await flush();
  };
  return {
    p, audio, signs, timers, advance,
    setNet(v: boolean) { net = v; },
    tick(ms: number) { t += ms; },
  };
}

// 1. Offline mid-track -> automatic resume of the same track at its position on `online`.
{
  const w = world();
  await w.p.toggle();
  assert.equal(w.p.status, "playing");
  w.audio.currentTime = 42;
  w.p.onProgress(42, 200);
  w.setNet(false);
  await w.p.onError(); // the stream breaks
  assert.equal(w.p.status, "loading");
  assert.equal(w.p.message, RECONNECTING_MESSAGE);
  assert.equal(w.p.recovering, true);
  assert.equal(w.p.needsGesture, false, "network trouble never asks for a tap");
  await w.advance(1_000); // first retry, still offline
  assert.equal(w.p.status, "loading");
  w.setNet(true);
  await w.p.onOnline();
  await flush();
  assert.equal(w.p.status, "playing", "resumes without a tap");
  assert.equal(w.p.current?.audioItemId, "track-1", "same track");
  assert.equal(w.audio.currentTime, 42, "same position");
  // sig=2 is the pre-sign of track-2 at play start (t1285u), sig=3 the offline retry.
  assert.match(w.audio.src, /track-1\?sig=4/, "freshly signed URL");
  assert.equal(w.p.message, null);
  assert.equal(w.p.recovering, false);
  assert.equal(w.timers.length, 0, "no stray retry timers");
}

// 2. Backoff 1, 2, 4 … capped at 30 s while the server cannot be reached; then recovers.
{
  const w = world();
  await w.p.toggle();
  w.setNet(false);
  await w.p.onError();
  const delays: number[] = [];
  for (let k = 0; k < 8; k++) {
    assert.equal(w.timers.length, 1);
    delays.push(w.timers[0].ms);
    await w.advance(w.timers[0].ms);
  }
  assert.deepEqual(delays, [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  assert.ok(delays.every((d) => d <= RECOVERY_MAX_MS));
  assert.equal(w.p.status, "loading", "keeps trying, never a dead error state");
  w.setNet(true);
  await w.advance(30_000);
  assert.equal(w.p.status, "playing");
  // the next outage starts from 1 s again
  w.setNet(false);
  await w.p.onError();
  assert.equal(w.timers[0].ms, 1000);
  w.p.dispose();
  assert.equal(w.timers.length, 0, "dispose clears retries");
}

// 3. Jitter stays within ±25 %.
{
  for (const r of [0, 0.999]) {
    let n = 0;
    const timers: number[] = [];
    const p = new SpaOnlinePlayer(
      {
        audio: { src: "", currentTime: 0, async play() {}, pause() {}, removeAttribute() {}, load() {} },
        random: () => r,
        setTimer: (_fn, ms) => { timers.push(ms); return ++n; },
        clearTimer: () => {},
        sign: async () => ({ ok: false, reason: "network" }),
        onChange() {},
      },
      [item(1)],
    );
    await p.toggle();
    assert.ok(timers[0] >= 750 && timers[0] <= 1250, `jitter ${timers[0]}`);
    p.dispose();
  }
}

// 4. Long outage (> RECOVERY_RESUME_WINDOW_MS): continue with the next track, not mid-track.
{
  const w = world();
  await w.p.toggle();
  w.audio.currentTime = 80;
  w.p.onProgress(80, 200);
  w.setNet(false);
  await w.p.onError();
  w.tick(RECOVERY_RESUME_WINDOW_MS + 1);
  w.setNet(true);
  await w.p.onOnline();
  await flush();
  assert.equal(w.p.status, "playing");
  assert.equal(w.p.current?.audioItemId, "track-2");
  assert.equal(w.audio.currentTime, 0);
}

// 5. Autoplay refusal: ONE gesture state, no retries; a tap resumes the loaded track.
{
  let blocked = true;
  const w = world({ play: () => { if (blocked) { const e = new Error("play() failed"); e.name = "NotAllowedError"; throw e; } } });
  await w.p.toggle();
  assert.equal(w.p.status, "paused");
  assert.equal(w.p.needsGesture, true);
  assert.equal(w.p.message, null, "the button is the only hint");
  assert.equal(w.timers.length, 0, "no retry loop on autoplay refusal");
  await w.advance(120_000);
  assert.equal(w.signs.length, 1);
  blocked = false;
  await w.p.toggle(); // «Включить музыку» tap
  assert.equal(w.p.status, "playing");
  assert.equal(w.p.needsGesture, false);
  assert.equal(w.signs.filter((id) => id === "track-1").length, 1, "the already signed source is used inside the gesture");
}

// 6. Autoplay refusal after a reconnect (e.g. the browser dropped the gesture): gesture state.
{
  let blocked = false;
  const w = world({ play: () => { if (blocked) { const e = new Error("x"); e.name = "NotAllowedError"; throw e; } } });
  await w.p.toggle();
  w.setNet(false);
  await w.p.onError();
  w.setNet(true);
  blocked = true;
  await w.p.onOnline();
  await flush();
  assert.equal(w.p.needsGesture, true);
  assert.equal(w.p.status, "paused");
  assert.equal(w.timers.length, 0);
}

// 7. Stall watchdog: "waiting" without progress for RECOVERY_STALL_MS -> reconnect; progress cancels it.
{
  const w = world();
  await w.p.toggle();
  w.audio.currentTime = 10;
  w.p.onWaiting();
  w.audio.currentTime = 11;
  w.p.onProgress(11, 200);
  await w.advance(RECOVERY_STALL_MS + 1);
  assert.equal(w.p.status, "playing", "a short buffering hiccup is not a failure");
  w.p.onWaiting();
  await w.advance(RECOVERY_STALL_MS);
  assert.equal(w.p.recovering, true, "stalled stream reconnects");
  await w.advance(1_000);
  assert.equal(w.p.status, "playing");
  assert.equal(w.audio.currentTime, 11, "resumed at the stalled position");
}

// 8. `online` while a stream is stalled: reconnect at once.
{
  const w = world();
  await w.p.toggle();
  w.audio.currentTime = 30;
  w.p.onProgress(30, 200);
  w.p.onWaiting();
  await w.p.onOnline();
  await flush();
  assert.equal(w.p.status, "playing");
  assert.equal(w.audio.currentTime, 30);
  // track-1, the pre-sign of track-2 (t1285u), the reconnect of track-1; the pre-sign is kept.
  assert.deepEqual(w.signs, ["track-1", "track-2", "track-1"]);
}

// 9. Pre-sign (t1285u): the next track's URL is requested as soon as the current one plays
//    (a locked iPhone suspends JS, the last 45 s may never run) and used once at "ended".
{
  const w = world();
  await w.p.toggle();
  await flush();
  assert.deepEqual(w.signs, ["track-1", "track-2"], "pre-signed at play start");
  w.p.onProgress(10, 200);
  w.p.onProgress(160, 200);
  w.p.onProgress(161, 200);
  await flush();
  assert.deepEqual(w.signs, ["track-1", "track-2"], "pre-signed once");
  w.setNet(false); // the network drops right at the boundary
  await w.p.onEnded();
  await flush();
  assert.equal(w.p.status, "playing", "the next track starts from the pre-signed URL");
  assert.equal(w.p.current?.audioItemId, "track-2");
  // the background access re-check of track-2 fails offline: it keeps playing;
  // offline: the pre-sign of track-3 fails and is retried later, not blocked forever
  assert.deepEqual(w.signs, ["track-1", "track-2", "track-2", "track-3"]);
  assert.equal(w.p.status, "playing", "a failed re-check (network) never stops the music");
  w.p.onProgress(1, 200);
  await flush();
  assert.equal(w.signs.length, 4, "no retry storm right after a failure");
  w.setNet(true);
  w.tick(PRESIGN_RETRY_MS + 1);
  w.p.onProgress(12, 200);
  await flush();
  assert.deepEqual(w.signs, ["track-1", "track-2", "track-2", "track-3", "track-3"], "failed pre-sign is retried");
  w.p.onProgress(13, 200);
  await flush();
  assert.equal(w.signs.length, 5, "a ready pre-sign is not repeated");
  // an aging pre-sign is refreshed while the track still plays
  w.tick(PRESIGN_REFRESH_AGE_MS + 1);
  w.p.onProgress(14, 200);
  await flush();
  assert.equal(w.signs.length, 6, "aging pre-sign refreshed");
  // stale pre-sign is not used at the boundary
  w.tick(PRESIGN_MAX_AGE_MS + 1);
  await w.p.onEnded();
  await flush();
  assert.equal(w.p.current?.audioItemId, "track-3");
  assert.equal(w.signs.at(-1 - 1), "track-3", "expired pre-sign is re-signed (access re-checked)");
  assert.equal(w.signs.length, 8, "boundary sign + pre-sign of the following track");
}

// 9b. Instant advance ("ended") keeps the element: no pause / src removal / load() before the
//     next source (t1285u: that tore down the iOS media session on a locked iPhone).
{
  const w = world();
  const log: string[] = [];
  const a = w.audio as typeof w.audio & { playInstant?: () => Promise<void> };
  const origPause = a.pause.bind(a);
  const origRemove = a.removeAttribute.bind(a);
  a.pause = () => { log.push("pause"); origPause(); };
  a.removeAttribute = () => { log.push("removeAttribute"); origRemove(); };
  a.load = () => { log.push("load"); };
  let srcAtInstant = "";
  a.playInstant = async () => { log.push("playInstant"); srcAtInstant = a.src; a.paused = false; };
  await w.p.toggle();
  await flush();
  log.length = 0;
  a.paused = true; // the element ended by itself
  await w.p.onEnded();
  assert.deepEqual(log, ["playInstant"], "only playInstant at the boundary (pre-signed)");
  assert.match(srcAtInstant, /track-2/);
  assert.equal(w.p.status, "playing");
  // without a pre-signed URL: still no teardown while signing
  const w2 = world({ sign: (id) => ({ ok: true, data: { url: `https://s/${id}` } }) });
  const a2 = w2.audio as typeof w2.audio & { playInstant?: () => Promise<void> };
  const log2: string[] = [];
  a2.load = () => { log2.push("load"); };
  const p2 = a2.pause.bind(a2);
  a2.pause = () => { log2.push("pause"); p2(); };
  a2.playInstant = async () => { log2.push("playInstant:" + a2.src); a2.paused = false; };
  await w2.p.toggle();
  await w2.p.applyManifest([item(1), item(3), item(2)]); // next target changes, pre-sign misses
  await flush();
  log2.length = 0;
  await w2.p.onEnded();
  assert.ok(!log2.includes("pause") && !log2.includes("load"), log2.join(","));
  assert.ok(log2.some((x) => x.startsWith("playInstant:")), log2.join(","));
}

// 9c. A pre-sign starts the next track at once, then access is re-checked in the background;
//     a no_access answer stops it (the hall never plays on after access ends).
{
  let denied = false;
  const w = world({ sign: (id) => (denied ? { ok: false, reason: "no_access" } : { ok: true, data: { url: `https://s/${id}` } }) });
  await w.p.toggle();
  await flush();
  assert.deepEqual(w.signs, ["track-1", "track-2"]);
  await w.p.onEnded();
  await flush();
  assert.equal(w.p.current?.audioItemId, "track-2");
  assert.deepEqual(w.signs, ["track-1", "track-2", "track-2", "track-3"], "re-check, then pre-sign ahead");
  w.tick(5 * 60_000);
  denied = true;
  await w.p.onEnded();
  await flush();
  assert.equal(w.p.status, "no_access", "background re-check stops on no_access");
  assert.equal(w.audio.paused, true);
}

// 10. Access ends while reconnecting: no_access wins, retries stop.
{
  let denied = false;
  const w = world({ sign: (id) => (denied ? { ok: false, reason: "no_access" } : { ok: true, data: { url: "u" + id } }) });
  await w.p.toggle();
  w.setNet(false);
  await w.p.onError();
  denied = true;
  w.setNet(true);
  await w.advance(1_000);
  assert.equal(w.p.status, "no_access");
  assert.equal(w.timers.length, 0);
  await w.p.onOnline();
  assert.equal(w.p.status, "no_access");
}

// 11. Pause while reconnecting: stays paused, no retry fires.
{
  const w = world();
  await w.p.toggle();
  w.setNet(false);
  await w.p.onError();
  await w.p.toggle();
  assert.equal(w.p.status, "paused");
  assert.equal(w.timers.length, 0);
  w.setNet(true);
  await w.p.onOnline();
  assert.equal(w.p.status, "paused", "online does not override a staff pause");
}

// 12. A broken file (errors while online) is skipped after a few tries; offline errors never skip.
{
  const w = world();
  await w.p.toggle();
  for (let k = 0; k < 3; k++) {
    await w.p.onError();
    await w.advance(w.timers[0]?.ms ?? 0);
    assert.equal(w.p.current?.audioItemId, "track-1");
  }
  await w.p.onError();
  await flush();
  assert.equal(w.p.current?.audioItemId, "track-2", "skipped after repeated online errors");
  assert.equal(w.p.status, "playing");

  const off = world();
  await off.p.toggle();
  off.setNet(false);
  for (let k = 0; k < 6; k++) {
    await off.p.onError();
    await off.advance(off.timers[0]?.ms ?? 0);
  }
  assert.equal(off.p.current?.audioItemId, "track-1", "offline: keep the same track");
}

// 13. A sign request that throws (timeout/abort) is a network failure, not a dead stop.
{
  let fail = true;
  const w = world({ sign: () => { if (fail) throw new Error("aborted"); return { ok: true, data: { url: "u" } }; } });
  await w.p.toggle();
  assert.equal(w.p.recovering, true);
  fail = false;
  await w.advance(1_000);
  assert.equal(w.p.status, "playing");
}

// 14. Wiring: the cabinet provider feeds the recovery hooks; one green «Включить музыку» button.
{
  const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  const provider = read("src/components/business-app/workspace/BusinessCabinetPlayer.tsx");
  assert.match(provider, /addEventListener\("waiting", onWaiting\)/);
  assert.match(provider, /addEventListener\("stalled", onWaiting\)/);
  assert.match(provider, /window\.addEventListener\("online", onOnline\)/);
  assert.match(provider, /ctl\.onProgress\(audio\.currentTime, audio\.duration\)/);
  assert.match(provider, /signal: abort\.signal/);
  assert.match(provider, /preload="auto"/);
  assert.match(provider, /ctaLabel=\{(?:view|shownView)\.needsGesture \? ENABLE_MUSIC_LABEL : null\}/);
  assert.match(provider, /export const ENABLE_MUSIC_LABEL = "Включить музыку";/);
  const bar = read("src/components/business-app/workspace/BusinessCabinetMiniBar.tsx");
  assert.match(bar, /business-app-btn-cta[^"]*business-cabinet-player__cta/);
  const hall = read("src/components/business-app/PointDeviceControls.tsx");
  assert.match(hall, /needsGesture \? \(/);
  assert.match(hall, /business-app-btn business-app-btn-cta[^"]*"\s+data-testid="biz-point-enable-music"/);
  // No offline caching is claimed or added by the recovery work.
  for (const src of [provider, bar, hall, read("src/lib/business-app/spa-online-player.ts")]) {
    assert.doesNotMatch(src, /caches\.open|indexedDB|офлайн|без интернета/i);
  }
}

// 15. Server answers but cannot sign the file: a few retries, then the next track. Any other
//     non-network refusal (space off, audio replaced) is a visible error, not "reconnecting".
{
  const w = world({ sign: (id) => (id === "track-1" ? { ok: false, reason: "sign_failed" } : { ok: true, data: { url: `https://s/${id}` } }) });
  await w.p.toggle();
  assert.equal(w.p.recovering, true, "sign_failed is retried first");
  for (let k = 0; k < 3; k++) await w.advance(w.timers[0]?.ms ?? 0);
  assert.equal(w.p.current?.audioItemId, "track-2", "missing file skipped after a few tries");
  assert.equal(w.p.status, "playing");

  const single = world({ items: [item(1)], sign: () => ({ ok: false, reason: "sign_failed" }) });
  await single.p.toggle();
  for (let k = 0; k < 6; k++) await single.advance(single.timers[0]?.ms ?? 0);
  assert.equal(single.p.recovering, true, "one-track hall keeps retrying, never a dead stop");

  for (const reason of ["guest_unavailable", "audio_replaced_reload", "forbidden"]) {
    const off = world({ sign: () => ({ ok: false, reason }) });
    await off.p.toggle();
    assert.equal(off.p.status, "error", `${reason}: visible error`);
    assert.equal(off.p.recovering, false, `${reason}: no reconnect loop`);
    assert.notEqual(off.p.message, RECONNECTING_MESSAGE);
    assert.equal(off.timers.length, 0);
  }
}

// 16. Healthy playback forgives earlier errors: separate drops on a long track never skip it.
{
  const w = world();
  await w.p.toggle();
  let pos = 0;
  for (let k = 0; k < 6; k++) {
    await w.p.onError(); // a short drop while online
    await w.advance(w.timers[0]?.ms ?? 0);
    assert.equal(w.p.current?.audioItemId, "track-1", `drop ${k + 1}: same track`);
    assert.equal(w.p.status, "playing");
    pos += 40; // then 40 s of healthy playback
    w.audio.currentTime = pos;
    w.p.onProgress(pos, 900);
  }
}

// 17. /spa pilot page (no green CTA there) keeps a hint on an autoplay refusal.
{
  const spa = readFileSync(new URL("../src/components/business-app/SpaOnlinePlayer.tsx", import.meta.url), "utf8");
  assert.match(spa, /c\.needsGesture \? "Нажмите «Играть», чтобы продолжить\." : null/);
}

console.log("business spa player recovery: ok");
