// Business player fade-in / fade-out (Sergey 2026-11-03): pure fade logic + controller wiring.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  FadingAudio,
  PLAYER_FADE_MS,
  PLAYER_SKIP_FADE_OUT_MS,
  mediaVolumeWritable,
  playerFadeGain,
} from "../src/lib/business-app/player-fade";
import { SpaOnlinePlayer } from "../src/lib/business-app/spa-online-player";
import type { SpaManifestItem } from "../src/lib/business-app/spa-manifest";

type Media = {
  src: string;
  currentTime: number;
  volume: number;
  paused: boolean;
  events: { kind: string; volume: number; src: string }[];
  plays: number;
  pauses: number;
  readOnlyVolume?: boolean;
  failPlay?: boolean;
  play(): Promise<void>;
  pause(): void;
  removeAttribute(name: "src"): void;
  load(): void;
};

function media(opts: { readOnlyVolume?: boolean } = {}): Media {
  let vol = 1;
  let src = "";
  const m: Media = {
    get src() { return src; },
    set src(value: string) { src = value; m.events.push({ kind: "src", volume: vol, src }); },
    events: [],
    currentTime: 0,
    get volume() { return vol; },
    set volume(v: number) {
      if (m.readOnlyVolume) return;
      if (v < 0 || v > 1) throw new RangeError("volume out of range");
      vol = v;
    },
    paused: true,
    plays: 0,
    pauses: 0,
    readOnlyVolume: opts.readOnlyVolume,
    async play() {
      m.plays++;
      if (m.failPlay) throw new Error("NotAllowedError");
      m.paused = false;
    },
    pause() { m.events.push({ kind: "pause", volume: vol, src }); m.pauses++; m.paused = true; },
    removeAttribute() { m.src = ""; },
    load() { m.events.push({ kind: "load", volume: vol, src }); },
  };
  return m;
}

function clock() {
  let t = 1_000;
  let fn: (() => void) | null = null;
  let active = 0;
  const timeouts: { at: number; fn: () => void; live: boolean }[] = [];
  return {
    now: () => t,
    setTimer: (fn: () => void, ms: number) => { const timer = { at: t + ms, fn, live: true }; timeouts.push(timer); return timer; },
    clearTimer: (timer: unknown) => { (timer as { live: boolean }).live = false; },
    setInterval: (f: () => void) => { fn = f; active++; return active; },
    clearInterval: () => { fn = null; },
    /** Advance wall time in ticks of `step` ms. */
    advance(ms: number, step = 40) {
      for (let done = 0; done < ms; done += step) {
        t += Math.min(step, ms - done);
        fn?.();
        for (const timer of timeouts) if (timer.live && timer.at <= t) { timer.live = false; timer.fn(); }
      }
    },
    get running() { return fn !== null; },
  };
}

