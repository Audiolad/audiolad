#!/usr/bin/env node
/** Each host gets its own manifest + icons; audiolad.ru stays unchanged. */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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

// Owner's embossed lotus. 16/32/48 are a tan/groove trace; 180+ and the header
// rasters are the photograph (WebP/AVIF at 192/512). Never the audiolad.ru bytes.
function readPng(path) {
  const b = readFileSync(path);
  assert.equal(b.toString("latin1", 1, 4), "PNG", path);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), depth = b[24], colorType = b[25], interlace = b[28];
  const idat = [];
  let plte = null;
  for (let o = 8; o < b.length; ) {
    const len = b.readUInt32BE(o), type = b.toString("latin1", o + 4, o + 8);
    if (type === "IDAT") idat.push(b.subarray(o + 8, o + 8 + len));
    if (type === "PLTE") plte = b.subarray(o + 8, o + 8 + len);
    if (type === "tRNS") assert.fail(`${path} must be opaque (tRNS)`);
    o += 12 + len;
  }
  return { w, h, depth, colorType, interlace, data: inflateSync(Buffer.concat(idat)), plte };
}
function decodeRgb({ w, h, depth, colorType, interlace, data, plte }, path) {
  assert.equal(interlace, 0, path);
  assert.ok(colorType === 2 || colorType === 3, `${path} must be opaque RGB or palette (no alpha)`);
  if (colorType === 2) assert.equal(depth, 8, path);
  else assert.ok([1, 2, 4, 8].includes(depth), `${path} palette depth ${depth}`);
  const channels = colorType === 2 ? 3 : 1;
  const bpp = Math.max(1, Math.ceil((depth * channels) / 8));
  const stride = Math.ceil((w * channels * depth) / 8);
  const rows = [];
  let prev = Buffer.alloc(stride);
  for (let r = 0; r < h; r++) {
    const f = data[r * (stride + 1)], line = Buffer.from(data.subarray(r * (stride + 1) + 1, (r + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0, up = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
      const pred = [0, a, up, (a + up) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? up : c][f];
      line[i] = (line[i] + pred) & 0xff;
    }
    rows.push(line); prev = line;
  }
  if (colorType === 3) {
    assert.ok(plte && plte.length % 3 === 0, `${path} palette`);
    return (x, y) => {
      const bit = x * depth;
      const byte = rows[y][bit >> 3];
      const idx = depth === 8 ? byte : (byte >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
      const i = idx * 3;
      return [plte[i], plte[i + 1], plte[i + 2]];
    };
  }
  return (x, y) => [...rows[y].subarray(x * bpp, x * bpp + bpp)];
}
function warmBrown(px, src) {
  const [r, g, b] = px;
  assert.ok(r > g && g > b, `${src} corner ${px} is not warm brown`);
  assert.ok(r > 40 && r < 180 && b < 90, `${src} corner ${px} is not leather`);
  assert.ok(!(r > 220 && g > 210), `${src} corner ${px} is cream/white`);
}
function darkest(pxAt, n) {
  let best = 255 * 3;
  let found = null;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const p = pxAt(x, y);
    const s = p[0] + p[1] + p[2];
    if (s < best) { best = s; found = p; }
  }
  return found;
}
function readWebp(path) {
  const b = readFileSync(path);
  assert.equal(b.toString("latin1", 0, 4), "RIFF", path);
  assert.equal(b.toString("latin1", 8, 12), "WEBP", path);
  let o = 12;
  while (o + 8 <= b.length) {
    const type = b.toString("latin1", o, o + 4);
    const size = b.readUInt32LE(o + 4);
    const data = b.subarray(o + 8, o + 8 + size);
    if (type === "VP8 ") {
      assert.equal(data[3], 0x9d, path);
      return { w: data.readUInt16LE(6) & 0x3fff, h: data.readUInt16LE(8) & 0x3fff };
    }
    if (type === "VP8L") {
      const bits = data.readUInt32LE(1);
      return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (type === "VP8X") {
      return {
        w: 1 + (data[4] | (data[5] << 8) | (data[6] << 16)),
        h: 1 + (data[7] | (data[8] << 8) | (data[9] << 16)),
      };
    }
    o += 8 + size + (size % 2);
  }
  assert.fail(`no dimension chunk in ${path}`);
}
function readAvif(path) {
  const b = readFileSync(path);
  assert.equal(b.toString("latin1", 4, 8), "ftyp", path);
  const i = b.indexOf("ispe");
  assert.ok(i > 8, `${path} has no ispe`);
  return { w: b.readUInt32BE(i + 8), h: b.readUInt32BE(i + 12) };
}

assert.deepEqual(
  bm.icons.map((i) => [i.src, i.sizes, i.type, i.purpose]),
  [
    ["/business/brand/icon-192.webp", "192x192", "image/webp", "any"],
    ["/business/brand/icon-512.webp", "512x512", "image/webp", "any"],
    ["/business/brand/icon-maskable-512.webp", "512x512", "image/webp", "maskable"],
    ["/business/brand/apple-touch-icon.png", "180x180", "image/png", "any"],
  ],
);
assert.equal(bm.theme_color, "#f7f1e8");
assert.equal(bm.background_color, "#f7f1e8");
for (const stale of ["icon-192.png", "icon-512.png", "icon-maskable-512.png"]) {
  assert.ok(!existsSync(pub(`/business/brand/${stale}`)), `${stale} must not ship beside the webp`);
}

const TRACE_TAN = [0x82, 0x44, 0x2c];
for (const src of [
  "/business/brand/favicon-16x16.png",
  "/business/brand/favicon-32x32.png",
  "/business/brand/favicon-48x48.png",
]) {
  const png = readPng(pub(src));
  assert.equal(`${png.w}x${png.h}`, src.match(/(\d+)x\d+/)[1] + "x" + src.match(/(\d+)x\d+/)[1], src);
  const px = decodeRgb(png, src);
  for (const [x, y] of [[0, 0], [png.w - 1, 0], [0, png.h - 1], [png.w - 1, png.h - 1]]) {
    const p = px(x, y);
    assert.ok(p.every((v, i) => Math.abs(v - TRACE_TAN[i]) <= 2), `${src} corner ${p} is not the trace tan`);
  }
  const dark = darkest(px, png.w);
  assert.ok(dark[0] + dark[1] + dark[2] < 120, `${src} has no dark groove (${dark})`);
}

for (const src of ["/business/brand/apple-touch-icon.png", "/business/brand/mark-64.png"]) {
  const png = readPng(pub(src));
  const expect = src.endsWith("mark-64.png") ? 64 : 180;
  assert.equal(png.w, expect, src);
  assert.equal(png.h, expect, src);
  const px = decodeRgb(png, src);
  warmBrown(px(0, 0), src);
  // Photograph leather is darker than the flat trace tan.
  assert.ok(px(0, 0)[0] < TRACE_TAN[0] - 15, `${src} corner ${px(0, 0)} looks like the flat trace, not the photo`);
  const dark = darkest(px, png.w);
  assert.ok(dark[0] + dark[1] + dark[2] < 80, `${src} has no embossed groove (${dark})`);
}

for (const [file, w] of [
  ["/business/brand/icon-192.webp", 192],
  ["/business/brand/icon-512.webp", 512],
  ["/business/brand/icon-maskable-512.webp", 512],
  ["/business/brand/mark-64.webp", 64],
  ["/business/brand/mark-128.webp", 128],
]) {
  const dim = readWebp(pub(file));
  assert.deepEqual([dim.w, dim.h], [w, w], file);
  assert.ok(readFileSync(pub(file)).length < 40 * 1024, `${file} is too heavy`);
}
for (const [file, w] of [
  ["/business/brand/mark-64.avif", 64],
  ["/business/brand/mark-128.avif", 128],
]) {
  const dim = readAvif(pub(file));
  assert.deepEqual([dim.w, dim.h], [w, w], file);
  assert.ok(readFileSync(pub(file)).length < 12 * 1024, `${file} is too heavy`);
}
const ico = readFileSync(pub("/business/brand/favicon.ico"));
assert.equal(ico.readUInt16LE(2), 1);
const icoSizes = Array.from({ length: ico.readUInt16LE(4) }, (_, i) => {
  const e = 6 + i * 16;
  const w = ico[e] || 256, h = ico[e + 1] || 256, len = ico.readUInt32LE(e + 8), off = ico.readUInt32LE(e + 12);
  assert.equal(w, h, `favicon.ico entry ${i} is not square`);
  assert.ok(len > 0 && off >= 6 + ico.readUInt16LE(4) * 16 && off + len <= ico.length, `favicon.ico entry ${i} payload out of bounds`);
  const img = ico.subarray(off, off + len);
  assert.equal(img.toString("latin1", 1, 4), "PNG", `favicon.ico entry ${i} is not PNG`);
  assert.deepEqual([img.readUInt32BE(16), img.readUInt32BE(20)], [w, h], `favicon.ico entry ${i} PNG size`);
  assert.ok(img.equals(readFileSync(pub(`/business/brand/favicon-${w}x${w}.png`))), `favicon.ico ${w}px != favicon-${w}x${w}.png`);
  return w;
}).sort((a, b) => a - b);
assert.deepEqual(icoSizes, [16, 32, 48]);
for (const [b, c] of [
  ["/business/brand/favicon.ico", "/favicon.ico"],
  ["/business/brand/favicon-16x16.png", "/favicon-16x16.png"],
  ["/business/brand/favicon-32x32.png", "/favicon-32x32.png"],
  ["/business/brand/favicon-48x48.png", "/favicon-48x48.png"],
  ["/business/brand/apple-touch-icon.png", "/apple-touch-icon.png"],
  ["/business/brand/icon-192.webp", "/icon-192.png"],
  ["/business/brand/icon-512.webp", "/icon-512.png"],
]) {
  assert.ok(existsSync(pub(c)), `audiolad.ru icon missing: ${c}`);
  assert.ok(!readFileSync(pub(b)).equals(readFileSync(pub(c))), `${b} must differ from audiolad.ru ${c}`);
}
for (const f of ["icon.svg", "icon-fullbleed.svg", "icon-maskable.svg", "icon-small.svg"]) {
  assert.ok(!existsSync(join(root, "docs/business/brand-icons", f)), `redrawn SVG ${f} must not come back`);
}
const readme = readFileSync(join(root, "docs/business/brand-icons/README.md"), "utf8");
assert.match(readme, /favicon\.svg/);
assert.match(readme, /render_icons\.py/);
assert.ok(existsSync(join(root, "docs/business/brand-icons/render_icons.py")));
const svgPath = pub("/business/brand/favicon.svg");
const svgStat = readFileSync(svgPath);
assert.ok(svgStat.length > 200 && svgStat.length < 5 * 1024, `favicon.svg is ${svgStat.length} bytes`);
const svgText = svgStat.toString("utf8");
assert.match(svgText, /<svg\b/);
assert.doesNotMatch(svgText, /M180 14c26 34/, "invented seven-petal mark must stay deleted");
const sidebar = readFileSync(join(root, "src/components/business-app/BusinessSidebar.tsx"), "utf8");
assert.match(sidebar, /mark-64\.avif 64w, \/business\/brand\/mark-128\.avif 128w/);
assert.match(sidebar, /mark-64\.webp 64w, \/business\/brand\/mark-128\.webp 128w/);
assert.match(sidebar, /src="\/business\/brand\/mark-64\.png"/);
assert.doesNotMatch(sidebar, /favicon\.svg/);
let payload = 0;
for (const name of readdirSync(pub("/business/brand"))) {
  assert.ok(!name.startsWith("."), `stray ${name} in public/business/brand`);
  if (name === "manifest.webmanifest") continue;
  payload += statSync(pub(`/business/brand/${name}`)).size;
}
assert.ok(payload < 80 * 1024, `business icon payload ${payload} bytes`);
console.log(`business icon payload ${payload} bytes`);

console.log("business-brand-icons-unit: ok");
