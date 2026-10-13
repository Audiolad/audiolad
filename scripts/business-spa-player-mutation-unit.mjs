#!/usr/bin/env node
// Business SPA pilot (0e05333f): mutation checks — each invariant guard is disabled in a
// copy of the engine; the engine suite MUST fail for every mutant (else the test is blind).
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../src/lib/business-app/spa-player-engine.ts", import.meta.url));
const mutant = src.replace(/spa-player-engine\.ts$/, ".mutant-spa-player-engine.ts");
const suite = fileURLToPath(new URL("./business-spa-player-engine-unit.mjs", import.meta.url));
const orig = readFileSync(src, "utf8");
const mutations = [
  ["I1/I2 mayStart ignores rights now", "if (!this.allowed(item, l.kind)) return false;", ""],
  ["I1 mayStart ignores deadline at start moment", "return atMs === undefined || this.allowed(item, l.kind, false, atMs);", "return true;"],
  ["I4 mayStart ignores removed track", "if (!item) return false;\n    if (!this.allowed", "if (!item) return true;\n    if (!this.allowed"],
  ["I8 fresh ignores slot op", "return this.stillCurrent(t.op) && t.slotOp === this.slotOp[t.slot];", "return this.stillCurrent(t.op);"],
  ["I6 stale cache switch clears newer source", "if (!this.stillCurrent(wop) || op !== this.slotOp[slot]) {\n        this.d.objectUrl.revoke(url);\n        continue;", "if (false) {\n        this.d.objectUrl.revoke(url);\n        continue;", "depth"],
  ["I7 successor chosen by availability now", "let ni = this.findPlayable(nextIndex(this.items.length, this.index), at);", "let ni = this.findPlayable(nextIndex(this.items.length, this.index));"],
  ["I7 late load replaces audible slot", "if (!src || op !== this.slotOp[slot]) {", "if (!src) {", "depth"],
  ["I9 pause leaves the outgoing slot audible", [
    ["for (const a of this.d.audios) a.pause();", "this.activeEl().pause();"],
  ]],
  ["I8 startAt uses the index captured before the await", [
    ["    const ri = this.items.findIndex((x) => x.audioItemId === targetId);\n    if (ri < 0) return;", "    const ri = pi;\n    if (ri < 0) return;"],
  ], "depth"],
  // (advance's identity re-resolve is defence in depth: a manifest change bumps the epoch.)
  // ---- whole-operation epoch (A15) ----
  ["OP stillCurrent ignores the epoch", [["return op === this.opEpoch && this.status !== \"no_access\"", "return this.status !== \"no_access\""]]],
  ["OP bumpOp does not advance the epoch", [["    return ++this.opEpoch;", "    return this.opEpoch;"]]],
  ["OP advance fallback activation keeps the slot counter", [["      this.slotOp[slot] += 1; // slot activation: a pending load into it is now stale\n", ""]], "depth"],
  ["OP advance activates a stale prepared successor", [["ni >= 0 && ni === want && this.allowed", "ni >= 0 && this.allowed"]], "depth"],
  ["OP refresh does not take over a superseded start", [["    if (ps && ps.intent === this.playOp) {", "    if (false) {"]]],
  ["OP tick treats an empty slot during startAt as a stop", [["(!l && this.starting === 0)", "(!l)"]]],
  ["OP startAt stalls when the track became disallowed during the load", [["if (!played && this.stillCurrent(wop) && intent === this.playOp && this.status === \"paused\" && attempt < this.items.length) {", "if (false) {"]]],
  // ---- A15 ----
  ["A15 stale init() continues after its cache scan", [["    if (!this.stillCurrent(wop)) return; // the user/refresh already took over: no stale start", ""]]],
  ["A15 cache scan decides with the manifest snapshot taken before its awaits", [["    const current = (id: string) => this.items.find((i) => i.audioItemId === id);", "    const snap = this.items;\n    const current = (id: string) => snap.find((i) => i.audioItemId === id);"]]],
  // ---- A16/A17 ----
  ["A17 <audio> slot has no wall-clock forced stop at its deadline", [["    if (!el.stopAt) this.armForcedStop(slot, next);", ""]]],
  ["A17 hard stop armed only after play() resolved", [["    this.applyDeadline(this.active);\n    try {\n      await this.activeEl().play(", "    try {\n      await this.activeEl().play("]], "depth"], // tick re-applies deadlines every 250 ms; adapter-level guard tested in business-spa-webaudio-unit
  ["A17 start intent dropped before play() completes", [["      this.starting -= 1;\n    }", "      this.starting -= 1;\n      this.pendingStart = null;\n    }"]]],
  ["A17 toggle resume not registered as a pending start", [["      this.pendingStart = mine;\n      let ok: boolean;", "      let ok: boolean;"]]],
  ["A17 dispose() does not cancel a running init()", [["    this.disposed = true;\n    this.playOp += 1;\n    this.bumpOp();", ""], [" && !this.disposed;\n  }", ";\n  }"]]],
  ["A17 stale play() continuation silences the newer start", [["    const keep = !this.stillCurrent(t.op)", "    const keep = false && !this.stillCurrent(t.op)"]]],
  ["A17 forced stop during a pending start stalls the program", [["          this.setStatus(\"paused\");\n        }\n        return false;", "        }\n        return false;"]]],
  // ---- A17/A18 ----
  ["A18 <audio> slot may start with its deadline inside the track (+ slack)", [["      if (dl !== null && dl < from + Math.max(0, dur - pos) * 1000 + SPA_HTML_START_SLACK_MS) return false;", ""]]],
  ["A18 stale cache-switch play() continuation pauses the newer start", [["          this.silenceStale(st);\n          return;", "          if (st.slotOp === this.slotOp[slot]) el.pause();\n          return;"]]],
  ["A18 cache switch play() without the guard", [["        await el.play(() => this.mayStart(st)).catch(", "        await el.play().catch("]], "depth"], // post-play silenceStale + adapter guard test (webaudio-unit)
  ["A18 stale download put drops the current valid copy", [["        if (!valid) await this.dropCache(item.audioItemId);", "        await this.dropCache(item.audioItemId);"]]],
  ["A15 clearing a slot does not end pending readiness waits", [["    for (const f of [...this.slotWaiters[slot]]) f();", ""]], "depth"],
  ["I7 no successor prepared after cache switch drops B", "if (this.status === \"playing\" && !this.loaded[1 - this.active]) await this.prepareNext();", ""],
  ["I6 tick treats in-flight load as interruption", "if (this.starting === 0 && this.status", "if (this.status"],
];
let blind = 0, killed = 0, layered = 0;
try {
  // "depth" = a secondary layer that the whole-operation epoch already covers: its survival
  // is reported, not counted (removing epoch + layer together is covered by the OP mutants).
  for (const [name, from, to, kind] of mutations) {
    const reps = Array.isArray(from) ? from : [[from, to]];
    const depth = (Array.isArray(from) ? to : kind) === "depth";
    let code = orig;
    const missing = reps.find(([f]) => !code.includes(f));
    if (missing) { console.error(`mutation anchor missing: ${name}`); blind++; continue; }
    for (const [f, t] of reps) code = code.replace(f, t);
    writeFileSync(mutant, code);
    // Killed only by a real assertion failure — a crash/timeout/syntax error is "blind".
    let failed = false;
    try {
      execFileSync("npx", ["tsx", suite], { env: { ...process.env, SPA_ENGINE_MODULE: mutant }, stdio: "pipe", timeout: 120000 });
    } catch (e) { failed = /AssertionError/.test(String(e.stderr ?? "") + String(e.stdout ?? "")); }
    console.log(`${failed ? "killed " : depth ? "layered (defence in depth)" : "SURVIVED"} ${name}`);
    if (failed) killed++;
    else if (depth) layered++;
    else blind++;
  }
} finally { rmSync(mutant, { force: true }); }
console.log(`business-spa-player-mutation-unit: ${mutations.length} mutants: ${killed} killed, ${layered} layered defence-in-depth survived (not counted; listed above), ${blind} blind`);
if (blind) { console.error(`business-spa-player-mutation-unit: ${blind} mutant(s) survived or anchor missing`); process.exit(1); }
