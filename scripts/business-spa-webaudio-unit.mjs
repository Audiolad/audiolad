#!/usr/bin/env node
// Business SPA pilot (0e05333f): WebAudioTrack scheduling with a fake AudioContext.
import assert from "node:assert/strict";

import { WebAudioTrack } from "../src/lib/business-app/spa-webaudio.ts";

const started = [];
const ctxListeners = [];
const ctx = {
  currentTime: 0, state: "running", destination: {}, addEventListener: (t, f) => ctxListeners.push(f),
  createGain: () => ({ gain: { value: 1 }, connect() {} }),
  createBufferSource: () => {
    const n = { buffer: null, onended: null, connect() {}, disconnect() {}, start(when, off) { started.push({ n, when, off }); n.startedAt = when; }, stop() { n.stopped = true; } };
    return n;
  },
  decodeAudioData: async () => ({ duration: 10 }),
  resume: async () => {},
};
globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
const ready = (t) => new Promise((r) => t.addEventListener("canplaythrough", r, { once: true }));

const a = new WebAudioTrack(ctx);
const b = new WebAudioTrack(ctx);
a.src = "blob:a"; a.load(); await ready(a);
b.src = "blob:b"; b.load(); await ready(b);
ctx.currentTime = 1;
a.currentTime = 3; // resume position
await a.play();
assert.equal(started.at(-1).when, 1); assert.equal(started.at(-1).off, 3);
ctx.currentTime = 4;
assert.equal(a.currentTime, 6);
assert.equal(b.startAfter(a), true, "scheduled");
assert.equal(started.at(-1).when, 1 + (10 - 3), "next starts exactly where a ends on the audio clock");
assert.equal(started.at(-1).off, 0);
assert.equal(b.currentTime, 0, "not started yet");
b.pause();
assert.ok(started.at(-1).n.stopped, "pause cancels a scheduled start");
assert.equal(b.paused, true);
ctx.state = "suspended";
assert.equal(b.startAfter(a), false, "no scheduling on a suspended context");
ctx.state = "running";
ctx.currentTime = 7.999;
assert.equal(b.startAfter(a), false, "too late to schedule -> fallback");
a.src = ""; // clearing stops the node and drops the buffer
assert.equal(a.paused, true); assert.ok(Number.isNaN(a.duration));
// Suspension drops the node: nothing sounds again without a JS play().
{
  let wall = 0;
  const c = new WebAudioTrack(ctx, () => wall);
  c.src = "blob:c"; c.load(); await ready(c);
  ctx.currentTime = 20; await c.play();
  c.stopAt(5000);
  ctx.state = "suspended"; ctxListeners.forEach((f) => f());
  assert.equal(c.paused, true, "paused on suspension");
  ctx.state = "running"; wall = 6000; ctxListeners.forEach((f) => f());
  assert.equal(c.paused, true, "stays silent after resume");
  // Deadline passed while running: any state change stops immediately.
  c.stopAt(null); await c.play(); c.stopAt(7000); wall = 8000; ctxListeners.forEach((f) => f());
  assert.equal(c.paused, true, "stopped once the deadline is past");
}
console.log("business-spa-webaudio-unit: all tests passed");
