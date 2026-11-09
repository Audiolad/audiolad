// t1314u (Sergey 09.11.2026): iPhone hall device opened from the home-screen icon, screen locked:
// the track played to the end and the music stayed paused (#1192 did not help). WebKit closes the
// audio session on a natural end and a home-screen app cannot reopen it in the background
// (WebKit bug 261858). Loop mode: the element never ends; every switch happens while it plays.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  EARLY_HANDOFF_SEC,
  SpaOnlinePlayer,
  type OnlineSignResult,
} from "../src/lib/business-app/spa-online-player";
import { prepareLoopAudio } from "../src/lib/business-app/hall-loop-audio";
import { syncPlayerMediaSession } from "../src/lib/business-app/hall-media-session";
import type { SpaManifestItem } from "../src/lib/business-app/spa-manifest";

const item = (n: number, durationSeconds: number | null = null): SpaManifestItem => ({
  position: n, audioItemId: `track-${n}`, trackCode: null, title: `T${n}`, durationSeconds,
  gainDb: null, playableUntil: null, offlineAllowed: false, offlineCacheUntil: null,
});
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

function world(opts: { hidden?: boolean; loop?: boolean; items?: SpaManifestItem[]; refuse?: boolean } = {}) {
  let hidden = opts.hidden ?? true;
  let clock = 1_000_000;
  let hang = false;
  let refuse = opts.refuse ?? false;
  const signs: string[] = [];
  const log: string[] = [];
  const held: ((r: OnlineSignResult) => void)[] = [];
  let hold = false;
  /** Queue override: index to play after `cur` (null: the next row). */
  let nextOverride: ((cur: number, len: number) => number) | null = null;
  const audio = {
    src: "",
    currentTime: 0,
    paused: true,
    loop: opts.loop ?? true,
    async play() {
      if (refuse) { log.push(`refused:${this.src}`); throw Object.assign(new Error("NotAllowedError"), { name: "NotAllowedError" }); }
      log.push(`play:${this.src}`); this.paused = false;
    },
    async playInstant() { return this.play(); },
    pause() { log.push("pause"); this.paused = true; },
    removeAttribute() { log.push("removeAttribute"); this.src = ""; },
    load() { log.push("load"); },
  };
  const p = new SpaOnlinePlayer({
    audio,
    now: () => clock,
    setTimer: () => ({}),
    clearTimer: () => {},
    sign: (id): Promise<OnlineSignResult> => {
      signs.push(id);
      if (hang) return new Promise(() => {});
      if (hold) return new Promise((resolve) => held.push(resolve));
      return Promise.resolve({ ok: true, data: { url: `https://s/${id}` } });
    },
    backgroundAdvance: () => hidden,
    loopAdvance: () => audio.loop,
    nextIndex: (cur, len) => (nextOverride ? nextOverride(cur, len) : (cur < 0 || cur >= len - 1 ? 0 : cur + 1)),
    onChange() {},
  }, opts.items ?? [item(1), item(2), item(3)]);
  return {
    p, audio, signs, log, held,
    tick(ms: number) { clock += ms; },
    setHidden(v: boolean) { hidden = v; },
    setHang(v: boolean) { hang = v; },
    setHold(v: boolean) { hold = v; },
    setRefuse(v: boolean) { refuse = v; },
    setNext(fn: ((cur: number, len: number) => number) | null) { nextOverride = fn; },
  };
}

/** Plays the current source from `from` to `to` in 0.25 s timeupdate steps. */
function playThrough(w: ReturnType<typeof world>, from: number, to: number, duration: number) {
  for (let t = from; t <= to + 1e-9; t += 0.25) {
    w.audio.currentTime = t;
    w.p.onProgress(t, duration);
  }
}

