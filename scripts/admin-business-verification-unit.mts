// 8d9cd0af P0: owner-reachable Business verification queue in the admin panel.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  allowedBusinessModerationActions,
  businessModerationErrorText,
  canActOnOwnBusinessCase,
  resolveBusinessVerificationFilter,
  statusesForBusinessVerificationFilter,
} from "../src/lib/admin/business-verification";
import { ADMIN_NAV_ITEMS, findAdminNavItemForPath } from "../src/lib/admin/nav";
import { resolvePermissionsForRoles } from "../src/lib/auth/platform-permissions";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Nav: the queue is a real menu item for Business moderators (owner + admin), not for editor/support.
const item = ADMIN_NAV_ITEMS.find((i) => i.href === "/admin/business-verification");
assert.ok(item, "nav item exists");
assert.equal(item.requiredPermission, "author_products.moderate");
assert.equal(findAdminNavItemForPath("/admin/business-verification")?.href, "/admin/business-verification");
assert.ok(resolvePermissionsForRoles(["owner"]).has(item.requiredPermission), "owner sees the queue");
assert.ok(resolvePermissionsForRoles(["admin"]).has(item.requiredPermission), "admin sees the queue");
for (const role of ["editor", "support", "analyst", "finance", "ai_company_viewer"]) {
  assert.ok(!resolvePermissionsForRoles([role]).has(item.requiredPermission), `${role} does not see the queue`);
}

// Transition table mirrors moderator_business_verification_action.
assert.deepEqual(allowedBusinessModerationActions("submitted"), ["approve", "request_info", "reject"]);
assert.deepEqual(allowedBusinessModerationActions("needs_info"), ["reject"]);
assert.deepEqual(allowedBusinessModerationActions("rejected"), ["reopen"]);
assert.deepEqual(allowedBusinessModerationActions("verified"), ["restrict", "revoke"]);
assert.deepEqual(allowedBusinessModerationActions("restricted"), ["revoke"]);
assert.deepEqual(allowedBusinessModerationActions("revoked"), []);
assert.deepEqual(allowedBusinessModerationActions("draft"), []);
const sql = read("supabase/migrations/20270107120000_business_owner_self_moderation.sql");
for (const [action, from] of [["approve", "v.status = 'submitted'"], ["request_info", "v.status = 'submitted'"], ["reject", "v.status IN ('submitted','needs_info')"], ["reopen", "v.status = 'rejected'"], ["restrict", "v.status = 'verified'"], ["revoke", "v.status IN ('verified','restricted')"]]) {
  assert.ok(sql.includes(`WHEN p_action = '${action}' AND ${from}`), `DB transition ${action}`);
}

// Filters.
assert.equal(resolveBusinessVerificationFilter(undefined), "open");
assert.equal(resolveBusinessVerificationFilter("bogus"), "open");
assert.equal(resolveBusinessVerificationFilter("verified"), "verified");
assert.deepEqual(statusesForBusinessVerificationFilter("open"), ["submitted", "needs_info"]);
assert.equal(statusesForBusinessVerificationFilter("all"), null);

// Own case: only the platform owner gets controls (DB enforces the same rule).
assert.equal(canActOnOwnBusinessCase({ isOwnCase: true, isPlatformOwner: true }), true);
assert.equal(canActOnOwnBusinessCase({ isOwnCase: true, isPlatformOwner: false }), false);
assert.equal(canActOnOwnBusinessCase({ isOwnCase: false, isPlatformOwner: false }), true);

// Errors are mapped to Russian texts; raw DB text never leaks.
assert.match(businessModerationErrorText("ERROR: business_self_moderation_forbidden"), /только владелец платформы/);
assert.match(businessModerationErrorText("business_moderation_reason_required"), /причину/);
assert.match(businessModerationErrorText("business_moderator_required"), /Нет прав/);
assert.equal(businessModerationErrorText("some internal detail"), "Не удалось выполнить действие. Попробуйте ещё раз.");

// Actions run the RPCs with the moderator's own session, never the service role.
const actions = read("src/app/(platform)/admin/business-verification/actions.ts");
assert.match(actions, /^"use server";/);
assert.doesNotMatch(actions, /service-role|createServiceRoleClient/);
assert.match(actions, /requireAdminPermission\("author_products\.moderate"\)/g);
assert.equal((actions.match(/requireAdminPermission\("author_products\.moderate"\)/g) ?? []).length, 2);
assert.match(actions, /rpc\("moderator_business_verification_action"/);
assert.match(actions, /rpc\("moderator_business_suspend_product"/);
const page = read("src/app/(platform)/admin/business-verification/page.tsx");
assert.match(page, /requireAdminPermission\("author_products\.moderate"\)/);
assert.match(page, /from\("business_rightsholder_verifications"\)/);
assert.doesNotMatch(page, /service\.from\("business_/, "Business tables are read under RLS, not service role");
assert.doesNotMatch(page, /service\.rpc\(/);
assert.match(page, /supabase\.rpc\("is_platform_owner", \{ p_user_id: session\.userId \}\)/, "UI owner identity = DB is_platform_owner");
assert.match(page, /const isPlatformOwner = ownerFlag === true;/, "fail-closed owner flag");

console.log("admin-business-verification-unit: OK");
