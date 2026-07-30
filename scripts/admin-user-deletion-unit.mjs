#!/usr/bin/env node
/**
 * Deterministic unit checks for admin user deletion policy and orchestration.
 *
 * No network, no .env.local, no Supabase credentials, no real mutations.
 *
 * Usage:
 *   npx tsx scripts/admin-user-deletion-unit.mjs
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  USER_DELETION_BLOCK_CODES,
  evaluateUserDeletionEligibility,
  isValidUserId,
} from "../src/lib/admin/user-deletion-policy.ts";
import {
  authorizeAdminUserDeletion,
  deleteAdminUsersBatch,
} from "../src/lib/admin/user-deletion.ts";
import {
  LISTENER_ROLE,
  PLATFORM_ADMIN_ROLE,
  PLATFORM_OWNER_ROLE,
} from "../src/lib/auth/platform-admin.ts";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(...segments) {
  return readFileSync(path.join(REPO_ROOT, ...segments), "utf8");
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

  assert(
    actions.includes('requireAdminPermission("users.manage")'),
    "action checks users.manage permission",
  );
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
  assert(
    !deletion.includes("/var/www/audiolad"),
    "deletion module has no absolute production path",
  );
}

/**
 * In-memory fake service role client for deletion orchestration.
 * Records auth/storage/table calls; never opens a network socket.
 */
function createFakeService(scenario = {}) {
  const actorUserId = scenario.actorUserId ?? randomUUID();
  const profiles = new Map(scenario.profiles ?? []);
  const authorMemberIds = new Set(scenario.authorMemberIds ?? []);
  const orderUserIds = new Set(scenario.orderUserIds ?? []);
  const personalMaterialUserIds = new Set(scenario.personalMaterialUserIds ?? []);
  const promotionCreatorIds = new Set(scenario.promotionCreatorIds ?? []);
  const authUsers = new Set(scenario.authUsers ?? [...profiles.keys()]);
  const permissionByActor = scenario.permissionByActor ?? new Map([
    [actorUserId, true],
  ]);

  const calls = {
    deleteUser: [],
    getUserById: [],
    rpc: [],
    tables: [],
    cleanupPrivateAudio: [],
    updates: [],
  };

  class QueryBuilder {
    #table;
    #mode = "select";
    #columns = "*";
    #filters = [];
    #inFilter = null;
    #updatePayload = null;

    constructor(table) {
      this.#table = table;
      calls.tables.push(table);
    }

    select(columns) {
      this.#columns = columns;
      return this;
    }

    eq(column, value) {
      this.#filters.push({ column, value });
      return this;
    }

    in(column, values) {
      this.#inFilter = { column, values: [...values] };
      return this;
    }

    update(payload) {
      this.#mode = "update";
      this.#updatePayload = payload;
      return this;
    }

    maybeSingle() {
      return Promise.resolve(this.#resolveMaybeSingle());
    }

    then(resolve, reject) {
      return Promise.resolve(this.#resolve()).then(resolve, reject);
    }

    #idsInFilter() {
      if (this.#inFilter?.column === "id" || this.#inFilter?.column === "user_id") {
        return this.#inFilter.values;
      }
      if (this.#inFilter?.column === "created_by") {
        return this.#inFilter.values;
      }
      if (this.#inFilter?.column === "claimed_by_user_id") {
        return this.#inFilter.values;
      }
      if (this.#inFilter?.column === "updated_by") {
        return this.#inFilter.values;
      }
      return [];
    }

    #resolveMaybeSingle() {
      if (this.#table === "profiles") {
        const idFilter = this.#filters.find((f) => f.column === "id");
        if (!idFilter) {
          return { data: null, error: null };
        }
        const profile = profiles.get(idFilter.value);
        if (!profile) {
          return { data: null, error: null };
        }
        if (this.#columns === "id") {
          return { data: { id: profile.id }, error: null };
        }
        return { data: profile, error: null };
      }

      return { data: null, error: null };
    }

    #resolve() {
      if (this.#mode === "update") {
        calls.updates.push({
          table: this.#table,
          payload: this.#updatePayload,
          filters: [...this.#filters],
        });
        if (scenario.failUpdateOn === this.#table) {
          return { error: { message: "update failed" } };
        }
        return { error: null };
      }

      const ids = this.#idsInFilter();

      if (this.#table === "profiles") {
        const rows = ids
          .map((id) => profiles.get(id))
          .filter(Boolean)
          .map((profile) => ({
            id: profile.id,
            role: profile.role,
            avatar_path: profile.avatar_path ?? null,
          }));
        return { data: rows, error: null };
      }

      if (this.#table === "author_members") {
        return {
          data: ids
            .filter((id) => authorMemberIds.has(id))
            .map((user_id) => ({ user_id })),
          error: null,
        };
      }

      if (this.#table === "orders") {
        return {
          data: ids
            .filter((id) => orderUserIds.has(id))
            .map((user_id) => ({ user_id })),
          error: null,
        };
      }

      if (this.#table === "personal_materials") {
        if (this.#inFilter?.column === "created_by") {
          return {
            data: ids
              .filter((id) => personalMaterialUserIds.has(id))
              .map((created_by) => ({ created_by })),
            error: null,
          };
        }
        if (this.#inFilter?.column === "claimed_by_user_id") {
          return {
            data: ids
              .filter((id) => personalMaterialUserIds.has(id))
              .map((claimed_by_user_id) => ({ claimed_by_user_id })),
            error: null,
          };
        }
      }

      if (this.#table === "personal_material_author_notes") {
        return {
          data: ids
            .filter((id) => personalMaterialUserIds.has(id))
            .map((updated_by) => ({ updated_by })),
          error: null,
        };
      }

      if (this.#table === "promotion_campaigns") {
        return {
          data: ids
            .filter((id) => promotionCreatorIds.has(id))
            .map((created_by) => ({ created_by })),
          error: null,
        };
      }

      return { data: [], error: null };
    }
  }

  return {
    actorUserId,
    calls,
    profiles,
    authUsers,
    from(table) {
      return new QueryBuilder(table);
    },
    rpc(name, args) {
      calls.rpc.push({ name, args });
      if (name === "has_platform_permission") {
        const allowed = permissionByActor.get(args.p_user_id) === true;
        return Promise.resolve({ data: allowed, error: null });
      }
      return Promise.resolve({ data: null, error: { message: `unknown_rpc:${name}` } });
    },
    auth: {
      admin: {
        async getUserById(userId) {
          calls.getUserById.push(userId);
          if (!authUsers.has(userId)) {
            return { data: { user: null }, error: null };
          }
          return { data: { user: { id: userId } }, error: null };
        },
        async deleteUser(userId) {
          calls.deleteUser.push(userId);
          if (scenario.deleteUserErrorFor === userId) {
            return { error: { message: scenario.deleteUserErrorMessage ?? "auth failed" } };
          }
          if (!authUsers.has(userId) && !profiles.has(userId)) {
            return { error: { message: "User not found" } };
          }
          authUsers.delete(userId);
          profiles.delete(userId);
          return { error: null };
        },
      },
    },
    storage: {
      from() {
        return {
          async remove() {
            return { error: null };
          },
        };
      },
    },
  };
}

