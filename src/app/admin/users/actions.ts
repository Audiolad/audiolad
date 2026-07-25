"use server";

import { revalidatePath } from "next/cache";

import { requireAdminPermission } from "@/lib/admin/guard";
import {
  deleteAdminUsersBatch,
  type AdminUserDeletionBatchResult,
} from "@/lib/admin/user-deletion";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type DeleteAdminUsersActionResult = AdminUserDeletionBatchResult;

export async function deleteAdminUsers(
  userIds: string[],
): Promise<DeleteAdminUsersActionResult> {
  const session = await requireAdminPermission("users.manage");
  const service = createServiceRoleClient();

  const result = await deleteAdminUsersBatch(service, {
    actorUserId: session.userId,
    userIds,
  });

  if (result.ok && result.deletedCount > 0) {
    revalidatePath("/admin/users");
    revalidatePath("/admin");
  }

  return result;
}
