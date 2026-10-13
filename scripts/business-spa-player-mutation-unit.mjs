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
];
let blind = 0;
try {
  for (const [name, from, to] of mutations) {
    if (!orig.includes(from)) { console.error(`mutation anchor missing: ${name}`); blind++; continue; }
    writeFileSync(mutant, orig.replace(from, to));
    let failed = false;
    try {
      execFileSync("npx", ["tsx", suite], { env: { ...process.env, SPA_ENGINE_MODULE: mutant }, stdio: "pipe", timeout: 120000 });
    } catch { failed = true; }
    console.log(`${failed ? "killed " : "SURVIVED"} ${name}`);
    if (!failed) blind++;
  }
} finally { rmSync(mutant, { force: true }); }
if (blind) { console.error(`business-spa-player-mutation-unit: ${blind} mutant(s) survived`); process.exit(1); }
console.log("business-spa-player-mutation-unit: all mutants killed");
