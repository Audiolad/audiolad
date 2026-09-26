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
const catalogSearch = read("src/components/max/MaxCatalogSearch.tsx");
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
assert.match(tabs, /MAX_TAB_BAR_HEIGHT_PX = 68/);
assert.match(
  tabs,
  /calc\(\$\{MAX_TAB_BAR_HEIGHT_PX\}px \+ env\(safe-area-inset-bottom, 0px\) \+ 16px\)/,
);
assert.match(nav, /height: `\$\{MAX_TAB_BAR_HEIGHT_PX\}px`/);
assert.match(home, /paddingBottom: MAX_SHELL_CONTENT_BOTTOM_PADDING/);

assert.match(home, /activeTab === "catalog" \?/);
assert.match(home, /<MaxTabPlaceholder title=\{activeTabLabel\} \/>/);
assert.match(home, /MAX_PRIMARY_TABS\.find\(\(tab\) => tab\.id === activeTab\)/);
assert.match(placeholder, /<h1[^>]*>\{title\}<\/h1>/);
assert.match(placeholder, /Раздел готовится\./);
assert.match(home, /setActiveTab\(next\)/);

assert.match(
  catalogSearch,
  /<ul className="mt-5 -mx-4 grid grid-cols-2 gap-\[6px\] px-\[6px\]">/,
);
assert.match(catalogSearch, /grid-cols-2/);
assert.match(catalogSearch, /gap-\[6px\]/);
assert.match(catalogSearch, /-mx-4/);
assert.match(catalogSearch, /px-\[6px\]/);

const gate = home.indexOf('{activeTab === "catalog" && selected ? (');
const player = home.indexOf("<MaxAudioPlayer");
const navUse = home.indexOf("<MaxBottomNav");
assert.ok(gate >= 0, "product detail stays on the catalog tab");
assert.equal(home.split("<MaxAudioPlayer").length - 1, 1);
assert.ok(player > gate, "player stays inside the catalog detail gate");
assert.ok(navUse > player, "bottom nav stays after the detail player in source");
assert.match(home, /<MaxBottomNav activeTab=\{activeTab\} onSelectTab=\{selectMaxTab\} \/>/);
assert.doesNotMatch(home, /\{selected \? null : \(\s*<MaxBottomNav/);
assert.match(home, /MAX_TAB_BAR_HEIGHT_PX/);
assert.match(
  home,
  /← Назад в каталог[\s\S]*setPlayback\(\{ status: "idle" \}\); setDetail\(\{ status: "idle" \}\); setSelected\(null\)|setPlayback\(\{ status: "idle" \}\); setDetail\(\{ status: "idle" \}\); setSelected\(null\)[\s\S]*← Назад в каталог/,
);

const selectFn = home.slice(
  home.indexOf("function selectMaxTab"),
  home.indexOf("const activeTabLabel"),
);
assert.match(selectFn, /if \(next === activeTab\)/);
assert.match(selectFn, /if \(next === "catalog" && selected\) closeProductDetail\(\)/);
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
const detailView = read("src/components/max/MaxProductDetailView.tsx");
assert.doesNotMatch(`${readyHome}\n${detailView}`, /detail\.product\.description|product\.description/);
assert.match(detailView, /data-max-product-price/);
assert.match(detailView, /product\.priceLabel/);
assert.ok(
  readyHome.indexOf("preview_unavailable") < readyHome.indexOf("<MaxAudioPlayer"),
);

assert.match(pkg, /"test:max-bottom-nav": "node scripts\/max-bottom-nav-unit\.mjs"/);
assert.match(pkg, /npm run test:max-bottom-nav/);

const logo = read("src/components/brand/AudioladHorizontalLogo.tsx");
const bridge = read("src/components/max/MaxBridgeScript.tsx");
assert.match(logo, /href\?: string \| null/);
assert.match(logo, /href = "\/"/);
assert.match(logo, /if \(href === null\)/);
const nullLogoBranch = logo.slice(logo.indexOf("if (href === null)"), logo.indexOf("<Link"));
assert.match(nullLogoBranch, /<span className=\{resolvedLinkClassName\}>/);
assert.doesNotMatch(nullLogoBranch, /<Link|href=|router\.push|window\.location|openLink/);
assert.match(logo, /<Link href=\{href\}/);
assert.doesNotMatch(strip(logo), /router\.push|window\.location|openLink/);

function logoCall(source, label) {
  const start = source.indexOf("<AudioladHorizontalLogo");
  assert.ok(start >= 0, `${label} renders the shared logo`);
  const end = source.indexOf("/>", start);
  assert.ok(end > start, `${label} logo call is closed`);
  return source.slice(start, end + 2);
}

const homeLogo = logoCall(home, "MAX header");
assert.match(homeLogo, /href=\{null\}/);
assert.doesNotMatch(homeLogo, /href=["']\/|onClick|router\.push|window\.location|openLink|<Link|<a[\s>]/);
const bridgeLogo = logoCall(bridge, "MAX guest");
assert.match(bridgeLogo, /href=\{null\}/);
assert.doesNotMatch(bridgeLogo, /href=["']\/|onClick|router\.push|window\.location|openLink/);

for (const ordinary of [
  "src/components/home/HomePageShell.tsx",
  "src/components/become-author/BecomeAuthorContent.tsx",
  "src/components/legal/LegalPageShell.tsx",
  "src/components/listener/HomeMobileHeader.tsx",
  "src/app/(platform)/studio/meditation/page.tsx",
]) {
  const source = read(ordinary);
  const call = logoCall(source, ordinary);
  assert.doesNotMatch(call, /href=\{null\}|href=/);
}

console.log("max-bottom-nav-unit: ok");
