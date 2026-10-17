// AudioLad Business theme layer (task 21546de4): source-contract + contrast checks.
// Offline; does not replace visual review (screenshots are attached to the PR).
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BUSINESS_THEME_IDS,
  BUSINESS_THEMES,
  DEFAULT_BUSINESS_THEME,
  isBusinessThemeId,
  resolveBusinessTheme,
} from "../src/lib/business-app/theme";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p: string) => readFileSync(join(root, p), "utf8");

// 1. Registry: one theme today, safe fallback, broad hospitality segments.
assert.deepEqual([...BUSINESS_THEME_IDS], ["jazz-coffee"]);
assert.equal(DEFAULT_BUSINESS_THEME, "jazz-coffee");
assert.equal(resolveBusinessTheme(), "jazz-coffee");
assert.equal(resolveBusinessTheme("spa"), "jazz-coffee", "unknown theme falls back, no half-built SPA theme");
assert.equal(resolveBusinessTheme("jazz-coffee"), "jazz-coffee");
assert.equal(isBusinessThemeId("violet"), false);
for (const seg of ["coffee", "cafe", "bar", "restaurant", "hotel"]) {
  assert.ok(BUSINESS_THEMES["jazz-coffee"].segments.includes(seg), `segment ${seg}`);
}

// 2. Token block: every semantic token is defined for the theme.
const themeCss = read("src/components/business-app/theme/business-theme.css");
function tokenBlock(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing block ${selector}`);
  const body = css.slice(start, css.indexOf("\n}", start));
  const map = new Map<string, string>();
  for (const m of body.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) map.set(m[1], m[2].trim());
  return map;
}
const tokens = tokenBlock(themeCss, '[data-biz-theme="jazz-coffee"]');
const resolve = (name: string, depth = 0): string => {
  const v = tokens.get(name);
  assert.ok(v, `token ${name} not defined`);
  const ref = /^var\((--[a-z0-9-]+)\)$/.exec(v);
  return ref && depth < 5 ? resolve(ref[1], depth + 1) : v;
};
const REQUIRED = [
  "--biz-bg", "--biz-surface", "--biz-surface-soft", "--biz-surface-glass", "--biz-border", "--biz-border-strong",
  "--biz-text", "--biz-text-muted", "--biz-eyebrow", "--biz-accent", "--biz-accent-hover", "--biz-accent-soft",
  "--biz-accent-border", "--biz-on-accent", "--biz-highlight", "--biz-focus", "--biz-tooltip-bg", "--biz-tooltip-text",
  "--biz-green", "--biz-green-bg", "--biz-green-border", "--biz-green-ink",
  "--biz-yellow", "--biz-yellow-bg", "--biz-yellow-border", "--biz-yellow-ink",
  "--biz-red", "--biz-red-bg", "--biz-red-border", "--biz-red-ink", "--biz-danger",
  "--biz-neutral", "--biz-neutral-bg", "--biz-neutral-border", "--biz-neutral-ink",
  "--biz-progress-track", "--biz-cover", "--biz-shadow", "--biz-shadow-strong",
];
for (const t of REQUIRED) resolve(t);

// Every var(--biz-*) referenced by Business code is defined by the theme layer
// (only runtime-set layout variables are exempt).
const RUNTIME_VARS = new Set(["--biz-sidebar-width"]);
const structural = tokenBlock(themeCss, ".business-app-root");
const usedIn = [
  "src/components/business-app/business-app.css",
  "src/components/business-app/design-preview/design-preview.module.css",
  ...[...walkUsed("src/app/business-app"), ...walkUsed("src/components/business-app")].filter((p) => p.endsWith(".tsx")),
];
function walkUsed(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    const p = `${dir}/${name}`;
    if (statSync(join(root, p)).isDirectory()) walkUsed(p, out);
    else out.push(p);
  }
  return out;
}
for (const f of usedIn) {
  for (const m of read(f).matchAll(/var\((--biz-[a-z0-9-]+)/g)) {
    const name = m[1];
    if (RUNTIME_VARS.has(name)) continue;
    assert.ok(tokens.has(name) || structural.has(name), `${f}: ${name} is not defined in business-theme.css`);
  }
}

// 3. Readable contrasts (WCAG AA 4.5:1 for text pairs).
function lum(hex: string): number {
  const h = hex.replace("#", "");
  assert.match(h, /^[0-9a-f]{6}$/i, `expected #rrggbb, got ${hex}`);
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(resolve(a)), lum(resolve(b))];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const PAIRS: Array<[string, string]> = [
  ["--biz-text", "--biz-bg"], ["--biz-text", "--biz-surface"], ["--biz-text", "--biz-surface-soft"],
  ["--biz-text-muted", "--biz-bg"], ["--biz-text-muted", "--biz-surface"], ["--biz-text-muted", "--biz-surface-soft"],
  ["--biz-text-muted", "--biz-green-bg"], ["--biz-text-muted", "--biz-red-bg"],
  ["--biz-eyebrow", "--biz-bg"], ["--biz-eyebrow", "--biz-surface"],
  ["--biz-on-accent", "--biz-accent"], ["--biz-on-accent", "--biz-accent-hover"],
  ["--biz-accent", "--biz-surface"], ["--biz-accent", "--biz-bg"], ["--biz-accent", "--biz-accent-soft"],
  ["--biz-tooltip-text", "--biz-tooltip-bg"],
  ["--biz-green-ink", "--biz-green-bg"], ["--biz-green", "--biz-surface"],
  ["--biz-yellow-ink", "--biz-yellow-bg"], ["--biz-red-ink", "--biz-red-bg"], ["--biz-red", "--biz-surface"],
  ["--biz-neutral-ink", "--biz-neutral-bg"],
];
for (const [fg, bg] of PAIRS) {
  const r = contrast(fg, bg);
  assert.ok(r >= 4.5, `${fg} on ${bg} contrast ${r.toFixed(2)} < 4.5`);
}

