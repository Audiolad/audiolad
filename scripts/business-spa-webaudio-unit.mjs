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
// A10 #5 / I9: pause while resume() is pending -> no sound afterwards.
{
  const d = new WebAudioTrack(ctx, () => 0);
  d.src = "blob:d"; d.load(); await ready(d);
  let release; ctx.state = "suspended";
  ctx.resume = () => new Promise((r) => { release = () => { ctx.state = "running"; r(); }; });
  const n0 = started.length;
  const p = d.play();
  d.pause();
  release(); await p;
  assert.equal(started.length, n0, "no node started after pause");
  assert.equal(d.paused, true, "stays paused");
  ctx.resume = async () => {};
}
// A10 #4 / I1+I7: successor is scheduled on prev's hard stop, not its natural end.
{
  let wall = 0;
  const e = new WebAudioTrack(ctx, () => wall), f = new WebAudioTrack(ctx, () => wall);
  e.src = "blob:e"; e.load(); await ready(e); f.src = "blob:f"; f.load(); await ready(f);
  ctx.currentTime = 100; await e.play(); e.stopAt(5000);
  assert.equal(f.startAfter(e), true);
  assert.equal(started.at(-1).when, 105, "B starts exactly at A's deadline");
}
// A16 #2 / I1+I2: rights expire while resume() is pending -> no node is ever started;
// the stop is armed before the start (stopAt before play) and applied with the node.
{
  let wall = 0;
  const g = new WebAudioTrack(ctx, () => wall);
  g.src = "blob:g"; g.load(); await ready(g);
  let release; ctx.state = "suspended";
  ctx.resume = () => new Promise((r) => { release = () => { ctx.state = "running"; r(); }; });
  const n0 = started.length;
  let allowed = true;
  g.stopAt(5000);
  const p = g.play(() => allowed);
  wall = 6000; allowed = false; release(); await p;
  assert.equal(started.length, n0, "no node after the grant ended during resume()");
  assert.equal(g.paused, true);
  // guard says no (epoch superseded) even before the deadline.
  wall = 0; g.stopAt(5000); ctx.state = "suspended";
  const p2 = g.play(() => false); release(); await p2;
  assert.equal(started.length, n0, "guard false -> no node");
  // allowed: the node starts with its hard stop already scheduled (atomic).
  ctx.state = "suspended"; let stopArg = null;
  const p3 = g.play(() => true); release(); await p3;
  assert.equal(started.length, n0 + 1, "started");
  const n = started.at(-1).n; assert.ok(g.stopWhen !== null, "hard stop scheduled with the start");
  void stopArg; void n;
  ctx.resume = async () => {};
}
console.log("business-spa-webaudio-unit: all tests passed");
