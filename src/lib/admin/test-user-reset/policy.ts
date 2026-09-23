import {
  isPlatformAdminRole,
  isPlatformOwnerRole,
} from "@/lib/auth/platform-admin";

import {
  TEST_USER_RESET_CONFIRMATION_PHRASE,
  TEST_USER_RESET_EMAIL,
  TEST_USER_RESET_NORMALIZED_EMAIL,
} from "@/lib/admin/test-user-reset/constants";
import {
  TEST_USER_RESET_BLOCK_CODES,
  type TestUserResetBlockCode,
  type TestUserResetBlocker,
  type TestUserResetPreflightCounts,
} from "@/lib/admin/test-user-reset/types";

export function normalizeAllowlistedTestEmail(email: string): string {
  const trimmed = email.trim();
  const atIndex = trimmed.lastIndexOf("@");

  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    return trimmed.toLowerCase();
  }

  const localPart = trimmed.slice(0, atIndex).toLowerCase();
  const domain = trimmed.slice(atIndex + 1).toLowerCase();

  return `${localPart}@${domain}`;
}

export function isAllowlistedTestUserEmail(
  email: string | null | undefined,
): boolean {
  if (!email?.trim()) {
    return false;
  }

  return (
    normalizeAllowlistedTestEmail(email) === TEST_USER_RESET_NORMALIZED_EMAIL
  );
}

export function assertAllowlistedTestUserEmail(
  email: string | null | undefined,
): void {
  if (!isAllowlistedTestUserEmail(email)) {
    throw new Error("test_user_reset_email_not_allowlisted");
  }
}

export function isValidTestUserResetConfirmationPhrase(
  phrase: string | null | undefined,
): boolean {
  if (typeof phrase !== "string") {
    return false;
  }

  return phrase.trim() === TEST_USER_RESET_CONFIRMATION_PHRASE;
}

export function canActorResetTestUser(
  role: string | null | undefined,
): boolean {
  return isPlatformOwnerRole(role);
}

function getBlockMessage(code: TestUserResetBlockCode): string {
  switch (code) {
    case TEST_USER_RESET_BLOCK_CODES.wrong_email_target:
      return "Операция доступна только для тестового адреса audiolad@mail.ru.";
    case TEST_USER_RESET_BLOCK_CODES.platform_owner_target:
      return "Нельзя сбросить аккаунт владельца платформы.";
    case TEST_USER_RESET_BLOCK_CODES.platform_admin_target:
      return "Нельзя сбросить аккаунт администратора платформы.";
    case TEST_USER_RESET_BLOCK_CODES.orders:
      return "У пользователя есть заказы. Финансовые данные нужно сохранить.";
    case TEST_USER_RESET_BLOCK_CODES.payments:
      return "У пользователя есть платежи. Финансовые данные нужно сохранить.";
    case TEST_USER_RESET_BLOCK_CODES.refunds:
      return "У пользователя есть возвраты. Финансовые данные нужно сохранить.";
    case TEST_USER_RESET_BLOCK_CODES.author_membership:
      return "Аккаунт связан с чужим авторским пространством.";
    case TEST_USER_RESET_BLOCK_CODES.author_applications:
      return "У пользователя есть заявки автора.";
    case TEST_USER_RESET_BLOCK_CODES.foreign_membership:
      return "Аккаунт состоит в чужом авторском пространстве.";
    case TEST_USER_RESET_BLOCK_CODES.other_members_on_owned_authors:
      return "В авторском пространстве тестового аккаунта есть другие участники.";
    case TEST_USER_RESET_BLOCK_CODES.test_as_referrer:
      return "Тестовый аккаунт пригласил другого пользователя. Такие рефералы не удаляются.";
    case TEST_USER_RESET_BLOCK_CODES.royalty:
      return "У авторского пространства есть роялти или журнал начислений.";
    case TEST_USER_RESET_BLOCK_CODES.payout:
      return "У авторского пространства есть выплаты.";
    case TEST_USER_RESET_BLOCK_CODES.payout_profile:
      return "У авторского пространства есть профиль выплат.";
    case TEST_USER_RESET_BLOCK_CODES.owned_author_content:
      return "У авторского пространства есть контент, студия или другие данные, которые нельзя стереть этим сбросом.";
    case TEST_USER_RESET_BLOCK_CODES.foreign_attribution:
      return "К авторскому пространству привязана атрибуция другого пользователя.";
    case TEST_USER_RESET_BLOCK_CODES.pending_referrer_attribution:
      return "У авторского пространства есть незавершённая реферальная атрибуция без приглашённого. Такие строки не удаляются.";
    case TEST_USER_RESET_BLOCK_CODES.capacity_grants:
      return "Есть оплаченные пакеты лимита авторских проектов. Финансовые данные нужно сохранить.";
    case TEST_USER_RESET_BLOCK_CODES.protected_author:
      return "Сброс затронул бы автора Sergey или код sergey.";
    case TEST_USER_RESET_BLOCK_CODES.foreign_terms:
      return "В авторском пространстве есть принятие условий другого пользователя.";
    case TEST_USER_RESET_BLOCK_CODES.db_reset_blocked:
      return "Сброс остановлен защитой базы данных.";
    case TEST_USER_RESET_BLOCK_CODES.personal_materials:
      return "У пользователя есть персональные материалы.";
    case TEST_USER_RESET_BLOCK_CODES.promotion_campaigns:
      return "Пользователь создавал промо-кампании.";
    case TEST_USER_RESET_BLOCK_CODES.personal_material_templates:
      return "Пользователь создавал шаблоны персональных материалов.";
    case TEST_USER_RESET_BLOCK_CODES.author_workspace_references:
      return "Аккаунт указан в служебных полях авторского пространства.";
    case TEST_USER_RESET_BLOCK_CODES.self_reset:
      return "Нельзя сбросить собственный аккаунт через эту операцию.";
    default:
      return "Сброс заблокирован.";
  }
}

