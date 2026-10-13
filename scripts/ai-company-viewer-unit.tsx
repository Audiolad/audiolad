/**
 * 7a6fc09c: read-only ai_company_viewer role (Grok's account). Server-side proofs that the viewer can open
 * /admin/ai-company and nothing else, and cannot mutate anything.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { AiCompanyDashboardView } from "../src/components/admin/AiCompanyDashboard";
import { handleOwnerAcceptanceRequest } from "../src/lib/admin/ai-company-acceptance";
import { composeAiCompanyBoard, parseCompanyStatus, parseHistoryFilters } from "../src/lib/admin/ai-company-dashboard";
import { handleOwnerLaunchRequest } from "../src/lib/admin/ai-company-launch";
import { handleOwnerLifecycleRequest } from "../src/lib/admin/ai-company-lifecycle";
import { adminAccessKind, aiCompanyOwnerOnlyResponse, isAiCompanyOwner } from "../src/lib/admin/guard";
import { getVisibleAdminNavItems } from "../src/lib/admin/nav";
import { snapshotHasPermission } from "../src/lib/auth/platform-access";
import { PLATFORM_PERMISSIONS, PLATFORM_ROLE_PERMISSIONS, resolvePermissionsForRoles } from "../src/lib/auth/platform-permissions";

const access = (roles: string[]) =>
  ({ userId: "00000000-0000-4000-8000-0000000000aa", roles, permissions: resolvePermissionsForRoles(roles), usedLegacyFallback: false }) as never;
const viewer = access(["ai_company_viewer"]);

// 1. The role grants exactly ai_company.view. Not admin_panel.access: that code is "platform admin" for paid
// content, access links, course access and user tools (isPlatformAdmin / assertPlatformAdmin).
assert.deepEqual([...PLATFORM_ROLE_PERMISSIONS.ai_company_viewer], ["ai_company.view"]);
for (const code of PLATFORM_PERMISSIONS) {
  assert.equal(snapshotHasPermission(viewer, code), code === "ai_company.view", `viewer ${code}`);
}
assert.equal(isAiCompanyOwner(viewer), false);
assert.equal(isAiCompanyOwner(access(["admin"])), false);
assert.equal(isAiCompanyOwner(access(["owner"])), true);

// 2. Guard decisions: viewer = ai_company_only (layout lets it in, every other admin page redirects it away).
assert.equal(adminAccessKind(viewer), "ai_company_only");
assert.equal(adminAccessKind(access(["owner"])), "panel");
assert.equal(adminAccessKind(access(["admin"])), "panel");
assert.equal(adminAccessKind(access([])), "none");
assert.equal(adminAccessKind(access(["classica_operator"])), "none");
assert.deepEqual(getVisibleAdminNavItems(viewer).map((item) => item.href), ["/admin/ai-company"]);

// 3. ai_company.view opens nothing but the AI company files (no other page/route/action keys on it).
const files: string[] = [];
const walk = (dir: string) => {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(name)) files.push(p);
  }
};
walk("src");
const usesView = files.filter((f) => readFileSync(f, "utf8").includes('"ai_company.view"')).sort();
assert.deepEqual(usesView, [
  "src/lib/admin/guard.ts",
  "src/lib/admin/nav.ts",
  "src/lib/auth/platform-permissions.ts",
]);

// 4. Every admin page is guarded itself (the layout alone admits the viewer), and only the AI company page
// uses the viewer gate.
const pages = files.filter((f) => f.startsWith("src/app/(platform)/admin/") && f.endsWith("/page.tsx"));
assert.ok(pages.length > 15);
for (const page of pages) {
  const src = readFileSync(page, "utf8");
  const viewerGate = src.includes("requireAiCompanyView(");
  const panelGate = /requireAdminPermission\(|requireAdminPanelAccess\(|requireAnyAdminPermission\(/.test(src);
  if (page === "src/app/(platform)/admin/ai-company/page.tsx") assert.ok(viewerGate && !panelGate, page);
  else assert.ok(panelGate && !viewerGate, `${page} must guard with a panel permission`);
}
const guardSrc = readFileSync("src/lib/admin/guard.ts", "utf8");
assert.match(guardSrc, /kind === "ai_company_only"\) \{\s*redirect\(AI_COMPANY_PATH\)/);
assert.match(readFileSync("src/app/(platform)/admin/layout.tsx", "utf8"), /requireAdminLayoutAccess\(\)/);
// Admin API routes outside ai-company never use the viewer gate; their guards need admin_panel.access or a
// section permission the viewer does not have.
for (const route of files.filter((f) => f.startsWith("src/app/api/") && f.endsWith("route.ts"))) {
  const src = readFileSync(route, "utf8");
  if (!route.startsWith("src/app/api/admin/ai-company/")) assert.ok(!src.includes("requireAiCompanyView"), route);
}

async function main() {
// 5. Mutating AI-company endpoints: owner gate before the body is read and before Core; viewer gets 403.
for (const name of ["acceptance", "lifecycle", "launch"]) {
  const src = readFileSync(`src/app/api/admin/ai-company/${name}/route.ts`, "utf8");
  const gate = src.indexOf("if (!isAiCompanyOwner(session.access))");
  assert.ok(gate > 0, `${name} owner gate`);
  assert.ok(gate < src.indexOf("request.json()"), `${name}: gate before body`);
  assert.ok(gate < src.indexOf("await handleOwner"), `${name}: gate before Core`);
  assert.match(src, /return aiCompanyOwnerOnlyResponse\(\);/);
  assert.doesNotMatch(src, /export async function (GET|PUT|PATCH|DELETE)/, `${name}: POST only`);
}
const denied = aiCompanyOwnerOnlyResponse();
assert.equal(denied.status, 403);
assert.equal((await denied.json()).code, "owner_required");

// Defense in depth: the handlers refuse a non-owner without calling Core.
let coreCalls = 0;
const fetchImpl = (async () => {
  coreCalls += 1;
  return new Response("{}", { status: 200 });
}) as typeof fetch;
const actor = { userId: "viewer", isOwner: false };
const common = { base: "https://core.example", token: "t", actor, fetchImpl };
for (const result of [
  await handleOwnerLifecycleRequest({ ...common, body: { taskId: "6b009251", action: "cancel", reason: "x", expectedStatus: "planned", idempotencyKey: "k-1234567890" } }),
  await handleOwnerAcceptanceRequest({ ...common, body: { taskId: "6b009251", decision: "accepted" } }),
  await handleOwnerLaunchRequest({ ...common, body: { taskId: "6b009251" } }),
]) {
  assert.equal(result.status, 403);
  assert.equal(result.body.code, "owner_required");
}
assert.equal(coreCalls, 0, "viewer never reaches Core");

// 6. The page for the viewer (canAccept=false): every lifecycle / launch / acceptance control is disabled.
const json = (name: string) => parseCompanyStatus(JSON.parse(readFileSync(`scripts/fixtures/ai-company/${name}.json`, "utf8")));
const { model } = composeAiCompanyBoard({ data: json("stnow-current"), error: null }, { data: json("stnow-archive"), error: null }, parseHistoryFilters({}));
assert.ok(model);
const html = renderToStaticMarkup(
  <AiCompanyDashboardView model={model} filters={parseHistoryFilters({})} sourceError={null} acceptanceAvailable canAccept={false} onRefresh={() => undefined} />,
);
const buttons = html.match(/<button[^>]*data-(lifecycle|launch)-button[^>]*>/g) ?? [];
for (const button of buttons) assert.match(button, /disabled=""/, button);
// Every submit button is disabled, except the read-only history filter (a GET form).
const withoutFilter = html.replace(/<form[^>]*method="get"[^>]*>[\s\S]*?<\/form>/g, "");
const submits = withoutFilter.match(/<button[^>]*type="submit"[^>]*>/g) ?? [];
for (const button of submits) assert.match(button, /disabled=""/, button);
assert.match(html, /data-acceptance-owner-only/);

// 7. DB: the role exists with only ai_company.view; no user is assigned by the migration.
const migration = readFileSync("supabase/migrations/20261227120000_ai_company_viewer_role.sql", "utf8");
assert.match(migration, /'ai_company_viewer', 'ai_company\.view'/);
assert.doesNotMatch(migration, /platform_user_roles/);
// Two rows only: the role itself and its single permission.
assert.equal((migration.match(/\('ai_company_viewer', '/g) ?? []).length, 2);

console.log("ai-company viewer unit: ok");
}
void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
