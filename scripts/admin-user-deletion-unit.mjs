#!/usr/bin/env node
/**
 * Unit and integration checks for admin user deletion policy and service logic.
 *
 * Usage:
 *   node scripts/admin-user-deletion-unit.mjs
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import {
  USER_DELETION_BLOCK_CODES,
  evaluateUserDeletionEligibility,
  isValidUserId,
} from "../src/lib/admin/user-deletion-policy.ts";
import {
  authorizeAdminUserDeletion,
  deleteAdminUsersBatch,
  loadUserDeletionDependencies,
} from "../src/lib/admin/user-deletion.ts";
import {
  LISTENER_ROLE,
  PLATFORM_ADMIN_ROLE,
  PLATFORM_OWNER_ROLE,
} from "../src/lib/auth/platform-admin.ts";

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
  return readFileSync(`/var/www/audiolad/${segments.join("/")}`, "utf8");
}

function testPolicyGuards() {
  const actorId = randomUUID();
  const otherId = randomUUID();

  const selfBlock = evaluateUserDeletionEligibility({
    userId: actorId,
    actorUserId: actorId,
    dependencies: {
      role: LISTENER_ROLE,
      isAuthorMember: false,
      hasOrders: false,
      hasPersonalMaterials: false,
      hasPromotionCampaigns: false,
    },
  });
  assert(!selfBlock.canDelete, "current admin cannot delete self");
  assert(selfBlock.blockCode === USER_DELETION_BLOCK_CODES.self, "self block code");

  const ownerBlock = evaluateUserDeletionEligibility({
    userId: otherId,
    actorUserId: actorId,
    dependencies: {
      role: PLATFORM_OWNER_ROLE,
      isAuthorMember: false,
      hasOrders: false,
      hasPersonalMaterials: false,
      hasPromotionCampaigns: false,
    },
  });
  assert(!ownerBlock.canDelete, "platform owner protected");
  assert(
    ownerBlock.blockCode === USER_DELETION_BLOCK_CODES.platform_owner,
    "owner block code",
  );

  const adminBlock = evaluateUserDeletionEligibility({
    userId: otherId,
    actorUserId: actorId,
    dependencies: {
      role: PLATFORM_ADMIN_ROLE,
      isAuthorMember: false,
      hasOrders: false,
      hasPersonalMaterials: false,
      hasPromotionCampaigns: false,
    },
  });
  assert(!adminBlock.canDelete, "platform admin protected");
  assert(
    adminBlock.blockCode === USER_DELETION_BLOCK_CODES.platform_admin,
    "admin block code",
  );

  const authorBlock = evaluateUserDeletionEligibility({
    userId: otherId,
    actorUserId: actorId,
    dependencies: {
      role: LISTENER_ROLE,
      isAuthorMember: true,
      hasOrders: false,
      hasPersonalMaterials: false,
      hasPromotionCampaigns: false,
    },
  });
  assert(!authorBlock.canDelete, "author workspace protected");
  assert(
    authorBlock.blockCode === USER_DELETION_BLOCK_CODES.author_workspace,
    "author block code",
  );

  const ordersBlock = evaluateUserDeletionEligibility({
    userId: otherId,
    actorUserId: actorId,
    dependencies: {
      role: LISTENER_ROLE,
      isAuthorMember: false,
      hasOrders: true,
      hasPersonalMaterials: false,
      hasPromotionCampaigns: false,
    },
  });
  assert(!ordersBlock.canDelete, "orders block delete");

  const listenerOk = evaluateUserDeletionEligibility({
    userId: otherId,
    actorUserId: actorId,
    dependencies: {
      role: LISTENER_ROLE,
      isAuthorMember: false,
      hasOrders: false,
      hasPersonalMaterials: false,
      hasPromotionCampaigns: false,
    },
  });
  assert(listenerOk.canDelete, "plain listener can delete");

  assert(!isValidUserId("not-a-uuid"), "invalid uuid rejected");
  assert(isValidUserId(otherId), "valid uuid accepted");
}

function testStaticWiring() {
  const actions = readRepoFile("src", "app", "admin", "users", "actions.ts");
  const table = readRepoFile("src", "components", "admin", "AdminUsersTable.tsx");
  const deletion = readRepoFile("src", "lib", "admin", "user-deletion.ts");

  assert(actions.includes("requireAdminPanelAccess"), "action checks admin session");
  assert(actions.includes("createServiceRoleClient"), "action uses service role");
  assert(!actions.includes("SUPABASE_SERVICE_ROLE_KEY"), "service key stays server-side");
  assert(
    deletion.includes("auth.admin.deleteUser"),
    "deletion uses auth admin API",
  );
  assert(table.includes('aria-label="Выбрать всех пользователей на странице"'), "select all aria");
  assert(table.includes("Удалить выбранных"), "bulk delete button");
  assert(
    deletion.includes("MAX_ADMIN_USER_DELETION_BATCH_SIZE"),
    "batch size limit enforced",
  );
  assert(!table.includes("createServiceRoleClient"), "service role not in client table");
  assert(!table.includes("SUPABASE_SERVICE_ROLE_KEY"), "service key not in client table");
  assert(table.includes("Удалить пользователя"), "single delete action");
}

async function createTempListener(service, prefix) {
  const email = `${prefix}-${randomUUID()}@audiolad.test`;
  const password = `Temp-${randomUUID()}-Aa1!`;

  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: "Admin",
      last_name: "DeleteTest",
      full_name: "Admin DeleteTest",
    },
  });

  if (error || !data.user?.id) {
    throw new Error(`temp_user_create_failed:${error?.message ?? "missing_user"}`);
  }

  return { userId: data.user.id, email };
}

async function deleteTempUserSafe(service, userId) {
  if (!userId) {
    return;
  }

  await service.auth.admin.deleteUser(userId).catch(() => {});
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

async function testIntegration() {
  const env = loadEnv();
  const service = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const owner = await getOwnerActor(service);
  const tempUsers = [];

  try {
    const listener = await createTempListener(service, "admin-delete-listener");
    tempUsers.push(listener.userId);

    const dependencies = await loadUserDeletionDependencies(service, [
      listener.userId,
    ]);
    const eligibility = evaluateUserDeletionEligibility({
      userId: listener.userId,
      actorUserId: owner.id,
      dependencies: dependencies.get(listener.userId) ?? null,
    });
    assert(eligibility.canDelete, "temp listener eligible before delete");

    const deleteResult = await deleteAdminUsersBatch(service, {
      actorUserId: owner.id,
      userIds: [listener.userId],
    });

    assert(deleteResult.ok, "batch delete ok");
    assert(deleteResult.deletedCount === 1, "one user deleted");
    assert(deleteResult.results[0]?.ok, "item delete ok");
    tempUsers.pop();

    const { data: profileAfterDelete } = await service
      .from("profiles")
      .select("id")
      .eq("id", listener.userId)
      .maybeSingle();
    assert(!profileAfterDelete, "profile removed after auth delete");

    const { data: authAfterDelete } = await service.auth.admin.getUserById(
      listener.userId,
    );
    assert(!authAfterDelete.user, "auth user removed");

    const repeatDelete = await deleteAdminUsersBatch(service, {
      actorUserId: owner.id,
      userIds: [listener.userId],
    });
    assert(repeatDelete.results[0]?.ok, "repeat delete treated as success");
    assert(repeatDelete.results[0]?.alreadyDeleted, "repeat delete flagged");

    const invalid = await deleteAdminUsersBatch(service, {
      actorUserId: owner.id,
      userIds: ["not-a-uuid"],
    });
    assert(!invalid.results[0]?.ok, "invalid uuid rejected");

    const selfDelete = await deleteAdminUsersBatch(service, {
      actorUserId: owner.id,
      userIds: [owner.id],
    });
    assert(!selfDelete.results[0]?.ok, "owner cannot delete self");
    assert(
      selfDelete.results[0]?.error?.includes("свой аккаунт"),
      "self delete reason",
    );

    const bulkA = await createTempListener(service, "admin-delete-bulk-a");
    const bulkB = await createTempListener(service, "admin-delete-bulk-b");
    tempUsers.push(bulkA.userId, bulkB.userId);

    const bulkResult = await deleteAdminUsersBatch(service, {
      actorUserId: owner.id,
      userIds: [bulkA.userId, owner.id, bulkB.userId, "bad-id"],
    });
    assert(bulkResult.deletedCount === 2, "bulk partial success deletes listeners");
    assert(bulkResult.failedCount === 2, "bulk partial success keeps failures");
    tempUsers.length = 0;

    const listenerActor = await createTempListener(service, "admin-delete-actor");
    tempUsers.push(listenerActor.userId);

    const forbidden = await authorizeAdminUserDeletion(service, listenerActor.userId);
    assert(!forbidden.ok && forbidden.status === 403, "non-admin gets 403");

    const adminProfiles = await service
      .from("profiles")
      .select("id")
      .eq("role", PLATFORM_ADMIN_ROLE)
      .limit(1)
      .maybeSingle();

    if (adminProfiles.data?.id) {
      const protectedAdmin = await deleteAdminUsersBatch(service, {
        actorUserId: owner.id,
        userIds: [adminProfiles.data.id],
      });
      assert(!protectedAdmin.results[0]?.ok, "protected platform admin blocked");
    }

    const tooMany = Array.from({ length: 101 }, () => randomUUID());
    const batchLimit = await deleteAdminUsersBatch(service, {
      actorUserId: owner.id,
      userIds: tooMany,
    });
    assert(!batchLimit.ok, "batch limit rejects >100");
    assert(batchLimit.batchError, "batch limit message");
    assert(batchLimit.results.length === 0, "batch limit returns no partial deletes");
  } finally {
    for (const userId of tempUsers) {
      await deleteTempUserSafe(service, userId);
    }
  }
}

async function main() {
  testPolicyGuards();
  testStaticWiring();
  await testIntegration();
  console.log("admin-user-deletion-unit: ok");
}

main().catch((error) => {
  console.error("admin-user-deletion-unit failed:", error.message ?? error);
  process.exit(1);
});