function rig(opts: { readOnlyVolume?: boolean; enabled?: boolean | null } = {}) {
  const m = media(opts);
  const c = clock();
  const f = new FadingAudio(m, { now: c.now, setInterval: c.setInterval, clearInterval: c.clearInterval, enabled: opts.enabled ?? null });
  return { m, c, f };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

const near = (a: number, b: number, eps = 0.02) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

// One constant, about two seconds.
assert.equal(PLAYER_FADE_MS, 2000);
assert.equal(playerFadeGain(0), 0);
assert.equal(playerFadeGain(1), 1);
near(playerFadeGain(0.5), 0.25);
assert.equal(playerFadeGain(Number.NaN), 1);

// Volume probe: writable on desktop / Android, read-only on iOS.
assert.equal(mediaVolumeWritable(media()), true);
assert.equal(mediaVolumeWritable(media({ readOnlyVolume: true })), false);
{
  const m = media();
  m.volume = 0.6;
  mediaVolumeWritable(m);
  near(m.volume, 0.6, 1e-9);
}

// 1. Fade-in: from 0 to the chosen volume over PLAYER_FADE_MS, monotonic.
{
  const { m, c, f } = rig();
  assert.equal(f.enabled, true);
  f.setVolume(0.8);
  const p = f.play();
  assert.equal(m.volume, 0, "starts silent");
  await p;
  assert.equal(m.paused, false);
  let prev = 0;
  for (let i = 0; i < 50; i++) {
    c.advance(40);
    assert.ok(m.volume >= prev - 1e-9, "fade-in never steps down");
    prev = m.volume;
  }
  near(m.volume, 0.8, 1e-9);
  assert.equal(c.running, false, "timer stops at full volume");
}

// 2. Halfway through the fade-in the gain follows the curve.
{
  const { m, c, f } = rig();
  f.setVolume(1);
  await f.play();
  c.advance(PLAYER_FADE_MS / 2);
  near(m.volume, 0.25);
}

// 3. Fade-out: keeps sounding ~2 s, then really pauses and restores the volume.
{
  const { m, c, f } = rig();
  f.setVolume(0.7);
  await f.play();
  c.advance(PLAYER_FADE_MS + 100);
  near(m.volume, 0.7, 1e-9);
  let finished: boolean | null = null;
  void f.fadeOut().then((v) => { finished = v; });
  assert.equal(m.paused, false, "still sounding right after pause");
  assert.equal(f.fadingOut, true);
  c.advance(1000);
  assert.equal(m.paused, false, "still sounding after 1 s");
  assert.ok(m.volume > 0 && m.volume < 0.7);
  c.advance(1100);
  await Promise.resolve();
  assert.equal(m.paused, true, "paused after the fade");
  assert.equal(finished, true);
  near(m.volume, 0.7, 1e-9);
  assert.equal(f.fadingOut, false);
}

// 4. Rapid toggle: pause during the fade-in reverses from the current level (no jump up).
{
  const { m, c, f } = rig();
  await f.play();
  c.advance(800);
  const at = m.volume;
  void f.fadeOut();
  c.advance(40);
  assert.ok(m.volume < at, "turns down at once");
  c.advance(800);
  assert.equal(m.paused, true, "a short fade-in needs only a short fade-out");
  near(m.volume, 1, 1e-9);
}

// 5. Rapid toggle: play during the fade-out rises from where it is, no restart, no pause.
{
  const { m, c, f } = rig();
  f.setVolume(0.5);
  await f.play();
  c.advance(PLAYER_FADE_MS);
  let finished: boolean | null = null;
  void f.fadeOut().then((v) => { finished = v; });
  c.advance(1000);
  const low = m.volume;
  assert.ok(low > 0 && low < 0.5);
  const pausesBefore = m.pauses;
  await f.play();
  assert.equal(finished, false, "the pending fade-out is cancelled");
  assert.equal(m.pauses, pausesBefore, "element never paused");
  near(m.volume, low, 1e-9);
  c.advance(PLAYER_FADE_MS);
  near(m.volume, 0.5, 1e-9);
  assert.equal(m.paused, false);
}

// 6. Many toggles in a row never leave the volume at 0.
{
  const { m, c, f } = rig();
  f.setVolume(0.9);
  for (let i = 0; i < 10; i++) {
    await f.play();
    c.advance(120);
    void f.fadeOut();
    c.advance(80);
  }
  await f.play();
  c.advance(PLAYER_FADE_MS);
  near(m.volume, 0.9, 1e-9);
  void f.fadeOut();
  c.advance(PLAYER_FADE_MS + 100);
  assert.equal(m.paused, true);
  near(m.volume, 0.9, 1e-9);
}

// 7. pause() is a hard stop (track switch / rights deadline) and restores the volume.
{
  const { m, c, f } = rig();
  f.setVolume(0.6);
  await f.play();
  c.advance(500);
  let finished: boolean | null = null;
  void f.fadeOut().then((v) => { finished = v; });
  f.pause();
  await Promise.resolve();
  assert.equal(m.paused, true);
  assert.equal(finished, false);
  near(m.volume, 0.6, 1e-9);
  assert.equal(c.running, false);
}

// 8. A refused play (autoplay policy) does not leave the element silent.
{
  const { m, f } = rig();
  f.setVolume(0.4);
  m.failPlay = true;
  await assert.rejects(f.play());
  near(m.volume, 0.4, 1e-9);
}

// 9. Volume change during a fade keeps the curve and lands on the new volume.
{
  const { m, c, f } = rig();
  f.setVolume(1);
  await f.play();
  c.advance(1000);
  f.setVolume(0.5);
  near(m.volume, 0.5 * 0.25);
  c.advance(PLAYER_FADE_MS);
  near(m.volume, 0.5, 1e-9);
}

// 10. playInstant: natural advance – full chosen volume at once.
{
  const { m, c, f } = rig();
  f.setVolume(0.7);
  await f.playInstant();
  near(m.volume, 0.7, 1e-9);
  assert.equal(c.running, false);
}

// 11. Track ended inside the fade-out: finishes at once, volume restored.
{
  const { m, c, f } = rig();
  await f.play();
  c.advance(PLAYER_FADE_MS);
  void f.fadeOut();
  c.advance(200);
  m.paused = true; // "ended"
  c.advance(40);
  assert.equal(f.fadingOut, false);
  near(m.volume, 1, 1e-9);
}

// 12. Background tab: throttled 1 s ticks still finish the fade-out and pause.
{
  const { m, c, f } = rig();
  await f.play();
  c.advance(PLAYER_FADE_MS);
  void f.fadeOut();
  c.advance(1000, 1000);
  assert.equal(m.paused, false);
  c.advance(1000, 1000);
  assert.equal(m.paused, true);
}

// 13. iOS (read-only volume): no fade, play / pause at once, nothing breaks.
{
  const { m, c, f } = rig({ readOnlyVolume: true });
  assert.equal(f.enabled, false);
  f.setVolume(0.3);
  await f.play();
  assert.equal(m.paused, false);
  assert.equal(m.volume, 1);
  assert.equal(await f.fadeOut(), true);
  assert.equal(m.paused, true);
  assert.equal(c.running, false);
}

// 14. dispose stops the timer and restores the chosen volume.
{
  const { m, c, f } = rig();
  f.setVolume(0.8);
  await f.play();
  c.advance(300);
  f.dispose();
  assert.equal(c.running, false);
  near(m.volume, 0.8, 1e-9);
}

// --- Controller wiring (SpaOnlinePlayer + FadingAudio) ---
const item = (n: number): SpaManifestItem => ({
  position: n,
  audioItemId: `00000000-0000-4000-8000-00000000000${n}`,
  trackCode: null,
  title: `T${n}`,
  durationSeconds: null,
  gainDb: null,
  playableUntil: null,
  offlineAllowed: false,
  offlineCacheUntil: null,
});
function player(opts: { readOnlyVolume?: boolean; until?: number } = {}) {
  const { m, c, f } = rig(opts);
  const p = new SpaOnlinePlayer(
    { audio: f, sign: async (id) => ({ ok: true, data: { url: `https://s/${id}?token=x` } }), onChange() {}, now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer },
    [{ ...item(1), playableUntil: opts.until ? new Date(c.now() + opts.until) : null }, item(2), item(3), item(4)],
  );
  return { m, c, f, p };
}

// 15. Play fades in; pause is "paused" at once while the music fades out; resume continues.
{
  const { m, c, f, p } = player();
  f.setVolume(0.8);
  await p.toggle();
  assert.equal(p.status, "playing");
  assert.ok(m.volume < 0.05, "track start fades in");
  c.advance(PLAYER_FADE_MS);
  near(m.volume, 0.8, 1e-9);
  m.currentTime = 42;
  await p.toggle();
  assert.equal(p.status, "paused", "status flips at once (UI, remote commands)");
  assert.equal(m.paused, false, "music still fading");
  c.advance(PLAYER_FADE_MS + 100);
  assert.equal(m.paused, true);
  near(m.volume, 0.8, 1e-9);
  const src = m.src;
  await p.toggle();
  assert.equal(p.status, "playing");
  assert.equal(m.src, src, "resume keeps the track (no re-sign)");
  assert.equal(m.currentTime, 42);
  assert.ok(m.volume < 0.05, "resume fades in");
}

// 16. Resume during the fade-out (remote pause then play): no restart, rises back.
{
  const { m, c, p } = player();
  await p.toggle();
  c.advance(PLAYER_FADE_MS);
  await p.toggle();
  c.advance(600);
  const src = m.src;
  await p.toggle();
  assert.equal(p.status, "playing");
  assert.equal(m.src, src);
  assert.equal(m.paused, false);
  c.advance(PLAYER_FADE_MS);
  near(m.volume, 1, 1e-9);
}

// 17. Natural advance ("ended") starts the next track at full volume; next() fades in.
{
  const { m, c, p } = player();
  await p.toggle();
  c.advance(PLAYER_FADE_MS);
  m.paused = true; // ended
  await p.onEnded();
  assert.equal(p.current?.title, "T2");
  near(m.volume, 1, 1e-9);
  const next = p.next();
  c.advance(PLAYER_SKIP_FADE_OUT_MS);
  await next;
  assert.equal(p.current?.title, "T3");
  assert.ok(m.volume < 0.05);
}

// 18. Track switch during a pause fade continues down, then fades the new track in.
{
  const { m, c, p } = player();
  await p.toggle();
  c.advance(PLAYER_FADE_MS);
  await p.toggle();
  c.advance(300);
  const next = p.next();
  c.advance(PLAYER_SKIP_FADE_OUT_MS);
  await next;
  assert.equal(p.status, "playing");
  assert.equal(p.current?.title, "T2");
  c.advance(PLAYER_FADE_MS);
  near(m.volume, 1, 1e-9);
  assert.equal(m.paused, false, "the cancelled fade-out never pauses the new track");
}

// 20. Rights deadline inside the fade-out: hard stop at playable_until, no auto-advance.
{
  const { m, c, f } = rig();
  const timeouts: { at: number; fn: () => void; live: boolean }[] = [];
  const until = new Date(c.now() + 3_000);
  const limited = (n: number): SpaManifestItem => ({ ...item(n), playableUntil: until });
  const p = new SpaOnlinePlayer(
    {
      audio: f,
      sign: async (id) => ({ ok: true, data: { url: `https://s/${id}?token=x` } }),
      onChange() {},
      now: c.now,
      setTimer: (fn, ms) => { const t = { at: c.now() + ms, fn, live: true }; timeouts.push(t); return t; },
      clearTimer: (t) => { (t as { live: boolean }).live = false; },
    },
    [limited(1), item(2)],
  );
  const runDue = () => { for (const t of timeouts) if (t.live && t.at <= c.now()) { t.live = false; t.fn(); } };
  f.setVolume(0.8);
  await p.toggle();
  c.advance(2_000);
  assert.equal(p.status, "playing");
  await p.toggle(); // pause 1 s before the window ends
  assert.equal(p.status, "paused");
  assert.equal(m.paused, false, "still fading");
  c.advance(1_000);
  runDue();
  assert.equal(m.paused, true, "hard stop at playable_until");
  near(m.volume, 0.8, 1e-9);
  assert.equal(f.fadingOut, false);
  assert.equal(p.status, "paused", "no auto-advance after a user pause");
  assert.equal(p.current?.audioItemId, item(1).audioItemId);
  const pausesAtStop = m.pauses;
  c.advance(2_000);
  runDue();
  assert.equal(m.pauses, pausesAtStop, "nothing else fires later");
  assert.equal(m.plays, 1);
}

// 21. Pause after playable_until already passed: no fade-out, hard pause at once.
{
  const { m, c, f } = rig();
  let clockOffset = 0;
  const until = new Date(c.now() + 1_000);
  const p = new SpaOnlinePlayer(
    {
      audio: f,
      sign: async (id) => ({ ok: true, data: { url: `https://s/${id}?token=x` } }),
      onChange() {},
      now: () => c.now() + clockOffset,
      setTimer: () => 0,
      clearTimer: () => {},
    },
    [{ ...item(1), playableUntil: until }, item(2)],
  );
  await p.toggle();
  clockOffset = 5_000; // the deadline timer did not fire (suspended tab)
  await p.toggle();
  assert.equal(m.paused, true);
  assert.equal(f.fadingOut, false);
}

// 22. dispose() during a pending play(): no ramp starts afterwards.
{
  const { m, c, f } = rig();
  let resolvePlay: () => void = () => {};
  m.play = () => new Promise<void>((ok) => { resolvePlay = () => { m.paused = false; ok(); }; });
  const pending = f.play();
  f.dispose();
  resolvePlay();
  await pending;
  assert.equal(c.running, false);
}

// 23. Skip fade: monotonic 1 s to zero, pause at zero, hold until a normal 2 s fade-in.
{
  assert.equal(PLAYER_SKIP_FADE_OUT_MS, 1000);
  const { m, c, f } = rig();
  f.setVolume(0.8);
  await f.playInstant();
  m.events.length = 0;
  const fade = f.fadeOutForSwitch();
  let previous = m.volume;
  for (let i = 0; i < 25; i++) {
    c.advance(40);
    assert.ok(m.volume <= previous);
    previous = m.volume;
    if (i < 24) assert.equal(m.paused, false);
  }
  assert.equal(await fade, true);
  assert.equal(m.paused, true);
  assert.equal(m.volume, 0);
  assert.ok(m.events.every((e) => e.volume === 0));
  f.pause(); // stopAudio must preserve silence through source replacement
  f.removeAttribute("src");
  f.load();
  f.src = "new";
  assert.ok(m.events.every((e) => e.volume === 0));
  await f.play();
  c.advance(1000);
  near(m.volume, 0.2);
  c.advance(1000);
  near(m.volume, 0.8);
}

// 24. Manual next updates the UI at once and replaces the source only at zero gain.
{
  const { m, c, f, p } = player();
  f.setVolume(0.7);
  await p.toggle();
  c.advance(PLAYER_FADE_MS);
  const src = m.src;
  m.events.length = 0;
  const next = p.next();
  assert.equal(p.status, "loading");
  assert.equal(p.index, 1);
  assert.equal(p.current?.title, "T2");
  c.advance(500);
  await flush();
  assert.equal(m.src, src);
  assert.equal(m.paused, false);
  assert.ok(m.volume > 0 && m.volume < 0.7);
  assert.equal(m.events.length, 0);
  c.advance(500);
  assert.equal(m.paused, true);
  assert.equal(m.volume, 0);
  await next;
  assert.notEqual(m.src, src);
  assert.ok(m.events.every((e) => e.volume === 0), JSON.stringify(m.events));
  c.advance(PLAYER_FADE_MS);
  near(m.volume, 0.7);
}

// 25. Previous and direct selection use the same skip fade.
for (const select of [(p: SpaOnlinePlayer) => p.previous(), (p: SpaOnlinePlayer) => p.playIndex(2)]) {
  const { m, c, p } = player();
  await p.toggle();
  c.advance(PLAYER_FADE_MS);
  const src = m.src;
  const pending = select(p);
  c.advance(500);
  assert.equal(m.src, src);
  assert.equal(m.paused, false);
  c.advance(500);
  await pending;
  assert.notEqual(m.src, src);
  assert.equal(m.volume, 0);
  c.advance(PLAYER_FADE_MS);
  near(m.volume, 1);
}

// 26. Natural end has no fade ramp or running interval.
{
  const { m, c, p } = player();
  await p.toggle();
  c.advance(PLAYER_FADE_MS);
  m.paused = true;
  await p.onEnded();
  assert.equal(p.current?.title, "T2");
  assert.equal(m.volume, 1);
  assert.equal(c.running, false);
}

// 27. Three rapid next presses share the original 1 s ramp; only the last source starts.
{
  const { m, c, f, p } = player();
  f.setVolume(0.6);
  await p.toggle();
  c.advance(PLAYER_FADE_MS);
  m.events.length = 0;
  const first = p.next();
  c.advance(120);
  const second = p.next();
  c.advance(120);
  const level = m.volume;
  const third = p.next();
  assert.equal(m.volume, level);
  c.advance(760);
  await Promise.all([first, second, third]);
  assert.equal(p.current?.title, "T4");
  const sources = m.events.filter((e) => e.kind === "src" && e.src);
  assert.equal(sources.length, 1);
  assert.ok(sources[0].src.includes(item(4).audioItemId));
  c.advance(PLAYER_FADE_MS);
  near(m.volume, 0.6);
  assert.equal(m.paused, false);
}

// 28. Next during the new fade-in continues down from its current low level.
{
  const { m, c, p } = player();
  await p.toggle();
  c.advance(PLAYER_FADE_MS);
  const first = p.next();
  c.advance(PLAYER_SKIP_FADE_OUT_MS);
  await first;
  c.advance(400);
  const low = m.volume;
  const next = p.next();
  assert.equal(m.volume, low);
  c.advance(40);
  assert.ok(m.volume < low);
  c.advance(200);
  await next;
  assert.equal(p.current?.title, "T3");
  c.advance(PLAYER_FADE_MS);
  near(m.volume, 1);
}

// 29. The old rights deadline interrupts a skip immediately; the chosen track still starts.
{
  const { m, c, p } = player({ until: 2500 });
  await p.toggle();
  c.advance(PLAYER_FADE_MS);
  const next = p.next();
  c.advance(480);
  assert.equal(m.paused, false);
  c.advance(20);
  assert.equal(m.paused, true, "hard stop at the old playable_until");
  await next;
  assert.equal(p.current?.title, "T2");
  assert.equal(p.status, "playing");
  c.advance(PLAYER_FADE_MS);
  near(m.volume, 1);
}

// 30. Read-only iOS volume switches without waiting for a timer.
{
  const { m, c, p } = player({ readOnlyVolume: true });
  await p.toggle();
  await p.next();
  assert.equal(p.current?.title, "T2");
  assert.equal(m.paused, false);
  assert.equal(c.running, false);
}

// 31. Pause during a skip cancels the pending choice; the next play can start normally.
{
  const { m, c, p } = player();
  await p.toggle();
  c.advance(PLAYER_FADE_MS);
  const next = p.next();
  c.advance(300);
  const src = m.src;
  m.events.length = 0;
  await p.toggle();
  await next;
  assert.equal(p.status, "paused");
  assert.equal(m.paused, false, "no cut: the old track keeps fading down");
  assert.equal(m.src, src);
  const low = m.volume;
  c.advance(40);
  assert.ok(m.volume < low, "continues down from the current level");
  c.advance(PLAYER_FADE_MS);
  await flush();
  assert.equal(m.paused, true);
  assert.equal(m.src, "", "the old source is dropped after the fade");
  assert.equal(m.events[0]?.kind, "pause");
  assert.equal(m.events[0]?.volume, 0, "paused only at zero gain");
  near(m.volume, 1, 1e-9);
  const plays = m.plays;
  c.advance(3000);
  await flush();
  assert.equal(m.plays, plays);
  await p.toggle();
  assert.equal(p.current?.title, "T2");
  c.advance(PLAYER_FADE_MS);
  near(m.volume, 1);
}

// 33. Pause then play again inside the skip fade-out: the chosen track starts (never the
// old source resumed), fading in from silence.
{
  const { m, c, p } = player();
  await p.toggle();
  c.advance(PLAYER_FADE_MS);
  const oldSrc = m.src;
  const next = p.next();
  c.advance(200);
  await p.toggle(); // pause
  await next;
  c.advance(200);
  const resume = p.toggle(); // play again, old track still fading
  assert.equal(p.status, "loading");
  c.advance(PLAYER_SKIP_FADE_OUT_MS);
  await resume;
  assert.equal(p.status, "playing");
  assert.equal(p.current?.title, "T2");
  assert.notEqual(m.src, oldSrc);
  assert.ok(m.src.includes(item(2).audioItemId));
  c.advance(PLAYER_FADE_MS);
  near(m.volume, 1, 1e-9);
}

// 32. Skip supersession, changing volume, throttled ticks, refused play and dispose.
{
  const { m, c, f } = rig();
  await f.playInstant();
  const first = f.fadeOutForSwitch();
  c.advance(200);
  const level = f.fadeLevel;
  f.setVolume(0.5);
  near(m.volume, 0.5 * playerFadeGain(level));
  const second = f.fadeOutForSwitch();
  assert.equal(await first, false);
  c.advance(1000, 1000);
  assert.equal(await second, true);
  assert.equal(m.volume, 0);
  m.failPlay = true;
  await assert.rejects(f.play());
  near(m.volume, 0.5);
  m.failPlay = false;
  await f.playInstant();
  const last = f.fadeOutForSwitch();
  c.advance(1000, 1000);
  await last;
  f.dispose();
  near(m.volume, 0.5);
  assert.equal(c.running, false);
}

// 34. Pause during a skip, then the old track leaves the manifest: its fade is still
// audible, so it stops at once (the guard follows the sounding track, not the chosen one).
{
  const { m, c, p } = player();
  await p.toggle();
  c.advance(PLAYER_FADE_MS);
  const next = p.next();
  c.advance(300);
  await p.toggle();
  await next;
  assert.equal(m.paused, false);
  await p.applyManifest([item(2), item(3), item(4)]);
  assert.equal(m.paused, true, "removed old track stops immediately");
  await flush();
  assert.equal(m.src, "");
  assert.equal(p.status, "paused");
  assert.equal(p.current?.title, "T2");
}

// 35. Same, but the manifest shortens the old track's playable_until: hard stop then.
{
  const { m, c, p } = player();
  await p.toggle();
  c.advance(PLAYER_FADE_MS);
  const next = p.next();
  c.advance(300);
  await p.toggle();
  await next;
  await p.applyManifest([{ ...item(1), playableUntil: new Date(c.now() + 300) }, item(2), item(3), item(4)]);
  c.advance(280);
  assert.equal(m.paused, false);
  c.advance(40);
  assert.equal(m.paused, true, "old track stops at its new playable_until");
  await flush();
  assert.equal(m.src, "");
  assert.equal(p.current?.title, "T2");
}

// 36. While the previous track fades out it is the audible one (reports / position), and
// the chosen track takes over once it starts.
{
  const { c, p } = player();
  await p.toggle();
  c.advance(PLAYER_FADE_MS);
  assert.equal(p.fadingOutPrevious, false);
  assert.equal(p.audibleItemId, item(1).audioItemId);
  const next = p.next();
  assert.equal(p.current?.title, "T2");
  assert.equal(p.fadingOutPrevious, true);
  assert.equal(p.audibleItemId, item(1).audioItemId);
  c.advance(PLAYER_SKIP_FADE_OUT_MS);
  await next;
  assert.equal(p.fadingOutPrevious, false);
  assert.equal(p.audibleItemId, item(2).audioItemId);
}

// 37. The chosen track leaves the manifest during the skip: no hard cut of the previous
// one; the same fade continues and the first allowed track starts from silence.
{
  const { m, c, p } = player();
  await p.toggle();
  c.advance(PLAYER_FADE_MS);
  const next = p.next();
  c.advance(300);
  m.events.length = 0;
  const low = m.volume;
  const moved = p.applyManifest([item(1), item(3), item(4)]);
  assert.equal(m.paused, false, "no cut");
  c.advance(40);
  assert.ok(m.volume < low);
  c.advance(PLAYER_SKIP_FADE_OUT_MS);
  await Promise.all([next, moved]);
  assert.equal(p.status, "playing");
  assert.equal(p.current?.title, "T1");
  for (const e of m.events) if (e.kind !== "src") assert.equal(e.volume, 0, `${e.kind} only at zero gain`);
}

// 40. Back to the sounding track inside the skip (next → previous → pause → play): the
// leaving source is never resumed at its old position; a fresh source starts from silence.
{
  const { m, c, p } = player();
  await p.toggle();
  c.advance(PLAYER_FADE_MS);
  m.currentTime = 120;
  const oldSrc = m.src;
  const next = p.next();
  c.advance(100);
  const prev = p.previous();
  assert.equal(p.current?.title, "T1");
  assert.equal(p.fadingOutPrevious, true, "same track id, but the source is leaving");
  c.advance(100);
  await p.toggle(); // pause
  await Promise.all([next, prev]);
  assert.equal(p.fadingOutPrevious, true);
  m.events.length = 0;
  const resume = p.toggle(); // play
  assert.equal(p.status, "loading", "no direct resume of the leaving source");
  c.advance(PLAYER_SKIP_FADE_OUT_MS);
  await resume;
  assert.equal(p.status, "playing");
  assert.equal(p.current?.title, "T1");
  assert.ok(m.events.some((e) => e.kind === "load"), "source replaced");
  for (const e of m.events) if (e.kind !== "src") assert.equal(e.volume, 0, `${e.kind} only at zero gain`);
  assert.equal(m.src, oldSrc.replace(/\?.*/, "") + "?token=x");
  assert.equal(p.fadingOutPrevious, false);
  c.advance(PLAYER_FADE_MS);
  near(m.volume, 1, 1e-9);
}

// 41. Rapid next wrapping back to the sounding track: still a fresh source after the fade.
{
  const { m, c, p } = player();
  await p.toggle();
  c.advance(PLAYER_FADE_MS);
  m.events.length = 0;
  const presses = [p.next(), p.next(), p.next(), p.next()];
  assert.equal(p.current?.title, "T1");
  assert.equal(p.fadingOutPrevious, true);
  c.advance(PLAYER_SKIP_FADE_OUT_MS);
  await Promise.all(presses);
  assert.equal(p.status, "playing");
  assert.equal(m.events.filter((e) => e.kind === "load").length, 1, "one replacement");
  for (const e of m.events) if (e.kind !== "src") assert.equal(e.volume, 0);
  assert.equal(p.fadingOutPrevious, false);
}

// 19. Wiring: both Business players route the element through FadingAudio and set the
// volume through it (cabinet / hall device, guest /guest/coffee).
for (const file of [
  "src/components/business-app/workspace/BusinessCabinetPlayer.tsx",
  "src/components/business-app/sound/BusinessGuestPlayback.tsx",
]) {
  const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  assert.match(src, /new FadingAudio\(audio\)/, file);
  assert.match(src, /audio: fader,/, file);
  assert.match(src, /fadeRef\.current\.setVolume\(/, file);
  assert.doesNotMatch(src, /createMediaElementSource/, file);
}
// 38. Cabinet / hall device: while the previous track fades out after a skip, its time is
// never stored, reported or sought as the chosen track's (timeupdate, toggle, seek).
{
  const src = readFileSync(new URL("../src/components/business-app/workspace/BusinessCabinetPlayer.tsx", import.meta.url), "utf8");
  assert.match(src, /const onTime = \(\) => \{\n(?:\s*\/\/[^\n]*\n)*\s*if \(ctl\.fadingOutPrevious\) return;/);
  assert.match(src, /const positionSec = ctl\.fadingOutPrevious \? 0 : \(audioRef\.current\?\.currentTime \?\? 0\);\n\s*remember\(\{ index: ctl\.index < 0 \? index : ctl\.index, positionSec \}/);
  assert.match(src, /if \(ctlRef\.current\?\.fadingOutPrevious\) return;\n\s*const nextTime/);
  assert.match(src, /const audible = ctl\.audibleItemId;/);
  assert.equal((src.match(/positionSec: (?:audio|audioRef)/g) ?? []).length, 1, "only the guarded timeupdate write reads the element time");
}
{
  const src = readFileSync(new URL("../src/components/business-app/sound/BusinessGuestPlayback.tsx", import.meta.url), "utf8");
  assert.match(src, /if \(ctl\.fadingOutPrevious\) return;\n\s*setClock\(/);
  assert.match(src, /if \(ctlRef\.current\?\.fadingOutPrevious\) return;\n\s*audio\.currentTime = /);
}
// 39. Controller: next → pause → play → pause inside the skip keeps the previous track
// marked as fading (the toggle wrapper stores position 0 for the chosen one).
{
  const { m, c, p } = player();
  await p.toggle();
  c.advance(PLAYER_FADE_MS);
  m.currentTime = 120;
  const next = p.next();
  c.advance(100);
  await p.toggle();
  await next;
  const again = p.toggle();
  c.advance(100);
  await p.toggle();
  assert.equal(p.current?.title, "T2");
  assert.equal(p.fadingOutPrevious, true, "old source still fading");
  c.advance(PLAYER_FADE_MS + PLAYER_SKIP_FADE_OUT_MS);
  await again;
  await flush();
  assert.equal(p.fadingOutPrevious, false);
  assert.equal(m.src, "");
}
{
  const src = readFileSync(new URL("../src/lib/business-app/spa-online-player.ts", import.meta.url), "utf8");
  assert.match(src, /if \(this\.d\.audio\.fadeOut && !this\.expired\(cur\)\) \{\n\s+void this\.d\.audio\.fadeOut\(\);/);
  assert.match(src, /return this\.advance\(true\);/);
}

console.log("business-player-fade-unit: ok");
