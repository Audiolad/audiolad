#!/usr/bin/env node
import { readFileSync } from "node:fs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(path) {
  return readFileSync(path, "utf8");
}

const shellConfig = read("src/lib/listener/shell-config.ts");
const listenerShell = read("src/components/listener/ListenerAppShell.tsx");
const listenerNav = read("src/lib/navigation/listener-nav.ts");
const profileShell = read("src/components/profile/ProfilePageShell.tsx");
const profileLayout = read("src/app/profile/layout.tsx");
const authorLayout = read("src/app/author-dashboard/layout.tsx");
const authorShell = read("src/components/author-dashboard/AuthorShell.tsx");
const bottomNav = read("src/lib/navigation/bottom-nav.ts");
const listenerLayout = read("src/app/(listener)/layout.tsx");

assert(
  shellConfig.includes("default:") &&
    shellConfig.includes("profile:") &&
    shellConfig.includes("author:"),
  "shell-config must define default, profile and author modes",
);

assert(
  shellConfig.includes("showRightColumn: true") &&
    shellConfig.includes("showRightColumn: false"),
  "shell-config must toggle right column per mode",
);

const defaultConfig = shellConfig.match(
  /default:[\s\S]*?showRightColumn: true[\s\S]*?showMobileBottomNav: true/,
);
assert(defaultConfig, "default mode must keep right column and mobile bottom nav");

const profileConfig = shellConfig.match(
  /profile:[\s\S]*?showRightColumn: false[\s\S]*?showMobileBottomNav: true/,
);
assert(
  profileConfig,
  "profile mode must hide right column and keep mobile bottom nav",
);

const authorConfig = shellConfig.match(
  /author:[\s\S]*?showRightColumn: false[\s\S]*?showMobileBottomNav: true/,
);
assert(
  authorConfig,
  "author mode must hide right column and keep mobile bottom nav",
);

assert(
  listenerNav.includes('{ key: "profile", title: "Профиль", href: "/profile" }'),
  "sidebar nav must include profile item",
);

assert(
  listenerNav.includes("pathname.startsWith(`${href}/`)"),
  "sidebar active helper must support nested profile routes",
);

assert(
  profileLayout.includes('mode="profile"') &&
    profileLayout.includes("ListenerAppShell"),
  "profile layout must mount ListenerAppShell in profile mode",
);

assert(
  authorLayout.includes('mode="author"') &&
    authorLayout.includes("ListenerAppShell"),
  "author-dashboard layout must mount ListenerAppShell in author mode",
);

assert(
  listenerLayout.includes('mode="default"'),
  "listener layout must keep default shell mode explicit",
);

assert(
  !profileShell.includes("BottomNav"),
  "ProfilePageShell must not render its own BottomNav",
);

assert(
  !profileShell.includes("<main"),
  "ProfilePageShell must not render standalone main wrapper",
);

assert(
  listenerShell.includes("config.showRightColumn") &&
    listenerShell.includes("config.showDesktopPlayerBar") &&
    listenerShell.includes("config.showMobileBottomNav"),
  "ListenerAppShell must honor shell config toggles",
);

assert(
  listenerShell.includes("listener-app-shell__body--no-right-column"),
  "ListenerAppShell must mark layouts without right column",
);

assert(
  !authorShell.includes("Вернуться в АудиоЛад") &&
    !authorShell.includes("Вернуться в пользовательскую часть платформы"),
  "AuthorShell must not duplicate platform exit navigation",
);

assert(
  !bottomNav.includes('"/author-dashboard/"'),
  "author-dashboard routes must not hide bottom nav",
);

assert(
  authorShell.includes("internalBackHref"),
  "AuthorShell must support internal cabinet back navigation",
);

console.log("listener-shell-modes-unit: ok");
