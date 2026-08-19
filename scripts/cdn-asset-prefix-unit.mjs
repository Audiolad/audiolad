#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveCdnAssetPrefix } from "../src/lib/cdn-asset-prefix";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

assert.equal(resolveCdnAssetPrefix(undefined), undefined);
assert.equal(resolveCdnAssetPrefix(null), undefined);
assert.equal(resolveCdnAssetPrefix(""), undefined);
assert.equal(resolveCdnAssetPrefix("   "), undefined);
assert.equal(
  resolveCdnAssetPrefix("https://cdn.audiolad.ru"),
  "https://cdn.audiolad.ru",
);
assert.equal(
  resolveCdnAssetPrefix("https://cdn.audiolad.ru/"),
  "https://cdn.audiolad.ru",
);
assert.equal(
  resolveCdnAssetPrefix(" https://cdn.audiolad.ru/// "),
  "https://cdn.audiolad.ru",
);

const nextConfig = readFileSync(join(root, "next.config.ts"), "utf8");
assert.match(
  nextConfig,
  /assetPrefix:\s*resolveCdnAssetPrefix\(\s*process\.env\.NEXT_PUBLIC_CDN_ASSET_PREFIX\s*\)/,
  "next.config uses official assetPrefix from env",
);
assert.doesNotMatch(
  nextConfig,
  /nextUrlServerPrefix/,
  "does not set experimental.nextUrlServerPrefix",
);
assert.doesNotMatch(
  nextConfig,
  /images:\s*\{[^}]*path:/s,
  "does not set images.path",
);

console.log("cdn-asset-prefix-unit: ok");
