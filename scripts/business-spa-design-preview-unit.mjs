#!/usr/bin/env node
// Offline source-contract checks. These do not replace React/browser or access tests.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

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
for (const id of ["home", "music", "locations", "more", "license", "alerts", "company", "support"]) {
  assert.ok(client.includes(`["${id}",`), `missing screen ${id}`);
}
for (const id of ["playing", "paused", "offline", "closed", "failed"]) {
  assert.match(client, new RegExp(`\\b${id}: \\{ label:`), `missing state ${id}`);
}
// mock-v3 (Oriy 2026-10-14): status names the point + last check; link and sound are distinct signals.
for (const id of ["playing", "paused", "offline", "closed", "failed"]) {
  const line = client.split("\n").find((l) => l.startsWith(`  ${id}: { label:`)) || "";
  for (const key of ["title: `", "${POINT}", "checked: \"", "link: [", "sound: ["]) assert.ok(line.includes(key), `state ${id} missing ${key}`);
}
assert.match(client, /Проверено минуту назад/);
assert.match(client, /closed: \{[^}]*tone: "closed"/);
assert.match(client, /failed: \{[^}]*tone: "bad"/);
assert.equal((client.match(/"bad"/g) || []).length, 2, "only confirmed playback failure may be red (tone + sound signal)");
// Bottom nav on phone; side nav on desktop lists every section.
assert.match(client, /\["home", "Главная"\], \["music", "Музыка"\], \["locations", "Точки"\], \["more", "Ещё"\]/);
assert.match(client, /className=\{styles\.bottomNav\}/);
assert.match(client, /className=\{styles\.sideNav\}/);
assert.doesNotMatch(css, /overflow-x:\s*auto/, "no horizontally scrolling tabs");
// Phone home order: status -> now playing -> atmosphere -> next change -> history link.
assert.match(client, /\{statusCard\}\{nowPlaying\}\{atmosphereCard\}\{nextChange\}\{historyLink\}/);
assert.match(client, /screen === "music" && <div className=\{styles\.stack\}>\{dayFull\}\{atmosphereCard\}\{historyCard\}/);
// Real cover asset, thin progress, explicit playback location, renamed action.
assert.match(client, /const COVER = "\/business\/design-preview\/now-playing-cover\.webp"/);
assert.ok(existsSync(new URL("../public/business/design-preview/now-playing-cover.webp", import.meta.url)));
assert.match(css, /\.progress \{ height:3px;/);
assert.match(client, /Управление музыкой ↗/);
assert.match(client, /Играет на плеере точки · \$\{PLAYER\}/);
assert.doesNotMatch(client, /Открыть плеер точки/);
assert.match(client, /state === "playing" \? `Играет на плеере точки/, "only confirmed playback says Играет");
assert.match(client, /На паузе на плеере точки/);
// Desktop side nav lists every section reachable from phone «Ещё».
for (const label of ["Лицензия и документы", "Уведомления", "Компания и оплата", "Поддержка"]) {
  assert.ok(client.split("const sideNav")[1].split("\n")[0].includes(label), `desktop nav missing ${label}`);
}
assert.match(client, /closed: \{[^\n]*checked: "Последняя связь/);
// Atmosphere: single range slider, auto badge + reset, reactions tied to current track.
assert.match(client, /type="range"/);
assert.match(client, /aria-label="Спокойнее — Энергичнее"/);
assert.match(client, /Автоматически/);
assert.match(client, /Вернуть автоматический режим/);
assert.match(client, /К треку «\{track\.title\}»/);
assert.doesNotMatch(client, /\[0, 1, 2, 3, 4\]/);
assert.match(client, /const needsAction = state === "offline" \|\| state === "failed";/);
assert.match(client, /\{needsAction && alertsCard\}/, "home shows notifications only when action is needed");
assert.doesNotMatch(css, /min-height:\s*(?:[0-3]?\d|4[0-7])px/, "touch targets must be >= 48px");
assert.match(client, /aria-live="polite"/);
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