// 1. Loop wrap is the safety net: no timeupdate reached the last EARLY_HANDOFF_SEC (a sparse
//    background timeupdate), the element jumped back to 0:00 and fired "seeking" while still
//    playing. The next track starts in that event: pause (keeps the session) → src → play, with no
//    teardown, no network and no timer – even with a hanging network.
{
  const w = world();
  await w.p.toggle();
  await flush();
  assert.deepEqual(w.signs, ["track-1", "track-2"], "next track pre-signed while playing");
  playThrough(w, 0, 198, 200); // last timeupdate 2 s before the end: outside the handoff window
  w.setHang(true);
  w.log.length = 0;
  w.audio.currentTime = 0.05; // loop: jumped back, still playing
  const before = w.p.current?.audioItemId;
  w.p.onSeeking(0.05, 200);
  assert.equal(before, "track-1");
  assert.equal(w.audio.src, "https://s/track-2", "src switched inside the seeking event");
  assert.deepEqual(w.log, ["pause", "play:https://s/track-2"], "pause → src → play, no load / removeAttribute");
  await flush();
  assert.equal(w.p.current?.audioItemId, "track-2");
  assert.equal(w.p.status, "playing");
}

// 2. The same wrap seen only by timeupdate (no "seeking" event) also moves on, once.
{
  const w = world();
  await w.p.toggle();
  await flush();
  playThrough(w, 0, 198, 200);
  w.log.length = 0;
  w.p.onProgress(0.3, 200);
  w.p.onSeeking(0.3, 200); // a late seeking for the same wrap must not skip a second track
  assert.deepEqual(w.log, ["pause", "play:https://s/track-2"]);
  await flush();
  assert.equal(w.p.current?.audioItemId, "track-2");
}

// 3. Loop mode hands over before the end on a VISIBLE page too (an unlocked iPhone in loop mode
//    never gets "ended"), inside timeupdate, pausing first.
{
  const w = world({ hidden: false });
  await w.p.toggle();
  await flush();
  playThrough(w, 0, 199, 200);
  w.log.length = 0;
  w.p.onProgress(200 - EARLY_HANDOFF_SEC + 0.1, 200);
  assert.deepEqual(w.log, ["pause", "play:https://s/track-2"]);
  await flush();
  assert.equal(w.p.current?.audioItemId, "track-2");
}

// 4. No ready link at the wrap: the old track keeps sounding (the loop) and keeps its title, so
//    the session stays open and the screen never names a track that is not playing; the link is
//    signed now and the switch (pause → src → play) happens the moment it arrives.
{
  const w = world();
  await w.p.toggle();
  await flush();
  w.setHold(true);
  w.tick(31 * 60_000); // the ready link is stale now
  playThrough(w, 100, 198, 200);
  w.log.length = 0;
  w.p.onSeeking(0.1, 200);
  assert.deepEqual(w.log, [], "nothing torn down while signing: the loop keeps the old track sounding");
  assert.equal(w.audio.paused, false);
  assert.equal(w.p.current?.audioItemId, "track-1", "title stays on the track that really plays");
  assert.equal(w.p.status, "playing");
  w.p.onProgress(0.5, 200); // the old track keeps looping meanwhile: no second wrap, no switch
  assert.deepEqual(w.log, []);
  const resolve = w.held.at(-1);
  assert.ok(resolve, "the next track is signed at the wrap");
  resolve({ ok: true, data: { url: "https://s/track-2" } });
  await flush();
  assert.deepEqual(w.log, ["pause", "play:https://s/track-2"], "switch as soon as the link arrives, no second sign");
  assert.equal(w.p.current?.audioItemId, "track-2");
}

// 4b. The sign at the wrap fails: the boundary falls back to playIndex (signs again, handles
//     no_access / skip / reconnect as everywhere).
{
  const w = world();
  await w.p.toggle();
  await flush();
  w.setHold(true);
  w.tick(31 * 60_000);
  playThrough(w, 100, 198, 200);
  w.p.onSeeking(0.1, 200);
  const before = w.held.length;
  w.held.at(-1)?.({ ok: false, reason: "network" });
  await flush();
  assert.equal(w.held.length, before + 1, "playIndex signs again");
  w.held.at(-1)?.({ ok: true, data: { url: "https://s/track-2" } });
  await flush();
  assert.equal(w.p.current?.audioItemId, "track-2");
  assert.equal(w.p.status, "playing");
}

