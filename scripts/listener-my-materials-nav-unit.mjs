#!/usr/bin/env node
/**
 * Listener nav: «Личные материалы» only when shell confirms claimed materials.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getListenerSidebarNavItems } from "../src/lib/navigation/listener-nav.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
  return readFileSync(path.join(root, relPath), "utf8");
}

const shellData = read("src/lib/listener/shell-data.ts");
const sidebar = read("src/components/listener/DesktopSidebar.tsx");
const sidebarNav = read("src/components/listener/DesktopSidebarNav.tsx");
const profileSections = read("src/components/profile/ProfileSections.tsx");
const profilePage = read("src/app/profile/page.tsx");
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
  true,
  "sidebar shows my-materials when flag is true",
);
assert.equal(
  visible.find((item) => item.key === "my-materials")?.title,
  "Личные материалы",
  "my-materials title preserved",
);
assert.equal(
  visible.filter((item) => item.key === "help").length,
  1,
  "sidebar keeps a single help item when my-materials is visible",
);
assert.equal(
  hidden.filter((item) => item.key === "help").length,
  1,
  "sidebar keeps a single help item when my-materials is hidden",
);

console.log("listener-my-materials-nav-unit: ok");