function noopCleanup(calls) {
  return async (ownerUserId) => {
    calls.cleanupPrivateAudio.push(ownerUserId);
    return { removedItems: 0, removedPaths: 0 };
  };
}

function listenerProfile(userId) {
  return {
    id: userId,
    role: LISTENER_ROLE,
    avatar_path: null,
  };
}

async function testDeletesExpectedListenerOnly() {
  const actorUserId = randomUUID();
  const targetId = randomUUID();
  const otherId = randomUUID();

  const service = createFakeService({
    actorUserId,
    profiles: [
      [actorUserId, { id: actorUserId, role: PLATFORM_OWNER_ROLE, avatar_path: null }],
      [targetId, listenerProfile(targetId)],
      [otherId, listenerProfile(otherId)],
    ],
    authUsers: new Set([actorUserId, targetId, otherId]),
  });

  const result = await deleteAdminUsersBatch(
    service,
    { actorUserId, userIds: [targetId] },
    { cleanupPrivateAudioStorageForUser: noopCleanup(service.calls) },
  );

  assert(result.ok, "batch delete ok");
  assert(result.deletedCount === 1, "one user deleted");
  assert(result.results[0]?.ok, "item delete ok");
  assert(service.calls.deleteUser.length === 1, "auth delete called once");
  assert(service.calls.deleteUser[0] === targetId, "auth delete uses target id");
  assert(!service.calls.deleteUser.includes(otherId), "other user not deleted");
  assert(
    service.calls.cleanupPrivateAudio.length === 1 &&
      service.calls.cleanupPrivateAudio[0] === targetId,
    "private audio cleanup runs for target before auth delete",
  );
  assert(!service.profiles.has(targetId), "target profile removed from fake store");
  assert(service.profiles.has(otherId), "other profile remains");
}

