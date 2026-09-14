#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { readdirSync } from "node:fs";
import path from "node:path";

const CLUSTER = [
  "/distribyutor-ii-muzyki",
  "/kak-sozdat-ii-muzyku",
  "/kak-vylozhit-ii-muzyku",
  "/v-kakoy-neyroseti-sozdat-muzyku",
  "/kak-sozdat-muzyku-v-suno",
  "/kak-sozdat-pesnyu-s-pomoshchyu-ii",
  "/kak-sozdat-muzyku-po-tekstu-s-pomoshchyu-ii",
  "/kak-sozdat-fonovuyu-muzyku-s-pomoshchyu-ii",
  "/kak-prodat-muzyku-sozdannuyu-ii",
  "/mozhno-li-zarabotat-na-ii-muzyke",
  "/kuda-vykladyvat-muzyku-iz-suno",
  "/kak-zarabotat-na-muzyke-iz-suno",
  "/kak-zarabatyvat-na-ii-muzyke-v-audiolad",
];

const PAGE_SOURCES = {
  "/distribyutor-ii-muzyki": [
    "src/components/distribyutor-ii-muzyki/DistribyutorIiMuzykiPageView.tsx",
  ],
  "/kak-sozdat-ii-muzyku": [
    "src/components/kak-sozdat-ii-muzyku/KakSozdatIiMuzykuPageView.tsx",
  ],
  "/kak-vylozhit-ii-muzyku": [
    "src/components/kak-vylozhit-ii-muzyku/KakVylozhitIiMuzykuPageView.tsx",
  ],
  "/v-kakoy-neyroseti-sozdat-muzyku": [
    "src/components/v-kakoy-neyroseti-sozdat-muzyku/VKakoyNeyrosetiSozdatMuzykuPageView.tsx",
  ],
  "/kak-sozdat-muzyku-v-suno": [
    "src/components/kak-sozdat-muzyku-v-suno/KakSozdatMuzykuVSunoPageView.tsx",
  ],
  "/kak-sozdat-pesnyu-s-pomoshchyu-ii": [
    "src/components/kak-sozdat-pesnyu-s-pomoshchyu-ii/KakSozdatPesnyuSPomoshchyuIiPageView.tsx",
  ],
  "/kak-sozdat-muzyku-po-tekstu-s-pomoshchyu-ii": [
    "src/components/kak-sozdat-muzyku-po-tekstu-s-pomoshchyu-ii/KakSozdatMuzykuPoTekstuSPomoshchyuIiPageView.tsx",
  ],
  "/kak-sozdat-fonovuyu-muzyku-s-pomoshchyu-ii": [
    "src/components/kak-sozdat-fonovuyu-muzyku-s-pomoshchyu-ii/KakSozdatFonovuyuMuzykuSPomoshchyuIiPageView.tsx",
  ],
  "/kak-prodat-muzyku-sozdannuyu-ii": [
    "src/components/kak-prodat-muzyku-sozdannuyu-ii/KakProdatMuzykuSozdannuyuIiPageView.tsx",
  ],
  "/mozhno-li-zarabotat-na-ii-muzyke": [
    "src/components/mozhno-li-zarabotat-na-ii-muzyke/MozhnoLiZarabotatNaIiMuzykePageView.tsx",
  ],
  "/kuda-vykladyvat-muzyku-iz-suno": [
    "src/components/kuda-vykladyvat-muzyku-iz-suno/KudaVykladyvatMuzykuIzSunoPageView.tsx",
  ],
  "/kak-zarabotat-na-muzyke-iz-suno": [
    "src/components/kak-zarabotat-na-muzyke-iz-suno/KakZarabotatNaMuzykeIzSunoPageView.tsx",
  ],
  "/kak-zarabatyvat-na-ii-muzyke-v-audiolad": [
    "src/components/ai-music-hub/AiMusicHubPageView.tsx",
    "src/lib/seo/ai-music-hub/content.ts",
  ],
};

const MAX_OUTBOUND_PER_PAGE = 10;
const clusterSet = new Set(CLUSTER);

function walkTsFiles(dir, acc = []) {
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) walkTsFiles(full, acc);
    else if (/\.(ts|tsx|mjs|js)$/.test(name.name)) acc.push(full);
  }
  return acc;
}

function loadConstHrefMap() {
  const map = new Map();
  for (const file of walkTsFiles("src")) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(
      /(?:export\s+)?const\s+([A-Z0-9_]+)\s*=\s*["'](\/[^"']+)["']/g,
    )) {
      map.set(match[1], match[2]);
    }
  }
  return map;
}

function extractClusterHrefs(text, constMap) {
  const hrefs = [];
  for (const match of text.matchAll(/href\s*=\s*["'](\/[^"'?#]*)["']/g)) {
    hrefs.push(match[1]);
  }
  for (const match of text.matchAll(/href\s*=\s*\{([A-Z0-9_]+)\}/g)) {
    const resolved = constMap.get(match[1]);
    if (resolved) hrefs.push(resolved);
  }
  return hrefs.filter((href) => clusterSet.has(href));
}

