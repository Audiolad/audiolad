#!/usr/bin/env node
/**
 * MAX Mini App shell: internal tabs and bottom nav, not ordinary AudioLad routes.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (relative) => readFileSync(join(root, relative), "utf8");

const tabs = read("src/lib/max/primary-tabs.ts");
const nav = read("src/components/max/MaxBottomNav.tsx");
const placeholder = read("src/components/max/MaxTabPlaceholder.tsx");
const home = read("src/components/max/MaxAuthenticatedHome.tsx");
const hook = read("src/components/max/useMaxAudioPlayback.ts");
const icons = read("src/components/BottomNavIcons.tsx");
const pkg = read("package.json");

const strip = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const tabItems = [
  ...tabs.matchAll(/\{\s*id:\s*"([^"]+)",\s*label:\s*"([^"]+)"\s*\}/g),
];
assert.equal(tabItems.length, 5, "exactly 5 primary tabs");
assert.deepEqual(
  tabItems.map((item) => item[1]),
  ["home", "catalog", "library", "playlists", "profile"],
);
assert.deepEqual(
  tabItems.map((item) => item[2]),
  ["Главная", "Каталог", "Аудиотека", "Плейлисты", "Профиль"],
);
assert.match(tabs, /export const MAX_INITIAL_PRIMARY_TAB: MaxPrimaryTab = "catalog"/);
assert.match(home, /useState<MaxPrimaryTab>\(MAX_INITIAL_PRIMARY_TAB\)/);
assert.match(nav, /MAX_PRIMARY_TABS\.map/);
assert.match(nav, /aria-current=\{active \? "page" : undefined\}/);
assert.match(nav, /type="button"/);
assert.match(nav, /<button/);
assert.doesNotMatch(nav, /<a[\s>]|<Link|href=/);
assert.match(nav, /aria-label="Основная навигация"/);
assert.match(nav, /aria-label=\{tab\.label\}/);
assert.match(nav, /min-h-11/);
assert.match(nav, /min-w-11/);
assert.match(nav, /focus-visible:outline/);

for (const icon of [
  "HomeNavIcon",
  "CatalogNavIcon",
  "LibraryNavIcon",
  "PlaylistsNavIcon",
  "ProfileNavIcon",
]) {
  assert.match(nav, new RegExp(`\\b${icon}\\b`));
  assert.match(icons, new RegExp(`export function ${icon}`));
}
assert.match(nav, /from "@\/components\/BottomNavIcons"/);
assert.doesNotMatch(icons, /usePathname|createPortal|next\/link|next\/navigation|href=/);

const navSources = strip(`${tabs}\n${nav}\n${placeholder}`);
assert.doesNotMatch(
  navSources,
  /href\s*=\s*["']\/|router\.push|window\.location|openLink|\/my-practices|\/playlists\/|\/catalog["']/,
);
assert.doesNotMatch(
  strip(home),
  /window\.location|router\.push|openLink|href=["']\/|\/my-practices|\/playlists\/|\/catalog["']/,
);
assert.doesNotMatch(
  `${home}\n${nav}\n${tabs}`,
  /from "@\/components\/BottomNav"|from "@\/lib\/navigation\/listener-nav"|from "@\/lib\/navigation\/bottom-nav"|usePathname|createPortal/,
);

assert.match(nav, /fixed inset-x-0 bottom-0/);
assert.match(nav, /z-20 w-full/);
assert.match(nav, /grid-cols-5/);
assert.match(nav, /flex-col/);
assert.match(nav, /border-t border-\[#eadff8\]/);
assert.match(nav, /bg-white/);
assert.match(nav, /shadow-\[0_-8px_30px_rgba\(86,52,141,0\.08\)\]/);
assert.match(nav, /text-\[#7042c5\]/);
assert.match(nav, /text-\[#81759f\]/);
assert.match(nav, /pb-\[env\(safe-area-inset-bottom,0px\)\]/);
assert.match(tabs, /MAX_BOTTOM_NAV_MAIN_HEIGHT_PX = 68/);
assert.match(
  tabs,
  /calc\(\$\{MAX_BOTTOM_NAV_MAIN_HEIGHT_PX\}px \+ env\(safe-area-inset-bottom, 0px\) \+ 16px\)/,
);
assert.match(nav, /height: `\$\{MAX_BOTTOM_NAV_MAIN_HEIGHT_PX\}px`/);
assert.match(home, /paddingBottom: MAX_SHELL_CONTENT_BOTTOM_PADDING/);

assert.match(home, /activeTab === "catalog" \?/);
assert.match(home, /<MaxTabPlaceholder title=\{activeTabLabel\} \/>/);
assert.match(home, /MAX_PRIMARY_TABS\.find\(\(tab\) => tab\.id === activeTab\)/);
assert.match(placeholder, /<h1[^>]*>\{title\}<\/h1>/);
assert.match(placeholder, /Раздел готовится\./);
assert.match(home, /setActiveTab\(next\)/);

assert.match(
  home,
  /<ul className="mt-5 -mx-4 grid grid-cols-2 gap-\[6px\] px-\[6px\]">/,
);
assert.match(home, /grid-cols-2/);
assert.match(home, /gap-\[6px\]/);
assert.match(home, /-mx-4/);
assert.match(home, /px-\[6px\]/);

const gate = home.indexOf('{activeTab === "catalog" && selected ? (');
const player = home.indexOf("<MaxAudioPlayer");
const navUse = home.indexOf("<MaxBottomNav");
assert.ok(gate >= 0, "product detail stays on the catalog tab");
assert.equal(home.split("<MaxAudioPlayer").length - 1, 1);
assert.ok(player > gate, "player stays inside the catalog detail gate");
assert.ok(navUse > player, "bottom nav is outside the detail overlay");
assert.match(home, /\{selected \? null : \(\s*<MaxBottomNav/);
assert.match(
  home,
  /← Назад в каталог[\s\S]*setPlayback\(\{ status: "idle" \}\); setDetail\(\{ status: "idle" \}\); setSelected\(null\)|setPlayback\(\{ status: "idle" \}\); setDetail\(\{ status: "idle" \}\); setSelected\(null\)[\s\S]*← Назад в каталог/,
);

const selectFn = home.slice(
  home.indexOf("function selectMaxTab"),
  home.indexOf("const activeTabLabel"),
);
assert.match(selectFn, /if \(next === activeTab\)/);
assert.match(selectFn, /if \(activeTab === "catalog"\)/);
assert.match(
  selectFn,
  /setPlayback\(\{ status: "idle" \}\); setDetail\(\{ status: "idle" \}\); setSelected\(null\)/,
);
assert.match(selectFn, /setActiveTab\(next\)/);
assert.match(home, /\}, \[selected\]\)/);
assert.match(home, /\}, \[detail\.status, selected\]\)/);
assert.match(home, /controller\.abort\(\)/);
assert.match(hook, /audio\.pause\(\)/);
assert.match(hook, /return \(\) => \{\s*invalidatePlayback\(\);\s*\};/);

assert.match(home, /MAX_PLAYBACK_AUDIO_PATH/);
assert.match(home, /MAX_PLAYBACK_PREVIEW_PATH/);
assert.match(home, /playback\.session\.playbackMode === "preview"/);
assert.match(home, /URL\.createObjectURL\(blob\)/);
assert.match(home, /objectUrl: true/);
assert.match(home, /Предпрослушивание пока недоступно/);
assert.match(home, /Для прослушивания нужен доступ к продукту/);
const readyHome = home.slice(home.indexOf('{detail.status === "ready" ?'));
assert.ok(
  readyHome.indexOf("detail.product.priceLabel") < readyHome.indexOf("<MaxAudioPlayer"),
);
assert.ok(
  readyHome.indexOf("<MaxAudioPlayer") < readyHome.indexOf("detail.product.description"),
);
assert.ok(
  readyHome.indexOf("preview_unavailable") < readyHome.indexOf("detail.product.description"),
);

assert.match(pkg, /"test:max-bottom-nav": "node scripts\/max-bottom-nav-unit\.mjs"/);
assert.match(pkg, /npm run test:max-bottom-nav/);

console.log("max-bottom-nav-unit: ok");
