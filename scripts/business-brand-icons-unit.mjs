#!/usr/bin/env node
/** Each host gets its own manifest + icons; audiolad.ru stays unchanged. */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

console.log("business-brand-icons-unit: ok");
