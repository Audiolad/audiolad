#!/usr/bin/env node
/**
 * MAX Bridge detection: CDN WebApp presence alone is not proof of MAX.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  hashIndicatesMaxLaunch,
  MAX_WEB_APP_SCRIPT_SRC,
  resolveMaxBridgeSnapshot,
} from "../src/lib/max/bridge.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

assert.equal(MAX_WEB_APP_SCRIPT_SRC, "https://st.max.ru/js/max-web-app.js");
assert.equal(hashIndicatesMaxLaunch(""), false);
assert.equal(hashIndicatesMaxLaunch("#"), false);
assert.equal(hashIndicatesMaxLaunch("#foo=bar"), false);
assert.equal(hashIndicatesMaxLaunch("#WebAppData=abc"), true);
assert.equal(hashIndicatesMaxLaunch("#WebAppPlatform=ios"), true);
assert.equal(hashIndicatesMaxLaunch("#WebAppVersion=25.9.16"), true);

assert.deepEqual(
  resolveMaxBridgeSnapshot({
    webApp: {},
    hash: "",
  }),
  { inMax: false, platform: null, version: null },
);

assert.deepEqual(
  resolveMaxBridgeSnapshot({
    webApp: { initData: "", platform: "web", version: "1.0" },
    hash: "",
  }),
  { inMax: false, platform: "web", version: "1.0" },
);

assert.deepEqual(
  resolveMaxBridgeSnapshot({
    webApp: { initData: "user=%7B%7D", platform: "android", version: "25.9.16" },
    hash: "",
  }),
  { inMax: true, platform: "android", version: "25.9.16" },
);

assert.deepEqual(
  resolveMaxBridgeSnapshot({
    webApp: {},
    hash: "#WebAppData=payload&WebAppPlatform=ios",
  }),
  { inMax: true, platform: null, version: null },
);

const screen = readFileSync(
  join(repoRoot, "src/components/max/MaxMiniAppScreen.tsx"),
  "utf8",
);
assert.match(screen, /АудиоЛад открыт внутри MAX/);
assert.match(screen, /Музыка, медитации, аудиопрактики и аудиокурсы/);
assert.doesNotMatch(screen, /ListenerAppShell|ProductCard|catalog/);

const bridgeSource = readFileSync(join(repoRoot, "src/lib/max/bridge.ts"), "utf8");
assert.doesNotMatch(bridgeSource, /WebApp\.ready\(/);
assert.doesNotMatch(bridgeSource, /MAX_BOT|bot token|BOT_TOKEN/i);
assert.match(bridgeSource, /initDataUnsafe/);

const scriptSource = readFileSync(
  join(repoRoot, "src/components/max/MaxBridgeScript.tsx"),
  "utf8",
);
assert.match(scriptSource, /MAX_WEB_APP_SCRIPT_SRC/);
assert.match(scriptSource, /afterInteractive/);
assert.doesNotMatch(scriptSource, /ready\(/);

console.log("max-bridge-unit: ok");
