#!/usr/bin/env node
/** Each host gets its own manifest + icons; audiolad.ru stays unchanged. */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUSINESS_BRAND_ICON_VERSION,
  BUSINESS_BRAND_MARK_PATH,
  BUSINESS_BRAND_MARK_SRC,
  BUSINESS_BRAND_METADATA,
  BUSINESS_BRAND_NAME,
  CLASSIC_BRAND_METADATA,
  getHostBrandMetadata,
  isBusinessBrandAssetPath,
} from "../src/lib/business-app/brand-icons.ts";
import { resolveBusinessProxyAction } from "../src/lib/business-app/proxy-policy.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetPath = (u) => u.split("?")[0];
const pub = (u) => join(root, "public", assetPath(u).replace(/^\//, ""));

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
assert.equal(biz.manifest, `/business/brand/manifest.webmanifest?v=${BUSINESS_BRAND_ICON_VERSION}`);
const bizUrls = [...biz.icons.icon, ...biz.icons.apple, ...biz.icons.shortcut].map((i) => i.url);
for (const u of bizUrls) {
  assert.ok(u.startsWith("/business/brand/"), u);
  assert.ok(u.includes(`?v=${BUSINESS_BRAND_ICON_VERSION}`), `cache-bust ${u}`);
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
  assert.ok(i.src.includes(`?v=${BUSINESS_BRAND_ICON_VERSION}`), `manifest cache-bust ${i.src}`);
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

// Leather lotus (photograph, not the old espresso-on-cream flat mark): real PNG sizes,
// opaque (RGB or palette, no alpha), leather-brown corners, a sharp mark in the centre,
// maskable padding that is soft leather, and never the same bytes as the audiolad.ru icons.
function readPng(path) {
  const b = readFileSync(path);
  assert.equal(b.toString("latin1", 1, 4), "PNG", path);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20), depth = b[24], colorType = b[25], interlace = b[28];
  const idat = [];
  let palette = null, trns = null;
  for (let o = 8; o < b.length; ) {
    const len = b.readUInt32BE(o), type = b.toString("latin1", o + 4, o + 8);
    const chunk = b.subarray(o + 8, o + 8 + len);
    if (type === "IDAT") idat.push(chunk);
    if (type === "PLTE") palette = Buffer.from(chunk);
    if (type === "tRNS") trns = Buffer.from(chunk);
    o += 12 + len;
  }
  return { w, h, depth, colorType, interlace, data: inflateSync(Buffer.concat(idat)), palette, trns };
}
function unfilter(data, w, h, bpp) {
  const stride = w * bpp, rows = [];
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
  return rows;
}
function decodeRgb(png, path) {
  assert.equal(png.depth, 8, path); assert.equal(png.interlace, 0, path);
  if (png.colorType === 2) {
    assert.equal(png.trns, null, `${path} must be opaque RGB`);
    const rows = unfilter(png.data, png.w, png.h, 3);
    return (x, y) => [...rows[y].subarray(x * 3, x * 3 + 3)];
  }
  assert.equal(png.colorType, 3, `${path} must be opaque RGB or an opaque palette`);
  assert.ok(png.palette && png.palette.length >= 3 && png.palette.length % 3 === 0, path);
  if (png.trns) assert.ok([...png.trns].every((a) => a === 255), `${path} palette must be opaque`);
  const rows = unfilter(png.data, png.w, png.h, 1);
  return (x, y) => {
    const i = rows[y][x] * 3;
    return [png.palette[i], png.palette[i + 1], png.palette[i + 2]];
  };
}
const CREAM = [0xf7, 0xf1, 0xe8];
function isLeather(px, path) {
  const [r, g, b] = px;
  const cream = Math.max(Math.abs(r - CREAM[0]), Math.abs(g - CREAM[1]), Math.abs(b - CREAM[2]));
  assert.ok(r >= 60 && r <= 180 && g >= 12 && g < r && b < g && r - b >= 30 && b < 100 && cream >= 80,
    `${path} corner ${px} is not brown leather (old cream mark would fail this)`);
}
function neighborDelta(px, x0, y0, x1, y1) {
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1 - 1; x++) {
    const a = px(x, y), b = px(x + 1, y);
    s += Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    n++;
  }
  return s / n;
}
const bizPngs = [
  ...bm.icons.map((i) => ({ src: i.src, sizes: i.sizes, purpose: i.purpose })),
  ...biz.icons.icon.filter((i) => i.sizes).map((i) => ({ src: i.url, sizes: i.sizes })),
];
assert.deepEqual(
  [...new Set(bizPngs.map((i) => assetPath(i.src)))].sort(),
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
  for (const [x, y] of [[0, 0], [N - 1, 0], [0, N - 1], [N - 1, N - 1]]) isLeather(px(x, y), src);
  const span = Math.max(4, Math.round(N / 8));
  const center = neighborDelta(px, Math.floor(N / 2) - Math.floor(span / 2), Math.floor(N / 2) - Math.floor(span / 2), Math.floor(N / 2) + Math.floor(span / 2), Math.floor(N / 2) + Math.floor(span / 2));
  const corner = neighborDelta(px, 1, 1, Math.min(N - 1, 1 + span), Math.min(N - 1, 1 + span));
  assert.ok(center > 15, `${src} centre is flat (no lotus), neighbor delta ${center.toFixed(1)}`);
  if (purpose === "maskable") {
    assert.ok(corner < 3, `${src} maskable pad is still sharp (delta ${corner.toFixed(1)})`);
    assert.ok(center > 20, `${src} maskable centre lost the mark`);
  } else if (N >= 180) {
    assert.ok(corner > 15, `${src} should be full-bleed leather, corner delta ${corner.toFixed(1)}`);
  }
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
assert.match(readme, /leather-lotus-source\.jpg/);
assert.match(readme, /render_icons\.py/);
assert.doesNotMatch(readme, /master-logo-icon\.png|espresso-on-cream/);
assert.ok(existsSync(join(root, "docs/business/brand-icons/render_icons.py")));
assert.ok(existsSync(join(root, "docs/business/brand-icons/leather-lotus-source.jpg")));

assert.equal(
  BUSINESS_BRAND_MARK_PATH,
  `/business/brand/mark-leather.webp?v=${BUSINESS_BRAND_ICON_VERSION}`,
);
assert.equal(BUSINESS_BRAND_MARK_SRC, BUSINESS_BRAND_MARK_PATH);
const mark = readFileSync(pub(assetPath(BUSINESS_BRAND_MARK_PATH)));
assert.ok(mark.length < 60 * 1024, `in-app mark is ${mark.length} bytes`);
assert.equal(mark.toString("latin1", 0, 4), "RIFF");
assert.equal(mark.toString("latin1", 8, 12), "WEBP");
for (const webp of ["icon-512.webp", "icon-192.webp", "icon-maskable-512.webp", "apple-touch-icon.webp"]) {
  const bytes = readFileSync(pub(`/business/brand/${webp}`));
  assert.equal(bytes.toString("latin1", 0, 4), "RIFF", webp);
  assert.ok(bytes.length < readFileSync(pub(`/business/brand/${webp.replace(".webp", ".png")}`)).length, webp);
}
assert.ok(readFileSync(pub("/business/brand/icon-512.png")).length < 350 * 1024, "icon-512.png is not optimized");

const lockup = readFileSync(join(root, "src/components/business-app/BusinessBrandLockup.tsx"), "utf8");
const sidebar = readFileSync(join(root, "src/components/business-app/BusinessSidebar.tsx"), "utf8");
const shell = readFileSync(join(root, "src/components/business-app/BusinessAppShell.tsx"), "utf8");
const css = readFileSync(join(root, "src/components/business-app/business-app.css"), "utf8");
assert.equal(BUSINESS_BRAND_NAME, "АудиоЛад Бизнес");
assert.match(lockup, /BUSINESS_BRAND_MARK_SRC/);
assert.match(lockup, /BUSINESS_BRAND_NAME/);
assert.match(lockup, /business-app-brand__mark/);
assert.match(sidebar, /BusinessBrandLockup/);
assert.doesNotMatch(sidebar, /Аудиолад<\/p>|АБ/);
assert.match(shell, /business-app-topbar/);
assert.match(shell, /BusinessBrandLockup/);
assert.match(css, /\.business-app-brand__mark \{[^}]*border-radius:\s*50%/);
assert.match(css, /\.business-app-topbar \{\s*display:\s*none;/);

console.log("business-brand-icons-unit: ok");
