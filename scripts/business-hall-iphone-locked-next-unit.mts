// t1303u (Sergey 09.11.2026): on a locked iPhone in the hall the track played to the end and
// the next one never started (Samsung moved on). Real SpaOnlinePlayer with a fake <audio>.
// The boundary on a locked screen must not wait for the network or a timer before src + play.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  EARLY_HANDOFF_SEC,
  SpaOnlinePlayer,
  type OnlineSignResult,
} from "../src/lib/business-app/spa-online-player";
import { lockedAppleScreen, syncPlayerMediaSession } from "../src/lib/business-app/hall-media-session";
import type { SpaManifestItem } from "../src/lib/business-app/spa-manifest";

const item = (n: number): SpaManifestItem => ({
  position: n, audioItemId: `track-${n}`, trackCode: null, title: `T${n}`, durationSeconds: null,
  gainDb: null, playableUntil: null, offlineAllowed: false, offlineCacheUntil: null,
});
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

function world(opts: { hidden?: boolean; order?: number[] } = {}) {
  let hidden = opts.hidden ?? false;
  let order: number[] | null = opts.order ?? null;
  const signs: string[] = [];
  /** When set, sign requests never answer (the locked page cannot reach the network in time). */
  let hang = false;
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
      return Promise.resolve({ ok: true, data: { url: `https://s/${id}` } });
    },
    nextIndex: (cur, len) => {
      if (!order) return cur < 0 || cur >= len - 1 ? 0 : cur + 1;
      const pos = order.indexOf(cur);
      return order[(pos + 1) % order.length] ?? 0;
    },
    backgroundAdvance: () => hidden,
    onChange() {},
  }, [item(1), item(2), item(3), item(4)]);
  return {
    p, audio, signs, log,
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

// 4. Hidden page, the queue changed after the pre-sign (sound rebuild, «Больше / Меньше»), the
//    network does not answer: "ended" still starts at once with the ready track, never awaits.
{
  const w = world({ hidden: true, order: [0, 1, 2, 3] });
  await w.p.toggle();
  await flush();
  assert.equal(w.signs.at(-1), "track-2");
  w.setHang(true);
  w.setOrder([0, 3, 1, 2]); // the rebuild put track-4 next; its sign cannot finish now
  w.p.queueChanged();
  assert.equal(w.signs.at(-1), "track-4", "queue change pre-signs the new next at once");
  w.log.length = 0;
  w.audio.paused = true;
  void w.p.onEnded();
  assert.deepEqual(w.log, ["playInstant:https://s/track-2"], "the ready track starts, no wait for the network");
  // visible page: the queue order wins (Android / desktop keep the exact order)
  const v = world({ hidden: false, order: [0, 1, 2, 3] });
  await v.p.toggle();
  await flush();
  v.setOrder([0, 3, 1, 2]);
  await v.p.onEnded();
  assert.equal(v.p.current?.audioItemId, "track-4", "visible: exact next track of the new queue");
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

// 7. Wiring in the cabinet player.
{
  const provider = readFileSync(new URL("../src/components/business-app/workspace/BusinessCabinetPlayer.tsx", import.meta.url), "utf8");
  assert.match(provider, /backgroundAdvance: \(\) => lockedAppleScreen\(document, navigator\)/);
  assert.equal(provider.match(/ctl\?\.queueChanged\(\)/g)?.length, 3, "every queue change pre-signs the next track");
  assert.match(provider, /syncPlayerMediaSession\(\s*navigator\.mediaSession/);
  assert.match(provider, /const onEnded = \(\) => void ctl\.onEnded\(\);/, "ended handler stays synchronous");
}

console.log("business hall iphone locked next: ok");
