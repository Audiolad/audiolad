/**
 * Catalog gap for authors (mobile): the «Кабинет автора» entry the shell
 * renders above page content must not render on routes with the fixed
 * MobileTopChrome — there it hides under the fixed search layer and leaves
 * an empty gap + peeking rounded edge between search and section tiles.
 * Logged-in catalog layout must match the guest one.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MOBILE_TOP_CHROME_ROUTE_PREFIXES,
  isMobileTopChromeRoute,
} from "../src/lib/listener/mobile-top-chrome";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

// Routes with the fixed chrome.
for (const path of [
  "/catalog",
  "/catalog/",
  "/catalog?q=sleep",
  "/catalog?section=music&topic=calm",
  "/playlists/catalog",
  "/playlists/catalog?q=x",
  "/my-practices",
  "/my-practices?tab=saved",
]) {
  assert.equal(isMobileTopChromeRoute(path), true, `${path} has fixed chrome`);
}

// Routes without it keep the mobile author entry.
for (const path of [
  "/",
  "/playlists",
  "/playlists/saved",
  "/catalogue",
  "/catalog-old",
  "/practice/some-slug",
  "/authors/x",
  "",
  null,
  undefined,
]) {
  assert.equal(
    isMobileTopChromeRoute(path),
    false,
    `${String(path)} has no fixed chrome`,
  );
}

// Every layout/component that mounts MobileTopChrome maps to a listed route.
const chromeMounts: Array<[string, string]> = [
  ["src/app/(platform)/(listener)/(catalog)/catalog/layout.tsx", "/catalog"],
  [
    "src/components/playlists/catalog/PlaylistCatalogSearch.tsx",
    "/playlists/catalog",
  ],
  ["src/components/my-practices/MyPracticesLibraryChrome.tsx", "/my-practices"],
];
for (const [file, route] of chromeMounts) {
  assert.match(read(file), /<MobileTopChrome\b/, `${file} mounts MobileTopChrome`);
  assert.ok(
    (MOBILE_TOP_CHROME_ROUTE_PREFIXES as readonly string[]).includes(route),
    `${route} is listed for ${file}`,
  );
}

// Shell delegates the mobile author entry to the route-aware component.
const shell = read("src/components/listener/ListenerAppShell.tsx");
assert.match(shell, /<MobileAuthorCabinetLink\b/);
assert.doesNotMatch(
  shell,
  /data-author-cabinet-mobile/,
  "shell no longer renders the author block unconditionally above children",
);

const link = read("src/components/listener/MobileAuthorCabinetLink.tsx");
assert.match(link, /^"use client";/);
assert.match(link, /usePathname\(\)/);
assert.match(
  link,
  /if \(isMobileTopChromeRoute\(pathname\)\) \{\s*return null;\s*\}/,
  "renders nothing (no gap, no edge) on fixed-chrome routes",
);
assert.match(link, /data-author-cabinet-mobile="true"/, "feature kept elsewhere");
assert.match(link, /AuthorUnreadCommentBadge/, "unread badge kept");

console.log("mobile-author-cabinet-top-chrome-unit: ok");
