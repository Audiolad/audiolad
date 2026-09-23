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
      practiceListenStats: 0,
      practiceRatings: 0,
      practiceRatingEvents: 0,
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
      privateAudioItems: 0,
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

  const ownAuthorCleanup = evaluateTestUserResetBlockers({
    resolvedEmail: TEST_USER_RESET_EMAIL,
    profileRole: LISTENER_ROLE,
    counts: {
      userPractices: 0,
      practiceAudioProgress: 0,
      practiceListenStats: 0,
      practiceRatings: 0,
      practiceRatingEvents: 0,
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
      privateAudioItems: 0,
      authorMembers: 2,
      authorApplications: 1,
      promotionCampaigns: 0,
      personalMaterialTemplates: 0,
      inviteeReferrals: 1,
      attributions: 1,
      ownedAuthors: 2,
      partnerBonus: 1,
      capacityGrants: 0,
      foreignAuthorMemberships: 0,
      otherMembersOnOwnedAuthors: 0,
      referrerReferrals: 0,
      foreignAttributions: 0,
      authorLedgerEntries: 0,
      authorPayouts: 0,
      authorPayoutProfiles: 0,
      ownedAuthorContent: 0,
    },
  });
  assert(
    ownAuthorCleanup.length === 0,
    "own memberships, applications, invitee referrals and bonus are cleanup targets",
  );

  const referrerBlock = evaluateTestUserResetBlockers({
    resolvedEmail: TEST_USER_RESET_EMAIL,
    profileRole: LISTENER_ROLE,
    counts: {
      userPractices: 0,
      practiceAudioProgress: 0,
      practiceListenStats: 0,
      practiceRatings: 0,
      practiceRatingEvents: 0,
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
      privateAudioItems: 0,
      authorMembers: 1,
      authorApplications: 0,
      promotionCampaigns: 0,
      personalMaterialTemplates: 0,
      referrerReferrals: 1,
      foreignAuthorMemberships: 1,
      capacityGrants: 1,
    },
  });
  assert(
    referrerBlock.some((row) => row.code === TEST_USER_RESET_BLOCK_CODES.test_as_referrer),
    "test account as referrer is a hard blocker",
  );
  assert(
    referrerBlock.some(
      (row) => row.code === TEST_USER_RESET_BLOCK_CODES.foreign_membership,
    ),
    "foreign membership is a hard blocker",
  );
  assert(
    referrerBlock.some((row) => row.code === TEST_USER_RESET_BLOCK_CODES.capacity_grants),
    "paid capacity grants stay blocked with finance",
  );
  assert(
    !referrerBlock.some(
      (row) => row.code === TEST_USER_RESET_BLOCK_CODES.author_membership,
    ),
    "legacy author_membership code is not the allowlisted blocker",
  );

  const wrongEmail = evaluateTestUserResetBlockers({
    resolvedEmail: "other@mail.ru",
    profileRole: LISTENER_ROLE,
    counts: {
      userPractices: 0,
      practiceAudioProgress: 0,
      practiceListenStats: 0,
      practiceRatings: 0,
      practiceRatingEvents: 0,
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
      privateAudioItems: 0,
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
  const actions = readRepoFile(
    "src",
    "app",
    "(platform)",
    "admin",
    "users",
    "test-reset-actions.ts",
  );
  const panel = readRepoFile("src", "components", "admin", "TestUserResetPanel.tsx");
  const reset = readRepoFile("src", "lib", "admin", "test-user-reset", "reset.ts");
  const page = readRepoFile("src", "app", "(platform)", "admin", "users", "page.tsx");

  assert(actions.includes("requirePlatformOwnerAccess"), "owner guard in actions");
  assert(actions.includes("resetAllowlistedTestUser"), "reset service wired");
  assert(!actions.includes("confirmationPhrase: email"), "no email param contract");
  assert(panel.includes("Сброс тестового пользователя"), "panel title");
  assert(panel.includes("TEST_USER_RESET_CONFIRMATION_PHRASE"), "panel phrase constant");
  assert(panel.includes("Очистить локальные тестовые данные"), "local clear button");
  assert(reset.includes("auth.admin.deleteUser"), "auth admin delete used");
  const resetConstants = readRepoFile(
    "src",
    "lib",
    "admin",
    "test-user-reset",
    "constants.ts",
  );
  assert(
    resetConstants.includes('reset_allowlisted_test_user_db'),
    "phase 1 RPC name is hard-coded",
  );
  assert(reset.includes("TEST_USER_RESET_DB_RPC"), "phase 1 RPC wired");
  assert(
    reset.indexOf("runAllowlistedTestUserDbCleanup") <
      reset.indexOf("auth.admin.deleteUser"),
    "phase 1 RPC is ordered before auth delete",
  );
  assert(
    reset.indexOf("cleanupNonFkData") <
      reset.indexOf("runAllowlistedTestUserDbCleanup"),
    "existing consumer cleanup stays before the author RPC",
  );
  const allowlistedResetMigration = readRepoFile(
    "supabase",
    "migrations",
    "20261030120000_allowlisted_test_user_reset_db_cleanup.sql",
  );
  assert(
    allowlistedResetMigration.includes("SET search_path = ''"),
    "reset RPC locks search_path",
  );
  assert(
    allowlistedResetMigration.includes("GRANT EXECUTE ON FUNCTION public.reset_allowlisted_test_user_db(uuid) TO service_role"),
    "reset RPC is granted only to service_role",
  );
  assert(
    allowlistedResetMigration.includes("FROM authenticated"),
    "reset RPC revoked from authenticated",
  );
  assert(
    allowlistedResetMigration.includes("audiolad@mail.ru"),
    "allowlist is hard-coded in SQL",
  );
  assert(
    allowlistedResetMigration.includes("set_config('audiolad.allowlisted_test_user_reset'"),
    "reset context is a transaction-local GUC",
  );
  assert(
    !allowlistedResetMigration.includes("DELETE FROM auth.users"),
    "phase 1 RPC does not delete auth.users",
  );
  assert(
    !/invitee_user_id[\s\S]{0,80}ON DELETE CASCADE/.test(allowlistedResetMigration),
    "migration does not cascade invitee_user_id",
  );
  assert(
    !allowlistedResetMigration.includes("DROP CONSTRAINT") ||
      !allowlistedResetMigration.includes("author_referrals_invitee_user_id_fkey"),
    "migration does not drop the invitee RESTRICT constraint",
  );
  assert(
    !reset.includes("analytics_first_touches"),
    "reset does not manually delete analytics_first_touches",
  );
  const firstTouchFk = readRepoFile(
    "supabase",
    "migrations",
    "20261029120000_analytics_first_touch_user_delete_cascade.sql",
  );
  assert(
    firstTouchFk.includes("analytics_first_touches_user_id_fkey"),
    "cascade migration names the user_id FK",
  );
  assert(
    firstTouchFk.includes("ON DELETE CASCADE"),
    "user_id FK uses ON DELETE CASCADE",
  );
  assert(
    !/DROP\s+CONSTRAINT[^;]*analytics_first_touches_subject_shape_check/i.test(firstTouchFk),
    "cascade migration does not drop the subject shape check",
  );
  assert(
    !firstTouchFk.includes("ADD CONSTRAINT analytics_first_touches_subject_shape_check"),
    "cascade migration does not replace the subject shape check",
  );
  const preflightSource = readRepoFile("src", "lib", "admin", "test-user-reset", "preflight.ts");
  assert(preflightSource.includes("practice_listen_stats"), "listen-stats counted in reset");
  assert(preflightSource.includes("practice_ratings"), "ratings counted in reset");
  assert(preflightSource.includes("practice_rating_events"), "rating events counted in reset");
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
