#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  classifyNextStaticAsset,
  collectAllowedNextStaticAssets,
  extractCandidateRefs,
  normalizeAssetPrefix,
  readPrefixFromEnvFile,
  resolveSmokeAssetPrefix,
} from "./lib/next-static-smoke-assets.mjs";

const LOOPBACK = "http://127.0.0.1:3011";
const CDN = "https://cdn.audiolad.ru";
const noPrefix = { pageOrigin: LOOPBACK };
const withPrefix = { pageOrigin: LOOPBACK, assetPrefix: CDN };

assert.equal(normalizeAssetPrefix(undefined), undefined);
assert.equal(normalizeAssetPrefix(null), undefined);
assert.equal(normalizeAssetPrefix(""), undefined);
assert.equal(normalizeAssetPrefix("   "), undefined);
assert.equal(normalizeAssetPrefix("https://cdn.audiolad.ru"), CDN);
assert.equal(normalizeAssetPrefix("https://cdn.audiolad.ru/"), CDN);
assert.equal(normalizeAssetPrefix(" https://cdn.audiolad.ru/// "), CDN);

assert.equal(
  readPrefixFromEnvFile('NEXT_PUBLIC_CDN_ASSET_PREFIX="https://cdn.audiolad.ru/"\n'),
  "https://cdn.audiolad.ru/",
);
assert.equal(
  readPrefixFromEnvFile("NEXT_PUBLIC_CDN_ASSET_PREFIX='https://cdn.audiolad.ru/'\n"),
  "https://cdn.audiolad.ru/",
);
assert.equal(
  readPrefixFromEnvFile("export NEXT_PUBLIC_CDN_ASSET_PREFIX=https://cdn.audiolad.ru/\n"),
  "https://cdn.audiolad.ru/",
);
assert.equal(
  readPrefixFromEnvFile(
    "SECRET=do-not-read\n# NEXT_PUBLIC_CDN_ASSET_PREFIX=https://ignored.example\nFOO=bar\n",
  ),
  undefined,
);
assert.equal(
  resolveSmokeAssetPrefix({
    env: {},
    envFileText: "NEXT_PUBLIC_CDN_ASSET_PREFIX='https://cdn.audiolad.ru/'\n",
  }),
  CDN,
);
assert.equal(
  resolveSmokeAssetPrefix({
    env: { NEXT_PUBLIC_CDN_ASSET_PREFIX: "https://cdn.audiolad.ru" },
    envFileText: "NEXT_PUBLIC_CDN_ASSET_PREFIX=https://other.example/\n",
  }),
  CDN,
);
assert.equal(
  resolveSmokeAssetPrefix({
    env: { NEXT_PUBLIC_CDN_ASSET_PREFIX: "   " },
    envFileText: "NEXT_PUBLIC_CDN_ASSET_PREFIX=https://cdn.audiolad.ru/\n",
  }),
  CDN,
);
assert.equal(resolveSmokeAssetPrefix({ env: {}, envFileText: "" }), undefined);

let result = classifyNextStaticAsset("/_next/static/chunks/a.css", noPrefix);
assert.equal(result.ok, true);
assert.equal(result.kind, "css");
assert.equal(result.href, `${LOOPBACK}/_next/static/chunks/a.css`);

result = classifyNextStaticAsset("/_next/static/chunks/webpack.js", noPrefix);
assert.equal(result.ok, true);
assert.equal(result.kind, "js");
assert.equal(result.href, `${LOOPBACK}/_next/static/chunks/webpack.js`);

result = classifyNextStaticAsset(
  "https://cdn.audiolad.ru/_next/static/chunks/a.css",
  noPrefix,
);
assert.equal(result.ok, false);
assert.match(result.reason, /cdn\.audiolad\.ru/);

result = classifyNextStaticAsset("https://evil.com/_next/static/x.css", noPrefix);
assert.equal(result.ok, false);
assert.match(result.reason, /evil\.com/);

result = classifyNextStaticAsset(
  "https://cdn.audiolad.ru/_next/static/chunks/a.css",
  withPrefix,
);
assert.equal(result.ok, true);
assert.equal(result.kind, "css");
assert.equal(result.href, `${CDN}/_next/static/chunks/a.css`);

result = classifyNextStaticAsset(
  "https://cdn.audiolad.ru/_next/static/chunks/main-app.js",
  withPrefix,
);
assert.equal(result.ok, true);
assert.equal(result.kind, "js");

result = classifyNextStaticAsset("/_next/static/a.css", withPrefix);
assert.equal(result.ok, false);
assert.match(result.reason, /does not match CDN prefix/);

result = classifyNextStaticAsset(
  "https://fonts.googleapis.com/css2?family=Inter:wght@400",
  withPrefix,
);
assert.equal(result.skip, true);
assert.notEqual(result.ok, true);

result = classifyNextStaticAsset(
  "https://cdn.audiolad.ru/_next/image?url=%2Fbrand%2Fx.png",
  withPrefix,
);
assert.equal(result.skip, true);

result = classifyNextStaticAsset("https://cdn.audiolad.ru/images/x.css", withPrefix);
assert.ok(result.skip === true || result.ok === false);
assert.notEqual(result.ok, true);

const liveHtml = `<!DOCTYPE html><html><head>
<link rel="stylesheet" href="https://cdn.audiolad.ru/_next/static/chunks/21c4f0e8c8b2a3d1.css" data-precedence="next"/>
<link rel="preload" as="script" href="https://cdn.audiolad.ru/_next/static/chunks/webpack-8e0d0d1f.js"/>
<script src="https://cdn.audiolad.ru/_next/static/chunks/main-app-abc123.js" async=""></script>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400"/>
</head></html>`;

const refs = extractCandidateRefs(liveHtml);
assert.ok(refs.includes(`${CDN}/_next/static/chunks/21c4f0e8c8b2a3d1.css`));
assert.ok(refs.includes(`${CDN}/_next/static/chunks/main-app-abc123.js`));

const collected = collectAllowedNextStaticAssets(liveHtml, withPrefix);
assert.deepEqual(collected.css, [
  `${CDN}/_next/static/chunks/21c4f0e8c8b2a3d1.css`,
]);
assert.deepEqual(collected.js, [
  `${CDN}/_next/static/chunks/webpack-8e0d0d1f.js`,
  `${CDN}/_next/static/chunks/main-app-abc123.js`,
]);
assert.equal(collected.errors.length, 0);

const leftover = collectAllowedNextStaticAssets(
  `<link rel="stylesheet" href="/_next/static/chunks/old.css"/>
   <script src="https://cdn.audiolad.ru/_next/static/chunks/app.js"></script>`,
  withPrefix,
);
assert.deepEqual(leftover.css, []);
assert.deepEqual(leftover.js, [`${CDN}/_next/static/chunks/app.js`]);
assert.equal(leftover.errors.length, 1);

const sameOrigin = collectAllowedNextStaticAssets(
  `<link rel="stylesheet" href="/_next/static/chunks/a.css"/>
   <script src="/_next/static/chunks/a.js"></script>`,
  noPrefix,
);
assert.deepEqual(sameOrigin.css, [`${LOOPBACK}/_next/static/chunks/a.css`]);
assert.deepEqual(sameOrigin.js, [`${LOOPBACK}/_next/static/chunks/a.js`]);
assert.equal(sameOrigin.errors.length, 0);

console.log("next-static-smoke-assets-unit: ok");