async function testAuthDeleteFailureIsNotSuccess() {
  const actorUserId = randomUUID();
  const targetId = randomUUID();
  const service = createFakeService({
    actorUserId,
    profiles: [
      [actorUserId, { id: actorUserId, role: PLATFORM_OWNER_ROLE, avatar_path: null }],
      [targetId, listenerProfile(targetId)],
    ],
    authUsers: new Set([actorUserId, targetId]),
    deleteUserErrorFor: targetId,
    deleteUserErrorMessage: "auth boom",
  });

  const result = await deleteAdminUsersBatch(
    service,
    { actorUserId, userIds: [targetId] },
    { cleanupPrivateAudioStorageForUser: noopCleanup(service.calls) },
  );

  assert(result.ok, "batch wrapper still returns item-level results");
  assert(result.deletedCount === 0, "failed auth delete is not counted as deleted");
  assert(result.failedCount === 1, "failed count recorded");
  assert(!result.results[0]?.ok, "item marked failed");
  assert(service.profiles.has(targetId), "failed delete keeps profile");
}

async function testAlreadyDeletedRepeatIsSuccess() {
  const actorUserId = randomUUID();
  const missingId = randomUUID();
  const service = createFakeService({
    actorUserId,
    profiles: [
      [actorUserId, { id: actorUserId, role: PLATFORM_OWNER_ROLE, avatar_path: null }],
    ],
    authUsers: new Set([actorUserId]),
  });

  const result = await deleteAdminUsersBatch(
    service,
    { actorUserId, userIds: [missingId] },
    { cleanupPrivateAudioStorageForUser: noopCleanup(service.calls) },
  );

  assert(result.results[0]?.ok, "repeat/missing delete treated as success");
  assert(result.results[0]?.alreadyDeleted, "alreadyDeleted flagged");
  assert(service.calls.deleteUser.length === 0, "auth delete skipped when already gone");
  assert(
    service.calls.cleanupPrivateAudio.length === 0,
    "cleanup skipped for already-deleted missing profile",
  );
}

async function testSelfAndInvalidIdsRejected() {
  const actorUserId = randomUUID();
  const service = createFakeService({
    actorUserId,
    profiles: [
      [actorUserId, { id: actorUserId, role: PLATFORM_OWNER_ROLE, avatar_path: null }],
    ],
    authUsers: new Set([actorUserId]),
  });

  const invalid = await deleteAdminUsersBatch(
    service,
    { actorUserId, userIds: ["not-a-uuid"] },
    { cleanupPrivateAudioStorageForUser: noopCleanup(service.calls) },
  );
  assert(!invalid.results[0]?.ok, "invalid uuid rejected");
  assert(service.calls.deleteUser.length === 0, "invalid uuid never reaches auth delete");

  const selfDelete = await deleteAdminUsersBatch(
    service,
    { actorUserId, userIds: [actorUserId] },
    { cleanupPrivateAudioStorageForUser: noopCleanup(service.calls) },
  );
  assert(!selfDelete.results[0]?.ok, "owner cannot delete self");
  assert(
    selfDelete.results[0]?.error?.includes("свой аккаунт"),
    "self delete reason",
  );
  assert(service.calls.deleteUser.length === 0, "self delete never reaches auth delete");
}

async function testBulkPartialSuccessAndBatchLimit() {
  const actorUserId = randomUUID();
  const bulkA = randomUUID();
  const bulkB = randomUUID();
  const protectedAdmin = randomUUID();

  const service = createFakeService({
    actorUserId,
    profiles: [
      [actorUserId, { id: actorUserId, role: PLATFORM_OWNER_ROLE, avatar_path: null }],
      [bulkA, listenerProfile(bulkA)],
      [bulkB, listenerProfile(bulkB)],
      [protectedAdmin, { id: protectedAdmin, role: PLATFORM_ADMIN_ROLE, avatar_path: null }],
    ],
    authUsers: new Set([actorUserId, bulkA, bulkB, protectedAdmin]),
  });

  const bulkResult = await deleteAdminUsersBatch(
    service,
    {
      actorUserId,
      userIds: [bulkA, actorUserId, bulkB, "bad-id", protectedAdmin],
    },
    { cleanupPrivateAudioStorageForUser: noopCleanup(service.calls) },
  );

  assert(bulkResult.deletedCount === 2, "bulk partial success deletes listeners");
  assert(bulkResult.failedCount === 3, "bulk partial success keeps failures");
  assert(
    service.calls.deleteUser.length === 2 &&
      service.calls.deleteUser.includes(bulkA) &&
      service.calls.deleteUser.includes(bulkB),
    "only eligible listeners reach auth delete",
  );

  const tooMany = Array.from({ length: 101 }, () => randomUUID());
  const batchLimit = await deleteAdminUsersBatch(
    service,
    { actorUserId, userIds: tooMany },
    { cleanupPrivateAudioStorageForUser: noopCleanup(service.calls) },
  );
  assert(!batchLimit.ok, "batch limit rejects >100");
  assert(batchLimit.batchError, "batch limit message");
  assert(batchLimit.results.length === 0, "batch limit returns no partial deletes");
}

