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
  "non-catalog routes such as / and /my-practices keep the combobox",
);

const searchUi = read(
  "src/components/playlists/catalog/PlaylistCatalogSearch.tsx",
);
assert.match(
  searchUi,
  /listener-catalog-mobile-search/,
  "playlist catalog reuses the product catalog mobile search class",
);
assert.match(
  searchUi,
  /listener-catalog-mobile-search[^"]*fixed top-0/,
  "mobile playlist search is a fixed top bar",
);
assert.match(
  searchUi,
  /listener-catalog-mobile-search[^"]*xl:hidden/,
  "mobile playlist search chrome is xl:hidden",
);
assert.match(
  searchUi,
  /listener-catalog-mobile-search-spacer/,
  "mobile playlist search has a matching spacer",
);
assert.match(
  searchUi,
  /listener-catalog-mobile-search-spacer[^"]*xl:hidden/,
  "playlist search spacer stays mobile-only",
);
assert.match(
  searchUi,
  /aria-hidden/,
  "playlist search spacer is aria-hidden",
);
assert.match(
  searchUi,
  /pt-\[max\(0\.25rem,env\(safe-area-inset-top,0px\)\)\] pb-0/,
  "playlist mobile search uses the catalog safe-area padding",
);
assert.match(searchUi, /hidden xl:block/, "desktop playlist search stays in-flow");
assert.match(
  searchUi,
  /data-playlist-catalog-search/,
  "playlist search keeps its data hook",
);
assert.match(searchUi, /Найти плейлист/, "playlist search keeps its placeholder");
assert.match(searchUi, /min-h-11/, "playlist field keeps min-h-11");
assert.match(searchUi, /min-h-\[52px\]/, "mobile field sits in the 52px chrome unit");
assert.doesNotMatch(
  searchUi,
  /visualViewport|visual-viewport/,
  "playlist search does not invent visualViewport JS",
);
assert.doesNotMatch(
  searchUi,
  /--catalog-mobile-search-height|--playlist-.*search-height/,
  "playlist search reuses the existing CSS var, does not declare a new one",
);
assert.doesNotMatch(
  searchUi,
  /MobileCatalogSearch|PlatformCatalogInlineSearch/,
  "playlist search does not reuse product catalog search components",
);
assert.doesNotMatch(
  searchUi,
  /PlaylistCatalogSort|PlaylistCatalogTopicFilter/,
  "sort and topic stay on the page, not in the 52px search row",
);

const page = read(
  "src/app/(platform)/(listener)/(playlists)/playlists/catalog/page.tsx",
);
assert.match(page, /PlaylistCatalogSearch/, "catalog page still mounts local search");
assert.match(page, /PlaylistCatalogSort/, "sort stays on the catalog page");
assert.match(
  page,
  /PlaylistCatalogTopicFilter/,
  "topic filter stays on the catalog page",
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
  /listener-catalog-mobile-search fixed top-0 inset-x-0 z-30/,
  "product catalog layout keeps its fixed mobile search",
);

const globals = read("src/app/globals.css");
assert.match(
  globals,
  /--catalog-mobile-search-height:\s*calc\(max\(0\.25rem,\s*env\(safe-area-inset-top,\s*0px\)\)\s*\+\s*52px\)/,
  "playlist catalog reuses the existing 52px + safe-area height",
);
assert.match(
  globals,
  /\.listener-catalog-mobile-search,\s*\n\.listener-catalog-mobile-search-spacer/,
  "search and spacer still share one min-height rule",
);

console.log("playlist-catalog-search-chrome-unit: ok");
