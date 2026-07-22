import { removeUserAvatarObject } from "@/lib/profile/avatar";
import {
  TEST_USER_RESET_EMAIL,
  TEST_USER_RESET_NORMALIZED_EMAIL,
} from "@/lib/admin/test-user-reset/constants";
import { writeTestUserResetAuditLog } from "@/lib/admin/test-user-reset/audit";
import {
  assertAllowlistedTestUserEmail,
  canActorResetTestUser,
  isValidTestUserResetConfirmationPhrase,
  normalizeAllowlistedTestEmail,
} from "@/lib/admin/test-user-reset/policy";
import {
  getTestUserResetPreflight,
  resolveAllowlistedTestUserContext,
} from "@/lib/admin/test-user-reset/preflight";
import type {
  TestUserResetDeletedCounts,
  TestUserResetPreflight,
  TestUserResetResult,
} from "@/lib/admin/test-user-reset/types";
import { fetchUserPlatformRole } from "@/lib/auth/platform-admin";
import type { createServiceRoleClient } from "@/lib/supabase/service-role";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

const BROWSER_HINT =
  "Для полностью чистой проверки откройте новый профиль Chrome или окно инкогнито.";

const NOT_DELETED_ITEMS = [
  "email_suppressions",
  "global_platform_analytics_unrelated",
  "browser_local_storage",
  "browser_session_storage",
  "service_worker_cache",
  "financial_orders_if_blocked",
] as const;

function emptyDeletedCounts(): TestUserResetDeletedCounts {
  return {
    emailDeliveryEvents: 0,
    emailOutbox: 0,
    emailConsents: 0,
    emailPreferences: 0,
    emailContacts: 0,
    analyticsEvents: 0,
    analyticsSessions: 0,
    avatarRemoved: false,
    authUserDeleted: false,
  };
}

async function findAuthUserByAllowlistedEmail(
  service: ServiceClient,
): Promise<{ id: string; email: string } | null> {
  const { data: profileMatch, error: profileError } = await service
    .from("profiles")
    .select("id, email")
    .ilike("email", TEST_USER_RESET_NORMALIZED_EMAIL)
    .maybeSingle();

  if (profileError) {
    throw new Error("test_user_reset_profile_lookup_failed");
  }

  if (profileMatch?.id) {
    const { data: authData, error: authError } =
      await service.auth.admin.getUserById(profileMatch.id);

    if (authError) {
      throw new Error("test_user_reset_auth_lookup_failed");
    }

    if (authData.user?.email && authData.user.id) {
      assertAllowlistedTestUserEmail(authData.user.email);
      return { id: authData.user.id, email: authData.user.email };
    }
  }

  const { data: listed, error: listError } = await service.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (listError) {
    throw new Error("test_user_reset_auth_list_failed");
  }

  const authMatch = (listed.users ?? []).find(
    (user) =>
      typeof user.email === "string" &&
      normalizeAllowlistedTestEmail(user.email) === TEST_USER_RESET_NORMALIZED_EMAIL,
  );

  if (!authMatch?.id || !authMatch.email) {
    return null;
  }

  assertAllowlistedTestUserEmail(authMatch.email);

  return { id: authMatch.id, email: authMatch.email };
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
    throw new Error("test_user_reset_reviewed_by_clear_failed");
  }
}

async function deleteByEq(
  service: ServiceClient,
  table: string,
  column: string,
  value: string,
): Promise<number> {
  const { count, error } = await service
    .from(table)
    .delete({ count: "exact" })
    .eq(column, value);

  if (error) {
    throw new Error(`test_user_reset_delete_${table}_failed`);
  }

  return count ?? 0;
}

