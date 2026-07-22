import { createHash } from "node:crypto";

import {
  TEST_USER_RESET_AUDIT_TARGET_MARKER,
  TEST_USER_RESET_NORMALIZED_EMAIL,
  TEST_USER_RESET_OPERATION,
} from "@/lib/admin/test-user-reset/constants";
import type {
  AdminOperationLogStatus,
  TestUserResetDeletedCounts,
} from "@/lib/admin/test-user-reset/types";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

export function hashAllowlistedTestUserEmail(): string {
  return createHash("sha256")
    .update(TEST_USER_RESET_NORMALIZED_EMAIL, "utf8")
    .digest("hex");
}

export async function writeTestUserResetAuditLog(
  service: ServiceClient,
  input: {
    actorUserId: string;
    targetAuthUserId: string | null;
    status: AdminOperationLogStatus;
    deletedCounts: TestUserResetDeletedCounts;
    errorCode?: string | null;
  },
): Promise<void> {
  const { error } = await service.from("admin_operation_log").insert({
    operation: TEST_USER_RESET_OPERATION,
    actor_user_id: input.actorUserId,
    target_auth_user_id: input.targetAuthUserId,
    target_email_hash: hashAllowlistedTestUserEmail(),
    counts: {
      marker: TEST_USER_RESET_AUDIT_TARGET_MARKER,
      deleted: input.deletedCounts,
    },
    status: input.status,
    error_code: input.errorCode ?? null,
  });

  if (error) {
    console.error("test_user_reset_audit_log_failed", error.message);
  }
}
