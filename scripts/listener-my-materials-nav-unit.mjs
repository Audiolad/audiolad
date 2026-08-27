#!/usr/bin/env node
/**
 * Listener nav: «Личные материалы» never appear in the desktop sidebar.
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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

const shellData = read("src/lib/listener/shell-data.ts");
const sidebar = read("src/components/listener/DesktopSidebar.tsx");
const sidebarNav = read("src/components/listener/DesktopSidebarNav.tsx");
const profileSections = read("src/components/profile/ProfileSections.tsx");
const profilePage = read("src/app/(platform)/profile/page.tsx");
const repository = read(
  "src/lib/personal-materials/client-library/repository.ts",
);
const migration = read(
  "supabase/migrations/20260729120000_has_claimed_personal_materials.sql",
);

assert.match(
  migration,
  /CREATE OR REPLACE FUNCTION public\.has_claimed_personal_materials\(\)/,
  "migration defines has_claimed_personal_materials",
);
assert.match(
  migration,
  /claimed_by_user_id = v_user_id/,
  "exists check uses claimed owner",
);
assert.match(
  migration,
  /status <> 'deleted'/,
  "exists check matches owner library filter",
);
assert.match(
  migration,
  /GRANT EXECUTE ON FUNCTION public\.has_claimed_personal_materials\(\) TO authenticated/,
  "authenticated can execute exists RPC",
);

assert.match(
  repository,
  /hasClaimedPersonalMaterials/,
  "repository exposes hasClaimedPersonalMaterials",
);
assert.match(
  repository,
  /has_claimed_personal_materials/,
  "repository calls has_claimed_personal_materials RPC",
);

assert.match(
  shellData,
  /showMyMaterialsNav: boolean/,
  "ListenerShellData exposes showMyMaterialsNav",
);
assert.match(
  shellData,
  /hasClaimedPersonalMaterials/,
  "shell-data uses hasClaimedPersonalMaterials",
);
assert.match(
  shellData,
  /showMyMaterialsNav: false/,
  "guest shell defaults showMyMaterialsNav to false",
);
assert.match(
  shellData,
  /listener_shell_my_materials_nav_error/,
  "shell-data treats RPC errors as false",
);

assert.match(
  sidebar,
  /showMyMaterialsNav=\{shellData\.showMyMaterialsNav\}/,
  "DesktopSidebar passes showMyMaterialsNav to nav",
);
assert.match(
  sidebarNav,
  /getListenerSidebarNavItems/,
  "DesktopSidebarNav filters via getListenerSidebarNavItems",
);

assert.match(
  profileSections,
  /showMyMaterialsNav \?/,
  "ProfileQuickLinks gates my-materials link",
);
assert.match(
  profilePage,
  /showMyMaterialsNav=\{shellData\.showMyMaterialsNav\}/,
  "profile page passes showMyMaterialsNav into ProfileQuickLinks",
);

const hidden = getListenerSidebarNavItems({ showMyMaterialsNav: false });
assert.equal(
  hidden.some((item) => item.key === "my-materials"),
  false,
  "sidebar hides my-materials when flag is false",
);
assert.equal(
  hidden.some((item) => item.key === "library"),
  true,
  "sidebar keeps library when my-materials is hidden",
);

const visible = getListenerSidebarNavItems({ showMyMaterialsNav: true });
assert.equal(
  visible.some((item) => item.key === "my-materials"),
  false,
  "sidebar never shows my-materials after Stage 2, even when flag is true",
);
assert.equal(
  LISTENER_SIDEBAR_NAV_ITEMS.find((item) => item.key === "my-materials")?.title,
  "Личные материалы",
  "my-materials title stays in the source list for routes and profile links",
);
assert.equal(
  visible.filter((item) => item.key === "help").length,
  1,
  "sidebar keeps a single help item when my-materials flag is true",
);
assert.equal(
  hidden.filter((item) => item.key === "help").length,
  1,
  "sidebar keeps a single help item when my-materials is hidden",
);

assert.equal(
  LISTENER_PRIMARY_NAV_ITEMS.find((item) => item.key === "playlists")?.href,
  "/playlists/catalog",
  "primary playlists tab lands on catalog",
);
assert.equal(
  LISTENER_SIDEBAR_NAV_ITEMS.find((item) => item.key === "playlists")?.href,
  "/playlists/catalog",
  "sidebar playlists item lands on catalog",
);

const playlistsHref = "/playlists/catalog";
const activeOpts = { isNeutralPath: false };
assert.equal(
  isListenerPrimaryNavItemActive("/playlists/catalog", playlistsHref, activeOpts),
  true,
  "catalog pathname activates playlists",
);
assert.equal(
  isListenerPrimaryNavItemActive("/playlists/catalog", playlistsHref, activeOpts),
  true,
  "catalog search keeps the same pathname and stays active",
);
assert.equal(
  isListenerPrimaryNavItemActive("/playlists/saved", playlistsHref, activeOpts),
  true,
  "saved playlists still activate playlists tab",
);
assert.equal(
  isListenerPrimaryNavItemActive(
    "/playlists/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    playlistsHref,
    activeOpts,
  ),
  true,
  "playlist detail still activates playlists tab",
);
assert.equal(
  isListenerPrimaryNavItemActive("/playlists", playlistsHref, activeOpts),
  true,
  "mine list still activates playlists tab",
);
assert.equal(
  isListenerPrimaryNavItemActive("/my-practices", playlistsHref, activeOpts),
  false,
  "library does not activate playlists",
);
assert.equal(
  isListenerPrimaryNavItemActive("/catalog", playlistsHref, activeOpts),
  false,
  "catalog practices does not activate playlists",
);
assert.equal(
  isListenerPrimaryNavItemActive("/catalog", "/catalog", activeOpts),
  true,
  "catalog matching is unchanged",
);
assert.equal(
  isListenerPrimaryNavItemActive("/my-practices", "/my-practices", activeOpts),
  true,
  "library matching is unchanged",
);
assert.equal(
  isListenerPrimaryNavItemActive("/profile", "/profile", activeOpts),
  true,
  "profile matching is unchanged",
);
assert.equal(
  isListenerPrimaryNavItemActive("/playlists/catalog", "/catalog", activeOpts),
  false,
  "playlists catalog does not activate practices catalog",
);

console.log("listener-my-materials-nav-unit: ok");