async function testNonAdminForbidden() {
  const actorUserId = randomUUID();
  const service = createFakeService({
    actorUserId,
    profiles: [
      [actorUserId, { id: actorUserId, role: LISTENER_ROLE, avatar_path: null }],
    ],
    authUsers: new Set([actorUserId]),
    permissionByActor: new Map([[actorUserId, false]]),
  });

  const forbidden = await authorizeAdminUserDeletion(service, actorUserId);
  assert(!forbidden.ok && forbidden.status === 403, "non-admin gets 403");

  const targetId = randomUUID();
  service.profiles.set(targetId, listenerProfile(targetId));
  service.authUsers.add(targetId);

  const batch = await deleteAdminUsersBatch(
    service,
    { actorUserId, userIds: [targetId] },
    { cleanupPrivateAudioStorageForUser: noopCleanup(service.calls) },
  );
  assert(batch.forbidden, "batch forbidden for non-admin");
  assert(service.calls.deleteUser.length === 0, "forbidden actor deletes nobody");
}

async function testCleanupFailureIsNotFullSuccess() {
  const actorUserId = randomUUID();
  const targetId = randomUUID();
  const service = createFakeService({
    actorUserId,
    profiles: [
      [actorUserId, { id: actorUserId, role: PLATFORM_OWNER_ROLE, avatar_path: null }],
      [targetId, listenerProfile(targetId)],
    ],
    authUsers: new Set([actorUserId, targetId]),
  });

  const result = await deleteAdminUsersBatch(
    service,
    { actorUserId, userIds: [targetId] },
    {
      cleanupPrivateAudioStorageForUser: async () => {
        throw new Error("cleanup boom");
      },
    },
  );

  assert(result.deletedCount === 0, "cleanup failure is not counted as deleted");
  assert(!result.results[0]?.ok, "cleanup failure surfaces as item failure");
  assert(service.calls.deleteUser.length === 0, "auth delete not called after cleanup failure");
}

function testNoEnvOrNetworkImports() {
  const source = readRepoFile("scripts", "admin-user-deletion-unit.mjs");
  const productionEnvPath = ["", "var", "www", "audiolad", ".env.local"].join("/");
  const supabaseImport = "@" + "supabase/supabase-js";
  const productionHost = "audiolad" + ".ru";

  assert(!source.includes(productionEnvPath), "unit does not read production env path");
  assert(!source.includes(`from "${supabaseImport}"`), "unit does not import live supabase sdk");
  assert(!source.includes(productionHost), "unit does not target production host");
  assert(
    !source.includes("process.env." + "SUPABASE_SERVICE_ROLE_KEY"),
    "unit does not read service role from process.env",
  );
  assert(source.includes("createFakeService"), "unit uses in-memory fake service");
  assert(
    source.includes("cleanupPrivateAudioStorageForUser: noopCleanup") ||
      source.includes("cleanupPrivateAudioStorageForUser: async"),
    "orchestration uses injected fake cleanup, not live service-role cleanup",
  );
}

async function main() {
  testPolicyGuards();
  testStaticWiring();
  testNoEnvOrNetworkImports();
  await testDeletesExpectedListenerOnly();
  await testAuthDeleteFailureIsNotSuccess();
  await testAlreadyDeletedRepeatIsSuccess();
  await testSelfAndInvalidIdsRejected();
  await testBulkPartialSuccessAndBatchLimit();
  await testNonAdminForbidden();
  await testCleanupFailureIsNotFullSuccess();
  console.log("admin-user-deletion-unit: ok");
}

main().catch((error) => {
  console.error("admin-user-deletion-unit failed:", error.message ?? error);
  process.exit(1);
});