async function cleanupNonFkData(
  service: ServiceClient,
  context: TestUserResetPreflight,
  userId: string | null,
): Promise<TestUserResetDeletedCounts> {
  const deleted = emptyDeletedCounts();
  const contactIds = context.emailContactIds;

  if (userId) {
    await clearReviewedByReferences(service, userId);

    const { data: profile } = await service
      .from("profiles")
      .select("avatar_path")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.avatar_path) {
      const removed = await removeUserAvatarObject(
        service,
        profile.avatar_path,
        userId,
      );
      deleted.avatarRemoved = removed.ok;
    }
  }

  const outboxFilters: string[] = [];

  if (userId) {
    outboxFilters.push(`user_id.eq.${userId}`);
  }

  for (const contactId of contactIds) {
    outboxFilters.push(`contact_id.eq.${contactId}`);
  }

  if (outboxFilters.length > 0) {
    const { data: outboxRows, error: outboxSelectError } = await service
      .from("email_outbox")
      .select("id")
      .or(outboxFilters.join(","));

    if (outboxSelectError) {
      throw new Error("test_user_reset_outbox_lookup_failed");
    }

    const outboxIds = (outboxRows ?? []).map((row) => row.id);

    if (outboxIds.length > 0) {
      const { count: deliveryCount, error: deliveryDeleteError } = await service
        .from("email_delivery_events")
        .delete({ count: "exact" })
        .in("outbox_id", outboxIds);

      if (deliveryDeleteError) {
        throw new Error("test_user_reset_delivery_delete_failed");
      }

      deleted.emailDeliveryEvents = deliveryCount ?? 0;
    }

    const { count: outboxCount, error: outboxDeleteError } = await service
      .from("email_outbox")
      .delete({ count: "exact" })
      .or(outboxFilters.join(","));

    if (outboxDeleteError) {
      throw new Error("test_user_reset_outbox_delete_failed");
    }

    deleted.emailOutbox = outboxCount ?? 0;
  }

  if (userId) {
    deleted.emailPreferences = await deleteByEq(
      service,
      "email_preferences",
      "user_id",
      userId,
    );

    deleted.emailConsents = await deleteByEq(
      service,
      "email_consents",
      "user_id",
      userId,
    );
  }

  for (const contactId of contactIds) {
    deleted.emailConsents += await deleteByEq(
      service,
      "email_consents",
      "contact_id",
      contactId,
    );
  }

  if (contactIds.length > 0) {
    const { count: contactsCount, error: contactsDeleteError } = await service
      .from("email_contacts")
      .delete({ count: "exact" })
      .in("id", contactIds);

    if (contactsDeleteError) {
      throw new Error("test_user_reset_contacts_delete_failed");
    }

    deleted.emailContacts = contactsCount ?? 0;
  } else {
    const { count: contactsByEmailCount, error: contactsByEmailError } =
      await service
        .from("email_contacts")
        .delete({ count: "exact" })
        .eq("normalized_email", TEST_USER_RESET_NORMALIZED_EMAIL);

    if (contactsByEmailError) {
      throw new Error("test_user_reset_contacts_by_email_delete_failed");
    }

    deleted.emailContacts = contactsByEmailCount ?? 0;
  }

  const analyticsEventFilters: string[] = [];
  const analyticsSessionFilters: string[] = [];

  if (userId) {
    analyticsEventFilters.push(`user_id.eq.${userId}`);
    analyticsSessionFilters.push(`user_id.eq.${userId}`);
  }

  for (const anonymousId of context.anonymousIds) {
    analyticsEventFilters.push(`anonymous_session_id.eq.${anonymousId}`);
    analyticsSessionFilters.push(`anonymous_id.eq.${anonymousId}`);
  }

  for (const sessionId of context.analyticsSessionIds) {
    analyticsEventFilters.push(`session_id.eq.${sessionId}`);
    analyticsSessionFilters.push(`id.eq.${sessionId}`);
  }

  if (analyticsEventFilters.length > 0) {
    const { count: eventsCount, error: eventsDeleteError } = await service
      .from("analytics_events")
      .delete({ count: "exact" })
      .or(analyticsEventFilters.join(","));

    if (eventsDeleteError) {
      throw new Error("test_user_reset_analytics_events_delete_failed");
    }

    deleted.analyticsEvents = eventsCount ?? 0;
  }

  if (analyticsSessionFilters.length > 0) {
    const { count: sessionsCount, error: sessionsDeleteError } = await service
      .from("analytics_sessions")
      .delete({ count: "exact" })
      .or(analyticsSessionFilters.join(","));

    if (sessionsDeleteError) {
      throw new Error("test_user_reset_analytics_sessions_delete_failed");
    }

    deleted.analyticsSessions = sessionsCount ?? 0;
  }

  return deleted;
}

async function deleteAllowlistedAuthUser(
  service: ServiceClient,
  userId: string,
): Promise<{ ok: true } | { ok: false; errorCode: string }> {
  const { data: existingProfile } = await service
    .from("profiles")
    .select("id, email")
    .eq("id", userId)
    .maybeSingle();

  if (existingProfile?.email) {
    assertAllowlistedTestUserEmail(existingProfile.email);
  }

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
    return { ok: true };
  }

  console.error("test_user_reset_auth_delete_failed", userId, error.message);
  return { ok: false, errorCode: "auth_delete_failed" };
}

export async function authorizeTestUserReset(
  service: ServiceClient,
  actorUserId: string,
): Promise<{ ok: true } | { ok: false; status: 403 | 500 }> {
  try {
    const role = await fetchUserPlatformRole(service, actorUserId);

    if (!canActorResetTestUser(role)) {
      return { ok: false, status: 403 };
    }

    return { ok: true };
  } catch {
    return { ok: false, status: 500 };
  }
}

export { getTestUserResetPreflight };

export async function resetAllowlistedTestUser(
  service: ServiceClient,
  input: {
    actorUserId: string;
    confirmationPhrase: string;
  },
): Promise<
  | { ok: false; forbidden?: boolean; invalidConfirmation?: boolean; result: TestUserResetResult }
  | { ok: true; result: TestUserResetResult }
