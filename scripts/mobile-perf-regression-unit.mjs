#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { statSync } from "node:fs";

const shellData = readFileSync("src/lib/listener/shell-data.ts", "utf8");
assert.match(shellData, /export const getListenerShellData = cache\(loadListenerShellData\)/);
assert.match(shellData, /async function loadListenerShellData/);

const bottomNav = readFileSync("src/components/BottomNav.tsx", "utf8");
assert.match(bottomNav, /prefetch=\{false\}/);

const logoBytes = statSync("public/brand/audiolad-logo-horizontal.png").size;
assert.ok(logoBytes < 120_000, `logo should be <120KB, got ${logoBytes}`);

console.log("PASS: mobile perf regression checks");