// 4c. Review F1: a VBR MP3 whose element reports 200 s while the audio (and the catalog) is
//     170 s: the wrap at 169.9 s → 0.1 s is measured against the shorter length and moves on.
{
  const w = world({ items: [item(1, 170), item(2, 170), item(3, 170)] });
  await w.p.toggle();
  await flush();
  playThrough(w, 100, 169.75, 200);
  w.audio.currentTime = 169.9;
  w.p.onProgress(169.9, 200);
  w.log.length = 0;
  w.p.onProgress(0.1, 200);
  assert.deepEqual(w.log, ["pause", "play:https://s/track-2"], "wrap with an over-reported element duration");
  await flush();
  assert.equal(w.p.current?.audioItemId, "track-2");
}

// 4d. F1 without a catalog length: the element over-reports (200 s, audio ends at 169.9 s) –
//     no end check at all, the wrap still moves on (never one track forever).
{
  const w = world();
  await w.p.toggle();
  await flush();
  playThrough(w, 100, 169.75, 200);
  w.log.length = 0;
  w.p.onProgress(0.1, 200);
  assert.deepEqual(w.log, ["pause", "play:https://s/track-2"]);
}

// 4e. Review F2: the first timeupdate after the wrap comes late (1.8 s): still a wrap.
{
  const w = world();
  await w.p.toggle();
  await flush();
  playThrough(w, 0, 198, 200); // sparse background timeupdates: none in the handoff window
  w.log.length = 0;
  w.p.onProgress(1.8, 200);
  assert.deepEqual(w.log, ["pause", "play:https://s/track-2"]);
}

// 4f. Review F6: a wrap waits for the next link, then the manifest shrinks to the current track
//     only (no distinct next): the wait is cleared, the track keeps looping. When the manifest
//     grows again, the next wrap moves on (never stuck on one track).
{
  const w = world();
  await w.p.toggle();
  await flush();
  w.setHold(true);
  w.tick(31 * 60_000);
  playThrough(w, 100, 198, 200);
  w.p.onSeeking(0.1, 200); // wrap → waits for the track-2 link
  const late = w.held.at(-1);
  await w.p.applyManifest([item(1)]);
  assert.equal(w.p.current?.audioItemId, "track-1");
  assert.equal(w.p.status, "playing");
  late?.({ ok: true, data: { url: "https://s/track-2" } }); // the old answer arrives late
  await flush();
  w.log.length = 0;
  playThrough(w, 0.25, 198, 200);
  w.p.onSeeking(0.1, 200); // one-track program: the loop itself
  assert.deepEqual(w.log, [], "no switch, no teardown while there is no next track");
  w.setHold(false);
  await w.p.applyManifest([item(1), item(2), item(3)]);
  playThrough(w, 0.25, 198, 200); // pre-signs track-2 again
  await flush();
  w.log.length = 0;
  w.p.onSeeking(0.1, 200);
  assert.deepEqual(w.log, ["pause", "play:https://s/track-2"], "after the queue grew the next wrap moves on");
  await flush();
  assert.equal(w.p.current?.audioItemId, "track-2");
}

