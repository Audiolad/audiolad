#!/usr/bin/env node
/**
 * Regression checks: global player hidden in workspace dashboards.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), "utf8");
}

function testRoutePolicy() {
  const bottomNav = read("src/lib/navigation/bottom-nav.ts");
  const authorLayout = read("src/app/author-dashboard/layout.tsx");
  const adminLayout = read("src/app/admin/layout.tsx");

  assert(bottomNav.includes("WORKSPACE_DASHBOARD_PREFIXES"), "dashboard prefix list");
  assert(bottomNav.includes('"/author-dashboard"'), "author dashboard prefix");
  assert(bottomNav.includes('"/admin"'), "admin dashboard prefix");
  assert(bottomNav.includes("isWorkspaceDashboardPathname"), "dashboard pathname helper");

  assert(authorLayout.includes('mode="author"'), "author layout uses author shell mode");
  assert(adminLayout.includes("AdminShell"), "admin layout uses admin shell");
}

function testProviderUnmountPolicy() {
  const provider = read("src/components/audio/GlobalAudioPlayerProvider.tsx");

  assert(provider.includes("isWorkspaceDashboardPathname"), "provider imports dashboard helper");
  assert(
    provider.includes("!isWorkspaceDashboardPathname(pathname)"),
    "mini-player hidden on dashboard routes",
  );
  assert(provider.includes("stopAndClear()"), "provider stops playback on dashboard entry");
  assert(
    provider.includes("session && !isWorkspaceDashboardPathname(pathname)"),
    "player engine not mounted on dashboard routes",
  );
}

function testShellPlayerChrome() {
  const shellConfig = read("src/lib/listener/shell-config.ts");
  const listenerShell = read("src/components/listener/ListenerAppShell.tsx");
  const adminShell = read("src/components/admin/AdminShell.tsx");

  const authorConfig = shellConfig.match(
    /author:[\s\S]*?showDesktopPlayerBar: false[\s\S]*?showMobileBottomNav: false/,
  );
  assert(authorConfig, "author shell mode hides desktop player bar");

  assert(
    listenerShell.includes("config.showDesktopPlayerBar")
      && listenerShell.includes('? "xl:pb-[calc(1rem+var(--listener-desktop-player-height,0px))]"')
      && listenerShell.includes(': "xl:pb-4"'),
    "listener shell drops player padding when desktop bar is hidden",
  );

  assert(!adminShell.includes("DesktopPlayerBar"), "admin shell does not mount desktop player bar");
  assert(!adminShell.includes("GlobalMiniPlayer"), "admin shell does not mount mini player");
}

function testPublicPlayerStillEnabled() {
  const profileLayout = read("src/app/profile/layout.tsx");
  const listenerLayout = read("src/app/(listener)/layout.tsx");
  const shellConfig = read("src/lib/listener/shell-config.ts");

  assert(profileLayout.includes('mode="profile"'), "profile keeps listener shell");
  assert(listenerLayout.includes('mode="default"'), "public listener shell stays default");
  assert(shellConfig.includes("showDesktopPlayerBar: true"), "default/profile keep desktop player bar");
}

function main() {
  testRoutePolicy();
  testProviderUnmountPolicy();
  testShellPlayerChrome();
  testPublicPlayerStillEnabled();
  console.log("dashboard-player-hidden-unit: PASS");
}

main();
