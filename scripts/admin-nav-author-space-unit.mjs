#!/usr/bin/env node
/**
 * Top admin menu no longer exposes studio creation.
 * The service route stays, and the authors section links to it only with authors.manage.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ADMIN_NAV_ITEMS,
  findAdminNavItemForPath,
  getVisibleAdminNavItems,
  isAdminNavPathActive,
} from "../src/lib/admin/nav.ts";
import { resolvePermissionsForRoles } from "../src/lib/auth/platform-permissions.ts";

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

assert.equal(
  ADMIN_NAV_ITEMS.some(
    (item) =>
      item.href === "/admin/authors/new" || item.label === "Создать студию",
  ),
  false,
  "ADMIN_NAV_ITEMS must not include «Создать студию»",
);

for (const roles of [["owner"], ["admin"], ["editor"], ["support"], []]) {
  const visible = getVisibleAdminNavItems(accessForRoles(roles));
  assert.equal(
    visible.some(
      (item) =>
        item.href === "/admin/authors/new" ||
        item.label === "Создать студию" ||
        item.label === "Создать авторское пространство",
    ),
    false,
    `${roles.join(",") || "listener"} must not see studio creation in the top menu`,
  );
}

const authorApplicationsNav = ADMIN_NAV_ITEMS.find(
  (item) => item.href === "/admin/author-applications",
);
assert.ok(authorApplicationsNav);
assert.equal(authorApplicationsNav.requiredPermission, "authors.view");
assert.deepEqual(authorApplicationsNav.activePrefixes, ["/admin/authors/new"]);

assert.equal(
  findAdminNavItemForPath("/admin/authors/new")?.href,
  "/admin/author-applications",
);
assert.equal(
  findAdminNavItemForPath("/admin/authors/new/extra")?.href,
  "/admin/author-applications",
);
assert.equal(
  findAdminNavItemForPath("/admin/author-applications")?.href,
  "/admin/author-applications",
);
assert.equal(
  findAdminNavItemForPath("/admin/authors/slug")?.href,
  "/admin/authors/slug",
);
assert.equal(
  isAdminNavPathActive(
    {
      href: authorApplicationsNav.href,
      activePrefixes: authorApplicationsNav.activePrefixes,
    },
    "/admin/authors/new",
  ),
  true,
);
assert.equal(
  isAdminNavPathActive({ href: "/admin/authors/slug" }, "/admin/authors/new"),
  false,
);
assert.equal(isAdminNavPathActive({ href: "/admin" }, "/admin"), true);
assert.equal(isAdminNavPathActive({ href: "/admin" }, "/admin/authors/new"), false);
assert.equal(
  isAdminNavPathActive(
    {
      href: "/admin/author-applications",
      activePrefixes: ["/admin/authors/new"],
    },
    "/admin/authors/newest",
  ),
  false,
);

const applicationsPage = read(
  "src/app/(platform)/admin/author-applications/page.tsx",
);
assert.match(applicationsPage, /requireAdminPermission\("authors\.view"\)/);
assert.match(
  applicationsPage,
  /const canManageAuthors = snapshotHasPermission\(\s*session\.access,\s*"authors\.manage",\s*\)/,
);
assert.match(
  applicationsPage,
  /canManageAuthors \? \([\s\S]*href="\/admin\/authors\/new"[\s\S]*Создать авторское пространство/,
);
assert.equal(
  (applicationsPage.match(/Создать авторское пространство/g) ?? []).length,
  1,
);
assert.doesNotMatch(
  applicationsPage,
  /Создать авторское пространство[\s\S]*canManageAuthors \?/,
);

for (const relPath of [
  "src/app/(platform)/admin/commercial-applications/page.tsx",
  "src/app/(platform)/admin/users/page.tsx",
  "src/app/(platform)/admin/product-moderation/page.tsx",
  "src/app/(platform)/admin/page.tsx",
  "src/components/admin/AdminNav.tsx",
  "src/lib/admin/nav.ts",
]) {
  assert.doesNotMatch(
    read(relPath),
    /Создать авторское пространство/,
    `${relPath} must not render the authors-only secondary link`,
  );
}

assert.match(read("src/components/admin/AdminNav.tsx"), /isAdminNavPathActive/);
assert.match(
  read("src/app/(platform)/admin/layout.tsx"),
  /matchPrefixes: item\.activePrefixes/,
);
assert.match(
  read("src/app/(platform)/admin/authors/new/page.tsx"),
  /requireAdminPermission\("authors\.manage"\)/,
);
assert.match(
  read("src/app/(platform)/admin/authors/new/actions.ts"),
  /requireAdminPermission\("authors\.manage"\)/,
);
assert.match(
  read("src/app/(platform)/admin/authors/new/actions.ts"),
  /export async function createStudioWorkspace/,
);

console.log("admin-nav-author-space-unit: ok");
