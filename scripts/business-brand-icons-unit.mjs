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

// Espresso-on-cream icon set (original AudioLad mark, recoloured only): real PNG sizes,
// opaque RGB, strictly two colours (every pixel is a blend of espresso and cream),
// maskable mark inside the safe zone, and never the same bytes as the audiolad.ru icons.
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
function decodeRgb({ w, h, depth, colorType, interlace, data }, path) {
  assert.equal(depth, 8, path); assert.equal(interlace, 0, path);
  assert.equal(colorType, 2, `${path} must be opaque RGB (no alpha, no palette)`);
  const bpp = 3, stride = w * bpp, rows = [];
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
  return (x, y) => [...rows[y].subarray(x * bpp, x * bpp + bpp)];
}
const ESPRESSO = [0x2b, 0x1d, 0x14], CREAM = [0xf7, 0xf1, 0xe8];
const D = CREAM.map((c, i) => c - ESPRESSO[i]), DD = D.reduce((s, d) => s + d * d, 0);
/** Position on the cream(0)→espresso(1) line and distance from that line. */
function onPalette(px) {
  const t = px.reduce((s, v, i) => s + (CREAM[i] - v) * D[i], 0) / DD;
  const off = Math.max(...px.map((v, i) => Math.abs(v - (CREAM[i] - t * D[i]))));
  return { t, off };
}
const bizPngs = [
  ...bm.icons.map((i) => ({ src: i.src, sizes: i.sizes, purpose: i.purpose })),
  ...biz.icons.icon.filter((i) => i.sizes).map((i) => ({ src: i.url, sizes: i.sizes })),
];
assert.deepEqual(
  [...new Set(bizPngs.map((i) => i.src))].sort(),
  [
    "/business/brand/apple-touch-icon.png", "/business/brand/favicon-16x16.png", "/business/brand/favicon-32x32.png",
    "/business/brand/favicon-48x48.png", "/business/brand/icon-192.png", "/business/brand/icon-512.png",
    "/business/brand/icon-maskable-512.png",
  ],
);
for (const { src, sizes, purpose } of bizPngs) {
  const png = readPng(pub(src));
  assert.equal(`${png.w}x${png.h}`, sizes, `${src} declared ${sizes}`);
  const px = decodeRgb(png, src), N = png.w;
  for (const [x, y] of [[0, 0], [N - 1, 0], [0, N - 1], [N - 1, N - 1]]) {
    assert.deepEqual(px(x, y), CREAM, `${src} corner (${x},${y}) must be cream #f7f1e8`);
  }
  let maxT = 0, exactMark = 0, maxR = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const p = px(x, y), { t, off } = onPalette(p);
    assert.ok(off <= 2 && t >= -0.01 && t <= 1.01, `${src} (${x},${y}) ${p} is not an espresso/cream blend`);
    maxT = Math.max(maxT, t);
    if (p.every((v, i) => v === ESPRESSO[i])) exactMark++;
    if (t > 0.01) maxR = Math.max(maxR, Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) / N);
  }
  assert.ok(maxT > (N >= 32 ? 0.9 : 0.5), `${src} has no espresso mark (max blend ${maxT.toFixed(2)})`);
  if (N >= 180) assert.ok(exactMark > 0, `${src} has no solid espresso #2b1d14 pixels`);
  if (purpose === "maskable") assert.ok(maxR <= 0.4, `${src} mark leaves the maskable safe zone (r=${maxR.toFixed(3)}N)`);
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
  ["/business/brand/icon-192.png", "/icon-192.png"],
  ["/business/brand/icon-512.png", "/icon-512.png"],
]) {
  assert.ok(!readFileSync(pub(b)).equals(readFileSync(pub(c))), `${b} must differ from audiolad.ru ${c}`);
}
for (const f of ["icon.svg", "icon-fullbleed.svg", "icon-maskable.svg", "icon-small.svg"]) {
  assert.ok(!existsSync(join(root, "docs/business/brand-icons", f)), `redrawn SVG ${f} must not come back`);
}
const readme = readFileSync(join(root, "docs/business/brand-icons/README.md"), "utf8");
assert.match(readme, /master-logo-icon\.png/);
assert.match(readme, /render_icons\.py/);
assert.ok(existsSync(join(root, "docs/business/brand-icons/render_icons.py")));

console.log("business-brand-icons-unit: ok");