export function buildTestUserResetBlocker(
  code: TestUserResetBlockCode,
  detail?: string | null,
): TestUserResetBlocker {
  const message = getBlockMessage(code);
  const extra = detail?.trim();

  return {
    code,
    message:
      extra && code === TEST_USER_RESET_BLOCK_CODES.db_reset_blocked
        ? `${message} (${extra})`
        : message,
  };
}

function countOf(
  counts: TestUserResetPreflightCounts,
  key: keyof TestUserResetPreflightCounts,
): number {
  const value = counts[key];
  return typeof value === "number" ? value : 0;
}

export function evaluateTestUserResetBlockers(input: {
  resolvedEmail: string | null;
  profileRole: string | null;
  counts: TestUserResetPreflightCounts;
}): TestUserResetBlocker[] {
  const blockers: TestUserResetBlocker[] = [];

  if (!isAllowlistedTestUserEmail(input.resolvedEmail)) {
    blockers.push(
      buildTestUserResetBlocker(TEST_USER_RESET_BLOCK_CODES.wrong_email_target),
    );
    return blockers;
  }

  if (isPlatformOwnerRole(input.profileRole)) {
    blockers.push(
      buildTestUserResetBlocker(
        TEST_USER_RESET_BLOCK_CODES.platform_owner_target,
      ),
    );
  }

  if (isPlatformAdminRole(input.profileRole)) {
    blockers.push(
      buildTestUserResetBlocker(
        TEST_USER_RESET_BLOCK_CODES.platform_admin_target,
      ),
    );
  }

  if (input.counts.orders > 0) {
    blockers.push(buildTestUserResetBlocker(TEST_USER_RESET_BLOCK_CODES.orders));
  }

  if (input.counts.payments > 0) {
    blockers.push(
      buildTestUserResetBlocker(TEST_USER_RESET_BLOCK_CODES.payments),
    );
  }

  if (input.counts.refundedOrders > 0) {
    blockers.push(
      buildTestUserResetBlocker(TEST_USER_RESET_BLOCK_CODES.refunds),
    );
  }

  if (countOf(input.counts, "foreignAuthorMemberships") > 0) {
    blockers.push(
      buildTestUserResetBlocker(TEST_USER_RESET_BLOCK_CODES.foreign_membership),
    );
  }

  if (countOf(input.counts, "otherMembersOnOwnedAuthors") > 0) {
    blockers.push(
      buildTestUserResetBlocker(
        TEST_USER_RESET_BLOCK_CODES.other_members_on_owned_authors,
      ),
    );
  }

  if (countOf(input.counts, "referrerReferrals") > 0) {
    blockers.push(
      buildTestUserResetBlocker(TEST_USER_RESET_BLOCK_CODES.test_as_referrer),
    );
  }

  if (countOf(input.counts, "foreignAttributions") > 0) {
    blockers.push(
      buildTestUserResetBlocker(TEST_USER_RESET_BLOCK_CODES.foreign_attribution),
    );
  }

  if (countOf(input.counts, "pendingReferrerAttributions") > 0) {
    blockers.push(
      buildTestUserResetBlocker(
        TEST_USER_RESET_BLOCK_CODES.pending_referrer_attribution,
      ),
    );
  }

  if (countOf(input.counts, "authorLedgerEntries") > 0) {
    blockers.push(
      buildTestUserResetBlocker(TEST_USER_RESET_BLOCK_CODES.royalty),
    );
  }

  if (countOf(input.counts, "authorPayouts") > 0) {
    blockers.push(buildTestUserResetBlocker(TEST_USER_RESET_BLOCK_CODES.payout));
  }

  if (countOf(input.counts, "authorPayoutProfiles") > 0) {
    blockers.push(
      buildTestUserResetBlocker(TEST_USER_RESET_BLOCK_CODES.payout_profile),
    );
  }

  if (countOf(input.counts, "ownedAuthorContent") > 0) {
    blockers.push(
      buildTestUserResetBlocker(TEST_USER_RESET_BLOCK_CODES.owned_author_content),
    );
  }

  if (countOf(input.counts, "capacityGrants") > 0) {
    blockers.push(
      buildTestUserResetBlocker(TEST_USER_RESET_BLOCK_CODES.capacity_grants),
    );
  }

  if (
    input.counts.personalMaterialsCreated > 0 ||
    input.counts.personalMaterialsClaimed > 0
  ) {
    blockers.push(
      buildTestUserResetBlocker(TEST_USER_RESET_BLOCK_CODES.personal_materials),
    );
  }

  if (input.counts.promotionCampaigns > 0) {
    blockers.push(
      buildTestUserResetBlocker(TEST_USER_RESET_BLOCK_CODES.promotion_campaigns),
    );
  }

  if (input.counts.personalMaterialTemplates > 0) {
    blockers.push(
      buildTestUserResetBlocker(
        TEST_USER_RESET_BLOCK_CODES.personal_material_templates,
      ),
    );
  }

  return blockers;
}

export function getTestUserResetPublicEmailLabel(): string {
  return TEST_USER_RESET_EMAIL;
}
