#!/usr/bin/env node
/**
 * Mobile bottom content padding: one reserve for mini-player + tabbar + safe-area.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

const globals = read("src/app/globals.css");
const nav = read("src/lib/navigation/bottom-nav.ts");
const practice = read(
  "src/components/products/practice-page/PracticePageMobile.tsx",
);
const library = read("src/components/my-practices/MyPracticesLibrary.tsx");
const catalog = read("src/components/products/CatalogProductGrid.tsx");
const shell = read("src/components/listener/ListenerAppShell.tsx");
const mini = read("src/components/audio/GlobalMiniPlayer.tsx");
const tabbar = read("src/components/BottomNav.tsx");
const card = read("src/components/products/CatalogProductGridCard.tsx");
const checkout = read("src/app/(platform)/checkout/result/page.tsx");

assert.match(nav, /platformBottomContentPaddingClass/);
assert.match(nav, /platform-bottom-content-padding/);

assert.match(globals, /--platform-bottom-chrome/);
assert.match(globals, /--platform-bottom-content-padding/);
assert.match(globals, /--global-mini-player-height/);
assert.match(globals, /--bottom-nav-main-height/);
assert.match(globals, /env\(safe-area-inset-bottom/);
assert.match(
  globals,
  /\.platform-bottom-content-padding/,
  "utility class exists",
);
assert.match(
  globals,
  /platform-mobile-shell:has\(\s*\.platform-bottom-content-padding/,
  "shell does not double-count page padding",
);

assert.match(practice, /platformBottomContentPaddingClass/);
assert.doesNotMatch(practice, /pb-6/);
assert.match(library, /platformBottomContentPaddingClass/);
assert.match(catalog, /platformBottomContentPaddingClass/);

assert.doesNotMatch(shell, /platform-bottom-content-padding/);
assert.doesNotMatch(mini, /platform-bottom-content-padding/);
assert.doesNotMatch(tabbar, /platform-bottom-content-padding/);
assert.doesNotMatch(card, /platform-bottom-content-padding/);
assert.doesNotMatch(checkout, /platform-bottom-content-padding/);

console.log("mobile-bottom-safe-spacing-unit: ok");
