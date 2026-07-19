import {
  isPlatformAdminRole,
  isPlatformOwnerRole,
  isPlatformStaffRole,
} from "@/lib/auth/platform-admin";

export const MAX_ADMIN_USER_DELETION_BATCH_SIZE = 100;

export const USER_DELETION_BLOCK_CODES = {
  invalid_id: "invalid_id",
  self: "self",
  platform_owner: "platform_owner",
  platform_admin: "platform_admin",
  author_workspace: "author_workspace",
  orders: "orders",
  personal_materials: "personal_materials",
  promotion_campaigns: "promotion_campaigns",
} as const;

export type UserDeletionBlockCode =
  (typeof USER_DELETION_BLOCK_CODES)[keyof typeof USER_DELETION_BLOCK_CODES];

export type UserDeletionDependencies = {
  role: string | null;
  isAuthorMember: boolean;
  hasOrders: boolean;
  hasPersonalMaterials: boolean;
  hasPromotionCampaigns: boolean;
};

export type UserDeletionEligibility = {
  canDelete: boolean;
  blockCode: UserDeletionBlockCode | null;
  blockReason: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUserId(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function getUserDeletionBlockMessage(
  blockCode: UserDeletionBlockCode,
): string {
  switch (blockCode) {
    case USER_DELETION_BLOCK_CODES.invalid_id:
      return "Некорректный идентификатор пользователя.";
    case USER_DELETION_BLOCK_CODES.self:
      return "Нельзя удалить свой аккаунт.";
    case USER_DELETION_BLOCK_CODES.platform_owner:
      return "Нельзя удалить владельца платформы.";
    case USER_DELETION_BLOCK_CODES.platform_admin:
      return "Нельзя удалить администратора платформы.";
    case USER_DELETION_BLOCK_CODES.author_workspace:
      return "Аккаунт связан с авторским пространством.";
    case USER_DELETION_BLOCK_CODES.orders:
      return "У пользователя есть заказы. Финансовые данные нужно сохранить.";
    case USER_DELETION_BLOCK_CODES.personal_materials:
      return "У пользователя есть персональные материалы.";
    case USER_DELETION_BLOCK_CODES.promotion_campaigns:
      return "Пользователь создавал промо-кампании.";
    default:
      return "Удаление этого аккаунта запрещено.";
  }
}

export function evaluateUserDeletionEligibility(input: {
  userId: string;
  actorUserId: string;
  dependencies: UserDeletionDependencies | null;
}): UserDeletionEligibility {
  if (!isValidUserId(input.userId)) {
    return {
      canDelete: false,
      blockCode: USER_DELETION_BLOCK_CODES.invalid_id,
      blockReason: getUserDeletionBlockMessage(
        USER_DELETION_BLOCK_CODES.invalid_id,
      ),
    };
  }

  if (input.userId === input.actorUserId) {
    return {
      canDelete: false,
      blockCode: USER_DELETION_BLOCK_CODES.self,
      blockReason: getUserDeletionBlockMessage(USER_DELETION_BLOCK_CODES.self),
    };
  }

  if (!input.dependencies) {
    return {
      canDelete: false,
      blockCode: USER_DELETION_BLOCK_CODES.invalid_id,
      blockReason: "Пользователь не найден.",
    };
  }

  const { role, isAuthorMember, hasOrders, hasPersonalMaterials, hasPromotionCampaigns } =
    input.dependencies;

  if (isPlatformOwnerRole(role)) {
    return {
      canDelete: false,
      blockCode: USER_DELETION_BLOCK_CODES.platform_owner,
      blockReason: getUserDeletionBlockMessage(
        USER_DELETION_BLOCK_CODES.platform_owner,
      ),
    };
  }

  if (isPlatformAdminRole(role)) {
    return {
      canDelete: false,
      blockCode: USER_DELETION_BLOCK_CODES.platform_admin,
      blockReason: getUserDeletionBlockMessage(
        USER_DELETION_BLOCK_CODES.platform_admin,
      ),
    };
  }

  if (isAuthorMember) {
    return {
      canDelete: false,
      blockCode: USER_DELETION_BLOCK_CODES.author_workspace,
      blockReason: getUserDeletionBlockMessage(
        USER_DELETION_BLOCK_CODES.author_workspace,
      ),
    };
  }

  if (hasOrders) {
    return {
      canDelete: false,
      blockCode: USER_DELETION_BLOCK_CODES.orders,
      blockReason: getUserDeletionBlockMessage(USER_DELETION_BLOCK_CODES.orders),
    };
  }

  if (hasPersonalMaterials) {
    return {
      canDelete: false,
      blockCode: USER_DELETION_BLOCK_CODES.personal_materials,
      blockReason: getUserDeletionBlockMessage(
        USER_DELETION_BLOCK_CODES.personal_materials,
      ),
    };
  }

  if (hasPromotionCampaigns) {
    return {
      canDelete: false,
      blockCode: USER_DELETION_BLOCK_CODES.promotion_campaigns,
      blockReason: getUserDeletionBlockMessage(
        USER_DELETION_BLOCK_CODES.promotion_campaigns,
      ),
    };
  }

  return {
    canDelete: true,
    blockCode: null,
    blockReason: null,
  };
}

export function canActorDeleteUsers(role: string | null | undefined): boolean {
  return isPlatformStaffRole(role);
}
