#!/usr/bin/env node
/**
 * Desktop catalog shell navigation: window/document scroll must not clip
 * the listener shell. Home topic chips + Next 16 scroll:true can set
 * html.scrollTop even while overflow is hidden; Apply/Reset keep
 * replaceListingSearch({ scroll: false }) for mobile.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

class FakeClassList {
  items = new Set<string>();
  add(name: string) {
    this.items.add(name);
  }
  remove(name: string) {
    this.items.delete(name);
  }
}

function installDesktopDom(desktop: boolean) {
  const html = {
    classList: new FakeClassList(),
    style: { overflow: "hidden" },
    scrollTop: 83,
  };
  const body = {
    classList: new FakeClassList(),
    style: { overflow: "hidden" },
    scrollTop: 0,
  };
  const center = {
    className: "listener-app-shell__center-scroll",
    scrollTop: 400,
  };

  const scrollingElement = html;
  let windowScrollY = 83;

  const documentLike = {
    documentElement: html,
    body,
    scrollingElement,
    querySelectorAll(selector: string) {
      if (selector === ".listener-app-shell__center-scroll") {
        return [center];
      }
      return [];
    },
  };

  const windowLike = {
    scrollY: windowScrollY,
    scrollTo(x: number, y?: number) {
      const top = typeof x === "object" && x !== null ? (x as { top?: number }).top ?? 0 : (y ?? 0);
      windowScrollY = top;
      windowLike.scrollY = top;
      html.scrollTop = top;
    },
    matchMedia(query: string) {
      return {
        matches: desktop && query.includes("1280"),
        media: query,
        addEventListener() {},
        removeEventListener() {},
      };
    },
    requestAnimationFrame(cb: FrameRequestCallback) {
      cb(0);
      return 1;
    },
    cancelAnimationFrame() {},
  };

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowLike,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentLike,
  });

  return { html, body, center, windowLike, getWindowScrollY: () => windowScrollY };
}

const helperSource = read("src/lib/navigation/reset-desktop-shell-window-scroll.ts");
const guardSource = read(
  "src/components/listener/DesktopShellWindowScrollGuard.tsx",
);
const shellSource = read("src/components/listener/ListenerAppShell.tsx");
const listingNav = read("src/lib/listener/listing-search-navigation.ts");
const filters = read("src/components/catalog/CatalogMobileFilters.tsx");
const homeChips = read("src/components/home/HomeTopicNavigation.tsx");
const resetAppScroll = read("src/lib/navigation/reset-app-scroll.ts");
const mobileChrome = read("src/components/listener/MobileTopChrome.tsx");
const catalogLayout = read(
  "src/app/(platform)/(listener)/(catalog)/catalog/layout.tsx",
);

assert.match(
  helperSource,
  /LISTENER_DESKTOP_MEDIA_QUERY/,
  "desktop window reset is gated on the shared desktop media query",
);
assert.match(helperSource, /window\.scrollTo\(0, 0\)/);
assert.doesNotMatch(
  helperSource,
  /querySelectorAll\(|APP_SCROLL_CONTAINER_SELECTOR|center\.scrollTop/,
  "desktop window reset must not query or write center-scroll",
);
assert.doesNotMatch(helperSource, /setTimeout/);
assert.doesNotMatch(guardSource, /setTimeout/);
assert.match(guardSource, /useLayoutEffect/);
assert.match(guardSource, /requestAnimationFrame/);
assert.match(guardSource, /resetDesktopShellWindowScroll/);
assert.match(guardSource, /usePathname/);
assert.match(guardSource, /useSearchParams/);
assert.match(
  shellSource,
  /DesktopShellWindowScrollGuard/,
  "listener shell mounts the desktop window-scroll guard",
);
assert.match(shellSource, /<Suspense fallback=\{null\}>/);
assert.match(
  listingNav,
  /router\.replace\(nextHref, \{ scroll: false \}\)/,
  "listing replace stays query-only with scroll:false",
);
assert.doesNotMatch(
  listingNav,
  /router\.replace\([^)]*scroll:\s*true/,
  "replaceListingSearch must not flip to scroll:true",
);
assert.match(filters, /replaceListingSearch/);
assert.doesNotMatch(filters, /router\.(replace|push)\(/);
assert.match(
  homeChips,
  /<Link href=\{href\} prefetch=\{false\}/,
  "home topic chips stay ordinary Links; the shell guard owns desktop scroll",
);
assert.doesNotMatch(
  homeChips,
  /scroll=\{false\}/,
  "do not paper over topic chips with a local scroll prop",
);
assert.match(
  resetAppScroll,
  /APP_SCROLL_CONTAINER_SELECTOR/,
  "full-page reset helper remains separate and still knows center-scroll",
);
assert.match(mobileChrome, /fixed top-0 inset-x-0/);
assert.match(mobileChrome, /xl:hidden/);
assert.match(
  catalogLayout,
  /<MobileTopChrome variant=["']catalog["']/,
  "mobile catalog chrome stays in the route layout",
);
assert.match(catalogLayout, /data-mobile-top-chrome-spacer|MobileTopChrome/);
assert.doesNotMatch(
  catalogLayout,
  /xl:pt-\[/,
  "catalog layout does not add a second desktop top spacer",
);

const desktop = installDesktopDom(true);
const {
  resetDesktopShellWindowScroll,
  isListenerDesktopViewport,
} = await import("../src/lib/navigation/reset-desktop-shell-window-scroll");

assert.equal(isListenerDesktopViewport(), true);
assert.equal(desktop.html.scrollTop, 83);
assert.equal(desktop.windowLike.scrollY, 83);
assert.equal(desktop.center.scrollTop, 400);

resetDesktopShellWindowScroll();

assert.equal(
  desktop.html.scrollTop,
  0,
  "desktop leftover html.scrollTop from topic-chip / Next scrollIntoView is cleared",
);
assert.equal(desktop.windowLike.scrollY, 0);
assert.equal(desktop.body.scrollTop, 0);
assert.equal(
  desktop.center.scrollTop,
  400,
  "center-scroll stays independent after the desktop window reset",
);

const mobile = installDesktopDom(false);
assert.equal(isListenerDesktopViewport(), false);
mobile.html.scrollTop = 220;
mobile.windowLike.scrollY = 220;
mobile.windowLike.scrollTo(0, 220);
resetDesktopShellWindowScroll();
assert.equal(
  mobile.html.scrollTop,
  220,
  "mobile document scroll is not reset — top chrome stays on the page scroller",
);
assert.equal(mobile.windowLike.scrollY, 220);
assert.equal(mobile.center.scrollTop, 400);

console.log("desktop-catalog-shell-navigation-unit: ok");
