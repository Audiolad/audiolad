import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MOBILE_TOP_CHROME_FALLBACK_VARS,
  MOBILE_TOP_CHROME_VARIANTS,
  spacerStyleFromChromeHeight,
} from "../src/lib/listener/mobile-top-chrome";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

assert.deepEqual(MOBILE_TOP_CHROME_VARIANTS, [
  "catalog",
  "playlists",
  "library",
]);
assert.equal(
  MOBILE_TOP_CHROME_FALLBACK_VARS.catalog,
  "--mobile-top-chrome-fallback-catalog",
);
assert.equal(spacerStyleFromChromeHeight(null), undefined);
assert.equal(spacerStyleFromChromeHeight(-1), undefined);
assert.deepEqual(spacerStyleFromChromeHeight(144), {
  height: "144px",
  minHeight: "144px",
});

const chrome = read("src/components/listener/MobileTopChrome.tsx");
const chromeLib = read("src/lib/listener/mobile-top-chrome.ts");
const globals = read("src/app/globals.css");
const catalogLayout = read(
  "src/app/(platform)/(listener)/(catalog)/catalog/layout.tsx",
);
const playlistSearch = read(
  "src/components/playlists/catalog/PlaylistCatalogSearch.tsx",
);
const libraryChrome = read(
  "src/components/my-practices/MyPracticesLibraryChrome.tsx",
);
const libraryLayout = read(
  "src/app/(platform)/(listener)/(library)/my-practices/layout.tsx",
);
const catalogSearch = read(
  "src/components/listener/PlatformCatalogInlineSearch.tsx",
);
const catalogFilters = read("src/components/catalog/CatalogMobileFilters.tsx");
const libraryFilters = read(
  "src/components/my-practices/MyPracticesLibraryFilters.tsx",
);
const libraryGrid = read("src/components/my-practices/MyPracticesLibrary.tsx");
const listingNav = read("src/lib/listener/listing-search-navigation.ts");
const searchField = read("src/components/listener/PlatformSearchField.tsx");
const librarySearch = read(
  "src/components/my-practices/MyPracticesLibrarySearch.tsx",
);
const debugOverlay = read(
  "src/components/listener/MobileChromeDebugOverlay.tsx",
);
const debugLib = read("src/lib/listener/mobile-chrome-debug.ts");
const bottomNav = read("src/components/BottomNav.tsx");
const shellRoot = read("src/components/listener/ListenerAppShellRoot.tsx");

assert.match(chrome, /ResizeObserver/);
assert.match(chrome, /getBoundingClientRect\(\)\.height/);
assert.match(chrome, /spacerStyleFromChromeHeight\(spacerHeightPx\)/);
assert.match(chrome, /fixed top-0 inset-x-0 z-30/);
assert.match(chrome, /xl:hidden/);
assert.doesNotMatch(chrome, /sticky|visualViewport|--vh|translate3d/);
assert.match(
  chromeLib,
  /these tokens must never become a shared min-height/,
);

assert.match(catalogLayout, /<MobileTopChrome variant=["']catalog["']/);
assert.match(playlistSearch, /<MobileTopChrome variant=["']playlists["']/);
assert.match(libraryChrome, /<MobileTopChrome variant=["']library["']/);
assert.doesNotMatch(
  catalogLayout,
  /listener-catalog-mobile-search-spacer/,
  "catalog no longer owns a hand-tuned spacer",
);
assert.doesNotMatch(
  playlistSearch,
  /className="listener-catalog-mobile-search /,
  "playlists no longer copy-paste a private chrome layer",
);
assert.doesNotMatch(
  libraryChrome,
  /className="listener-catalog-mobile-search /,
  "library no longer copy-paste a private chrome layer",
);

assert.doesNotMatch(globals, /--catalog-mobile-search-height/);
assert.match(
  globals,
  /\.mobile-top-chrome-spacer\[data-mobile-top-chrome-variant="catalog"\]/,
);
assert.match(
  globals,
  /\.mobile-top-chrome-spacer\[data-mobile-top-chrome-variant="playlists"\]/,
);
assert.match(
  globals,
  /\.mobile-top-chrome-spacer\[data-mobile-top-chrome-variant="library"\]/,
);
assert.doesNotMatch(
  globals,
  /\.mobile-top-chrome,\s*\n\.mobile-top-chrome-spacer \{/,
);
assert.match(globals, /--bottom-nav-viewport-offset:\s*0px;/);

assert.match(listingNav, /router\.replace\(nextHref, \{ scroll: false \}\)/);
for (const [label, source] of [
  ["catalog search", catalogSearch],
  ["catalog filters", catalogFilters],
  ["playlist search", playlistSearch],
  ["library chrome", libraryChrome],
  ["library grid", libraryGrid],
] as const) {
  assert.match(source, /replaceListingSearch/, `${label} uses replaceListingSearch`);
  assert.doesNotMatch(
    source,
    /router\.(replace|push)\(/,
    `${label} has no raw listing router.replace/push`,
  );
}

assert.match(searchField, /\? "py-0 text-base"/);
assert.match(librarySearch, /text-base/);
assert.match(playlistSearch, /text-base/);
assert.doesNotMatch(librarySearch, /text-\[15px\]/);

assert.match(catalogFilters, /createPortal\(sheet, document\.body\)/);
assert.match(libraryFilters, /createPortal\(sheet, document\.body\)/);
assert.match(catalogFilters, /useSheetScrollLock\(open, ["']catalog-filters["']\)/);
assert.match(libraryFilters, /useSheetScrollLock\(open, ["']library-filters["']\)/);
assert.match(catalogFilters, /@\/lib\/listener\/use-sheet-scroll-lock/);
assert.match(libraryFilters, /@\/lib\/listener\/use-sheet-scroll-lock/);
assert.doesNotMatch(catalogFilters, /let catalogSheetLockCount/);
assert.doesNotMatch(libraryFilters, /let catalogSheetLockCount/);
assert.doesNotMatch(catalogFilters, /position:\s*fixed[\s\S]{0,40}top:\s*-/);
assert.doesNotMatch(libraryFilters, /position:\s*fixed[\s\S]{0,40}top:\s*-/);

assert.match(
  libraryChrome,
  /<Suspense fallback=\{<SearchFiltersRowSkeleton/,
);
assert.doesNotMatch(libraryLayout, /LibraryChromeFallback/);
assert.doesNotMatch(libraryLayout, /Suspense/);

assert.match(debugLib, /al_chrome_debug/);
assert.match(debugOverlay, /COPY DEBUG LOG/);
assert.match(debugOverlay, /position:\s*"fixed"/);
assert.match(shellRoot, /<MobileChromeDebugOverlay/);
assert.doesNotMatch(debugOverlay, /style=\{\{[\s\S]*paddingBottom|marginTop:\s*spacer/);
assert.doesNotMatch(
  debugLib,
  /document\.documentElement\.style\.(height|minHeight|transform)/,
);
assert.doesNotMatch(chrome, /visualViewport/);
assert.doesNotMatch(catalogLayout, /visualViewport|--vh/);
assert.doesNotMatch(playlistSearch, /visualViewport|--vh/);
assert.doesNotMatch(libraryChrome, /visualViewport|--vh/);

assert.match(bottomNav, /createPortal\(nav, document\.body\)/);
assert.match(
  globals,
  /\.bottom-nav \{\s*position:\s*fixed;[\s\S]*bottom:\s*0;[\s\S]*transform:\s*none;/,
);

console.log("mobile-top-chrome-unit: ok");