function countTarget(hrefs, target) {
  return hrefs.filter((href) => href === target).length;
}

const constMap = loadConstHrefMap();
const outbound = new Map();
const inbound = new Map(CLUSTER.map((route) => [route, new Set()]));

for (const route of CLUSTER) {
  const files = PAGE_SOURCES[route];
  assert.ok(files?.length, `missing sources for ${route}`);
  const allText = files.map((file) => {
    assert.ok(existsSync(file), `missing file ${file}`);
    return readFileSync(file, "utf8");
  }).join("\n");

  // route file existence
  const slug = route.slice(1);
  const pagePath = `src/app/(platform)/(listener)/${slug}/page.tsx`;
  assert.ok(existsSync(pagePath), `missing route page ${pagePath}`);

  const hrefs = extractClusterHrefs(allText, constMap).filter((href) => href !== route);
  const unique = [...new Set(hrefs)];
  outbound.set(route, unique);

  for (const target of unique) {
    inbound.get(target).add(route);
  }

  // no all-to-all / mass spam
  assert.ok(
    unique.length <= MAX_OUTBOUND_PER_PAGE,
    `${route} has ${unique.length} cluster outbound (> ${MAX_OUTBOUND_PER_PAGE})`,
  );

  // no meaningless mass duplication of one target (allow up to 3)
  for (const target of unique) {
    assert.ok(
      countTarget(hrefs, target) <= 3,
      `${route} duplicates ${target} too often`,
    );
  }

  // no UTM on internal cluster links
  assert.doesNotMatch(allText, /href=["']\/[^"']+\?[^"']*utm_/i);

  // no absolute audiolad.ru for cluster paths
  for (const pathItem of CLUSTER) {
    const abs = new RegExp(
      String.raw`https?://(?:www\.)?audiolad\.ru${pathItem.replaceAll("/", "\\/")}`,
    );
    assert.doesNotMatch(allText, abs);
  }

  // internal Link must not use target=_blank on cluster hrefs
  for (const match of allText.matchAll(/<Link\b[^>]*>/g)) {
    const tag = match[0];
    const hrefMatch = tag.match(/href\s*=\s*["'](\/[^"']+)["']/)
      || tag.match(/href\s*=\s*\{([A-Z0-9_]+)\}/);
    if (!hrefMatch) continue;
    let href = hrefMatch[1];
    if (!href.startsWith("/")) href = constMap.get(href) || "";
    if (!clusterSet.has(href)) continue;
    assert.doesNotMatch(tag, /target\s*=\s*["']_blank["']/);
  }
}

for (const route of CLUSTER) {
  assert.ok(outbound.get(route).length >= 1, `orphan outbound: ${route}`);
  assert.ok(inbound.get(route).size >= 1, `orphan inbound: ${route}`);
}

const commercial = "/kak-zarabatyvat-na-ii-muzyke-v-audiolad";
assert.ok(inbound.get(commercial).size >= 1, "commercial landing has no inbound");

function hasEdge(from, to) {
  return outbound.get(from).includes(to);
}

assert.ok(hasEdge("/kak-sozdat-ii-muzyku", "/kak-vylozhit-ii-muzyku"), "creation → publication");
assert.ok(hasEdge("/kak-vylozhit-ii-muzyku", "/distribyutor-ii-muzyki"), "publication → distribution");
assert.ok(
  hasEdge("/kak-vylozhit-ii-muzyku", "/mozhno-li-zarabotat-na-ii-muzyke")
    || hasEdge("/kak-vylozhit-ii-muzyku", "/kak-prodat-muzyku-sozdannuyu-ii"),
  "publication → monetization",
);
assert.ok(hasEdge("/mozhno-li-zarabotat-na-ii-muzyke", commercial), "monetization → commercial");
assert.ok(hasEdge("/kak-sozdat-muzyku-v-suno", "/kuda-vykladyvat-muzyku-iz-suno"), "Suno creation → Suno publication");
assert.ok(hasEdge("/kuda-vykladyvat-muzyku-iz-suno", "/kak-zarabotat-na-muzyke-iz-suno"), "Suno publication → Suno monetization");
assert.ok(hasEdge("/kak-zarabotat-na-muzyke-iz-suno", commercial), "Suno monetization → commercial");

// not all-to-all: average outbound should stay well below 12
const avg =
  CLUSTER.reduce((sum, route) => sum + outbound.get(route).length, 0) / CLUSTER.length;
assert.ok(avg < 9, `average outbound too high (${avg}), looks like all-to-all`);

// no dangling cluster targets outside matrix (already filtered), ensure every outbound is in CLUSTER
for (const route of CLUSTER) {
  for (const target of outbound.get(route)) {
    assert.ok(clusterSet.has(target), `unknown target ${target} from ${route}`);
  }
}

console.log("ai-music-cluster-internal-links: OK");
for (const route of CLUSTER) {
  console.log(
    `${route}\tin=${inbound.get(route).size}\tout=${outbound.get(route).length}\t${outbound.get(route).join(",")}`,
  );
}
