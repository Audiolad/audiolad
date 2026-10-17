#!/usr/bin/env node
/** Each host gets its own manifest + icons; audiolad.ru stays unchanged. */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUSINESS_BRAND_METADATA,
  CLASSIC_BRAND_METADATA,
  getHostBrandMetadata,
  isBusinessBrandAssetPath,
} from "../src/lib/business-app/brand-icons.ts";
import { resolveBusinessProxyAction } from "../src/lib/business-app/proxy-policy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pub = (u) => join(root, "public", u.replace(/^\//, ""));

const classic = getHostBrandMetadata("audiolad.ru");
assert.equal(classic, CLASSIC_BRAND_METADATA);
assert.equal(getHostBrandMetadata("www.audiolad.ru"), CLASSIC_BRAND_METADATA);
assert.equal(getHostBrandMetadata("school.audiolad.ru"), CLASSIC_BRAND_METADATA);
assert.equal(classic.manifest, "/manifest.webmanifest");
assert.deepEqual(classic.icons.apple, [
  { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
]);

const biz = getHostBrandMetadata("business.audiolad.ru");
assert.equal(biz, BUSINESS_BRAND_METADATA);
assert.equal(biz.manifest, "/business/brand/manifest.webmanifest");
const bizUrls = [...biz.icons.icon, ...biz.icons.apple, ...biz.icons.shortcut].map((i) => i.url);
for (const u of bizUrls) {
  assert.ok(u.startsWith("/business/brand/"), u);
  assert.ok(existsSync(pub(u)), `missing ${u}`);
}
const classicUrls = [...classic.icons.icon, ...classic.icons.apple].map((i) => i.url);
for (const u of classicUrls) assert.ok(!u.startsWith("/business/"), u);

const cm = JSON.parse(readFileSync(pub("/manifest.webmanifest"), "utf8"));
const bm = JSON.parse(readFileSync(pub(biz.manifest), "utf8"));
assert.notEqual(bm.id, cm.id);
assert.equal(bm.name, "АудиоЛад Бизнес");
assert.equal(bm.scope, "/");
assert.ok(bm.start_url.startsWith("/"));
assert.ok(bm.icons.some((i) => i.purpose === "maskable"));
for (const i of bm.icons) {
  assert.ok(i.src.startsWith("/business/brand/"), i.src);
  assert.ok(existsSync(pub(i.src)), i.src);
}
for (const i of cm.icons) assert.ok(!i.src.startsWith("/business/"), i.src);

// Business host must serve brand assets (manifest/.ico go through the proxy).
for (const p of ["/business/brand/manifest.webmanifest", "/business/brand/favicon.ico"]) {
  assert.deepEqual(resolveBusinessProxyAction("business.audiolad.ru", p), { action: "pass_through" });
}
assert.equal(isBusinessBrandAssetPath("/business/brand/"), false);
assert.equal(isBusinessBrandAssetPath("/business/brand/../x"), false);
assert.deepEqual(resolveBusinessProxyAction("business.audiolad.ru", "/business/other.webmanifest"), { action: "not_found" });

const layout = readFileSync(join(root, "src/app/layout.tsx"), "utf8");
assert.match(layout, /export async function generateMetadata/);
assert.match(layout, /getHostBrandMetadata\(hostname\)/);
assert.doesNotMatch(layout, /export const metadata\b/);

// Next file-convention icons in the root segment are injected on EVERY host
// (incl. business) — they must stay out of src/app.
for (const f of ["favicon.ico", "icon.svg", "icon.png", "icon.ico", "apple-icon.svg", "apple-icon.png"]) {
  assert.ok(!existsSync(join(root, "src/app", f)), `src/app/${f} would leak onto business host`);
}
assert.ok(existsSync(pub("/favicon.ico")));
assert.equal(classic.icons.icon[0].url, "/favicon.ico?favicon.2vob68tjqpejf.ico");

// Jazz & Coffee icon set: real PNG sizes, opaque home-screen icons, coffee palette,
// and never the same bytes as the audiolad.ru icons.
function readPng(path) {
  const b = readFileSync(path);
  assert.equal(b.toString("latin1", 1, 4), "PNG", path);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), depth = b[24], colorType = b[25], interlace = b[28];
  const idat = [];
  for (let o = 8; o < b.length; ) {
    const len = b.readUInt32BE(o), type = b.toString("latin1", o + 4, o + 8);
    if (type === "IDAT") idat.push(b.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  return { w, h, depth, colorType, interlace, data: inflateSync(Buffer.concat(idat)) };
}
function pixel({ w, depth, colorType, interlace, data }, x, y) {
  assert.equal(depth, 8); assert.equal(interlace, 0);
  const bpp = { 2: 3, 6: 4 }[colorType];
  assert.ok(bpp, `unsupported PNG color type ${colorType}`);
  const stride = w * bpp, rows = [];
  let prev = Buffer.alloc(stride);
  for (let r = 0; r <= y; r++) {
    const f = data[r * (stride + 1)], line = Buffer.from(data.subarray(r * (stride + 1) + 1, (r + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, up = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
      const pred = [0, a, up, (a + up) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? up : c][f];
      line[i] = (line[i] + pred) & 0xff;
    }
    rows.push(line); prev = line;
  }
  return [...rows[y].subarray(x * bpp, x * bpp + bpp)];
}
const isCoffee = ([r, g, b]) => r > g && g > b && r < 140 && r - b > 20;
const bizPngs = [
  ...bm.icons.map((i) => ({ src: i.src, sizes: i.sizes, purpose: i.purpose })),
  ...biz.icons.icon.filter((i) => i.sizes).map((i) => ({ src: i.url, sizes: i.sizes })),
];
for (const { src, sizes, purpose } of bizPngs) {
  const png = readPng(pub(src));
  assert.equal(`${png.w}x${png.h}`, sizes, `${src} declared ${sizes}`);
  const opaque = purpose === "maskable" || src.endsWith("apple-touch-icon.png");
  if (opaque) {
    assert.equal(png.colorType, 2, `${src} must be opaque (no alpha)`);
    assert.ok(isCoffee(pixel(png, 2, 2)), `${src} corner is not espresso/coffee`);
  }
  assert.ok(isCoffee(pixel(png, Math.floor(png.w / 2), Math.floor(png.h * 0.9))), `${src} lower body is not coffee`);
}
const ico = readFileSync(pub("/business/brand/favicon.ico"));
assert.equal(ico.readUInt16LE(2), 1);
const icoSizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => ico[6 + i * 16] || 256).sort((a, b) => a - b);
assert.deepEqual(icoSizes, [16, 32, 48]);
for (const [b, c] of [
  ["/business/brand/favicon.ico", "/favicon.ico"],
  ["/business/brand/favicon-16x16.png", "/favicon-16x16.png"],
  ["/business/brand/favicon-32x32.png", "/favicon-32x32.png"],
  ["/business/brand/favicon-48x48.png", "/favicon-48x48.png"],
  ["/business/brand/apple-touch-icon.png", "/apple-touch-icon.png"],
  ["/business/brand/icon-192.png", "/icon-192.png"],
  ["/business/brand/icon-512.png", "/icon-512.png"],
]) {
  assert.ok(!readFileSync(pub(b)).equals(readFileSync(pub(c))), `${b} must differ from audiolad.ru ${c}`);
}
for (const f of ["icon.svg", "icon-fullbleed.svg", "icon-maskable.svg", "icon-small.svg"]) {
  const svg = readFileSync(join(root, "docs/business/brand-icons", f), "utf8");
  for (const c of ["#6f4326", "#2b1d14", "#f7f1e8", "#b8904f"]) assert.ok(svg.includes(c), `${f} lacks ${c}`);
}

console.log("business-brand-icons-unit: ok");
