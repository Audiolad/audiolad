#!/usr/bin/env node
/**
 * Platform RBAC foundation — pure permission/nav/shell visibility checks.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getVisibleAdminNavItems,
  ADMIN_NAV_ITEMS,
} from "../src/lib/admin/nav.ts";
import {
  PLATFORM_PERMISSIONS,
  PLATFORM_ROLE_PERMISSIONS,
  legacyProfileRoleToTeamRoles,
  resolvePermissionsForRoles,
  rolesGrantPermission,
} from "../src/lib/auth/platform-permissions.ts";
import { resolveShowAuthorEntry } from "../src/lib/listener/author-cta.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relPath) {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

function accessForRoles(roles) {
  return {
    userId: "00000000-0000-4000-8000-000000000001",
    roles,
    permissions: resolvePermissionsForRoles(roles),
    usedLegacyFallback: false,
  };
}

// --- Role bundles ---
assert.ok(
  rolesGrantPermission(["owner"], "finance.view"),
  "owner has finance.view",
);
assert.ok(
  rolesGrantPermission(["owner"], "audit_log.view"),
  "owner has audit_log.view",
);
assert.ok(
  rolesGrantPermission(["owner"], "future.unknown.permission"),
  "owner bypasses unknown future permissions",
);
assert.equal(
  rolesGrantPermission(["editor"], "finance.view"),
  false,
  "editor must not see finance",
);
assert.equal(
  rolesGrantPermission(["editor"], "users.manage"),
  false,
  "editor must not manage users",
);
assert.ok(
  rolesGrantPermission(["editor"], "products.moderate"),
  "editor can moderate products",
);
assert.ok(
  rolesGrantPermission(["editor"], "admin_panel.access"),
  "editor can enter panel",
);
assert.equal(
  rolesGrantPermission(["analyst"], "authors.manage"),
  false,
  "analyst cannot manage authors",
);
assert.ok(
  rolesGrantPermission(["analyst"], "analytics.view"),
  "analyst can view analytics",
);
assert.equal(
  rolesGrantPermission(["support"], "dashboard.view"),
  false,
  "support has no dashboard.view",
);
assert.deepEqual(legacyProfileRoleToTeamRoles("platform_owner"), ["owner"]);
assert.deepEqual(legacyProfileRoleToTeamRoles("platform_admin"), ["admin"]);
assert.deepEqual(legacyProfileRoleToTeamRoles("listener"), []);

for (const code of PLATFORM_PERMISSIONS) {
  assert.ok(
    PLATFORM_ROLE_PERMISSIONS.owner.includes(code),
    `owner bundle includes ${code}`,
  );
}

// --- Nav visibility ---
const ownerNav = getVisibleAdminNavItems(accessForRoles(["owner"]));
assert.equal(ownerNav.length, ADMIN_NAV_ITEMS.length, "owner sees all nav items");

const editorNav = getVisibleAdminNavItems(accessForRoles(["editor"]));
assert.deepEqual(
  editorNav.map((item) => item.href),
  ["/admin", "/admin/author-applications"],
  "editor sees overview + applications, not users",
);

const supportNav = getVisibleAdminNavItems(accessForRoles(["support"]));
assert.deepEqual(
  supportNav.map((item) => item.href),
  ["/admin/author-applications", "/admin/users"],
  "support sees applications + users",
);

const financeNav = getVisibleAdminNavItems(accessForRoles(["finance"]));
assert.deepEqual(
  financeNav.map((item) => item.href),
  [],
  "finance has no current nav sections (no empty finance UI)",
);

const listenerNav = getVisibleAdminNavItems(accessForRoles([]));
assert.equal(listenerNav.length, 0, "listener sees no admin nav");

// --- Home button visibility (independent author / admin) ---
assert.equal(
  resolveShowAuthorEntry({
    authorCtaLabel: "Кабинет автора",
    showAdminPanel: false,
  }),
  true,
  "author sees cabinet button",
);
assert.equal(
  resolveShowAuthorEntry({
    authorCtaLabel: "Кабинет автора",
    showAdminPanel: true,
  }),
  true,
  "owner/author sees cabinet with admin panel",
);
assert.equal(
  resolveShowAuthorEntry({
    authorCtaLabel: "Стать автором",
    showAdminPanel: true,
  }),
  false,
  "staff without author space does not see become-author CTA",
);
assert.equal(
  resolveShowAuthorEntry({
    authorCtaLabel: "Стать автором",
    showAdminPanel: false,
  }),
  true,
  "listener still sees become-author CTA",
);

// --- Source wiring / no client email checks ---
const rightColumn = read("src/components/listener/DesktopRightColumnTop.tsx");
assert.match(rightColumn, /Панель управления/);
assert.match(rightColumn, /showAdminPanel/);
assert.match(rightColumn, /showAuthorEntry/);
assert.doesNotMatch(rightColumn, /@audiolad\.ru|platform_owner|1@/);

const shellData = read("src/lib/listener/shell-data.ts");
assert.match(shellData, /showAdminPanel/);
assert.match(shellData, /hasAdminPanelAccess/);
assert.match(shellData, /adminPanelHref: "\/admin"/);

const guard = read("src/lib/admin/guard.ts");
assert.match(guard, /notFound\(\)/);
assert.match(guard, /forbidden\(\)/);
assert.match(guard, /admin_panel\.access/);

const migration = read(
  "supabase/migrations/20260725120000_platform_rbac_foundation.sql",
);
assert.match(migration, /platform_user_roles/);
assert.match(migration, /has_platform_permission/);
assert.match(migration, /role_code = 'owner'/);
assert.match(migration, /platform_owner/);
assert.match(migration, /platform_admin/);
assert.doesNotMatch(
  migration,
  /lower\('1@audiolad\.ru'\)/,
  "migration must not hardcode owner email",
);

const actions = read("src/app/admin/author-applications/actions.ts");
assert.match(actions, /requireAdminPermission\("authors\.manage"\)/);
assert.doesNotMatch(actions, /requireAdminPanelAccess\(\)/);

const usersActions = read("src/app/admin/users/actions.ts");
assert.match(usersActions, /requireAdminPermission\("users\.manage"\)/);

const playlistApi = read("src/app/api/playlists/route.ts");
assert.match(playlistApi, /products\.moderate/);

console.log("platform-rbac-unit: ok");
