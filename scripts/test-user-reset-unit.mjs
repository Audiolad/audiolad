#!/usr/bin/env node
/**
 * Read-only unit/static checks for allowlisted test user reset.
 *
 * Usage:
 *   npx tsx scripts/test-user-reset-unit.mjs
 *
 * Mutating integration tests live in scripts/test-user-reset-integration.mjs
 * and require explicit opt-in (see npm run test:test-user-reset:integration).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  TEST_USER_RESET_CONFIRMATION_PHRASE,
  TEST_USER_RESET_EMAIL,
  TEST_USER_RESET_NORMALIZED_EMAIL,
} from "../src/lib/admin/test-user-reset/constants.ts";
import {
  buildScopedAnalyticsEventFilters,
  buildScopedAnalyticsSessionFilters,
} from "../src/lib/admin/test-user-reset/analytics-scope.ts";
import {
  canActorResetTestUser,
  evaluateTestUserResetBlockers,
  isAllowlistedTestUserEmail,
  isValidTestUserResetConfirmationPhrase,
  normalizeAllowlistedTestEmail,
} from "../src/lib/admin/test-user-reset/policy.ts";
import {
  PLATFORM_ADMIN_ROLE,
  PLATFORM_OWNER_ROLE,
  LISTENER_ROLE,
} from "../src/lib/auth/platform-admin.ts";
import { TEST_USER_RESET_BLOCK_CODES } from "../src/lib/admin/test-user-reset/types.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readRepoFile(...segments) {
  return readFileSync(path.join(ROOT, ...segments), "utf8");
}

function testPolicy() {
  assert(
    isAllowlistedTestUserEmail("audiolad@mail.ru"),
    "allowlisted email accepted",
  );
  assert(
    isAllowlistedTestUserEmail("Audiolad@Mail.RU"),
    "case-insensitive domain accepted",
  );
  assert(!isAllowlistedTestUserEmail("other@mail.ru"), "other email rejected");
  assert(
    normalizeAllowlistedTestEmail(" Audiolad@Mail.RU ") ===
      TEST_USER_RESET_NORMALIZED_EMAIL,
    "normalize email",
  );
  assert(
    isValidTestUserResetConfirmationPhrase(TEST_USER_RESET_CONFIRMATION_PHRASE),
    "valid confirmation phrase",
  );
  assert(
    !isValidTestUserResetConfirmationPhrase("СБРОСИТЬ other@mail.ru"),
    "invalid confirmation phrase",
  );
  assert(canActorResetTestUser(PLATFORM_OWNER_ROLE), "owner allowed");
  assert(!canActorResetTestUser(PLATFORM_ADMIN_ROLE), "admin forbidden");
  assert(!canActorResetTestUser(LISTENER_ROLE), "listener forbidden");

  const ordersBlock = evaluateTestUserResetBlockers({
    resolvedEmail: TEST_USER_RESET_EMAIL,
    profileRole: LISTENER_ROLE,
    counts: {
      userPractices: 0,
      practiceAudioProgress: 0,
      playlists: 0,
      playlistItems: 0,
      emailContacts: 0,
      emailPreferences: 0,
      emailConsents: 0,
      emailOutbox: 0,
      emailDeliveryEvents: 0,
      analyticsSessions: 0,
      analyticsEvents: 0,
      orders: 1,
      payments: 0,
      refundedOrders: 0,
      personalMaterialsCreated: 0,
      personalMaterialsClaimed: 0,
      authorMembers: 0,
      authorApplications: 0,
      promotionCampaigns: 0,
      personalMaterialTemplates: 0,
    },
  });
  assert(
    ordersBlock.some((row) => row.code === TEST_USER_RESET_BLOCK_CODES.orders),
    "orders blocker",
  );

  const wrongEmail = evaluateTestUserResetBlockers({
    resolvedEmail: "other@mail.ru",
    profileRole: LISTENER_ROLE,
    counts: {
      userPractices: 0,
      practiceAudioProgress: 0,
      playlists: 0,
      playlistItems: 0,
      emailContacts: 0,
      emailPreferences: 0,
      emailConsents: 0,
      emailOutbox: 0,
      emailDeliveryEvents: 0,
      analyticsSessions: 0,
      analyticsEvents: 0,
      orders: 0,
      payments: 0,
      refundedOrders: 0,
      personalMaterialsCreated: 0,
      personalMaterialsClaimed: 0,
      authorMembers: 0,
      authorApplications: 0,
      promotionCampaigns: 0,
      personalMaterialTemplates: 0,
    },
  });
  assert(
    wrongEmail.some(
      (row) => row.code === TEST_USER_RESET_BLOCK_CODES.wrong_email_target,
    ),
    "wrong email blocker",
  );
}

function testStaticWiring() {
  const actions = readRepoFile("src", "app", "admin", "users", "test-reset-actions.ts");
  const panel = readRepoFile("src", "components", "admin", "TestUserResetPanel.tsx");
  const reset = readRepoFile("src", "lib", "admin", "test-user-reset", "reset.ts");
  const page = readRepoFile("src", "app", "admin", "users", "page.tsx");

  assert(actions.includes("requirePlatformOwnerAccess"), "owner guard in actions");
  assert(actions.includes("resetAllowlistedTestUser"), "reset service wired");
  assert(!actions.includes("confirmationPhrase: email"), "no email param contract");
  assert(panel.includes("Сброс тестового пользователя"), "panel title");
  assert(panel.includes("TEST_USER_RESET_CONFIRMATION_PHRASE"), "panel phrase constant");
  assert(panel.includes("Очистить локальные тестовые данные"), "local clear button");
  assert(reset.includes("auth.admin.deleteUser"), "auth admin delete used");
  assert(!reset.includes("DELETE FROM auth.users"), "no direct auth sql delete");
  assert(page.includes("TestUserResetPanel"), "panel on users page");
  assert(page.includes("getPlatformOwnerSessionIfOwner"), "owner-only render gate");
  assert(panel.includes("submitLockRef"), "double submit lock in UI");
  assert(!panel.includes("createServiceRoleClient"), "service role stays server-side");
  assert(reset.includes('update({ reviewed_by: null })'), "reviewed_by cleared like admin delete");
  assert(!reset.includes("approved_by: null"), "approved_by not auto-cleared");
  assert(reset.includes("buildScopedAnalyticsEventFilters"), "scoped analytics event filters");
  assert(reset.includes("buildScopedAnalyticsSessionFilters"), "scoped analytics session filters");
}

function testAnalyticsScopeFilters() {
  const targetUserId = "11111111-1111-1111-1111-111111111111";
  const otherUserId = "22222222-2222-2222-2222-222222222222";
  const sharedAnonymous = "anon-shared-123";
  const sharedSession = "33333333-3333-3333-3333-333333333333";

  const eventFilters = buildScopedAnalyticsEventFilters(
    targetUserId,
    [sharedAnonymous],
    [sharedSession],
  );

  assert(
    eventFilters.some((filter) => filter === `user_id.eq.${targetUserId}`),
    "target user_id filter present",
  );
  assert(
    eventFilters.some(
      (filter) =>
        filter.includes(`anonymous_session_id.eq.${sharedAnonymous}`) &&
        filter.includes(`user_id.eq.${targetUserId}`) &&
        filter.includes("user_id.is.null"),
    ),
    "shared anonymous event filter scoped to target/null only",
  );
  assert(
    !eventFilters.some((filter) => filter.includes(`user_id.eq.${otherUserId}`)),
    "other registered user never included in delete scope",
  );

  const sessionFilters = buildScopedAnalyticsSessionFilters(
    targetUserId,
    [sharedAnonymous],
    [sharedSession],
  );

  assert(
    sessionFilters.some(
      (filter) =>
        filter.includes(`anonymous_id.eq.${sharedAnonymous}`) &&
        filter.includes("user_id.is.null"),
    ),
    "shared anonymous session filter scoped to target/null only",
  );
}

function main() {
  testPolicy();
  testStaticWiring();
  testAnalyticsScopeFilters();
  console.log("test-user-reset-unit: ok");
}

main();