// 4g. Review F6, queue order: while a wrap waits, «Меньше такой музыки» leaves no distinct next
//     track (queueChanged). The wait clears; once a next track is back, the queue moves on –
//     including by the early handoff, which must not stay blocked either.
{
  const w = world();
  await w.p.toggle();
  await flush();
  w.setHold(true);
  w.tick(31 * 60_000);
  playThrough(w, 100, 198, 200);
  w.p.onSeeking(0.1, 200);
  w.setNext((cur) => cur); // no distinct next
  w.p.queueChanged();
  for (const r of w.held.splice(0)) r({ ok: true, data: { url: "https://s/track-2" } });
  await flush();
  w.log.length = 0;
  playThrough(w, 0.25, 198, 200);
  w.p.onSeeking(0.1, 200);
  assert.deepEqual(w.log, [], "no next track: keeps looping");
  assert.equal(w.p.current?.audioItemId, "track-1");
  w.setHold(false);
  w.setNext(null);
  w.p.queueChanged(); // signs track-2 now
  await flush();
  playThrough(w, 0.25, 199, 200);
  w.log.length = 0;
  w.p.onProgress(200 - EARLY_HANDOFF_SEC + 0.1, 200);
  assert.deepEqual(w.log, ["pause", "play:https://s/track-2"], "early handoff works again");
  await flush();
  assert.equal(w.p.current?.audioItemId, "track-2");
}

// 4h. Review F6: the queue changes while a wrap waits and the NEW next track's link arrives:
//     the switch goes to the new next track, not the old one.
{
  const w = world();
  await w.p.toggle();
  await flush();
  w.setHold(true);
  w.tick(31 * 60_000);
  playThrough(w, 100, 198, 200);
  w.p.onSeeking(0.1, 200); // waits for track-2
  w.setNext(() => 2); // track-3 is next now
  w.p.queueChanged();
  const pending = w.held.splice(0);
  pending[0]?.({ ok: true, data: { url: "https://s/track-2" } }); // stale answer: ignored
  await flush();
  assert.equal(w.p.current?.audioItemId, "track-1", "stale link never plays");
  w.log.length = 0;
  pending[1]?.({ ok: true, data: { url: "https://s/track-3" } });
  await flush();
  assert.deepEqual(w.log, ["pause", "play:https://s/track-3"]);
  assert.equal(w.p.current?.audioItemId, "track-3");
}

// 5. Seeks made by the user (progress bar back to the start) or by the player are not a wrap.
{
  const w = world({ items: [item(1, 200), item(2, 200), item(3, 200)] });
  await w.p.toggle();
  await flush();
  playThrough(w, 0, 198, 200);
  w.log.length = 0;
  w.p.noteManualSeek();
  w.p.onSeeking(0, 200);
  w.p.onProgress(0.25, 200);
  assert.deepEqual(w.log, [], "manual seek to 0:00 replays the same track");
  assert.equal(w.p.current?.audioItemId, "track-1");
  // A manual seek to 4 s from near the end (inside the wider wrap landing zone) is not a wrap.
  w.tick(5_000);
  playThrough(w, 61, 198, 200);
  w.p.noteManualSeek();
  w.p.onProgress(4, 200);
  assert.deepEqual(w.log, [], "manual seek within LOOP_WRAP_TO_MAX_SEC replays, does not skip");
  assert.equal(w.p.current?.audioItemId, "track-1");
  // With a catalog length: an unmarked jump back from the middle is not a wrap either.
  w.tick(5_000);
  playThrough(w, 0.5, 60, 200);
  w.p.onSeeking(0.2, 200);
  assert.deepEqual(w.log, []);
  assert.equal(w.p.current?.audioItemId, "track-1");
}

// 6. Many tracks in a row with a locked screen, only via wraps: 1→2→3→1→2, never torn down,
//    "ended" never needed.
{
  const w = world();
  await w.p.toggle();
  await flush();
  w.log.length = 0;
  for (let k = 0; k < 4; k++) {
    playThrough(w, 0, 198, 200);
    w.p.onSeeking(0.05, 200);
    await flush();
  }
  assert.equal(w.p.current?.audioItemId, "track-2");
  assert.ok(!w.log.includes("load") && !w.log.includes("removeAttribute"), "element never torn down");
}