// 4. Warm, not violet: the accent hue sits in the brown/coffee range.
function hue(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  const raw = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (raw * 60 + 360) % 360;
}
for (const t of ["--biz-accent", "--biz-accent-hover", "--biz-highlight", "--biz-text", "--biz-bg"]) {
  const h = hue(resolve(t));
  assert.ok(h >= 15 && h <= 50, `${t} hue ${h.toFixed(0)}° is not warm`);
}
assert.doesNotMatch(themeCss, /#7042c5|#6d5bd0|#f4edfb|#f7f4fb/i, "old lavender/violet palette is gone");

// 5. Continuity with the public atlas (/b/atlas-kofeen) on base colours.
const atlas = tokenBlock(read("src/components/business/coffee-atlas/coffee-atlas.css"), ".coffee-atlas");
assert.equal(resolve("--biz-bg"), atlas.get("--atlas-bg"));
assert.equal(resolve("--biz-text"), atlas.get("--atlas-ink"));
assert.equal(resolve("--biz-text-muted"), atlas.get("--atlas-muted"));

// 6. Wiring: layout loads the token layer first and sets the theme id; manifest + viewport match.
const layout = read("src/app/business-app/layout.tsx");
assert.ok(
  layout.indexOf('import "@/components/business-app/theme/business-theme.css";') <
    layout.indexOf('import "@/components/business-app/business-app.css";'),
  "theme tokens load before component CSS",
);
const rootTag = /<div\b[^>]*business-app-root[^>]*>/.exec(layout)?.[0] ?? "";
assert.ok(rootTag, "layout renders .business-app-root");
assert.match(rootTag, /data-biz-theme=\{theme\}/, "root carries the theme id");
assert.doesNotMatch(layout, /next\/font\/google/, "no extra next/font/google instance (Turbopack resolve flake)");
assert.match(themeCss, /--biz-font-display: "Playfair Display", Georgia/);
assert.match(layout, /themeColor: BUSINESS_THEMES\[theme\]\.themeColor/);
const manifest = JSON.parse(read("public/business/brand/manifest.webmanifest"));
assert.equal(manifest.theme_color, BUSINESS_THEMES["jazz-coffee"].themeColor);
assert.equal(manifest.background_color, resolve("--biz-bg"));
assert.equal(BUSINESS_THEMES["jazz-coffee"].themeColor, resolve("--biz-bg"));
assert.match(themeCss, new RegExp(`html:has\\(\\.business-app-root\\[data-biz-theme="jazz-coffee"\\]\\)[^{]*\\{\\s*background: ${resolve("--biz-bg")};`));

// 7. The token layer is Business-only: imported by the business-app layout and nowhere else.
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(root, dir))) {
    const p = `${dir}/${name}`;
    if (statSync(join(root, p)).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(name)) out.push(p);
  }
  return out;
}
const importers = walk("src").filter((p) => /import\s+["']@\/components\/business-app\/theme\/business-theme\.css["']/.test(read(p)));
assert.deepEqual(importers, ["src/app/business-app/layout.tsx"]);

// 8. No colours outside the token layer: no hex/rgb in Business CSS, no hard-coded
//    palette classes, inline colour styles or dark-on-light leftovers in Business TSX.
const cssFiles = [
  "src/components/business-app/business-app.css",
  "src/components/business-app/design-preview/design-preview.module.css",
];
for (const f of cssFiles) {
  assert.doesNotMatch(read(f), /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, `${f}: colour literal outside theme tokens`);
}
assert.doesNotMatch(read(cssFiles[1]), /--violet/, "design preview uses theme accent, not its own violet");
const tsx = [...walk("src/app/business-app"), ...walk("src/components/business-app")].filter((p) => p.endsWith(".tsx"));
const FORBIDDEN = [
  /#[0-9a-f]{3,8}\b/i,
  /\b(?:bg|text|border|ring|from|to|via|fill|stroke)-(?:violet|purple|indigo|fuchsia|emerald|green|red|amber|yellow|sky|blue|slate|gray|zinc|neutral|stone|white|black)\b/,
  /\b(?:bg|text|border)-(?:white|black)\/\d+/,
  /style=\{\{[^}]*(?:color|background|border)/,
];
for (const f of tsx) {
  const src = read(f);
  for (const re of FORBIDDEN) assert.doesNotMatch(src, re, `${f}: ${re} — use --biz-* tokens / shared classes`);
}

// 9. Shared building blocks exist once (no per-screen copies).
const appCss = read(cssFiles[0]);
for (const cls of [
  "business-app-card", "business-app-btn-primary", "business-app-btn-secondary", "business-app-eyebrow",
  "business-app-alert", "business-app-badge", "business-app-list-row", "business-app-input", "business-app-tracklist",
]) {
  assert.equal((appCss.match(new RegExp(`^\\.${cls} \\{`, "gm")) || []).length, 1, `.${cls} defined exactly once`);
}
// Mobile bottom nav fits every item on one row (6 items incl. «Ещё»).
const bottomNav = /\.business-app-bottom-nav \{([^}]*)\}/.exec(appCss)?.[1] ?? "";
assert.match(bottomNav, /grid-auto-flow:\s*column/);
assert.match(bottomNav, /grid-auto-columns:\s*minmax\(0,\s*1fr\)/);
assert.doesNotMatch(bottomNav, /grid-template-columns/);

// 10. Shared components with their own colours (SimpleMarkdown, used by public pages too)
//     are re-coloured inside Business through a scoped wrapper.
const docPage = read("src/app/business-app/documents/[id]/page.tsx");
assert.match(docPage, /<div className="business-app-prose">\s*<SimpleMarkdown /);
for (const sel of [/\.business-app-prose > div \{[^}]*color:\s*var\(--biz-text\)/, /\.business-app-prose blockquote \{[^}]*background:\s*var\(--biz-/, /\.business-app-prose th,\s*\.business-app-prose td \{[^}]*border-color:\s*var\(--biz-border\)/]) {
  assert.match(appCss, sel);
}
// Every Business TSX that renders a shared colourful component must use a scoped wrapper.
for (const f of tsx) {
  if (/<SimpleMarkdown\b/.test(read(f))) assert.match(read(f), /business-app-prose/, `${f}: wrap SimpleMarkdown in .business-app-prose`);
}

console.log("business-app-theme-unit: ok");
