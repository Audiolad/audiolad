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
const consentLayout = readFileSync(
  "src/lib/analytics/consent-banner-layout.ts",
  "utf8",
);
const pwaBanner = readFileSync("src/components/pwa/PwaInstallBanner.tsx", "utf8");

assert(
  bottomNav.includes("createPortal(nav, document.body)"),
  "BottomNav should portal to document.body after hydration for mobile stability",
);
assert(
  bottomNav.includes("useSyncExternalStore"),
  "BottomNav must detect client after SSR via useSyncExternalStore",
);
assert(
  bottomNav.includes("return nav"),
  "BottomNav must render in-place for SSR HTML before the portal attaches",
);
assert(
  !bottomNav.includes("useClientMounted") &&
    !bottomNav.includes("|| !mounted"),
  "BottomNav must not wait for client mount before the first paint",
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
  /\.bottom-nav\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?bottom:\s*0;/.test(
    globals,
  ),
  "globals.css must pin .bottom-nav with position:fixed and bottom:0",
);
assert(
  globals.includes("transform: none"),
  "globals.css must keep transform:none on .bottom-nav",
);
assert(
  /--bottom-nav-viewport-offset:\s*0px/.test(globals),
  "globals.css must keep --bottom-nav-viewport-offset at 0px for chrome stacking",
);
assert(
  !/100dvh\s*-\s*100svh/.test(globals),
  "globals.css must not drive bottom-nav position/height from 100dvh - 100svh",
);
assert(
  !/\.bottom-nav--default::after|\.bottom-nav--player::after/.test(globals),
  "globals.css must not use ::after viewport-offset fill under bottom-nav",
);
assert(
  /\.bottom-nav\s*\{[\s\S]*?padding-bottom:\s*env\(safe-area-inset-bottom/.test(
    globals,
  ),
  "globals.css must apply safe-area once via padding-bottom on .bottom-nav",
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
  layout.includes("min-h-dvh") && !layout.includes("min-h-screen"),
  "root body must use min-h-dvh (root/body only)",
);
assert(
  /@media \(display-mode: standalone\)[\s\S]*overscroll-behavior-y:\s*none/.test(
    globals,
  ),
  "standalone PWA must disable vertical overscroll on html/body",
);
assert(
  miniPlayer.includes("BOTTOM_NAV_MAIN_HEIGHT_PX") &&
    miniPlayer.includes("env(safe-area-inset-bottom") &&
    miniPlayer.includes("var(--bottom-nav-viewport-offset, 0px)"),
  "GlobalMiniPlayer must stack above bottom nav (main height + safe-area + zero viewport offset)",
);
assert(
  consentLayout.includes("var(--bottom-nav-main-height)") &&
    consentLayout.includes("env(safe-area-inset-bottom, 0px)") &&
    consentLayout.includes("var(--bottom-nav-viewport-offset, 0px)"),
  "consent banner must stack above bottom nav using main height + safe-area + zero viewport offset",
);
assert(
  globals.includes(".analytics-consent-banner") &&
    /var\(--bottom-nav-viewport-offset, 0px\)/.test(globals),
  "analytics-consent-banner CSS must keep stacking offset var (value 0px)",
);
assert(
  pwaBanner.includes("var(--bottom-nav-viewport-offset, 0px)") &&
    pwaBanner.includes("env(safe-area-inset-bottom, 0px)"),
  "PWA install banner must stack above bottom nav with safe-area and zero viewport offset",
);
assert(
  /@media \(min-width: 1280px\)[\s\S]*platform-mobile-shell[\s\S]*padding-bottom:\s*0/.test(
    globals,
  ),
  "desktop listener shell must not reserve bottom nav padding",
);

console.log("bottom-nav-desktop-hidden-unit: ok");