// 7. One-track program: the loop is the program loop, nothing switches.
{
  const w = world({ items: [item(1)] });
  await w.p.toggle();
  await flush();
  playThrough(w, 0, 198, 200);
  w.log.length = 0;
  w.p.onSeeking(0.05, 200);
  assert.deepEqual(w.log, []);
  assert.equal(w.p.status, "playing");
}

// 8. Without loop mode (Android, desktop) nothing changes: no pause before src, "ended" moves on.
{
  const w = world({ loop: false, hidden: false });
  await w.p.toggle();
  await flush();
  playThrough(w, 0, 199.75, 200);
  w.log.length = 0;
  w.p.onSeeking(0.05, 200);
  assert.deepEqual(w.log, [], "no wrap handling without loop");
  w.audio.paused = true;
  void w.p.onEnded();
  assert.deepEqual(w.log, ["play:https://s/track-2"], "ended: src + play, no pause");
}

// 9. play() refused while the screen was locked: retried once when the page is visible again.
{
  const w = world();
  await w.p.toggle();
  await flush();
  playThrough(w, 0, 198, 200);
  w.setRefuse(true);
  w.p.onSeeking(0.05, 200);
  await flush();
  assert.equal(w.p.needsGesture, true);
  assert.equal(w.p.status, "paused");
  w.setRefuse(false);
  w.setHidden(false);
  await w.p.onForeground();
  assert.equal(w.p.status, "playing", "resumed without a tap");
  assert.equal(w.p.current?.audioItemId, "track-2");
  // a refusal on a visible page still waits for the tap
  const v = world({ hidden: false, refuse: true });
  await v.p.toggle();
  await flush();
  assert.equal(v.p.needsGesture, true);
  v.setRefuse(false);
  await v.p.onForeground();
  assert.equal(v.p.status, "paused");
}

// 10. prepareLoopAudio: loop + audio session "playback" only on Apple touch devices.
{
  const iphone = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5, audioSession: { type: "auto" } };
  const ipad = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 5 };
  const samsung = { userAgent: "Mozilla/5.0 (Linux; Android 14; SM-S918B)", platform: "Linux armv8l", maxTouchPoints: 5 };
  const a = { loop: false };
  assert.equal(prepareLoopAudio(a, iphone), true);
  assert.equal(a.loop, true);
  assert.equal(iphone.audioSession.type, "playback");
  const b = { loop: false };
  assert.equal(prepareLoopAudio(b, ipad), true, "iPadOS reporting a Mac");
  const c = { loop: false };
  assert.equal(prepareLoopAudio(c, samsung), false);
  assert.equal(c.loop, false, "Android unchanged");
}

// 11. Lock screen: «next» instead of ±10 s.
{
  const handlers = new Map<string, (() => void) | null>();
  const ms = { metadata: null as unknown, playbackState: "none", setActionHandler: (x: string, h: (() => void) | null) => { handlers.set(x, h); } };
  syncPlayerMediaSession(ms, { title: "T", artist: "", artwork: null, playing: true, canNext: true }, () => {}, (i) => i);
  assert.equal(handlers.get("seekforward"), null);
  assert.equal(handlers.get("seekbackward"), null);
  assert.equal(typeof handlers.get("nexttrack"), "function");
}

// 12. The cabinet player wires loop mode, "seeking", manual seeks and the foreground retry.
{
  const provider = readFileSync(new URL("../src/components/business-app/workspace/BusinessCabinetPlayer.tsx", import.meta.url), "utf8");
  assert.match(provider, /const loopMode = prepareLoopAudio\(audio, navigator\);/);
  assert.match(provider, /loopAdvance: \(\) => loopMode && audio\.loop === true/);
  assert.match(provider, /audio\.addEventListener\("seeking", onSeeking\)/);
  assert.equal(provider.match(/ctlRef\.current\?\.noteManualSeek\(\)/g)?.length, 2, "both local seeks are marked");
  assert.match(provider, /void ctl\.onForeground\(\);/);
}

console.log("business hall iphone loop advance: ok");
