// t1303u (Sergey 09.11.2026): on a locked iPhone in the hall the track played to the end and
// the next one never started (Samsung moved on). Real SpaOnlinePlayer with a fake <audio>.
// The boundary on a locked screen must not wait for the network or a timer before src + play.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { cafeQueueNextIndex } from "../src/lib/business-app/cafe-queue/order";
import { pointKeepCurrentOrder } from "../src/lib/business-app/point-sound";

import {
  EARLY_HANDOFF_SEC,
  SpaOnlinePlayer,
  type OnlineSignResult,
} from "../src/lib/business-app/spa-online-player";
import { lockedAppleScreen, playerSessionState, runSessionAction, syncPlayerMediaSession } from "../src/lib/business-app/hall-media-session";
import type { SpaManifestItem } from "../src/lib/business-app/spa-manifest";

const item = (n: number): SpaManifestItem => ({
  position: n, audioItemId: `track-${n}`, trackCode: null, title: `T${n}`, durationSeconds: null,
  gainDb: null, playableUntil: null, offlineAllowed: false, offlineCacheUntil: null,
});
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

function world(opts: { hidden?: boolean; order?: number[]; items?: SpaManifestItem[]; realQueue?: boolean } = {}) {
  let hidden = opts.hidden ?? false;
  let order: number[] | null = opts.order ?? null;
  const signs: string[] = [];
  /** When set, sign requests never answer (the locked page cannot reach the network in time). */
  let hang = false;
  /** Manual sign answers (tests that control the order in which answers arrive). */
  const held: { id: string; resolve: (r: OnlineSignResult) => void }[] = [];
  let hold = false;
  const log: string[] = [];
  const timers: unknown[] = [];
  const audio = {
    src: "",
    currentTime: 0,
    paused: true,
    async play() { log.push(`play:${this.src}`); this.paused = false; },
    async playInstant() { log.push(`playInstant:${this.src}`); this.paused = false; },
    pause() { log.push("pause"); this.paused = true; },
    removeAttribute() { log.push("removeAttribute"); this.src = ""; },
    load() { log.push("load"); },
  };
  const p = new SpaOnlinePlayer({
    audio,
    now: () => 1_000_000,
    setTimer: (fn, ms) => { const h = { fn, ms }; timers.push(h); return h; },
    clearTimer: (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); },
    sign: (id): Promise<OnlineSignResult> => {
      signs.push(id);
      if (hang) return new Promise(() => {});
      if (hold) return new Promise((resolve) => held.push({ id, resolve }));
      return Promise.resolve({ ok: true, data: { url: `https://s/${id}` } });
    },
    nextIndex: (cur, len) => {
      if (opts.realQueue) return cafeQueueNextIndex(order, cur, len);
      if (!order) return cur < 0 || cur >= len - 1 ? 0 : cur + 1;
      const pos = order.indexOf(cur);
      return order[(pos + 1) % order.length] ?? 0;
    },
    backgroundAdvance: () => hidden,
    onChange() {},
  }, opts.items ?? [item(1), item(2), item(3), item(4)]);
  return {
    p, audio, signs, log, held,
    setHold(v: boolean) { hold = v; },
    setHidden(v: boolean) { hidden = v; },
    setOrder(v: number[]) { order = v; },
    setHang(v: boolean) { hang = v; },
  };
}

// 1. "ended" with a ready pre-sign: src and play are set synchronously in the event, before any
//    await; a hanging network (background re-check) never delays them.
{
  const w = world({ hidden: true });
  await w.p.toggle();
  await flush();
  assert.deepEqual(w.signs, ["track-1", "track-2"], "next track pre-signed while playing");
  w.setHang(true);
  w.log.length = 0;
  w.audio.paused = true; // the element ended by itself
  const pending = w.p.onEnded(); // not awaited: the event handler returns here
  assert.equal(w.audio.src, "https://s/track-2", "src switched inside the event");
  assert.deepEqual(w.log, ["playInstant:https://s/track-2"], "play called inside the event, no teardown");
  await pending;
  await flush();
  assert.equal(w.p.status, "playing");
  assert.equal(w.p.current?.audioItemId, "track-2");
}

// 2. Locked iPhone: the next track takes over in the last EARLY_HANDOFF_SEC while the element
//    still plays (no silent gap after "ended"), synchronously inside the timeupdate.
{
  const w = world({ hidden: true });
  await w.p.toggle();
  await flush();
  w.audio.currentTime = 100;
  w.p.onProgress(100, 200);
  w.log.length = 0;
  w.p.onProgress(199, 200); // 1 s left: still too early
  assert.deepEqual(w.log, [], "no handoff before the window");
  w.setHang(true);
  w.p.onProgress(200 - EARLY_HANDOFF_SEC + 0.1, 200);
  assert.deepEqual(w.log, ["playInstant:https://s/track-2"], "handoff in the window, no pause / load");
  assert.equal(w.audio.paused, false, "never paused in between");
  await flush();
  assert.equal(w.p.current?.audioItemId, "track-2");
  assert.equal(w.p.status, "playing");
  // later progress of the new track never hands over again right away
  w.log.length = 0;
  w.p.onProgress(1, 200);
  w.p.onProgress(2, 200);
  assert.deepEqual(w.log, []);
}

