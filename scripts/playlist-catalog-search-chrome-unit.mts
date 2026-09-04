import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { isPublicPlaylistCatalogPath } from "../src/lib/auth/routes";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function pathnameWithoutQuery(href: string) {
  return href.split("?")[0] ?? href;
}

assert.equal(isPublicPlaylistCatalogPath("/playlists/catalog"), true);
assert.equal(
  isPublicPlaylistCatalogPath(
    pathnameWithoutQuery("/playlists/catalog?q=деньги"),
  ),
  true,
  "query string is not part of the pathname matcher",
);
assert.equal(isPublicPlaylistCatalogPath("/playlists/catalog/"), true);
assert.equal(isPublicPlaylistCatalogPath("/playlists"), false);
assert.equal(isPublicPlaylistCatalogPath("/playlists/saved"), false);
assert.equal(isPublicPlaylistCatalogPath("/catalog"), false);
assert.equal(isPublicPlaylistCatalogPath("/my-practices"), false);
assert.equal(isPublicPlaylistCatalogPath("/"), false);

const shellSearch = read("src/components/listener/DesktopShellSearch.tsx");
assert.match(
  shellSearch,
  /isPublicPlaylistCatalogPath/,
  "shell search reuses the public playlist catalog matcher",
);
assert.match(
  shellSearch,
  /if \(isPublicPlaylistCatalogPath\(pathname\)\) \{\s*return null;/,
  "playlist catalog hides the shell product combobox",
);
assert.match(
  shellSearch,
  /pathname === ["']\/my-practices["'] \|\| pathname\.startsWith\(["']\/my-practices\//,
  "audioteka hides the shell product combobox",
);
assert.doesNotMatch(
  shellSearch,
  /pathname === ["']\/playlists["'] \|\| pathname\.startsWith\(["']\/playlists["']\)/,
  "shell search does not hide on every /playlists route",
);
assert.match(
  shellSearch,
  /pathname === ["']\/catalog["'] \|\| pathname\.startsWith\(["']\/catalog["']\)/,
  "product catalog still uses inline product search",
);
assert.doesNotMatch(
  shellSearch,
  /if \(isCatalogRoute\) \{\s*return null;/,
  "shell search still renders on /catalog",
);
assert.match(
  shellSearch,
  /PlatformCatalogInlineSearch density="compact"/,
  "/catalog keeps compact product search",
);
assert.match(
  shellSearch,
  /PlatformSearchCombobox/,
  "non-catalog routes such as home still keep the combobox",
);

const searchUi = read(
  "src/components/playlists/catalog/PlaylistCatalogSearch.tsx",
);
const mobileTopChrome = read("src/components/listener/MobileTopChrome.tsx");
const mobileTopChromeLib = read("src/lib/listener/mobile-top-chrome.ts");
assert.match(
  searchUi,
  /<MobileTopChrome variant=["']playlists["']/,
  "playlist catalog uses the shared MobileTopChrome primitive",
);
assert.match(
  mobileTopChrome,
  /fixed top-0 inset-x-0/,
  "mobile playlist search is a fixed top bar",
);
assert.match(
  mobileTopChrome,
  /xl:hidden/,
  "mobile playlist search chrome is xl:hidden",
);
assert.match(
  mobileTopChrome,
  /data-mobile-top-chrome-spacer/,
  "mobile playlist search has a matching spacer",
);
assert.match(
  mobileTopChrome,
  /mobile-top-chrome-spacer[^"]*xl:hidden/,
  "playlist search spacer stays mobile-only",
);
assert.match(
  mobileTopChrome,
  /aria-hidden/,
  "playlist search spacer is aria-hidden",
);
assert.match(
  mobileTopChrome,
  /playlists: "px-5 pt-\[max\(0\.25rem,env\(safe-area-inset-top,0px\)\)\] pb-0"/,
  "playlist chrome keeps its own padding; spacer tracks measured height",
);
assert.match(
  mobileTopChrome,
  /ResizeObserver/,
  "playlist spacer height comes from ResizeObserver, not a shared CSS var",
);
assert.match(
  mobileTopChromeLib,
  /function spacerStyleFromChromeHeight/,
  "measurement contract lives in one helper",
);
assert.match(
  searchUi,
  /replaceListingSearch/,
  "playlist search replace uses the shared scroll:false helper",
);
assert.match(
  searchUi,
  /sticky top-0[^"]*hidden[^"]*xl:block|hidden[^"]*xl:block[^"]*sticky top-0/,
  "desktop playlist search is sticky top-0 and hidden xl:block",
);
assert.match(
  searchUi,
  /sticky top-0[^"]*bg-platform-surface|bg-platform-surface[^"]*sticky top-0/,
  "sticky desktop search covers cards with the surface color",
);
assert.doesNotMatch(
  mobileTopChrome,
  /sticky/,
  "shared mobile chrome stays fixed, not sticky",
);
assert.match(
  searchUi,
  /data-playlist-catalog-search/,
  "playlist search keeps its data hook",
);
assert.match(searchUi, /Найти плейлист/, "playlist search keeps its placeholder");
assert.match(searchUi, /min-h-11/, "playlist field keeps min-h-11");
assert.match(searchUi, /min-h-\[52px\]/, "mobile field sits in the 52px chrome unit");
assert.match(
  searchUi,
  /text-base|text-\[16px\]/,
  "search input is at least 16px so iOS does not zoom",
);
assert.doesNotMatch(
  searchUi,
  /text-sm/,
  "search input no longer uses text-sm",
);
assert.doesNotMatch(
  searchUi,
  /visualViewport|visual-viewport/,
  "playlist search does not invent visualViewport JS",
);
assert.doesNotMatch(
  searchUi,
  /--catalog-mobile-search-height|--playlist-.*search-height|--mobile-top-chrome-fallback/,
  "playlist search does not hardcode a live height contract",
);
assert.doesNotMatch(
  searchUi,
  /MobileCatalogSearch|PlatformCatalogInlineSearch/,
  "playlist search does not reuse product catalog search components",
);
assert.doesNotMatch(
  searchUi,
  /PlaylistCatalogSort|PlaylistCatalogTopicFilter/,
  "sort and topic stay unmounted from the 52px search row",
);

const page = read(
  "src/app/(platform)/(listener)/(playlists)/playlists/catalog/page.tsx",
);
assert.match(page, /PlaylistCatalogSearch/, "catalog page still mounts local search");
assert.doesNotMatch(
  page,
  /PlaylistCatalogSort/,
  "sort is unmounted from the catalog page",
);
assert.doesNotMatch(
  page,
  /PlaylistCatalogTopicFilter/,
  "topic filter is unmounted from the catalog page",
);
assert.match(
  page,
  /<h1 className="sr-only">\s*Каталог плейлистов\s*<\/h1>/,
  "catalog keeps a visually hidden h1",
);
assert.doesNotMatch(
  page,
  /xl:not-sr-only/,
  "catalog title is no longer shown on desktop",
);

const playlistsLayout = read(
  "src/app/(platform)/(listener)/(playlists)/playlists/layout.tsx",
);
assert.doesNotMatch(
  playlistsLayout,
  /listener-catalog-mobile-search/,
  "playlists layout has no catalog mobile search chrome",
);
assert.doesNotMatch(
  playlistsLayout,
  /PlaylistCatalogSearch|fixed top-0/,
  "playlists layout does not mount playlist catalog search chrome",
);
assert.doesNotMatch(
  playlistsLayout,
  /PlaylistCatalogSort|PlaylistCatalogTopicFilter/,
  "playlists layout has no sort or topic chrome",
);

const catalogLayout = read(
  "src/app/(platform)/(listener)/(catalog)/catalog/layout.tsx",
);
assert.match(
  catalogLayout,
  /MobileCatalogSearch/,
  "product catalog layout is unchanged and still mounts MobileCatalogSearch",
);
assert.match(
  catalogLayout,
  /<MobileTopChrome variant=["']catalog["']/,
  "product catalog layout keeps shared MobileTopChrome",
);
assert.doesNotMatch(
  catalogLayout,
  /PlaylistCatalogSort|PlaylistCatalogTopicFilter/,
  "product catalog layout has no playlist sort or topic chrome",
);

const globals = read("src/app/globals.css");
assert.match(
  globals,
  /--mobile-top-chrome-fallback-playlists:\s*calc\(\s*max\(0\.25rem,\s*env\(safe-area-inset-top,\s*0px\)\)\s*\+\s*52px\s*\)/,
  "playlist spacer fallback is first-paint only",
);
assert.doesNotMatch(
  globals,
  /--catalog-mobile-search-height/,
  "shared live --catalog-mobile-search-height contract is gone",
);
assert.match(
  globals,
  /\.mobile-top-chrome-spacer\[data-mobile-top-chrome-variant="playlists"\]/,
  "playlist fallback min-height is spacer-only",
);
assert.doesNotMatch(
  globals,
  /\.mobile-top-chrome,\s*\n\.mobile-top-chrome-spacer \{/,
  "chrome and spacer do not share one live min-height rule",
);

console.log("playlist-catalog-search-chrome-unit: ok");
