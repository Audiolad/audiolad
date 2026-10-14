#!/usr/bin/env node
// Offline source-contract checks. These do not replace React/browser or access tests.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const route = read("src/app/business-app/spa/design-preview/page.tsx");
const client = read("src/components/business-app/design-preview/SpaDesignPreview.tsx");
const css = read("src/components/business-app/design-preview/design-preview.module.css");
const source = `${route}\n${client}\n${css}`;

assert.match(route, /import\s*\{\s*loadSpaPilotContext\s*\}\s*from\s*["']@\/lib\/business-app\/spa-pilot["']/);
assert.match(route, /const ctx = await loadSpaPilotContext\(\);\s*if \(!ctx\) notFound\(\);/);
assert.ok(route.indexOf("if (!ctx) notFound();") < route.indexOf("return <SpaDesignPreview"));
assert.match(route, /export const dynamic = ["']force-dynamic["']/);
assert.match(route, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false/);
assert.match(route, /googleBot:\s*\{\s*index:\s*false,\s*follow:\s*false/);
assert.match(client, /<strong>Макет — не реальные данные<\/strong>/);
for (const id of ["home", "day", "atmosphere", "license", "alerts", "locations"]) {
  assert.ok(client.includes(`["${id}",`), `missing screen ${id}`);
}
for (const id of ["playing", "paused", "offline", "closed", "failed"]) {
  assert.match(client, new RegExp(`\\b${id}: \\{ label:`), `missing state ${id}`);
}
// Oriy 2026-10-14: connectivity != playback; closed hours are calm, long tracks never red.
for (const title of ["Музыка играет", "Воспроизведение остановлено", "Нет связи с плеером", "Точка закрыта", "Музыка не играет"]) {
  assert.ok(client.includes(`title: "${title}"`), `missing status title ${title}`);
}
assert.match(client, /closed: \{[^}]*tone: "closed"/);
assert.match(client, /failed: \{[^}]*tone: "bad"/);
assert.equal((client.match(/tone: "bad"/g) || []).length, 1, "only confirmed playback failure may be red");
assert.match(client, /Что сейчас играет/);
assert.match(client, /Что звучало/);
assert.match(client, /disabled=\{!hasTrack\}/);
assert.match(client, /aria-live="polite"/);
assert.match(client, /aria-pressed=\{screen === id\}/);
assert.match(css, /\.phone\s*\{\s*max-width:\s*390px/);
assert.match(css, /@container \(min-width: 680px\)/);
assert.match(css, /:focus-visible/);

// The only server read is the reused access gate. No player, action, media,
// new networking, browser persistence, or environment bypass in the preview.
assert.doesNotMatch(source, /<audio\b|new\s+(?:Audio|AudioContext)\b|\.play\(|fetch\s*\(|XMLHttpRequest|WebSocket/);
assert.doesNotMatch(source, /(?:localStorage|sessionStorage|indexedDB|caches|process\.env)\b|["']use server["']/);
assert.doesNotMatch(source, /fetchSpaManifestRaw|SpaOnlinePlayer|SpaPilotPlayer|SpaPlayerEngine|\/actions["']/);
const imports = [...client.matchAll(/from\s*["']([^"']+)["']/g)].map((m) => m[1]);
assert.deepEqual(imports, ["react", "./design-preview.module.css"]);

assert.doesNotMatch(source, /orange|#f97316|#fb923c|#ea580c|#ff[89a-f][0-9a-f]00/i);
// Catch nearby warm hues in all hex literals, not only a single exact accent.
for (const [literal] of source.matchAll(/#[0-9a-f]{3,8}\b/gi)) {
  let hex = literal.slice(1);
  if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join("");
  if (hex.length !== 6 && hex.length !== 8) continue;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const hi = Math.max(r, g, b), lo = Math.min(r, g, b), delta = hi - lo;
  const hue = delta === 0 ? 0 : hi === r ? ((g - b) / delta + 6) % 6 * 60 : hi === g ? ((b - r) / delta + 2) * 60 : ((r - g) / delta + 4) * 60;
  const lightness = (hi + lo) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  assert.ok(!(hue >= 15 && hue <= 50 && saturation > 0.25), `warm accent forbidden: ${literal}`);
}

console.log("business-spa-design-preview-unit: PASS (static source checks; no runtime/browser verification)");