// 3. Visible page (Android, desktop, unlocked iPhone): no early handoff, the track plays to its
//    real end and "ended" moves on as before.
{
  const w = world({ hidden: false });
  await w.p.toggle();
  await flush();
  w.log.length = 0;
  w.p.onProgress(199.8, 200);
  assert.deepEqual(w.log, [], "visible: no early switch, the original ending stays");
  await w.p.onEnded();
  assert.equal(w.p.current?.audioItemId, "track-2");
}

// 4. «Меньше такой музыки» removes the pre-signed next track while the current one stays
//    (review of 2f59dab1): the removed track never plays, nothing repeats, and a link signed
//    for another track never stands in for the queue's own next track.
{
  // Real hall queue helpers: 1→2→3→4→5, track-2 pre-signed as next.
  const items = [item(1), item(2), item(3), item(4), item(5)];
  const w = world({ hidden: true, items, order: [0, 1, 2, 3, 4], realQueue: true });
  await w.p.toggle();
  await flush();
  assert.equal(w.signs.at(-1), "track-2", "track-2 pre-signed");
  w.setHang(true); // the sign of the new next track does not come back in time
  w.setOrder(pointKeepCurrentOrder([2, 3, 4], 0)); // staff vote: track-2 removed, track-1 kept
  w.p.queueChanged();
  assert.equal(w.signs.at(-1), "track-3", "queue change pre-signs the new next track at once");
  // no early handoff to the removed track, even in the last second
  w.log.length = 0;
  w.audio.currentTime = 199.5;
  w.p.onProgress(199.5, 200);
  assert.deepEqual(w.log, [], "the stale link of the removed track is not used");
  // "ended" goes the normal way: the queue's own next track (track-3), never track-2
  w.setHang(false);
  w.audio.paused = true;
  await w.p.onEnded();
  await flush();
  assert.equal(w.p.current?.audioItemId, "track-3", "the queue's next track, not the removed one");
  assert.ok(!(w.log as string[]).some((x) => x.includes("track-2")), w.log.join(","));
  // and on from there, in queue order with no repeat of track-1
  const played = [w.p.current?.audioItemId];
  for (let k = 0; k < 3; k++) {
    w.audio.paused = true;
    await w.p.onEnded();
    await flush();
    played.push(w.p.current?.audioItemId);
  }
  assert.deepEqual(played, ["track-3", "track-4", "track-5", "track-1"], "queue order, track-2 never plays");
}

// 4b. The queue changed while the old next track was still signing: its late answer must not
//     replace the ready link of the new next track.
{
  const w = world({ hidden: true, order: [0, 1, 2, 3], realQueue: true });
  w.setHold(true);
  const started = w.p.toggle();
  w.held.shift()?.resolve({ ok: true, data: { url: "https://s/track-1" } });
  await started;
  await flush();
  const old = w.held.shift(); // pre-sign of track-2 in flight
  assert.equal(old?.id, "track-2");
  w.setOrder([0, 3, 1, 2]);
  w.p.queueChanged();
  const fresh = w.held.shift();
  assert.equal(fresh?.id, "track-4");
  fresh?.resolve({ ok: true, data: { url: "https://s/track-4" } });
  await flush();
  old?.resolve({ ok: true, data: { url: "https://s/track-2" } }); // the late, stale answer
  await flush();
  w.log.length = 0;
  w.audio.paused = true;
  void w.p.onEnded();
  assert.deepEqual(w.log, ["playInstant:https://s/track-4"], "ready link of the new next track used in the event");
}

// 4c. A misjudged element duration (VBR MP3) never cuts a track early: with a catalog length
//     the element duration has to agree with it; "ended" stays the path otherwise.
{
  const long = (n: number): SpaManifestItem => ({ ...item(n), durationSeconds: 240 });
  const w = world({ hidden: true, items: [long(1), long(2), long(3)] });
  await w.p.toggle();
  await flush();
  w.log.length = 0;
  w.p.onProgress(199.6, 200); // the element says 200 s, the catalog 240 s
  assert.deepEqual(w.log, [], "no early switch on a wrong duration");
  w.p.onProgress(239.6, 240);
  assert.deepEqual(w.log, ["playInstant:https://s/track-2"], "agreeing duration: early switch");
}

