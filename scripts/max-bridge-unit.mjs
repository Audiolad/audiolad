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
  readMaxInitData,
  resolveMaxBridgeSnapshot,
} from "../src/lib/max/bridge.ts";
import { MAX_SESSION_VERIFY_PATH } from "../src/lib/max/host.ts";

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

assert.equal(readMaxInitData(), null);

const screen = readFileSync(
  join(repoRoot, "src/components/max/MaxMiniAppScreen.tsx"),
  "utf8",
);
assert.match(screen, /Музыка, медитации, аудиопрактики и аудиокурсы/);
assert.doesNotMatch(screen, /ListenerAppShell|ProductCard|catalog/);
assert.doesNotMatch(screen, /подтверждено|user\.id|query_id/);

const bridgeSource = readFileSync(join(repoRoot, "src/lib/max/bridge.ts"), "utf8");
assert.doesNotMatch(bridgeSource, /WebApp\.ready\(/);
assert.doesNotMatch(bridgeSource, /MAX_BOT|BOT_TOKEN|process\.env\.\w*BOT/);
assert.match(bridgeSource, /initDataUnsafe/);

const scriptSource = readFileSync(
  join(repoRoot, "src/components/max/MaxBridgeScript.tsx"),
  "utf8",
);
const shellCopySource = readFileSync(
  join(repoRoot, "src/lib/max/session-shell.ts"),
  "utf8",
);
assert.match(scriptSource, /MAX_WEB_APP_SCRIPT_SRC/);
assert.match(scriptSource, /afterInteractive/);
assert.match(scriptSource, /verifyMaxSession/);
assert.match(shellCopySource, /АудиоЛад открыт внутри MAX/);
assert.match(shellCopySource, /Подключение к MAX…/);
assert.match(shellCopySource, /Подключение к MAX подтверждено/);
assert.doesNotMatch(
  scriptSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""),
  /initDataUnsafe/,
);
assert.doesNotMatch(scriptSource, /MAX_BOT_TOKEN|NEXT_PUBLIC_MAX/);
assert.doesNotMatch(
  scriptSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""),
  /MAX_SESSION_LINK_PATH|session\/link/,
);
assert.doesNotMatch(
  scriptSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""),
  /\.ready\s*\(/,
);
assert.equal(MAX_SESSION_VERIFY_PATH, "/api/max/session/verify");

console.log("max-bridge-unit: ok");