> {
  const authorization = await authorizeTestUserReset(service, input.actorUserId);

  if (!authorization.ok) {
    return {
      ok: false,
      forbidden: authorization.status === 403,
      result: {
        status: "failed",
        authUserId: null,
        deletedCounts: emptyDeletedCounts(),
        notDeleted: [...NOT_DELETED_ITEMS],
        errorCode: "forbidden",
        message: "Недостаточно прав для сброса тестового пользователя.",
        browserHint: BROWSER_HINT,
      },
    };
  }

  if (!isValidTestUserResetConfirmationPhrase(input.confirmationPhrase)) {
    console.warn("test_user_reset_invalid_confirmation", {
      actorUserId: input.actorUserId,
    });

    return {
      ok: false,
      invalidConfirmation: true,
      result: {
        status: "failed",
        authUserId: null,
        deletedCounts: emptyDeletedCounts(),
        notDeleted: [...NOT_DELETED_ITEMS],
        errorCode: "invalid_confirmation",
        message: "Неверная фраза подтверждения.",
        browserHint: BROWSER_HINT,
      },
    };
  }

  const preflight = await resolveAllowlistedTestUserContext(service, {
    actorUserId: input.actorUserId,
  });

  if (
    preflight.authUserId &&
    preflight.authUserId === input.actorUserId
  ) {
    return {
      ok: true,
      result: {
        status: "failed",
        authUserId: preflight.authUserId,
        deletedCounts: emptyDeletedCounts(),
        notDeleted: [...NOT_DELETED_ITEMS],
        blockers: preflight.blockers,
        errorCode: "blocked",
        message: "Сброс заблокирован.",
        browserHint: BROWSER_HINT,
      },
    };
  }

  if (!preflight.canReset) {
    return {
      ok: true,
      result: {
        status: "failed",
        authUserId: preflight.authUserId,
        deletedCounts: emptyDeletedCounts(),
        notDeleted: [...NOT_DELETED_ITEMS],
        blockers: preflight.blockers,
        errorCode: "blocked",
        message: "Сброс заблокирован. Устраните блокеры и повторите.",
        browserHint: BROWSER_HINT,
      },
    };
  }

  const alreadyFullyReset =
    !preflight.authUserFound &&
    preflight.counts.emailContacts === 0 &&
    preflight.counts.analyticsEvents === 0 &&
    preflight.counts.analyticsSessions === 0;

  if (alreadyFullyReset) {
    return {
      ok: true,
      result: {
        status: "success",
        authUserId: null,
        deletedCounts: emptyDeletedCounts(),
        notDeleted: [...NOT_DELETED_ITEMS],
        message: "Тестовый пользователь уже сброшен. Можно регистрироваться заново.",
        browserHint: BROWSER_HINT,
        alreadyReset: true,
      },
    };
  }

  const authUser = preflight.authUserId
    ? { id: preflight.authUserId, email: TEST_USER_RESET_EMAIL }
    : await findAuthUserByAllowlistedEmail(service);

  const targetUserId = authUser?.id ?? preflight.authUserId;
  let deletedCounts = emptyDeletedCounts();
  let authDeleteFailed = false;

  try {
    deletedCounts = await cleanupNonFkData(
      service,
      preflight,
      targetUserId,
    );
  } catch (error) {
    console.error("test_user_reset_cleanup_failed", error);

    await writeTestUserResetAuditLog(service, {
      actorUserId: input.actorUserId,
      targetAuthUserId: targetUserId,
      status: "failed",
      deletedCounts,
      errorCode: "cleanup_failed",
    });

    return {
      ok: true,
      result: {
        status: "failed",
        authUserId: targetUserId,
        deletedCounts,
        notDeleted: [...NOT_DELETED_ITEMS],
        errorCode: "cleanup_failed",
        message: "Не удалось очистить связанные данные.",
        browserHint: BROWSER_HINT,
      },
    };
  }

  if (targetUserId) {
    const authDeleted = await deleteAllowlistedAuthUser(service, targetUserId);
    deletedCounts.authUserDeleted = authDeleted.ok;

    if (!authDeleted.ok) {
      authDeleteFailed = true;
    }
  } else {
    deletedCounts.authUserDeleted = false;
  }

  const finalPreflight = await getTestUserResetPreflight(service);
  const status = authDeleteFailed
    ? "partial"
    : finalPreflight.authUserFound ||
        finalPreflight.counts.emailContacts > 0 ||
        finalPreflight.counts.analyticsEvents > 0 ||
        finalPreflight.counts.analyticsSessions > 0
      ? "partial"
      : "success";

  const result: TestUserResetResult = {
    status,
    authUserId: targetUserId,
    deletedCounts,
    notDeleted: [...NOT_DELETED_ITEMS],
    errorCode: authDeleteFailed ? "auth_delete_failed" : undefined,
    message:
      status === "success"
        ? "Тестовый пользователь сброшен. Можно регистрироваться заново."
        : status === "partial"
          ? "Часть данных очищена, но операция завершилась не полностью. Можно безопасно повторить сброс."
          : "Сброс завершён.",
    browserHint: BROWSER_HINT,
    alreadyReset: !preflight.authUserFound && !targetUserId,
  };

  await writeTestUserResetAuditLog(service, {
    actorUserId: input.actorUserId,
    targetAuthUserId: targetUserId,
    status,
    deletedCounts,
    errorCode: result.errorCode ?? null,
  });

  return { ok: true, result };
}
