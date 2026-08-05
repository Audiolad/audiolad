#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getVisibleAuthorProductStatus,
  getVisibleAuthorProductStatusLabel,
} from "../src/lib/author-products/moderation.ts";
import {
  ADMIN_PRODUCT_MODERATION_FILTER_OPTIONS,
  resolveAdminProductModerationFilter,
} from "../src/lib/admin/product-moderation-status.ts";
import { ADMIN_PRODUCT_MODERATION_CHECKLIST } from "../src/lib/admin/product-moderation-checklist.ts";
import {
  PLATFORM_ROLE_PERMISSIONS,
  resolvePermissionsForRoles,
} from "../src/lib/auth/platform-permissions.ts";
import { getVisibleAdminNavItems } from "../src/lib/admin/nav.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function accessForRoles(roles) {
  return {
    userId: "00000000-0000-4000-8000-000000000001",
    roles,
    permissions: resolvePermissionsForRoles(roles),
    usedLegacyFallback: false,
  };
}

// Filters
assert.equal(resolveAdminProductModerationFilter(undefined), "submitted");
assert.equal(resolveAdminProductModerationFilter("published"), "published");
assert.equal(ADMIN_PRODUCT_MODERATION_FILTER_OPTIONS.length, 4);

// Permission bundles
assert.ok(PLATFORM_ROLE_PERMISSIONS.owner.includes("author_products.moderate"));
assert.ok(PLATFORM_ROLE_PERMISSIONS.admin.includes("author_products.moderate"));
assert.ok(
  !PLATFORM_ROLE_PERMISSIONS.editor.includes("author_products.moderate"),
);

// Nav visibility
const adminNav = getVisibleAdminNavItems(accessForRoles(["admin"]));
assert.ok(adminNav.some((item) => item.href === "/admin/product-moderation"));

const editorNav = getVisibleAdminNavItems(accessForRoles(["editor"]));
assert.ok(
  !editorNav.some((item) => item.href === "/admin/product-moderation"),
);

// Author mapper after changes_requested
assert.equal(
  getVisibleAuthorProductStatusLabel(
    getVisibleAuthorProductStatus({
      status: "draft",
      moderationStatus: "changes_requested",
    }),
  ),
  "Требуются изменения",
);

assert.equal(
  getVisibleAuthorProductStatusLabel(
    getVisibleAuthorProductStatus({
      status: "published",
      moderationStatus: "approved",
    }),
  ),
  "Опубликован",
);

assert.ok(ADMIN_PRODUCT_MODERATION_CHECKLIST.length >= 4);

// Source guards
const schemaMigration = read(
  "supabase/migrations/20260731180000_practice_moderation_mvp_schema.sql",
);
assert.match(schemaMigration, /author_products\.moderate/);

const migration = read(
  "supabase/migrations/20260731181000_practice_moderation_mvp_gates_and_rpcs.sql",
);
assert.match(migration, /approve_and_publish_practice/);
assert.match(migration, /request_practice_changes/);
assert.match(migration, /author_products\.moderate/);
assert.match(migration, /moderation_state_changed/);
assert.match(migration, /moderation_comment_required/);
assert.match(migration, /SET search_path = public, pg_temp/);
assert.match(migration, /audiolad\.allow_practice_publish/);
assert.doesNotMatch(migration, /practice_moderation_email_outbox/);

const preserveListed = read(
  "supabase/migrations/20260805194500_preserve_catalog_listed_on_publish.sql",
);
assert.match(
  preserveListed,
  /COALESCE\(v_practice\.is_catalog_listed, true\)/,
);
assert.match(preserveListed, /approve-and-publish-practice:v2/);

const page = read("src/app/admin/product-moderation/page.tsx");
assert.match(page, /requireAdminPermission\("author_products\.moderate"\)/);
assert.match(page, /Сейчас нет продуктов, ожидающих модерации/);

const detail = read("src/app/admin/product-moderation/[id]/page.tsx");
assert.match(detail, /requireAdminPermission\("author_products\.moderate"\)/);

const actions = read("src/app/admin/product-moderation/actions.ts");
assert.match(actions, /approveAndPublishPractice/);
assert.match(actions, /requestPracticeChanges/);
assert.match(actions, /comment\.length < 10/);

const form = read("src/components/admin/ProductModerationReviewForm.tsx");
assert.match(form, /Одобрить и опубликовать/);
assert.match(form, /Требуются изменения/);
assert.doesNotMatch(form, /Отклонить/);
assert.match(form, /AdminAudioPlayer/);
assert.match(form, /История модерации/);

const nav = read("src/lib/admin/nav.ts");
assert.match(nav, /Модерация продуктов/);
assert.match(nav, /author_products\.moderate/);

const preview = read(
  "src/app/api/admin/product-moderation/[id]/audio/[audioId]/preview/route.ts",
);
assert.match(preview, /author_products\.moderate/);
assert.match(preview, /createSignedUrl/);

const queries = read("src/lib/admin/product-moderation-queries.ts");
assert.match(queries, /moderation_submitted_at/);
assert.match(queries, /ascending:\s*true/);
assert.match(queries, /\.is\("deleted_at", null\)/);

console.log("admin-product-moderation-unit: ok");
