#!/usr/bin/env npx tsx
/**
 * t1346u: a hall must never reload for a new build while music is meant to play.
 * Sequences from the independent review of #1212, with the real controller, the real
 * FadingAudio (iPhone: no fades, immediate pause) and the real command runner.
 */
import assert from "node:assert/strict";

import { SpaOnlinePlayer } from "../src/lib/business-app/spa-online-player";
import { FadingAudio } from "../src/lib/business-app/player-fade";
import { hallIntentOf, hallMusicSilent, shouldReloadForNewBuild } from "../src/lib/business-app/hall-build-reload";
import { runPointCommands } from "../src/lib/business-app/point-commands";

const item = {
  position: 1, audioItemId: "track-1", trackCode: null, title: "T1", durationSeconds: null,
  gainDb: null, playableUntil: null, offlineAllowed: false, offlineCacheUntil: null,
};

function world() {
  let visible = true;
  let refuse = false;
  let pending = false;
  // Mirrors BusinessCabinetPlayer: latch after a confirmed remote pause + busy while a command runs.
  const flags = { remotePaused: false, remoteBusy: false };
  const events: string[] = [];
  const audio = {
    src: "", currentTime: 0, volume: 1, paused: true, ended: false,
    async play() {
      if (refuse) { const e = new Error("gesture"); e.name = "NotAllowedError"; throw e; }
      this.paused = false;
    },
    pause() { this.paused = true; },
    removeAttribute() { this.src = ""; },
    load() {},
  };
  const fader = new FadingAudio(audio as never, { enabled: false });
  // eslint-disable-next-line prefer-const
  let p: SpaOnlinePlayer;
  const tryReload = () => {
    if (flags.remotePaused || flags.remoteBusy) return;
    if (shouldReloadForNewBuild({
      pageVisible: visible,
      musicPaused: hallMusicSilent(hallIntentOf(p), audio),
      pendingServerBuild: pending ? "b".repeat(40) : null,
      alreadyReloadedFor: null,
    })) { events.push(`reload:${p.status}`); pending = false; }
  };
  p = new SpaOnlinePlayer({
    audio: fader as never,
    sign: async () => ({ ok: true, data: { url: "https://example.invalid/track" } }),
    backgroundAdvance: () => !visible,
    onChange() { if (p.status === "paused" || p.status === "idle") tryReload(); },
  } as never, [item] as never);
  return {
    p, audio, events, flags, tryReload,
    setPending() { pending = true; },
    setVisible(v: boolean) { visible = v; },
    setRefuse(v: boolean) { refuse = v; },
  };
}

// 1) Remote pause (iPhone: immediate pause, no fade) – no reload before the latch is set.
{
  const w = world();
  await w.p.toggle();
  w.setPending();
  const claimUntil = new Date(Date.now() + 30_000).toISOString();
  w.flags.remoteBusy = true;
  try {
    await runPointCommands([{
      id: "12345678-1234-4234-8234-123456789abc", type: "pause",
      claim_id: "22345678-1234-4234-8234-123456789abc", claim_until: claimUntil,
    }] as never, {
      ready: () => true,
      status: () => w.p.status,
      stopped: () => false,
      async toggle() { w.flags.remotePaused = false; await w.p.toggle(); },
      async next() { await w.p.next(); },
      async applied() {
        const done = w.p.status === "paused" && w.audio.paused;
        if (done) { w.flags.remotePaused = true; w.events.push("remotePaused"); }
        return done;
      },
      async ack() { w.events.push("ack"); },
    } as never);
  } finally {
    w.flags.remoteBusy = false;
  }
  w.tryReload();
  assert.deepEqual(w.events, ["remotePaused", "ack"], "remote pause never reloads (owner resumes remotely)");
  w.p.dispose();
}

// 2) Locked iPhone autoplay refusal – a foreground retry resumes; no reload first.
{
  const w = world();
  w.setVisible(false);
  w.setRefuse(true);
  await w.p.toggle();
  assert.equal(w.p.needsGesture, true);
  w.setPending();
  w.setVisible(true);
  w.setRefuse(false);
  w.tryReload();
  await w.p.onForeground();
  assert.deepEqual(w.events, [], "autoplay refusal is not a deliberate pause");
  assert.equal(w.p.status, "playing");
  w.p.dispose();
}

// 3) Access restored with a pending resume – the interim "paused" never reloads.
{
  const w = world();
  await w.p.toggle();
  await w.p.applyManifest(null as never);
  w.setPending();
  await w.p.restoreVerifiedAccess([item] as never);
  assert.deepEqual(w.events, [], "access restore resumes on its own");
  assert.equal(w.p.status, "playing");
  assert.equal(w.p.resumePending, false, "flag cleared after the resume");
  w.p.dispose();
}

// 4) Positive control: a local, deliberate pause on a visible hall does reload.
{
  const w = world();
  await w.p.toggle();
  w.setPending();
  await w.p.toggle();
  assert.deepEqual(w.events, ["reload:paused"], "a deliberate local pause applies the update");
  w.p.dispose();
}

console.log("business-hall-no-reload-while-playing-unit: ok");
