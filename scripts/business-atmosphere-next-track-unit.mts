import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { SpaOnlinePlayer } from "../src/lib/business-app/spa-online-player";
import type { SpaManifestItem } from "../src/lib/business-app/spa-manifest";
import { cafeQueueNextIndex } from "../src/lib/business-app/cafe-queue/order";
import {
  atmospherePlaybackPlan, atmosphereQueuePlan, markAtmosphereRestart,
  peekAtmosphereRestart, takeAtmosphereRestart,
} from "../src/lib/business-app/cafe-queue/atmosphere-restart";
import { clampWorkspacePlayback } from "../src/lib/business-workspace/playback";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const source = read("src/components/business-app/workspace/BusinessCabinetPlayer.tsx");
// Execute the production callback with refs/state setters injected, without React or a DOM.
// Only its two local TypeScript annotations need erasing; the callback's behavior stays intact.
const body = source.split("const applyAtmosphereQueue = useCallback((indices: readonly number[]) => {")[1]
  ?.split("\n  }, [remember]);")[0];
assert.ok(body, "production queue callback found");
assert.doesNotMatch(body, /playIndex|\.play\(|reportPlayback/, "installing an atmosphere never starts audio");
const callback = `(indices) => {${body.replace("new Set<number>()", "new Set()").replace("const unique: number[]", "const unique")}}`;
// Geometry includes/excludes the current track without duplicating or rotating the new order.
assert.deepEqual(atmosphereQueuePlan({ indices: [2, 1, 0], currentIndex: 1, status: "playing" }), {
  order: [1, 2, 0], index: 1, keepCurrent: true, play: false,
});
assert.deepEqual(atmosphereQueuePlan({ indices: [1, 2, 0], currentIndex: 1, status: "loading" }), {
  order: [1, 2, 0], index: 1, keepCurrent: true, play: false,
});
const tracks = [0, 1, 2].map((i) => ({ audioItemId: `t${i}`, durationSeconds: 180 }));
const items: SpaManifestItem[] = tracks.map((track, position) => ({
  ...track, position, trackCode: null, title: `Track ${position}`, gainDb: null,
  playableUntil: null, offlineAllowed: false, offlineCacheUntil: null,
}));

for (const phase of ["playing", "loading", "paused", "idle"] as const) {
  for (const sequence of ["rebuild-then-navigate", "navigate-with-marker"] as const) {
    const memory = new Map<string, string>();
    const store = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
      removeItem: (key: string) => { memory.delete(key); },
    };
    let plays = 0;
    let fades = 0;
    let signs = 0;
    const audio = {
      src: "", currentTime: 0,
      async play() { plays++; }, pause() {}, load() {},
      removeAttribute() { this.src = ""; },
      async fadeOutForSwitch() { fades++; return true; },
    };
    let finishSign!: () => void;
    const waiting = new Promise<void>((resolve) => { finishSign = resolve; });
    const playOrderRef = { current: [0, 1, 2] };
    const ctl = new SpaOnlinePlayer({
      audio, onChange() {},
      sign: async (id) => {
        signs++;
        if (phase === "loading" && signs === 1) await waiting;
        return { ok: true, data: { url: `https://audiolad.ru/test/${id}` } };
      },
      nextIndex: (index, length) => cafeQueueNextIndex(playOrderRef.current, index, length),
    }, items);
    const starting = phase === "idle" ? Promise.resolve() : ctl.playIndex(1);
    if (phase !== "loading") await starting;
    else await Promise.resolve(); // Enter the pending sign request, after the initial fade.
    if (phase === "paused") await ctl.toggle();
    if (phase === "idle") ctl.index = 1;
    audio.currentTime = 42;
    const before = { src: audio.src, plays, fades, signs };
    const playbackRef = { current: { index: 1, positionSec: 42, volume: 0.7, updatedAt: "2026-11-04T10:00:00Z" } };
    const seekRef = { current: 42 };
    let remembers = 0;
    let views = 0;
    let playbacks = 0;
    const apply = runInNewContext(callback, {
      modelRef: { current: { tracks } }, ctlRef: { current: ctl }, audioRef: { current: audio },
      fadeRef: { current: null }, savedPlaceRef: { current: true }, playbackRef, seekRef, playOrderRef,
      atmosphereQueuePlan, clampWorkspacePlayback,
      takeAtmosphereRestart: () => takeAtmosphereRestart(store),
      setQueueOrderState() {}, setPlayback() { playbacks++; }, setView() { views++; },
      remember(_patch: unknown, play: boolean) { assert.equal(play, false); remembers++; },
    }) as (indices: readonly number[]) => void;
    const active = phase === "playing" || phase === "loading";
    markAtmosphereRestart(true, store); // Historical state must not resume a paused player.
    if (sequence === "rebuild-then-navigate") {
      apply([2, 0]);
      assert.equal(peekAtmosphereRestart(store), null, "successful rebuild consumes the marker");
    }
    // The same production decision is used for a first mount, an event revision or a refetch.
    const plan = atmospherePlaybackPlan({
      tracks, orderedIds: ["t2", "t0"], restart: peekAtmosphereRestart(store),
      status: ctl.status, currentIndex: ctl.index,
    });
    if (plan) apply([2, 0]);
    assert.equal(peekAtmosphereRestart(store), null, "navigation consumes the pending handoff");
    assert.equal(ctl.index, active ? 1 : 2);
    assert.equal(plays, before.plays, "no audio.play during rebuild or navigation");
    assert.equal(fades, before.fades, "no skip fade during rebuild or navigation");
    assert.equal(signs, before.signs, "no playIndex/sign request during queue replacement");
    assert.deepEqual(Array.from(playOrderRef.current), active ? [1, 2, 0] : [2, 0]);
    if (active) {
      assert.equal(audio.src, before.src);
      assert.equal(audio.currentTime, 42);
      assert.equal(playbackRef.current.positionSec, 42);
      assert.equal(seekRef.current, 42);
      assert.equal(views + playbacks + remembers, 0, "no view, persisted playhead or pending seek reset");
      // Hours/daypart changes, including an ordinary refetch after the marker is gone.
      apply([0, 2, 1]);
      assert.deepEqual(Array.from(playOrderRef.current), [1, 0, 2]);
      assert.equal(ctl.index, 1);
      assert.equal(audio.currentTime, 42);
      assert.equal(plays, before.plays);
      assert.equal(fades, before.fades);
      if (phase === "loading") { finishSign(); await starting; }
      await ctl.onEnded();
      assert.equal(ctl.index, 0, "the new atmosphere starts at natural track end");
    } else {
      assert.equal(playbackRef.current.positionSec, 0, "inactive cursor moves to the new first track");
      assert.equal(ctl.status, phase);
    }
    ctl.dispose();
  }
}

// Both ordinary refetches and explicit rebuilds use the same live-state decision.
const setOrder = source.split("const setQueueOrder = useCallback")[1]?.split("const applyAtmosphereQueue")[0];
assert.match(setOrder!, /atmosphereQueuePlan/);
const rebuild = source.split("const rebuildFromProfile = useCallback")[1]?.split("  useEffect(")[0];
assert.match(rebuild!, /if \(rebuildGen.current !== gen\) return "failed"/);
assert.match(rebuild!, /applyAtmosphereQueue\(indices\)/);
assert.match(rebuild!, /if \(input.keepCurrent\)[\s\S]*pointKeepCurrentOrder[\s\S]*return "applied"/);
const workspace = read("src/components/business-app/workspace/BusinessWorkspace.tsx");
assert.match(workspace, /currentIndex: currentIndexRef.current/);
assert.match(workspace, /takeAtmosphereRestart\(\);\s*applyAtmosphereQueue\(indices\)/);
assert.doesNotMatch(workspace, /applyAtmosphereQueue\(indices, \{ play:/);
assert.match(workspace, /cancelled = true;\s*ac.abort\(\)/);
console.log("business atmosphere next track: ok");
