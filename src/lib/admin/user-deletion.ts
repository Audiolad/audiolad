import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchUserPlatformRole } from "@/lib/auth/platform-admin";
import { removeUserAvatarObject } from "@/lib/profile/avatar";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";

import {
  MAX_ADMIN_USER_DELETION_BATCH_SIZE,
  canActorDeleteUsers,
  evaluateUserDeletionEligibility,
  isValidUserId,
  type UserDeletionDependencies,
  type UserDeletionEligibility,
} from "@/lib/admin/user-deletion-policy";

export type AdminUserDeletionItemResult = {
  userId: string;
  ok: boolean;
  error?: string;
  alreadyDeleted?: boolean;
};

export type AdminUserDeletionBatchResult = {
  ok: boolean;
  forbidden?: boolean;
  batchError?: string;
  results: AdminUserDeletionItemResult[];
  deletedCount: number;
  failedCount: number;
};

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

export async function loadUserDeletionDependencies(
  service: ServiceClient,
  userIds: string[],
): Promise<Map<string, UserDeletionDependencies | null>> {
  const uniqueIds = [...new Set(userIds.filter(isValidUserId))];
  const result = new Map<string, UserDeletionDependencies | null>();

  if (uniqueIds.length === 0) {
    return result;
  }

  const [
    profilesResult,
    authorMembersResult,
    ordersResult,
    personalMaterialsCreatedResult,
    personalMaterialsClaimedResult,
    personalNotesResult,
    promotionCampaignsResult,
  ] = await Promise.all([
    service.from("profiles").select("id, role, avatar_path").in("id", uniqueIds),
    service.from("author_members").select("user_id").in("user_id", uniqueIds),
    service.from("orders").select("user_id").in("user_id", uniqueIds),
    service
      .from("personal_materials")
      .select("created_by")
      .in("created_by", uniqueIds),
    service
      .from("personal_materials")
      .select("claimed_by_user_id")
      .in("claimed_by_user_id", uniqueIds),
    service
      .from("personal_material_author_notes")
      .select("updated_by")
      .in("updated_by", uniqueIds),
    service
      .from("promotion_campaigns")
      .select("created_by")
      .in("created_by", uniqueIds),
  ]);

  if (profilesResult.error) {
    throw new Error("admin_user_deletion_profiles_failed");
  }

  const profileMap = new Map(
    (profilesResult.data ?? []).map((row) => [row.id, row]),
  );

  const authorMemberIds = new Set(
    (authorMembersResult.data ?? []).map((row) => row.user_id),
  );
  const orderUserIds = new Set(
    (ordersResult.data ?? []).map((row) => row.user_id),
  );
  const personalMaterialUserIds = new Set<string>();

  for (const row of personalMaterialsCreatedResult.data ?? []) {
    if (row.created_by) {
      personalMaterialUserIds.add(row.created_by);
    }
  }

  for (const row of personalMaterialsClaimedResult.data ?? []) {
    if (row.claimed_by_user_id) {
      personalMaterialUserIds.add(row.claimed_by_user_id);
    }
  }

  for (const row of personalNotesResult.data ?? []) {
    if (row.updated_by) {
      personalMaterialUserIds.add(row.updated_by);
    }
  }

  const promotionCreatorIds = new Set(
    (promotionCampaignsResult.data ?? []).map((row) => row.created_by),
  );

  for (const userId of uniqueIds) {
    const profile = profileMap.get(userId);

    if (!profile) {
      result.set(userId, null);
      continue;
    }

    result.set(userId, {
      role: typeof profile.role === "string" ? profile.role : null,
      isAuthorMember: authorMemberIds.has(userId),
      hasOrders: orderUserIds.has(userId),
      hasPersonalMaterials: personalMaterialUserIds.has(userId),
      hasPromotionCampaigns: promotionCreatorIds.has(userId),
    });
  }

  return result;
}

export function getUserDeletionEligibility(input: {
  userId: string;
  actorUserId: string;
  dependencies: UserDeletionDependencies | null;
}): UserDeletionEligibility {
  return evaluateUserDeletionEligibility(input);
}

async function clearReviewedByReferences(
  service: ServiceClient,
  userId: string,
): Promise<void> {
  const { error } = await service
    .from("author_applications")
    .update({ reviewed_by: null })
    .eq("reviewed_by", userId);

  if (error) {
    throw new Error("admin_user_deletion_reviewed_by_clear_failed");
  }
}

function isBenignAvatarRemovalError(message: string): boolean {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("not found") ||
    normalized.includes("object not found") ||
    normalized.includes("invalid_path")
  );
}

async function removeUserAvatarIfPresent(
  service: ServiceClient,
  userId: string,
  avatarPath: string | null,
): Promise<void> {
  if (!avatarPath) {
    return;
  }

  const removed = await removeUserAvatarObject(service, avatarPath, userId);

  if (removed.ok) {
    return;
  }

  if (isBenignAvatarRemovalError(removed.error)) {
    console.warn("admin_user_deletion_avatar_missing", userId);
    return;
  }

  console.error("admin_user_deletion_avatar_remove_failed", userId, removed.error);
}

