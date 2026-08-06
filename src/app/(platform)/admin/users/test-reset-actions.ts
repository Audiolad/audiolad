"use server";

import { revalidatePath } from "next/cache";

import { requirePlatformOwnerAccess } from "@/lib/admin/require-platform-owner";
import {
  getTestUserResetPreflight,
  resetAllowlistedTestUser,
} from "@/lib/admin/test-user-reset/reset";
import type {
  TestUserResetPreflight,
  TestUserResetResult,
} from "@/lib/admin/test-user-reset/types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type TestUserResetPreflightActionResult =
  | { ok: true; preflight: TestUserResetPreflight }
  | { ok: false; forbidden?: boolean; error?: string };

export type TestUserResetActionResult =
  | { ok: true; result: TestUserResetResult }
  | { ok: false; forbidden?: boolean; invalidConfirmation?: boolean; result: TestUserResetResult };

export async function getTestUserResetPreflightAction(): Promise<TestUserResetPreflightActionResult> {
  const session = await requirePlatformOwnerAccess();
  const service = createServiceRoleClient();

  try {
    const preflight = await getTestUserResetPreflight(service, {
      actorUserId: session.userId,
    });
    return { ok: true, preflight };
  } catch (error) {
    console.error("test_user_reset_preflight_action_failed", error);
    return {
      ok: false,
      error: "Не удалось загрузить preflight для сброса тестового пользователя.",
    };
  }
}

export async function resetAllowlistedTestUserAction(input: {
  confirmationPhrase: string;
}): Promise<TestUserResetActionResult> {
  const session = await requirePlatformOwnerAccess();
  const service = createServiceRoleClient();

  const resetResult = await resetAllowlistedTestUser(service, {
    actorUserId: session.userId,
    confirmationPhrase: input.confirmationPhrase,
  });

  if (resetResult.ok && resetResult.result.status !== "failed") {
    revalidatePath("/admin/users");
    revalidatePath("/admin");
  }

  if (!resetResult.ok) {
    return {
      ok: false,
      forbidden: resetResult.forbidden,
      invalidConfirmation: resetResult.invalidConfirmation,
      result: resetResult.result,
    };
  }

  return {
    ok: true,
    result: resetResult.result,
  };
}
