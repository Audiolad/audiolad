#!/usr/bin/env node

/**
 * Security and regression checks for platform-owner author support mode.
 * No network, no Supabase credentials, no mutations.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  AUTHOR_SUPPORT_COOKIE_NAME,
  AUTHOR_SUPPORT_TTL_SECONDS,
  assertSupportAuthorScope,
  buildAuthorSupportCookieOptions,
  evaluateAuthorSupportStart,
  isAuthorSupportSensitivePath,
  isAuthorSupportSessionUsable,
  resolveAuthorSupportLandingPath,
  resolveAuthorSupportReturnPath,
  resolveSupportBypassCapability,
  sanitizeAuthorSupportAuditMetadata,
} from "../src/lib/author-support/policy.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

const ownerId = "11111111-1111-4111-8111-111111111111";
const adminId = "22222222-2222-4222-8222-222222222222";
const targetUserId = "33333333-3333-4333-8333-333333333333";
const targetAuthorId = "44444444-4444-4444-8444-444444444444";
const otherAuthorId = "55555555-5555-4555-8555-555555555555";
const otherUserId = "66666666-6666-4666-8666-666666666666";

// non-owner cannot start
assert.equal(
  evaluateAuthorSupportStart({
    actorUserId: adminId,
    actorIsPlatformOwner: false,
    targetUserId,
    targetAuthorId,
    targetUserExists: true,
    membershipRole: "owner",
  }).ok,
  false,
);
assert.equal(
  evaluateAuthorSupportStart({
    actorUserId: adminId,
    actorIsPlatformOwner: false,
    targetUserId,
    targetAuthorId,
    targetUserExists: true,
    membershipRole: "owner",
  }).code,
  "not_platform_owner",
);

// users.view / support / editor / moderator are not enough — only owner
assert.equal(
  evaluateAuthorSupportStart({
    actorUserId: adminId,
    actorIsPlatformOwner: false,
    targetUserId,
    targetAuthorId,
    targetUserExists: true,
    membershipRole: "editor",
  }).code,
  "not_platform_owner",
);

// owner can start
assert.deepEqual(
  evaluateAuthorSupportStart({
    actorUserId: ownerId,
    actorIsPlatformOwner: true,
    targetUserId,
    targetAuthorId,
    targetUserExists: true,
    membershipRole: "owner",
  }),
  { ok: true },
);

// nonexistent target rejected
assert.equal(
  evaluateAuthorSupportStart({
    actorUserId: ownerId,
    actorIsPlatformOwner: true,
    targetUserId,
    targetAuthorId,
    targetUserExists: false,
    membershipRole: "owner",
  }).code,
  "target_not_found",
);

// authorId without membership rejected
assert.equal(
  evaluateAuthorSupportStart({
    actorUserId: ownerId,
    actorIsPlatformOwner: true,
    targetUserId,
    targetAuthorId,
    targetUserExists: true,
    membershipRole: null,
  }).code,
  "author_membership_required",
);

// actingAuthorId spoof rejected
assert.equal(
  assertSupportAuthorScope({
    actingAuthorId: targetAuthorId,
    requestedAuthorId: otherAuthorId,
  }),
  false,
);
assert.equal(
  assertSupportAuthorScope({
    actingAuthorId: targetAuthorId,
    requestedAuthorId: targetAuthorId,
  }),
  true,
);

const activeSession = {
  id: "sess-1",
  actorUserId: ownerId,
  actingUserId: targetUserId,
  actingAuthorId: targetAuthorId,
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  revokedAt: null,
};

// expired / revoked rejected
assert.equal(
  isAuthorSupportSessionUsable({
    session: { ...activeSession, expiresAt: new Date(Date.now() - 1000).toISOString() },
    realUserId: ownerId,
  }),
  false,
);
assert.equal(
  isAuthorSupportSessionUsable({
    session: { ...activeSession, revokedAt: new Date().toISOString() },
    realUserId: ownerId,
  }),
  false,
);

// bound to realUserId — another actor cannot use the session
assert.equal(
  isAuthorSupportSessionUsable({
    session: activeSession,
    realUserId: adminId,
  }),
  false,
);
assert.equal(
  isAuthorSupportSessionUsable({
    session: activeSession,
    realUserId: ownerId,
  }),
  true,
);

// scoped to one author space
assert.equal(
  assertSupportAuthorScope({
    actingAuthorId: targetAuthorId,
    requestedAuthorId: otherAuthorId,
  }),
  false,
);

// capabilities from acting author, not platform owner
assert.equal(
  resolveSupportBypassCapability({
    authorCanBypass: false,
    actorHasModeratePermission: true,
    isSupportMode: true,
  }),
  false,
);
assert.equal(
  resolveSupportBypassCapability({
    authorCanBypass: true,
    actorHasModeratePermission: false,
    isSupportMode: true,
  }),
  true,
);
assert.equal(
  resolveSupportBypassCapability({
    authorCanBypass: false,
    actorHasModeratePermission: true,
    isSupportMode: false,
  }),
  true,
);

// sensitive routes
for (const pathName of [
  "/settings",
  "/profile/edit",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/author-dashboard/finance",
  "/author-dashboard/commercial/payout-details",
  "/api/author/payout-profile",
  "/api/author/finance/summary",
]) {
  assert.equal(isAuthorSupportSensitivePath(pathName), true, pathName);
}

assert.equal(isAuthorSupportSensitivePath("/author-dashboard"), false);
assert.equal(isAuthorSupportSensitivePath("/author-dashboard/products/1"), false);
assert.equal(isAuthorSupportSensitivePath("/studio/projects"), false);
assert.equal(isAuthorSupportSensitivePath("/admin/users"), false);

// cookie flags
const cookie = buildAuthorSupportCookieOptions({ secure: true });
assert.equal(cookie.name, AUTHOR_SUPPORT_COOKIE_NAME);
assert.equal(cookie.httpOnly, true);
assert.equal(cookie.sameSite, "lax");
assert.equal(cookie.secure, true);
assert.equal(cookie.maxAge, AUTHOR_SUPPORT_TTL_SECONDS);
assert.ok(AUTHOR_SUPPORT_TTL_SECONDS <= 12 * 60 * 60);

// audit sanitization
const sanitized = sanitizeAuthorSupportAuditMetadata({
  changed_fields: ["format", "title"],
  format: "Медитация",
  password: "secret",
  token: "opaque-token",
  service_role_key: "x",
  encrypted_payload: "{}",
});
assert.deepEqual(sanitized.changed_fields, ["format", "title"]);
assert.equal(sanitized.format, "Медитация");
assert.equal(sanitized.password, undefined);
assert.equal(sanitized.token, undefined);
assert.equal(sanitized.service_role_key, undefined);
assert.equal(sanitized.encrypted_payload, undefined);

// landing / exit
assert.equal(
  resolveAuthorSupportLandingPath({ destination: "cabinet", authorSlug: "anna" }),
  "/author-dashboard?author=anna",
);
assert.equal(
  resolveAuthorSupportLandingPath({ destination: "studio", authorSlug: "anna" }),
  "/studio/projects",
);
assert.equal(resolveAuthorSupportReturnPath(targetUserId), `/admin/users/${targetUserId}`);

// happy-path state machine (e2e substitute — no Playwright suite on main)
const flow = [];
assert.equal(
  evaluateAuthorSupportStart({
    actorUserId: ownerId,
    actorIsPlatformOwner: true,
    targetUserId,
    targetAuthorId,
    targetUserExists: true,
    membershipRole: "editor",
  }).ok,
  true,
);
flow.push("start");
assert.equal(
  resolveAuthorSupportLandingPath({ destination: "cabinet", authorSlug: "anna" }).startsWith(
    "/author-dashboard",
  ),
  true,
);
flow.push("dashboard");
assert.equal(
  sanitizeAuthorSupportAuditMetadata({ changed_fields: ["format"], format: "Медитация" }).format,
  "Медитация",
);
flow.push("edit-save");
assert.equal(resolveAuthorSupportLandingPath({ destination: "studio", authorSlug: "anna" }), "/studio/projects");
flow.push("studio");
assert.equal(resolveAuthorSupportReturnPath(targetUserId).includes(targetUserId), true);
flow.push("exit");
assert.deepEqual(flow, ["start", "dashboard", "edit-save", "studio", "exit"]);

// other user / other space denied
assert.equal(
  assertSupportAuthorScope({
    actingAuthorId: targetAuthorId,
    requestedAuthorId: otherAuthorId,
  }),
  false,
);
assert.equal(
  isAuthorSupportSessionUsable({
    session: { ...activeSession, actingUserId: otherUserId, actingAuthorId: otherAuthorId },
    realUserId: ownerId,
  }),
  true,
);
assert.equal(
  assertSupportAuthorScope({
    actingAuthorId: otherAuthorId,
    requestedAuthorId: targetAuthorId,
  }),
  false,
);

// Source architecture
const context = read("src/lib/author-support/context.ts");
assert.match(context, /export async function getAuthorExecutionContext/);
assert.match(context, /realUserId/);
assert.match(context, /actingUserId/);
assert.match(context, /actingAuthorId/);
assert.match(context, /isSupportMode/);
assert.doesNotMatch(context, /signInWithPassword/);
assert.doesNotMatch(context, /auth\.admin/);
assert.doesNotMatch(context, /updateUser\(\{\s*id/);

const actions = read("src/lib/author-support/actions.ts");
assert.match(actions, /requirePlatformOwnerAccess/);
assert.match(actions, /"use server"/);
assert.match(actions, /startAuthorSupportMode/);
assert.match(actions, /stopAuthorSupportMode/);
assert.doesNotMatch(actions, /author_members"\)\s*\.insert/);
assert.doesNotMatch(actions, /impersonat/i);
assert.doesNotMatch(actions, /GET/);

const session = read("src/lib/author-support/session.ts");
assert.match(session, /httpOnly/);
assert.match(session, /sameSite/);
assert.match(session, /hashAuthorSupportToken/);
assert.doesNotMatch(session, /console\.(log|info|debug).*token/);

const store = read("src/lib/author-support/store.ts");
assert.match(store, /token_hash/);
assert.match(store, /createServiceRoleClient/);
assert.doesNotMatch(store, /console\.(log|info).*token/);

const auth = read("src/lib/author-products/auth.ts");
assert.match(auth, /peekAuthorExecutionContext/);
assert.match(auth, /getAuthorDataClient/);
assert.match(auth, /requestedAuthorMatchesSupport/);
assert.match(auth, /author\.can_bypass_product_moderation === true \|\| actorCanBypass/);
assert.match(auth, /eq\("user_id", user\.id\)/);

const moderation = read("src/lib/author-products/moderation.ts");
assert.match(moderation, /resolveSupportBypassCapability/);
assert.match(moderation, /author_products\.moderate/);

const sql = read("supabase/migrations/20260901120000_author_support_mode.sql");
assert.match(sql, /CREATE TABLE IF NOT EXISTS public.author_support_sessions/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS public.author_support_audit_events/);
assert.match(sql, /actor_user_id/);
assert.match(sql, /acting_user_id/);
assert.match(sql, /acting_author_id/);
assert.match(sql, /token_hash/);
assert.match(sql, /author_support_session_allows/);
assert.match(sql, /author_members_can_mutate/);
assert.match(sql, /is_platform_owner/);
assert.match(sql, /REVOKE ALL ON TABLE public.author_support_sessions FROM authenticated/);
assert.match(sql, /REVOKE ALL ON TABLE public.author_support_audit_events FROM authenticated/);
assert.match(sql, /NOT public.author_support_session_allows\(p_author_id\)/);
assert.doesNotMatch(sql, /INSERT INTO public.author_members/);
assert.doesNotMatch(sql, /SET request\.jwt\.claim\.sub/);
assert.doesNotMatch(sql, /auth\.uid\(\)\s*=\s*acting_user_id/);

const userDetailPage = read("src/app/(platform)/admin/users/[userId]/page.tsx");
assert.match(userDetailPage, /requireAdminPermission\("users\.view"\)/);
assert.match(userDetailPage, /getPlatformOwnerSessionIfOwner/);
assert.match(userDetailPage, /Диагностика/);
assert.match(userDetailPage, /AdminUserSupportActions/);
assert.doesNotMatch(userDetailPage, /impersonat/i);
assert.doesNotMatch(userDetailPage, /actingUserId/);

const supportActionsUi = read("src/components/admin/AdminUserSupportActions.tsx");
assert.match(supportActionsUi, /Войти в кабинет автора/);
assert.match(supportActionsUi, /Открыть Студию/);
assert.match(supportActionsUi, /startAuthorSupportMode/);
assert.doesNotMatch(supportActionsUi, /impersonat/i);

const banner = read("src/components/author-support/AuthorSupportBanner.tsx");
assert.match(banner, /Режим сопровождения/);
assert.match(banner, /записываются в журнал/);
assert.match(banner, /Вернуться в админку/);
assert.match(banner, /stopAuthorSupportMode/);

const dashboardLayout = read("src/app/(platform)/author-dashboard/layout.tsx");
assert.match(dashboardLayout, /AuthorSupportBannerGate/);
const studioLayout = read("src/app/(studio)/studio/layout.tsx");
assert.match(studioLayout, /AuthorSupportBannerGate/);

const signOut = read("src/app/(platform)/auth/sign-out/actions.ts");
assert.match(signOut, /clearAuthorSupportModeOnLogout/);

const proxy = read("src/lib/supabase/proxy.ts");
assert.match(proxy, /AUTHOR_SUPPORT_COOKIE_NAME/);
assert.match(proxy, /isAuthorSupportSensitivePath/);

const financeGuard = read("src/lib/author-finance/route-guard.ts");
assert.match(financeGuard, /support_sensitive_route_blocked/);

const payoutRoute = read("src/app/api/author/payout-profile/route.ts");
assert.match(payoutRoute, /support_sensitive_route_blocked/);

const productPatch = read("src/app/api/author/products/[id]/route.ts");
assert.match(productPatch, /product_updated/);
assert.match(productPatch, /changed_fields/);

const submitRoute = read("src/app/api/author/products/[id]/submit-for-moderation/route.ts");
assert.match(submitRoute, /product_submitted_for_moderation/);

const audioUpload = read("src/app/api/author/products/[id]/audio/[audioId]/upload/route.ts");
assert.match(audioUpload, /product_track_updated/);
assert.match(audioUpload, /buildAudioItemStoragePath/);

const studioRepo = read("src/lib/studio/server/repository.ts");
assert.match(studioRepo, /studio_project_updated/);
assert.match(studioRepo, /studio_asset_uploaded/);
assert.match(studioRepo, /requireAuthorMembership/);
assert.match(studioRepo, /isStudioStoragePath/);

const studioAccess = read("src/lib/studio/access.ts");
assert.match(studioAccess, /listAuthorWorkspacesForUser/);

assert.equal(existsSync(path.join(root, "src/app/admin/impersonate")), false);
assert.doesNotMatch(read("src/lib/author-support/actions.ts"), /impersonate\?user=/);

const clientBundleGuards = [
  "src/components/author-support/AuthorSupportBanner.tsx",
  "src/components/author-support/AuthorSupportModeProvider.tsx",
  "src/components/admin/AdminUserSupportActions.tsx",
];
for (const file of clientBundleGuards) {
  const source = read(file);
  assert.doesNotMatch(source, /createServiceRoleClient/);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/);
}

const diagnosticsPage = read(
  "src/app/(platform)/admin/products/[productId]/diagnostics/page.tsx",
);
assert.match(diagnosticsPage, /requireAdminPermission\("users\.view"\)/);
assert.match(diagnosticsPage, /getAdminProductDiagnostics/);
assert.doesNotMatch(diagnosticsPage, /impersonat/i);

console.log("author-support-mode-unit: ok");