async function deleteAuthUser(
  service: ServiceClient,
  userId: string,
): Promise<{ ok: true; alreadyDeleted?: boolean } | { ok: false; error: string }> {
  const { data: existingProfile } = await service
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  const { error } = await service.auth.admin.deleteUser(userId);

  if (!error) {
    return { ok: true };
  }

  const message = error.message.toLowerCase();

  if (
    !existingProfile &&
    (message.includes("not found") ||
      message.includes("user not found") ||
      message.includes("does not exist"))
  ) {
    return { ok: true, alreadyDeleted: true };
  }

  console.error("admin_user_deletion_auth_delete_failed", userId, error.message);

  return { ok: false, error: "Не удалось удалить учётную запись." };
}

export async function deleteSingleAdminUser(
  service: ServiceClient,
  input: {
    userId: string;
    actorUserId: string;
    dependencies: UserDeletionDependencies | null;
    avatarPath?: string | null;
  },
): Promise<AdminUserDeletionItemResult> {
  if (!isValidUserId(input.userId)) {
    return {
      userId: input.userId,
      ok: false,
      error: "Некорректный идентификатор пользователя.",
    };
  }

  if (!input.dependencies) {
    const { data: authData } = await service.auth.admin.getUserById(input.userId);

    if (!authData?.user) {
      return {
        userId: input.userId,
        ok: true,
        alreadyDeleted: true,
      };
    }

    return {
      userId: input.userId,
      ok: false,
      error: "Пользователь не найден.",
    };
  }

  const eligibility = evaluateUserDeletionEligibility({
    userId: input.userId,
    actorUserId: input.actorUserId,
    dependencies: input.dependencies,
  });

  if (!eligibility.canDelete) {
    return {
      userId: input.userId,
      ok: false,
      error: eligibility.blockReason ?? "Удаление запрещено.",
    };
  }

  try {
    await clearReviewedByReferences(service, input.userId);
    await removeUserAvatarIfPresent(
      service,
      input.userId,
      input.avatarPath ?? null,
    );

    const deleted = await deleteAuthUser(service, input.userId);

    if (!deleted.ok) {
      return {
        userId: input.userId,
        ok: false,
        error: deleted.error,
      };
    }

    return {
      userId: input.userId,
      ok: true,
      alreadyDeleted: deleted.alreadyDeleted,
    };
  } catch (error) {
    console.error("admin_user_deletion_failed", input.userId, error);
    return {
      userId: input.userId,
      ok: false,
      error: "Не удалось удалить пользователя.",
    };
  }
}

export async function authorizeAdminUserDeletion(
  service: SupabaseClient,
  actorUserId: string,
): Promise<{ ok: true } | { ok: false; status: 403 | 500 }> {
  try {
    const role = await fetchUserPlatformRole(service, actorUserId);

    if (!canActorDeleteUsers(role)) {
      return { ok: false, status: 403 };
    }

    return { ok: true };
  } catch {
    return { ok: false, status: 500 };
  }
}

export async function deleteAdminUsersBatch(
  service: ServiceClient,
  input: {
    actorUserId: string;
    userIds: string[];
  },
): Promise<AdminUserDeletionBatchResult> {
  const authorization = await authorizeAdminUserDeletion(service, input.actorUserId);

  if (!authorization.ok) {
    return {
      ok: false,
      forbidden: authorization.status === 403,
      results: [],
      deletedCount: 0,
      failedCount: 0,
    };
  }

  const normalizedIds = [...new Set(input.userIds.map((id) => id.trim()).filter(Boolean))];

  if (normalizedIds.length > MAX_ADMIN_USER_DELETION_BATCH_SIZE) {
    return {
      ok: false,
      batchError: `За один запрос можно удалить не более ${MAX_ADMIN_USER_DELETION_BATCH_SIZE} пользователей.`,
      results: [],
      deletedCount: 0,
      failedCount: 0,
    };
  }

  if (normalizedIds.length === 0) {
    return {
      ok: true,
      results: [],
      deletedCount: 0,
      failedCount: 0,
    };
  }

  const dependencies = await loadUserDeletionDependencies(service, normalizedIds);

  const { data: profiles } = await service
    .from("profiles")
    .select("id, avatar_path")
    .in("id", normalizedIds.filter(isValidUserId));

  const avatarPathMap = new Map(
    (profiles ?? []).map((row) => [row.id, row.avatar_path as string | null]),
  );

  const results: AdminUserDeletionItemResult[] = [];

  for (const userId of normalizedIds) {
    if (!isValidUserId(userId)) {
      results.push({
        userId,
        ok: false,
        error: "Некорректный идентификатор пользователя.",
      });
      continue;
    }

    const itemResult = await deleteSingleAdminUser(service, {
      userId,
      actorUserId: input.actorUserId,
      dependencies: dependencies.get(userId) ?? null,
      avatarPath: avatarPathMap.get(userId) ?? null,
    });

    results.push(itemResult);
  }

  const deletedCount = results.filter((row) => row.ok).length;
  const failedCount = results.length - deletedCount;

  return {
    ok: true,
    results,
    deletedCount,
    failedCount,
  };
}