// 5. Background never stops the advance: many tracks in a row on a hidden page.
{
  const w = world({ hidden: true });
  await w.p.toggle();
  await flush();
  w.log.length = 0;
  for (let k = 0; k < 6; k++) {
    w.audio.currentTime = 150;
    w.p.onProgress(150, 180);
    w.p.onProgress(179.5, 180);
    await flush();
  }
  assert.equal(w.p.status, "playing");
  assert.equal(w.p.current?.audioItemId, "track-3", "six handoffs: 1→2→3→4→1→2→3");
  assert.ok(!w.log.includes("load") && !w.log.includes("removeAttribute"), "element never torn down");
}

// 6. Locked-screen predicate and lock screen session.
{
  const iphone = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 };
  const samsung = { userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S918B)", platform: "Linux armv8l", maxTouchPoints: 5 };
  assert.equal(lockedAppleScreen({ visibilityState: "hidden" }, iphone), true);
  assert.equal(lockedAppleScreen({ visibilityState: "visible" }, iphone), false);
  assert.equal(lockedAppleScreen({ visibilityState: "hidden" }, samsung), false, "Android unchanged");
  const handlers = new Map<string, (() => void) | null>();
  const ms = { metadata: null as unknown, playbackState: "none", setActionHandler: (a: string, h: (() => void) | null) => { handlers.set(a, h); } };
  const ran: string[] = [];
  syncPlayerMediaSession(ms, { title: "T", artist: "A", artwork: null, playing: true, canNext: true }, (a) => ran.push(a), (init) => init);
  assert.deepEqual(ms.metadata, { title: "T", artist: "A", artwork: [] });
  assert.equal(ms.playbackState, "playing");
  handlers.get("nexttrack")?.();
  handlers.get("pause")?.();
  assert.deepEqual(ran, ["nexttrack", "pause"]);
  syncPlayerMediaSession(ms, { title: "T", artist: "", artwork: null, playing: false, canNext: false }, () => {}, (init) => init);
  assert.equal(handlers.get("nexttrack"), null, "no next on the lock screen when the owner forbids changes");
  syncPlayerMediaSession(ms, null, () => {}, () => null);
  assert.equal(ms.metadata, null);
  assert.equal(handlers.get("play"), null);
  // a throwing browser API changes nothing
  syncPlayerMediaSession({ metadata: null, setActionHandler: () => { throw new Error("x"); } }, { title: "T", artist: "", artwork: null, playing: true, canNext: true }, () => {}, (i) => i);
}

// 7. Lock screen state of the cabinet player (playerSessionState / runSessionAction, used by
//    BusinessCabinetPlayerProvider as is).
{
  const track = { title: "Утро", authorName: " Автор " };
  const base = { open: true, mirror: false, track, artwork: "/c.jpg", status: "playing", pointDevice: true, pointCanEdit: true };
  assert.deepEqual(playerSessionState(base), { title: "Утро", artist: "Автор", artwork: "/c.jpg", playing: true, canNext: true });
  assert.equal(playerSessionState({ ...base, pointCanEdit: false })?.canNext, false, "hall without the owner's permission: no next");
  assert.equal(playerSessionState({ ...base, pointDevice: false, pointCanEdit: false })?.canNext, true, "owner: next");
  assert.equal(playerSessionState({ ...base, mirror: true }), null, "owner mirror: session cleared");
  assert.equal(playerSessionState({ ...base, open: false }), null);
  assert.equal(playerSessionState({ ...base, track: null }), null);
  assert.equal(playerSessionState({ ...base, status: "paused" })?.playing, false);
  const calls: string[] = [];
  const player = { toggle: () => calls.push("toggle"), next: () => calls.push("next") };
  runSessionAction("play", "playing", player);
  runSessionAction("pause", "paused", player);
  assert.deepEqual(calls, [], "play while playing / pause while paused: nothing");
  runSessionAction("pause", "playing", player);
  runSessionAction("play", "paused", player);
  runSessionAction("nexttrack", "playing", player);
  assert.deepEqual(calls, ["toggle", "toggle", "next"]);
  // the provider uses exactly these helpers and the synchronous ended handler
  const provider = readFileSync(new URL("../src/components/business-app/workspace/BusinessCabinetPlayer.tsx", import.meta.url), "utf8");
  assert.match(provider, /backgroundAdvance: \(\) => lockedAppleScreen\(document, navigator\)/);
  assert.match(provider, /playerSessionState\(\{/);
  assert.equal(provider.match(/ctl\?\.queueChanged\(\)/g)?.length, 3, "every queue change re-signs the next track");
  assert.match(provider, /const onEnded = \(\) => void ctl\.onEnded\(\);/);
}

console.log("business hall iphone locked next: ok");
