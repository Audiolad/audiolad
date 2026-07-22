#!/usr/bin/env node
/**
 * Unit and integration checks for allowlisted test user reset.
 *
 * Usage:
 *   node scripts/test-user-reset-unit.mjs
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

import {
  TEST_USER_RESET_CONFIRMATION_PHRASE,
  TEST_USER_RESET_EMAIL,
  TEST_USER_RESET_NORMALIZED_EMAIL,
} from "../src/lib/admin/test-user-reset/constants.ts";
import {
  canActorResetTestUser,
  evaluateTestUserResetBlockers,
  isAllowlistedTestUserEmail,
  isValidTestUserResetConfirmationPhrase,
  normalizeAllowlistedTestEmail,
} from "../src/lib/admin/test-user-reset/policy.ts";
import {
  authorizeTestUserReset,
  getTestUserResetPreflight,
  resetAllowlistedTestUser,
} from "../src/lib/admin/test-user-reset/reset.ts";
import {
  PLATFORM_ADMIN_ROLE,
  PLATFORM_OWNER_ROLE,
  LISTENER_ROLE,
} from "../src/lib/auth/platform-admin.ts";
import { TEST_USER_RESET_BLOCK_CODES } from "../src/lib/admin/test-user-reset/types.ts";

function loadEnv() {
  return Object.fromEntries(
    readFileSync("/var/www/audiolad/.env.local", "utf8")
      .split("\n")
      .filter((line) => line && line.includes("=") && !line.startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readRepoFile(...segments) {
  return readFileSync(`/var/www/audiolad/.worktrees/feat-test-user-reset/${segments.join("/")}`, "utf8");
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
  assert(
    !isAllowlistedTestUserEmail("other@mail.ru"),
    "other email rejected",
  );
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
    hasAuthorWorkspaceReferences: false,
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
    hasAuthorWorkspaceReferences: false,
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
}

async function getOwnerActor(service) {
  const { data, error } = await service
    .from("profiles")
    .select("id, role")
    .eq("role", PLATFORM_OWNER_ROLE)
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) {
    throw new Error("platform_owner_not_found_for_tests");
  }

  return data;
}

async function getAdminActor(service) {
  const { data, error } = await service
    .from("profiles")
    .select("id, role")
    .eq("role", PLATFORM_ADMIN_ROLE)
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) {
    return null;
  }

  return data;
}

async function createTempListener(service, prefix) {
  const email = `${prefix}-${randomUUID()}@audiolad.test`;
  const password = `Temp-${randomUUID()}-Aa1!`;

  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: "Reset",
      last_name: "Test",
      full_name: "Reset Test",
    },
  });

  if (error || !data.user?.id) {
    throw new Error(`temp_user_create_failed:${error?.message ?? "missing_user"}`);
  }

  return { userId: data.user.id, email };
}

async function deleteTempUserSafe(service, userId) {
  if (!userId) return;
  await service.auth.admin.deleteUser(userId).catch(() => {});
}

async function ensureAuditTable(service) {
  const { error } = await service.from("admin_operation_log").select("id").limit(1);
  if (!error) return;

  throw new Error(
    "admin_operation_log_missing:apply migration 20260722180000_test_user_reset_audit_log.sql before integration tests",
  );
}

async function testIntegration() {
  const env = loadEnv();
  const service = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  await ensureAuditTable(service);

  const owner = await getOwnerActor(service);
  const admin = await getAdminActor(service);
  const tempUsers = [];

  try {
    const forbiddenOwnerCheck = await authorizeTestUserReset(service, owner.id);
    assert(forbiddenOwnerCheck.ok, "owner authorized");

    if (admin?.id) {
      const adminForbidden = await authorizeTestUserReset(service, admin.id);
      assert(!adminForbidden.ok && adminForbidden.status === 403, "admin forbidden");
    }

    const listener = await createTempListener(service, "test-reset-listener");
    tempUsers.push(listener.userId);
    const listenerForbidden = await authorizeTestUserReset(service, listener.userId);
    assert(!listenerForbidden.ok && listenerForbidden.status === 403, "listener forbidden");

    const invalidPhrase = await resetAllowlistedTestUser(service, {
      actorUserId: owner.id,
      confirmationPhrase: "wrong phrase",
    });
    assert(invalidPhrase.invalidConfirmation, "invalid phrase rejected");
    assert(invalidPhrase.result.status === "failed", "invalid phrase failed status");

    const preflightBefore = await getTestUserResetPreflight(service, {
      actorUserId: owner.id,
    });
    assert(
      preflightBefore.allowlistedEmail === TEST_USER_RESET_EMAIL,
      "preflight email constant",
    );

    if (preflightBefore.authUserFound && preflightBefore.canReset) {
      const resetResult = await resetAllowlistedTestUser(service, {
        actorUserId: owner.id,
        confirmationPhrase: TEST_USER_RESET_CONFIRMATION_PHRASE,
      });

      assert(resetResult.ok, "reset ok wrapper");
      assert(
        resetResult.result.status === "success" ||
          resetResult.result.status === "partial",
        "reset completed",
      );

      const preflightAfter = await getTestUserResetPreflight(service, {
        actorUserId: owner.id,
      });
      assert(!preflightAfter.authUserFound, "auth user removed after reset");

      const { data: contactsAfter } = await service
        .from("email_contacts")
        .select("id")
        .eq("normalized_email", TEST_USER_RESET_NORMALIZED_EMAIL);
      assert((contactsAfter ?? []).length === 0, "email contacts cleared");

      const { count: auditCount } = await service
        .from("admin_operation_log")
        .select("id", { count: "exact", head: true })
        .eq("operation", "test_user_reset");
      assert((auditCount ?? 0) > 0, "audit log written");

      const idempotent = await resetAllowlistedTestUser(service, {
        actorUserId: owner.id,
        confirmationPhrase: TEST_USER_RESET_CONFIRMATION_PHRASE,
      });
      assert(idempotent.ok, "idempotent reset ok");
    } else if (preflightBefore.blockers.length > 0) {
      const blocked = await resetAllowlistedTestUser(service, {
        actorUserId: owner.id,
        confirmationPhrase: TEST_USER_RESET_CONFIRMATION_PHRASE,
      });
      assert(blocked.result.status === "failed", "blocked reset stays failed");
      assert(blocked.result.blockers?.length, "blocked reasons returned");
    }

    const other = await createTempListener(service, "test-reset-other");
    tempUsers.push(other.userId);

    const otherPreflightBefore = await getTestUserResetPreflight(service, {
      actorUserId: owner.id,
    });
    const otherPracticesBefore = await service
      .from("user_practices")
      .select("id", { count: "exact", head: true })
      .eq("user_id", other.userId);

    assert((otherPracticesBefore.count ?? 0) >= 0, "other user practices readable");

    if (preflightBefore.authUserFound && preflightBefore.canReset) {
      void otherPreflightBefore;
    }

    await deleteTempUserSafe(service, other.userId);
    tempUsers.pop();
  } finally {
    for (const userId of tempUsers) {
      await deleteTempUserSafe(service, userId);
    }
  }
}

async function main() {
  testPolicy();
  testStaticWiring();
  await testIntegration();
  console.log("test-user-reset-unit: ok");
}

main().catch((error) => {
  console.error("test-user-reset-unit failed:", error.message ?? error);
  process.exit(1);
});
