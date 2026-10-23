import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ADMIN_NAV_ATTENTION_QUEUES, buildAdminNavAttention, canCountAdminQueue, resolveAdminNavBadge, shouldExcludeOwnBusinessCases } from "../src/lib/admin/nav-attention";
import { formatAdminNavBadgeCount } from "../src/lib/admin/nav-badge";
import { PLATFORM_TEAM_ROLES, resolvePermissionsForRoles, type PlatformTeamRole } from "../src/lib/auth/platform-permissions";
import type { PlatformAccessSnapshot } from "../src/lib/auth/platform-access";
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const accessFor = (role: PlatformTeamRole): PlatformAccessSnapshot => ({ userId: "viewer", roles: [role], permissions: resolvePermissionsForRoles([role]), usedLegacyFallback: false });
const expected = [
  ["/admin/product-moderation", "author_products.moderate", "practices", "moderation_status", ["submitted"]],
  ["/admin/author-applications", "authors.manage", "author_applications", "status", ["submitted", "in_review"]],
  ["/admin/commercial-applications", "authors.manage", "author_commercial_applications", "status", ["submitted", "in_review"]],
  ["/admin/payout-profiles", "authors.payout_profiles.review", "author_payout_profiles", "status", ["submitted", "in_review"]],
  ["/admin/business-verification", "author_products.moderate", "business_rightsholder_verifications", "status", ["submitted"]],
  ["/classica/production", "classica.production.moderate", "classica_production_jobs", "status", ["in_review"]],
  ["/admin/seo-queries", "seo.manage", "seo_queries", "analysis_status", ["not_analyzed"]],
];
assert.deepEqual(ADMIN_NAV_ATTENTION_QUEUES.map((q) => [q.href, q.permission, q.table, q.column, [...q.statuses]]), expected);
const counts = Object.fromEntries(ADMIN_NAV_ATTENTION_QUEUES.map((q) => [q.href, 150]));
for (const role of PLATFORM_TEAM_ROLES) {
  const access = accessFor(role);
  const result = buildAdminNavAttention(access, counts);
  for (const q of ADMIN_NAV_ATTENTION_QUEUES) {
    const allowed = role === "owner" || access.permissions.has(q.permission);
    assert.deepEqual(result[q.href], allowed ? { badgeCount: 150, badgeTone: "attention", badgeLabel: q.label } : {}, `${role}: ${q.href}`);
    for (const empty of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) {
      assert.deepEqual(resolveAdminNavBadge(access, { [q.href]: empty }, q.href), {});
    }
    for (const status of ["draft", "needs_changes", "needs_info"]) assert.ok(!(q.statuses as readonly string[]).includes(status));
  }
  assert.deepEqual(resolveAdminNavBadge(access, { "/admin": 999 }, "/admin"), {});
}
const operator = accessFor("classica_operator");
assert.equal(operator.permissions.has("classica.production.access"), true);
assert.equal(operator.permissions.has("classica.production.moderate"), false);
assert.equal(canCountAdminQueue(operator, "classica.production.moderate"), false);
assert.deepEqual(resolveAdminNavBadge(operator, counts, "/classica/production"), {});
assert.equal(canCountAdminQueue(accessFor("classica_moderator"), "classica.production.moderate"), true);
assert.equal(canCountAdminQueue({ ...accessFor("owner"), permissions: new Set() }, "future.permission"), true);
assert.equal(formatAdminNavBadgeCount(99), "99");
assert.equal(formatAdminNavBadgeCount(100), "99+");
assert.equal(shouldExcludeOwnBusinessCases(false), true);
assert.equal(shouldExcludeOwnBusinessCases(true), false);
const layout = read("src/app/(platform)/admin/layout.tsx");
assert.match(layout, /buildAdminNavAttention/);
assert.match(layout, /getCachedAdminNavAttentionCounts\(session.access\)/);
assert.match(layout, /dynamic = "force-dynamic"/);
assert.doesNotMatch(layout, /getCachedAdminCommercialApplicationAttentionSummary|getCachedAdminAuthorApplicationAttentionSummary/);
const cache = read("src/lib/admin/nav-attention-cache.ts");
assert.match(cache, /cache\(async/);
assert.match(cache, /Promise.all/);
assert.match(cache, /select\("id", \{ count: "exact", head: true \}\)/);
assert.ok(cache.indexOf("if (!canCountAdminQueue") < cache.indexOf("const service = createServiceRoleClient"));
assert.match(cache, /shouldExcludeOwnBusinessCases\(owner.data === true\)/);
assert.match(cache, /\.neq\("owner_user_id", access.userId\)/);
assert.match(cache, /getCachedAdminProductModerationSubmittedCount\(\)/);
assert.doesNotMatch(cache, /unstable_cache|use cache/);
for (const queue of ["author-applications", "commercial-applications", "payout-profiles", "product-moderation", "business-verification"]) {
  assert.match(read(`src/app/(platform)/admin/${queue}/actions.ts`), /revalidatePath\("\/admin", "layout"\)/, queue);
}
assert.match(read("src/lib/classica/production/actions.ts"), /revalidatePath\("\/admin", "layout"\)/);
console.log("admin-nav-attention-unit: OK");
