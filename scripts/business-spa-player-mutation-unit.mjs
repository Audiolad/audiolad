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
  ["I5 fresh ignores access epoch", "t.epoch === this.accessEpoch && ", ""],
  ["I8 fresh ignores slot op", "t.slotOp === this.slotOp[t.slot] && ", ""],
  ["I9 fresh ignores user pause", "t.playOp === this.playOp && ", ""],
  ["I6 stale cache switch clears newer source", "if (op !== this.slotOp[slot]) {\n        this.d.objectUrl.revoke(url);\n        continue;", "if (false) {\n        this.d.objectUrl.revoke(url);\n        continue;"],
  ["I7 successor chosen by availability now", "let ni = this.findPlayable(nextIndex(this.items.length, this.index), at);", "let ni = this.findPlayable(nextIndex(this.items.length, this.index));"],
  ["I7 late load replaces audible slot", "|| op !== this.slotOp[slot]) {\n      if (src?.kind", ") {\n      if (src?.kind"],
  // The intent ("keep playing" decided before a pause) is enforced in layers; the
  // mutant removes the whole layer, as one guard (arrays = several replacements).
  ["I9 intent of async ops ignored (refresh/advance/tick restart after pause)", [
    ["playOp: intent, slotOp", "playOp: this.playOp, slotOp"],
    ["if (intent !== this.playOp) return; // paused/stopped since the caller decided to play", ""],
    ["    if (intent !== this.playOp) return;\n    if (!ok) {", "    if (!ok) {"],
    ["if (intent !== this.playOp) return; // paused meanwhile: no fallback start", ""],
    ["    if (intent !== this.playOp) return false;\n", ""],
  ]],
  ["I9 pause leaves the outgoing slot audible", [
    ["for (const a of this.d.audios) a.pause();", "this.activeEl().pause();"],
  ]],
  ["I8 startAt uses the index captured before the await", [
    ["    const ri = this.items.findIndex((x) => x.audioItemId === targetId);\n    if (ri < 0) return;", "    const ri = pi;\n    if (ri < 0) return;"],
  ]],
  ["I8 advance falls back by the index captured before the await", [
    ["const fi = fromId ? this.items.findIndex((x) => x.audioItemId === fromId) : -1;", "const fi = from;"],
  ]],
  ["I7 no successor prepared after cache switch drops B", "if (this.status === \"playing\" && !this.loaded[1 - this.active]) await this.prepareNext();", ""],
  ["I6 tick treats in-flight load as interruption", "if (this.starting === 0 && this.status", "if (this.status"],
];
let blind = 0;
try {
  for (const [name, from, to] of mutations) {
    const reps = Array.isArray(from) ? from : [[from, to]];
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
    console.log(`${failed ? "killed " : "SURVIVED"} ${name}`);
    if (!failed) blind++;
  }
} finally { rmSync(mutant, { force: true }); }
if (blind) { console.error(`business-spa-player-mutation-unit: ${blind} mutant(s) survived`); process.exit(1); }
console.log("business-spa-player-mutation-unit: all mutants killed");
