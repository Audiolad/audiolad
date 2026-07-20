#!/usr/bin/env node
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const bottomNav = readFileSync("src/components/BottomNav.tsx", "utf8");
const globals = readFileSync("src/app/globals.css", "utf8");
const listenerShell = readFileSync("src/components/listener/ListenerAppShell.tsx", "utf8");

assert(
  bottomNav.includes("createPortal(nav, document.body)"),
  "BottomNav should portal to document.body for mobile stability",
);
assert(
  bottomNav.includes("xl:hidden"),
  "BottomNav must hide itself at desktop breakpoint because portal bypasses parent wrappers",
);
assert(
  /@media \(min-width: 1280px\)[\s\S]*\.bottom-nav[\s\S]*display:\s*none/.test(
    globals,
  ),
  "globals.css must force-hide bottom nav on desktop",
);
assert(
  listenerShell.includes("config.showMobileBottomNav"),
  "ListenerAppShell mobile bottom nav must be config-driven",
);
assert(
  /@media \(min-width: 1280px\)[\s\S]*platform-mobile-shell[\s\S]*padding-bottom:\s*0/.test(
    globals,
  ),
  "desktop listener shell must not reserve bottom nav padding",
);

console.log("bottom-nav-desktop-hidden-unit: ok");
