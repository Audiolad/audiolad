#!/usr/bin/env node
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const bottomNav = readFileSync("src/components/BottomNav.tsx", "utf8");
const globals = readFileSync("src/app/globals.css", "utf8");
const listenerShell = readFileSync(
  "src/components/listener/ListenerAppShell.tsx",
  "utf8",
);
const layout = readFileSync("src/app/layout.tsx", "utf8");
const miniPlayer = readFileSync(
  "src/components/audio/GlobalMiniPlayer.tsx",
  "utf8",
);

assert(
  bottomNav.includes("createPortal(nav, document.body)"),
  "BottomNav should portal to document.body for mobile stability",
);
assert(
  bottomNav.includes("xl:hidden"),
  "BottomNav must hide itself at desktop breakpoint because portal bypasses parent wrappers",
);
assert(
  !bottomNav.includes("-translate-x-1/2") && !bottomNav.includes("left-1/2"),
  "BottomNav must not use translate/centering transforms that break position:fixed on iOS",
);
assert(
  !/\bbg-white\b/.test(bottomNav),
  "Default BottomNav background must come from CSS (near-opaque) for Safari fixed-layer stability",
);
assert(
  /@media \(min-width: 1280px\)[\s\S]*\.bottom-nav[\s\S]*display:\s*none/.test(
    globals,
  ),
  "globals.css must force-hide bottom nav on desktop",
);
assert(
  /\.bottom-nav\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?bottom:\s*var\(--bottom-nav-viewport-offset/.test(
    globals,
  ),
  "globals.css must pin .bottom-nav with fixed + small-viewport offset",
);
assert(
  globals.includes("transform: none"),
  "globals.css must keep transform:none on .bottom-nav",
);
assert(
  globals.includes("--bottom-nav-viewport-offset"),
  "globals.css must define --bottom-nav-viewport-offset for Safari dynamic toolbar stability",
);
assert(
  /@supports \(height: 100dvh\)[\s\S]*100dvh - 100svh/.test(globals),
  "viewport offset must use 100dvh - 100svh under @supports",
);
assert(
  /\.bottom-nav--default\s*\{[\s\S]*?background-color:\s*rgb\(255 255 255 \/ 0\.99\)/.test(
    globals,
  ),
  "default bottom nav must use near-opaque background for Safari 26 fixed-layer compositing",
);
assert(
  listenerShell.includes("config.showMobileBottomNav"),
  "ListenerAppShell mobile bottom nav must be config-driven",
);
assert(
  listenerShell.includes('<BottomNav className="xl:hidden" />'),
  "ListenerAppShell must mount BottomNav directly (portal target is body; avoid extra wrappers)",
);
assert(
  !listenerShell.includes("listener-app-shell min-h-dvh"),
  "ListenerAppShell must not use unstable min-h-dvh on mobile",
);
assert(
  layout.includes("min-h-screen") && !layout.includes("min-h-dvh"),
  "root body must use stable min-h-screen instead of min-h-dvh",
);
assert(
  miniPlayer.includes("var(--bottom-nav-viewport-offset, 0px)"),
  "GlobalMiniPlayer must stack above the viewport-offset bottom nav",
);
assert(
  /@media \(min-width: 1280px\)[\s\S]*platform-mobile-shell[\s\S]*padding-bottom:\s*0/.test(
    globals,
  ),
  "desktop listener shell must not reserve bottom nav padding",
);

console.log("bottom-nav-desktop-hidden-unit: ok");
