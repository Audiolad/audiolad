#!/usr/bin/env node
/**
 * Desktop listener sidebar: pinned expanded/collapsed + cookie + flyout.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getListenerSidebarNavItems,
  isListenerPrimaryNavItemActive,
  LISTENER_PRIMARY_NAV_ITEMS,
  LISTENER_SIDEBAR_NAV_ITEMS,
} from "../src/lib/navigation/listener-nav.ts";
import {
  buildListenerSidebarPinnedCookie,
  LISTENER_SIDEBAR_COLLAPSED_WIDTH_PX,
  LISTENER_SIDEBAR_COOKIE_NAME,
  LISTENER_SIDEBAR_DEFAULT_PINNED,
  LISTENER_SIDEBAR_EXPANDED_WIDTH_PX,
  LISTENER_SIDEBAR_FINE_HOVER_QUERY,
  LISTENER_SIDEBAR_FLYOUT_CLOSE_DELAY_MS,
  LISTENER_SIDEBAR_FLYOUT_OPEN_DELAY_MS,
  parseListenerSidebarPinnedState,
  readListenerSidebarPinnedState,
} from "../src/lib/navigation/listener-sidebar.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

const globals = read("src/app/globals.css");
const shell = read("src/components/listener/ListenerAppShell.tsx");
const shellRoot = read("src/components/listener/ListenerAppShellRoot.tsx");
const sidebar = read("src/components/listener/DesktopSidebar.tsx");
const sidebarNav = read("src/components/listener/DesktopSidebarNav.tsx");
const chrome = read("src/components/listener/DesktopSidebarChrome.tsx");
const bottomNav = read("src/components/BottomNav.tsx");
const listenerLayout = read("src/app/(platform)/(listener)/layout.tsx");
const profileLayout = read("src/app/(platform)/profile/layout.tsx");
const authorLayout = read("src/app/(platform)/author-dashboard/layout.tsx");
const publicPlaylistLayout = read("src/app/(platform)/p/layout.tsx");
const listenPage = read("src/lib/listen/page-shared.tsx");
const listenerNav = read("src/lib/navigation/listener-nav.ts");

// 1. default SSR = expanded
assert.equal(
  LISTENER_SIDEBAR_DEFAULT_PINNED,
  "expanded",
  "default pinned state is expanded",
);
assert.equal(
  parseListenerSidebarPinnedState(undefined),
  "expanded",
  "missing cookie parses as expanded",
);
assert.equal(
  parseListenerSidebarPinnedState("nope"),
  "expanded",
  "invalid cookie parses as expanded",
);
assert.equal(
  parseListenerSidebarPinnedState(""),
  "expanded",
  "empty cookie parses as expanded",
);
assert.match(
  shell,
  /initialSidebarPinned = LISTENER_SIDEBAR_DEFAULT_PINNED/,
  "ListenerAppShell defaults initial pinned to expanded",
);

// 2. cookie collapsed → first HTML / shell gets collapsed
assert.equal(
  parseListenerSidebarPinnedState("collapsed"),
  "collapsed",
  "collapsed cookie parses as collapsed",
);
assert.equal(
  readListenerSidebarPinnedState({
    get: (name) =>
      name === LISTENER_SIDEBAR_COOKIE_NAME
        ? { value: "collapsed" }
        : undefined,
  }),
  "collapsed",
  "cookie helper reads collapsed from store",
);
assert.equal(
  LISTENER_SIDEBAR_COOKIE_NAME,
  "audiolad_listener_sidebar",
  "cookie name is audiolad_listener_sidebar",
);
assert.match(
  buildListenerSidebarPinnedCookie("collapsed"),
  /audiolad_listener_sidebar=collapsed; Path=\/; Max-Age=31536000; SameSite=Lax/,
  "cookie is path=/, SameSite=Lax, 1 year, not httpOnly",
);
assert.equal(
  /HttpOnly/i.test(buildListenerSidebarPinnedCookie("expanded")),
  false,
  "cookie is not httpOnly",
);
assert.match(
  shellRoot,
  /data-sidebar-pinned=\{pinned\}/,
  "shell root writes data-sidebar-pinned from React state",
);
assert.match(
  shell,
  /initialSidebarPinned=\{initialSidebarPinned\}/,
  "ListenerAppShell passes cookie state into the root",
);

for (const [label, source] of [
  ["listener layout", listenerLayout],
  ["profile layout", profileLayout],
  ["author-dashboard layout", authorLayout],
  ["public /p layout", publicPlaylistLayout],
  ["listen page-shared", listenPage],
]) {
  assert.match(
    source,
    /cookies\(\)/,
    `${label} reads cookies()`,
  );
  assert.match(
    source,
    /readListenerSidebarPinnedState/,
    `${label} uses the sidebar cookie helper`,
  );
  assert.match(
    source,
    /initialSidebarPinned=\{initialSidebarPinned\}/,
    `${label} passes initialSidebarPinned into ListenerAppShell`,
  );
}

// 3. expanded 240, collapsed 72 (CSS + tokens)
assert.equal(LISTENER_SIDEBAR_EXPANDED_WIDTH_PX, 240);
assert.equal(LISTENER_SIDEBAR_COLLAPSED_WIDTH_PX, 72);
assert.match(
  globals,
  /--listener-sidebar-width:\s*240px/,
  "root sidebar token stays 240px",
);
assert.match(
  globals,
  /--listener-sidebar-collapsed-width:\s*72px/,
  "collapsed width token is 72px",
);
assert.match(
  globals,
  /\.listener-app-shell\[data-sidebar-pinned="collapsed"\]\s*\{\s*--listener-sidebar-width:\s*var\(--listener-sidebar-collapsed-width\)/,
  "collapsed data attribute remaps the grid width token",
);

// 4. collapsed rail still exposes all role-available nav actions
const guestItems = getListenerSidebarNavItems({ showMyMaterialsNav: false });
assert.deepEqual(
  guestItems.map((item) => item.key),
  ["catalog", "library", "playlists", "history", "profile", "help"],
  "guest collapsed/expanded nav keeps the role-available space items",
);
assert.match(
  chrome,
  /variant=\{collapsed \? "icons" : "labels"\}/,
  "collapsed rail renders the same nav as icons",
);
assert.match(
  sidebarNav,
  /variant === "icons"/,
  "icon rail still renders every filtered nav item",
);

// 5. editorial still gated by the same flags
assert.equal(
  LISTENER_SIDEBAR_NAV_ITEMS.some((item) => item.href === "/editorial/playlists"),
  true,
  "editorial playlists live in the shared sidebar nav model",
);
assert.equal(
  LISTENER_SIDEBAR_NAV_ITEMS.some((item) => item.href === "/editorial/directions"),
  true,
  "editorial directions live in the shared sidebar nav model",
);
assert.equal(
  getListenerSidebarNavItems({
    showMyMaterialsNav: false,
    showEditorialNav: false,
  }).some((item) => item.section === "editorial"),
  false,
  "editorial hidden when showEditorialNav is false",
);
const editorialOnly = getListenerSidebarNavItems({
  showMyMaterialsNav: false,
  showEditorialNav: true,
});
assert.equal(
  editorialOnly.some((item) => item.key === "editorial-playlists"),
  true,
  "showEditorialNav reveals editorial playlists",
);
assert.equal(
  editorialOnly.some((item) => item.key === "editorial-directions"),
  false,
  "directions stay hidden without showEditorialDirectionsNav",
);
const editorialAll = getListenerSidebarNavItems({
  showMyMaterialsNav: false,
  showEditorialNav: true,
  showEditorialDirectionsNav: true,
});
assert.equal(
  editorialAll.some((item) => item.key === "editorial-directions"),
  true,
  "both editorial flags reveal directions",
);
assert.match(
  sidebarNav,
  /showEditorialNav/,
  "DesktopSidebarNav still receives showEditorialNav",
);
assert.match(
  sidebarNav,
  /showEditorialDirectionsNav/,
  "DesktopSidebarNav still receives showEditorialDirectionsNav",
);
assert.equal(
  sidebarNav.includes('href="/editorial/playlists"'),
  false,
  "editorial hrefs are not hardcoded in DesktopSidebarNav",
);
assert.match(
  listenerNav,
  /href: "\/editorial\/playlists"/,
  "editorial playlist href stays in the shared model",
);

// 6. desktop icons import Catalog/Library/Playlists/Profile from BottomNavIcons
assert.match(
  sidebarNav,
  /import \{[\s\S]*CatalogNavIcon[\s\S]*LibraryNavIcon[\s\S]*PlaylistsNavIcon[\s\S]*ProfileNavIcon[\s\S]*\} from "@\/components\/BottomNavIcons"/,
  "sidebar imports Catalog/Library/Playlists/Profile from BottomNavIcons",
);
assert.equal(
  /<svg[\s\S]*viewBox="0 0 24 24"[\s\S]*Каталог/.test(sidebarNav),
  false,
  "DesktopSidebarNav does not copy catalog SVG markup",
);

// 7. BottomNav still 5 items from LISTENER_PRIMARY_NAV_ITEMS
assert.equal(LISTENER_PRIMARY_NAV_ITEMS.length, 5);
assert.deepEqual(
  LISTENER_PRIMARY_NAV_ITEMS.map((item) => item.key),
  ["home", "catalog", "library", "playlists", "profile"],
);
assert.match(
  bottomNav,
  /LISTENER_PRIMARY_NAV_ITEMS/,
  "BottomNav still maps LISTENER_PRIMARY_NAV_ITEMS",
);

// 8. BottomNav still xl:hidden + desktop display:none
assert.match(bottomNav, /xl:hidden/);
assert.match(
  shell,
  /<BottomNav className="xl:hidden" \/>/,
  "ListenerAppShell still mounts BottomNav with xl:hidden",
);
assert.match(
  globals,
  /@media \(min-width: 1280px\)[\s\S]*\.bottom-nav[\s\S]*display:\s*none/,
  "globals.css still force-hides bottom nav on desktop",
);

// 9. / keeps current desktop neutral (no row active)
assert.match(
  sidebarNav,
  /isNeutralPath:\s*pathname === "\/"/,
  "desktop sidebar treats / as a neutral path",
);
assert.equal(
  isListenerPrimaryNavItemActive("/catalog", "/catalog", {
    isNeutralPath: true,
  }),
  false,
  "neutral path suppresses catalog active state",
);
assert.equal(
  isListenerPrimaryNavItemActive("/", "/catalog", { isNeutralPath: true }),
  false,
  "home pathname does not activate a sidebar row",
);

// 10. flyout does not change grid var / track
assert.match(
  chrome,
  /createPortal/,
  "collapsed flyout portals out of the overflow-hidden rail",
);
assert.match(
  chrome,
  /document\.body/,
  "flyout mounts on document.body",
);
assert.match(
  chrome,
  /LISTENER_SIDEBAR_FINE_HOVER_QUERY/,
  "flyout hover is gated by the fine-pointer query",
);
assert.equal(
  LISTENER_SIDEBAR_FINE_HOVER_QUERY,
  "(hover: hover) and (pointer: fine)",
);
assert.equal(LISTENER_SIDEBAR_FLYOUT_OPEN_DELAY_MS, 120);
assert.equal(LISTENER_SIDEBAR_FLYOUT_CLOSE_DELAY_MS, 200);
const openFlyoutFn = chrome.match(
  /const openFlyout = useCallback\(\(\) => \{[\s\S]*?\}, \[updateFlyoutBox\]\);/,
);
assert.ok(openFlyoutFn, "openFlyout callback is defined");
assert.equal(
  openFlyoutFn[0].includes("setPinned"),
  false,
  "opening the flyout does not change pinned state",
);
assert.equal(
  openFlyoutFn[0].includes("--listener-sidebar-width"),
  false,
  "opening the flyout does not rewrite the grid width variable",
);
assert.match(
  chrome,
  /width: LISTENER_SIDEBAR_EXPANDED_WIDTH_PX/,
  "flyout uses a fixed 240px panel width",
);
assert.equal(
  /style=\{\{[\s\S]*--listener-sidebar-width/.test(chrome),
  false,
  "flyout style does not rewrite the grid width variable",
);
assert.match(
  chrome,
  /w-\[var\(--listener-sidebar-width\)\]/,
  "pinned rail still sizes from the inherited CSS variable",
);
assert.match(
  chrome,
  /data-sidebar-flyout="true"/,
  "flyout is marked separately from the pinned rail",
);
assert.match(
  globals,
  /--listener-sidebar-flyout-z:\s*45/,
  "flyout z-index token stays below sheet/modal overlays",
);

// 11. prefers-reduced-motion handled
assert.match(
  globals,
  /@media \(prefers-reduced-motion: reduce\) \{\s*\.listener-app-shell__body,\s*\.listener-desktop-sidebar,\s*\.listener-sidebar-flyout \{\s*transition:\s*none;\s*animation:\s*none;/,
  "reduced motion disables sidebar width transition and flyout animation",
);

// 12. toggle has aria-expanded + aria-label
assert.match(chrome, /aria-expanded=\{expanded\}/);
assert.match(chrome, /"Свернуть меню"/);
assert.match(chrome, /"Развернуть меню"/);
assert.match(chrome, /<button[\s\S]*aria-expanded/);

assert.match(
  sidebar,
  /audiolad-logo-sidebar-v2\.webp/,
  "expanded logo stays the sidebar webp",
);
assert.match(
  sidebar,
  /audiolad-fallback-mark\.png/,
  "collapsed rail uses the fallback mark",
);
assert.match(
  chrome,
  /showSidebarAuthorPromo/,
  "author promo still respects the shell flag",
);
assert.match(
  chrome,
  /collapsed \? null : <SpaceHeading/,
  "collapsed rail hides Моё пространство",
);

assert.equal(
  guestItems.some((item) => item.key === "my-materials"),
  false,
  "my-materials stay filtered out of the sidebar",
);
assert.equal(
  guestItems.some((item) => item.key === "profile"),
  true,
  "sidebar still includes profile",
);
assert.equal(
  guestItems.some((item) => item.key === "help"),
  true,
  "sidebar still includes help",
);

console.log("listener-sidebar-collapse-unit: ok");
